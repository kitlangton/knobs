import {
  createEffect,
  createMemo,
  createRoot,
  getOwner,
  onCleanup,
  splitProps,
  untrack,
  type JSX,
} from "solid-js"
import { insert } from "solid-js/web"
import { anyChanged, propChanges, timelineChanges } from "./follow.js"
import { activity, type Activity as ActivityHandle, type ActivityOptions } from "./activity.js"
import { bento, type Bento as BentoHandle, type BentoOptions } from "./bento.js"
import {
  codeDiff,
  diffReview,
  type CodeDiff as CodeDiffHandle,
  type CodeDiffOptions,
  type DiffReview as DiffReviewHandle,
  type DiffReviewOptions,
} from "./diff.js"
import {
  optionPicker,
  type OptionPicker as OptionPickerHandle,
  type OptionPickerOptions,
  type PickerOption,
} from "./picker.js"
import { split, type Split as SplitHandle, type SplitOptions } from "./split.js"
import { timeline, type Timeline as TimelineHandle, type TimelineOptions } from "./timeline.js"
import { compare, type Compare as CompareHandle, type CompareOptions } from "./compare.js"
import {
  compareStrip,
  type CompareStrip as CompareStripHandle,
  type CompareStripOptions,
} from "./compare-strip.js"
import { tree, type Tree as TreeHandle, type TreeOptions } from "./tree.js"
import {
  tasteTest,
  walkthrough,
  type TasteTest as TasteTestHandle,
  type TasteTestOptions,
  type Walkthrough as WalkthroughHandle,
  type WalkthroughOptions,
} from "./walkthrough.js"
import {
  mediaSlot,
  type MediaSlot as MediaSlotHandle,
  type MediaSlotOptions,
} from "./walkthrough-media.js"

/**
 * Props that follow into the piece made from them, in one effect: whichever changed (since the
 * piece was made, at first) go to `apply` together, which applies them in its own order. Solid
 * runs effects in the order their sources change, so one effect per prop could select an option
 * before the options that hold it arrived.
 */
const follow = <P extends object>(read: () => P, apply: (changed: Partial<P>) => void) => {
  const changes = propChanges(untrack(read))
  createEffect(() => {
    const changed = changes(read())
    if (anyChanged(changed)) untrack(() => apply(changed))
  })
}

/** A child's nodes, its reactive parts read (as Solid's `children` helper reads them). */
const nodes = (kid: unknown): Node[] => {
  if (typeof kid === "function" && kid.length === 0) return nodes(kid())
  if (Array.isArray(kid)) return kid.flatMap(nodes)
  if (kid instanceof Node) return [kid]
  if (kid == null || typeof kid === "boolean") return []
  return [document.createTextNode(String(kid))]
}

export type SplitProps = SplitOptions & {
  /** One element per pane, in the panes' order; each goes into its pane's body. */
  children?: JSX.Element
  onReady?: (split: SplitHandle) => void
}

/**
 * `split()` as a component: each child goes into its pane. The split is made once; children
 * that change move into their panes.
 */
export function Split(props: SplitProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.cssText = "width:100%;height:100%"
  // Reading `children` makes them, so only the memo below reads it: spreading props into split()
  // would make every pane's child a second time.
  const [, options] = splitProps(props, ["children", "onReady"])
  const s = untrack(() =>
    split(host, { ...options, onLayout: (layout) => props.onLayout?.(layout) }),
  )
  // The children, made once (again only if the expression itself changes); then one entry per
  // pane, each its child's nodes (a fragment or <For> stays in its own pane), re-read when a
  // reactive child (a <Show>) changes without making its siblings again.
  const made = createMemo(() => props.children as unknown)
  const kids = createMemo(() => {
    const list = made()
    return (Array.isArray(list) ? list : [list]).map(nodes)
  })
  createEffect(() => {
    const list = kids()
    untrack(() =>
      props.panes.forEach((p, i) => {
        const body = s.pane(p.id).body
        const next = list[i] ?? []
        const same =
          body.childNodes.length === next.length && next.every((n, j) => body.childNodes[j] === n)
        if (!same) body.replaceChildren(...next)
      }),
    )
  })
  untrack(() => props.onReady?.(s))
  onCleanup(() => s.dispose())
  return host as unknown as JSX.Element
}

