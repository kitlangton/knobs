// The compare viewer's pure parts: frames and the times both videos seek to, keeping a follower in
// step with the master, coalescing seeks, the layout of the two sides and the wipe, and where the
// frame strip samples.
import type { TimeView } from "./timeline-model.js"

/** Side by side, a wipe, or (opt in) a difference. */
export type CompareMode = "side" | "wipe" | "difference"

const ALL_MODES: readonly CompareMode[] = ["side", "wipe", "difference"]
const MODE_KEYS: Record<CompareMode, string> = { side: "s", wipe: "w", difference: "d" }

/**
 * The modes a viewer offers (`["side", "wipe"]` unless given; `difference` only when asked for),
 * in their order, and the mode it starts in (the first offered when the asked one isn't).
 */
export function compareModes(
  modes?: readonly CompareMode[],
  mode?: CompareMode,
): { readonly modes: readonly CompareMode[]; readonly mode: CompareMode } {
  const list = [...new Set((modes ?? ["side", "wipe"]).filter((m) => ALL_MODES.includes(m)))]
  const offered = list.length ? list : (["side", "wipe"] as CompareMode[])
  return { modes: offered, mode: mode && offered.includes(mode) ? mode : offered[0]! }
}

/** The mode a key picks among those offered: a digit by position, or S, W, D. */
export function modeForKey(key: string, modes: readonly CompareMode[]): CompareMode | null {
  const k = key.toLowerCase()
  if (/^[1-9]$/.test(k)) return modes[Number(k) - 1] ?? null
  return modes.find((m) => MODE_KEYS[m] === k) ?? null
}

/** A mode's letter key (S, W, D). */
export const modeKey = (mode: CompareMode) => MODE_KEYS[mode].toUpperCase()
export type MediaKind = "video" | "image"

const VIDEO = /\.(mp4|m4v|mov|webm|ogv|mkv)$/i

