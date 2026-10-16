/// <reference types="@webgpu/types" />
// The attractor hero: a strange attractor as a small luminous sculpture. A quarter of a million
// particles ride Lorenz, Aizawa, Thomas or Halvorsen flow, integrated in a compute pass and drawn
// as comets with depth of field, depth fog and bloom (hero-attractor.wgsl, controls-post.wgsl).
// The knobs panel beside it is real: Shape and Twist are two of the system's coefficients, mapped
// onto ranges where it stays chaotic and bounded (and a little noise dissolves the rare periodic
// window), so Random always lands on a form. Changing system remaps every particle into the new
// one's space where it stands and lets the new flow carry it home, its drawn position easing
// after it, so the form morphs rather than cuts. Dragging the scene turns it, and the Angle row
// follows. Without WebGPU (or with ?nogpu) a still of the same form is drawn on a 2D canvas.
import { angle, choice, color, defineControls, knob, parseColor, springMotion } from "knobs"
import { mountPanel } from "knobs/panel"
import { blueNoise } from "./controls-gpu"
import postWgsl from "./controls-post.wgsl?raw"
import sceneWgsl from "./hero-attractor.wgsl?raw"

type V3 = [number, number, number]
const SYSTEMS = ["Lorenz", "Aizawa", "Thomas", "Halvorsen"] as const
type Sys = (typeof SYSTEMS)[number]

interface Spec {
  /** What Shape (0–100 %) and Twist sweep: ranges where the flow stays chaotic and bounded. */
  readonly a: readonly [number, number]
  readonly b: readonly [number, number]
  /** Noise (native units per √time): enough to blur a periodic window back into a form. */
  readonly noise: number
  /** The longest RK4 step (its own time). */
  readonly h: number
  readonly p0: V3
  /** Which way is up: its z axis, or the (1, 1, 1) diagonal it's symmetric about. */
  readonly up: "z" | "diag"
  /** How far above it the camera looks down (degrees). */
  readonly tilt: number
}
const SPEC: Record<Sys, Spec> = {
  Lorenz: { a: [26, 54], b: [1.5, 3], noise: 0.15, h: 0.006, p0: [1, 1, 20], up: "z", tilt: 12 },
  Aizawa: {
    a: [0.76, 1],
    b: [2.7, 4.2],
    noise: 0.02,
    h: 0.012,
    p0: [0.1, 0, 0],
    up: "z",
    tilt: 16,
  },
  Thomas: {
    a: [0.14, 0.2],
    b: [-0.05, 0.2],
    noise: 0.05,
    h: 0.04,
    p0: [0.1, 0, 0],
    up: "diag",
    tilt: 14,
  },
  Halvorsen: {
    a: [1.27, 1.9],
    b: [3.5, 4.4],
    noise: 0.25,
    h: 0.005,
    p0: [-1.48, -1.51, 2.04],
    up: "diag",
    tilt: 34,
  },
}

function field(sys: Sys, a: number, b: number, [x, y, z]: V3): V3 {
  switch (sys) {
    case "Lorenz":
      return [10 * (y - x), x * (a - z) - y, x * y - b * z]
    case "Aizawa":
      return [
        (z - 0.7) * x - b * y,
        b * x + (z - 0.7) * y,
        0.6 + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x,
      ]
    case "Thomas":
      return [
        Math.sin(y) - a * x + b * Math.sin(z),
        Math.sin(z) - a * y + b * Math.sin(x),
        Math.sin(x) - a * z + b * Math.sin(y),
      ]
    case "Halvorsen":
      return [
        -a * x - 4 * y - b * z - y * y,
        -a * y - 4 * z - b * x - z * z,
        -a * z - 4 * x - b * y - x * x,
      ]
  }
}
const SYS_ID: Record<Sys, number> = { Lorenz: 0, Aizawa: 1, Thomas: 2, Halvorsen: 3 }

