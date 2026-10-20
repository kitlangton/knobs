// The history's logic apart from the DOM: the JSON a page writes (lanes of dated spans, events,
// faint bands), or the walkthrough's older shape (groups of dated events), filled in to one model
// of whole days; the date axis (where a day sits, which months get a tick, which labels fit); and
// the order the arrow keys walk.

export type HistoryTone = "good" | "warn" | "bad" | "info" | "dim"
export type HistoryProvenance = "verified" | "inferred"

/** A small tag that backs a claim: a PR, a commit, a log, as a link or not. */
export interface HistoryEvidence {
  readonly label: string
  readonly href?: string
}

/** A stretch of a lane in one state: "v1 works", "v2 broken". */
export interface HistorySpan {
  readonly id?: string
  /** ISO date (`2026-09-19`), or as a page writes it (`"Sep 19, 2026"`). */
  readonly from: string
  /** Left out: still so today. */
  readonly to?: string
  /** A key in `states`, or a word of its own. */
  readonly state: string
  /** Its tag at the end, in place of the state's (`"31d broken"`). */
  readonly label?: string
  /** Its detail's title, in place of "lane · state". */
  readonly title?: string
  readonly detail?: string
  readonly provenance?: HistoryProvenance
  readonly source?: string
  readonly evidence?: readonly HistoryEvidence[]
  /** A step it's about, for `onJump`. */
  readonly step?: string
}

/** A row of the chart: a channel or a track, with its spans. */
export interface HistoryLane {
  readonly id: string
  readonly label: string
  readonly spans?: readonly HistorySpan[]
}

/** A dated moment: a commit, a release, a deletion. */
export interface HistoryEvent {
  readonly id?: string
  /** ISO, or as written: "Apr 9, 2026", "Oct 14–16, 2026", "May 7–8". */
  readonly date: string
  /** Where it ran over days: its last day. */
  readonly to?: string
  /** The lane it sits on (`"code"` by default). */
  readonly lane?: string
  readonly title: string
  readonly detail?: string
  /** Its mark: a commit a dot, a release a diamond, a deletion a cross, an audit a triangle. */
  readonly type?: "commit" | "release" | "deletion" | "channel" | "audit" | (string & {})
  readonly tone?: HistoryTone
  readonly provenance?: HistoryProvenance
  readonly source?: string
  readonly evidence?: readonly HistoryEvidence[]
  readonly step?: string
}

/** A faint labelled stretch behind every lane: a phase. */
export interface HistoryBand {
  readonly from: string
  readonly to?: string
  readonly label: string
}

/** What a span's state means: its name in the legend, its colour and its tag (`{d}` the days). */
export interface HistoryState {
  readonly label?: string
  readonly tone?: HistoryTone
  /** `"{d}d broken"` (the default `"{d}d"`), or words of its own (`"v1"`). */
  readonly tag?: string
}

/** The walkthrough's older shape: events under headings. */
export interface HistoryGroup {
  readonly heading?: string
  readonly summary?: string
  readonly events?: readonly HistoryEvent[]
  readonly rows?: readonly HistoryEvent[]
}

/** What `history()` draws: plain JSON. */
export interface HistoryData {
  readonly axis?: { readonly from?: string; readonly to?: string; readonly today?: string }
  readonly lanes?: readonly HistoryLane[]
  readonly events?: readonly HistoryEvent[]
  readonly bands?: readonly HistoryBand[]
  readonly states?: Readonly<Record<string, HistoryState>>
  /** The walkthrough's older shape: each group's events go on the code lane under a band. */
  readonly groups?: readonly HistoryGroup[]
}

// ——— filled in ———

/** Days since 1970-01-01 (UTC): every date in the model. */
export type Day = number

export interface HyItem {
  readonly id: string
  readonly kind: "event" | "span"
  readonly lane: string
  readonly from: Day
  readonly to: Day
  /** A span still running today. */
  readonly open: boolean
  readonly title: string
  readonly detail?: string
  readonly tone: HistoryTone
  readonly type?: string
  readonly inferred: boolean
  readonly provenance?: HistoryProvenance
  readonly source?: string
  readonly evidence: readonly HistoryEvidence[]
  readonly step?: string
  /** A span's state key. */
  readonly state?: string
  /** A span's end tags, longest first: its own or the state's, then the days alone. */
  readonly tags: readonly string[]
}

