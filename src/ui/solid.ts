import { createEffect, onCleanup, untrack, type JSX } from "solid-js"
import { split, type Split as SplitHandle, type SplitOptions } from "./split.js"
import { tree, type Tree as TreeHandle, type TreeOptions } from "./tree.js"

export type SplitProps = SplitOptions & {
  /** One element per pane, in the panes' order; each goes into its pane's body. */
  children?: JSX.Element
  onReady?: (split: SplitHandle) => void
}

const nodes = (value: unknown): Node[] =>
  Array.isArray(value)
    ? value.flatMap(nodes)
    : value instanceof Node
      ? [value]
      : value == null || value === false
        ? []
        : [document.createTextNode(String(value))]

/** `split()` as a component: each child goes into its pane. */
export function Split(props: SplitProps): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  host.style.cssText = "width:100%;height:100%"
  createEffect(() => {
    const s = untrack(() =>
      split(host, { ...props, onLayout: (layout) => props.onLayout?.(layout) }),
    )
    const kids = nodes(props.children)
    untrack(() => {
      props.panes.forEach((p, i) => {
        if (kids[i]) s.pane(p.id).body.append(kids[i]!)
      })
      props.onReady?.(s)
    })
    onCleanup(() => s.dispose())
  })
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
