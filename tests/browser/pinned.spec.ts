import { expect, type Page, test } from "@playwright/test"

// examples/pinned.html: OpenCode Desktop's Motion workspace, a Global group pinned over the tabs,
// presets that belong to the Sidebars tab, in Desktop's container and dark theme.
test.use({ colorScheme: "dark", deviceScaleFactor: 2 })

const panel = (page: Page) => page.locator('[data-controls="opencode-motion"]')
const row = (page: Page, key: string) => panel(page).locator(`[data-field="${key}"]`)
const strip = (page: Page) => panel(page).locator(".knobs-presets")
const values = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).pinned.controls.get() })) as Promise<
    Record<string, unknown>
  >
const out = (name: string) => `${process.env.STILLS ?? "test-results/stills"}/${name}`
/** What's still moving: running animations, and nodes a tab change or a reveal is carrying. */
const moving = (page: Page) =>
  page.evaluate(() => [
    ...document
      .getAnimations()
      // Scroll-driven ones (the header's frost) run for as long as the page does.
      .filter(
        (a) =>
          a.playState === "running" &&
          a.timeline instanceof DocumentTimeline &&
          a.effect?.getTiming().iterations !== Infinity,
      )
      .map((a) => `animation ${(a as CSSAnimation).animationName ?? a.constructor.name}`),
    ...[...document.querySelectorAll<HTMLElement>("[data-tab-opacity],[data-presence]")].map(
      (n) => `${n.tagName.toLowerCase()}.${n.className} presence=${n.dataset.presence ?? ""}`,
    ),
  ])
/** Waits out running transitions and reveals, however busy the machine. */
const still = (page: Page) => expect.poll(() => moving(page), { timeout: 10_000 }).toEqual([])
const tab = async (page: Page, name: string) => {
  await panel(page).getByRole("tab", { name }).click()
  await still(page)
}

async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto(`/pinned.html${query}`)
  await expect(row(page, "speed")).toBeVisible()
  await still(page)
  return errors
}

const layout = (page: Page) =>
  panel(page).evaluate((root) => {
    const box = (sel: string) => {
      const el = root.querySelector<HTMLElement>(sel)
      if (!el || el.closest("[hidden]")) return null
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }
    return {
      headers: root.querySelectorAll("header").length,
      panels: document.querySelectorAll(".knobs-panel").length,
      pinned: box(".knobs-pinned .knobs-card"),
      tabs: box(".knobs-tabs"),
      presets: box(".knobs-presets"),
      body: box(".knobs-pinned ~ div:not(.knobs-tabs) .knobs-card"),
    }
  })

test("one header, the pinned card over the tabs, still through a tab change", async ({ page }) => {
  const errors = await open(page)
  const at = await layout(page)
  expect(at.headers).toBe(1)
  expect(at.panels).toBe(1)
  expect(at.pinned!.bottom).toBeLessThanOrEqual(at.tabs!.top)
  expect(at.tabs!.bottom).toBeLessThanOrEqual(at.presets!.top)
  expect(at.presets!.bottom).toBeLessThanOrEqual(at.body!.top)
  await expect(row(page, "sidebars")).toBeVisible()

  // Every frame of the change, the pinned card stays where it was in the panel. (Desktop's
  // container is anchored at the bottom, so the panel's own top follows its height.)
  const tops = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>(".knobs-pinned .knobs-card")!
    const root = card.closest<HTMLElement>(".knobs-panel")!
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (t) => t.textContent === "Experiments",
    )!
    const seen: number[] = []
    tab.click()
    for (let i = 0; i < 30; i++) {
      seen.push(card.getBoundingClientRect().top - root.getBoundingClientRect().top)
      await new Promise(requestAnimationFrame)
    }
    return seen
  })
  expect(new Set(tops.map((t) => Math.round(t * 10))).size).toBe(1)
  await still(page)
  const inPanel = async () => {
    const l = await layout(page)
    const p = (await panel(page).boundingBox())!
    return Math.round((l.pinned!.top - p.y) * 10)
  }
  expect(await inPanel()).toBe(Math.round(tops[0]! * 10))
  await expect(row(page, "hover")).toBeVisible()
  await expect(row(page, "speed")).toBeVisible()
  expect(errors).toEqual([])
})

