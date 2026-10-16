import {
  children,
  createEffect,
  createRoot,
  getOwner,
  onCleanup,
  untrack,
  type JSX,
} from "solid-js"
import { insert } from "solid-js/web"
import { follower } from "./follow.js"
import { activity, type Activity as ActivityHandle, type ActivityOptions } from "./activity.js"
import { bento, type Bento as BentoHandle, type BentoOptions } from "./bento.js"
import {
  optionPicker,
  type OptionPicker as OptionPickerHandle,
  type OptionPickerOptions,
  type PickerOption,
} from "./picker.js"
import { split, type Split as SplitHandle, type SplitOptions } from "./split.js"
import { timeline, type Timeline as TimelineHandle, type TimelineOptions } from "./timeline.js"
import { tree, type Tree as TreeHandle, type TreeOptions } from "./tree.js"

/**
 * A prop that follows into the piece made from it: later values go to `apply`, and so does a
 * value that changed in the same update that mounted the component (see `follower`).
 */
const follow = <V>(read: () => V, apply: (value: V) => void) => {
  const changed = follower(untrack(read))
  createEffect(() => {
    const value = read()
    if (changed(value)) untrack(() => apply(value))
  })
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
  const s = untrack(() => split(host, { ...props, onLayout: (layout) => props.onLayout?.(layout) }))
  const kids = children(() => props.children)
  createEffect(() => {
    const list = kids.toArray()
    untrack(() =>
      props.panes.forEach((p, i) => {
        const body = s.pane(p.id).body
        const kid = list[i]
        const node =
          kid instanceof Node ? kid : kid == null ? null : document.createTextNode(String(kid))
        if (node ? body.firstChild !== node || body.childNodes.length > 1 : body.firstChild)
          body.replaceChildren(...(node ? [node] : []))
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
    () => props.items,
    (items) => t.update(items),
  )
  follow(
    () => props.selection,
    (selection) => selection && t.select(selection),
  )
  follow(
    () => props.filter,
    (filter) => t.filter(filter),
  )
  onCleanup(() => t.dispose())
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
  const follow1 = <K extends keyof TimelineOptions>(key: K) =>
    follow(
      () => props[key],
      (value) => {
        if (value === undefined) return
        if (key === "time" && Math.abs((value as number) - t.time) < 1e-6) return
        if (key === "playing" && value === t.playing) return
        if ((key === "markers" && value === t.markers) || (key === "ranges" && value === t.ranges))
          return
        t.update({ [key]: value })
      },
    )
  for (const key of [
    "time",
    "playing",
    "markers",
    "ranges",
    "duration",
    "fps",
    "units",
    "speed",
  ] as const)
    follow1(key)
  onCleanup(() => t.dispose())
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
    () => props.items,
    (items) => b.update(items),
  )
  follow(
    () => props.picks,
    (picks) => picks && b.pick(picks),
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
    () => props.events,
    (events) => a.set(events),
  )
  follow(
    () => props.selected,
    (id) => id !== undefined && id !== a.selected && a.select(id),
  )
  follow(
    () => props.newest,
    (newest) => newest && a.update({ newest }),
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
    () => props.options,
    (options) => p.set(options),
  )
  follow(
    () => props.selected,
    (id) => id != null && p.select(id),
  )
  follow(
    () => props.chosen,
    (id) => p.choose(id ?? null),
  )
  onCleanup(() => p.destroy())
  return host as unknown as JSX.Element
}

export type { ActivityEvent } from "./activity-model.js"
export type { PickerOption } from "./picker.js"
