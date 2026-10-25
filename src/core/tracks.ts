// Tracks: a group of events in an animation (a card, its header, a list's rows) as a span of time
// with its own easing and an optional stagger, kept in a store as ordinary fields. `track()` makes
// the fields; `sampleTrack` turns a track's timing and a time into an item's progress (0 → 1, past
// 1 on a bouncy spring); `sampleTracks` does every track at once; `fitTracks` keeps a Random roll
// inside the timeline and in order. All pure: the host calls them each frame, or once per scrub.
import { bezierPoint, namedEasing, type Bezier, type EasingName } from "./easing.js"
import {
  choice,
  easing,
  knob,
  spring,
  SPRING,
  type Choice,
  type EasingField,
  type Knob,
  type SpringField,
} from "./schema.js"
import { springMotion, type SpringValue } from "./spring.js"

/** Which item a stagger starts from: the first, the last, or the middle outward. */
export type StaggerFrom = "first" | "last" | "center"

/** A track's timing at one moment: what the sampler reads. */
export interface TrackTiming {
  /** Seconds from the start of the timeline. */
  readonly start: number
  /** Seconds each item takes: the spring's own duration on a spring track. */
  readonly duration: number
  readonly ease: Bezier | SpringValue
  /** Seconds between one item's start and the next's. */
  readonly stagger: number
  readonly from: StaggerFrom
  /** How many items the track moves (1 without a stagger). */
  readonly items: number
}

type SpringInput = SpringField | { readonly duration: number; readonly bounce?: number }
type EasingInput = EasingField | Bezier | EasingName

export interface TrackOptions {
  /** The card and clip title; the id, capitalised, by default. */
  readonly label?: string
  /** The panel group its rows go in; the label by default. */
  readonly group?: string
  /** Seconds (0 by default). */
  readonly start?: number
  /** Seconds each item takes on an easing track (0.3 by default). A spring brings its own. */
  readonly duration?: number
  /** `spring({ duration, bounce })` or `{ duration, bounce }`; `easing(…)`, a curve or a name. */
  readonly ease: SpringInput | EasingInput
  /** Seconds between items. Given, the track gets Stagger and From rows. */
  readonly stagger?: number
  readonly from?: StaggerFrom
  /** How many items the track moves (1). */
  readonly items?: number
  /** The latest the track may end, in seconds (2): the Start and Duration rows' max. */
  readonly max?: number
  /** The largest stagger the row offers (0.15 s). */
  readonly maxStagger?: number
}

type IsSpring<E> = E extends SpringField
  ? true
  : E extends { readonly kind: "easing" }
    ? false
    : E extends { readonly duration: number }
      ? true
      : false

/** The fields `track(id, options)` makes, keyed `${id}.start` and so on. */
export type TrackFields<Id extends string, O extends TrackOptions> = {
  readonly [K in `${Id}.start`]: Knob
} & (IsSpring<O["ease"]> extends true
  ? { readonly [K in `${Id}.ease`]: SpringField }
  : { readonly [K in `${Id}.duration`]: Knob } & { readonly [K in `${Id}.ease`]: EasingField }) &
  (O["stagger"] extends number
    ? { readonly [K in `${Id}.stagger`]: Knob } & {
        readonly [K in `${Id}.from`]: Choice<StaggerFrom>
      }
    : unknown)