/** Rows of the rotation from a system's own axes to the world's (y up). */
const S2 = Math.SQRT1_2
const S3 = 1 / Math.sqrt(3)
const S6 = 1 / Math.sqrt(6)
const ROT: Record<Spec["up"], readonly V3[]> = {
  z: [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  diag: [
    [S2, -S2, 0],
    [S3, S3, S3],
    [S6, S6, -2 * S6],
  ],
}

// ── The form, measured on the CPU ───────────────────────────────────────────────────────────

const SEEDS = 8192
interface Form {
  /** Its centre (its own coordinates) and the scale that makes its reach 1. */
  readonly c: V3
  readonly s: number
  /** Its median speed in world units per unit of its own time. */
  readonly speed: number
  /** Points on it, where particles are born (its own coordinates, xyz_). */
  readonly seeds: Float32Array<ArrayBuffer>
}
function rng(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
const forms = new Map<string, Form>()
/** One long noisy run of the system: where it lives, how big and how fast it is. */
function measure(sys: Sys, a: number, b: number): Form {
  const key = `${sys}:${a.toFixed(4)}:${b.toFixed(4)}`
  const hit = forms.get(key)
  if (hit) return hit
  const spec = SPEC[sys]
  const rand = rng(7)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  const h = spec.h
  const kick = spec.noise * Math.sqrt(h)
  let p: V3 = [...spec.p0]
  const step = () => {
    const k1 = field(sys, a, b, p)
    const k2 = field(sys, a, b, [
      p[0] + (h / 2) * k1[0],
      p[1] + (h / 2) * k1[1],
      p[2] + (h / 2) * k1[2],
    ])
    const k3 = field(sys, a, b, [
      p[0] + (h / 2) * k2[0],
      p[1] + (h / 2) * k2[1],
      p[2] + (h / 2) * k2[2],
    ])
    const k4 = field(sys, a, b, [p[0] + h * k3[0], p[1] + h * k3[1], p[2] + h * k3[2]])
    p = [0, 1, 2].map(
      (i) => p[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!) + kick * gauss(),
    ) as V3
  }
  for (let i = 0; i < 4000; i++) step()
  const seeds = new Float32Array(SEEDS * 4)
  const rot = ROT[spec.up]
  const q: V3[] = []
  const speeds: number[] = []
  for (let n = 0; n < SEEDS; n++) {
    for (let i = 0; i < 4; i++) step()
    if (!p.every(Number.isFinite)) {
      // Never in range; but should it happen, the middle of the ranges is known to be good.
      const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2
      return measure(sys, mid(spec.a), mid(spec.b))
    }
    seeds.set(p, n * 4)
    q.push(rot.map((r) => r[0] * p[0] + r[1] * p[1] + r[2] * p[2]) as V3)
    speeds.push(Math.hypot(...field(sys, a, b, p)))
  }
  const pct = (xs: number[], t: number) => {
    const s = [...xs].sort((x, y) => x - y)
    return s[Math.min(s.length - 1, Math.floor(t * s.length))]!
  }
  // The middle of its extent (2nd to 98th percentile) each way. The camera circles the world's
  // y axis, so it's fitted in a cylinder: its reach out from the axis, and its height.
  const ext = [0, 1, 2].map((j) => {
    const xs = q.map((v) => v[j]!)
    return [pct(xs, 0.02), pct(xs, 0.98)] as const
  })
  const mid = ext.map(([lo, hi]) => (lo + hi) / 2) as V3
  const round = pct(
    q.map((v) => Math.hypot(v[0] - mid[0], v[2] - mid[2])),
    0.97,
  )
  const tall = (ext[1]![1] - ext[1]![0]) / 2
  const reach = Math.max(round, tall * 1.12)
  const c = [0, 1, 2].map(
    (j) => rot[0]![j]! * mid[0] + rot[1]![j]! * mid[1] + rot[2]![j]! * mid[2],
  ) as V3
  const form: Form = { c, s: 1 / reach, speed: pct(speeds, 0.5) / reach, seeds }
  if (forms.size > 64) forms.clear()
  forms.set(key, form)
  return form
}

// ── Springs (duration and bounce; bounce 0) ─────────────────────────────────────────────────

type Feel = { omega: number; zeta: number }
const FOLLOW: Feel = { omega: 34, zeta: 0.86 }
const SHAPE = springMotion({ duration: 1.1, bounce: 0 })
const CAMERA = springMotion({ duration: 1.4, bounce: 0 })
const SETTLE = springMotion({ duration: 0.6, bounce: 0 })
const RETURN = springMotion({ duration: 1.6, bounce: 0 })
const MORPH = springMotion({ duration: 2.6, bounce: 0 })
const ENTRANCE = springMotion({ duration: 1.6, bounce: 0 })

class Spring {
  v = 0
  target: number
  omega = SETTLE.omega
  zeta = SETTLE.zeta
  constructor(public x: number) {
    this.target = x
  }
  to(target: number, feel: Feel) {
    this.target = target
    this.omega = feel.omega
    this.zeta = feel.zeta
  }
  snap(x: number) {
    this.x = this.target = x
    this.v = 0
  }
  step(dt: number) {
    if (this.x === this.target && this.v === 0) return
    const n = Math.max(1, Math.ceil((dt * this.omega) / 0.2))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.v +=
        (-this.omega * this.omega * (this.x - this.target) - 2 * this.zeta * this.omega * this.v) *
        h
      this.x += this.v * h
    }
    if (Math.abs(this.x - this.target) < 1e-6 && Math.abs(this.v) < 1e-5) this.snap(this.target)
  }
}

// ── Colour ──────────────────────────────────────────────────────────────────────────────────

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
function oklchLinear(L: number, C: number, hDeg: number): V3 {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}
/** Slow, cruising and fast: deep in the tint, the tint, and nearly white a little warmer round. */
function palette(chroma: number, hue: number): [V3, V3, V3] {
  const c = Math.min(0.2, chroma)
  return [
    oklchLinear(0.52, c * 1.05, hue - 26),
    oklchLinear(0.76, c, hue),
    oklchLinear(0.96, c * 0.32, hue + 24),
  ]
}

// ── Matrices (column-major, as WGSL reads them) ─────────────────────────────────────────────

type M4 = Float32Array
/** Its own coordinates → the world: rotated, centred and scaled to a reach of 1. */
function modelOf(rot: readonly V3[], c: V3, s: number): M4 {
  const m = new Float32Array(16)
  for (let i = 0; i < 3; i++) {
    const r = rot[i]!
    for (let j = 0; j < 3; j++) m[j * 4 + i] = s * r[j]!
    m[12 + i] = -s * (r[0] * c[0] + r[1] * c[1] + r[2] * c[2])
  }
  m[15] = 1
  return m
}
function inverseModel(rot: readonly V3[], c: V3, s: number): M4 {
  const m = new Float32Array(16)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[j * 4 + i] = rot[j]![i]! / s
  m[12] = c[0]
  m[13] = c[1]
  m[14] = c[2]
  m[15] = 1
  return m
}
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!
      o[c * 4 + r] = s
    }
  return o
}
function lookAt(eye: V3): M4 {
  const f = norm([-eye[0], -eye[1], -eye[2]])
  const r = norm([-f[2], 0, f[0]])
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
  const m = new Float32Array(16)
  const rows = [r, u, [-f[0], -f[1], -f[2]] as V3]
  rows.forEach((row, i) => {
    m[i] = row[0]
    m[4 + i] = row[1]
    m[8 + i] = row[2]
    m[12 + i] = -(row[0] * eye[0] + row[1] * eye[1] + row[2] * eye[2])
  })
  m[15] = 1
  return m
}
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

