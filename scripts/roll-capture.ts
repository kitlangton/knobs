// Captures slider readouts mid-roll (DOM and GPU) to check feathered edges and entering digits.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
const port = 5191
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
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 3,
    })
    await page.goto(`http://127.0.0.1:${port}/${mode === "gpu" ? "?gpu" : ""}`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const study = page.locator('[data-study="splat"]')
    const b = (await study.boundingBox())!
    await study.hover({ position: { x: b.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune splat", exact: true }).click()
    const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
    if (mode === "dom") {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send("Animation.enable")
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
    }
    // count: 98 → 108 crosses 99 → 100, so a digit enters.
    const count = panel.locator('[data-field="count"]')
    await panel.getByRole("slider", { name: "count" }).focus()
    await sleep(500)
    for (const [label, delay] of (mode === "dom"
      ? [
          ["a", 900],
          ["b", 1400],
          ["c", 2600],
        ]
      : [
          ["a", 60],
          ["b", 140],
          ["c", 260],
        ]) as [string, number][]) {
      await page.keyboard.press(label === "a" ? "Shift+ArrowRight" : "Shift+ArrowLeft")
      await sleep(delay)
      await count.screenshot({ path: `test-results/roll-${mode}-${label}.png` })
      await sleep(mode === "dom" ? 5000 : 700)
    }
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
