import { describe, expect, it } from "vitest"
import { CURVE_SHAPES } from "../src/core/ramp.js"
import { curveSmear, matchPoints, RampMorph, resample, sampleAt } from "../src/panel/ramp-morph.js"

const shape = (name: keyof typeof CURVE_SHAPES) => CURVE_SHAPES[name]

describe("pairing a curve's points across a change", () => {
  it("keeps the ends the ends and pairs the same number in order", () => {
    const plan = matchPoints(shape("smoothstep"), shape("bell"))
    expect(plan.from).toEqual([0, 1, 2, 3, 4])
    expect(plan.merges).toEqual([])
  })

  it("buds a new point between the ends of a straight line", () => {
    const plan = matchPoints(shape("linear"), shape("ease-out"))
    expect(plan.from).toEqual([0, -1, 1])
    expect(plan.merges).toEqual([])
  })

  it("merges a point left over into its nearest neighbour's new self", () => {
    const plan = matchPoints(shape("ease-out"), shape("linear"))
    expect(plan.from).toEqual([0, 2])
    // (0.35, 0.62) is a little nearer the start at (0, 0) than the end at (1, 1).
    expect(plan.merges).toEqual([{ old: 1, into: 0 }])
  })

  it("pairs as many as both have, by order, even when they travel far", () => {
    const plan = matchPoints(shape("inverse²"), shape("smoothstep"))
    expect(plan.from).toEqual([0, 1, 2, 3, 4])
    expect(plan.merges).toEqual([])
  })

  it("picks the nearest by position among the surplus", () => {
    // ease-out's (0.35, 0.62) pairs with inverse²'s (0.25, 0.47), the nearest of its three.
    const plan = matchPoints(shape("inverse²"), shape("ease-out"))
    expect(plan.from).toEqual([0, 2, 4])
    // (0.1, 0.85) into the start beside it, (0.5, 0.15) into the point that stayed.
    expect(plan.merges).toEqual([
      { old: 1, into: 0 },
      { old: 3, into: 1 },
    ])
    expect(matchPoints(shape("bell"), shape("ease-out")).from).toEqual([0, 1, 4])
  })

  it("merges every inner point when the new shape has only ends", () => {
    const plan = matchPoints(shape("bell"), shape("linear"))
    expect(plan.from).toEqual([0, 4])
    expect(plan.merges.map((m) => m.old)).toEqual([1, 2, 3])
    // Each into the nearer end (the middle one, as near to both, into the first).
    expect(plan.merges.map((m) => m.into)).toEqual([0, 0, 1])
  })

  it("handles empty and one-point lists", () => {
    expect(matchPoints([], shape("linear")).from).toEqual([-1, -1])
    expect(matchPoints(shape("linear"), []).merges).toEqual([
      { old: 0, into: -1 },
      { old: 1, into: -1 },
    ])
    expect(matchPoints([{ x: 0.5, y: 0 }], shape("ease-out")).from).toEqual([0, -1, -1])
  })
})

describe("resampling a line", () => {
  it("keeps a line of the same count", () => {
    expect(resample([0, 0, 1, 1], 2, 2)).toEqual([0, 0, 1, 1])
  })

  it("spreads samples evenly along the index, keeping both ends", () => {
    expect(resample([0, 0, 1, 2], 2, 3)).toEqual([0, 0, 0.5, 1, 1, 2])
    const down = resample([0, 10, 20, 30, 40], 1, 3)
    expect(down).toEqual([0, 20, 40])
  })

  it("fills from a single sample, and zeros from none", () => {
    expect(resample([3, 4], 2, 1)).toEqual([3, 4])
    expect(resample([3, 4], 2, 3)).toEqual([3, 4, 3, 4, 3, 4])
    expect(resample([], 2, 2)).toEqual([0, 0, 0, 0])
  })

  it("reads y at x along a polyline, holding the ends", () => {
    const line = [0, 0, 0.5, 1, 1, 0]
    expect(sampleAt(line, 0.25)).toBeCloseTo(0.5)
    expect(sampleAt(line, 0.75)).toBeCloseTo(0.5)
    expect(sampleAt(line, -1)).toBe(0)
    expect(sampleAt(line, 2)).toBe(0)
  })
})

