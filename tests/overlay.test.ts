import { describe, expect, test } from "vitest"
import { fuzzy, marks, place, rank } from "../src/ui/overlay-model"
import { palettePresence } from "../src/ui/palette"

const view = { x: 0, y: 0, w: 800, h: 600 }

describe("place", () => {
  test("below the anchor, centred, offset", () => {
    const p = place({ anchor: { x: 100, y: 100, w: 40, h: 20 }, size: { w: 100, h: 50 }, view })
    expect(p).toMatchObject({ x: 70, y: 126, placement: "bottom" })
    expect(p.origin).toEqual({ x: 50, y: 0 })
  })
  test("start and end align to the anchor's edges", () => {
    const a = { x: 100, y: 100, w: 40, h: 20 }
    expect(place({ anchor: a, size: { w: 100, h: 50 }, view, placement: "bottom-start" }).x).toBe(
      100,
    )
    expect(place({ anchor: a, size: { w: 100, h: 50 }, view, placement: "bottom-end" }).x).toBe(40)
    expect(
      place({ anchor: a, size: { w: 30, h: 50 }, view, placement: "right-start" }),
    ).toMatchObject({ x: 146, y: 100 })
  })
  test("flips when its side is short and the other has more room", () => {
    const p = place({ anchor: { x: 100, y: 560, w: 40, h: 20 }, size: { w: 100, h: 80 }, view })
    expect(p.placement).toBe("top")
    expect(p.y).toBe(560 - 6 - 80)
    expect(p.origin.y).toBe(80)
    const keep = place({
      anchor: { x: 100, y: 20, w: 40, h: 20 },
      size: { w: 100, h: 700 },
      view,
      placement: "bottom",
    })
    expect(keep.placement).toBe("bottom")
    const left = place({
      anchor: { x: 760, y: 100, w: 20, h: 20 },
      size: { w: 120, h: 40 },
      view,
      placement: "right-start",
    })
    expect(left.placement).toBe("left-start")
    expect(left.x).toBe(760 - 6 - 120)
  })
  test("shifts along its side to stay inside the view, and the origin follows the anchor", () => {
    const p = place({ anchor: { x: 4, y: 100, w: 20, h: 20 }, size: { w: 200, h: 40 }, view })
    expect(p.x).toBe(8)
    expect(p.origin.x).toBe(4 + 10 - 8)
    const r = place({ anchor: { x: 790, y: 100, w: 10, h: 20 }, size: { w: 200, h: 40 }, view })
    expect(r.x).toBe(800 - 8 - 200)
  })
})

describe("fuzzy", () => {
  test("characters in order, case-insensitive; null otherwise", () => {
    expect(fuzzy("rst", "Reset all")?.indices).toEqual([0, 2, 4])
    expect(fuzzy("xyz", "Reset all")).toBeNull()
    expect(fuzzy("tser", "Reset")).toBeNull()
    expect(fuzzy("", "Anything")).toEqual({ score: 0, indices: [] })
  })
  test("prefers word starts and runs over the first occurrence", () => {
    expect(fuzzy("sa", "Reset all")?.indices).toEqual([2, 6])
    expect(fuzzy("ra", "Reset all")?.indices).toEqual([0, 6])
    expect(fuzzy("all", "Reset all · tall")?.indices).toEqual([6, 7, 8])
    expect(fuzzy("dd", "Drop density")?.indices).toEqual([0, 5])
    // camelCase boundaries count as word starts.
    expect(fuzzy("fs", "fallSpeed")?.indices).toEqual([0, 4])
  })
  test("scores: prefix > word starts > scattered", () => {
    const s = (q: string, t: string) => fuzzy(q, t)!.score
    expect(s("pre", "Preset")).toBeGreaterThan(s("pre", "Compress"))
    expect(s("ds", "Drop size")).toBeGreaterThan(s("ds", "Odds"))
    expect(s("pause", "Pause feed")).toBeGreaterThan(s("pause", "Play · use"))
  })
  test("spaces in the query are ignored", () => {
    expect(fuzzy("re al", "Reset all")?.indices).toEqual([0, 1, 6, 7])
  })
})

describe("rank", () => {
  const items = [
    { label: "Clear log", section: "Live" },
    { label: "Collapse all", section: "Outliner" },
    { label: "Pause feed", section: "Live", keywords: ["stop"] },
    { label: "Drop size", section: "Precipitation" },
  ]
  test("best first; keywords and the section match too, below labels", () => {
    expect(rank(items, "cl").map((r) => r.item.label)).toEqual(["Clear log", "Collapse all"])
    const stop = rank(items, "stop")
    expect(stop.map((r) => r.item.label)).toEqual(["Pause feed"])
    expect(stop[0]!.indices).toEqual([])
    expect(rank(items, "precip").map((r) => r.item.label)).toEqual(["Drop size"])
    expect(rank(items, "").map((r) => r.item.label)).toEqual(items.map((i) => i.label))
  })
  test("letters strewn across a section and label don't count", () => {
    const strewn = [
      { label: "Turn on Flashlight beam", section: "Details · Weather stage" },
      { label: "Drop size", section: "Weather · Precipitation" },
      { label: "Direction", section: "Inspector · Emitter" },
    ]
    expect(rank(strewn, "dro").map((r) => r.item.label)).toEqual(["Drop size", "Direction"])
  })
  test("marks splits text into hit runs", () => {
    expect(marks("Reset", [0, 1, 4])).toEqual([
      { text: "Re", hit: true },
      { text: "se", hit: false },
      { text: "t", hit: true },
    ])
  })
})

describe("palettePresence", () => {
  test("fades by default, about 80 ms each way, with no travel", () => {
    expect(palettePresence()).toEqual({
      scale: 1,
      blur: 0,
      dy: 0,
      duration: 0.08,
      exit: 0.08,
      bounce: 0,
    })
    expect(palettePresence("fade")).toEqual(palettePresence())
  })
  test("none or false: no motion at all", () => {
    expect(palettePresence("none")).toBeNull()
    expect(palettePresence(false)).toBeNull()
  })
  test("a spring of its own fills the rest from the full entrance, leaving shorter", () => {
    expect(palettePresence({})).toEqual({
      scale: 0.96,
      blur: 8,
      dy: -8,
      duration: 0.34,
      exit: 0.2,
      bounce: 0,
    })
    expect(palettePresence({ duration: 0.12, blur: 0 })).toMatchObject({
      duration: 0.12,
      exit: 0.12,
      blur: 0,
      scale: 0.96,
    })
  })
})
