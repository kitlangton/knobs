import { describe, expect, it } from "vitest"
import { DieMotion, FACES, frontFace } from "../src/panel/die.js"
import {
  band,
  carryAt,
  carrySteps,
  GIVE,
  rubber,
  speedOf,
  stepBand,
  stretched,
  unrubber,
  type Band,
  type Steps,
} from "../src/panel/give.js"
import {
  heldAt,
  onAt,
  pushThumb,
  settleOn,
  SWITCH_GIVE,
  thumbEdges,
  type SwitchBox,
} from "../src/panel/thumb.js"

describe("the rubber band at an end", () => {
  it("gives 1:1 at first, less and less, and never reaches its most", () => {
    expect(rubber(0)).toBe(0)
    expect(rubber(0.5)).toBeCloseTo(0.46, 2)
    expect(rubber(6)).toBe(3)
    expect(rubber(60)).toBeLessThan(GIVE)
    expect(rubber(1e6)).toBeLessThan(GIVE)
    expect(rubber(-6)).toBe(-3)
    // Each px of push gives less than the one before.
    expect(rubber(20) - rubber(10)).toBeLessThan(rubber(10) - rubber(0))
  })

  it("unrubber undoes it", () => {
    for (const x of [0.3, 4, 12, 90, -7]) expect(unrubber(rubber(x))).toBeCloseTo(x, 6)
    expect(Number.isFinite(unrubber(GIVE))).toBe(true)
  })

  it("moves freely between the ends, and gives past them", () => {
    expect(band({ at: 50, give: 0 }, 20, 0, 100)).toEqual({ at: 70, give: 0 })
    const past = band({ at: 90, give: 0 }, 16, 0, 100)
    expect(past.at).toBe(100)
    expect(past.give).toBeCloseTo(rubber(6))
    const below = band({ at: 3, give: 0 }, -9, 0, 100)
    expect(below).toEqual({ at: 0, give: rubber(-6) })
  })

  it("pushing on in small moves stretches it as one long push would", () => {
    let b: Band = { at: 100, give: 0 }
    for (let i = 0; i < 40; i++) b = band(b, 1, 0, 100)
    expect(b.give).toBeCloseTo(rubber(40), 6)
  })

  it("turning back takes the give up 1:1, then moves on at once: nothing is banked", () => {
    const pushed = band({ at: 100, give: 0 }, 500, 0, 100)
    expect(pushed.give).toBeGreaterThan(5)
    const back = band(pushed, -2, 0, 100)
    expect(back).toEqual({ at: 100, give: pushed.give - 2 })
    const away = band(pushed, -20, 0, 100)
    expect(away.give).toBe(0)
    expect(away.at).toBeCloseTo(100 - (20 - pushed.give))
  })

  it("ticks once, as the give starts", () => {
    expect(stretched(0, 0.4)).toBe(true)
    expect(stretched(0.4, 1)).toBe(false)
    expect(stretched(0, 0)).toBe(false)
  })
})

describe("panning in whole steps", () => {
  const roomy = [50, 50] as const

  it("takes a step every `size` px, keeping what's left over", () => {
    expect(stepBand({ travel: 0, give: 0 }, 30, 12, roomy)).toEqual({
      next: { travel: 6, give: 0 },
      steps: 2,
    })
    expect(stepBand({ travel: 6, give: 0 }, 7, 12, roomy).steps).toBe(1)
    expect(stepBand({ travel: 0, give: 0 }, -25, 12, roomy)).toEqual({
      next: { travel: -1, give: 0 },
      steps: -2,
    })
  })

  it("small moves add up to the same steps", () => {
    let s: Steps = { travel: 0, give: 0 }
    let steps = 0
    for (let i = 0; i < 60; i++) {
      const r = stepBand(s, 1, 12, [50, 50 - steps])
      s = r.next
      steps += r.steps
    }
    expect(steps).toBe(5)
    expect(s.travel).toBe(0)
  })

  it("at an end, travel that way gives at once, and stops counting", () => {
    const r = stepBand({ travel: 0, give: 0 }, 30, 12, [5, 1])
    expect(r.steps).toBe(1)
    expect(r.next.travel).toBe(0)
    expect(r.next.give).toBeCloseTo(rubber(18))
    const stuck = stepBand({ travel: 0, give: 0 }, -4, 12, [0, 3])
    expect(stuck).toEqual({ next: { travel: 0, give: rubber(-4) }, steps: 0 })
  })

  it("turning back from the end unwinds the give first", () => {
    const pushed = stepBand({ travel: 0, give: 0 }, 40, 12, [3, 0]).next
    const r = stepBand(pushed, -(pushed.give + 12), 12, [3, 0])
    expect(r.next.give).toBe(0)
    expect(r.steps).toBe(-1)
  })
})

