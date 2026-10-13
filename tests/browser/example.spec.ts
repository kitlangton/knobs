import { expect, test } from "@playwright/test"

test("three hover chips, independent panels, persistence, clipboard, keyboard and drag", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await expect(page.locator(".knobs-chip")).toHaveCount(3)
  await expect(page.locator(".knobs-chip:visible")).toHaveCount(0)
  const rendered = (id: string) => page.locator(`[data-study="${id}"] [data-render]`)
  const beforeSplat = await rendered("splat").getAttribute("data-render")
  const beforeDots = await rendered("halftone").getAttribute("data-render")
  for (const id of ["splat", "halftone", "typography"]) {
    const study = page.locator(`[data-study="${id}"]`)
    const bounds = (await study.boundingBox())!
    await study.hover({ position: { x: bounds.width - 20, y: 60 } })
    await expect(page.getByRole("button", { name: `Tune ${id}`, exact: true })).toBeVisible()
    await page.getByRole("button", { name: `Tune ${id}`, exact: true }).click()
    await expect(page.getByRole("dialog", { name: `${id} controls`, exact: true })).toBeVisible()
  }
  await expect(page.getByRole("dialog")).toHaveCount(3)
  // Move other panels out of the way through their own close actions.
  await page.getByRole("button", { name: "Close typography" }).click()
  await page.getByRole("button", { name: "Close halftone" }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.getByRole("button", { name: "RND", exact: true }).click()
  await expect(rendered("splat")).not.toHaveAttribute("data-render", beforeSplat!)
  await expect(rendered("halftone")).toHaveAttribute("data-render", beforeDots!)
  const randomized = await rendered("splat").getAttribute("data-render")
  await panel.getByRole("textbox", { name: "Variant name", exact: true }).fill("First impression")
  await panel.getByRole("button", { name: "SAVE", exact: true }).click()
  await expect(panel.locator(".knobs-saved")).toHaveCount(1)
  await panel
    .locator(".knobs-actions")
    .first()
    .getByRole("button", { name: "COPY", exact: true })
    .click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("count:")
  await page.reload()
  await expect(rendered("splat")).toHaveAttribute("data-render", randomized!)
  await page.locator('[data-study="splat"]').focus()
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  await expect(panel.locator(".knobs-saved")).toContainText("First impression")
  await panel.getByRole("button", { name: "RESET", exact: true }).click()
  await expect(rendered("splat")).toHaveAttribute("data-render", beforeSplat!)
  await panel.getByRole("button", { name: "LOAD", exact: true }).click()
  await expect(rendered("splat")).toHaveAttribute("data-render", randomized!)
  await panel.getByRole("button", { name: "RESET", exact: true }).click()
  const count = panel.getByRole("slider", { name: "count", exact: true })
  await count.focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(count).toHaveAttribute("aria-valuenow", "108")
  await page.keyboard.press("ArrowDown")
  await expect(panel.getByRole("slider", { name: "size", exact: true })).toBeFocused()
  await page.keyboard.press("c")
  await expect(count).toBeFocused()
  await page.keyboard.type("42")
  await page.keyboard.press("Enter")
  await expect(count).toHaveAttribute("aria-valuenow", "42")
  // Verify rolling-number slots use content-box and clicking directly on digits opens inline editor
  const slotBoxSizing = await panel
    .locator(".rn-slot")
    .first()
    .evaluate((el) => getComputedStyle(el).boxSizing)
  expect(slotBoxSizing).toBe("content-box")
  const countRow = panel.locator('[data-field="count"]')
  await expect(countRow).toHaveClass(/knobs-modified/)
  await countRow.locator(".knobs-digits").click()
  await expect(countRow.locator(".knobs-number")).toBeVisible()
  await expect(countRow.locator(".knobs-label")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Backspace")
  await expect(count).toHaveAttribute("aria-valuenow", "98")
  await expect(countRow).not.toHaveClass(/knobs-modified/)
  await page.keyboard.type("42")
  await page.keyboard.press("Enter")
  await expect(count).toHaveAttribute("aria-valuenow", "42")
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("unavailable")),
    }),
  )
  await panel
    .locator(".knobs-actions")
    .first()
    .getByRole("button", { name: "COPY", exact: true })
    .click()
  await expect(panel.getByRole("textbox", { name: "Import or copy text" })).toHaveValue(/count: 42/)
  await expect(panel.getByRole("status")).toContainText("Copy the selected text")
  const header = panel.locator("header")
  const box = (await header.boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(1040, 100)
  await page.mouse.up()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("knobs:splat:position:v1")))
    .not.toBeNull()
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Tune splat", exact: true })).toBeFocused()
  await page.getByRole("heading", { level: 1 }).click()
  await page.locator('[data-knobs-switcher="typography"]').hover()
  await page.keyboard.press("3")
  await expect(rendered("typography")).toHaveAttribute("data-render", /"flavor":"italic"/)
  await page.locator('[data-study="splat"]').focus()
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  await expect(panel.getByRole("textbox", { name: "Import or copy text" })).toBeHidden()
  const position = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("knobs:splat:position:v1")!),
  )
  await panel.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)))
  const restored = (await panel.boundingBox())!
  expect(restored.x).toBeCloseTo(position.x)
  expect(restored.y).toBeCloseTo(position.y)
  await page.setViewportSize({ width: 2048, height: 1100 })
  const captureHeader = (await panel.locator("header").boundingBox())!
  await page.mouse.move(captureHeader.x + 30, captureHeader.y + 10)
  await page.mouse.down()
  await page.mouse.move(1780, 120)
  await page.mouse.up()
  await page.screenshot({ path: "test-results/example-panel.png", fullPage: true })
  expect(errors).toEqual([])
})

