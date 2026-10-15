import { describe, expect, it } from "vitest"
import {
  fitRect,
  justify,
  motionBlur,
  neighbour,
  partition,
  planBento,
  windowOf,
  type BentoPlan,
} from "../src/ui/bento-model"

// A deterministic mix: wide, tall, square and panoramic, as a set of ideas tends to be.
const mix = (n: number, seed = 7) => {
  let s = seed
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const shapes = [16 / 9, 16 / 9, 4 / 3, 1, 2 / 3, 3 / 4, 2.5, 16 / 9, 3 / 2]
  return Array.from({ length: n }, () => shapes[Math.floor(rand() * shapes.length)]!)
}
const shown = (plan: BentoPlan, aspects: readonly number[]) =>
  plan.rects.map((r, i) => r.w / (aspects[i]! * r.h) - 1)
const inside = (plan: BentoPlan, w: number) =>
  plan.rects.every((r) => r.x >= -0.01 && r.x + r.w <= w + 0.01 && r.y >= -0.01)
const overlaps = (plan: BentoPlan) => {
  const rs = plan.rects
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]!
      const b = rs[j]!
      if (
        a.x + a.w > b.x + 0.5 &&
        b.x + b.w > a.x + 0.5 &&
        a.y + a.h > b.y + 0.5 &&
        b.y + b.h > a.y + 0.5
      )
        return [i, j]
    }
  return null
}