/** A track: its fields for a store, and how to read and write its timing in that store's values. */
export interface Track<Id extends string = string, F = Record<string, unknown>> {
  readonly id: Id
  readonly label: string
  readonly group: string
  readonly items: number
  /** The latest it may end (seconds). */
  readonly max: number
  /** Its easing is a spring: the spring's duration is the clip's length. */
  readonly spring: boolean
  /** The keys of its fields. */
  readonly keys: {
    readonly start: string
    readonly duration?: string
    readonly ease: string
    readonly stagger?: string
    readonly from?: string
  }
  /** The shortest an item may take (seconds). */
  readonly minDuration: number
  /** Spread these into `defineControls`' schema. */
  readonly fields: F
  /** Its timing in `values` (a store's `get()`), its defaults where a key is missing. */
  read(values: Readonly<Record<string, unknown>>): TrackTiming
  /** An item's progress at time `t` (see `sampleTrack`). */
  sample(values: Readonly<Record<string, unknown>>, t: number, item?: number): number
  /** The patch that sets its start and per-item duration (a spring's duration on a spring track). */
  patch(
    values: Readonly<Record<string, unknown>>,
    next: { readonly start?: number; readonly duration?: number; readonly stagger?: number },
  ): Record<string, unknown>
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isSpringInput = (e: SpringInput | EasingInput): e is SpringInput =>
  typeof e === "object" &&
  !Array.isArray(e) &&
  (("kind" in e && e.kind === "spring") || !("kind" in e))
const MIN_DURATION = 0.05
const STEP = 0.001
const SPRING_STEP = SPRING.duration.step

/**
 * A track's fields and its reader. `track("rows", { start: 0.2, ease: spring({ duration: 0.35 }),
 * stagger: 0.04, items: 7 })` makes `rows.start`, `rows.ease`, `rows.stagger` and `rows.from`, in
 * a "Rows" group. An easing track also gets `rows.duration`; a spring's duration is its own.
 */
export function track<const Id extends string, const O extends TrackOptions>(
  id: Id,
  options: O,
): Track<Id, TrackFields<Id, O>> {
  const label = options.label ?? capitalise(id)
  const group = options.group ?? label
  const max = options.max ?? 2
  const items = Math.max(1, Math.round(options.items ?? 1))
  const ease = options.ease
  const isSpring = isSpringInput(ease)
  const keys = {
    start: `${id}.start`,
    ...(isSpring ? {} : { duration: `${id}.duration` }),
    ease: `${id}.ease`,
    ...(options.stagger !== undefined ? { stagger: `${id}.stagger`, from: `${id}.from` } : {}),
  }
  const meta = { group }
  const seconds = { step: STEP, unit: "s", ...meta }
  const fields: Record<string, unknown> = {
    [keys.start]: knob(options.start ?? 0, { min: 0, max, label: "Start", ...seconds }),
  }
  if (keys.duration)
    fields[keys.duration] = knob(options.duration ?? 0.3, {
      min: MIN_DURATION,
      max,
      label: "Duration",
      ...seconds,
    })
  fields[keys.ease] = isSpring
    ? "kind" in ease
      ? { ...ease, group: ease.group ?? group, label: ease.label ?? "Spring" }
      : spring(ease, { label: "Spring", ...meta })
    : typeof ease === "object" && "kind" in ease
      ? { ...ease, group: ease.group ?? group, label: ease.label ?? "Easing" }
      : easing(ease as Bezier | EasingName, { label: "Easing", ...meta })
  if (keys.stagger && keys.from) {
    fields[keys.stagger] = knob(options.stagger ?? 0, {
      min: 0,
      max: options.maxStagger ?? 0.15,
      label: "Stagger",
      ...seconds,
    })
    fields[keys.from] = choice(options.from ?? "first", ["first", "last", "center"], {
      label: "From",
      labels: { first: "First", last: "Last", center: "Centre" },
      ...meta,
    })
  }
  const defaults = (k: string) => (fields[k] as { value: unknown }).value
  const value = <T>(values: Readonly<Record<string, unknown>>, k: string) =>
    (k in values ? values[k] : defaults(k)) as T
  const read = (values: Readonly<Record<string, unknown>>): TrackTiming => {
    const e = value<Bezier | SpringValue>(values, keys.ease)
    return {
      start: value<number>(values, keys.start),
      duration: isSpring
        ? (e as SpringValue).duration
        : value<number>(values, keys.duration as string),
      ease: e,
      stagger: keys.stagger ? value<number>(values, keys.stagger) : 0,
      from: keys.from ? value<StaggerFrom>(values, keys.from) : "first",
      items,
    }
  }
  const out: Track<Id, TrackFields<Id, O>> = {
    id,
    label,
    group,
    items,
    max,
    spring: isSpring,
    keys: Object.freeze(keys),
    minDuration: MIN_DURATION,
    fields: Object.freeze(fields) as TrackFields<Id, O>,
    read,
    sample: (values, t, item = 0) => sampleTrack(read(values), t, item),
    patch(values, next) {
      const out: Record<string, unknown> = {}
      if (next.start !== undefined) out[keys.start] = next.start
      if (next.duration !== undefined) {
        if (isSpring)
          out[keys.ease] = { ...value<SpringValue>(values, keys.ease), duration: next.duration }
        else out[keys.duration as string] = next.duration
      }
      if (next.stagger !== undefined && keys.stagger) out[keys.stagger] = next.stagger
      return out
    },
  }
  return Object.freeze(out)
}

// ——— the sampler ———

/** How many stagger steps item `index` of `count` waits, starting from `from`. */
export function staggerRank(index: number, count: number, from: StaggerFrom): number {
  const n = Math.max(1, count)
  const i = Math.min(n - 1, Math.max(0, index))
  if (from === "last") return n - 1 - i
  if (from === "center") return Math.abs(i - (n - 1) / 2) - (n % 2 === 0 ? 0.5 : 0)
  return i
}

/** The most stagger steps any item of `count` waits. */
export const staggerSteps = (count: number, from: StaggerFrom) =>
  from === "center" ? Math.floor((Math.max(1, count) - 1) / 2) : Math.max(0, count - 1)

/** When item `index` starts (seconds). */
export const itemStart = (timing: TrackTiming, index = 0) =>
  timing.start + staggerRank(index, timing.items, timing.from) * timing.stagger

/**
 * The track's clip: from its start to where its last item's duration ends; `settle` is where a
 * spring's last item comes to rest (the end, on an easing track).
 */
export function trackSpan(timing: TrackTiming): { start: number; end: number; settle: number } {
  const last = timing.start + staggerSteps(timing.items, timing.from) * timing.stagger
  const end = last + timing.duration
  const settle = isBezier(timing.ease) ? end : last + springSettle(timing.ease)
  return { start: timing.start, end, settle: Math.max(end, settle) }
}

const isBezier = (e: Bezier | SpringValue): e is Bezier => Array.isArray(e)

/**
 * Item `item`'s progress at time `t`: 0 until it starts, then its easing over `duration`, then 1.
 * A spring runs on past its duration until it settles (its duration is the perceptual one,
 * SwiftUI's), and a bounce overshoots 1 on the way.
 */
export function sampleTrack(timing: TrackTiming, t: number, item = 0): number {
  const local = t - itemStart(timing, item)
  if (local <= 0) return 0
  if (isBezier(timing.ease)) {
    if (local >= timing.duration) return 1
    return bezierAt(timing.ease, local / Math.max(1e-9, timing.duration))
  }
  return springAt(timing.ease, local)
}

/**
 * Every track at time `t`: each one's progress per item (`at.rows[3]`), read from a store's
 * values.
 */
export function sampleTracks<const T extends readonly Track[]>(
  tracks: T,
  values: Readonly<Record<string, unknown>>,
  t: number,
): { readonly [K in T[number]["id"]]: readonly number[] } {
  const out: Record<string, number[]> = {}
  for (const tr of tracks) {
    const timing = tr.read(values)
    out[tr.id] = Array.from({ length: timing.items }, (_, i) => sampleTrack(timing, t, i))
  }
  return out as { [K in T[number]["id"]]: number[] }
}

/** A cubic-bezier easing's value at `x` (0 → 1 of the time). */
export function bezierAt(b: Bezier, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  // Newton on x(u), then bisection if it strays.
  let u = x
  for (let i = 0; i < 8; i++) {
    const [px] = bezierPoint(b, u)
    const d = bezierSlopeX(b, u)
    if (Math.abs(px - x) < 1e-7) return bezierPoint(b, u)[1]
    if (Math.abs(d) < 1e-6) break
    u -= (px - x) / d
    if (u < 0 || u > 1) break
  }
  let lo = 0
  let hi = 1
  u = x
  for (let i = 0; i < 40; i++) {
    const [px] = bezierPoint(b, u)
    if (Math.abs(px - x) < 1e-7) break
    if (px < x) lo = u
    else hi = u
    u = (lo + hi) / 2
  }
  return bezierPoint(b, u)[1]
}

function bezierSlopeX([x1, , x2]: Bezier, u: number) {
  const v = 1 - u
  return 3 * v * v * x1 + 6 * v * u * (x2 - x1) + 3 * u * u * (1 - x2)
}

/**
 * A spring's step response (0 → 1) `t` seconds in, in closed form, so any frame is exact. Once it
 * has settled (within 0.001) it is 1.
 */
export function springAt(s: SpringValue, t: number): number {
  if (t <= 0) return 0
  if (t >= springSettle(s)) return 1
  return response(s, t)
}

function response(s: SpringValue, t: number): number {
  const { omega: w, zeta: z } = springMotion(s)
  if (Math.abs(z - 1) < 1e-6) return 1 - (1 + w * t) * Math.exp(-w * t)
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
  }
  const r = w * Math.sqrt(z * z - 1)
  const r1 = -z * w + r
  const r2 = -z * w - r
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
}

