import { expect, test } from "@playwright/test"

test("hover chips, independent panels, persistence, clipboard, keyboard, hint prefixes, preset strip and drag", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/")
  await expect(page.locator(".knobs-chip")).toHaveCount(4)
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

  // Verify no per-field shortcut suffixes are rendered in labels; ids read as titles
  await expect(panel.locator(".knobs-label").first()).toHaveText("seed")
  await expect(panel.locator("header strong")).toHaveText("Splat")

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
  // No chip is selected once the values no longer match a preset.
  await expect(presetStrip).toHaveAttribute("data-active-preset", "custom")
  const randomized = await rendered("splat").getAttribute("data-render")

  // "+" at the end of the preset strip saves the current values as a new chip
  await presetStrip.getByRole("button", { name: "Save as variant" }).click()
  await expect(presetStrip.getByRole("radio", { name: "Variant 1" })).toHaveAttribute(
    "aria-checked",
    "true",
  )

  await panel.locator("header").getByRole("button", { name: "Copy", exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("count:")
  await page.reload()
  await expect(rendered("splat")).toHaveAttribute("data-render", randomized!)
  // The panel was open, so the reload reopens it.
  await expect(panel).toBeVisible()
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
  // Nothing differs from the defaults, so there is nothing to reset.
  await expect(panel.getByRole("button", { name: "Reset", exact: true })).toBeDisabled()

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
  await page.keyboard.press("Shift+C")
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
  await expect(page.locator("[data-study]")).toHaveCount(4)
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

  // Hint mode on meta page: "Panel width" -> "pw", "Control radius" -> "cr"
  await tokensPanel.getByRole("slider", { name: "Panel width", exact: true }).focus()
  await page.keyboard.press("s")
  const metaBadges = await tokensPanel.locator(".knobs-hint-layer .knobs-hint").allTextContents()
  expect(metaBadges).toContain("pw")
  expect(metaBadges).toContain("cr")
  await page.keyboard.type("cr")
  await expect(
    tokensPanel.getByRole("slider", { name: "Control radius", exact: true }),
  ).toBeFocused()

  // The OKLCH accent: ←→ on its row turns the hue, and --k-accent follows at once
  await tokensPanel.getByRole("button", { name: "Accent", exact: true }).focus()
  await page.keyboard.press("Shift+ArrowRight")
  await expect(page.locator("[data-css-output]")).toContainText("--k-accent: oklch(0.7 0.13 260)")

  // Switch preset to "compact" and verify CSS variables update on :root and affect both panels
  const presetStrip = tokensPanel.getByRole("radiogroup", { name: "Preset or variant" })
  await presetStrip.getByRole("radio", { name: "compact", exact: true }).click()
  await expect(page.locator("[data-css-output]")).toContainText("--k-width: 260px;")
  await expect(page.locator("[data-css-output]")).toContainText("--k-row: 28px;")

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

  // Random, Reset and Copy are Phosphor icons in the header with undo/redo, help and close
  await expect(panel.locator("header :is(.knobs-icon, .knobs-die-icon)")).toHaveCount(7)
  await expect(panel.locator(".knobs-actions")).toHaveCount(0)
  await expect(panel.getByRole("button", { name: "Reset", exact: true })).toBeDisabled()

  // ↑/↓ walk presets → rows, wrapping (no custom actions here)
  const grain = panel.getByRole("switch", { name: "grain" })
  await seed.focus()
  await page.keyboard.press("ArrowUp")
  await expect(strip).toBeFocused()
  await page.keyboard.press("ArrowUp")
  await expect(grain).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(strip).toBeFocused()

  // Tab wraps inside the floating panel; disabled Reset/Undo/Redo are skipped
  await grain.focus()
  await page.keyboard.press("Tab")
  await expect(random).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(panel.getByRole("button", { name: "Copy", exact: true })).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Shift+Tab")
  await expect(grain).toBeFocused()

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
  await page.keyboard.press("Escape")
})

test("sliders: default notch magnet, ⌥ fine drag, horizontal wheel nudge", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const bounds = (await study.boundingBox())!
  await study.hover({ position: { x: bounds.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  // Pointers reach only what the growing shape has revealed, so let it settle first.
  await expect(panel).not.toHaveAttribute("data-morphing")
  const count = panel.getByRole("slider", { name: "count", exact: true })
  const track = (await count.boundingBox())!
  const y = track.y + track.height / 2
  const xAt = (v: number) => track.x + (v / 300) * track.width
  const now = async () => Number(await count.getAttribute("aria-valuenow"))

  // The notch marks the default; dragging within a few px of it lands exactly on it.
  await expect(panel.locator('[data-field="count"] .knobs-notch')).toHaveCount(1)
  await page.mouse.move(xAt(200), y)
  await page.mouse.down()
  await page.mouse.move(xAt(150), y, { steps: 4 })
  await page.mouse.move(xAt(98) + 3, y, { steps: 4 })
  await expect(panel.locator('[data-field="count"]')).toHaveClass(/knobs-magnet/)
  expect(await now()).toBe(98)
  await page.mouse.move(xAt(98) + 14, y, { steps: 2 })
  expect(await now()).toBeGreaterThan(100)
  await page.mouse.up()

  // ⌥-drag moves at a tenth of the speed, relative to where it started.
  await count.focus()
  await page.keyboard.type("150")
  await page.keyboard.press("Enter")
  await page.mouse.move(xAt(220), y)
  await page.keyboard.down("Alt")
  await page.mouse.down()
  await page.mouse.move(xAt(220) + 60, y, { steps: 6 })
  const fine = await now()
  await page.mouse.up()
  await page.keyboard.up("Alt")
  expect(fine).toBeGreaterThan(150)
  expect(fine).toBeLessThanOrEqual(150 + Math.ceil((60 / track.width) * 300 * 0.1) + 1)

  // Horizontal scrolling nudges by steps as one undo entry; vertical scrolling is left alone.
  await page.mouse.move(xAt(100), y)
  const before = await now()
  await page.mouse.wheel(0, 120)
  expect(await now()).toBe(before)
  await page.mouse.wheel(16, 0)
  await expect.poll(now).toBeGreaterThan(before)
  await page.keyboard.press("u")
  await expect.poll(now).toBe(before)
  // One trackpad gesture: a quick burst of sideways wheel events.
  await count.evaluate((el) => {
    for (let i = 0; i < 6; i++)
      el.dispatchEvent(new WheelEvent("wheel", { deltaX: 8, bubbles: true, cancelable: true }))
  })
  await expect.poll(now).toBeGreaterThan(before + 10)
  await page.keyboard.press("u")
  await expect.poll(now).toBe(before)
})

test("sideways swipes step presets and choices once per gesture, as one undo entry each", async ({
  page,
}) => {
  await page.goto("/meta.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  const strip = synth.getByRole("radiogroup", { name: "Preset or variant" })
  const waveform = synth.getByRole("radiogroup", { name: "Waveform" })
  // A trackpad flick: rising deltas, then a long fading momentum tail, all as one stream. Sent in
  // one burst: real timers can stall past the gesture gap on a slow CI runner.
  const flick = (sign: number) =>
    page.evaluate((sign) => {
      const el = document.querySelector('[aria-label="synth-voice controls"] .knobs-presets')!
      const deltas = [4, 12, 26, 40, ...Array.from({ length: 40 }, (_, i) => 40 * 0.9 ** (i + 1))]
      let blocked = 0
      for (const d of deltas) {
        const e = new WheelEvent("wheel", { deltaX: d * sign, bubbles: true, cancelable: true })
        el.dispatchEvent(e)
        if (e.defaultPrevented) blocked++
      }
      return blocked === deltas.length
    }, sign)
  const checked = () => strip.locator('[aria-checked="true"]').textContent()
  expect(await checked()).toBe("default")
  expect(await flick(1)).toBe(true)
  expect(await checked()).toBe("warm")
  await page.waitForTimeout(300)
  await flick(1)
  expect(await checked()).toBe("acid")
  await page.waitForTimeout(300)
  await flick(-1)
  expect(await checked()).toBe("warm")
  // Each gesture is one undo entry; the cascade still ripples the rows.
  await expect(synth.locator('[data-field="drive"]')).toHaveAttribute("style", /--k-delay/)
  await synth.getByRole("button", { name: "Undo" }).click()
  expect(await checked()).toBe("acid")

  // Over a segmented choice it steps the options, stopping at the ends.
  const option = () => waveform.locator('[aria-checked="true"]').textContent()
  const before = await option()
  await page.evaluate(() => {
    const el = document.querySelector(
      '[aria-label="synth-voice controls"] [role="radiogroup"][aria-label="Waveform"]',
    )!
    for (const d of [10, 20, 30, 20, 10, 5, 2])
      el.dispatchEvent(new WheelEvent("wheel", { deltaX: -d, bubbles: true, cancelable: true }))
  })
  const options = ["sine", "tri", "saw", "pulse"]
  expect(await option()).toBe(options[Math.max(0, options.indexOf(before!) - 1)])

  // Vertical scrolling over the strip is left to the page.
  const vertical = await page.evaluate(() => {
    const e = new WheelEvent("wheel", { deltaX: 2, deltaY: 40, bubbles: true, cancelable: true })
    document.querySelector('[aria-label="synth-voice controls"] .knobs-presets')!.dispatchEvent(e)
    return e.defaultPrevented
  })
  expect(vertical).toBe(false)
})

test("group reset appears only while its group differs from defaults", async ({ page }) => {
  await page.goto("/meta.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  await expect(synth.locator("header strong")).toHaveText("Synth voice")
  const filterReset = synth.getByRole("button", { name: "Reset Filter" })
  await expect(filterReset).toBeHidden()
  const resonance = synth.getByRole("slider", { name: "Resonance", exact: true })
  await resonance.focus()
  await page.keyboard.press("ArrowRight")
  await expect(filterReset).toBeVisible()
  await expect(synth.getByRole("button", { name: "Reset Oscillator" })).toBeHidden()
  await filterReset.click()
  await expect(resonance).toHaveAttribute("aria-valuenow", "0.42")
  await expect(filterReset).toBeHidden()

  // Vertical stops end at the custom actions row when there is one.
  const tokens = page.getByRole("region", { name: "knobs-tokens controls" })
  await tokens.getByRole("slider", { name: "Preset cascade" }).focus()
  await page.keyboard.press("ArrowDown")
  await expect(tokens.getByRole("button", { name: "Copy CSS" })).toBeFocused()
})

test("presets ripple down the rows, reduced motion moves them together, and glass is a token", async ({
  page,
}) => {
  await page.goto("/meta.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  const delays = () =>
    synth
      .locator("[data-field]")
      .evaluateAll((rows) =>
        rows.map((row) => [
          (row as HTMLElement).dataset.field,
          (row as HTMLElement).style.getPropertyValue("--k-delay"),
        ]),
      )

  // default → acid changes every row but detune; each changed row starts 12 ms after the one above.
  await synth.getByRole("radio", { name: "acid" }).click()
  expect(await delays()).toEqual([
    ["cutoff", "0ms"],
    ["resonance", "12ms"],
    ["drive", "24ms"],
    ["waveform", "36ms"],
    ["detune", ""],
    ["chorus", "48ms"],
  ])
  // A single change never waits.
  await page.waitForTimeout(500)
  await synth.getByRole("radio", { name: "sine" }).click()
  expect(Object.fromEntries(await delays()).waveform).toBe("0ms")

  await page.emulateMedia({ reducedMotion: "reduce" })
  await synth.getByRole("radio", { name: "glass" }).click()
  expect(new Set((await delays()).map(([, d]) => d).filter(Boolean))).toEqual(new Set(["0ms"]))
  await page.emulateMedia({ reducedMotion: "no-preference" })

  // Separators beside a hovered row fade out.
  const resonance = synth.locator('[data-field="resonance"]')
  const drive = synth.locator('[data-field="drive"]')
  await resonance.hover()
  await expect
    .poll(() => drive.evaluate((el) => getComputedStyle(el, "::before").opacity))
    .toBe("0")
  await page.mouse.move(5, 5)
  await expect
    .poll(() => drive.evaluate((el) => getComputedStyle(el, "::before").opacity))
    .toBe("1")

  // Glass: a blurred backdrop under a translucent panel; the meta page's "solid" preset turns it off.
  const backdrop = () => synth.evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(await backdrop()).toContain("blur(14.4px)")
  const tokens = page.getByRole("region", { name: "knobs-tokens controls" })
  await tokens.getByRole("radio", { name: "solid" }).click()
  await expect.poll(backdrop).toContain("blur(0px)")
  await tokens.getByRole("radio", { name: "default" }).click()
  await expect.poll(backdrop).toContain("blur(14.4px)")

  // The GPU renderer keeps a backdrop element under its canvas for each glass panel.
  await page.goto("/meta.html?gpu")
  await expect(synth).toHaveAttribute("data-gpu-active", "true")
  await expect(page.locator(".knobs-gpu-backdrop")).toHaveCount(2)
  await expect
    .poll(() =>
      page
        .locator(".knobs-gpu-backdrop")
        .first()
        .evaluate((el) => getComputedStyle(el).backdropFilter),
    )
    .toContain("blur(14.4px)")
})

test("springs, colours, points and easings: keyboard, coalesced drags, live curves and GPU parity", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/?dom")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="motion"]')
  const values = async () =>
    JSON.parse((await study.locator("[data-render]").getAttribute("data-render"))!)
  const open = async () => {
    const b = (await study.boundingBox())!
    await study.hover({ position: { x: b.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune motion", exact: true }).click()
    const panel = page.getByRole("dialog", { name: "motion controls", exact: true })
    await expect(panel).toBeVisible()
    return panel
  }
  const panel = await open()
  const duration = panel.getByRole("slider", { name: "Travel duration" })
  await expect(duration).toBeFocused()

  // A spring is two slider stops beside its curve; the curve redraws from the same spring math.
  const curve = panel.locator(".knobs-spring-curve .knobs-curve")
  const d = () => curve.evaluate((el) => getComputedStyle(el).getPropertyValue("d"))
  await expect.poll(async () => (await d()).match(/L/g)?.length ?? 0).toBeGreaterThanOrEqual(60)
  const before = await d()
  await page.keyboard.press("ArrowDown")
  await expect(panel.getByRole("slider", { name: "Travel bounce" })).toBeFocused()
  await page.keyboard.press("Shift+ArrowRight")
  expect((await values()).travel).toEqual({ duration: 0.55, bounce: 0.4 })
  await expect.poll(d).not.toBe(before)
  await expect(panel.locator('[data-field="travel"]')).toHaveClass(/knobs-modified/)

  // Disclosure rows: Enter opens, ↓ walks into the editor, Esc folds it and returns to the head.
  await page.keyboard.press("ArrowDown")
  const curveHead = panel.getByRole("button", { name: "Curve", exact: true })
  await expect(curveHead).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(curveHead).toHaveAttribute("aria-expanded", "true")
  await page.keyboard.press("ArrowDown")
  const chips = panel.getByRole("radiogroup", { name: "Curve presets" })
  await expect(chips).toBeFocused()
  await page.keyboard.press("ArrowRight")
  expect((await values()).curve).toEqual([0.34, 1.56, 0.64, 1])
  await expect(chips.getByRole("radio", { name: "back" })).toHaveAttribute("aria-checked", "true")
  await page.keyboard.press("ArrowDown")
  await expect(panel.getByRole("slider", { name: "Curve start handle" })).toBeFocused()
  await page.keyboard.press("Shift+ArrowUp")
  expect((await values()).curve).toEqual([0.34, 1.6, 0.64, 1])
  await page.keyboard.press("Escape")
  await expect(curveHead).toBeFocused()
  await expect(curveHead).toHaveAttribute("aria-expanded", "false")
  await expect(panel.locator('[data-field="curve"] .knobs-x-body')).toBeHidden()
  await expect(panel).toBeVisible()

  // Colour strips: ←→ adjust the focused strip; sRGB clamps chroma but hue moves keep the ask.
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  const tint = panel.getByRole("button", { name: "Tint", exact: true })
  await expect(tint).toBeFocused()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowDown")
  await expect(panel.getByRole("slider", { name: "Tint hue" })).toBeFocused()
  await page.keyboard.press("ArrowRight")
  expect((await values()).tint).toBe("oklch(0.7 0.16 41)")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("End")
  const fitted = (await values()).tint
  expect(fitted).toMatch(/^oklch\(0\.7 0\.1[5-9]\d* 41\)$/)
  await page.keyboard.press("Escape")

  // A pad drag, however long, is one undo step; arrows nudge the puck.
  const target = panel.getByRole("button", { name: "Target", exact: true })
  await target.click()
  const pad = panel.getByRole("slider", { name: "Target" })
  await expect(pad).toBeVisible()
  await panel.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
  )
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(
      box.x + box.width * (0.2 + i * 0.05),
      box.y + box.height * (0.2 + i * 0.04),
    )
  await page.mouse.up()
  expect((await values()).target).not.toEqual({ x: 0.55, y: -0.35 })
  await page.keyboard.press("u")
  expect((await values()).target).toEqual({ x: 0.55, y: -0.35 })
  await pad.focus()
  await page.keyboard.press("ArrowUp")
  expect((await values()).target).toEqual({ x: 0.55, y: -0.37 })

  // Hint mode reaches each row with one code.
  await page.keyboard.press("j")
  await page.keyboard.press("s")
  const badges = await panel.locator(".knobs-hint-layer .knobs-hint").allTextContents()
  expect(badges).toEqual(expect.arrayContaining(["tr", "cu", "ta", "ti"]))
  await page.keyboard.type("cu")
  await expect(curveHead).toBeFocused()

  // Reset brings every field back, exactly.
  await page.keyboard.press("Shift+R")
  expect(await values()).toEqual({
    travel: { duration: 0.55, bounce: 0.3 },
    curve: [0.32, 0.72, 0, 1],
    target: { x: 0.55, y: -0.35 },
    tint: "oklch(0.7 0.16 40)",
  })

  // GPU: the overlay draws the editors (more primitives once they open), shows the same swatch
  // colour, and sleeps once everything settles. (A fresh tab: open panels and editors carry over.)
  await page.evaluate(() => sessionStorage.clear())
  await page.goto("/?gpu")
  const gpuPanel = await open()
  await expect(gpuPanel).toHaveAttribute("data-gpu-active", "true")
  const settled = async () => {
    await page.mouse.move(5, 5)
    await expect.poll(() => page.evaluate(() => window.__knobsGpu!.sleeping)).toBe(true)
    return page.evaluate(() => window.__knobsGpu!.lastInstanceCount)
  }
  const closed = await settled()
  for (const name of ["Tint", "Target", "Curve"])
    await gpuPanel.getByRole("button", { name, exact: true }).click()
  await page.waitForTimeout(400)
  expect(await settled()).toBeGreaterThan(closed + 30)
  const swatch = gpuPanel.locator(".knobs-swatch")
  await expect(swatch).toHaveCSS("opacity", "0")
  const shot = await page.screenshot({ clip: (await swatch.boundingBox())! })
  const rgb = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height).getContext("2d")!
    c.drawImage(img, 0, 0)
    return [...c.getImageData(img.width >> 1, img.height >> 1, 1, 1).data.slice(0, 3)]
  }, shot.toString("base64"))
  // #ef774b
  expect(
    Math.abs(rgb[0]! - 0xef) + Math.abs(rgb[1]! - 0x77) + Math.abs(rgb[2]! - 0x4b),
  ).toBeLessThan(12)
  expect(errors).toEqual([])
})

test("a reload reopens floating panels, open editors and the focused stop, without entrances", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/?dom")
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  const study = page.locator('[data-study="motion"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune motion", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "motion controls", exact: true })
  await expect(panel).toBeVisible()
  const tint = panel.getByRole("button", { name: "Tint", exact: true })
  await tint.click()
  await expect(tint).toHaveAttribute("aria-expanded", "true")
  await panel.getByRole("slider", { name: "Tint hue" }).focus()

  // Like Vite's full reload after a library edit.
  await page.reload()
  await expect(panel).toBeVisible()
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe("none")
  await expect(tint).toHaveAttribute("aria-expanded", "true")
  // The editor is simply open: no reveal runs.
  expect(
    await panel.evaluate(
      (el) =>
        el.getAnimations({ subtree: true }).filter((a) => !(a instanceof CSSTransition)).length,
    ),
  ).toBe(0)
  await expect(panel.getByRole("slider", { name: "Tint hue" })).toBeFocused()

  // Folding the editor and closing the panel are remembered too.
  await page.keyboard.press("Escape")
  await expect(tint).toHaveAttribute("aria-expanded", "false")
  await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await page.reload()
  await page.waitForTimeout(500)
  await expect(panel).toBeHidden()
  expect(errors).toEqual([])
})

test("locks keep rows out of Random and persist; selection; the context menu by keyboard", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/meta.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  const cutoff = synth.getByRole("slider", { name: "Filter cutoff", exact: true })
  const resonance = synth.getByRole("slider", { name: "Resonance", exact: true })
  const drive = synth.getByRole("slider", { name: "Drive", exact: true })
  const row = (field: string) => synth.locator(`[data-field="${field}"]`)
  const selection = () =>
    synth.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>(".knobs-selected")].map((n) => n.dataset.field),
    )

  // ⇧L locks the focused row; Random leaves it alone, and the lock survives a reload.
  await cutoff.focus()
  await page.keyboard.press("Shift+L")
  await expect(row("cutoff")).toHaveClass(/knobs-locked/)
  await expect(row("cutoff").locator(".knobs-lock")).toHaveAttribute("data-on", "true")
  for (let i = 0; i < 6; i++) await page.keyboard.press("r")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2400")
  await page.keyboard.press("Alt+r")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2400")
  await page.reload()
  await expect(row("cutoff")).toHaveClass(/knobs-locked/)
  await cutoff.focus()
  await page.keyboard.press("Shift+L")
  await expect(row("cutoff")).not.toHaveClass(/knobs-locked/)
  await page.keyboard.press("Shift+R")

  // ⇧-click selects a range without moving the slider; ⌘-click toggles; ⇧↓ extends; Esc clears.
  await cutoff.focus()
  const before = await drive.getAttribute("aria-valuenow")
  await row("drive").click({ modifiers: ["Shift"], position: { x: 200, y: 10 } })
  expect(await selection()).toEqual(["cutoff", "resonance", "drive"])
  await expect(drive).toHaveAttribute("aria-valuenow", before!)
  await row("resonance").click({ modifiers: ["Meta"], position: { x: 200, y: 10 } })
  expect(await selection()).toEqual(["cutoff", "drive"])
  await page.keyboard.press("Escape")
  expect(await selection()).toEqual([])
  await resonance.focus()
  await page.keyboard.press("Shift+ArrowDown")
  await page.keyboard.press("Shift+ArrowDown")
  expect(await selection()).toEqual(["resonance", "drive", "waveform"])
  await page.keyboard.press("Shift+ArrowUp")
  expect(await selection()).toEqual(["resonance", "drive"])
  // A plain click clears it.
  await synth.locator("header strong").click()
  expect(await selection()).toEqual([])

  // ⇧F10 opens the menu on the focused row, fully from the keyboard: type to jump, Enter, Esc.
  await resonance.focus()
  await page.keyboard.press("Shift+F10")
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem")).toHaveText([
    /Lock from Random/,
    /Randomize/,
    /Reset/,
    /Copy/,
  ])
  await expect(menu.getByRole("menuitem", { name: /Reset/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  )
  await page.keyboard.press("l")
  await expect(menu.getByRole("menuitem", { name: /Lock/ })).toHaveAttribute("data-active", "")
  await page.keyboard.press("Enter")
  await expect(menu).toBeHidden()
  await expect(row("resonance")).toHaveClass(/knobs-locked/)
  await expect(resonance).toBeFocused()
  await page.keyboard.press("Shift+F10")
  await expect(menu.getByRole("menuitem").first()).toHaveText(/Unlock/)
  await page.keyboard.press("Escape")
  await expect(menu).toBeHidden()
  await expect(resonance).toBeFocused()

  // Right-click a selection: Randomize changes only those rows, as one undo step.
  await cutoff.focus()
  await row("drive").click({ modifiers: ["Shift"], position: { x: 200, y: 10 } })
  await page.keyboard.press("Escape")
  await cutoff.focus()
  await page.keyboard.press("Shift+ArrowDown")
  const box = (await row("cutoff").boundingBox())!
  await page.mouse.click(box.x + 40, box.y + box.height / 2, { button: "right" })
  await expect(menu).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(menu.getByRole("menuitem", { name: /Randomize/ })).toHaveAttribute("data-active", "")
  const detune = synth.getByRole("slider", { name: "Detune", exact: true })
  const detuneBefore = await detune.getAttribute("aria-valuenow")
  await page.keyboard.press("Enter")
  await expect(cutoff).not.toHaveAttribute("aria-valuenow", "2400")
  await expect(resonance).toHaveAttribute("aria-valuenow", "0.42")
  await expect(detune).toHaveAttribute("aria-valuenow", detuneBefore!)
  await page.keyboard.press("u")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2400")
  expect(errors).toEqual([])
})

test("group dice, mutate and hold-to-compare", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/meta.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  const cutoff = synth.getByRole("slider", { name: "Filter cutoff", exact: true })
  const detune = synth.getByRole("slider", { name: "Detune", exact: true })
  const waveform = synth.getByRole("radiogroup", { name: "Waveform" })
  const state = () =>
    synth.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[role=slider],[role=switch],[role=radio]")].map(
        (n) => n.getAttribute("aria-valuenow") ?? n.getAttribute("aria-checked"),
      ),
    )
  const initial = await state()

  // A die beside each group's reset randomizes only that group, as one undo step.
  const oscillator = synth.getByRole("button", { name: "Randomize Oscillator" })
  await expect(oscillator).toBeVisible()
  for (let i = 0; i < 4 && (await detune.getAttribute("aria-valuenow")) === "12"; i++)
    await oscillator.click()
  await expect(detune).not.toHaveAttribute("aria-valuenow", "12")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2400")
  await synth.getByRole("button", { name: "Reset", exact: true }).click()
  expect(await state()).toEqual(initial)

  // g from inside the group does the same; locked rows stay put.
  await waveform.focus()
  await page.keyboard.press("Shift+L")
  for (let i = 0; i < 4 && (await detune.getAttribute("aria-valuenow")) === "12"; i++)
    await page.keyboard.press("g")
  await expect(detune).not.toHaveAttribute("aria-valuenow", "12")
  await expect(waveform.locator('[aria-checked="true"]')).toHaveText("saw")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2400")
  await page.keyboard.press("Shift+L")
  await page.keyboard.press("Shift+R")

  // Hint mode reaches the group dice.
  await cutoff.focus()
  await page.keyboard.press("s")
  await expect(oscillator).toHaveClass(/knobs-hint-match/)
  await page.keyboard.press("Escape")

  // ⌥R nudges every value a little, in one undo step.
  await cutoff.focus()
  await page.keyboard.press("Alt+r")
  await expect.poll(async () => Number(await cutoff.getAttribute("aria-valuenow"))).not.toBe(2400)
  const moved = Math.abs(Number(await cutoff.getAttribute("aria-valuenow")) - 2400)
  expect(moved).toBeLessThanOrEqual((12000 - 80) * 0.12 + 20)
  expect(moved).toBeGreaterThanOrEqual((12000 - 80) * 0.08 - 20)
  await page.keyboard.press("u")
  expect(await state()).toEqual(initial)

  // Holding \ shows the values from before the last change; letting go restores them exactly.
  await cutoff.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  const changed = await state()
  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  await page.keyboard.down("\\")
  await expect(synth).toHaveAttribute("data-comparing", "")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2420")
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(stored)
  await page.keyboard.up("\\")
  await expect(synth).not.toHaveAttribute("data-comparing", "")
  expect(await state()).toEqual(changed)
  await page.keyboard.press("u")
  await expect(cutoff).toHaveAttribute("aria-valuenow", "2420")
  expect(errors).toEqual([])
})