export type TreeProps<T> = TreeOptions<T> & { onReady?: (tree: TreeHandle<T>) => void }

/**
 * `tree()` as a component. New `items` update it in place (rows glide); `selection` and
 * `filter` follow their props; callbacks always call the latest props.
 */
export function Tree<T>(props: TreeProps<T>): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const t = untrack(() =>
    tree(host, {
      ...props,
      items: props.items,
      onSelect: (ids, primary) => props.onSelect?.(ids, primary),
      onToggle: (id, open) => props.onToggle?.(id, open),
      onMove: props.onMove && ((move) => props.onMove?.(move)),
      onRename: props.onRename && ((id, label) => props.onRename?.(id, label)),
      onActivate: props.onActivate && ((id) => props.onActivate?.(id)),
      typeahead: (key) => {
        const rule = props.typeahead ?? true
        return typeof rule === "function" ? rule(key) : rule
      },
    }),
  )
  untrack(() => props.onReady?.(t))
  follow(
    () => ({ items: props.items, filter: props.filter, selection: props.selection }),
    (c) => {
      if ("items" in c) t.update(c.items!)
      if ("filter" in c) t.filter(c.filter)
      if (c.selection) t.select(c.selection)
    },
  )
  onCleanup(() => t.dispose())
  return host as unknown as JSX.Element
}

export type CodeDiffProps = CodeDiffOptions & { onReady?: (diff: CodeDiffHandle) => void }

const diffProps = (props: CodeDiffOptions) => () => ({
  patch: props.patch,
  files: props.files,
  file: props.file,
  layout: props.layout,
  wrap: props.wrap,
  viewed: props.viewed,
  height: props.height,
  maxHeight: props.maxHeight,
})

/**
 * `codeDiff()` as a component. `patch`, `files`, `file`, `layout`, `wrap`, `viewed`, `height` and
 * `maxHeight` follow their
 * props; callbacks always call the latest props.
 */
export function CodeDiff(props: CodeDiffProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  if (untrack(() => props.height) !== "auto") host.style.height = "100%"
  const d = untrack(() =>
    codeDiff(host, {
      ...props,
      onFile: (name) => props.onFile?.(name),
      onLayout: (layout) => props.onLayout?.(layout),
      onWrap: (wrap) => props.onWrap?.(wrap),
      onLines: props.onLines && ((lines, file) => props.onLines?.(lines, file)),
      onViewed: props.onViewed && ((viewed, file) => props.onViewed?.(viewed, file)),
    }),
  )
  untrack(() => props.onReady?.(d))
  follow(diffProps(props), (c) => {
    if (c.height) host.style.height = c.height === "auto" ? "" : "100%"
    d.update(c)
  })
  onCleanup(() => d.dispose())
  return host as unknown as JSX.Element
}

export type DiffReviewProps = DiffReviewOptions & { onReady?: (review: DiffReviewHandle) => void }

/** `diffReview()` as a component: the file tree beside the diff; follows as `CodeDiff` does. */
export function DiffReview(props: DiffReviewProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  if (untrack(() => props.height) !== "auto") host.style.height = "100%"
  const r = untrack(() =>
    diffReview(host, {
      ...props,
      onFile: (name) => props.onFile?.(name),
      onLayout: (layout) => props.onLayout?.(layout),
      onWrap: (wrap) => props.onWrap?.(wrap),
      onLines: props.onLines && ((lines, file) => props.onLines?.(lines, file)),
      onViewed: (viewed, file) => props.onViewed?.(viewed, file),
    }),
  )
  untrack(() => props.onReady?.(r))
  follow(diffProps(props), (c) => {
    if (c.height) host.style.height = c.height === "auto" ? "" : "100%"
    r.update(c)
  })
  onCleanup(() => r.dispose())
  return host as unknown as JSX.Element
}

export type TimelineProps = TimelineOptions & { onReady?: (timeline: TimelineHandle) => void }

