import { describe, expect, it } from "vitest"
import {
  boundsOf,
  dotGrid,
  fitView,
  keyAction,
  layoutCanvas,
  packRows,
  pinchView,
  releaseVelocity,
  rowWidth,
  snapView,
  toScreen,
  toWorld,
  viewPath,
  wheelZoom,
  WHEEL_ZOOM_MAX,
  zoomAround,
  type CanvasRect,
} from "../src/ui/canvas-model"

const overlaps = (rs: readonly CanvasRect[]) => {
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]!
      const b = rs[j]!
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return [i, j]
    }
  return null
}
const mixed = Array.from({ length: 40 }, (_, i) => ({
  w: [180, 320, 640, 240, 420][i % 5]!,
  h: [60, 140, 220, 400, 90][(i * 3) % 5]!,
}))

describe("layout", () => {
  it("packs rows in order, a gap apart, top-aligned and never overlapping", () => {
    const rs = packRows(mixed, { gap: 48, width: 1600 })
    expect(overlaps(rs)).toBeNull()
    for (const r of rs) expect(r.x + r.w).toBeLessThanOrEqual(1600 + 640)
    // In order: each tile is right of the last in its row, or starts a lower row at the left.
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1]!
      const b = rs[i]!
      if (b.y === a.y) expect(b.x).toBe(a.x + a.w + 48)
      else {
        expect(b.x).toBe(0)
        expect(b.y).toBeGreaterThan(a.y)
      }
    }
  })

  it("wraps before a tile would pass the width, unless it's first in its row", () => {
    const rs = packRows(
      [
        { w: 100, h: 10 },
        { w: 100, h: 30 },
        { w: 100, h: 10 },
        { w: 500, h: 10 },
      ],
      { gap: 10, width: 250 },
    )
    expect(rs.map((r) => [r.x, r.y])).toEqual([
      [0, 0],
      [110, 0],
      [0, 40],
      [0, 60],
    ])
  })

  it("lands on whole pixels", () => {
    const rs = packRows([{ w: 10.5, h: 3.3 }, { w: 7.25, h: 2 }, { w: 9, h: 9 }], { gap: 3.4, width: 20 })
    for (const r of rs) {
      expect(Number.isInteger(r.x)).toBe(true)
      expect(Number.isInteger(r.y)).toBe(true)
    }
  })

  it("sizes rows so the whole set comes out about the canvas's shape", () => {
    for (const aspect of [16 / 9, 1, 0.6]) {
      const width = rowWidth(mixed, 48, aspect)
      const b = boundsOf(packRows(mixed, { gap: 48, width }))!
      expect(b.w / b.h).toBeGreaterThan(aspect * 0.75)
      expect(b.w / b.h).toBeLessThan(aspect * 1.33)
    }
    expect(rowWidth([{ w: 900, h: 10 }], 48, 16 / 9)).toBeGreaterThanOrEqual(900)
  })

  it("keeps placed items where they are and packs the rest under them", () => {
    const { rects } = layoutCanvas(
      [
        { x: 100, y: 50, w: 200, h: 100 },
        { w: 80, h: 40 },
        { x: -40, y: 0, w: 60, h: 60 },
        { w: 80, h: 40 },
      ],
      { gap: 20, width: 1000 },
    )
    expect(rects[0]).toEqual({ x: 100, y: 50, w: 200, h: 100 })
    expect(rects[2]).toEqual({ x: -40, y: 0, w: 60, h: 60 })
    expect(rects[1]).toEqual({ x: -40, y: 190, w: 80, h: 40 })
    expect(rects[3]).toEqual({ x: 60, y: 190, w: 80, h: 40 })
  })
})

