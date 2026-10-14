import { describe, expect, it } from "vitest"
import {
  createPan,
  GESTURE_GAP,
  pillAt,
  slide,
  type Slot,
  type WheelSample,
} from "../src/panel/swipe.js"
import traces from "./fixtures/wheel-traces.json"

type Wheel = { dx?: number; dy?: number; t: number; shift?: boolean; mode?: number }
const sample = ({ dx = 0, dy = 0, t, shift = false, mode = 0 }: Wheel): WheelSample => ({
  deltaX: dx,
  deltaY: dy,
  deltaMode: mode,
  shiftKey: shift,
  timeStamp: t,
})

/** Runs wheel events through a pan; travel is in wheel-delta terms (the fingers move the other way). */
function run(events: readonly (Wheel | WheelSample)[], axes?: "x" | "xy") {
  const out = { travel: 0, travelY: 0, moves: [] as number[], ends: 0, steps: [] as number[] }
  const claimed: boolean[] = []
  const pan = createPan(
    {
      move: (dx, dy) => {
        out.travel -= dx
        out.travelY -= dy
        out.moves.push(-dx)
      },
      end: () => out.ends++,
      step: (d) => out.steps.push(d),
    },
    { axes },
  )
  for (const e of events) claimed.push(pan.feed("deltaX" in e ? e : sample(e)))
  pan.idle()
  return { ...out, claimed }
}

// Deterministic noise, so a failing case can be replayed.
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface Flick {
  /** Finger events per second, and the momentum's (a display's refresh). */
  hz?: number
  momentumHz?: number
  /** Peak finger delta per event (px), the events it takes to get there, and how long it's held. */
  peak?: number
  ramp?: number
  hold?: number
  jitter?: number
  /** Momentum's fade per event. */
  decay?: number
  /** Whether the lift leaves a pause in the stream, as on a Mac (false: momentum runs straight on). */
  pause?: boolean
  sign?: number
  start?: number
  seed?: number
}

/**
 * A synthetic trackpad gesture modelled on the recorded Safari and Chrome traces: a ramp up, a
 * jittery hold (each delta is speed × interval), then the lift. On a Mac the lift leaves a ~25 ms
 * pause (two frames at 60 Hz) which the first momentum event covers, slower per ms than the
 * fingers; momentum then runs at about the fingers' speed and fades geometrically to 1 px.
 */
function flick(o: Flick = {}) {
  const { hz = 120, momentumHz = 60, peak = 30, ramp = 5, hold = 12, jitter = 0.15 } = o
  const { decay = 0.92, pause = true, sign = 1, start = 0, seed = 1 } = o
  const r = rng(seed)
  const dt = 1000 / hz
  const events: Wheel[] = []
  let t = start
  let fingers = 0
  for (let i = 0; i < ramp + hold; i++) {
    const speed = (peak / dt) * Math.min(1, (i + 1) / ramp) * (1 + (r() * 2 - 1) * jitter)
    const d = Math.max(1, Math.round(speed * dt))
    fingers += d
    events.push({ dx: d * sign, t })
    t += dt
  }
  const lift = t - dt
  const speed = peak / dt
  let m: number
  if (pause) {
    const gap = Math.max(25, 2 * dt)
    t = lift + gap
    events.push({ dx: Math.round(speed * gap * 0.75) * sign, t })
    m = speed * (1000 / momentumHz)
  } else m = peak * decay
  const mdt = pause ? 1000 / momentumHz : dt
  while (m >= 0.6) {
    t += mdt
    events.push({ dx: Math.max(1, Math.round(m)) * sign, t })
    m *= decay
  }
  return { events, fingers: fingers * sign, end: t }
}