export interface HyLane {
  readonly id: string
  readonly label: string
  readonly spans: readonly HyItem[]
  readonly events: readonly HyItem[]
}

export interface HyBand {
  readonly from: Day
  readonly to: Day
  readonly label: string
}

export interface HyState {
  readonly key: string
  readonly label: string
  readonly tone: HistoryTone
}

export interface HistoryModel {
  readonly from: Day
  readonly to: Day
  readonly today: Day
  readonly lanes: readonly HyLane[]
  /** Every event, in the order ←/→ walk them. */
  readonly events: readonly HyItem[]
  readonly bands: readonly HyBand[]
  /** The states the spans use, in the order they first appear. */
  readonly states: readonly HyState[]
  /** The event types used, in the order they first appear. */
  readonly types: readonly string[]
  readonly inferred: boolean
  readonly items: ReadonlyMap<string, HyItem>
}

const MS_DAY = 86_400_000
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const dayOf = (y: number, m: number, d: number): Day => Math.floor(Date.UTC(y, m, d) / MS_DAY)
const parts = (day: Day) => {
  const t = new Date(day * MS_DAY)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }
}
export const todayDay = (now = Date.now()): Day => {
  const t = new Date(now)
  return dayOf(t.getFullYear(), t.getMonth(), t.getDate())
}

const monthIndex = (name: string) => MONTHS.findIndex((m) => m.toLowerCase() === name.slice(0, 3).toLowerCase())

/**
 * A date as written, as whole days: ISO (`2026-04-09`, a time after it ignored), or `"Apr 9, 2026"`,
 * `"Oct 14–16, 2026"`, `"Jun 26 – Jul 2, 2026"`; with no year, `year`. Null when it's neither.
 */
export function parseDay(text: string, year?: number): { from: Day; to: Day; year?: number } | null {
  const s = text.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) {
    const y = Number(iso[1])
    const day = dayOf(y, Number(iso[2]) - 1, Number(iso[3]))
    return { from: day, to: day, year: y }
  }
  const m =
    /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:\s*[–—-]\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2}))?(?:,?\s+(\d{4}))?$/.exec(
      s,
    )
  if (!m) return null
  const m1 = monthIndex(m[1]!)
  const m2 = m[3] ? monthIndex(m[3]) : m1
  if (m1 < 0 || m2 < 0) return null
  const written = m[5] ? Number(m[5]) : undefined
  const y = written ?? year
  if (y === undefined) return null
  const from = dayOf(y, m1, Number(m[2]))
  let to = m[4] ? dayOf(y, m2, Number(m[4])) : from
  if (to < from) to = dayOf(y + 1, m2, Number(m[4]))
  return { from, to, ...(written !== undefined ? { year: written } : {}) }
}

/** `"Jun 26, 2026"`. */
export function formatDay(day: Day): string {
  const { y, m, d } = parts(day)
  return `${MONTHS[m]} ${d}, ${y}`
}

