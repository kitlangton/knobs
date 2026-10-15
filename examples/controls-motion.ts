// The catalog's mini previews move on knobs' own springs (the panel's 480 Hz integrator) by
// duration and bounce, on one shared rAF loop that runs only while something visible is moving.
// A preview off screen takes new values at once and draws them once; continuous loops pause there.
// Changes by the user's own hand (drags, keys) follow on the panel's lead spring, as its fill does;
// presets, Random, Reset and undo travel on the calmer springs below.
//
// Everything that moves smears with its speed: round things stretch along their velocity, and a
// directional blur (an SVG feGaussianBlur in the element's own axes) grows with speed, capped at a
// few pixels and exactly 0 at rest, where the filter comes off so a still preview costs no paint.
// Colours travel in OKLab. Numbers roll. Reduced motion drops travel, blur and goo, and keeps a
// short fade on the values marked `fade`.
import { createRollingNumber, createRollingText } from "@kitlangton/rolling-number"
import "@kitlangton/rolling-number/styles.css"
import { parseColor, springMotion } from "knobs"
import { Spring } from "knobs/panel"

export type Feel =
  | "follow"
  | "trail"
  | "instant"
  | "snappy"
  | "default"
  | "calm"
  | "smooth"
  | "morph"
  | "morphClose"
  | "playful"
  | "slow"

export const FEEL: Record<Feel, { omega: number; zeta: number }> = {
  follow: { omega: 34, zeta: 0.86 },
  trail: { omega: 25, zeta: 1 },
  instant: springMotion({ duration: 0.1, bounce: 0 }),
  snappy: springMotion({ duration: 0.25, bounce: 0 }),
  default: springMotion({ duration: 0.3, bounce: 0 }),
  calm: springMotion({ duration: 0.4, bounce: 0 }),
  smooth: springMotion({ duration: 0.45, bounce: 0 }),
  morph: springMotion({ duration: 0.42, bounce: 0.16 }),
  morphClose: springMotion({ duration: 0.38, bounce: 0.08 }),
  playful: springMotion({ duration: 0.3, bounce: 0.3 }),
  slow: springMotion({ duration: 0.85, bounce: 0 }),
}
const FADE = springMotion({ duration: 0.18, bounce: 0 })

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
export const reduced = () => reducedQuery.matches

export type How = "init" | "hand" | "other"

/** One animated number. */
export class Val {
  readonly spring: Spring
  constructor(
    private readonly stage: Stage,
    x: number,
    eps: number,
    /** An opacity: under reduced motion it still fades, briefly. */
    readonly fade = false,
  ) {
    this.spring = new Spring(x, FEEL.default.omega, FEEL.default.zeta, eps)
  }
  get x() {
    return this.spring.x
  }
  get v() {
    return this.spring.v
  }
  get target() {
    return this.spring.target
  }
  /** Retargets, keeping position and velocity. */
  to(target: number, feel: Feel | { omega: number; zeta: number } = "default", delay = 0) {
    const f = this.fade && reduced() ? FADE : typeof feel === "string" ? FEEL[feel] : feel
    this.spring.omega = f.omega
    this.spring.zeta = f.zeta
    // A delay only means something while it's seen moving.
    this.spring.set(target, this.stage.visible && !reduced() ? delay : 0)
    this.stage.kick()
    return this
  }
  /** Moves at once on first paint, follows the hand, else travels on `feel`. */
  go(target: number, how: How, feel: Feel = "default", delay = 0) {
    if (how === "init") return this.snap(target)
    return this.to(target, how === "hand" ? "follow" : feel, how === "hand" ? 0 : delay)
  }
  snap(x: number) {
    this.spring.snap(x)
    this.stage.kick()
    return this
  }
  /** Gives the spring a push (units/s). */
  push(v: number) {
    this.spring.v += v
    this.stage.kick()
    return this
  }
}

const stages = new Set<Stage>()
const byEl = new WeakMap<Element, Stage>()
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const stage = byEl.get(e.target)
      if (!stage) continue
      stage.visible = e.isIntersecting
      if (stage.visible) stage.kick()
    }
  },
  { rootMargin: "80px 0px" },
)

let raf = 0
let last = 0
function frame(now: number) {
  const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60
  last = now
  raf = 0
  let any = false
  for (const s of stages) {
    if (s.active) s.step(dt, now)
    if (s.active) any = true
  }
  if (any) raf = requestAnimationFrame(frame)
  else last = 0
}
function wake() {
  if (!raf) raf = requestAnimationFrame(frame)
}

