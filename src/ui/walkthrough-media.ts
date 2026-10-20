// mediaSlot(container, { media }): one thing a walkthrough step shows: a before/after compare, a
// video or picture (with chapters), a code diff, a code or terminal block, a metric, a callout, a
// line of text, a history, a merge stack, a table, or anything of your own (`mount`). Heavy kinds wait until they're near the view to mount (compare
// and the diff load their code then, so a page without them never loads WebGPU or the
// highlighter); videos pause once they're out of view, and a compare or video far from it lets go
// of its decoders and GPU context, holding its height, until it comes near again.
import { mediaKind } from "./compare-model.js"
import { aliased } from "../core/glide.js"
import { icon } from "./icons.js"
import { applyLook, type UiLook } from "./look.js"
import { walkthroughCss } from "./walkthrough-css.js"
import {
  chapterPills,
  type ChapterPills,
  mountHistory,
  mountStack,
  mountTable,
  type StepLinks,
} from "./walkthrough-blocks.js"
import {
  type ContextEvent,
  fillMedia,
  formatTime,
  inlineMarkdown,
  type MediaContext,
  parseAspect,
  type WalkMedia,
  type WalkthroughMedia,
  type WalkthroughSource,
  zoomWords,
} from "./walkthrough-model.js"

export interface MediaSlotOptions extends UiLook {
  readonly media: WalkthroughMedia
  /** Mount heavy kinds near the view and let them go far from it (on by default). */
  readonly lazy?: boolean
  /** Kit played, paused or sought a video, or showed another diff file (for a note's log). */
  readonly onEvent?: (event: Omit<ContextEvent, "at" | "step">) => void
  /** The page's steps, for `step` on a history event, a stack item or a table cell. */
  readonly steps?: StepLinks
}

export type { StepLinks }

export interface MediaSlot {
  readonly element: HTMLElement
  /** Whether its content is mounted (heavy kinds wait until they're near the view). */
  readonly mounted: boolean
  /** Pauses any video in it. */
  pause(): void
  /** Moves its video (or compare) by `seconds`; false when there's none mounted. */
  seekBy(seconds: number): boolean
  /** What it's showing now: a video's time, a compare's loop, zoom and mode, a diff's file. */
  context(): MediaContext | null
  /** A zoomed compare back to the whole picture; false when nothing was zoomed. */
  unzoom(): boolean
  /** Fills the slot's height (its step full window) or goes back: a diff switches its height. */
  fill(on: boolean): void
  dispose(): void
}

interface Mounted {
  pause?(): void
  seekBy?(seconds: number): void
  unzoom?(): boolean
  context?(): MediaContext
  dispose(): void
  /** Settles once it has its height (a diff's first file drawn). */
  ready?: Promise<unknown>
  fill?(on: boolean): void
}

/** Adds the walkthrough's stylesheet once per document. */
export function injectWalkthroughStyles(doc: Document) {
  if (doc.querySelector("style[data-knobs-ui-walkthrough]")) return
  const style = doc.createElement("style")
  style.dataset.knobsUiWalkthrough = ""
  style.textContent = aliased(walkthroughCss)
  doc.head.append(style)
}

// ——— the view: one set of observers per window for every slot ———

interface Watch {
  near(on: boolean): void
  far(): void
  seen(on: boolean): void
}
interface Watcher {
  near: IntersectionObserver
  far: IntersectionObserver
  seen: IntersectionObserver
  of: Map<Element, Watch>
}
const watchers = new WeakMap<Window, Watcher>()

function watch(el: HTMLElement, w: Watch): () => void {
  const win = el.ownerDocument.defaultView
  if (!win || typeof win.IntersectionObserver !== "function") {
    w.near(true)
    return () => {}
  }
  let o = watchers.get(win)
  if (!o) {
    const of = new Map<Element, Watch>()
    const io = (margin: string, f: (w: Watch, on: boolean) => void) =>
      new win.IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            const h = of.get(e.target)
            if (h) f(h, e.isIntersecting)
          }
        },
        { rootMargin: margin },
      )
    o = {
      of,
      near: io("120% 0px", (h, on) => h.near(on)),
      far: io("320% 0px", (h, on) => !on && h.far()),
      seen: io("0px", (h, on) => h.seen(on)),
    }
    watchers.set(win, o)
  }
  const ob = o
  ob.of.set(el, w)
  ob.near.observe(el)
  ob.far.observe(el)
  ob.seen.observe(el)
  return () => {
    ob.of.delete(el)
    ob.near.unobserve(el)
    ob.far.unobserve(el)
    ob.seen.unobserve(el)
  }
}