/**
 * `timeline()` as a component. `time`, `playing`, `markers`, `ranges`, `duration`, `fps`,
 * `units` and `speed` follow their props (a `time` it reported itself is left alone); callbacks
 * always call the latest props.
 */
export function Timeline(props: TimelineProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const t = untrack(() =>
    timeline(host, {
      ...props,
      onSeek: (time, source) => props.onSeek?.(time, source),
      onPlay: (playing) => props.onPlay?.(playing),
      onMarkers: (m) => props.onMarkers?.(m),
      onRanges: (r) => props.onRanges?.(r),
      onCross: (m) => props.onCross?.(m),
    }),
  )
  untrack(() => props.onReady?.(t))
  follow(
    () => ({
      duration: props.duration,
      fps: props.fps,
      units: props.units,
      speed: props.speed,
      markers: props.markers,
      ranges: props.ranges,
      time: props.time,
      playing: props.playing,
    }),
    (c) => {
      const next = timelineChanges(t, c)
      if (anyChanged(next)) t.update(next)
    },
  )
  onCleanup(() => t.dispose())
  return host as unknown as JSX.Element
}

export type CompareProps = CompareOptions & { onReady?: (compare: CompareHandle) => void }

/**
 * `compare()` as a component, made once (with the `timeline`, `strip` and `renderer` it starts
 * with). `before`, `after` (by `src`), `mode`, `wipe`, `loupe`, `threshold` and `fps` follow
 * their props; callbacks always call the latest props.
 */
export function Compare(props: CompareProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const c = untrack(() =>
    compare(host, {
      ...props,
      onMode: (mode) => props.onMode?.(mode),
      onWipe: (wipe) => props.onWipe?.(wipe),
      onView: (view) => props.onView?.(view),
    }),
  )
  untrack(() => props.onReady?.(c))
  follow(
    () => ({
      before: props.before,
      after: props.after,
      mode: props.mode,
      wipe: props.wipe,
      loupe: props.loupe,
      threshold: props.threshold,
      fps: props.fps,
    }),
    (changed) => {
      const next = Object.fromEntries(Object.entries(changed).filter(([, v]) => v !== undefined))
      if (anyChanged(next)) c.update(next)
    },
  )
  onCleanup(() => c.dispose())
  return host as unknown as JSX.Element
}

export type CompareStripProps = CompareStripOptions & {
  onReady?: (strip: CompareStripHandle) => void
}

/** `compareStrip()` as a component, on a timeline handle; new sources (by `src`) follow. */
export function CompareStrip(props: CompareStripProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const s = untrack(() => compareStrip(host, { ...props, onPick: (time) => props.onPick?.(time) }))
  untrack(() => props.onReady?.(s))
  follow(
    () => ({ before: props.before.src, after: props.after.src }),
    (changed) =>
      s.update({
        ...("before" in changed ? { before: props.before } : {}),
        ...("after" in changed ? { after: props.after } : {}),
      }),
  )
  onCleanup(() => s.dispose())
  return host as unknown as JSX.Element
}

export type BentoProps = BentoOptions & { onReady?: (bento: BentoHandle) => void }

/**
 * `bento()` as a component. New `items` update it in place (tiles glide); `picks` follows its
 * prop; callbacks always call the latest props.
 */
export function Bento(props: BentoProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const b = untrack(() =>
    bento(host, {
      ...props,
      items: props.items,
      onPick: (ids) => props.onPick?.(ids),
      onZoom: (id) => props.onZoom?.(id),
      onActive: (id) => props.onActive?.(id),
    }),
  )
  untrack(() => props.onReady?.(b))
  follow(
    () => ({ items: props.items, picks: props.picks }),
    (c) => {
      if ("items" in c) b.update(c.items!)
      if (c.picks) b.pick(c.picks)
    },
  )
  onCleanup(() => b.dispose())
  return host as unknown as JSX.Element
}

export type ActivityProps = ActivityOptions & { onReady?: (activity: ActivityHandle) => void }

/**
 * `activity()` as a component. New `events` update it in place (rows keep their identity and
 * glide); `selected` follows its prop; callbacks always call the latest props.
 */
