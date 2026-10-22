import { expect, type Page, test } from "@playwright/test"

// examples/pinned.html: OpenCode Desktop's Motion workspace, a Global group pinned over the tabs.
const panel = (page: Page) => page.locator('[data-controls="opencode-motion"]')
const row = (page: Page, key: string) => panel(page).locator(`[data-field="${key}"]`)
const values = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).pinned.controls.get() })) as Promise<
    Record<string, unknown>
  >
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

  // Every frame of the change, the pinned card stays where it was.
  const tops = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>(".knobs-pinned .knobs-card")!
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (t) => t.textContent === "Experiments",
    )!
    const seen: number[] = []
    tab.click()
    for (let i = 0; i < 30; i++) {
      seen.push(card.getBoundingClientRect().top)
      await new Promise(requestAnimationFrame)
    }
    return seen
  })
  expect(new Set(tops.map((t) => Math.round(t * 10))).size).toBe(1)
  await still(page)
  expect(Math.round((await layout(page)).pinned!.top * 10)).toBe(Math.round(at.pinned!.top * 10))
  await expect(row(page, "hover")).toBeVisible()
  await expect(row(page, "speed")).toBeVisible()
  await page.screenshot({ path: "test-results/pinned-after.png" })
  expect(errors).toEqual([])
})

test("presets leave the pinned group alone; a tab they don't touch shows no strip", async ({
  page,
}) => {
  const errors = await open(page)
  const strip = panel(page).locator(".knobs-presets")
  await page.evaluate(() => (window as any).pinned.controls.set({ speed: 2, slow: true }))
  await strip.getByRole("radio", { name: "Snappy", exact: true }).click()
  expect(await values(page)).toMatchObject({
    speed: 2,
    slow: true,
    sidebars: { duration: 0.2, bounce: 0 },
    hover: { duration: 0.1, bounce: 0 },
  })
  // Off the default, the pinned keys don't drift the preset.
  await expect(strip).toHaveAttribute("data-active-preset", "p:snappy")
  await expect(strip.getByRole("radio", { name: "Snappy", exact: true })).not.toHaveAttribute(
    "data-drifted",
  )
  // Composer has no springs: no strip, not even the "+".
  await panel(page).getByRole("tab", { name: "Composer" }).click()
  await still(page)
  await expect(strip).toBeHidden()
  await expect(row(page, "sendIcon")).toBeVisible()
  await panel(page).getByRole("tab", { name: "Experiments" }).click()
  await still(page)
  await expect(strip).toBeVisible()
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
  // "Speed", "Slow motion" and "Send icon" (another tab) all match.
  await expect(row(page, "speed")).toBeVisible()
  await expect(row(page, "slow")).toBeVisible()
  await expect(row(page, "sendIcon")).toBeVisible()
  await panel(page).locator(".knobs-search input").fill("slow")
  await still(page)
  await expect(row(page, "slow")).toBeVisible()
  await expect(row(page, "speed")).toBeHidden()
  expect(errors).toEqual([])
})
