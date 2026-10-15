// Proof shots for OC-345 (a page that folds by section) on the tune demo, in both renderers: the
// page as it opens (the phone's sections folded, what's on its screen opened, the jump strip),
// folded summaries and descriptions side by side, and motion frame sheets of a section folding,
// a jump from the strip and the phone's screen changing (context expand and refold). The page's
// clock and its CSS/WAAPI motion run SLOW times slower while filming.
// BASE=http://127.0.0.1:5471 OUT=dir bun scripts/oc345-shots.ts   (ONLY=page,states,motion-… MODES=dom,gpu)
import { type Browser, chromium, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:5471"
const out = process.env.OUT ?? "/tmp/oc345"
const prefix = process.env.PREFIX ?? "2026-10-15-knobs-oc345"
const only = process.env.ONLY?.split(",")
const modes = (process.env.MODES ?? "dom,gpu").split(",")
const slow = Number(process.env.SLOW) || 8
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }
type Frame = { t: number; png: Buffer; crop?: { region: Region; vw: number } }

async function open(mode: string, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`))
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
  await page.goto(`${base}/tune.html?theme=dark&still&${mode}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => (window as any).__tune)
  // The phone pairs and reports its first jumps in the first few seconds; let that settle.
  await sleep(3600)
  await page.mouse.move(2, 2)
  return page
}
const tune = (page: Page, src: string) => page.evaluate(src)

