import { expect, type Page, test } from "@playwright/test"

// OC-345: a page that folds by section, remembers its folds, summarizes folded cards and sections,
// jumps between sections from its header, describes its cards and sections, and opens what a
// highlight points at.

type Options = {
  gpu?: boolean
  width?: number
  height?: number
  /** Keep folds in localStorage; `keep` doesn't clear it first (a reload). */
  keep?: boolean
  store?: Record<string, unknown>
  mount?: Record<string, unknown>
  /** Install groupSummary / sectionSummary overrides. */
  summaries?: boolean
  /** Leave foldStorage at its default (the store's storage) instead of passing localStorage. */
  tabFolds?: boolean
}

/**
 * Sections Look (Color, Shape), Motion (Springs, Timing) and Layout (Grid, Rows, a custom
 * "Notes" card). Color has named presets; Motion's cards fold.
 */
async function mount(page: Page, o: Options = {}) {
  await page.setViewportSize({ width: o.width ?? 1440, height: o.height ?? 900 })
  await page.goto(`/tune.html?classic&${o.gpu ? "gpu" : "dom"}`)
  await page.waitForFunction(() => (window as any).__knobs)
  await page.evaluate((o) => {
    const { knobs: k, mountPage } = (window as any).__knobs
    ;(window as any).__tune.page.dispose()
    if (!o.keep) localStorage.clear()
    const n = (value: number, group: string, section: string, extra = {}) =>
      k.knob(value, { min: 0, max: 100, step: 1, group, section, ...extra })
    const schema: Record<string, unknown> = {
      hue: n(20, "Color", "Look", { groupDescription: "Hue and glow of the accent" }),
      glow: n(40, "Color", "Look"),
      radius: n(12, "Shape", "Look", { sectionDescription: "How things look at rest" }),
      border: n(1, "Shape", "Look"),
      open: n(30, "Springs", "Motion", { folded: false }),
      close: n(25, "Springs", "Motion"),
      delay: n(20, "Timing", "Motion", { folded: true }),
      stagger: n(30, "Timing", "Motion"),
      columns: n(3, "Grid", "Layout"),
      gutter: n(16, "Grid", "Layout"),
      rows: n(44, "Rows", "Layout"),
      gap: n(8, "Rows", "Layout"),
    }
    for (const f of ["a", "b", "c", "d", "e", "f"])
      schema[`rows${f}`] = n(10, "Rows", "Layout", { label: `Row ${f}` })
    const controls = k.defineControls("sections-fixture", schema, {
      storage: localStorage,
      groupPresets: {
        Color: [
          { name: "Plain", values: {} },
          { name: "Vivid", values: { hue: 80, glow: 90 } },
        ],
      },
      ...o.store,
    })
    const app = document.querySelector<HTMLElement>("#app")!
    app.replaceChildren()
    const page = mountPage(controls, app, {
      title: "Sections",
      theme: "dark",
      sections: ["Look", "Motion", "Layout"],
      groupDescriptions: { Grid: "Columns and gutters" },
      sectionDescriptions: { Motion: "Springs and timing for every move" },
      ...(o.tabFolds ? {} : { foldStorage: localStorage }),
      ...(o.summaries
        ? {
            groupSummary: (group: string, info: any) =>
              `${group}: ${info.preset ?? "none"} ${info.changed}/${info.keys.length}`,
            sectionSummary: (section: string, info: any) =>
              info.changed ? `${section} has ${info.changed}` : null,
          }
        : {}),
      ...o.mount,
    })
    const notes = page.card({
      title: "Notes",
      section: "Layout",
      collapsed: false,
      description: "Free text about this layout",
    })
    notes.item({ label: "Margins follow the grid" })
    ;(window as any).__s = { controls, page, notes }
  }, o)
  const root = page.getByRole("region", { name: "Sections controls" })
  await expect(root.locator(".knobs-section-head").first()).toBeVisible()
  await page.waitForTimeout(500)
  return root
}

const head = (root: ReturnType<Page["getByRole"]>, section: string) =>
  root.locator(`.knobs-section-head[data-section="${section}"]`)
const tile = (root: ReturnType<Page["getByRole"]>, group: string) =>
  root.locator(`.knobs-tile[data-group="${group}"]`)