/** A preview: its animated values, its loops and how it draws them. */
export class Stage {
  visible = false
  active = false
  private vals = new Set<Val>()
  private loops = new Set<(dt: number, now: number) => boolean>()
  private draws = new Set<() => void>()
  constructor(
    readonly el: HTMLElement,
    draw?: () => void,
  ) {
    if (draw) this.draws.add(draw)
    stages.add(this)
    byEl.set(el, this)
    io.observe(el)
  }
  val(x: number, eps = 0.002, fade = false) {
    const v = new Val(this, x, eps, fade)
    this.vals.add(v)
    return v
  }
  drop(v: Val) {
    this.vals.delete(v)
  }
  /** Another drawing step, run after the stage's own. */
  onDraw(f: () => void) {
    this.draws.add(f)
  }
  /** A loop that runs each frame while visible, until it returns false. */
  loop(f: (dt: number, now: number) => boolean) {
    this.loops.add(f)
    this.kick()
    return () => {
      this.loops.delete(f)
    }
  }
  private draw() {
    for (const f of this.draws) f()
  }
  kick() {
    if (!this.visible) {
      // Nobody is watching: land at once.
      for (const v of this.vals) v.spring.snap(v.spring.target)
      this.draw()
      return
    }
    if (reduced()) {
      // No travel; fades still play.
      for (const v of this.vals) if (!v.fade) v.spring.snap(v.spring.target)
      this.draw()
    }
    if (!this.active) {
      this.active = true
      wake()
    }
  }
  step(dt: number, now: number) {
    if (!this.visible) {
      this.active = false
      return
    }
    for (const v of this.vals) v.spring.step(dt)
    for (const f of this.loops) if (!f(dt, now)) this.loops.delete(f)
    this.draw()
    // Drawing can feed new motion (a speed sample), so ask after it.
    let moving = this.loops.size > 0
    if (!moving) for (const v of this.vals) if (!v.spring.resting) moving = true
    this.active = moving
  }
  /** Draws now (a value changed that isn't animated). */
  paint() {
    this.draw()
  }
}

// ── Motion blur ──────────────────────────────────────────────────────────────────────────────

/**
 * Shutter-integrated motion blur and area-preserving squash-and-stretch.
 *
 * Velocities are in px/s (time-based, so 60 Hz and 120 Hz produce identical shutter lengths).
 * `blurFor` eases in from a small deadzone with a C¹ quadratic toe (no pop when the filter
 * attaches or detaches) and saturates smoothly at `BLUR_MAX`. At rest and under reduced motion
 * it is 0, and `DirBlur` removes the `filter` property altogether.
 */
export const SHUTTER_S = 1 / 34
export const BLUR_K = 1 / 145
export const BLUR_MAX = 5
export const STRETCH_K = 1 / 3200
export const STRETCH_MAX = 0.28

/** A speed (px/s) as a directional blur radius (px): 0 at rest and under reduced motion. */
export function blurFor(speed: number, max = BLUR_MAX) {
  if (reduced()) return 0
  const v = Math.abs(speed) - 6
  if (v <= 0) return 0
  const raw = v * BLUR_K
  const eased = (raw * raw) / (raw + 0.14)
  const b = (max * eased) / Math.hypot(max, eased)
  return b < 0.05 ? 0 : b
}
/** A speed (px/s) as a stretch along the motion (1 at rest). */
export function stretchFor(speed: number, max = STRETCH_MAX) {
  if (reduced()) return 1
  const v = Math.max(0, Math.abs(speed) - 8)
  const raw = v * STRETCH_K
  return 1 + (max * raw) / Math.hypot(max, raw)
}
/**
 * Velocity-aligned squash-and-stretch for an upright element (a tile, a card): stretches along
 * `(vx, vy)` and squashes across it without rotating its content (`R(a) S R(-a)`).
 */
export function stretchAlong(vx: number, vy: number, max = 0.12) {
  if (reduced()) return ""
  const speed = Math.hypot(vx, vy)
  const s = stretchFor(speed, max)
  if (s <= 1.002) return ""
  const a = ((Math.atan2(vy, vx) * 180) / Math.PI).toFixed(2)
  return ` rotate(${a}deg) scale(${s.toFixed(4)},${(1 / Math.sqrt(s)).toFixed(4)}) rotate(${(-Number(a)).toFixed(2)}deg)`
}

let defs: SVGDefsElement | null = null
let filterIds = 0
const SVG = "http://www.w3.org/2000/svg"
function filterDefs() {
  if (defs) return defs
  const svg = document.createElementNS(SVG, "svg")
  svg.setAttribute("aria-hidden", "true")
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"
  defs = document.createElementNS(SVG, "defs")
  svg.append(defs)
  document.body.append(svg)
  return defs
}