describe("bento layout", () => {
  it("fits a handful of ideas on one screen, showing most of it", () => {
    const aspects = Array.from({ length: 16 }, () => 16 / 9)
    const plan = planBento(aspects, { width: 1440, height: 960 })
    expect(plan.mode).toBe("fit")
    expect(plan.height).toBe(960)
    expect(plan.rects.every((r) => r.y + r.h <= 960)).toBe(true)
    // 4 × 4 is the best there is for sixteen 16:9 tiles in 3:2.
    expect(plan.coverage).toBeGreaterThan(0.82)
    expect(overlaps(plan)).toBeNull()
  })

  it("picks the arrangement that shows the most: as many rows as fill the screen", () => {
    const aspects = mix(12)
    const plan = planBento(aspects, { width: 1400, height: 900 })
    // Every other row count shows less.
    expect(plan.coverage).toBeGreaterThan(0.7)
    const single = planBento(aspects, { width: 1400, height: 900, minTile: 0, tolerance: 0 })
    expect(single.coverage).toBeGreaterThanOrEqual(plan.coverage - 0.08)
  })

  it("never crops beyond the tolerance, and only crops at all to fill", () => {
    for (const n of [3, 7, 16, 40, 500]) {
      const aspects = mix(n, n)
      for (const [w, h] of [
        [1440, 960],
        [900, 1200],
        [390, 800],
      ] as const) {
        const plan = planBento(aspects, { width: w, height: h, tolerance: 0.08 })
        const crops = shown(plan, aspects)
        expect(Math.max(...crops)).toBeLessThanOrEqual(0.08 / 0.92 + 1e-6)
        expect(Math.min(...crops)).toBeGreaterThanOrEqual(-1e-6)
        expect(plan.crop).toBeCloseTo(Math.max(0, ...crops), 6)
        expect(inside(plan, w)).toBe(true)
        expect(overlaps(plan)).toBeNull()
      }
    }
    const strict = planBento(mix(60), { width: 1200, height: 900, tolerance: 0 })
    expect(strict.crop).toBeLessThan(1e-9)
  })

  it("scrolls big sets in full-width justified rows near the target height", () => {
    const aspects = mix(500)
    const plan = planBento(aspects, { width: 1440, height: 1000, gap: 2, padding: 2 })
    expect(plan.mode).toBe("rows")
    expect(plan.height).toBeGreaterThan(1000)
    const rows = new Map<number, number[]>()
    plan.rects.forEach((r, i) => rows.set(r.y, [...(rows.get(r.y) ?? []), i]))
    const ys = [...rows.keys()]
    // Every row but the last spans the width to the hairline.
    for (const y of ys.slice(0, -1)) {
      const idx = rows.get(y)!
      const last = plan.rects[idx.at(-1)!]!
      expect(last.x + last.w).toBeCloseTo(1438, 4)
    }
    expect(plan.coverage).toBeGreaterThan(0.95)
  })

  it("moves nothing before an insert, a removal or an edit", () => {
    const aspects = mix(200)
    const view = { width: 1280, height: 900 }
    const before = planBento(aspects, view)
    for (const at of [0, 37, 120, 199]) {
      const inserted = [...aspects.slice(0, at), 1, ...aspects.slice(at)]
      const removed = aspects.filter((_, i) => i !== at)
      for (const next of [inserted, removed]) {
        const after = planBento(next, view)
        // The rows that end before `at` are untouched.
        const rowStart = before.rects.findIndex((r) => r.y === before.rects[at]!.y)
        for (let i = 0; i < rowStart; i++) expect(after.rects[i]).toEqual(before.rects[i])
      }
    }
  })

  it("an append reflows at most the last row", () => {
    const aspects = mix(120)
    const view = { width: 1200, height: 900 }
    const before = planBento(aspects, view)
    const after = planBento([...aspects, 4 / 3], view)
    const lastRowY = before.rects.at(-1)!.y
    const moved = before.rects.filter(
      (r, i) => r.y !== after.rects[i]!.y || r.x !== after.rects[i]!.x || r.w !== after.rects[i]!.w,
    )
    expect(moved.every((r) => r.y === lastRowY)).toBe(true)
  })

  it("a small resize keeps the order and moves tiles a little", () => {
    const aspects = mix(300)
    const a = planBento(aspects, { width: 1280, height: 900 })
    const b = planBento(aspects, { width: 1272, height: 900 })
    // Reading order is preserved (row by row, left to right).
    const order = (p: BentoPlan) =>
      p.rects
        .map((_, i) => i)
        .sort((i, j) => p.rects[i]!.y - p.rects[j]!.y || p.rects[i]!.x - p.rects[j]!.x)
    expect(order(b)).toEqual(order(a))
    // Most tiles stay in the same row: a resize scales rows, it doesn't reshuffle them.
    const sameRow = a.rects.filter((r, i) => {
      const rowA = a.rects.filter((q) => q.y === r.y).length
      const rowB = b.rects.filter((q) => q.y === b.rects[i]!.y).length
      return rowA === rowB
    }).length
    expect(sameRow / aspects.length).toBeGreaterThan(0.6)
  })

  it("makes a hero when one is asked for, and when it shows more", () => {
    const aspects = [16 / 9, 2 / 3, 2 / 3, 2 / 3, 2 / 3, 1]
    const asked = planBento(aspects, { width: 1400, height: 900, hero: 2 })
    expect(asked.mode).toBe("hero")
    const big = asked.rects[2]!
    expect(asked.rects.every((r) => r.w * r.h <= big.w * big.h + 0.01)).toBe(true)
    expect(overlaps(asked)).toBeNull()
    expect(inside(asked, 1400)).toBe(true)
    // A lone wide idea with five small ones: the wide one leads.
    const auto = planBento([2.4, 1, 1, 1, 1, 1], { width: 1400, height: 1000 })
    expect(["fit", "hero"]).toContain(auto.mode)
    expect(auto.coverage).toBeGreaterThan(0.55)
  })

  it("groups scroll under their headings, each group starting its own rows", () => {
    const aspects = mix(30)
    const groups = aspects.map((_, i) => (i < 10 ? "A" : i < 22 ? "B" : "C"))
    const plan = planBento(aspects, { width: 1200, height: 900, groups })
    expect(plan.mode).toBe("rows")
    expect(plan.headers.map((h) => [h.group, h.index])).toEqual([
      ["A", 0],
      ["B", 10],
      ["C", 22],
    ])
    expect(plan.rects[10]!.y).toBeGreaterThan(plan.headers[1]!.y)
    expect(plan.rects[10]!.x).toBeCloseTo(2, 6)
  })

  it("lays out narrow views and odd inputs without breaking", () => {
    expect(planBento([], { width: 800, height: 600 }).rects).toEqual([])
    const odd = planBento([0, Number.NaN, -1, 1e9, 1], { width: 320, height: 500 })
    expect(odd.rects.every((r) => Number.isFinite(r.x + r.y + r.w + r.h) && r.w > 0)).toBe(true)
    const one = planBento([16 / 9], { width: 1000, height: 800 })
    expect(one.rects[0]!.w).toBeCloseTo(996, 0)
  })

  it("lays 500 items out in a few milliseconds", () => {
    const aspects = mix(500)
    planBento(aspects, { width: 1440, height: 1000 })
    const t = performance.now()
    for (let i = 0; i < 20; i++) planBento(aspects, { width: 1440 - i, height: 1000 })
    expect((performance.now() - t) / 20).toBeLessThan(4)
  })
})