test("a section folds to its heading: its cards fold away and the columns re-balance, gliding, interruptibly", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  const root = await mount(page, { mount: { sectionFolded: { Look: false } } })
  const look = head(root, "Look")
  await expect(look).toHaveAttribute("aria-expanded", "true")
  await expect(look.locator(".knobs-caret")).toHaveCount(1)
  // Motion and Layout don't say, so their headings don't fold.
  await expect(head(root, "Motion")).not.toHaveAttribute("data-foldable", "")

  // Folding Look: its cards' heights ease to nothing, frame by frame, while Layout's cards glide
  // to their new places through positions in between.
  const frames = await page.evaluate(
    () =>
      new Promise<{ color: number; grid: [number, number]; head: number }[]>((resolve) => {
        const color = document.querySelector<HTMLElement>('.knobs-tile[data-group="Color"]')!
        const grid = document.querySelector<HTMLElement>('.knobs-tile[data-group="Grid"]')!
        const look = document.querySelector<HTMLElement>(
          '.knobs-section-head[data-section="Look"]',
        )!
        const out: { color: number; grid: [number, number]; head: number }[] = []
        const sample = () => {
          const g = grid.getBoundingClientRect()
          out.push({
            color: color.getBoundingClientRect().height,
            grid: [g.left, g.top],
            head: look.getBoundingClientRect().top,
          })
        }
        look.click()
        sample()
        const step = () => {
          sample()
          if (out.length < 50) requestAnimationFrame(step)
          else resolve(out)
        }
        requestAnimationFrame(step)
      }),
  )
  const heights = frames.map((f) => f.color)
  expect(heights.at(-1)!).toBeLessThan(2)
  expect(heights.filter((h) => h > 2 && h < heights[0]! - 2).length).toBeGreaterThan(3)
  for (let i = 1; i < heights.length; i++)
    expect(heights[i]!).toBeLessThanOrEqual(heights[i - 1]! + 0.5)
  const xs = new Set(frames.map((f) => Math.round(f.grid[0])))
  const ys = new Set(frames.map((f) => Math.round(f.grid[1])))
  expect(xs.size + ys.size).toBeGreaterThan(4)
  await expect(look).toHaveAttribute("aria-expanded", "false")
  await expect(look).toHaveAttribute("data-folded", "")
  await expect(tile(root, "Color")).toBeHidden()
  await expect(look.locator(".knobs-section-summary")).toHaveText("2 cards")
  expect(await page.evaluate(() => (window as any).__s.page.sectionFolded("Look"))).toBe(true)

  // Interrupted: opening it again mid-fold turns the cards around from where they got to.
  await page.waitForTimeout(600)
  const mid = await page.evaluate(async () => {
    const look = document.querySelector<HTMLElement>('.knobs-section-head[data-section="Look"]')!
    const color = document.querySelector<HTMLElement>('.knobs-tile[data-group="Color"]')!
    look.click()
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame)
    const h1 = color.getBoundingClientRect().height
    look.click()
    await new Promise(requestAnimationFrame)
    const h2 = color.getBoundingClientRect().height
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
    return { h1, h2, h3: color.getBoundingClientRect().height }
  })
  expect(mid.h1).toBeGreaterThan(2)
  expect(Math.abs(mid.h2 - mid.h1)).toBeLessThan(mid.h1)
  expect(mid.h3).toBeLessThan(mid.h2 + 0.5)
  await expect(tile(root, "Color")).toBeHidden()

  // Keys: the heading is a j/k stop, Enter and Space toggle it, ← folds and → opens.
  await look.focus()
  await page.keyboard.press("Enter")
  await expect(look).toHaveAttribute("aria-expanded", "true")
  await expect(tile(root, "Color")).toBeVisible()
  await page.keyboard.press("j")
  await expect(page.getByRole("slider", { name: "hue" })).toBeFocused()
  await page.keyboard.press("k")
  await expect(look).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(look).toHaveAttribute("aria-expanded", "false")
  await page.keyboard.press(" ")
  await expect(look).toHaveAttribute("aria-expanded", "true")
  // Focus inside cards folding away stays with the section, on its heading.
  await page.getByRole("slider", { name: "glow" }).focus()
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", true))
  await expect(look).toBeFocused()
  // The filter opens a folded section while it runs.
  await page.keyboard.press("/")
  await page.keyboard.type("glow")
  await expect(page.getByRole("slider", { name: "glow" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("slider", { name: "glow" })).toBeHidden()
  expect(errors).toEqual([])
})

