// One-off numbers for compare(): the shader compiles, both renderers draw, scrubbing a sparse-
// keyframe file shows frames promptly, Space plays and pauses, a long page scrolls smoothly.
// Starts its own Vite on PORT (5391), drives Brave or Chrome headless with WebGPU, prints JSON.
//   node scripts/compare-probe.mjs
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { chromium } from "playwright"

const PORT = Number(process.env.PORT) || 5391
const root = new URL("..", import.meta.url).pathname
const base = `http://127.0.0.1:${PORT}`
const viteBin = `${root}node_modules/.bin/vite`
const vite = spawn(
  existsSync(viteBin) ? viteBin : "bunx",
  existsSync(viteBin)
    ? ["--config", "examples/vite.config.ts"]
    : ["vite", "--config", "examples/vite.config.ts"],
  {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    detached: true,
  },
)
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
  if (i > 120) throw new Error("vite didn't start")
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
    // A worker's headless window can count as hidden: keep its frames and timers at full rate.
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1280,900",
  ],
})
const out = { browser: exe ?? "playwright chromium", version: browser.version() }

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

const instrument = () => {
  window.__events = []
  window.__errors = []
  window.__shader = []
  document.addEventListener(
    "knobs-compare-frame",
    (e) => {
      const i = (window.__compares ?? []).findIndex((c) => c.element === e.target)
      window.__events.push({ t: performance.now(), i, ...e.detail })
    },
    true,
  )
  window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
  const origReq = GPUAdapter?.prototype?.requestDevice
  if (origReq)
    GPUAdapter.prototype.requestDevice = async function (...a) {
      const d = await origReq.apply(this, a)
      d.addEventListener("uncapturederror", (e) => window.__errors.push(`gpu: ${e.error.message}`))
      const mk = d.createShaderModule.bind(d)
      d.createShaderModule = (desc) => {
        const m = mk(desc)
        m.getCompilationInfo().then((info) =>
          window.__shader.push(
            ...info.messages.map((x) => `${x.type}: ${x.message} @${x.lineNum}`),
          ),
        )
        window.__shader.push("compiled")
        return m
      }
      return d
    }
}

async function openPage(renderer) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on("console", (m) => m.type() === "error" && out.consoleErrors.push(m.text().slice(0, 200)))
  page.on("pageerror", (e) => out.consoleErrors.push(String(e).slice(0, 200)))
  page.on("response", (r) => {
    if (r.status() >= 400) out.failedUrls.push(`${r.status()} ${r.url().replace(base, "")}`)
  })
  await page.addInitScript(instrument)
  const t0 = Date.now()
  await page.goto(`${base}/compare-page.html?renderer=${renderer}`)
  try {
    await page.waitForFunction(
      () => {
        const ev = window.__events.filter((e) => e.i === 0 && e.source === "video")
        return ev.some((e) => e.side === 0) && ev.some((e) => e.side === 1)
      },
      null,
      { timeout: 30000 },
    )
  } catch (e) {
    out.stuck = await diagnose(page)
    throw e
  }
  return { page, firstFrameMs: Date.now() - t0 }
}

/** What the first compare is doing, when it doesn't show frames. */
const diagnose = (page) =>
  page.evaluate(() => {
    const c = window.__compares?.[0]
    const by = {}
    for (const e of window.__events) {
      const k = `${e.i}:${e.side}:${e.source}`
      by[k] = (by[k] ?? 0) + 1
    }
    return {
      compares: window.__compares?.length ?? null,
      renderer: c?.renderer ?? null,
      note: c?.element.querySelector(".knobs-cmp-note")?.textContent ?? null,
      videos: c
        ? [...c.element.querySelectorAll("video")].map((v) => ({
            side: v.dataset.side,
            src: (v.getAttribute("src") ?? "").replace(location.origin, ""),
            readyState: v.readyState,
            networkState: v.networkState,
            error: v.error?.code ?? null,
            duration: v.duration,
          }))
        : null,
      events: by,
      errors: window.__errors,
      shader: window.__shader,
      webgpu: Boolean(navigator.gpu),
    }
  })

