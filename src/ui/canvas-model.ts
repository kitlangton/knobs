// The infinite canvas's math, apart from the DOM: where tiles go, how the view zooms around a
// point, fits a set of rects, travels between two views, and where its dots fall.

/** The camera: a world point `p` is drawn at `p * scale + (x, y)` in the canvas's own px. */
export interface CanvasView {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export interface CanvasRect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface CanvasPoint {
  readonly x: number
  readonly y: number
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Tiles in rows, in order: each row takes tiles until the next would pass `width`, rows sit `gap`
 * apart and tiles top-align in them. Rects land on whole px, so at 100% they're on the pixel grid.
 */
export function packRows(
  sizes: readonly { readonly w: number; readonly h: number }[],
  opts: { readonly gap: number; readonly width: number; readonly x?: number; readonly y?: number },
): CanvasRect[] {
  const { gap, width } = opts
  const x0 = opts.x ?? 0
  let x = 0
  let y = opts.y ?? 0
  let rowH = 0
  return sizes.map((s) => {
    if (x > 0 && x + s.w > width) {
      x = 0
      y += rowH + gap
      rowH = 0
    }
    const r = { x: Math.round(x0 + x), y: Math.round(y), w: s.w, h: s.h }
    x += s.w + gap
    rowH = Math.max(rowH, s.h)
    return r
  })
}

/**
 * How wide rows run so the packed set comes out about `aspect` (width / height): a bisection
 * between the widest tile and one long row, on how the packing actually comes out.
 */
export function rowWidth(
  sizes: readonly { readonly w: number; readonly h: number }[],
  gap: number,
  aspect: number,
) {
  let widest = 0
  let total = 0
  for (const s of sizes) {
    widest = Math.max(widest, s.w)
    total += s.w + gap
  }
  if (!sizes.length) return 0
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 10
  const shape = (width: number) => {
    const b = boundsOf(packRows(sizes, { gap, width }))!
    return b.w / Math.max(1, b.h)
  }
  let lo = widest
  let hi = Math.max(widest, total)
  for (let i = 0; i < 24 && hi - lo > 1; i++) {
    const mid = (lo + hi) / 2
    if (shape(mid) < a) lo = mid
    else hi = mid
  }
  return Math.abs(Math.log(shape(lo) / a)) <= Math.abs(Math.log(shape(hi) / a)) ? lo : hi
}

/**
 * Where every item goes: one with an `x` and `y` stays there; the rest pack in rows (`packRows`),
 * under the placed ones if there are any.
 */
export function layoutCanvas(
  items: readonly {
    readonly x?: number
    readonly y?: number
    readonly w: number
    readonly h: number
  }[],
  opts: { readonly gap: number; readonly width?: number; readonly aspect?: number },
): { rects: CanvasRect[]; width: number } {
  const placed = items.flatMap((it) =>
    it.x !== undefined && it.y !== undefined ? [{ x: it.x, y: it.y, w: it.w, h: it.h }] : [],
  )
  const free = items.filter((it) => it.x === undefined || it.y === undefined)
  const width = opts.width ?? rowWidth(free, opts.gap, opts.aspect ?? 16 / 10)
  const under = boundsOf(placed)
  const packed = packRows(free, {
    gap: opts.gap,
    width,
    x: under ? under.x : 0,
    y: under ? under.y + under.h + opts.gap * 2 : 0,
  })
  let i = 0
  const rects = items.map((it) =>
    it.x !== undefined && it.y !== undefined
      ? { x: it.x, y: it.y, w: it.w, h: it.h }
      : packed[i++]!,
  )
  return { rects, width }
}

/** The rect around `rects`, or null for none. */
export function boundsOf(rects: readonly CanvasRect[]): CanvasRect | null {
  if (!rects.length) return null
  let x0 = Number.POSITIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Screen (canvas px) to world, and back. */
export const toWorld = (v: CanvasView, p: CanvasPoint): CanvasPoint => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale,
})
export const toScreen = (v: CanvasView, p: CanvasPoint): CanvasPoint => ({
  x: p.x * v.scale + v.x,
  y: p.y * v.scale + v.y,
})

/** The view at `scale` (clamped to `min`…`max`), with the world point under `at` still under it. */
export function zoomAround(
  v: CanvasView,
  scale: number,
  at: CanvasPoint,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): CanvasView {
  const s = clamp(scale, min, max)
  const k = s / v.scale
  return { x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k, scale: s }
}

/**
 * Two fingers moved: the world point under their old midpoint `from` lands under the new one
 * `to`, with the zoom times `ratio` (zoom around `from`, then follow the midpoint).
 */
export function pinchView(
  v: CanvasView,
  from: CanvasPoint,
  to: CanvasPoint,
  ratio: number,
  min = 0,
  max = Number.POSITIVE_INFINITY,
): CanvasView {
  const z = zoomAround(v, v.scale * ratio, from, min, max)
  return { x: z.x + to.x - from.x, y: z.y + to.y - from.y, scale: z.scale }
}

/** The most one wheel event zooms (a mouse wheel's notch under ⌘ or ctrl). */
export const WHEEL_ZOOM_MAX = 1.25

/**
 * One ⌘/ctrl-wheel event's zoom factor, applied directly: a trackpad pinch (ctrl) at 1% per px,
 * ⌘-scroll at .25%, and never more than `WHEEL_ZOOM_MAX` either way per event, so a mouse
 * wheel's big notches step evenly without springing.
 */
export function wheelZoom(deltaY: number, pinch: boolean): number {
  const f = Math.exp(-deltaY * (pinch ? 0.01 : 0.0025))
  return clamp(f, 1 / WHEEL_ZOOM_MAX, WHEEL_ZOOM_MAX)
}

/** The view that shows `r` whole and centred in a `w` × `h` canvas, `pad` px in from its edges. */
export function fitView(
  r: CanvasRect,
  w: number,
  h: number,
  opts: { readonly pad?: number; readonly min?: number; readonly max?: number } = {},
): CanvasView {
  const pad = opts.pad ?? 0
  const room = (n: number) => Math.max(1, n - pad * 2)
  const raw = Math.min(room(w) / Math.max(1, r.w), room(h) / Math.max(1, r.h))
  const scale = clamp(raw, opts.min ?? 0, opts.max ?? Number.POSITIVE_INFINITY)
  return {
    x: w / 2 - (r.x + r.w / 2) * scale,
    y: h / 2 - (r.y + r.h / 2) * scale,
    scale,
  }
}

/**
 * A path between two views, `t` 0 → 1. It zooms around the one canvas point both views agree on,
 * at an even rate in log scale, so every point on screen travels one straight line in one
 * direction (no curve from springing x, y and scale apart). Views at the same scale pan straight.
 */
export function viewPath(from: CanvasView, to: CanvasView): (t: number) => CanvasView {
  const k = to.scale / from.scale
  if (!Number.isFinite(k) || Math.abs(Math.log(k)) < 1e-4)
    return (t) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      scale: from.scale + (to.scale - from.scale) * t,
    })
  // The fixed point: where (screen - from) * k = screen - to.
  const fx = (to.x - k * from.x) / (1 - k)
  const fy = (to.y - k * from.y) / (1 - k)
  const wx = (fx - from.x) / from.scale
  const wy = (fy - from.y) / from.scale
  return (t) => {
    if (t >= 1) return to
    const scale = from.scale * k ** t
    return { x: fx - wx * scale, y: fy - wy * scale, scale }
  }
}

