// Slow-motion readout capture: rapid clipped 2× screenshots while a value rolls 98 → 108 → 98.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
const port = 5194
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 3,
    })
    await page.goto(`http://127.0.0.1:${port}/?${mode}`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await page.evaluate(() => document.documentElement.style.setProperty("--k-roll", "2400"))
    const study = page.locator('[data-study="splat"]')
    const b = (await study.boundingBox())!
    await study.hover({ position: { x: b.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune splat", exact: true }).click()
    const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
    await sleep(500)
    const row = (await panel.locator('[data-field="count"]').boundingBox())!
    const clip = { x: row.x + row.width - 64, y: row.y - 2, width: 60, height: row.height + 4 }
    await panel.getByRole("slider", { name: "count" }).focus()
    await sleep(300)
    const dir = `test-results/rollstrip/${mode}`
    mkdirSync(dir, { recursive: true })
    for (const key of ["Shift+ArrowRight", "Shift+ArrowLeft"]) {
      const t0 = Date.now()
      await page.keyboard.press(key)
      while (Date.now() - t0 < 2700) {
        await page.screenshot({
          path: `${dir}/${key.at(-5)}-${String(Date.now() - t0).padStart(5, "0")}.png`,
          clip,
        })
      }
    }
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
