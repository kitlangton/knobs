import { expect, type Page, test } from "@playwright/test"

// Page features the tune page leans on: highlighting what's on the phone's screen, collapsible
// custom cards, quiet card titles (labels apart from ids) and named card presets.

/**
 * Mounts a page of its own over the tune demo (which brings `knobs` and `mountPage` along):
 * sections "Transcript", "drawer" and "composer", whose groups repeat a label or a prefix.
 */
async function fixture(
  page: Page,
  options: {
    gpu?: boolean
    display?: "auto" | "names" | "numbers" | "menu"
    columnWidth?: number
    width?: number
    height?: number
    extra?: boolean
  } = {},
) {
  await page.setViewportSize({ width: options.width ?? 1440, height: options.height ?? 900 })
  await page.goto(`/tune.html${options.gpu ? "?gpu" : "?dom"}`)
  await page.waitForFunction(() => (window as any).__knobs)
  await page.evaluate((o) => {
    const { knobs: k, mountPage } = (window as any).__knobs
    ;(window as any).__tune.page.dispose()
    const w = window as any
    w.__resets = []
    w.__presets = []
    const n = (value: number, group: string, section: string, extra = {}) =>
      k.knob(value, { min: 0, max: 100, step: 1, group, section, ...extra })
    const schema: Record<string, unknown> = {
      arrivalsFade: n(25, "Transcript · Arrivals", "Transcript"),
      arrivalsRise: n(6, "Transcript · Arrivals", "Transcript"),
      rhythmGap: n(8, "Rhythm", "Transcript"),
      drawerRow: n(44, "drawer.spacing", "drawer", { groupLabel: "Spacing" }),
      drawerGap: n(2, "drawer.spacing", "drawer", { sectionLabel: "Session List" }),
      composerMargin: n(20, "composer.spacing", "composer"),
      composerGap: n(8, "composer.spacing", "composer"),
    }
    // More sections, for a page taller than the window.
    if (o.extra)
      for (const s of ["Alpha", "Beta", "Gamma", "Delta"])
        for (const g of ["One", "Two"])
          for (const f of ["a", "b", "c", "d"])
            schema[`${s}${g}${f}`] = n(10, `${s} ${g}`, s, { label: `${s} ${g} ${f}` })
    const controls = k.defineControls("page-fixture", schema, {
      storage: k.memoryStorage(),
      groupLabels: { "composer.spacing": "Spacing" },
      sectionLabels: { composer: "Composer" },
      defaultLabel: "Native",
      presets: { snappy: { drawerRow: 40 } },
      groupPresets: {
        "drawer.spacing": [
          { name: "Native", values: {} },
          { name: "Tight", values: { drawerRow: 38 } },
          { name: "Comfortable", values: { drawerRow: 48 } },
          { name: "Airy", values: { drawerRow: 52 } },
        ],
        "composer.spacing": [
          { name: "Native", values: {} },
          { name: "Tight", values: { composerMargin: 12 } },
        ],
      },
      ...(o.display ? { groupPresetDisplay: o.display } : {}),
      onReset: (t: unknown) => w.__resets.push(t),
      onPreset: (t: unknown) => w.__presets.push(t),
    })
    const app = document.querySelector<HTMLElement>("#app")!
    app.replaceChildren()
    const p = mountPage(controls, app, {
      title: "Fixture",
      theme: "dark",
      ...(o.columnWidth ? { columnWidth: o.columnWidth } : {}),
      sections: ["Transcript", "drawer", "composer", "Alpha", "Beta", "Gamma", "Delta"],
    })
    const card = p.card({
      title: "Pairing",
      section: "drawer",
      collapsed: false,
      summary: "Paired",
    })
    const box = document.createElement("div")
    box.style.height = "120px"
    card.body.append(box)
    card.toggle({ label: "Keep awake", value: false, onChange() {} })
    w.__fixture = { controls, page: p, card }
  }, options)
  const root = page.getByRole("region", { name: "Fixture controls" })
  await expect(root.locator(".knobs-tile").first()).toBeVisible()
  // Past the first frames, so changes animate and the cards have their heights.
  await page.waitForTimeout(500)
  return root
}

const tile = (root: ReturnType<Page["getByRole"]>, group: string) =>
  root.locator(`.knobs-tile[data-group="${group}"]`)

