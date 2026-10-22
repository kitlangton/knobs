import { expect, type Page, test } from "@playwright/test"

// Folds a panel keeps across a remount (a reload), `subsectionFolded: true`, the modified dots on
// group and sub-heading headers, and `unfold(key)`. Each test builds its own store beside
// examples/cards.html's, with a pinned group, two tabs, scoped presets and sub-headings.
test.use({ colorScheme: "dark", deviceScaleFactor: 2, viewport: { width: 980, height: 720 } })

interface Mount {
  /** The store's storage: a port kept for the page (default), or none. */
  readonly storage?: "kept" | "none"
  readonly persist?: "none"
  readonly session?: boolean
  /** `"own"`: a port of its own; `null`: none. */
  readonly foldStorage?: "own" | null
  readonly subsectionFolded?: boolean | Record<string, boolean>
  readonly tab?: string
}

async function open(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/cards.html")
  await page.evaluate(() => {
    const w = window as any
    const { defineControls, knob, toggle, mountPanel, memoryStorage } = w.cards
    const ports = { kept: memoryStorage(), own: memoryStorage() }
    let panel: any
    let n = 0
    w.folds = {
      ports,
      get panel() {
        return panel
      },
      /** A fresh panel (as after a reload: the tab's session cleared) of a fresh store. */
      mount(o: Mount) {
        panel?.dispose()
        document.getElementById("folds")?.remove()
        sessionStorage.clear()
        const host = document.createElement("div")
        host.id = "folds"
        host.style.cssText = "position:fixed;left:12px;top:12px;width:300px"
        document.body.append(host)
        const controls = defineControls(
          "folds",
          {
            speed: knob(1, { min: 0, max: 4, step: 0.05, group: "Global", folded: false }),
            slow: toggle(false, { group: "Global" }),
            open: knob(0.3, {
              min: 0,
              max: 1,
              step: 0.05,
              group: "Sidebars",
              tab: "Sidebars",
              subsection: "Open",
              folded: false,
            }),
            close: knob(0.2, {
              min: 0,
              max: 1,
              step: 0.05,
              group: "Sidebars",
              subsection: "Close",
            }),
            glide: knob(0.14, {
              min: 0,
              max: 1,
              step: 0.01,
              group: "Hover",
              tab: "Experiments",
              subsection: "Glide",
              folded: true,
            }),
          },
          {
            enabled: true,
            storage: o.storage === "none" ? null : ports.kept,
            ...(o.persist ? { persist: o.persist } : {}),
            pinned: ["Global"],
            scopedPresets: { Sidebars: { snappy: { open: 0.2, close: 0.1 } } },
          },
        )
        panel = mountPanel(controls, host, {
          title: "Folds",
          toggleKey: false,
          renderer: "dom",
          tabs: ["Sidebars", "Experiments"],
          tab: o.tab ?? "Sidebars",
          ...(o.session !== undefined ? { session: o.session } : {}),
          ...(o.foldStorage === "own"
            ? { foldStorage: ports.own }
            : o.foldStorage === null
              ? { foldStorage: null }
              : {}),
          ...(o.subsectionFolded !== undefined ? { subsectionFolded: o.subsectionFolded } : {}),
        })
        w.folds.controls = controls
        n++
        return n
      },
    }
  })
  return errors
}

const mount = (page: Page, o: Mount = {}) =>
  page.evaluate((o) => (window as any).folds.mount(o), o as any)
const root = (page: Page) => page.locator("#folds")
const head = (page: Page, group: string) =>
  root(page).locator(`.knobs-group-head[data-group="${group}"]`)
const sub = (page: Page, name: string) =>
  root(page).locator(".knobs-subhead", { has: page.getByText(name, { exact: true }) })
const field = (page: Page, key: string) => root(page).locator(`[data-field="${key}"]`)
/** Who's folded: groups by header, sub-headings by name. */
const folded = (page: Page) =>
  root(page).evaluate((r) => ({
    groups: Object.fromEntries(
      [...r.querySelectorAll<HTMLElement>(".knobs-group-head[data-foldable]")].map((h) => [
        h.dataset.group,
        h.getAttribute("aria-expanded") === "false",
      ]),
    ),
    subs: Object.fromEntries(
      [...r.querySelectorAll<HTMLElement>(".knobs-subhead")].map((h) => [
        h.textContent,
        h.getAttribute("aria-expanded") === "false",
      ]),
    ),
  }))