test("the presets are Sidebars' own: its strip moves only its springs", async ({ page }) => {
  const errors = await open(page)
  await expect(strip(page)).toBeVisible()
  await page.evaluate(() =>
    (window as any).pinned.controls.set({
      speed: 2,
      slow: true,
      hover: { duration: 0.5, bounce: 0 },
      spinner: "soft",
      stopSize: 12,
    }),
  )
  const before = await values(page)
  await strip(page).getByRole("radio", { name: "Calm", exact: true }).click()
  const after = await values(page)
  expect(after).toMatchObject({
    sidebars: { duration: 0.45, bounce: 0 },
    panel: { duration: 0.5, bounce: 0 },
  })
  // Global and every Experiments value stay as they were.
  for (const key of ["speed", "slow", "avatars", "spinner", "hoverStyle", "hover", "stopSize"])
    expect(after[key], key).toEqual(before[key])
  await expect(strip(page)).toHaveAttribute("data-active-preset", "p:calm")
  // Experiments' values are their own, so they don't mark Calm modified.
  await expect(strip(page).getByRole("radio", { name: "Calm", exact: true })).not.toHaveAttribute(
    "data-drifted",
  )
  // One undo puts the springs and the strip back together.
  await page.evaluate(() => (window as any).pinned.controls.undo())
  await expect(strip(page)).toHaveAttribute("data-active-preset", "p:default")
  expect((await values(page)).sidebars).toEqual({ duration: 0.3, bounce: 0 })
  await strip(page).getByRole("radio", { name: "Calm", exact: true }).click()

  // Experiments has no presets: no strip, not even the "+".
  await tab(page, "Experiments")
  await expect(strip(page)).toBeHidden()
  await expect(row(page, "spinner")).toBeVisible()
  await page.mouse.move(0, 0)
  await page.screenshot({ path: out("experiments.png"), clip: await panelClip(page) })
  await tab(page, "Sidebars")
  await expect(strip(page)).toBeVisible()
  await expect(strip(page)).toHaveAttribute("data-active-preset", "p:calm")
  await page.mouse.move(0, 0)
  await still(page)
  await page.screenshot({ path: out("sidebars.png"), clip: await panelClip(page) })
  expect(errors).toEqual([])
})

test("a press on a row's label selects that row; one on a heading selects its group", async ({
  page,
}) => {
  const errors = await open(page)
  await tab(page, "Experiments")
  const where = () =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement
      return {
        row: a.closest<HTMLElement>("[data-field]")?.dataset.field ?? null,
        card: a.classList.contains("knobs-card"),
        washed: [...document.querySelectorAll<HTMLElement>("[data-k-scope]")].map(
          (c) => c.dataset.group ?? "?",
        ),
      }
    })
  const label = row(page, "spinner").locator("span").first()
  await label.click()
  await still(page)
  expect(await where()).toEqual({ row: "spinner", card: false, washed: [] })
  // Its lens marks the row alone.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const lens = document.querySelector<HTMLElement>(".knobs-lens")
        const r = document.querySelector('[data-field="spinner"]')!.getBoundingClientRect()
        if (!lens || Number(lens.style.opacity || 0) < 0.5) return null
        const l = lens.getBoundingClientRect()
        return Math.abs(l.height - r.height) < 12
      }),
    )
    .toBe(true)
  await page.screenshot({ path: out("row-selected.png"), clip: await panelClip(page) })
  // Down from the row goes to the next row, as from a row focused by keys.
  await page.keyboard.press("ArrowDown")
  expect((await where()).row).toBe("hoverStyle")
  await panel(page)
    .locator(".knobs-group-head", { hasText: /experiments/i })
    .click()
  await still(page)
  expect(await where()).toEqual({ row: null, card: true, washed: ["Experiments"] })
  expect(errors).toEqual([])
})