test("a floating panel grows out of its chip and collapses back into it, interruptibly", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  // Frames run on a fake clock, 16 ms apart, so the spring's path is sampled exactly.
  await page.clock.install()
  await page.goto("/?dom")
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  const chip = page.getByRole("button", { name: "Tune splat", exact: true })
  await expect(chip).toBeVisible()
  // Measured once its scale-in has finished.
  await page.waitForTimeout(400)
  const chipBox = (await chip.boundingBox())!
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000)
  type Box = { x: number; y: number; w: number; h: number; label: number }
  const shape = () =>
    page.evaluate(() => {
      const el = document.querySelector(".knobs-morph")
      if (!el) return undefined
      const r = el.getBoundingClientRect()
      const chip = document.querySelector('.knobs-chip[aria-label="Tune splat"]')!
      const label = Number(getComputedStyle(chip).opacity)
      return { x: r.x, y: r.y, w: r.width, h: r.height, label }
    })
  /** Steps frames until the morph settles; `at` runs before a given frame. */
  const film = async (at: Record<number, () => Promise<unknown>> = {}) => {
    const boxes: Box[] = []
    for (let i = 0; i < 120; i++) {
      await at[i]?.()
      await page.clock.runFor(16)
      const box = await shape()
      if (!box && i > Math.max(0, ...Object.keys(at).map(Number))) break
      if (box) boxes.push(box)
    }
    return boxes
  }

  await chip.click()
  await expect(panel).toBeAttached()
  const opening = await film()
  const final = (await panel.boundingBox())!
  // Every frame's shape lies between the chip and the panel (a few px of bounce aside), it
  // passes through sizes in between, the label fades out early, and it settles in about 0.5 s.
  expect(opening.length).toBeGreaterThan(12)
  expect(opening.length).toBeLessThan(45)
  const between = (v: number, a: number, z: number, slack: number) =>
    v >= Math.min(a, z) - slack && v <= Math.max(a, z) + slack
  for (const box of opening) {
    expect(between(box.x, chipBox.x, final.x, 8)).toBe(true)
    expect(between(box.y, chipBox.y, final.y, 8)).toBe(true)
    expect(between(box.w, chipBox.width, final.width, 12)).toBe(true)
    expect(between(box.h, chipBox.height, final.height, 12)).toBe(true)
  }
  expect(opening.some((box) => box.w > chipBox.width + 40 && box.w < final.width - 40)).toBe(true)
  expect(opening[0]!.label).toBeGreaterThan(0.5)
  expect(opening[8]!.label).toBe(0)
  await expect(page.locator(".knobs-morph")).toHaveCount(0)
  await expect(panel).not.toHaveAttribute("data-morphing")
  await expect(panel.getByRole("slider", { name: "seed" })).toBeFocused()

  // Escape collapses it back into the chip, which gets focus back.
  await page.keyboard.press("Escape")
  const closing = await film()
  expect(closing.length).toBeGreaterThan(12)
  expect(closing.at(-1)!.w).toBeLessThan(chipBox.width + 2)
  expect(closing.at(-1)!.label).toBeGreaterThan(0.95)
  await expect(panel).toHaveCount(0)
  await expect(chip).toBeFocused()
  await expect(chip).toBeVisible()

  // Clicking the chip again mid-open reverses from the current shape, keeping its velocity: it
  // grows a little further, turns without a jump and shrinks back; focus returns to the chip.
  await chip.click()
  await expect(panel).toBeAttached()
  const toggled = await film({
    6: () =>
      page.evaluate(() =>
        document.querySelector<HTMLElement>('.knobs-chip[aria-label="Tune splat"]')!.click(),
      ),
  })
  const widths = toggled.map((box) => box.w)
  const peak = widths.indexOf(Math.max(...widths))
  expect(peak).toBeGreaterThan(6)
  expect(widths[peak]!).toBeGreaterThan(chipBox.width + 40)
  expect(widths[peak]!).toBeLessThan(final.width - 8)
  const most = Math.max(...widths.slice(1).map((w, i) => Math.abs(w - widths[i]!)))
  for (let i = 1; i < widths.length; i++)
    expect(Math.abs(widths[i]! - widths[i - 1]!)).toBeLessThanOrEqual(most)
  expect(most).toBeLessThan((final.width - chipBox.width) * 0.2)
  await expect(panel).toHaveCount(0)
  await expect(chip).toBeFocused()

  // A reload reopens an open panel in place, without the morph.
  await chip.click()
  await expect(panel).toBeAttached()
  await film()
  await page.clock.resume()
  await page.reload()
  await expect(panel).toBeVisible()
  await expect(page.locator(".knobs-morph")).toHaveCount(0)
  await expect(panel).not.toHaveAttribute("data-morphing")
  expect(errors).toEqual([])
})

