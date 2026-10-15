import { expect, type Page, test } from "@playwright/test"

// knobs/ui in examples/lab.html: the workspace's splits (outliner | viewport over a dock |
// inspector column) and the outliner tree.
const ws = <T>(page: Page, fn: (w: any) => T) =>
  page.evaluate(`(${fn.toString()})(window.__workspace)`) as Promise<T>
async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/lab.html${query}`)
  await expect(page.locator(".knobs-tree-row").first()).toBeVisible()
  return errors
}
const size = (page: Page, pane: string) =>
  page.locator(`[data-pane="${pane}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.parentElement!.dataset.direction === "column" ? r.height : r.width
  })
const divider = (page: Page, split: "main" | "left" | "center", index = 0) =>
  page
    .locator(".knobs-split")
    .filter({
      has: page.locator(
        `:scope > [data-pane="${{ main: "left", left: "stations", center: "view" }[split]}"]`,
      ),
    })
    .locator(":scope > .knobs-divider")
    .nth(index)
/** Each frame's size of a pane until it has been still for a while. */
const film = (page: Page, pane: string, frames = 60) =>
  page.evaluate(
    ([pane, frames]) =>
      new Promise<number[]>((done) => {
        const el = document.querySelector(`[data-pane="${pane}"]`)!
        const column = el.parentElement!.dataset.direction === "column"
        const out: number[] = []
        const tick = () => {
          const r = el.getBoundingClientRect()
          out.push(Math.round((column ? r.height : r.width) * 10) / 10)
          if (out.length < (frames as number)) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    [pane, frames] as const,
  )
const settle = async (page: Page, pane: string) => {
  await expect
    .poll(async () => {
      const f = await film(page, pane, 6)
      return f.every((x) => x === f[0])
    })
    .toBe(true)
  return size(page, pane)
}
const rowsShown = (page: Page) => ws(page, (w) => w.outline.rows() as string[])
const row = (page: Page, label: string) => page.locator(`.knobs-tree-row[aria-label="${label}"]`)
const labels = (page: Page, ids: string[]) =>
  ws(page, (w) => {
    const out: Record<string, string> = {}
    const walk = (items: any[]) =>
      items.forEach((i) => {
        out[i.id] = i.label
        if (i.children) walk(i.children)
      })
    walk(w.scene)
    return out
  }).then((map) => ids.map((id) => map[id]))

test("split: dragging a divider resizes the panes beside it 1:1 and slows into the max", async ({
  page,
}) => {
  const errors = await open(page)
  const left0 = await size(page, "left")
  const center0 = await size(page, "center")
  expect(left0).toBe(240)
  const d = (await divider(page, "main").boundingBox())!
  const y = d.y + 400
  await page.mouse.move(d.x + d.width / 2, y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(d.x + d.width / 2 + i * 10, y)
  expect(await size(page, "left")).toBeCloseTo(left0 + 80, 0)
  expect(await size(page, "center")).toBeCloseTo(center0 - 80, 0)
  // Toward the max the pane slows, and never passes it (no rubber band).
  await page.mouse.move(d.x + 205, y)
  const near = await size(page, "left")
  expect(near).toBeLessThan(445)
  expect(near).toBeGreaterThan(430)
  await page.mouse.move(d.x + 600, y, { steps: 6 })
  const far = await size(page, "left")
  expect(far).toBeLessThanOrEqual(460)
  expect(far).toBeGreaterThan(459)
  await page.mouse.up()
  expect(await size(page, "left")).toBe(far)
  // The inspector column, on the other side of the viewport, didn't move.
  expect(await size(page, "right")).toBe(300)
  expect(errors).toEqual([])
})

test("split: sizes persist and restore before the first paint", async ({ page }) => {
  await open(page)
  await divider(page, "main").focus()
  await page.keyboard.press("Shift+ArrowRight")
  expect(await settle(page, "left")).toBe(240 + 64)
  await divider(page, "center").focus()
  await page.keyboard.press("Enter")
  await settle(page, "dock")
  // On reload, the first frame already has the saved layout.
  // Measured as the document finishes loading, before anything paints.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const w = (id: string) =>
        document.querySelector(`[data-pane="${id}"]`)!.getBoundingClientRect()
      ;(window as any).__firstFrame = { left: w("left").width, dock: w("dock").height }
    })
  })
  await page.reload()
  await expect(page.locator(".knobs-tree-row").first()).toBeVisible()
  const first = await page.evaluate(() => (window as any).__firstFrame)
  expect(first.left).toBe(304)
  expect(first.dock).toBeLessThan(40)
  expect(await page.locator('[data-pane="dock"]').getAttribute("data-collapsed")).toBe("")
})

