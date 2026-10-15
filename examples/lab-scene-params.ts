// The panels' values as the scene's numbers. Each view (the live one, an A/B snapshot, a grid
// cell) keeps a Look: its values, each on a spring. A drag or a key lands 1:1; a jump (a variant,
// a preset, undo, a roll) glides there, so nothing in the street ever jumps. Weather presets,
// toggles and the light's style glide slower, as weather does.
import {
  type CurvePoint,
  type GradientStop,
  sampleCurve,
  sampleGradient,
  springMotion,
  type Value,
} from "knobs"
import { fxSchema, type FxValues } from "./lab-fx"
import { SODIUM, type Vec3 } from "./lab-scene-world"

export type Settings = Record<string, Value>
export interface Inputs {
  settings: Settings
  fx: FxValues
}

/** What each weather preset brings before the panel's own values scale it. */
export const PRESETS: Record<string, Record<string, number>> = {
  Rain: {
    rainBase: 1,
    fogBase: 0.022,
    overcast: 0.85,
    wind: 0.9,
    gust: 0.4,
    lightning: 0,
    presetSnow: 0,
  },
  Drizzle: {
    rainBase: 0.45,
    fogBase: 0.03,
    overcast: 0.75,
    wind: 0.5,
    gust: 0.2,
    lightning: 0,
    presetSnow: 0,
  },
  Storm: {
    rainBase: 1.4,
    fogBase: 0.03,
    overcast: 1,
    wind: 2.6,
    gust: 1.6,
    lightning: 1,
    presetSnow: 0,
  },
  Fog: {
    rainBase: 0.12,
    fogBase: 0.12,
    overcast: 0.9,
    wind: 0.2,
    gust: 0.1,
    lightning: 0,
    presetSnow: 0,
  },
  Snow: {
    rainBase: 1,
    fogBase: 0.04,
    overcast: 0.85,
    wind: 0.6,
    gust: 0.4,
    lightning: 0,
    presetSnow: 1,
  },
  Clear: {
    rainBase: 0,
    fogBase: 0.008,
    overcast: 0.05,
    wind: 0.2,
    gust: 0.1,
    lightning: 0,
    presetSnow: 0,
  },
}

/** The dock's Variants: a preset and the precipitation values that go with it. */
export const VARIANTS: Record<string, Settings> = {
  Rain: {
    preset: "Rain",
    intensity: 1,
    density: 1.6,
    size: 1.1,
    streak: 1.4,
    fall: 13,
    litOnly: 0.6,
    snow: false,
    splash: 1.8,
    wetness: 0.9,
    puddles: 1,
  },
  Drizzle: {
    preset: "Drizzle",
    intensity: 0.6,
    density: 1.1,
    size: 0.55,
    streak: 0.8,
    fall: 8,
    litOnly: 0.75,
    snow: false,
    splash: 0.7,
    wetness: 0.65,
    puddles: 0.6,
  },
  Storm: {
    preset: "Storm",
    intensity: 1,
    density: 2.25,
    size: 1.26,
    streak: 1.62,
    fall: 15,
    litOnly: 0.7,
    snow: false,
    splash: 2.25,
    wetness: 1,
    puddles: 1.32,
  },
  Fog: {
    preset: "Fog",
    intensity: 0.35,
    density: 0.6,
    size: 0.5,
    streak: 0.6,
    fall: 6,
    litOnly: 0.85,
    snow: false,
    splash: 0.25,
    wetness: 0.7,
    puddles: 0.8,
  },
  Snow: {
    preset: "Snow",
    intensity: 1,
    density: 1.4,
    size: 1.5,
    streak: 0,
    fall: 10,
    litOnly: 0.45,
    snow: true,
    splash: 0,
    wetness: 0.25,
    puddles: 0.15,
  },
}

// The palette (kit-motion): default .3/0 for state, calm .4/0 for glides, slow .85/0 for weather.
const DEFAULT = springMotion({ duration: 0.3, bounce: 0 })
const CALM = springMotion({ duration: 0.4, bounce: 0 })
const SLOW = springMotion({ duration: 0.85, bounce: 0 })

