// Headless visual checks: `bun scripts/capture.ts` writes element screenshots to test-results/cap-*.png
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
    name: "tokens",
    path: "/meta.html",
    async run(page, mode) {
      const panel = page.getByRole("region", { name: "knobs-tokens controls" })
      await panel.screenshot({ path: `test-results/cap-${mode}-tokens.png` })
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
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"]) {
    for (const scene of scenes) {
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
