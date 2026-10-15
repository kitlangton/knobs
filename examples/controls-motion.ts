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

/** Px of blur per px/s of speed, and its cap ("only like three or four pixels"). */
const BLUR_K = 1 / 220
const BLUR_MAX = 4
const STRETCH_K = 1 / 4000
const STRETCH_MAX = 0.26

/** A speed (px/s) as a blur's standard deviation (px): 0 at rest and under reduced motion. */
export function blurFor(speed: number, max = BLUR_MAX) {
  if (reduced()) return 0
  const b = Math.min(max, Math.abs(speed) * BLUR_K)
  return b < 0.08 ? 0 : b
}
/** A speed (px/s) as a stretch along the motion (1 at rest). */
export function stretchFor(speed: number, max = STRETCH_MAX) {
  if (reduced()) return 1
  return 1 + Math.min(max, Math.abs(speed) * STRETCH_K)
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
 * A directional blur on one element, in its own axes (a rotated element blurs along its
 * rotation). The filter is attached only while there's blur to show.
 */
export class DirBlur {
  private readonly blur: SVGFEGaussianBlurElement
  private readonly id = `catalog-blur-${++filterIds}`
  private on = false
  private last = ""
  constructor(readonly el: HTMLElement | SVGElement) {
    const filter = document.createElementNS(SVG, "filter")
    filter.id = this.id
    for (const [k, v] of [
      ["x", "-60%"],
      ["y", "-60%"],
      ["width", "220%"],
      ["height", "220%"],
      ["color-interpolation-filters", "sRGB"],
    ])
      filter.setAttribute(k!, v!)
    this.blur = document.createElementNS(SVG, "feGaussianBlur")
    filter.append(this.blur)
    filterDefs().append(filter)
  }
  /** Standard deviations (px) along the element's x and y; both 0 takes the filter off. */
  set(sx: number, sy: number) {
    const x = sx < 0.08 ? 0 : Math.round(sx * 20) / 20
    const y = sy < 0.08 ? 0 : Math.round(sy * 20) / 20
    if (!x && !y) {
      if (this.on) {
        this.el.style.filter = ""
        this.on = false
      }
      return
    }
    const v = `${x} ${y}`
    if (v !== this.last) {
      this.blur.setAttribute("stdDeviation", v)
      this.last = v
    }
    if (!this.on) {
      this.el.style.filter = `url(#${this.id})`
      this.on = true
    }
  }
  /** Blur from a velocity (px/s) in the element's axes. */
  speed(vx: number, vy: number) {
    this.set(blurFor(vx), blurFor(vy))
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
  transform(vx: number, vy: number, scale = 1) {
    const speed = Math.hypot(vx, vy)
    const s = stretchFor(speed)
    if (speed > 1) this.angle = (Math.atan2(vy, vx) * 180) / Math.PI
    this.blur.set(blurFor(speed) / Math.max(0.2, scale), 0)
    if (s === 1) return ""
    // Round, so it can stay turned: its own x is the velocity, which is where the blur goes.
    return ` rotate(${this.angle.toFixed(2)}deg) scale(${s.toFixed(4)},${(1 / Math.sqrt(s)).toFixed(4)})`
  }
}

/**
 * The speed of something positioned by other means (a scrubbed playhead, a loop): fed its
 * position, it reads the velocity and lets it settle back to 0 once the feed stops.
 */
export class Speed {
  readonly vx: Val
  readonly vy: Val
  private lx = Number.NaN
  private ly = 0
  private lt = 0
  constructor(stage: Stage) {
    this.vx = stage.val(0, 1)
    this.vy = stage.val(0, 1)
    for (const v of [this.vx, this.vy]) {
      v.spring.omega = FEEL.snappy.omega
      v.spring.zeta = 1
    }
  }
  feed(x: number, y: number, now = performance.now()) {
    const dt = (now - this.lt) / 1000
    if (Number.isNaN(this.lx) || dt > 0.25) {
      this.lx = x
      this.ly = y
      this.lt = now
      return
    }
    if (dt < 0.004) return
    const mx = (x - this.lx) / dt
    const my = (y - this.ly) / dt
    this.lx = x
    this.ly = y
    this.lt = now
    for (const [v, m] of [
      [this.vx, mx],
      [this.vy, my],
    ] as const) {
      v.spring.x += (m - v.spring.x) * 0.5
      v.spring.v = 0
      v.spring.target = 0
    }
    this.vx.to(0, "snappy")
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
            motionBlur: true,
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
        if (!c) c = createRollingNumber(host, { value, format, duration: 420, motionBlur: true })
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
 * Content that changes by crossing over: what leaves softens (blur 3px, scale .96) a little
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
      const soft = !reduced() && o < 0.999
      l.el.style.transform = soft ? `scale(${(0.96 + 0.04 * o).toFixed(4)})` : ""
      l.el.style.filter = soft ? `blur(${((1 - o) * 3).toFixed(2)}px)` : ""
    }
  }
}