/** The shared frame cache for the first compare's After (same module instance as the page's). */
const cacheState = (page) =>
  page.evaluate(async (rootPath) => {
    const m = await import(`/@fs${rootPath}src/ui/compare-frames.ts`)
    const src = new URL("./assets/compare/long-after.mp4", location.href).href
    const c = m.acquireFrames(document, src, 30)
    const s = { backend: c.backend, size: c.size }
    c.release()
    return s
  }, root)

async function scrub(page) {
  const box = await page.locator(".knobs-compare").first().locator(".knobs-tl-track").boundingBox()
  await page.evaluate(() => {
    window.__moves = []
    const tl = window.__compares[0].timeline
    window.__onMove = () =>
      window.__moves.push({ t: performance.now(), frame: Math.floor(tl.time * 30 + 1e-4) })
    window.addEventListener("pointermove", window.__onMove)
    window.__events.length = 0
  })
  const y = box.y + box.height * 0.7
  await page.mouse.move(box.x + box.width * 0.05, y)
  await page.mouse.down()
  const steps = 40
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + box.width * (0.05 + (0.9 * i) / steps), y)
    await sleep(60)
  }
  const upAt = await page.evaluate(() => performance.now())
  await page.mouse.up()
  await sleep(4000)
  return page.evaluate(
    ({ upAt }) => {
      window.removeEventListener("pointermove", window.__onMove)
      const moves = window.__moves
      const ev = window.__events.filter((e) => e.i === 0)
      const per = moves.map((m, k) => {
        const until = k + 1 < moves.length ? moves[k + 1].t : m.t + 250
        const after = ev.filter((e) => e.t >= m.t && e.t <= until)
        const first = after[0]
        const best = after.reduce((b, e) => Math.min(b, Math.abs(e.frame - m.frame)), Infinity)
        return {
          latency: first ? first.t - m.t : null,
          distance: best,
          cache: after.filter((e) => e.source === "cache").length,
        }
      })
      const target = moves.at(-1).frame
      const exact = [0, 1].map((side) => {
        const e = ev.find(
          (x) => x.side === side && x.t >= upAt && x.source === "video" && x.frame === target,
        )
        return e ? e.t - upAt : null
      })
      return {
        moves: moves.length,
        latencies: per.map((p) => p.latency).filter((x) => x !== null),
        unanswered: per.filter((p) => p.latency === null).length,
        distances: per.map((p) => p.distance).filter(Number.isFinite),
        cacheFrames: ev.filter((e) => e.source === "cache").length,
        videoFrames: ev.filter((e) => e.source === "video").length,
        exactAfterRelease: exact,
        target,
      }
    },
    { upAt },
  )
}

