// Proof for the tune page's highlight, collapsible cards and named card presets, in both renderers:
// the page with a highlighted section, a frame sheet of the highlight moving as the phone changes
// screen, and one of the Connection card folding away when the phone pairs.
// bun scripts/highlight-shots.ts --port=5197 --out=/path/prefix
import { type Browser, chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const port = Number(arg("port")) || 5197
const out = arg("out") ?? "test-results/knobs-highlight"
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Clip = { x: number; y: number; width: number; height: number }
type Frame = { ms: number; jpg: Buffer }
/** Every frame Chrome paints (a screencast) for `ms` after `act` starts. */
async function film(page: Page, act: () => Promise<void>, ms: number) {
  const cdp = await page.context().newCDPSession(page)
  const frames: Frame[] = []
  let start = 0
  cdp.on("Page.screencastFrame", async (frame) => {
    frames.push({
      ms: Math.round(performance.now() - start),
      jpg: Buffer.from(frame.data, "base64"),
    })
    await cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 })
  await sleep(150)
  start = performance.now()
  frames.length = 0
  const acting = act()
  await sleep(ms)
  await acting
  await cdp.send("Page.stopScreencast")
  await cdp.detach()
  return frames
}

/** Lays frames out in a grid, each cropped to `clip`, with their times, as one image. */
async function sheet(
  browser: Browser,
  title: string,
  frames: Frame[],
  clip: Clip,
  columns: number,
  path: string,
) {
  const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  const width = (1600 - 40 - 12 * (columns - 1)) / columns
  const scale = width / clip.width
  await sheetPage.setContent(`<!doctype html><html><body style="margin:0;background:#0b0b0d;color:#ddd;font:13px system-ui">
    <h1 style="font:600 15px system-ui;margin:16px 20px 4px">${title}</h1>
    <div style="display:grid;grid-template-columns:repeat(${columns},${width}px);gap:12px;padding:12px 20px 20px">
    ${frames
      .map(
        (f) =>
          `<figure style="margin:0"><div style="width:${width}px;height:${clip.height * scale}px;border-radius:6px;overflow:hidden;position:relative"><img style="position:absolute;left:${-clip.x * scale}px;top:${-clip.y * scale}px;width:${1440 * scale}px" src="data:image/jpeg;base64,${f.jpg.toString("base64")}"></div><figcaption style="margin-top:4px;color:#999">${f.ms} ms</figcaption></figure>`,
      )
      .join("")}</div></body></html>`)
  await sheetPage.waitForTimeout(300)
  await sheetPage.screenshot({ path, fullPage: true })
  await sheetPage.close()
}

/** From the frame before the picture first changes, for `ms`. */
const settling = (frames: Frame[], ms: number) => {
  const at = frames.findIndex((f) => Math.abs(f.jpg.length - frames[0]!.jpg.length) > 400)
  if (at < 0) return frames
  const from = frames[Math.max(0, at - 1)]!
  return frames.filter((f) => f.ms >= from.ms && f.ms <= from.ms + ms)
}
/** Every `step`th frame, always keeping the first and last. */
const pick = (frames: Frame[], count: number) => {
  if (frames.length <= count) return frames
  const step = (frames.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => frames[Math.round(i * step)]!)
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"] as const) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(`http://127.0.0.1:${port}/tune.html?${mode}`)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
    const tune = page.getByRole("region", { name: "iPhone Tune controls" })
    await tune.locator(".knobs-tile").first().waitFor()
    await page.mouse.move(1, 1)

    // The Connection card folds away as the phone pairs (about 3 s in).
    const connection = tune.locator('[data-card="Connection"]')
    const column = await connection.evaluate((c) => {
      const r = c.parentElement!.getBoundingClientRect()
      return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: 460 }
    })
    await page.waitForFunction(() => performance.now() > 2600)
    const fold = await film(
      page,
      () =>
        page
          .waitForSelector('[data-card="Connection"][data-collapsed]', { timeout: 6000 })
          .then(() => {}),
      1600,
    )
    // From just before the fold to where it rests.
    const at = fold.findIndex((f, i) => i > 0 && f.jpg.length !== fold[i - 1]!.jpg.length)
    await sheet(
      browser,
      `Connection card folds when the phone pairs (${mode.toUpperCase()}): the cards below glide`,
      pick(fold.slice(Math.max(0, at - 2), at + 40), 10),
      column,
      5,
      `${out}-collapse-${mode}.png`,
    )

    // The page, highlighting the phone's screen (Transcript, with the composer on it).
    await sleep(600)
    await page.screenshot({ path: `${out}-page-${mode}.png` })

    // The phone goes to the session list: the highlight moves there.
    const moving = await film(
      page,
      () =>
        page.evaluate(() =>
          (window as any).__tune.send({ type: "playground", playground: "sessionList" }),
        ),
      900,
    )
    await sheet(
      browser,
      `Highlight follows the phone: Transcript → Session List (${mode.toUpperCase()})`,
      pick(settling(moving, 500), 6),
      { x: 20, y: 50, width: 1080, height: 380 },
      2,
      `${out}-moving-${mode}.png`,
    )
    await sleep(500)
    await page.screenshot({ path: `${out}-session-list-${mode}.png` })
    console.log(mode, "errors", errors)
    await page.close()
  }
  await browser.close()
} finally {
  server.kill()
}
