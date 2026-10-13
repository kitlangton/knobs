// Springs are integrated in fixed 480 Hz substeps so motion is identical at 60 and 120 Hz,
// and they carry velocity across retargets so every gesture is interruptible.
export class Spring {
  v = 0
  target: number
  constructor(
    public x: number,
    public omega = 24,
    public zeta = 0.86,
  ) {
    this.target = x
  }
  set(target: number) {
    this.target = target
    return this
  }
  snap(x: number) {
    this.x = this.target = x
    this.v = 0
    return this
  }
  step(dt: number) {
    if (this.x === this.target && this.v === 0) return this.x
    const clampedDt = Math.min(dt, 0.1)
    const h = 1 / 480
    for (let t = 0; t < clampedDt; t += h) {
      const k = Math.min(h, clampedDt - t)
      const a =
        -this.omega * this.omega * (this.x - this.target) - 2 * this.zeta * this.omega * this.v
      this.v += a * k
      this.x += this.v * k
    }
    if (this.resting) {
      this.x = this.target
      this.v = 0
    }
    return this.x
  }
  get resting() {
    return Math.abs(this.x - this.target) < 0.005 && Math.abs(this.v) < 0.02
  }
}

export class VelocityTracker {
  private samples: { t: number; x: number; y: number }[] = []
  add(x: number, y: number, t = performance.now()) {
    this.samples.push({ t, x, y })
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift()
  }
  reset() {
    this.samples = []
  }
  get velocity(): [number, number] {
    const s = this.samples
    if (s.length < 2) return [0, 0]
    const a = s[0]!,
      b = s[s.length - 1]!
    const dt = (b.t - a.t) / 1000
    if (dt <= 0 || performance.now() - b.t > 60) return [0, 0]
    return [(b.x - a.x) / dt, (b.y - a.y) / dt]
  }
}

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/**
 * Time-based critically damped motion, the same curve @kitlangton/rolling-number samples for
 * its reels: settles in `duration`, carries velocity across retargets, and never overshoots.
 */
export class Roll {
  private from: number
  private to = 0
  private inherited = 0
  private start = 0
  private duration = 0
  constructor(position: number) {
    this.from = this.to = position
  }
  get target() {
    return this.to
  }
  sample(now: number): { position: number; velocity: number } {
    const t = now - this.start
    if (this.duration <= 0 || t >= this.duration) return { position: this.to, velocity: 0 }
    if (t <= 0) return { position: this.from, velocity: 0 }
    const seconds = this.duration / 1000
    const tau = t / this.duration
    const d = this.from - this.to
    const e = Math.exp(-10 * tau)
    return {
      position: this.to + (d + (this.inherited + 10 * d) * tau) * e,
      velocity: (e * (this.inherited - 10 * (this.inherited + 10 * d) * tau)) / seconds,
    }
  }
  /** Retarget from wherever the motion is now; `delay` holds the current position first. */
  set(target: number, duration: number, now: number, delay = 0) {
    const { position, velocity } = this.sample(now)
    if (duration <= 0) return this.snap(target)
    const seconds = duration / 1000
    const distance = position - target
    // Bound inherited energy after huge updates, as the library does.
    const limit = (Math.max(Math.abs(distance), 1) * 12) / seconds
    this.inherited = clamp(delay > 0 ? 0 : velocity, -limit, limit) * seconds
    this.from = position
    this.to = target
    this.start = now + delay
    this.duration = duration
    return this
  }
  snap(position: number) {
    this.from = this.to = position
    this.duration = 0
    this.inherited = 0
    return this
  }
  resting(now: number) {
    return this.duration <= 0 || now - this.start >= this.duration
  }
}

/** Nearest wheel position showing `digit`, honoring the trend (from rolling-number). */
export function rollTarget(position: number, digit: number, trend: number): number {
  let target = Math.floor(position / 10) * 10 + digit
  if (trend > 0 && target < position - 0.001) target += 10
  else if (trend < 0 && target > position + 0.001) target -= 10
  else if (trend === 0) target += Math.round((position - target) / 10) * 10
  return target
}

export const numeral = (position: number) => String(((position % 10) + 10) % 10)

/** New glyphs hold briefly, then rise into their slot (rolling-number's `entrance`). Returns 0..1 of a face height. */
export function entranceOffset(elapsed: number, duration: number, hold = 0.14): number {
  if (duration <= 0 || elapsed >= duration) return 0
  const p = clamp((elapsed / duration - hold) / (1 - hold), 0, 1)
  return (1 + 10 * p) * Math.exp(-10 * p)
}
