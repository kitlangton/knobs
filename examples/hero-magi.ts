/// <reference types="@webgpu/types" />
// A hero: MAGI, watching a live swarm. Sixteen thousand agents flock in a containment ring,
// simulated on the GPU (hero-magi-sim.wgsl), while a tactical display reads them live
// (hero-magi-draw.wgsl): brackets lock onto the largest clusters and follow them, a radar shows
// the density, a scope plots the swarm's order, pace and fear, three MAGI votes judge it, and a
// trace runs from each row of the panel into the machine. The panel operates it: cohesion,
// alignment, separation, speed, predators, containment, the display's signal colour, and the
// lure, which a drag in the ring also places (held, it pulls harder). Bloom and tone are the
// catalog's (controls-post.wgsl). Without WebGPU, a still of the display stands in.
import { choice, defineControls, knob, point } from "knobs"
import { mountPanel } from "knobs/panel"
import postWgsl from "./controls-post.wgsl?raw"
import commonWgsl from "./hero-magi-common.wgsl?raw"
import drawWgsl from "./hero-magi-draw.wgsl?raw"
import simWgsl from "./hero-magi-sim.wgsl?raw"

const HDR: GPUTextureFormat = "rgba16float"
const LEVELS = 5
const NEAR = 192
const FAR = 48
const HIST = 256
const PREDS = 8
const TRACKS = 6
const AGENTS = 16384
/** The lure's reach in the ring: its row's 0–1 square covers this much of the disc. */
const LURE_SPAN = 0.85
/** A trail's light halves in this long (s): the phosphor. */
const TRAIL_HALF = 0.07

const SIGNALS = ["Amber", "Emerald", "Red"] as const
type Signal = (typeof SIGNALS)[number]
/** Each signal: the display's main colour, its second, its alert (sRGB 0–1). */
const PALETTES: Record<Signal, readonly [readonly number[], readonly number[], readonly number[]]> =
  {
    Amber: [
      [1.0, 0.56, 0.16],
      [0.2, 1.0, 0.58],
      [1.0, 0.16, 0.2],
    ],
    Emerald: [
      [0.26, 1.0, 0.6],
      [1.0, 0.62, 0.22],
      [1.0, 0.16, 0.2],
    ],
    Red: [
      [1.0, 0.2, 0.18],
      [1.0, 0.64, 0.24],
      [0.92, 0.94, 1.0],
    ],
  }

const schema = {
  cohesion: knob(55, { min: 0, max: 100, step: 1, unit: "%", label: "Cohesion" }),
  alignment: knob(72, { min: 0, max: 100, step: 1, unit: "%", label: "Alignment" }),
  separation: knob(40, { min: 0, max: 100, step: 1, unit: "%", label: "Separation" }),
  speed: knob(48, { min: 10, max: 100, step: 1, unit: "%", label: "Speed" }),
  predators: knob(1, { min: 0, max: 6, step: 1, label: "Predators" }),
  containment: knob(94, { min: 55, max: 100, step: 1, unit: "%", label: "Containment" }),
  signal: choice("Amber", SIGNALS, { label: "Signal", display: "segmented" }),
  lure: point({ x: 0.62, y: 0.42 }, { min: 0, max: 1, step: 0.01, label: "Lure" }),
}
type Key = keyof typeof schema
const KEYS = Object.keys(schema) as Key[]

const CSS = `
.magi-stage { position: absolute; inset: 0; user-select: none; -webkit-user-select: none; touch-action: none; }
.magi-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.magi-text { position: absolute; inset: 0; pointer-events: none; font: 500 9.5px/1 ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; letter-spacing: .14em; color: var(--magi-a); text-transform: uppercase; transition: opacity .6s ease; }
.magi-text > div { position: absolute; left: 0; top: 0; white-space: nowrap; }
.magi-text .dim { color: rgba(214, 220, 232, .42); }
.magi-text .b { color: var(--magi-b); }
.magi-text .c { color: var(--magi-c); }
.magi-text .v { text-shadow: 0 0 10px currentColor; }
.magi-text .rows { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; }
.magi-text .rows span:nth-child(even) { text-align: right; text-shadow: 0 0 10px currentColor; }
.magi-panel { position: absolute; top: 0; bottom: 0; right: max(32px, calc(50% - 620px)); width: 320px; display: flex; flex-direction: column; justify-content: center; pointer-events: none; }
.magi-panel .knobs-panel { --k-width: 100%; pointer-events: auto; }
.magi-still { position: absolute; inset: 0; width: 100%; height: 100%; }
@media (max-width: 900px) {
  .magi-stage { position: relative; height: 58vh; min-height: 360px; }
  .magi-panel { position: static; width: auto; max-width: 420px; margin: 0 auto; padding: 0 16px; display: block; pointer-events: auto; }
  .magi-text { display: none; }
}
`

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")