test("folded cards and sections summarize their preset and changes, live, and take overrides", async ({
  page,
}) => {
  const root = await mount(page, { mount: { sectionFolded: true } })
  const motion = head(root, "Motion")
  await expect(motion).toHaveAttribute("data-folded", "")
  await expect(motion.locator(".knobs-section-summary")).toHaveText("2 cards")
  await expect(head(root, "Layout").locator(".knobs-section-summary")).toHaveText("3 cards")
  // A change shows up in the folded section's count at once, and a reset takes it away.
  await page.evaluate(() => (window as any).__s.controls.set({ open: 50, delay: 40 }))
  await expect(motion.locator(".knobs-section-summary")).toHaveText("2 changed · 2 cards")
  await page.evaluate(() => (window as any).__s.controls.sync({ open: 30 }))
  await expect(motion.locator(".knobs-section-summary")).toHaveText("1 changed · 2 cards")

  // A folded card: "<preset or Custom> · N changed", leaving out what doesn't apply.
  await page.evaluate(() => (window as any).__s.page.foldSection("Motion", false))
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", false))
  const timing = tile(root, "Timing")
  await expect(timing).toHaveAttribute("data-folded", "")
  await expect(timing.locator(".knobs-group-summary")).toHaveText("1 changed")
  await expect(timing.locator(".knobs-group-ctl")).toBeHidden()
  await page.evaluate(() => (window as any).__s.controls.sync({ delay: 20 }))
  await expect(timing.locator(".knobs-group-summary")).toHaveText("")
  await expect(timing.locator(".knobs-group-summary")).toBeHidden()
  // Opening it brings its controls back.
  await timing.locator(".knobs-group-head").click()
  await expect(timing.locator(".knobs-group-ctl")).toBeVisible()

  // A card that doesn't fold (nothing says it does) stays as it is.
  await page.evaluate(() => (window as any).__s.page.fold("Color", true))
  await expect(tile(root, "Color")).not.toHaveAttribute("data-folded", "")
  await expect(tile(root, "Color").locator(".knobs-group-summary")).toHaveCount(0)
})

test("a folded card with presets reads its preset and changes; overrides replace either summary", async ({
  page,
}) => {
  const root = await mount(page, {
    mount: { sectionFolded: true, groupFolded: { Color: true } },
  })
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", false))
  const color = tile(root, "Color")
  await expect(color).toHaveAttribute("data-folded", "")
  await expect(color.locator(".knobs-group-summary")).toHaveText("Plain")
  await page.evaluate(() => (window as any).__s.controls.groupPreset("Color", 1))
  await expect(color.locator(".knobs-group-summary")).toHaveText("Vivid · 2 changed")
  await page.evaluate(() => (window as any).__s.controls.set({ hue: 81 }))
  await expect(color.locator(".knobs-group-summary")).toHaveText("Custom · 2 changed")
  // The summary has the whole of itself as its tooltip.
  await expect(color.locator(".knobs-group-summary")).toHaveAttribute("title", "Custom · 2 changed")

  const again = await mount(page, {
    summaries: true,
    mount: { sectionFolded: true, groupFolded: { Color: true } },
  })
  await page.evaluate(() => (window as any).__s.controls.set({ glow: 41, delay: 25 }))
  await expect(head(again, "Motion").locator(".knobs-section-summary")).toHaveText("Motion has 1")
  await expect(head(again, "Layout").locator(".knobs-section-summary")).toHaveText("")
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", false))
  await expect(tile(again, "Color").locator(".knobs-group-summary")).toHaveText("Color: Custom 1/2")
})

test("folds are remembered across reloads and win over sectionFolded; a highlight's openings aren't", async ({
  page,
}) => {
  const options = { mount: { sectionFolded: true } }
  let root = await mount(page, options)
  await expect(head(root, "Look")).toHaveAttribute("data-folded", "")
  // The user opens Look and folds the Springs card; a highlight opens Layout.
  await head(root, "Look").click()
  await page.evaluate(() => (window as any).__s.page.foldSection("Motion", false))
  await tile(root, "Springs").locator(".knobs-group-head").click()
  await expect(tile(root, "Springs")).toHaveAttribute("data-folded", "")
  await page.evaluate(() =>
    (window as any).__s.page.highlight({ sections: ["Layout"] }, { expand: true }),
  )
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "true")
  await page.evaluate(() => (window as any).__s.notes.collapse(true))

  // A reload (or a new tab: it's localStorage) brings back the user's folds, not the highlight's.
  root = await mount(page, { ...options, keep: true })
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "true")
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "true")
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "false")
  await expect(tile(root, "Springs")).toHaveAttribute("data-folded", "")
  await expect(tile(root, "Timing")).toHaveAttribute("data-folded", "")
  await page.evaluate(() => (window as any).__s.page.foldSection("Layout", false))
  await expect(root.locator('[data-card="Notes"]')).toHaveAttribute("data-collapsed", "")
  // With foldStorage: null nothing is remembered.
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", true))
  const none = { mount: { sectionFolded: true, foldStorage: null }, keep: true }
  root = await mount(page, none)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  await head(root, "Look").click()
  root = await mount(page, none)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
})

