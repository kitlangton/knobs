import { describe, expect, test } from "vitest"
import {
  boxesMeet,
  boxUnion,
  pillBoxOf,
  pillProgress,
  pillRadius,
  pillSpring,
  planPill,
} from "../src/ui/selection-pill"

const box = (x: number, y: number, w = 60, h = 28) => ({ x, y, w, h })

describe("selection pill geometry", () => {
  test("a row's box in its container: client rects, the border and the scroll", () => {
    const b = pillBoxOf(
      { left: 130, top: 260, width: 80, height: 28 },
      {
        left: 100,
        top: 200,
        scrollLeft: 0,
        scrollTop: 400,
        clientLeft: 1,
        clientTop: 1,
      },
    )
    expect(b).toEqual({ x: 29, y: 459, w: 80, h: 28 })
  })
  test("the state spring, 1.4× as long past 400 px", () => {
    expect(pillSpring(120)).toEqual({ duration: 0.3, bounce: 0 })
    expect(pillSpring(400)).toEqual({ duration: 0.3, bounce: 0 })
    expect(pillSpring(401).duration).toBeCloseTo(0.42, 9)
    expect(pillSpring(401).bounce).toBe(0)
  })
  test("progress along the trip, clamped, 1 with no trip", () => {
    expect(pillProgress(box(0, 0), box(100, 0), box(25, 0))).toBeCloseTo(0.25, 9)
    expect(pillProgress(box(0, 0), box(0, 200), box(0, 300))).toBe(1)
    expect(pillProgress(box(10, 10), box(10, 10), box(10, 10))).toBe(1)
  })
  test("the radius follows the height between rows of different heights", () => {
    const from = { h: 32, r: 8 }
    const to = { h: 20, r: 4 }
    expect(pillRadius(from, to, 32, 0.9)).toBe(8)
    expect(pillRadius(from, to, 26, 0.1)).toBeCloseTo(6, 9)
    expect(pillRadius(from, to, 20, 0)).toBe(4)
    // Same height: it goes with the trip.
    expect(pillRadius({ h: 28, r: 8 }, { h: 28, r: 14 }, 28, 0.5)).toBeCloseTo(11, 9)
  })
  test("overlap and union, for the rows the copy holds", () => {
    expect(boxesMeet(box(0, 0), box(59, 0))).toBe(true)
    expect(boxesMeet(box(0, 0), box(60, 0))).toBe(false)
    expect(boxUnion(box(0, 0), box(100, 40))).toEqual({
      x: 0,
      y: 0,
      w: 160,
      h: 68,
    })
  })
})

describe("selection pill states", () => {
  const shown = { shown: true, at: box(0, 0), target: box(0, 0) }
  test("first paint lands, never travels", () => {
    expect(
      planPill({ shown: false, at: null, target: null }, box(80, 0), {
        first: true,
      }),
    ).toEqual({ kind: "land", box: box(80, 0) })
  })
  test("a new row: it travels from where it is on the spring for the distance", () => {
    const p = planPill(shown, box(80, 0))
    expect(p).toEqual({
      kind: "travel",
      box: box(80, 0),
      spring: { duration: 0.3, bounce: 0 },
    })
    const far = planPill(shown, box(0, 600))
    expect(far.kind === "travel" && far.spring.duration).toBeCloseTo(0.42, 9)
  })
  test("travels on the spring it's given (snappy for chapters and the rail)", () => {
    const snappy = { duration: 0.25, bounce: 0 }
    const p = planPill(shown, box(80, 0), { spring: snappy })
    expect(p.kind === "travel" && p.spring).toEqual(snappy)
    const far = planPill(shown, box(0, 600), { spring: snappy })
    expect(far.kind === "travel" && far.spring.duration).toBeCloseTo(0.35, 9)
  })
  test("mid-trip, the distance is from where it is now, not where it set out", () => {
    const mid = { shown: true, at: box(390, 0), target: box(400, 0) }
    const p = planPill(mid, box(0, 0))
    expect(p.kind === "travel" && p.spring.duration).toBe(0.3)
  })
  test("nothing selected fades it out in place", () => {
    expect(planPill(shown, null)).toEqual({ kind: "hide" })
  })
  test("after a fade-out the next selection lands rather than travelling from a stale place", () => {
    const hidden = { shown: false, at: null, target: box(0, 0) }
    expect(planPill(hidden, box(300, 0)).kind).toBe("land")
  })
  test("reduced motion and snap land on the row", () => {
    expect(planPill(shown, box(80, 0), { reduced: true }).kind).toBe("land")
    expect(planPill(shown, box(80, 0), { snap: true }).kind).toBe("land")
  })
  test("the same row again stays", () => {
    expect(planPill(shown, box(0, 0))).toEqual({ kind: "stay" })
  })
})
