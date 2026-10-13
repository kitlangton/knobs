// Interaction audit: drives the dev example headlessly and prints what each gesture actually did.
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"

const port = 5190
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const log = (...a: unknown[]) => console.log(...a)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function openSplat(page: Page) {
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.waitFor()
  await sleep(300)
  return panel
}
const values = (page: Page) =>
  page.locator('[data-study="splat"] [data-render]').getAttribute("data-render")

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"]) {
    log(`\n===== ${mode} =====`)
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto(`http://127.0.0.1:${port}/${mode === "gpu" ? "?gpu" : ""}`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const panel = await openSplat(page)
    log(
      "renderer",
      await panel.getAttribute("data-renderer"),
      await panel.getAttribute("data-gpu-active"),
    )

    // 1. Slider drag past the right edge, then one undo
    const before = await values(page)
    const count = panel.locator('[data-field="count"]')
    const cb = (await count.boundingBox())!
    await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height / 2)
    await page.mouse.down()
    for (let x = cb.x + cb.width * 0.3; x < cb.x + cb.width + 120; x += 20)
      await page.mouse.move(x, cb.y + cb.height / 2)
    const midTransform = await count.evaluate((el) => getComputedStyle(el).transform)
    await page.mouse.up()
    await sleep(500)
    log(
      "drag past edge ->",
      await panel.getByRole("slider", { name: "count" }).getAttribute("aria-valuenow"),
      "stretch while held:",
      midTransform,
    )
    await page.keyboard.press("u")
    log("one undo restores pre-drag:", (await values(page)) === before)

    // 2. Click a slider track (snap), then drag that starts on the value readout
    await page.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height / 2)
    log(
      "click mid track ->",
      await panel.getByRole("slider", { name: "count" }).getAttribute("aria-valuenow"),
    )
    const vb = (await count.locator(".knobs-value").boundingBox())!
    await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2)
    await page.mouse.down()
    await page.mouse.move(vb.x - 80, vb.y + vb.height / 2, { steps: 5 })
    await page.mouse.up()
    log(
      "drag starting on value: editor open =",
      await count.locator(".knobs-number").isVisible(),
      "value",
      await panel.getByRole("slider", { name: "count" }).getAttribute("aria-valuenow"),
    )
    if (await count.locator(".knobs-number").isVisible()) await page.keyboard.press("Escape")

    // 3. Preset scrub across chips: undo entries
    const strip = panel.locator(".knobs-presets")
    await panel.getByRole("button", { name: "Reset", exact: true }).click()
    const chips = strip.locator(".knobs-preset-chip")
    log("chips:", await chips.allTextContents())
    const c0 = (await chips.first().boundingBox())!
    const cl = (await chips.last().boundingBox())!
    await page.mouse.move(c0.x + 4, c0.y + c0.height / 2)
    await page.mouse.down()
    await page.mouse.move(cl.x + cl.width - 4, cl.y + cl.height / 2, { steps: 12 })
    await page.mouse.move(cl.x + cl.width + 80, cl.y + cl.height / 2, { steps: 4 })
    await page.mouse.up()
    log("after scrub active:", await strip.getAttribute("data-active-preset"))
    let undos = 0
    while (undos < 8 && (await strip.getAttribute("data-active-preset")) !== "p:default") {
      await page.keyboard.press("u")
      undos++
    }
    log("undos to get back to default after one scrub:", undos)

    // 4. Keyboard: tab order and arrows from non-row targets
    await strip.focus()
    const order: string[] = []
    for (let i = 0; i < 16; i++) {
      order.push(
        await page.evaluate(() => {
          const a = document.activeElement as HTMLElement
          return (a.getAttribute("aria-label") || a.textContent || a.className).trim().slice(0, 18)
        }),
      )
      await page.keyboard.press("Tab")
    }
    log("tab order from strip:", order.join(" | "))
    await strip.focus()
    await page.keyboard.press("ArrowDown")
    log(
      "↓ from strip ->",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )
    await panel.getByRole("button", { name: "Random", exact: true }).focus()
    await page.keyboard.press("ArrowUp")
    log(
      "↑ from Random ->",
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent,
      ),
    )
    await panel.getByRole("slider", { name: "seed" }).focus()
    await page.keyboard.press("ArrowUp")
    log(
      "↑ from first row ->",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )

    // 5. Hint mode coverage
    await panel.getByRole("slider", { name: "seed" }).focus()
    await page.keyboard.press("s")
    log("hint badges:", await panel.locator(".knobs-hint").allTextContents())
    await sleep(250)
    await panel.screenshot({ path: `test-results/audit-${mode}-hint.png` })
    await page.keyboard.press("r")
    await page.keyboard.press("a")
    log("s r a ->", await page.evaluate(() => document.activeElement?.textContent))
    await page.keyboard.press("s")
    await page.keyboard.press("h")
    log(
      "s h ->",
      await strip.getAttribute("data-active-preset"),
      "focus",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )
    await page.keyboard.press("s")
    await page.keyboard.press("Escape")
    log("panel still open after hint Esc:", await panel.isVisible())

    // Tab wraps inside the floating panel
    await panel.getByRole("button", { name: "Variants" }).focus()
    await page.keyboard.press("Tab")
    log(
      "Tab from last ->",
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent,
      ),
    )
    await page.keyboard.press("Shift+Tab")
    log(
      "Shift+Tab back ->",
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent,
      ),
    )
    await panel.getByRole("button", { name: "Random" }).focus()
    await page.keyboard.press("ArrowRight")
    log("→ on Random ->", await page.evaluate(() => document.activeElement?.textContent))

    // 6. Header drag by title
    const title = panel.locator("header strong")
    const tb = (await title.boundingBox())!
    const pb0 = (await panel.boundingBox())!
    await page.mouse.move(tb.x + 5, tb.y + tb.height / 2)
    await page.mouse.down()
    await page.mouse.move(tb.x - 200, tb.y + 150, { steps: 6 })
    await page.mouse.up()
    const pb1 = (await panel.boundingBox())!
    log("header drag moved by", Math.round(pb1.x - pb0.x), Math.round(pb1.y - pb0.y))

    // 7. Toggle/choice by click and keyboard; focus visibility
    await panel.getByRole("switch", { name: "grain" }).click()
    log(
      "focus after switch click:",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )
    await panel.getByRole("radio", { name: "clean" }).click()
    log(
      "focus after choice click:",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )

    // 8. Esc closes, focus returns
    await page.keyboard.press("Escape")
    log(
      "closed:",
      (await panel.count()) === 0,
      "focus:",
      await page.evaluate(() => document.activeElement?.getAttribute("aria-label")),
    )
    log("errors:", errors)
    await page.goto(`http://127.0.0.1:${port}/${mode === "gpu" ? "?gpu" : ""}`)
    const fresh = await openSplat(page)
    await sleep(400)
    await fresh.screenshot({ path: `test-results/audit-${mode}-panel.png` })
    await page.goto(`http://127.0.0.1:${port}/meta.html${mode === "gpu" ? "?gpu" : ""}`)
    await sleep(800)
    await page.screenshot({ path: `test-results/audit-${mode}-meta.png` })
    const metaPanel = page.getByRole("region", { name: "knobs-tokens controls" })
    await metaPanel.getByRole("slider", { name: "Accent hue" }).focus()
    await page.keyboard.press("s")
    await sleep(250)
    log("meta hint badges:", await metaPanel.locator(".knobs-hint").allTextContents())
    await metaPanel.screenshot({ path: `test-results/audit-${mode}-meta-hint.png` })
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