const kept = (page: Page, port: "kept" | "own") =>
  page.evaluate((port) => {
    const raw = (window as any).folds.ports[port].getItem("knobs:folds:folds:v1")
    return raw ? JSON.parse(raw) : null
  }, port)

test("folds outlive a reload in the store's own storage, unless session or persist say not", async ({
  page,
}) => {
  const errors = await open(page)
  await mount(page)
  expect(await folded(page)).toEqual({
    groups: { Global: false, Sidebars: false, Hover: true },
    subs: { Open: false, Close: false, Glide: false },
  })
  await head(page, "Sidebars").click()
  await head(page, "Sidebars").click()
  await sub(page, "Open").click()
  await head(page, "Global").click()
  expect(await kept(page, "kept")).toMatchObject({
    groups: { Sidebars: false, Global: true },
    subsections: { "Sidebars\u0000Open": true },
  })
  await mount(page)
  expect(await folded(page)).toEqual({
    groups: { Global: true, Sidebars: false, Hover: true },
    subs: { Open: true, Close: false, Glide: false },
  })

  // `session: false` keeps folds to the panel: none read, none written.
  await mount(page, { session: false })
  expect((await folded(page)).groups.Global).toBe(false)
  await head(page, "Global").click()
  expect((await kept(page, "kept")).groups.Global).toBe(true)
  await head(page, "Global").click()
  expect((await kept(page, "kept")).groups.Global).toBe(true)

  // `persist: "none"` neither.
  await mount(page, { persist: "none" })
  expect((await folded(page)).groups.Global).toBe(false)
  expect(errors).toEqual([])
})

test("foldStorage keeps folds where it says, whatever session says; null keeps them to the tab", async ({
  page,
}) => {
  const errors = await open(page)
  await mount(page, { foldStorage: "own", session: false })
  await head(page, "Global").click()
  await sub(page, "Close").click()
  expect(await kept(page, "own")).toMatchObject({
    groups: { Global: true },
    subsections: { "Sidebars\u0000Close": true },
  })
  expect(await kept(page, "kept")).toBeNull()
  await mount(page, { foldStorage: "own", session: false })
  expect(await folded(page)).toEqual({
    groups: { Global: true, Sidebars: false, Hover: true },
    subs: { Open: false, Close: true, Glide: false },
  })
  // The store's storage is no stand-in for it.
  await mount(page)
  expect((await folded(page)).groups.Global).toBe(false)

  // null: nothing outlives the tab's session.
  await mount(page, { foldStorage: null })
  await head(page, "Sidebars").click()
  expect(await kept(page, "kept")).toBeNull()
  await mount(page, { foldStorage: null })
  expect((await folded(page)).groups.Sidebars).toBe(false)
  expect(errors).toEqual([])
})

test("subsectionFolded: true folds every sub-heading, until the user opens one", async ({
  page,
}) => {
  const errors = await open(page)
  await mount(page, { subsectionFolded: true })
  expect((await folded(page)).subs).toEqual({ Open: true, Close: true, Glide: true })
  await expect(field(page, "open")).toBeHidden()
  await sub(page, "Open").click()
  await expect(field(page, "open")).toBeVisible()
  await mount(page, { subsectionFolded: true })
  expect((await folded(page)).subs).toEqual({ Open: false, Close: true, Glide: true })
  // By name, as before.
  await mount(page, { storage: "none", subsectionFolded: { Close: true } })
  expect((await folded(page)).subs).toEqual({ Open: false, Close: true, Glide: false })
  expect(errors).toEqual([])
})

