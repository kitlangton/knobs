import { type Browser, expect, type Locator, type Page, test } from "@playwright/test"

// examples/ramps.html: gradients and curves in the Lab's look (#lab) and the default theme, built
// from remote descriptors (#default). `?gpu` draws both with the WebGPU overlay.
type Stop = { at: number; color: string }
type Point = { x: number; y: number }
const lab = (page: Page) => page.locator("#lab")
const remote = (page: Page) => page.locator("#default")
const ramps = <T>(page: Page, fn: (r: any) => T) =>
  page.evaluate(`(${fn.toString()})(window.__ramps)`) as Promise<T>
const value = <T>(page: Page, panel: "lab" | "remote", key: string) =>
  page.evaluate(([p, k]) => (window as any).__ramps[p].get()[k], [
    panel,
    key,
  ] as const) as Promise<T>
const ats = async (page: Page) => (await value<Stop[]>(page, "lab", "smoke")).map((s) => s.at)

async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/ramps.html${query}`)
  await expect(lab(page).locator('[data-field="smoke"]')).toBeVisible()
  return errors
}
/**
 * Waits until `target` stops moving and nothing is animating (an editor revealing clips its body
 * a while), so clicks land where they're aimed.
 */
async function settled(target: Locator) {
  await expect
    .poll(
      () =>
        target
          .page()
          .evaluate(
            () =>
              document
                .getAnimations()
                .filter(
                  (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
                ).length,
          ),
      { timeout: 10_000 },
    )
    .toBe(0)
  let last = ""
  await expect
    .poll(
      async () => {
        const b = await target.boundingBox()
        const now = JSON.stringify(b)
        const still = b !== null && b.height > 0 && now === last
        last = now
        return still
      },
      { timeout: 10_000, intervals: [100] },
    )
    .toBe(true)
  return (await target.boundingBox())!
}
async function expand(scope: Locator, name: string) {
  await scope.getByRole("button", { name, exact: true }).click()
}
async function stripOf(page: Page) {
  await expand(lab(page), "Smoke over life")
  const strip = lab(page).getByRole("slider", { name: "Smoke over life stops" })
  const b = await settled(strip)
  const xAt = (t: number) => b.x + b.height / 2 + (b.width - b.height) * t
  return { strip, b, xAt, y: b.y + b.height / 2 }
}
async function graphOf(scope: Locator, name: string, range: [number, number] = [0, 1]) {
  await expand(scope, name)
  const graph = scope.getByRole("slider", { name: `${name} points` })
  const g = await settled(graph)
  const PAD = 8
  const at = (x: number, y: number): [number, number] => [
    g.x + PAD + x * (g.width - 2 * PAD),
    g.y + PAD + (1 - (y - range[0]) / (range[1] - range[0])) * (g.height - 2 * PAD),
  ]
  return { graph, g, at }
}
async function drag(page: Page, from: [number, number], to: [number, number], shift = false) {
  await page.mouse.move(...from)
  await page.mouse.down()
  if (shift) await page.keyboard.down("Shift")
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 })
  await page.mouse.move(...to, { steps: 4 })
  await page.mouse.up()
  if (shift) await page.keyboard.up("Shift")
}

test("gradient: click to add in the colour there, drag past a neighbour as one undo step, drag off to delete", async ({
  page,
}) => {
  const errors = await open(page)
  const { strip, xAt, y } = await stripOf(page)
  const before = await value<Stop[]>(page, "lab", "smoke")
  expect(before.map((s) => s.at)).toEqual([0, 0.12, 0.3, 0.6, 1])

  // A click between stops adds one there, coloured as the gradient is, and selects it.
  await page.mouse.click(xAt(0.45), y)
  await expect.poll(() => ats(page)).toHaveLength(6)
  const added = await value<Stop[]>(page, "lab", "smoke")
  expect(added[3]!.at).toBeCloseTo(0.45, 1)
  expect(added[3]!.color).toMatch(/^oklch\(/)
  expect([added[2]!.color, added[4]!.color]).not.toContain(added[3]!.color)
  await expect(strip).toHaveAttribute("aria-valuetext", /^Stop 4 of 6 at 4[4-6]%$/)
  await expect(strip).toBeFocused()

  // Dragged past its neighbour at 0.6, it stays selected and the stops stay in order.
  await drag(page, [xAt(added[3]!.at), y], [xAt(0.8), y])
  const moved = await ats(page)
  expect(moved).toEqual([...moved].sort((a, b) => a - b))
  expect(moved[4]).toBeCloseTo(0.8, 1)
  await expect(strip).toHaveAttribute("aria-valuetext", /^Stop 5 of 6 at (79|80|81)%$/)
  // The whole drag is one step back.
  await ramps(page, (r) => r.lab.undo())
  expect((await ats(page))[3]).toBeCloseTo(0.45, 1)
  await ramps(page, (r) => r.lab.redo())

  // Pulled off the strip, the stop dims (data-leaving); let go there, it goes.
  await page.mouse.move(xAt(0.8), y)
  await page.mouse.down()
  await page.mouse.move(xAt(0.8), y + 90, { steps: 5 })
  await expect(
    lab(page).locator('[data-field="smoke"] .knobs-grad-stop[data-leaving]'),
  ).toHaveCount(1)
  await page.mouse.up()
  await expect(
    lab(page).locator('[data-field="smoke"] .knobs-grad-stop[data-leaving]'),
  ).toHaveCount(0)
  expect(await ats(page)).toEqual([0, 0.12, 0.3, 0.6, 1])
  await expect(lab(page).locator('[data-field="smoke"] .knobs-grad-stop')).toHaveCount(5)

  // Never fewer than two: dragging off a two-stop gradient keeps both.
  await ramps(page, (r) =>
    r.lab.set({
      smoke: [
        { at: 0, color: "#ffffff" },
        { at: 1, color: "#000000" },
      ],
    }),
  )
  await page.mouse.move(xAt(1), y)
  await page.mouse.down()
  await page.mouse.move(xAt(1), y + 90, { steps: 5 })
  await expect(
    lab(page).locator('[data-field="smoke"] .knobs-grad-stop[data-leaving]'),
  ).toHaveCount(0)
  await page.mouse.up()
  expect(await ats(page)).toHaveLength(2)
  expect(errors).toEqual([])
})

test("gradient keys: arrows move, Tab and [ ] cycle, n adds, Delete removes, Enter edits the colour", async ({
  page,
}) => {
  const errors = await open(page)
  const { strip } = await stripOf(page)
  await strip.focus()
  await expect(strip).toHaveAttribute("aria-valuetext", "Stop 1 of 5 at 0%")
  // [ wraps to the last stop, ] back to the first.
  await page.keyboard.press("[")
  await expect(strip).toHaveAttribute("aria-valuetext", "Stop 5 of 5 at 100%")
  await page.keyboard.press("]")
  await expect(strip).toHaveAttribute("aria-valuetext", "Stop 1 of 5 at 0%")
  // Tab steps through the stops.
  await page.keyboard.press("Tab")
  await expect(strip).toHaveAttribute("aria-valuetext", "Stop 2 of 5 at 12%")
  // → a step, ⇧→ ten.
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+ArrowRight")
  expect((await ats(page))[1]).toBeCloseTo(0.23, 5)
  await expect(strip).toHaveAttribute("aria-valuetext", "Stop 2 of 5 at 23%")
  // n adds a stop halfway to the next one and selects it.
  await page.keyboard.press("n")
  expect(await ats(page)).toEqual([0, 0.23, expect.closeTo(0.265, 3), 0.3, 0.6, 1])
  await expect(strip).toHaveAttribute("aria-valuetext", /^Stop 3 of 6/)
  // Delete removes it.
  await page.keyboard.press("Delete")
  expect(await ats(page)).toEqual([0, 0.23, 0.3, 0.6, 1])

  // Enter edits the selected stop's colour in the strips; Esc hands focus back.
  const colors = (await value<Stop[]>(page, "lab", "smoke")).map((s) => s.color)
  await page.keyboard.press("Enter")
  const hue = lab(page).getByRole("slider", { name: "Smoke over life stop hue" })
  await expect(hue).toBeFocused()
  await page.keyboard.press("Shift+ArrowRight")
  const after = (await value<Stop[]>(page, "lab", "smoke")).map((s) => s.color)
  expect(after.filter((c, i) => c !== colors[i]).length).toBe(1)
  expect(after[2]).not.toBe(colors[2])
  await page.keyboard.press("Escape")
  await expect(strip).toBeFocused()

  // Past the last stop Tab moves on, to the colour strips.
  await page.keyboard.press("]")
  await page.keyboard.press("]")
  await expect(strip).toHaveAttribute("aria-valuetext", /^Stop 5 of 5/)
  await page.keyboard.press("Tab")
  await expect(hue).toBeFocused()
  expect(errors).toEqual([])
})

test("gradient presets: chips choose and show the match; Random and Mutate keep the stops in order", async ({
  page,
}) => {
  const errors = await open(page)
  await stripOf(page)
  const steam = lab(page).getByRole("radio", { name: "Steam" })
  await steam.click()
  await expect(steam).toHaveAttribute("aria-checked", "true")
  await expect(lab(page).getByRole("radio", { name: "Fire" })).toHaveAttribute(
    "aria-checked",
    "false",
  )
  expect(await ats(page)).toEqual([0, 0.5, 1])
  await expect(lab(page).locator('[data-field="smoke"] .knobs-grad-stop')).toHaveCount(3)
  // ←/→ on the chips cycle the presets.
  await page.keyboard.press("ArrowRight")
  expect(await ats(page)).toEqual([0, 0.25, 0.7, 1])

  for (let i = 0; i < 6; i++) {
    await lab(page)
      .getByRole("button", { name: "Randomize FX" })
      .click({ modifiers: i % 2 ? ["Alt"] : [] })
    const smoke = await ats(page)
    expect(smoke).toEqual([...smoke].sort((a, b) => a - b))
    const xs = (await value<Point[]>(page, "lab", "falloff")).map((p) => p.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect([xs[0], xs.at(-1)]).toEqual([0, 1])
  }
  expect(errors).toEqual([])
})

test("curve: drag points (⇧ on the grid), ends keep their x, add on the curve or by double-click, drag out to delete", async ({
  page,
}) => {
  const errors = await open(page)
  const { graph, at } = await graphOf(lab(page), "Light falloff")
  const read = lab(page).locator(".knobs-graph-read").first()
  const points = () => value<Point[]>(page, "lab", "falloff")
  expect(await points()).toEqual([
    { x: 0, y: 1 },
    { x: 0.1, y: 0.85 },
    { x: 0.25, y: 0.47 },
    { x: 0.5, y: 0.15 },
    { x: 1, y: 0 },
  ])
  await expect(lab(page).locator('[data-field="falloff"] .knobs-x-read')).toHaveText("inverse²")

  // A point follows the pointer; the crosshair reads it out; the drag is one undo step.
  await drag(page, at(0.25, 0.47), at(0.3, 0.6))
  let p = (await points())[2]!
  expect(p.x).toBeCloseTo(0.3, 1)
  expect(p.y).toBeCloseTo(0.6, 1)
  await expect(graph).toHaveAttribute(
    "aria-valuetext",
    /^Point 3 of 5: 0\.(29|30|31) to 0\.(59|60|61)\d$/,
  )
  await expect(graph).toHaveAttribute("data-hover", "")
  // A changed curve is no shape by name.
  await expect(lab(page).locator('[data-field="falloff"] .knobs-x-read')).toHaveText("")
  await ramps(page, (r) => r.lab.undo())
  expect((await points())[2]).toEqual({ x: 0.25, y: 0.47 })
  await ramps(page, (r) => r.lab.redo())

  // ⇧ snaps to the grid's corners (eighths across, quarters up).
  await drag(page, at(0.3, 0.6), at(0.36, 0.53), true)
  expect((await points())[2]).toEqual({ x: 0.375, y: 0.5 })

  // An end keeps its x.
  await drag(page, at(0, 1), at(0.2, 0.8))
  p = (await points())[0]!
  expect(p.x).toBe(0)
  expect(p.y).toBeCloseTo(0.8, 1)

  // Hovering the curve reads it out; a press there adds a point on it.
  await page.mouse.move(...at(0.75, 0.5))
  await expect(read).toHaveText(/^0\.75 → 0\.\d{3}$/)
  const y = Number((await read.textContent())!.split("→")[1])
  await page.mouse.click(...at(0.75, y))
  await expect.poll(async () => (await points()).length).toBe(6)
  p = (await points())[4]!
  expect(p.x).toBeCloseTo(0.75, 1)
  expect(p.y).toBeCloseTo(y, 2)

  // A press on empty space adds nothing; a double-click there does.
  await page.mouse.click(...at(0.62, 0.9))
  expect(await points()).toHaveLength(6)
  await page.mouse.dblclick(...at(0.62, 0.9))
  await expect.poll(async () => (await points()).length).toBe(7)
  p = (await points())[4]!
  expect(p.x).toBeCloseTo(0.62, 1)
  expect(p.y).toBeCloseTo(0.9, 1)

  // Dragged out of the graph, it dims; let go there, it goes. The ends never do.
  await page.mouse.move(...at(0.62, 0.9))
  await page.mouse.down()
  await page.mouse.move(at(0.62, 0.9)[0], at(0, 0)[1] + 80, { steps: 6 })
  await expect(
    lab(page).locator('[data-field="falloff"] .knobs-graph-pt[data-leaving]'),
  ).toHaveCount(1)
  await page.mouse.up()
  expect(await points()).toHaveLength(6)
  await drag(page, at(1, 0), [at(1, 0)[0] + 80, at(1, 0)[1] + 80])
  expect(await points()).toHaveLength(6)

  // Leaving the graph hides the crosshair.
  await page.mouse.move(10, 10)
  await expect(graph).not.toHaveAttribute("data-hover", "")
  expect(errors).toEqual([])
})

test("curve keys: Tab cycles points, arrows move them (ends keep x), Delete removes, shapes morph", async ({
  page,
}) => {
  const errors = await open(page)
  const { graph } = await graphOf(lab(page), "Light falloff")
  const points = () => value<Point[]>(page, "lab", "falloff")
  await graph.focus()
  await expect(graph).toHaveAttribute("aria-valuetext", "Point 1 of 5: 0.00 to 1.000")
  // The first point: → doesn't move its x, ↓ moves its y.
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowDown")
  expect((await points())[0]).toEqual({ x: 0, y: 0.99 })
  // Delete leaves an end alone.
  await page.keyboard.press("Delete")
  expect(await points()).toHaveLength(5)
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await expect(graph).toHaveAttribute("aria-valuetext", /^Point 3 of 5: 0\.25 to 0\.470$/)
  await page.keyboard.press("Shift+ArrowUp")
  await page.keyboard.press("ArrowLeft")
  expect((await points())[2]!.x).toBeCloseTo(0.24, 5)
  expect((await points())[2]!.y).toBeCloseTo(0.57, 5)
  // A point can't pass its neighbours.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowLeft")
  expect((await points())[2]!.x).toBeCloseTo(0.101, 5)
  await page.keyboard.press("Delete")
  expect((await points()).map((p) => p.x)).toEqual([0, 0.1, 0.5, 1])
  // n adds one halfway to the next point, on the curve, and selects it.
  await expect(graph).toHaveAttribute("aria-valuetext", /^Point 3 of 4: 0\.50/)
  await page.keyboard.press("n")
  expect((await points()).map((p) => p.x)).toEqual([0, 0.1, 0.5, 0.75, 1])
  await expect(graph).toHaveAttribute("aria-valuetext", /^Point 4 of 5: 0\.75/)
  // Shift+Tab steps back; past the first point focus moves on, out of the graph.
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Shift+Tab")
  await expect(graph).toHaveAttribute("aria-valuetext", /^Point 1 of 5/)
  await page.keyboard.press("Shift+Tab")
  await expect(graph).not.toBeFocused()

  // The shape chips: bell, then ←/→ on them.
  const bell = lab(page).getByRole("radio", { name: "bell" })
  await bell.click()
  await expect(bell).toHaveAttribute("aria-checked", "true")
  expect((await points()).map((p) => p.y)).toEqual([0, 0.25, 1, 0.25, 0])
  await expect(lab(page).locator('[data-field="falloff"] .knobs-x-read')).toHaveText("bell")
  await page.keyboard.press("ArrowLeft")
  await expect(lab(page).locator('[data-field="falloff"] .knobs-x-read')).toHaveText("smoothstep")
  // The path morphs between them (a transition on `d`) rather than jumping.
  await page.keyboard.press("ArrowRight")
  const morphing = await lab(page)
    .locator('[data-field="falloff"] .knobs-graph .knobs-curve')
    .evaluate((path) => path.getAnimations().length)
  expect(morphing).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test("read-only and disabled ramps take no edits; mixed shows a dash; remote ranges and steps", async ({
  page,
}) => {
  const errors = await open(page)
  await expand(lab(page), "Fog")
  const strip = lab(page).getByRole("slider", { name: "Fog stops" })
  const b = await settled(strip)
  await ramps(page, (r) => r.lab.set({ lock: true }))
  await expect(lab(page).locator('[data-field="fog"]')).toHaveAttribute("data-readonly", "")
  await expect(lab(page).locator('[data-field="unseen"]')).toHaveAttribute("data-disabled", "")
  const fog = await value<Stop[]>(page, "lab", "fog")
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height / 2)
  await drag(page, [b.x + b.height / 2, b.y + b.height / 2], [b.x + b.width * 0.4, b.y + 90])
  await strip.focus()
  for (const key of ["ArrowRight", "n", "Delete", "Shift+ArrowRight"])
    await page.keyboard.press(key)
  expect(await value(page, "lab", "fog")).toEqual(fog)
  // Reading still works: [ ] and Tab move the selection.
  await page.keyboard.press("]")
  await expect(strip).toHaveAttribute("aria-valuetext", /^Stop 2 of 3/)
  // Disabled, a curve's points stay put too.
  await ramps(page, (r) => r.lab.set({ lock: false }))
  const { at } = await graphOf(lab(page), "Unseen")
  await ramps(page, (r) => r.lab.set({ lock: true }))
  const unseen = await value<Point[]>(page, "lab", "unseen")
  await drag(page, at(0.5, 0.1), at(0.6, 0.7))
  await page.mouse.dblclick(...at(0.3, 0.8))
  expect(await value(page, "lab", "unseen")).toEqual(unseen)

  // A multi-selection whose skies differ: a dash, and no preset checked.
  await ramps(page, (r) => r.mixed(["sky"]))
  const sky = remote(page).locator('[data-field="sky"]')
  await expect(sky.locator(".knobs-x-read")).toHaveText("—")
  await expand(remote(page), "Sky by hour")
  await expect(remote(page).locator('[data-field="sky"] [aria-checked="true"]')).toHaveCount(0)
  await remote(page).getByRole("radio", { name: "Storm" }).click()
  await expect(sky.locator(".knobs-x-read")).toHaveText("")
  expect(await ramps(page, (r) => r.sent.at(-1).key)).toBe("sky")

  // The remote curve keeps its 0…2 range and its linear segments; the step curve has no shapes.
  const response = await graphOf(remote(page), "Response", [0, 2])
  await drag(page, response.at(0.4, 1.2), response.at(0.4, 1.8))
  await expect.poll(() => ramps(page, (r) => r.sent.at(-1).key)).toBe("response")
  expect((await ramps(page, (r) => r.sent.at(-1).value[1].y)) as number).toBeCloseTo(1.8, 1)
  await expand(remote(page), "Bands")
  await expect(remote(page).locator('[data-field="bands"] .knobs-ease-chip')).toHaveCount(0)
  expect(errors).toEqual([])
})

test("hint mode: the ramp rows take badges, and its keys (Backspace, Enter, Esc) don't edit the stops", async ({
  page,
}) => {
  const errors = await open(page)
  const { strip } = await stripOf(page)
  await strip.focus()
  await page.keyboard.press("s")
  const root = lab(page).locator(".knobs-panel")
  await expect(root).toHaveClass(/knobs-hinting/)
  const badges = await lab(page).locator(".knobs-hint-layer .knobs-hint").allTextContents()
  expect(badges).toEqual(expect.arrayContaining(["so", "lf", "fo", "u"]))
  for (const key of ["n", "Backspace", "Backspace", "ArrowRight"]) await page.keyboard.press(key)
  expect(await ats(page)).toEqual([0, 0.12, 0.3, 0.6, 1])
  // Esc ends the hints and leaves the editor open, the stops focused.
  await page.keyboard.press("Escape")
  await expect(root).not.toHaveClass(/knobs-hinting/)
  await expect(strip).toBeFocused()
  // A badge jumps to its row.
  await page.keyboard.press("s")
  await page.keyboard.type("lf")
  await expect(root).not.toHaveClass(/knobs-hinting/)
  await expect(lab(page).getByRole("button", { name: "Light falloff", exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

/** Mean colour of a region of a screenshot, decoded by the page. */
async function meanColor(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext("2d")!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data
    const sum = [0, 0, 0]
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!
    return sum.map((s) => s / (d.length / 4))
  }, png.toString("base64"))
}

test("the GPU overlay draws the ramps as the DOM does", async ({ page, browser }) => {
  const errors = await open(page, "?gpu")
  const root = lab(page).locator(".knobs-panel")
  await expect(root).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await root.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  const regions = async (p: Page, drawn?: () => Promise<void>) => {
    const { strip } = await stripOf(p)
    const { graph } = await graphOf(lab(p), "Light falloff")
    await p.mouse.move(0, 0)
    await drawn?.()
    // Past the reveal and the strips' fades.
    await p.waitForTimeout(600)
    const s = (await strip.boundingBox())!
    const g = (await graph.boundingBox())!
    // The mini strip in the head, the open strip between two pins, the graph.
    const mini = (await lab(p).locator('[data-field="smoke"] .knobs-grad-mini').boundingBox())!
    return {
      mini: await p.screenshot({ clip: { ...mini, y: mini.y + 1, height: mini.height - 2 } }),
      strip: await p.screenshot({
        clip: { x: s.x + s.width * 0.62, y: s.y + 3, width: s.width * 0.2, height: s.height - 6 },
      }),
      graph: await p.screenshot({ clip: g }),
    }
  }
  const gpu = await regions(page, () =>
    expect
      .poll(() => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[]), {
        timeout: 10_000,
      })
      .toEqual(expect.arrayContaining(["Smoke over life", "Light falloff", "inverse²", "Fire"])),
  )
  const dom = await openDom(browser)
  const want = await regions(dom)
  for (const part of ["mini", "strip", "graph"] as const) {
    const [a, b] = [await meanColor(page, gpu[part]), await meanColor(page, want[part])]
    const off = Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))
    expect(off, `${part}: GPU ${a.map(Math.round)} vs DOM ${b.map(Math.round)}`).toBeLessThan(10)
  }
  await dom.close()
  expect(errors).toEqual([])
})

async function openDom(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await open(page)
  return page
}