/** The colour (r, g, b) at a point on screen. */
async function pixel(page: Page, x: number, y: number) {
  const shot = await page.screenshot({ clip: { x, y, width: 1, height: 1 } })
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height).getContext("2d")!
    c.drawImage(img, 0, 0)
    return [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, shot.toString("base64"))
}
const near = (a: number[], b: number[], within = 4) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= within)

test("labels: titles drop a repeated section prefix, labels stay apart from ids, presets by name", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const root = await fixture(page, { columnWidth: 420 })
  // Section headings show their labels; their ids stay on them.
  await expect(root.locator(".knobs-section-head:not([data-continued])")).toHaveText([
    "Transcript",
    "Session List",
    "Composer",
  ])
  await expect(root.locator('.knobs-section-head[data-section="drawer"]')).toHaveText(
    "Session List",
  )
  // "Transcript · Arrivals" under Transcript reads "Arrivals"; two groups both labelled
  // "Spacing" stay two cards.
  await expect(tile(root, "Transcript · Arrivals").locator(".knobs-group-label")).toHaveText(
    "Arrivals",
  )
  await expect(tile(root, "drawer.spacing").locator(".knobs-group-label")).toHaveText("Spacing")
  await expect(tile(root, "composer.spacing").locator(".knobs-group-label")).toHaveText("Spacing")
  await expect(root.locator('.knobs-tile[aria-label="Spacing"]')).toHaveCount(2)

  // Named presets as segments; picking one acts on its own group only, keyed by id.
  const drawer = tile(root, "drawer.spacing")
  await expect(drawer.getByRole("radio")).toHaveText(["Native", "Tight", "Comfortable", "Airy"])
  await drawer.getByRole("radio", { name: "2 Tight" }).click()
  const values = () => page.evaluate(() => (window as any).__fixture.controls.get())
  await expect.poll(async () => (await values()).drawerRow).toBe(38)
  expect((await values()).composerMargin).toBe(20)
  expect(await page.evaluate(() => (window as any).__presets)).toEqual([
    { group: "drawer.spacing", index: 1, name: "Tight" },
  ])
  // No peek over the title: the names already show which one it is.
  await expect(drawer.locator(".knobs-group-head")).not.toHaveAttribute("data-peek", "")
  // 1–9 still apply the focused card's presets.
  await page.getByRole("slider", { name: "drawerGap" }).focus()
  await page.keyboard.press("4")
  await expect.poll(async () => (await values()).drawerRow).toBe(52)
  await expect(drawer.getByRole("radio", { name: "4 Airy" })).toHaveAttribute(
    "aria-checked",
    "true",
  )

  // A card's reset reports its group's id, and leaves the other "Spacing" alone.
  await page.evaluate(() => (window as any).__fixture.controls.set({ composerMargin: 30 }))
  const composer = tile(root, "composer.spacing")
  await composer.getByRole("button", { name: "Reset Spacing" }).click()
  await expect.poll(async () => (await values()).composerMargin).toBe(20)
  expect((await values()).drawerRow).toBe(52)
  expect(await page.evaluate(() => (window as any).__resets)).toEqual([
    { group: "composer.spacing" },
  ])

  // The filter matches labels and ids alike.
  await page.getByRole("slider", { name: "drawerGap" }).focus()
  await page.keyboard.press("/")
  await page.keyboard.type("session list")
  await expect(root.locator(".knobs-tile:visible")).toHaveCount(1)
  await expect(tile(root, "drawer.spacing")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("/")
  await page.keyboard.type("composer.spacing")
  await expect(root.locator(".knobs-tile:visible")).toHaveCount(1)
  await page.keyboard.press("Escape")

  // The baseline preset reads "Native"; its id stays "default" ([ and ] still cycle).
  const strip = root.locator(":scope > header .knobs-presets")
  await expect(strip.getByRole("radio")).toHaveText(["Native", "snappy"])
  await expect(strip.getByRole("radio", { name: "default" })).toHaveCount(0)
  await page.evaluate(() => (window as any).__fixture.controls.reset())
  await expect(strip.getByRole("radio", { name: "Native" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("slider", { name: "drawerGap" }).focus()
  await page.keyboard.press("]")
  await expect(strip.getByRole("radio", { name: "snappy" })).toHaveAttribute("aria-checked", "true")
  await page.keyboard.press("[")
  await expect(strip.getByRole("radio", { name: "Native" })).toHaveAttribute("aria-checked", "true")
  expect(await strip.getAttribute("data-active-preset")).toBe("p:default")
  expect(errors).toEqual([])
})

test("named presets fall back to a menu where they don't fit; numbers keep the old chips", async ({
  page,
}) => {
  const root = await fixture(page, { width: 390, height: 844, columnWidth: 420 })
  const drawer = tile(root, "drawer.spacing")
  const presets = drawer.locator(".knobs-group-presets")
  // Too narrow for "Native · Tight · Comfortable · Airy" beside the title: a menu with the selected name.
  await expect(presets).toHaveAttribute("data-display", "menu")
  const menu = drawer.getByRole("button", { name: "Spacing presets" })
  await expect(menu).toHaveText("Native")
  await page.getByRole("slider", { name: "drawerRow" }).focus()
  await page.keyboard.press("2")
  await expect(menu).toHaveText("Tight")
  // Nothing matching reads a quiet "Custom".
  await page.evaluate(() => (window as any).__fixture.controls.set({ drawerRow: 47 }))
  await expect(menu).toHaveText("Custom")
  await expect(menu).toHaveAttribute("data-none", "")
  // The menu lists each by number and name.
  await menu.click()
  const items = page.getByRole("menu").getByRole("menuitemradio")
  await expect(items).toHaveCount(4)
  await expect(items.nth(3)).toContainText("Airy")
  await expect(items.nth(3).locator("kbd")).toHaveText("4")
  await items.nth(3).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__fixture.controls.get().drawerRow))
    .toBe(52)
  // Wider, the names come back.
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(presets).toHaveAttribute("data-display", "segmented")

  // `numbers` keeps 1, 2, 3, whose hovered name peeks over the title.
  const numbered = await fixture(page, { display: "numbers" })
  const chips = tile(numbered, "drawer.spacing").locator(".knobs-chips button")
  await expect(chips).toHaveText(["1", "2", "3", "4"])
  await chips.nth(1).hover()
  await expect(tile(numbered, "drawer.spacing").locator(".knobs-group-head")).toHaveAttribute(
    "data-peek",
    "",
  )
})

test("the GPU draws labels, preset names and the Native baseline as the DOM names them", async ({
  page,
}) => {
  const root = await fixture(page, { gpu: true, columnWidth: 420 })
  test.skip((await root.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  const texts = () => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[])
  await expect.poll(async () => (await texts()).includes("Arrivals")).toBe(true)
  const drawn = await texts()
  expect(drawn).not.toContain("Transcript · Arrivals")
  expect(drawn.filter((t) => t === "Spacing").length).toBe(2)
  for (const t of ["Session List", "Composer", "Native", "Tight", "Comfortable", "Airy", "snappy"])
    expect(drawn).toContain(t)
  expect(drawn).not.toContain("default")
  expect(drawn).not.toContain("drawer.spacing")
  // The DOM's own text is transparent there: only the canvas shows it.
  await expect
    .poll(() =>
      tile(root, "drawer.spacing")
        .getByRole("radio", { name: "1 Native" })
        .evaluate((b) => getComputedStyle(b).color),
    )
    .toBe("rgba(0, 0, 0, 0)")
  // Narrow: the menu, drawn with its selected name.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(tile(root, "drawer.spacing").locator(".knobs-group-presets")).toHaveAttribute(
    "data-display",
    "menu",
  )
  await page.evaluate(() => (window as any).__fixture.controls.set({ drawerRow: 52 }))
  await expect.poll(async () => (await texts()).includes("Airy")).toBe(true)
})

test("highlight: what's on screen keeps full strength with a dot, the rest dims, interruptibly", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const root = await fixture(page)
  const highlight = (target: unknown, options?: unknown) =>
    page.evaluate(([t, o]) => (window as any).__fixture.page.highlight(t, o), [target, options])
  const veil = (group: string) =>
    tile(root, group).evaluate((t) => {
      const v = t.querySelector<HTMLElement>(":scope > .knobs-veil")
      return v && !v.hidden ? Number(v.style.opacity) : 0
    })
  const name = (section: string) =>
    root
      .locator(`.knobs-section-head[data-section="${section}"] .knobs-section-name`)
      .evaluate((n) => Number(getComputedStyle(n).opacity))
  const dot = (selector: string) =>
    root
      .locator(`${selector} > .knobs-mark`)
      .evaluate((d) => ((d as HTMLElement).hidden ? 0 : Number((d as HTMLElement).style.opacity)))

  // A section: its cards and heading keep full strength, the heading gets the dot.
  await highlight({ sections: ["Transcript"] })
  await expect(tile(root, "Rhythm")).toHaveClass(/knobs-highlighted/)
  await expect(tile(root, "drawer.spacing")).toHaveClass(/knobs-dimmed/)
  await expect(root.locator('[data-card="Pairing"]')).toHaveClass(/knobs-dimmed/)
  await expect.poll(() => veil("drawer.spacing")).toBeCloseTo(0.4, 2)
  expect(await veil("Rhythm")).toBe(0)
  await expect.poll(() => name("drawer")).toBeCloseTo(0.6, 2)
  expect(await name("Transcript")).toBe(1)
  await expect.poll(() => dot('.knobs-section-head[data-section="Transcript"]')).toBe(1)
  // Still interactive: a dimmed card takes clicks and keys.
  await page.getByRole("slider", { name: "composerGap" }).focus()
  await page.keyboard.press("ArrowRight")
  expect(await page.evaluate(() => (window as any).__fixture.controls.get().composerGap)).toBe(9)
  // …and the card in hand comes back up while focused.
  await expect.poll(() => veil("composer.spacing")).toBe(0)
  await page.getByRole("slider", { name: "drawerRow" }).focus()
  await expect.poll(() => veil("composer.spacing")).toBeCloseTo(0.4, 2)

  // A group on its own: its card gets the dot; its section's heading stays up, without one.
  await highlight({ groups: ["composer.spacing"] })
  await expect(tile(root, "composer.spacing")).toHaveClass(/knobs-highlighted/)
  await expect.poll(() => dot('.knobs-tile[data-group="composer.spacing"]')).toBe(1)
  await expect(root.locator('.knobs-section-head[data-section="composer"]')).toHaveClass(
    /knobs-highlighted/,
  )
  await expect.poll(() => dot('.knobs-section-head[data-section="Transcript"]')).toBe(0)
  await expect.poll(() => veil("Rhythm")).toBeCloseTo(0.4, 2)

  // Every change glides: switching mid-flight carries on from where it was, frame by frame.
  await highlight({ sections: ["Transcript"] })
  const frames = await page.evaluate(
    () =>
      new Promise<{ t: number; v: number }[]>((resolve) => {
        const t = document.querySelector<HTMLElement>('.knobs-tile[data-group="Rhythm"]')!
        const read = () => {
          const v = t.querySelector<HTMLElement>(":scope > .knobs-veil")
          return v && !v.hidden ? Number(v.style.opacity) : 0
        }
        const out: { t: number; v: number }[] = []
        const step = (now: number) => {
          out.push({ t: now, v: read() })
          // Mid-flight, back the other way.
          if (out.length === 2)
            (window as any).__fixture.page.highlight({ groups: ["composer.spacing"] })
          if (out.length < 60) requestAnimationFrame(step)
          else resolve(out)
        }
        requestAnimationFrame(step)
      }),
  )
  // No jumps: never faster than the spring can carry it (frames clamp at 50 ms), and it turns
  // around from where it was.
  const speeds = frames
    .slice(1)
    .map(
      (f, i) =>
        Math.abs(f.v - frames[i]!.v) / Math.min(0.05, Math.max(1e-3, (f.t - frames[i]!.t) / 1000)),
    )
  expect(Math.max(...speeds)).toBeLessThan(8)
  expect(frames[1]!.v).toBeGreaterThan(0.05)
  expect(frames[1]!.v).toBeLessThan(0.38)
  expect(new Set(frames.map((f) => f.v.toFixed(3))).size).toBeGreaterThan(3)
  expect(frames.at(-1)!.v).toBeCloseTo(0.4, 2)

  // Tab from the header lands on the first highlighted card.
  await root.locator(":scope > header .knobs-presets").focus()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("slider", { name: "composerMargin" })).toBeFocused()

  // null clears it.
  await highlight(null)
  await expect(root.locator(".knobs-dimmed")).toHaveCount(0)
  await expect.poll(() => veil("Rhythm")).toBe(0)
  await expect.poll(() => dot('.knobs-tile[data-group="composer.spacing"]')).toBe(0)
  expect(errors).toEqual([])
})

