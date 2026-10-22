import { expect, type Page, test } from "@playwright/test"

// Overlays from knobs/ui in the Lab (examples/lab-overlays.ts): the ⌘K palette, the games menu in a
// popover, tooltips on the top bar and pane actions, and a confirm before deleting from the outliner.
async function open(page: Page, query = "?paused") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  // The Lab look (labPreset): these tests measure its rows and colours.
  await page.goto(`/lab.html${query}${query ? "&" : "?"}look=lab`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator('[data-controls="lab-station"] [data-field="intensity"]')).toBeVisible()
  return errors
}
const palette = (page: Page) => page.getByRole("dialog", { name: "Commands" })
const input = (page: Page) => palette(page).getByRole("combobox")
const active = (page: Page) =>
  palette(page).locator(".knobs-palette-item[data-active] .knobs-palette-label")
const opacity = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => Number(getComputedStyle(el).opacity))

test("palette: ⌘K opens it over everything, searching lights up matches, Enter runs, Esc closes", async ({
  page,
}) => {
  const errors = await open(page)
  await page.mouse.move(700, 400)
  await page.keyboard.press("ControlOrMeta+k")
  await expect(palette(page)).toBeVisible()
  // Summoned by a key, it only fades: no blur on the way in.
  expect(await palette(page).evaluate((el) => el.style.filter)).toBe("")
  await expect(input(page)).toBeFocused()
  // Settles fully in: no blur or scale left over.
  await expect.poll(() => opacity(page, ".knobs-palette")).toBe(1)
  await expect
    .poll(() => palette(page).evaluate((el) => [el.style.transform, el.style.filter]))
    .toEqual(["", ""])
  // No query: sections, in order.
  await expect(palette(page).locator(".knobs-palette-section").first()).toHaveText("Live")
  await expect(active(page)).toHaveText("Resume live feed")
  // Disabled commands are passed over.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(active(page)).toHaveText("Clear event log")
  await page.keyboard.press("ArrowDown")
  await expect(active(page)).toHaveText("Find in scene")
  await page.keyboard.press("ArrowUp")
  await expect(active(page)).toHaveText("Clear event log")
  // Searching: ranked, the matched letters marked, sections as tags.
  await page.keyboard.type("drop size")
  await expect(active(page)).toHaveText("Drop size")
  await expect(active(page).locator("mark")).toHaveText(["Drop", "size"])
  await expect(
    palette(page).locator(".knobs-palette-item[data-active] .knobs-palette-tag"),
  ).toHaveText("Weather · Precipitation")
  await page.keyboard.type("zzz")
  await expect(palette(page).locator(".knobs-palette-empty")).toHaveText("No matching commands")
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace")
  // Enter runs it: a field command shows its row and focuses it.
  await page.keyboard.press("Enter")
  await expect(palette(page)).toHaveCount(0)
  await expect(
    page.locator('[data-controls="lab-station"] [data-field="size"] [role="slider"]'),
  ).toBeFocused()
  // Recents come first next time.
  await page.keyboard.press("ControlOrMeta+k")
  await expect(palette(page).locator(".knobs-palette-section").first()).toHaveText("Recent")
  await expect(active(page)).toHaveText("Drop size")
  // Esc closes and focus goes back where it was.
  await page.keyboard.press("Escape")
  await expect(palette(page)).toHaveCount(0)
  await expect(
    page.locator('[data-controls="lab-station"] [data-field="size"] [role="slider"]'),
  ).toBeFocused()
  expect(errors).toEqual([])
})

test("palette: commands from the stores and the workspace run, and their messages toast", async ({
  page,
}) => {
  await open(page)
  const run = async (query: string) => {
    await page.keyboard.press("ControlOrMeta+k")
    await input(page).fill(query)
    await page.keyboard.press("Enter")
    await expect(palette(page)).toHaveCount(0)
  }
  await run("resume live")
  expect(await page.evaluate(() => (window as any).__live.running)).toBe(true)
  await run("pause live")
  expect(await page.evaluate(() => (window as any).__live.running)).toBe(false)
  await run("invert look")
  expect(await page.evaluate(() => (window as any).__lab.inspector.get().invertY)).toBe(true)
  await run("light style area")
  expect(await page.evaluate(() => (window as any).__lab.details.get().light)).toBe("Area")
  await run("clear event log")
  await expect(page.getByRole("status").filter({ hasText: "Cleared the event log" })).toBeVisible()
  await run("hide dock")
  await expect
    .poll(() => page.evaluate(() => (window as any).__workspace.center.pane("dock").collapsed))
    .toBe(true)
  // The search field in the top bar opens it too.
  await page.locator("#search").click()
  await expect(palette(page)).toBeVisible()
  await expect(input(page)).toBeFocused()
  // A click outside closes it.
  await page.mouse.click(200, 700)
  await expect(palette(page)).toHaveCount(0)
})

test("palette: closing mid-entrance turns it around, and it's gone once out", async ({ page }) => {
  await open(page)
  await page.keyboard.press("ControlOrMeta+k")
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.locator(".knobs-palette")).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+k")
  await expect(palette(page)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator(".knobs-palette")).toHaveCount(0)
})