test("split: collapsing springs to a rail, interruptibly, and the rail opens it again", async ({
  page,
}) => {
  const errors = await open(page)
  await divider(page, "main").focus()
  await page.keyboard.press("Enter")
  const shut = await film(page, "left", 50)
  // It moves over several frames, never jumps up, and lands on the rail.
  expect(shut.filter((w, i) => i > 0 && w !== shut[i - 1]).length).toBeGreaterThan(4)
  for (let i = 1; i < shut.length; i++) expect(shut[i]!).toBeLessThanOrEqual(shut[i - 1]! + 0.5)
  expect(shut.at(-1)).toBe(26)
  const pane = page.locator('[data-pane="left"]')
  await expect(pane).toHaveAttribute("data-collapsed", "")
  const rail = pane.locator(".knobs-pane-rail")
  await expect(rail).toHaveAttribute("aria-label", "Open Scene")
  expect(Number(await rail.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
  // Its content is out of reach while collapsed.
  expect(
    await pane
      .locator(":scope > .knobs-pane-clip")
      .evaluate((el) => getComputedStyle(el).visibility),
  ).toBe("hidden")
  // The rail opens it to the size it had.
  await rail.click()
  expect(await settle(page, "left")).toBe(240)
  // Interrupted midway, it turns back from where it is, without a jump.
  await divider(page, "main").focus()
  await page.keyboard.press("Enter")
  await expect.poll(() => size(page, "left")).toBeLessThan(220)
  await page.keyboard.press("Enter")
  const back = await film(page, "left", 50)
  expect(back[0]!).toBeGreaterThan(26)
  expect(back[0]!).toBeLessThan(240)
  for (let i = 1; i < back.length; i++) expect(Math.abs(back[i]! - back[i - 1]!)).toBeLessThan(80)
  expect(back.at(-1)).toBe(240)
  expect(errors).toEqual([])
})

test("split: keys resize and collapse; a double-click resets", async ({ page }) => {
  await open(page)
  const d = divider(page, "main", 1) // viewport | inspector
  await d.focus()
  await page.keyboard.press("ArrowLeft")
  expect(await settle(page, "right")).toBe(316)
  await page.keyboard.press("Shift+ArrowRight")
  expect(await settle(page, "right")).toBe(252)
  await page.keyboard.press("End")
  expect(await settle(page, "right")).toBe(248)
  await page.keyboard.press("Home")
  expect(await settle(page, "right")).toBe(560)
  await page.keyboard.press("Enter")
  expect(await settle(page, "right")).toBe(26)
  await page.keyboard.press("ArrowLeft")
  expect(await settle(page, "right")).toBe(560)
  await d.dblclick()
  expect(await settle(page, "right")).toBe(300)
  await expect(d).toHaveAttribute("role", "separator")
  await expect(d).toHaveAttribute("aria-valuenow", String(Math.round(await size(page, "center"))))
})

test("split: a column dock folds to its header, and a panel in a pane reflows with it", async ({
  page,
}) => {
  await open(page)
  const head = page.locator('[data-pane="dock"] .knobs-pane-head')
  await head.click()
  const folded = await settle(page, "dock")
  expect(folded).toBe(await head.evaluate((el) => el.getBoundingClientRect().height))
  await expect(head).toBeVisible()
  await head.click()
  expect(await settle(page, "dock")).toBe(132)
  // The station panel fills the inspector column, so it widens with it.
  const panel = page.locator('[data-controls="lab-station"]')
  const before = (await panel.boundingBox())!.width
  await divider(page, "main", 1).focus()
  await page.keyboard.press("Shift+ArrowLeft")
  await settle(page, "right")
  expect((await panel.boundingBox())!.width).toBeCloseTo(before + 64, 0)
})

test("tree: keys move, open and close; children cascade out from under their parent", async ({
  page,
}) => {
  const errors = await open(page)
  await row(page, "Vehicles").click()
  await page.keyboard.press("ArrowRight")
  // Rows below glide down over several frames while the child slides out from under Vehicles.
  const frames = await page.evaluate(
    () =>
      new Promise<{ lights: number; child: number; opacity: number }[]>((done) => {
        const out: { lights: number; child: number; opacity: number }[] = []
        const tick = () => {
          const at = (label: string) =>
            document.querySelector<HTMLElement>(`.knobs-tree-row[aria-label="${label}"]`)
          const child = at("Getaway · Muscle")
          out.push({
            lights: at("Lights")!.getBoundingClientRect().top,
            child: child ? child.getBoundingClientRect().top : Number.NaN,
            opacity: child ? Number(getComputedStyle(child).opacity) : 0,
          })
          if (out.length < 40) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
  )
  const moves = frames.filter((f, i) => i > 0 && f.lights !== frames[i - 1]!.lights)
  expect(moves.length).toBeGreaterThan(3)
  const last = frames.at(-1)!
  expect(last.child + 26).toBeCloseTo(last.lights, 0)
  expect(last.opacity).toBe(1)
  expect(frames[0]!.child).toBeLessThan(last.child)
  await page.keyboard.press("ArrowDown")
  await expect(row(page, "Getaway · Muscle")).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("ArrowLeft")
  await expect(row(page, "Vehicles")).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("ArrowLeft")
  await expect.poll(() => rowsShown(page).then((r) => r.length)).toBe(17)
  await page.keyboard.press("End")
  await expect(row(page, "Barrier")).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Home")
  await expect(row(page, "Vehicles")).toHaveAttribute("aria-selected", "true")
  // Type-ahead.
  await page.keyboard.type("pro")
  await expect(row(page, "Props")).toHaveAttribute("aria-selected", "true")
  await page.waitForTimeout(800)
  await page.keyboard.type("c")
  await expect(row(page, "Cone")).toHaveAttribute("aria-selected", "true")
  // The active row is the tree's active descendant, with a wash and no outline.
  const tree = page.locator(".knobs-tree")
  const active = await tree.getAttribute("aria-activedescendant")
  expect(await page.locator(`#${active}`).getAttribute("aria-label")).toBe("Cone")
  expect(await tree.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none")
  expect(errors).toEqual([])
})

test("tree: ⇧ ranges and ⌘ toggles the selection, washed in the accent", async ({ page }) => {
  await open(page)
  await row(page, "Porch post lantern").click()
  await row(page, "Fixtures").click({ modifiers: ["Shift"] })
  const picked = () =>
    page
      .locator('.knobs-tree-row[aria-selected="true"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
  expect(await picked()).toEqual(["Porch post lantern", "Window glow", "Fixtures"])
  await row(page, "Window glow").click({ modifiers: ["Meta"] })
  await row(page, "Lights").click({ modifiers: ["Meta"] })
  expect(await picked()).toEqual(["Lights", "Porch post lantern", "Fixtures"])
  await expect(page.locator("#picked")).toHaveText("Porch post lantern, Fixtures, Lights")
  const wash = await row(page, "Fixtures").evaluate(
    (el) => getComputedStyle(el, "::before").backgroundColor,
  )
  // The accent at 34% while the tree has focus (24% without).
  expect(wash).toMatch(/0\.34\)$/)
})

test("tree: dragging reorders and reparents, with a line or an into wash; ⌥↑↓ moves too", async ({
  page,
}) => {
  const errors = await open(page)
  const drag = async (from: string, to: string, fraction: number, check?: () => Promise<void>) => {
    const a = (await row(page, from).boundingBox())!
    const b = (await row(page, to).boundingBox())!
    await page.mouse.move(a.x + 60, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 2 })
    await page.mouse.move(b.x + 60, b.y + b.height * fraction, { steps: 6 })
    await check?.()
    await page.mouse.up()
  }
  // Above "Propane tank #96": a line before it.
  await drag("Barrier", "Propane tank #96", 0.15, async () => {
    await expect(page.locator(".knobs-tree-line")).toHaveAttribute("data-shown", "")
    await expect(page.locator(".knobs-tree-ghost")).toHaveText("Barrier")
  })
  const props = () =>
    ws(page, (w) => w.scene.find((g: any) => g.id === "props").children.map((c: any) => c.label))
  expect(await props()).toEqual(["Cone", "Barrier", "Propane tank #96"])
  // Into "Fixtures": the row washes, and the item lands last inside it.
  await drag("Barrier", "Fixtures", 0.5, async () => {
    await expect(row(page, "Fixtures")).toHaveAttribute("data-drop", "into")
  })
  const fixtures = () =>
    ws(page, (w) => w.scene.find((g: any) => g.id === "fixtures").children.map((c: any) => c.label))
  expect((await fixtures()).at(-1)).toBe("Barrier")
  expect(await page.locator(".knobs-tree-ghost").count()).toBe(0)
  // A parent can't go inside itself: no line, no move.
  const before = await ws(page, (w) => w.moves.length)
  await drag("Props", "Cone #93", 0.5)
  expect(await ws(page, (w) => w.moves.length)).toBe(before)
  // ⌥↑ steps the selection up past its neighbour.
  await row(page, "Propane tank #96").click()
  await page.keyboard.press("Alt+ArrowUp")
  expect(await props()).toEqual(["Propane tank #96", "Cone"])
  await expect(row(page, "Propane tank #96")).toHaveAttribute("aria-selected", "true")
  expect(errors).toEqual([])
})

test("tree: dragging near an edge scrolls the list", async ({ page }) => {
  await open(page, "?rows=2000")
  await ws(page, (w) => w.outline.expand("crowd", true))
  const tree = page.locator(".knobs-tree")
  const box = (await tree.boundingBox())!
  const a = (await row(page, "Cone #91").boundingBox())!
  await page.mouse.move(a.x + 60, a.y + 10)
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + 20, { steps: 2 })
  await page.mouse.move(a.x + 60, box.y + box.height - 6, { steps: 4 })
  await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBeGreaterThan(100)
  await page.keyboard.press("Escape")
  await page.mouse.up()
  expect(await ws(page, (w) => w.moves.length)).toBe(0)
})

test("tree: F2 or Enter renames in place, with no box", async ({ page }) => {
  await open(page)
  await row(page, "Porch post lantern").click()
  await page.keyboard.press("Enter")
  const input = page.locator(".knobs-tree-edit")
  await expect(input).toBeFocused()
  const look = await input.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      bg: cs.backgroundColor,
      top: cs.borderTopWidth,
      bottom: cs.borderBottomWidth,
      font: cs.fontSize,
    }
  })
  expect(look.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
  expect(look.top).toBe("0px")
  expect(look.bottom).toBe("1px")
  expect(look.font).toBe("11.5px")
  expect(
    await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([0, 18])
  await page.keyboard.type("Porch light")
  await page.keyboard.press("Enter")
  await expect(row(page, "Porch light")).toBeVisible()
  await expect(page.locator(".knobs-tree")).toBeFocused()
  // Esc leaves it as it was.
  await page.keyboard.press("F2")
  await page.keyboard.type("Nope")
  await page.keyboard.press("Escape")
  await expect(row(page, "Porch light")).toBeVisible()
  await expect(input).toHaveCount(0)
})

test("tree: visibility and lock toggles sit at the row's end", async ({ page }) => {
  await open(page)
  const r = row(page, "Window glow")
  await r.hover()
  await r.locator('[data-toggle="visible"]').click()
  await expect(r).toHaveAttribute("data-off", "visible")
  await r.locator('[data-toggle="locked"]').click()
  await expect(r).toHaveAttribute("data-off", "visible locked")
  // Off states stay visible at rest; on states only on hover.
  await page.mouse.move(700, 400)
  expect(
    Number(
      await r.locator('[data-toggle="visible"]').evaluate((el) => getComputedStyle(el).opacity),
    ),
  ).toBe(1)
  const other = row(page, "Porch post lantern").locator('[data-toggle="visible"]')
  await expect.poll(() => other.evaluate((el) => getComputedStyle(el).opacity)).toBe("0")
  const ids = await ws(page, (w) => [[...w.hidden], [...w.locked]])
  expect(ids[0]).toHaveLength(1)
  expect(await labels(page, ids[0]!)).toEqual(["Window glow"])
})

test("tree: the filter keeps matching rows' ancestors and marks the match", async ({ page }) => {
  await open(page)
  const find = page.getByRole("searchbox", { name: "Search scene" })
  await find.fill("cone #93")
  await expect.poll(() => rowsShown(page).then((r) => r.length)).toBe(3)
  await expect(row(page, "Props")).toHaveAttribute("data-ancestor", "")
  await expect(row(page, "Cone #93").locator("mark")).toHaveText("Cone #93")
  // Cleared, the tree is as it was.
  await find.fill("")
  await expect.poll(() => rowsShown(page).then((r) => r.length)).toBe(17)
})

test("tree: 10,000 rows scroll at full speed with only a window of them in the DOM", async ({
  page,
}) => {
  test.slow()
  await open(page, "?rows=10000")
  await ws(page, (w) => {
    w.outline.expand("crowd", true)
    for (let g = 0; g < 100; g++) w.outline.expand(`crowd-${g}`, true)
  })
  await expect.poll(() => rowsShown(page).then((r) => r.length)).toBeGreaterThan(10000)
  const tree = page.locator(".knobs-tree")
  await page.waitForTimeout(600)
  // Each step: scroll a screenful and a half, let the tree catch up, and lay the page out. Headless
  // frames run at the machine's pace, so the work is timed rather than the frames.
  const result = await tree.evaluate(
    (el) =>
      new Promise<{ work: number[]; maxRows: number; height: number }>((done) => {
        const work: number[] = []
        let maxRows = 0
        const tick = () => {
          const t = performance.now()
          el.scrollTop += 1200
          el.dispatchEvent(new Event("scroll"))
          el.lastElementChild!.getBoundingClientRect()
          work.push(performance.now() - t)
          maxRows = Math.max(maxRows, el.querySelectorAll(".knobs-tree-row").length)
          if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) requestAnimationFrame(tick)
          else done({ work: work.slice(2), maxRows, height: el.scrollHeight })
        }
        requestAnimationFrame(tick)
      }),
  )
  const sorted = [...result.work].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  const p90 = sorted[Math.floor(sorted.length * 0.9)]!
  console.log(
    `10k scroll: ${result.work.length} steps, median ${median.toFixed(2)} ms, p90 ${p90.toFixed(2)} ms per step, ≤${result.maxRows} rows in the DOM`,
  )
  expect(result.maxRows).toBeLessThan(80)
  expect(median).toBeLessThan(8)
  expect(result.height).toBeGreaterThan(26 * 10000)
  // The last row is there at the bottom.
  await page.waitForTimeout(100)
  await expect(row(page, "Walker #10000")).toBeVisible()
})

test("split: with the GPU renderer, the overlay follows a panel through a collapse", async ({
  page,
}) => {
  const errors = await open(page, "?gpu")
  await expect(page.locator('[data-controls="lab-station"]')).toHaveAttribute(
    "data-gpu-active",
    /true|false/,
  )
  const active = await page.locator('[data-controls="lab-station"]').getAttribute("data-gpu-active")
  test.skip(active !== "true", "No WebGPU here")
  const frames = () => page.evaluate(() => window.__knobsGpu!.frameCount)
  const before = await frames()
  await divider(page, "main", 1).focus()
  await page.keyboard.press("Enter")
  await settle(page, "right")
  expect(await frames()).toBeGreaterThan(before + 3)
  // Collapsed, the panel's rows are clipped away; open, they're drawn again.
  await expect
    .poll(() => page.evaluate(() => window.__knobsGpu!.lastTexts.includes("Drop density")))
    .toBe(false)
  await page.locator('[data-pane="right"] .knobs-pane-rail').click()
  await settle(page, "right")
  await expect
    .poll(() => page.evaluate(() => window.__knobsGpu!.lastTexts.includes("Drop density")))
    .toBe(true)
  expect(errors).toEqual([])
})
