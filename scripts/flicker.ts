// Burst-captures the GPU panel through open, steady state and close; prints frames whose header is blank.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
const port = 5195
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
  await sleep(400)
  const box = (await panel.boundingBox())!
  const dir = "test-results/flicker"
  mkdirSync(dir, { recursive: true })
  const t0 = Date.now()
  let i = 0
  let blank = 0
  const sample = async (tag: string) => {
    const buf = await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: 40 },
    })
    // Count bright pixels in the header strip (the title text).
    const lit = await page.evaluate(async (b64) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext("2d")!
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, img.width, img.height).data
      let n = 0
      for (let k = 0; k < d.length; k += 4)
        if (d[k]! > 200 && d[k + 1]! > 200 && d[k + 2]! > 200) n++
      return n
    }, buf.toString("base64"))
    if (lit < 20) {
      blank++
      await page.screenshot({ path: `${dir}/${tag}-${i}.png`, clip: box })
    }
    i++
  }
  while (Date.now() - t0 < 2500) await sample("steady")
  // Hover and value changes while capturing.
  await panel.getByRole("slider", { name: "count" }).focus()
  for (let k = 0; k < 6; k++) {
    await page.keyboard.press("Shift+ArrowRight")
    await sample("change")
    await sample("change")
  }
  console.log(`frames ${i}, blank header frames ${blank}`)
  await browser.close()
} finally {
  server.kill()
}
