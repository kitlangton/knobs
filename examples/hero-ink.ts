/// <reference types="@webgpu/types" />
// A hero of ink in water: a real-time fluid (stable fluids in compute shaders, hero-ink-sim.wgsl)
// carrying luminous dye in the dark (hero-ink-view.wgsl), bloomed and tone-mapped by the
// catalog's post pass (controls-post.wgsl). A few nozzles orbit slowly, so it's alive at rest;
// dragging in it stirs, and the stir's direction becomes the Current row, a drift the whole pool
// follows until it's set again. Rows and presets glide; the hand applies at once. Without WebGPU
// (or with ?nogpu) a still of soft colour stands in.
import { angle, choice, defineControls, knob, point, springMotion } from "knobs"
import { mountPanel } from "knobs/panel"
import { blueNoise } from "./controls-gpu"
import postWgsl from "./controls-post.wgsl?raw"
import simWgsl from "./hero-ink-sim.wgsl?raw"
import viewWgsl from "./hero-ink-view.wgsl?raw"

type Lch = readonly [number, number, number]
interface Look {
  /** Four inks, in OKLCh (lightness, chroma, hue°). */
  readonly inks: readonly [Lch, Lch, Lch, Lch]
  /** How quickly dye saturates into light. */
  readonly gain: number
  /** The wet sheen on thick ink. */
  readonly gloss: number
  /** How white-hot the densest cores burn. */
  readonly core: number
  /** The bloom's share. */
  readonly glow: number
  readonly bright: number
}
const LOOKS = {
  Spectral: {
    inks: [
      [0.6, 0.21, 266],
      [0.64, 0.25, 352],
      [0.8, 0.14, 205],
      [0.84, 0.16, 78],
    ],
    gain: 1.7,
    gloss: 0.3,
    core: 0.14,
    glow: 0.26,
    bright: 1.15,
  },
  Mono: {
    inks: [
      [0.92, 0.035, 80],
      [0.78, 0.05, 245],
      [0.86, 0.045, 30],
      [0.72, 0.04, 200],
    ],
    gain: 1.1,
    gloss: 0,
    core: 0.05,
    glow: 0.12,
    bright: 0.85,
  },
  Cosmic: {
    inks: [
      [0.55, 0.24, 300],
      [0.78, 0.15, 185],
      [0.68, 0.23, 355],
      [0.58, 0.2, 255],
    ],
    gain: 1.7,
    gloss: 0.12,
    core: 0.5,
    glow: 0.3,
    bright: 1,
  },
  Ember: {
    inks: [
      [0.64, 0.22, 34],
      [0.76, 0.18, 58],
      [0.9, 0.15, 92],
      [0.5, 0.2, 22],
    ],
    gain: 2,
    gloss: 0.85,
    core: 0.55,
    glow: 0.2,
    bright: 1,
  },
} satisfies Record<string, Look>
const PALETTES = ["Spectral", "Mono", "Cosmic", "Ember"] as const
type Palette = (typeof PALETTES)[number]
const lookOf = (name: string): Look => LOOKS[name as Palette] ?? LOOKS.Spectral

/** The velocity grid's and the dye's long sides, in cells. */
const GRID = 320
const DYE_MAX = 2304
const JACOBI = 32
const MAX_EMITTERS = 6
const MAX_SPLATS = 12
const PREWARM = 240
/** Rows and presets glide; emitters arrive and leave more slowly. */
const GLIDE = springMotion({ duration: 0.7, bounce: 0 })
const ARRIVE = springMotion({ duration: 1.4, bounce: 0 })

/** One number on a spring, by duration and bounce; the hand moves it at once. */
class Glide {
  v = 0
  target: number
  constructor(
    public x: number,
    private readonly feel = GLIDE,
  ) {
    this.target = x
  }
  set(to: number, how: "init" | "hand" | "other") {
    this.target = to
    if (how !== "other") {
      this.x = to
      this.v = 0
    }
  }
  step(dt: number) {
    const { omega, zeta } = this.feel
    const n = Math.ceil(dt / (1 / 240))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.v += (-omega * omega * (this.x - this.target) - 2 * zeta * omega * this.v) * h
      this.x += this.v * h
    }
  }
}

const schema = {
  viscosity: knob(8, { min: 0, max: 80, step: 1, unit: "%", label: "Viscosity" }),
  swirl: knob(45, { min: 0, max: 100, step: 1, unit: "%", label: "Swirl" }),
  flow: knob(55, { min: 15, max: 100, step: 1, unit: "%", label: "Flow" }),
  fade: knob(35, { min: 5, max: 75, step: 1, unit: "%", label: "Fade" }),
  palette: choice("Spectral", PALETTES, { label: "Palette" }),
  hue: angle(0, { label: "Hue" }),
  emitters: knob(4, { min: 1, max: MAX_EMITTERS, step: 1, label: "Emitters" }),
  current: point({ x: 0, y: 0 }, { min: -1, max: 1, step: 0.01, label: "Current", random: false }),
}

