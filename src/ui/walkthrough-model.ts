// The walkthrough's logic apart from the DOM: the document an agent writes (plain JSON), filled in
// to one shape, with its feed of updates and answers newest first; Kit's feedback on it (notes
// with what he was looking at, picks in taste tests), kept, counted and handed back to the agent
// as data or Markdown; and the inline Markdown its prose takes.
import type { CompareMode } from "./compare-model.js"
import type { DiffSource } from "./diff-model.js"

/** Where a PR or topic stands, as the agent sees it: a chip beside its title. */
export type WalkthroughStatus =
  | "ready"
  | "needs-taste"
  | "draft"
  | "blocked"
  | "merged"
  | (string & {})

/** A picture or video, by URL. */
export interface WalkthroughSource {
  readonly src: string
  readonly label?: string
}

/** A status colour: a dot, a chip or a cell's badge. */
export type WalkthroughTone = "good" | "warn" | "bad" | "info" | "dim"

/** A small tag that backs a claim: a PR, a commit, a log, as a link or not. */
export interface WalkthroughEvidence {
  readonly label: string
  readonly href?: string
}

/** One dated moment in a `history`. */
export interface WalkthroughHistoryEvent {
  /** As written: "Apr 9, 2026", "2026-04-09", "May 7–8". */
  readonly date: string
  /** How long ago, or how long it lasted: "116d ago". */
  readonly age?: string
  readonly title: string
  readonly detail?: string
  readonly tone?: WalkthroughTone
  /** Seen in the record (`"verified"`) or worked out from behaviour (`"inferred"`). */
  readonly provenance?: "verified" | "inferred"
  /** Where it was seen or inferred from: `"git"` shows as "verified · git". */
  readonly source?: string
  readonly evidence?: readonly WalkthroughEvidence[]
  /** A step it's about: its key, id or number ("1.2"). */
  readonly step?: string
  /** What happened, which shapes its dot: a release a diamond, an audit a square. */
  readonly type?: "commit" | "release" | "channel" | "audit" | (string & {})
}

export interface WalkthroughHistoryGroup {
  readonly heading?: string
  readonly summary?: string
  readonly events?: readonly WalkthroughHistoryEvent[]
  /** Another name for `events`. */
  readonly rows?: readonly WalkthroughHistoryEvent[]
}

/** One PR in a `stack`. */
export interface WalkthroughStackItem {
  /** "#57148" (or 57148). */
  readonly pr: string | number
  readonly href?: string
  readonly title: string
  /** Its branch: `"head → base"` (or `->`), or just the head (on `base`, else the trunk). */
  readonly branch?: string
  /** The branch it merges into, when `branch` names only its head. */
  readonly base?: string
  /** Lines changed: `"+164 / -18"`, or `{ add, del }`. */
  readonly delta?: string | { readonly add: number; readonly del: number }
  readonly status?: string
  readonly tone?: WalkthroughTone
  readonly summary?: string
  /** Its head branch, with `base`: another way to write `branch`. */
  readonly head?: string
  /** The step that shows it: its key, id or number. */
  readonly step?: string
  /** Another name for `step`. */
  readonly stepId?: string
  /** Its place as written: "01", "06 · 1/4". */
  readonly order?: string | number
}

/** A table's cell: its text, or that with a link, code, a badge, a colour or a step. */
export type WalkthroughTableCell =
  | string
  | number
  | {
      readonly text: string | number
      readonly href?: string
      readonly code?: boolean
      /** Drawn as a chip in this colour. */
      readonly badge?: WalkthroughTone
      /** The text in this colour. */
      readonly tone?: WalkthroughTone
      readonly step?: string
    }

export interface WalkthroughTableColumn {
  readonly key: string
  readonly label: string
  readonly mono?: boolean
  /** Numbers go right by default. */
  readonly align?: "left" | "right" | "center"
}

/** A row: its cells by column key, bare or under `cells`. */
export type WalkthroughTableRow =
  | Readonly<Record<string, WalkthroughTableCell>>
  | { readonly cells: Readonly<Record<string, WalkthroughTableCell>> }

/** A stretch of a video: a pill under it, and a marker on its timeline. */
export interface WalkthroughChapter {
  readonly id?: string
  readonly label: string
  /** Seconds. */
  readonly start: number
  /** Seconds; else `start + duration`, else the next chapter's start. */
  readonly end?: number
  readonly duration?: number
}

/**
 * What a step shows. A bare string is a video or image URL (by its extension). `mount` is the one
 * kind that isn't JSON: anything of your own, given its element, returning its cleanup.
 */
export type WalkthroughMedia =
  | string
  | {
      readonly kind: "compare"
      readonly before: string | WalkthroughSource
      readonly after: string | WalkthroughSource
      /** `"side"` by default (`"wipe"` where the slot is narrow). */
      readonly mode?: CompareMode
      /** Width over height (`16 / 9`, or `"1100/900"`); read from the video when left out. */
      readonly aspect?: number | string
      /** The frame strip over the timeline. */
      readonly strip?: boolean
      /** Pills under it that seek, and markers on its timeline. */
      readonly chapters?: readonly WalkthroughChapter[]
    }
  | {
      readonly kind: "video"
      readonly src: string
      readonly label?: string
      readonly aspect?: number | string
      readonly poster?: string
      /** Pills under it that seek; the one playing lit. */
      readonly chapters?: readonly WalkthroughChapter[]
      /** A WebVTT file's URL, shown by default. */
      readonly captions?: string
      /** Another name for `captions`. */
      readonly captionsSrc?: string
    }
  | {
      readonly kind: "history"
      /** Dated events under quiet headings… */
      readonly groups?: readonly WalkthroughHistoryGroup[]
      /** …or one run of them. */
      readonly events?: readonly WalkthroughHistoryEvent[]
    }
  | {
      readonly kind: "stack"
      /** The branch the stack lands on ("dev"); else the one most items merge into. */
      readonly base?: string
      /** In merge order; an item on another's branch hangs under it. */
      readonly items: readonly WalkthroughStackItem[]
    }
  | {
      readonly kind: "table"
      readonly columns: readonly WalkthroughTableColumn[]
      readonly rows: readonly WalkthroughTableRow[]
      readonly caption?: string
      /**
       * Where the step is too narrow for its columns, each row becomes a block: its primary cell
       * as a title over the rest as term and value (`"auto"`, the default); always; or never
       * (the table scrolls sideways instead).
       */
      readonly stack?: "auto" | "always" | "never"
      /** The column that titles a stacked row (its key); the first by default. */
      readonly primary?: string
    }
  | { readonly kind: "image"; readonly src: string; readonly label?: string; readonly alt?: string }
  | {
      readonly kind: "diff"
      /** `git diff` / `git show` output. */
      readonly patch?: string
      readonly files?: readonly DiffSource[]
      readonly file?: string
      readonly layout?: "split" | "unified"
      /** With the file list beside it (`diffReview`), for many files. */
      readonly review?: boolean
      /** Pixels: the diff grows to its file up to this (640), or the review's height (480). */
      readonly height?: number
    }
  | {
      readonly kind: "code" | "terminal"
      readonly code: string
      readonly label?: string
      readonly lang?: string
    }
  | {
      readonly kind: "metric"
      readonly label: string
      readonly before: number | string
      readonly after: number | string
      /** Out of: "315 → 345 of 345". */
      readonly of?: number | string
      readonly unit?: string
      /** Which way is better (`"up"`): colours the change. */
      readonly better?: "up" | "down"
    }
  | { readonly kind: "callout"; readonly text: string; readonly tone?: CalloutTone }
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "mount"
      readonly mount: (element: HTMLElement) => (() => void) | void
      /** Pixels held for it before it mounts. */
      readonly height?: number
    }

