// The history's model: dates as days, the axis's scale and ticks, spans clipped to it, the older
// walkthrough shape converted, the order ←/→ walk and where a span's tag fits.
import { describe, expect, test } from "vitest"
import {
  bandLabel,
  bandRoom,
  clipSpan,
  dayOf,
  dayScale,
  fitLabels,
  fitTag,
  firstSentence,
  formatRange,
  fromGroups,
  iso,
  monthTicks,
  nearestEvent,
  normalizeHistory,
  parseDay,
  stepEvent,
} from "../src/ui/history-model"

const D = (s: string) => parseDay(s)!.from
const TODAY = D("2026-10-20")

describe("dates", () => {
  test("ISO, written, ranges and no year", () => {
    expect(iso(D("2026-04-09"))).toBe("2026-04-09")
    expect(iso(D("Apr 9, 2026"))).toBe("2026-04-09")
    expect(iso(D("2026-04-09T10:00:00Z"))).toBe("2026-04-09")
    const r = parseDay("Oct 14–16, 2026")!
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-10-14", "2026-10-16"])
    const across = parseDay("Jun 26 – Jul 2, 2026")!
    expect([iso(across.from), iso(across.to)]).toEqual(["2026-06-26", "2026-07-02"])
    expect(parseDay("May 7–8")).toBeNull()
    expect(iso(parseDay("May 7–8", 2026)!.to)).toBe("2026-05-08")
    expect(parseDay("soon")).toBeNull()
  })
  test("ranges read as short as they can", () => {
    expect(formatRange(D("2026-10-14"), D("2026-10-16"))).toBe("Oct 14–16, 2026")
    expect(formatRange(D("2026-06-26"), D("2026-07-02"))).toBe("Jun 26 – Jul 2, 2026")
    expect(formatRange(D("2026-09-19"), TODAY, true)).toBe("Sep 19, 2026 – today")
    expect(formatRange(D("2026-09-19"), D("2026-09-19"))).toBe("Sep 19, 2026")
  })
})

describe("scale", () => {
  test("date to x across the width, and back", () => {
    const from = D("2026-04-01")
    const s = dayScale(from, from + 200, 800)
    expect(s.x(from)).toBe(0)
    expect(s.x(from + 50)).toBe(200)
    expect(s.x(from + 200)).toBe(800)
    expect(s.day(400)).toBe(from + 100)
    expect(s.f(from + 100)).toBe(0.5)
  })
})

describe("ticks", () => {
  const from = D("2026-04-01")
  const to = D("2026-10-31")
  test("every month where there's room", () => {
    const t = monthTicks(from, to, 700)
    expect(t.map((x) => x.label)).toEqual(["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"])
  })
  test("thinned to every few months where it's narrow, on the calendar's own steps", () => {
    expect(monthTicks(from, to, 240).map((x) => x.label)).toEqual(["May", "Jul", "Sep"])
    expect(monthTicks(from, to, 120).map((x) => x.label)).toEqual(["Apr", "Jul", "Oct"])
  })
  test("January says its year; a tick never falls before the axis", () => {
    const t = monthTicks(D("2026-11-15"), D("2027-02-10"), 600)
    expect(t.map((x) => x.label)).toEqual(["Dec", "2027", "Feb"])
  })
  test("labels that would touch, leave the width or cover today's are left out", () => {
    const labels = [
      { x: 0, w: 24 },
      { x: 20, w: 24 },
      { x: 60, w: 24 },
      { x: 100, w: 24 },
      { x: 190, w: 24 },
    ]
    expect(fitLabels(labels, 200, [{ x0: 96, x1: 130 }])).toEqual([true, false, true, false, false])
  })
})

describe("spans", () => {
  test("clipped to the axis, the cut ends marked", () => {
    expect(clipSpan(10, 20, 0, 100)).toEqual({ from: 10, to: 20, clipStart: false, clipEnd: false })
    expect(clipSpan(-5, 20, 0, 100)).toEqual({ from: 0, to: 20, clipStart: true, clipEnd: false })
    expect(clipSpan(90, 120, 0, 100)).toEqual({ from: 90, to: 100, clipStart: false, clipEnd: true })
    expect(clipSpan(120, 130, 0, 100)).toBeNull()
  })
  test("a tag inside where it fits, the shorter one next, after the bar, or none", () => {
    expect(fitTag([60, 22], 100, 0)).toEqual({ index: 0, place: "inside" })
    expect(fitTag([60, 22], 40, 0)).toEqual({ index: 1, place: "inside" })
    expect(fitTag([60, 22], 20, 70)).toEqual({ index: 0, place: "after" })
    expect(fitTag([60, 22], 20, 30)).toEqual({ index: 1, place: "after" })
    expect(fitTag([60, 22], 20, 10)).toBeNull()
  })
  test("open spans run to today and tag their days", () => {
    const m = normalizeHistory(
      {
        axis: { today: "2026-10-20" },
        states: { broken: { label: "v2, broken", tone: "bad", tag: "{d}d broken" } },
        lanes: [{ id: "dl", label: "download", spans: [{ from: "2026-09-19", state: "broken" }] }],
      },
      TODAY,
    )
    const s = m.lanes[0]!.spans[0]!
    expect(s.open).toBe(true)
    expect(s.to).toBe(TODAY)
    expect(s.tags).toEqual(["31d broken", "31d"])
    expect(s.tone).toBe("bad")
    expect(m.to).toBeGreaterThan(TODAY)
  })
  test("band labels have room up to the next band", () => {
    const s = dayScale(0, 100, 100)
    const bands = [
      { from: 0, to: 60, label: "a" },
      { from: 40, to: 100, label: "b" },
    ]
    expect(bandRoom(bands, s.x)).toEqual([40, 60])
  })
})