test("the jump strip marks the section in view, counts changes, and glides to a section, opening it", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  // One column, so the sections stack and scrolling passes through each in turn.
  const root = await mount(page, {
    width: 520,
    height: 600,
    mount: { nav: true, sectionFolded: { Motion: true } },
  })
  const nav = root.locator(":scope > header .knobs-nav")
  await expect(nav.getByRole("tab")).toHaveText(["Look", "Motion", "Layout"])
  const selected = () =>
    nav.locator('[aria-selected="true"]').evaluate((b) => b.firstChild!.textContent)
  await expect.poll(selected).toBe("Look")
  // Changes count on their section's chip.
  await page.evaluate(() => (window as any).__s.controls.set({ delay: 40, stagger: 31 }))
  await expect(nav.locator('[data-tab="Motion"] .knobs-tab-count')).toHaveText("2")
  await expect(nav.locator('[data-tab="Look"] .knobs-tab-count')).toHaveCount(0)

  // Scrolling marks the section in view; the underline slides there.
  await page.mouse.move(260, 400)
  await page.mouse.wheel(0, 2000)
  await expect.poll(selected).toBe("Layout")
  await page.mouse.wheel(0, -4000)
  await expect.poll(selected).toBe("Look")
  const bar = () =>
    nav.locator(".knobs-tabs-bar").evaluate((b) => (b as HTMLElement).getBoundingClientRect().left)
  const lookBar = await bar()

  // A chip glides to its section and opens it.
  await nav.getByRole("tab", { name: "Motion" }).click()
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "true")
  await expect(tile(root, "Springs")).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = document.querySelector(".knobs-page > header")!.getBoundingClientRect().bottom
        return Math.round(
          document
            .querySelector('.knobs-section-head[data-section="Motion"]')!
            .getBoundingClientRect().top - h,
        )
      }),
    )
    .toBe(12)
  await expect.poll(selected).toBe("Motion")
  await expect.poll(bar).not.toBe(lookBar)
  // Opening it from the strip is the user's choice: remembered.
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("knobs:sections-fixture:folds:v1")))!,
    ).sections.Motion,
  ).toBe(false)

  // ⌥↑ and ⌥↓ step through the sections, focus coming along.
  await page.getByRole("slider", { name: "open" }).focus()
  await page.keyboard.press("Alt+ArrowDown")
  await expect.poll(selected).toBe("Layout")
  await expect(page.getByRole("slider", { name: "columns" })).toBeFocused()
  await page.keyboard.press("Alt+ArrowUp")
  await expect(head(root, "Motion")).toBeFocused()
  // Hint mode reaches the chips: each has a code (the chips match while it's typed).
  await page.keyboard.press("s")
  await expect(nav.locator(".knobs-tab.knobs-hint-match")).toHaveCount(3)
  await page.keyboard.press("Escape")
  // Narrow: the strip scrolls sideways instead of overflowing the page.
  await page.setViewportSize({ width: 220, height: 700 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(220)
  expect(errors).toEqual([])
})

test("descriptions show under titles and headings in both renderers, and the filter reads them", async ({
  page,
}) => {
  for (const gpu of [false, true]) {
    const root = await mount(page, { gpu })
    const color = tile(root, "Color").locator(":scope > .knobs-group-desc")
    await expect(color).toHaveText("Hue and glow of the accent")
    await expect(color).toHaveAttribute("title", "Hue and glow of the accent")
    await expect(tile(root, "Grid").locator(":scope > .knobs-group-desc")).toHaveText(
      "Columns and gutters",
    )
    await expect(tile(root, "Shape").locator(":scope > .knobs-group-desc")).toBeHidden()
    await expect(head(root, "Look").locator(".knobs-section-desc")).toHaveText(
      "How things look at rest",
    )
    await expect(head(root, "Motion").locator(".knobs-section-desc")).toHaveText(
      "Springs and timing for every move",
    )
    await expect(root.locator('[data-card="Notes"] .knobs-group-desc')).toHaveText(
      "Free text about this layout",
    )
    // One line, under the title, truncating rather than wrapping.
    const box = await color.evaluate((d) => {
      const r = d.getBoundingClientRect()
      const t = d.parentElement!.querySelector(".knobs-group-label")!.getBoundingClientRect()
      return { top: r.top, title: t.bottom, h: r.height, ws: getComputedStyle(d).whiteSpace }
    })
    expect(box.top).toBeGreaterThanOrEqual(box.title - 1)
    expect(box.h).toBeLessThan(20)
    expect(box.ws).toBe("nowrap")
    if (gpu) {
      await expect(root).toHaveAttribute("data-gpu-active", "true")
      const texts = () => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[])
      await expect.poll(texts).toContain("Hue and glow of the accent")
      await expect.poll(texts).toContain("How things look at rest")
      await expect.poll(texts).toContain("Look")
    }
  }
  const root = page.getByRole("region", { name: "Sections controls" })
  await page.getByRole("slider", { name: "hue" }).focus()
  await page.keyboard.press("/")
  await page.keyboard.type("gutters")
  await expect(root.locator(".knobs-tile:visible")).toHaveCount(1)
  await expect(tile(root, "Grid")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("/")
  await page.keyboard.type("timing for every")
  await expect(root.locator(".knobs-tile:visible")).toHaveCount(2)
  await page.keyboard.press("Escape")
  await page.keyboard.press("/")
  await page.keyboard.type("free text")
  await expect(root.locator(".knobs-tile:visible")).toHaveCount(1)
})

