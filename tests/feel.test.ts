import { describe, expect, it } from "vitest"
import {
  DETENTS,
  detentScale,
  detentsOf,
  Notches,
  offRow,
  precisionDepth,
  precisionRate,
  roundValues,
  rulerAlpha,
  rulerDepth,
  rulerLevels,
  unwarp,
  warp,
  type Detent,
} from "../src/panel/feel.js"
import { band, rubber, STRETCH, type Band } from "../src/panel/give.js"

describe("precision by distance", () => {
  it("moves 1:1 near the row, then halves in smooth steps further off", () => {
    expect(precisionRate(0)).toBe(1)
    expect(precisionRate(24)).toBe(1)
    expect(precisionRate(60)).toBeCloseTo(1 / 2, 6)
    expect(precisionRate(110)).toBeCloseTo(1 / 4, 6)
    expect(precisionRate(200)).toBeCloseTo(1 / 8, 6)
    expect(precisionRate(-60)).toBeCloseTo(1 / 2, 6)
  })

  it("never jumps: each px further off slows it a little, never speeds it up", () => {
    let last = precisionRate(0)
    for (let y = 0.5; y <= 200; y += 0.5) {
      const r = precisionRate(y)
      expect(r).toBeLessThanOrEqual(last)
      expect(last - r).toBeLessThan(0.02)
      last = r
    }
    expect(precisionDepth(1000)).toBe(3)
  })

  it("measures from the row's edges, not its middle", () => {
    expect(offRow(110, 100, 132)).toBe(0)
    expect(offRow(80, 100, 132)).toBe(20)
    expect(offRow(172, 100, 132)).toBe(40)
  })

  it("changing the rate mid-drag keeps the value where it is", () => {
    // The value integrates the hand's travel at the rate of each move.
    let at = 100
    const moves: [number, number][] = [
      [10, 0],
      [10, 70],
      [10, 160],
      [-10, 0],
    ]
    const seen: number[] = []
    for (const [dx, off] of moves) {
      at += dx * precisionRate(off)
      seen.push(at)
    }
    expect(seen[0]).toBe(110)
    expect(seen[1]).toBeCloseTo(115, 6)
    expect(seen[2]).toBeCloseTo(115 + 10 / 8, 6)
    expect(seen[3]).toBeCloseTo(seen[2]! - 10, 6)
  })

  it("the ruler grows a level each halving, never finer than the slider's steps", () => {
    expect(rulerLevels(10)).toBe(0)
    expect(rulerLevels(20)).toBe(1)
    expect(rulerLevels(100)).toBe(3)
    expect(rulerDepth(1, 3)).toBe(0)
    expect(rulerDepth(1 / 4, 3)).toBeCloseTo(2, 6)
    expect(rulerDepth(1 / 40, 3)).toBe(3)
    expect(rulerDepth(1 / 8, 1)).toBe(1)
    expect(rulerAlpha(1.5, 1)).toBe(1)
    expect(rulerAlpha(1.5, 2)).toBeCloseTo(0.5, 6)
    expect(rulerAlpha(1.5, 3)).toBe(0)
  })
})

describe("magnetic detents", () => {
  const def: Detent = { at: 100, value: 50, kind: "default" }
  const { hold, ramp } = DETENTS.default

  it("holds the value within the hold, the hand's own position well away", () => {
    expect(warp(100, [def])).toBe(100)
    expect(warp(100 + hold, [def])).toBe(100)
    expect(warp(100 - hold, [def])).toBe(100)
    expect(warp(100 + hold + ramp, [def])).toBe(100 + hold + ramp)
    expect(warp(150, [def])).toBe(150)
    expect(warp(30, [def])).toBe(30)
  })

  it("pushing slowly through is continuous and never goes backwards: a notch, not a stutter", () => {
    let last = -Infinity
    for (let x = 80; x <= 120; x += 0.05) {
      const s = warp(x, [def])
      expect(s).toBeGreaterThanOrEqual(last)
      if (last > -Infinity) expect(s - last).toBeLessThan(0.05 * ((hold + ramp) / ramp) + 1e-9)
      last = s
    }
  })

  it("weakens as the drag slows, so a fine move can sit right beside it", () => {
    const k = detentScale(1 / 8)
    expect(k).toBeLessThan(1 / 8)
    expect(warp(101, [def])).toBe(100)
    expect(warp(101, [def], k)).toBe(101)
    expect(detentScale(1)).toBe(1)
  })

  it("unwarp undoes warp, keeping the value when the strength changes", () => {
    for (const x of [90, 95, 97, 103, 106, 109.9, 130]) {
      for (const [a, b] of [
        [1, 0.2],
        [0.2, 1],
        [1, 1],
      ] as const) {
        const shown = warp(x, [def], a)
        const x2 = unwarp(shown, x, [def], b)
        expect(warp(x2, [def], b)).toBeCloseTo(shown, 9)
      }
    }
    // On the detent, the hand stays as close to where it was as the new hold allows.
    expect(unwarp(100, 103, [def], 0.25)).toBeCloseTo(101)
  })

  it("lists the default, then the base, then round values, never crowded", () => {
    const list = detentsOf(200, 0, 100, { value: 20, base: 60, round: roundValues(0, 100) })
    expect(list.map((d) => [d.kind, d.value])).toEqual([
      ["default", 20],
      ["base", 60],
      ["round", 50],
    ])
    // A base on the default, or a round value right beside one, is left out.
    const crowded = detentsOf(200, 0, 100, { value: 50, base: 50, round: [51] })
    expect(crowded.map((d) => d.kind)).toEqual(["default"])
    expect(roundValues(-1, 1)).toEqual([0])
    expect(roundValues(-2, 6)).toEqual([0, 2])
  })

  it("ticks once as it catches, and again only after the hand has left it", () => {
    const n = new Notches([def], 60)
    expect(n.move(90).caught).toBeUndefined()
    expect(n.move(97).caught).toBe(def)
    expect(n.held).toBe(0)
    expect(n.move(99).caught).toBeUndefined()
    // Wobbling on the edge of the hold doesn't chatter.
    expect(n.move(104.5).caught).toBeUndefined()
    expect(n.move(103).caught).toBeUndefined()
    expect(n.move(120).caught).toBeUndefined()
    expect(n.held).toBe(-1)
    expect(n.move(102).caught).toBe(def)
  })

  it("a drag that starts on a detent doesn't tick as it leaves", () => {
    const n = new Notches([def], 100)
    expect(n.held).toBe(0)
    expect(n.move(102).caught).toBeUndefined()
    expect(n.move(130).caught).toBeUndefined()
  })
})

describe("the rubber band at a slider's end", () => {
  it("gives up to STRETCH px, decaying, the same for a drag as a pan", () => {
    expect(rubber(STRETCH, STRETCH)).toBe(STRETCH / 2)
    expect(rubber(1e6, STRETCH)).toBeLessThan(STRETCH)
    let b: Band = { at: 200, give: 0 }
    for (let i = 0; i < 30; i++) b = band(b, 2, 0, 200, STRETCH)
    expect(b.at).toBe(200)
    expect(b.give).toBeCloseTo(rubber(60, STRETCH), 6)
  })
})