// Frames come from the compositor's screencast (what was painted), not screenshots, which can
// catch a native smooth scroll half-applied.
async function film(page: Page, region: Region, ms: number, act: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
  const shots: Frame[] = []
  let start = Date.now()
  cdp.on("Page.screencastFrame", (f) => {
    shots.push({ t: Math.max(0, Date.now() - start), png: Buffer.from(f.data, "base64") })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(300)
  start = Date.now()
  const span = ms * slow
  const acting = act()
  await sleep(span)
  await acting
  await cdp.send("Page.stopScreencast")
  await page.evaluate(() => (window as any).__slow(1))
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  // Evenly in time: the last frame painted by each moment (a still page paints none).
  const vw = page.viewportSize()!.width
  return Array.from({ length: 10 }, (_, i) => (i * span) / 9).map((at) => {
    const shot = shots.filter((s) => s.t <= at).at(-1) ?? shots[0]!
    return { t: at / slow, png: shot.png, crop: { region, vw } }
  })
}

async function sheet(
  title: string,
  rows: { label: string; shots: (Frame & { caption?: string })[] }[],
  path: string,
  width = 300,
  across = 5,
) {
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:12px -apple-system,system-ui;padding:16px">
    <div style="font-size:15px;color:#eee;margin-bottom:12px">${title}</div>
    ${rows
      .map(
        (r) => `<div style="color:#ddd;margin:10px 0 6px">${r.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${r.shots
        .map((s) => {
          const src = `data:image/png;base64,${s.png.toString("base64")}`
          const k = s.crop ? width / s.crop.region.width : 1
          const img = s.crop
            ? `<div style="width:${width}px;height:${s.crop.region.height * k}px;background:url(${src}) ${-s.crop.region.x * k}px ${-s.crop.region.y * k}px/${s.crop.vw * k}px auto no-repeat"></div>`
            : `<img style="display:block;width:${width}px" src="${src}">`
          return `<figure style="margin:0">${img}<figcaption>${s.caption ?? `${s.t.toFixed(0)} ms`}</figcaption></figure>`
        })
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5 })
  await p.setViewportSize({ width: across * (width + 6) + 32, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

const stills: Record<string, { label: string; shots: (Frame & { caption: string })[] }> = {}
const still = (key: string, label: string, mode: string, png: Buffer) => {
  stills[key] ??= { label, shots: [] }
  stills[key].shots.push({ t: 0, png, caption: mode.toUpperCase() })
}
const motion: Record<string, { label: string; shots: Frame[] }[]> = {}

for (const mode of modes) {
  if (want("page") || want("states")) {
    const page = await open(mode)
    if (want("page")) {
      const png = await page.screenshot()
      still(
        "page",
        "The tune page as it opens: the phone's sections folded, what's on its screen opened by the highlight, the jump strip in the header",
        mode,
        png,
      )
    }
    if (want("states")) {
      // A folded card with presets reads "<preset> · N changed"; a folded section its counts.
      await tune(page, `__tune.remote.groupPreset("Rhythm", 1)`)
      await tune(page, `__tune.remote.set({ "transcript.arrivals.entranceRise": 9 })`)
      await tune(page, `__tune.page.fold("Rhythm", true)`)
      await tune(page, `__tune.page.fold("Arrivals", true)`)
      await tune(page, `__tune.remote.set({ "drawer.row.height": 50, "drawer.edge.fade": 30 })`)
      await sleep(900)
      const region = (sel: string, pad = 6) =>
        page
          .locator(sel)
          .first()
          .evaluate((n, pad) => {
            const r = n.getBoundingClientRect()
            return {
              x: r.left - pad,
              y: r.top - pad,
              width: r.width + pad * 2,
              height: r.height + pad * 2,
            }
          }, pad) as Promise<Region>
      const col = await region('.knobs-tile[data-group="Arrivals"]')
      const rhythm = await region('.knobs-tile[data-group="Rhythm"]')
      still(
        "cards",
        'Folded cards: "Custom · 1 changed" (one change off its presets), "Compact · 7 changed" (a preset); descriptions under titles',
        mode,
        await page.screenshot({
          clip: { x: col.x, y: col.y, width: col.width, height: rhythm.y + rhythm.height - col.y },
        }),
      )
      const strip = await page.evaluate(() => {
        const rs = [...document.querySelectorAll(".knobs-nav [data-tab]")].map((n) =>
          n.getBoundingClientRect(),
        )
        const left = Math.min(...rs.map((r) => r.left)) - 8
        const top = Math.min(...rs.map((r) => r.top)) - 6
        return {
          x: left,
          y: top,
          width: Math.max(...rs.map((r) => r.right)) + 8 - left,
          height: Math.max(...rs.map((r) => r.bottom)) + 6 - top,
        }
      })
      still(
        "nav",
        "The jump strip: the section in view underlined, changed counts on the chips",
        mode,
        await page.screenshot({ clip: strip }),
      )
      // Clear the phone's screen so the heading isn't dimmed by the highlight.
      await tune(page, `__tune.page.highlight(null)`)
      await sleep(900)
      const head = page.locator('.knobs-section-head[data-section="Session List"]')
      await head.scrollIntoViewIfNeeded()
      await head.hover()
      await sleep(400)
      still(
        "section",
        "A folded section's heading, hovered: its changed and card counts, its description",
        mode,
        await page.screenshot({
          clip: await region('.knobs-section-head[data-section="Session List"]', 8),
        }),
      )
      await page.mouse.move(2, 2)
    }
    await page.close()
  }
  if (want("motion-fold")) {
    const page = await open(mode)
    const region = { x: 0, y: 90, width: 1440, height: 760 }
    motion.fold ??= []
    motion.fold.push({
      label: `${mode.toUpperCase()}: Transcript's heading clicked — its cards fold away and Composer glides over`,
      shots: await film(page, region, 300, async () => {
        await page.locator('.knobs-section-head[data-section="Transcript"]').click()
      }),
    })
    await page.close()
  }
  if (want("motion-jump")) {
    const page = await open(mode, { width: 900, height: 700 })
    await tune(page, `__tune.page.foldSection("Session List", false)`)
    await tune(page, `__tune.page.foldSection("Composer", true)`)
    await sleep(900)
    motion.jump ??= []
    motion.jump.push({
      label: `${mode.toUpperCase()}: the "Composer" chip — the page glides down, Composer opens, the underline follows`,
      shots: await film(page, { x: 0, y: 0, width: 900, height: 700 }, 600, async () => {
        await page.locator('.knobs-nav [data-tab="Composer"]').click()
      }),
    })
    await page.close()
  }
  if (want("motion-context")) {
    const page = await open(mode)
    motion.context ??= []
    motion.context.push({
      label: `${mode.toUpperCase()}: the phone switches to its session list — Session List opens; Transcript and Composer, opened by the last screen, fold again`,
      shots: await film(page, { x: 0, y: 90, width: 1440, height: 760 }, 450, async () => {
        await tune(page, `__tune.send({ type: "playground", playground: "sessionList" })`)
      }),
    })
    await page.close()
  }
}

if (stills.page)
  await sheet(
    "OC-345 · the tune page, DOM and GPU",
    [stills.page],
    `${out}/${prefix}-page.png`,
    720,
    2,
  )
const states = ["cards", "section", "nav"].filter((k) => stills[k]).map((k) => stills[k]!)
if (states.length)
  await sheet(
    "OC-345 · folded summaries, descriptions and the jump strip, DOM and GPU",
    states,
    `${out}/${prefix}-states.png`,
    520,
    2,
  )
for (const [key, rows] of Object.entries(motion))
  await sheet(
    `OC-345 · ${key === "fold" ? "a section folding" : key === "jump" ? "a jump from the strip" : "context expand and refold"} (frames over the motion's span)`,
    rows,
    `${out}/${prefix}-motion-${key}.png`,
    key === "jump" ? 300 : 380,
    5,
  )
console.log(errors.length ? errors.join("\n") : "no errors")
await browser.close()
