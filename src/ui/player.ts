// player(container, options): a plain video in the same look as a compare: the picture, then a
// row under it: a minimal play/pause button and one thin progress line (a timeline's "line"
// variant) with a segment per chapter. The button or Space (focused) plays and pauses; a click on
// the picture only focuses it. Click or drag the line to seek, 1:1. The chapter and time under
// the pointer float over the line. The timeline follows the video's own time while it plays, so
// the two never drift.
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
  frame.append(v)
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
  // A seek reports once it lands, paused, and only when it went somewhere (not a pause's settle).
  let reported = 0
  const onSeeked = () => {
    if (pending !== null) {
      const t = pending
      pending = null
      v.currentTime = t
      return
    }
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
      // A pause settling on the frame that shows needs no seek.
      if (Math.abs(v.currentTime - t) < 1 / (options.fps ?? 30)) return
      seekVideo(t)
    },
    onPlay(on) {
      if (on) void v.play().catch(() => tl.pause())
      else {
        v.pause()
        reported = tl.time
      }
      root.toggleAttribute("data-playing", on)
      options.onPlay?.(on, tl.time)
    },
    onScrub(on) {
      if (on) v.pause()
    },
  })
  // While it plays the line follows the video's own clock.
  tl.drive(() => {
    if (v.readyState < 1) return Number.NaN
    if (v.seeking) return tl.time
    return v.ended ? Number.POSITIVE_INFINITY : v.currentTime
  })

  // A click on the picture plays nothing (no surprise); it focuses the line, so Space plays.
  const onClick = () => tl.focus()
  frame.addEventListener("click", onClick)
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
