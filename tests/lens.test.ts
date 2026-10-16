import { describe, expect, it } from "vitest"
import { flashAt, Glide, LENS_DEFAULTS, omegaOf, readLensTune } from "../src/panel/lens.js"

describe("the lens's glide", () => {
  it("settles an offset to zero within its duration, without overshoot", () => {
    const g = new Glide([omegaOf(340)])
    g.set([100], [0], 0)
    let prev = 100
    for (let t = 0; t <= 600; t += 10) {
      const x = g.sample(t).x[0]!
      expect(x).toBeGreaterThanOrEqual(-1e-9)
      expect(x).toBeLessThanOrEqual(prev + 1e-9)
      prev = x
    }
    expect(g.sample(340).x[0]!).toBeLessThan(5)
    expect(g.resting(700)).toBe(true)
  })
  it("keeps position and speed across a retarget", () => {
    const g = new Glide([omegaOf(340)])
    g.set([100], [0], 0)
    const mid = g.sample(80)
    // The target moved 40 px further: the offset grows by that, the speed carries on.
    g.set([mid.x[0]! + 40], [mid.v[0]!], 80)
    const after = g.sample(80)
    expect(after.x[0]).toBeCloseTo(mid.x[0]! + 40, 6)
    expect(after.v[0]).toBeCloseTo(mid.v[0]!, 6)
  })
})

describe("a scoped action's light", () => {
  it("comes up at once and fades over its time", () => {
    expect(flashAt(-1, 500)).toBe(0)
    expect(flashAt(40, 500)).toBeCloseTo(1)
    expect(flashAt(270, 500)).toBeGreaterThan(0)
    expect(flashAt(270, 500)).toBeLessThan(1)
    expect(flashAt(500, 500)).toBe(0)
  })
})

describe("the lens's tokens", () => {
  it("reads --k-lens-* and keeps defaults for what's unset", () => {
    const vars: Record<string, string> = { "--k-lens-ms": "200", "--k-lens-inset": "3px" }
    const tune = readLensTune({
      getPropertyValue: (n: string) => vars[n] ?? "",
    } as CSSStyleDeclaration)
    expect(tune.ms).toBe(200)
    expect(tune.inset).toBe(3)
    expect(tune.wash).toBe(LENS_DEFAULTS.wash)
  })
})