// ——— the kinds ———

const div = (doc: Document, cls: string) => {
  const n = doc.createElement("div")
  n.className = cls
  return n
}

const DEFAULT_ASPECT = 16 / 9

/** A video's or picture's width over height, from its metadata alone; undefined if it fails. */
function probeAspect(doc: Document, src: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const video = mediaKind(src) === "video"
    const el = doc.createElement(video ? "video" : "img")
    const done = (aspect?: number) => {
      clearTimeout(timer)
      if (el instanceof HTMLVideoElement) {
        el.removeAttribute("src")
        el.load()
      }
      resolve(aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : undefined)
    }
    const timer = setTimeout(() => done(), 4000)
    if (el instanceof HTMLVideoElement) {
      el.preload = "metadata"
      el.muted = true
      el.addEventListener("loadedmetadata", () => done(el.videoWidth / el.videoHeight), {
        once: true,
      })
    } else
      el.addEventListener("load", () => done(el.naturalWidth / el.naturalHeight), { once: true })
    el.addEventListener("error", () => done(), { once: true })
    el.src = src
  })
}

const failed = (host: HTMLElement, what: string) => {
  const note = div(host.ownerDocument, "knobs-wt-failed")
  note.textContent = `Couldn't load the ${what}`
  host.append(note)
}

/** Sides and modes come from the compare viewer itself; until then, plain data. */
const side = (s: WalkthroughSource, fallback: string) => ({
  src: s.src,
  label: s.label ?? fallback,
})

type OnEvent = MediaSlotOptions["onEvent"]

async function mountCompare(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "compare" }>,
  look: UiLook,
  alive: () => boolean,
  onEvent: OnEvent,
): Promise<Mounted> {
  const doc = host.ownerDocument
  const fit = div(doc, "knobs-wt-fit")
  if (m.strip) fit.dataset.strip = ""
  const { before, after } = m
  const known = parseAspect(m.aspect)
  fit.style.setProperty("--kw-aspect", String(known ?? DEFAULT_ASPECT))
  const width = host.getBoundingClientRect().width
  const mode = m.mode ?? (width && width < 560 ? "wipe" : "side")
  fit.toggleAttribute("data-overlay", mode !== "side")
  host.append(fit)
  const [aspect, lib] = await Promise.all([
    known ? Promise.resolve(known) : probeAspect(doc, after.src),
    import("./compare.js"),
  ])
  if (!alive()) return { dispose: () => fit.remove() }
  if (aspect) fit.style.setProperty("--kw-aspect", String(aspect))
  let lastZoom = "all"
  let lastLoop = "off"
  const c = lib.compare(fit, {
    ...look,
    before: side(before, "Before"),
    after: side(after, "After"),
    mode,
    timeline: true,
    lazy: false,
    ...(aspect ? { aspect } : {}),
    ...(m.strip ? { strip: true } : {}),
    onMode: (next) => {
      fit.toggleAttribute("data-overlay", next !== "side")
      onEvent?.({ what: "mode", detail: next })
    },
    // A zoom or loop that changed goes in the log, in words.
    onView: (view) => {
      const z = view.zoom
      const zoomKey = zoomedIn(z) ? zoomWords(z) : "all"
      if (zoomKey !== lastZoom) onEvent?.({ what: "zoom", detail: (lastZoom = zoomKey) })
      const l = view.loop
      const loopKey = l ? `${formatTime(l.start)}–${formatTime(l.end)}` : "off"
      if (loopKey !== lastLoop) onEvent?.({ what: "loop", detail: (lastLoop = loopKey) })
    },
  })
  const chapters = m.chapters?.length ? m.chapters : null
  if (chapters)
    c.timeline?.update({
      markers: chapters.map((ch) => ({ id: ch.id, time: ch.start, label: ch.label })),
    })
  const pills: ChapterPills | null = chapters
    ? chapterPills(host, chapters, {
        now: () => c.time,
        seek: (t) => {
          c.seek(t)
          c.play()
        },
        onEvent,
      })
    : null
  const unlisten = c.timeline?.listen({
    onSeek: (time, source) => {
      pills?.sync()
      if (source !== "play") onEvent?.({ what: "seek", time: round(time) })
    },
    onPlay: (on) => onEvent?.({ what: on ? "play" : "pause", time: round(c.time) }),
  })
  // Its height follows a change of mode on a spring, from here on, not into place on load.
  requestAnimationFrame(() => requestAnimationFrame(() => (fit.dataset.settled = "")))
  return {
    pause: () => c.pause(),
    seekBy: (d) => c.seekBy(d),
    unzoom: () => {
      if (!zoomedIn(c.zoom)) return false
      c.setZoom(null)
      return true
    },
    context: () => {
      const loop = c.loop
      const zoom = zoomedIn(c.zoom) ? c.zoom : null
      return {
        kind: "compare",
        time: round(c.time),
        duration: round(c.duration),
        playing: c.playing,
        mode: c.mode,
        ...(pills?.current ? { chapter: pills.current.label } : {}),
        ...(loop ? { loop: { start: round(loop.start), end: round(loop.end) } } : {}),
        ...(zoom
          ? { zoom: { u: round(zoom.u), v: round(zoom.v), w: round(zoom.w), h: round(zoom.h) } }
          : {}),
      }
    },
    dispose: () => {
      unlisten?.()
      pills?.dispose()
      c.dispose()
      fit.remove()
    },
  }
}