/** One day, or a range as short as it reads: `"Oct 14–16, 2026"`, `"Sep 19, 2026 – today"`. */
export function formatRange(from: Day, to: Day, open = false): string {
  if (open) return `${formatDay(from)} – today`
  if (to <= from) return formatDay(from)
  const a = parts(from)
  const b = parts(to)
  if (a.y === b.y && a.m === b.m) return `${MONTHS[a.m]} ${a.d}–${b.d}, ${a.y}`
  if (a.y === b.y) return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}, ${a.y}`
  return `${formatDay(from)} – ${formatDay(to)}`
}

/** `"1 day"`, `"31 days"`. */
export const formatDays = (n: number) => `${n} ${n === 1 ? "day" : "days"}`

/** A state's colour from its name when `states` doesn't give one. */
export function guessTone(state: string): HistoryTone {
  const s = state.toLowerCase()
  if (/broken|bad|fail|missing|deleted|down/.test(s)) return "bad"
  if (/warn|redirect|partial|beta|next|pre/.test(s)) return "warn"
  if (/work|ok|good|fixed|live|green/.test(s)) return "good"
  return "dim"
}

/** A group heading as a band's label: its number and a trailing "(Apr – May 2026)" go. */
export const bandLabel = (heading: string) =>
  heading
    .replace(/^\s*\d+\s*[·.:)\-–]\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()

/**
 * The walkthrough's older shape in the new one: every group's events on the code lane, each group
 * with a heading a faint band from its first event to its last. Dates with no year take the year
 * of the event before (or the first one written).
 */
export function fromGroups(
  groups: readonly HistoryGroup[],
  today: Day,
): { events: HistoryEvent[]; bands: HistoryBand[] } {
  const events: HistoryEvent[] = []
  const bands: HistoryBand[] = []
  const all = groups.flatMap((g) => g.events ?? g.rows ?? [])
  let year =
    all.map((e) => parseDay(e.date, 0)?.year).find((y) => y !== undefined) ?? parts(today).y
  for (const g of groups) {
    let lo = Infinity
    let hi = -Infinity
    for (const e of g.events ?? g.rows ?? []) {
      const d = parseDay(e.date, year)
      if (!d) continue
      if (d.year !== undefined) year = d.year
      lo = Math.min(lo, d.from)
      hi = Math.max(hi, d.to)
      events.push({
        ...e,
        date: iso(d.from),
        ...(d.to > d.from ? { to: iso(d.to) } : {}),
        lane: e.lane ?? "code",
      })
    }
    const label = g.heading ? bandLabel(g.heading) : ""
    if (label && lo <= hi) bands.push({ from: iso(lo), to: iso(hi), label })
  }
  return { events, bands }
}

/** A day as ISO `2026-04-09`. */
export function iso(day: Day): string {
  const { y, m, d } = parts(day)
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const startOfMonth = (day: Day) => {
  const { y, m } = parts(day)
  return dayOf(y, m, 1)
}

const TYPE_TONE: Record<string, HistoryTone> = { deletion: "bad" }

/** The document filled in: whole days, lanes with their spans and events, the axis and the order. */
export function normalizeHistory(data: HistoryData, now: Day = todayDay()): HistoryModel {
  const today = (data.axis?.today && parseDay(data.axis.today, parts(now).y)?.from) || now
  const converted = data.groups?.length ? fromGroups(data.groups, today) : { events: [], bands: [] }
  const rawEvents = [...(data.events ?? []), ...converted.events]
  const rawBands = [...(data.bands ?? []), ...converted.bands]
  const year = parts(today).y
  const day = (s: string | undefined) => (s ? (parseDay(s, year) ?? null) : null)

  const states = new Map<string, HyState>()
  const stateOf = (key: string): HyState => {
    const known = states.get(key)
    if (known) return known
    const def = data.states?.[key]
    const s = { key, label: def?.label ?? key, tone: def?.tone ?? guessTone(key) }
    states.set(key, s)
    return s
  }

  const items = new Map<string, HyItem>()
  const laneOrder: string[] = []
  const lanes = new Map<string, { id: string; label: string; spans: HyItem[]; events: HyItem[] }>()
  const lane = (id: string, label = id === "code" ? "Code" : id) => {
    let l = lanes.get(id)
    if (!l) {
      l = { id, label, spans: [], events: [] }
      lanes.set(id, l)
      laneOrder.push(id)
    }
    return l
  }
  // The code lane goes first when events need it and no lane is called that.
  if (rawEvents.some((e) => !e.lane || e.lane === "code") && !data.lanes?.some((l) => l.id === "code"))
    lane("code")

  let inferred = false
  for (const l of data.lanes ?? []) {
    const into = lane(l.id, l.label)
    ;(l.spans ?? []).forEach((s, i) => {
      const a = day(s.from)
      if (!a) return
      const open = !s.to
      const b = open ? null : day(s.to)
      const to = open ? today : (b?.to ?? a.to)
      const st = stateOf(s.state)
      const days = Math.max(0, to - a.from)
      const own = s.label ?? data.states?.[s.state]?.tag ?? "{d}d"
      const tags = [...new Set([own, "{d}d"])].map((t) => t.replace(/\{d\}/g, String(days)))
      const id = s.id ?? `${l.id}/${i}`
      const item: HyItem = {
        id,
        kind: "span",
        lane: l.id,
        from: a.from,
        to,
        open,
        title: s.title ?? `${l.label} · ${st.label}`,
        ...(s.detail ? { detail: s.detail } : {}),
        tone: st.tone,
        inferred: s.provenance === "inferred",
        ...(s.provenance ? { provenance: s.provenance } : {}),
        ...(s.source ? { source: s.source } : {}),
        evidence: s.evidence ?? [],
        ...(s.step ? { step: s.step } : {}),
        state: s.state,
        tags,
      }
      if (item.inferred) inferred = true
      into.spans.push(item)
      items.set(id, item)
    })
  }

  const types: string[] = []
  const events: { item: HyItem; index: number }[] = []
  rawEvents.forEach((e, index) => {
    const a = day(e.date)
    if (!a) return
    const to = Math.max(a.to, day(e.to)?.to ?? a.to)
    const into = lane(e.lane ?? "code")
    const id = e.id ?? `e${index}`
    const item: HyItem = {
      id,
      kind: "event",
      lane: into.id,
      from: a.from,
      to,
      open: false,
      title: e.title,
      ...(e.detail ? { detail: e.detail } : {}),
      tone: e.tone ?? TYPE_TONE[e.type ?? ""] ?? "dim",
      ...(e.type ? { type: e.type } : {}),
      inferred: e.provenance === "inferred",
      ...(e.provenance ? { provenance: e.provenance } : {}),
      ...(e.source ? { source: e.source } : {}),
      evidence: e.evidence ?? [],
      ...(e.step ? { step: e.step } : {}),
      tags: [],
    }
    if (item.inferred) inferred = true
    if (e.type && !types.includes(e.type)) types.push(e.type)
    into.events.push(item)
    items.set(id, item)
    events.push({ item, index })
  })

  const bands: HyBand[] = []
  for (const b of rawBands) {
    const a = day(b.from)
    if (!a) continue
    const z = b.to ? day(b.to) : null
    bands.push({ from: a.from, to: z ? z.to : today, label: b.label })
  }
  bands.sort((x, y) => x.from - y.from)

  // The axis: from the first of the month of the earliest date to a little past the latest (today
  // where a span runs to it), so its label has room.
  const all = [...items.values()].flatMap((i) => [i.from, i.to])
  for (const b of bands) all.push(b.from, b.to)
  const hasOpen = [...items.values()].some((i) => i.open)
  const lo = all.length ? Math.min(...all) : today - 90
  let hi = all.length ? Math.max(...all) : today
  if (hasOpen || data.axis?.today) hi = Math.max(hi, today)
  const from = day(data.axis?.from)?.from ?? startOfMonth(lo)
  const to = day(data.axis?.to)?.to ?? hi + Math.max(6, Math.round((hi - from) * 0.05))

  const laneIndex = (id: string) => laneOrder.indexOf(id)
  const order = eventOrder(
    events.map((e) => ({ ...e, laneIndex: laneIndex(e.item.lane) })),
  )
  for (const l of lanes.values()) l.events.sort((a, b) => a.from - b.from)

  return {
    from,
    to: Math.max(to, from + 1),
    today,
    lanes: laneOrder.map((id) => lanes.get(id)!),
    events: order,
    bands,
    states: [...states.values()],
    types,
    inferred,
    items,
  }
}

/** The order ←/→ walk: by date, then lane (top first), then as written. */
export function eventOrder(
  events: readonly { item: HyItem; index: number; laneIndex: number }[],
): HyItem[] {
  return [...events]
    .sort((a, b) => a.item.from - b.item.from || a.laneIndex - b.laneIndex || a.index - b.index)
    .map((e) => e.item)
}

/**
 * The event ←/→ land on from `current`: the next or the one before, stopping at the ends; from
 * nothing (or a span), → the first and ← the last.
 */
export function stepEvent(
  order: readonly HyItem[],
  current: string | null,
  dir: 1 | -1,
): HyItem | null {
  if (!order.length) return null
  const i = current === null ? -1 : order.findIndex((e) => e.id === current)
  if (i < 0) return dir > 0 ? order[0]! : order[order.length - 1]!
  return order[Math.max(0, Math.min(order.length - 1, i + dir))]!
}

// ——— the axis ———

/** Where a day sits across `width` (pixels), and the day at an x. */
export function dayScale(from: Day, to: Day, width: number) {
  const span = Math.max(1, to - from)
  return {
    x: (day: number) => ((day - from) / span) * width,
    day: (x: number) => from + (x / Math.max(1, width)) * span,
    /** As a fraction of the width, for `left: n%`. */
    f: (day: number) => (day - from) / span,
  }
}

export interface MonthTick {
  readonly day: Day
  /** `"Apr"`, or the year on January. */
  readonly label: string
}

const STEPS = [1, 2, 3, 6, 12]

/**
 * A tick on the first of each month inside the axis, thinned to every 2, 3, 6 or 12 months until
 * neighbours sit at least `minGap` pixels apart. January says its year.
 */
export function monthTicks(from: Day, to: Day, width: number, minGap = 44): MonthTick[] {
  const perMonth = (width / Math.max(1, to - from)) * 30.44
  const step = STEPS.find((s) => s * perMonth >= minGap) ?? 12
  const ticks: MonthTick[] = []
  const { y } = parts(from)
  let { m } = parts(from)
  let d = dayOf(y, m, 1)
  if (d < from) {
    m++
    d = dayOf(y, m, 1)
  }
  while (d <= to) {
    const p = parts(d)
    if (p.m % step === 0)
      ticks.push({ day: d, label: p.m === 0 ? String(p.y) : MONTHS[p.m]! })
    m++
    d = dayOf(y, m, 1)
  }
  return ticks
}

/**
 * Which labels to draw, left to right: each starts at its `x` and is `w` wide, and one is left out
 * where it would touch the one before (within `gap`), a reserved box (today's label), or run past
 * `width`.
 */
export function fitLabels(
  labels: readonly { x: number; w: number }[],
  width: number,
  reserved: readonly { x0: number; x1: number }[] = [],
  gap = 8,
): boolean[] {
  let end = -Infinity
  return labels.map(({ x, w }) => {
    const x1 = x + w
    if (x < end + gap || x1 > width) return false
    if (reserved.some((r) => x < r.x1 + gap && x1 > r.x0 - gap)) return false
    end = x1
    return true
  })
}

/** A span clipped to the axis, and which ends were cut; null when it's outside it. */
export function clipSpan(
  from: Day,
  to: Day,
  axisFrom: Day,
  axisTo: Day,
): { from: Day; to: Day; clipStart: boolean; clipEnd: boolean } | null {
  if (to < axisFrom || from > axisTo) return null
  return {
    from: Math.max(from, axisFrom),
    to: Math.min(to, axisTo),
    clipStart: from < axisFrom,
    clipEnd: to > axisTo,
  }
}

/**
 * Where a span's tag goes: the longest of `widths` (pixels, longest first) that fits inside the
 * bar with `pad` either side, else one that fits after it in `roomAfter`; else none.
 */
export function fitTag(
  widths: readonly number[],
  spanWidth: number,
  roomAfter: number,
  pad = 6,
): { index: number; place: "inside" | "after" } | null {
  for (let i = 0; i < widths.length; i++)
    if (widths[i]! + pad * 2 <= spanWidth) return { index: i, place: "inside" }
  for (let i = 0; i < widths.length; i++)
    if (widths[i]! + pad <= roomAfter) return { index: i, place: "after" }
  return null
}

/** Each band's label room: from its start to its end or the next band's start, if sooner. */
export function bandRoom(bands: readonly HyBand[], x: (day: Day) => number): number[] {
  return bands.map((b, i) => {
    const next = bands.slice(i + 1).find((n) => n.from > b.from)
    const end = Math.min(b.to, next ? next.from : Infinity)
    return Math.max(0, x(end) - x(b.from))
  })
}

/** The event nearest `day` within `tolerance` days, else null. */
export function nearestEvent(
  events: readonly HyItem[],
  day: number,
  tolerance: number,
): HyItem | null {
  let best: HyItem | null = null
  let gap = tolerance
  for (const e of events) {
    const d = day < e.from ? e.from - day : day > e.to ? day - e.to : 0
    if (d <= gap) {
      best = e
      gap = d
    }
  }
  return best
}

/** The first sentence of a detail: a tooltip's one line. */
export function firstSentence(text: string | undefined): string {
  if (!text) return ""
  const plain = text.replace(/`([^`]*)`/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1").trim()
  const m = /^.*?[.!?](?=\s|$)/.exec(plain)
  return (m ? m[0] : plain).trim()
}