/**
 * A 5-tap raised-cosine shutter blur on one element along any 2D vector `(sx, sy)` in its own
 * axes, bridged by a sub-tap Gaussian. The arithmetic composite weights sum to 1.00 (0.28 +
 * 2×0.22 + 2×0.14), so opaque interiors never dim and diagonal motion streaks along the true
 * velocity vector instead of an axis-aligned box. Detached completely at rest.
 */
export class DirBlur {
  private readonly blur: SVGFEGaussianBlurElement
  private readonly offsets: readonly [
    SVGFEOffsetElement,
    SVGFEOffsetElement,
    SVGFEOffsetElement,
    SVGFEOffsetElement,
  ]
  private readonly id = `catalog-blur-${++filterIds}`
  private on = false
  private last = ""
  constructor(readonly el: HTMLElement | SVGElement) {
    const filter = document.createElementNS(SVG, "filter")
    filter.id = this.id
    for (const [k, v] of [
      ["x", "-75%"],
      ["y", "-75%"],
      ["width", "250%"],
      ["height", "250%"],
      ["color-interpolation-filters", "sRGB"],
    ])
      filter.setAttribute(k!, v!)
    const blur = document.createElementNS(SVG, "feGaussianBlur")
    blur.setAttribute("in", "SourceGraphic")
    blur.setAttribute("result", "b")
    filter.append(blur)
    this.blur = blur
    const off = (res: string) => {
      const o = document.createElementNS(SVG, "feOffset")
      o.setAttribute("in", "b")
      o.setAttribute("result", res)
      filter.append(o)
      return o
    }
    this.offsets = [off("t1"), off("t2"), off("t3"), off("t4")]
    const add = (a: string, b: string, k2: string, k3: string, res?: string) => {
      const c = document.createElementNS(SVG, "feComposite")
      c.setAttribute("in", a)
      c.setAttribute("in2", b)
      c.setAttribute("operator", "arithmetic")
      c.setAttribute("k1", "0")
      c.setAttribute("k2", k2)
      c.setAttribute("k3", k3)
      c.setAttribute("k4", "0")
      if (res) c.setAttribute("result", res)
      filter.append(c)
    }
    add("t1", "t2", "0.22", "0.22", "p1")
    add("t3", "t4", "0.14", "0.14", "p2")
    add("p1", "p2", "1", "1", "p12")
    add("b", "p12", "0.28", "1")
    filterDefs().append(filter)
  }
  /** Signed blur components (px) along the element's x and y; both 0 takes the filter off. */
  set(sx: number, sy: number) {
    if (reduced() || Math.hypot(sx, sy) < 0.05) {
      if (this.on) {
        this.el.style.filter = ""
        this.on = false
      }
      return
    }
    const x = Math.abs(sx) < 0.03 ? 0 : Math.round(sx * 20) / 20
    const y = Math.abs(sy) < 0.03 ? 0 : Math.round(sy * 20) / 20
    if (!x && !y) {
      if (this.on) {
        this.el.style.filter = ""
        this.on = false
      }
      return
    }
    const v = `${x} ${y}`
    if (v !== this.last) {
      this.last = v
      const bx = (Math.abs(x) * 0.34).toFixed(2)
      const by = (Math.abs(y) * 0.34).toFixed(2)
      this.blur.setAttribute("stdDeviation", `${bx} ${by}`)
      const x1 = (x * 0.54).toFixed(2)
      const y1 = (y * 0.54).toFixed(2)
      const x2 = (x * 1.08).toFixed(2)
      const y2 = (y * 1.08).toFixed(2)
      this.offsets[0].setAttribute("dx", x1)
      this.offsets[0].setAttribute("dy", y1)
      this.offsets[1].setAttribute("dx", `${-Number(x1)}`)
      this.offsets[1].setAttribute("dy", `${-Number(y1)}`)
      this.offsets[2].setAttribute("dx", x2)
      this.offsets[2].setAttribute("dy", y2)
      this.offsets[3].setAttribute("dx", `${-Number(x2)}`)
      this.offsets[3].setAttribute("dy", `${-Number(y2)}`)
    }
    if (!this.on) {
      this.el.style.filter = `url(#${this.id})`
      this.on = true
    }
  }
  /** Blur from a 2D velocity vector (px/s) in the element's axes, preserving direction. */
  speed(vx: number, vy: number, scale = 1) {
    const v = Math.hypot(vx, vy)
    if (v < 6) {
      this.set(0, 0)
      return
    }
    const b = blurFor(v) / Math.max(0.2, scale)
    this.set((vx / v) * b, (vy / v) * b)
  }
}

