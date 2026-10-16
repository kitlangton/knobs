/// <reference types="@webgpu/types" />
// A hero: Swarm, a tactical display watching a live simulation. Sixteen thousand agents flock in
// a containment ring, simulated on the GPU (hero-swarm-sim.wgsl), while the display reads them
// live (hero-swarm-draw.wgsl): brackets lock onto the largest clusters and follow them, a radar
// shows the density, a scope plots the swarm's order, pace and fear, two arcs round the ring
// show its order and pace, and a wire runs from each row of the panel to what that row drives.
// The panel operates it: alignment, cohesion, separation, predators, the display's colour
// scheme, containment, the lure (which a drag in the ring also places; held, it pulls harder)
// and speed. Bloom and tone are the catalog's (controls-post.wgsl). Without WebGPU, a still of
// the display stands in.
import { choice, defineControls, knob, point } from "knobs"
import { mountPanel } from "knobs/panel"
import { blueNoise } from "./controls-gpu"
import postWgsl from "./controls-post.wgsl?raw"
import commonWgsl from "./hero-swarm-common.wgsl?raw"
import drawWgsl from "./hero-swarm-draw.wgsl?raw"
import simWgsl from "./hero-swarm-sim.wgsl?raw"

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
/** Half the span of the order and pace arcs (rad), as in hero-swarm-common.wgsl. */
const ARC = 0.44
/** The wires' moving ends, after the history and the latest statistics (vec4s). */
const ANCHORS = 3
/** Segments in each wire's curve, as in hero-swarm-draw.wgsl. */
const WIRE_SEGS = 48

/**
 * A scheme: a whole look. Its frame (rings, bezel, wires, the acquiring brackets), the swarm
 * cruising (and the gauges and radar), the swarm at speed, the alert (predators and the fear they
 * spread), the hex lattice's tint, all sRGB 0–1; then how bright an agent burns, how much bloom
 * softens the frame, and how far the trail reads as heat (its density through black, red, orange
 * and yellow) instead of its own colours.
 */
interface Scheme {
  frame: readonly number[]
  calm: readonly number[]
  fast: readonly number[]
  alert: readonly number[]
  lattice: readonly number[]
  gain: number
  bloom: number
  heat?: number
}
const SCHEME_NAMES = ["Tactical", "Synthwave", "Acid", "Arctic", "Solar", "Thermal"] as const
type SchemeName = (typeof SCHEME_NAMES)[number]
const SCHEMES: Record<SchemeName, Scheme> = {
  // Emerald trails, a hot orange frame, red alerts: the swarm's first look.
  Tactical: {
    frame: [1.0, 0.56, 0.16],
    calm: [0.2, 1.0, 0.58],
    fast: [1.0, 0.6, 0.2],
    alert: [1.0, 0.16, 0.2],
    lattice: [0.2, 1.0, 0.58],
    gain: 0.27,
    bloom: 0.2,
  },
  // Cyan trails that run pink, a magenta frame, yellow alerts on a violet lattice.
  Synthwave: {
    frame: [1.0, 0.2, 0.74],
    calm: [0.12, 0.84, 1.0],
    fast: [1.0, 0.42, 0.88],
    alert: [1.0, 0.92, 0.3],
    lattice: [0.58, 0.3, 1.0],
    gain: 0.27,
    bloom: 0.26,
  },
  // Violet trails that go acid lime at speed, a lime frame, hot pink alerts.
  Acid: {
    frame: [0.76, 1.0, 0.12],
    calm: [0.62, 0.34, 1.0],
    fast: [0.82, 1.0, 0.28],
    alert: [1.0, 0.22, 0.56],
    lattice: [0.62, 0.34, 1.0],
    gain: 0.32,
    bloom: 0.24,
  },
  // Ice-white trails, a cyan frame, and red where the predators are.
  Arctic: {
    frame: [0.3, 0.84, 1.0],
    calm: [0.8, 0.93, 1.0],
    fast: [0.36, 0.88, 1.0],
    alert: [1.0, 0.12, 0.16],
    lattice: [0.3, 0.84, 1.0],
    gain: 0.21,
    bloom: 0.22,
  },
  // Crimson trails burning gold at speed, a gold frame, cyan alerts.
  Solar: {
    frame: [1.0, 0.76, 0.2],
    calm: [0.95, 0.12, 0.24],
    fast: [1.0, 0.68, 0.18],
    alert: [0.36, 0.86, 1.0],
    lattice: [0.95, 0.12, 0.24],
    gain: 0.3,
    bloom: 0.27,
  },
  // The swarm as heat: its density from black through red and orange to yellow.
  Thermal: {
    frame: [1.0, 0.38, 0.08],
    calm: [0.72, 0.72, 0.72],
    fast: [0.72, 0.72, 0.72],
    alert: [0.6, 0.92, 1.0],
    lattice: [1.0, 0.22, 0.04],
    gain: 0.3,
    bloom: 0.3,
    heat: 1,
  },
}
/** A scheme as the frame reads it: its colours linear, in the order of the shader's pal0–pal4. */
const flat = (s: Scheme) => [
  ...[s.frame, s.calm, s.alert, s.fast, s.lattice].map((c) => c.map(toLinear)),
  [s.gain, s.bloom, s.heat ?? 0],
]