/** The translate on the device-pixel grid, so a resting view draws crisp. */
export const snapView = (v: CanvasView, dpr: number): CanvasView => {
  const d = dpr > 0 ? dpr : 1
  return { x: Math.round(v.x * d) / d, y: Math.round(v.y * d) / d, scale: v.scale }
}

const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The background's dots: `step` world px apart, drawn `size` canvas px apart, and how strongly
 * (0…1): they fade out as they crowd together zooming out and as they spread apart zooming in.
 */
export function dotGrid(scale: number, step = 24) {
  const size = step * scale
  const alpha = smooth(7, 14, size) * (1 - smooth(72, 128, size))
  return { size, alpha }
}

/** What a key does to the view: 0 fits, 1 is 100%, = and - zoom in and out. */
export type CanvasKey = "fit" | "actual" | "in" | "out"
export function keyAction(e: {
  readonly key: string
  readonly altKey?: boolean
}): CanvasKey | null {
  if (e.altKey) return null
  switch (e.key) {
    case "0":
      return "fit"
    case "1":
      return "actual"
    case "=":
    case "+":
      return "in"
    case "-":
    case "_":
      return "out"
    default:
      return null
  }
}

/** How far each zoom key steps. */
export const KEY_ZOOM = 1.5

/**
 * The hand's velocity at release (px/s) from recent samples `{ x, y, t (ms) }`: the travel over
 * the last `window` ms. Zero if the hand had already stopped.
 */
export function releaseVelocity(
  samples: readonly { readonly x: number; readonly y: number; readonly t: number }[],
  now: number,
  window = 80,
): CanvasPoint {
  const last = samples.at(-1)
  if (!last || now - last.t > 60) return { x: 0, y: 0 }
  let first = last
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i]!.t > window) break
    first = samples[i]!
  }
  const dt = (last.t - first.t) / 1000
  if (dt <= 0) return { x: 0, y: 0 }
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
}

/** Momentum's time constant (s): the coast slows as iOS's scroll does (0.998 per ms). */
export const COAST_TAU = -1 / (1000 * Math.log(0.998))
