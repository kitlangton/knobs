// Proof for the page's columns, in both renderers: screenshots of the tune page at 1440 and 1920,
// and frame sheets of an editor expanding (cards below glide), a resize reflow (3 → 2 columns)
// and the Playground's Composer switch (its card eases, buttons cross-fade, other columns hold).
// The page's clock (performance.now, frame times and CSS/WAAPI animations) runs SLOW times
// slower while filming, so headless screenshots keep up.
// bun scripts/columns-capture.ts --port=5343 [--out=dir] [--prefix=name-] [--only=editor]
import { chromium, type Browser, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const port = Number(arg("port") ?? 5343)
const out = arg("out") ?? "test-results/columns"
const prefix = arg("prefix") ?? ""
const only = arg("only")
const slow = Number(arg("slow") ?? 10)
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
type Region = { x: number; y: number; width: number; height: number }
type Shot = { t: number; png: string }

async function open(browser: Browser, mode: "dom" | "gpu", width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: "dark" })
  page.on("pageerror", (e) => console.error(`${mode}: ${e.message}`))
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
  await page.goto(`http://127.0.0.1:${port}/tune.html?theme=dark${mode === "gpu" ? "&gpu" : ""}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator(".knobs-page").waitFor()
  if (mode === "gpu")
    await page.waitForFunction(
      () => document.querySelector(".knobs-page")?.getAttribute("data-gpu-active") === "true",
    )
  await sleep(900)
  return page
}

async function slowDown(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
}

async function film(page: Page, ms: number, count: number, region: Region): Promise<Shot[]> {
  const shots: Shot[] = []
  const start = Date.now()
  const every = ms / count
  while (shots.length < count) {
    const t = Date.now() - start
    shots.push({ t, png: (await page.screenshot({ clip: region })).toString("base64") })
    const next = start + shots.length * every
    if (next > Date.now()) await sleep(next - Date.now())
  }
  return shots
}

async function sheet(browser: Browser, title: string, shots: Shot[], path: string, w = 360) {
  const cols = 4
  const html = `<body style="margin:0;background:#0b0b0c;color:#aaa;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},auto);gap:8px;justify-content:start">
    ${shots
      .map(
        (s) =>
          `<figure style="margin:0"><img style="display:block;width:${w}px;border:1px solid #222" src="data:image/png;base64,${s.png}"><figcaption>${(s.t / slow).toFixed(0)} ms</figcaption></figure>`,
      )
      .join("")}</div></body>`
  const p = await browser.newPage({ deviceScaleFactor: 2 })
  await p.setViewportSize({ width: cols * (w + 8) + 24, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
  console.log(path)
}

/** A page of editors in place of the tune page: Look's colour and easing open in place. */
async function mountFixture(page: Page) {
  await page.evaluate(() => {
    const { knobs: k, mountPage } = (window as any).__knobs
    ;(window as any).__tune.page.dispose()
    const n = (value: number, group: string, section: string) =>
      k.knob(value, { min: 0, max: 100, group, section })
    const controls = k.defineControls(
      "fixture",
      {
        tint: k.color("#5b8cff", { group: "Look", section: "Style" }),
        curve: k.easing("ease-out", { group: "Look", section: "Style" }),
        glow: n(40, "Look", "Style"),
        radius: n(12, "Shape", "Style"),
        border: n(1, "Shape", "Style"),
        inset: n(8, "Shape", "Style"),
        weight: k.choice("medium", ["regular", "medium", "bold"], {
          group: "Type",
          section: "Style",
        }),
        size: n(15, "Type", "Style"),
        open: k.spring({ duration: 0.4, bounce: 0.1 }, { group: "Springs", section: "Motion" }),
        close: k.spring({ duration: 0.3, bounce: 0 }, { group: "Springs", section: "Motion" }),
        delay: n(20, "Timing", "Motion"),
        stagger: n(30, "Timing", "Motion"),
        columns: n(3, "Grid", "Layout"),
        gutter: n(16, "Grid", "Layout"),
        margin: n(24, "Grid", "Layout"),
        rows: n(44, "Rows", "Layout"),
        gap: n(8, "Rows", "Layout"),
      },
      { storage: k.memoryStorage() },
    )
    const app = document.querySelector<HTMLElement>("#app")!
    app.replaceChildren()
    ;(window as any).__fixture = mountPage(controls, app, {
      title: "Columns",
      theme: "dark",
      sections: ["Style", "Motion", "Layout"],
    })
  })
  await sleep(600)
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!

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
    if (!only || only === "shots")
      for (const [w, h] of [
        [1440, 900],
        [1920, 1080],
      ] as const) {
        const page = await open(browser, mode, w, h)
        const path = `${out}/${prefix}${mode}-dark-${w}.png`
        await page.screenshot({ path })
        console.log(path)
        await page.close()
      }

    if (!only || only === "editor") {
      const page = await open(browser, mode, 1100, 900)
      await mountFixture(page)
      const look = await box(page, '.knobs-tile[aria-label="Look"]')
      const region = { x: look.x - 16, y: look.y - 40, width: look.width * 2 + 48, height: 620 }
      await slowDown(page)
      const shots = film(page, 420 * slow, 16, region)
      await page.locator('.knobs-tile[aria-label="Look"] .knobs-x-head').first().click()
      await sheet(
        browser,
        `Editor expanding (${mode}): Look's colour opens; Shape and Type below glide`,
        await shots,
        `${out}/${prefix}editor-${mode}.png`,
      )
      await page.close()
    }

    if (!only || only === "reflow") {
      const page = await open(browser, mode, 1100, 860)
      await slowDown(page)
      const shots = film(page, 700 * slow, 20, { x: 0, y: 0, width: 900, height: 860 })
      await page.setViewportSize({ width: 900, height: 860 })
      await sheet(
        browser,
        `Resize reflow (${mode}): 1100 → 900 px, 3 → 2 columns; cards glide to their new places`,
        await shots,
        `${out}/${prefix}reflow-${mode}.png`,
        300,
      )
      await page.close()
    }

    if (!only || only === "composer") {
      const page = await open(browser, mode, 1440, 900)
      const playground = page.locator('.knobs-tile[aria-label="Playground & Slow Motion"]')
      const pick = (name: string) => playground.getByRole("radio", { name, exact: true }).click()
      const region = { x: 16, y: 56, width: 712, height: 560 }
      await pick("Off")
      await sleep(600)
      await slowDown(page)
      let shots = film(page, 420 * slow, 12, region)
      await pick("Composer")
      const opening = await shots
      shots = film(page, 420 * slow, 12, region)
      await pick("Transcript")
      const swapping = await shots
      await sheet(
        browser,
        `Composer switch (${mode}): Off → Composer, the card eases open and Call/Dictation fade in; then Composer → Transcript cross-fades. The Session List column holds still.`,
        [...opening, ...swapping.map((s) => ({ ...s, t: s.t + 420 * slow }))],
        `${out}/${prefix}composer-${mode}.png`,
      )
      await page.close()
    }
  }
  await browser.close()
} finally {
  server.kill()
}
