// OpenCode Desktop's components lab in miniature (examples/components-lab.html): the controls pane
// is one surface, its buttons sit in the pane's header, many presets are a list, the toolbar is one
// row of icons, a tree row's detail gives way to its label, and a story without args says so.
import { expect, test, type Page } from "@playwright/test"

const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on(
    "console",
    (m) =>
      m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()),
  )
  return errors
}

test("the controls pane is one surface: no card, no header band, buttons in the pane's header", async ({
  page,
}) => {
  const errors = errorsOf(page)
  await page.goto("/components-lab.html")
  const pane = page.locator('[data-pane="inspector"]')
  const panel = pane.locator(".knobs-panel")
  await expect(panel.locator(".knobs-row").first()).toBeVisible()
  const look = await panel.evaluate((root) => {
    const bg = (el: Element) => getComputedStyle(el).backgroundColor
    // Transparent, however the browser writes it (`rgba(0, 0, 0, 0)`, `color(srgb 0 0 0 / 0)`).
    const clear = (c: string) => c === "transparent" || /(?:,\s*|\/\s*)0\)$/.test(c)
    const header = root.querySelector<HTMLElement>(":scope > header")!
    const card = root.querySelector(".knobs-card")
    return {
      panel: clear(bg(root)),
      card: !card || clear(bg(card)),
      padding: getComputedStyle(root).paddingLeft,
      headerShown: !header.hidden && header.getBoundingClientRect().height > 0,
    }
  })
  expect(look).toEqual({ panel: true, card: true, padding: "0px", headerShown: false })
  // Undo, Redo and Reset sit in the pane's header, before its collapse button.
  const head = pane.locator(".knobs-pane-head")
  await expect(head.locator(".knobs-head-actions[data-docked]")).toHaveCount(1)
  // The presets begin right under the pane's header.
  const headBottom = (await head.boundingBox())!.y + (await head.boundingBox())!.height
  const presetsTop = (await panel.locator(".knobs-presets").first().boundingBox())!.y
  expect(presetsTop - headBottom).toBeLessThan(12)
  expect(errors).toEqual([])
})

test("seven states at 300px are a list, and the toolbar is one row of icons", async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto("/components-lab.html")
  const panel = page.locator('[data-pane="inspector"] .knobs-panel')
  const states = panel.locator(".knobs-presets").first()
  await expect(states).toHaveAttribute("data-display", "list")
  const chips = states.locator(".knobs-preset-chip")
  await expect(chips).toHaveCount(7)
  const lefts = await chips.evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().left)),
  )
  expect(new Set(lefts).size).toBe(1)
  const tools = panel.locator(".knobs-toolbar")
  await expect(tools).toHaveAttribute("data-icons", "")
  const tops = await tools
    .locator(".knobs-tool")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(tops.length).toBe(4)
  expect(new Set(tops).size).toBe(1)
  expect(errors).toEqual([])
})

test("a story without args says so, and a tree row's label keeps its room beside its detail", async ({
  page,
}) => {
  const errors = errorsOf(page)
  await page.goto("/components-lab.html?story=spinner.stories.tsx")
  await expect(page.locator('[data-pane="inspector"] .knobs-empty')).toHaveText(
    "This story has no controls",
  )
  const row = page.locator('.knobs-tree-row[aria-label="Connect Provider"]').first()
  const label = row.locator(".knobs-tree-label")
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  expect(errors).toEqual([])
})

test("a text field types into its story, one undo step a focus", async ({ page }) => {
  const errors = errorsOf(page)
  await page.goto("/components-lab.html")
  const field = page.locator('[data-pane="inspector"] .knobs-text')
  await field.click()
  await page.keyboard.type("Hello 12")
  await expect(page.locator(".story .caption")).toHaveText("Hello 12")
  await page.keyboard.press("Escape")
  await page.locator('[data-pane="inspector"] .knobs-pane-head button[aria-label="Undo"]').click()
  await expect(field).toHaveValue("")
  expect(errors).toEqual([])
})

test("the Motion group's presets sit at the top of its card and leave the state's chip lit", async ({
  page,
}) => {
  const errors = errorsOf(page)
  await page.goto("/components-lab.html")
  const panel = page.locator('[data-pane="inspector"] .knobs-panel')
  const states = panel.locator(".knobs-presets:not(.knobs-card > *)")
  const motion = panel.locator('.knobs-card[data-group="Motion"] > .knobs-presets')
  await expect(motion).toBeVisible()
  await expect(motion).toHaveAttribute("aria-label", "Motion presets")
  // First in its card, above the rows.
  expect(await motion.evaluate((el) => el === el.parentElement!.firstElementChild)).toBe(true)
  await expect(motion.locator(".knobs-preset-chip")).toHaveText([
    "Shipped",
    "Snappy",
    "Smooth",
    "Calm",
  ])
  await motion.locator(".knobs-preset-chip", { hasText: "Calm" }).click()
  await expect(motion.locator('.knobs-preset-chip[aria-checked="true"]')).toHaveText("Calm")
  await expect(panel.locator('[data-field="stagger"] [role="slider"]')).toHaveAttribute(
    "aria-valuenow",
    "0.1",
  )
  // The state keeps its chip: the Motion knobs belong to their own presets.
  await expect(states.locator('.knobs-preset-chip[aria-checked="true"]')).toHaveText("No activity")
  await expect(states.locator(".knobs-preset-chip[data-drifted]")).toHaveCount(0)
  await states.locator(".knobs-preset-chip", { hasText: "Live" }).click()
  await expect(motion.locator('.knobs-preset-chip[aria-checked="true"]')).toHaveText("Calm")
  // Focused, ← and → pick its presets.
  await motion.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(motion.locator('.knobs-preset-chip[aria-checked="true"]')).toHaveText("Smooth")
  expect(errors).toEqual([])
})