const round = (v: number) => Math.round(v * 100) / 100
const zoomedIn = (z: { w: number; h: number }) => z.w < 0.999 || z.h < 0.999

function mountVideo(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "video" }>,
  onEvent: OnEvent,
): Mounted {
  const doc = host.ownerDocument
  const frame = div(doc, "knobs-wt-frame")
  const aspect = parseAspect(m.aspect)
  if (aspect) frame.style.setProperty("--kw-aspect", String(aspect))
  const v = doc.createElement("video")
  v.controls = true
  v.loop = true
  v.muted = true
  v.playsInline = true
  v.preload = "metadata"
  if (m.poster) v.poster = m.poster
  if (!aspect)
    v.addEventListener(
      "loadedmetadata",
      () =>
        v.videoWidth &&
        frame.style.setProperty("--kw-aspect", String(v.videoWidth / v.videoHeight)),
      { once: true },
    )
  if (m.captions) {
    const track = doc.createElement("track")
    track.kind = "captions"
    track.label = "Captions"
    track.srclang = doc.documentElement.lang || "en"
    track.default = true
    track.src = m.captions
    v.append(track)
  }
  v.src = m.src
  v.addEventListener("play", () => onEvent?.({ what: "play", time: round(v.currentTime) }))
  v.addEventListener("pause", () => onEvent?.({ what: "pause", time: round(v.currentTime) }))
  v.addEventListener("seeked", () => {
    if (v.paused) onEvent?.({ what: "seek", time: round(v.currentTime) })
  })
  frame.append(v)
  host.append(frame)
  const pills: ChapterPills | null = m.chapters?.length
    ? chapterPills(host, m.chapters, {
        now: () => v.currentTime,
        seek: (t) => {
          v.currentTime = t
          void v.play().catch(() => {})
        },
        onEvent,
      })
    : null
  const sync = () => pills?.sync()
  if (pills) for (const type of ["timeupdate", "seeking", "seeked"]) v.addEventListener(type, sync)
  return {
    pause: () => v.pause(),
    seekBy: (d) => {
      v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d))
    },
    context: () => ({
      kind: "video",
      time: round(v.currentTime),
      ...(Number.isFinite(v.duration) ? { duration: round(v.duration) } : {}),
      playing: !v.paused,
      ...(pills?.current ? { chapter: pills.current.label } : {}),
    }),
    dispose: () => {
      pills?.dispose()
      v.pause()
      v.removeAttribute("src")
      v.load()
      frame.remove()
    },
  }
}

function mountImage(host: HTMLElement, m: Extract<WalkMedia, { kind: "image" }>): Mounted {
  const doc = host.ownerDocument
  const frame = div(doc, "knobs-wt-frame")
  frame.dataset.natural = ""
  const img = doc.createElement("img")
  img.loading = "lazy"
  img.decoding = "async"
  img.alt = m.alt ?? m.label ?? ""
  img.src = m.src
  frame.append(img)
  host.append(frame)
  return { dispose: () => frame.remove() }
}