// ── The scene ───────────────────────────────────────────────────────────────────────────────

/** A quarter of a million: 1.3–2.3 ms of GPU a frame at 2× on 1440 wide (`__heroAttractor.bench()`). */
const COUNT = 1 << 18
const DIST = 4.4
/** World units a second the flow cruises at, at Flow 1. */
const CRUISE = 0.42
const LIFE: [number, number] = [3.5, 9]
const HDR: GPUTextureFormat = "rgba16float"
const LEVELS = 5
const PAGE = "#101012"

const wrap360 = (d: number) => ((d % 360) + 360) % 360
const wrap180 = (d: number) => wrap360(d + 180) - 180
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** The panel's store; `changed` hears who made each change: the hand (a row, the scene) or not. */
function defineStore(changed: (how: "hand" | "other") => void) {
  return defineControls(
    "hero-attractor",
    {
      system: choice("Lorenz", SYSTEMS, { label: "System" }),
      shape: knob(7, { min: 0, max: 100, step: 1, unit: "%", label: "Shape" }),
      twist: knob(78, { min: 0, max: 100, step: 1, unit: "%", label: "Twist" }),
      flow: knob(1, { min: 0.25, max: 2.5, step: 0.05, decimals: 2, unit: "×", label: "Flow" }),
      trail: knob(40, { min: 0, max: 100, step: 1, unit: "%", label: "Trail" }),
      tint: color("#ff9f4a", { label: "Tint" }),
      orbit: knob(30, { min: 0, max: 100, step: 1, unit: "%", label: "Orbit" }),
      angle: angle(125, { label: "Angle" }),
    },
    {
      enabled: true,
      storage: null,
      onChange: (_patch, _values, meta) => changed(meta.source === "local" ? "hand" : "other"),
      defaultLabel: "Butterfly",
      presets: {
        Bloom: {
          system: "Aizawa",
          shape: 79,
          twist: 53,
          flow: 0.9,
          trail: 65,
          tint: "#ff5c8a",
          orbit: 22,
          angle: 0,
        },
        Knot: {
          system: "Thomas",
          shape: 50,
          twist: 40,
          flow: 1.2,
          trail: 70,
          tint: "#45c8ff",
          orbit: 35,
          angle: 30,
        },
        Storm: {
          system: "Halvorsen",
          shape: 21,
          twist: 56,
          flow: 1.4,
          trail: 70,
          tint: "#8b7bff",
          orbit: 55,
          angle: 200,
        },
      },
    },
  )
}
type Store = ReturnType<typeof defineStore>
type Values = ReturnType<Store["get"]>
type How = "init" | "hand" | "other"