export function mountHeroMagi(host: HTMLElement): { dispose(): void } {
  if (!document.getElementById("magi-css")) {
    const style = document.createElement("style")
    style.id = "magi-css"
    style.textContent = CSS
    document.head.append(style)
  }
  const el = (cls: string, parent: HTMLElement = host) => {
    const e = document.createElement("div")
    e.className = cls
    parent.append(e)
    return e
  }
  const stage = el("magi-stage")
  host.prepend(stage)
  const text = el("magi-text")
  stage.after(text)
  const slot = el("magi-panel")
  const narrow = matchMedia("(max-width: 900px)")

  // ── The panel ──
  const store = defineControls("hero-magi", schema, {
    enabled: true,
    storage: null,
    defaultLabel: "Flock",
    presets: {
      Swarm: {
        cohesion: 92,
        alignment: 10,
        separation: 28,
        speed: 74,
        predators: 0,
        containment: 74,
        signal: "Emerald",
        lure: { x: 0.5, y: 0.5 },
      },
      Panic: {
        cohesion: 38,
        alignment: 64,
        separation: 52,
        speed: 88,
        predators: 5,
        containment: 100,
        signal: "Red",
        lure: { x: 0.24, y: 0.7 },
      },
      Lattice: {
        cohesion: 12,
        alignment: 4,
        separation: 100,
        speed: 16,
        predators: 0,
        containment: 66,
        signal: "Amber",
        lure: { x: 0.5, y: 0.5 },
      },
    },
    onChange(_patch, _values, meta) {
      // Under the hand it follows at once; a preset, Random or undo glides.
      glide = meta.source === "local" ? 0 : 0.45
    },
  })
  const panel = mountPanel(store, slot, {
    title: "MAGI",
    theme: "dark",
    session: false,
    variants: false,
    haptics: false,
    sound: false,
  })
  // The pad starts open: it's the lure's.
  slot
    .querySelector<HTMLElement>('[data-field="lure"] .knobs-x-head[aria-expanded="false"]')
    ?.click()

  // ── What the frame draws from: the values, eased toward the store's ──
  let glide = 0
  const target = () => {
    const v = store.get()
    const pal = PALETTES[v.signal as Signal] ?? PALETTES.Amber
    return {
      sim: [v.cohesion / 100, v.alignment / 100, v.separation / 100, (v.speed - 10) / 90],
      preds: v.predators,
      rc: 0.55 + (0.43 * (v.containment - 55)) / 45,
      lure: [(v.lure.x - 0.5) * 2 * LURE_SPAN, (v.lure.y - 0.5) * 2 * LURE_SPAN],
      pal: pal.map((c) => c.map(toLinear)),
    }
  }
  const now = target()
  const ease = (dt: number) => {
    const t = target()
    const k = glide > 0 ? 1 - Math.exp(-dt / (glide / 3)) : 1
    const mix = (a: number[], b: readonly number[]) =>
      a.forEach((x, i) => (a[i] = x + (b[i]! - x) * k))
    mix(now.sim, t.sim)
    mix(now.lure, t.lure)
    now.preds = t.preds
    now.rc += (t.rc - now.rc) * k
    // The palette always fades (it's a look, not a hand's motion).
    const kp = 1 - Math.exp(-dt / 0.15)
    now.pal.forEach((c, i) => c.forEach((x, j) => (c[j] = x + (t.pal[i]![j]! - x) * kp)))
  }

  // ── Layout: the ring and its instruments in the room the panel leaves ──
  const lay = { w: 0, h: 0, cx: 0, cy: 0, R: 1, col: [0, 0, 0, 0], panelX: 0, rows: [] as number[] }
  const fit = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    const beside = !narrow.matches
    const sr = stage.getBoundingClientRect()
    const pr = slot.querySelector(".knobs-panel")?.getBoundingClientRect()
    lay.w = w
    lay.h = h
    if (beside && pr) {
      const panelX = pr.left - sr.left
      const cw = Math.max(170, Math.min(220, w * 0.15))
      const avail = panelX - 40 - 70 - 40
      const R = Math.max(120, Math.min(h * 0.315, (avail - 22 - cw - 46) / 2.91))
      const comp = 22 + cw + 1.55 * R + 1.36 * R
      const left = 40 + Math.max(0, (avail - comp) / 2)
      lay.R = R
      lay.cx = left + 22 + cw + 1.55 * R
      lay.cy = h * 0.545
      lay.col = [left + 22, lay.cy - 1.18 * R, cw, 2.36 * R]
      lay.panelX = panelX
      lay.rows = KEYS.map((k) => {
        const row = slot.querySelector<HTMLElement>(`[data-field="${k}"]`)
        const head = row?.querySelector<HTMLElement>(".knobs-x-head") ?? row
        const r = head?.getBoundingClientRect()
        return r ? r.top - sr.top + r.height / 2 : -1
      })
    } else {
      lay.R = Math.min((w / 2 - 16) / 1.5, h * 0.36)
      lay.cx = w / 2
      lay.cy = h * 0.52
      lay.col = [0, 0, 0, 0]
      lay.panelX = 0
      lay.rows = []
    }
    placeText()
  }

  // ── The readouts ──
  const line = (cls: string) => el(cls, text)
  const header = line("")
  const clock = line("dim")
  const legend = line("dim")
  const numbers = line("rows")
  const votes = [line(""), line(""), line("")]
  const placeText = () => {
    const { cx, cy, R, col } = lay
    const top = cy - 1.3 * R - 14
    const left = col[2]! > 0 ? col[0]! - 22 : cx - 1.5 * R
    header.style.transform = `translate(${left}px, ${top - 6}px)`
    clock.style.transform = `translate(${cx + 1.36 * R}px, ${top - 6}px) translateX(-100%)`
    legend.style.transform = `translate(${col[0]}px, ${col[1]! - 16}px)`
    numbers.style.transform = `translate(${col[0]}px, ${col[1]! + col[3]! * 0.4 + 22}px)`
    numbers.style.width = `${col[2]}px`
    votes[0]!.style.transform = `translate(${cx}px, ${cy - 1.2 * R - 8}px) translate(-50%, -100%)`
    votes[1]!.style.transform = `translate(${cx - 1.2 * R - 10}px, ${cy}px) translate(-100%, -50%)`
    votes[2]!.style.transform = `translate(${cx}px, ${cy + 1.2 * R + 8}px) translate(-50%, 0)`
  }
  header.innerHTML = `MAGI <span class="dim">· swarm containment</span>`
  legend.innerHTML = `<span class="v">order</span> <span class="dim">/</span> <span class="b v">pace</span> <span class="dim">/</span> <span class="c v">fear</span>`
  const fmt = (n: number, d = 3) => n.toFixed(d)
  let simTime = 0
  const showStats = (s: Stats) => {
    const v = store.get()
    numbers.innerHTML = [
      ["Φ order", fmt(s.order)],
      ["v̄ pace", fmt(s.pace)],
      ["fear", fmt(s.fear)],
      ["clusters", String(s.clusters).padStart(2, "0")],
      ["predators", String(v.predators).padStart(2, "0")],
      ["agents", AGENTS.toLocaleString("en-US")],
      ...s.tracks
        .slice(0, 3)
        .map((t) => [`tgt-${String(t.id).padStart(2, "0")}`, `${Math.round(t.mass)}`]),
    ]
      .map(([a, b]) => `<span class="dim">${a}</span><span>${b}</span>`)
      .join("")
    const verdict = (name: string, yes: boolean) =>
      `<span class="dim">${name}</span> <span class="${yes ? "b" : "c"} v">${yes ? "approve" : "reject"}</span>`
    votes[0]!.innerHTML = verdict("melchior-1", s.order > 0.5)
    votes[1]!.innerHTML = verdict("balthasar-2", s.pace > 0.5)
    votes[2]!.innerHTML = verdict("casper-3", s.fear < 0.17)
    clock.textContent = `t+${simTime.toFixed(1).padStart(6, "0")}`
  }

  const css = (c: readonly number[]) =>
    `rgb(${c.map((x) => Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055))).join(" ")})`
  const paintText = () => {
    host.style.setProperty("--magi-a", css(now.pal[0]!))
    host.style.setProperty("--magi-b", css(now.pal[1]!))
    host.style.setProperty("--magi-c", css(now.pal[2]!))
  }

  // ── The lure, by hand ──
  let pull = 0
  let held = false
  const toWorld = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect()
    return [(e.clientX - r.left - lay.cx) / lay.R, (e.clientY - r.top - lay.cy) / lay.R] as const
  }
  let first = true
  const placeLure = (e: PointerEvent) => {
    const [x, y] = toWorld(e)
    const pt = (v: number) => Math.round(clamp01(v / (2 * LURE_SPAN) + 0.5) * 100) / 100
    store.set({ lure: { x: pt(x), y: pt(y) } }, { coalesce: !first })
    first = false
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const [x, y] = toWorld(e)
    if (Math.hypot(x, y) > 1.05) return
    e.preventDefault()
    stage.setPointerCapture(e.pointerId)
    held = true
    first = true
    placeLure(e)
  }
  const onMove = (e: PointerEvent) => {
    if (held) return placeLure(e)
    const [x, y] = toWorld(e)
    stage.style.cursor = Math.hypot(x, y) <= 1.05 ? "crosshair" : ""
  }
  const onUp = (e: PointerEvent) => {
    held = false
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
  }
  stage.addEventListener("pointerdown", onDown)
  stage.addEventListener("pointermove", onMove)
  stage.addEventListener("pointerup", onUp)
  stage.addEventListener("pointercancel", onUp)

  // ── Rows lit while hovered, focused or held ──
  const glows = KEYS.map(() => 0)
  let hot: Key | null = null
  const keyOf = (t: EventTarget | null) =>
    ((t as HTMLElement | null)?.closest?.("[data-field]") as HTMLElement | null)?.dataset.field as
      | Key
      | undefined
  const onOver = (e: Event) => {
    hot = keyOf(e.target) ?? null
  }
  const onLeave = () => {
    hot = null
  }
  slot.addEventListener("pointerover", onOver)
  slot.addEventListener("focusin", onOver)
  slot.addEventListener("pointerleave", onLeave)
  slot.addEventListener("focusout", onLeave)

  // ── Running: only on screen, in a visible tab ──
  let onScreen = true
  let running = false
  let raf = 0
  let gpu: Gpu | null = null
  let still: (() => void) | null = null
  const io = new IntersectionObserver((es) => {
    onScreen = es.some((e) => e.isIntersecting)
    wake()
  })
  io.observe(host)
  const wake = () => {
    const go = onScreen && document.visibilityState === "visible" && !!gpu
    if (go && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    } else if (!go && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }
  document.addEventListener("visibilitychange", wake)
  const ro = new ResizeObserver(() => {
    fit()
    still?.()
  })
  ro.observe(stage)
  ro.observe(slot)
  narrow.addEventListener("change", fit)

  let last = performance.now()
  let arrive = 0
  const frame = (t: number) => {
    if (!running || !gpu) return
    const dt = Math.min(1 / 30, Math.max(0, (t - last) / 1000))
    last = t
    const calm = reducedQuery.matches
    arrive = calm ? 1 : Math.min(1, arrive + dt / 1.6)
    pull += ((held ? 1 : 0) - pull) * (1 - Math.exp(-dt / 0.12))
    KEYS.forEach((k, i) => {
      glows[i] = glows[i]! + ((k === hot ? 1 : 0) - glows[i]!) * (1 - Math.exp(-dt / 0.12))
    })
    ease(dt)
    paintText()
    // Reduced motion: the same machine, slowly.
    const simDt = dt * (calm ? 0.3 : 1)
    simTime += simDt
    gpu.frame(simDt, dt, arrive)
    raf = requestAnimationFrame(frame)
  }

  // ── Values the GPU reads ──
  const rowValue = (k: Key) => {
    const v = store.get()
    switch (k) {
      case "speed":
        return (v.speed - 10) / 90
      case "predators":
        return v.predators / 6
      case "containment":
        return (v.containment - 55) / 45
      case "signal":
        return SIGNALS.indexOf(v.signal as Signal) / 2
      case "lure":
        return Math.hypot(v.lure.x - 0.5, v.lure.y - 0.5) * 2
      default:
        return (v[k] as number) / 100
    }
  }
  const params = new Float32Array(48 + 32)
  const writeParams = (
    simDt: number,
    dt: number,
    arrival: number,
    w: number,
    h: number,
    dpr: number,
    frameNo: number,
  ) => {
    const p = params
    const set = (i: number, a: number, b: number, c: number, d: number) =>
      p.set([a, b, c, d], i * 4)
    // Agents per near cell, on average over the containment disc.
    const cell = (2.2 / NEAR) ** 2
    const meanNear = AGENTS / ((Math.PI * now.rc * now.rc) / cell)
    set(0, now.sim[0]!, now.sim[1]!, now.sim[2]!, now.sim[3]!)
    set(1, now.preds, now.rc, simDt, simTime)
    set(2, now.lure[0]!, now.lure[1]!, 0.32, pull)
    set(3, AGENTS, frameNo, meanNear, meanNear)
    set(4, w, h, dpr, 0.5 ** (dt / TRAIL_HALF))
    set(5, lay.cx, lay.cy, lay.R, arrival)
    set(6, lay.col[0]!, lay.col[1]!, lay.col[2]!, lay.col[3]!)
    set(7, lay.panelX, lay.rows.length, -1, 0)
    set(8, now.pal[0]![0]!, now.pal[0]![1]!, now.pal[0]![2]!, 1)
    set(9, now.pal[1]![0]!, now.pal[1]![1]!, now.pal[1]![2]!, 0)
    set(10, now.pal[2]![0]!, now.pal[2]![1]!, now.pal[2]![2]!, 0)
    set(11, page[0], page[1], page[2], 0)
    lay.rows.forEach((y, i) => set(12 + i, y, rowValue(KEYS[i]!), glows[i]!, 0))
    return p
  }

  const night =
    getComputedStyle(document.documentElement).getPropertyValue("--night").trim() || "#101012"
  const hex = /^#?([0-9a-f]{6})$/i.exec(night)?.[1] ?? "101012"
  const page = [0, 2, 4].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]

  let disposed = false
  fit()
  paintText()
  const noGpu = new URLSearchParams(location.search).has("nogpu") || !navigator.gpu
  const fallback = () => {
    if (disposed) return
    still = drawStill(
      stage,
      lay,
      () => store.get().containment,
      () => now.pal,
    )
    store.subscribe(() => {
      ease(1)
      paintText()
      still?.()
    })
    showStats({ order: 0.74, pace: 0.51, fear: 0, clusters: 3, tracks: [] })
  }
  if (noGpu) fallback()
  else
    createGpu(stage, page, writeParams, showStats)
      .then((g) => {
        if (disposed) return g?.destroy()
        if (!g) return fallback()
        gpu = g
        Object.assign(window, { __magi: { bench: g.bench } })
        wake()
      })
      .catch((e) => {
        console.warn("hero-magi: no WebGPU", e)
        fallback()
      })

  return {
    dispose() {
      disposed = true
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener("visibilitychange", wake)
      narrow.removeEventListener("change", fit)
      gpu?.destroy()
      panel.dispose()
      stage.remove()
      text.remove()
      slot.remove()
    },
  }
}