test("design-system geometry contracts: left/right column alignment, concentric radii, and uniform row heights across renderers and densities", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))

  for (const mode of ["dom", "gpu"] as const) {
    await page.goto(`/${mode === "gpu" ? "?gpu" : "?dom"}`)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()

    // Open splat floating dialog so we also measure '+' save button and context menu radii
    const splatStudy = page.locator('[data-study="splat"]')
    const sb = (await splatStudy.boundingBox())!
    await splatStudy.hover({ position: { x: sb.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune splat", exact: true }).click()
    const splatPanel = page.getByRole("dialog", { name: "splat controls", exact: true })
    await expect(splatPanel).toBeVisible()
    await expect(splatPanel).not.toHaveAttribute("data-morphing")

    const remote = page.getByRole("region", { name: "remote-tune controls" })
    await remote.scrollIntoViewIfNeeded()
    if (mode === "gpu") {
      await expect(remote).toHaveAttribute("data-gpu-active", "true")
    }

    // Expand disclosure rows so strip labels/readouts, pad, easing box and chips are visible
    for (const name of ["Fade curve", "Tint", "Anchor"]) {
      const head = remote.getByRole("button", { name, exact: true })
      if ((await head.getAttribute("aria-expanded")) !== "true") await head.click()
    }

    for (const density of ["compact", "default", "comfortable"] as const) {
      await page.getByRole("button", { name: density, exact: true }).click()
      await splatPanel.evaluate((el, d) => ((el as HTMLElement).dataset.density = d), density)
      await page.mouse.move(2, 2)
      // Wait for token transitions and GPU springs to settle
      await remote.evaluate((el) =>
        Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
      )
      await splatPanel.evaluate((el) =>
        Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))),
      )
      if (mode === "gpu") {
        await expect
          .poll(() => page.evaluate(() => window.__knobsGpu?.sleeping ?? false))
          .toBe(true)
      }

      // Open context menu on splat panel to verify menu concentric radii at this density
      await splatPanel.getByRole("slider", { name: "count" }).focus()
      await page.keyboard.press("Shift+F10")
      await expect(page.getByRole("menu")).toBeVisible()

      const m = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[aria-label="remote-tune controls"]')!
        const splat = document.querySelector<HTMLElement>('[aria-label="splat controls"]')!
        const menu = document.querySelector<HTMLElement>(".knobs-menu")!
        const pr = panel.getBoundingClientRect()
        const sr = splat.getBoundingClientRect()
        const L = (el: Element) => el.getBoundingClientRect().left - pr.left
        const R = (el: Element) => pr.right - el.getBoundingClientRect().right
        const H = (el: Element) => el.getBoundingClientRect().height
        const rad = (el: Element) => parseFloat(getComputedStyle(el).borderRadius)

        const saveBtn = splat.querySelector<HTMLElement>(".knobs-preset-save")!
        const saveRange = document.createRange()
        saveRange.selectNodeContents(saveBtn)
        const saveGlyphRight = sr.right - saveRange.getBoundingClientRect().right

        const stripLabel = panel.querySelector<HTMLElement>(".knobs-strip-label")!
        const stripRange = document.createRange()
        stripRange.selectNodeContents(stripLabel)
        const stripGlyphLeft = stripRange.getBoundingClientRect().left - pr.left

        const lefts = [
          L(panel.querySelector("header strong")!),
          ...Array.from(panel.querySelectorAll(".knobs-group-head > span:first-child"), L),
          ...Array.from(panel.querySelectorAll(".knobs-label"), L),
          ...Array.from(panel.querySelectorAll(".knobs-row > span:first-child"), L),
          ...Array.from(panel.querySelectorAll(".knobs-x-label"), L),
          ...Array.from(panel.querySelectorAll(".knobs-strip-label"), L),
          stripGlyphLeft,
          L(panel.querySelector(".knobs-pad")!),
          L(panel.querySelector(".knobs-ease")!),
          L(panel.querySelector(".knobs-ease-chips")!),
        ]

        const rights = [
          ...Array.from(panel.querySelectorAll(".knobs-slider:not(.knobs-sub) .knobs-value"), R),
          ...Array.from(panel.querySelectorAll(".knobs-seg"), R),
          ...Array.from(panel.querySelectorAll(".knobs-toggle"), R),
          R(panel.querySelector(".knobs-spring-curve")!),
          ...Array.from(panel.querySelectorAll(".knobs-x-sum"), R),
          ...Array.from(panel.querySelectorAll(".knobs-strip-read"), R),
          R(panel.querySelector(".knobs-pad")!),
          R(panel.querySelector(".knobs-ease")!),
          R(panel.querySelector(".knobs-head-actions button:last-child .knobs-icon")!),
          ...Array.from(
            panel.querySelectorAll(".knobs-group-head > span:last-child > button:last-child > *"),
            R,
          ),
          saveGlyphRight,
        ]

        const rowTarget = parseFloat(getComputedStyle(panel).getPropertyValue("--kv-row"))
        const rowHeights = [
          ...Array.from(panel.querySelectorAll(".knobs-slider"), H),
          ...Array.from(panel.querySelectorAll(".knobs-row"), H),
          ...Array.from(panel.querySelectorAll(".knobs-x-head"), H),
        ]

        const presetsEl = panel.querySelector<HTMLElement>(".knobs-presets")!
        const presetPillEl = panel.querySelector<HTMLElement>(".knobs-presets-pill")!
        const segEl = panel.querySelector<HTMLElement>(".knobs-seg")!
        const segPillEl = panel.querySelector<HTMLElement>(".knobs-seg-pill")!
        const easeChipsEl = panel.querySelector<HTMLElement>(".knobs-ease-chips")!
        const easeChipEl = panel.querySelector<HTMLElement>(".knobs-ease-chip")!
        const cardEl = panel.querySelector<HTMLElement>(".knobs-card")!
        const menuItemEl = menu.querySelector<HTMLElement>(".knobs-menu-item")!

        return {
          lefts,
          rights,
          rowTarget,
          rowHeights,
          radii: {
            panelDiff: rad(panel) - rad(cardEl),
            presetsDiff:
              rad(presetsEl) -
              rad(presetPillEl) -
              parseFloat(getComputedStyle(presetsEl).paddingTop),
            segDiff: rad(segEl) - rad(segPillEl) - parseFloat(getComputedStyle(segEl).paddingTop),
            easeDiff:
              rad(easeChipsEl) -
              rad(easeChipEl) -
              parseFloat(getComputedStyle(easeChipsEl).paddingTop),
            menuDiff: rad(menu) - rad(menuItemEl) - parseFloat(getComputedStyle(menu).paddingTop),
          },
        }
      })

      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")

      const expectedCol = density === "compact" ? 17 : density === "default" ? 21 : 25
      for (const l of m.lefts) {
        expect(Math.abs(l - expectedCol)).toBeLessThanOrEqual(0.5)
      }
      for (const r of m.rights) {
        expect(Math.abs(r - expectedCol)).toBeLessThanOrEqual(0.5)
      }
      for (const h of m.rowHeights) {
        expect(Math.abs(h - m.rowTarget)).toBeLessThanOrEqual(0.5)
      }
      expect(Math.abs(m.radii.panelDiff - 4)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(m.radii.presetsDiff)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(m.radii.segDiff)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(m.radii.easeDiff)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(m.radii.menuDiff)).toBeLessThanOrEqual(0.5)
    }
  }
  expect(errors).toEqual([])
})

