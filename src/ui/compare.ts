// compare(container, options): a before/after viewer for videos and images. Side by side (the
// default: a split screen down the middle, zoomed and panned together), a wipe, or (opt in) a
// difference, drawn by one WebGPU pass (two <video>s with a
// clip-path wipe where there's no WebGPU). Both videos run from one clock: paused, scrubbed or
// stepped, each seeks to the frame's midpoint, coalesced, and while a seek is in flight the nearest
// decoded frame from a shared cache (compare-frames.ts) shows at once; playing, After leads,
// Before's rate leans to stay on it, and a bound timeline follows After's own time, so two clocks
// never fight. Sources load when the viewer nears the screen and are let go when it's well off,
// so a long page can hold many; every viewer shares one GPU device.
import { Spring, springMotion } from "../core/spring.js"
import { FADE as FADE_SPRING, SPRINGS } from "../core/motion.js"
import { claimsHintKey, hints } from "../panel/page-hints.js"
import { acquireFrames, type CachedFrame, type FrameCache } from "./compare-frames.js"
import { createCompareGpu, MODE_INDEX, type CompareGpu } from "./compare-gpu.js"
import {
  clampZoom,
  type CompareMode,
  compareLayout,
  compareModes,
  frameMidpoint,
  frameOf,
  fuseCorners,
  fuseFrame,
  gripTop,
  labelFold,
  lastFrame,
  lerpRect,
  loopAround,
  type MediaKind,
  mediaKind,
  modeForKey,
  modeKey,
  panBy,
  pointIn,
  type Rect,
  requestSeek,
  SEEK_IDLE,
  seamLabels,
  type SeekState,
  seeked,
  type Size,
  splitHeight,
  syncAction,
  wipeAt,
  wipeGrab,
  wipeKey,
  ZOOM_FIT,
  zoomAbout,
  zoomedRect,
  type ZoomRegion,
} from "./compare-model.js"
import { compareStrip, type CompareStrip } from "./compare-strip.js"
import { icon } from "./icons.js"
import { applyLook, frameLoop, isTypingTarget, reducedMotion, tune, type UiLook } from "./look.js"
import { tokenColor } from "./rgba.js"
import { playGlyph } from "./player.js"
import { selectionPill } from "./selection-pill.js"
import { timeline as makeTimeline, type Timeline } from "./timeline.js"
import { CATCH_UP, moveHead } from "./timeline-model.js"

export type { CompareMode, MediaKind, ZoomRegion } from "./compare-model.js"

/** A loop's in and out (seconds). */
export interface CompareLoop {
  readonly start: number
  readonly end: number
}

/** What's in view: the zoomed part (both sides) and the loop, for a log or a note. */
export interface CompareView {
  readonly zoom: ZoomRegion
  readonly loop: CompareLoop | null
}

/**
 * How to encode recordings for review: constant frame rate and a keyframe every 15 frames, so a
 * seek lands on the exact frame almost at once. Raw screen recordings often have one keyframe in
 * 8–18 s; the viewer copes (it shows decoded frames while seeks land), but this makes it exact.
 */
export const COMPARE_FFMPEG =
  "ffmpeg -i in.mov -vf fps=30 -fps_mode cfr -c:v libx264 -preset slow -crf 18 -g 15 -keyint_min 15 -pix_fmt yuv420p -movflags +faststart -an out.mp4"

export interface CompareSource {
  readonly src: string
  /** From the extension when left out (`.mp4`, `.webm`, `.mov`… are videos). */
  readonly kind?: MediaKind
  /** "Before" and "After" by default. */
  readonly label?: string
}

export interface CompareOptions extends UiLook {
  readonly before: CompareSource
  readonly after: CompareSource
  /** The first of `modes` (`"side"`, side by side) by default. */
  readonly mode?: CompareMode
  /**
   * The modes it offers, in the mode bar's order and on `1`–`3`: `["side", "wipe"]` by default.
   * Add `"difference"` to offer a difference. One mode hides the bar.
   */
  readonly modes?: readonly CompareMode[]
  /** Where the wipe's line sits, 0 (all After) to 1 (all Before); 0.5. */
  readonly wipe?: number
  /** Frames per second (the bound timeline's, else 30): steps, and where paused videos land. */
  readonly fps?: number
  /** The loupe under the pointer (`Z` held shows it too). */
  readonly loupe?: boolean
  /** Difference mode hides changes below this (0–1, 4/255): codec noise. */
  readonly threshold?: number
  /**
   * The clock: an existing `timeline()` (its time drives both sides; while playing it follows
   * After), or `true` for one of its own under the viewer: a player's thin progress line (the
   * `"line"` variant, as `player()` has), its markers chapter segments. Without one, `seek`,
   * `play` and keys still work. Either way a click on the stage plays and pauses (not wiping).
   */
  readonly timeline?: Timeline | boolean
  /** The frame strip over the timeline (off; one timeline is made if there's none). */
  readonly strip?: boolean
  /**
   * The sources' width over height before they load (16/9). In a container without a height of
   * its own, the viewer takes the height its sides need: a split screen with no margins.
   */
  readonly aspect?: number
  /** Load sources only near the screen and let them go well off it (true). */
  readonly lazy?: boolean
  /** `"gpu"` (the default, where WebGPU is there) or `"dom"`. */
  readonly renderer?: "gpu" | "dom"
  readonly label?: string
  /** The modes, the loupe and the wipe take codes in the page's hint mode (`s`); on by default. */
  readonly hints?: boolean
  onMode?(mode: CompareMode): void
  /** The wipe moved: dragged, keyed or set. */
  onWipe?(wipe: number): void
  /** The zoom or the loop changed (at most once a frame). */
  onView?(view: CompareView): void
}

export interface Compare {
  readonly element: HTMLElement
  readonly mode: CompareMode
  /** The modes it offers. */
  readonly modes: readonly CompareMode[]
  readonly wipe: number
  readonly loupe: boolean
  /** Seconds. */
  readonly time: number
  readonly playing: boolean
  /** The longer video's, in seconds (0 for two images). */
  readonly duration: number
  readonly renderer: "gpu" | "dom"
  /** The bound timeline, or the one it made. */
  readonly timeline: Timeline | null
  readonly strip: CompareStrip | null
  /** The part of each side in view (`{ u: 0, v: 0, w: 1, h: 1 }` is all of it). */
  readonly zoom: ZoomRegion
  /** The timeline's loop, or null. */
  readonly loop: CompareLoop | null
  /** New sources, mode, wipe, loupe, threshold or fps. A new mode glides in. */
  update(
    next: Partial<
      Pick<CompareOptions, "before" | "after" | "mode" | "wipe" | "loupe" | "threshold" | "fps">
    >,
  ): void
  /**
   * `glide`: a jump the hand didn't make (a chapter's click): the timeline's playhead catches up
   * from where it is while the videos land at once.
   */
  seek(time: number, options?: { readonly glide?: boolean }): void
  /** Moves by `seconds`, the timeline's playhead gliding there (playing carries on). */
  seekBy(seconds: number): void
  play(): void
  pause(): void
  toggle(): void
  /** Steps whole frames (pausing first). */
  step(frames: number): void
  /** Zooms both sides to `region` (null: all of it), gliding there unless `animate` is false. */
  setZoom(region: ZoomRegion | null, animate?: boolean): void
  /** A loop around the playhead (`true`), a given one, or none; playback stays inside it. */
  setLoop(loop: CompareLoop | boolean): void
  focus(): void
  dispose(): void
}

// kit-motion: a mode change is a state change. Side ↔ Wipe is Kit Motion's Comparison fuse: the
// panes glide together on .3 s, no bounce, nothing resizing (see fuseFrame); the difference's look
// crossfades in on .25 s (.15 s with reduced motion, which drops the glide). A zoom's reset, a
// double-click or a key's zoom is a state change too: .35 s, no bounce (snapped with reduced
// motion). The wipe, the loupe, scrubbing, pans and pinches follow the hand 1:1; a press on the
// stage away from the wipe's line catches up from where it is (.15 s, no bounce), and let go, the
// grip settles back to the line's middle (.3 s).
const LAYOUT = springMotion(SPRINGS.default)
const FADE = springMotion(SPRINGS.snappy)
const FADE_REDUCED = springMotion(FADE_SPRING)
const ZOOM = springMotion({ duration: 0.35, bounce: 0 })
const WIPE_CATCH = springMotion(CATCH_UP)
const SLOP = 12
/** Labels sit this far inside their side's corner, and this far from the wipe's seam. */
const INSET = 8
/** The wipe's grip: a raised capsule in the line's middle, at the pointer's height while dragged. */
const GRIP = { w: 16, h: 28 }
/** A label's mark and the gap after it, which fold away as the sides fuse. */
const MARK = { w: 12, gap: 4 }
const LOUPE = { r: 88, zoom: 4 }
/** Mid-scrub with no decoded frame this close, a keyframe seek (`fastSeek`) answers first. */
const FAST_SEEK_FRAMES = 15
/** Off screen this long (ms), its videos and frames are let go. */
const RELEASE_MS = 3000
const MODE_LABEL: Record<CompareMode, { short: string; long: string }> = {
  side: { short: "Side", long: "Side by side" },
  wipe: { short: "Wipe", long: "Wipe" },
  difference: { short: "Difference", long: "Difference" },
}

