// Checks the GPU frame loop goes to sleep after interactions settle.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
const port = 5196
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/?gpu`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await sleep(300)
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.waitFor()
  const diag = () =>
    page.evaluate(() => {
      const d = window.__knobsGpu!
      return { sleeping: d.sleeping, frames: d.frameCount }
    })
  const report = async (label: string) => {
    await page.mouse.move(5, 5)
    await sleep(1500)
    const a = await diag()
    await sleep(1000)
    const c = await diag()
    console.log(label.padEnd(16), "sleeping", c.sleeping, "frames in last 1s", c.frames - a.frames)
  }
  await report("open")
  await panel.getByRole("radio", { name: "heavy" }).click()
  await report("preset")
  await panel.getByRole("radio", { name: "clean" }).click()
  await report("choice")
  await panel.getByRole("slider", { name: "count" }).focus()
  await page.keyboard.press("Shift+ArrowRight")
  await report("key")
  await page.keyboard.press("?")
  await report("popover")
  await page.keyboard.press("Escape")
  await report("popover close")
  await panel.getByRole("button", { name: "Copy", exact: true }).click()
  await report("status")
  await sleep(3500)
  await report("status gone")
  await browser.close()
} finally {
  server.kill()
}
