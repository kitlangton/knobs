"use client"
import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { split, type Split as SplitHandle, type SplitOptions } from "./split.js"
import { tree, type Tree as TreeHandle, type TreeOptions } from "./tree.js"

export type SplitProps = SplitOptions & {
  /** One child per pane, in the panes' order; each renders into its pane's body. */
  children?: ReactNode
  className?: string
  style?: CSSProperties
  onReady?: (split: SplitHandle) => void
}

/** `split()` as a component: its children portal into the panes. */
export function Split(props: SplitProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [handle, setHandle] = useState<SplitHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  const shape = props.panes.map((p) => p.id).join("\u0000")
  useLayoutEffect(() => {
    const s = split(ref.current!, {
      ...latest.current,
      onLayout: (layout) => latest.current.onLayout?.(layout),
    })
    setHandle(s)
    latest.current.onReady?.(s)
    return () => s.dispose()
  }, [props.direction, props.id, shape])
  const kids = Children.toArray(props.children)
  return (
    <div
      ref={ref}
      className={props.className}
      style={{ width: "100%", height: "100%", ...props.style }}
    >
      {handle &&
        props.panes.map((p, i) =>
          kids[i] === undefined ? null : createPortal(kids[i], handle.pane(p.id).body, p.id),
        )}
    </div>
  )
}

export type TreeProps<T> = TreeOptions<T> & {
  className?: string
  style?: CSSProperties
  onReady?: (tree: TreeHandle<T>) => void
}

/**
 * `tree()` as a component. New `items` update it in place (rows glide); `selection` and
 * `filter` follow their props; callbacks always call the latest props.
 */
export function Tree<T>(props: TreeProps<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<TreeHandle<T> | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const p = latest.current
    const call =
      <K extends keyof TreeOptions<T>>(key: K) =>
      (...args: unknown[]) =>
        (latest.current[key] as ((...a: unknown[]) => unknown) | undefined)?.(...args)
    const t = tree(ref.current!, {
      ...p,
      onSelect: call("onSelect"),
      onToggle: call("onToggle"),
      onMove: p.onMove && call("onMove"),
      onRename: p.onRename && call("onRename"),
      onActivate: p.onActivate && call("onActivate"),
      canDrop: p.canDrop && (call("canDrop") as (m: never) => boolean),
    } as TreeOptions<T>)
    handle.current = t
    p.onReady?.(t)
    return () => {
      t.dispose()
      handle.current = null
    }
  }, [])
  const first = useRef(true)
  useEffect(() => {
    if (first.current) return
    handle.current?.update(props.items)
  }, [props.items])
  useEffect(() => {
    if (first.current || !props.selection) return
    handle.current?.select(props.selection)
  }, [props.selection])
  useEffect(() => {
    if (first.current) return
    handle.current?.filter(props.filter)
  }, [props.filter])
  useEffect(() => {
    first.current = false
  }, [])
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}
