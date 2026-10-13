import { expect, test } from "@playwright/test"

test("three hover chips, independent panels, persistence, clipboard, keyboard, hint prefixes, preset strip and drag", async ({
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

  // Verify no per-field shortcut suffixes are rendered in labels
  await expect(panel.locator(".knobs-label").first()).toHaveText("seed")

  // Verify ? shortcuts popover in header replaces permanent footer
  const helpBtn = panel.getByRole("button", { name: "Keyboard shortcuts", exact: true })
  await helpBtn.click()
  await expect(panel.locator(".knobs-popover")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(panel.locator(".knobs-popover")).toBeHidden()
  await expect(panel).toBeVisible()

  // Custom preset strip: cycle with ] and [ from anywhere in the panel
  const presetStrip = panel.getByRole("radiogroup", { name: "Preset or variant" })
  await expect(presetStrip).toBeVisible()
  await expect(presetStrip.getByRole("radio", { name: "default" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await page.keyboard.press("]")
  await expect(presetStrip.getByRole("radio", { name: "subtle" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await page.keyboard.press("[")
  await expect(presetStrip.getByRole("radio", { name: "default" })).toHaveAttribute(
    "aria-checked",
    "true",
  )

  await panel.getByRole("button", { name: "Random", exact: true }).click()
  await expect(rendered("splat")).not.toHaveAttribute("data-render", beforeSplat!)
  await expect(rendered("halftone")).toHaveAttribute("data-render", beforeDots!)
  await expect(presetStrip.locator(".knobs-preset-custom")).toBeVisible()
  const randomized = await rendered("splat").getAttribute("data-render")

  // "+" at the end of the preset strip saves the current values as a new chip
  await presetStrip.getByRole("button", { name: "Save as variant" }).click()
  await expect(presetStrip.getByRole("radio", { name: "Variant 1" })).toHaveAttribute(
    "aria-checked",
    "true",
  )

  await panel
    .locator(".knobs-actions")
    .first()
    .getByRole("button", { name: "Copy", exact: true })
    .click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("count:")
  await page.reload()
  await expect(rendered("splat")).toHaveAttribute("data-render", randomized!)
  await page.locator('[data-study="splat"]').focus()
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  await expect(presetStrip.getByRole("radio", { name: "Variant 1" })).toBeVisible()
  await panel.getByRole("button", { name: "Reset", exact: true }).click()
  await expect(rendered("splat")).toHaveAttribute("data-render", beforeSplat!)
  await presetStrip.getByRole("radio", { name: "Variant 1" }).click()
  await expect(rendered("splat")).toHaveAttribute("data-render", randomized!)
  await panel.getByRole("button", { name: "Reset", exact: true }).click()

  // Verify cycling never gets stuck when a saved variant equals a preset ("default")
  await presetStrip.focus()
  await page.keyboard.press("Shift+S")
  await expect(presetStrip.getByRole("radio", { name: "Variant 2" })).toBeVisible()
  await presetStrip.getByRole("radio", { name: "default", exact: true }).click()
  const visitedPresets: string[] = []
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("]")
    visitedPresets.push((await presetStrip.getAttribute("data-active-preset")) ?? "")
  }
  expect(new Set(visitedPresets).size).toBe(5)
  // ⌫ on the strip deletes the selected saved chip
  await presetStrip.getByRole("radio", { name: "Variant 2" }).click()
  await page.keyboard.press("Backspace")
  await expect(presetStrip.getByRole("radio", { name: "Variant 2" })).toHaveCount(0)
  await panel.getByRole("button", { name: "Reset", exact: true }).click()

  const count = panel.getByRole("slider", { name: "count", exact: true })
  await count.focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(count).toHaveAttribute("aria-valuenow", "108")
  await page.keyboard.press("ArrowDown")
  await expect(panel.getByRole("slider", { name: "size", exact: true })).toBeFocused()

  // Hint mode (`s`): every control gets its short stable code; the typed part dims; a unique match jumps.
  const seedLabelXBefore = await panel
    .locator('[data-field="seed"] .knobs-label')
    .evaluate((el) => el.getBoundingClientRect().left)
  await page.keyboard.press("s")
  await expect(panel).toHaveClass(/knobs-hinting/)
  const seedLabelXDuring = await panel
    .locator('[data-field="seed"] .knobs-label')
    .evaluate((el) => el.getBoundingClientRect().left)
  expect(seedLabelXDuring).toBe(seedLabelXBefore)
  const badges = panel.locator(".knobs-hint-layer .knobs-hint")
  expect((await badges.allTextContents()).slice(0, 5)).toEqual(["se", "co", "si", "f", "g"])
  await page.keyboard.press("s")
  await expect(badges.first().locator(".knobs-hint-typed")).toHaveText("s")
  await expect(badges.first().locator(".knobs-hint-rest")).toHaveText("e")
  await expect(panel.locator('[data-field="count"]')).toHaveClass(/knobs-hint-miss/)
  await page.keyboard.press("Backspace")
  await page.keyboard.type("co")
  await expect(panel).not.toHaveClass(/knobs-hinting/)
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
    .getByRole("button", { name: "Copy", exact: true })
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
  await page.mouse.move(1740, 120)
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

test("meta page self-tunes knobs tokens live, switches presets, copies CSS, and supports ?gpu mode", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))

  await page.goto("/meta.html")
  const tokensPanel = page.getByRole("region", { name: "knobs-tokens controls" })
  const synthPanel = page.getByRole("region", { name: "synth-voice controls" })
  await expect(tokensPanel).toBeVisible()
  await expect(synthPanel).toBeVisible()

  // Hint mode on meta page: "Accent hue" -> "ah", "Accent chroma" -> "ac"; typing "ah" jumps to Accent hue
  await tokensPanel.getByRole("slider", { name: "Panel width", exact: true }).focus()
  await page.keyboard.press("s")
  const metaBadges = await tokensPanel.locator(".knobs-hint-layer .knobs-hint").allTextContents()
  expect(metaBadges).toContain("ah")
  expect(metaBadges).toContain("ac")
  expect(metaBadges).toContain("pw")
  await page.keyboard.type("ah")
  await expect(tokensPanel.getByRole("slider", { name: "Accent hue", exact: true })).toBeFocused()

  // Adjusting Accent hue on default preset immediately changes --k-accent
  await page.keyboard.press("Shift+ArrowRight")
  await expect(page.locator("[data-css-output]")).toContainText("--k-accent: hsl(225 ")

  // Switch preset to "compact" and verify CSS variables update on :root and affect both panels
  const presetStrip = tokensPanel.getByRole("radiogroup", { name: "Preset or variant" })
  await presetStrip.getByRole("radio", { name: "compact", exact: true }).click()
  await expect(page.locator("[data-css-output]")).toContainText("--k-width: 260px;")
  await expect(page.locator("[data-css-output]")).toContainText("--k-row: 26px;")

  // Switch to "terminal" preset
  await presetStrip.getByRole("radio", { name: "terminal", exact: true }).click()
  await expect(page.locator("[data-css-output]")).toContainText("--k-radius: 2px;")

  // Copy CSS custom action
  await tokensPanel.getByRole("button", { name: "Copy CSS", exact: true }).click()
  await expect(tokensPanel.getByRole("status")).toContainText("Copied CSS tokens.")
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("--k-radius: 2px;")

  // Reset back to default and switch to cobalt preset for screenshot
  await presetStrip.getByRole("radio", { name: "cobalt", exact: true }).click()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await tokensPanel.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
  )
  await page.screenshot({
    path: "test-results/meta-panel.png",
    fullPage: true,
    animations: "disabled",
  })

  // Navigate to /?gpu and verify WebGPU hardware renderer & diagnostics
  await page.setViewportSize({ width: 2048, height: 1480 })
  await page.goto("/?gpu")
  const study = page.locator('[data-study="splat"]')
  const bounds = (await study.boundingBox())!
  await study.hover({ position: { x: bounds.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const splatDialog = page.getByRole("dialog", { name: "splat controls", exact: true })
  await expect(splatDialog).toBeVisible()
  await expect(splatDialog).toHaveAttribute("data-renderer", "gpu")
  await expect(splatDialog).toHaveAttribute("data-gpu-active", "true")
  await expect(page.locator("canvas.knobs-gpu-canvas")).toHaveCount(1)

  const captureHeader = (await splatDialog.locator("header").boundingBox())!
  await page.mouse.move(captureHeader.x + 30, captureHeader.y + 10)
  await page.mouse.down()
  await page.mouse.move(1740, 120)
  await page.mouse.up()

  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = window.__knobsGpu
        return g ? g.frameCount > 0 && g.lastInstanceCount > 20 : false
      }),
    )
    .toBe(true)

  await page.screenshot({ path: "test-results/example-gpu.png" })

  // Verify idle frame skipping (RAF loop goes to sleep once springs settle)
  await expect.poll(() => page.evaluate(() => window.__knobsGpu?.sleeping ?? false)).toBe(true)

  // Verify graceful fallback when WebGPU is unavailable
  const fallbackContext = await page.context().browser()!.newContext()
  await fallbackContext.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true })
  })
  const fallbackPage = await fallbackContext.newPage()
  await fallbackPage.goto("/?gpu")
  const fallbackRemote = fallbackPage.getByRole("region", { name: "remote-tune controls" })
  await expect(fallbackRemote).toBeVisible()
  await expect(fallbackRemote).toHaveAttribute("data-gpu-active", "false")
  expect(await fallbackPage.evaluate(() => window.__knobsGpu?.backend)).toBe("dom")
  await fallbackContext.close()

  expect(errors).toEqual([])
})

test("keyboard reaches everything; drags and scrubs are single undo steps", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const bounds = (await study.boundingBox())!
  await study.hover({ position: { x: bounds.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  const strip = panel.getByRole("radiogroup", { name: "Preset or variant" })
  const seed = panel.getByRole("slider", { name: "seed", exact: true })
  const random = panel.getByRole("button", { name: "Random", exact: true })

  // Phosphor icons in the header
  await expect(panel.locator("header .knobs-icon")).toHaveCount(4)

  // ↑/↓ walk presets → rows → action bar; ←/→ move along the action bar
  await seed.focus()
  await page.keyboard.press("ArrowUp")
  await expect(strip).toBeFocused()
  await page.keyboard.press("ArrowUp")
  await expect(random).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await expect(panel.getByRole("button", { name: "Reset", exact: true })).toBeFocused()
  await page.keyboard.press("ArrowUp")
  await expect(panel.getByRole("switch", { name: "grain" })).toBeFocused()

  // Tab wraps inside the floating panel
  await panel.getByRole("button", { name: "Copy", exact: true }).focus()
  await page.keyboard.press("Tab")
  // Undo/Redo are disabled on a fresh panel, so the wrap lands on the first enabled control.
  await expect(panel.getByRole("button", { name: "Keyboard shortcuts" })).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(panel.getByRole("button", { name: "Copy", exact: true })).toBeFocused()

  // ⇧R resets everything; ⇧S saves a preset; ⌫ on the strip deletes it; export lives in "?"
  await seed.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+R")
  await expect(strip).toHaveAttribute("data-active-preset", "p:default")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Shift+S")
  await expect(strip.getByRole("radio", { name: "Variant 1" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await strip.focus()
  await page.keyboard.press("Backspace")
  await expect(strip.getByRole("radio", { name: "Variant 1" })).toHaveCount(0)
  await page.keyboard.press("?")
  await expect(panel.getByRole("button", { name: "Export presets" })).toBeVisible()
  await page.keyboard.press("Escape")
  await page.keyboard.press("Shift+R")

  // `s` jumps to presets (applying them) and buttons
  await seed.focus()
  await page.keyboard.type("sh")
  await expect(strip).toHaveAttribute("data-active-preset", "p:heavy")
  await page.keyboard.type("sra")
  await expect(random).toBeFocused()
  await page.keyboard.press("u")
  await expect(strip).toHaveAttribute("data-active-preset", "p:default")

  // Scrubbing across every chip is one undo step
  const chips = strip.locator(".knobs-preset-chip[role=radio]")
  const first = (await chips.first().boundingBox())!
  const last = (await chips.last().boundingBox())!
  await page.mouse.move(first.x + 4, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width + 60, last.y + last.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(strip).toHaveAttribute("data-active-preset", "p:heavy")
  await page.keyboard.press("u")
  await expect(strip).toHaveAttribute("data-active-preset", "p:default")

  // A drag that starts on the value readout scrubs; a plain click there edits
  const count = panel.locator('[data-field="count"]')
  const value = (await count.locator(".knobs-value").boundingBox())!
  await page.mouse.move(value.x + value.width / 2, value.y + value.height / 2)
  await page.mouse.down()
  await page.mouse.move(value.x - 120, value.y + value.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(count.locator(".knobs-number")).toBeHidden()
  await expect(panel.getByRole("slider", { name: "count" })).not.toHaveAttribute(
    "aria-valuenow",
    "98",
  )
  await page.keyboard.press("u")
  await expect(panel.getByRole("slider", { name: "count" })).toHaveAttribute("aria-valuenow", "98")
  await count.locator(".knobs-value").click()
  await expect(count.locator(".knobs-number")).toBeVisible()
})
