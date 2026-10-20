import { describe, expect, test } from "vitest"
import { inTriangle, matchItem, safeTriangle, stepItem } from "../src/ui/overlay-model"
import {
  adjacentMarker,
  advance,
  CATCH_UP,
  chapterBounds,
  clampView,
  currentMarker,
  followView,
  frameTime,
  magnet,
  minutes,
  moveHead,
  rulerTicks,
  scrubTime,
  timeLabel,
  zoomView,
} from "../src/ui/timeline-model"

describe("ruler ticks", () => {
  test("majors at least minGap apart on a nice step, labelled", () => {
    const t = rulerTicks({ start: 0, span: 6 }, 600, { fps: 30 })
    expect(t.step).toBe(1)
    expect(t.major.map((m) => m.label)).toEqual(["0s", "1s", "2s", "3s", "4s", "5s", "6s"])
    expect(t.minor.length).toBeGreaterThan(0)
  })
  test("zoomed in, finer steps with decimals, and single frames as minors", () => {
    const t = rulerTicks({ start: 1, span: 0.5 }, 800, { fps: 30 })
    expect(t.step).toBeLessThan(0.25)
    expect(t.major[0]!.label).toMatch(/^1(\.\d)?s$/)
    const frame = 1 / 30
    expect(t.minor.every((m) => Math.abs(m / frame - Math.round(m / frame)) < 1e-4)).toBe(true)
  })
  test("zoomed out over minutes, m:ss labels", () => {
    const t = rulerTicks({ start: 0, span: 600 }, 600, { fps: 30 })
    expect(t.major.some((m) => m.label === "1:00" || m.label === "2:00")).toBe(true)
  })
  test("frames: whole-frame steps, frame numbers", () => {
    const t = rulerTicks({ start: 0, span: 2 }, 600, { fps: 30, units: "frames" })
    expect(t.major.map((m) => m.label).slice(0, 3)).toEqual(["0", "10", "20"])
    expect(t.major.every((m) => Math.abs(m.t * 30 - Math.round(m.t * 30)) < 1e-4)).toBe(true)
  })
  test("labels", () => {
    expect(timeLabel(1.5, "seconds", 30, 0.5)).toBe("1.5s")
    expect(timeLabel(65, "seconds", 30, 5)).toBe("1:05")
    expect(timeLabel(3725, "seconds", 30, 60)).toBe("1:02:05")
    expect(timeLabel(1, "frames", 24)).toBe("24")
  })
})

describe("view", () => {
  test("zooming keeps the time under the pointer in place", () => {
    const v = zoomView({ start: 0, span: 10 }, 2, 4)
    expect(v.span).toBe(5)
    expect((4 - v.start) / v.span).toBeCloseTo(0.4, 9)
  })
  test("clamped to the duration with a little room, never narrower than minSpan", () => {
    expect(clampView({ start: -5, span: 2 }, 10).start).toBeCloseTo(-0.4, 9)
    expect(clampView({ start: 0, span: 1e-6 }, 10, { minSpan: 0.1 }).span).toBe(0.1)
    expect(clampView({ start: 0, span: 100 }, 10).span).toBeCloseTo(10.8, 9)
  })
  test("follow pans only once the time nears an edge", () => {
    const v = { start: 0, span: 10 }
    expect(followView(v, 5)).toBe(v)
    expect(followView(v, 9.9).start).toBeGreaterThan(0)
    expect(followView(v, -1).start).toBeLessThan(-1)
  })
})

describe("scrub", () => {
  test("lands on frames", () => {
    expect(frameTime(1.01, 30)).toBeCloseTo(30 / 30, 9)
    const s = scrubTime(1.018, { duration: 6, fps: 30, pxPerSec: 100 })
    expect(s.t * 30).toBeCloseTo(Math.round(1.018 * 30), 9)
  })
  test("a marker's pull: sticky at the marker, meets the pointer at the radius, no jump", () => {
    const pps = 100
    const held = magnet(1.2 + 0.01, [1.2], pps, 10)
    expect(held.stop).toBe(1.2)
    expect(held.t).toBeCloseTo(1.201, 9)
    // At the edge of the radius it's where the pointer is.
    expect(magnet(1.3, [1.2], pps, 10).t).toBeCloseTo(1.3, 9)
    // Continuous: just inside and just outside the radius agree.
    const inside = magnet(1.2 + 0.0999, [1.2], pps, 10).t
    expect(Math.abs(inside - (1.2 + 0.0999))).toBeLessThan(0.0005)
    const s = scrubTime(1.215, { duration: 6, fps: 30, pxPerSec: pps, stops: [1.2] })
    expect(s.t).toBe(1.2)
    expect(s.stop).toBe(1.2)
  })
  test("clamped to the duration", () => {
    expect(scrubTime(-1, { duration: 6, fps: 30, pxPerSec: 100 }).t).toBe(0)
    expect(scrubTime(9, { duration: 6, fps: 30, pxPerSec: 100 }).t).toBe(6)
  })
  test("markers before and after, a frame's margin away", () => {
    const ms = [{ time: 1 }, { time: 2 }, { time: 3 }]
    expect(adjacentMarker(ms, 1, 1, 30)?.time).toBe(2)
    expect(adjacentMarker(ms, 1, -1, 30)).toBeNull()
    expect(adjacentMarker(ms, 2.5, -1, 30)?.time).toBe(2)
  })
})