describe("trackpad pans", () => {
  it("move from the first event, 1:1 with the fingers: wheel deltas run against them", () => {
    const { moves, claimed } = run([
      { dx: 3, t: 0 },
      { dx: 5, t: 8 },
    ])
    expect(moves).toEqual([3, 5])
    expect(claimed).toEqual([true, true])
    // Natural scrolling (the default) sends deltas against the fingers; Safari says when it's off.
    const fingers: number[] = []
    const pan = createPan({ move: (dx) => fingers.push(dx), end() {} })
    pan.feed(sample({ dx: 4, t: 0 }))
    pan.feed({ ...sample({ dx: 4, t: 100 }), webkitDirectionInvertedFromDevice: false })
    expect(fingers).toEqual([-4, -4])
    pan.idle()
    pan.feed({ ...sample({ dx: 4, t: 500 }), webkitDirectionInvertedFromDevice: false })
    expect(fingers).toEqual([-4, -4, 4])
  })

  it("a slow, jittery pan arrives exactly, as one gesture", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed)
      const events: Wheel[] = []
      let truth = 0
      let t = 0
      for (let i = 0; i < 150; i++) {
        const dt = 8 + (r() < 0.15 ? 8 : 0)
        const d = Math.max(1, Math.round((dt / 8) * (2 + 6 * r())))
        truth += d
        t += dt
        events.push({ dx: d, t })
      }
      const { travel, ends } = run(events)
      expect(travel, `seed ${seed}`).toBe(truth)
      expect(ends).toBe(1)
    }
  })

  it("a flick stops where the fingers lifted: its momentum is ignored", () => {
    for (const hz of [60, 90, 120])
      for (const momentumHz of [60, 120])
        for (const decay of [0.85, 0.9, 0.95])
          for (const peak of [12, 30, 80, 250])
            for (const seed of [1, 2, 3]) {
              const f = flick({ hz, momentumHz, decay, peak, seed })
              const { travel, ends, claimed } = run(f.events)
              const label = JSON.stringify({ hz, momentumHz, decay, peak, seed })
              expect(travel, label).toBe(f.fingers)
              expect(ends, label).toBe(1)
              expect(claimed.every(Boolean), label).toBe(true)
            }
  })

  it("cues the lift once the momentum confirms it, and ends once it fades", () => {
    const f = flick({ peak: 30, decay: 0.92 })
    // The last event before the lift's pause.
    const lastFinger = f.events.findIndex((e, i) => (f.events[i + 1]?.t ?? 0) - e.t > 20)
    const log: string[] = []
    const pan = createPan({
      move: () => log.push("move"),
      lift: () => log.push("lift"),
      end: () => log.push("end"),
    })
    f.events.forEach((e, i) => {
      pan.feed(sample(e))
      log.push(`#${i - lastFinger}`)
    })
    // Nothing after the fingers moves; the spike and three momentum events confirm the lift
    // (~75 ms), and the gesture ends once the momentum has faded a fifth.
    expect(log.filter((s) => s === "move")).toHaveLength(lastFinger + 1)
    expect(log.indexOf("lift")).toBe(log.indexOf("#4") - 1)
    expect(log.indexOf("end")).toBeGreaterThan(log.indexOf("lift"))
    expect(log.indexOf("end")).toBeLessThan(log.indexOf("#10"))
  })

  it("momentum with no lift pause is caught within one event of the fade", () => {
    for (const hz of [60, 120])
      for (const decay of [0.85, 0.9, 0.95])
        for (const peak of [20, 40, 120]) {
          const f = flick({ hz, decay, peak, pause: false, jitter: 0 })
          const { travel, ends } = run(f.events)
          const label = JSON.stringify({ hz, decay, peak })
          expect(travel - f.fingers, label).toBeGreaterThanOrEqual(0)
          expect(travel - f.fingers, label).toBeLessThanOrEqual(Math.round(peak * decay))
          expect(ends, label).toBe(1)
        }
  })

  it("irregular delivery (coalesced events, ±35% jitter) almost never costs travel", () => {
    // A busy page coalesces wheel events: some intervals double, carrying double the travel,
    // and look like a lift's pause and spike. Suspect events are held, never dropped, so even
    // here travel is nearly always exact; a false alarm at worst splits the undo step.
    let runs = 0
    let lost = 0
    let split = 0
    for (const jitter of [0.15, 0.25, 0.35])
      for (const level of [3, 6, 12, 25, 50])
        for (let seed = 1; seed <= 40; seed++) {
          const r = rng(seed * 7919 + level * 13 + Math.round(jitter * 100))
          const events: Wheel[] = []
          let truth = 0
          let t = 0
          for (let i = 0; i < 120; i++) {
            const dt = r() < 0.15 ? 16 : 8
            const ramp = Math.min(1, (i + 1) / 6)
            const d = Math.max(
              1,
              Math.round((dt / 8) * level * (1 + (r() * 2 - 1) * jitter) * ramp),
            )
            truth += d
            events.push({ dx: d, t: (t += dt) })
          }
          const { travel, ends } = run(events)
          runs++
          if (travel !== truth) lost++
          if (ends > 1) split++
        }
    expect(runs).toBe(600)
    expect(lost).toBeLessThanOrEqual(1)
    expect(split).toBeLessThanOrEqual(12)
  })

  it("reverses mid-gesture without losing a px", () => {
    const events: Wheel[] = []
    const deltas = [2, 5, 9, 12, 12, 10, 6, 2, -1, -4, -9, -14, -15, -13, -8, -4, -2, 3, 6, 4]
    deltas.forEach((dx, i) => events.push({ dx, t: i * 8 }))
    const { moves, ends } = run(events)
    expect(moves).toEqual(deltas)
    expect(ends).toBe(1)
  })

  it("a pan, a pause, then another pan are two gestures", () => {
    const first = flick({ peak: 10, seed: 4 })
    const second = flick({ peak: 14, sign: -1, start: first.end + GESTURE_GAP + 30, seed: 5 })
    const { travel, ends } = run([...first.events, ...second.events])
    expect(travel).toBe(first.fingers + second.fingers)
    expect(ends).toBe(2)
    // Fingers resting mid-pan for longer than the gap split it too.
    const resting = run([
      { dx: 6, t: 0 },
      { dx: 6, t: 8 },
      { dx: 6, t: 8 + GESTURE_GAP + 1 },
      { dx: 6, t: 16 + GESTURE_GAP + 1 },
    ])
    expect(resting.travel).toBe(24)
    expect(resting.ends).toBe(2)
  })

  it("a new push during the momentum starts a new gesture at once", () => {
    const first = flick({ peak: 40, decay: 0.95 })
    const cut = first.events.filter((e) => e.t < first.end - 400)
    // The new touch stops the momentum, then moves after a short pause; either way, or the other.
    for (const sign of [1, -1]) {
      const second = flick({ peak: 9, ramp: 4, hold: 6, sign, seed: 7, start: cut.at(-1)!.t + 40 })
      const { travel, ends } = run([...cut, ...second.events])
      expect(travel).toBe(first.fingers + second.fingers)
      expect(ends).toBe(2)
      // Its very first event moves: no threshold.
      let moved = 0
      const pan = createPan({ move: (dx) => (moved -= dx), end() {} })
      for (const e of cut) pan.feed(sample(e))
      const before = moved
      pan.feed(sample(second.events[0]!))
      expect(moved - before).toBe(second.events[0]!.dx)
    }
  })

  it("a false alarm (one long interval, no momentum after it) costs nothing", () => {
    const deltas = [6, 6, 7, 6, 15, 6, 7, 6, 6, 15, 7, 7, 7, 7, 7, 7, 7, 6, 15, 7]
    let t = 0
    const events = deltas.map((dx) => ({ dx, t: (t += dx > 10 ? 16 : 8) }))
    const { travel, ends } = run(events)
    expect(travel).toBe(deltas.reduce((a, b) => a + b))
    expect(ends).toBe(1)
  })

  it("vertical scrolling is never claimed, even when it wanders sideways", () => {
    const events: Wheel[] = []
    for (let i = 0; i < 40; i++) events.push({ dx: i % 7 === 3 ? 3 : 0, dy: 4 + i, t: i * 8 })
    const { claimed, moves } = run(events)
    expect(claimed.some(Boolean)).toBe(false)
    expect(moves).toEqual([])
    // A sideways start claims it; turning clearly vertical hands it back to the page.
    const turned = run([
      { dx: 6, t: 0 },
      { dx: 4, dy: 3, t: 8 },
      ...Array.from({ length: 8 }, (_, i) => ({ dx: 1, dy: 12, t: 16 + i * 8 })),
    ])
    expect(turned.claimed.slice(0, 3)).toEqual([true, true, true])
    expect(turned.claimed.at(-1)).toBe(false)
    expect(turned.ends).toBe(1)
  })

  it("a sideways touch after a vertical scroll's momentum is a new, claimed gesture", () => {
    const events: Wheel[] = []
    for (let i = 0; i < 20; i++) events.push({ dy: Math.round(60 * 0.9 ** i), t: i * 16 })
    events.push({ dx: 3, t: 20 * 16 + 40 }, { dx: 5, t: 20 * 16 + 48 })
    const { claimed, travel } = run(events)
    expect(claimed.slice(0, 20).some(Boolean)).toBe(false)
    expect(claimed.slice(20)).toEqual([true, true])
    expect(travel).toBe(8)
  })

  it("the pad pans both axes from a sideways start", () => {
    const { travel, travelY } = run(
      [
        { dx: 5, dy: 2, t: 0 },
        { dx: 2, dy: 6, t: 8 },
        { dx: 0, dy: 9, t: 16 },
      ],
      "xy",
    )
    expect([travel, travelY]).toEqual([7, 17])
  })

  it("mouse notches and ⇧ + wheel step once each", () => {
    const { steps, moves, claimed } = run([
      { dx: 3, t: 0, mode: 1 },
      { dx: -1, t: 120, mode: 1 },
      { dy: 100, t: 300, shift: true },
      { dy: -100, t: 340, shift: true },
      { dx: 4, t: 380, shift: true },
      // A vertical line-mode notch is the page's.
      { dy: 3, t: 500, mode: 1 },
    ])
    expect(steps).toEqual([1, -1, 1, -1, 1])
    expect(moves).toEqual([])
    expect(claimed).toEqual([true, true, true, true, true, false])
  })

  it("accept() can turn a gesture away", () => {
    const pan = createPan({ accept: () => false, move: () => expect.unreachable(), end() {} })
    expect(pan.feed(sample({ dx: 6, t: 0 }))).toBe(false)
    expect(pan.feed(sample({ dx: 6, t: 8 }))).toBe(false)
  })
})