test("highlight's expand opens what it points at and folds it again when the context moves, unless it's the user's", async ({
  page,
}) => {
  const root = await mount(page, { mount: { sectionFolded: true } })
  const s = (fn: string) => page.evaluate(fn)
  await s(`__s.page.highlight({ sections: ["Look"] }, { expand: true })`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "true")
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "false")
  // A card highlighted on its own opens, with its section.
  await s(`__s.page.highlight({ groups: ["Timing"] }, { expand: true })`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "true")
  await expect(tile(root, "Timing")).not.toHaveAttribute("data-folded", "")
  // Moving on folds both again.
  await s(`__s.page.highlight({ sections: ["Layout"] }, { expand: true })`)
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "false")
  await expect(tile(root, "Timing")).toHaveAttribute("data-folded", "")
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "true")
  // Working in what it opened makes it the user's: it stays open when the context moves.
  await page.getByRole("slider", { name: "gutter" }).click()
  await s(`__s.page.highlight({ sections: ["Look"] }, { expand: true })`)
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "true")
  // Without expand, a highlight still folds what an earlier one opened, and opens nothing.
  await s(`__s.page.highlight({ sections: ["Motion"] })`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  await expect(head(root, "Motion")).toHaveAttribute("aria-expanded", "false")
  // Clearing it folds what it opened.
  await s(`__s.page.highlight({ sections: ["Look"] }, { expand: true })`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "true")
  await s(`__s.page.highlight(null)`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  // A user's manual fold of something a highlight opened is theirs too.
  await s(`__s.page.highlight({ sections: ["Look"] }, { expand: true })`)
  await head(root, "Look").click()
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  await head(root, "Look").click()
  await s(`__s.page.highlight({ sections: ["Motion"] }, { expand: true })`)
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "true")
})

test("remote controls set descriptions and folds from descriptors and options; update keeps folds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/tune.html?classic&dom")
  await page.waitForFunction(() => (window as any).__knobs)
  await page.evaluate(() => {
    const { knobs: k, mountPage } = (window as any).__knobs
    ;(window as any).__tune.page.dispose()
    localStorage.clear()
    const d = (key: string, group: string, section: string, extra = {}) => ({
      key,
      label: key,
      kind: "number",
      default: 10,
      min: 0,
      max: 100,
      step: 1,
      group,
      section,
      ...extra,
    })
    const all = [
      d("rowHeight", "Rows", "Drawer", {
        groupDescription: "Each session's row",
        sectionDescription: "The list of sessions",
        sectionFolded: true,
      }),
      d("rowGap", "Rows", "Drawer"),
      d("edge", "Edge", "Drawer", { folded: true }),
      d("fade", "Arrivals", "Transcript", { folded: false }),
      d("rise", "Arrivals", "Transcript"),
    ]
    const remote = k.createRemoteControls("remote-sections", all, {
      storage: localStorage,
      groupDescriptions: { Edge: "Where rows meet the title" },
      sectionDescriptions: { Transcript: "Messages as they stream" },
      sectionFolded: { Transcript: false },
    })
    const p = mountPage(remote, document.querySelector<HTMLElement>("#app")!, {
      title: "Remote",
      sections: ["Drawer", "Transcript"],
    })
    ;(window as any).__r = { remote, page: p, all }
  })
  const root = page.getByRole("region", { name: "Remote controls" })
  await expect(head(root, "Drawer")).toHaveAttribute("aria-expanded", "false")
  await expect(head(root, "Drawer").locator(".knobs-section-desc")).toHaveText(
    "The list of sessions",
  )
  await expect(head(root, "Transcript")).toHaveAttribute("aria-expanded", "true")
  await expect(head(root, "Transcript").locator(".knobs-section-desc")).toHaveText(
    "Messages as they stream",
  )
  await page.evaluate(() => (window as any).__r.page.foldSection("Drawer", false))
  await expect(tile(root, "Rows").locator(".knobs-group-desc")).toHaveText("Each session's row")
  await expect(tile(root, "Edge").locator(".knobs-group-desc")).toHaveText(
    "Where rows meet the title",
  )
  await expect(tile(root, "Edge")).toHaveAttribute("data-folded", "")
  await expect(tile(root, "Arrivals")).toHaveAttribute("data-foldable", "")
  await expect(tile(root, "Arrivals")).not.toHaveAttribute("data-folded", "")
  // The user folds Arrivals and Transcript; a descriptor swap keeps both, and a new description.
  await tile(root, "Arrivals").locator(".knobs-group-head").click()
  await page.evaluate(() => (window as any).__r.page.foldSection("Transcript", true))
  await page.evaluate(() => {
    const r = (window as any).__r
    r.remote.update(
      r.all.map((x: any) => (x.key === "fade" ? { ...x, groupDescription: "New lines" } : x)),
      { fade: 20 },
    )
  })
  await expect(head(root, "Transcript")).toHaveAttribute("aria-expanded", "false")
  await expect(tile(root, "Arrivals")).toHaveAttribute("data-folded", "")
  await expect(tile(root, "Arrivals").locator(".knobs-group-desc")).toHaveText("New lines")
  await expect(head(root, "Transcript").locator(".knobs-section-summary")).toHaveText(
    "1 changed · 1 card",
  )
})

