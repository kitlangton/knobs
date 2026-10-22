// player(container, options): a plain video in the same look as a compare: the picture, then a
// row under it: a minimal play/pause button and one thin progress line (a timeline's "line"
// variant) with a segment per chapter. The button, a click on the picture or Space (focused) plays
// and pauses; nothing flashes over the picture. Click or drag the line to seek, 1:1. The chapter and time under
// the pointer float over the line. The timeline follows the video's own time while it plays, so
// the two never drift. Scrubbing shows the frame under the hand at once: once the pointer is over
// the player its frames decode in the background (compare-frames.ts, shared with any compare of
// the same file), and while the line is dragged the nearest one draws over the video, which seeks
// once the hand lets go (or when nothing near is cached yet).
import { acquireFrames, type CachedFrame, type FrameCache } from "./compare-frames.js"
import { frameOf } from "./compare-model.js"
import { applyLook, type UiLook } from "./look.js"
import { timeline as makeTimeline, type Timeline } from "./timeline.js"

/** A chapter: where it starts (seconds) and its name. */
export interface PlayerChapter {
  readonly label: string
  readonly start: number
  readonly id?: string
}

export interface PlayerOptions extends UiLook {
  readonly src: string
  readonly poster?: string
  /** A WebVTT file, shown by default. */
  readonly captions?: string
  /** One segment of the line each, named under the pointer. */
  readonly chapters?: readonly PlayerChapter[]
  /** Starts over at the end (true). */
  readonly loop?: boolean
  /** True by default. */
  readonly muted?: boolean
  /** Width over height before the video loads (16/9). */
  readonly aspect?: number
  /** Frames per second, for stepping with `,` and `.` (30). */
  readonly fps?: number
  readonly label?: string
  /** The line's play key and playhead take codes in the page's hint mode (on by default). */
  readonly hints?: boolean
  /** Played or paused, at `time` (seconds). */
  onPlay?(playing: boolean, time: number): void
  /** Sought by the hand (the line, a key, a chapter) or code, at rest. */
  onSeek?(time: number): void
}

export interface Player {
  readonly element: HTMLElement
  readonly video: HTMLVideoElement
  readonly timeline: Timeline
  /** Seconds. */
  readonly time: number
  readonly playing: boolean
  readonly duration: number
  play(): void
  pause(): void
  toggle(): void
  /** `glide`: a jump the hand didn't make; the line catches up while the video lands at once. */
  seek(time: number, options?: { readonly glide?: boolean }): void
  seekBy(seconds: number): void
  focus(): void
  dispose(): void
}