test("production ships constants, with no panel chunks or hover UI", async ({ page }) => {
  const scripts: string[] = []
  page.on("response", (response) => {
    if (response.url().endsWith(".js")) scripts.push(response.url())
  })
  await page.goto("http://127.0.0.1:5179/")
  await expect(page.locator("[data-study]")).toHaveCount(3)
  await page.evaluate(() =>
    localStorage.setItem(
      "knobs:splat:state:v1",
      JSON.stringify({ version: 1, values: { count: 5 } }),
    ),
  )
  await page.reload()
  await page.locator('[data-study="splat"]').hover()
  await expect(page.locator(".knobs-chip,.knobs-panel,[data-knobs-switcher]")).toHaveCount(0)
  await expect(page.locator('[data-study="splat"] [data-render]')).toHaveAttribute(
    "data-render",
    /"count":98/,
  )
  for (const url of new Set(scripts)) {
    const source = await (await page.request.get(url)).text()
    expect(source).not.toMatch(/knobs-panel|knobs-chip|ResizeObserver|Import or copy text/)
  }
})

test("React hydration, nested switcher ownership, saved variants and teardown", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.goto("/contracts.html")
  await expect(page.locator(".knobs-chip")).toHaveCount(1)
  await page.getByRole("button", { name: "Check child ref" }).click()
  await expect(page.locator("[data-ref]")).toHaveText("true")
  await page.locator("[data-outer-preview]").click()
  await page.locator("[data-inner-preview]").hover()
  await page.keyboard.press("3")
  await expect(page.locator("[data-inner]")).toHaveText("c")
  await expect(page.locator("[data-outer]")).toHaveText("a:2")
  await page.locator("[data-outer-preview]").hover()
  await page.keyboard.press("ArrowRight")
  await expect(page.locator("[data-outer]")).toHaveText("b:2")
  await expect(page.locator("[data-inner]")).toHaveText("c")
  await page.getByRole("textbox", { name: "Keep typing" }).fill("123")
  await expect(page.locator("[data-inner]")).toHaveText("c")
  await page.getByRole("group", { name: "Saved", exact: true }).focus()
  await page.mouse.move(0, 0)
  await page.keyboard.press("3")
  await expect(page.locator("[data-outer]")).toHaveText("a:7")
  await page.getByRole("group", { name: "Outer", exact: true }).focus()
  await page.getByRole("button", { name: "Tune outer" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(1)
  await page.getByRole("button", { name: "Toggle attachment" }).click()
  await expect(page.locator(".knobs-chip,.knobs-panel")).toHaveCount(0)
  await page.getByRole("button", { name: "Toggle attachment" }).click()
  await expect(page.locator(".knobs-chip")).toHaveCount(1)
  await expect(page.locator("style[data-knobs-style]")).toHaveCount(1)
  // Test inline mounted remote panel, groups, custom actions, light/compact theme and Solid mirror
  await page.getByRole("button", { name: "Toggle remote panel" }).click()
  const remotePanel = page.getByRole("region", { name: "phone-tune controls" })
  await expect(remotePanel).toBeVisible()
  await expect(remotePanel).toHaveAttribute("data-theme", "light")
  await expect(remotePanel).toHaveAttribute("data-density", "compact")
  await expect(remotePanel.locator(".knobs-group-head")).toHaveCount(2)
  await expect(page.locator("[data-solid-remote]")).toHaveText("0.5:glass")
  await remotePanel.getByRole("button", { name: "Copy as Swift" }).click()
  await expect(remotePanel.getByRole("status")).toHaveText("Copied Swift.")
  await remotePanel.getByRole("radio", { name: "solid" }).click()
  await expect(page.locator("[data-solid-remote]")).toHaveText("0.5:solid")
  await remotePanel.getByRole("button", { name: "Reset Spring" }).click()
  await expect(page.locator("[data-solid-remote]")).toHaveText("0.35:solid")
  expect(errors).toEqual([])
})