interface Side {
  readonly index: 0 | 1
  readonly source: CompareSource
  readonly kind: MediaKind
  readonly el: HTMLVideoElement | HTMLImageElement
  /** The DOM renderer's stand-in for a cached frame. */
  readonly preview: HTMLCanvasElement
  size: Size
  seek: SeekState
  loaded: boolean
  frames: FrameCache | null
  unlisten: (() => void) | null
  /** Counted as on screen in its frame cache. */
  seen: boolean
  /** What its texture (or the DOM) shows: a frame, from the video or the cache. */
  shown: { frame: number; cached: boolean } | null
  /** When the last frame callback came (ms), to notice a browser that doesn't send them. */
  frameAt: number
  /** Uploads that failed in a row. */
  misses: number
  failed: boolean
  stop(): void
}

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?(cb: () => void): number
  cancelVideoFrameCallback?(id: number): void
  fastSeek?(time: number): void
}

export function compare(container: HTMLElement, options: CompareOptions): Compare {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const look: UiLook = {
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.appearance ? { appearance: options.appearance } : {}),
  }
  const offered = compareModes(options.modes, options.mode)
  const modeList = offered.modes
  let mode: CompareMode = offered.mode
  let wipe = Math.min(1, Math.max(0, options.wipe ?? 0.5))
  let loupeOn = options.loupe ?? false
  let threshold = options.threshold ?? 4 / 255
  let fpsOpt = options.fps
  const bound = typeof options.timeline === "object" ? options.timeline : null
  const fps = () => fpsOpt ?? bound?.fps ?? 30
  // A container with no height of its own (a page's flow): the viewer sizes itself.
  const auto = container.clientHeight < 1

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const n = doc.createElement(tag)
    n.className = cls
    return n
  }
  const root = el("div", "knobs-compare")
  root.tabIndex = 0
  root.setAttribute("role", "group")
  root.setAttribute("aria-roledescription", "compare")
  root.setAttribute("aria-label", options.label ?? "Compare")
  root.setAttribute(
    "aria-keyshortcuts",
    `Space ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight , . ${modeList.map((m, i) => `${i + 1} ${modeKey(m)}`).join(" ")} Z L 0 = -`,
  )
  applyLook(root, options)
  root.dataset.mode = mode
  if (auto) root.dataset.auto = ""
  const bar = el("div", "knobs-cmp-bar")
  // The modes: a segmented control, the selection pill sliding to the one picked.
  const modes = el("div", "knobs-cmp-modes")
  modes.setAttribute("role", "radiogroup")
  modes.setAttribute("aria-label", "Mode")
  modes.hidden = modeList.length < 2
  const modeBtns = modeList.map((m, i) => {
    const b = el("button", "knobs-cmp-mode")
    b.type = "button"
    b.tabIndex = -1
    b.textContent = MODE_LABEL[m].short
    b.title = `${MODE_LABEL[m].long} · ${i + 1} or ${modeKey(m)}`
    b.setAttribute("role", "radio")
    b.setAttribute("aria-keyshortcuts", `${i + 1} ${modeKey(m)}`)
    b.addEventListener("click", () => {
      setMode(m)
      root.focus({ preventScroll: true })
    })
    modes.append(b)
    return b
  })
  const toggleBtn = (name: Parameters<typeof icon>[0], label: string, title: string) => {
    const b = el("button", "knobs-cmp-toggle")
    b.type = "button"
    b.tabIndex = -1
    b.innerHTML = icon(name)
    b.setAttribute("aria-label", label)
    b.title = title
    return b
  }
  const loupeBtn = toggleBtn("magnifyingGlass", "Loupe", "Loupe · hold Z")
  loupeBtn.addEventListener("click", () => {
    setLoupe(!loupeOn)
    root.focus({ preventScroll: true })
  })
  const loopBtn = toggleBtn("repeat", "Loop", "Loop · L (drag its ends on the timeline)")
  loopBtn.setAttribute("aria-keyshortcuts", "L")
  loopBtn.addEventListener("click", () => {
    api.setLoop(!loopNow())
    root.focus({ preventScroll: true })
  })
  bar.append(modes, el("span", "knobs-cmp-fill"), loopBtn, loupeBtn)
  const stage = el("div", "knobs-cmp-stage")
  const canvas = el("canvas", "knobs-cmp-canvas")
  canvas.setAttribute("aria-hidden", "true")
  const split = el("div", "knobs-cmp-split")
  split.setAttribute("aria-hidden", "true")
  // Zoomed, a glass pill in the stage's corner says how far, with a way back.
  const zoomPill = el("div", "knobs-cmp-zoom")
  const zoomPct = el("span", "knobs-cmp-zoom-pct")
  const zoomReset = el("button", "knobs-cmp-zoom-reset")
  zoomReset.type = "button"
  zoomReset.tabIndex = -1
  zoomReset.innerHTML = icon("arrowCounterClockwise", { small: true })
  zoomReset.setAttribute("aria-label", "Reset zoom")
  zoomReset.title = "Fit · 0 or double-click"
  zoomReset.addEventListener("click", () => {
    api.setZoom(null)
    root.focus({ preventScroll: true })
  })
  zoomPill.append(zoomPct, zoomReset)
  const labels = [el("div", "knobs-cmp-label"), el("div", "knobs-cmp-label")] as const
  labels[0].dataset.side = "before"
  labels[1].dataset.side = "after"
  /** ✗ Before · ✓ After: a mark and the side's name. */
  const setLabel = (index: 0 | 1, text: string) => {
    const l = labels[index]
    if (!l.firstElementChild) {
      const mark = el("span", "knobs-cmp-mark")
      mark.innerHTML = icon(index === 0 ? "x" : "check", { small: true })
      l.append(mark, el("span", "knobs-cmp-name"))
    }
    const name = l.lastElementChild as HTMLElement
    if (name.textContent !== text) name.textContent = text
  }
  // Mid-fuse, a blurred strip over the seam hides where the sides meet.
  const seam = el("div", "knobs-cmp-seam")
  seam.setAttribute("aria-hidden", "true")
  const handle = el("div", "knobs-cmp-handle")
  handle.setAttribute("role", "slider")
  handle.setAttribute("aria-label", "Wipe")
  handle.setAttribute("aria-valuemin", "0")
  handle.setAttribute("aria-valuemax", "100")
  const grip = el("span", "knobs-cmp-grip")
  grip.setAttribute("aria-hidden", "true")
  handle.append(grip)
  const note = el("div", "knobs-cmp-note")
  // A click on the media plays and pauses (not wiping: there a press moves the line).
  const glyph = playGlyph(doc)
  stage.append(canvas, split, seam, labels[0], labels[1], handle, zoomPill, note, glyph.element)
  root.append(bar, stage)

  // ——— the clock: a bound timeline, one of its own, or none (its own time) ———
  const wantsStrip = options.strip === true
  let tl: Timeline | null = bound
  let ownTimeline = false
  let stripHost: HTMLElement | null = null
  if (wantsStrip) {
    stripHost = el("div", "knobs-cmp-strip-host")
    root.append(stripHost)
  }
  if (!tl && (options.timeline === true || wantsStrip)) {
    const host = el("div", "knobs-cmp-timeline-host")
    root.append(host)
    tl = makeTimeline(host, {
      ...look,
      variant: "line",
      duration: 1,
      fps: fps(),
      arrows: { step: 0.5, shift: 2 },
      label: "Compare time",
      ...(options.hints === false ? { hints: false } : {}),
    })
    ownTimeline = true
  }
  container.append(root)

  // ——— state ———
  const sides: [Side, Side] = [null!, null!]
  let duration = 0
  let renderer: "gpu" | "dom" = "dom"
  let pending = false
  let gpu: CompareGpu | null = null
  const lay = new Spring(mode === "side" ? 0 : 1, LAYOUT.omega, LAYOUT.zeta, 1e-4)
  const fade = new Spring(1, FADE.omega, FADE.zeta, 1e-3)
  let fromMode: CompareMode = mode
  let toMode: CompareMode = mode
  // The wipe's line as drawn: it catches up to `wipe` after a press away from it, else lands.
  const wipeLine = new Spring(wipe, WIPE_CATCH.omega, WIPE_CATCH.zeta, 1e-4)
  let wipeCatching = false
  /** Where the grip rides down the line (0–1): the middle, or the pointer's height while dragging. */
  const gripAt = new Spring(0.5, LAYOUT.omega, LAYOUT.zeta, 1e-4)
  let loupeHeld = false
  let pointer: { x: number; y: number } | null = null
  type Drag =
    | { kind: "wipe"; offset: number }
    | { kind: "pan"; x: number; y: number; base: Rect; moved: boolean }
  let drag: Drag | null = null
  /** Pointers down on the stage (a pinch is two). */
  const touches = new Map<number, { x: number; y: number }>()
  let pinch: { d: number; x: number; y: number } | null = null
  /** A press that may be a click (it plays and pauses): where it went down. */
  let press: { x: number; y: number } | null = null
  // The zoomed part: springs for a glide (a reset, a key), snapped for the hand.
  const zu = new Spring(0, ZOOM.omega, ZOOM.zeta, 1e-5)
  const zv = new Spring(0, ZOOM.omega, ZOOM.zeta, 1e-5)
  const zw = new Spring(1, ZOOM.omega, ZOOM.zeta, 1e-5)
  // What onView last sent: the whole picture and no loop to begin with, so it speaks on a change.
  let viewSent = "0.0000,0.0000,1.0000|"
  let ownLoop: CompareLoop | null = null
  let scrubbing = false
  let stageW = 1
  let stageH = 1
  let stageRect: DOMRect | null = null
  let accent: readonly [number, number, number] = [0.49, 0.81, 0.61]
  let labelW: [number, number] = [0, 0]
  /** The stage's corner radius (px), which each side's picture takes too. */
  let frameRadius = 0
  let dirty = true
  let disposed = false
  let near = options.lazy === false
  let onScreen = options.lazy === false
  let releaseTimer = 0
  let ownTime = 0
  let ownPlaying = false

  const videoOf = (s: Side | undefined) =>
    s && s.kind === "video" && s.loaded ? (s.el as FrameVideo) : null
  /** After leads when it's a video; Before follows it. */
  const master = () => videoOf(sides[1]) ?? videoOf(sides[0])
  const follower = () => {
    const m = master()
    const v = videoOf(sides[0])
    return m && v && v !== m ? v : null
  }
  const now = () => (tl ? tl.time : ownTime)
  const isPlaying = () => (tl ? tl.playing : ownPlaying)
  const labelOf = (index: 0 | 1) =>
    sides[index]?.source.label ??
    (index === 0 ? options.before.label : options.after.label) ??
    (index === 0 ? "Before" : "After")
  const sizeOf = (s: Side): Size => {
    if (s.size.w > 0) return s.size
    const other = sides[s.index === 0 ? 1 : 0]
    if (other && other.size.w > 0) return other.size
    return { w: options.aspect ?? 16 / 9, h: 1 }
  }
  /** The frame a side shows paused: the playhead's, within its own length. */
  const wantOf = (s: Side) => {
    const v = s.el as HTMLVideoElement
    const f = frameOf(now(), fps())
    return Number.isFinite(v.duration) ? Math.min(f, lastFrame(v.duration, fps())) : f
  }
  const emitFrame = (s: Side, frame: number, source: "video" | "cache") =>
    root.dispatchEvent(
      new CustomEvent("knobs-compare-frame", { detail: { side: s.index, frame, source } }),
    )

  // ——— showing frames: the video's, or the cache's while a seek lands ———
  const setCached = (s: Side, on: boolean) => {
    if (renderer === "dom") s.preview.style.display = on ? "" : "none"
  }
  const showVideo = (s: Side) => {
    const v = s.el as HTMLVideoElement
    if (renderer === "gpu") {
      if (!gpu) return
      if (!gpu.upload(s.index, v, v.videoWidth, v.videoHeight)) return miss(s)
      s.misses = 0
    }
    const f = frameOf(v.currentTime, fps())
    s.shown = { frame: f, cached: false }
    setCached(s, false)
    emitFrame(s, f, "video")
    requestDraw()
  }
  const showCached = (s: Side, c: CachedFrame) => {
    if (s.shown?.cached && s.shown.frame === c.frame) return
    if (renderer === "gpu") {
      if (!gpu || !gpu.upload((2 + s.index) as 2 | 3, c.bitmap, c.bitmap.width, c.bitmap.height))
        return
    } else if (renderer === "dom" && !pending) {
      const p = s.preview
      if (p.width !== c.bitmap.width || p.height !== c.bitmap.height) {
        p.width = c.bitmap.width
        p.height = c.bitmap.height
      }
      p.getContext("2d")?.drawImage(c.bitmap, 0, 0)
    } else return
    s.shown = { frame: c.frame, cached: true }
    setCached(s, true)
    emitFrame(s, c.frame, "cache")
    requestDraw()
  }
  const miss = (s: Side) => {
    if (s.failed || ++s.misses < 3) return
    // A source the GPU can't read (no CORS headers, say): the DOM shows it anyway.
    gpu?.dispose()
    gpu = null
    setRenderer("dom")
  }
  /** A side's media has a frame: show it, unless (paused) a cached one is nearer the playhead. */
  const pushFrame = (s: Side) => {
    if (!s.loaded || disposed) return
    if (s.kind === "image") {
      const img = s.el as HTMLImageElement
      if (!(img.complete && img.naturalWidth)) return
      if (renderer === "gpu" && gpu) {
        if (!gpu.upload(s.index, img, img.naturalWidth, img.naturalHeight)) return miss(s)
      }
      s.shown = { frame: 0, cached: false }
      return requestDraw()
    }
    const v = s.el as HTMLVideoElement
    if (v.readyState < 2) return
    if (isPlaying() || !s.frames) return showVideo(s)
    const want = wantOf(s)
    const at = frameOf(v.currentTime, fps())
    if (at === want) {
      showVideo(s)
      s.frames.keep(at, v, v.videoWidth, v.videoHeight)
      return
    }
    const c = s.frames.nearest(want)
    if (c && Math.abs(c.frame - want) < Math.abs(at - want)) showCached(s, c)
    else showVideo(s)
  }
  /** Paused: a cached frame nearer the playhead than what shows goes up now. */
  const refreshCached = (s: Side) => {
    if (!s.loaded || !s.frames || isPlaying()) return
    const want = wantOf(s)
    if (s.shown && !s.shown.cached && s.shown.frame === want) return
    const c = s.frames.nearest(want)
    if (!c) return
    const was = s.shown ? Math.abs(s.shown.frame - want) : Number.POSITIVE_INFINITY
    if (Math.abs(c.frame - want) < was) showCached(s, c)
  }

  // ——— sides: made at once, loaded near the screen ———
  const makeSide = (index: 0 | 1, source: CompareSource): Side => {
    const kind = mediaKind(source.src, source.kind)
    const media = el(kind === "video" ? "video" : "img", "knobs-cmp-media")
    media.dataset.side = index === 0 ? "before" : "after"
    media.crossOrigin = "anonymous"
    media.setAttribute("aria-hidden", "true")
    const preview = el("canvas", "knobs-cmp-media knobs-cmp-preview")
    preview.dataset.side = media.dataset.side
    preview.style.display = "none"
    preview.setAttribute("aria-hidden", "true")
    const offs: (() => void)[] = []
    const on = (type: string, f: () => void) => {
      media.addEventListener(type, f)
      offs.push(() => media.removeEventListener(type, f))
    }
    const side: Side = {
      index,
      source,
      kind,
      el: media,
      preview,
      size: { w: 0, h: 0 },
      seek: SEEK_IDLE,
      loaded: false,
      frames: null,
      unlisten: null,
      seen: false,
      shown: null,
      frameAt: 0,
      misses: 0,
      failed: false,
      stop: () => {
        for (const f of offs) f()
      },
    }
    const fail = () => {
      if (!side.loaded) return
      side.failed = true
      note.textContent = `Couldn't load ${labelOf(index)}`
    }
    if (media instanceof HTMLVideoElement) {
      const v = media as FrameVideo
      v.muted = true
      v.defaultMuted = true
      v.playsInline = true
      v.preload = "auto"
      v.setAttribute("playsinline", "")
      v.setAttribute("muted", "")
      on("loadedmetadata", () => {
        side.size = { w: v.videoWidth, h: v.videoHeight }
        measureDuration()
        if (auto) measure()
        if (isPlaying()) jumpAll(now())
        else showFrame(now(), false)
        requestDraw()
      })
      on("resize", () => {
        side.size = { w: v.videoWidth, h: v.videoHeight }
        requestDraw()
      })
      on("loadeddata", () => pushFrame(side))
      on("seeked", () => {
        const step = seeked(side.seek, v.currentTime, fps())
        side.seek = step.state
        if (step.apply !== null) seekVideo(side, v, step.apply)
        pushFrame(side)
      })
      on("error", fail)
      if (v.requestVideoFrameCallback) {
        let id = 0
        const frame = () => {
          side.frameAt = performance.now()
          pushFrame(side)
          id = v.requestVideoFrameCallback!(frame)
        }
        id = v.requestVideoFrameCallback(frame)
        offs.push(() => v.cancelVideoFrameCallback?.(id))
      }
    } else {
      on("load", () => {
        side.size = { w: media.naturalWidth, h: media.naturalHeight }
        if (auto) measure()
        pushFrame(side)
        requestDraw()
      })
      on("error", fail)
      media.decoding = "async"
    }
    return side
  }
  const loadSide = (s: Side) => {
    if (s.loaded || disposed) return
    s.loaded = true
    s.failed = false
    s.el.src = s.source.src
    if (s.kind === "video") {
      s.frames = acquireFrames(doc, s.source.src, fps())
      s.unlisten = s.frames.listen(() => refreshCached(s))
      if (onScreen) {
        s.frames.visible(true)
        s.seen = true
      }
    }
  }
  const unloadSide = (s: Side) => {
    if (!s.loaded) return
    s.loaded = false
    s.el.removeAttribute("src")
    if (s.el instanceof HTMLVideoElement) s.el.load()
    s.seek = SEEK_IDLE
    s.shown = null
    setCached(s, false)
    s.unlisten?.()
    s.unlisten = null
    if (s.frames) {
      if (s.seen) s.frames.visible(false)
      s.seen = false
      s.frames.release()
      s.frames = null
    }
    gpu?.clear(s.index)
  }
  const measureDuration = () => {
    const next = Math.max(
      0,
      ...sides.map((s) => {
        const v = videoOf(s)
        return v && Number.isFinite(v.duration) ? v.duration : 0
      }),
    )
    if (next <= 0 || next === duration) return
    duration = next
    if (ownTimeline && tl) tl.update({ duration, fps: fps() })
  }

  // ——— renderers ———
  const setRenderer = (next: "gpu" | "dom") => {
    pending = false
    renderer = next
    root.dataset.renderer = next
    loupeBtn.hidden = next !== "gpu"
    canvas.style.display = next === "gpu" ? "" : "none"
    for (const s of sides) {
      const st = s.el.style
      st.clipPath = ""
      st.maskImage = ""
      st.setProperty("-webkit-mask-image", "")
      st.mixBlendMode = ""
      st.opacity = ""
      s.shown = null
      setCached(s, false)
    }
    for (const s of sides) pushFrame(s)
    requestDraw()
  }
  const startGpu = async (retry: boolean) => {
    const g = await createCompareGpu(canvas, () => {
      gpu = null
      if (disposed) return
      if (retry) win.setTimeout(() => void startGpu(false), 150)
      else setRenderer("dom")
    })
    if (disposed) return g?.dispose()
    if (!g) return setRenderer("dom")
    gpu = g
    setRenderer("gpu")
  }

  // ——— modes ———
  const syncModeUi = () => {
    root.dataset.mode = mode
    modeList.forEach((m, i) => {
      modeBtns[i]!.setAttribute("aria-checked", String(m === mode))
    })
    handle.tabIndex = mode === "wipe" ? 0 : -1
    modePill?.update()
  }
  const setMode = (next: CompareMode, emit = true) => {
    if (next === mode || !modeList.includes(next)) return
    mode = next
    const reduced = reducedMotion(win)
    tune(fade, reduced ? FADE_REDUCED : FADE)
    // Turned back past halfway, it fades from what's mostly showing, so the look never jumps far.
    if (fade.x >= 0.5) {
      fromMode = toMode
      fade.snap(0)
    }
    toMode = next
    fade.set(1)
    if (reduced) lay.snap(next === "side" ? 0 : 1)
    else lay.set(next === "side" ? 0 : 1)
    syncModeUi()
    if (emit) options.onMode?.(next)
    requestDraw()
  }
  /**
   * `jump`: a press away from the line, which catches up from where it's drawn; otherwise the
   * hand's (a drag, a key, code), drawn at once, or, mid catch-up, followed with the rest settling.
   */
  const setWipe = (next: number, emit = true, jump = false) => {
    const w = Math.min(1, Math.max(0, next))
    if (w === wipe && !jump) return
    wipe = w
    const minGap = 2 / Math.max(1, wipeRect(layoutNow().L.overlay).w)
    const head = moveHead(
      { x: wipeLine.x, target: wipeLine.target },
      w,
      jump && !reducedMotion(win) ? "jump" : "follow",
      wipeCatching,
      minGap,
    )
    wipeCatching = head.catching
    if (head.catching) {
      wipeLine.x = head.x
      wipeLine.target = head.target
    } else wipeLine.snap(head.x)
    if (emit) options.onWipe?.(w)
    // The hand's: drawn now, not next frame.
    if (head.catching) requestDraw()
    else drawNow()
  }
  const setLoupe = (on: boolean) => {
    loupeOn = on
    loupeBtn.setAttribute("aria-pressed", String(on))
    requestDraw()
  }

  // ——— time ———
  const clampTime = (v: HTMLVideoElement, t: number) =>
    Math.min(Math.max(0, t), Math.max(0, (Number.isFinite(v.duration) ? v.duration : t) - 1e-3))
  const seekVideo = (s: Side, v: FrameVideo, t: number) => {
    // Mid-scrub, far from any decoded frame: a keyframe answers fast; the exact frame follows.
    const c = s.frames?.nearest(wantOf(s))
    const far = !c || Math.abs(c.frame - wantOf(s)) > FAST_SEEK_FRAMES
    if (scrubbing && far && v.fastSeek) v.fastSeek(t)
    else v.currentTime = t
  }
  /** Paused: both seek to the frame's midpoint, coalesced; a cached frame shows meanwhile. */
  const showFrame = (t: number, used: boolean) => {
    for (const s of sides) {
      const v = videoOf(s)
      if (!v || v.readyState < 1) continue
      if (!v.paused) {
        v.pause()
        v.playbackRate = 1
      }
      const want = Math.min(frameOf(t, fps()), lastFrame(v.duration, fps()))
      const step = requestSeek(s.seek, frameMidpoint(want, fps(), v.duration), v.currentTime, fps())
      s.seek = step.state
      if (step.apply !== null) seekVideo(s, v, step.apply)
      else if (step.settled && (s.shown?.cached || s.shown?.frame !== want)) pushFrame(s)
      // The viewer in use: full-size frames around its playhead decode first.
      if (used) s.frames?.focus(want)
      refreshCached(s)
    }
    requestDraw()
  }
  /** Playing: both jump (a loop's wrap, a seek from code) and carry on. */
  const jumpAll = (t: number) => {
    for (const s of sides) {
      const v = videoOf(s)
      if (!v || v.readyState < 1) continue
      s.seek = SEEK_IDLE
      v.currentTime = clampTime(v, t)
      if (v.paused) void v.play().catch(() => {})
    }
  }
  const startVideos = () => {
    const t = now()
    for (const s of sides) {
      const v = videoOf(s)
      if (!v) continue
      s.seek = SEEK_IDLE
      v.playbackRate = 1
      // Paused on a frame's midpoint, it plays on from there: no seek, no jump back.
      if (v.readyState >= 1 && Math.abs(v.currentTime - t) > 1.5 / fps())
        v.currentTime = clampTime(v, t)
      void v.play().catch(() => {})
    }
    loop.wake()
  }
  const pauseVideos = () => {
    for (const s of sides) {
      const v = videoOf(s)
      if (v) {
        v.pause()
        v.playbackRate = 1
      }
    }
  }
  const stopVideos = () => {
    pauseVideos()
    showFrame(now(), false)
  }

  // A bound timeline: its seeks move the videos; while playing it follows After's own time, and
  // nothing else advances it. Off screen (no videos), the timeline keeps its own clock.
  const clock = () => {
    const m = master()
    if (!m || !near) return Number.NaN
    if (m.readyState < 1 || m.seeking) return tl!.time
    return m.ended ? Number.POSITIVE_INFINITY : m.currentTime
  }
  const ownSeek = (t: number) => {
    ownTime = Math.min(Math.max(0, t), duration)
    if (ownPlaying) jumpAll(ownTime)
    else showFrame(ownTime, true)
  }
  const ownPlay = () => {
    if (ownPlaying || !master()) return
    if (ownLoop && (ownTime < ownLoop.start || ownTime >= ownLoop.end - 0.5 / fps()))
      ownTime = ownLoop.start
    else if (!ownLoop && ownTime >= duration - 0.5 / fps()) ownTime = 0
    ownPlaying = true
    startVideos()
  }
  const ownPause = () => {
    if (!ownPlaying) return
    ownPlaying = false
    // It rests on the frame showing, so pausing never moves the picture.
    ownTime = Math.min(duration, frameOf(ownTime, fps()) / fps())
    stopVideos()
  }

  // ——— geometry and drawing ———
  const zoomNow = (): ZoomRegion => ({ u: zu.x, v: zv.x, w: zw.x, h: zw.x })
  const zoomed = () => zw.target < 0.999
  /** Each side's place (its clip) and, zoomed, where its whole picture lands. */
  const layoutNow = () => {
    const box: Rect = { x: 0, y: 0, w: stageW, h: stageH }
    const L = compareLayout(box, sizeOf(sides[0]), sizeOf(sides[1]))
    const k = lay.x
    const before = lerpRect(L.side.before, L.overlay.before, k)
    const after = lerpRect(L.side.after, L.overlay.after, k)
    const z = zoomNow()
    return { L, before, after, zBefore: zoomedRect(before, z), zAfter: zoomedRect(after, z) }
  }
  /** Where the wipe runs: across both overlaid sides. */
  const wipeRect = (r: { before: Rect; after: Rect }): Rect => {
    const x = Math.min(r.before.x, r.after.x)
    const y = Math.min(r.before.y, r.after.y)
    const x1 = Math.max(r.before.x + r.before.w, r.after.x + r.after.w)
    const y1 = Math.max(r.before.y + r.before.h, r.after.y + r.after.h)
    return { x, y, w: x1 - x, h: y1 - y }
  }
  /** The side under a point (After where they overlap), whose size a pan or zoom is measured by. */
  const baseAt = (p: { x: number; y: number }) => {
    const r = layoutNow()
    const inside = (b: Rect) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
    return inside(r.after) || !inside(r.before) ? r.after : r.before
  }
  const loupeShown = () => renderer === "gpu" && (loupeOn || loupeHeld) && pointer !== null
  const loopNow = (): CompareLoop | null => {
    if (!tl) return ownLoop
    const r = tl.ranges.find((x) => x.loop)
    return r ? { start: r.start, end: r.end } : null
  }
  const syncLoopUi = () => {
    loopBtn.setAttribute("aria-pressed", String(loopNow() !== null))
    requestDraw()
  }
  const sendView = () => {
    if (!options.onView) return
    const z = zoomNow()
    const l = loopNow()
    const key = `${z.u.toFixed(4)},${z.v.toFixed(4)},${z.w.toFixed(4)}|${l ? `${l.start},${l.end}` : ""}`
    if (key === viewSent) return
    viewSent = key
    options.onView({ zoom: clampZoom(z), loop: l })
  }

  /** How far the look is the difference's (0–1): the cut, the seam and the folded labels give way to it. */
  const differenceWeight = () => {
    const f = Math.min(1, Math.max(0, fade.x))
    return (fromMode === "difference" ? 1 - f : 0) + (toMode === "difference" ? f : 0)
  }
  /** The grip in the line's middle, or at the pointer's height while dragging. */
  const placeGrip = (wr: Rect) => {
    const gy = gripTop(wr.y + gripAt.x * wr.h, wr, GRIP.h) - wr.y
    grip.style.transform = `translate3d(0,${gy.toFixed(2)}px,0)`
  }
  let folded = 0
  const draw = () => {
    dirty = false
    // The media comes in once both sides have a frame (a fade and a 4px blur), never again.
    if (!root.hasAttribute("data-ready") && sides.every((x) => x.shown || x.failed))
      root.setAttribute("data-ready", "")
    const r = layoutNow()
    const wr = wipeRect(r.L.overlay)
    const k = Math.min(1, Math.max(0, lay.x))
    const fu = fuseFrame(r.L, r.before, r.after, k, wipeLine.x)
    // The frame's radius on each side, at every frame of the fuse (the stage rounds only its own
    // corners, which the sides leave as they come together).
    const corners = fuseCorners(frameRadius, k)
    const dw = differenceWeight()
    const fusing = 1 - dw
    // Labels: in their sides' top corners apart; fusing, they fold to their names and ride either
    // side of the seam, fading where there's no room; in a difference, back in the corners.
    folded = k * fusing
    const fold = labelFold(folded, MARK.w)
    const w = labelW.map((x) => x - (MARK.w - fold.width) - MARK.gap * folded) as [number, number]
    const ride = seamLabels(fu.cut, r.before.x, r.after.x + r.after.w, w[0], w[1], INSET)
    const apart = [r.before.x + INSET, r.after.x + INSET]
    const corner = [r.before.x + INSET, r.after.x + r.after.w - labelW[1] - INSET]
    const rides = [ride.before, ride.after] as const
    const ys = [r.before.y + INSET, r.after.y + INSET]
    for (const i of [0, 1] as const) {
      const fused = apart[i]! + (rides[i].x - apart[i]!) * k
      const x = fused + (corner[i]! - fused) * dw
      const opacity = (1 - k + k * rides[i].opacity) * fusing + dw
      const l = labels[i]
      l.style.transform = `translate(${x.toFixed(2)}px,${ys[i]!.toFixed(2)}px)`
      l.style.opacity = opacity.toFixed(3)
      const mark = l.firstElementChild as HTMLElement | null
      if (mark) {
        mark.style.width = `${fold.width.toFixed(2)}px`
        mark.style.marginRight = `${(-MARK.gap * folded).toFixed(2)}px`
        mark.style.opacity = fold.opacity.toFixed(3)
        mark.style.filter = fold.blur > 0.05 ? `blur(${fold.blur.toFixed(2)}px)` : ""
      }
    }
    // The split's hairline, down the middle side by side, gone as the sides come together.
    const top = Math.min(r.L.side.before.y, r.L.side.after.y)
    split.style.transform = `translate(${r.L.side.split.toFixed(2)}px,${top.toFixed(2)}px)`
    split.style.height = `${Math.max(0, r.L.side.after.h).toFixed(2)}px`
    split.style.opacity = String(Math.max(0, 1 - k * 2))
    // The seam: a blurred strip while fusing, and the wipe's handle, both fading in as the sides
    // overlap.
    const seamOn = fu.seam * fusing
    const blur = fu.blur > 0.01 ? `blur(${fu.blur.toFixed(2)}px)` : "none"
    seam.style.transform = `translate(${fu.cut.toFixed(2)}px,${wr.y.toFixed(2)}px) translateX(-50%)`
    seam.style.width = `${(8 + 2 * fu.feather).toFixed(2)}px`
    seam.style.height = `${Math.max(0, wr.h).toFixed(2)}px`
    seam.style.opacity = (blur === "none" ? 0 : seamOn).toFixed(3)
    seam.style.backdropFilter = blur
    seam.style.setProperty("-webkit-backdrop-filter", blur)
    handle.toggleAttribute("data-on", mode === "wipe")
    handle.style.transform = `translate(${fu.cut.toFixed(2)}px,${wr.y.toFixed(2)}px)`
    handle.style.height = `${Math.max(0, wr.h).toFixed(2)}px`
    handle.style.opacity = seamOn.toFixed(3)
    handle.style.filter = blur
    placeGrip(wr)
    handle.setAttribute("aria-valuenow", String(Math.round(wipe * 100)))
    handle.setAttribute("aria-valuetext", `${Math.round(wipe * 100)}% Before`)
    const pct = `${Math.round(100 / zw.x)}%`
    if (zoomPct.textContent !== pct) zoomPct.textContent = pct
    zoomPill.toggleAttribute("data-on", zoomed())
    root.toggleAttribute("data-zoomed", zoomed())
    sendView()

    if (pending) return
    if (renderer === "dom") {
      // Before is cut at the seam, feathered mid-fuse (a difference shows it whole).
      const cut = mode === "difference" ? null : fu
      const place = (n: HTMLElement, rect: Rect, clip: Rect, before: boolean) => {
        const round = before ? corners.before : corners.after
        const st = n.style
        st.transform = `translate(${rect.x.toFixed(2)}px,${rect.y.toFixed(2)}px)`
        st.width = `${rect.w.toFixed(2)}px`
        st.height = `${rect.h.toFixed(2)}px`
        const edge = before && cut ? cut.cut + cut.feather : Number.POSITIVE_INFINITY
        const t = Math.max(0, clip.y - rect.y)
        const l = Math.max(0, clip.x - rect.x)
        const b = Math.max(0, rect.y + rect.h - (clip.y + clip.h))
        const right = Math.max(0, rect.x + rect.w - Math.min(clip.x + clip.w, edge))
        // Cut short of its side's edge (the seam), the right corners are the seam's: square.
        const rr = edge < clip.x + clip.w - 0.5 ? 0 : round.right
        const rl = round.left
        st.clipPath =
          t + l + b + right + rl + rr > 0.01
            ? `inset(${t.toFixed(2)}px ${right.toFixed(2)}px ${b.toFixed(2)}px ${l.toFixed(2)}px round ${rl.toFixed(2)}px ${rr.toFixed(2)}px ${rr.toFixed(2)}px ${rl.toFixed(2)}px)`
            : ""
        const mask =
          before && cut && cut.feather > 0.5
            ? `linear-gradient(to right,#000 ${(cut.cut - cut.feather - rect.x).toFixed(2)}px,transparent ${(edge - rect.x).toFixed(2)}px)`
            : ""
        st.maskImage = mask
        st.setProperty("-webkit-mask-image", mask)
      }
      for (const s of sides) {
        const rect = s.index === 0 ? r.zBefore : r.zAfter
        const clip = s.index === 0 ? r.before : r.after
        place(s.el, rect, clip, s.index === 0)
        place(s.preview, rect, clip, s.index === 0)
        if (s.index !== 0) continue
        for (const n of [s.el, s.preview])
          n.style.mixBlendMode = mode === "difference" ? "difference" : ""
      }
      return
    }
    if (!gpu) return
    const dpr = Math.min(3, Math.max(1, win.devicePixelRatio || 1))
    const s = (x: Rect): Rect => ({ x: x.x * dpr, y: x.y * dpr, w: x.w * dpr, h: x.h * dpr })
    gpu.draw({
      before: s(r.zBefore),
      after: s(r.zAfter),
      beforeClip: s(r.before),
      afterClip: s(r.after),
      width: Math.max(1, Math.round(stageW * dpr)),
      height: Math.max(1, Math.round(stageH * dpr)),
      dpr,
      wipeX: fu.cut * dpr,
      soft: Math.max(0.75, fu.feather) * dpr,
      from: MODE_INDEX[fromMode],
      to: MODE_INDEX[toMode],
      mix: Math.min(1, Math.max(0, fade.x)),
      threshold,
      gain: 1,
      accent,
      loupe:
        loupeShown() && pointer
          ? { x: pointer.x * dpr, y: pointer.y * dpr, r: LOUPE.r * dpr, zoom: LOUPE.zoom }
          : null,
      preview: [Boolean(sides[0].shown?.cached), Boolean(sides[1].shown?.cached)],
      radii: [
        corners.before.left * dpr,
        corners.before.right * dpr,
        corners.after.left * dpr,
        corners.after.right * dpr,
      ],
    })
  }
  const drawNow = () => {
    if (!disposed) draw()
  }
  const zoomResting = () => zu.resting && zv.resting && zw.resting

  const loop = frameLoop(win, (dt) => {
    lay.step(dt)
    fade.step(dt)
    if (wipeCatching) {
      wipeLine.step(dt)
      if (wipeLine.resting) wipeCatching = false
    }
    zu.step(dt)
    zv.step(dt)
    zw.step(dt)
    gripAt.step(dt)
    const playing = isPlaying()
    if (playing) {
      const m = master()
      const f = follower()
      if (m && f && !f.seeking && !m.seeking && !m.paused) {
        const inRange = !Number.isFinite(f.duration) || m.currentTime < f.duration - 0.05
        if (inRange) {
          const a = syncAction(m.currentTime, f.currentTime)
          if (a.seekTo !== null) f.currentTime = clampTime(f, a.seekTo)
          else if (Math.abs(f.playbackRate - a.rate) > 0.004) f.playbackRate = a.rate
          if (f.paused) void f.play().catch(() => {})
        }
      }
      if (!tl && m) {
        // Its own clock: After's time, starting over at the end or the loop's (never el.loop).
        const end = ownLoop ? ownLoop.end : duration - 1e-3
        if (m.ended || m.currentTime >= end) {
          ownTime = ownLoop?.start ?? 0
          jumpAll(ownTime)
        } else ownTime = m.currentTime
      }
      // A browser without frame callbacks: copy the playing frames each tick.
      if (gpu)
        for (const s of sides) if (videoOf(s) && performance.now() - s.frameAt > 120) pushFrame(s)
    }
    const moving =
      !lay.resting || !fade.resting || !zoomResting() || wipeCatching || !gripAt.resting
    if (moving) dirty = true
    if (dirty) draw()
    return playing || moving
  })
  const requestDraw = () => {
    dirty = true
    if (!disposed) loop.wake()
  }
  /** The hand's zoom or pan: there at once. */
  const handZoom = (z: ZoomRegion) => {
    const c = clampZoom(z)
    zu.snap(c.u)
    zv.snap(c.v)
    zw.snap(c.w)
    drawNow()
  }
  /** A reset, a double-click or a key: glides there (snapped with reduced motion). */
  const glideZoom = (z: ZoomRegion) => {
    const c = clampZoom(z)
    if (reducedMotion(win)) return handZoom(c)
    zu.set(c.u)
    zv.set(c.v)
    zw.set(c.w)
    requestDraw()
  }

  /** The height a self-sizing viewer needs: a split screen with no margins, in every mode. */
  const autoHeight = (w: number) =>
    Math.max(60, Math.min(win.innerHeight * 0.8, splitHeight(w, sizeOf(sides[1]))))
  const fitHeight = () => {
    const h = autoHeight(stageW)
    if (Math.abs(h - stageH) < 0.25) return
    stage.style.height = `${h.toFixed(2)}px`
    stageH = h
    stageRect = null
  }
  const readColors = () => {
    const c = tokenColor(win.getComputedStyle(root), "--_ku-cmp-diff", [0.49, 0.81, 0.61, 1])
    accent = [c[0], c[1], c[2]]
    // Open widths, whatever the fold is now.
    const unfold = MARK.w - labelFold(folded, MARK.w).width + MARK.gap * folded
    labelW = [labels[0].offsetWidth + unfold, labels[1].offsetWidth + unfold]
    frameRadius = Number.parseFloat(win.getComputedStyle(stage).borderTopLeftRadius) || 0
    requestDraw()
  }
  const measure = () => {
    const r = stage.getBoundingClientRect()
    stageW = Math.max(1, r.width)
    stageH = Math.max(1, r.height)
    if (auto) fitHeight()
    stageRect = null
    readColors()
    // Drawn in the same frame as the resize (a card going full-window, say), so a resized canvas
    // never shows a blank frame.
    drawNow()
  }

  // ——— near the screen: load; well off it: pause, then let go ———
  const wake = () => {
    win.clearTimeout(releaseTimer)
    for (const s of sides) loadSide(s)
    if (isPlaying()) startVideos()
  }
  const sleep = () => {
    if (isPlaying()) {
      if (ownTimeline || !tl) api.pause()
      else pauseVideos()
    }
    win.clearTimeout(releaseTimer)
    releaseTimer = win.setTimeout(() => {
      for (const s of sides) unloadSide(s)
      gpu?.shrink()
    }, RELEASE_MS)
  }
  const setOnScreen = (on: boolean) => {
    if (on === onScreen) return
    onScreen = on
    for (const s of sides) {
      if (!s.frames || s.seen === on) continue
      s.seen = on
      s.frames.visible(on)
    }
  }
  const IO = (win as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
  const nearIo =
    options.lazy !== false && IO
      ? new IO(
          (entries) => {
            const on = entries.at(-1)!.isIntersecting
            if (on === near) return
            near = on
            if (on) wake()
            else sleep()
          },
          { rootMargin: "100% 0px" },
        )
      : null
  const screenIo =
    options.lazy !== false && IO
      ? new IO((entries) => setOnScreen(entries.at(-1)!.isIntersecting))
      : null
  if (!nearIo) {
    near = true
    onScreen = true
  }

  // ——— the hand: the wipe, and zoomed, a pan; a pinch, ⌘/ctrl-wheel or a trackpad pinch zooms ———
  const local = (e: { clientX: number; clientY: number }) => {
    stageRect ??= stage.getBoundingClientRect()
    return { x: e.clientX - stageRect.left, y: e.clientY - stageRect.top }
  }
  const forgetRect = () => {
    stageRect = null
  }
  const onPill = (e: Event) => (e.target as Element | null)?.closest?.(".knobs-cmp-zoom") != null
  const startPinch = () => {
    const [a, b] = [...touches.values()]
    if (!a || !b) return
    drag = null
    delete root.dataset.dragging
    delete root.dataset.panning
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || onPill(e)) return
    delete root.dataset.keyboard
    stageRect = null
    const p = local(e)
    pointer = p
    if (e.target === handle) handle.focus({ preventScroll: true })
    else root.focus({ preventScroll: true })
    touches.set(e.pointerId, p)
    stage.setPointerCapture(e.pointerId)
    press = touches.size === 1 && mode !== "wipe" && master() ? p : null
    if (touches.size >= 2) {
      e.preventDefault()
      press = null
      return startPinch()
    }
    if (mode === "wipe") {
      const wr = wipeRect(layoutNow().L.overlay)
      const inside =
        p.x >= wr.x - SLOP && p.x <= wr.x + wr.w + SLOP && p.y >= wr.y && p.y <= wr.y + wr.h
      const grab = wipeGrab(p.x, wr, wipeLine.x, SLOP)
      // Zoomed, only the line itself takes the wipe; elsewhere the hand pans.
      if (inside && (grab.onLine || !zoomed())) {
        drag = { kind: "wipe", offset: grab.offset }
        root.dataset.dragging = ""
        gripAt.snap(wr.h > 0 ? (p.y - wr.y) / wr.h : 0.5)
        e.preventDefault()
        // Away from the line, it catches up to the hand from where it is; then it's 1:1.
        if (!grab.onLine) setWipe(wipeAt(p.x, wr), true, true)
        else drawNow()
        return
      }
    }
    if (zoomed()) {
      drag = { kind: "pan", x: p.x, y: p.y, base: baseAt(p), moved: false }
      root.dataset.panning = ""
      e.preventDefault()
    }
  }
  const onMove = (e: PointerEvent) => {
    const p = local(e)
    pointer = p
    if (press && Math.hypot(p.x - press.x, p.y - press.y) > 4) press = null
    if (touches.has(e.pointerId)) touches.set(e.pointerId, p)
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const base = baseAt(mid)
      const panned = panBy(zoomNow(), mid.x - pinch.x, mid.y - pinch.y, base)
      const q = pointIn(base, mid.x, mid.y)
      const k = d / Math.max(1, pinch.d)
      pinch = { d, x: mid.x, y: mid.y }
      return handZoom(zoomAbout(panned, k, q.pu, q.pv))
    }
    if (drag?.kind === "wipe") {
      const wr = wipeRect(layoutNow().L.overlay)
      gripAt.snap(wr.h > 0 ? (p.y - wr.y) / wr.h : 0.5)
      setWipe(wipeAt(p.x, wr, drag.offset))
      placeGrip(wr)
    } else if (drag?.kind === "pan") {
      const dx = p.x - drag.x
      const dy = p.y - drag.y
      drag.x = p.x
      drag.y = p.y
      drag.moved = true
      handZoom(panBy(zoomNow(), dx, dy, drag.base))
    } else if (loupeShown()) drawNow()
  }
  const endDrag = (e: PointerEvent) => {
    if (press && e.type === "pointerup") {
      api.toggle()
      glyph.flash(isPlaying())
    }
    press = null
    touches.delete(e.pointerId)
    if (touches.size < 2) pinch = null
    if (!drag) return
    // Let go of the wipe, the grip settles back to the line's middle.
    if (drag.kind === "wipe") {
      if (reducedMotion(win)) gripAt.snap(0.5)
      else gripAt.set(0.5)
      requestDraw()
    }
    drag = null
    delete root.dataset.dragging
    delete root.dataset.panning
  }
  const onWheel = (e: WheelEvent) => {
    const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stageH : 1
    const p = local(e)
    if ((e.ctrlKey || e.metaKey) && !gesturing) {
      // A trackpad pinch arrives as ctrl-wheel; ⌘-wheel zooms a mouse.
      e.preventDefault()
      const base = baseAt(p)
      const q = pointIn(base, p.x, p.y)
      const k = Math.exp(-e.deltaY * scale * (e.ctrlKey ? 0.01 : 0.002))
      return handZoom(zoomAbout(zoomNow(), k, q.pu, q.pv))
    }
    // Zoomed, the wheel pans; otherwise the page scrolls on.
    if (!zoomed() || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    handZoom(panBy(zoomNow(), -e.deltaX * scale, -e.deltaY * scale, baseAt(p)))
  }
  // Safari's trackpad pinch.
  let gesturing = false
  let gestureScale = 1
  const onGesture = (e: Event) => {
    e.preventDefault()
    const g = e as Event & { scale?: number; clientX?: number; clientY?: number }
    if (e.type === "gesturestart") {
      gesturing = true
      gestureScale = 1
      return
    }
    if (e.type === "gestureend") {
      gesturing = false
      return
    }
    const s = g.scale ?? 1
    const p =
      g.clientX !== undefined && g.clientY !== undefined
        ? local({ clientX: g.clientX, clientY: g.clientY })
        : (pointer ?? { x: stageW / 2, y: stageH / 2 })
    const base = baseAt(p)
    const q = pointIn(base, p.x, p.y)
    handZoom(zoomAbout(zoomNow(), s / gestureScale, q.pu, q.pv))
    gestureScale = s
  }
  const onDouble = (e: MouseEvent) => {
    if (onPill(e)) return
    if (zoomed()) return glideZoom(ZOOM_FIT)
    const p = local(e)
    const base = baseAt(p)
    const q = pointIn(base, p.x, p.y)
    glideZoom(zoomAbout(zoomNow(), 2, q.pu, q.pv))
  }
  /** A key's zoom: about the middle of what shows. */
  const keyZoom = (factor: number) => {
    const z = { u: zu.target, v: zv.target, w: zw.target, h: zw.target }
    glideZoom(zoomAbout(z, factor, 0.5, 0.5))
  }

  // ——— keys ———
  const holdLoupe = (on: boolean) => {
    if (loupeHeld === on) return
    loupeHeld = on
    requestDraw()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return
    const claim = () => {
      e.preventDefault()
      e.stopPropagation()
      root.dataset.keyboard = ""
    }
    const onHandle = e.target === handle
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    switch (key) {
      case " ":
        claim()
        // A held Space toggles once, not on every repeat.
        if (!e.repeat) api.toggle()
        return
      case "ArrowLeft":
      case "ArrowRight": {
        if (e.altKey) return
        claim()
        const dir = key === "ArrowLeft" ? -1 : 1
        if (onHandle) return setWipe(wipeKey(wipe, dir, e.shiftKey))
        // Half a second, two with ⇧; the playhead glides, the videos land at once.
        return api.seekBy(dir * (e.shiftKey ? 2 : 0.5))
      }
      case ",":
      case ".":
        // A frame back or on.
        claim()
        return api.step(key === "," ? -1 : 1)
      case "Home":
      case "End":
        claim()
        if (onHandle) return setWipe(key === "Home" ? 0 : 1)
        return api.seek(key === "Home" ? 0 : duration || (tl?.duration ?? 0))
      case "s":
      case "w":
      case "d":
      case "1":
      case "2":
      case "3": {
        // Digits pick the offered modes in order, as in a panel's rows; S, W and D the ones
        // offered. S is the page's hint key once hint mode is on (as in a tree's type-ahead).
        if (e.altKey || e.shiftKey || (key === "s" && claimsHintKey(doc, key))) return
        const m = modeForKey(key, modeList)
        if (!m) return
        claim()
        return setMode(m)
      }
      case "z":
        if (e.altKey) return
        claim()
        if (!e.repeat) holdLoupe(true)
        return
      case "l":
        if (e.altKey || e.shiftKey) return
        claim()
        return api.setLoop(!loopNow())
      case "0":
        if (e.altKey || e.shiftKey) return
        claim()
        return glideZoom(ZOOM_FIT)
      case "=":
      case "+":
        claim()
        return keyZoom(1.5)
      case "-":
        claim()
        return keyZoom(1 / 1.5)
      case "Escape":
        if (!zoomed()) return
        claim()
        return glideZoom(ZOOM_FIT)
    }
  }

  const replace = (index: 0 | 1, source: CompareSource) => {
    const old = sides[index]
    old.stop()
    unloadSide(old)
    const s = makeSide(index, source)
    old.el.replaceWith(s.el)
    old.preview.replaceWith(s.preview)
    sides[index] = s
    root.toggleAttribute(
      "data-video",
      sides.some((x) => x.kind === "video"),
    )
    note.textContent = ""
    setLabel(index, labelOf(index))
    if (near) loadSide(s)
    readColors()
  }

  // ——— wiring, in order: everything above exists by now ———
  sides[0] = makeSide(0, options.before)
  sides[1] = makeSide(1, options.after)
  // Before draws over After (the wipe clips it, the difference blends it); each preview over its video.
  stage.insertBefore(sides[1].el, labels[0])
  stage.insertBefore(sides[1].preview, labels[0])
  stage.insertBefore(sides[0].el, labels[0])
  stage.insertBefore(sides[0].preview, labels[0])
  setLabel(0, labelOf(0))
  setLabel(1, labelOf(1))
  root.toggleAttribute(
    "data-video",
    sides.some((s) => s.kind === "video"),
  )
  loupeBtn.setAttribute("aria-pressed", String(loupeOn))
  loopBtn.setAttribute("aria-pressed", String(loopNow() !== null))
  const modePill =
    modeList.length > 1
      ? selectionPill(modes, {
          rows: () => modeBtns,
          selected: () => modeBtns[modeList.indexOf(mode)] ?? null,
        })
      : null
  syncModeUi()

  const unlisten = tl?.listen({
    onSeek: (t, source) => {
      if (source === "play") {
        // Its time came from After, unless it wrapped at a loop's end.
        const m = master()
        if (m && Math.abs(m.currentTime - t) > 0.25) jumpAll(t)
        return
      }
      if (tl!.playing) jumpAll(t)
      else showFrame(t, true)
    },
    onPlay: (playing) => (playing ? startVideos() : stopVideos()),
    onScrub: (on) => {
      scrubbing = on
      // Let go: the exact frame, wherever a keyframe seek left it.
      if (!on && !isPlaying()) showFrame(now(), true)
    },
    onRanges: syncLoopUi,
  })
  tl?.drive(clock)

  // Sizing itself, it sets the stage's height, so it watches only the width (a zero-height sizer):
  // a height it set never comes back as another resize.
  const sizer = el("div", "knobs-cmp-sizer")
  sizer.setAttribute("aria-hidden", "true")
  stage.append(sizer)
  const ro = new win.ResizeObserver(measure)
  ro.observe(auto ? sizer : stage)
  root.addEventListener("knobs-restyle", measure)
  measure()

  // While the adapter comes, the sides stay hidden, so nothing swaps in front of the eye.
  const gpuNav = (win.navigator as { gpu?: unknown }).gpu
  if (options.renderer !== "dom" && gpuNav) {
    pending = true
    root.dataset.renderer = "gpu"
    loupeBtn.hidden = true
    void startGpu(true)
  } else setRenderer("dom")

  win.addEventListener("scroll", forgetRect, { capture: true, passive: true })
  stage.addEventListener("pointerenter", forgetRect)
  stage.addEventListener("pointerdown", onDown)
  stage.addEventListener("pointermove", onMove)
  stage.addEventListener("pointerup", endDrag)
  stage.addEventListener("pointercancel", endDrag)
  stage.addEventListener("lostpointercapture", endDrag)
  stage.addEventListener("wheel", onWheel, { passive: false })
  stage.addEventListener("dblclick", onDouble)
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    stage.addEventListener(type, onGesture)
  stage.addEventListener("pointerleave", () => {
    if (drag) return
    pointer = null
    if (loupeOn || loupeHeld) requestDraw()
  })
  root.addEventListener("keydown", onKey)
  root.addEventListener("keyup", (e) => {
    if (e.key.toLowerCase() === "z") holdLoupe(false)
  })
  root.addEventListener("focusout", (e) => {
    if (root.contains(e.relatedTarget as Node | null)) return
    holdLoupe(false)
  })

  const unregisterHints =
    options.hints === false
      ? undefined
      : hints.register(
          root,
          () => [
            ...(modeList.length > 1
              ? modeList.map((m, i) => ({
                  el: modeBtns[i]!,
                  label: MODE_LABEL[m].long,
                  activate: () => setMode(m),
                }))
              : []),
            { el: loopBtn, label: "Loop", activate: () => api.setLoop(!loopNow()) },
            ...(loupeBtn.hidden
              ? []
              : [{ el: loupeBtn, label: "Loupe", activate: () => setLoupe(!loupeOn) }]),
            ...(zoomed()
              ? [{ el: zoomReset, label: "Reset zoom", activate: () => api.setZoom(null) }]
              : []),
            ...(mode === "wipe"
              ? [
                  {
                    el: handle,
                    label: "Wipe",
                    activate: () => handle.focus({ preventScroll: true }),
                  },
                ]
              : []),
          ],
          { listen: false, rank: 1 },
        )

  const strip =
    wantsStrip && stripHost && tl
      ? compareStrip(stripHost, {
          ...look,
          before: options.before,
          after: options.after,
          timeline: tl,
          ...(fpsOpt ? { fps: fpsOpt } : {}),
          threshold,
        })
      : null

  const api: Compare = {
    element: root,
    get mode() {
      return mode
    },
    modes: modeList,
    get wipe() {
      return wipe
    },
    get loupe() {
      return loupeOn
    },
    get time() {
      return now()
    },
    get playing() {
      return isPlaying()
    },
    get duration() {
      return duration
    },
    get renderer() {
      return renderer
    },
    timeline: tl,
    strip,
    get zoom() {
      return clampZoom(zoomNow())
    },
    get loop() {
      return loopNow()
    },
    update(next) {
      if (next.fps !== undefined) fpsOpt = next.fps
      if (next.threshold !== undefined) threshold = next.threshold
      // Sources are compared by src, so a new object for the same file changes only its label.
      const before = next.before && next.before.src !== sides[0].source.src ? next.before : null
      const after = next.after && next.after.src !== sides[1].source.src ? next.after : null
      if (before) replace(0, before)
      else if (next.before) setLabel(0, next.before.label ?? "Before")
      if (after) replace(1, after)
      else if (next.after) setLabel(1, next.after.label ?? "After")
      if (before || after)
        strip?.update({ ...(before ? { before } : {}), ...(after ? { after } : {}) })
      if (next.before || next.after) readColors()
      if (next.mode !== undefined) setMode(next.mode, false)
      if (next.wipe !== undefined) setWipe(next.wipe, false)
      if (next.loupe !== undefined) setLoupe(next.loupe)
      if (next.fps !== undefined && ownTimeline) tl?.update({ fps: next.fps })
      requestDraw()
    },
    seek: (t, o) => (tl ? tl.seek(t, o?.glide ? { glide: true } : undefined) : ownSeek(t)),
    seekBy(d) {
      const total = duration || tl?.duration || 0
      const t = Math.min(total, Math.max(0, now() + d))
      if (tl) tl.seek(t, { glide: true })
      else ownSeek(t)
    },
    play: () => (tl ? tl.play() : ownPlay()),
    pause: () => (tl ? tl.pause() : ownPause()),
    toggle: () => (isPlaying() ? api.pause() : api.play()),
    step(frames) {
      api.pause()
      const total = duration || tl?.duration || 0
      const f = frameOf(now(), fps()) + frames
      api.seek(Math.min(lastFrame(total, fps()), Math.max(0, f)) / fps())
    },
    setZoom(region, animate = true) {
      const z = region ?? ZOOM_FIT
      if (animate) glideZoom(z)
      else handZoom(z)
    },
    setLoop(next) {
      const total = duration || tl?.duration || 0
      const want = next === true ? loopAround(now(), total) : next === false ? null : next
      if (tl) {
        const rest = tl.ranges.filter((r) => !r.loop)
        tl.update({
          ranges: want
            ? [...rest, { id: "loop", start: want.start, end: want.end, loop: true }]
            : rest,
        })
      } else ownLoop = want
      syncLoopUi()
    },
    focus: () => root.focus({ preventScroll: true }),
    dispose() {
      disposed = true
      loop.stop()
      modePill?.dispose()
      glyph.dispose()
      win.clearTimeout(releaseTimer)
      ro.disconnect()
      nearIo?.disconnect()
      screenIo?.disconnect()
      win.removeEventListener("scroll", forgetRect, { capture: true })
      unregisterHints?.()
      unlisten?.()
      if (tl) {
        tl.drive(null)
        if (ownTimeline) tl.dispose()
      }
      strip?.dispose()
      for (const s of sides) {
        s.stop()
        unloadSide(s)
      }
      gpu?.dispose()
      gpu = null
      root.remove()
    },
  }

  if (nearIo && screenIo) {
    nearIo.observe(root)
    screenIo.observe(root)
  } else wake()
  return api
}