describe("playback", () => {
  test("advances, stops at the end, or repeats", () => {
    expect(advance(1, 0.5, { duration: 2 })).toEqual({ t: 1.5, ended: false, wrapped: false })
    expect(advance(1.8, 0.5, { duration: 2 })).toEqual({ t: 2, ended: true, wrapped: false })
    expect(advance(1.8, 0.5, { duration: 2, repeat: true }).t).toBeCloseTo(0.3, 9)
  })
  test("loops inside a range", () => {
    const r = advance(4, 0.5, { duration: 6, loop: { start: 1, end: 4.2 } })
    expect(r.wrapped).toBe(true)
    expect(r.t).toBeCloseTo(1.3, 9)
  })
})

describe("menu model", () => {
  test("stepping skips what can't be chosen and wraps", () => {
    const ok = (i: number) => i !== 1 && i !== 3
    expect(stepItem(5, -1, 1, ok)).toBe(0)
    expect(stepItem(5, 0, 1, ok)).toBe(2)
    expect(stepItem(5, 4, 1, ok)).toBe(0)
    expect(stepItem(5, 0, -1, ok)).toBe(4)
    expect(stepItem(5, -1, -1, ok)).toBe(4)
  })
  test("type-ahead: a letter jumps, repeating it cycles, more letters refine", () => {
    const labels = ["Rename", "Duplicate", "Delete…", null, "Move to"]
    expect(matchItem(labels, -1, "d")).toBe(1)
    expect(matchItem(labels, 1, "dd")).toBe(2)
    expect(matchItem(labels, 1, "de")).toBe(2)
    expect(matchItem(labels, 0, "x")).toBe(0)
  })
  test("the safe triangle reaches the submenu's near edge", () => {
    const [a, b, c] = safeTriangle({ x: 100, y: 50 }, { x: 200, y: 20, w: 150, h: 200 })
    expect(inTriangle({ x: 150, y: 120 }, a, b, c)).toBe(true)
    expect(inTriangle({ x: 150, y: 10 }, a, b, c)).toBe(false)
    expect(inTriangle({ x: 90, y: 50 }, a, b, c)).toBe(false)
  })
})

describe("playhead catch-up", () => {
  const at = (x: number, target = x) => ({ x, target })
  test("a jump the hand didn't make catches up from where the playhead is drawn", () => {
    expect(moveHead(at(1), 4, "jump", false)).toEqual({ x: 1, target: 4, catching: true })
  })
  test("a jump within the gap just lands", () => {
    expect(moveHead(at(1), 1.01, "jump", false, 0.02)).toEqual({
      x: 1.01,
      target: 1.01,
      catching: false,
    })
  })
  test("a drag is 1:1", () => {
    expect(moveHead(at(1), 3, "follow", false)).toEqual({ x: 3, target: 3, catching: false })
  })
  test("moves during a catch-up follow the hand; the remaining offset settles on its own", () => {
    // Mid catch-up from 1 to 4, drawn at 2: the hand moves the time on by 0.5.
    const next = moveHead(at(2, 4), 4.5, "follow", true)
    expect(next).toEqual({ x: 2.5, target: 4.5, catching: true })
    // The offset still to settle is unchanged: it doesn't jump, and it doesn't restart.
    expect(next.target - next.x).toBeCloseTo(2, 9)
  })
  test("a new jump mid catch-up retargets from where it's drawn", () => {
    expect(moveHead(at(2, 4), 0, "jump", true)).toEqual({ x: 2, target: 0, catching: true })
  })
  test("the spring is quick and has no bounce", () => {
    expect(CATCH_UP).toEqual({ duration: 0.15, bounce: 0 })
  })
  test("the current chapter is the last marker at or before the time", () => {
    const ms = [
      { id: "a", time: 0 },
      { id: "b", time: 2 },
      { id: "c", time: 5 },
    ]
    expect(currentMarker(ms, 1.9, 30)?.id).toBe("a")
    expect(currentMarker(ms, 1.99, 30)?.id).toBe("b")
    expect(currentMarker(ms, 9, 30)?.id).toBe("c")
    expect(currentMarker([{ id: "x", time: 1 }], 0.5, 30)).toBeNull()
  })
})

describe("the line", () => {
  test("a segment per chapter: 0, each start inside the length once, the end", () => {
    expect(chapterBounds([], 10)).toEqual([0, 10])
    expect(chapterBounds([0, 4, 2, 4, 12], 10)).toEqual([0, 2, 4, 10])
  })
  test("times as a player shows them", () => {
    expect(minutes(0)).toBe("0:00")
    expect(minutes(65.9)).toBe("1:05")
    expect(minutes(3725)).toBe("1:02:05")
  })
})
