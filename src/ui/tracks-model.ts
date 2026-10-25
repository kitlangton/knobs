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
    if (!stops.length) return { t: raw, stop: null as number | null, px: Infinity }
    const m = magnet(raw, stops, o.pxPerSec, radius)
    const near = Math.min(...stops.map((s) => Math.abs(s - raw))) * o.pxPerSec
    return { t: m.stop ?? m.t, stop: m.stop, px: near }
  }
  if (o.grip === "start") {
    const p = pull(o.from.start + o.delta)
    const start = Math.min(o.from.end - o.min, Math.max(lo, p.t))
    return { box: { start, end: o.from.end }, stop: start === p.t ? p.stop : null }
  }
  if (o.grip === "end") {
    const p = pull(o.from.end + o.delta)
    const end = Math.max(o.from.start + o.min, Math.min(hi, p.t))
    return { box: { start: o.from.start, end }, stop: end === p.t ? p.stop : null }
  }
  // A move: whichever edge is nearer a stop leads.
  const a = pull(o.from.start + o.delta)
  const b = pull(o.from.end + o.delta)
  const lead = a.px <= b.px ? a : b
  const shift = lead.t - (lead === a ? o.from.start : o.from.end)
  const length = o.from.end - o.from.start
  const start = Math.min(hi - length, Math.max(lo, o.from.start + shift))
  const clamped = start !== o.from.start + shift
  return { box: { start, end: start + length }, stop: clamped ? null : lead.stop }
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
