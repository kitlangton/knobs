// compareStrip(container, options): a frame strip on a timeline's time axis. Each column holds a
// Before thumbnail over an After one and a bar for how much they differ (the mean difference of
// small copies); the columns that peak are drawn full. Columns line up under the timeline's track
// and follow its zoom and pan. Frames come from the page's shared frame cache (compare-frames.ts),
// the same one a viewer of these sources uses, decoded lazily and only while the strip is on
// screen. A press or drag scrubs the timeline.
import { acquireFrames, type FrameCache } from "./compare-frames.js"
import {
  letterbox,
  meanAbsDiff,
  mediaKind,
  type StripColumn,
  stripColumns,
  stripPeaks,
} from "./compare-model.js"
import type { CompareSource } from "./compare.js"
import { applyLook, type UiLook } from "./look.js"
import { parseCssColor } from "./rgba.js"
import type { Timeline } from "./timeline.js"
import { frameTime } from "./timeline-model.js"

export interface CompareStripOptions extends UiLook {
  readonly before: CompareSource
  readonly after: CompareSource
  /** The time axis: its view, time and duration; a press here seeks it. */
  readonly timeline: Timeline
  /** The timeline's by default. */
  readonly fps?: number
  /** Columns under the timeline's track (`"track"`, the default) or across the strip's own width. */
  readonly align?: "track" | "self"
  /** Differences below this (0–1) never peak. */
  readonly threshold?: number
  /** A press or drag picked a time. */
  onPick?(time: number): void
}

export interface CompareStrip {
  readonly element: HTMLElement
  /** Each column's difference (by the frame it samples), 0 (same) to 1. */
  readonly diffs: ReadonlyMap<number, number>
  update(next: { before?: CompareSource; after?: CompareSource }): void
  dispose(): void
}

const BAR = 7
const GAP = 2
const DIFF = { w: 32, h: 18 }
/** New differences worked out per frame drawn, so a long strip never holds a frame up. */
const DIFFS_PER_DRAW = 6

interface StripSide {
  readonly source: CompareSource
  readonly kind: "video" | "image"
  frames: FrameCache | null
  still: HTMLImageElement | null
  seen: boolean
}