test("the header is the title and its buttons: no scope line", async ({ page }) => {
  const errors = await open(page)
  await tab(page, "Experiments")
  await row(page, "spinner").locator("span").first().click()
  await page.keyboard.press("ArrowDown")
  await still(page)
  await expect(panel(page).locator(".knobs-crumbs")).toHaveCount(0)
  await expect(panel(page).locator("header > strong")).toHaveText("Knobs")
  expect(errors).toEqual([])
})

/** Luminance down a column through the panel's top edge, from 8 px above it to 8 px inside. */
async function edgeRuns(page: Page) {
  const box = (await panel(page).boundingBox())!
  const shot = await page.screenshot({
    clip: { x: box.x + box.width / 2 - 1, y: box.y - 8, width: 2, height: 16 },
  })
  return page.evaluate(async (png) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext("2d")!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, 1, img.height).data
    const lum: number[] = []
    for (let y = 0; y < img.height; y++) lum.push(d[y * 4]! + d[y * 4 + 1]! + d[y * 4 + 2]!)
    const page = lum[0]!
    const inside = lum.at(-1)!
    // Runs of pixels that are neither the page nor the panel's fill: each is an edge.
    const runs: number[][] = []
    lum.forEach((v, y) => {
      const edge = Math.abs(v - page) > 6 && Math.abs(v - inside) > 6
      if (!edge) return
      const last = runs.at(-1)
      if (last && last.at(-1) === y - 1) last.push(y)
      else runs.push([y])
    })
    return { runs: runs.length, lum }
  }, shot.toString("base64"))
}

const panelClip = async (page: Page) => {
  const b = (await panel(page).boundingBox())!
  return { x: b.x - 8, y: b.y - 8, width: b.width + 16, height: Math.min(b.height + 16, 720) }
}

test("the panel has one edge, at the top too", async ({ page }) => {
  const errors = await open(page)
  await page.mouse.move(0, 0)
  const shadow = await panel(page).evaluate((p) => getComputedStyle(p).boxShadow)
  expect(shadow).not.toContain("inset")
  const after = await edgeRuns(page)
  expect(after.runs, JSON.stringify(after.lum)).toBe(1)
  const box = (await panel(page).boundingBox())!
  const corner = { x: box.x - 6, y: box.y - 6, width: 40, height: 28 }
  await page.screenshot({ path: out("edge-after.png"), clip: corner })
  // The edge as it was: a line of light inside the 1px border, a second edge under the first.
  await page.addStyleTag({
    content: `.knobs-panel.knobs-inline{box-shadow:0 0 0 var(--k-rim-width) var(--ka-edge),inset 0 var(--k-rim-width) 0 var(--_k-rim)!important}`,
  })
  await page.screenshot({ path: out("edge-before.png"), clip: corner })
  expect((await edgeRuns(page)).runs).toBe(2)
  expect(errors).toEqual([])
})

test("keys walk the pinned rows first, then the tabs, the presets and the tab's rows", async ({
  page,
}) => {
  const errors = await open(page)
  const where = () =>
    page.evaluate(() => {
      const a = document.activeElement as HTMLElement
      if (a.closest(".knobs-tabs")) return "tabs"
      if (a.closest(".knobs-presets")) return "presets"
      return a.closest<HTMLElement>("[data-field]")?.dataset.field ?? a.className
    })
  await row(page, "speed").locator(".knobs-track").focus()
  const walk = [await where()]
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown")
    walk.push(await where())
  }
  expect(walk.slice(0, 5)).toEqual(["speed", "slow", "tabs", "presets", "sidebars"])
  expect(errors).toEqual([])
})

test("search reaches the pinned rows with the rest", async ({ page }) => {
  const errors = await open(page, "?search")
  await panel(page).locator(".knobs-search input").fill("s")
  await still(page)
  // "Speed", "Slow motion" and "Activity spinner" (another tab) all match.
  await expect(row(page, "speed")).toBeVisible()
  await expect(row(page, "slow")).toBeVisible()
  await expect(row(page, "spinner")).toBeVisible()
  await panel(page).locator(".knobs-search input").fill("slow")
  await still(page)
  await expect(row(page, "slow")).toBeVisible()
  await expect(row(page, "speed")).toBeHidden()
  expect(errors).toEqual([])
})
