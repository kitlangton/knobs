import { expect, test, type Page } from "@playwright/test"

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  return errors
}

/** Scrolls the whole page in steps so every lazy example mounts and every section enters. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y <= height + 600; y += 600) {
    await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y)
    await page.waitForTimeout(60)
  }
}

/** Clicks a panel button and reports whether a CSS transition started on `target`. */
async function startsTransition(page: Page, panel: string, button: string, target: string) {
  return page.evaluate(
    ({ panel, button, target }) =>
      new Promise<boolean>((done) => {
        const el = document.querySelector(target)!
        document.querySelector<HTMLElement>(`${panel} button[aria-label="${button}"]`)!.click()
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            done(el.getAnimations().some((a) => a instanceof CSSTransition)),
          ),
        )
      }),
    { panel, button, target },
  )
}

test("the page and the example pages load without errors, and every example mounts", async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto("/")
  await expect(page.locator("main h1")).toHaveText("knobs")
  await scrollThrough(page)
  const sections = page.locator("main section[data-section]")
  expect(await sections.count()).toBeGreaterThanOrEqual(20)
  // The full-page example lays its sections out as columns of cards.
  await expect(page.locator(".page-demo .knobs-page .knobs-tile").first()).toBeVisible()
  await expect(page.locator(".embed-panel .knobs-panel")).toBeVisible()
  await expect(page.locator("main .example-placeholder")).toHaveCount(0)
  await expect(page.locator("main section[data-section]:not([data-in])")).toHaveCount(0)
  // The section index lists every section.
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link")).toHaveCount(
    await page.locator("main section[data-toc] > h2").count(),
  )
  // At 390 px, the full-page demo's presets sit on their own row under the title and buttons.
  await page.setViewportSize({ width: 390, height: 844 })
  const pageHead = await page.locator(".page-demo .knobs-page > header").evaluate((h) => {
    const title = h.querySelector("strong")!.getBoundingClientRect()
    const tools = h.querySelector(".knobs-page-tools")!.getBoundingClientRect()
    const presets = h.querySelector(".knobs-presets")!.getBoundingClientRect()
    return { title, tools, presets }
  })
  expect(pageHead.title.right).toBeLessThanOrEqual(pageHead.tools.left + 0.5)
  expect(pageHead.presets.top).toBeGreaterThanOrEqual(
    Math.max(pageHead.title.bottom, pageHead.tools.bottom) - 0.5,
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const example of ["studies", "meta", "die", "tune", "problems"])
    await expect(page.locator(`#examples a[href='/examples/${example}.html']`)).toBeVisible()
  for (const example of ["studies", "meta", "die", "tune", "problems"]) {
    await page.goto(`/examples/${example}.html`)
    await expect(page.locator(".knobs-panel, .knobs-chip").first()).toBeAttached()
  }
  expect(errors).toEqual([])
})

test("the example pages keep their chips hidden until ⌥⇧D, and say so", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/examples/studies.html")
  await expect(page.locator(".knobs-mode-hint")).toHaveText("Press ⌥⇧D for knobs")
  const study = page.locator('[data-study="splat"]')
  const chip = page.locator('.knobs-chip[aria-label="Tune splat"]')
  await expect(chip).toBeAttached()
  const box = (await study.boundingBox())!
  await study.hover({ position: { x: box.width - 20, y: 60 } })
  await page.waitForTimeout(250)
  await expect(chip).toBeHidden()
  await page.keyboard.press("Alt+Shift+KeyD")
  await expect(page.locator(".knobs-toast")).toHaveText("knobs on")
  await page.mouse.move(0, 0)
  await study.hover({ position: { x: box.width - 20, y: 60 } })
  await expect(chip).toBeVisible()
  expect(errors).toEqual([])
})

test("the embedded panel swaps rows in place when the app switches items", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/#embedding-in-an-app")
  const panel = page.locator(".embed-panel .knobs-panel")
  await expect(panel.getByRole("slider", { name: "Width", exact: true })).toBeVisible()
  const before = await panel.elementHandle()
  await page.getByRole("tab", { name: "Sheet" }).click()
  await expect(panel.getByRole("slider", { name: "Tilt", exact: true })).toBeVisible()
  await expect(panel.getByRole("slider", { name: "Duration", exact: true })).toHaveCount(0)
  // The same panel element: the rows changed, the panel stayed.
  expect(await panel.evaluate((el, prev) => el === prev, before)).toBe(true)
  expect(errors).toEqual([])
})

test("an old page address lands on its section", async ({ page }) => {
  await page.goto("/theming")
  await expect(page).toHaveURL(/\/#theming$/)
  await expect(page.locator("#theming")).toBeInViewport()
})

test("a section chip opens that section's panel, which restyles the section", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/#knob")
  const section = page.locator('section[data-section="knob"]')
  const heading = section.locator("h2")
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
  // Random on a section glides its tokens like a preset does.
  let glided = false
  for (let i = 0; i < 3 && !glided; i++)
    glided = await startsTransition(
      page,
      '[aria-label="knob controls"]',
      "Random",
      'section[data-section="knob"]',
    )
  expect(glided).toBe(true)
  expect(errors).toEqual([])
})

test("the site panel opens with T, and its tokens apply and glide", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/")
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
  // Random leaves Motion on (it starts locked), so every roll glides.
  for (let i = 0; i < 3; i++) {
    expect(
      await startsTransition(page, '[aria-label="Site tokens controls"]', "Random", "html"),
    ).toBe(true)
    await page.waitForTimeout(150)
  }
  await panel.getByRole("radio", { name: "dark", exact: true }).click()
  await expect(root).toHaveAttribute("data-theme", "dark")
  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await expect(page.getByRole("button", { name: "Tune site tokens" })).toBeFocused()
  expect(errors).toEqual([])
})

test("Random on the theming example glides the specimen panel instead of rebuilding it", async ({
  page,
}) => {
  await page.goto("/#theming")
  const look = '[aria-label="Panel look controls"]'
  await page.locator(".specimen-stage .knobs-panel").waitFor()
  await page.locator(look).waitFor()
  const specimen = page.locator(".specimen-stage .knobs-panel")
  await specimen.evaluate((el) => ((window as unknown as { __specimen: Element }).__specimen = el))
  let glided = false
  for (let i = 0; i < 3 && !glided; i++)
    glided = await startsTransition(page, look, "Random", ".specimen-stage .knobs-panel")
  expect(glided).toBe(true)
  expect(
    await specimen.evaluate(
      (el) => el === (window as unknown as { __specimen: Element }).__specimen,
    ),
  ).toBe(true)
})

test("Copy link puts the tuning in the hash, and opening it applies the tuning", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/")
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
  await expect(fresh).toHaveURL(/\/$/)
  await fresh.close()
})