test("sections() describes sections and groups for a host's own navigation; onSections and onActiveSection follow folds, changes and scrolling", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  const root = await mount(page, {
    width: 520,
    height: 600,
    mount: { sectionFolded: { Motion: true } },
    store: { groupFolded: { Grid: true } },
  })
  const read = () => page.evaluate(() => (window as any).__s.page.sections())
  const list = await read()
  expect(list.map((s: any) => s.id)).toEqual(["Look", "Motion", "Layout"])
  expect(list[0]).toMatchObject({
    id: "Look",
    label: "Look",
    description: "How things look at rest",
    folded: false,
    changed: 0,
  })
  expect(list[0].groups).toEqual([
    { id: "Color", label: "Color", folded: false, changed: 0, preset: "Plain" },
    { id: "Shape", label: "Shape", folded: false, changed: 0, preset: null },
  ])
  expect(list[1]).toMatchObject({ id: "Motion", folded: true })
  expect(list[1].groups.map((g: any) => g.id)).toEqual(["Springs", "Timing"])
  // Custom cards aren't groups; Grid folds from the store's groupFolded.
  expect(list[2].groups.map((g: any) => [g.id, g.folded])).toEqual([
    ["Grid", true],
    ["Rows", false],
  ])

  // Listeners hear the first state, then each change, batched.
  await page.evaluate(() => {
    const s = (window as any).__s
    s.calls = []
    s.active = []
    s.page.onSections((list: any) => s.calls.push(list))
    s.page.onActiveSection((id: any) => s.active.push(id))
  })
  await expect.poll(() => page.evaluate(() => (window as any).__s.calls.length)).toBe(1)
  await page.evaluate(() => (window as any).__s.controls.set({ hue: 80, glow: 90, radius: 30 }))
  await expect
    .poll(() => page.evaluate(() => (window as any).__s.calls.at(-1)[0]))
    .toMatchObject({ changed: 3, groups: [{ changed: 2, preset: "Vivid" }, { changed: 1 }] })
  const before = await page.evaluate(() => (window as any).__s.calls.length)
  await head(root, "Motion").click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__s.calls.at(-1)[1].folded))
    .toBe(false)
  // One fold, one call.
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as any).__s.calls.length)).toBe(before + 1)

  // Scrolling moves the active section.
  expect(await page.evaluate(() => (window as any).__s.page.activeSection())).toBe("Look")
  await page.mouse.move(260, 400)
  await page.mouse.wheel(0, 4000)
  await expect
    .poll(() => page.evaluate(() => (window as any).__s.page.activeSection()))
    .toBe("Layout")
  await expect.poll(() => page.evaluate(() => (window as any).__s.active.at(-1))).toBe("Layout")
  expect(errors).toEqual([])
})

