// Input-to-frame latency while scrubbing: drags a compare's and a player's line over a 1080p,
// 20 s pair with a raw recording's keyframes (one in 10 s) and times, for every pointer move, how
// long until the frame under the hand shows (and is painted), and how far off what shows is.
// Makes the pair if it's missing (ffmpeg), starts its own Vite on PORT (5392), drives Brave or
// Chrome headless with the GPU, and prints JSON (also to $LEASE_OUT/scrub.json).
//   node scripts/scrub-probe.mjs
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"

const PORT = Number(process.env.PORT) || 5392
const root = new URL("..", import.meta.url).pathname
const base = `http://127.0.0.1:${PORT}`
const assets = `${root}examples/assets/compare`
if (!existsSync(`${assets}/scrub-1080-after.mp4`))
  execFileSync("bash", ["make.sh", ".", "scrub"], { cwd: assets, stdio: "inherit" })

const viteBin = `${root}node_modules/.bin/vite`
const vite = spawn(viteBin, ["--config", "examples/vite.config.ts"], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
  detached: true,
})
const stopVite = () => {
  try {
    process.kill(-vite.pid, "SIGTERM")
  } catch {}
}
process.on("exit", stopVite)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/compare-page.html`)).ok) break
  } catch {}
  if (i > 160) throw new Error("vite didn't start")
  await sleep(250)
}

const exe = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync)
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : { channel: "chromium" }),
  headless: false,
  args: [
    "--headless=new",
    "--enable-unsafe-webgpu",
    "--enable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1440,1000",
  ],
})
const out = { browser: exe ?? "playwright chromium", version: browser.version(), errors: [] }

const stats = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return {
    n: s.length,
    median: +q(0.5).toFixed(1),
    p90: +q(0.9).toFixed(1),
    max: +s.at(-1).toFixed(1),
  }
}

// Every frame shown, from either piece: the compare's frame events, the player's preview events,
// and every frame a <video> presents; each with the next animation frame's time (painted).
const instrument = () => {
  window.__shown = []
  const note = (kind, side, frame, source) => {
    const e = { t: performance.now(), kind, side, frame, source, paint: null }
    window.__shown.push(e)
    requestAnimationFrame(() => (e.paint = performance.now()))
  }
  document.addEventListener(
    "knobs-compare-frame",
    (e) => note("compare", e.detail.side, e.detail.frame, e.detail.source),
    true,
  )
  document.addEventListener(
    "knobs-player-frame",
    (e) => note("player", 0, e.detail.frame, e.detail.source),
    true,
  )
  const watch = (v) => {
    if (v.__watched || !v.requestVideoFrameCallback) return
    v.__watched = true
    const kind = v.closest(".knobs-player") ? "player" : null
    if (!kind) return
    const f = (_n, m) => {
      window.__shown.push({
        t: performance.now(),
        kind,
        side: 0,
        frame: Math.floor(m.mediaTime * 30 + 1e-4),
        source: "video",
        paint: performance.now(),
      })
      v.requestVideoFrameCallback(f)
    }
    v.requestVideoFrameCallback(f)
  }
  new MutationObserver(() => document.querySelectorAll("video").forEach(watch)).observe(document, {
    childList: true,
    subtree: true,
  })
}

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on("pageerror", (e) => out.errors.push(String(e).slice(0, 200)))
page.on("console", (m) => m.type() === "error" && out.errors.push(m.text().slice(0, 200)))
await page.addInitScript(instrument)
await page.goto(`${base}/compare-page.html?pair=scrub-1080-`)
await page.waitForFunction(
  () => {
    const c = window.__compares?.[0]
    const p = window.__players?.[0]
    return c && p && c.duration > 0 && p.duration > 0 && c.element.hasAttribute("data-ready")
  },
  null,
  { timeout: 30000 },
)
const loadedAt = Date.now()

/** Drags `kind`'s line from `a` to `b` (0–1 of its width) in `steps` moves `every` ms apart. */
async function drag(kind, a, b, steps, every) {
  const sel =
    kind === "compare" ? ".knobs-compare .knobs-tl-track" : ".knobs-player .knobs-tl-track"
  const track = page.locator(sel).first()
  await track.scrollIntoViewIfNeeded()
  await sleep(300)
  const box = await track.boundingBox()
  await page.evaluate((kind) => {
    window.__moves = []
    const piece = kind === "compare" ? window.__compares[0] : window.__players[0]
    window.__onMove = () =>
      window.__moves.push({
        t: performance.now(),
        frame: Math.floor(piece.timeline.time * 30 + 1e-4),
      })
    window.addEventListener("pointermove", window.__onMove)
    window.__shown.length = 0
  }, kind)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * a, y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + box.width * (a + ((b - a) * i) / steps), y)
    await sleep(every)
  }
  const upAt = await page.evaluate(() => performance.now())
  await page.mouse.up()
  await sleep(3000)
  return page.evaluate(
    ({ kind, upAt }) => {
      window.removeEventListener("pointermove", window.__onMove)
      const moves = window.__moves.slice(1)
      const sides = kind === "compare" ? [0, 1] : [0]
      const ev = window.__shown.filter((e) => e.kind === kind)
      const exact = []
      const painted = []
      const off = []
      let unanswered = 0
      moves.forEach((m, k) => {
        const until = k + 1 < moves.length ? moves[k + 1].t : upAt
        // Each side's first exact frame in this move's window; the move is answered when every
        // side has shown it.
        const per = sides.map((s) =>
          ev.find((e) => e.side === s && e.frame === m.frame && e.t >= m.t && e.t <= until),
        )
        if (per.every(Boolean)) {
          exact.push(Math.max(...per.map((e) => e.t - m.t)))
          painted.push(Math.max(...per.map((e) => (e.paint ?? e.t) - m.t)))
        } else unanswered++
        // How far off the picture is when the hand moves on: the last frame shown by then.
        for (const s of sides) {
          const last = ev.filter((e) => e.side === s && e.t <= until).at(-1)
          if (last) off.push(Math.abs(last.frame - m.frame))
        }
      })
      const target = window.__moves.at(-1)?.frame
      const settle = sides.map((s) => {
        const e = ev.find(
          (x) => x.side === s && x.t >= upAt && x.source === "video" && x.frame === target,
        )
        return e ? +(e.t - upAt).toFixed(1) : null
      })
      return { moves: moves.length, exact, painted, off, unanswered, settle }
    },
    { kind, upAt },
  )
}

const summary = (r) => ({
  moves: r.moves,
  answeredInWindow: `${r.moves - r.unanswered}/${r.moves}`,
  exactFrameMs: stats(r.exact),
  paintedMs: stats(r.painted),
  framesOff: stats(r.off),
  exactVideoAfterReleaseMs: r.settle,
})

for (const kind of ["compare", "player"]) {
  const res = {}
  // Cold: a second after it loads. Fast: a frame per move across the line; slow: 50 ms a move
  // over a fifth of it.
  if (kind === "compare") await sleep(Math.max(0, 1000 - (Date.now() - loadedAt)))
  res.cold = summary(await drag(kind, 0.05, 0.95, 60, 16))
  await sleep(10000)
  res.fast = summary(await drag(kind, 0.95, 0.05, 60, 16))
  res.slow = summary(await drag(kind, 0.3, 0.5, 40, 50))
  out[kind] = res
}
// Space plays and pauses a focused compare.
out.space = await page.evaluate(async () => {
  const c = window.__compares[0]
  c.focus()
  const key = () =>
    c.element.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
  key()
  await new Promise((r) => setTimeout(r, 600))
  const playing = c.playing
  key()
  return { played: playing, paused: !c.playing }
})

await browser.close()
stopVite()
const json = JSON.stringify(out, null, 2)
console.log(json)
if (process.env.LEASE_OUT) {
  mkdirSync(process.env.LEASE_OUT, { recursive: true })
  writeFileSync(`${process.env.LEASE_OUT}/scrub.json`, json)
}
process.exit(0)