export function mountHeroInk(host: HTMLElement): { dispose(): void } {
  const made: HTMLElement[] = []
  const part = (cls: string) => {
    let el = host.querySelector<HTMLElement>(`.${cls}`)
    if (!el) {
      el = document.createElement("div")
      el.className = cls
      host.append(el)
      made.push(el)
    }
    return el
  }
  const stageEl = part("hero-stage")
  const slot = part("hero-panel")
  const narrow = matchMedia("(max-width: 900px)")
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")

  // ── The panel ──
  const store = defineControls("hero-ink", schema, {
    enabled: true,
    storage: null,
    defaultLabel: "Ink",
    presets: {
      Smoke: {
        viscosity: 2,
        swirl: 70,
        flow: 45,
        fade: 42,
        palette: "Mono",
        hue: 0,
        emitters: 3,
        current: { x: 0, y: -0.5 },
      },
      Nebula: {
        viscosity: 0,
        swirl: 85,
        flow: 40,
        fade: 18,
        palette: "Cosmic",
        hue: 0,
        emitters: 5,
        current: { x: 0.18, y: 0 },
      },
      Lava: {
        viscosity: 62,
        swirl: 12,
        flow: 75,
        fade: 30,
        palette: "Ember",
        hue: 0,
        emitters: 3,
        current: { x: 0, y: -0.22 },
      },
    },
    onChange(_patch, values, meta) {
      apply(values, meta.source === "local" ? "hand" : "other")
    },
  })
  const panel = mountPanel(store, slot, {
    title: "Ink",
    theme: "dark",
    session: false,
    variants: false,
    haptics: false,
    sound: true,
  })
  // The Current pad starts open: it's what the hand sets.
  slot
    .querySelector<HTMLElement>('[data-field="current"] .knobs-x-head[aria-expanded="false"]')
    ?.click()

  // ── What the scene runs on, each on its spring ──
  const v0 = store.get()
  const viscosity = new Glide(v0.viscosity)
  const swirl = new Glide(v0.swirl)
  const flow = new Glide(v0.flow)
  const fade = new Glide(v0.fade)
  const hue = new Glide(v0.hue)
  const curX = new Glide(v0.current.x)
  const curY = new Glide(v0.current.y)
  const look = lookVector(lookOf(v0.palette)).map((x) => new Glide(x))
  const phase = Array.from(
    { length: MAX_EMITTERS },
    (_, i) => new Glide((2 * Math.PI * i) / v0.emitters, ARRIVE),
  )
  const weight = Array.from(
    { length: MAX_EMITTERS },
    (_, i) => new Glide(i < v0.emitters ? 1 : 0, ARRIVE),
  )
  const glides = [viscosity, swirl, flow, fade, hue, curX, curY, ...look, ...phase, ...weight]
  function apply(v: ReturnType<typeof store.get>, h: "init" | "hand" | "other") {
    viscosity.set(v.viscosity, h)
    swirl.set(v.swirl, h)
    flow.set(v.flow, h)
    fade.set(v.fade, h)
    // The hue turns the short way round.
    hue.set(hue.target + (((((v.hue - hue.target) % 360) + 540) % 360) - 180), h)
    curX.set(v.current.x, h)
    curY.set(v.current.y, h)
    lookVector(lookOf(v.palette)).forEach((x, i) => look[i]!.set(x, h))
    // Emitters spread evenly; a new one fades in where it'll sit, a leaving one fades out.
    const n = v.emitters
    for (let i = 0; i < MAX_EMITTERS; i++) {
      weight[i]!.set(i < n ? 1 : 0, h === "init" ? "init" : "other")
      if (i < n) phase[i]!.set((2 * Math.PI * i) / n, weight[i]!.x < 0.02 ? "init" : "other")
    }
    still?.draw()
  }

  // ── Layout: the composition centred in the room the panel leaves ──
  const layout = { w: 1, h: 1, cx: 0.5, cy: 0.5, rx: 0.4, ry: 0.4, orbit: 0.22 }
  const fit = () => {
    const w = stageEl.clientWidth || 1
    const h = stageEl.clientHeight || 1
    const pe = slot.querySelector<HTMLElement>(".knobs-panel")
    const beside = !narrow.matches && !!pe
    let left = 0
    let right = w
    if (beside) {
      const s = stageEl.getBoundingClientRect()
      const p = slot.getBoundingClientRect()
      const margin = s.right - p.right
      left = margin
      right = p.left - s.left - 24
    }
    layout.w = w
    layout.h = h
    layout.cx = (left + right) / 2
    layout.cy = h * (beside ? 0.55 : 0.53)
    layout.rx = Math.max(160, (right - left) / 2) * 1.05
    layout.ry = h * 0.48
    layout.orbit = Math.min(0.2, ((right - left) / 2 / h) * 0.48)
  }

  // ── Without WebGPU: a still of soft colour ──
  let still: ReturnType<typeof cssStill> | null = null
  const showStill = () => {
    if (still) return
    fit()
    still = cssStill(stageEl, () => ({ values: store.get(), layout }))
    still.draw()
  }

  // ── The simulation ──
  let gpu: InkGpu | null = null
  let disposed = false
  let raf = 0
  let last = 0
  let clock = 0
  let onScreen = true
  const splats: Splat[] = []
  const reduced = () => reducedQuery.matches

  const emitterSplats = (t: number) => {
    const out: Splat[] = []
    const aspect = layout.w / layout.h
    const f = flow.x / 100
    const inks = inkColors(
      look.map((g) => g.x),
      hue.x,
    )
    for (let i = 0; i < MAX_EMITTERS; i++) {
      const w = Math.max(0, Math.min(1, weight[i]!.x))
      if (w < 0.004) continue
      const th = t * 0.085 + phase[i]!.x
      const r = layout.orbit * (1 + 0.14 * Math.sin(t * 0.17 + i * 1.3))
      const x = layout.cx / layout.w + (r * 1.3 * Math.cos(th)) / aspect
      const y = layout.cy / layout.h + r * Math.sin(th)
      // Along the orbit, turned in towards the middle, with a slow sway.
      const turn = 0.55 + 0.45 * Math.sin(t * 0.23 + i * 1.9)
      const dir = th + Math.PI / 2 + turn
      const speed = (28 + 150 * f) * w
      // Each ink drifts slowly towards its neighbour's.
      const a = inks[i % 4]!
      const b = inks[(i + 1) % 4]!
      const m = 0.5 - 0.5 * Math.cos(t * 0.05 + i * 2.1)
      const rate = 16 * (0.45 + 0.55 * f) * w
      out.push({
        at: [x, y, 0.011 ** 2, 1],
        force: [Math.cos(dir) * speed, Math.sin(dir) * speed, 22],
        color: [0, 1, 2].map((k) => (a[k]! * (1 - m) + b[k]! * m) * rate) as Vec3,
      })
    }
    return out
  }

  const frame = (now: number) => {
    raf = 0
    if (disposed || !gpu || !onScreen || document.hidden) {
      last = 0
      return
    }
    const real = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60
    last = now
    const dt = real * (reduced() ? 0.3 : 1)
    for (const g of glides) g.step(real)
    clock += dt
    gpu.step(dt, params(dt, [...emitterSplats(clock), ...splats.splice(0)]))
    gpu.render(viewParams())
    raf = requestAnimationFrame(frame)
  }
  const wake = () => {
    if (!raf && !disposed && gpu && onScreen && !document.hidden) raf = requestAnimationFrame(frame)
  }

  const params = (dt: number, list: Splat[]): SimParams => {
    const vis = viscosity.x / 100
    const velDiss = 0.22 + 2.4 * vis * vis
    return {
      dt,
      vorticity: (swirl.x / 100) * 48,
      diffusion: Math.min(0.24, 0.24 * vis ** 1.3 * dt * 60),
      velDiss,
      dyeDiss: 0.1 + 1.6 * (fade.x / 100) ** 1.4,
      // The current: a drift of up to 45 cells a second, reached at the flow's own pace.
      current: [curX.x * 45 * velDiss, curY.x * 45 * velDiss, 0.015],
      splats: list.slice(0, MAX_SPLATS),
    }
  }
  const viewParams = (): ViewParams => {
    const [gain, gloss, core, glow, bright] = look.slice(12).map((g) => g.x) as number[]
    return {
      gain: gain!,
      gloss: Math.max(0, gloss!),
      core: Math.max(0, core!),
      glow: Math.max(0, glow!),
      bright: bright!,
      pool: [layout.cx, layout.cy, layout.rx, layout.ry],
    }
  }

  // ── The hand: dragging stirs, and the stir's direction is the current ──
  let grab: { id: number; x: number; y: number; t: number; vx: number; vy: number } | null = null
  let firstSet = true
  const local = (e: PointerEvent): [number, number] => {
    const r = stageEl.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !gpu) return
    e.preventDefault()
    stageEl.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    grab = { id: e.pointerId, x, y, t: e.timeStamp, vx: 0, vy: 0 }
    firstSet = true
    stageEl.style.cursor = "grabbing"
  }
  const onMove = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id || !gpu) return
    const [x, y] = local(e)
    const dx = x - grab.x
    const dy = y - grab.y
    const dtm = Math.max(4, e.timeStamp - grab.t) / 1000
    if (Math.hypot(dx, dy) < 0.5) return
    const vx = dx / dtm
    const vy = dy / dtm
    // Smoothed over ~90 ms: the stroke's direction, not each event's.
    const k = 1 - Math.exp(-dtm / 0.09)
    grab.vx += (vx - grab.vx) * k
    grab.vy += (vy - grab.vy) * k
    // Splats along the segment, so a fast stroke leaves one wake.
    const cells = GRID / Math.max(layout.w, layout.h)
    const n = Math.min(3, Math.max(1, Math.ceil(Math.hypot(dx, dy) / 24)))
    const inks = inkColors(
      look.map((g) => g.x),
      hue.x,
    )
    const ink = inks[Math.floor(clock * 0.4) % 4]!
    for (let i = 1; i <= n; i++) {
      if (splats.length >= MAX_SPLATS - MAX_EMITTERS) splats.shift()
      const px = grab.x + (dx * i) / n
      const py = grab.y + (dy * i) / n
      splats.push({
        at: [px / layout.w, py / layout.h, 0.032 ** 2, 1],
        force: [vx * cells * 1.1, vy * cells * 1.1, 30],
        color: ink.map((c) => c * 6) as Vec3,
      })
    }
    grab.x = x
    grab.y = y
    grab.t = e.timeStamp
    // The current follows the stroke: its direction, its speed up to about 1600 px/s.
    const s = Math.hypot(grab.vx, grab.vy)
    const mag = Math.min(1, s / 1600)
    const cx = s > 1 ? (grab.vx / s) * mag : 0
    const cy = s > 1 ? (grab.vy / s) * mag : 0
    const next = { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100 }
    const now = store.get().current
    if (next.x !== now.x || next.y !== now.y) {
      store.set({ current: next }, { coalesce: !firstSet })
      firstSet = false
    }
  }
  const onUp = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id) return
    grab = null
    if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId)
    stageEl.style.cursor = gpu ? "grab" : ""
  }
  stageEl.addEventListener("pointerdown", onDown)
  stageEl.addEventListener("pointermove", onMove)
  stageEl.addEventListener("pointerup", onUp)
  stageEl.addEventListener("pointercancel", onUp)

  // ── Off screen or hidden: it stops, and carries on where it was ──
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting)
    wake()
  })
  io.observe(stageEl)
  const onVisibility = () => wake()
  document.addEventListener("visibilitychange", onVisibility)
  const ro = new ResizeObserver(() => {
    fit()
    gpu?.resize()
    still?.draw()
  })
  ro.observe(stageEl)
  ro.observe(slot)
  const onNarrow = () => {
    fit()
    still?.draw()
  }
  narrow.addEventListener("change", onNarrow)

  // ── Start: the pool already alive on its first frame ──
  fit()
  apply(store.get(), "init")
  void InkGpu.create(stageEl, page()).then((g) => {
    if (disposed) {
      g?.destroy()
      return
    }
    if (!g) {
      showStill()
      return
    }
    gpu = g
    g.onLost = () => {
      gpu = null
      showStill()
    }
    stageEl.style.cursor = "grab"
    for (let i = 0; i < PREWARM; i++) {
      clock += 1 / 60
      g.step(1 / 60, params(1 / 60, emitterSplats(clock)))
    }
    g.render(viewParams())
    g.canvas.style.opacity = "1"
    wake()
  })

  // Measurements: GPU ms a frame (sim, then picture), at the canvas's own size.
  Object.assign(window, {
    __heroInk: {
      bench: async (n = 60) =>
        gpu ? gpu.bench(n, params(1 / 60, emitterSplats(clock)), viewParams()) : null,
    },
  })

  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      narrow.removeEventListener("change", onNarrow)
      document.removeEventListener("visibilitychange", onVisibility)
      stageEl.removeEventListener("pointerdown", onDown)
      stageEl.removeEventListener("pointermove", onMove)
      stageEl.removeEventListener("pointerup", onUp)
      stageEl.removeEventListener("pointercancel", onUp)
      stageEl.style.cursor = ""
      gpu?.destroy()
      gpu = null
      still?.remove()
      panel.dispose()
      for (const el of made) el.remove()
    },
  }
}