async function mountDiff(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "diff" }>,
  look: UiLook,
  alive: () => boolean,
  onEvent: OnEvent,
): Promise<Mounted> {
  const lib = await import("./diff.js")
  if (!alive()) return { dispose() {} }
  const input = {
    ...look,
    ...(m.patch !== undefined ? { patch: m.patch } : {}),
    ...(m.files ? { files: m.files } : {}),
    ...(m.file ? { file: m.file } : {}),
    ...(m.layout ? { layout: m.layout } : {}),
    onFile: (name: string) => onEvent?.({ what: "file", detail: name }),
  }
  if (m.review) {
    const box = div(host.ownerDocument, "knobs-wt-review")
    box.style.height = `${m.height ?? 480}px`
    host.append(box)
    const r = lib.diffReview(box, input)
    return {
      ready: r.diff.ready,
      context: () => ({ kind: "diff", ...(r.diff.file ? { file: r.diff.file } : {}) }),
      fill: (on) => {
        box.style.height = on ? "100%" : `${m.height ?? 480}px`
      },
      dispose: () => {
        r.dispose()
        box.remove()
      },
    }
  }
  const d = lib.codeDiff(host, { ...input, height: "auto", maxHeight: m.height ?? 640 })
  return {
    ready: d.ready,
    context: () => ({ kind: "diff", ...(d.file ? { file: d.file } : {}) }),
    fill: (on) => d.update({ height: on ? "fill" : "auto" }),
    dispose: () => d.dispose(),
  }
}

function mountCode(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "code" | "terminal" }>,
): Mounted {
  const doc = host.ownerDocument
  const pre = doc.createElement("pre")
  pre.className = "knobs-wt-code"
  if (m.lang) pre.dataset.lang = m.lang
  if (m.kind === "terminal") {
    pre.dataset.terminal = ""
    m.code.split("\n").forEach((line, i) => {
      if (i) pre.append("\n")
      const cmd = /^(\$|>|❯|%)\s(.*)$/.exec(line)
      if (cmd) {
        const p = doc.createElement("span")
        p.className = "knobs-wt-prompt"
        p.textContent = `${cmd[1]} `
        const c = doc.createElement("span")
        c.className = "knobs-wt-cmd"
        c.textContent = cmd[2]!
        pre.append(p, c)
      } else {
        const o = doc.createElement("span")
        o.className = "knobs-wt-out"
        o.textContent = line
        pre.append(o)
      }
    })
  } else pre.textContent = m.code
  host.append(pre)
  return { dispose: () => pre.remove() }
}

const num = (v: number | string | undefined) =>
  typeof v === "number" ? v : v === undefined ? NaN : Number(String(v).replace(/[,_\s]/g, ""))
const fmt = (v: number | string, unit = "") => `${v}${unit}`

function mountMetric(host: HTMLElement, m: Extract<WalkMedia, { kind: "metric" }>): Mounted {
  const doc = host.ownerDocument
  const box = div(doc, "knobs-wt-metric")
  const label = div(doc, "knobs-wt-mlabel")
  label.textContent = m.label
  const value = div(doc, "knobs-wt-mvalue")
  const span = (cls: string, text: string) => {
    const s = doc.createElement("span")
    s.className = cls
    s.textContent = text
    return s
  }
  value.append(
    span("knobs-wt-mfrom", `${fmt(m.before, m.unit)} →`),
    span("knobs-wt-mto", fmt(m.after, m.unit)),
  )
  if (m.of !== undefined) value.append(span("knobs-wt-mof", `of ${fmt(m.of, m.unit)}`))
  const a = num(m.before)
  const b = num(m.after)
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    const d = Math.round((b - a) * 1000) / 1000
    const delta = span("knobs-wt-mdelta", `${d > 0 ? "+" : "−"}${Math.abs(d)}${m.unit ?? ""}`)
    const better = m.better ?? "up"
    delta.dataset.tone = d > 0 === (better === "up") ? "good" : "bad"
    value.append(delta)
  }
  box.append(label, value)
  const total = num(m.of)
  if (Number.isFinite(total) && total > 0 && Number.isFinite(a) && Number.isFinite(b)) {
    const track = div(doc, "knobs-wt-mtrack")
    const bar = (cls: string, v: number) => {
      const s = span(cls, "")
      s.style.width = `${Math.max(0, Math.min(1, v / total)) * 100}%`
      return s
    }
    // The larger one goes under, so both show.
    const pair = [bar("knobs-wt-mbefore", a), bar("knobs-wt-mafter", b)]
    track.append(...(b >= a ? pair.reverse() : pair))
    box.append(track)
  }
  host.append(box)
  return { dispose: () => box.remove() }
}

function mountProse(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "callout" | "text" }>,
): Mounted {
  const el = div(host.ownerDocument, m.kind === "callout" ? "knobs-wt-callout" : "knobs-wt-text")
  if (m.kind === "callout" && m.tone) el.dataset.tone = m.tone
  const body = host.ownerDocument.createElement("div")
  body.innerHTML = inlineMarkdown(m.text)
  el.append(body)
  host.append(el)
  return { dispose: () => el.remove() }
}