export function player(container: HTMLElement, options: PlayerOptions): Player {
  const doc = container.ownerDocument
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const n = doc.createElement(tag)
    n.className = cls
    return n
  }
  const look: UiLook = {
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.appearance ? { appearance: options.appearance } : {}),
  }
  const root = el("div", "knobs-player")
  root.setAttribute("role", "group")
  root.setAttribute("aria-label", options.label ?? "Video")
  applyLook(root, options)
  const frame = el("div", "knobs-player-frame")
  frame.style.setProperty("--kp-aspect", String(options.aspect ?? 16 / 9))
  const v = el("video", "knobs-player-media")
  v.muted = options.muted ?? true
  v.defaultMuted = v.muted
  v.playsInline = true
  v.preload = "metadata"
  v.setAttribute("playsinline", "")
  if (options.poster) v.poster = options.poster
  if (options.captions) {
    const track = doc.createElement("track")
    track.kind = "captions"
    track.label = "Captions"
    track.srclang = doc.documentElement.lang || "en"
    track.default = true
    track.src = options.captions
    v.append(track)
  }
  const preview = el("canvas", "knobs-player-preview")
  preview.setAttribute("aria-hidden", "true")
  preview.hidden = true
  frame.append(v, preview)
  const host = el("div", "knobs-player-line")
  root.append(frame, host)
  container.append(root)

  const markers = (options.chapters ?? []).map((c, i) => ({
    id: c.id ?? `c${i}`,
    time: c.start,
    label: c.label,
  }))
  const tl = makeTimeline(host, {
    ...look,
    variant: "line",
    duration: 1,
    fps: options.fps ?? 30,
    markers,
    repeat: options.loop ?? true,
    arrows: { step: 5, shift: 10 },
    label: options.label ? `${options.label} time` : "Video time",
    ...(options.hints === false ? { hints: false } : {}),
  })

  // The picture comes in once there's something to show (its size, a frame).
  const onFrame = () => root.setAttribute("data-ready", "")
  // Seeks, coalesced: while one is in flight only the latest is kept.
  let pending: number | null = null
  const seekVideo = (t: number) => {
    if (v.readyState < 1) return
    if (v.seeking) pending = t
    else v.currentTime = t
  }

  // ——— the frame under the hand ———
  const fps = options.fps ?? 30
  let frames: FrameCache | null = null
  let unlistenFrames: (() => void) | null = null
  let scrubbing = false
  /** The frame the preview shows, or null while the video shows. */
  let previewing: number | null = null
  const want = () => frameOf(tl.time, fps)
  const emitFrame = (frame: number, source: "video" | "cache") =>
    root.dispatchEvent(new CustomEvent("knobs-player-frame", { detail: { frame, source } }))
  const drawPreview = (c: CachedFrame) => {
    if (preview.width !== c.bitmap.width || preview.height !== c.bitmap.height) {
      preview.width = c.bitmap.width
      preview.height = c.bitmap.height
    }
    preview.getContext("2d")?.drawImage(c.bitmap, 0, 0)
    preview.hidden = false
    previewing = c.frame
    emitFrame(c.frame, "cache")
  }
  const hidePreview = () => {
    if (previewing === null) return
    previewing = null
    preview.hidden = true
  }
  /** Mid-scrub: the cached frame nearest the playhead, when it's nearer than what shows. */
  const showNearest = () => {
    if (!frames || !scrubbing) return
    const w = want()
    const c = frames.nearest(w, Number.POSITIVE_INFINITY, true)
    if (!c || c.frame === previewing) return
    const shown = previewing ?? frameOf(v.currentTime, fps)
    if (Math.abs(c.frame - w) < Math.abs(shown - w)) drawPreview(c)
  }
  const startFrames = () => {
    if (frames) return
    frames = acquireFrames(doc, options.src, fps)
    frames.visible(true)
    unlistenFrames = frames.listen(showNearest)
  }

  // A seek reports once it lands, paused, and only when it went somewhere (not a pause's settle).
  let reported = 0
  const onSeeked = () => {
    if (pending !== null) {
      const t = pending
      pending = null
      v.currentTime = t
      return
    }
    const at = frameOf(v.currentTime, fps)
    emitFrame(at, "video")
    // Landed: the video takes over from the preview (mid-scrub, only if it's as near).
    if (
      !scrubbing ||
      (previewing !== null && Math.abs(at - want()) <= Math.abs(previewing - want()))
    )
      hidePreview()
    if (!v.paused || tl.playing || Math.abs(v.currentTime - reported) < 0.1) return
    reported = v.currentTime
    options.onSeek?.(reported)
  }
  const onMeta = () => {
    onFrame()
    if (v.videoWidth) frame.style.setProperty("--kp-aspect", String(v.videoWidth / v.videoHeight))
    if (Number.isFinite(v.duration)) tl.update({ duration: v.duration })
  }
  v.addEventListener("loadedmetadata", onMeta)
  v.addEventListener("loadeddata", onFrame)
  v.addEventListener("seeked", onSeeked)

  const unlisten = tl.listen({
    onSeek(t, source) {
      if (source === "play") {
        // Its time came from the video, unless it wrapped at the end.
        if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t
        return
      }
      if (scrubbing && frames) {
        frames.follow(want())
        showNearest()
        // Over frames the cache holds, the video seeks once the hand lets go.
        if (frames.covers(want())) return
      }
      // A pause settling on the frame that shows needs no seek.
      if (Math.abs(v.currentTime - t) < 1 / fps) {
        if (!scrubbing) hidePreview()
        return
      }
      seekVideo(t)
    },
    onPlay(on) {
      if (on) {
        hidePreview()
        void v.play().catch(() => tl.pause())
      } else {
        v.pause()
        reported = tl.time
      }
      root.toggleAttribute("data-playing", on)
      options.onPlay?.(on, tl.time)
    },
    onScrub(on) {
      scrubbing = on
      if (on) {
        v.pause()
        startFrames()
        return
      }
      // Let go: the exact frame, from the video.
      if (Math.abs(v.currentTime - tl.time) < 1 / fps && !v.seeking) hidePreview()
      else seekVideo(tl.time)
    },
  })
  // While it plays the line follows the video's own clock.
  tl.drive(() => {
    if (v.readyState < 1) return Number.NaN
    if (v.seeking) return tl.time
    return v.ended ? Number.POSITIVE_INFINITY : v.currentTime
  })

  // A click on the picture plays or pauses it, and focuses the line, so Space does too.
  const onClick = () => {
    tl.focus()
    tl.toggle()
  }
  frame.addEventListener("click", onClick)
  // The pointer coming near is the hint a scrub may follow: its frames start decoding.
  root.addEventListener("pointerenter", startFrames)
  v.src = options.src

  const api: Player = {
    element: root,
    video: v,
    timeline: tl,
    get time() {
      return tl.time
    },
    get playing() {
      return tl.playing
    },
    get duration() {
      return Number.isFinite(v.duration) ? v.duration : 0
    },
    play: () => tl.play(),
    pause: () => tl.pause(),
    toggle: () => tl.toggle(),
    seek: (t, o) => tl.seek(t, o?.glide ? { glide: true } : undefined),
    seekBy: (d) => tl.seek(Math.min(tl.duration, Math.max(0, tl.time + d)), { glide: true }),
    focus: () => tl.focus(),
    dispose() {
      unlisten()
      tl.drive(null)
      tl.dispose()
      v.pause()
      frame.removeEventListener("click", onClick)
      root.removeEventListener("pointerenter", startFrames)
      unlistenFrames?.()
      if (frames) {
        frames.visible(false)
        frames.release()
        frames = null
      }
      v.removeEventListener("loadedmetadata", onMeta)
      v.removeEventListener("loadeddata", onFrame)
      v.removeEventListener("seeked", onSeeked)
      v.removeAttribute("src")
      v.load()
      root.remove()
    },
  }
  return api
}