export function mountHeroAttractor(host: HTMLElement): { dispose(): void } {
  const made: HTMLElement[] = []
  const part = (cls: string) => {
    let el = host.querySelector<HTMLElement>(`:scope > .${cls}`)
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
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
  const narrowQuery = matchMedia("(max-width: 900px)")
  const cleanups: (() => void)[] = []
  const listen = <K extends string>(
    target: EventTarget,
    type: K,
    fn: (e: never) => void,
    options?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn as EventListener, options)
    cleanups.push(() => target.removeEventListener(type, fn as EventListener, options))
  }

  let gpu: Gpu | null = null
  let still: Still | null = null
  let disposed = false
  let raf = 0
  let running = false
  let last = 0
  let onScreen = true

  // ── State, on springs ──
  let sys: Sys = "Lorenz"
  const coefA = new Spring(0)
  const coefB = new Spring(0)
  const centre = [new Spring(0), new Spring(0), new Spring(0)]
  const scale = new Spring(1)
  const pace = new Spring(1)
  const flow = new Spring(1)
  const trail = new Spring(0.5)
  const tintA = new Spring(0)
  const tintB = new Spring(0)
  const orbit = new Spring(0.3)
  const yaw = new Spring(0)
  const lift = new Spring(0)
  const tilt = new Spring(SPEC.Lorenz.tilt)
  const hold = new Spring(1)
  const morph = new Spring(0)
  const intro = new Spring(0)
  const springs = [
    coefA,
    coefB,
    ...centre,
    scale,
    pace,
    flow,
    trail,
    tintA,
    tintB,
    orbit,
    yaw,
    lift,
    tilt,
    hold,
    morph,
    intro,
  ]
  let form: Form = measure("Lorenz", 28, 8 / 3)
  let seedsDirty = true
  let lastAngle = 0
  let phase = 0
  /** A Shape or Twist under the hand is measured at most this often (ms). */
  let measureAt = 0
  let measurePending = false
  let measureFeel: Feel = SHAPE

  const coefs = (v: Values) => {
    const spec = SPEC[v.system as Sys]
    return [lerp(spec.a[0], spec.a[1], v.shape / 100), lerp(spec.b[0], spec.b[1], v.twist / 100)]
  }
  const remeasure = (feel: Feel, now = false) => {
    if (!now && performance.now() - measureAt < 70) {
      measurePending = true
      measureFeel = feel
      return
    }
    measurePending = false
    measureAt = performance.now()
    form = measure(sys, coefA.target, coefB.target)
    seedsDirty = true
    centre.forEach((sp, i) => sp.to(form.c[i]!, feel))
    scale.to(form.s, feel)
    pace.to(form.speed, feel)
  }
  const snapForm = () => {
    form = measure(sys, coefA.target, coefB.target)
    seedsDirty = true
    centre.forEach((sp, i) => sp.snap(form.c[i]!))
    scale.snap(form.s)
    pace.snap(form.speed)
  }

  const apply = (v: Values, how: How) => {
    const feel = how === "hand" ? FOLLOW : SHAPE
    const [a, b] = coefs(v)
    const nextSys = v.system as Sys
    if (how === "init" || nextSys !== sys) {
      // Another system: its own coefficients and space, at once; the particles carry the morph.
      const changed = how !== "init" && nextSys !== sys
      sys = nextSys
      coefA.snap(a)
      coefB.snap(b)
      snapForm()
      if (changed) {
        morph.snap(1)
        morph.to(0, MORPH)
        tilt.to(SPEC[sys].tilt, CAMERA)
      } else tilt.snap(SPEC[sys].tilt)
    } else if (a !== coefA.target || b !== coefB.target) {
      coefA.to(a, feel)
      coefB.to(b, feel)
      remeasure(feel, how !== "hand")
    }
    const set = (sp: Spring, x: number, f: Feel = how === "hand" ? FOLLOW : SETTLE) =>
      how === "init" ? sp.snap(x) : sp.to(x, f)
    set(flow, v.flow)
    set(trail, v.trail / 100)
    set(orbit, v.orbit / 100)
    const c = parseColor(v.tint) ?? { l: 0.7, c: 0.15, h: 50 }
    const h = (c.h * Math.PI) / 180
    set(tintA, c.c * Math.cos(h), how === "hand" ? FOLLOW : SHAPE)
    set(tintB, c.c * Math.sin(h), how === "hand" ? FOLLOW : SHAPE)
    // The angle turns the short way round, from wherever it's heading.
    const target = how === "init" ? v.angle : yaw.target + wrap180(v.angle - lastAngle)
    lastAngle = v.angle
    set(yaw, target, how === "hand" ? FOLLOW : CAMERA)
    wake()
  }

  const store: Store = defineStore((how) => apply(store.get(), how))
  const panel = mountPanel(store, slot, {
    title: "Attractor",
    theme: "dark",
    session: false,
    variants: false,
    haptics: false,
  })
  apply(store.get(), "init")
  if (reducedQuery.matches) intro.snap(1)
  else intro.to(1, ENTRANCE)

  // ── Layout: the form centred in the room the panel leaves ──
  const view = { w: 1, h: 1, cx: 0.5, cy: 0.5, r: 1 }
  const layout = () => {
    const w = stageEl.clientWidth || 1
    const h = stageEl.clientHeight || 1
    view.w = w
    view.h = h
    view.cy = h * 0.54
    const sr = stageEl.getBoundingClientRect()
    const pr = slot.getBoundingClientRect()
    if (narrowQuery.matches || !pr.width) {
      view.cx = w / 2
      view.r = Math.min(h * 0.37, w / 2.7)
      return
    }
    const left = pr.left - sr.left
    view.r = Math.min(h * 0.37, (left - 64) * 0.5)
    view.cx = Math.max(
      view.r * 1.3 + 24,
      Math.min(lerp(left / 2, w / 2, 0.45), left - 40 - view.r * 1.3),
    )
  }

  // ── Drag to turn: across sets the Angle row, up and down tilts and settles back ──
  let grab: { x: number; y: number; angle: number; lift: number; first: boolean } | null = null
  listen(stageEl, "pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    stageEl.setPointerCapture(e.pointerId)
    grab = { x: e.clientX, y: e.clientY, angle: yaw.target, lift: lift.target, first: true }
    hold.to(0, SETTLE)
    stageEl.style.cursor = "grabbing"
    wake()
  })
  listen(stageEl, "pointermove", (e: PointerEvent) => {
    if (!grab) return
    const turned = grab.angle - (e.clientX - grab.x) * 0.35
    const next = Math.round(wrap360(turned))
    if (next !== store.get().angle) {
      store.set({ angle: next }, { coalesce: !grab.first })
      grab.first = false
    }
    lift.to(Math.max(-30, Math.min(48, grab.lift + (e.clientY - grab.y) * 0.25)), FOLLOW)
    wake()
  })
  const release = (e: PointerEvent) => {
    if (!grab) return
    grab = null
    if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId)
    lift.to(0, RETURN)
    hold.to(1, RETURN)
    stageEl.style.cursor = "grab"
    wake()
  }
  listen(stageEl, "pointerup", release)
  listen(stageEl, "pointercancel", release)
  stageEl.style.cursor = "grab"

  // ── The frame: springs, camera, then the GPU (or the still) ──
  const camera = () => {
    const az = ((yaw.x + phase) * Math.PI) / 180
    const el = ((tilt.x + lift.x) * Math.PI) / 180
    return lookAt([
      DIST * Math.cos(el) * Math.sin(az),
      DIST * Math.sin(el),
      DIST * Math.cos(el) * Math.cos(az),
    ])
  }
  const frameState = (dt: number): FrameState => {
    const chroma = Math.hypot(tintA.x, tintB.x)
    const hue = (Math.atan2(tintB.x, tintA.x) * 180) / Math.PI
    const reduced = reducedQuery.matches
    return {
      sys,
      a: coefA.x,
      b: coefB.x,
      model: modelOf(ROT[SPEC[sys].up], [centre[0]!.x, centre[1]!.x, centre[2]!.x], scale.x),
      view: camera(),
      dt,
      pace: (CRUISE * Math.max(0.05, flow.x) * (reduced ? 0.25 : 1)) / Math.max(1e-4, pace.x),
      speed: CRUISE * Math.max(0.05, flow.x) * (reduced ? 0.25 : 1),
      morph: morph.x,
      trail: 0.01 + 0.2 * Math.max(0, trail.x) ** 1.3,
      palette: palette(chroma, hue),
      intro: Math.max(0, intro.x),
      layout: view,
    }
  }
  function tick(now: number) {
    raf = 0
    if (disposed) return
    if (!onScreen || document.hidden) {
      running = false
      return
    }
    const dt = Math.min(1 / 20, Math.max(0, (now - last) / 1000))
    last = now
    if (measurePending && performance.now() - measureAt >= 70) remeasure(measureFeel, true)
    for (const sp of springs) sp.step(dt)
    if (!reducedQuery.matches) phase += dt * orbit.x * 14 * Math.max(0, hold.x)
    if (gpu) {
      if (seedsDirty) {
        gpu.seeds(form.seeds)
        seedsDirty = false
      }
      gpu.frame(frameState(dt))
      raf = requestAnimationFrame(tick)
      return
    }
    // The still: drawn once for each change, where everything's heading.
    if (still) {
      if (measurePending) remeasure(measureFeel, true)
      for (const sp of springs) sp.snap(sp.target)
      still.draw(frameState(dt), form)
    }
    const moving = springs.some((sp) => sp.x !== sp.target || sp.v !== 0)
    if (moving && !still) raf = requestAnimationFrame(tick)
    else running = false
  }
  function wake() {
    if (running || disposed || !onScreen || document.hidden) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(tick)
  }
  const ro = new ResizeObserver(() => {
    layout()
    wake()
  })
  ro.observe(stageEl)
  ro.observe(slot)
  const io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting)
    wake()
  })
  io.observe(stageEl)
  listen(document, "visibilitychange", () => wake())
  listen(narrowQuery, "change", () => {
    layout()
    wake()
  })
  layout()

  const fallBack = () => {
    gpu?.dispose()
    gpu = null
    if (!still && !disposed) still = new Still(stageEl)
    springs.forEach((sp) => sp.snap(sp.target))
    intro.snap(1)
    wake()
  }
  const noGpu = new URLSearchParams(location.search).has("nogpu") || !navigator.gpu
  if (noGpu) fallBack()
  else
    createGpu(stageEl, form.seeds, () => fallBack())
      .then((g) => {
        if (disposed) return g?.dispose()
        if (!g) return fallBack()
        gpu = g
        wake()
      })
      .catch((e) => {
        console.warn("hero-attractor: no WebGPU", e)
        fallBack()
      })

  // The catalog's measurements: GPU ms a frame, by timestamp queries where there are any, and
  // by `n` frames back to back.
  const hook = {
    stats: () => gpu?.stats() ?? null,
    bench: async (n = 120, count?: number) =>
      gpu ? gpu.bench(n, frameState(1 / 60), count) : null,
  }
  Object.assign(window, { __heroAttractor: hook })

  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      for (const f of cleanups) f()
      panel.dispose()
      gpu?.dispose()
      still?.dispose()
      for (const el of made) el.remove()
    },
  }
}

