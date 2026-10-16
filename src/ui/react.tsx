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
import { activity, type Activity as ActivityHandle, type ActivityOptions } from "./activity.js"
import { bento, type Bento as BentoHandle, type BentoOptions } from "./bento.js"
import { anyChanged, propChanges, timelineChanges } from "./follow.js"
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
 * Props that follow into the piece made from them, in one effect after each render: whichever
 * changed (since the piece was made, at first) go to `apply` together, which applies them in its
 * own order (options before the selection among them).
 */
function useFollow<P extends object>(values: P, apply: (changed: Partial<P>) => void) {
  const changes = useRef<((next: P) => Partial<P>) | null>(null)
  changes.current ??= propChanges(values)
  useEffect(() => {
    const changed = changes.current!(values)
    if (anyChanged(changed)) apply(changed)
  })
}

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
      // The latest rule, read per key.
      typeahead: (key: string) => {
        const rule = latest.current.typeahead ?? true
        return typeof rule === "function" ? rule(key) : rule
      },
    } as TreeOptions<T>)
    handle.current = t
    p.onReady?.(t)
    return () => {
      t.dispose()
      handle.current = null
    }
  }, [])
  useFollow({ items: props.items, filter: props.filter, selection: props.selection }, (c) => {
    const t = handle.current
    if (!t) return
    if ("items" in c) t.update(c.items!)
    if ("filter" in c) t.filter(c.filter)
    if (c.selection) t.select(c.selection)
  })
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}

export type TimelineProps = TimelineOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (timeline: TimelineHandle) => void
}

/**
 * `timeline()` as a component. `time`, `playing`, `markers`, `ranges`, `duration`, `fps`,
 * `units` and `speed` follow their props (a `time` it reported itself is left alone); callbacks
 * always call the latest props.
 */
export function Timeline(props: TimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<TimelineHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const t = timeline(ref.current!, {
      ...latest.current,
      onSeek: (time, source) => latest.current.onSeek?.(time, source),
      onPlay: (playing) => latest.current.onPlay?.(playing),
      onMarkers: (m) => latest.current.onMarkers?.(m),
      onRanges: (r) => latest.current.onRanges?.(r),
      onCross: (m) => latest.current.onCross?.(m),
    })
    handle.current = t
    latest.current.onReady?.(t)
    return () => {
      t.dispose()
      handle.current = null
    }
  }, [])
  useFollow(
    {
      duration: props.duration,
      fps: props.fps,
      units: props.units,
      speed: props.speed,
      markers: props.markers,
      ranges: props.ranges,
      time: props.time,
      playing: props.playing,
    },
    (c) => {
      const t = handle.current
      const next = t && timelineChanges(t, c)
      if (t && next && anyChanged(next)) t.update(next)
    },
  )
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}

export type BentoProps = BentoOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (bento: BentoHandle) => void
}

/**
 * `bento()` as a component. New `items` update it in place (tiles glide); `picks` follows its
 * prop; callbacks always call the latest props.
 */
export function Bento(props: BentoProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<BentoHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const b = bento(ref.current!, {
      ...latest.current,
      onPick: (ids) => latest.current.onPick?.(ids),
      onZoom: (id) => latest.current.onZoom?.(id),
      onActive: (id) => latest.current.onActive?.(id),
    })
    handle.current = b
    latest.current.onReady?.(b)
    return () => {
      b.dispose()
      handle.current = null
    }
  }, [])
  useFollow({ items: props.items, picks: props.picks }, (c) => {
    const b = handle.current
    if (!b) return
    if ("items" in c) b.update(c.items!)
    if (c.picks) b.pick(c.picks)
  })
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}

export type ActivityProps = ActivityOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (activity: ActivityHandle) => void
}

/**
 * `activity()` as a component. New `events` update it in place (rows keep their identity and
 * glide); `selected` follows its prop; callbacks always call the latest props.
 */
export function Activity(props: ActivityProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<ActivityHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const p = latest.current
    const a = activity(ref.current!, {
      ...p,
      onSelect: (id, event, source) => latest.current.onSelect?.(id, event, source),
      onActivate: (id, event) => latest.current.onActivate?.(id, event),
      onToggle: (id, open) => latest.current.onToggle?.(id, open),
      onPlay: p.onPlay && ((id, event) => latest.current.onPlay?.(id, event)),
    })
    handle.current = a
    p.onReady?.(a)
    return () => {
      a.destroy()
      handle.current = null
    }
  }, [])
  useFollow({ events: props.events, newest: props.newest, selected: props.selected }, (c) => {
    const a = handle.current
    if (!a) return
    if (c.events || c.newest) a.update({ events: c.events, newest: c.newest })
    if (c.selected !== undefined && c.selected !== a.selected) a.select(c.selected)
  })
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}

export type OptionPickerProps = Omit<OptionPickerOptions, "body"> & {
  /** An option's parameters, portalled under it the first time it opens (a `<Knobs>` panel, say). */
  children?: (option: PickerOption) => ReactNode
  className?: string
  style?: CSSProperties
  onReady?: (picker: OptionPickerHandle) => void
}

/**
 * `optionPicker()` as a component: `children` renders each opened option's parameters into its
 * place through a portal, so context and state carry through. `options`, `selected` and
 * `chosen` follow their props; callbacks always call the latest props.
 */
export function OptionPicker(props: OptionPickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<OptionPickerHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [bodies, setBodies] = useState<readonly { option: PickerOption; el: HTMLElement }[]>([])
  useLayoutEffect(() => {
    const p = optionPicker(ref.current!, {
      ...latest.current,
      onSelect: (id, source) => latest.current.onSelect?.(id, source),
      onChoose: (id) => latest.current.onChoose?.(id),
      body: (option, el) => {
        setBodies((all) => [...all, { option, el }])
        return () => setBodies((all) => all.filter((b) => b.el !== el))
      },
    })
    handle.current = p
    latest.current.onReady?.(p)
    return () => {
      p.destroy()
      handle.current = null
    }
  }, [])
  useFollow({ options: props.options, selected: props.selected, chosen: props.chosen }, (c) => {
    const p = handle.current
    if (!p) return
    if ("options" in c) p.set(c.options!)
    if (c.selected != null) p.select(c.selected)
    if ("chosen" in c) p.choose(c.chosen ?? null)
  })
  return (
    <div ref={ref} className={props.className} style={props.style}>
      {props.children &&
        bodies.map(({ option, el }) => createPortal(props.children!(option), el, option.id))}
    </div>
  )
}

export type { ActivityEvent } from "./activity-model.js"
export type { PickerOption } from "./picker.js"