/** The page's own dark, exactly, as linear light. */
function page(): Vec3 {
  const night = getComputedStyle(document.documentElement).getPropertyValue("--night").trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(night)?.[1] ?? "101012"
  return [0, 2, 4].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as Vec3
}

// ── Colour ───────────────────────────────────────────────────────────────────────────────────

type Vec3 = [number, number, number]
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

/** A look as numbers that can glide: each ink in OKLab, then gain, gloss, core, glow, bright. */
function lookVector(l: Look) {
  const out: number[] = []
  for (const [L, C, h] of l.inks) {
    const r = (h * Math.PI) / 180
    out.push(L, C * Math.cos(r), C * Math.sin(r))
  }
  out.push(l.gain, l.gloss, l.core, l.glow, l.bright)
  return out
}

/** OKLab, turned by `hue` degrees, as linear sRGB (in gamut, never negative). */
function oklabLinear(L: number, a0: number, b0: number, hue: number): Vec3 {
  const r = (hue * Math.PI) / 180
  const a = a0 * Math.cos(r) - b0 * Math.sin(r)
  const b = a0 * Math.sin(r) + b0 * Math.cos(r)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb: Vec3 = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return rgb.map((c) => Math.max(0, c)) as Vec3
}

function inkColors(v: readonly number[], hue: number): Vec3[] {
  return [0, 1, 2, 3].map((i) => oklabLinear(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!, hue))
}