// The rows run top to bottom in the order their wires land round the ring, so they barely cross.
const schema = {
  alignment: knob(72, { min: 0, max: 100, step: 1, unit: "%", label: "Alignment" }),
  cohesion: knob(55, { min: 0, max: 100, step: 1, unit: "%", label: "Cohesion" }),
  separation: knob(40, { min: 0, max: 100, step: 1, unit: "%", label: "Separation" }),
  predators: knob(1, { min: 0, max: 6, step: 1, label: "Predators" }),
  scheme: choice("Tactical", SCHEME_NAMES, { label: "Scheme" }),
  containment: knob(94, { min: 55, max: 100, step: 1, unit: "%", label: "Containment" }),
  lure: point({ x: 0.62, y: 0.42 }, { min: 0, max: 1, step: 0.01, label: "Lure" }),
  speed: knob(48, { min: 10, max: 100, step: 1, unit: "%", label: "Speed" }),
}
type Key = keyof typeof schema
const KEYS = Object.keys(schema) as Key[]
/** What each row's wire lands on (hero-swarm-draw.wgsl's `wire`). */
const LANDS: Record<Key, number> = {
  cohesion: 0, // the heaviest cluster's bracket
  alignment: 1, // the tip of the order arc
  separation: 2, // the next cluster's bracket
  speed: 3, // the tip of the pace arc
  predators: 4, // a predator
  containment: 5, // the containment ring
  scheme: 6, // the bezel, in the scheme's frame colour
  lure: 7, // the lure's reticle
}

const CSS = `
.swarm-stage { position: absolute; inset: 0; user-select: none; -webkit-user-select: none; touch-action: none; }
.swarm-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.swarm-text { position: absolute; inset: 0; pointer-events: none; font: 500 11px/1 ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace; letter-spacing: .06em; color: var(--swarm-a); font-variant-numeric: tabular-nums; transition: opacity .6s ease; }
.swarm-text > div { position: absolute; left: 0; top: 0; white-space: nowrap; }
.swarm-text .dim { color: rgba(237, 227, 207, .62); }
.swarm-text .b { color: var(--swarm-b); }
.swarm-text .c { color: var(--swarm-c); }
.swarm-text .v { text-shadow: 0 0 12px color-mix(in srgb, currentColor 45%, transparent); }
.swarm-text .rows { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; }
.swarm-text .rows span:nth-child(even) { text-align: right; color: var(--swarm-b); }
.swarm-panel { position: absolute; top: 0; bottom: 0; right: max(32px, calc(50% - 620px)); width: 320px; display: flex; flex-direction: column; justify-content: center; pointer-events: none; }
.swarm-panel .knobs-panel { --k-width: 100%; pointer-events: auto; }
.swarm-still { position: absolute; inset: 0; width: 100%; height: 100%; }
@media (max-width: 900px) {
  .swarm-stage { position: relative; height: 58vh; min-height: 360px; }
  .swarm-panel { position: static; width: auto; max-width: 420px; margin: 0 auto; padding: 0 16px; display: block; pointer-events: auto; }
  .swarm-text { display: none; }
}
`

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")

