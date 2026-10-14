import { describe, expect, it } from "vitest"
import { createSwipe, GESTURE_GAP, sideways } from "../src/panel/swipe.js"

type Wheel = { dx?: number; dy?: number; shift?: boolean; t: number }
const event = ({ dx = 0, dy = 0, shift = false, t }: Wheel) => ({
  deltaX: dx,
  deltaY: dy,
  deltaMode: 0,
  shiftKey: shift,
  timeStamp: t,
})
/** A trackpad flick: deltas rise, then momentum fades out every 16 ms. */
const flick = (start: number, sign = 1, peak = 40) => {
  const out: Wheel[] = []
  const rise = [4, 12, 26, peak]
  const fall = Array.from({ length: 50 }, (_, i) => Math.max(1, Math.round(peak * 0.9 ** (i + 1))))
  ;[...rise, ...fall].forEach((d, i) => out.push({ dx: d * sign, t: start + i * 16 }))
  return out
}
const steps = (events: Wheel[]) => {
  const swipe = createSwipe()
  return events.map((e) => swipe.feed(event(e)).step).filter(Boolean)
}

describe("swipes", () => {
  it("one flick with its momentum tail is one step", () => {
    expect(steps(flick(0))).toEqual([1])
    expect(steps(flick(0, -1))).toEqual([-1])
  })

  it("a second flick steps again, during the first one's momentum or after a pause", () => {
    const first = flick(0)
    // Interrupts the tail 300 ms in, while momentum still trickles.
    const during = [...first.filter((e) => e.t < 300), ...flick(300)]
    expect(steps(during)).toEqual([1, 1])
    expect(steps([...first, ...flick(first.at(-1)!.t + GESTURE_GAP + 50)])).toEqual([1, 1])
  })

  it("a small nudge below the threshold doesn't step; reversing restarts the count", () => {
    expect(
      steps([
        { dx: 10, t: 0 },
        { dx: 10, t: 16 },
      ]),
    ).toEqual([])
    expect(
      steps([
        { dx: 20, t: 0 },
        { dx: -20, t: 16 },
        { dx: -20, t: 32 },
      ]),
    ).toEqual([-1])
  })

  it("vertical scrolling passes through; ⇧ + wheel notches step one each", () => {
    const swipe = createSwipe()
    expect(swipe.feed(event({ dx: 3, dy: 40, t: 0 }))).toEqual({ step: 0, claimed: false })
    expect(sideways(event({ dy: 100, shift: true, t: 0 }))).toBe(100)
    expect(
      steps([
        { dy: 100, shift: true, t: 0 },
        { dy: 100, shift: true, t: 40 },
        { dy: -100, shift: true, t: 80 },
      ]),
    ).toEqual([1, 1, -1])
  })
})