const cssColor = ([r, g, b]: Vec3, alpha = 1) => {
  const s = (c: number) =>
    Math.round(255 * Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  return `rgba(${s(r)}, ${s(g)}, ${s(b)}, ${alpha})`
}

// ── The still (no WebGPU) ────────────────────────────────────────────────────────────────────

function cssStill(
  host: HTMLElement,
  state: () => {
    values: { palette: string; hue: number; emitters: number }
    layout: { w: number; h: number; cx: number; cy: number; orbit: number }
  },
) {
  const el = document.createElement("div")
  el.setAttribute("aria-hidden", "true")
  el.style.cssText =
    "position:absolute;inset:0;overflow:hidden;filter:blur(28px) saturate(1.2);pointer-events:none"
  host.prepend(el)
  return {
    draw() {
      const { values, layout } = state()
      const look = lookOf(values.palette)
      const inks = inkColors(lookVector(look), values.hue)
      const n = values.emitters
      const layers: string[] = []
      for (let i = 0; i < n; i++) {
        const th = (2 * Math.PI * i) / n + 0.6
        const r = layout.orbit * layout.h
        const x = layout.cx + r * 1.3 * Math.cos(th)
        const y = layout.cy + r * Math.sin(th)
        const c = inks[i % 4]!
        layers.push(
          `radial-gradient(${Math.round(r * 1.1)}px ${Math.round(r * 0.7)}px at ${x.toFixed(0)}px ${y.toFixed(0)}px, ${cssColor(c, 0.55)}, ${cssColor(c, 0)})`,
        )
      }
      const r = layout.orbit * layout.h
      layers.push(
        `radial-gradient(${Math.round(r * 1.9)}px ${Math.round(r * 1.3)}px at ${layout.cx.toFixed(0)}px ${layout.cy.toFixed(0)}px, ${cssColor(inks[0]!, 0.18)}, transparent)`,
      )
      el.style.background = layers.join(",")
    },
    remove() {
      el.remove()
    },
  }
}

// ── WebGPU ───────────────────────────────────────────────────────────────────────────────────

interface Splat {
  at: [number, number, number, number]
  force: [number, number, number]
  color: Vec3
}
interface SimParams {
  dt: number
  vorticity: number
  diffusion: number
  velDiss: number
  dyeDiss: number
  current: [number, number, number]
  splats: Splat[]
}
interface ViewParams {
  gain: number
  gloss: number
  core: number
  glow: number
  bright: number
  pool: [number, number, number, number]
}

const HDR: GPUTextureFormat = "rgba16float"
const FIELD: GPUTextureFormat = "rgba16float"
const LEVELS = 5
const SIM_FLOATS = 4 * (5 + 3 * MAX_SPLATS)
const ENTRIES = [
  "curl",
  "vorticity",
  "divergence",
  "decay",
  "jacobi",
  "gradient",
  "advectVelocity",
  "advectDye",
  "resample",
] as const
type Entry = (typeof ENTRIES)[number]

interface Field {
  tex: GPUTexture
  view: GPUTextureView
  id: number
}
let fieldIds = 0

class InkGpu {
  readonly canvas = document.createElement("canvas")
  onLost: (() => void) | null = null
  private ctx: GPUCanvasContext
  private format: GPUTextureFormat
  private sampler: GPUSampler
  private noise: GPUTexture
  private computeLayout: GPUBindGroupLayout
  private pipes: Record<Entry, GPUComputePipeline>
  private viewPipe: GPURenderPipeline
  private postLayout: GPUBindGroupLayout
  private down: GPURenderPipeline
  private up: GPURenderPipeline
  private composite: GPURenderPipeline
  private simBuf: GPUBuffer
  private viewBuf: GPUBuffer
  private simData = new Float32Array(SIM_FLOATS)
  private viewData = new Float32Array(16)
  private postData = new Float32Array(16)
  private dummy: Field
  private binds = new Map<string, GPUBindGroup>()
  private grid = { w: 0, h: 0 }
  private dyeSize = { w: 0, h: 0 }
  private vel: Field[] = []
  private pres: Field[] = []
  private dye: Field[] = []
  private curl!: Field
  private div!: Field
  private screen: {
    w: number
    h: number
    hdr: GPUTexture
    levels: GPUTexture[]
    bufs: GPUBuffer[]
    binds: GPUBindGroup[]
  } | null = null
  private destroyed = false
  private timestamps: GPUQuerySet | null = null

  static async create(host: HTMLElement, base: Vec3): Promise<InkGpu | null> {
    if (new URLSearchParams(location.search).has("nogpu") || !navigator.gpu) return null
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
      if (!adapter) return null
      const ts = adapter.features.has("timestamp-query")
      const device = await adapter.requestDevice({
        requiredFeatures: ts ? ["timestamp-query"] : [],
      })
      return new InkGpu(device, host, base, ts)
    } catch (e) {
      console.warn("hero-ink: no WebGPU", e)
      return null
    }
  }

  private constructor(
    private readonly device: GPUDevice,
    private readonly host: HTMLElement,
    private readonly base: Vec3,
    timestamps: boolean,
  ) {
    device.lost.then((info) => {
      if (this.destroyed) return
      console.error("hero-ink: device lost", info.message)
      this.canvas.remove()
      this.onLost?.()
    })
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .5s cubic-bezier(.2,.8,.2,1)"
    this.canvas.setAttribute("aria-hidden", "true")
    host.prepend(this.canvas)
    this.ctx = this.canvas.getContext("webgpu")!
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.ctx.configure({ device, format: this.format, alphaMode: "opaque" })
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })
    if (timestamps) this.timestamps = device.createQuerySet({ type: "timestamp", count: 3 })

    const sim = device.createShaderModule({ code: simWgsl, label: "ink-sim" })
    const C = GPUShaderStage.COMPUTE
    this.computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: C, buffer: {} },
        { binding: 1, visibility: C, sampler: {} },
        { binding: 2, visibility: C, texture: {} },
        { binding: 3, visibility: C, texture: {} },
        { binding: 4, visibility: C, storageTexture: { access: "write-only", format: FIELD } },
      ],
    })
    const cl = device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] })
    this.pipes = Object.fromEntries(
      ENTRIES.map((entryPoint) => [
        entryPoint,
        device.createComputePipeline({ layout: cl, compute: { module: sim, entryPoint } }),
      ]),
    ) as Record<Entry, GPUComputePipeline>
    this.simBuf = device.createBuffer({
      size: SIM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.dummy = this.field(1, 1)

    const view = device.createShaderModule({ code: viewWgsl, label: "ink-view" })
    this.viewPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: view, entryPoint: "vs" },
      fragment: { module: view, entryPoint: "fs", targets: [{ format: HDR }] },
      primitive: { topology: "triangle-list" },
    })
    this.viewBuf = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // The bloom and tone pass, as the catalog's views run it.
    const post = device.createShaderModule({ code: postWgsl, label: "ink-post" })
    const F = GPUShaderStage.FRAGMENT
    this.postLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, texture: {} },
        { binding: 1, visibility: F, sampler: {} },
        { binding: 2, visibility: F, buffer: {} },
        { binding: 3, visibility: F, texture: {} },
        { binding: 4, visibility: F, texture: { sampleType: "unfilterable-float" } },
      ],
    })
    const pl = device.createPipelineLayout({ bindGroupLayouts: [this.postLayout] })
    const pipe = (entry: string, target: GPUTextureFormat, add = false) =>
      device.createRenderPipeline({
        layout: pl,
        vertex: { module: post, entryPoint: "vs_full" },
        fragment: {
          module: post,
          entryPoint: entry,
          targets: [
            add
              ? {
                  format: target,
                  blend: {
                    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
                    alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
                  },
                }
              : { format: target },
          ],
        },
        primitive: { topology: "triangle-list" },
      })
    this.down = pipe("fs_down", HDR)
    this.up = pipe("fs_up", HDR, true)
    this.composite = pipe("fs_composite", this.format)
    this.noise = device.createTexture({
      size: [64, 64],
      format: "r32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    device.queue.writeTexture(
      { texture: this.noise },
      blueNoise(64),
      { bytesPerRow: 256 },
      [64, 64],
    )
    this.resize()
  }

  private field(w: number, h: number): Field {
    const tex = this.device.createTexture({
      size: [w, h],
      format: FIELD,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
    return { tex, view: tex.createView(), id: fieldIds++ }
  }

  /** Fits the canvas and the grids to the stage; the fluid is resampled, never lost. */
  resize() {
    if (this.destroyed) return
    const cssW = Math.max(2, this.host.clientWidth)
    const cssH = Math.max(2, this.host.clientHeight)
    const aspect = cssW / cssH
    const size = (long: number) => {
      const w = aspect >= 1 ? long : Math.round(long * aspect)
      const h = aspect >= 1 ? Math.round(long / aspect) : long
      // Rounded, so small resizes keep the same grid.
      return { w: Math.max(8, Math.round(w / 8) * 8), h: Math.max(8, Math.round(h / 8) * 8) }
    }
    const grid = size(GRID)
    const dye = size(Math.min(DYE_MAX, Math.round(Math.max(cssW, cssH) * 1.5)))
    const enc = this.device.createCommandEncoder()
    let pass: GPUComputePassEncoder | null = null
    const carry = (old: Field | undefined, next: Field) => {
      if (!old) return
      pass ??= enc.beginComputePass()
      this.run(pass, "resample", old, this.dummy, next)
    }
    const old: Field[] = []
    if (grid.w !== this.grid.w || grid.h !== this.grid.h) {
      const vel = [this.field(grid.w, grid.h), this.field(grid.w, grid.h)]
      carry(this.vel[0], vel[0]!)
      old.push(...this.vel, ...this.pres)
      if (this.curl) old.push(this.curl, this.div)
      this.vel = vel
      this.pres = [this.field(grid.w, grid.h), this.field(grid.w, grid.h)]
      this.curl = this.field(grid.w, grid.h)
      this.div = this.field(grid.w, grid.h)
      this.grid = grid
    }
    if (dye.w !== this.dyeSize.w || dye.h !== this.dyeSize.h) {
      const next = [this.field(dye.w, dye.h), this.field(dye.w, dye.h)]
      carry(this.dye[0], next[0]!)
      old.push(...this.dye)
      this.dye = next
      this.dyeSize = dye
      this.screen = null
    }
    ;(pass as GPUComputePassEncoder | null)?.end()
    this.device.queue.submit([enc.finish()])
    this.binds.clear()
    // The old fields go once the copies are done.
    for (const f of old) f.tex.destroy()
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (!this.screen || this.screen.w !== w || this.screen.h !== h) this.makeScreen(w, h)
  }

  private makeScreen(w: number, h: number) {
    const s = this.screen
    if (s) {
      for (const t of [s.hdr, ...s.levels]) t.destroy()
      for (const b of s.bufs) b.destroy()
    }
    this.canvas.width = w
    this.canvas.height = h
    const { device } = this
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const hdr = tex(w, h)
    const levels = Array.from({ length: LEVELS }, (_, i) => tex(w >> (i + 1), h >> (i + 1)))
    const bufs = Array.from({ length: LEVELS * 2 }, () =>
      device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    )
    const bind = (src: GPUTexture, buf: GPUBuffer, bloom: GPUTexture) =>
      device.createBindGroup({
        layout: this.postLayout,
        entries: [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: { buffer: buf } },
          { binding: 3, resource: bloom.createView() },
          { binding: 4, resource: this.noise.createView() },
        ],
      })
    // Down: hdr → L0 → … → L4. Up: L4 → L3 … → L0, added on. Composite: hdr with L0.
    const binds: GPUBindGroup[] = []
    for (let i = 0; i < LEVELS; i++) {
      const src = i ? levels[i - 1]! : hdr
      this.writePost(bufs[i]!, src, i ? 0 : 1, 0)
      binds.push(bind(src, bufs[i]!, hdr))
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      const i = LEVELS - 1 - k
      this.writePost(bufs[LEVELS + k]!, levels[i]!, 0, 0)
      binds.push(bind(levels[i]!, bufs[LEVELS + k]!, hdr))
    }
    binds.push(bind(hdr, bufs[LEVELS * 2 - 1]!, levels[0]!))
    this.screen = { w, h, hdr, levels, bufs, binds }
  }

  private writePost(buf: GPUBuffer, src: GPUTexture, first: number, bloom: number) {
    const u = this.postData
    u.fill(0)
    u[0] = 1 / src.width
    u[1] = 1 / src.height
    u[4] = first
    u[5] = 1
    u[6] = bloom
    u[7] = 1
    u[8] = 1 // neutral: colours under 0.8 exactly as drawn
    u[10] = 1
    u[11] = 1
    u[12] = this.base[0]
    u[13] = this.base[1]
    u[14] = this.base[2]
    u[15] = 0.07
    this.device.queue.writeBuffer(buf, 0, u)
  }

  private run(pass: GPUComputePassEncoder, entry: Entry, a: Field, b: Field, out: Field) {
    const key = `${entry}:${a.id}:${b.id}:${out.id}`
    let g = this.binds.get(key)
    if (!g) {
      g = this.device.createBindGroup({
        layout: this.computeLayout,
        entries: [
          { binding: 0, resource: { buffer: this.simBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: a.view },
          { binding: 3, resource: b.view },
          { binding: 4, resource: out.view },
        ],
      })
      this.binds.set(key, g)
    }
    pass.setPipeline(this.pipes[entry])
    pass.setBindGroup(0, g)
    pass.dispatchWorkgroups(Math.ceil(out.tex.width / 8), Math.ceil(out.tex.height / 8))
  }

  private writeSim(p: SimParams) {
    const d = this.simData
    d.fill(0)
    const { w, h } = this.grid
    const dye = this.dyeSize
    d.set([w, h, 1 / w, 1 / h], 0)
    d.set([dye.w, dye.h, 1 / dye.w, 1 / dye.h], 4)
    d.set([p.dt, p.vorticity, p.diffusion, p.velDiss], 8)
    d.set([p.dyeDiss, this.host.clientWidth / Math.max(1, this.host.clientHeight), 0, 0.8], 12)
    d.set([p.current[0], p.current[1], p.current[2], 0], 16)
    const n = Math.min(MAX_SPLATS, p.splats.length)
    d[14] = n
    for (let i = 0; i < n; i++) {
      const s = p.splats[i]!
      const o = 20 + i * 12
      d.set(s.at, o)
      d.set([s.force[0], s.force[1], s.force[2], 0], o + 4)
      d.set([s.color[0], s.color[1], s.color[2], 0], o + 8)
    }
    this.device.queue.writeBuffer(this.simBuf, 0, d)
  }

  /** One step of the fluid. */
  step(dt: number, p: SimParams, enc?: GPUCommandEncoder, stamp = false) {
    if (this.destroyed) return
    this.writeSim({ ...p, dt })
    const own = !enc
    const e = enc ?? this.device.createCommandEncoder()
    const pass = e.beginComputePass(
      stamp && this.timestamps
        ? {
            timestampWrites: {
              querySet: this.timestamps,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {},
    )
    const swap = (f: Field[]) => f.reverse()
    this.run(pass, "curl", this.vel[0]!, this.dummy, this.curl)
    this.run(pass, "vorticity", this.vel[0]!, this.curl, this.vel[1]!)
    swap(this.vel)
    this.run(pass, "divergence", this.vel[0]!, this.dummy, this.div)
    this.run(pass, "decay", this.pres[0]!, this.dummy, this.pres[1]!)
    swap(this.pres)
    for (let i = 0; i < JACOBI; i++) {
      this.run(pass, "jacobi", this.pres[0]!, this.div, this.pres[1]!)
      swap(this.pres)
    }
    this.run(pass, "gradient", this.pres[0]!, this.vel[0]!, this.vel[1]!)
    swap(this.vel)
    this.run(pass, "advectVelocity", this.vel[0]!, this.dummy, this.vel[1]!)
    swap(this.vel)
    this.run(pass, "advectDye", this.dye[0]!, this.vel[0]!, this.dye[1]!)
    swap(this.dye)
    pass.end()
    if (own) this.device.queue.submit([e.finish()])
  }

  /** The dye as light, bloomed and tone-mapped into the canvas. */
  render(v: ViewParams, enc?: GPUCommandEncoder, stamp = false) {
    if (this.destroyed) return
    const s = this.screen
    if (!s) return
    const { device } = this
    const vd = this.viewData
    vd.set([s.w, s.h, 1 / this.dyeSize.w, 1 / this.dyeSize.h], 0)
    vd.set([this.base[0], this.base[1], this.base[2], 90 * (s.w / this.host.clientWidth)], 4)
    vd.set([v.gain, v.gloss, v.core, v.bright], 8)
    const k = s.w / Math.max(1, this.host.clientWidth)
    vd.set(
      v.pool.map((x) => x * k),
      12,
    )
    device.queue.writeBuffer(this.viewBuf, 0, vd)
    this.writePost(s.bufs[LEVELS * 2 - 1]!, s.hdr, 0, v.glow)
    // Whichever half of the dye was written last.
    const dye = this.dye[0]!
    let viewBind = this.binds.get(`view:${dye.id}`)
    if (!viewBind) {
      viewBind = device.createBindGroup({
        layout: this.viewPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.viewBuf } },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: dye.view },
        ],
      })
      this.binds.set(`view:${dye.id}`, viewBind)
    }
    const own = !enc
    const e = enc ?? device.createCommandEncoder()
    const pass = (view: GPUTextureView, load: GPULoadOp, end = false) =>
      e.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
        ...(end && stamp && this.timestamps
          ? { timestampWrites: { querySet: this.timestamps, endOfPassWriteIndex: 2 } }
          : {}),
      })
    let p = pass(s.hdr.createView(), "clear")
    p.setPipeline(this.viewPipe)
    p.setBindGroup(0, viewBind)
    p.draw(3)
    p.end()
    for (let i = 0; i < LEVELS; i++) {
      p = pass(s.levels[i]!.createView(), "clear")
      p.setPipeline(this.down)
      p.setBindGroup(0, s.binds[i]!)
      p.draw(3)
      p.end()
    }
    for (let k2 = 0; k2 < LEVELS - 1; k2++) {
      const i = LEVELS - 1 - k2
      p = pass(s.levels[i - 1]!.createView(), "load")
      p.setPipeline(this.up)
      p.setBindGroup(0, s.binds[LEVELS + k2]!)
      p.draw(3)
      p.end()
    }
    p = pass(this.ctx.getCurrentTexture().createView(), "clear", true)
    p.setPipeline(this.composite)
    p.setBindGroup(0, s.binds[LEVELS * 2 - 1]!)
    p.draw(3)
    p.end()
    if (own) device.queue.submit([e.finish()])
  }

  /** `n` frames back to back: wall time a frame through the queue, and GPU time by timestamps. */
  async bench(n: number, p: SimParams, v: ViewParams) {
    const { device } = this
    await device.queue.onSubmittedWorkDone()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) {
      this.step(1 / 60, p)
      this.render(v)
    }
    await device.queue.onSubmittedWorkDone()
    const queueMs = (performance.now() - t0) / n
    let sim = 0
    let total = 0
    if (this.timestamps) {
      const resolve = device.createBuffer({
        size: 24,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      })
      const read = device.createBuffer({
        size: 24,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      })
      for (let i = 0; i < n; i++) {
        const e = device.createCommandEncoder()
        this.step(1 / 60, p, e, true)
        this.render(v, e, true)
        e.resolveQuerySet(this.timestamps, 0, 3, resolve, 0)
        e.copyBufferToBuffer(resolve, 0, read, 0, 24)
        device.queue.submit([e.finish()])
        await read.mapAsync(GPUMapMode.READ)
        const t = new BigUint64Array(read.getMappedRange().slice(0))
        read.unmap()
        sim += Number(t[1]! - t[0]!) / 1e6
        total += Number(t[2]! - t[0]!) / 1e6
      }
      resolve.destroy()
      read.destroy()
    }
    const r = (x: number) => +x.toFixed(3)
    return {
      queueMs: r(queueMs),
      gpuMs: this.timestamps ? r(total / n) : null,
      simMs: this.timestamps ? r(sim / n) : null,
      canvas: [this.screen?.w, this.screen?.h],
      grid: [this.grid.w, this.grid.h],
      dye: [this.dyeSize.w, this.dyeSize.h],
    }
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.canvas.remove()
    this.device.destroy()
  }
}