/**
 * Squash and stretch for a round thing: it turns to face its velocity, stretches along it
 * (keeping its area) and blurs along it. `transform(vx, vy)` returns the transform to append
 * after its translate (and any scale of its own).
 */
export class Smear {
  private readonly blur: DirBlur
  private angle = 0
  constructor(el: HTMLElement | SVGElement) {
    this.blur = new DirBlur(el)
  }
  /** `scale` is any scale the element already has, so the blur reads the same on screen. */
  transform(vx: number, vy: number, scale = 1, radialSpeed = 0) {
    const speed = Math.hypot(vx, vy)
    const s = stretchFor(speed)
    if (speed > 1) this.angle = (Math.atan2(vy, vx) * 180) / Math.PI
    const sc = Math.max(0.2, scale)
    const rBlur = blurFor(radialSpeed, 2.5) / sc
    const vBlur = blurFor(speed) / (sc * s)
    this.blur.set(vBlur + rBlur, rBlur)
    if (s <= 1.001 && vBlur < 0.05) return ""
    // Round, so it can stay turned: its own x is the velocity, which is where the blur goes.
    return ` rotate(${this.angle.toFixed(2)}deg) scale(${s.toFixed(4)},${(1 / Math.sqrt(s)).toFixed(4)})`
  }
}

/**
 * The speed of something positioned by other means (a scrubbed playhead, a loop): fed its
 * position, it reads the velocity (refresh-rate independent) and lets it settle back to 0 on
 * the stage's loop once the feed pauses.
 */
export class Speed {
  readonly vx: Val
  readonly vy: Val
  private lx = Number.NaN
  private ly = 0
  private lt = 0
  constructor(stage: Stage) {
    this.vx = stage.val(0, 0.5)
    this.vy = stage.val(0, 0.5)
    for (const v of [this.vx, this.vy]) {
      v.spring.omega = FEEL.snappy.omega
      v.spring.zeta = 1
    }
  }
  feed(x: number, y: number, now = performance.now()) {
    if (Number.isNaN(this.lx)) {
      this.lx = x
      this.ly = y
      this.lt = now
      return
    }
    const dx = x - this.lx
    const dy = y - this.ly
    const dt = (now - this.lt) / 1000
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
      // Between 30 fps timeline ticks (< 42 ms), hold the velocity so 120 Hz frames don't flicker.
      if (dt < 0.042) {
        this.vx.spring.v = 0
        this.vy.spring.v = 0
      }
      return
    }
    if (dt < 0.002) return
    // After sitting idle (> 120 ms), measure the first step over one 60 Hz frame with a soft onset.
    const effDt = dt > 0.12 ? 1 / 45 : dt
    const mx = dx / effDt
    const my = dy / effDt
    const a = dt > 0.12 ? 0.55 : 1 - Math.exp(-effDt * 42)
    this.lx = x
    this.ly = y
    this.lt = now
    for (const [v, m] of [
      [this.vx, mx],
      [this.vy, my],
    ] as const) {
      v.spring.x += (m - v.spring.x) * a
      v.spring.v = 0
      v.spring.target = 0
      v.to(0, "snappy")
    }
  }
}

// ── Colour in OKLab ──────────────────────────────────────────────────────────────────────────

export function oklab(css: string): [number, number, number] {
  const c = parseColor(css)
  if (!c) return [0, 0, 0]
  const h = (c.h * Math.PI) / 180
  return [c.l, c.c * Math.cos(h), c.c * Math.sin(h)]
}
export const oklabCss = ([l, a, b]: readonly number[], alpha = 1) =>
  `oklab(${l!.toFixed(4)} ${a!.toFixed(4)} ${b!.toFixed(4)}${alpha < 1 ? ` / ${alpha.toFixed(3)}` : ""})`

/** OKLab to sRGB, 0–255 per channel, clipped. */
export function oklabRgb([L, a, b]: readonly number[]): [number, number, number] {
  const l = (L! + 0.3963377774 * a! + 0.2158037573 * b!) ** 3
  const m = (L! - 0.1055613458 * a! - 0.0638541728 * b!) ** 3
  const s = (L! - 0.0894841775 * a! - 1.291485548 * b!) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((c) => {
    const x = Math.min(1, Math.max(0, c))
    return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255)
  }) as [number, number, number]
}

/** A computed CSS colour (`rgb(…)` / `rgba(…)`) as 0–1 channels. */
export function rgbaOf(css: string): [number, number, number, number] {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  return [(n[0] ?? 0) / 255, (n[1] ?? 0) / 255, (n[2] ?? 0) / 255, n[3] ?? 1]
}