export type CalloutTone = "info" | "good" | "warn" | "bad"

/** One option in a taste test. */
export interface WalkthroughOption {
  /** "a", "b"… by position when left out. */
  readonly id?: string
  readonly label: string
  readonly caption?: string
  readonly media?: WalkthroughMedia
  /** The agent's own pick, marked "Suggested". */
  readonly suggested?: boolean
}

export interface WalkthroughStep {
  /** From the title when left out. */
  readonly id?: string
  readonly title: string
  /** A line or two: what it shows and how it was made. `code`, **bold** and [links](…) work. */
  readonly caption?: string
  /** One slot, or several one under another (`columns` sets them side by side). */
  readonly media?: WalkthroughMedia | readonly WalkthroughMedia[]
  /** Media side by side, this many to a row where there's room; one under another by default. */
  readonly columns?: 1 | 2 | 3
  /** The media after the first fold away under a quiet toggle with these words ("More clips"). */
  readonly more?: string
  /** A taste test: Kit picks one. */
  readonly options?: readonly WalkthroughOption[]
  /**
   * What Kit is asked for: a note (the default), a pick (with options), or nothing. `"verdict"`,
   * from older documents, reads as `"note"`.
   */
  readonly ask?: "note" | "pick" | "none" | "verdict"
  /** The question, over the step's media or options. */
  readonly question?: string
}

export interface WalkthroughSection {
  readonly id?: string
  readonly title: string
  /** A PR or issue: its URL (labelled `#123` from a GitHub URL), or a label and URL. */
  readonly link?: string | { readonly href: string; readonly label?: string }
  /**
   * The words that lead its meta line, in text colour: its count by default (`"PR 2 of 5"` where
   * `link` is a pull request, or the doc's `kickers` noun), your own words, or `false` for none.
   */
  readonly kicker?: string | false
  readonly status?: WalkthroughStatus
  readonly summary?: string
  readonly steps: readonly WalkthroughStep[]
}

export interface WalkthroughMeta {
  readonly label: string
  readonly value: string
  readonly href?: string
}

/** Something the agent did since Kit last looked: newest first at the top of the page. */
export interface WalkthroughUpdate {
  /** When: an ISO time (`2026-10-19T14:05:00-07:00`). */
  readonly at: string
  readonly text: string
  /** The step it's about: its key, id or number ("1.2"). */
  readonly step?: string
  /** Its state in a word or two (`"shipped"`, `"changes"`), last on its meta line. */
  readonly status?: string
  /** Context, folded away under the item: one line each, `"0:04 · Played the compare"`. */
  readonly trail?: readonly string[]
}

/** A question Kit asked and the agent's answer. */
export interface WalkthroughQA {
  /** When it was answered: an ISO time. */
  readonly at?: string
  readonly q: string
  readonly a: string
  readonly step?: string
  /** `"shipped"` or `"changes"` (shown as "Changes queued"), or your own words. */
  readonly status?: string
  /** What Kit did before asking, folded away under the answer: `"0:04 · Played the compare"`. */
  readonly trail?: readonly string[]
}

/** The document an agent writes: plain data, JSON but for `mount` media. */
export interface WalkthroughDoc {
  /** Kit's feedback is kept under this id; a new id starts fresh. */
  readonly id: string
  readonly title: string
  readonly summary?: string
  /** Facts beside the title: branch, commit, date… */
  readonly meta?: Readonly<Record<string, string>> | readonly WalkthroughMeta[]
  /** Relative media URLs resolve against this. */
  readonly base?: string
  /** Older documents' verdicts, kept in the data and the export (no buttons draw them). */
  readonly verdicts?: readonly string[]
  /** What the agent has done since, newest shown first. */
  readonly updates?: readonly WalkthroughUpdate[]
  /** Kit's questions and the agent's answers. */
  readonly qa?: readonly WalkthroughQA[]
  /**
   * How sections are counted on their meta line: `"pr"` (the default) gives "PR i of N" to the
   * sections that link a pull request, `{ noun: "Part" }` "Part i of N" to every section, and
   * `false` none. A section's own `kicker` wins over its count, and `false` hides it, without
   * renumbering the rest.
   */
  readonly kickers?: "pr" | { readonly noun: string } | false
  readonly sections: readonly WalkthroughSection[]
}

// ——— filled in ———

type CompareMedia = Extract<WalkthroughMedia, { kind: "compare" }>
type VideoMedia = Extract<WalkthroughMedia, { kind: "video" }>

/** A chapter filled in: an id, and its end where one can be known. */
export interface WalkChapter {
  readonly id: string
  readonly label: string
  readonly start: number
  readonly end?: number
}

export interface WalkHistoryGroup {
  readonly heading?: string
  readonly summary?: string
  readonly events: readonly WalkthroughHistoryEvent[]
}

/** A stack's item filled in: its PR as `#123`, its branch split, `step` for `stepId`. */
export interface WalkStackItem {
  readonly pr: string
  readonly href?: string
  readonly title: string
  readonly head?: string
  readonly base?: string
  readonly delta?: string | { readonly add: number; readonly del: number }
  readonly status?: string
  readonly tone?: WalkthroughTone
  readonly summary?: string
  readonly step?: string
  readonly order?: string
}

export interface WalkTableCell {
  readonly text: string
  readonly href?: string
  readonly code?: boolean
  readonly badge?: WalkthroughTone
  readonly tone?: WalkthroughTone
  readonly step?: string
}

export interface WalkTableColumn {
  readonly key: string
  readonly label: string
  readonly mono?: boolean
  readonly align: "left" | "right" | "center"
}

/**
 * Media filled in: no bare URLs, a compare's sides as sources, chapters with their ends, history in
 * groups, a stack's branches split and a table's cells as objects. Filling it again changes
 * nothing.
 */