export function compareStrip(container: HTMLElement, options: CompareStripOptions): CompareStrip {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const timeline = options.timeline
  const fps = () => options.fps ?? timeline.fps
  const align = options.align ?? "track"
  const threshold = options.threshold ?? 4 / 255
  const root = doc.createElement("div")
  root.className = "knobs-cmp-strip"
  root.setAttribute("role", "img")
  root.setAttribute("aria-label", "Frame strip: Before over After, with how much they differ")
  applyLook(root, options)
  const canvas = doc.createElement("canvas")
  canvas.setAttribute("aria-hidden", "true")
  root.append(canvas)
  container.append(root)

  const diffs = new Map<number, number>()
  const pairDiffs = new Map<string, number | undefined>()
  let disposed = false
  let near = false
  let onScreen = false

  const makeSide = (source: CompareSource): StripSide => ({
    source,
    kind: mediaKind(source.src, source.kind),
    frames: null,
    still: null,
    seen: false,
  })
  let sides: [StripSide, StripSide] = [makeSide(options.before), makeSide(options.after)]
  const offs = new Map<StripSide, () => void>()
  const load = (s: StripSide) => {
    if (s.frames || s.still) return
    if (s.kind === "video") {
      s.frames = acquireFrames(doc, s.source.src, fps())
      offs.set(s, s.frames.listen(schedule))
      if (onScreen) {
        s.frames.visible(true)
        s.seen = true
      }
    } else {
      const img = doc.createElement("img")
      img.crossOrigin = "anonymous"
      img.decoding = "async"
      img.addEventListener("load", () => {
        pairDiffs.clear()
        schedule()
      })
      img.src = s.source.src
      s.still = img
    }
  }
  const unload = (s: StripSide) => {
    offs.get(s)?.()
    offs.delete(s)
    if (s.frames) {
      if (s.seen) s.frames.visible(false)
      s.frames.release()
    }
    s.frames = null
    s.seen = false
    if (s.still) s.still.removeAttribute("src")
    s.still = null
  }

  // ——— geometry ———
  let w = 1
  let h = 1
  let geo = { x: 0, w: 1 }
  const rowH = () => Math.max(4, (h - BAR - GAP * 2) / 2)
  const aspectOf = (s: StripSide) => {
    if (s.still?.naturalWidth) return s.still.naturalWidth / s.still.naturalHeight
    const c = s.frames?.nearest(0)
    return c ? c.bitmap.width / c.bitmap.height : 0
  }
  const columns = (): StripColumn[] =>
    stripColumns(timeline.view, geo.w, {
      duration: timeline.duration,
      fps: fps(),
      minWidth: rowH() * Math.max(16 / 9, ...sides.map(aspectOf)) + GAP,
    })
  const measure = () => {
    const r = root.getBoundingClientRect()
    w = Math.max(1, r.width)
    h = Math.max(1, r.height)
    geo = { x: 0, w }
    if (align === "track") {
      const track = timeline.element.querySelector<HTMLElement>(".knobs-tl-track")
      const t = track?.getBoundingClientRect()
      if (t && t.width > 0) geo = { x: t.left - r.left, w: t.width }
    }
    readColors()
    schedule()
  }
  /** Each column's frames, asked of the caches (small, a column's half-width either way). */
  const ask = (cols: readonly StripColumn[]) => {
    const points = cols.map((c) => ({ frame: c.frame, tolerance: Math.floor((c.to - c.from) / 2) }))
    for (const s of sides) s.frames?.want(points)
  }
  type Pic = {
    readonly img: CanvasImageSource
    readonly w: number
    readonly h: number
    readonly key: string
  }
  const picOf = (s: StripSide, c: StripColumn): Pic | null => {
    if (s.still?.naturalWidth)
      return { img: s.still, w: s.still.naturalWidth, h: s.still.naturalHeight, key: "still" }
    const f = s.frames?.nearest(c.frame, Math.max(1, c.to - c.from))
    return f ? { img: f.bitmap, w: f.bitmap.width, h: f.bitmap.height, key: String(f.frame) } : null
  }

  // ——— differences, from small copies ———
  const probe = doc.createElement("canvas")
  probe.width = DIFF.w
  probe.height = DIFF.h
  const probeCtx = probe.getContext("2d", { willReadFrequently: true })
  const differ = (a: Pic, b: Pic) => {
    if (!probeCtx) return undefined
    try {
      probeCtx.drawImage(a.img, 0, 0, DIFF.w, DIFF.h)
      const pa = probeCtx.getImageData(0, 0, DIFF.w, DIFF.h).data
      probeCtx.drawImage(b.img, 0, 0, DIFF.w, DIFF.h)
      const pb = probeCtx.getImageData(0, 0, DIFF.w, DIFF.h).data
      return meanAbsDiff(pa, pb)
    } catch {
      return undefined
    }
  }

  // ——— drawing ———
  let colors = { surface: "", accent: "", diff: "", wash: "" }
  const rgba = (raw: string, fallback: readonly [number, number, number, number]) => {
    const [r, g, b, a] = parseCssColor(raw, fallback)
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
  }
  const readColors = () => {
    const cs = win.getComputedStyle(root)
    colors = {
      surface: rgba(cs.getPropertyValue("--ku-surface"), [1, 1, 1, 0.055]),
      accent: rgba(cs.getPropertyValue("--ku-accent"), [1, 1, 1, 1]),
      diff: rgba(cs.getPropertyValue("--ku-cmp-diff"), [0.49, 0.81, 0.61, 1]),
      wash: rgba(cs.getPropertyValue("--ku-surface-hi"), [1, 1, 1, 0.11]),
    }
  }
  let hover: number | null = null
  let raf = 0
  let asked = ""
  function schedule() {
    if (!raf && !disposed) raf = win.requestAnimationFrame(draw)
  }
  const draw = () => {
    raf = 0
    if (!near) return
    const dpr = Math.min(3, Math.max(1, win.devicePixelRatio || 1))
    const cw = Math.round(w * dpr)
    const ch = Math.round(h * dpr)
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const cols = columns()
    const key = cols.map((c) => c.frame).join(",")
    if (key !== asked) {
      asked = key
      ask(cols)
    }
    const rh = rowH()
    const radius = 3
    let budget = DIFFS_PER_DRAW
    let more = false
    const ds = cols.map((c) => {
      const a = picOf(sides[0], c)
      const b = picOf(sides[1], c)
      if (!a || !b) return undefined
      const k = `${a.key}|${b.key}`
      if (!pairDiffs.has(k)) {
        if (budget-- <= 0) {
          more = true
          return undefined
        }
        pairDiffs.set(k, differ(a, b))
      }
      const d = pairDiffs.get(k)
      if (d !== undefined) diffs.set(c.frame, d)
      return d
    })
    const max = Math.max(0.02, ...ds.map((d) => d ?? 0))
    const peaks = new Set(stripPeaks(ds, { threshold }))
    cols.forEach((c, i) => {
      const x = geo.x + c.x + GAP / 2
      const cwid = Math.max(1, c.w - GAP)
      if (x + cwid < 0 || x > w) return
      for (const row of [0, 1] as const) {
        const y = row * (rh + GAP)
        const pic = picOf(sides[row], c)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x, y, cwid, rh, radius)
        ctx.fillStyle = colors.surface
        ctx.fill()
        if (pic) {
          ctx.clip()
          const r = letterbox({ w: pic.w, h: pic.h }, { x, y, w: cwid, h: rh })
          ctx.drawImage(pic.img, r.x, r.y, r.w, r.h)
        }
        ctx.restore()
      }
      if (hover === i) {
        ctx.fillStyle = colors.wash
        ctx.beginPath()
        ctx.roundRect(x, 0, cwid, rh * 2 + GAP, radius)
        ctx.fill()
      }
      const d = ds[i]
      if (d !== undefined && d > 0) {
        const bh = Math.max(1, Math.min(1, d / max) * BAR)
        ctx.globalAlpha = peaks.has(i) ? 1 : 0.42
        ctx.fillStyle = colors.diff
        ctx.beginPath()
        ctx.roundRect(x, h - bh, cwid, bh, Math.min(1.5, bh / 2))
        ctx.fill()
        ctx.globalAlpha = 1
      }
    })
    const v = timeline.view
    const px = geo.x + ((timeline.time - v.start) / v.span) * geo.w
    if (px >= -1 && px <= w + 1) {
      ctx.fillStyle = colors.accent
      ctx.fillRect(Math.round(px * dpr) / dpr - 0.75, 0, 1.5, h)
    }
    if (more) schedule()
  }

  // ——— the hand: a press or drag scrubs the timeline ———
  const timeAt = (clientX: number) => {
    const r = root.getBoundingClientRect()
    const v = timeline.view
    const t = v.start + ((clientX - r.left - geo.x) / geo.w) * v.span
    return Math.min(timeline.duration, Math.max(0, frameTime(t, fps())))
  }
  const columnAt = (clientX: number) => {
    const x = clientX - root.getBoundingClientRect().left - geo.x
    const i = columns().findIndex((c) => x >= c.x && x < c.x + c.w)
    return i < 0 ? null : i
  }
  let dragging = false
  const pick = (clientX: number) => {
    const t = timeAt(clientX)
    timeline.seek(t)
    options.onPick?.(t)
  }
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    dragging = true
    root.setPointerCapture(e.pointerId)
    // Keys go where Space plays: the viewer it's part of, else the timeline.
    const host = root.closest<HTMLElement>(".knobs-compare")
    if (host) host.focus({ preventScroll: true })
    else timeline.focus()
    if (timeline.playing) timeline.pause()
    pick(e.clientX)
    e.preventDefault()
  })
  root.addEventListener("pointermove", (e) => {
    if (dragging) pick(e.clientX)
    const i = columnAt(e.clientX)
    if (i !== hover) {
      hover = i
      schedule()
    }
  })
  const end = () => {
    dragging = false
  }
  root.addEventListener("pointerup", end)
  root.addEventListener("pointercancel", end)
  root.addEventListener("lostpointercapture", end)
  root.addEventListener("pointerleave", () => {
    if (hover === null) return
    hover = null
    schedule()
  })

  const unlisten = timeline.listen({ onSeek: schedule, onView: schedule })
  const ro = new win.ResizeObserver(measure)
  ro.observe(root)
  const track = timeline.element.querySelector(".knobs-tl-track")
  if (track) ro.observe(track)
  root.addEventListener("knobs-restyle", measure)

  // Near the screen it loads; on it, its caches decode; well off it lets them go.
  const setOnScreen = (on: boolean) => {
    onScreen = on
    for (const s of sides) {
      if (!s.frames || s.seen === on) continue
      s.seen = on
      s.frames.visible(on)
    }
  }
  const setNear = (on: boolean) => {
    near = on
    if (on) {
      for (const s of sides) load(s)
      schedule()
    } else for (const s of sides) unload(s)
  }
  const IO = (win as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
  const nearIo = IO
    ? new IO((e) => setNear(e.at(-1)!.isIntersecting), { rootMargin: "100% 0px" })
    : null
  const screenIo = IO ? new IO((e) => setOnScreen(e.at(-1)!.isIntersecting)) : null
  measure()
  if (nearIo && screenIo) {
    nearIo.observe(root)
    screenIo.observe(root)
  } else {
    setNear(true)
    setOnScreen(true)
  }

  return {
    element: root,
    diffs,
    update(next) {
      const was = sides
      sides = [
        next.before ? makeSide(next.before) : was[0],
        next.after ? makeSide(next.after) : was[1],
      ]
      for (const s of was) if (!sides.includes(s)) unload(s)
      diffs.clear()
      pairDiffs.clear()
      asked = ""
      if (near) for (const s of sides) load(s)
      if (onScreen) setOnScreen(true)
      schedule()
    },
    dispose() {
      disposed = true
      if (raf) win.cancelAnimationFrame(raf)
      unlisten()
      ro.disconnect()
      nearIo?.disconnect()
      screenIo?.disconnect()
      for (const s of sides) unload(s)
      root.remove()
    },
  }
}
