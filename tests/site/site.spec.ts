import { expect, test, type Page } from "@playwright/test"

const pages = [
  "/",
  "/getting-started",
  "/fields",
  "/panel",
  "/reacting",
  "/theming",
  "/production",
  "/adapters",
  "/remote",
  "/full-page",
  "/examples",
]

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

test("every docs page and example loads without errors", async ({ page }) => {
  const errors = trackErrors(page)
  for (const path of pages) {
    await page.goto(path)
    await expect(page.locator("main h1")).toBeVisible()
    await expect(page.locator("main section[data-section]").first()).toHaveAttribute("data-in", "")
  }
  // Client-side navigation from the nav swaps the page without a reload.
  await page.goto("/")
  await page.getByRole("navigation", { name: "Documentation" }).getByText("Fields").click()
  await expect(page).toHaveURL(/\/fields$/)
  await expect(page.locator("main h1")).toHaveText("Fields")
  for (const example of ["studies", "meta", "die"]) {
    await page.goto(`/examples/${example}.html`)
    await expect(page.locator(".knobs-panel, .knobs-chip").first()).toBeAttached()
  }
  expect(errors).toEqual([])
})

test("a section chip opens that section's panel, which restyles the section", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/fields")
  const section = page.locator('section[data-section="knob"]')
  const heading = section.locator("h2")
  await section.scrollIntoViewIfNeeded()
  await expect(section).toHaveAttribute("data-in", "")
  const before = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const box = (await section.boundingBox())!
  await section.hover({ position: { x: box.width - 30, y: 30 } })
  const chip = page.getByRole("button", { name: "Tune knob", exact: true })
  await expect(chip).toBeVisible()
  await chip.click()
  const panel = page.getByRole("dialog", { name: "knob controls", exact: true })
  await expect(panel).toBeVisible()
  const size = panel.getByRole("slider", { name: "Heading size", exact: true })
  await size.focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(size).toHaveAttribute("aria-valuenow", "1.1")
  await expect
    .poll(() => heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    .toBeGreaterThan(before)
  // Other sections keep their own values.
  await expect(page.locator('section[data-section="choice"]')).toHaveCSS("--s-size", "1")
  expect(errors).toEqual([])
})

test("the site panel opens with T and its tokens apply to the page", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/getting-started")
  await expect(page.locator("main h1")).toBeVisible()
  await page.keyboard.press("t")
  const panel = page.getByRole("dialog", { name: "Site tokens controls" })
  await expect(panel).toBeVisible()
  const root = page.locator("html")
  await expect(root).toHaveCSS("--fs", "16px")
  const size = panel.getByRole("slider", { name: "Base size", exact: true })
  await size.focus()
  await page.keyboard.press("ArrowRight")
  await expect(root).toHaveCSS("--fs", "16.5px")
  // Theme is a site token too; the panel closes back into its button with Escape.
  await panel.getByRole("radio", { name: "dark", exact: true }).click()
  await expect(root).toHaveAttribute("data-theme", "dark")
  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await expect(page.getByRole("button", { name: "Tune site tokens" })).toBeFocused()
  expect(errors).toEqual([])
})

test("Copy link puts the tuning in the hash, and opening it applies the tuning", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/panel")
  await expect(page.locator("main h1")).toBeVisible()
  await page.keyboard.press("t")
  const panel = page.getByRole("dialog", { name: "Site tokens controls" })
  await panel.getByRole("radio", { name: "terminal", exact: true }).click()
  await panel.getByRole("button", { name: "Copy link", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("#tune=")
  const link = await page.evaluate(() => navigator.clipboard.readText())

  const fresh = await browser.newPage({ colorScheme: "light" })
  await fresh.goto(link)
  await expect(fresh.locator("html")).toHaveAttribute("data-theme", "dark")
  await expect(fresh.locator("html")).toHaveCSS("--radius", "2px")
  // The shared hash is applied once and removed from the address.
  await expect(fresh).toHaveURL(/\/panel$/)
  await fresh.close()
})
