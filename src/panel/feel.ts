// How a drag feels under the hand, as pure maths both renderers and the tests share.
//
// Precision by distance: moving the pointer away from the row it's dragging slows the drag in
// smooth halvings, like scrubbing video on iOS. The value integrates the hand's travel at the
// current rate, so changing the rate never moves it.
//
// Magnetic detents: the value sticks to a few values (the default, the active preset's value,
// round numbers) within a few px and lets go once pushed through. The pull is a warp of the
// hand's position (flat on the detent, a little steeper either side), continuous and monotonic,
// so pushing slowly through one is a gentle notch, never a jump or a stutter. A slower drag
// weakens it, so a fine move can sit right beside a detent.

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Where each halving of the rate happens (px off the row: from, to). ×1 within 24 px, ×½ around
 * 60, ×¼ around 110, ×⅛ beyond 146.
 */
export const PRECISION: readonly (readonly [number, number])[] = [
  [24, 44],
  [76, 96],
  [126, 146],
]

/** How far (px) a pointer at `y` is off a row spanning `top`..`bottom` (0 on it). */
export const offRow = (y: number, top: number, bottom: number) => Math.max(0, top - y, y - bottom)

/** How many halvings a drag `off` px from its row moves at: 0 near it, up to 3, smoothly. */
export const precisionDepth = (off: number) =>
  PRECISION.reduce((n, [a, b]) => n + smooth(a, b, Math.abs(off)), 0)

/** The rate (value per px of the hand, relative to 1:1) a drag `off` px from its row moves at. */
export const precisionRate = (off: number) => 2 ** -precisionDepth(off)

/** The ruler's levels: intervals across the track, tick height (px) and the accent's alpha. */
export const RULER: readonly (readonly [number, number, number])[] = [
  [20, 5, 0.2],
  [40, 4, 0.17],
  [80, 3, 0.14],
]
/** The ruler shows in full within `RULER_NEAR` px of the handle, fading out by `RULER_FADE`. */
export const RULER_NEAR = 36
export const RULER_FADE = 120

/** The ruler's finest level a slider of `steps` steps shows (each halves the last, from tenths). */
export const rulerLevels = (steps: number) => {
  let n = 0
  while (n < 3 && 10 * 2 ** (n + 1) <= steps) n++
  return n
}

/** How much of ruler level `level` (1–3) shows at `depth` halvings. */
export const rulerAlpha = (depth: number, level: number) => clamp(depth - (level - 1), 0, 1)

/** The depth a ruler shows for a drag at `rate` (with ⌥'s tenth folded in), at most `levels`. */
export const rulerDepth = (rate: number, levels: number) =>
  rate >= 1 ? 0 : clamp(-Math.log2(rate), 0, levels)

export type DetentKind = "default" | "base" | "round"

/** A detent's hold (px either side where the value sticks) and the ramp past it (px). */
export const DETENTS: Readonly<
  Record<DetentKind, { readonly hold: number; readonly ramp: number }>
> = {
  default: { hold: 4, ramp: 6 },
  base: { hold: 4, ramp: 6 },
  round: { hold: 2.5, ramp: 4 },
}

/** How strong detents are at a drag's rate: full at 1:1, weaker faster than the rate slows. */
export const detentScale = (rate: number) => clamp(rate, 0, 1) ** 1.5

export interface Detent {
  /** Where it sits along the track (px). */
  readonly at: number
  /** The value it holds. */
  readonly value: number
  readonly kind: DetentKind
}

const reach = (d: Detent, k = 1) => {
  const { hold, ramp } = DETENTS[d.kind]
  return { h: hold * k, r: ramp * k }
}

/**
 * The detents of a track `width` px wide: its default first, then the active preset's value,
 * then the round values given, each dropped where it would crowd one before it.
 */
export function detentsOf(
  width: number,
  min: number,
  max: number,
  o: { readonly value: number; readonly base?: number; readonly round?: readonly number[] },
): Detent[] {
  const span = max - min
  if (!(span > 0) || !(width > 0)) return []
  const list: Detent[] = []
  const add = (value: number | undefined, kind: DetentKind) => {
    if (value === undefined || !Number.isFinite(value) || value < min || value > max) return
    const at = ((value - min) / span) * width
    const room = (d: Detent) => {
      const a = reach(d)
      const b = DETENTS[kind]
      return a.h + a.r + b.hold + b.ramp
    }
    if (list.some((d) => Math.abs(d.at - at) < room(d))) return
    list.push({ at, value, kind })
  }
  add(o.value, "default")
  add(o.base, "base")
  for (const v of o.round ?? []) add(v, "round")
  return list
}

/** A range's round values worth a detent: its middle, and zero when it lies inside. */
export const roundValues = (min: number, max: number) => {
  const mid = Number(((min + max) / 2).toPrecision(12))
  return min < 0 && max > 0 && mid !== 0 ? [0, mid] : [mid]
}

/**
 * Where the value shows for a hand at `x` (px): on a detent within its hold, catching up a little
 * faster than the hand just past it, and the hand's own position beyond. `k` scales the detents.
 */
export function warp(x: number, list: readonly Detent[], k = 1): number {
  for (const d of list) {
    const { h, r } = reach(d, k)
    const u = x - d.at
    const a = Math.abs(u)
    if (a >= h + r) continue
    if (a <= h) return d.at
    return d.at + (Math.sign(u) * (a - h) * (h + r)) / r
  }
  return x
}

/**
 * The hand position that shows `shown` with detents at strength `k` (`warp`'s inverse); on a
 * detent, the one nearest `x`. Re-anchoring here when the strength changes keeps the value still.
 */
export function unwarp(shown: number, x: number, list: readonly Detent[], k = 1): number {
  for (const d of list) {
    const { h, r } = reach(d, k)
    const v = shown - d.at
    const a = Math.abs(v)
    if (a >= h + r) continue
    if (a === 0) return d.at + clamp(x - d.at, -h, h)
    return d.at + Math.sign(v) * (h + (a * r) / (h + r))
  }
  return shown
}

/** How far (px, at least) past a detent's reach the hand goes before it can catch again. */
const REARM = 2

/**
 * A drag's detents: where the value shows, which detent holds it, and the moment one catches (to
 * tick once). Once caught, a detent catches again only after the hand has left its reach, so a
 * hand resting on its edge doesn't chatter.
 */
export class Notches {
  /** The detent holding the value, or -1. */
  held = -1
  private readonly armed: boolean[]
  constructor(
    readonly list: readonly Detent[],
    x: number,
  ) {
    this.armed = list.map((d) => Math.abs(x - d.at) > REARM)
    this.held = list.findIndex((d) => warp(x, [d]) === d.at)
  }
  /** The shown position for a hand at `x` with detents at strength `k`, and any detent caught now. */
  move(x: number, k = 1): { shown: number; caught?: Detent } {
    const shown = warp(x, this.list, k)
    const held = this.list.findIndex((d) => d.at === shown)
    let caught: Detent | undefined
    this.list.forEach((d, i) => {
      const { h, r } = reach(d, k)
      if (Math.abs(x - d.at) > Math.max(h + r, REARM)) this.armed[i] = true
    })
    if (held >= 0 && held !== this.held && this.armed[held]) {
      caught = this.list[held]
      this.armed[held] = false
    }
    this.held = held
    return caught ? { shown, caught } : { shown }
  }
}