class Smooth {
  x: number
  v = 0
  target: number
  constructor(
    x: number,
    public omega: number,
    public zeta: number,
  ) {
    this.x = this.target = x
  }
  /** A jump glides; a small step (a drag, a key) lands where the hand put it. */
  set(target: number, glide: boolean) {
    if (target === this.target) return
    this.target = target
    if (!glide && this.resting) this.snap(target)
  }
  snap(x: number) {
    this.x = this.target = x
    this.v = 0
  }
  step(dt: number) {
    if (this.resting) return
    const h = 1 / 480
    for (let t = 0; t < Math.min(dt, 0.1); t += h) {
      const a =
        -this.omega * this.omega * (this.x - this.target) - 2 * this.zeta * this.omega * this.v
      this.v += a * h
      this.x += this.v * h
    }
    if (
      Math.abs(this.x - this.target) < 1e-4 * Math.max(1, Math.abs(this.target)) &&
      Math.abs(this.v) < 1e-3
    )
      this.snap(this.target)
  }
  get resting() {
    return this.x === this.target && this.v === 0
  }
}

/** Numeric keys, each with its range (a jump is a change of more than an eighth of it). */
const KNOBS: Record<string, [number, number]> = {
  intensity: [0, 2],
  density: [0, 4],
  size: [0.2, 3],
  streak: [0, 4],
  fall: [1, 30],
  litOnly: [0, 1],
  splash: [0, 4],
  wetness: [0, 1],
  puddles: [0, 2],
  cone: [4, 90],
  falloff: [0, 1],
  exposure: [-3, 3],
  hour: [0, 24],
  puffs: [1, 12],
}
const SLOW_KEYS = ["rainBase", "fogBase", "overcast", "wind", "gust", "lightning", "snowness"]
const STATE_KEYS = ["flashlight", "streetlamp", "spotW", "areaW", "sunW"]

export const RAMP_W = 128
export const RAMP_ROWS = 4

/** Ramp rows from the FX values: smoke, sky, fog (linear rgb) and the two curves (r, g). */
export function rampRows(fx: FxValues): Float32Array {
  const out = new Float32Array(RAMP_ROWS * RAMP_W * 4)
  const grad = (
    row: number,
    stops: readonly GradientStop[],
    space: "oklab" | "srgb" | undefined,
  ) => {
    for (let i = 0; i < RAMP_W; i++) {
      const c = sampleGradient(stops, i / (RAMP_W - 1), {
        ...(space ? { space } : {}),
        as: "linear",
      })
      out.set([c[0], c[1], c[2], 1], (row * RAMP_W + i) * 4)
    }
  }
  grad(0, fx.smoke, fxSchema.smoke.space)
  grad(1, fx.sky, fxSchema.sky.space)
  grad(2, fx.fog, fxSchema.fog.space)
  const curve = (
    points: readonly CurvePoint[],
    interp: typeof fxSchema.falloff.interp,
    channel: number,
  ) => {
    for (let i = 0; i < RAMP_W; i++)
      out[(3 * RAMP_W + i) * 4 + channel] = Math.max(
        0,
        sampleCurve(points, i / (RAMP_W - 1), { interp }),
      )
  }
  curve(fx.falloff, fxSchema.falloff.interp, 0)
  curve(fx.unseen, fxSchema.unseen.interp, 1)
  for (let i = 0; i < RAMP_W; i++) out[(3 * RAMP_W + i) * 4 + 3] = 1
  return out
}

/** One view's values, smoothed, and its ramps, cross-faded on a jump. */
export class Look {
  readonly values = new Map<string, Smooth>()
  preset = "Storm"
  ramp: Float32Array
  private rampFrom: Float32Array
  private rampTo: Float32Array
  private rampMix = new Smooth(1, CALM.omega, CALM.zeta)
  private fxKey = ""

  constructor(inputs: Inputs) {
    this.ramp = rampRows(inputs.fx)
    this.rampFrom = this.ramp
    this.rampTo = this.ramp
    this.update(inputs, true)
  }

  private put(key: string, value: number, glide: boolean, motion = DEFAULT, snap = false) {
    let s = this.values.get(key)
    if (!s) {
      s = new Smooth(value, motion.omega, motion.zeta)
      this.values.set(key, s)
      return
    }
    if (snap) s.snap(value)
    else s.set(value, glide)
  }

