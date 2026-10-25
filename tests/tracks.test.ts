import { describe, expect, test } from "vitest"
import { defineControls, easing, knob, spring } from "../src"
import {
  bezierAt,
  fitTracks,
  itemStart,
  sampleTrack,
  sampleTracks,
  springAt,
  springSettle,
  staggerRank,
  staggerSteps,
  track,
  trackSpan,
  type TrackTiming,
} from "../src/core/tracks"
import { clipPatch, dragClip } from "../src/ui/tracks-model"

const linear: TrackTiming = {
  start: 0.2,
  duration: 0.4,
  ease: [0, 0, 1, 1],
  stagger: 0,
  from: "first",
  items: 1,
}

describe("the sampler", () => {
  test("0 before the start, the easing over the duration, 1 after", () => {
    expect(sampleTrack(linear, 0)).toBe(0)
    expect(sampleTrack(linear, 0.2)).toBe(0)
    expect(sampleTrack(linear, 0.3)).toBeCloseTo(0.25, 5)
    expect(sampleTrack(linear, 0.4)).toBeCloseTo(0.5, 5)
    expect(sampleTrack(linear, 0.6)).toBe(1)
    expect(sampleTrack(linear, 10)).toBe(1)
    expect(sampleTrack(linear, -3)).toBe(0)
  })
  test("a curve: ease-out is ahead at the midpoint, and every value stays in 0…1", () => {
    const out = { ...linear, ease: [0, 0, 0.58, 1] as const }
    expect(sampleTrack(out, 0.4)).toBeGreaterThan(0.6)
    for (let t = 0; t <= 0.8; t += 0.01) {
      const p = sampleTrack(out, t)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })
  test("bezierAt solves for x", () => {
    expect(bezierAt([0, 0, 1, 1], 0.37)).toBeCloseTo(0.37, 5)
    expect(bezierAt([0.42, 0, 0.58, 1], 0.5)).toBeCloseTo(0.5, 5)
    expect(bezierAt([0.25, 0.1, 0.25, 1], 0)).toBe(0)
    expect(bezierAt([0.25, 0.1, 0.25, 1], 1)).toBe(1)
    // A back curve overshoots.
    const peak = Math.max(
      ...Array.from({ length: 100 }, (_, i) => bezierAt([0.34, 1.56, 0.64, 1], i / 100)),
    )
    expect(peak).toBeGreaterThan(1)
  })
  test("a spring without bounce rises without overshoot, ~98.6% there at its duration", () => {
    const s = { duration: 0.4, bounce: 0 }
    let last = 0
    for (let t = 0; t <= 1; t += 1 / 120) {
      const x = springAt(s, t)
      expect(x).toBeGreaterThanOrEqual(last - 1e-12)
      expect(x).toBeLessThanOrEqual(1)
      last = x
    }
    expect(springAt(s, 0.4)).toBeCloseTo(1 - (1 + 2 * Math.PI) * Math.exp(-2 * Math.PI), 6)
  })
  test("a bouncy spring overshoots, then lands exactly on 1 once settled", () => {
    const s = { duration: 0.4, bounce: 0.4 }
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => springAt(s, i / 200)))
    expect(peak).toBeGreaterThan(1.05)
    const settle = springSettle(s)
    expect(settle).toBeGreaterThan(0.4)
    expect(springAt(s, settle + 0.001)).toBe(1)
    expect(Math.abs(springAt(s, settle - 0.001) - 1)).toBeLessThan(0.002)
  })
  test("an overdamped spring (bounce below 0) still arrives", () => {
    const s = { duration: 0.3, bounce: -0.4 }
    expect(springAt(s, 0.15)).toBeGreaterThan(0)
    expect(springAt(s, 0.15)).toBeLessThan(1)
    expect(springAt(s, 5)).toBe(1)
  })
  test("a spring just past critical damping settles when a critical one does", () => {
    const critical = springSettle({ duration: 0.4, bounce: 0 })
    expect(springSettle({ duration: 0.4, bounce: -0.001 })).toBeCloseTo(critical, 2)
    // And an overdamped one settles exactly where it comes within 0.001.
    const s = { duration: 0.3, bounce: -0.4 }
    const t = springSettle(s)
    expect(1 - springAt(s, t - 1e-4)).toBeGreaterThan(0.001 - 1e-6)
    expect(1 - springAt(s, t - 0.01)).toBeGreaterThan(0.001)
  })
  test("matches the integrated spring the panels use", () => {
    // knobs' own Spring, stepped at 480 Hz, against the closed form.
    const s = { duration: 0.5, bounce: 0.2 }
    const t = 0.3
    const omega = (2 * Math.PI) / 0.5
    const zeta = 0.8
    let x = 0
    let v = 0
    const h = 1 / 4800
    for (let k = 0; k < t / h - 1e-9; k++) {
      const a = -omega * omega * (x - 1) - 2 * zeta * omega * v
      v += a * h
      x += v * h
    }
    expect(springAt(s, t)).toBeCloseTo(x, 3)
  })
  test("a spring track's progress, by its start", () => {
    const timing: TrackTiming = { ...linear, ease: { duration: 0.3, bounce: 0 } }
    expect(sampleTrack(timing, 0.2)).toBe(0)
    expect(sampleTrack(timing, 0.5)).toBeCloseTo(springAt({ duration: 0.3, bounce: 0 }, 0.3), 9)
  })
})