/** Which kinds wait for the view, and which let go far from it. */
const HEAVY = new Set(["compare", "video", "diff", "mount"])
const RELEASES = new Set(["compare", "video"])

const labelOf = (m: WalkMedia) => ("label" in m && m.kind !== "metric" ? m.label : undefined)

export function mediaSlot(container: HTMLElement, options: MediaSlotOptions): MediaSlot {
  const doc = container.ownerDocument
  injectWalkthroughStyles(doc)
  const look: UiLook = {
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
  }
  const m = fillMedia(options.media)
  const root = div(doc, "knobs-wt-slot")
  root.dataset.kind = m.kind
  applyLook(root, options)
  const label = labelOf(m)
  if (
    label &&
    (m.kind === "video" || m.kind === "image" || m.kind === "code" || m.kind === "terminal")
  ) {
    const l = doc.createElement("span")
    l.className = "knobs-wt-slot-label"
    l.textContent = label
    root.append(l)
  }
  const host = div(doc, "knobs-wt-body")
  root.append(host)
  container.append(root)

  let mounted: Mounted | null = null
  let filled = false
  let pending = false
  let disposed = false
  let generation = 0

  const hold = (px: number | null) => {
    host.style.minHeight = px === null ? "" : `${px}px`
    host.classList.toggle("knobs-wt-hold", px !== null)
  }
  if (m.kind === "mount" && m.height) hold(m.height)
  else if (m.kind === "diff") hold(m.review ? (m.height ?? 480) : 160)

  const mount = () => {
    if (mounted || pending || disposed) return
    const gen = ++generation
    const alive = () => !disposed && gen === generation
    pending = true
    const done = (r: Mounted) => {
      pending = false
      if (!alive()) return r.dispose()
      mounted = r
      if (filled) r.fill?.(true)
      if (r.ready)
        r.ready.then(
          () => alive() && hold(null),
          () => alive() && hold(null),
        )
      else hold(null)
    }
    const fail = (what: string) => (err: unknown) => {
      pending = false
      if (!alive()) return
      hold(null)
      failed(host, what)
      console.warn(`knobs walkthrough: ${what}`, err)
    }
    switch (m.kind) {
      case "compare":
        return void mountCompare(host, m, look, alive, options.onEvent).then(
          done,
          fail("comparison"),
        )
      case "diff":
        return void mountDiff(host, m, look, alive, options.onEvent).then(done, fail("diff"))
      case "video":
        return done(mountVideo(host, m, options.onEvent))
      case "image":
        return done(mountImage(host, m))
      case "code":
      case "terminal":
        return done(mountCode(host, m))
      case "metric":
        return done(mountMetric(host, m))
      case "callout":
      case "text":
        return done(mountProse(host, m))
      case "history":
        return done(mountHistory(host, m, options.steps))
      case "stack":
        return done(mountStack(host, m, options.steps))
      case "table":
        return done(mountTable(host, m, options.steps))
      case "mount": {
        const cleanup = m.mount(host)
        return done({ dispose: () => (cleanup ? cleanup() : (host.textContent = "")) })
      }
    }
  }
  const release = () => {
    if (!mounted || !RELEASES.has(m.kind)) return
    hold(host.getBoundingClientRect().height)
    generation++
    mounted.dispose()
    mounted = null
  }

  const lazy = options.lazy !== false && HEAVY.has(m.kind)
  const unwatch = lazy
    ? watch(root, {
        near: (on) => on && mount(),
        far: release,
        seen: (on) => !on && mounted?.pause?.(),
      })
    : (mount(), () => {})

  return {
    element: root,
    get mounted() {
      return mounted !== null
    },
    pause: () => mounted?.pause?.(),
    unzoom: () => mounted?.unzoom?.() ?? false,
    seekBy(seconds) {
      if (!mounted?.seekBy) return false
      mounted.seekBy(seconds)
      return true
    },
    context: () => mounted?.context?.() ?? (m.kind === "image" ? { kind: "image" } : null),
    fill(on) {
      if (on === filled) return
      filled = on
      mounted?.fill?.(on)
    },
    dispose() {
      if (disposed) return
      disposed = true
      unwatch()
      mounted?.dispose()
      mounted = null
      root.remove()
    },
  }
}

export const CHECK = icon("check", { small: true })