  /** Takes new inputs; `snap` lands everything at once (a fresh view, the first frame). */
  update({ settings: v, fx }: Inputs, snap = false) {
    for (const [key, [lo, hi]] of Object.entries(KNOBS)) {
      const raw = key === "hour" || key === "puffs" ? fx[key] : v[key]
      const value = Number(raw)
      if (!Number.isFinite(value)) continue
      const prev = this.values.get(key)?.target ?? value
      this.put(key, value, Math.abs(value - prev) > (hi - lo) / 8, CALM, snap)
    }
    this.preset = String(v.preset ?? "Storm")
    const base = PRESETS[this.preset] ?? PRESETS.Storm!
    for (const key of SLOW_KEYS) {
      const value = key === "snowness" ? (v.snow || base.presetSnow ? 1 : 0) : base[key]!
      this.put(key, value, true, SLOW, snap)
    }
    const light = String(v.light ?? "Spot")
    const states: Record<string, number> = {
      flashlight: v.flashlight ? 1 : 0,
      streetlamp: v.streetlamp === false ? 0 : 1,
      spotW: light === "Spot" ? 1 : 0,
      areaW: light === "Area" ? 1 : 0,
      sunW: light === "Sun" ? 1 : 0,
    }
    for (const key of STATE_KEYS) this.put(key, states[key]!, true, CALM, snap)
    // The ramps: rebuilt on change; a big change cross-fades, a stop dragged lands as it goes.
    const key = JSON.stringify(fx, [
      "smoke",
      "sky",
      "fog",
      "falloff",
      "unseen",
      "at",
      "color",
      "x",
      "y",
    ])
    if (key !== this.fxKey) {
      this.fxKey = key
      const next = rampRows(fx)
      let diff = 0
      for (let i = 0; i < next.length; i++)
        diff = Math.max(diff, Math.abs(next[i]! - this.rampTo[i]!))
      if (snap || diff < 0.12) {
        this.rampFrom = this.rampTo = this.ramp = next
        this.rampMix.snap(1)
      } else {
        this.rampFrom = this.ramp.slice()
        this.rampTo = next
        this.rampMix.snap(0)
        this.rampMix.set(1, true)
      }
    }
  }

  /** Steps every spring; true while any still moves. */
  step(dt: number): boolean {
    let moving = false
    for (const s of this.values.values()) {
      s.step(dt)
      if (!s.resting) moving = true
    }
    if (!this.rampMix.resting) {
      this.rampMix.step(dt)
      const t = this.rampMix.x
      const out = new Float32Array(this.rampTo.length)
      for (let i = 0; i < out.length; i++)
        out[i] = this.rampFrom[i]! + (this.rampTo[i]! - this.rampFrom[i]!) * t
      this.ramp = this.rampMix.resting ? this.rampTo : out
      moving = true
    }
    return moving
  }
  /** True once the ramp texture's rows have changed since `since`. */
  get(key: string) {
    return this.values.get(key)?.x ?? 0
  }
  /** The weather's name for the readouts. */
  status() {
    return this.get("snowness") > 0.5 ? "Snow" : this.preset
  }
}

/** Derived numbers every part of the frame uses. */
export function weather(look: Look) {
  const g = (k: string) => look.get(k)
  const snowness = g("snowness")
  const amount = g("rainBase") * g("intensity") * (g("density") / 2.25)
  const speed = Math.max(0.5, g("fall") * (1 - snowness * 0.88))
  return {
    snowness,
    amount,
    speed,
    drops: Math.round(Math.min(90000, amount * 2.25 * 9500 * (1 - snowness * 0.35))),
    splashes: Math.round(
      Math.min(4000, g("splash") * g("rainBase") * g("intensity") * 700 * (1 - snowness)),
    ),
  }
}

export interface Camera {
  pos: Vec3
  target: Vec3
  fov: number
}
export interface Matrices {
  viewProj: Float32Array
  invViewProj: Float32Array
  right: Vec3
  up: Vec3
  forward: Vec3
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Column-major view-projection (WebGPU depth 0…1) and its inverse. */
export function matrices(cam: Camera, aspect: number): Matrices {
  const f = norm(sub(cam.target, cam.pos))
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const view = [
    r[0],
    u[0],
    -f[0],
    0,
    r[1],
    u[1],
    -f[1],
    0,
    r[2],
    u[2],
    -f[2],
    0,
    -dot(r, cam.pos),
    -dot(u, cam.pos),
    dot(f, cam.pos),
    1,
  ]
  const near = 0.1
  const far = 400
  const t = 1 / Math.tan((cam.fov * Math.PI) / 360)
  const proj = [
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    far / (near - far),
    -1,
    0,
    0,
    (near * far) / (near - far),
    0,
  ]
  const vp = mul(proj, view)
  return {
    viewProj: new Float32Array(vp),
    invViewProj: new Float32Array(invert(vp)),
    right: r,
    up: u,
    forward: f,
  }
}
function mul(a: number[], b: number[]) {
  const o = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!
      o[c * 4 + r] = s
    }
  return o
}
function invert(m: number[]) {
  const inv = new Array<number>(16)
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06)
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det
  return inv
}