test("group and sub-heading headers carry a dot while a row inside differs from its base", async ({
  page,
}) => {
  const errors = await open(page)
  await mount(page, { storage: "none" })
  const set = (values: Record<string, unknown>) =>
    page.evaluate((v) => (window as any).folds.controls.set(v), values)
  await expect(head(page, "Sidebars")).not.toHaveAttribute("data-modified")
  await set({ open: 0.5 })
  await expect(head(page, "Sidebars")).toHaveAttribute("data-modified", "")
  await expect(sub(page, "Open")).toHaveAttribute("data-modified", "")
  await expect(sub(page, "Close")).not.toHaveAttribute("data-modified")
  // The dot is a row's: the same colour, size and opacity.
  await set({ slow: true })
  const dot = (sel: string) =>
    root(page).evaluate((r, sel) => {
      const cs = getComputedStyle(r.querySelector(sel)!, "::after")
      return { bg: cs.backgroundColor, w: cs.width, opacity: cs.opacity }
    }, sel)
  const row = '.knobs-row[data-field="slow"]>span:first-child'
  await expect.poll(() => dot(row)).toMatchObject({ opacity: "0.95" })
  await expect
    .poll(() => dot('.knobs-group-head[data-group="Sidebars"] .knobs-group-label'))
    .toEqual(await dot(row))
  await expect
    .poll(() => dot(".knobs-subhead[data-modified] .knobs-subhead-label"))
    .toEqual(await dot(row))
  await set({ slow: false })

  // A scoped preset is the base: its values mark nothing, a move away from them does.
  await page.evaluate(() => (window as any).folds.controls.preset("snappy", { scope: "Sidebars" }))
  await expect(head(page, "Sidebars")).not.toHaveAttribute("data-modified")
  await expect(sub(page, "Open")).not.toHaveAttribute("data-modified")
  await set({ close: 0.6 })
  await expect(sub(page, "Close")).toHaveAttribute("data-modified", "")
  await expect(sub(page, "Open")).not.toHaveAttribute("data-modified")

  // Pinned groups too.
  await set({ speed: 2 })
  await expect(head(page, "Global")).toHaveAttribute("data-modified", "")
  await set({ speed: 1 })
  await expect(head(page, "Global")).not.toHaveAttribute("data-modified")
  expect(errors).toEqual([])
})

test("a folded card's dot and summary share its header without crowding", async ({ page }) => {
  const errors = await open(page)
  await mount(page, { storage: "none", tab: "Experiments" })
  await page.evaluate(() => (window as any).folds.controls.set({ glide: 0.4 }))
  await expect(head(page, "Hover")).toHaveAttribute("data-modified", "")
  await expect(head(page, "Hover").locator(".knobs-group-summary")).toBeVisible()
  for (const width of [300, 150]) {
    await page.evaluate((w) => (document.getElementById("folds")!.style.width = `${w}px`), width)
    const box = await head(page, "Hover").evaluate((h) => {
      const label = h.querySelector(".knobs-group-label")!
      const summary = h.querySelector(".knobs-group-summary")!.getBoundingClientRect()
      const l = label.getBoundingClientRect()
      const dot = getComputedStyle(label, "::after")
      // The dot sits at the label's end, inside its box (its kept room), clear of the summary.
      return {
        clear: l.right <= summary.left + 0.5,
        inside: dot.position === "absolute" && dot.right === "0px",
        roomy: parseFloat(getComputedStyle(label).paddingRight) >= 9,
      }
    })
    expect(box).toEqual({ clear: true, inside: true, roomy: true })
  }
  expect(errors).toEqual([])
})

test("unfold(key) opens a field's group and sub-heading, on its tab, pinned too", async ({
  page,
}) => {
  const errors = await open(page)
  await mount(page, { subsectionFolded: true })
  await head(page, "Global").click()
  const before = await kept(page, "kept")
  expect(before.groups.Global).toBe(true)

  // On the other tab, in a folded card, under a folded sub-heading.
  await page.evaluate(() => (window as any).folds.panel.unfold("glide"))
  expect(await page.evaluate(() => (window as any).folds.panel.tab())).toBe("Experiments")
  await expect(field(page, "glide")).toBeVisible()
  expect(await folded(page)).toMatchObject({ groups: { Hover: false }, subs: { Glide: false } })

  // A pinned group.
  await page.evaluate(() => (window as any).folds.panel.unfold("speed"))
  await expect(field(page, "speed")).toBeVisible()
  expect((await folded(page)).groups.Global).toBe(false)

  // What's remembered stays as the user left it.
  expect(await kept(page, "kept")).toEqual(before)
  expect(errors).toEqual([])
})