describe("stagger", () => {
  test("ranks from the first, the last and the centre", () => {
    const ranks = (n: number, from: "first" | "last" | "center") =>
      Array.from({ length: n }, (_, i) => staggerRank(i, n, from))
    expect(ranks(5, "first")).toEqual([0, 1, 2, 3, 4])
    expect(ranks(5, "last")).toEqual([4, 3, 2, 1, 0])
    expect(ranks(5, "center")).toEqual([2, 1, 0, 1, 2])
    expect(ranks(4, "center")).toEqual([1, 0, 0, 1])
    expect(staggerSteps(5, "center")).toBe(2)
    expect(staggerSteps(4, "center")).toBe(1)
    expect(staggerSteps(4, "last")).toBe(3)
    expect(staggerSteps(1, "first")).toBe(0)
  })
  test("each item starts a stagger after the one before; the clip spans them all", () => {
    const rows: TrackTiming = { ...linear, stagger: 0.04, items: 6 }
    expect(itemStart(rows, 0)).toBeCloseTo(0.2)
    expect(itemStart(rows, 5)).toBeCloseTo(0.4)
    expect(sampleTrack(rows, 0.3, 0)).toBeCloseTo(0.25, 5)
    expect(sampleTrack(rows, 0.3, 5)).toBe(0)
    const span = trackSpan(rows)
    expect(span.start).toBeCloseTo(0.2)
    expect(span.end).toBeCloseTo(0.8)
    expect(span.settle).toBeCloseTo(0.8)
    const last = { ...rows, from: "last" as const }
    expect(sampleTrack(last, 0.3, 5)).toBeCloseTo(0.25, 5)
    expect(sampleTrack(last, 0.3, 0)).toBe(0)
  })
  test("a spring's clip ends at its duration and settles after", () => {
    const span = trackSpan({ ...linear, ease: { duration: 0.3, bounce: 0 }, duration: 0.3 })
    expect(span.end).toBeCloseTo(0.5)
    expect(span.settle).toBeGreaterThan(0.5)
  })
})

const card = track("card", { start: 0, ease: spring({ duration: 0.4, bounce: 0 }), max: 1.6 })
const header = track("header", { start: 0.1, duration: 0.3, ease: easing("out"), max: 1.6 })
const rows = track("rows", {
  start: 0.2,
  ease: { duration: 0.35, bounce: 0 },
  stagger: 0.04,
  items: 6,
  max: 1.6,
})
const button = track("button", { start: 0.6, duration: 0.25, ease: "snappy", max: 1.6 })
const all = [card, header, rows, button] as const

describe("track fields", () => {
  test("ordinary fields in a group per track; a spring brings its own duration", () => {
    expect(Object.keys(card.fields)).toEqual(["card.start", "card.ease"])
    expect(Object.keys(header.fields)).toEqual(["header.start", "header.duration", "header.ease"])
    expect(Object.keys(rows.fields)).toEqual([
      "rows.start",
      "rows.ease",
      "rows.stagger",
      "rows.from",
    ])
    expect(rows.fields["rows.stagger"].group).toBe("Rows")
    expect(rows.fields["rows.ease"].kind).toBe("spring")
    expect(header.fields["header.ease"].kind).toBe("easing")
    expect(rows.read({}).duration).toBe(0.35)
    expect(rows.patch({}, { duration: 0.5 })).toEqual({
      "rows.ease": { duration: 0.5, bounce: 0 },
    })
    expect(header.patch({}, { start: 0.2, duration: 0.5 })).toEqual({
      "header.start": 0.2,
      "header.duration": 0.5,
    })
  })
  test("sampleTracks reads every track at once, one value per item", () => {
    const at = sampleTracks(all, {}, 0.25)
    expect(at.rows).toHaveLength(6)
    expect(at.card).toHaveLength(1)
    expect(at.header[0]).toBeCloseTo(header.sample({}, 0.25), 9)
    expect(at.button[0]).toBe(0)
  })
})

