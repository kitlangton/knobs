// The catalog's mini previews move on knobs' own springs (the panel's 480 Hz integrator) by
// duration and bounce, on one shared rAF loop that runs only while something visible is moving.
// A preview off screen takes new values at once and draws them once; continuous loops pause there.
// Changes by the user's own hand (drags, keys) follow on the panel's lead spring, as its fill does;
// presets, Random, Reset and undo travel on the calmer springs below. Reduced motion drops the
// travel and keeps a short fade on the values marked `fade`.
import { springMotion } from "knobs"
import { Spring } from "knobs/panel"

export type Feel = "follow" | "instant" | "snappy" | "default" | "calm" | "smooth" | "playful"

const FEEL: Record<Feel, { omega: number; zeta: number }> = {
  follow: { omega: 34, zeta: 0.86 },
  instant: springMotion({ duration: 0.1, bounce: 0 }),
  snappy: springMotion({ duration: 0.25, bounce: 0 }),
  default: springMotion({ duration: 0.3, bounce: 0 }),
  calm: springMotion({ duration: 0.4, bounce: 0 }),
  smooth: springMotion({ duration: 0.45, bounce: 0 }),
  playful: springMotion({ duration: 0.3, bounce: 0.3 }),
}

const FADE = springMotion({ duration: 0.18, bounce: 0 })

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
export const reduced = () => reducedQuery.matches

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
  get target() {
    return this.spring.target
  }
  /** Retargets, keeping position and velocity. */
  to(target: number, feel: Feel | { omega: number; zeta: number } = "default", delay = 0) {
    const f = this.fade && reduced() ? FADE : typeof feel === "string" ? FEEL[feel] : feel
    this.spring.omega = f.omega
    this.spring.zeta = f.zeta
    this.spring.set(target, delay)
    this.stage.kick()
    return this
  }
  snap(x: number) {
    this.spring.snap(x)
    this.stage.kick()
    return this
  }
  /** Gives the spring a push (px/s or units/s). */
  push(v: number) {
    this.spring.v += v
    this.stage.kick()
    return this
  }
}

const stages = new Set<Stage>()
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
const byEl = new WeakMap<Element, Stage>()

let raf = 0
let last = 0
function frame(now: number) {
  const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60
  last = now
  raf = 0
  for (const s of stages) if (s.active) s.step(dt, now)
  if ([...stages].some((s) => s.active)) raf = requestAnimationFrame(frame)
  else last = 0
}
function wake() {
  if (!raf) raf = requestAnimationFrame(frame)
}

/** A preview: its animated values, its loops and how it draws them. */
export class Stage {
  visible = false
  active = false
  private vals: Val[] = []
  private loops = new Set<(dt: number, now: number) => boolean>()
  constructor(
    readonly el: HTMLElement,
    private readonly draw: () => void = () => {},
  ) {
    stages.add(this)
    byEl.set(el, this)
    io.observe(el)
  }
  val(x: number, eps = 0.002, fade = false) {
    const v = new Val(this, x, eps, fade)
    this.vals.push(v)
    return v
  }
  /** A loop that runs each frame while visible, until it returns false. */
  loop(f: (dt: number, now: number) => boolean) {
    this.loops.add(f)
    this.kick()
    return () => {
      this.loops.delete(f)
    }
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
    this.active = true
    wake()
  }
  step(dt: number, now: number) {
    if (!this.visible) {
      this.active = false
      return
    }
    let moving = false
    for (const v of this.vals) {
      v.spring.step(dt)
      if (!v.spring.resting) moving = true
    }
    for (const f of this.loops) if (!f(dt, now)) this.loops.delete(f)
    this.draw()
    this.active = moving || this.loops.size > 0
  }
  /** Draws now (a value changed that isn't animated). */
  paint() {
    this.draw()
  }
}

/** The feel for a change from `onChange`: the user's hand follows, everything else travels. */
export const feelFor = (hand: boolean): Feel => (hand ? "follow" : "default")