test("reveal opens a section or a group and glides to it; for context it isn't remembered, a jump with remember is; fold and foldSection take remember and reveal", async ({
  page,
}) => {
  const root = await mount(page, {
    width: 520,
    height: 600,
    mount: { sectionFolded: { Layout: true } },
    store: { groupFolded: { Grid: true } },
  })
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("knobs:sections-fixture:folds:v1") ?? "{}"))
  const scrollY = () => page.evaluate(() => scrollY)
  // Context: Grid (and its folded section) open and glide into view; nothing is remembered.
  await page.evaluate(() => (window as any).__s.page.reveal({ group: "Grid" }))
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "true")
  await expect(tile(root, "Grid")).not.toHaveAttribute("data-folded", "")
  await expect.poll(scrollY).toBeGreaterThan(100)
  await expect
    .poll(() => page.evaluate(() => (window as any).__s.page.activeSection()))
    .toBe("Layout")
  expect(await saved()).toEqual({})

  // A jump the user asked for is remembered.
  await page.evaluate(() => (window as any).__s.page.foldSection("Layout", true))
  await page.evaluate(() =>
    (window as any).__s.page.reveal({ section: "Layout" }, { remember: true }),
  )
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "true")
  expect((await saved()).sections).toEqual({ Layout: false })

  // fold / foldSection: remembered by default, not with remember: false; reveal glides.
  await page.evaluate(() => (window as any).__s.page.fold("Grid", true, { remember: false }))
  await expect(tile(root, "Grid")).toHaveAttribute("data-folded", "")
  expect((await saved()).groups).toEqual({})
  await page.evaluate(() => window.scrollTo({ top: 0 }))
  await page.evaluate(() => (window as any).__s.page.fold("Grid", false, { reveal: true }))
  expect((await saved()).groups).toEqual({ Grid: false })
  await expect.poll(scrollY).toBeGreaterThan(100)
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", true, { remember: false }))
  expect(await page.evaluate(() => (window as any).__s.page.sectionFolded("Look"))).toBe(true)
  expect((await saved()).sections).toEqual({ Layout: false })
})

test("the filter opens matching folded sections and cards for a while, and leaves their saved folds alone", async ({
  page,
}) => {
  const root = await mount(page, {
    mount: { sectionFolded: { Layout: true, Motion: false } },
  })
  await page.evaluate(() => (window as any).__s.page.fold("Timing", true))
  const saved = () => page.evaluate(() => localStorage.getItem("knobs:sections-fixture:folds:v1"))
  const kept = await saved()
  await page.getByRole("slider", { name: "hue" }).focus()
  await page.keyboard.press("/")
  await page.keyboard.type("gutter")
  await expect(tile(root, "Grid")).toBeVisible()
  await root.getByRole("searchbox").fill("stagger")
  await expect(tile(root, "Timing").locator(".knobs-card")).toBeVisible()
  // Its own state stays folded while the filter shows it (and sections() lists what shows).
  const shown = await page.evaluate(() => (window as any).__s.page.sections())
  expect(shown.map((x: any) => x.id)).toEqual(["Motion"])
  expect(shown[0].groups.find((g: any) => g.id === "Timing").folded).toBe(true)
  await page.keyboard.press("Escape")
  await expect(head(root, "Layout")).toHaveAttribute("aria-expanded", "false")
  await expect(tile(root, "Grid")).toBeHidden()
  await expect(tile(root, "Timing").locator(".knobs-card")).toBeHidden()
  expect(await saved()).toBe(kept)
})

test('by default folds go to the store\'s storage, as { sections, groups }; persist: "none" keeps none; context and search never write', async ({
  page,
}) => {
  const key = "knobs:sections-fixture:folds:v1"
  const saved = () => page.evaluate((key) => localStorage.getItem(key), key)
  const root = await mount(page, { tabFolds: true, mount: { sectionFolded: { Look: false } } })
  await head(root, "Look").click()
  await expect(head(root, "Look")).toHaveAttribute("aria-expanded", "false")
  expect(JSON.parse((await saved())!)).toEqual({ sections: { Look: true }, groups: {} })
  await tile(root, "Springs").locator(".knobs-group-head").click()
  expect(JSON.parse((await saved())!)).toEqual({
    sections: { Look: true },
    groups: { Springs: true },
  })
  // Context and the filter leave it alone.
  const before = await saved()
  await page.evaluate(() =>
    (window as any).__s.page.foldSection("Motion", true, { remember: false }),
  )
  await page.evaluate(() => (window as any).__s.page.reveal({ section: "Look" }))
  await page.getByRole("slider", { name: "columns" }).focus()
  await page.keyboard.press("/")
  await page.keyboard.type("hue")
  await page.keyboard.press("Escape")
  expect(await saved()).toBe(before)
  // A reload brings them back.
  const again = await mount(page, {
    tabFolds: true,
    keep: true,
    mount: { sectionFolded: { Look: false } },
  })
  await expect(head(again, "Look")).toHaveAttribute("aria-expanded", "false")
  await expect(tile(again, "Springs")).toHaveAttribute("data-folded", "")
  // A store that persists nothing keeps no folds either.
  await page.evaluate(() => localStorage.clear())
  const none = {
    tabFolds: true,
    keep: true,
    store: { persist: "none" },
    mount: { sectionFolded: { Look: false } },
  }
  let r = await mount(page, none)
  await head(r, "Look").click()
  expect(await saved()).toBe(null)
  r = await mount(page, none)
  await expect(head(r, "Look")).toHaveAttribute("aria-expanded", "true")
})