describe("zoom around a point", () => {
  it("keeps the world point under the pointer under it", () => {
    const v = { x: 37, y: -120, scale: 0.8 }
    const at = { x: 412, y: 233 }
    const before = toWorld(v, at)
    for (const s of [0.1, 0.5, 1, 2.5, 7]) {
      const z = zoomAround(v, s, at)
      expect(z.scale).toBe(s)
      const after = toScreen(z, before)
      expect(after.x).toBeCloseTo(at.x, 9)
      expect(after.y).toBeCloseTo(at.y, 9)
    }
  })

  it("clamps to the range and still holds the point", () => {
    const v = { x: 0, y: 0, scale: 1 }
    const at = { x: 300, y: 200 }
    const z = zoomAround(v, 100, at, 0.05, 8)
    expect(z.scale).toBe(8)
    expect(toScreen(z, toWorld(v, at)).x).toBeCloseTo(300, 9)
    expect(zoomAround(v, 0.001, at, 0.05, 8).scale).toBe(0.05)
  })

  it("composes: zooming in then out by the same factor returns", () => {
    const v = { x: 12, y: 34, scale: 1.3 }
    const at = { x: 500, y: 90 }
    const back = zoomAround(zoomAround(v, v.scale * 1.5, at), v.scale, at)
    expect(back.x).toBeCloseTo(v.x, 9)
    expect(back.y).toBeCloseTo(v.y, 9)
  })
})

describe("the hand's zoom", () => {
  it("a two-finger pinch keeps the world point under the old midpoint under the new one", () => {
    const v = { x: 37, y: -120, scale: 0.8 }
    const from = { x: 400, y: 300 }
    const world = toWorld(v, from)
    for (const [to, ratio] of [
      [{ x: 460, y: 250 }, 1.3],
      [{ x: 300, y: 380 }, 0.7],
      [{ x: 400, y: 300 }, 2],
      [{ x: 520, y: 310 }, 1],
    ] as const) {
      const p = pinchView(v, from, to, ratio)
      expect(p.scale).toBeCloseTo(v.scale * ratio, 9)
      const at = toScreen(p, world)
      expect(at.x).toBeCloseTo(to.x, 9)
      expect(at.y).toBeCloseTo(to.y, 9)
    }
  })

  it("a pinch held at the zoom's limit still follows the midpoint", () => {
    const v = { x: 0, y: 0, scale: 8 }
    const p = pinchView(v, { x: 100, y: 100 }, { x: 130, y: 90 }, 1.5, 0.05, 8)
    expect(p).toEqual({ x: 30, y: -10, scale: 8 })
  })

  it("wheel zoom applies directly, with no step at any delta, and at most 1.25x an event", () => {
    // Continuous across the old 40px threshold, either way.
    for (const pinch of [true, false]) {
      expect(Math.abs(wheelZoom(39.9, pinch) - wheelZoom(40, pinch))).toBeLessThan(0.002)
      expect(Math.abs(wheelZoom(-39.9, pinch) - wheelZoom(-40, pinch))).toBeLessThan(0.002)
    }
    // A trackpad pinch's small steps are untouched; a notch is clamped evenly.
    expect(wheelZoom(-5, true)).toBeCloseTo(Math.exp(0.05), 12)
    expect(wheelZoom(-100, true)).toBe(WHEEL_ZOOM_MAX)
    expect(wheelZoom(100, true)).toBe(1 / WHEEL_ZOOM_MAX)
    expect(wheelZoom(-120, false)).toBe(WHEEL_ZOOM_MAX)
    // Monotonic: more delta never zooms less.
    let last = Number.POSITIVE_INFINITY
    for (let d = -200; d <= 200; d += 0.5) {
      const f = wheelZoom(d, true)
      expect(f).toBeLessThanOrEqual(last)
      last = f
    }
  })
})

describe("fit", () => {
  const rect = { x: -200, y: 100, w: 2400, h: 900 }
  it("shows the whole rect, centred, inside the padding", () => {
    const v = fitView(rect, 1200, 800, { pad: 48 })
    const tl = toScreen(v, { x: rect.x, y: rect.y })
    const br = toScreen(v, { x: rect.x + rect.w, y: rect.y + rect.h })
    expect(tl.x).toBeGreaterThanOrEqual(48 - 1e-9)
    expect(tl.y).toBeGreaterThanOrEqual(48 - 1e-9)
    expect(br.x).toBeLessThanOrEqual(1200 - 48 + 1e-9)
    expect(br.y).toBeLessThanOrEqual(800 - 48 + 1e-9)
    // It touches the padding on the constraining axis (width here), centred on the other.
    expect(tl.x).toBeCloseTo(48, 9)
    expect((tl.y + br.y) / 2).toBeCloseTo(400, 9)
  })

  it("never zooms past max, staying centred", () => {
    const v = fitView({ x: 10, y: 10, w: 100, h: 50 }, 1200, 800, { pad: 48, max: 1 })
    expect(v.scale).toBe(1)
    expect(toScreen(v, { x: 60, y: 35 })).toEqual({ x: 600, y: 400 })
  })

  it("bounds a set of rects", () => {
    expect(boundsOf([])).toBeNull()
    expect(
      boundsOf([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: -5, y: 20, w: 10, h: 5 },
      ]),
    ).toEqual({ x: -5, y: 0, w: 15, h: 25 })
  })
})