interface FrameState {
  sys: Sys
  a: number
  b: number
  model: M4
  view: M4
  dt: number
  /** Its own time a real second. */
  pace: number
  /** The median speed (world units a second), for colour. */
  speed: number
  morph: number
  trail: number
  palette: [V3, V3, V3]
  intro: number
  layout: { w: number; h: number; cx: number; cy: number; r: number }
}

// ── WebGPU ──────────────────────────────────────────────────────────────────────────────────

interface Gpu {
  frame(f: FrameState): void
  seeds(data: Float32Array<ArrayBuffer>): void
  stats(): { ms: number; sim: number; draw: number; post: number; frames: number } | null
  bench(
    n: number,
    f: FrameState,
    count?: number,
  ): Promise<{ ms: number; count: number; dpr: number; w: number; h: number }>
  dispose(): void
}

const U_FLOATS = 92

async function createGpu(
  stageEl: HTMLElement,
  seeds0: Float32Array<ArrayBuffer>,
  lost: () => void,
): Promise<Gpu | null> {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
  if (!adapter) return null
  const timed = adapter.features.has("timestamp-query")
  const device = await adapter.requestDevice({ requiredFeatures: timed ? ["timestamp-query"] : [] })
  let alive = true
  device.lost.then((info) => {
    if (info.reason === "destroyed" || !alive) return
    console.error("hero-attractor: device lost:", info.message)
    lost()
  })
  device.addEventListener("uncapturederror", (e) =>
    console.error("hero-attractor:", (e as GPUUncapturedErrorEvent).error.message),
  )
  const canvas = document.createElement("canvas")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
  canvas.setAttribute("aria-hidden", "true")
  stageEl.prepend(canvas)
  const ctx = canvas.getContext("webgpu")!
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: "opaque" })

  const [common, rest] = sceneWgsl.split("//#compute")
  const [computeSrc, drawSrc] = rest!.split("//#draw")
  const compile = (code: string, label: string) => {
    const module = device.createShaderModule({ code, label })
    module.getCompilationInfo().then((info) => {
      for (const m of info.messages)
        if (m.type === "error")
          console.error(`hero-attractor ${label} ${m.lineNum}:${m.linePos} ${m.message}`)
    })
    return module
  }
  const simModule = compile(common! + computeSrc!, "attractor-sim")
  const drawModule = compile(common! + drawSrc!, "attractor-draw")
  const postModule = compile(postWgsl, "attractor-post")

  const uniform = device.createBuffer({
    size: U_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const parts = device.createBuffer({
    size: COUNT * 64,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const seedBuf = device.createBuffer({
    size: SEEDS * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(seedBuf, 0, seeds0)
  {
    // Born all over the form at every age, so the first frame is already the whole of it.
    const rand = rng(11)
    const init = new Float32Array(COUNT * 16)
    for (let i = 0; i < COUNT; i++) {
      const j = Math.floor(rand() * SEEDS) * 4
      const life = lerp(LIFE[0], LIFE[1], rand())
      init.set([seeds0[j]!, seeds0[j + 1]!, seeds0[j + 2]!, rand() * life], i * 16)
      init[i * 16 + 7] = life
      init[i * 16 + 11] = rand()
    }
    device.queue.writeBuffer(parts, 0, init)
  }
  const sim = device.createComputePipeline({
    layout: "auto",
    compute: { module: simModule, entryPoint: "cs_step" },
  })
  const simBind = device.createBindGroup({
    layout: sim.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: parts } },
      { binding: 2, resource: { buffer: seedBuf } },
    ],
  })
  const additive: GPUBlendState = {
    color: { srcFactor: "one", dstFactor: "one", operation: "add" },
    alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
  }
  const draw = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: drawModule, entryPoint: "vs_particle" },
    fragment: {
      module: drawModule,
      entryPoint: "fs_particle",
      targets: [{ format: HDR, blend: additive }],
    },
    primitive: { topology: "triangle-strip" },
  })
  const drawBind = device.createBindGroup({
    layout: draw.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: { buffer: parts } },
    ],
  })

  // The post chain, as controls-gpu.ts builds it.
  const postLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "unfilterable-float" },
      },
    ],
  })
  const postPl = device.createPipelineLayout({ bindGroupLayouts: [postLayout] })
  const pipe = (entry: string, target: GPUTextureFormat, add = false) =>
    device.createRenderPipeline({
      layout: postPl,
      vertex: { module: postModule, entryPoint: "vs_full" },
      fragment: {
        module: postModule,
        entryPoint: entry,
        targets: [add ? { format: target, blend: additive } : { format: target }],
      },
      primitive: { topology: "triangle-list" },
    })
  const down = pipe("fs_down", HDR)
  const up = pipe("fs_up", HDR, true)
  const composite = pipe("fs_composite", format)
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
  const noiseTex = device.createTexture({
    size: [64, 64],
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture({ texture: noiseTex }, blueNoise(64), { bytesPerRow: 64 * 4 }, [64, 64])
  const noise = noiseTex.createView()
  const page = [1, 3, 5].map((i) => toLinear(parseInt(PAGE.slice(i, i + 2), 16) / 255)) as V3

  interface Targets {
    w: number
    h: number
    hdr: GPUTexture
    hdrView: GPUTextureView
    levels: GPUTexture[]
    levelViews: GPUTextureView[]
    bufs: GPUBuffer[]
    binds: GPUBindGroup[]
  }
  let targets: Targets | null = null
  const dropTargets = () => {
    if (!targets) return
    for (const t of [targets.hdr, ...targets.levels]) t.destroy()
    for (const b of targets.bufs) b.destroy()
    targets = null
  }
  const writePost = (buf: GPUBuffer, tex: GPUTexture, first: number) => {
    const p = new Float32Array(16)
    p[0] = 1 / tex.width
    p[1] = 1 / tex.height
    p[4] = first
    p[5] = 1
    p[6] = 0.26 // bloom
    p[7] = 1 // exposure
    p[8] = 1 // neutral: the page stays its exact colour
    p[10] = 1
    p[11] = 1
    p.set(page, 12)
    p[15] = 0.06
    device.queue.writeBuffer(buf, 0, p)
  }
  const dpr = () => Math.min(2, devicePixelRatio || 1)
  const fit = (cssW: number, cssH: number) => {
    const w = Math.max(2, Math.round(cssW * dpr()))
    const h = Math.max(2, Math.round(cssH * dpr()))
    if (targets && targets.w === w && targets.h === h) return targets
    dropTargets()
    canvas.width = w
    canvas.height = h
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const hdr = tex(w, h)
    const hdrView = hdr.createView()
    const levels: GPUTexture[] = []
    const levelViews: GPUTextureView[] = []
    for (let i = 0; i < LEVELS; i++) {
      const t = tex(w >> (i + 1), h >> (i + 1))
      levels.push(t)
      levelViews.push(t.createView())
    }
    const bufs: GPUBuffer[] = []
    for (let i = 0; i < LEVELS * 2; i++)
      bufs.push(
        device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      )
    const bind = (src: GPUTextureView, buf: GPUBuffer, bloom: GPUTextureView) =>
      device.createBindGroup({
        layout: postLayout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: buf } },
          { binding: 3, resource: bloom },
          { binding: 4, resource: noise },
        ],
      })
    // Down: frame → L0 → … → L4. Up: L4 → L3 … L1 → L0, added on. Composite: frame with L0.
    const binds: GPUBindGroup[] = []
    for (let i = 0; i < LEVELS; i++) {
      binds.push(bind(i ? levelViews[i - 1]! : hdrView, bufs[i]!, hdrView))
      writePost(bufs[i]!, i ? levels[i - 1]! : hdr, i ? 0 : 1)
    }
    for (let i = LEVELS - 1; i > 0; i--) {
      const k = LEVELS + (LEVELS - 1 - i)
      binds.push(bind(levelViews[i]!, bufs[k]!, hdrView))
      writePost(bufs[k]!, levels[i]!, 0)
    }
    binds.push(bind(hdrView, bufs[LEVELS * 2 - 1]!, levelViews[0]!))
    writePost(bufs[LEVELS * 2 - 1]!, hdr, 0)
    targets = { w, h, hdr, hdrView, levels, levelViews, bufs, binds }
    return targets
  }

  // Timestamps: the compute pass's start and end, the particles' end and the composite's end.
  const querySet = timed ? device.createQuerySet({ type: "timestamp", count: 4 }) : null
  const resolveBuf = timed
    ? device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      })
    : null
  const readBuf = timed
    ? device.createBuffer({ size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
    : null
  let reading = false
  const times = { ms: 0, sim: 0, draw: 0, post: 0, frames: 0 }

  const data = new Float32Array(U_FLOATS)
  /** How many are simulated and drawn: all of them, but for a bench of fewer. */
  let drawn = COUNT
  let simSys: Sys | null = null
  let simModel: M4 | null = null
  let frameNo = 0
  let snap = true
  const write = (f: FrameState, t: Targets) => {
    const remap = simSys !== null && simSys !== f.sys && simModel
    data.set(f.model, 0)
    data.set(remap ? mul(inverseOf(f), simModel!) : f.model, 16)
    data.set(f.view, 32)
    const spec = SPEC[f.sys]
    // Morphing: the flow runs on ahead while the drawn particles ease after it.
    const simDt = f.dt * f.pace * (1 + 5 * f.morph)
    const n = Math.min(12, Math.max(1, Math.ceil(simDt / spec.h)))
    const s = t.w / Math.max(1, stageEl.clientWidth)
    const L = f.layout
    const rPx = L.r * s
    const focal = rPx * DIST
    const omega = Math.exp(lerp(Math.log(48), Math.log(2.2), Math.min(1, f.morph * 1.15)))
    data.set([SYS_ID[f.sys], f.a, f.b, spec.noise], 48)
    data.set([simDt / n, n, f.dt, f.pace], 52)
    data.set([omega, remap ? 1 : 0, SEEDS, frameNo++ % 1000000], 56)
    data.set([LIFE[0], LIFE[1], 3, snap ? 1 : 0], 60)
    data.set([L.cx * s, L.cy * s, focal, s], 64)
    data.set([f.trail, ((1.1 * rPx * rPx) / drawn) * f.intro, 0.03, DIST], 68)
    data.set([0.5, DIST - 0.9, f.speed, 3 * s], 72)
    data.set([t.w, t.h, 0.8 * Math.max(1, s * 0.6), 22 * s], 76)
    f.palette.forEach((c, i) => data.set([c[0], c[1], c[2], 0], 80 + i * 4))
    device.queue.writeBuffer(uniform, 0, data)
    simSys = f.sys
    simModel = f.model
    snap = false
  }
  const inverseOf = (f: FrameState) => {
    // The model's inverse from its parts: rotation, centre and scale.
    const m = f.model
    const s = Math.hypot(m[0]!, m[1]!, m[2]!)
    const rot = ROT[SPEC[f.sys].up]
    // Centre from the translation: t = −s R c, so c = −Rᵀ t / s.
    const t: V3 = [m[12]!, m[13]!, m[14]!]
    const c = [0, 1, 2].map(
      (j) => -(rot[0]![j]! * t[0] + rot[1]![j]! * t[1] + rot[2]![j]! * t[2]) / s,
    ) as V3
    return inverseModel(rot, c, s)
  }
  const encode = (f: FrameState, timedFrame: boolean) => {
    const t = fit(stageEl.clientWidth, stageEl.clientHeight)
    write(f, t)
    const enc = device.createCommandEncoder()
    const stamp = timedFrame && querySet
    const cp = enc.beginComputePass(
      stamp
        ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
        : {},
    )
    cp.setPipeline(sim)
    cp.setBindGroup(0, simBind)
    cp.dispatchWorkgroups(Math.ceil(drawn / 256))
    cp.end()
    let p = enc.beginRenderPass({
      colorAttachments: [
        {
          view: t.hdrView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: [page[0], page[1], page[2], 1],
        },
      ],
      ...(stamp ? { timestampWrites: { querySet, endOfPassWriteIndex: 2 } } : {}),
    })
    p.setPipeline(draw)
    p.setBindGroup(0, drawBind)
    p.draw(2 * 4, drawn)
    p.end()
    const pass = (view: GPUTextureView, load: GPULoadOp, last = false) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
        ...(last && stamp ? { timestampWrites: { querySet, endOfPassWriteIndex: 3 } } : {}),
      })
    for (let i = 0; i < LEVELS; i++) {
      p = pass(t.levelViews[i]!, "clear")
      p.setPipeline(down)
      p.setBindGroup(0, t.binds[i]!)
      p.draw(3)
      p.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      p = pass(t.levelViews[LEVELS - 2 - k]!, "load")
      p.setPipeline(up)
      p.setBindGroup(0, t.binds[LEVELS + k]!)
      p.draw(3)
      p.end()
    }
    p = pass(ctx.getCurrentTexture().createView(), "clear", true)
    p.setPipeline(composite)
    p.setBindGroup(0, t.binds[LEVELS * 2 - 1]!)
    p.draw(3)
    p.end()
    if (stamp) {
      enc.resolveQuerySet(querySet, 0, 4, resolveBuf!, 0)
      enc.copyBufferToBuffer(resolveBuf!, 0, readBuf!, 0, 32)
    }
    device.queue.submit([enc.finish()])
  }
  const sample = () => {
    if (!readBuf || reading) return false
    reading = true
    return true
  }

  return {
    frame(f) {
      if (!alive) return
      const timedFrame = sample()
      try {
        encode(f, timedFrame)
      } catch (e) {
        console.error("hero-attractor: frame failed", e)
        reading = false
        return
      }
      if (!timedFrame) return
      readBuf!
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const v = new BigInt64Array(readBuf!.getMappedRange().slice(0))
          readBuf!.unmap()
          const ms = (a: number, b: number) => Number(v[b]! - v[a]!) / 1e6
          const blend = times.frames < 8 ? 1 / (times.frames + 1) : 0.1
          times.sim = lerp(times.sim, ms(0, 1), blend)
          times.draw = lerp(times.draw, ms(1, 2), blend)
          times.post = lerp(times.post, ms(2, 3), blend)
          times.ms = lerp(times.ms, ms(0, 3), blend)
          times.frames++
        })
        .catch(() => {})
        .finally(() => {
          reading = false
        })
    },
    seeds(d) {
      device.queue.writeBuffer(seedBuf, 0, d)
    },
    stats: () => (timed ? { ...times } : null),
    async bench(n, f, count = COUNT) {
      drawn = Math.min(COUNT, count)
      encode(f, false)
      await device.queue.onSubmittedWorkDone()
      const t0 = performance.now()
      for (let i = 0; i < n; i++) encode(f, false)
      await device.queue.onSubmittedWorkDone()
      const ms = +((performance.now() - t0) / n).toFixed(3)
      drawn = COUNT
      const t = targets!
      return { ms, count, dpr: dpr(), w: t.w, h: t.h }
    },
    dispose() {
      alive = false
      dropTargets()
      canvas.remove()
      device.destroy()
    },
  }
}