out.consoleErrors = []
out.failedUrls = []
try {
  // ——— GPU ———
  const { page, firstFrameMs } = await openPage("gpu")
  const gpu = { firstFrameMs }
  gpu.renderer = await page.evaluate(() => window.__compares[0].renderer)
  gpu.shader = await page.evaluate(() => window.__shader)
  // Read the canvas back in the same task as a draw.
  gpu.pixels = await page.evaluate(() => {
    const c = window.__compares[0]
    c.update({ wipe: 0.49 })
    const src = c.element.querySelector(".knobs-cmp-canvas")
    const cv = document.createElement("canvas")
    cv.width = src.width
    cv.height = src.height
    const ctx = cv.getContext("2d")
    ctx.drawImage(src, 0, 0)
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data
    const half = (x0, x1) => {
      let lit = 0
      let n = 0
      let sum = 0
      let sum2 = 0
      for (let y = 0; y < cv.height; y += 4)
        for (let x = Math.floor(x0 * cv.width); x < x1 * cv.width; x += 4) {
          const i = (y * cv.width + x) * 4
          n++
          if (d[i + 3] > 0) {
            lit++
            const l = (d[i] + d[i + 1] + d[i + 2]) / 3
            sum += l
            sum2 += l * l
          }
        }
      const mean = lit ? sum / lit : 0
      return {
        covered: +(lit / n).toFixed(3),
        lumaStd: +Math.sqrt(Math.max(0, sum2 / Math.max(1, lit) - mean * mean)).toFixed(1),
      }
    }
    return { size: [cv.width, cv.height], before: half(0, 0.5), after: half(0.5, 1) }
  })
  // Baseline: a plain <video> seek on the sparse file.
  gpu.plainSeekMs = stats(
    await page.evaluate(async () => {
      const v = document.createElement("video")
      v.muted = true
      v.preload = "auto"
      v.src = new URL("./assets/compare/long-after.mp4", location.href).href
      await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }))
      const out = []
      for (const t of [33.2, 7.4, 25.9, 15.1, 38.6, 2.2, 19.7, 29.3]) {
        const t0 = performance.now()
        await new Promise((r) => {
          v.addEventListener("seeked", r, { once: true })
          v.currentTime = t
        })
        out.push(performance.now() - t0)
      }
      v.removeAttribute("src")
      v.load()
      return out
    }),
  )
  const t0 = Date.now()
  let cache = await cacheState(page)
  while (Date.now() - t0 < 25000 && (cache.backend === "pending" || cache.size < 44)) {
    await sleep(250)
    cache = await cacheState(page)
  }
  gpu.cache = { ...cache, gridFillMs: Date.now() - t0 + firstFrameMs }
  const s = await scrub(page)
  gpu.scrub = {
    moves: s.moves,
    unanswered: s.unanswered,
    latencyMs: stats(s.latencies),
    distanceFrames: stats(s.distances),
    cacheFrames: s.cacheFrames,
    videoFrames: s.videoFrames,
    exactAfterReleaseMs: s.exactAfterRelease,
  }
  // Steps: "." ten times; keydown to the step's frame (cached or exact) on After.
  await page
    .locator(".knobs-compare")
    .first()
    .locator(".knobs-cmp-stage")
    .click({ position: { x: 20, y: 30 } })
  gpu.steps = stats(
    await (async () => {
      const lat = []
      for (let k = 0; k < 10; k++) {
        const before = await page.evaluate(() => {
          window.__events.length = 0
          return { t: performance.now(), f: Math.floor(window.__compares[0].time * 30 + 1e-4) }
        })
        await page.keyboard.press(".")
        await sleep(150)
        const l = await page.evaluate(({ t, f }) => {
          const e = window.__events.find((x) => x.i === 0 && x.side === 1 && x.frame === f + 1)
          return e ? e.t - t : null
        }, before)
        if (l !== null) lat.push(l)
      }
      return lat
    })(),
  )
  // Space: plays from where it is, pauses where it is, resumes from there.
  const space = {}
  const read = () =>
    page.evaluate(() => {
      const c = window.__compares[0]
      const v = c.element.querySelector('video[data-side="after"]')
      return { playing: c.playing, time: +c.time.toFixed(3), video: +v.currentTime.toFixed(3) }
    })
  await page.evaluate(() => window.__compares[0].seek(12))
  await sleep(1500)
  space.start = await read()
  await page.evaluate(() => {
    window.__ticks = []
    const c = window.__compares[0]
    const f = () => {
      window.__ticks.push({ t: performance.now(), time: c.time })
      if (window.__ticks.length < 400) requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  })
  await page.keyboard.press("Space")
  await sleep(2000)
  space.playing = await read()
  await page.keyboard.press("Space")
  space.paused = await read()
  await sleep(500)
  space.pausedLater = await read()
  space.clock = await page.evaluate(() => {
    const t = window.__ticks.filter((x) => x.time > 0)
    let back = 0
    let stalls = 0
    for (let i = 1; i < t.length; i++) {
      if (t[i].time < t[i - 1].time - 1e-6) back++
      if (t[i].t - t[i - 1].t > 100) stalls++
    }
    return { ticks: t.length, backwards: back, stallsOver100ms: stalls }
  })
  await page.keyboard.press("Space")
  await sleep(150)
  space.resumed = await read()
  await page.keyboard.press("Space")
  // Focus on the timeline.
  await page.evaluate(() => window.__compares[0].timeline.focus())
  await page.keyboard.press("Space")
  await sleep(400)
  space.fromTimeline = (await read()).playing
  await page.keyboard.press("Space")
  gpu.space = space

  // ←: half a second back, the playhead gliding (distinct caret positions over 300 ms).
  await page
    .locator(".knobs-compare")
    .first()
    .locator(".knobs-cmp-stage")
    .click({ position: { x: 30, y: 30 } })
  gpu.seekBy = await page.evaluate(async () => {
    const c = window.__compares[0]
    const head = c.timeline.element.querySelector(".knobs-tl-head")
    const t0 = c.time
    c.element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    const t1 = c.time
    const xs = new Set()
    const end = performance.now() + 350
    while (performance.now() < end) {
      xs.add(head.style.transform)
      await new Promise((r) => requestAnimationFrame(r))
    }
    c.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    )
    return {
      from: +t0.toFixed(3),
      afterLeft: +t1.toFixed(3),
      caretPositions: xs.size,
      afterShiftRight: +c.time.toFixed(3),
    }
  })

  // Zoom: a pinch (ctrl-wheel) on the left half, then 0 glides back.
  {
    const st = page.locator(".knobs-compare").first().locator(".knobs-cmp-stage")
    const b = await st.boundingBox()
    await page.mouse.move(b.x + b.width * 0.25, b.y + b.height * 0.5)
    await page.keyboard.down("Control")
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -40)
    await page.keyboard.up("Control")
    await sleep(100)
    const zoomed = await page.evaluate(() => {
      const c = window.__compares[0]
      return {
        zoom: c.zoom,
        pill: c.element.querySelector(".knobs-cmp-zoom").hasAttribute("data-on"),
        pct: c.element.querySelector(".knobs-cmp-zoom-pct").textContent,
      }
    })
    await page.mouse.down()
    await page.mouse.move(b.x + b.width * 0.25 - 60, b.y + b.height * 0.5 - 20, { steps: 4 })
    await page.mouse.up()
    const panned = await page.evaluate(() => window.__compares[0].zoom)
    // Full-window: the card goes fixed; the zoom stays, the pair refits.
    const full = await page.evaluate(async () => {
      const c = window.__compares[0]
      const stage = c.element.querySelector(".knobs-cmp-stage")
      const host = c.element.parentElement
      const before = stage.getBoundingClientRect()
      const canvas = c.element.querySelector(".knobs-cmp-canvas")
      Object.assign(host.style, {
        position: "fixed",
        inset: "12px",
        zIndex: "10",
        background: "#111",
      })
      // Stage width and canvas width each frame: equal from the first, with no blank frame between.
      const perFrame = []
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => requestAnimationFrame(r))
        perFrame.push([Math.round(stage.getBoundingClientRect().width), canvas.width])
      }
      const after = stage.getBoundingClientRect()
      const full = [canvas.width, canvas.height]
      const z = c.zoom
      host.style.cssText = ""
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      return {
        stageBefore: [Math.round(before.width), Math.round(before.height)],
        stageFull: [Math.round(after.width), Math.round(after.height)],
        canvasFull: full,
        perFrame,
        canvasBack: [canvas.width, canvas.height],
        zoomKept: z,
      }
    })
    await st.click({ position: { x: 30, y: 30 } })
    await page.keyboard.press("0")
    await sleep(1200)
    const reset = await page.evaluate(() => {
      const c = window.__compares[0]
      return {
        zoom: c.zoom,
        pill: c.element.querySelector(".knobs-cmp-zoom").hasAttribute("data-on"),
      }
    })
    gpu.zoom = { zoomed, panned, full, reset }
  }

  // The split's height: half the width in After's shape (no margins).
  gpu.split = await page.evaluate(() => {
    const c = window.__compares[0]
    const st = c.element.querySelector(".knobs-cmp-stage").getBoundingClientRect()
    const v = c.element.querySelector('video[data-side="after"]')
    return {
      stage: [+st.width.toFixed(1), +st.height.toFixed(1)],
      expected: +((st.width / 2) * (v.videoHeight / v.videoWidth)).toFixed(1),
    }
  })

  // Loop: L sets one around the playhead; playing stays inside it.
  gpu.loop = await (async () => {
    await page.evaluate(() => window.__compares[0].seek(20))
    await sleep(600)
    await page.keyboard.press("l")
    const loop = await page.evaluate(() => window.__compares[0].loop)
    await page.evaluate(() => {
      window.__lt = []
      const c = window.__compares[0]
      const f = () => {
        window.__lt.push(c.time)
        if (window.__lt.length < 420) requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    })
    await page.keyboard.press("Space")
    await sleep(7000)
    await page.keyboard.press("Space")
    const range = await page.evaluate(() => {
      const t = window.__lt.filter((x) => x > 0)
      let wraps = 0
      for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1] - 0.5) wraps++
      return { min: +Math.min(...t).toFixed(3), max: +Math.max(...t).toFixed(3), wraps }
    })
    await page.keyboard.press("l")
    const off = await page.evaluate(() => window.__compares[0].loop)
    return { loop, played: range, afterSecondL: off }
  })()
  // A long page: scroll top to bottom, then wait for far ones to let go.
  gpu.page = await page.evaluate(async () => {
    const frames = []
    let long = 0
    const po = new PerformanceObserver((l) => (long += l.getEntries().length))
    try {
      po.observe({ type: "longtask", buffered: false })
    } catch {}
    let last = performance.now()
    let on = true
    const tick = (t) => {
      frames.push(t - last)
      last = t
      if (on) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.scrollTo(0, 0)
    const max = document.documentElement.scrollHeight - innerHeight
    for (let y = 0; y <= max; y += 120) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 16))
    }
    on = false
    po.disconnect()
    const loaded = () =>
      [...document.querySelectorAll("video.knobs-cmp-media")].filter((v) => v.getAttribute("src"))
        .length
    const atEnd = loaded()
    await new Promise((r) => setTimeout(r, 3800))
    const s = [...frames].sort((a, b) => a - b)
    return {
      compares: window.__compares.length,
      pageHeight: document.documentElement.scrollHeight,
      frameMs: {
        median: +s[Math.floor(s.length / 2)].toFixed(1),
        p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
        max: +s.at(-1).toFixed(1),
      },
      longTasks: long,
      videosLoadedAtBottom: atEnd,
      videosLoadedAfterRelease: loaded(),
      totalVideos: document.querySelectorAll("video.knobs-cmp-media").length,
      renderers: [...new Set(window.__compares.map((c) => c.renderer))],
    }
  })
  gpu.errors = await page.evaluate(() => window.__errors)
  out.gpu = gpu
  await page.close()

  // ——— DOM ———
  const dom = await openPage("dom")
  const d = { firstFrameMs: dom.firstFrameMs }
  d.renderer = await dom.page.evaluate(() => window.__compares[0].renderer)
  d.media = await dom.page.evaluate(() =>
    [...window.__compares[0].element.querySelectorAll("video.knobs-cmp-media")].map((v) => ({
      ready: v.readyState,
      w: Math.round(v.getBoundingClientRect().width),
      h: Math.round(v.getBoundingClientRect().height),
    })),
  )
  const t1 = Date.now()
  let c2 = await cacheState(dom.page)
  while (Date.now() - t1 < 25000 && (c2.backend === "pending" || c2.size < 44)) {
    await sleep(250)
    c2 = await cacheState(dom.page)
  }
  const s2 = await scrub(dom.page)
  d.scrub = {
    moves: s2.moves,
    unanswered: s2.unanswered,
    latencyMs: stats(s2.latencies),
    distanceFrames: stats(s2.distances),
    cacheFrames: s2.cacheFrames,
    videoFrames: s2.videoFrames,
    exactAfterReleaseMs: s2.exactAfterRelease,
  }
  d.errors = await dom.page.evaluate(() => window.__errors)
  out.dom = d
} catch (e) {
  out.failure = String(e?.stack ?? e).slice(0, 1500)
} finally {
  await browser.close()
  stopVite()
}
console.log(JSON.stringify(out, null, 2))
process.exit(0)