describe("a flick's carry", () => {
  it("reads the fingers' speed over their last moves", () => {
    const moves = [0, 8, 16, 24, 32].map((t) => ({ t, d: 8 }))
    expect(speedOf(moves)).toBeCloseTo(40 / 32)
    // Only the last 80 ms count.
    const slowThenFast = [
      { t: 0, d: 1 },
      { t: 200, d: 1 },
      { t: 300, d: 20 },
      { t: 316, d: 20 },
    ]
    expect(speedOf(slowThenFast)).toBeCloseTo(40 / 16)
    expect(speedOf([])).toBe(0)
  })

  it("a still hand carries nothing; a flick a few steps, slowing", () => {
    expect(carrySteps(0.1)).toBe(0)
    expect(carrySteps(-0.5)).toBe(1)
    expect(carrySteps(1)).toBe(2)
    expect(carrySteps(9)).toBe(3)
    expect(carryAt(0)).toBeGreaterThan(0)
    expect(carryAt(2) - carryAt(1)).toBeGreaterThan(carryAt(1) - carryAt(0))
  })
})

describe("a switch in hand", () => {
  // The default 32 × 18 switch: a 14 px thumb 2 px in, 14 px of travel, 4 px wider pressed.
  const box: SwitchBox = { travel: 14, size: 14, pad: 2, press: 4 }

  it("is pressed wide, from the side it was on", () => {
    expect(thumbEdges(box, { at: heldAt(box, false), give: 0 })).toEqual([2, 20])
    expect(thumbEdges(box, { at: heldAt(box, true), give: 0 })).toEqual([12, 30])
    expect(heldAt(box, "mixed")).toBe(5)
  })

  it("flips as it crosses the middle", () => {
    expect(onAt(box, 4.9)).toBe(false)
    expect(onAt(box, 5.1)).toBe(true)
    const off = { at: heldAt(box, false), give: 0 }
    expect(onAt(box, pushThumb(box, off, 4).at)).toBe(false)
    expect(onAt(box, pushThumb(box, off, 6).at)).toBe(true)
  })

  it("past an end its leading edge stretches, a little", () => {
    const pushed = pushThumb(box, { at: heldAt(box, true), give: 0 }, 40)
    expect(pushed.give).toBeGreaterThan(0)
    expect(pushed.give).toBeLessThan(SWITCH_GIVE)
    const [from, to] = thumbEdges(box, pushed)
    expect(from).toBe(12)
    expect(to).toBeCloseTo(30 + pushed.give)
    const [left] = thumbEdges(box, pushThumb(box, { at: 0, give: 0 }, -40))
    expect(left).toBeLessThan(2)
  })

  it("a flick decides by its direction; a still hand by where the thumb is", () => {
    expect(settleOn(box, 1, 0.5)).toBe(true)
    expect(settleOn(box, 9, -0.5)).toBe(false)
    expect(settleOn(box, 9, 0.05)).toBe(true)
    expect(settleOn(box, 1, 0)).toBe(false)
  })
})

describe("a die rolled along by a pan", () => {
  it("shows the face its turn brings to the front", () => {
    for (const f of FACES) expect(frontFace(f.front[0], f.front[1])).toBe(f.value)
  })

  it("turns a quarter sideways, onto a neighbouring face", () => {
    const die = new DieMotion()
    die.snapTo(5)
    const next = die.turn(1)
    expect(next).not.toBe(5)
    expect(next).not.toBe(2)
    expect(die.turn(-1)).toBe(5)
  })

  it("doesn't wind up under a fast scrub", () => {
    const die = new DieMotion()
    die.snapTo(5)
    for (let i = 0; i < 20; i++) die.turn(1)
    expect(die.ry.target - die.ry.x).toBeLessThanOrEqual(270)
  })
})