test("full page: cards in columns under a sticky header, keys across cards, numbered presets and custom cards", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/tune.html")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const tune = page.getByRole("region", { name: "iPhone Tune controls" })
  const card = (name: string) => tune.locator(`.knobs-tile[aria-label="${name}"]`)
  // Groups become cards in sections; custom cards join them; the columns follow the width.
  await expect(tune.locator(".knobs-section-head")).toHaveText([
    "Playground",
    "Session List",
    "Transcript",
    "Composer",
  ])
  await expect(card("Spacing")).toBeVisible()
  await expect(tune.locator(".knobs-live")).toHaveCount(2)
  await expect(tune.locator(".knobs-section").nth(1).locator(".knobs-column")).toHaveCount(4)

  // j runs off the end of one card into the next; Tab and ⇧Tab move between groups.
  await page.getByRole("slider", { name: "Room below a header" }).focus()
  await page.keyboard.press("j")
  await expect(page.getByRole("slider", { name: "Fade below the title" })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("slider", { name: "Search morph duration" })).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("slider", { name: "Fade below the title" })).toBeFocused()
  await page.keyboard.press("k")
  await expect(page.getByRole("slider", { name: "Room below a header" })).toBeFocused()

  // 1–9 apply the focused group's numbered preset; the phone applies its own and agrees.
  const rowHeight = page.getByRole("slider", { name: "Row height" })
  await rowHeight.focus()
  await page.keyboard.press("2")
  await expect(rowHeight).toHaveAttribute("aria-valuenow", "38")
  await expect(card("Spacing").getByRole("radio", { name: "2 Compact" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await expect(card("Spacing").locator(".knobs-group-head")).toHaveAttribute("data-peek", "")
  await page.waitForTimeout(400)
  await expect(rowHeight).toHaveAttribute("aria-valuenow", "38")
  await page.keyboard.press("u")
  await expect(rowHeight).toHaveAttribute("aria-valuenow", "44")
  await expect(card("Spacing").getByRole("radio", { name: "1 Today" })).toHaveAttribute(
    "aria-checked",
    "true",
  )

  // A custom card's controls round-trip through the phone.
  const speed = card("Playground & Slow Motion").getByRole("radiogroup", { name: "Speed" })
  await speed.getByRole("radio", { name: "0.25×" }).click()
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => (window as any).__tune.remote.get()["drawer.row.height"])).toBe(
    44,
  )
  await expect(speed.getByRole("radio", { name: "0.25×" })).toHaveAttribute("aria-checked", "true")
  await speed.focus()
  await page.keyboard.press("ArrowRight")
  await expect(speed.getByRole("radio", { name: "0.5×" })).toHaveAttribute("aria-checked", "true")

  // `/` filters rows live and Esc brings them back.
  await rowHeight.focus()
  await page.keyboard.press("/")
  await page.keyboard.type("corner")
  await expect(tune.locator(".knobs-tile:visible")).toHaveCount(3)
  await expect(rowHeight).toBeHidden()
  await page.keyboard.press("Escape")
  await expect(rowHeight).toBeVisible()

  // The header stays put while the page scrolls under it.
  const header = tune.locator(":scope > header")
  await page.mouse.move(700, 500)
  await page.mouse.wheel(0, 700)
  await expect(header).toHaveAttribute("data-scrolled", "")
  expect((await header.boundingBox())!.y).toBe(0)
  await page.mouse.wheel(0, -2000)
  await expect(header).not.toHaveAttribute("data-scrolled", "")

  // The GPU overlay draws the page too.
  await page.goto("/tune.html?gpu")
  await expect(tune.locator(".knobs-tile").first()).toBeVisible()
  await page.waitForTimeout(500)
  expect(errors).toEqual([])
})