/** What the readouts show, read back from the GPU a few times a second. */
interface Stats {
  order: number
  pace: number
  fear: number
  clusters: number
  tracks: { id: number; mass: number }[]
}

interface Gpu {
  frame(simDt: number, dt: number, arrive: number): void
  bench(frames?: number): Promise<Record<string, number>>
  destroy(): void
}

type WriteParams = (
  simDt: number,
  dt: number,
  arrive: number,
  w: number,
  h: number,
  dpr: number,
  frame: number,
) => Float32Array<ArrayBuffer>

async function createGpu(
  stage: HTMLElement,
  page: readonly number[],
  writeParams: WriteParams,
  onStats: (s: Stats) => void,
): Promise<Gpu | null> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
  if (!adapter) return null
  const timing = adapter.features.has("timestamp-query")
  const device = await adapter.requestDevice({
    requiredFeatures: timing ? ["timestamp-query"] : [],
  })
  device.addEventListener("uncapturederror", (e) =>
    console.error("hero-magi:", (e as GPUUncapturedErrorEvent).error.message),
  )
  const canvas = document.createElement("canvas")
  canvas.setAttribute("aria-hidden", "true")
  stage.append(canvas)
  const ctx = canvas.getContext("webgpu")!
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: "opaque" })

  const compile = (code: string, label: string) => {
    const m = device.createShaderModule({ code, label })
    m.getCompilationInfo().then((info) => {
      for (const x of info.messages)
        if (x.type === "error")
          console.error(`hero-magi ${label} ${x.lineNum}:${x.linePos} ${x.message}`)
    })
    return m
  }
  const simMod = compile(commonWgsl + simWgsl, "magi-sim")
  const drawMod = compile(commonWgsl + drawWgsl, "magi-draw")
  const postMod = compile(postWgsl, "magi-post")

  // ── Buffers ──
  const S = GPUBufferUsage.STORAGE
  const buf = (size: number, usage: number) => device.createBuffer({ size, usage })
  const uniform = buf(80 * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
  const agents = buf(AGENTS * 16, S)
  const aux = buf(AGENTS * 16, S)
  const grid = buf(NEAR * NEAR * 3 * 4, S | GPUBufferUsage.COPY_DST)
  const preds = buf(PREDS * 2 * 16, S)
  const stats = buf(16 * 4, S | GPUBufferUsage.COPY_DST)
  const cand = buf(32 * 16, S)
  const tracks = buf(TRACKS * 2 * 16, S | GPUBufferUsage.COPY_SRC)
  const hist = buf((HIST + 2) * 16, S | GPUBufferUsage.COPY_SRC)
  const READ = 2 * 16 + TRACKS * 2 * 16
  const reads = [0, 1].map(() => buf(READ, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST))
  const fieldTex = (n: number) =>
    device.createTexture({
      size: [n, n],
      format: HDR,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
  const near = fieldTex(NEAR)
  const far = fieldTex(FAR)
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  })

  // ── The simulation's pipelines ──
  const C = GPUShaderStage.COMPUTE
  const storage = (binding: number, visibility = C): GPUBindGroupLayoutEntry => ({
    binding,
    visibility,
    buffer: { type: "storage" },
  })
  const g0 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: C, buffer: {} },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((b) => storage(b)),
      { binding: 9, visibility: C, sampler: {} },
    ],
  })
  const store = (binding: number): GPUBindGroupLayoutEntry => ({
    binding,
    visibility: C,
    storageTexture: { access: "write-only", format: HDR },
  })
  const sampled = (binding: number, visibility = C): GPUBindGroupLayoutEntry => ({
    binding,
    visibility,
    texture: {},
  })
  const g1Resolve = device.createBindGroupLayout({ entries: [store(0)] })
  const g1Far = device.createBindGroupLayout({ entries: [sampled(1), store(2)] })
  const g1Read = device.createBindGroupLayout({ entries: [sampled(1), sampled(3)] })
  const computePipe = (entryPoint: string, g1: GPUBindGroupLayout) =>
    device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [g0, g1] }),
      compute: { module: simMod, entryPoint },
    })
  const pInit = computePipe("init", g1Read)
  const pSplat = computePipe("splat", g1Read)
  const pResolve = computePipe("resolve", g1Resolve)
  const pFar = computePipe("far", g1Far)
  const pHunt = computePipe("hunt", g1Read)
  const pAdvance = computePipe("advance", g1Read)
  const pMaxima = computePipe("maxima", g1Read)
  const pTrack = computePipe("track", g1Read)
  const b0 = device.createBindGroup({
    layout: g0,
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      ...[agents, aux, grid, preds, stats, cand, tracks, hist].map((b, i) => ({
        binding: i + 1,
        resource: { buffer: b },
      })),
      { binding: 9, resource: sampler },
    ],
  })
  const bResolve = device.createBindGroup({
    layout: g1Resolve,
    entries: [{ binding: 0, resource: near.createView() }],
  })
  const bFar = device.createBindGroup({
    layout: g1Far,
    entries: [
      { binding: 1, resource: near.createView() },
      { binding: 2, resource: far.createView() },
    ],
  })
  const bRead = device.createBindGroup({
    layout: g1Read,
    entries: [
      { binding: 1, resource: near.createView() },
      { binding: 3, resource: far.createView() },
    ],
  })

  // ── The display's pipelines ──
  const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
  const F = GPUShaderStage.FRAGMENT
  const r0 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: VF, buffer: {} },
      ...[1, 2, 3, 4, 5].map((binding) => ({
        binding,
        visibility: VF,
        buffer: { type: "read-only-storage" as const },
      })),
      sampled(6, F),
      { binding: 7, visibility: F, sampler: {} },
    ],
  })
  const r1 = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: F, texture: { sampleType: "unfilterable-float" } }],
  })
  const rb0 = device.createBindGroup({
    layout: r0,
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      ...[agents, aux, preds, tracks, hist].map((b, i) => ({
        binding: i + 1,
        resource: { buffer: b },
      })),
      { binding: 6, resource: far.createView() },
      { binding: 7, resource: sampler },
    ],
  })
  const add: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
  }
  const keep: GPUBlendState = {
    color: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
    alpha: { srcFactor: "zero", dstFactor: "constant", operation: "add" },
  }
  const drawPipe = (vs: string, fs: string, layouts: GPUBindGroupLayout[], blend?: GPUBlendState) =>
    device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: layouts }),
      vertex: { module: drawMod, entryPoint: vs },
      fragment: { module: drawMod, entryPoint: fs, targets: [{ format: HDR, blend }] },
      primitive: { topology: "triangle-list" },
    })
  const pFade = drawPipe("vs_full", "fs_fade", [r0], keep)
  const pAgent = drawPipe("vs_agent", "fs_agent", [r0], add)
  const pHud = drawPipe("vs_full", "fs_hud", [r0, r1])

  // ── Bloom and tone: the catalog's post pass ──
  const postLayout = device.createBindGroupLayout({
    entries: [
      sampled(0, F),
      { binding: 1, visibility: F, sampler: {} },
      { binding: 2, visibility: F, buffer: {} },
      sampled(3, F),
      { binding: 4, visibility: F, texture: { sampleType: "unfilterable-float" } },
    ],
  })
  const postPl = device.createPipelineLayout({ bindGroupLayouts: [postLayout] })
  const postPipe = (entryPoint: string, fmt: GPUTextureFormat, blend?: GPUBlendState) =>
    device.createRenderPipeline({
      layout: postPl,
      vertex: { module: postMod, entryPoint: "vs_full" },
      fragment: { module: postMod, entryPoint, targets: [{ format: fmt, blend }] },
      primitive: { topology: "triangle-list" },
    })
  const pDown = postPipe("fs_down", HDR)
  const pUp = postPipe("fs_up", HDR, add)
  const pComposite = postPipe("fs_composite", format)
  const noiseTex = device.createTexture({
    size: [64, 64],
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture({ texture: noiseTex }, blueNoise(64), { bytesPerRow: 64 * 4 }, [64, 64])
  const noise = noiseTex.createView()

  // ── Timing: the GPU's own clock where there is one ──
  const query = timing ? device.createQuerySet({ type: "timestamp", count: 2 }) : null
  const queryBuf = query ? buf(16, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC) : null
  const queryRead = query ? buf(16, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST) : null
  let queryBusy = false
  let gpuMs = 0
  const gpuSamples: number[] = []

  // ── Size-dependent targets ──
  interface Targets {
    w: number
    h: number
    dpr: number
    trail: GPUTexture
    hdr: GPUTexture
    levels: GPUTexture[]
    rb1: GPUBindGroup
    post: GPUBindGroup[]
    bufs: GPUBuffer[]
  }
  let tg: Targets | null = null
  const postData = new Float32Array(16)
  const writePost = (b: GPUBuffer, tex: GPUTexture, first: number) => {
    const u = postData
    u.fill(0)
    u[0] = 1 / tex.width
    u[1] = 1 / tex.height
    u[4] = first
    u[5] = 1
    u[6] = 0.2
    u[7] = 1
    u[8] = 1
    u[10] = 1
    u[11] = 1
    u.set(page, 12)
    u[15] = 0.05
    device.queue.writeBuffer(b, 0, u)
  }
  const fitTargets = () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.max(2, Math.round(stage.clientWidth * dpr))
    const h = Math.max(2, Math.round(stage.clientHeight * dpr))
    if (tg && tg.w === w && tg.h === h) return tg
    if (tg) for (const t of [tg.trail, tg.hdr, ...tg.levels]) t.destroy()
    canvas.width = w
    canvas.height = h
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const trail = tex(w, h)
    const hdr = tex(w, h)
    const levels = Array.from({ length: LEVELS }, (_, i) => tex(w >> (i + 1), h >> (i + 1)))
    const bufs =
      tg?.bufs ??
      Array.from({ length: LEVELS * 2 }, () =>
        buf(64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST),
      )
    const bind = (src: GPUTexture, b: GPUBuffer, bloom: GPUTexture) =>
      device.createBindGroup({
        layout: postLayout,
        entries: [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: b } },
          { binding: 3, resource: bloom.createView() },
          { binding: 4, resource: noise },
        ],
      })
    // Down: hdr → L0 → … → L4. Up: L4 → L3 … → L0 (added on). Composite: hdr with L0.
    const post: GPUBindGroup[] = []
    for (let i = 0; i < LEVELS; i++) {
      const src = i ? levels[i - 1]! : hdr
      writePost(bufs[i]!, src, i ? 0 : 1)
      post.push(bind(src, bufs[i]!, hdr))
    }
    for (let i = LEVELS - 1; i > 0; i--) {
      const b = bufs[LEVELS + (LEVELS - 1 - i)]!
      writePost(b, levels[i]!, 0)
      post.push(bind(levels[i]!, b, hdr))
    }
    writePost(bufs[LEVELS * 2 - 1]!, hdr, 0)
    post.push(bind(hdr, bufs[LEVELS * 2 - 1]!, levels[0]!))
    const rb1 = device.createBindGroup({
      layout: r1,
      entries: [{ binding: 0, resource: trail.createView() }],
    })
    tg = { w, h, dpr: w / Math.max(1, stage.clientWidth), trail, hdr, levels, rb1, post, bufs }
    return tg
  }

  // Seed the swarm.
  {
    const enc = device.createCommandEncoder()
    const pass = enc.beginComputePass()
    pass.setPipeline(pInit)
    pass.setBindGroup(0, b0)
    pass.setBindGroup(1, bRead)
    pass.dispatchWorkgroups(Math.ceil(AGENTS / 64))
    pass.end()
    device.queue.submit([enc.finish()])
  }

  let frameNo = 0
  let readIdx = 0
  const reading = [false, false]
  const encode = (simDt: number, dt: number, arrive: number) => {
    const t = fitTargets()
    frameNo++
    device.queue.writeBuffer(uniform, 0, writeParams(simDt, dt, arrive, t.w, t.h, t.dpr, frameNo))
    const enc = device.createCommandEncoder()
    enc.clearBuffer(grid)
    const timed = query && !queryBusy
    const cp = enc.beginComputePass(
      timed ? { timestampWrites: { querySet: query!, beginningOfPassWriteIndex: 0 } } : {},
    )
    cp.setBindGroup(0, b0)
    const run = (p: GPUComputePipeline, g1: GPUBindGroup, x: number, y = 1) => {
      cp.setPipeline(p)
      cp.setBindGroup(1, g1)
      cp.dispatchWorkgroups(x, y)
    }
    run(pSplat, bRead, Math.ceil(AGENTS / 64))
    run(pResolve, bResolve, NEAR / 8, NEAR / 8)
    run(pFar, bFar, FAR / 8, FAR / 8)
    run(pHunt, bRead, 1)
    run(pAdvance, bRead, Math.ceil(AGENTS / 64))
    run(pMaxima, bRead, FAR / 8, FAR / 8)
    run(pTrack, bRead, 1)
    cp.end()
    // The trail: last frame's fades, this frame's agents add on.
    let rp = enc.beginRenderPass({
      colorAttachments: [{ view: t.trail.createView(), loadOp: "load", storeOp: "store" }],
    })
    rp.setBindGroup(0, rb0)
    const decay = 0.5 ** (dt / TRAIL_HALF)
    rp.setBlendConstant([decay, decay, decay, decay])
    rp.setPipeline(pFade)
    rp.draw(3)
    rp.setPipeline(pAgent)
    rp.draw(6, AGENTS)
    rp.end()
    const pass = (view: GPUTextureView, load: GPULoadOp, last = false) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
        ...(last && timed ? { timestampWrites: { querySet: query!, endOfPassWriteIndex: 1 } } : {}),
      })
    rp = pass(t.hdr.createView(), "clear")
    rp.setPipeline(pHud)
    rp.setBindGroup(0, rb0)
    rp.setBindGroup(1, t.rb1)
    rp.draw(3)
    rp.end()
    for (let i = 0; i < LEVELS; i++) {
      rp = pass(t.levels[i]!.createView(), "clear")
      rp.setPipeline(pDown)
      rp.setBindGroup(0, t.post[i]!)
      rp.draw(3)
      rp.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      rp = pass(t.levels[LEVELS - 2 - k]!.createView(), "load")
      rp.setPipeline(pUp)
      rp.setBindGroup(0, t.post[LEVELS + k]!)
      rp.draw(3)
      rp.end()
    }
    rp = pass(ctx.getCurrentTexture().createView(), "clear", true)
    rp.setPipeline(pComposite)
    rp.setBindGroup(0, t.post[LEVELS * 2 - 1]!)
    rp.draw(3)
    rp.end()
    if (timed) {
      enc.resolveQuerySet(query!, 0, 2, queryBuf!, 0)
      enc.copyBufferToBuffer(queryBuf!, 0, queryRead!, 0, 16)
    }
    // The numbers for the readouts, a few times a second.
    const r = readIdx
    const readNow = frameNo % 8 === 0 && !reading[r]
    if (readNow) {
      enc.copyBufferToBuffer(hist, HIST * 16, reads[r]!, 0, 32)
      enc.copyBufferToBuffer(tracks, 0, reads[r]!, 32, TRACKS * 2 * 16)
    }
    device.queue.submit([enc.finish()])
    if (timed) {
      queryBusy = true
      queryRead!.mapAsync(GPUMapMode.READ).then(
        () => {
          const ts = new BigInt64Array(queryRead!.getMappedRange())
          const ms = Number(ts[1]! - ts[0]!) / 1e6
          queryRead!.unmap()
          queryBusy = false
          if (ms > 0 && ms < 100) {
            gpuSamples.push(ms)
            if (gpuSamples.length > 60) gpuSamples.shift()
            gpuMs = gpuSamples.reduce((a, b) => a + b, 0) / gpuSamples.length
          }
        },
        () => {
          queryBusy = false
        },
      )
    }
    if (readNow) {
      reading[r] = true
      readIdx = 1 - r
      const rb = reads[r]!
      rb.mapAsync(GPUMapMode.READ).then(
        () => {
          const f = new Float32Array(rb.getMappedRange().slice(0))
          rb.unmap()
          reading[r] = false
          const list: { id: number; mass: number }[] = []
          for (let i = 0; i < TRACKS; i++) {
            const alive = f[8 + i * 8 + 4]!
            if (alive > 0.5) list.push({ id: f[8 + i * 8 + 5]!, mass: f[8 + i * 8 + 2]! })
          }
          list.sort((a, b) => b.mass - a.mass)
          onStats({ order: f[1]!, pace: f[2]!, fear: f[3]!, clusters: f[4]!, tracks: list })
        },
        () => {
          reading[r] = false
        },
      )
    }
  }

  return {
    frame: encode,
    async bench(frames = 60) {
      await device.queue.onSubmittedWorkDone()
      const t0 = performance.now()
      for (let i = 0; i < frames; i++) encode(1 / 60, 1 / 60, 1)
      await device.queue.onSubmittedWorkDone()
      const wall = (performance.now() - t0) / frames
      await new Promise((r) => setTimeout(r, 300))
      const t = fitTargets()
      return {
        queueMs: +wall.toFixed(2),
        gpuMs: +gpuMs.toFixed(2),
        w: t.w,
        h: t.h,
        timestamps: timing ? 1 : 0,
      }
    },
    destroy() {
      device.destroy()
      canvas.remove()
    },
  }
}