describe("the walkthrough's older shape", () => {
  const groups = [
    {
      heading: "1 · Built in v1 (Apr – May 2026)",
      events: [
        { date: "Apr 9, 2026", title: "Modal shipped", type: "commit" },
        { date: "May 18, 2026", title: "Desktop modal", type: "commit" },
      ],
    },
    {
      heading: "2 · Deleted during the v2 rewrite (Jun – Aug 2026)",
      events: [
        { date: "Jun 26", title: "Rewrite", tone: "bad" as const },
        { date: "Oct 14–16, 2026", title: "Cold start", provenance: "inferred" as const },
      ],
    },
  ]
  test("headings lose their number and dates", () => {
    expect(bandLabel("1 · Built in v1 (Apr – May 2026)")).toBe("Built in v1")
    expect(bandLabel("Shipped")).toBe("Shipped")
  })
  test("events go on the code lane, groups become bands, missing years carry over", () => {
    const { events, bands } = fromGroups(groups, TODAY)
    expect(events.map((e) => [e.date, e.to, e.lane])).toEqual([
      ["2026-04-09", undefined, "code"],
      ["2026-05-18", undefined, "code"],
      ["2026-06-26", undefined, "code"],
      ["2026-10-14", "2026-10-16", "code"],
    ])
    expect(bands).toEqual([
      { from: "2026-04-09", to: "2026-05-18", label: "Built in v1" },
      { from: "2026-06-26", to: "2026-10-16", label: "Deleted during the v2 rewrite" },
    ])
  })
  test("normalized: one code lane, inferred noted, the axis from the month's start", () => {
    const m = normalizeHistory({ groups }, TODAY)
    expect(m.lanes.map((l) => l.id)).toEqual(["code"])
    expect(m.lanes[0]!.label).toBe("Code")
    expect(m.events).toHaveLength(4)
    expect(m.inferred).toBe(true)
    expect(iso(m.from)).toBe("2026-04-01")
    expect(m.bands).toHaveLength(2)
    expect(m.types).toEqual(["commit"])
  })
})

describe("keys", () => {
  const m = normalizeHistory(
    {
      lanes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      events: [
        { id: "late", date: "2026-09-01", lane: "a", title: "late" },
        { id: "b-mid", date: "2026-06-01", lane: "b", title: "b mid" },
        { id: "a-mid", date: "2026-06-01", lane: "a", title: "a mid" },
        { id: "first", date: "2026-04-01", title: "first" },
      ],
    },
    TODAY,
  )
  test("events in date order, then lane order", () => {
    expect(m.events.map((e) => e.id)).toEqual(["first", "a-mid", "b-mid", "late"])
    expect(m.lanes.map((l) => l.id)).toEqual(["code", "a", "b"])
  })
  test("→ and ← step, stopping at the ends; from nothing, the first or the last", () => {
    expect(stepEvent(m.events, null, 1)!.id).toBe("first")
    expect(stepEvent(m.events, null, -1)!.id).toBe("late")
    expect(stepEvent(m.events, "a-mid", 1)!.id).toBe("b-mid")
    expect(stepEvent(m.events, "a-mid", -1)!.id).toBe("first")
    expect(stepEvent(m.events, "late", 1)!.id).toBe("late")
    expect(stepEvent(m.events, "first", -1)!.id).toBe("first")
  })
  test("the pointer finds the nearest event within reach", () => {
    const lane = m.lanes[1]!.events
    const at = dayOf(2026, 5, 3)
    expect(nearestEvent(lane, at, 5)!.id).toBe("a-mid")
    expect(nearestEvent(lane, at, 1)).toBeNull()
  })
})

test("a tooltip's one line is the detail's first sentence", () => {
  expect(firstSentence("Added `retry.ts`. Then more.")).toBe("Added retry.ts.")
  expect(firstSentence("No stop")).toBe("No stop")
  expect(firstSentence(undefined)).toBe("")
})