test("highlight in the GPU renderer: the same veil and dot", async ({ page }) => {
  const shots: Record<string, number[][]> = {}
  for (const mode of ["dom", "gpu"] as const) {
    const root = await fixture(page, { gpu: mode === "gpu" })
    if (mode === "gpu")
      test.skip((await root.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
    await page.evaluate(() =>
      (window as any).__fixture.page.highlight({ groups: ["composer.spacing"] }),
    )
    await page.mouse.move(2, 2)
    await page.waitForTimeout(900)
    if (mode === "gpu")
      await expect.poll(() => page.evaluate(() => (window as any).__knobsGpu?.sleeping)).toBe(true)
    const dimmed = (await tile(root, "drawer.spacing").boundingBox())!
    const lit = (await tile(root, "composer.spacing").boundingBox())!
    const mark = (await tile(root, "composer.spacing").locator(".knobs-mark").boundingBox())!
    shots[mode] = [
      // In each card's padding, beside its rows: the card itself (veiled or not).
      await pixel(page, dimmed.x + 4, dimmed.y + dimmed.height / 2),
      await pixel(page, lit.x + 4, lit.y + lit.height / 2),
      await pixel(page, mark.x + mark.width / 2, mark.y + mark.height / 2),
    ]
  }
  const [dim, lit, mark] = shots.dom!
  // The veil darkens the dimmed card toward the page; the dot is the accent.
  expect(dim![0]!).toBeLessThan(lit![0]! - 4)
  expect(mark![0]!).toBeGreaterThan(200)
  shots.gpu!.forEach((rgb, i) => expect(near(rgb, shots.dom![i]!, 6)).toBe(true))
})

test("highlight reveal glides the first highlighted card into view, unless the user is busy", async ({
  page,
}) => {
  await fixture(page, { width: 390, height: 700, extra: true })
  const reveal = (sections: string[]) =>
    page.evaluate(
      (s) => (window as any).__fixture.page.highlight({ sections: s }, { reveal: true }),
      sections,
    )
  const y = () => page.evaluate(() => scrollY)
  const headTop = (section: string) =>
    page.evaluate(
      (s) =>
        document.querySelector(`.knobs-section-head[data-section="${s}"]`)!.getBoundingClientRect()
          .top - document.querySelector(".knobs-page > header")!.getBoundingClientRect().bottom,
      section,
    )
  // Nothing touched yet: Delta (far down) glides up under the header.
  await reveal(["Gamma"])
  await expect.poll(y).toBeGreaterThan(1000)
  await expect.poll(async () => Math.abs((await headTop("Gamma")) - 12)).toBeLessThan(3)
  await page.waitForTimeout(400)
  // Already in view: it stays put.
  const at = await y()
  await reveal(["Gamma"])
  await page.waitForTimeout(400)
  expect(await y()).toBe(at)

  // Just scrolled: the page stays where the user left it.
  await page.mouse.move(200, 400)
  await page.mouse.wheel(0, -300)
  await expect.poll(y).toBeLessThan(at - 200)
  const scrolled = await y()
  await reveal(["Transcript"])
  await page.waitForTimeout(700)
  expect(Math.abs((await y()) - scrolled)).toBeLessThan(2)
  // Held down (a drag): still not.
  await page.mouse.down()
  await page.waitForTimeout(2100)
  await reveal(["Transcript"])
  await page.waitForTimeout(500)
  expect(Math.abs((await y()) - scrolled)).toBeLessThan(2)
  await page.mouse.up()
  // Two quiet seconds later it may.
  await page.waitForTimeout(2100)
  await reveal(["Transcript"])
  await expect.poll(y).toBeLessThan(5)
})

test("collapsible cards fold to their header, glide the cards below, and remember it", async ({
  page,
}) => {
  const root = await fixture(page)
  const card = root.locator('[data-card="Pairing"]')
  const head = card.locator(":scope > .knobs-group-head")
  await expect(head).toHaveAttribute("aria-expanded", "true")
  // Folding: the card's height eases down through every frame, the card below it follows, and
  // nothing in another column moves.
  // Sampled every frame from the click on.
  await page.evaluate(() => {
    const c = document.querySelector<HTMLElement>('[data-card="Pairing"]')!
    const column = c.parentElement!
    const below = c.nextElementSibling as HTMLElement | null
    const other = [...document.querySelectorAll<HTMLElement>(".knobs-column")].find(
      (x) => x !== column,
    )!.lastElementChild as HTMLElement
    const out: { h: number; below: number; other: number }[] = []
    const sample = () =>
      out.push({
        h: c.getBoundingClientRect().height,
        below: below?.getBoundingClientRect().top ?? 0,
        other: other.getBoundingClientRect().top,
      })
    ;(window as any).__fold = new Promise((resolve) => {
      c.addEventListener(
        "click",
        () => {
          sample()
          const step = () => {
            sample()
            if (out.length < 40) requestAnimationFrame(step)
            else resolve(out)
          }
          requestAnimationFrame(step)
        },
        { capture: true, once: true },
      )
    })
  })
  await head.click()
  const frames: { h: number; below: number; other: number }[] = await page.evaluate(
    () => (window as any).__fold,
  )
  const heights = frames.map((f) => f.h)
  const [first, last] = [heights[0]!, heights.at(-1)!]
  expect(last).toBeLessThan(first - 100)
  expect(heights.filter((h) => h < first - 1 && h > last + 1).length).toBeGreaterThan(3)
  for (let i = 1; i < heights.length; i++)
    expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]! + 0.5)
  expect(new Set(frames.map((f) => f.other)).size).toBe(1)
  await expect(card).toHaveAttribute("data-collapsed", "")
  await expect(head).toHaveAttribute("aria-expanded", "false")
  await expect(card.locator(".knobs-card-summary")).toHaveText("Paired")
  await expect(card.getByRole("switch", { name: "Keep awake" })).toBeHidden()

  // Keys: j/k reach the header; Enter toggles it.
  await head.focus()
  await page.keyboard.press("Enter")
  await expect(head).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("j")
  await expect(card.getByRole("switch", { name: "Keep awake" })).toBeFocused()
  await page.keyboard.press("k")
  await expect(head).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(card).toHaveAttribute("data-collapsed", "")
  expect(await page.evaluate(() => (window as any).__fixture.card.collapsed)).toBe(true)

  // A reload brings it back folded (per tab), without animating.
  const again = await fixture(page)
  await expect(again.locator('[data-card="Pairing"]')).toHaveAttribute("data-collapsed", "")
  await page.evaluate(() => (window as any).__fixture.card.collapse(false))
  await expect(again.locator('[data-card="Pairing"]')).not.toHaveAttribute("data-collapsed", "")
  await expect(again.getByRole("switch", { name: "Keep awake" })).toBeVisible()
})

test("the tune demo: the phone's screen drives the highlight; pairing folds the Connection card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/tune.html")
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  const tune = page.getByRole("region", { name: "iPhone Tune controls" })
  const head = (s: string) => tune.locator(`.knobs-section-head[data-section="${s}"]`)
  await expect(head("Transcript")).toHaveClass(/knobs-highlighted/)
  await expect(head("Session List")).toHaveClass(/knobs-dimmed/)
  const connection = tune.locator('[data-card="Connection"]')
  await expect(connection).not.toHaveAttribute("data-collapsed", "")
  await expect(connection.locator(".tune-qr")).toBeVisible()
  // The phone signs in: the code folds away, and the summary says who's connected.
  await expect(connection).toHaveAttribute("data-collapsed", "", { timeout: 8000 })
  await expect(connection.locator(".knobs-card-summary")).toHaveText(
    "iPhone · 0.142.4 (358) · connected",
  )
  // Choosing another screen moves the highlight there.
  await page.evaluate(() =>
    (window as any).__tune.send({ type: "playground", playground: "sessionList" }),
  )
  await expect(head("Session List")).toHaveClass(/knobs-highlighted/)
  await expect(head("Transcript")).toHaveClass(/knobs-dimmed/)
})
