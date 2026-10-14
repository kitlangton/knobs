// Frame sheets of the chip ⇄ panel morph in both renderers: an open (down and to the right of the
// chip), a close, and an interrupted toggle. The page runs on a clock of its own (performance.now
// and frame times): it stands still while each frame is drawn and screenshotted, then steps STEP
// ms, so every frame of the springs is caught however slow the screenshots are.
// Sheets land in OUT (default test-results/morph) as <PREFIX><scene>-<mode>.png. URL reuses a
// running examples server instead of starting one on PORT.
import { chromium, type Locator, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"

const port = Number(process.env.PORT) || 5242
const step = Number(process.env.STEP) || 12
const out = process.env.OUT || "test-results/morph"
const prefix = process.env.PREFIX ?? "morph-"
const base = process.env.URL || `http://127.0.0.1:${port}`
const server = process.env.URL
  ? undefined
  : spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Shot = { t: number; png: string }
type Region = { x: number; y: number; width: number; height: number }

/** Advances the page's clock by `ms` and waits for two frames drawn at the new time. */
const advance = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<void>((done) => {
        ;(window as any).__advance(ms)
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      }),
    ms,
  )

/** Runs `actions` (keyed by the frame before which they happen), filming `frames` frames. */
async function film(
  page: Page,
  frames: number,
  region: Region,
  actions: Record<number, () => Promise<unknown>> = {},
): Promise<Shot[]> {
  const shots: Shot[] = []
  for (let i = 0; i < frames; i++) {
    await actions[i]?.()
    await advance(page, i === 0 ? 0 : step)
    const png = (await page.screenshot({ clip: region, type: "jpeg", quality: 88 })).toString(
      "base64",
    )
    shots.push({ t: i * step, png })
  }
  return shots
}

async function sheet(page: Page, title: string, shots: Shot[], path: string, cols = 8) {
  const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:6px;justify-content:start">
    ${shots
      .map(
        (s) =>
          `<figure style="margin:0"><img style="display:block;width:230px" src="data:image/jpeg;base64,${s.png}"><figcaption>${s.t.toFixed(0)} ms</figcaption></figure>`,
      )
      .join("")}</div></body>`
  const p = await page.context().browser()!.newPage({ deviceScaleFactor: 2 })
  await p.setViewportSize({ width: cols * 236 + 24, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

async function hoverChip(page: Page): Promise<Locator> {
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await sleep(300)
  return page.getByRole("button", { name: "Tune splat", exact: true })
}

/** Lets the page's clock run in real time for `ms`, so whatever is moving settles. */
async function settle(page: Page, ms = 600) {
  await page.evaluate(() => (window as any).__run())
  await sleep(ms)
  await page.evaluate(() => (window as any).__hold())
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) break
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
      let running = true
      let from = 0
      let at = 0
      const now = () => (running ? at + real() - from : at)
      Object.assign(window, {
        __hold: () => {
          at = now()
          running = false
        },
        __run: () => {
          from = real()
          running = true
        },
        __advance: (ms: number) => {
          at = now() + ms
        },
      })
      performance.now = now
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (cb) => raf(() => cb(now()))
    })
    await page.goto(`${base}/?${mode}`)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
    const study = (await page.locator('[data-study="splat"]').boundingBox())!
    const region = { x: study.x + study.width - 50, y: study.y - 4, width: 360, height: 300 }
    const panel = page.getByRole("dialog", { name: "splat controls", exact: true })

    // Warm up once, so the panel's module is loaded before anything is filmed.
    await (await hoverChip(page)).click()
    await panel.waitFor()
    await sleep(600)
    await panel.press("Escape")
    await sleep(600)

    // Open: pointer down on the chip, released 36 ms later, as a quick click.
    const chip = await hoverChip(page)
    const box = (await chip.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.evaluate(() => (window as any).__hold())
    const open = await film(page, 32, region, {
      1: () => page.mouse.down(),
      4: () => page.mouse.up(),
    })
    await sheet(
      page,
      `Open, down and right (${mode}): the press squeezes the cog, the leading edges stretch ahead, content unblurs behind`,
      open,
      `${out}/${prefix}open-${mode}.png`,
    )
    await settle(page)

    const close = await film(page, 24, region, { 1: () => panel.press("Escape") })
    await sheet(
      page,
      `Close (${mode}): content blurs out first, then the glass pulls into the cog`,
      close,
      `${out}/${prefix}close-${mode}.png`,
    )
    await settle(page)

    // Interrupted: open, chip again 120 ms in (reverses), again 96 ms later (reopens).
    const chip2 = await hoverChip(page)
    await page.evaluate(() => (window as any).__hold())
    const click = () => chip2.evaluate((el: HTMLElement) => el.click())
    const toggle = await film(page, 48, region, { 1: click, 11: click, 19: click })
    await sheet(
      page,
      `Interrupted (${mode}): open; the chip again at ${10 * step} ms reverses, and at ${18 * step} ms reopens`,
      toggle,
      `${out}/${prefix}interrupt-${mode}.png`,
    )
    await settle(page)
    await page.close()
  }
  await browser.close()
} finally {
  server?.kill()
}
