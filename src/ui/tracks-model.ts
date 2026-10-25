// The tracks view's pure parts: where a dragged clip lands (1:1 with the hand, pulled softly onto
// other clips' edges and the playhead), and what that means for the track's fields.
import { trackSpan, type Track } from "../core/tracks.js"
import { magnet } from "./timeline-model.js"

/** A clip's span in seconds. */
export interface ClipBox {
  readonly start: number
  readonly end: number
}

/** What the hand holds: the whole clip, or one of its edges. */
export type ClipGrip = "move" | "start" | "end"

export interface ClipDrag {
  readonly grip: ClipGrip
  /** The clip when the press began. */
  readonly from: ClipBox
  /** How far the pointer has moved since, in seconds. */
  readonly delta: number
  readonly pxPerSec: number
  /** Times an edge may snap to: other clips' edges, the playhead. */
  readonly stops?: readonly number[]
  /** `false` while the modifier's held. */
  readonly snap?: boolean
  /** How near (px) an edge has to come before a stop pulls it (8). */
  readonly radius?: number
  /** The shortest the clip may get (seconds). */
  readonly min: number
  /** The longest an edge may stretch it (seconds; no limit by default). */
  readonly max?: number
  /**
   * An edge changes the clip's length in steps of this many seconds (a spring's duration step),
   * so it rests where the field lands; `min` and `max` sit on the same steps.
   */
  readonly quantum?: number
  /** Where the clip must stay: `[0, max]`. */
  readonly bounds: readonly [number, number]
}

/**
 * Where a dragged clip lands, and the stop it rests on (for a guide line). Within `radius` px of
 * a stop an edge is pulled toward it on the timeline's magnet (flat at the stop, meeting the hand
 * at the radius, so it never jumps), and lands on it exactly once it's near.
 */
export function dragClip(o: ClipDrag): { box: ClipBox; stop: number | null } {
  const [lo, hi] = o.bounds
  const radius = o.radius ?? 8
  const stops = o.snap === false ? [] : (o.stops ?? [])
  const pull = (raw: number) => {
    if (!stops.length) return { t: raw, px: Infinity }
    const m = magnet(raw, stops, o.pxPerSec, radius)
    const near = Math.min(...stops.map((s) => Math.abs(s - raw))) * o.pxPerSec
    return { t: m.stop ?? m.t, px: near }
  }
  /** The stop an edge rests on, if any: what the guide line marks. */
  const on = (...edges: number[]) =>
    stops.find((s) => edges.some((e) => Math.abs(s - e) * o.pxPerSec < 0.01)) ?? null
  const from = o.from.end - o.from.start
  const longest = o.max ?? Infinity
  /** An edge's length: on the quantum's steps, inside `room` (what the bounds leave). */
  const fit = (raw: number, room: number) => {
    let length = Math.min(raw, room)
    const q = o.quantum
    if (q) {
      length = from + Math.round((length - from) / q) * q
      if (length > room + 1e-9) length -= q
    }
    return Math.min(longest, Math.max(o.min, length))
  }
  if (o.grip === "start") {
    const length = fit(o.from.end - pull(o.from.start + o.delta).t, o.from.end - lo)
    const start = o.from.end - length
    return { box: { start, end: o.from.end }, stop: on(start) }
  }
  if (o.grip === "end") {
    const length = fit(pull(o.from.end + o.delta).t - o.from.start, hi - o.from.start)
    const end = o.from.start + length
    return { box: { start: o.from.start, end }, stop: on(end) }
  }
  // A move: whichever edge is nearer a stop leads. Too long for the bounds, it keeps its start
  // inside them.
  const a = pull(o.from.start + o.delta)
  const b = pull(o.from.end + o.delta)
  const shift = a.px <= b.px ? a.t - o.from.start : b.t - o.from.end
  const start = Math.max(lo, Math.min(hi - from, o.from.start + shift))
  return { box: { start, end: start + from }, stop: on(start, start + from) }
}

/** The fields a dragged clip sets: a move sets the start, an edge the start and per-item duration. */
export function clipPatch(
  track: Track,
  values: Readonly<Record<string, unknown>>,
  grip: ClipGrip,
  box: ClipBox,
): Record<string, unknown> {
  const timing = track.read(values)
  const span = trackSpan(timing)
  if (grip === "move") return track.patch(values, { start: box.start })
  if (grip === "start")
    return track.patch(values, {
      start: box.start,
      duration: timing.duration + (span.start - box.start),
    })
  return track.patch(values, { duration: timing.duration + (box.end - span.end) })
}