/** A colour on three springs in OKLab: it crossfades perceptually and can turn mid-way. */
export class ColorVal {
  readonly l: Val
  readonly a: Val
  readonly b: Val
  constructor(stage: Stage, css: string) {
    const [l, a, b] = oklab(css)
    this.l = stage.val(l, 0.0005)
    this.a = stage.val(a, 0.0003)
    this.b = stage.val(b, 0.0003)
  }
  go(css: string, how: How, feel: Feel = "default", delay = 0) {
    const [l, a, b] = oklab(css)
    this.l.go(l, how, feel, delay)
    this.a.go(a, how, feel, delay)
    this.b.go(b, how, feel, delay)
  }
  get lab(): [number, number, number] {
    return [this.l.x, this.a.x, this.b.x]
  }
  css(alpha = 1) {
    return oklabCss(this.lab, alpha)
  }
}

// ── Rolling captions ─────────────────────────────────────────────────────────────────────────

export type Part =
  | string
  | { readonly id: string; readonly decimals?: number; readonly pad?: number }
  | { readonly id: string; readonly text: true }

/**
 * A caption whose numbers roll and whose words roll glyph by glyph:
 * `const set = rolling(el, [{ id: "n" }, " × ", { id: "size" }, "px"]); set({ n: 4, size: 29 })`.
 */
export function rolling(el: HTMLElement, parts: readonly Part[]) {
  el.replaceChildren()
  const setters = new Map<string, (v: number | string) => void>()
  for (const part of parts) {
    if (typeof part === "string") {
      el.append(part)
      continue
    }
    const host = document.createElement("span")
    el.append(host)
    if ("text" in part) {
      let c: ReturnType<typeof createRollingText> | null = null
      setters.set(part.id, (v) => {
        if (!c)
          c = createRollingText(host, {
            text: String(v),
            transition: "direct",
            motionBlur: !reduced(),
            duration: 380,
          })
        else c.update({ text: String(v) })
      })
    } else {
      const d = part.decimals ?? 0
      const format = {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: false,
        ...(part.pad ? { minimumIntegerDigits: part.pad } : {}),
      }
      let c: ReturnType<typeof createRollingNumber> | null = null
      setters.set(part.id, (v) => {
        const value = Number(v)
        if (!c)
          c = createRollingNumber(host, { value, format, duration: 420, motionBlur: !reduced() })
        else c.update({ value })
      })
    }
  }
  return (values: Readonly<Record<string, number | string>>) => {
    for (const [id, v] of Object.entries(values)) setters.get(id)?.(v)
  }
}

// ── Swaps ────────────────────────────────────────────────────────────────────────────────────

/**
 * Content that changes by crossing over: what leaves softens (blur 3–4px, scale .96) a little
 * faster than what arrives blooms in from the same. Both stay mounted until they've finished.
 */
export class Swap {
  private layers: { el: HTMLElement; o: Val; leaving: boolean }[] = []
  constructor(
    private readonly stage: Stage,
    readonly host: HTMLElement,
  ) {
    host.style.position ||= "relative"
    stage.onDraw(() => this.draw())
  }
  show(content: Node, how: How) {
    for (const l of this.layers) {
      l.leaving = true
      l.o.go(0, how === "init" ? "init" : "other", "snappy")
    }
    const el = document.createElement("div")
    el.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;will-change:transform,opacity"
    el.append(content)
    this.host.append(el)
    const o = this.stage.val(how === "init" ? 1 : 0, 0.002, true)
    if (how !== "init") o.to(1, "default")
    this.layers.push({ el, o, leaving: false })
    this.draw()
  }
  private draw() {
    for (const l of [...this.layers]) {
      const o = Math.min(1, Math.max(0, l.o.x))
      if (l.leaving && o <= 0.001 && l.o.spring.resting) {
        l.el.remove()
        this.stage.drop(l.o)
        this.layers.splice(this.layers.indexOf(l), 1)
        continue
      }
      l.el.style.opacity = o.toFixed(3)
      const soft = !reduced() && (o < 0.999 || !l.o.spring.resting)
      const dy = (1 - o) * (l.leaving ? -4 : 4)
      l.el.style.transform = soft
        ? `translateY(${dy.toFixed(2)}px) scale(${(0.95 + 0.05 * o).toFixed(4)})`
        : ""
      const b = Math.min(4, (1 - o) * 3.2 + blurFor(Math.abs(l.o.v) * 90, 2))
      l.el.style.filter = soft && b >= 0.05 ? `blur(${b.toFixed(2)}px)` : ""
    }
  }
}
