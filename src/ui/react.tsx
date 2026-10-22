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
import { canvas, type Canvas as CanvasHandle, type CanvasOptions } from "./canvas.js"
import {
  codeDiff,
  diffReview,
  type CodeDiff as CodeDiffHandle,
  type CodeDiffOptions,
  type DiffReview as DiffReviewHandle,
  type DiffReviewOptions,
} from "./diff.js"
import { anyChanged, propChanges, timelineChanges } from "./follow.js"
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

export type CodeDiffProps = CodeDiffOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (diff: CodeDiffHandle) => void
}

/**
 * `codeDiff()` as a component. `patch`, `files`, `file`, `layout`, `wrap`, `viewed`, `height` and
 * `maxHeight` follow their
 * props; callbacks always call the latest props.
 */
export function CodeDiff(props: CodeDiffProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CodeDiffHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const p = latest.current
    const d = codeDiff(ref.current!, {
      ...p,
      onFile: (name) => latest.current.onFile?.(name),
      onLayout: (layout) => latest.current.onLayout?.(layout),
      onWrap: (wrap) => latest.current.onWrap?.(wrap),
      onLines: p.onLines && ((lines, file) => latest.current.onLines?.(lines, file)),
      onViewed: p.onViewed && ((viewed, file) => latest.current.onViewed?.(viewed, file)),
    })
    handle.current = d
    p.onReady?.(d)
    return () => {
      d.dispose()
      handle.current = null
    }
  }, [])
  useFollow(
    {
      patch: props.patch,
      files: props.files,
      file: props.file,
      layout: props.layout,
      wrap: props.wrap,
      viewed: props.viewed,
      height: props.height,
      maxHeight: props.maxHeight,
    },
    (c) => handle.current?.update(c),
  )
  const height = props.height === "auto" ? undefined : "100%"
  return <div ref={ref} className={props.className} style={{ height, ...props.style }} />
}

export type DiffReviewProps = DiffReviewOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (review: DiffReviewHandle) => void
}

/** `diffReview()` as a component: the file tree beside the diff; follows as `CodeDiff` does. */
export function DiffReview(props: DiffReviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<DiffReviewHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const p = latest.current
    const r = diffReview(ref.current!, {
      ...p,
      onFile: (name) => latest.current.onFile?.(name),
      onLayout: (layout) => latest.current.onLayout?.(layout),
      onWrap: (wrap) => latest.current.onWrap?.(wrap),
      onLines: p.onLines && ((lines, file) => latest.current.onLines?.(lines, file)),
      onViewed: (viewed, file) => latest.current.onViewed?.(viewed, file),
    })
    handle.current = r
    p.onReady?.(r)
    return () => {
      r.dispose()
      handle.current = null
    }
  }, [])
  useFollow(
    {
      patch: props.patch,
      files: props.files,
      file: props.file,
      layout: props.layout,
      wrap: props.wrap,
      viewed: props.viewed,
      height: props.height,
      maxHeight: props.maxHeight,
    },
    (c) => handle.current?.update(c),
  )
  const height = props.height === "auto" ? undefined : "100%"
  return <div ref={ref} className={props.className} style={{ height, ...props.style }} />
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

export type CompareProps = CompareOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (compare: CompareHandle) => void
}

/**
 * `compare()` as a component. `before`, `after` (by `src`), `mode`, `wipe`, `loupe`, `threshold`
 * and `fps` follow their props; a new `timeline` handle or `renderer` makes it afresh;
 * callbacks always call the latest props.
 */
export function Compare(props: CompareProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CompareHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const c = compare(ref.current!, {
      ...latest.current,
      onMode: (mode) => latest.current.onMode?.(mode),
      onWipe: (wipe) => latest.current.onWipe?.(wipe),
      onView: (view) => latest.current.onView?.(view),
    })
    handle.current = c
    latest.current.onReady?.(c)
    return () => {
      c.dispose()
      handle.current = null
    }
  }, [props.timeline, props.renderer])
  useFollow(
    {
      before: props.before,
      after: props.after,
      mode: props.mode,
      wipe: props.wipe,
      loupe: props.loupe,
      threshold: props.threshold,
      fps: props.fps,
    },
    (c) => {
      const next = Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))
      if (anyChanged(next)) handle.current?.update(next)
    },
  )
  return <div ref={ref} className={props.className} style={{ height: "100%", ...props.style }} />
}