/** The bound on |1 − response| from `t` on: the envelope the spring decays inside. */
function envelope(s: SpringValue, t: number): number {
  const { omega: w, zeta: z } = springMotion(s)
  if (Math.abs(z - 1) < 1e-6) return (1 + w * t) * Math.exp(-w * t)
  if (z < 1) return Math.exp(-z * w * t) / Math.sqrt(1 - z * z)
  const r = w * Math.sqrt(z * z - 1)
  const r1 = -z * w + r
  const r2 = -z * w - r
  return (Math.abs(r2) * Math.exp(r1 * t) + Math.abs(r1) * Math.exp(r2 * t)) / Math.abs(r2 - r1)
}

const settled = new Map<string, number>()
/**
 * Seconds until a spring stays within `eps` of its target; a spring that never settles (bounce 1)
 * counts as settled at eight times its duration.
 */
export function springSettle(s: SpringValue, eps = 0.001): number {
  const key = `${s.duration}:${s.bounce}:${eps}`
  const hit = settled.get(key)
  if (hit !== undefined) return hit
  const cap = Math.max(0.01, s.duration) * 8
  let out = cap
  if (envelope(s, cap) <= eps) {
    let lo = 0
    let hi = cap
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2
      if (envelope(s, mid) <= eps) hi = mid
      else lo = mid
    }
    out = hi
  }
  if (settled.size > 256) settled.clear()
  settled.set(key, out)
  return out
}