describe("recorded trackpad traces", () => {
  type Trace = { events: [number | "-0", number, number, number][] }
  const recorded = traces as unknown as Record<string, Trace>
  const events = (name: string) =>
    recorded[name]!.events.map(([dx, dy, t, mode]) => ({
      deltaX: dx === "-0" ? -0 : dx,
      deltaY: dy,
      deltaMode: mode,
      shiftKey: false,
      timeStamp: t,
    }))
  /** The finger part of each gesture: from its start to the lift, a time (ms) in the pause before it. */
  const fingers = (name: string, ...spans: [number, number][]) =>
    events(name)
      .filter((e) => spans.some(([from, to]) => e.timeStamp >= from && e.timeStamp < to))
      .reduce((sum, e) => sum + e.deltaX, 0)
  const cases: [string, [number, number][], number][] = [
    ["safari-swipe-left", [[0, 125]], 1],
    ["safari-swipe-left-fast", [[0, 70]], 1],
    ["safari-slow-drag-right", [[0, Infinity]], 1],
    ["chrome-swipe-right", [[0, 127]], 1],
    // A slow creep, a pause, then the flick.
    ["chrome-swipe-right-fast", [[0, 765]], 2],
    [
      "chrome-double-swipe-right",
      [
        [0, 85],
        [520, 650],
      ],
      2,
    ],
    ["firefox-mouse-swipe-left", [[0, 105]], 1],
    // Chrome on Windows marks the lift with a -0 event.
    ["win-chrome-right", [[0, 101.5]], 1],
    ["win-chrome-fast-right", [[0, 99.5]], 1],
  ]
  for (const [name, spans, gestures] of cases)
    it(`${name}: the fingers' travel exactly, none of the momentum`, () => {
      const { travel, ends, claimed } = run(events(name))
      expect(travel).toBe(fingers(name, ...spans))
      expect(ends).toBe(gestures)
      expect(claimed.every(Boolean)).toBe(true)
    })

  it("vertical scrolls and a gesture that starts vertical stay the page's", () => {
    expect(run(events("safari-swipe-down")).claimed.some(Boolean)).toBe(false)
    expect(run(events("safari-square")).claimed.some(Boolean)).toBe(false)
  })

  it("a Firefox mouse wheel steps once per notch", () => {
    expect(run(events("mac-firefox-mouse")).steps).toEqual(Array(9).fill(-1))
  })
})