export function Activity(props: ActivityProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.height = "100%"
  const a = untrack(() =>
    activity(host, {
      ...props,
      onSelect: (id, event, source) => props.onSelect?.(id, event, source),
      onActivate: (id, event) => props.onActivate?.(id, event),
      onToggle: (id, open) => props.onToggle?.(id, open),
      onPlay: props.onPlay && ((id, event) => props.onPlay?.(id, event)),
    }),
  )
  untrack(() => props.onReady?.(a))
  follow(
    () => ({ events: props.events, newest: props.newest, selected: props.selected }),
    (c) => {
      if (c.events || c.newest) a.update({ events: c.events, newest: c.newest })
      if (c.selected !== undefined && c.selected !== a.selected) a.select(c.selected)
    },
  )
  onCleanup(() => a.destroy())
  return host as unknown as JSX.Element
}

export type OptionPickerProps = Omit<OptionPickerOptions, "body"> & {
  /** An option's parameters, rendered once, the first time it opens (a `KnobsPanel`, say). */
  children?: (option: PickerOption) => JSX.Element
  onReady?: (picker: OptionPickerHandle) => void
}

/**
 * `optionPicker()` as a component: `children` renders an option's parameters under it, in this
 * component's context. `options`, `selected` and `chosen` follow their props; callbacks always
 * call the latest props.
 */
export function OptionPicker(props: OptionPickerProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  const owner = getOwner()
  const p = untrack(() =>
    optionPicker(host, {
      ...props,
      onSelect: (id, source) => props.onSelect?.(id, source),
      onChoose: (id) => props.onChoose?.(id),
      body: (option, element) => {
        const render = props.children
        if (!render) return
        return createRoot((dispose) => {
          insert(
            element,
            untrack(() => render(option)),
          )
          return dispose
        }, owner)
      },
    }),
  )
  untrack(() => props.onReady?.(p))
  follow(
    () => ({ options: props.options, selected: props.selected, chosen: props.chosen }),
    (c) => {
      if ("options" in c) p.set(c.options!)
      if (c.selected != null) p.select(c.selected)
      if ("chosen" in c) p.choose(c.chosen ?? null)
    },
  )
  onCleanup(() => p.destroy())
  return host as unknown as JSX.Element
}

export type { ActivityEvent } from "./activity-model.js"
export type { PickerOption } from "./picker.js"

export type WalkthroughProps = WalkthroughOptions & {
  onReady?: (walkthrough: WalkthroughHandle) => void
}

/**
 * `walkthrough()` as a component: a new `doc` is a new draft (answers carry over by step key);
 * `onFeedback` always calls the latest prop.
 */
export function Walkthrough(props: WalkthroughProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  const w = untrack(() =>
    walkthrough(host, { ...props, onFeedback: (feedback) => props.onFeedback?.(feedback) }),
  )
  untrack(() => props.onReady?.(w))
  follow(
    () => ({ doc: props.doc }),
    (c) => c.doc && w.set(c.doc),
  )
  onCleanup(() => w.dispose())
  return host as unknown as JSX.Element
}

export type TasteTestProps = TasteTestOptions & { onReady?: (test: TasteTestHandle) => void }

/** `tasteTest()` as a component: `picked` follows its prop. */
export function TasteTest(props: TasteTestProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  const t = untrack(() => tasteTest(host, { ...props, onPick: (id) => props.onPick?.(id) }))
  untrack(() => props.onReady?.(t))
  follow(
    () => ({ picked: props.picked }),
    (c) => "picked" in c && t.pick(c.picked ?? null),
  )
  onCleanup(() => t.dispose())
  return host as unknown as JSX.Element
}

export type MediaSlotProps = MediaSlotOptions & { onReady?: (slot: MediaSlotHandle) => void }

/** `mediaSlot()` as a component: one walkthrough media slot. */
export function MediaSlot(props: MediaSlotProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  const s = untrack(() => mediaSlot(host, props))
  untrack(() => props.onReady?.(s))
  onCleanup(() => s.dispose())
  return host as unknown as JSX.Element
}

export type { WalkthroughDoc, WalkthroughFeedback } from "./walkthrough-model.js"