test("a remote store with storage: null and foldStorage remembers folds across a remount, and writes no value keys", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/tune.html?classic&dom")
  await page.waitForFunction(() => (window as any).__knobs)
  await page.evaluate(() => {
    ;(window as any).__tune.page.dispose()
    localStorage.clear()
    sessionStorage.clear()
  })
  const mountRemote = () =>
    page.evaluate(() => {
      const { knobs: k, mountPage } = (window as any).__knobs
      ;(window as any).__r?.page.dispose()
      const d = (key: string, group: string, section: string, extra = {}) => ({
        key,
        label: key,
        kind: "number",
        default: 10,
        min: 0,
        max: 100,
        step: 1,
        group,
        section,
        ...extra,
      })
      const remote = k.createRemoteControls(
        "phone-folds",
        [
          d("rowHeight", "Rows", "Drawer", { sectionFolded: true }),
          d("edge", "Edge", "Drawer", { folded: true }),
          d("fade", "Arrivals", "Transcript", { folded: false }),
        ],
        { storage: null, values: { rowHeight: 12 } },
      )
      const app = document.querySelector<HTMLElement>("#app")!
      app.replaceChildren()
      const p = mountPage(remote, app, { title: "Phone", foldStorage: localStorage })
      ;(window as any).__r = { remote, page: p }
    })
  await mountRemote()
  const root = page.getByRole("region", { name: "Phone controls" })
  const drawer = root.locator('.knobs-section-head[data-section="Drawer"]')
  await expect(drawer).toHaveAttribute("aria-expanded", "false")
  await drawer.click()
  await root.locator('.knobs-tile[data-group="Arrivals"] .knobs-group-head').click()
  await page.evaluate(() => (window as any).__r.remote.set({ fade: 40 }))
  await expect(drawer).toHaveAttribute("aria-expanded", "true")

  await mountRemote()
  await expect(drawer).toHaveAttribute("aria-expanded", "true")
  await expect(root.locator('.knobs-tile[data-group="Arrivals"]')).toHaveAttribute(
    "data-folded",
    "",
  )
  // Folds only: the phone's values (and a value set here) are nowhere in storage.
  expect(await page.evaluate(() => (window as any).__r.remote.get().fade)).toBe(10)
  const stored = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.keys(sessionStorage).filter((k) => k.includes("phone-folds")),
  }))
  expect(stored.local).toEqual({
    "knobs:phone-folds:folds:v1": JSON.stringify({
      sections: { Drawer: false },
      groups: { Arrivals: true },
    }),
  })
  expect(stored.session).toEqual([])
})

test("onSections says what each fold came from: user, code, search and restore; other changes say null", async ({
  page,
}) => {
  const root = await mount(page, { mount: { sectionFolded: { Look: false, Layout: true } } })
  await page.evaluate(() => {
    const s = (window as any).__s
    s.heard = []
    s.page.onSections((_: unknown, source: unknown) => s.heard.push(source))
  })
  const heard = () => page.evaluate(() => (window as any).__s.heard)
  await expect.poll(heard).toEqual([null])
  await head(root, "Look").click()
  await expect.poll(heard).toEqual([null, "user"])
  await head(root, "Look").focus()
  await page.keyboard.press("Enter")
  await expect.poll(heard).toEqual([null, "user", "user"])
  await page.evaluate(() => (window as any).__s.page.foldSection("Look", true))
  await expect.poll(heard).toEqual([null, "user", "user", "code"])
  await page.evaluate(() => (window as any).__s.page.reveal({ group: "Grid" }))
  await expect.poll(async () => (await heard()).at(-1)).toBe("code")
  await page.evaluate(() => (window as any).__s.controls.set({ hue: 70 }))
  await expect.poll(async () => (await heard()).at(-1)).toBe(null)
  const n = (await heard()).length
  await page.getByRole("slider", { name: "open" }).focus()
  await page.keyboard.press("/")
  await page.keyboard.type("gutter")
  await expect.poll(async () => (await heard()).slice(n)).toContain("search")
  await page.keyboard.press("Escape")
  await expect.poll(async () => (await heard()).at(-1)).toBe("restore")
})