test("popover: the games menu opens under its button, in view, takes focus and gives it back", async ({
  page,
}) => {
  await open(page)
  const games = page.getByRole("button", { name: "All games ▾" })
  await games.click()
  const menu = page.getByRole("menu", { name: "Games" })
  await expect(menu).toBeVisible()
  await expect(games).toHaveAttribute("aria-expanded", "true")
  await expect(menu.getByRole("menuitemradio").first()).toBeFocused()
  await expect.poll(() => opacity(page, ".knobs-popover-layer")).toBe(1)
  const b = (await games.boundingBox())!
  const m = (await menu.boundingBox())!
  const vw = page.viewportSize()!.width
  expect(m.y).toBeGreaterThanOrEqual(b.y + b.height)
  expect(m.x + m.width).toBeLessThanOrEqual(vw - 8 + 0.5)
  expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(10)
  expect(await menu.getAttribute("data-placement")).toBe("bottom-end")
  // Keys move through it; Esc closes it and focus returns to the button.
  await page.keyboard.press("ArrowDown")
  await expect(menu.getByRole("menuitemradio", { name: "Outbreak" })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(games).toBeFocused()
  await expect(games).toHaveAttribute("aria-expanded", "false")
  // A click outside closes it; a pick closes it with the choice made.
  await games.click()
  await expect(menu).toBeVisible()
  await page.mouse.click(700, 500)
  await expect(menu).toHaveCount(0)
  await games.click()
  await menu.getByRole("menuitemradio", { name: "Getaway" }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Getaway ▾" })).toBeVisible()
})

test("tooltip: shows after a pause, hands off at once to a neighbour, chips its shortcut, follows keyboard focus", async ({
  page,
}) => {
  await open(page)
  const tip = page.getByRole("tooltip")
  await page.locator("#pause").hover()
  await expect(tip).toBeVisible()
  await expect(tip.locator(".knobs-tooltip-text")).toHaveText("Resume the live feed")
  await expect(tip.locator(".knobs-kbd")).toHaveCount(2)
  await expect(page.locator("#pause")).toHaveAttribute("aria-describedby", /knobs-tooltip/)
  // Hand-off: the neighbour's tip is up straight away, with no entrance.
  await page.locator("#restart").hover()
  await expect(tip.locator(".knobs-tooltip-text")).toHaveText("Restart the station")
  expect(await opacity(page, ".knobs-tooltip")).toBe(1)
  // Pressed, it goes and stays gone while the pointer stays.
  await page.mouse.down()
  await expect.poll(() => opacity(page, ".knobs-tooltip")).toBe(0)
  await page.mouse.up()
  await page.waitForTimeout(700)
  expect(await opacity(page, ".knobs-tooltip")).toBe(0)
  // Away for a while, the next one waits again.
  await page.mouse.move(700, 500)
  await page.waitForTimeout(600)
  await page.locator('[data-action="collapse-all"]').hover()
  expect(await opacity(page, ".knobs-tooltip")).toBe(0)
  await expect(tip.locator(".knobs-tooltip-text")).toHaveText("Collapse all")
  await expect.poll(() => opacity(page, ".knobs-tooltip")).toBe(1)
  // Keyboard focus shows a tip; Esc hides it.
  await page.mouse.move(700, 500)
  await expect.poll(() => opacity(page, ".knobs-tooltip")).toBe(0)
  await page.locator('[data-action="expand-all"]').focus()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")
  await expect(tip.locator(".knobs-tooltip-text")).toHaveText("Expand all")
  await expect.poll(() => opacity(page, ".knobs-tooltip")).toBe(1)
  await page.keyboard.press("Escape")
  await expect.poll(() => opacity(page, ".knobs-tooltip")).toBe(0)
})

test("confirm: deleting from the outliner asks first; Cancel is focused, Tab stays inside, Esc cancels", async ({
  page,
}) => {
  await open(page)
  const barrier = page.locator(".knobs-tree-row", { hasText: "Barrier" })
  await barrier.click()
  await page.keyboard.press("Backspace")
  const dialog = page.getByRole("alertdialog", { name: "Delete “Barrier”?" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute("aria-modal", "true")
  const cancel = dialog.getByRole("button", { name: "Cancel" })
  const del = dialog.getByRole("button", { name: "Delete" })
  await expect(cancel).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(del).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(cancel).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(del).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(barrier).toBeVisible()
  await expect(page.locator(".knobs-tree")).toBeFocused()
  // Again, through the palette, and this time confirmed.
  await page.keyboard.press("ControlOrMeta+k")
  await input(page).fill("delete sel")
  await expect(active(page)).toHaveText("Delete selection")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeVisible()
  await del.click()
  await expect(dialog).toHaveCount(0)
  await expect(barrier).toHaveCount(0)
  await expect(page.getByRole("status").filter({ hasText: "Deleted Barrier" })).toBeVisible()
  // The scrim is gone too.
  await expect(page.locator(".knobs-scrim")).toHaveCount(0)
})

test("overlays sit above the GPU overlay", async ({ page }) => {
  await open(page, "?gpu&paused")
  test.skip(!(await page.evaluate(() => "gpu" in navigator)), "WebGPU isn't available")
  await expect(page.locator('[data-controls="lab-station"]')).toHaveAttribute(
    "data-gpu-active",
    "true",
  )
  await page.keyboard.press("ControlOrMeta+k")
  await expect(palette(page)).toBeVisible()
  const hit = await palette(page).evaluate((el) => {
    const r = el.getBoundingClientRect()
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + 20)
    return el.contains(at) || `${at?.tagName}.${at?.className}`
  })
  expect(hit).toBe(true)
})