describe("panning a row of options", () => {
  // Four 60 px options, 4 px apart: centres 64 px apart.
  const row: Slot[] = [0, 1, 2, 3].map((i) => ({ left: i * 64, right: i * 64 + 60, top: 0 }))

  it("the pill follows the fingers and joins a neighbour once past halfway", () => {
    expect(slide(row, { index: 1, offset: 0 }, 20)).toEqual({ index: 1, offset: 20 })
    expect(slide(row, { index: 1, offset: 0 }, 33)).toEqual({ index: 2, offset: -31 })
    expect(slide(row, { index: 1, offset: 0 }, -33)).toEqual({ index: 0, offset: 31 })
    // One long pan crosses several.
    expect(slide(row, { index: 0, offset: 0 }, 140)).toEqual({ index: 2, offset: 12 })
    // Small steps add up to the same thing.
    let at = { index: 0, offset: 0 }
    for (let i = 0; i < 14; i++) at = slide(row, at, 10)
    expect(at).toEqual({ index: 2, offset: 12 })
  })

  it("holds at the ends, within a pill's width", () => {
    expect(slide(row, { index: 3, offset: 0 }, 500)).toEqual({ index: 3, offset: 60 })
    expect(slide(row, { index: 0, offset: 0 }, -500)).toEqual({ index: 0, offset: -60 })
    // So turning back answers at once.
    expect(slide(row, { index: 3, offset: 60 }, -20).offset).toBe(40)
  })

  it("the pill's centre is its option's plus the offset, continuous across a hand-over", () => {
    const wide: Slot[] = [
      { left: 0, right: 40, top: 0 },
      { left: 44, right: 124, top: 0 },
    ]
    const before = pillAt(wide, { index: 0, offset: 41.9 })
    const after = pillAt(wide, slide(wide, { index: 0, offset: 41.9 }, 0.2))
    expect((before.left + before.right) / 2).toBeCloseTo(20 + 41.9)
    expect(after.left).toBeCloseTo(before.left, 0)
    expect(after.right).toBeCloseTo(before.right, 0)
    expect(pillAt(row, { index: 2, offset: 0 })).toEqual(row[2])
    // Past the end it gives way like a rubber band.
    const pulled = pillAt(row, { index: 3, offset: 60 })
    expect(pulled.left - row[3]!.left).toBeGreaterThan(0)
    expect(pulled.left - row[3]!.left).toBeLessThan(30)
  })

  it("options that wrap onto rows carry on in reading order", () => {
    const grid: Slot[] = [
      { left: 0, right: 60, top: 0 },
      { left: 64, right: 124, top: 0 },
      { left: 0, right: 60, top: 30 },
    ]
    expect(slide(grid, { index: 1, offset: 0 }, 40)).toEqual({ index: 2, offset: -24 })
  })
})