export type WalkMedia =
  | Exclude<
      WalkthroughMedia,
      string | { readonly kind: "compare" | "video" | "history" | "stack" | "table" }
    >
  | (Omit<CompareMedia, "before" | "after" | "chapters"> & {
      readonly before: WalkthroughSource
      readonly after: WalkthroughSource
      readonly chapters?: readonly WalkChapter[]
    })
  | (Omit<VideoMedia, "chapters" | "captionsSrc"> & { readonly chapters?: readonly WalkChapter[] })
  | { readonly kind: "history"; readonly groups: readonly WalkHistoryGroup[] }
  | { readonly kind: "stack"; readonly base?: string; readonly items: readonly WalkStackItem[] }
  | {
      readonly kind: "table"
      readonly columns: readonly WalkTableColumn[]
      readonly rows: readonly Readonly<Record<string, WalkTableCell>>[]
      readonly caption?: string
      readonly stack: "auto" | "always" | "never"
      /** The key of the column that titles a stacked row. */
      readonly primary: string
    }

export interface WalkOption {
  readonly id: string
  readonly label: string
  /** "A", "B"… */
  readonly letter: string
  readonly caption?: string
  readonly media?: WalkMedia
  readonly suggested: boolean
}

export interface WalkStep {
  /** `section/step`: where its feedback is kept. */
  readonly key: string
  readonly id: string
  readonly section: string
  /** "1.2": section, then step. */
  readonly number: string
  readonly title: string
  readonly caption?: string
  readonly question?: string
  readonly media: readonly WalkMedia[]
  /** Media to a row: 1 (one under another) unless the step asked for more. */
  readonly columns: number
  readonly more?: string
  readonly options: readonly WalkOption[]
  readonly ask: "note" | "pick" | "none"
}

export interface WalkSection {
  readonly id: string
  readonly title: string
  readonly link?: { readonly href: string; readonly label: string }
  /** What leads its meta line ("PR 2 of 5"), when anything does. */
  readonly kicker?: string
  readonly status?: WalkthroughStatus
  readonly summary?: string
  readonly steps: readonly WalkStep[]
}

export interface WalkVerdict {
  readonly id: string
  readonly label: string
}

/** One line of the feed: an update, or a question and its answer. */
export interface FeedItem {
  readonly kind: "update" | "qa"
  /** Epoch ms, or null when `at` isn't a time. */
  readonly at: number | null
  readonly text: string
  /** The question, for `qa`. */
  readonly q?: string
  /** The step's key, when it names one that's there. */
  readonly step: string | null
  readonly status?: string
  readonly trail: readonly string[]
}

export interface WalkPage {
  readonly id: string
  readonly title: string
  readonly summary?: string
  readonly meta: readonly WalkthroughMeta[]
  readonly verdicts: readonly WalkVerdict[]
  readonly sections: readonly WalkSection[]
  /** Every step, in reading order. */
  readonly steps: readonly WalkStep[]
  /** Updates and answers, newest first. */
  readonly feed: readonly FeedItem[]
}

export const DEFAULT_VERDICTS = ["ship", "change", "unsure"] as const

/** A URL-safe id from a title: "Retired model (HTTP 410)" → "retired-model-http-410". */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^(.{0,48})-.*$/, (m, head: string) => (m.length > 48 && head ? head : m))
      .slice(0, 48) || "item"
  )
}

/** Ids made unique in order: a second "picker" becomes "picker-2". */
function uniqueIds() {
  const seen = new Map<string, number>()
  return (id: string) => {
    const n = (seen.get(id) ?? 0) + 1
    seen.set(id, n)
    return n === 1 ? id : `${id}-${n}`
  }
}

const label = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]+/g, " ")