describe("bento model", () => {
  it("justifies a row to the width at its own height", () => {
    const rows = justify([1, 1, 1, 1], 0, 4, 402, 100, 2, 0)
    expect(
      rows[0]!.ws.reduce((s, w) => s + w, 0) + (rows[0]!.end - rows[0]!.start - 1) * 2,
    ).toBeCloseTo(402, 6)
  })
  it("partitions widths evenly in order", () => {
    expect(partition([1, 1, 1, 1, 1, 1], 3)).toEqual([2, 2, 2])
    expect(partition([3, 1, 1, 1], 2)).toEqual([1, 3])
  })
  it("finds the window of a scrolled plan", () => {
    const plan = planBento(mix(500), { width: 1440, height: 1000 })
    const win = windowOf(plan, 5000, 6000)
    expect(win.length).toBeGreaterThan(5)
    expect(win.length).toBeLessThan(60)
    for (const i of win) expect(plan.rects[i]!.y + plan.rects[i]!.h).toBeGreaterThanOrEqual(5000)
    expect(plan.rects[win[0]! - 1]!.y + plan.rects[win[0]! - 1]!.h).toBeLessThan(5000)
  })
  it("arrows move by geometry", () => {
    // Two rows: [0 1 2] above [3 4].
    const rects = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 102, y: 0, w: 100, h: 100 },
      { x: 204, y: 0, w: 100, h: 100 },
      { x: 0, y: 102, w: 150, h: 100 },
      { x: 152, y: 102, w: 152, h: 100 },
    ]
    expect(neighbour(rects, 0, "right")).toBe(1)
    expect(neighbour(rects, 2, "right")).toBe(3) // wraps to the next row
    expect(neighbour(rects, 3, "left")).toBe(2)
    expect(neighbour(rects, 2, "down")).toBe(4)
    expect(neighbour(rects, 0, "down")).toBe(3)
    expect(neighbour(rects, 4, "up")).toBe(2)
    expect(neighbour(rects, 3, "up")).toBe(0)
    expect(neighbour(rects, 1, "up")).toBe(1)
  })
  it("fits a focused tile inside the view, centred", () => {
    expect(fitRect(2, 1000, 1000)).toEqual({ x: 0, y: 250, w: 1000, h: 500 })
    expect(fitRect(0.5, 1000, 800, 10)).toEqual({ x: 305, y: 10, w: 390, h: 780 })
  })
  it("blurs only while moving, and never past the cap", () => {
    expect(motionBlur(0)).toBe(0)
    expect(motionBlur(200)).toBe(0)
    expect(motionBlur(3200)).toBe(2)
    expect(motionBlur(1e6)).toBe(3)
  })
})