// ——— keeping a roll valid ———

/**
 * A store's `constrain` for its tracks: after Random or Mutate, the tracks they rolled keep the
 * order they're listed in (one starts no earlier than the one before it), and each ends by
 * `length` (the tracks' own `max` by default): moved earlier first, then shortened.
 */
export function fitTracks(
  tracks: readonly Track[],
  options: { readonly length?: number } = {},
): (
  values: Readonly<Record<string, unknown>>,
  rolled: readonly string[],
) => Record<string, unknown> {
  return (values, rolled) => {
    const touched = new Set(rolled)
    const hit = tracks.map((t) => Object.values(t.keys).some((k) => k && touched.has(k)))
    const timings = tracks.map((t) => t.read(values))
    // Rolled starts, sorted, go back to the rolled tracks in their listed order.
    const starts = tracks
      .map((_, i) => i)
      .filter((i) => hit[i])
      .map((i) => timings[i]!.start)
      .sort((a, b) => a - b)
    let next = 0
    const fixed = timings.map((t, i) => (hit[i] ? { ...t, start: starts[next++]! } : t))
    const patch: Record<string, unknown> = {}
    for (let i = 0; i < tracks.length; i++) {
      if (!hit[i]) continue
      const tr = tracks[i]!
      const t = fixed[i]!
      const length = options.length ?? tr.max
      const prev = i > 0 ? fixed[i - 1]!.start : 0
      const after = fixed.slice(i + 1).find((_, j) => !hit[i + 1 + j])?.start ?? length
      let start = Math.min(Math.max(t.start, prev), after)
      const tail = trackSpan(t).end - t.start
      if (start + tail > length) start = Math.max(prev, length - tail)
      let duration = t.duration
      let stagger = t.stagger
      let over = start + tail - length
      if (over > 1e-9) {
        const give = Math.min(over, duration - tr.minDuration)
        duration -= give
        over -= give
      }
      if (over > 1e-9 && stagger > 0) {
        const steps = staggerSteps(t.items, t.from)
        stagger = Math.max(0, stagger - over / Math.max(1, steps))
      }
      // Down to each field's step, so rounding never pushes an end back past `length`.
      const floor = (v: number, step = STEP) =>
        Number((Math.floor(v / step + 1e-6) * step).toFixed(6))
      start = floor(start)
      if (duration !== t.duration) duration = floor(duration, tr.spring ? SPRING_STEP : STEP)
      if (stagger !== t.stagger) stagger = floor(stagger)
      fixed[i] = { ...t, start, duration, stagger }
      Object.assign(
        patch,
        tr.patch(values, {
          ...(Math.abs(start - timings[i]!.start) > 1e-9 ? { start } : {}),
          ...(duration !== t.duration ? { duration } : {}),
          ...(stagger !== t.stagger ? { stagger } : {}),
        }),
      )
    }
    return patch
  }
}
