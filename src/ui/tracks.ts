// tracks(container, options): an animation's tracks over a timeline. One row per track, its clip
// spanning the track's items (a faint staircase inside shows the stagger, and a spring's settle
// trails off past its end). Drag a clip to move its start, an edge to trim it: 1:1 with the hand,
// pulled onto other clips' edges and the playhead (⌘ or Ctrl turns that off). The values are the
// store's fields, so the panel beside it, presets, Random and undo all move the same clips; ones
// the hand didn't make glide there. Docked to a timeline, it shares its zoom, pan and playhead,
// and a press on an empty lane scrubs.
import type { Controls } from "../core/store.js"
import { Spring } from "../core/spring.js"
import { MOTION } from "../core/motion.js"
import { staggerRank, trackSpan, type Track } from "../core/tracks.js"
import { applyLook, frameLoop, reducedMotion, type UiLook } from "./look.js"
import type { Timeline } from "./timeline.js"
import { frameTime, type TimeView } from "./timeline-model.js"
import { clipPatch, dragClip, type ClipBox, type ClipGrip } from "./tracks-model.js"

export interface TracksOptions extends UiLook {
  // biome-ignore lint/suspicious/noExplicitAny: any store's values hold its tracks' keys.
  readonly controls: Controls<any>
  readonly tracks: readonly Track[]
  /** The scrubber it docks to: it shares its zoom, pan, playhead and clock. */
  readonly timeline: Timeline
  /** Dragged edges pull onto other clips' edges and the playhead (`true`); ⌘ or Ctrl turns it off. */
  readonly snap?: boolean
  readonly label?: string
}

export interface TracksView {
  readonly element: HTMLElement
  /** Lights a track's clip (by id or group, as a panel's `onActive` gives it), or none. */
  highlight(id: string | null): void
  dispose(): void
}

interface Clip {
  readonly track: Track
  readonly el: HTMLElement
  readonly steps: HTMLElement
  readonly tail: HTMLElement
  readonly start: Spring
  readonly end: Spring
  /** What the steps and tail were drawn for. */
  drawn: string
}

type Drag =
  | {
      kind: "clip"
      clip: Clip
      grip: ClipGrip
      x0: number
      from: ClipBox
      values: Readonly<Record<string, unknown>>
      min: number
      max: number
      moved: boolean
      wrote: boolean
    }
  | { kind: "scrub"; wasPlaying: boolean }

const GLIDE = MOTION.default

