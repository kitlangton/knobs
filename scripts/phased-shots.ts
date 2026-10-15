// Proof shots for Phase D (readouts and overlays in the Lab): the Live dock in both renderers,
// frame sheets of the palette, popover, confirm and toast entrances and a sparkline's range
// easing, and a perf note (the cost per frame of the graph plus 20 more live sparklines). The
// page's clock and its CSS motion run SLOW times slower while filming, so headless screenshots
// keep up with the springs.
// BASE=http://127.0.0.1:4005 OUT=dir bun scripts/phased-shots.ts   (ONLY=live,palette,… SLOW=10)
import { type Browser, chromium, type Page } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const out = process.env.OUT ?? "/tmp/phased"
const prefix = process.env.PREFIX ?? "phaseD"
const only = process.env.ONLY?.split(",")
const slow = Number(process.env.SLOW) || 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }
type Shot = { t: number; png: Buffer }

async function open(path: string, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${path}: ${m.text()}`))
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
    localStorage.clear()
  })
  await page.goto(`${base}/${path}`)
  await sleep(1500)
  return page
}

async function film(page: Page, region: Region, ms: number, act: () => Promise<void>, n = 8) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
  const shots: Shot[] = []
  const start = Date.now()
  const acting = act()
  while (Date.now() - start < ms * slow)
    shots.push({ t: Date.now() - start, png: await page.screenshot({ clip: region }) })
  await acting
  await page.evaluate(() => (window as any).__slow(1))
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  const pick = Array.from({ length: n }, (_, i) => Math.round((i * (shots.length - 1)) / (n - 1)))
  return [...new Set(pick)].map((i) => ({ t: shots[i]!.t / slow, png: shots[i]!.png }))
}

async function sheet(
  title: string,
  note: string,
  rows: { label: string; shots: Shot[] }[],
  path: string,
  width = 300,
  perRow = 8,
) {
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:12px -apple-system,system-ui;padding:16px">
    <div style="font-size:15px;color:#eee;margin-bottom:4px">${title}</div>
    <div style="margin-bottom:10px">${note}</div>
    ${rows
      .map(
        (r) => `<div style="color:#ddd;margin:10px 0 6px">${r.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${r.shots
        .map(
          (s) =>
            `<figure style="margin:0"><img style="display:block;width:${width}px" src="data:image/png;base64,${s.png.toString("base64")}"><figcaption>${s.t.toFixed(0)} ms</figcaption></figure>`,
        )
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5 })
  await p.setViewportSize({ width: perRow * (width + 6) + 32, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

if (want("live")) {
  for (const mode of ["dom", "gpu"]) {
    const page = await open(`lab.html${mode === "gpu" ? "?gpu" : ""}`)
    await sleep(2500)
    await page.screenshot({ path: `${out}/${prefix}-live-${mode}.png` })
    const dock = page.locator('[data-pane="dock"]')
    await dock.screenshot({ path: `${out}/${prefix}-dock-${mode}.png` })
    // The meters, lower in the Live card.
    await page.locator("#live").evaluate((el) => {
      el.scrollTop = 1e4
    })
    await sleep(400)
    await page.locator("#live").screenshot({ path: `${out}/${prefix}-meters-${mode}.png` })
    await page.close()
  }
}

if (want("palette")) {
  const page = await open("lab.html?paused")
  await page.mouse.move(700, 400)
  const region = { x: 300, y: 80, width: 840, height: 560 }
  const opening = await film(page, region, 420, () => page.keyboard.press("Meta+k"))
  await sleep(400)
  await page.keyboard.type("dro")
  await sleep(300)
  const moving = await film(
    page,
    region,
    300,
    async () => {
      await page.keyboard.press("ArrowDown")
      await sleep(60 * slow)
      await page.keyboard.press("ArrowDown")
    },
    6,
  )
  const closing = await film(page, region, 300, () => page.keyboard.press("Escape"), 6)
  await sleep(300)
  // Interrupted: closed partway in, it turns around from where it is.
  const turned = await film(page, region, 420, async () => {
    await page.keyboard.press("Meta+k")
    await sleep(90 * slow)
    await page.keyboard.press("Escape")
  })
  await sheet(
    "Command palette: entrance, highlight, exit",
    `Spring in (0.34 s, slight bounce): scale 0.96 → 1, blur 8 → 0 px, a nudge from above; the highlight glides with the springs' easing; out in 0.2 s. Filmed at 1/${slow} speed.`,
    [
      { label: "⌘K: in", shots: opening },
      { label: "↓ ↓: the highlight glides", shots: moving },
      { label: "Esc: out", shots: closing },
      { label: "⌘K then Esc 90 ms in: turns around from where it is", shots: turned },
    ],
    `${out}/${prefix}-palette-sheet.png`,
    260,
  )
  await page.close()
}

if (want("popover")) {
  const page = await open("lab.html?paused")
  const games = page.getByRole("button", { name: "All games ▾" })
  const g = (await games.boundingBox())!
  const region = { x: g.x + g.width - 300, y: 0, width: 320, height: 220 }
  const opening = await film(page, region, 420, () => games.click())
  const closing = await film(page, region, 300, () => page.keyboard.press("Escape"), 6)
  await sleep(300)
  const pause = page.locator("#pause")
  const tipRegion = { x: 140, y: 0, width: 420, height: 90 }
  await page.mouse.move(700, 500)
  const tip = await film(page, tipRegion, 900, async () => {
    await pause.hover()
  })
  const handoff = await film(
    page,
    tipRegion,
    260,
    async () => {
      await page.locator("#restart").hover()
    },
    6,
  )
  await page.mouse.move(700, 500)
  await sleep(500)
  await page.locator(".knobs-tree-row", { hasText: "Barrier" }).click()
  const confirmRegion = { x: 420, y: 230, width: 600, height: 280 }
  const confirming = await film(page, confirmRegion, 420, () => page.keyboard.press("Backspace"))
  const toastRegion = { x: 520, y: 760, width: 400, height: 140 }
  await page.keyboard.press("Tab")
  const toasting = await film(page, toastRegion, 420, () => page.keyboard.press("Enter"))
  await sheet(
    "Popover, tooltip, confirm, toast",
    `The games menu grows from the button's corner (bottom-end, shifted into view); a tooltip waits 500 ms, then a neighbour's is up at once; the confirm scales in over a scrim; the toast rises. Filmed at 1/${slow} speed.`,
    [
      { label: "Popover in", shots: opening },
      { label: "Popover out (Esc)", shots: closing },
      { label: "Tooltip: the pause, then in", shots: tip },
      { label: "Tooltip hand-off to the neighbour (no entrance)", shots: handoff },
      { label: "Confirm in (⌫ on a selection)", shots: confirming },
      { label: "Toast in (Delete)", shots: toasting },
    ],
    `${out}/${prefix}-popover-sheet.png`,
    260,
  )
  await page.close()
}

if (want("sparkline")) {
  const rows: { label: string; shots: Shot[] }[] = []
  for (const mode of ["dom", "gpu"]) {
    const page = await open(`lab.html?paused${mode === "gpu" ? "&gpu" : ""}`)
    // A calm history, then a spike: the scale eases out to take it, snapping to a nice range.
    await page.evaluate(() => {
      const l = (window as any).__live.live
      for (let i = 0; i < 60; i++) l.watch("drops", 1400 + Math.sin(i / 4) * 40)
    })
    await sleep(800)
    const drops = page.locator('[data-controls="lab-live"] [data-field="drops"]')
    const b = (await drops.boundingBox())!
    const region = { x: b.x, y: b.y - 2, width: b.width, height: b.height + 4 }
    const out1 = await film(page, region, 600, async () => {
      await page.evaluate(() => (window as any).__live.live.watch("drops", 9000))
    })
    rows.push({ label: `${mode.toUpperCase()}: a spike arrives, the range eases out`, shots: out1 })
    await page.close()
  }
  await sheet(
    "Sparkline: range easing",
    `Ranges snap to nice steps (1/2/5×10ⁿ) and ease there on a spring, so a spike rescales smoothly instead of jumping. Filmed at 1/${slow} speed.`,
    rows,
    `${out}/${prefix}-sparkline-sheet.png`,
    360,
    4,
  )
}

if (want("perf")) {
  const note: string[] = []
  for (const mode of ["dom", "gpu"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } })
    // Times every rAF callback, by whose it is.
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window)
      const totals: Record<string, number[]> = {}
      ;(window as any).__perf = totals
      window.requestAnimationFrame = (cb) => {
        const src = cb.toString()
        const who = /running\.delete/.test(src)
          ? "readouts"
          : /panels\.size === 0/.test(src)
            ? "gpu"
            : /step\(now\)/.test(src)
              ? "feed"
              : "other"
        return raf((t) => {
          const a = performance.now()
          cb(t)
          ;(totals[who] ??= []).push(performance.now() - a)
        })
      }
    })
    await page.goto(`${base}/lab.html?sparks=20${mode === "gpu" ? "&gpu" : ""}`)
    // The Live card on its own, tall enough that the graph and all 22 sparklines are on screen
    // (absolute in the body: no stacking context, so the GPU overlay still draws it).
    await page.locator("#live").waitFor()
    await page.evaluate(() => {
      const live = document.getElementById("live")!
      document.body.append(live)
      live.setAttribute(
        "style",
        "position:absolute;left:0;top:0;width:520px;height:auto;max-height:none;overflow:visible;background:#111",
      )
      document.dispatchEvent(new Event("knobs-layout"))
    })
    await sleep(2500)
    const visible = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#live .knobs-rd-spark")]
      return rows.filter((r) => {
        const b = r.getBoundingClientRect()
        return b.bottom > 0 && b.top < innerHeight && b.height > 0
      }).length
    })
    await page.evaluate(() => {
      for (const k of Object.keys((window as any).__perf)) (window as any).__perf[k] = []
    })
    await sleep(3000)
    const totals = (await page.evaluate(() => (window as any).__perf)) as Record<string, number[]>
    const stat = (xs: number[] = []) => {
      const s = [...xs].sort((a, b) => a - b)
      const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)
      return `${avg.toFixed(3)} ms avg, p95 ${(s[Math.floor(s.length * 0.95)] ?? 0).toFixed(3)} ms over ${s.length} frames`
    }
    await page.screenshot({
      path: `${out}/${prefix}-perf-${mode}.png`,
      clip: { x: 0, y: 0, width: 520, height: 1400 },
    })
    note.push(
      `${mode.toUpperCase()} (${visible} sparklines on screen + the frame graph + 3 meters, fed every frame):`,
      `  readout clock: ${stat(totals.readouts)}`,
      ...(mode === "gpu" ? [`  GPU overlay frame (CPU side): ${stat(totals.gpu)}`] : []),
      `  fake feed (the host pushing values): ${stat(totals.feed)}`,
      `  everything else on rAF (the Lab's viewport and panels): ${stat(totals.other)}`,
    )
    await page.close()
  }
  const text = note.join("\n")
  console.log(text)
  writeFileSync(`${out}/${prefix}-perf.txt`, `${text}\n`)
}

console.log(errors.length ? errors : "no errors")
await browser.close()