// ── Without WebGPU: a still of the same form ────────────────────────────────────────────────

class Still {
  private readonly canvas = document.createElement("canvas")
  private readonly ctx: CanvasRenderingContext2D
  constructor(private readonly host: HTMLElement) {
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
    this.canvas.setAttribute("aria-hidden", "true")
    host.prepend(this.canvas)
    this.ctx = this.canvas.getContext("2d")!
  }
  draw(f: FrameState, form: Form) {
    const dpr = Math.min(1.5, devicePixelRatio || 1)
    const w = Math.max(2, Math.round(this.host.clientWidth * dpr))
    const h = Math.max(2, Math.round(this.host.clientHeight * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    const L = f.layout
    const s = w / Math.max(1, L.w)
    const focal = L.r * s * DIST
    const acc = new Float32Array(w * h * 3)
    const m = f.model
    const v = f.view
    const seeds = form.seeds
    const [slow, mid, fast] = f.palette
    // Each seed, and a short run of the flow from it, as light added where it lands.
    const spec = SPEC[f.sys]
    const energy = (0.5 * (L.r * s) ** 2) / (SEEDS * 12)
    for (let i = 0; i < SEEDS; i++) {
      let p: V3 = [seeds[i * 4]!, seeds[i * 4 + 1]!, seeds[i * 4 + 2]!]
      for (let k = 0; k < 12; k++) {
        const d = field(f.sys, f.a, f.b, p)
        p = [p[0] + d[0] * spec.h, p[1] + d[1] * spec.h, p[2] + d[2] * spec.h]
        const wx = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!
        const wy = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!
        const wz = m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!
        const cx = v[0]! * wx + v[4]! * wy + v[8]! * wz + v[12]!
        const cy = v[1]! * wx + v[5]! * wy + v[9]! * wz + v[13]!
        const cz = -(v[2]! * wx + v[6]! * wy + v[10]! * wz + v[14]!)
        const x = Math.round(L.cx * s + (focal * cx) / cz)
        const y = Math.round(L.cy * s - (focal * cy) / cz)
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const speed = (Math.hypot(...d) * f.pace * Math.hypot(m[0]!, m[1]!, m[2]!)) / f.speed
        const t = Math.min(1, Math.max(0, 0.5 + 0.42 * Math.log2(Math.max(speed, 1e-3))))
        const c =
          t < 0.5
            ? slow.map((a, j) => lerp(a, mid[j]!, t * 2))
            : mid.map((a, j) => lerp(a, fast[j]!, t * 2 - 1))
        const fog = Math.exp(-0.55 * Math.max(0, cz - (DIST - 0.9)))
        const o = (y * w + x) * 3
        for (let j = 0; j < 3; j++) acc[o + j]! += c[j]! * energy * fog * (0.75 + 0.5 * t)
      }
    }
    const img = this.ctx.createImageData(w, h)
    const base = [16, 16, 18]
    const enc = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055)
    for (let i = 0, n = w * h; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        const lin = toLinear(base[j]! / 255) + (1 - Math.exp(-acc[i * 3 + j]! * 3)) * 0.9
        img.data[i * 4 + j] = Math.round(enc(Math.min(1, lin)) * 255)
      }
      img.data[i * 4 + 3] = 255
    }
    this.ctx.putImageData(img, 0, 0)
  }
  dispose() {
    this.canvas.remove()
  }
}
