// Headless visual checks: `bun scripts/capture.ts [scene…]` writes element screenshots to test-results/cap-*.png
// for both renderers. Add scenes below as polish targets come up.
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"

const port = 5192
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const scenes: { name: string; path: string; run(page: Page, mode: string): Promise<void> }[] = [
  {
    name: "synth-acid",
    path: "/meta.html",
    async run(page, mode) {
      const panel = page.getByRole("region", { name: "synth-voice controls" })
      await panel.getByRole("radio", { name: "acid" }).click()
      await sleep(600)
      await panel
        .locator(".knobs-presets")
        .screenshot({ path: `test-results/cap-${mode}-synth-strip.png` })
      await panel.screenshot({ path: `test-results/cap-${mode}-synth.png` })
    },
  },
  {
    name: "synth-states",
    path: "/meta.html",
    async run(page, mode) {
      const panel = page.getByRole("region", { name: "synth-voice controls" })
      await panel.getByRole("slider", { name: "Drive" }).focus()
      await page.keyboard.press("Shift+ArrowRight")
      const res = (await panel.getByRole("slider", { name: "Resonance" }).boundingBox())!
      await page.mouse.move(res.x + res.width * 0.6, res.y + res.height / 2)
      await sleep(700)
      await panel.screenshot({ path: `test-results/cap-${mode}-synth-hover-focus.png` })
      // Held on the default notch mid-drag.
      const cut = (await panel.getByRole("slider", { name: "Filter cutoff" }).boundingBox())!
      const at = (v: number) => cut.x + ((v - 80) / (12000 - 80)) * cut.width
      await page.mouse.move(at(6000), cut.y + cut.height / 2)
      await page.mouse.down()
      await page.mouse.move(at(2400) + 2, cut.y + cut.height / 2, { steps: 8 })
      await sleep(500)
      await panel.screenshot({ path: `test-results/cap-${mode}-synth-magnet.png` })
      await page.mouse.up()
    },
  },
  {
    name: "tokens",
    path: "/meta.html",
    async run(page, mode) {
      const panel = page.getByRole("region", { name: "knobs-tokens controls" })
      await panel.screenshot({ path: `test-results/cap-${mode}-tokens.png` })
    },
  },
  {
    name: "light",
    path: "/meta.html",
    async run(page, mode) {
      const tokens = page.getByRole("region", { name: "knobs-tokens controls" })
      await tokens.getByRole("radio", { name: "light" }).click()
      const panel = page.getByRole("region", { name: "synth-voice controls" })
      await panel.getByRole("radio", { name: "acid" }).click()
      await sleep(800)
      await panel.screenshot({ path: `test-results/cap-${mode}-light-synth.png` })
      await tokens.screenshot({ path: `test-results/cap-${mode}-light-tokens.png` })
    },
  },
  {
    name: "splat",
    path: "/",
    async run(page, mode) {
      const study = page.locator('[data-study="splat"]')
      const b = (await study.boundingBox())!
      await study.hover({ position: { x: b.width - 20, y: 60 } })
      await page.getByRole("button", { name: "Tune splat", exact: true }).click()
      const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
      await panel.waitFor()
      await panel.getByRole("slider", { name: "count" }).focus()
      await page.keyboard.press("Shift+ArrowRight")
      await page.mouse.move(5, 5)
      await sleep(900)
      await panel.screenshot({ path: `test-results/cap-${mode}-splat.png` })
    },
  },
  {
    // The floating panel dragged over the ink study, at glass 0, the default and 1.
    name: "glass",
    path: "/",
    async run(page, mode) {
      const study = page.locator('[data-study="splat"]')
      const b = (await study.boundingBox())!
      await study.hover({ position: { x: b.width - 20, y: 60 } })
      await page.getByRole("button", { name: "Tune splat", exact: true }).click()
      const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
      await panel.waitFor()
      const head = (await panel.locator("header strong").boundingBox())!
      await page.mouse.move(head.x + 10, head.y + head.height / 2)
      await page.mouse.down()
      // Straddle the art's right edge: ink, splats and the light page all pass under the glass.
      const art = (await study.locator(".art").boundingBox())!
      const size = (await panel.boundingBox())!
      await page.mouse.move(art.x + art.width - size.width / 2 + 10, art.y + 30, { steps: 6 })
      await page.mouse.up()
      await page.mouse.move(5, 5)
      const p = (await panel.boundingBox())!
      const clip = { x: p.x - 40, y: p.y - 30, width: p.width + 80, height: p.height + 60 }
      for (const glass of ["0", "0.6", "1"]) {
        await page.evaluate(
          (g) => document.documentElement.style.setProperty("--k-glass", g),
          glass,
        )
        await page.evaluate(() => window.__knobsGpu?.wake())
        await sleep(600)
        await page.screenshot({ path: `test-results/cap-${mode}-glass-${glass}.png`, clip })
      }
    },
  },
  {
    // Spring, easing, point and colour rows, closed then open, in dark and light.
    name: "motion",
    path: "/",
    async run(page, mode) {
      const study = page.locator('[data-study="motion"]')
      const b = (await study.boundingBox())!
      await study.hover({ position: { x: b.width - 20, y: 60 } })
      await page.getByRole("button", { name: "Tune motion", exact: true }).click()
      const panel = page.getByRole("dialog", { name: "motion controls", exact: true })
      await panel.waitFor()
      for (const theme of ["dark", "light"]) {
        await panel.evaluate((el, t) => ((el as HTMLElement).dataset.theme = t), theme)
        for (const open of [false, true]) {
          for (const name of ["Curve", "Target", "Tint"]) {
            const head = panel.getByRole("button", { name, exact: true })
            if ((await head.getAttribute("aria-expanded")) !== String(open)) await head.click()
          }
          await page.mouse.move(5, 5)
          await sleep(900)
          await panel.screenshot({
            path: `test-results/cap-${mode}-motion-${theme}-${open ? "open" : "closed"}.png`,
          })
        }
      }
    },
  },
  {
    name: "remote",
    path: "/",
    async run(page, mode) {
      const panel = page.getByRole("region", { name: "remote-tune controls" })
      await panel.scrollIntoViewIfNeeded()
      await sleep(600)
      await panel.screenshot({ path: `test-results/cap-${mode}-remote.png` })
      for (const [theme, density] of [
        ["light", "compact"],
        ["dark", "comfortable"],
      ]) {
        await page.getByRole("button", { name: theme, exact: true }).click()
        await page.getByRole("button", { name: density, exact: true }).click()
        await page.mouse.move(5, 5)
        await sleep(700)
        await panel.screenshot({ path: `test-results/cap-${mode}-remote-${theme}-${density}.png` })
      }
    },
  },
]

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const only = process.argv.slice(2)
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"]) {
    for (const scene of scenes) {
      if (only.length && !only.includes(scene.name)) continue
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      })
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.goto(`http://127.0.0.1:${port}${scene.path}${mode === "gpu" ? "?gpu" : "?dom"}`)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await sleep(500)
      await scene.run(page, mode)
      if (errors.length) console.log(mode, scene.name, errors)
      await page.close()
    }
  }
  await browser.close()
} finally {
  server.kill()
}