describe("a jump between views", () => {
  const from = { x: 50, y: 20, scale: 0.4 }
  const to = { x: -900, y: -300, scale: 1.6 }
  it("starts and ends exactly", () => {
    const p = viewPath(from, to)
    expect(p(0).x).toBeCloseTo(from.x, 9)
    expect(p(0).scale).toBeCloseTo(from.scale, 9)
    expect(p(1)).toEqual(to)
  })

  it("moves every point on screen along one straight line, in one direction", () => {
    const p = viewPath(from, to)
    for (const w of [
      { x: 0, y: 0 },
      { x: 700, y: 400 },
      { x: -300, y: 1200 },
    ]) {
      const a = toScreen(from, w)
      const b = toScreen(to, w)
      let lastT = -1
      for (let i = 1; i < 20; i++) {
        const s = toScreen(p(i / 20), w)
        // On the segment a → b: collinear, and progress never goes back.
        const cross = (b.x - a.x) * (s.y - a.y) - (b.y - a.y) * (s.x - a.x)
        expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6)
        const t = ((s.x - a.x) * (b.x - a.x) + (s.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
        expect(t).toBeGreaterThanOrEqual(lastT)
        lastT = t
      }
    }
  })

  it("pans straight at one scale", () => {
    const p = viewPath({ x: 0, y: 0, scale: 1 }, { x: 100, y: -50, scale: 1 })
    expect(p(0.5)).toEqual({ x: 50, y: -25, scale: 1 })
  })
})

describe("resting", () => {
  it("snaps the translate to device pixels", () => {
    expect(snapView({ x: 10.3, y: -4.74, scale: 1.5 }, 2)).toEqual({ x: 10.5, y: -4.5, scale: 1.5 })
    expect(snapView({ x: 10.3, y: 4.7, scale: 1 }, 1)).toEqual({ x: 10, y: 5, scale: 1 })
  })

  it("dots fade as they crowd and as they spread, and scale with the zoom", () => {
    expect(dotGrid(1).size).toBe(24)
    expect(dotGrid(1).alpha).toBe(1)
    expect(dotGrid(0.1).alpha).toBe(0)
    expect(dotGrid(8).alpha).toBe(0)
    expect(dotGrid(0.45).alpha).toBeGreaterThan(0)
    expect(dotGrid(0.45).alpha).toBeLessThan(1)
  })

  it("measures the hand's release speed over its last moments", () => {
    const s = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 16 },
      { x: 20, y: 5, t: 32 },
      { x: 30, y: 10, t: 48 },
    ]
    const v = releaseVelocity(s, 50)
    expect(v.x).toBeCloseTo(625, 0)
    expect(v.y).toBeCloseTo(208.3, 0)
    // Held still before letting go: no coast.
    expect(releaseVelocity(s, 200)).toEqual({ x: 0, y: 0 })
  })
})

describe("keys", () => {
  it("maps 0, 1, = and - (with their shifted forms)", () => {
    expect(keyAction({ key: "0" })).toBe("fit")
    expect(keyAction({ key: "1" })).toBe("actual")
    expect(keyAction({ key: "=" })).toBe("in")
    expect(keyAction({ key: "+" })).toBe("in")
    expect(keyAction({ key: "-" })).toBe("out")
    expect(keyAction({ key: "_" })).toBe("out")
    expect(keyAction({ key: "a" })).toBeNull()
    expect(keyAction({ key: "0", altKey: true })).toBeNull()
  })
})
