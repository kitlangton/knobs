// timeline(container, options): a scrubber for time-based work. A ruler with adaptive ticks
// (seconds or frames) that zooms with ⌘wheel or a pinch and pans with the wheel or a trackpad; a
// playhead that follows the hand 1:1, pulls softly toward markers and lands on frames; markers to
// add, drag, label and jump between; in/out loop ranges; playback on one rAF clock that moves
// the playhead every frame and sleeps when nothing moves.
import { Spring, springMotion } from "../core/spring.js"
import { tokenCss } from "./rgba.js"
import { SPRINGS } from "../core/motion.js"
import { hints } from "../panel/page-hints.js"
import { contextMenu, type MenuEntry } from "./menu.js"
import { applyLook, frameLoop, reducedMotion, type UiLook } from "./look.js"
import { softClamp } from "./split-model.js"
import {
  adjacentMarker,
  advance,
  CATCH_UP,
  clampView,
  currentMarker,
  followView,
  frameTime,
  moveHead,
  rulerTicks,
  scrubTime,
  type TimeUnits,
  type TimeView,
  timeLabel,
  toFrame,
  zoomView,
} from "./timeline-model.js"

export interface TimelineMarker {
  readonly id: string
  /** Seconds. */
  readonly time: number
  readonly label?: string
  /** A colour of its own (CSS); the accent otherwise. */
  readonly color?: string
}

export interface TimelineRange {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly label?: string
  /** Playback loops inside it (`I` / `O` make the `"loop"` range, which loops). */
  readonly loop?: boolean
}

export type SeekSource = "scrub" | "key" | "marker" | "play" | "code"

export interface TimelineOptions extends UiLook {
  /** Seconds. */
  readonly duration: number
  readonly time?: number
  readonly playing?: boolean
  /** Frames per second (30): frame steps, frame labels, and where scrubs land. */
  readonly fps?: number
  /** What the ruler counts in (`"seconds"`). */
  readonly units?: TimeUnits
  readonly markers?: readonly TimelineMarker[]
  readonly ranges?: readonly TimelineRange[]
  /** Scrubs land on frames and stick to markers (`true`); `{ frames, markers }` picks. */
  readonly snap?: boolean | { readonly frames?: boolean; readonly markers?: boolean }
  /** Playback speed (1). */
  readonly speed?: number
  /** Playback starts over at the end when there's no loop range (`false`: it stops). */
  readonly repeat?: boolean
  /**
   * What ←/→ move: frames (one, ten with ⇧) by default, or seconds (`{ step: 0.5, shift: 2 }`),
   * the playhead gliding there; `,` and `.` step a frame either way.
   */
  readonly arrows?: "frames" | { readonly step: number; readonly shift: number }
  /**
   * `"editor"` (the default): a ruler with labels over a lane of markers to add, drag and name,
   * zoomed and panned by the wheel. `"lane"`: one slim lane under a compare or a video, with ticks
   * and no labels, markers as faint chapter ticks (the current one in text colour) and nothing to
   * edit. A pinch, ⌘/ctrl-wheel or = and - zoom it around the pointer, a sideways scroll pans it,
   * both following the hand 1:1; a double-click or 0 fits it again. An up-and-down wheel is left
   * to the page.
   */
  readonly variant?: "editor" | "lane"
  readonly label?: string
  /** The time moved: scrubbed, stepped, jumped, played (every frame) or set from code. */
  onSeek?(time: number, source: SeekSource): void
  onPlay?(playing: boolean): void
  /** Markers were added, moved, renamed or removed (the whole list). */
  onMarkers?(markers: readonly TimelineMarker[]): void
  /** Ranges were set, moved or cleared (the whole list). */
  onRanges?(ranges: readonly TimelineRange[]): void
  /** Playback passed a marker. */
  onCross?(marker: TimelineMarker): void
  /** The visible window moved: a zoom, a pan, a fit or a follow. */
  onView?(view: TimeView): void
  /**
   * Play, each marker and the playhead take codes in the page's hint mode (`s`), on by default:
   * a marker's code jumps to it, the playhead's focuses the timeline.
   */
  readonly hints?: boolean
}

/** What `listen` reports: the same as the options' callbacks, for pieces bound to a timeline. */
export interface TimelineListener {
  onSeek?(time: number, source: SeekSource): void
  onPlay?(playing: boolean): void
  onView?(view: TimeView): void
  /** A scrub of the playhead started (`true`) or let go (`false`). */
  onScrub?(active: boolean): void
  /** Ranges were set, moved or cleared (the whole list). */
  onRanges?(ranges: readonly TimelineRange[]): void
}

export interface Timeline {
  readonly element: HTMLElement
  readonly time: number
  readonly playing: boolean
  readonly duration: number
  readonly fps: number
  readonly markers: readonly TimelineMarker[]
  readonly ranges: readonly TimelineRange[]
  readonly view: TimeView
  /**
   * `glide`: a jump the hand didn't make (a chapter's click, say): the playhead catches up from
   * where it is on a quick spring; the time, and what it drives, land at once.
   */
  seek(time: number, options?: { readonly glide?: boolean }): void
  play(): void
  pause(): void
  toggle(): void
  /** New duration, markers, ranges, fps, units or speed; the time and view stay. */
  update(
    next: Partial<
      Omit<TimelineOptions, "onSeek" | "onPlay" | "onMarkers" | "onRanges" | "onCross" | "onView">
    >,
  ): void
  /** Shows the whole duration (animated). */
  fit(): void
  /** Zooms by `factor` (above 1 zooms in) around a time (the playhead's by default). */
  zoom(factor: number, at?: number): void
  /** Hears seeks, play and pause, and view moves alongside the options' callbacks; returns a stop. */
  listen(listener: TimelineListener): () => void
  /**
   * While playing, time follows `clock` (seconds, `Infinity` once it has run out: a video's
   * `currentTime`, say) instead of the timeline's own frame clock, so the two never drift; loops
   * and the end still apply. `null` hands time back.
   */
  drive(clock: (() => number) | null): void
  focus(): void
  dispose(): void
}

