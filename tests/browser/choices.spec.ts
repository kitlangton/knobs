import { expect, type Locator, type Page, test } from "@playwright/test"

const inline = (page: Page) => page.getByRole("region", { name: "Inline controls" })
const row = (scope: Locator, field: string) => scope.locator(`[data-field="${field}"]`)

/** The row's label and its control don't overlap, and the control stays inside the row. */
async function clear(rowEl: Locator) {
  const box = await rowEl.evaluate((r) => {
    const label = r.querySelector(":scope > span:first-child")!.getBoundingClientRect()
    const control = [...r.querySelectorAll<HTMLElement>(".knobs-seg, .knobs-select")]
      .find((n) => !n.hidden)!
      .getBoundingClientRect()
    const rr = r.getBoundingClientRect()
    const buttons = [...r.querySelectorAll<HTMLElement>(".knobs-seg:not([hidden]) button")].map(
      (b) => ({
        clipped: b.scrollWidth > b.clientWidth + 1,
        rect: b.getBoundingClientRect(),
      }),
    )
    return { label, control, rr, buttons }
  })
  expect(box.label.right).toBeLessThanOrEqual(box.control.left + 0.5)
  expect(box.control.right).toBeLessThanOrEqual(box.rr.right + 0.5)
  for (const b of box.buttons) expect(b.clipped).toBe(false)
  for (let i = 1; i < box.buttons.length; i++)
    expect(box.buttons[i]!.rect.left).toBeGreaterThanOrEqual(box.buttons[i - 1]!.rect.right - 0.5)
}

test("choices drop down a menu when there are many or they don't fit, in panels and page cards", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/choices.html")
  const panel = inline(page)
  await expect(row(panel, "rowFont")).toBeVisible()
  // 8 options → menu; 4 long labels in 300 px → menu; 3 single letters → segments.
  await expect(row(panel, "rowFont")).toHaveAttribute("data-display", "menu")
  await expect(row(panel, "scene")).toHaveAttribute("data-display", "menu")
  await expect(row(panel, "size")).toHaveAttribute("data-display", "segmented")
  for (const f of ["rowFont", "scene", "size", "mode"]) await clear(row(panel, f))
  await expect(panel.getByRole("button", { name: "Row Font" })).toHaveText("body")
  // Overrides.
  await expect(row(panel, "forced")).toHaveAttribute("data-display", "segmented")
  await expect(row(panel, "pick")).toHaveAttribute("data-display", "menu")

  // The page card: six long labels in a ~300 px card → menu, no overlap.
  const tile = page.locator(".knobs-live", { hasText: "Transcript Replays" })
  const scene = tile.locator(".knobs-row", { hasText: "Scene" })
  await expect(scene).toHaveAttribute("data-display", "menu")
  await clear(scene)
  await expect(tile.locator(".knobs-row", { hasText: "Speed" })).toHaveAttribute(
    "data-display",
    "segmented",
  )
  await expect(tile.locator(".knobs-row", { hasText: "Forced" })).toHaveAttribute(
    "data-display",
    "menu",
  )
  // The page's own 8-option descriptor.
  await expect(page.locator('.knobs-page [data-field="rowFont"]')).toHaveAttribute(
    "data-display",
    "menu",
  )
  expect(errors).toEqual([])
})

test("a choice switches both ways as its width changes", async ({ page }) => {
  await page.goto("/choices.html")
  const mode = row(inline(page), "mode")
  await expect(mode).toBeVisible()
  const width = (w: number) =>
    page.locator("#inline").evaluate((el, w) => ((el as HTMLElement).style.width = `${w}px`), w)
  await width(640)
  await expect(mode).toHaveAttribute("data-display", "segmented")
  await clear(mode)
  await width(250)
  await expect(mode).toHaveAttribute("data-display", "menu")
  await clear(mode)
  await width(640)
  await expect(mode).toHaveAttribute("data-display", "segmented")
  await clear(mode)
  // Focus follows the switch.
  await mode.locator(".knobs-seg").focus()
  await width(250)
  await expect(inline(page).getByRole("button", { name: "Mode" })).toBeFocused()
})

test("menu rows: ←/→ step without opening; Enter opens; ↑↓, letters, Enter and Esc inside", async ({
  page,
}) => {
  await page.goto("/choices.html")
  const button = inline(page).getByRole("button", { name: "Row Font" })
  await button.focus()
  await page.keyboard.press("ArrowRight")
  await expect(button).toHaveText("headline")
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await expect(button).toHaveText("callout")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await page.keyboard.press("Enter")
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.locator("[data-active]")).toHaveText("callout")
  await page.keyboard.press("ArrowDown")
  await expect(menu.locator("[data-active]")).toHaveText("body")
  await page.keyboard.press("t")
  await expect(menu.locator("[data-active]")).toHaveText("title3")
  await page.keyboard.press("Enter")
  await expect(menu).toHaveCount(0)
  await expect(button).toHaveText("title3")
  await expect(button).toBeFocused()
  await page.keyboard.press(" ")
  await expect(page.getByRole("menu")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(button).toBeFocused()
  expect(await page.evaluate(() => (window as any).__choices.sets)).toEqual([
    ["rowFont", "headline"],
    ["rowFont", "body"],
    ["rowFont", "callout"],
    ["rowFont", "title3"],
  ])
  // The page card's menu steps the same way.
  const scene = page
    .locator(".knobs-live .knobs-row", { hasText: "Scene" })
    .getByRole("button", { name: "Scene" })
  await scene.focus()
  await page.keyboard.press("ArrowRight")
  await expect(scene).toHaveText("Streaming Markdown")
  expect(await page.evaluate(() => (window as any).__choices.chosen)).toEqual([
    "Streaming Markdown",
  ])
  // Disposing a panel while a choice menu is open closes and removes the menu too.
  await button.click()
  await expect(page.getByRole("menu")).toBeVisible()
  await page.evaluate(() => (window as any).__choices.inlinePanel.dispose())
  await expect(page.getByRole("menu")).toHaveCount(0)
})

test("menu rows draw on the GPU overlay", async ({ page }) => {
  await page.goto("/choices.html?gpu")
  const panel = page.locator('[data-controls="choices"]')
  await expect(panel).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await panel.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  await expect(row(inline(page), "rowFont")).toHaveAttribute("data-display", "menu")
  // The DOM text is transparent; the canvas draws it.
  const ink = await row(inline(page), "rowFont")
    .locator(".knobs-select-value")
    .evaluate((el) => getComputedStyle(el).color)
  expect(ink).toBe("rgba(0, 0, 0, 0)")
  await page.waitForFunction(() => (window as any).__knobsGpu?.lastInstanceCount > 0)
})
