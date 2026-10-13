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
