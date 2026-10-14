// Frame sheets of the chip ⇄ panel morph in both renderers: open, close and an interrupted toggle.
// The page's clock (performance.now and frame times) runs SLOW times slower once the chip is
// hovered, so headless screenshots keep up with the spring.
// Sheets land in OUT (default test-results/morph) as morph-<scene>-<mode>.png.
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"

const port = Number(process.env.PORT) || 5242
const slow = Number(process.env.SLOW) || 10
const out = process.env.OUT || "test-results/morph"
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Shot = { t: number; png: string }

async function film(page: Page, ms: number, every: number, region: Region): Promise<Shot[]> {
  const shots: Shot[] = []
  const start = Date.now()
  while (Date.now() - start < ms) {
    const t = Date.now() - start
    const png = (await page.screenshot({ clip: region })).toString("base64")
    shots.push({ t, png })
    const next = start + shots.length * every
    if (next > Date.now()) await sleep(next - Date.now())
  }
  return shots
}

type Region = { x: number; y: number; width: number; height: number }

async function sheet(page: Page, title: string, shots: Shot[], path: string, cols = 4) {
  const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:6px;justify-content:start">
    ${shots
      .map(
        (s) =>
          `<figure style="margin:0"><img style="display:block;width:420px" src="data:image/png;base64,${s.png}"><figcaption>${(s.t / slow).toFixed(0)} ms</figcaption></figure>`,
      )
      .join("")}</div></body>`
  const p = await page.context().browser()!.newPage({ deviceScaleFactor: 2 })
  await p.setViewportSize({ width: cols * 426 + 24, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

async function hoverChip(page: Page) {
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await sleep(300)
  return page.getByRole("button", { name: "Tune splat", exact: true })
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
  for (const mode of ["dom", "gpu"] as const) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
    })
    await page.addInitScript(() => {
      const real = performance.now.bind(performance)
      let rate = 1
      let from = 0
      let at = 0
      const now = () => at + (real() - from) * rate
      ;(window as any).__slow = (s: number) => {
        at = now()
        from = real()
        rate = 1 / s
      }
      performance.now = now
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb) => raf(() => cb(now()))
    })
    await page.goto(`http://127.0.0.1:${port}/${mode === "gpu" ? "?gpu" : ""}`)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
    await page.evaluate((s) => (window as any).__slow(s), slow)
    const study = (await page.locator('[data-study="splat"]').boundingBox())!
    const region = { x: study.x + study.width - 100, y: study.y - 14, width: 420, height: 300 }
    const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
    const span = 600 * slow

    const chip = await hoverChip(page)
    const open = film(page, span, span / 16, region)
    await chip.click()
    await sheet(page, `Open (${mode})`, await open, `${out}/morph-open-${mode}.png`)

    const close = film(page, span, span / 16, region)
    await panel.press("Escape")
    await sheet(page, `Close (${mode})`, await close, `${out}/morph-close-${mode}.png`)
    await sleep(300)

    // Interrupted: open, then click the chip again 120 ms (real) in, then reopen 100 ms after.
    const chip2 = await hoverChip(page)
    const toggle = film(page, span * 1.6, (span * 1.6) / 24, region)
    await chip2.click()
    await sleep(120 * slow)
    await chip2.click()
    await sleep(100 * slow)
    await chip2.click()
    await sheet(
      page,
      `Interrupted (${mode}): open, chip at 120 ms reverses, chip at 220 ms reopens`,
      await toggle,
      `${out}/morph-interrupt-${mode}.png`,
    )
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