describe("dragging a clip", () => {
  const base = { from: { start: 0.2, end: 0.6 }, pxPerSec: 400, min: 0.05, bounds: [0, 2] as const }
  test("a move follows the hand 1:1", () => {
    const r = dragClip({ ...base, grip: "move", delta: 0.137 })
    expect(r.box.start).toBeCloseTo(0.337, 9)
    expect(r.box.end).toBeCloseTo(0.737, 9)
    expect(r.stop).toBeNull()
  })
  test("an edge near a stop lands on it; the other edge leads when it's nearer", () => {
    const stops = [1.0, 0.5]
    // The start edge 1px from 0.5 sticks there.
    const a = dragClip({ ...base, grip: "move", delta: 0.3 + 1 / 400, stops })
    expect(a.box.start).toBe(0.5)
    expect(a.stop).toBe(0.5)
    // The end edge 1px from 1.0 sticks there, the start moving with it.
    const b = dragClip({ ...base, grip: "move", delta: 0.4 - 1 / 400, stops: [1.0] })
    expect(b.box.end).toBeCloseTo(1.0, 9)
    expect(b.stop).toBe(1.0)
  })
  test("the pull meets the hand at its radius, with no jump", () => {
    const stops = [0.5]
    const r = dragClip({ ...base, grip: "start", delta: 0.3 + 8.0001 / 400, stops })
    expect(r.box.start).toBeCloseTo(0.5 + 8.0001 / 400, 6)
    const inside = dragClip({ ...base, grip: "start", delta: 0.3 + 7.99 / 400, stops })
    expect(Math.abs(inside.box.start - (0.5 + 7.99 / 400))).toBeLessThan(0.1 / 400)
  })
  test("the modifier turns snapping off", () => {
    const r = dragClip({ ...base, grip: "move", delta: 0.3 + 1 / 400, stops: [0.5], snap: false })
    expect(r.box.start).toBeCloseTo(0.5 + 1 / 400, 9)
    expect(r.stop).toBeNull()
  })
  test("edges keep the clip at least `min` long and inside its bounds", () => {
    expect(dragClip({ ...base, grip: "start", delta: 1 }).box.start).toBeCloseTo(0.55, 9)
    expect(dragClip({ ...base, grip: "start", delta: -1 }).box).toEqual({ start: 0, end: 0.6 })
    expect(dragClip({ ...base, grip: "end", delta: 5 }).box).toEqual({ start: 0.2, end: 2 })
    const early = dragClip({ ...base, grip: "move", delta: -1 }).box
    expect(early.start).toBe(0)
    expect(early.end).toBeCloseTo(0.4, 9)
    const late = dragClip({ ...base, grip: "move", delta: 5 }).box
    expect(late.end).toBeCloseTo(2, 9)
  })
  test("a clip longer than its bounds keeps its start inside them", () => {
    const r = dragClip({ ...base, from: { start: 0.2, end: 2.6 }, grip: "move", delta: -0.1 })
    expect(r.box.start).toBe(0)
    expect(r.box.end).toBeCloseTo(2.4, 9)
    const late = dragClip({ ...base, from: { start: 0.2, end: 2.6 }, grip: "move", delta: 0.3 })
    expect(late.box.start).toBe(0)
  })
  test("an edge stretches no further than `max`, in steps of `quantum`", () => {
    const end = dragClip({ ...base, grip: "end", delta: 1, max: 0.5, quantum: 0.01 })
    expect(end.box.end).toBeCloseTo(0.7, 9)
    const start = dragClip({ ...base, grip: "start", delta: -0.1234, quantum: 0.01 })
    // 0.4 long, 0.1234 more rounds to 0.12 more: the end stays and the start lands on the step.
    expect(start.box.end).toBe(0.6)
    expect(start.box.end - start.box.start).toBeCloseTo(0.52, 9)
    const early = dragClip({ ...base, grip: "start", delta: -0.1999, quantum: 0.03 })
    expect(early.box.start).toBeGreaterThanOrEqual(0)
  })
  test("the guide shows wherever an edge rests on a stop, clamped there or not", () => {
    const r = dragClip({ ...base, grip: "move", delta: -1, stops: [0] })
    expect(r.box.start).toBe(0)
    expect(r.stop).toBe(0)
    const q = dragClip({ ...base, grip: "end", delta: 0.2 + 1 / 400, stops: [0.8], quantum: 0.01 })
    expect(q.box.end).toBeCloseTo(0.8, 9)
    expect(q.stop).toBe(0.8)
  })
  test("clips map back to fields: a start edge keeps the end, an end edge sets the duration", () => {
    expect(clipPatch(header, {}, "move", { start: 0.3, end: 0.6 })).toEqual({ "header.start": 0.3 })
    const start = clipPatch(header, {}, "start", { start: 0.05, end: 0.4 })
    expect(start["header.start"]).toBe(0.05)
    expect(start["header.duration"]).toBeCloseTo(0.35, 9)
    // Rows: 5 steps of 0.04 before the last item, so the clip ends at 0.2 + 0.2 + 0.35.
    const end = clipPatch(rows, {}, "end", { start: 0.2, end: 0.85 })
    expect((end["rows.ease"] as { duration: number }).duration).toBeCloseTo(0.45, 9)
  })
})