/** A relative URL against `base` (none: as written). Absolute URLs, data: and blob: stay. */
export function resolveSrc(src: string, base?: string): string {
  if (!base || /^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(src)) return src
  return base.replace(/\/?$/, "/") + src.replace(/^\.\//, "")
}

const VIDEO = /\.(mp4|m4v|webm|mov|ogv)(\?|#|$)/i

/** A bare URL as media: a video by its extension, else an image. */
export const mediaOf = (src: string): WalkMedia =>
  VIDEO.test(src) ? { kind: "video", src } : { kind: "image", src }

/** Width over height from `16/9`, `"1100/900"`, `"1100x900"` or `1.5`; undefined if unreadable. */
export function parseAspect(aspect: number | string | undefined): number | undefined {
  if (aspect === undefined) return undefined
  if (typeof aspect === "number") return aspect > 0 && Number.isFinite(aspect) ? aspect : undefined
  const m = /^\s*([\d.]+)\s*(?:[/x:×]\s*([\d.]+))?\s*$/.exec(aspect)
  if (!m) return undefined
  const w = Number(m[1])
  const h = m[2] === undefined ? 1 : Number(m[2])
  return w > 0 && h > 0 ? w / h : undefined
}

function source(s: string | WalkthroughSource, base?: string): WalkthroughSource {
  const v = typeof s === "string" ? { src: s } : s
  return { ...v, src: resolveSrc(v.src, base) }
}

/** Media filled in: a bare URL as a video or image, sources resolved against `base`. */
export function fillMedia(m: WalkthroughMedia, base?: string): WalkMedia {
  if (typeof m === "string") return mediaOf(resolveSrc(m, base))
  switch (m.kind) {
    case "compare": {
      const { chapters, ...rest } = m
      return {
        ...rest,
        before: source(m.before, base),
        after: source(m.after, base),
        ...(chapters?.length ? { chapters: fillChapters(chapters) } : {}),
      }
    }
    case "video": {
      const { chapters, captionsSrc, captions, ...rest } = m
      const vtt = captions ?? captionsSrc
      return {
        ...rest,
        src: resolveSrc(m.src, base),
        ...(m.poster ? { poster: resolveSrc(m.poster, base) } : {}),
        ...(vtt ? { captions: resolveSrc(vtt, base) } : {}),
        ...(chapters?.length ? { chapters: fillChapters(chapters) } : {}),
      }
    }
    case "image":
      return { ...m, src: resolveSrc(m.src, base) }
    case "history":
      return { kind: "history", groups: fillHistory(m) }
    case "stack":
      return {
        kind: "stack",
        ...(m.base ? { base: m.base } : {}),
        items: m.items.map(fillStackItem),
      }
    case "table":
      return fillTable(m)
    default:
      return m
  }
}

// ——— history, stacks, tables and chapters ———

/** A history's events in groups: `rows` read as `events`, bare `events` as one group first. */
function fillHistory(m: Extract<WalkthroughMedia, { kind: "history" }>): WalkHistoryGroup[] {
  const groups: WalkHistoryGroup[] = []
  if (m.events?.length) groups.push({ events: m.events })
  for (const g of m.groups ?? [])
    groups.push({
      ...(g.heading ? { heading: g.heading } : {}),
      ...(g.summary ? { summary: g.summary } : {}),
      events: g.events ?? g.rows ?? [],
    })
  return groups
}

/** `"head → base"` (or `->`, `=>`, `⇒`) as its two branches; one name is the head alone. */
export function parseBranch(branch: string | undefined): { head?: string; base?: string } {
  if (!branch?.trim()) return {}
  const [head, base] = branch.split(/\s*(?:→|->|=>|⇒)\s*/, 2).map((s) => s.trim())
  return { ...(head ? { head } : {}), ...(base ? { base } : {}) }
}

/** `"+164 / -18"`, `"+164 −18"` or `{ add, del }` as numbers; other text stays as written. */
export function parseDelta(
  delta: WalkthroughStackItem["delta"],
): { add: number; del: number } | string | undefined {
  if (delta === undefined || typeof delta === "object") return delta
  const m = /\+\s*([\d,_]+)[^\d+]*?[-−–]\s*([\d,_]+)/.exec(delta)
  if (!m) return delta.trim() || undefined
  const n = (s: string) => Number(s.replace(/[,_]/g, ""))
  return { add: n(m[1]!), del: n(m[2]!) }
}

function fillStackItem(it: WalkthroughStackItem): WalkStackItem {
  const parsed = parseBranch(it.branch)
  const head = parsed.head ?? it.head
  const base = parsed.base ?? it.base
  const delta = parseDelta(it.delta)
  const step = it.step ?? it.stepId
  const pr = String(it.pr).trim()
  return {
    pr: /^\d+$/.test(pr) ? `#${pr}` : pr,
    ...(it.href ? { href: it.href } : {}),
    title: it.title,
    ...(head ? { head } : {}),
    ...(base ? { base } : {}),
    ...(delta !== undefined ? { delta } : {}),
    ...(it.status ? { status: it.status } : {}),
    ...(it.tone ? { tone: it.tone } : {}),
    ...(it.summary ? { summary: it.summary } : {}),
    ...(step ? { step } : {}),
    ...(it.order !== undefined && it.order !== "" ? { order: String(it.order) } : {}),
  }
}

/** One row of a stack as drawn: where it hangs, and which rails pass beside it. */
export interface StackRow {
  readonly item: WalkStackItem
  /** Its place in `items`. */
  readonly index: number
  /** 0 on the trunk; one more for each item it's stacked on. */
  readonly depth: number
  /** The item it's stacked on (its place in `items`); null on the trunk. */
  readonly parent: number | null
  /** The last of its siblings: its rail ends here (└) rather than going on (├). */
  readonly last: boolean
  /** For each level above its own (0 the trunk's), whether that level's rail passes beside it. */
  readonly rails: readonly boolean[]
  readonly children: number
  /** The branch it merges into when that's neither the trunk nor another item's. */
  readonly offBase?: string
}

export interface StackLayout {
  /** The branch it lands on: `base`, else the one most items merge into; null when none says. */
  readonly trunk: string | null
  /** Depth-first in merge order: each item after the one it's stacked on. */
  readonly rows: readonly StackRow[]
  /** Nothing is stacked on anything, and there's no trunk: a plain list. */
  readonly flat: boolean
}

/** A stack's branch topology: which item each one is stacked on, in rows to draw as a graph. */
export function stackLayout(m: {
  readonly base?: string
  readonly items: readonly WalkStackItem[]
}): StackLayout {
  const items = m.items
  const byHead = new Map<string, number>()
  items.forEach((it, i) => it.head && !byHead.has(it.head) && byHead.set(it.head, i))
  let trunk = m.base ?? null
  if (!trunk) {
    const tally = new Map<string, number>()
    for (const it of items)
      if (it.base && !byHead.has(it.base)) tally.set(it.base, (tally.get(it.base) ?? 0) + 1)
    let best = 0
    for (const [b, n] of tally) if (n > best) [trunk, best] = [b, n]
  }
  const parentOf = items.map((it, i) => {
    const p = it.base === undefined ? undefined : byHead.get(it.base)
    return p === undefined || p === i ? null : p
  })
  // A loop of items stacked on each other: the first of it written goes on the trunk.
  items.forEach((_, i) => {
    const seen = new Set<number>()
    for (let n: number | null = i; n !== null; n = parentOf[n]!) {
      if (seen.has(n)) {
        const loop = [n]
        for (let k = parentOf[n]!; k !== n && k !== null; k = parentOf[k]!) loop.push(k)
        parentOf[Math.min(...loop)] = null
        break
      }
      seen.add(n)
    }
  })
  const kids = items.map((): number[] => [])
  const roots: number[] = []
  parentOf.forEach((p, i) => (p === null ? roots : kids[p]!).push(i))
  const rows: StackRow[] = []
  const walk = (list: number[], depth: number, rails: boolean[]) =>
    list.forEach((i, n) => {
      const it = items[i]!
      const last = n === list.length - 1
      const off = parentOf[i] === null && it.base && it.base !== trunk ? it.base : undefined
      rows.push({
        item: it,
        index: i,
        depth,
        parent: parentOf[i]!,
        last,
        rails,
        children: kids[i]!.length,
        ...(off ? { offBase: off } : {}),
      })
      walk(kids[i]!, depth + 1, [...rails, !last])
    })
  walk(roots, 0, [])
  return { trunk, rows, flat: !trunk && rows.every((r) => r.depth === 0 && !r.children) }
}

const isNum = (c: WalkthroughTableCell | undefined) =>
  typeof c === "number" || (typeof c === "object" && typeof c.text === "number")

function fillCell(c: WalkthroughTableCell): WalkTableCell {
  if (typeof c !== "object") return { text: String(c) }
  return { ...c, text: String(c.text) }
}

/** A table's rows as bare cell maps, its cells as objects, number columns aligned right. */
function fillTable(m: Extract<WalkthroughMedia, { kind: "table" }>): WalkMedia {
  const wrapped = !m.columns.some((c) => c.key === "cells")
  const raw = m.rows.map((r) => {
    const keys = Object.keys(r)
    const cells = (r as { cells?: unknown }).cells
    return wrapped && keys.length === 1 && keys[0] === "cells" && cells && typeof cells === "object"
      ? (cells as Readonly<Record<string, WalkthroughTableCell>>)
      : (r as Readonly<Record<string, WalkthroughTableCell>>)
  })
  const columns = m.columns.map((c): WalkTableColumn => {
    const present = raw.map((r) => r[c.key]).filter((v) => v !== undefined && v !== "")
    const numeric = present.length > 0 && present.every(isNum)
    return { ...c, align: c.align ?? (numeric ? "right" : "left") }
  })
  const rows = raw.map((r) => {
    const out: Record<string, WalkTableCell> = {}
    for (const [k, v] of Object.entries(r)) if (v !== undefined && v !== null) out[k] = fillCell(v)
    return out
  })
  const primary = columns.find((c) => c.key === m.primary)?.key ?? columns[0]?.key ?? ""
  return {
    kind: "table",
    columns,
    rows,
    ...(m.caption ? { caption: m.caption } : {}),
    stack: m.stack ?? "auto",
    primary,
  }
}

/** Chapters with ids and, where it can be known, an end: given, `start + duration`, or the next. */
export function fillChapters(chapters: readonly WalkthroughChapter[]): WalkChapter[] {
  const id = uniqueIds()
  const starts = chapters.map((c) => c.start).sort((a, b) => a - b)
  return chapters.map((c) => {
    const next = starts.find((s) => s > c.start)
    const end =
      c.end ?? (c.duration !== undefined ? Math.round((c.start + c.duration) * 1e3) / 1e3 : next)
    return {
      id: id(c.id ?? slug(c.label)),
      label: c.label,
      start: c.start,
      ...(end !== undefined && end > c.start ? { end } : {}),
    }
  })
}

/** The chapter playing at `time` (seconds): the one it's in that started last; -1 for none. */
export function chapterAt(chapters: readonly WalkChapter[], time: number): number {
  let at = -1
  chapters.forEach((c, i) => {
    if (time >= c.start && time < (c.end ?? Infinity) && (at < 0 || c.start >= chapters[at]!.start))
      at = i
  })
  return at
}

/** Seconds as a clock: `1:05`, `1:02:05` past the hour. */
export function clock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = String(t % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`
}

/** A step named by its key, id or number ("1.2"), a leading `#` allowed; undefined if there's none. */
export function findStep(
  steps: readonly WalkStep[],
  ref: string | undefined,
): WalkStep | undefined {
  if (ref === undefined) return undefined
  const r = ref.trim().replace(/^#/, "")
  return steps.find((s) => s.key === r || s.id === r || s.number === r)
}

/** A GitHub PR or issue URL's number as `#123`; else the URL's last part. */
export function linkLabel(href: string): string {
  const pr = /\/(?:pull|issues)\/(\d+)/.exec(href)
  if (pr) return `#${pr[1]}`
  const tail = href
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()
  return tail || href
}

/**
 * The document filled in: ids from titles where left out (unique), each step's key, number and
 * ask, options lettered, media URLs resolved against `base`, and the verdicts labelled.
 */
export function normalizeWalkthrough(doc: WalkthroughDoc): WalkPage {
  const sectionId = uniqueIds()
  const steps: WalkStep[] = []
  const sections = doc.sections.map((s, si): WalkSection => {
    const id = sectionId(s.id ?? slug(s.title))
    const stepId = uniqueIds()
    const own = s.steps.map((step, i): WalkStep => {
      const sid = stepId(step.id ?? slug(step.title))
      const optionId = uniqueIds()
      const options = (step.options ?? []).map(
        (o, oi): WalkOption => ({
          id: optionId(o.id ?? String.fromCharCode(97 + (oi % 26))),
          label: o.label,
          letter: String.fromCharCode(65 + (oi % 26)),
          ...(o.caption ? { caption: o.caption } : {}),
          ...(o.media !== undefined ? { media: fillMedia(o.media, doc.base) } : {}),
          suggested: o.suggested === true,
        }),
      )
      const list =
        step.media === undefined ? [] : Array.isArray(step.media) ? step.media : [step.media]
      const asked = step.ask === "verdict" ? "note" : step.ask
      const ask =
        asked === "pick" && !options.length ? "note" : (asked ?? (options.length ? "pick" : "note"))
      const walk: WalkStep = {
        key: `${id}/${sid}`,
        id: sid,
        section: id,
        number: `${si + 1}.${i + 1}`,
        title: step.title,
        ...(step.caption ? { caption: step.caption } : {}),
        ...(step.question ? { question: step.question } : {}),
        media: (list as readonly WalkthroughMedia[]).map((m) => fillMedia(m, doc.base)),
        columns: Math.max(1, Math.min(3, Math.round(step.columns ?? 1))),
        ...(step.more?.trim() && list.length > 1 ? { more: step.more.trim() } : {}),
        options,
        ask,
      }
      steps.push(walk)
      return walk
    })
    const link =
      s.link === undefined
        ? undefined
        : typeof s.link === "string"
          ? { href: s.link, label: linkLabel(s.link) }
          : { href: s.link.href, label: s.link.label ?? linkLabel(s.link.href) }
    return {
      id,
      title: s.title,
      ...(link ? { link } : {}),
      ...(typeof s.kicker === "string" && s.kicker.trim() ? { kicker: s.kicker.trim() } : {}),
      ...(s.status ? { status: s.status } : {}),
      ...(s.summary ? { summary: s.summary } : {}),
      steps: own,
    }
  })
  const meta: WalkthroughMeta[] = Array.isArray(doc.meta)
    ? [...(doc.meta as readonly WalkthroughMeta[])]
    : Object.entries((doc.meta ?? {}) as Record<string, string>).map(([k, value]) => ({
        label: k,
        value,
      }))
  const stepRef = (ref: string | undefined) => findStep(steps, ref)?.key ?? null
  const extra = (x: { status?: string; trail?: readonly string[] }) => ({
    ...(x.status?.trim() ? { status: x.status.trim() } : {}),
    trail: (x.trail ?? []).filter((t) => typeof t === "string" && t.trim()),
  })
  const feed = sortFeed([
    ...(doc.updates ?? []).map(
      (u): FeedItem => ({
        kind: "update",
        at: parseAt(u.at),
        text: u.text,
        step: stepRef(u.step),
        ...extra(u),
      }),
    ),
    ...(doc.qa ?? []).map(
      (x): FeedItem => ({
        kind: "qa",
        at: parseAt(x.at),
        text: x.a,
        q: x.q,
        step: stepRef(x.step),
        ...extra(x),
      }),
    ),
  ])
  return {
    id: doc.id,
    title: doc.title,
    ...(doc.summary ? { summary: doc.summary } : {}),
    meta,
    feed,
    verdicts: (doc.verdicts?.length ? doc.verdicts : DEFAULT_VERDICTS).map((v) => ({
      id: slug(v),
      label: label(v),
    })),
    sections: withKickers(sections, doc.sections, doc.kickers),
    steps,
  }
}

/** Whether a link is a pull (or merge) request: GitHub's `/pull/123`, GitLab's merge requests. */
export const isPullRequest = (href: string) => /\/(?:pull|merge_requests)\/\d+(?:[/?#]|$)/.test(href)

/**
 * Each section's kicker: its own words, none for `false`, else its count: "PR i of N" among the
 * sections that link a pull request, or "<noun> i of N" among all of them.
 */
function withKickers(
  sections: readonly WalkSection[],
  source: readonly WalkthroughSection[],
  kickers: WalkthroughDoc["kickers"] = "pr",
): WalkSection[] {
  if (kickers === false) return [...sections]
  const noun = typeof kickers === "object" ? kickers.noun.trim() : "PR"
  const counted =
    typeof kickers === "object"
      ? sections
      : sections.filter((s) => s.link && isPullRequest(s.link.href))
  return sections.map((s, i) => {
    const own = source[i]?.kicker
    if (own !== undefined || s.kicker) return s
    const at = counted.indexOf(s)
    return at < 0 ? s : { ...s, kicker: `${noun} ${at + 1} of ${counted.length}`.trim() }
  })
}

/**
 * Whether a table stacks its rows into blocks: always, never, or (auto) when the room it has is
 * less than its columns' natural width.
 */
export function tableStacks(
  stack: "auto" | "always" | "never",
  room: number,
  natural: number,
): boolean {
  if (stack !== "auto") return stack === "always"
  return room > 0 && natural > room + 1
}

/**
 * The page's bottom reserve for the docked note bar: its height, the gap it floats above the
 * page's edge, and a gap above it, so the last step and a step gone to never sit under it.
 */
export function noteBarReserve(bar: number, inset: number, gap: number): number {
  return Math.max(0, Math.ceil(bar)) + inset + gap
}

/** An ISO time as epoch ms; null when it isn't one. */
export function parseAt(at: string | undefined): number | null {
  if (!at) return null
  const t = Date.parse(at)
  return Number.isFinite(t) ? t : null
}

/** Newest first; items without a time after those with one, later-written first. */
export function sortFeed(items: readonly FeedItem[]): FeedItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const x = a.item.at ?? -Infinity
      const y = b.item.at ?? -Infinity
      return x !== y ? y - x : b.i - a.i
    })
    .map((e) => e.item)
}

/** "just now", "5m ago", "3h ago", "2d ago", else the date. */
export function ago(at: number, now: number): string {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 45) return "just now"
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`
  return new Date(at).toISOString().slice(0, 10)
}

/** A status chip's words and tone: "needs-taste" → "Needs taste", in the warn colour. */
export function statusLook(status: WalkthroughStatus): {
  label: string
  tone: "good" | "warn" | "bad" | "dim" | "info"
} {
  const id = slug(status)
  const tone =
    id === "ready" || id === "merged" || id === "shipped"
      ? "good"
      : id === "needs-taste" || id === "needs-review" || id === "review"
        ? "warn"
        : id === "blocked" || id === "broken" || id === "failing"
          ? "bad"
          : id === "draft" || id === "wip"
            ? "dim"
            : "info"
  return { label: label(status), tone }
}

/** A verdict's tone: the first is the good one, a "change"/"no" the warning, the rest dim. */
export function verdictTone(id: string, index: number): "good" | "warn" | "bad" | "dim" {
  if (/^(ship|yes|good|approve|keep|lgtm)/.test(id)) return "good"
  if (/^(change|fix|revise|tweak|redo)/.test(id)) return "warn"
  if (/^(no|reject|drop|revert|bad)/.test(id)) return "bad"
  if (/^(unsure|maybe|skip|later)/.test(id)) return "dim"
  return index === 0 ? "good" : "dim"
}

// ——— Kit's feedback ———

/** A taste test's pick, and what older documents kept per step. */
export interface StepFeedback {
  readonly pick?: string
  /** Older documents' verdict buttons. */
  readonly verdict?: string
  /** Older documents' per-step note field. */
  readonly note?: string
}

/** Ink drawn over a step's media: SVG paths in 0–1 coordinates of the media's box. */
export interface WalkInk {
  readonly paths: readonly string[]
  /** The box's width over height when drawn, to map the paths back. */
  readonly aspect: number
}

/** A voice note, recorded in the page: a blob URL that lives as long as the page. */
export interface WalkVoice {
  readonly url: string
  /** Seconds. */
  readonly duration: number
  readonly mime?: string
}

/** What the media on show was doing when Kit wrote. */
export interface MediaContext {
  /** "compare", "video", "diff"… */
  readonly kind: string
  /** Seconds. */
  readonly time?: number
  readonly duration?: number
  readonly playing?: boolean
  /** The chapter the time is in, by its label. */
  readonly chapter?: string
  /** The loop range, in seconds. */
  readonly loop?: { readonly start: number; readonly end: number }
  /** A compare's mode. */
  readonly mode?: string
  /** The part of the picture zoomed into, 0–1 of each side (`u`, `v` its top-left). */
  readonly zoom?: { readonly u: number; readonly v: number; readonly w: number; readonly h: number }
  /** The diff's file on show. */
  readonly file?: string
  /** It was full-window. */
  readonly full?: boolean
}

/** One thing Kit did, in the rolling log a note carries. */
export interface ContextEvent {
  /** Epoch ms. */
  readonly at: number
  readonly what:
    | "step"
    | "seek"
    | "play"
    | "pause"
    | "file"
    | "mode"
    | "zoom"
    | "loop"
    | "full"
    | "pick"
    | "ink"
  readonly step?: string
  /** Seconds, for seeks, plays and pauses. */
  readonly time?: number
  readonly detail?: string
}

export interface NoteContext {
  /** The step in view. */
  readonly step: string | null
  readonly media?: MediaContext
  /** What led up to it, oldest first. */
  readonly log: readonly ContextEvent[]
}

/** A note Kit sent: words, a voice note, ink, or any mix, with what he was looking at. */
export interface WalkNote {
  readonly id: string
  readonly step: string | null
  /** Epoch ms. */
  readonly at: number
  readonly text?: string
  readonly voice?: WalkVoice
  readonly ink?: WalkInk
  readonly context: NoteContext
}

/** Everything Kit has said: picks by step, his notes in the order sent, a note on the whole. */
export interface WalkthroughState {
  readonly steps: Readonly<Record<string, StepFeedback>>
  readonly notes?: readonly WalkNote[]
  readonly note?: string
}

export const EMPTY_STATE: WalkthroughState = { steps: {} }

/** A step's pick (or older fields) changed: blanks drop, and a step with nothing left goes. */
export function setFeedback(
  state: WalkthroughState,
  key: string,
  patch: Partial<Record<keyof StepFeedback, string | null>>,
): WalkthroughState {
  const next: Record<string, string> = { ...(state.steps[key] as Record<string, string>) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (v === null || v.trim() === "") delete next[k]
    else next[k] = v
  }
  const steps = { ...state.steps }
  if (Object.keys(next).length) steps[key] = next
  else delete steps[key]
  return { ...state, steps }
}

/** The whole page's note. */
export function setNote(state: WalkthroughState, note: string): WalkthroughState {
  const { note: _, ...rest } = state
  return note.trim() ? { ...rest, note } : rest
}

/** Whether a note has anything in it. */
export const hasContent = (n: Pick<WalkNote, "text" | "voice" | "ink">) =>
  Boolean(n.text?.trim() || n.voice || n.ink?.paths.length)

export function addNote(state: WalkthroughState, note: WalkNote): WalkthroughState {
  if (!hasContent(note)) return state
  return { ...state, notes: [...(state.notes ?? []), note] }
}

export function removeNote(state: WalkthroughState, id: string): WalkthroughState {
  return { ...state, notes: (state.notes ?? []).filter((n) => n.id !== id) }
}

/** A step's notes, in the order sent. */
export const notesOn = (state: WalkthroughState, key: string): WalkNote[] =>
  (state.notes ?? []).filter((n) => n.step === key)

/** Whether Kit has answered a step: picked, written, or (older documents) given a verdict. */
export function isAnswered(step: WalkStep, state: WalkthroughState): boolean {
  if (step.ask === "none") return false
  const fb = state.steps[step.key]
  if (step.ask === "pick") return fb?.pick !== undefined
  return Boolean(fb?.verdict || fb?.note || notesOn(state, step.key).length)
}

/**
 * A digit's pick on a taste test (1 the first option): the id it sets, or null when it's the one
 * already picked (pressing it again clears it); undefined when there's none.
 */
export function digitChoice(
  step: WalkStep,
  fb: StepFeedback | undefined,
  key: string,
): string | null | undefined {
  if (step.ask !== "pick" || !/^[1-9]$/.test(key)) return undefined
  const id = step.options[Number(key) - 1]?.id
  if (id === undefined) return undefined
  return fb?.pick === id ? null : id
}

/** Steps that ask for something, how many are answered, and the first still open. */
export function walkthroughProgress(w: WalkPage, state: WalkthroughState) {
  const asked = w.steps.filter((s) => s.ask !== "none")
  const done = asked.filter((s) => isAnswered(s, state))
  const next = asked.find((s) => !isAnswered(s, state))
  return { done: done.length, total: asked.length, next: next?.key ?? null }
}

/** The step before or after `current` (stopping at the ends); the first when there's none. */
export function adjacentStep(
  keys: readonly string[],
  current: string | null,
  dir: -1 | 1,
): string | undefined {
  if (!keys.length) return undefined
  const i = current === null ? -1 : keys.indexOf(current)
  if (i < 0) return dir > 0 ? keys[0] : keys[keys.length - 1]
  return keys[Math.max(0, Math.min(keys.length - 1, i + dir))]
}

// ——— the rolling context log ———

/** How many events the log keeps. */
export const LOG_MAX = 40

/**
 * The log with `event` on the end: a seek straight after another on the same step replaces it
 * (a scrub is one entry), and only the last `max` stay.
 */
export function pushContext(
  log: readonly ContextEvent[],
  event: ContextEvent,
  max = LOG_MAX,
): ContextEvent[] {
  const last = log[log.length - 1]
  const merge =
    last &&
    last.what === event.what &&
    last.step === event.step &&
    (event.what === "seek" || event.what === "step") &&
    event.at - last.at < 1500
  const next = merge ? [...log.slice(0, -1), event] : [...log, event]
  return next.slice(-max)
}

/** What a note carries of the log: the last `windowMs`, at least the last `min` events. */
export function recentContext(
  log: readonly ContextEvent[],
  now: number,
  windowMs = 90_000,
  min = 4,
): ContextEvent[] {
  const inWindow = log.filter((e) => now - e.at <= windowMs)
  return inWindow.length >= min ? inWindow : log.slice(-min)
}

/** Seconds as `m:ss.s`. */
export function formatTime(seconds: number): string {
  const t = Math.max(0, Math.round(seconds * 10) / 10)
  const m = Math.floor(t / 60)
  const s = (t - m * 60).toFixed(1).padStart(4, "0")
  return `${m}:${s}`
}

/**
 * A stroke as an SVG path in 0–1 coordinates of a `w`×`h` box (three decimals), dropping points
 * closer than a pixel to the last kept one.
 */
export function inkPath(points: readonly { x: number; y: number }[], w: number, h: number) {
  if (!points.length || w <= 0 || h <= 0) return ""
  const n = (v: number) => String(Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000)
  const kept = [points[0]!]
  for (const p of points.slice(1)) {
    const l = kept[kept.length - 1]!
    if (Math.hypot(p.x - l.x, p.y - l.y) >= 1) kept.push(p)
  }
  return kept.map((p, i) => `${i ? "L" : "M"}${n(p.x / w)} ${n(p.y / h)}`).join("")
}

/** A zoom region in words: "2× at 25%, 10%" (its top-left, as a share of the picture). */
export function zoomWords(z: { u: number; v: number; w: number; h: number }): string {
  const times = Math.round((1 / Math.max(1e-3, Math.max(z.w, z.h))) * 10) / 10
  return `${times}× at ${Math.round(z.u * 100)}%, ${Math.round(z.v * 100)}%`
}

/** A media context in a few words: "compare at 0:04.2 (loop 0:02.0–0:06.0), wipe". */
export function describeMedia(m: MediaContext | undefined): string {
  if (!m) return ""
  const parts: string[] = []
  if (m.file) parts.push(`${m.kind} ${m.file}`)
  else if (m.time !== undefined) parts.push(`${m.kind} at ${formatTime(m.time)}`)
  else parts.push(m.kind)
  if (m.chapter) parts[0] += ` in “${m.chapter}”`
  if (m.loop) parts.push(`loop ${formatTime(m.loop.start)}–${formatTime(m.loop.end)}`)
  if (m.zoom) parts.push(`zoomed ${zoomWords(m.zoom)}`)
  if (m.mode) parts.push(m.mode)
  if (m.full) parts.push("full window")
  return parts.join(", ")
}

/**
 * Saved feedback read back: anything malformed is dropped rather than trusted, and steps the
 * document no longer has are kept (an agent's next draft may bring them back).
 */
export function readState(raw: string | null | undefined): WalkthroughState {
  if (!raw) return EMPTY_STATE
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== "object") return EMPTY_STATE
    const o = v as { steps?: unknown; note?: unknown; notes?: unknown }
    const steps: Record<string, StepFeedback> = {}
    if (o.steps && typeof o.steps === "object")
      for (const [key, fb] of Object.entries(o.steps as Record<string, unknown>)) {
        if (!fb || typeof fb !== "object") continue
        const f = fb as Record<string, unknown>
        const clean: Record<string, string> = {}
        for (const k of ["verdict", "pick", "note"] as const)
          if (typeof f[k] === "string" && (f[k] as string).trim()) clean[k] = f[k] as string
        if (Object.keys(clean).length) steps[key] = clean
      }
    const notes = Array.isArray(o.notes) ? o.notes.filter(isNote) : []
    return {
      steps,
      ...(notes.length ? { notes } : {}),
      ...(typeof o.note === "string" && o.note.trim() ? { note: o.note } : {}),
    }
  } catch {
    return EMPTY_STATE
  }
}

function isNote(v: unknown): v is WalkNote {
  if (!v || typeof v !== "object") return false
  const n = v as Record<string, unknown>
  const ctx = n.context as Record<string, unknown> | undefined
  return (
    typeof n.id === "string" &&
    typeof n.at === "number" &&
    (n.step === null || typeof n.step === "string") &&
    (n.text === undefined || typeof n.text === "string") &&
    !!ctx &&
    Array.isArray(ctx.log) &&
    hasContent(n as unknown as WalkNote)
  )
}

/** A note as the agent reads it. */
export interface FeedbackNote {
  /** ISO time. */
  readonly at: string
  readonly text?: string
  readonly voice?: WalkVoice
  readonly ink?: WalkInk
  readonly media?: MediaContext
  /** What led up to it: seconds before the note, oldest first. */
  readonly log: readonly (Omit<ContextEvent, "at"> & { readonly ago: number })[]
}

/** One step's line in the feedback. */
export interface FeedbackItem {
  readonly key: string
  readonly number: string
  readonly section: string
  readonly title: string
  readonly ask: "note" | "pick" | "none"
  readonly pick?: string
  readonly pickLabel?: string
  /** The option the agent suggested, when Kit picked another. */
  readonly suggested?: string
  readonly notes: readonly FeedbackNote[]
  /** Older documents' verdict and note, when there are any. */
  readonly verdict?: string
  readonly note?: string
}

/** What a page hands back to the agent: every asked step (open ones with nothing in them). */
export interface WalkthroughFeedback {
  readonly id: string
  readonly title: string
  readonly reviewed: number
  readonly total: number
  readonly note?: string
  readonly steps: readonly FeedbackItem[]
  /** Notes sent with no step in view. */
  readonly general: readonly FeedbackNote[]
}

const noteOut = (n: WalkNote): FeedbackNote => ({
  at: new Date(n.at).toISOString(),
  ...(n.text?.trim() ? { text: n.text.trim() } : {}),
  ...(n.voice ? { voice: n.voice } : {}),
  ...(n.ink?.paths.length ? { ink: n.ink } : {}),
  ...(n.context.media ? { media: n.context.media } : {}),
  log: n.context.log.map(({ at, ...e }) => ({ ...e, ago: Math.round((n.at - at) / 100) / 10 })),
})

/** Kit's feedback on `w`, step by step in reading order. */
export function collectFeedback(w: WalkPage, state: WalkthroughState): WalkthroughFeedback {
  const progress = walkthroughProgress(w, state)
  const sectionTitle = new Map(
    w.sections.map((s) => [s.id, s.link ? `${s.link.label} ${s.title}` : s.title]),
  )
  const keys = new Set(w.steps.map((s) => s.key))
  const steps: FeedbackItem[] = []
  for (const s of w.steps) {
    const fb = state.steps[s.key]
    const notes = notesOn(state, s.key).map(noteOut)
    if (s.ask === "none" && !notes.length) continue
    const option = s.ask === "pick" ? s.options.find((o) => o.id === fb?.pick) : undefined
    const suggested = s.options.find((o) => o.suggested)
    steps.push({
      key: s.key,
      number: s.number,
      section: sectionTitle.get(s.section) ?? s.section,
      title: s.title,
      ask: s.ask,
      ...(option ? { pick: option.id, pickLabel: `${option.letter}: ${option.label}` } : {}),
      ...(option && suggested && suggested.id !== option.id
        ? { suggested: `${suggested.letter}: ${suggested.label}` }
        : {}),
      notes,
      ...(fb?.verdict ? { verdict: fb.verdict } : {}),
      ...(fb?.note ? { note: fb.note } : {}),
    })
  }
  return {
    id: w.id,
    title: w.title,
    reviewed: progress.done,
    total: progress.total,
    ...(state.note ? { note: state.note } : {}),
    steps,
    general: (state.notes ?? []).filter((n) => !n.step || !keys.has(n.step)).map(noteOut),
  }
}

const quote = (text: string) => text.trim().replace(/\s*\n\s*/g, " ")

/** A note as one Markdown line: its words, voice and ink, then what was on show. */
function noteLine(n: FeedbackNote): string {
  const bits: string[] = []
  if (n.text) bits.push(`“${quote(n.text)}”`)
  if (n.voice) bits.push(`voice note ${formatTime(n.voice.duration)} (${n.voice.url})`)
  if (n.ink) bits.push(`ink, ${n.ink.paths.length} stroke${n.ink.paths.length === 1 ? "" : "s"}`)
  const seen = describeMedia(n.media)
  return `${bits.join(" + ")}${seen ? ` · ${seen}` : ""}`
}

/**
 * The feedback as Markdown to paste back to the agent: a heading per section, a line per step
 * (its pick in bold, open ones marked), its notes under it with what Kit was looking at.
 */
export function feedbackMarkdown(fb: WalkthroughFeedback, verdicts?: readonly WalkVerdict[]) {
  const name = (id: string) => verdicts?.find((v) => v.id === id)?.label ?? label(id)
  const lines = [
    `## Feedback: ${fb.title}`,
    "",
    `${fb.reviewed} of ${fb.total} reviewed · \`${fb.id}\``,
  ]
  if (fb.note) lines.push("", quote(fb.note))
  if (fb.general.length) {
    lines.push("", "### General")
    for (const n of fb.general) lines.push(`- ${noteLine(n)}`)
  }
  let section = ""
  for (const s of fb.steps) {
    if (s.section !== section) {
      section = s.section
      lines.push("", `### ${section}`)
    }
    const head: string[] = []
    if (s.pickLabel)
      head.push(`**Picked ${s.pickLabel}**${s.suggested ? ` (suggested ${s.suggested})` : ""}`)
    if (s.verdict) head.push(`**${name(s.verdict)}**`)
    if (s.note) head.push(`“${quote(s.note)}”`)
    const open = !head.length && !s.notes.length
    lines.push(
      `- ${s.number} ${s.title}: ${open ? "_open_" : head.join(" · ") || `${s.notes.length} note${s.notes.length === 1 ? "" : "s"}`}`,
    )
    for (const n of s.notes) lines.push(`  - ${noteLine(n)}`)
  }
  return lines.join("\n") + "\n"
}

// ——— prose ———

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  )

/**
 * Inline Markdown as safe HTML: `code`, **bold**, *italic* and [links](https://…), the rest
 * escaped. Links take http(s), relative and # URLs only; blank lines make paragraphs' breaks.
 */
/** Inline Markdown as plain words, for a contents row, a label or a title attribute. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
}

export function inlineMarkdown(text: string): string {
  const codes: string[] = []
  let s = text.replace(/`([^`\n]+)`/g, (_, c: string) => {
    codes.push(c)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = escapeHtml(s)
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t: string, href: string) => {
    const raw = href.replace(/&amp;/g, "&")
    if (!/^(https?:\/\/|\/|\.{0,2}\/|#)/i.test(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw)) return m
    return `<a href="${href}" target="_blank" rel="noreferrer">${t}</a>`
  })
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<i>$2</i>")
  s = s.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, " ")
  return s.replace(
    /\u0000(\d+)\u0000/g,
    (_, i: string) => `<code>${escapeHtml(codes[Number(i)]!)}</code>`,
  )
}