/** Without WebGPU: the display, still, in SVG: the ring, its gauges, a swarm caught mid-turn. */
function drawStill(
  stage: HTMLElement,
  lay: { cx: number; cy: number; R: number; col: number[] },
  containment: () => number,
  pal: () => number[][],
) {
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "magi-still")
  svg.setAttribute("aria-hidden", "true")
  stage.append(svg)
  let seed = 11
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  // Three streams of agents, as a flock looks in one instant.
  const dots: [number, number][] = []
  for (let s = 0; s < 3; s++) {
    const a0 = rnd() * Math.PI * 2
    const r0 = 0.35 + rnd() * 0.3
    for (let i = 0; i < 260; i++) {
      const u = i / 260
      const a = a0 + u * 1.6
      const r = r0 + Math.sin(u * 6 + s) * 0.08 + (rnd() - 0.5) * 0.09
      dots.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  }
  const css = (c: number[]) =>
    `rgb(${c.map((x) => Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055))).join(" ")})`
  return () => {
    const { cx, cy, R } = lay
    const [a, b] = pal()
    const rc = 0.55 + (0.43 * (containment() - 55)) / 45
    const ticks = Array.from({ length: 96 }, (_, i) => {
      const t = (i / 96) * Math.PI * 2
      const lit = i / 96 < 0.74
      return `<line x1="${cx + Math.cos(t) * R * 1.035}" y1="${cy + Math.sin(t) * R * 1.035}" x2="${cx + Math.cos(t) * R * 1.07}" y2="${cy + Math.sin(t) * R * 1.07}" stroke="${css(b!)}" stroke-opacity="${lit ? 0.9 : 0.15}"/>`
    }).join("")
    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(214,220,232,.2)"/>
      <circle cx="${cx}" cy="${cy}" r="${R * rc}" fill="none" stroke="${css(a!)}" stroke-width="1.5"/>
      ${ticks}
      ${dots.map(([x, y]) => `<circle cx="${cx + x * R * rc}" cy="${cy + y * R * rc}" r="1.1" fill="${css(b!)}" fill-opacity=".8"/>`).join("")}`
  }
}

/** Blue noise for the dither: white noise high-passed three times, then ranked. */
function blueNoise(n: number) {
  let v = new Float32Array(n * n)
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < v.length; i++) v[i] = rnd()
  const K = [0.06, 0.24, 0.4, 0.24, 0.06]
  for (let pass = 0; pass < 3; pass++) {
    const a = new Float32Array(v.length)
    const b = new Float32Array(v.length)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0
        for (let k = -2; k <= 2; k++) s += K[k + 2]! * v[y * n + ((x + k + n) % n)]!
        a[y * n + x] = s
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0
        for (let k = -2; k <= 2; k++) s += K[k + 2]! * a[((y + k + n) % n) * n + x]!
        b[y * n + x] = v[y * n + x]! - s
      }
    v = b
  }
  const order = [...v.keys()].sort((i, j) => v[i]! - v[j]!)
  const out = new Float32Array(v.length)
  order.forEach((i, rank) => {
    out[i] = (rank + 0.5) / v.length
  })
  return out
}