describe("the ramp's morph", () => {
  const flat = (pts: readonly { x: number; y: number }[]) => pts.map((p) => [p.x, p.y])
  const run = (m: RampMorph, from: number, ms: number) => {
    for (let t = from; t <= from + ms; t += 16) m.step(t)
  }

  it("starts at rest where it's first put", () => {
    const m = new RampMorph(2, 2)
    m.set([0, 0, 1, 1], flat(shape("linear")), { now: 0 })
    expect(m.moving).toBe(false)
    expect(m.live.map((d) => d.at)).toEqual([
      [0, 0, 1],
      [1, 1, 1],
    ])
  })

  it("travels the ends, buds a new point from the line, and settles", () => {
    const m = new RampMorph(2, 2, undefined, (to, s) => [to[0]!, sampleAt(s, to[0]!)])
    m.set([0, 0, 1, 1], flat(shape("linear")), { now: 0 })
    const ends = m.live.map((d) => d.id)
    m.set([0, 0, 0.5, 0.9, 1, 1], flat(shape("ease-out")), { now: 0 })
    expect(m.live.map((d) => d.id).filter((id) => ends.includes(id))).toEqual(ends)
    const bud = m.live[1]!
    // On the old line under it, with no size yet.
    expect(bud.at[0]).toBeCloseTo(0.35)
    expect(bud.at[1]).toBeCloseTo(0.35)
    expect(bud.at[2]).toBe(0)
    run(m, 16, 120)
    expect(bud.at[2]).toBeGreaterThan(0.3)
    expect(bud.at[2]).toBeLessThan(1)
    run(m, 150, 1500)
    expect(m.moving).toBe(false)
    expect(bud.at).toEqual([0.35, 0.62, 1])
    expect(m.samples).toEqual([0, 0, 0.5, 0.9, 1, 1])
  })

  it("shrinks a merging point into its neighbour within about 220 ms", () => {
    const m = new RampMorph(2, 2)
    m.set([0, 0, 1, 1], flat(shape("ease-out")), { now: 0 })
    m.set([0, 0, 1, 1], flat(shape("linear")), { now: 0 })
    expect(m.gone).toHaveLength(1)
    run(m, 16, 230)
    expect(m.gone).toHaveLength(0)
  })

  it("keeps each number's speed when retargeted mid-flight", () => {
    const m = new RampMorph(1, 2)
    m.set([0], flat(shape("linear")), { now: 0 })
    m.set([1], flat(shape("linear")), { now: 0 })
    run(m, 16, 80)
    const at = m.samples[0]!
    m.set([0], flat(shape("linear")), { now: 100 })
    m.step(116)
    // Still heading up for a moment: no snap back.
    expect(m.samples[0]!).toBeGreaterThan(at)
  })

  it("holds its motion through a delay, and snaps when told", () => {
    const m = new RampMorph(1, 2)
    m.set([0], flat(shape("linear")), { now: 0 })
    m.set([1], flat(shape("linear")), { now: 0, delay: 100 })
    m.step(50)
    expect(m.samples[0]).toBe(0)
    m.step(120)
    m.step(140)
    expect(m.samples[0]!).toBeGreaterThan(0)
    m.set([0.5], flat(shape("bell")), { now: 150, instant: true })
    expect(m.moving).toBe(false)
    expect(m.samples).toEqual([0.5])
    expect(m.live).toHaveLength(5)
    expect(m.gone).toHaveLength(0)
  })

  it("is exactly still at rest, so nothing smears", () => {
    const m = new RampMorph(2, 2)
    m.set([0, 0, 1, 1], flat(shape("linear")), { now: 0 })
    expect(m.sampleSpeed(200, 100)).toBe(0)
    expect(curveSmear(0, 1)).toBe(0)
    expect(curveSmear(20, 1)).toBe(0)
    expect(curveSmear(600, 0.5)).toBeCloseTo(2.4)
    expect(curveSmear(1e5, 1)).toBe(6)
  })
})