/** Kelvin to linear rgb (Tanner Helland's fit), normalised to its brightest channel. */
export function kelvin(k: number): Vec3 {
  const t = k / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = [r, g, b].map((x) => {
    const s = Math.min(255, Math.max(0, x)) / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const m = Math.max(...c)
  return [c[0]! / m, c[1]! / m, c[2]! / m]
}

export interface LightSlot {
  pos: Vec3
  range: number
  color: Vec3
  kind: number
  dir: Vec3
  size: number
  cosOuter: number
  cosInner: number
  fog: number
  shadows: number
  /** The sphere its light fills in fog (centre, radius); none if left out. */
  vol?: [number, number, number, number]
}
export const FRAME_FLOATS = 352
const dbg = new URLSearchParams(location.search).get("debug") ?? ""
const DEBUG =
  (dbg.includes("nofog") ? 2 : 0) |
  (dbg.includes("noshadow") ? 4 : 0) |
  (dbg.includes("noao") ? 16 : 0)
export const MAX_OCCLUDERS = 24

export interface FrameInputs {
  m: Matrices
  cam: Vec3
  time: number
  rect: [number, number, number, number]
  look: Look
  viewIndex: number
  flash: number
  fall: number
  soak: number
  lights: LightSlot[]
  occluders: number[]
  drops: number
  splashes: number
  seed: number
  rainVisible: number
  windowLevel: number
  reduced: boolean
}

/** Packs one view's Frame uniform (see lab-scene.wgsl). */
export function packFrame(f: FrameInputs, out: Float32Array = new Float32Array(FRAME_FLOATS)) {
  const g = (k: string) => f.look.get(k)
  const w = weather(f.look)
  out.set(f.m.viewProj, 0)
  out.set(f.m.invViewProj, 16)
  out.set([...f.cam, f.time], 32)
  out.set(f.rect, 36)
  out.set([g("hour") / 24, g("overcast"), f.flash, f.viewIndex * RAMP_ROWS], 40)
  const fogDensity = g("fogBase") * (1 + 0.25 * Math.min(2, w.amount))
  out.set([fogDensity, 0.14, 46, f.reduced ? 4 : 8], 44)
  const amb = 0.9 + g("overcast") * 0.25
  out.set([amb, amb, amb * 1.04, 0.03 + 0.03 * g("overcast")], 48)
  const wet = g("wetness") * f.soak
  out.set(
    [
      wet,
      g("puddles"),
      Math.min(1.2, w.amount) * (1 - w.snowness),
      w.snowness * Math.min(1, f.soak * 1.4) * 0.85,
    ],
    52,
  )
  const streak = g("streak") * w.speed * (1 / 60) * 1.05
  out.set([f.fall, 0, streak, 0.0026], 56)
  const wind = g("wind") + g("gust") * Math.sin(f.time * 0.37) * Math.sin(f.time * 0.13 + 1)
  out.set([wind / w.speed, g("litOnly"), w.snowness, f.drops], 60)
  out.set(
    [g("size"), f.rainVisible * (0.75 + 0.25 * Math.min(1, g("intensity"))), f.seed, f.time],
    64,
  )
  out.set([f.splashes, 1.3, 0.24, Math.max(0.3, g("size"))], 68)
  out.set([8, f.occluders.length / 4, (f.reduced ? 1 : 0) | DEBUG, f.time % 97], 72)
  out.set([0.75, 0.88, 1.4, f.windowLevel], 76)
  out.set([-15, 0, -6.6, 0], 80)
  out.set([32, 12, 16.5, 0], 84)
  out.set([...f.m.right, 0], 88)
  out.set([...f.m.up, 0], 92)
  out.fill(0, 96, 192)
  out.set(f.occluders.slice(0, MAX_OCCLUDERS * 4), 96)
  const occl = f.occluders
  const count = Math.min(MAX_OCCLUDERS, occl.length / 4)
  for (let i = 0; i < 8; i++) {
    const l = f.lights[i]
    const o = 192 + i * 20
    if (!l) {
      out.fill(0, o, o + 20)
      continue
    }
    // Which occluders can shade what this light reaches, as bits (24 fit a float exactly).
    let mask = 0
    if (l.shadows)
      for (let k = 0; k < count; k++) {
        const r = occl[k * 4 + 3]! % 100
        if (r < 0.01) continue
        const d = Math.hypot(
          occl[k * 4]! - l.pos[0],
          occl[k * 4 + 1]! - l.pos[1],
          occl[k * 4 + 2]! - l.pos[2],
        )
        if (l.kind === 3 || d < l.range + r) mask |= 1 << k
      }
    out.set(
      [
        ...l.pos,
        l.range,
        ...l.color,
        l.kind,
        ...l.dir,
        l.size,
        l.cosOuter,
        l.cosInner,
        l.fog,
        mask,
        ...(l.vol ?? [0, 0, 0, 0]),
      ],
      o,
    )
  }
  return out
}

export { SODIUM }