const RULER = 22
// kit-motion: the view follows wheel and pinch on the instant spring (.1 s, no bounce); pans the
// timeline makes itself (following the playhead, fitting) glide on calm (.4 s, no bounce).
const INSTANT = springMotion(SPRINGS.instant)
const CALM = springMotion(SPRINGS.calm)
// A jump the hand didn't make (`seek(t, { glide })`, ←/→ in seconds, a marker's click, a loop's
// wrap, a press on the lane away from the playhead, play from elsewhere): the playhead catches up
// from where it is on .15 s, no bounce; the time itself lands at once. A drag stays 1:1.
const GLIDE = springMotion(CATCH_UP)
let uid = 0

export function timeline(container: HTMLElement, options: TimelineOptions): Timeline {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  let duration = Math.max(1e-3, options.duration)
  let fps = options.fps ?? 30
  let units: TimeUnits = options.units ?? "seconds"
  let speed = options.speed ?? 1
  let repeat = options.repeat ?? true
  const arrows = options.arrows ?? "frames"
  const lane = options.variant === "lane"
  let time = Math.min(duration, Math.max(0, options.time ?? 0))
  let playing = false
  let markers: TimelineMarker[] = [...(options.markers ?? [])]
  let ranges: TimelineRange[] = [...(options.ranges ?? [])]
  let selected: { kind: "marker" | "range"; id: string } | null = null
  const snapOpt = options.snap ?? true
  const snapFrames = typeof snapOpt === "object" ? snapOpt.frames !== false : snapOpt
  const snapMarkers = typeof snapOpt === "object" ? snapOpt.markers !== false : snapOpt
  const id = `knobs-tl-${++uid}`
  const listeners = new Set<TimelineListener>()
  const emitSeek = (t: number, source: SeekSource) => {
    options.onSeek?.(t, source)
    for (const l of listeners) l.onSeek?.(t, source)
  }
  const emitPlay = (on: boolean) => {
    options.onPlay?.(on)
    for (const l of listeners) l.onPlay?.(on)
  }
  let driver: (() => number) | null = null

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const n = doc.createElement(tag)
    n.className = cls
    return n
  }
  const root = el("div", "knobs-timeline")
  root.tabIndex = 0
  root.setAttribute("role", "group")
  root.setAttribute("aria-roledescription", "timeline")
  root.setAttribute("aria-label", options.label ?? "Timeline")
  root.setAttribute("aria-keyshortcuts", "Space ArrowLeft ArrowRight , . Home End [ ] I O M")
  applyLook(root, options)
  if (lane) root.dataset.variant = "lane"
  // No clock beside play: the time shows under the pointer on the track (`tag`), in seconds.
  const transport = el("div", "knobs-tl-transport")
  const playBtn = el("button", "knobs-tl-play")
  playBtn.type = "button"
  playBtn.tabIndex = -1
  transport.append(playBtn)
  const track = el("div", "knobs-tl-track")
  const canvas = el("canvas", "knobs-tl-ruler")
  canvas.setAttribute("aria-hidden", "true")
  const markerLane = el("div", "knobs-tl-lane")
  const hover = el("div", "knobs-tl-hover")
  const tag = el("span", "knobs-tl-tag")
  tag.setAttribute("aria-hidden", "true")
  const head = el("div", "knobs-tl-head")
  // The playhead is the slider screen readers and keys work with.
  head.id = `${id}-head`
  head.setAttribute("role", "slider")
  head.setAttribute("aria-label", "Playhead")
  head.setAttribute("aria-valuemin", "0")
  head.setAttribute("aria-valuemax", String(duration))
  track.append(canvas, markerLane, hover, head, tag)
  root.append(transport, track)
  container.append(root)

  // ——— the view: shown on two springs, retargeted by the wheel, a pinch, a fit or a follow ———
  let width = 1
  let height = 1
  const fitView = (): TimeView => clampView({ start: 0, span: duration }, duration, { pad: 0.02 })
  let target = fitView()
  const vStart = new Spring(target.start, INSTANT.omega, 1, 1e-5)
  const vSpan = new Spring(target.span, INSTANT.omega, 1, 1e-5)
  const view = (): TimeView => ({ start: vStart.x, span: vSpan.x })
  const pxPerSec = () => width / Math.max(1e-9, vSpan.x)
  const xOf = (t: number) => (t - vStart.x) * pxPerSec()
  const tOf = (x: number) => vStart.x + x / pxPerSec()
  const minSpan = () => Math.max(4 / fps, 0.05)
  /** `hand`: a lane's pinch or scroll, there at once. */
  const retarget = (next: TimeView, motion = INSTANT, hand = false) => {
    target = clampView(next, duration, { pad: 0.04, minSpan: minSpan() })
    for (const s of [vStart, vSpan]) {
      s.omega = motion.omega
      s.zeta = motion.zeta
    }
    if (hand || (reducedMotion(win) && motion === CALM)) {
      vStart.snap(target.start)
      vSpan.snap(target.span)
    } else {
      vStart.set(target.start)
      vSpan.set(target.span)
    }
    if (!vStart.resting || !vSpan.resting || playing) loop.wake()
    else render()
  }

  // ——— drawing ———
  let colors = { tick: "", major: "", label: "", font: "", line: "" }
  const readColors = () => {
    const cs = win.getComputedStyle(root)
    colors = {
      tick: tokenCss(cs, "--kv-border-strong", "rgba(255,255,255,.18)"),
      major: tokenCss(cs, "--kv-fg-3", "rgba(255,255,255,.42)"),
      label: tokenCss(cs, "--kv-fg-2", "rgba(255,255,255,.64)"),
      line: tokenCss(cs, "--kv-border", "rgba(255,255,255,.1)"),
      font: `${cs.getPropertyValue("--_k-weight").trim() || 400} ${(Number.parseFloat(cs.fontSize) || 12) - 1}px ${cs.getPropertyValue("--_k-font").trim() || "system-ui"}`,
    }
    drawn = ""
  }
  let drawn = ""
  const drawRuler = () => {
    const v = view()
    const key = `${v.start.toFixed(6)}:${v.span.toFixed(6)}:${width}:${height}:${units}:${fps}`
    if (key === drawn) return
    drawn = key
    const dpr = win.devicePixelRatio || 1
    const w = Math.max(1, Math.round(width * dpr))
    const rh = lane ? height : RULER
    const h = Math.round(rh * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, rh)
    const ticks = rulerTicks(v, width, { fps, units })
    if (lane) {
      // Ticks up from the bottom at subpixel places (no rounding moiré), no labels.
      ctx.fillStyle = colors.tick
      for (const t of ticks.minor)
        if (t >= -1e-9 && t <= duration + 1e-9) ctx.fillRect(xOf(t) - 0.5, rh - 4, 1, 4)
      ctx.fillStyle = colors.major
      for (const m of ticks.major)
        if (m.t >= -1e-9 && m.t <= duration + 1e-9) ctx.fillRect(xOf(m.t) - 0.5, rh - 7, 1, 7)
      return
    }
    const px = (t: number) => Math.round(xOf(t)) + 0.5
    ctx.fillStyle = colors.line
    ctx.fillRect(0, RULER - 1, width, 1)
    ctx.fillStyle = colors.tick
    for (const t of ticks.minor) ctx.fillRect(px(t) - 0.5, RULER - 5, 1, 4)
    ctx.fillStyle = colors.major
    for (const m of ticks.major) ctx.fillRect(px(m.t) - 0.5, RULER - 9, 1, 8)
    ctx.font = colors.font
    ctx.fillStyle = colors.label
    ctx.textBaseline = "middle"
    for (const m of ticks.major) {
      if (m.t < -1e-9 || m.t > duration + 1e-9) continue
      ctx.fillText(m.label, px(m.t) + 4, 8)
    }
    // Outside the duration, the ruler dims.
    ctx.fillStyle = colors.line
    const a = xOf(0)
    const b = xOf(duration)
    if (a > 0) ctx.fillRect(0, 0, a, RULER - 1)
    if (b < width) ctx.fillRect(b, 0, width - b, RULER - 1)
  }

  const markerEls = new Map<string, HTMLElement>()
  const rangeEls = new Map<string, HTMLElement>()
  const syncMarkers = () => {
    const keep = new Set(markers.map((m) => m.id))
    for (const [k, n] of markerEls) if (!keep.has(k)) leave(n, () => markerEls.delete(k))
    for (const m of markers) {
      let n = markerEls.get(m.id)
      if (!n || n.dataset.leaving !== undefined) {
        n = el("div", "knobs-tl-marker")
        n.dataset.id = m.id
        const pin = el("span", "knobs-tl-pin")
        const label = el("span", "knobs-tl-mlabel")
        // A long name fades out at its trailing edge (no ellipsis), inside the chip.
        label.append(el("span", "knobs-tl-mtext knobs-scroll-fade-x"))
        n.append(pin, label)
        markerLane.append(n)
        markerEls.set(m.id, n)
        if (built) enter(n)
      }
      const label = n.querySelector<HTMLElement>(".knobs-tl-mlabel")!
      const text = label.firstElementChild as HTMLElement
      if (text.textContent !== (m.label ?? "")) text.textContent = m.label ?? ""
      label.hidden = !m.label
      n.style.setProperty("--knobs-tl-color", m.color ?? "")
      n.toggleAttribute("data-selected", selected?.kind === "marker" && selected.id === m.id)
      n.toggleAttribute("data-current", m.id === currentId)
      n.title = `${m.label ? `${m.label} · ` : ""}${clock(m.time)}`
    }
    placeMarkers()
  }
  const placeMarkers = () => {
    for (const m of markers) {
      const n = markerEls.get(m.id)
      if (n) n.style.transform = `translateX(${xOf(m.time).toFixed(2)}px)`
    }
  }
  const syncRanges = () => {
    const keep = new Set(ranges.map((r) => r.id))
    for (const [k, n] of rangeEls) if (!keep.has(k)) leave(n, () => rangeEls.delete(k))
    for (const r of ranges) {
      let n = rangeEls.get(r.id)
      if (!n || n.dataset.leaving !== undefined) {
        n = el("div", "knobs-tl-range")
        n.dataset.id = r.id
        const a = el("span", "knobs-tl-edge")
        a.dataset.edge = "start"
        const b = el("span", "knobs-tl-edge")
        b.dataset.edge = "end"
        const label = el("span", "knobs-tl-rlabel")
        n.append(label, a, b)
        track.insertBefore(n, markerLane)
        rangeEls.set(r.id, n)
        if (built) enter(n)
      }
      n.toggleAttribute("data-loop", Boolean(r.loop))
      n.toggleAttribute("data-selected", selected?.kind === "range" && selected.id === r.id)
      const label = n.firstElementChild as HTMLElement
      const text = r.label ?? (r.loop ? "Loop" : "")
      if (label.textContent !== text) label.textContent = text
    }
    placeRanges()
  }
  const placeRanges = () => {
    for (const r of ranges) {
      const n = rangeEls.get(r.id)
      if (!n) continue
      const a = xOf(r.start)
      n.style.transform = `translateX(${a.toFixed(2)}px)`
      n.style.width = `${Math.max(0, xOf(r.end) - a).toFixed(2)}px`
    }
  }
  // Markers and ranges come and go softly (kit-motion: nothing disappears).
  const enter = (n: HTMLElement) => {
    if (reducedMotion(win)) return
    n.animate(
      [
        { opacity: 0, filter: "blur(3px)", scale: "0.92" },
        { opacity: 1, filter: "blur(0px)", scale: "1" },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
    )
  }
  const leave = (n: HTMLElement, done: () => void) => {
    if (n.dataset.leaving !== undefined) return
    n.dataset.leaving = ""
    done()
    const a = n.animate(
      [
        { opacity: 1, filter: "blur(0px)", scale: "1" },
        { opacity: 0, filter: "blur(3px)", scale: "0.94" },
      ],
      {
        duration: reducedMotion(win) ? 120 : 170,
        easing: "cubic-bezier(.4,0,1,1)",
        fill: "forwards",
      },
    )
    a.onfinish = () => n.remove()
  }

  const clock = (t: number) =>
    units === "frames" ? `f${toFrame(t, fps)}` : `${timeLabel(t, "seconds", fps, 0.01)}`
  let shownHead = time
  let currentId: string | null = null
  const renderHead = () => {
    head.style.transform = `translateX(${xOf(shownHead).toFixed(2)}px)`
    head.setAttribute("aria-valuenow", time.toFixed(3))
    head.setAttribute("aria-valuetext", `${time.toFixed(2)} seconds, frame ${toFrame(time, fps)}`)
    // The current chapter: the last marker at or before the time, its tick in text colour.
    const cur = currentMarker(markers, time, fps)?.id ?? null
    if (cur !== currentId) {
      markerEls.get(currentId ?? "")?.removeAttribute("data-current")
      currentId = cur
      markerEls.get(cur ?? "")?.setAttribute("data-current", "")
    }
  }
  let viewSent = ""
  const render = () => {
    if (options.onView || listeners.size) {
      const v = view()
      const key = `${v.start}:${v.span}`
      if (key !== viewSent) {
        viewSent = key
        options.onView?.(v)
        for (const l of listeners) l.onView?.(v)
      }
    }
    drawRuler()
    placeMarkers()
    placeRanges()
    renderHead()
  }
  const syncPlay = () => {
    playBtn.innerHTML = playing ? PAUSE : PLAY
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play")
    root.toggleAttribute("data-playing", playing)
  }

  // ——— time ———
  const caret = new Spring(time, GLIDE.omega, GLIDE.zeta, 1e-5)
  let gliding = false
  /** Moves the drawn playhead: a jump catches up from where it is, a follow lands (see moveHead). */
  const headTo = (shown: number, motion: "jump" | "follow") => {
    const from = gliding
      ? { x: caret.x, target: caret.target }
      : { x: shownHead, target: shownHead }
    const jump = motion === "jump" && !reducedMotion(win)
    // Less than 2 px away there's nothing to catch up.
    const next = moveHead(from, shown, jump ? "jump" : "follow", gliding, 2 / pxPerSec())
    if (next.catching) {
      if (!gliding) caret.snap(from.x)
      caret.x = next.x
      caret.target = next.target
      gliding = true
      shownHead = caret.x
      loop.wake()
    } else {
      gliding = false
      caret.snap(next.x)
      shownHead = next.x
    }
  }
  const setTime = (t: number, source: SeekSource, shown = t, glide = false) => {
    const next = Math.min(duration, Math.max(0, t))
    headTo(Math.min(duration, Math.max(0, shown)), glide ? "jump" : "follow")
    const moved = next !== time
    time = next
    renderHead()
    if (moved || source === "scrub") emitSeek(time, source)
    // A jump the hand didn't make keeps the playhead in view.
    if (source !== "scrub") keepInView()
  }
  const keepInView = () => {
    const v = followView(target, time, 0.06)
    if (v !== target) retarget(v, CALM)
  }
  const loopRange = () => ranges.find((r) => r.loop) ?? null

  // Playback's next time: the frame clock's, or a driving clock's (a video's) with the same loops.
  const clocked = (r: TimelineRange | null, dt: number) => {
    const ext = driver?.()
    if (ext === undefined || Number.isNaN(ext))
      return advance(time, dt * speed, { duration, loop: r, repeat })
    const lo = r ? r.start : 0
    const hi = r ? r.end : duration
    if (ext < hi - 1e-6) return { t: Math.max(0, ext), ended: false, wrapped: false }
    return r || repeat
      ? { t: lo, ended: false, wrapped: true }
      : { t: hi, ended: true, wrapped: false }
  }

  let built = false
  const loop = frameLoop(win, (dt) => {
    if (playing) {
      const before = time
      const r = loopRange()
      const step = clocked(r, dt)
      const crossedTo = step.wrapped ? (r ? r.end : duration) : step.t
      for (const m of markers)
        if (m.time > before && m.time <= crossedTo + 1e-9) options.onCross?.(m)
      if (step.wrapped)
        for (const m of markers)
          if (m.time >= (r ? r.start : 0) && m.time <= step.t) options.onCross?.(m)
      time = step.t
      // The clock carries the playhead 1:1; a wrap is a jump it catches up from.
      headTo(time, step.wrapped ? "jump" : "follow")
      emitSeek(time, "play")
      keepInView()
      if (step.ended) {
        playing = false
        syncPlay()
        emitPlay(false)
      }
    }
    if (gliding) {
      shownHead = caret.step(dt)
      if (caret.resting) {
        gliding = false
        shownHead = caret.target
      }
    }
    vStart.step(dt)
    vSpan.step(dt)
    render()
    return playing || gliding || !vStart.resting || !vSpan.resting
  })

  const play = () => {
    if (playing) return
    const r = loopRange()
    // Play from elsewhere (the loop's start, or the top from the end): the playhead catches up.
    if (r && (time < r.start || time >= r.end - 0.5 / fps)) setTime(r.start, "code", r.start, true)
    else if (!r && time >= duration - 0.5 / fps) setTime(0, "code", 0, true)
    playing = true
    syncPlay()
    emitPlay(true)
    loop.wake()
  }
  const pause = () => {
    if (!playing) return
    playing = false
    // Paused between frames, it rests on the nearest one; driven by a video, on the frame that
    // video is showing, so pausing never moves the picture.
    if (snapFrames)
      setTime(driver ? Math.floor(time * fps + 1e-4) / fps : frameTime(time, fps), "code")
    syncPlay()
    emitPlay(false)
  }
  const toggle = () => (playing ? pause() : play())
  playBtn.addEventListener("click", () => {
    toggle()
    root.focus({ preventScroll: true })
  })

  // ——— markers and ranges ———
  const emitMarkers = () => options.onMarkers?.(markers)
  const emitRanges = () => {
    options.onRanges?.(ranges)
    for (const l of listeners) l.onRanges?.(ranges)
  }
  const select = (next: typeof selected) => {
    selected = next
    syncMarkers()
    syncRanges()
  }
  let markerUid = 0
  const addMarker = (t: number, label?: string) => {
    const at = frameTime(Math.min(duration, Math.max(0, t)), fps)
    if (markers.some((m) => Math.abs(m.time - at) < 0.5 / fps)) return
    let mid = `m${++markerUid}`
    while (markers.some((m) => m.id === mid)) mid = `m${++markerUid}`
    const m: TimelineMarker = { id: mid, time: at, ...(label ? { label } : {}) }
    markers = [...markers, m].sort((a, b) => a.time - b.time)
    selected = { kind: "marker", id: mid }
    syncMarkers()
    emitMarkers()
    return m
  }
  const removeSelected = () => {
    if (!selected) return false
    if (selected.kind === "marker") {
      const sid = selected.id
      markers = markers.filter((m) => m.id !== sid)
      selected = null
      syncMarkers()
      emitMarkers()
    } else {
      const sid = selected.id
      ranges = ranges.filter((r) => r.id !== sid)
      selected = null
      syncRanges()
      emitRanges()
    }
    return true
  }
  const setEdge = (edge: "start" | "end", t: number) => {
    const at = frameTime(t, fps)
    const r = loopRange() ?? { id: "loop", start: 0, end: duration, loop: true }
    let start = edge === "start" ? at : r.start
    let end = edge === "end" ? at : r.end
    if (end - start < 1 / fps) {
      if (edge === "start") end = Math.min(duration, start + 1 / fps)
      else start = Math.max(0, end - 1 / fps)
    }
    const next = { ...r, start, end }
    ranges = ranges.some((x) => x.id === r.id)
      ? ranges.map((x) => (x.id === r.id ? next : x))
      : [...ranges, next]
    syncRanges()
    emitRanges()
  }

  // Renaming a marker in place: its label becomes a field, no box.
  let editing: HTMLInputElement | null = null
  const rename = (mid: string) => {
    const m = markers.find((x) => x.id === mid)
    const n = markerEls.get(mid)
    if (!m || !n) return
    editing?.blur()
    const input = el("input", "knobs-tl-edit")
    input.value = m.label ?? ""
    input.placeholder = "Marker"
    input.setAttribute("aria-label", "Marker name")
    n.dataset.editing = ""
    n.append(input)
    editing = input
    input.focus()
    input.select()
    let done = false
    const finish = (commit: boolean) => {
      if (done) return
      done = true
      editing = null
      const value = input.value.trim()
      input.remove()
      delete n.dataset.editing
      if (commit && value !== (m.label ?? "")) {
        markers = markers.map((x) =>
          x.id === mid
            ? {
                id: x.id,
                time: x.time,
                ...(x.color ? { color: x.color } : {}),
                ...(value ? { label: value } : {}),
              }
            : x,
        )
        syncMarkers()
        emitMarkers()
      }
      root.focus({ preventScroll: true })
    }
    input.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter") finish(true)
      else if (e.key === "Escape") finish(false)
    })
    input.addEventListener("blur", () => finish(true))
    input.addEventListener("pointerdown", (e) => e.stopPropagation())
  }

  // ——— pointer ———
  const localX = (e: { clientX: number }) => e.clientX - track.getBoundingClientRect().left
  type Drag =
    | { kind: "scrub"; wasPlaying: boolean }
    | { kind: "marker"; id: string; from: number; dx: number; moved: boolean; x0: number }
    | { kind: "edge"; id: string; edge: "start" | "end" }
    | {
        kind: "range"
        id: string
        t0: number
        start: number
        end: number
        moved: boolean
        x0: number
      }
  let drag: Drag | null = null
  /** `press`: the hand landed away from the playhead, which catches up; a drag after is 1:1. */
  const scrubTo = (x: number, press = false) => {
    // Past the ends it slows softly into them, as split panes do into their limits.
    const shownX = softClamp(x, xOf(0), xOf(duration), 10)
    const s = scrubTime(tOf(shownX), {
      duration,
      fps,
      pxPerSec: pxPerSec(),
      stops: snapMarkers && !lane ? markers.map((m) => m.time) : [],
      frames: snapFrames,
    })
    setTime(s.t, "scrub", s.shown, press)
    root.toggleAttribute("data-stuck", s.stop !== null)
  }
  /** The pointer over the track (px), which a key's zoom centres on; else the playhead. */
  let pointerX: number | null = null
  const zoomAtHand = (factor: number) =>
    zoom(factor, pointerX === null ? time : target.start + (pointerX / width) * target.span)
  // The time under the pointer, in seconds, while it's over the track or scrubbing.
  const showTag = (x: number) => {
    const at = Math.min(duration, Math.max(0, tOf(x)))
    const text = `${at.toFixed(2)} s`
    if (tag.textContent !== text) tag.textContent = text
    const cx = Math.min(width, Math.max(0, x))
    const flip = cx > width - tag.offsetWidth - 12
    tag.style.transform = `translateX(${cx.toFixed(1)}px) translateX(${flip ? "calc(-100% - 4px)" : "4px"})`
    tag.dataset.on = ""
  }
  const hideTag = () => delete tag.dataset.on
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || editing) return
    root.focus({ preventScroll: true })
    const t = e.target as HTMLElement
    const markerEl = lane ? null : t.closest<HTMLElement>(".knobs-tl-marker")
    const edgeEl = t.closest<HTMLElement>(".knobs-tl-edge")
    const rangeEl = t.closest<HTMLElement>(".knobs-tl-range")
    track.setPointerCapture(e.pointerId)
    if (markerEl) {
      const m = markers.find((x) => x.id === markerEl.dataset.id)
      if (!m) return
      drag = {
        kind: "marker",
        id: m.id,
        from: m.time,
        dx: localX(e) - xOf(m.time),
        moved: false,
        x0: localX(e),
      }
      select({ kind: "marker", id: m.id })
    } else if (edgeEl && rangeEl) {
      drag = { kind: "edge", id: rangeEl.dataset.id!, edge: edgeEl.dataset.edge as "start" | "end" }
      select({ kind: "range", id: rangeEl.dataset.id! })
    } else if (rangeEl && t.closest(".knobs-tl-rlabel")) {
      // A range moves by its label; its band scrubs like the rest of the track.
      const r = ranges.find((x) => x.id === rangeEl.dataset.id)
      if (!r) return
      drag = {
        kind: "range",
        id: r.id,
        t0: tOf(localX(e)),
        start: r.start,
        end: r.end,
        moved: false,
        x0: localX(e),
      }
      select({ kind: "range", id: r.id })
    } else {
      if (selected) select(null)
      drag = { kind: "scrub", wasPlaying: playing }
      if (playing) {
        playing = false
        syncPlay()
      }
      root.dataset.scrubbing = ""
      for (const l of listeners) l.onScrub?.(true)
      scrubTo(localX(e), true)
      showTag(localX(e))
    }
    e.preventDefault()
  })
  track.addEventListener("pointermove", (e) => {
    const x = localX(e)
    pointerX = x
    hover.style.transform = `translateX(${x.toFixed(1)}px)`
    if (!drag || drag.kind === "scrub") showTag(x)
    if (!drag) return
    if (drag.kind === "scrub") return scrubTo(x)
    if (drag.kind === "marker") {
      if (!drag.moved && Math.abs(x - drag.x0) < 3) return
      drag.moved = true
      root.dataset.dragging = ""
      const did = drag.id
      const at = frameTime(Math.min(duration, Math.max(0, tOf(x - drag.dx))), fps)
      markers = markers.map((m) => (m.id === did ? { ...m, time: at } : m))
      placeMarkers()
      return
    }
    if (drag.kind === "edge") {
      const r = ranges.find((x) => x.id === (drag as { id: string }).id)
      if (!r) return
      const at = frameTime(Math.min(duration, Math.max(0, tOf(x))), fps)
      const edge = drag.edge
      const start = edge === "start" ? Math.min(at, r.end - 1 / fps) : r.start
      const end = edge === "end" ? Math.max(at, r.start + 1 / fps) : r.end
      ranges = ranges.map((x) => (x.id === r.id ? { ...x, start, end } : x))
      placeRanges()
      return
    }
    if (!drag.moved && Math.abs(x - drag.x0) < 3) return
    drag.moved = true
    const span = drag.end - drag.start
    const start = frameTime(
      Math.min(duration - span, Math.max(0, drag.start + tOf(x) - drag.t0)),
      fps,
    )
    const rid = drag.id
    ranges = ranges.map((r) => (r.id === rid ? { ...r, start, end: start + span } : r))
    placeRanges()
  })
  const endDrag = () => {
    if (!drag) return
    const d = drag
    drag = null
    delete root.dataset.scrubbing
    delete root.dataset.dragging
    root.removeAttribute("data-stuck")
    if (d.kind === "scrub") {
      // Let go off a marker's pull, it rests where the time is.
      headTo(time, "follow")
      renderHead()
      if (!track.matches(":hover")) hideTag()
      for (const l of listeners) l.onScrub?.(false)
      if (d.wasPlaying) play()
    } else if (d.kind === "marker") {
      if (d.moved) {
        markers = [...markers].sort((a, b) => a.time - b.time)
        syncMarkers()
        emitMarkers()
      } else {
        const m = markers.find((x) => x.id === d.id)
        if (m) setTime(m.time, "marker", m.time, true)
      }
    } else if (d.kind === "edge" || d.moved) emitRanges()
  }
  track.addEventListener("pointerup", endDrag)
  track.addEventListener("pointercancel", endDrag)
  track.addEventListener("lostpointercapture", endDrag)
  track.addEventListener("pointerleave", () => {
    pointerX = null
    if (drag) return
    hover.style.transform = "translateX(-100px)"
    hideTag()
  })
  track.addEventListener("dblclick", (e) => {
    if (lane) return fit()
    const markerEl = (e.target as HTMLElement).closest<HTMLElement>(".knobs-tl-marker")
    if (markerEl) return rename(markerEl.dataset.id!)
    if ((e.target as HTMLElement).closest(".knobs-tl-edge,.knobs-tl-rlabel")) return
    const m = addMarker(tOf(localX(e)))
    if (m) rename(m.id)
  })
  // ⌘wheel or a pinch zooms around the pointer; the wheel and two fingers pan. A lane follows the
  // hand 1:1 and pans only on a sideways scroll, leaving an up-and-down wheel to the page.
  track.addEventListener(
    "wheel",
    (e) => {
      const zooming = e.ctrlKey || e.metaKey
      if (zooming && pinching) return e.preventDefault()
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (lane && !zooming && !sideways) return
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1
      if (zooming) {
        const at = target.start + (localX(e) / width) * target.span
        const k = Math.exp(-e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.002))
        retarget(zoomView(target, k, at), INSTANT, lane)
      } else {
        const d = (sideways ? e.deltaX : e.deltaY) * scale
        retarget({ ...target, start: target.start + (d / width) * target.span }, INSTANT, lane)
      }
    },
    { passive: false },
  )
  // Safari's trackpad pinch: around the pointer, 1:1.
  let pinchScale = 1
  let pinching = false
  const onGesture = (e: Event) => {
    const g = e as Event & { scale?: number; clientX?: number }
    e.preventDefault()
    if (e.type === "gesturestart") pinchScale = 1
    pinching = e.type !== "gestureend"
    if (e.type !== "gesturechange") return
    const s = g.scale ?? 1
    const x = g.clientX !== undefined ? localX({ clientX: g.clientX }) : width / 2
    retarget(
      zoomView(target, s / pinchScale, target.start + (x / width) * target.span),
      INSTANT,
      true,
    )
    pinchScale = s
  }
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    track.addEventListener(type, onGesture)

  // ——— keys ———
  root.addEventListener("keydown", (e) => {
    if (e.target !== root || e.metaKey || e.ctrlKey) {
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key === "=" || e.key === "-" || e.key === "0") &&
        e.target === root
      ) {
        e.preventDefault()
        if (e.key === "0") fit()
        else zoomAtHand(e.key === "=" ? 1.5 : 1 / 1.5)
      }
      return
    }
    const frame = 1 / fps
    const claim = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    switch (e.key) {
      case " ":
        claim()
        // Held, it toggles once: key repeat would stutter play and pause.
        if (!e.repeat) toggle()
        return
      case "ArrowLeft":
      case "ArrowRight": {
        claim()
        const dir = e.key === "ArrowLeft" ? -1 : 1
        if (arrows !== "frames") {
          // Seconds: playing carries on from there.
          const t = Math.min(
            duration,
            Math.max(0, time + dir * (e.shiftKey ? arrows.shift : arrows.step)),
          )
          return setTime(snapFrames ? frameTime(t, fps) : t, "key", t, true)
        }
        if (playing) pause()
        return setTime(frameTime(time, fps) + dir * (e.shiftKey ? 10 : 1) * frame, "key")
      }
      case ",":
      case ".":
        claim()
        if (playing) pause()
        return setTime(frameTime(time, fps) + (e.key === "," ? -1 : 1) * frame, "key")
      case "Home":
        claim()
        return setTime(0, "key")
      case "End":
        claim()
        return setTime(duration, "key")
      case "[":
      case "]": {
        claim()
        const m = adjacentMarker(markers, time, e.key === "]" ? 1 : -1, fps)
        if (!m) return
        select({ kind: "marker", id: m.id })
        return setTime(m.time, "marker", m.time, true)
      }
      case "i":
      case "I":
        claim()
        return setEdge("start", time)
      case "o":
      case "O":
        claim()
        return setEdge("end", time)
      case "m":
      case "M":
        if (lane) return
        claim()
        addMarker(time)
        return
      case "Enter":
        if (selected?.kind === "marker" && !lane) {
          claim()
          rename(selected.id)
        }
        return
      case "Backspace":
      case "Delete":
        if (removeSelected()) claim()
        return
      case "Escape":
        if (selected) {
          claim()
          select(null)
        }
        return
      case "=":
      case "+":
        claim()
        return zoomAtHand(1.5)
      case "-":
        claim()
        return zoomAtHand(1 / 1.5)
      case "0":
        claim()
        return fit()
    }
  })

  const unregisterHints =
    options.hints === false
      ? undefined
      : hints.register(
          root,
          () => [
            { el: playBtn, label: playing ? "Pause" : "Play", activate: toggle },
            ...(lane ? [] : markers).flatMap((m) => {
              const n = markerEls.get(m.id)
              if (!n || n.dataset.leaving !== undefined) return []
              const label = n.querySelector<HTMLElement>(".knobs-tl-mlabel")
              return [
                {
                  el: n.querySelector<HTMLElement>(".knobs-tl-pin") ?? n,
                  label: m.label ?? "Marker",
                  ...(label && !label.hidden ? { labelEl: label } : {}),
                  activate: () => {
                    select({ kind: "marker", id: m.id })
                    setTime(m.time, "marker", m.time, true)
                    root.focus({ preventScroll: true })
                  },
                },
              ]
            }),
            {
              el: head,
              label: "Playhead",
              activate: () => root.focus({ preventScroll: true }),
            },
          ],
          { listen: false, rank: 1 },
        )

  // A context menu on markers, ranges and the ruler (not on a lane: nothing there to edit).
  const menu = lane
    ? null
    : contextMenu(track, (e) => {
        const t = (e?.target as HTMLElement | null) ?? null
        const markerEl = t?.closest<HTMLElement>(".knobs-tl-marker")
        const rangeEl = t?.closest<HTMLElement>(".knobs-tl-range")
        const at = e && "clientX" in e ? tOf(localX(e)) : time
        if (markerEl) {
          const mid = markerEl.dataset.id!
          select({ kind: "marker", id: mid })
          return [
            {
              label: "Go to marker",
              shortcut: "]",
              run: () => {
                const m = markers.find((x) => x.id === mid)
                if (m) setTime(m.time, "marker", m.time, true)
              },
            },
            { label: "Rename…", shortcut: "Enter", run: () => rename(mid) },
            "-",
            {
              label: "Delete marker",
              shortcut: "Backspace",
              destructive: true,
              run: () => (select({ kind: "marker", id: mid }), removeSelected()),
            },
          ] satisfies MenuEntry[]
        }
        if (rangeEl) {
          const rid = rangeEl.dataset.id!
          select({ kind: "range", id: rid })
          return [
            {
              label: "Loop",
              checked: Boolean(ranges.find((r) => r.id === rid)?.loop),
              run: () => {
                ranges = ranges.map((r) =>
                  r.id === rid ? { ...r, loop: !r.loop } : { ...r, loop: false },
                )
                syncRanges()
                emitRanges()
              },
            },
            "-",
            {
              label: "Clear range",
              shortcut: "Backspace",
              destructive: true,
              run: () => (select({ kind: "range", id: rid }), removeSelected()),
            },
          ] satisfies MenuEntry[]
        }
        return [
          { label: "Add marker here", shortcut: "M", run: () => addMarker(at) },
          { label: "Set in point", shortcut: "I", run: () => setEdge("start", at) },
          { label: "Set out point", shortcut: "O", run: () => setEdge("end", at) },
          "-",
          {
            label: "Ruler",
            items: [
              {
                label: "Seconds",
                radio: true,
                checked: units === "seconds",
                run: () => api.update({ units: "seconds" }),
              },
              {
                label: "Frames",
                radio: true,
                checked: units === "frames",
                run: () => api.update({ units: "frames" }),
              },
            ],
          },
          { label: "Fit", shortcut: "0", run: () => fit() },
        ] satisfies MenuEntry[]
      })

  const fit = () => retarget(fitView(), CALM)
  const zoom = (factor: number, at = time) => retarget(zoomView(target, factor, at), CALM)

  // ——— size ———
  const measure = () => {
    const r = track.getBoundingClientRect()
    width = Math.max(1, r.width)
    height = Math.max(1, r.height)
    canvas.style.width = `${width}px`
    readColors()
    render()
  }
  const ro = new win.ResizeObserver(measure)
  ro.observe(track)
  root.addEventListener("knobs-restyle", measure)
  measure()
  syncPlay()
  syncMarkers()
  syncRanges()
  built = true
  if (options.playing) play()

  const api: Timeline = {
    element: root,
    get time() {
      return time
    },
    get playing() {
      return playing
    },
    get markers() {
      return markers
    },
    get ranges() {
      return ranges
    },
    get view() {
      return view()
    },
    get duration() {
      return duration
    },
    get fps() {
      return fps
    },
    seek: (t, o) => setTime(t, "code", t, o?.glide === true),
    play,
    pause,
    toggle,
    update(next) {
      // Showing the whole of it still (nobody zoomed or panned), a new length is shown whole too,
      // at once: a length learned on load (a video's metadata) never animates.
      let refit = false
      if (next.duration !== undefined) {
        const was = fitView()
        refit = Math.abs(target.start - was.start) < 1e-6 && Math.abs(target.span - was.span) < 1e-6
        duration = Math.max(1e-3, next.duration)
        head.setAttribute("aria-valuemax", String(duration))
      }
      if (next.fps !== undefined) fps = next.fps
      if (next.units !== undefined) units = next.units
      if (next.speed !== undefined) speed = next.speed
      if (next.repeat !== undefined) repeat = next.repeat
      if (next.markers) markers = [...next.markers]
      if (next.ranges) {
        ranges = [...next.ranges]
        for (const l of listeners) l.onRanges?.(ranges)
      }
      if (next.time !== undefined) setTime(next.time, "code")
      if (next.playing !== undefined) next.playing ? play() : pause()
      if (time > duration) setTime(duration, "code")
      drawn = ""
      syncMarkers()
      syncRanges()
      if (refit) {
        target = fitView()
        vStart.snap(target.start)
        vSpan.snap(target.span)
        render()
      } else if (next.duration !== undefined || next.fps !== undefined) retarget(target, CALM)
      else render()
    },
    fit,
    zoom,
    listen(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    drive(next) {
      driver = next
    },
    focus: () => root.focus({ preventScroll: true }),
    dispose() {
      unregisterHints?.()
      listeners.clear()
      loop.stop()
      ro.disconnect()
      menu?.dispose()
      root.remove()
    },
  }
  return api
}

const PLAY =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.6v8.8c0 .5.5.8.9.5l6.6-4.4c.4-.3.4-.8 0-1L5.9 3.1c-.4-.3-.9 0-.9.5Z" fill="currentColor"/></svg>'
const PAUSE =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3.2" width="2.8" height="9.6" rx="1" fill="currentColor"/><rect x="9.2" y="3.2" width="2.8" height="9.6" rx="1" fill="currentColor"/></svg>'