/** A source's kind: as given, else by its extension (a video's, or an image). */
export function mediaKind(src: string, kind?: MediaKind): MediaKind {
  if (kind) return kind
  if (src.startsWith("data:video/") || src.startsWith("blob:video")) return "video"
  return VIDEO.test(src.split(/[?#]/)[0] ?? "") ? "video" : "image"
}

/** The frame showing at time `t` (whole frames, never negative). */
export const frameOf = (t: number, fps: number) => Math.max(0, Math.floor(t * fps + 1e-4))

/** The last whole frame of `duration` seconds. */
export const lastFrame = (duration: number, fps: number) =>
  Math.max(0, Math.ceil(duration * fps - 1e-4) - 1)

/**
 * The time a video seeks to for frame `f`: its midpoint, `(f + 0.5) / fps`, which never lands on a
 * frame boundary, so two decoders can't round to different frames. Clamped to the last frame.
 */
export function frameMidpoint(f: number, fps: number, duration = Number.POSITIVE_INFINITY) {
  const last = Number.isFinite(duration) ? lastFrame(duration, fps) : Number.POSITIVE_INFINITY
  return (Math.min(Math.max(0, Math.floor(f)), last) + 0.5) / fps
}

/** Where both videos seek to show time `t`: the midpoint of the frame it falls in. */
export const seekTime = (t: number, fps: number, duration?: number) =>
  frameMidpoint(frameOf(t, fps), fps, duration)

/** Whether two times show the same frame (a seek between them presents nothing new). */
export const sameFrame = (a: number, b: number, fps: number) => frameOf(a, fps) === frameOf(b, fps)

export interface SyncAction {
  /** Hard-seek the follower here (seconds), or leave it playing. */
  readonly seekTo: number | null
  readonly rate: number
}

/**
 * Keeps a playing follower on its master: past `hard` seconds of drift (90 ms) it seeks; otherwise
 * its rate leans against the drift, proportionally (`gain` per second of drift), by at most `max`
 * (±25%), and inside `dead` (1/120 s) it plays at the base rate.
 */
export function syncAction(
  master: number,
  follower: number,
  o: { rate?: number; hard?: number; gain?: number; max?: number; dead?: number } = {},
): SyncAction {
  const base = o.rate ?? 1
  const drift = follower - master
  if (Math.abs(drift) > (o.hard ?? 0.09)) return { seekTo: master, rate: base }
  if (Math.abs(drift) < (o.dead ?? 1 / 120)) return { seekTo: null, rate: base }
  const max = o.max ?? 0.25
  const lean = Math.min(max, Math.max(-max, -drift * (o.gain ?? 4.5)))
  return { seekTo: null, rate: Math.round(base * (1 + lean) * 1e4) / 1e4 }
}

/**
 * One video's seeks, coalesced: while one is in flight only the latest target is kept, applied when
 * it lands; holding a step key walks frames instead of queueing seeks.
 */
export interface SeekState {
  readonly seeking: boolean
  /** The latest target asked for while a seek was in flight. */
  readonly pending: number | null
}
export const SEEK_IDLE: SeekState = { seeking: false, pending: null }

export interface SeekStep {
  readonly state: SeekState
  /** Set `currentTime` to this now, or nothing. */
  readonly apply: number | null
  /** The frame asked for is already showing: no seek, and no frame callback will come. */
  readonly settled: boolean
}

/** A seek to `t` asked for while the video shows `current`. */
export function requestSeek(s: SeekState, t: number, current: number, fps: number): SeekStep {
  if (s.seeking) return { state: { seeking: true, pending: t }, apply: null, settled: false }
  if (sameFrame(t, current, fps)) return { state: SEEK_IDLE, apply: null, settled: true }
  return { state: { seeking: true, pending: null }, apply: t, settled: false }
}

/** The seek in flight landed on `current`: apply what's pending, if it's another frame. */
export function seeked(s: SeekState, current: number, fps: number): SeekStep {
  if (s.pending !== null && !sameFrame(s.pending, current, fps))
    return { state: { seeking: true, pending: null }, apply: s.pending, settled: false }
  return { state: SEEK_IDLE, apply: null, settled: true }
}

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}
export interface Size {
  readonly w: number
  readonly h: number
}

/** `media` fitted inside `box`, centred: the whole of it shows, letterboxed, never cropped. */
export function letterbox(media: Size, box: Rect): Rect {
  if (media.w <= 0 || media.h <= 0 || box.w <= 0 || box.h <= 0) return box
  const k = Math.min(box.w / media.w, box.h / media.h)
  const w = media.w * k
  const h = media.h * k
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

export interface CompareLayout {
  /**
   * Side by side: a split screen down the middle, the pair fitted as a whole (After's shape, two
   * up), each side in its half; `split` is the middle's x.
   */
  readonly side: { readonly before: Rect; readonly after: Rect; readonly split: number }
  /**
   * Overlaid (wipe, difference): both in the same place, one side's size, centred on the split,
   * so fusing never resizes anything.
   */
  readonly overlay: { readonly before: Rect; readonly after: Rect }
}

/** Where the two sides sit inside `box`, side by side and overlaid. */
export function compareLayout(box: Rect, before: Size, after: Size): CompareLayout {
  const shape = after.w > 0 && after.h > 0 ? after : before
  const pair = letterbox({ w: shape.w * 2, h: shape.h }, box)
  const half = pair.w / 2
  const fused = { x: pair.x + half / 2, y: pair.y, w: half, h: pair.h }
  return {
    side: {
      before: letterbox(before, { x: pair.x, y: pair.y, w: half, h: pair.h }),
      after: letterbox(after, { x: pair.x + half, y: pair.y, w: half, h: pair.h }),
      split: pair.x + half,
    },
    overlay: { before: letterbox(before, fused), after: letterbox(after, fused) },
  }
}

/** The fuse's feather at its middle, the seam's blur as it starts and the overlap it fades in over (px). */
export const FUSE = { feather: 24, blur: 4, seamFade: 48 } as const

export interface FuseFrame {
  /** Where Before is cut: the split side by side, the wipe's line fused. */
  readonly cut: number
  /** The cut's soft edge, px either side of it. */
  readonly feather: number
  /** The seam's (and the wipe handle's) opacity, 0–1. */
  readonly seam: number
  /** The seam's blur (px), gone once fused. */
  readonly blur: number
}

/**
 * Kit Motion's Comparison fuse, one frame of it: side by side (`k` 0) the panes glide together
 * into one (`k` 1). Before is cut only where the inner edges overlap, with a feather that swells
 * mid-transition; the seam fades in as they overlap, blurred until they've fused. `before` and
 * `after` are where the sides are drawn this frame.
 */
export function fuseFrame(
  L: CompareLayout,
  before: Rect,
  after: Rect,
  k: number,
  wipe: number,
): FuseFrame {
  const t = Math.min(1, Math.max(0, k))
  const o = L.overlay
  const left = Math.min(o.before.x, o.after.x)
  const line = wipeX(
    { x: left, y: 0, w: Math.max(o.before.x + o.before.w, o.after.x + o.after.w) - left, h: 0 },
    wipe,
  )
  const cut = L.side.split + (line - L.side.split) * t
  const contact = Math.max(0, Math.min(cut - after.x, before.x + before.w - cut))
  const feather = Math.min(contact, 1 + FUSE.feather * Math.sin(Math.PI * t))
  const overlap = before.x + before.w - after.x
  const seam =
    t > 0.001 && overlap >= 0
      ? Math.min(1, Math.max(0, overlap / FUSE.seamFade)) * Math.min(1, t * 4)
      : 0
  return { cut, feather, seam, blur: t < 0.995 ? FUSE.blur * (1 - t) : 0 }
}

/** A label folded `fold` (0 open, 1 folded to its name): its mark's width and opacity. */
export const labelFold = (fold: number, mark: number) => {
  const open = 1 - Math.min(1, Math.max(0, fold))
  return { width: mark * open, opacity: Math.min(1, Math.max(0, (open - 0.2) / 0.8)) }
}

/** The height a split screen of `w` needs so neither side has margins: half its width, in shape. */
export const splitHeight = (w: number, media: Size) =>
  media.w > 0 && media.h > 0 ? (w / 2) * (media.h / media.w) : (w / 2) * (9 / 16)

/**
 * The part of each side shown, in that side's own 0–1 coordinates: `w` and `h` are equal (1 is
 * the whole picture, 0.25 is 400%). Both sides show the same part.
 */
export interface ZoomRegion {
  readonly u: number
  readonly v: number
  readonly w: number
  readonly h: number
}
export const ZOOM_FIT: ZoomRegion = { u: 0, v: 0, w: 1, h: 1 }
/** 1600% at most. */
export const ZOOM_MAX = 16

/** Kept inside the picture, between the whole of it and `ZOOM_MAX`. */
export function clampZoom(r: { u: number; v: number; w: number }): ZoomRegion {
  const w = Math.min(1, Math.max(1 / ZOOM_MAX, r.w))
  const u = Math.min(1 - w, Math.max(0, r.u))
  const v = Math.min(1 - w, Math.max(0, r.v))
  return { u, v, w, h: w }
}

/** Zoomed by `factor` (above 1 in) about a point at `pu`, `pv` (0–1 across the shown part). */
export function zoomAbout(r: ZoomRegion, factor: number, pu: number, pv: number): ZoomRegion {
  const w = Math.min(1, Math.max(1 / ZOOM_MAX, r.w / factor))
  const at = { u: r.u + pu * r.w, v: r.v + pv * r.h }
  return clampZoom({ u: at.u - pu * w, v: at.v - pv * w, w })
}

/** Panned by a hand's move of `dx`, `dy` px over a side drawn `base` big: the picture follows it. */
export const panBy = (r: ZoomRegion, dx: number, dy: number, base: Rect): ZoomRegion =>
  clampZoom({
    u: r.u - (dx / Math.max(1, base.w)) * r.w,
    v: r.v - (dy / Math.max(1, base.h)) * r.h,
    w: r.w,
  })

/** Where a side drawn in `base` lands when zoomed to `r` (clipped to `base` when drawn). */
export const zoomedRect = (base: Rect, r: ZoomRegion): Rect => ({
  x: base.x - (r.u / r.w) * base.w,
  y: base.y - (r.v / r.h) * base.h,
  w: base.w / r.w,
  h: base.h / r.h,
})

/** A point's place across `base` (0–1 each way). */
export const pointIn = (base: Rect, x: number, y: number) => ({
  pu: base.w > 0 ? Math.min(1, Math.max(0, (x - base.x) / base.w)) : 0.5,
  pv: base.h > 0 ? Math.min(1, Math.max(0, (y - base.y) / base.h)) : 0.5,
})

/** A loop's window around `time`: a fifth of the length, 1–4 s, inside it. */
export function loopAround(time: number, duration: number): { start: number; end: number } {
  if (duration <= 0) return { start: 0, end: 0 }
  const span = Math.min(duration, Math.max(1, Math.min(4, duration / 5)))
  const start = Math.min(duration - span, Math.max(0, time - span / 2))
  return { start, end: start + span }
}

export const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
  h: a.h + (b.h - a.h) * k,
})

/** The wipe's line across `rect`: Before shows left of it, After right. */
export const wipeX = (rect: Rect, wipe: number) => rect.x + Math.min(1, Math.max(0, wipe)) * rect.w

/** The wipe a pointer at `x` (less the grab's offset) puts it at. */
export const wipeAt = (x: number, rect: Rect, offset = 0) =>
  rect.w <= 0 ? 0.5 : Math.min(1, Math.max(0, (x - offset - rect.x) / rect.w))

/**
 * A press at `x`: on the line (within `slop` px) it takes hold where it is, so the line doesn't
 * jump under the hand; elsewhere the line comes to the pointer.
 */
export function wipeGrab(x: number, rect: Rect, wipe: number, slop = 12) {
  const line = wipeX(rect, wipe)
  const onLine = Math.abs(x - line) <= slop
  return { onLine, offset: onLine ? x - line : 0 }
}

/**
 * Wiping, Before and After ride either side of the seam at `x`, `gap` from it, each fading out as
 * its side runs out of room (`left`/`right`: the wipe's edges; `wb`/`wa`: the labels' widths).
 */
export function seamLabels(
  x: number,
  left: number,
  right: number,
  wb: number,
  wa: number,
  gap = 8,
) {
  const room = (space: number, w: number) => Math.min(1, Math.max(0, (space - w - 2 * gap) / gap))
  return {
    before: { x: x - gap - wb, opacity: room(x - left, wb) },
    after: { x: x + gap, opacity: room(right - x, wa) },
  }
}

/** Where the wipe's grip sits for a pointer at `y`: its top, kept `margin` inside the line. */
export function gripTop(y: number, rect: Rect, grip: number, margin = 8) {
  const lo = rect.y + margin
  const hi = rect.y + rect.h - margin - grip
  return hi < lo ? rect.y + (rect.h - grip) / 2 : Math.min(hi, Math.max(lo, y - grip / 2))
}

/** The wipe moved by a key: 1% a press, 10% with Shift. */
export const wipeKey = (wipe: number, dir: -1 | 1, big = false) =>
  Math.min(1, Math.max(0, Math.round((wipe + dir * (big ? 0.1 : 0.01)) * 1000) / 1000))

export interface StripColumn {
  /** The frame it samples: its first, so zooming in by two keeps every other sample. */
  readonly frame: number
  /** Seconds: that frame's midpoint. */
  readonly time: number
  /** Its first frame and the one after its last. */
  readonly from: number
  readonly to: number
  readonly x: number
  readonly w: number
}

/**
 * The frame strip's columns across `width` px of the timeline's view: each spans a power-of-two
 * number of frames, at least `minWidth` px wide, on a grid fixed to frame 0, sampling its first
 * frame, so panning reuses the samples it has and zooming in by two keeps half of them.
 */
export function stripColumns(
  view: TimeView,
  width: number,
  o: { duration: number; fps: number; minWidth: number },
): StripColumn[] {
  const { fps } = o
  const total = Math.max(1, Math.round(o.duration * fps))
  if (width <= 0 || view.span <= 0) return []
  const pxPerSec = width / view.span
  const need = Math.max(1, (o.minWidth / pxPerSec) * fps)
  const step = 2 ** Math.ceil(Math.log2(need) - 1e-9)
  const first = Math.max(0, Math.floor((view.start * fps) / step))
  const last = Math.min(
    Math.ceil(total / step) - 1,
    Math.floor(((view.start + view.span) * fps) / step),
  )
  const out: StripColumn[] = []
  for (let k = first; k <= last; k++) {
    const from = k * step
    const to = Math.min(total, from + step)
    const frame = Math.min(total - 1, from)
    out.push({
      frame,
      time: (frame + 0.5) / fps,
      from,
      to,
      x: (from / fps - view.start) * pxPerSec,
      w: ((to - from) / fps) * pxPerSec,
    })
  }
  return out
}

/** Mean absolute difference of two RGBA buffers' colour, 0 (same) to 1. */
export function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  let count = 0
  for (let i = 0; i + 2 < n; i += 4) {
    sum +=
      Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!)
    count += 3
  }
  return count ? sum / (count * 255) : 0
}

/**
 * The columns worth a marker: where the difference peaks (no less than either neighbour), above
 * `threshold` and at least `ratio` of the largest.
 */
export function stripPeaks(
  diffs: readonly (number | undefined)[],
  o: { threshold?: number; ratio?: number } = {},
): number[] {
  const max = Math.max(0, ...diffs.map((d) => d ?? 0))
  const floor = Math.max(o.threshold ?? 0.004, max * (o.ratio ?? 0.5))
  const out: number[] = []
  diffs.forEach((d, i) => {
    if (d === undefined || d < floor) return
    const prev = diffs[i - 1] ?? -1
    const next = diffs[i + 1] ?? -1
    if (d >= prev && d > next) out.push(i)
  })
  return out
}