describe("in a store", () => {
  const make = (random?: () => number) =>
    defineControls(
      `tracks-${Math.random()}`,
      { ...card.fields, ...header.fields, ...rows.fields, ...button.fields },
      {
        enabled: true,
        storage: null,
        constrain: fitTracks(all, { length: 1.6 }),
        presets: {
          Snappy: { "card.ease": { duration: 0.25, bounce: 0 }, "rows.stagger": 0.02 },
        },
        ...(random ? { random } : {}),
      },
    )
  test("presets move the fields; the timing follows", () => {
    const s = make()
    s.preset("Snappy")
    expect(card.read(s.get()).duration).toBe(0.25)
    expect(rows.read(s.get()).stagger).toBe(0.02)
  })
  test("Random keeps every clip inside the timeline and the tracks in order", () => {
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const s = make(random)
    for (let roll = 0; roll < 200; roll++) {
      s.randomize()
      const v = s.get()
      const spans = all.map((t) => trackSpan(t.read(v)))
      for (const sp of spans) {
        expect(sp.start).toBeGreaterThanOrEqual(0)
        expect(sp.end).toBeLessThanOrEqual(1.6 + 1e-9)
      }
      for (let i = 1; i < spans.length; i++)
        expect(spans[i]!.start).toBeGreaterThanOrEqual(spans[i - 1]!.start)
    }
  })
  test("a die on one track keeps it between its neighbours and leaves them be", () => {
    let seed = 3
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const s = make(random)
    for (let roll = 0; roll < 50; roll++) {
      s.randomize(Object.keys(header.fields) as never)
      const v = s.get()
      expect(v["card.start"]).toBe(0)
      expect(v["rows.start"]).toBe(0.2)
      expect(header.read(v).start).toBeGreaterThanOrEqual(0)
      expect(header.read(v).start).toBeLessThanOrEqual(0.2)
    }
  })
  test("a locked start stays put however the rest rolls", () => {
    let seed = 11
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const s = make(random)
    s.set({ "button.start": 1.5 })
    s.lock("button.start")
    for (let roll = 0; roll < 50; roll++) {
      s.randomize()
      expect(s.get()["button.start"]).toBe(1.5)
    }
  })
  test("a constrain's fixes to keys a roll can't reach are dropped", () => {
    const s = defineControls(
      `constrain-${Math.random()}`,
      { a: knob(0.5, { min: 0, max: 1 }), b: knob(0.5, { min: 0, max: 1 }) },
      { enabled: true, storage: null, constrain: () => ({ a: 0.9, b: 0.1 }) },
    )
    s.lock("a")
    s.randomize()
    expect(s.get().a).toBe(0.5)
    expect(s.get().b).toBe(0.1)
  })
  test("fitTracks moves only what was rolled", () => {
    const fit = fitTracks(all, { length: 1.6 })
    // The header's duration rolled long: it shortens; its start, not rolled, stays.
    const v = {
      "header.start": 1.2,
      "header.duration": 0.6,
      "rows.start": 1.3,
      "button.start": 1.4,
    }
    const patch = fit(v, ["header.duration"])
    expect(patch["header.start"]).toBeUndefined()
    expect(patch["header.duration"]).toBeCloseTo(0.4, 9)
    // A roll of only its start can't shorten it: it moves earlier, as far as the card allows.
    const moved = fit({ ...v, "header.start": 1.5 }, ["header.start"])
    expect(moved["header.duration"]).toBeUndefined()
    expect(moved["header.start"]).toBeCloseTo(1.0, 9)
  })
  test("fitTracks never starts a track before the one ahead, even off the step", () => {
    const patch = fitTracks(all, { length: 1.6 })({ "card.start": 0.1234, "header.start": 0.05 }, [
      "header.start",
    ])
    expect(patch["header.start"]).toBeGreaterThanOrEqual(0.1234)
  })
  test("a drag is one undo step", () => {
    const s = make()
    s.set(clipPatch(rows, s.get(), "move", { start: 0.25, end: 0 }))
    s.set(clipPatch(rows, s.get(), "move", { start: 0.3, end: 0 }), { coalesce: true })
    s.set(clipPatch(rows, s.get(), "move", { start: 0.35, end: 0 }), { coalesce: true })
    expect(s.get()["rows.start"]).toBe(0.35)
    s.undo()
    expect(s.get()["rows.start"]).toBe(0.2)
    s.redo()
    expect(s.get()["rows.start"]).toBe(0.35)
  })
})