export function mountHeroSwarm(host: HTMLElement): { dispose(): void } {
  if (!document.getElementById("swarm-css")) {
    const style = document.createElement("style")
    style.id = "swarm-css"
    style.textContent = CSS
    document.head.append(style)
  }
  const el = (cls: string, parent: HTMLElement = host) => {
    const e = document.createElement("div")
    e.className = cls
    parent.append(e)
    return e
  }
  // A host with a stage of its own (the landing's layer) gets the display in it, under the
  // host's title; else the display goes in first.
  const room = host.querySelector<HTMLElement>(":scope > .hero-stage")
  const stage = el("swarm-stage", room ?? host)
  if (!room) host.prepend(stage)
  const text = el("swarm-text", room ?? host)
  stage.after(text)
  const slot = el("swarm-panel")
  const narrow = matchMedia("(max-width: 900px)")

  // ── The panel ──
  const store = defineControls("hero-swarm", schema, {
    enabled: true,
    storage: null,
    defaultLabel: "Flock",
    presets: {
      Cloud: {
        cohesion: 92,
        alignment: 10,
        separation: 28,
        speed: 74,
        predators: 0,
        containment: 74,
        scheme: "Acid",
        lure: { x: 0.5, y: 0.5 },
      },
      Panic: {
        cohesion: 38,
        alignment: 64,
        separation: 52,
        speed: 88,
        predators: 5,
        containment: 100,
        scheme: "Arctic",
        lure: { x: 0.24, y: 0.7 },
      },
      Vortex: {
        cohesion: 26,
        alignment: 96,
        separation: 46,
        speed: 64,
        predators: 0,
        containment: 86,
        scheme: "Synthwave",
        lure: { x: 0.5, y: 0.5 },
      },
    },
    onChange(_patch, _values, meta) {
      // Under the hand it follows at once; a preset, Random or undo glides.
      glide = meta.source === "local" ? 0 : 0.45
    },
  })
  const panel = mountPanel(store, slot, {
    title: "Swarm",
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
    return {
      sim: [v.cohesion / 100, v.alignment / 100, v.separation / 100, (v.speed - 10) / 90],
      preds: v.predators,
      rc: 0.55 + (0.43 * (v.containment - 55)) / 45,
      lure: [(v.lure.x - 0.5) * 2 * LURE_SPAN, (v.lure.y - 0.5) * 2 * LURE_SPAN],
      pal: flat(SCHEMES[v.scheme as SchemeName] ?? SCHEMES.Tactical),
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
    // A scheme always crossfades, every colour, the bloom and the heat together (it's a look,
    // not a hand's motion).
    const kp = 1 - Math.exp(-dt / 0.22)
    now.pal.forEach((c, i) => c.forEach((x, j) => (c[j] = x + (t.pal[i]![j]! - x) * kp)))
  }

  // ── Layout: the ring and its instruments in the room the panel leaves ──
  const lay = { w: 0, h: 0, cx: 0, cy: 0, R: 1, col: [0, 0, 0, 0], panelX: 0, rows: [] as number[] }
  /** The scope's share of the instrument column, and the radar's radius in it. */
  const SCOPE = 0.29
  const radarR = (col: number[]) => Math.min(col[2]! * 0.5 - 4, col[3]! * 0.22)
  /** Each row's middle (px from the stage's top), where its wire leaves the panel. */
  const measureRows = () => {
    if (!lay.panelX) return
    const top = stage.getBoundingClientRect().top
    lay.rows = KEYS.map((k) => {
      const row = slot.querySelector<HTMLElement>(`[data-field="${k}"]`)
      const head = row?.querySelector<HTMLElement>(".knobs-x-head") ?? row
      const r = head?.getBoundingClientRect()
      return r ? r.top - top + r.height / 2 : -1
    })
  }
  const fit = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    const beside = !narrow.matches
    const sr = stage.getBoundingClientRect()
    const pr = slot.querySelector(".knobs-panel")?.getBoundingClientRect()
    // On the landing page the hero switch sits in the top left corner: the frame stays below it.
    const sw = host.closest(".hero")?.querySelector(".hero-variant")?.getBoundingClientRect()
    const roof = sw && sw.height > 0 ? sw.bottom - sr.top + 14 : 18
    lay.w = w
    lay.h = h
    if (beside && pr) {
      // The whole group, centred on the page: the frame's marks (21 px past it), the instrument
      // column, the ring, a gap the wires curve through, the panel. The gap is whatever puts the
      // ring nearest the page's centre, within what the wires need.
      const pw = pr.width
      const cw = Math.max(150, Math.min(220, w * 0.15))
      const side = 24
      const gapMin = 90
      // The frame reaches 1.3 R above and below the ring, with its marks and the clock above it
      // (28 px) and its marks below (22 px).
      const R = Math.max(
        100,
        Math.min((h - 22 - 16 - roof - 28) / 2.6, (w - 2 * side - 43 - cw - gapMin - pw) / 2.91),
      )
      const before = 43 + cw + 1.55 * R
      const after = 1.36 * R + pw
      const gap = Math.min(220, Math.max(gapMin, before - after))
      const left = Math.max(16, (w - (before + gap + after)) / 2)
      lay.R = R
      lay.cx = left + before
      lay.cy = (roof + 28 + h - 38) / 2
      lay.col = [left + 43, lay.cy - 1.18 * R, cw, 2.36 * R]
      lay.panelX = lay.cx + 1.36 * R + gap
      slot.style.right = `${Math.max(0, w - lay.panelX - pw).toFixed(1)}px`
      measureRows()
    } else {
      slot.style.right = ""
      lay.R = Math.min((w / 2 - 16) / 1.5, h * 0.36)
      lay.cx = w / 2
      lay.cy = h * 0.52
      lay.col = [0, 0, 0, 0]
      lay.panelX = 0
      lay.rows = []
    }
    placeText()
  }

  // ── The readouts: every one a live value or the name of what an instrument shows ──
  const line = (cls: string) => el(cls, text)
  const clock = line("dim")
  const legend = line("dim")
  const numbers = line("rows")
  const orderLabel = line("")
  const paceLabel = line("")
  const density = line("dim")
  /** How many readout lines fit between the scope and the radar. */
  let fits = 5
  const placeText = () => {
    const { cx, cy, R, col } = lay
    const at = (el: HTMLElement, x: number, y: number, shift: string) => {
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`
    }
    at(clock, cx + 1.36 * R, cy - 1.3 * R - 22, "translateX(-100%)")
    // Each arc's name and value at its left end, clear of the wires that come from the right.
    const arcEnd = (a: number) => [cx + Math.cos(a) * 1.125 * R - 10, cy + Math.sin(a) * 1.125 * R]
    const [ox, oy] = arcEnd(-Math.PI / 2 - ARC)
    const [px, py] = arcEnd(Math.PI / 2 + ARC)
    at(orderLabel, ox!, oy!, "translate(-100%, -50%)")
    at(paceLabel, px!, py!, "translate(-100%, -50%)")
    const shown = col[2]! > 0
    for (const el of [legend, numbers, density]) el.style.display = shown ? "" : "none"
    if (!shown) return
    const rr = radarR(col)
    const rowsTop = col[1]! + col[3]! * SCOPE + 16
    const radarTop = col[1]! + col[3]! - 2 * rr - 2
    fits = Math.max(0, Math.min(5, Math.floor((radarTop - rowsTop - 4) / 19)))
    at(legend, col[0]!, col[1]! - 20, "")
    at(numbers, col[0]!, rowsTop, "")
    numbers.style.width = `${col[2]}px`
    at(density, col[0]! + col[2]! / 2, col[1]! + col[3]! + 8, "translateX(-50%)")
  }
  legend.innerHTML = `<span class="v">order</span> · <span class="b v">pace</span> · <span class="c v">fear</span> · clusters`
  density.textContent = "density"
  let simTime = 0
  const showStats = (s: Stats) => {
    const v = store.get()
    const rows: [string, string][] = [
      ["fear", s.fear.toFixed(3)],
      ["clusters", String(s.clusters)],
      ["predators", String(v.predators)],
      ...s.tracks
        .slice(0, 2)
        .map((t): [string, string] => [
          `cluster ${String(t.id).padStart(2, "0")}`,
          Math.round(t.mass).toLocaleString("en-US"),
        ]),
    ]
    numbers.innerHTML = rows
      .slice(0, fits)
      .map(([a, b]) => `<span class="dim">${a}</span><span>${b}</span>`)
      .join("")
    orderLabel.innerHTML = `<span class="dim">order</span> <span class="v">${s.order.toFixed(2)}</span>`
    paceLabel.innerHTML = `<span class="dim">pace</span> <span class="b v">${(s.pace * 2.2).toFixed(2)}× cruise</span>`
    clock.textContent = `${AGENTS.toLocaleString("en-US")} agents · ${simTime.toFixed(1)} s`
  }

  const css = (c: readonly number[]) =>
    `rgb(${c.map((x) => Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055))).join(" ")})`
  const paintText = () => {
    host.style.setProperty("--swarm-a", css(now.pal[0]!))
    host.style.setProperty("--swarm-b", css(now.pal[1]!))
    host.style.setProperty("--swarm-c", css(now.pal[2]!))
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
  // The panel moves its rows without the slot changing size (the lure's pad opening, a font
  // arriving): its own size is watched, and the rows are measured again now and then.
  const panelEl = slot.querySelector(".knobs-panel")
  if (panelEl) ro.observe(panelEl)
  narrow.addEventListener("change", fit)

  let last = performance.now()
  let arrive = 0
  let frames = 0
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
    if (++frames % 20 === 0) measureRows()
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
      case "scheme":
        return SCHEME_NAMES.indexOf(v.scheme as SchemeName) / (SCHEME_NAMES.length - 1)
      case "lure":
        return Math.hypot(v.lure.x - 0.5, v.lure.y - 0.5) * 2
      default:
        return (v[k] as number) / 100
    }
  }
  const params = new Float32Array(56 + 32)
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
    set(7, lay.panelX, lay.rows.length, 0, 0)
    const [gain, bloom, heat] = now.pal[5]!
    const pal = (i: number, w: number) =>
      set(8 + i, now.pal[i]![0]!, now.pal[i]![1]!, now.pal[i]![2]!, w)
    pal(0, 1)
    pal(1, gain!)
    pal(2, 0)
    pal(3, bloom!)
    pal(4, heat!)
    set(13, page[0], page[1], page[2], 0)
    lay.rows.forEach((y, i) => set(14 + i, y, rowValue(KEYS[i]!), glows[i]!, LANDS[KEYS[i]!]))
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
    showStats({ order: 0.74, pace: 0.45, fear: 0, clusters: 3, tracks: [] })
  }
  if (noGpu) fallback()
  else
    createGpu(stage, page, lay, writeParams, showStats)
      .then((g) => {
        if (disposed) return g?.destroy()
        if (!g) return fallback()
        gpu = g
        Object.assign(window, { __swarm: { bench: g.bench, layout: lay, store } })
        wake()
      })
      .catch((e) => {
        console.warn("hero-swarm: no WebGPU", e)
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
  lay: { cx: number; cy: number; R: number },
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
    console.error("hero-swarm:", (e as GPUUncapturedErrorEvent).error.message),
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
          console.error(`hero-swarm ${label} ${x.lineNum}:${x.linePos} ${x.message}`)
    })
    return m
  }
  const simMod = compile(commonWgsl + simWgsl, "swarm-sim")
  const drawMod = compile(commonWgsl + drawWgsl, "swarm-draw")
  const postMod = compile(postWgsl, "swarm-post")

  // ── Buffers ──
  const S = GPUBufferUsage.STORAGE
  const buf = (size: number, usage: number) => device.createBuffer({ size, usage })
  const uniform = buf(88 * 4, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST)
  const agents = buf(AGENTS * 16, S)
  const aux = buf(AGENTS * 16, S)
  const grid = buf(NEAR * NEAR * 3 * 4, S | GPUBufferUsage.COPY_DST)
  const preds = buf(PREDS * 2 * 16, S)
  const stats = buf(16 * 4, S | GPUBufferUsage.COPY_DST)
  const cand = buf(32 * 16, S)
  const tracks = buf(TRACKS * 2 * 16, S | GPUBufferUsage.COPY_SRC)
  const hist = buf((HIST + 2 + 2 * ANCHORS) * 16, S | GPUBufferUsage.COPY_SRC)
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
  const pWire = drawPipe("vs_wire", "fs_wire", [r0], add)
  const pCap = drawPipe("vs_cap", "fs_cap", [r0], add)

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
  // Six stamps: the simulation's start and end, then the ends of the trail, the display, the
  // bloom and the composite (which can wait on the page's drawable, so it's reported apart).
  const STAMPS = 6
  const query = timing ? device.createQuerySet({ type: "timestamp", count: STAMPS }) : null
  const queryBuf = query
    ? buf(STAMPS * 8, GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC)
    : null
  const queryRead = query
    ? buf(STAMPS * 8, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)
    : null
  let queryBusy = false
  const PARTS = ["sim", "trail", "display", "bloom", "composite"] as const
  const sums = PARTS.map(() => 0)
  let samples = 0

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
  const bloomMix = new Float32Array(1)
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

  /** The ring's box on the canvas (device px, clamped): x, y, width, height. */
  const ringBox = (t: { w: number; h: number; dpr: number }) => {
    const p = lay
    const r = (p.R * 1.02 + 8) * t.dpr
    const x0 = Math.max(0, Math.floor(p.cx * t.dpr - r))
    const y0 = Math.max(0, Math.floor(p.cy * t.dpr - r))
    const x1 = Math.min(t.w, Math.ceil(p.cx * t.dpr + r))
    const y1 = Math.min(t.h, Math.ceil(p.cy * t.dpr + r))
    return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)] as const
  }
  let frameNo = 0
  let readIdx = 0
  const reading = [false, false]
  const encode = (simDt: number, dt: number, arrive: number) => {
    const t = fitTargets()
    frameNo++
    const params = writeParams(simDt, dt, arrive, t.w, t.h, t.dpr, frameNo)
    device.queue.writeBuffer(uniform, 0, params)
    // The scheme's bloom, into the composite's mix (pal3.w), so it crossfades with the rest.
    bloomMix[0] = params[47]!
    device.queue.writeBuffer(t.bufs[LEVELS * 2 - 1]!, 24, bloomMix)
    const enc = device.createCommandEncoder()
    enc.clearBuffer(grid)
    const timed = query && !queryBusy
    const cp = enc.beginComputePass(
      timed
        ? {
            timestampWrites: {
              querySet: query!,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {},
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
      ...(timed ? { timestampWrites: { querySet: query!, endOfPassWriteIndex: 2 } } : {}),
    })
    rp.setBindGroup(0, rb0)
    // Only the ring holds agents: the trail lives in its box.
    const box = ringBox(t)
    rp.setScissorRect(box[0], box[1], box[2], box[3])
    const decay = 0.5 ** (dt / TRAIL_HALF)
    rp.setBlendConstant([decay, decay, decay, decay])
    rp.setPipeline(pFade)
    rp.draw(3)
    rp.setPipeline(pAgent)
    rp.draw(6, AGENTS)
    rp.end()
    const pass = (view: GPUTextureView, load: GPULoadOp, stamp = -1) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
        ...(stamp >= 0 && timed
          ? { timestampWrites: { querySet: query!, endOfPassWriteIndex: stamp } }
          : {}),
      })
    rp = pass(t.hdr.createView(), "clear", 3)
    rp.setPipeline(pHud)
    rp.setBindGroup(0, rb0)
    rp.setBindGroup(1, t.rb1)
    rp.draw(3)
    // The wires, over the display: one per row of the panel beside it.
    const rows = params[29]!
    if (rows > 0) {
      rp.setPipeline(pWire)
      rp.draw(WIRE_SEGS * 6, rows)
      rp.setPipeline(pCap)
      rp.draw(6, rows * 2)
    }
    rp.end()
    for (let i = 0; i < LEVELS; i++) {
      rp = pass(t.levels[i]!.createView(), "clear")
      rp.setPipeline(pDown)
      rp.setBindGroup(0, t.post[i]!)
      rp.draw(3)
      rp.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      // The clock stops after the bloom: the composite waits on the page's drawable.
      rp = pass(t.levels[LEVELS - 2 - k]!.createView(), "load", k === LEVELS - 2 ? 4 : -1)
      rp.setPipeline(pUp)
      rp.setBindGroup(0, t.post[LEVELS + k]!)
      rp.draw(3)
      rp.end()
    }
    rp = pass(ctx.getCurrentTexture().createView(), "clear", 5)
    rp.setPipeline(pComposite)
    rp.setBindGroup(0, t.post[LEVELS * 2 - 1]!)
    rp.draw(3)
    rp.end()
    if (timed) {
      enc.resolveQuerySet(query!, 0, STAMPS, queryBuf!, 0)
      enc.copyBufferToBuffer(queryBuf!, 0, queryRead!, 0, STAMPS * 8)
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
          const ms = (a: number, b: number) => Number(ts[b]! - ts[a]!) / 1e6
          const parts = [ms(0, 1), ms(1, 2), ms(2, 3), ms(3, 4), ms(4, 5)]
          queryRead!.unmap()
          queryBusy = false
          if (parts.every((x) => x >= 0 && x < 50)) {
            parts.forEach((x, i) => (sums[i]! += x))
            samples++
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
          // The arcs show order and pace eased (f[6], f[7]); their labels read the same.
          onStats({ order: f[6]!, pace: f[7]!, fear: f[3]!, clusters: f[4]!, tracks: list })
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
      const out: Record<string, number> = { queueMs: +wall.toFixed(2), w: t.w, h: t.h, samples }
      PARTS.forEach((name, i) => (out[name] = +(sums[i]! / Math.max(1, samples)).toFixed(3)))
      out.beforeComposite = +[0, 1, 2, 3]
        .reduce((a, i) => a + sums[i]! / Math.max(1, samples), 0)
        .toFixed(3)
      return out
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
  svg.setAttribute("class", "swarm-still")
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
