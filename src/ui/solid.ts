import { children, createEffect, onCleanup, untrack, type JSX } from "solid-js"
import { split, type Split as SplitHandle, type SplitOptions } from "./split.js"
import { timeline, type Timeline as TimelineHandle, type TimelineOptions } from "./timeline.js"
import { tree, type Tree as TreeHandle, type TreeOptions } from "./tree.js"

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
    }),
  )
  untrack(() => props.onReady?.(t))
  // Each prop follows on its own, after the first run (the tree starts from them).
  const follow = <V>(read: () => V, apply: (value: V) => void) => {
    let first = true
    createEffect(() => {
      const value = read()
      if (first) first = false
      else untrack(() => apply(value))
    })
  }
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
  const follow = <K extends keyof TimelineOptions>(key: K) => {
    let first = true
    createEffect(() => {
      const value = props[key]
      if (first) {
        first = false
        return
      }
      untrack(() => {
        if (value === undefined) return
        if (key === "time" && Math.abs((value as number) - t.time) < 1e-6) return
        if (key === "playing" && value === t.playing) return
        if ((key === "markers" && value === t.markers) || (key === "ranges" && value === t.ranges))
          return
        t.update({ [key]: value })
      })
    })
  }
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
    follow(key)
  onCleanup(() => t.dispose())
  return host as unknown as JSX.Element
}