export function tracks(container: HTMLElement, options: TracksOptions): TracksView {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const { controls, timeline: tl } = options
  const snapOn = options.snap ?? true
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const n = doc.createElement(tag)
    n.className = cls
    return n
  }
  const root = el("div", "knobs-tracks")
  root.setAttribute("role", "group")
  root.setAttribute("aria-label", options.label ?? "Tracks")
  applyLook(root, options)
  const lanes = el("div", "knobs-tk-lanes")
  const guide = el("div", "knobs-tk-guide")
  const head = el("div", "knobs-tk-head")
  const tag = el("span", "knobs-tk-tag")
  tag.setAttribute("aria-hidden", "true")

  const clips: Clip[] = options.tracks.map((track) => {
    const row = el("div", "knobs-tk-row")
    const clip = el("div", "knobs-tk-clip")
    clip.dataset.id = track.id
    const steps = el("div", "knobs-tk-steps")
    const tail = el("div", "knobs-tk-tail")
    const label = el("span", "knobs-tk-label knobs-scroll-fade-x")
    label.textContent = track.label
    const a = el("span", "knobs-tk-edge")
    a.dataset.edge = "start"
    const b = el("span", "knobs-tk-edge")
    b.dataset.edge = "end"
    clip.append(tail, steps, label, a, b)
    row.append(clip)
    lanes.append(row)
    const span = trackSpan(track.read(controls.get()))
    return {
      track,
      el: clip,
      steps,
      tail,
      start: new Spring(span.start, GLIDE.omega, GLIDE.zeta, 1e-5),
      end: new Spring(span.end, GLIDE.omega, GLIDE.zeta, 1e-5),
      drawn: "",
    }
  })
  lanes.append(guide, head, tag)
  root.append(lanes)
  container.append(root)

  // ——— the view, shared with the timeline ———
  let view: TimeView = tl.view
  let width = 1
  let time = tl.time
  const pxPerSec = () => width / Math.max(1e-9, view.span)
  const xOf = (t: number) => (t - view.start) * pxPerSec()
  const tOf = (x: number) => view.start + x / pxPerSec()

  /** A clip's staircase (one bar per item, at its stagger) and a spring's settle, in its own %. */
  const drawInside = (c: Clip) => {
    const timing = c.track.read(controls.get())
    const span = trackSpan(timing)
    const length = Math.max(1e-9, span.end - span.start)
    const key = `${timing.items}:${timing.from}:${timing.stagger}:${timing.duration}:${span.settle}`
    if (key === c.drawn) return
    c.drawn = key
    const n = timing.items > 1 && timing.stagger > 0 ? timing.items : 0
    while (c.steps.childElementCount > n) c.steps.lastElementChild!.remove()
    while (c.steps.childElementCount < n) c.steps.append(el("i", "knobs-tk-step"))
    for (let i = 0; i < n; i++) {
      const bar = c.steps.children[i] as HTMLElement
      const at = (staggerRank(i, n, timing.from) * timing.stagger) / length
      bar.style.left = `${(at * 100).toFixed(3)}%`
      bar.style.width = `${((timing.duration / length) * 100).toFixed(3)}%`
      bar.style.top = `${((i / n) * 100).toFixed(3)}%`
      bar.style.height = `${(100 / n).toFixed(3)}%`
    }
    const settle = (span.settle - span.end) / length
    c.tail.hidden = settle < 1e-3
    c.tail.style.width = `${(settle * 100).toFixed(3)}%`
    c.el.setAttribute(
      "aria-label",
      `${c.track.label}: ${span.start.toFixed(2)} s to ${span.end.toFixed(2)} s`,
    )
  }

  const render = () => {
    for (const c of clips) {
      const a = xOf(c.start.x)
      c.el.style.transform = `translateX(${a.toFixed(2)}px)`
      c.el.style.width = `${Math.max(2, xOf(c.end.x) - a).toFixed(2)}px`
    }
    head.style.transform = `translateX(${xOf(time).toFixed(2)}px)`
  }

  const loop = frameLoop(win, (dt) => {
    let moving = false
    for (const c of clips) {
      c.start.step(dt)
      c.end.step(dt)
      if (!c.start.resting || !c.end.resting) moving = true
    }
    render()
    return moving
  })

  let drag: Drag | null = null
  let placed = false
  /** The store moved: clips the hand holds (here or in a panel) land; the rest glide there. */
  const sync = () => {
    const values = controls.get()
    let moving = false
    for (const c of clips) {
      drawInside(c)
      if (drag?.kind === "clip" && drag.clip === c) continue
      const span = trackSpan(c.track.read(values))
      const held = Object.values(c.track.keys).some((k) => k && controls.isHeld(k))
      if (!placed || held || controls.landing || reducedMotion(win)) {
        c.start.snap(span.start)
        c.end.snap(span.end)
      } else {
        c.start.set(span.start)
        c.end.set(span.end)
        if (!c.start.resting || !c.end.resting) moving = true
      }
    }
    placed = true
    if (moving) loop.wake()
    else render()
  }

  // ——— docking: the lanes sit exactly under the timeline's track ———
  const measure = () => {
    const lane = tl.element.querySelector<HTMLElement>(".knobs-tl-track")
    const r = root.getBoundingClientRect()
    const t = lane?.getBoundingClientRect() ?? r
    width = Math.max(1, t.width)
    lanes.style.marginLeft = `${(t.left - r.left).toFixed(2)}px`
    lanes.style.width = `${width.toFixed(2)}px`
    render()
  }
  const ro = new win.ResizeObserver(measure)
  ro.observe(root)
  const lane = tl.element.querySelector<HTMLElement>(".knobs-tl-track")
  if (lane) ro.observe(lane)
  root.addEventListener("knobs-restyle", measure)
  const stopListening = tl.listen({
    onView(v) {
      view = v
      render()
    },
    onSeek(t) {
      time = t
      head.style.transform = `translateX(${xOf(time).toFixed(2)}px)`
    },
  })

  // ——— the hand ———
  const localX = (e: { clientX: number }) => e.clientX - lanes.getBoundingClientRect().left
  const showTag = (x: number, text: string) => {
    if (tag.textContent !== text) tag.textContent = text
    const flip = x > width - tag.offsetWidth - 12
    tag.style.transform = `translateX(${x.toFixed(1)}px) translateX(${flip ? "calc(-100% - 4px)" : "4px"})`
    tag.dataset.on = ""
  }
  const scrub = (x: number) => {
    const t = Math.min(tl.duration, Math.max(0, tOf(x)))
    tl.seek(frameTime(t, tl.fps))
  }
  lanes.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const clipEl = target.closest<HTMLElement>(".knobs-tk-clip")
    const c = clipEl ? clips.find((x) => x.el === clipEl) : undefined
    lanes.setPointerCapture(e.pointerId)
    e.preventDefault()
    if (c) {
      const values = controls.get()
      const timing = c.track.read(values)
      const span = trackSpan(timing)
      const grip = (target.closest<HTMLElement>(".knobs-tk-edge")?.dataset.edge ??
        "move") as ClipGrip
      drag = {
        kind: "clip",
        clip: c,
        grip,
        x0: e.clientX,
        from: { start: span.start, end: span.end },
        values,
        // The stagger stays as it is; each item may get as short or long as the track allows.
        min: span.end - span.start - timing.duration + c.track.minDuration,
        max: span.end - span.start - timing.duration + c.track.maxDuration,
        moved: false,
        wrote: false,
      }
      root.dataset.grip = grip
      return
    }
    const wasPlaying = tl.playing
    if (wasPlaying) tl.pause()
    drag = { kind: "scrub", wasPlaying }
    root.dataset.scrubbing = ""
    scrub(localX(e))
  })
  lanes.addEventListener("pointermove", (e) => {
    if (!drag) return
    if (drag.kind === "scrub") return scrub(localX(e))
    const d = drag
    const dx = e.clientX - d.x0
    if (!d.moved && Math.abs(dx) < 3) return
    if (!d.moved) {
      d.moved = true
      root.dataset.dragging = ""
      d.clip.el.dataset.dragging = ""
      for (const k of Object.values(d.clip.track.keys)) if (k) controls.hold(k)
    }
    const stops = [0, time]
    for (const o of clips) if (o !== d.clip) stops.push(o.start.target, o.end.target)
    const r = dragClip({
      grip: d.grip,
      from: d.from,
      delta: dx / pxPerSec(),
      pxPerSec: pxPerSec(),
      stops,
      snap: snapOn && !(e.metaKey || e.ctrlKey),
      min: d.min,
      max: d.max,
      quantum: d.clip.track.durationStep,
      bounds: [0, d.clip.track.max],
    })
    // The clip follows the hand; the store gets the fields that make it.
    d.clip.start.snap(r.box.start)
    d.clip.end.snap(r.box.end)
    render()
    controls.set(clipPatch(d.clip.track, d.values, d.grip, r.box) as never, {
      coalesce: d.wrote,
      key: d.clip.track.keys.start,
    })
    d.wrote = true
    if (r.stop !== null) {
      guide.style.transform = `translateX(${xOf(r.stop).toFixed(2)}px)`
      guide.dataset.on = ""
    } else delete guide.dataset.on
    const timing = d.clip.track.read(controls.get())
    const edge = d.grip === "end" ? r.box.end : r.box.start
    showTag(xOf(edge), `${(d.grip === "end" ? timing.duration : timing.start).toFixed(2)} s`)
    tag.style.top = `${d.clip.el.parentElement!.offsetTop}px`
  })
  const endDrag = () => {
    if (!drag) return
    const d = drag
    drag = null
    delete root.dataset.grip
    delete root.dataset.dragging
    delete root.dataset.scrubbing
    delete guide.dataset.on
    delete tag.dataset.on
    if (d.kind === "scrub") {
      if (d.wasPlaying) tl.play()
      return
    }
    delete d.clip.el.dataset.dragging
    if (!d.moved) return
    for (const k of Object.values(d.clip.track.keys)) if (k) controls.hold(k, false)
    // Let go, it rests on the fields' own values (a step's rounding at most): no glide.
    const span = trackSpan(d.clip.track.read(controls.get()))
    d.clip.start.snap(span.start)
    d.clip.end.snap(span.end)
    render()
  }
  lanes.addEventListener("pointerup", endDrag)
  lanes.addEventListener("pointercancel", endDrag)
  lanes.addEventListener("lostpointercapture", endDrag)

  const unsubscribe = controls.subscribe(sync)
  sync()
  measure()

  return {
    element: root,
    highlight(id) {
      for (const c of clips)
        c.el.toggleAttribute(
          "data-active",
          id !== null && (c.track.id === id || c.track.group === id),
        )
    },
    dispose() {
      unsubscribe()
      stopListening()
      loop.stop()
      ro.disconnect()
      root.remove()
    },
  }
}