export type CompareStripProps = CompareStripOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (strip: CompareStripHandle) => void
}

/** `compareStrip()` as a component, on a timeline handle; new sources (by `src`) follow. */
export function CompareStrip(props: CompareStripProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CompareStripHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const s = compareStrip(ref.current!, {
      ...latest.current,
      onPick: (time) => latest.current.onPick?.(time),
    })
    handle.current = s
    latest.current.onReady?.(s)
    return () => {
      s.dispose()
      handle.current = null
    }
  }, [props.timeline, props.align])
  const srcs = useRef({ before: props.before.src, after: props.after.src })
  useEffect(() => {
    const was = srcs.current
    srcs.current = { before: props.before.src, after: props.after.src }
    const next = {
      ...(was.before !== props.before.src ? { before: props.before } : {}),
      ...(was.after !== props.after.src ? { after: props.after } : {}),
    }
    if (anyChanged(next)) handle.current?.update(next)
  })
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

export type CanvasProps = CanvasOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (canvas: CanvasHandle) => void
}

/**
 * `canvas()` as a component. New `items` update it in place (items that stay keep their content
 * and glide); `onView` always calls the latest prop. Keep `items` (and their `render`s) stable
 * across renders, or each render redraws the cards.
 */
export function Canvas(props: CanvasProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<CanvasHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const c = canvas(ref.current!, {
      ...latest.current,
      onView: (v) => latest.current.onView?.(v),
    })
    handle.current = c
    latest.current.onReady?.(c)
    return () => {
      c.dispose()
      handle.current = null
    }
  }, [])
  useFollow({ items: props.items }, (c) => {
    if (c.items) handle.current?.update(c.items)
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

export type WalkthroughProps = WalkthroughOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (walkthrough: WalkthroughHandle) => void
}

/**
 * `walkthrough()` as a component: a new `doc` is a new draft (answers carry over by step key);
 * `onFeedback` always calls the latest prop.
 */
export function Walkthrough(props: WalkthroughProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<WalkthroughHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const w = walkthrough(ref.current!, {
      ...latest.current,
      onFeedback: (feedback) => latest.current.onFeedback?.(feedback),
    })
    handle.current = w
    latest.current.onReady?.(w)
    return () => {
      w.dispose()
      handle.current = null
    }
  }, [])
  useFollow({ doc: props.doc }, (c) => {
    if (c.doc) handle.current?.set(c.doc)
  })
  return <div ref={ref} className={props.className} style={props.style} />
}

export type TasteTestProps = TasteTestOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (test: TasteTestHandle) => void
}

/** `tasteTest()` as a component: `picked` follows its prop; new `options` make it afresh. */
export function TasteTest(props: TasteTestProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handle = useRef<TasteTestHandle | null>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const t = tasteTest(ref.current!, {
      ...latest.current,
      onPick: (id) => latest.current.onPick?.(id),
    })
    handle.current = t
    latest.current.onReady?.(t)
    return () => {
      t.dispose()
      handle.current = null
    }
  }, [props.options])
  useFollow({ picked: props.picked }, (c) => {
    if ("picked" in c) handle.current?.pick(c.picked ?? null)
  })
  return <div ref={ref} className={props.className} style={props.style} />
}

export type MediaSlotProps = MediaSlotOptions & {
  className?: string
  style?: CSSProperties
  onReady?: (slot: MediaSlotHandle) => void
}

/** `mediaSlot()` as a component: one walkthrough media slot; new `media` mounts afresh. */
export function MediaSlot(props: MediaSlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  useLayoutEffect(() => {
    const s = mediaSlot(ref.current!, latest.current)
    latest.current.onReady?.(s)
    return () => s.dispose()
  }, [props.media])
  return <div ref={ref} className={props.className} style={props.style} />
}

export type { WalkthroughDoc, WalkthroughFeedback } from "./walkthrough-model.js"
