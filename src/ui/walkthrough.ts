// walkthrough(container, { doc }): the page an agent makes to show Kit its work and ask for his
// taste. The document is plain data (JSON an agent can write): a head, a feed of the agent's
// updates and answers (newest first), sections (a PR or topic, its link and status), and steps,
// each a caption, media (before/after, video, diff, code, metrics…) and what it asks: a note, or a
// pick between options (a taste test).
//
// Kit answers from one note bar docked at the bottom: words, a voice note, or ink drawn over the
// step's media. Each note carries what he was looking at: the step in view, the video's time and
// loop, the diff's file, and a short log of what he did before it. Sending moves on to the next
// step, with a Back pill for a few seconds. Everything is kept per document id, counted in the
// contents rail, and handed back as data (`onFeedback`) or copied as Markdown or JSON.
//
// Keys, outside text fields: j / k or ↓ / ↑ the next or last step; ← / → move the step's video
// half a second (⇧ two); f full-window for the step (Esc leaves); n the note bar; 1–9 pick in a
// taste test (again clears it).
import { Spring, springMotion } from "../core/spring.js"
import { browserStorage, storageKey, type StoragePort } from "../core/storage.js"
import { hints } from "../panel/page-hints.js"
import { confirm } from "./confirm.js"
import {
  applyLook,
  frameLoop,
  isTypingTarget,
  reducedMotion,
  svg,
  tune,
  type UiLook,
} from "./look.js"
import { toast } from "./toast.js"
import { CHECK, injectWalkthroughStyles, mediaSlot, type MediaSlot } from "./walkthrough-media.js"
import {
  addNote,
  adjacentStep,
  ago,
  collectFeedback,
  type ContextEvent,
  describeMedia,
  digitChoice,
  EMPTY_STATE,
  feedbackMarkdown,
  fillMedia,
  formatTime,
  inkPath,
  inlineMarkdown,
  isAnswered,
  type MediaContext,
  normalizeWalkthrough,
  notesOn,
  pushContext,
  readState,
  recentContext,
  removeNote,
  setFeedback,
  statusLook,
  verdictTone,
  walkthroughProgress,
  type WalkNote,
  type WalkOption,
  type WalkPage,
  type WalkStep,
  type WalkthroughDoc,
  type WalkthroughFeedback,
  type WalkthroughOption,
  type WalkthroughState,
  type WalkVoice,
} from "./walkthrough-model.js"

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string) => {
  const n = doc.createElement(tag)
  if (cls) n.className = cls
  return n
}
const prose = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  cls: string,
  text: string,
) => {
  const n = el(doc, tag, cls)
  n.innerHTML = inlineMarkdown(text)
  return n
}
const lookOf = (o: UiLook): UiLook => ({
  ...(o.preset ? { preset: o.preset } : {}),
  ...(o.theme ? { theme: o.theme } : {}),
})
/** Two-edge snapping on a 1/64 px grid, so a stationary edge never jiggles. */
const grid = (v: number) => Math.round(v * 64) / 64

const ICON = {
  full: svg('<path d="M3 6.5V3h3.5M13 6.5V3H9.5M3 9.5V13h3.5M13 9.5V13H9.5"/>'),
  exit: svg('<path d="M6.5 3v3.5H3M9.5 3v3.5H13M6.5 13V9.5H3M9.5 13V9.5H13"/>'),
  pen: svg('<path d="M10.5 3.2 12.8 5.5 5.8 12.5 3 13l.5-2.8z"/><path d="M9.3 4.4l2.3 2.3"/>'),
  mic: svg(
    '<rect x="6" y="2.5" width="4" height="7" rx="2"/><path d="M3.8 8a4.2 4.2 0 0 0 8.4 0M8 12.2v1.8"/>',
  ),
  stop: svg(
    '<rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" stroke="none"/>',
  ),
  send: svg('<path d="M8 13V3.5M4 7.5 8 3.5l4 4"/>'),
  close: svg('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
}

// kit-motion: the page's own moves are springs given as a duration with no bounce: the contents'
// pill and the page scrolling to a step on .4 s, a step opening to the full window and back on
// .45 s. Reduced motion drops the travel (the scroll and the pill go at once; full-window fades).
const CALM = springMotion({ duration: 0.4, bounce: 0 })
const SMOOTH = springMotion({ duration: 0.45, bounce: 0 })
const BACK_MS = 4500

// ——— a taste test: options side by side, one picked ———

export interface TasteTestOptions extends UiLook {
  readonly options: readonly (WalkthroughOption | WalkOption)[]
  readonly picked?: string | null
  /** A click picked an option (or, on the picked one, cleared it). */
  readonly onPick?: (id: string | null) => void
  /** Mount each option's media when near the view (on by default). */
  readonly lazy?: boolean
}

export interface TasteTest {
  readonly element: HTMLElement
  readonly picked: string | null
  /** The options' media, in order (those with any). */
  readonly slots: readonly MediaSlot[]
  pick(id: string | null): void
  /** Pauses the options' videos. */
  pause(): void
  dispose(): void
}

/**
 * A vs B (or more): each option's letter, label and media side by side (stacking where it's
 * narrow). The picked one takes a check and a wash; the others step back.
 */
export function tasteTest(container: HTMLElement, options: TasteTestOptions): TasteTest {
  const doc = container.ownerDocument
  injectWalkthroughStyles(doc)
  const look = lookOf(options)
  const list: WalkOption[] = options.options.map((o, i) =>
    "letter" in o
      ? o
      : {
          id: o.id ?? String.fromCharCode(97 + i),
          label: o.label,
          letter: String.fromCharCode(65 + i),
          ...(o.caption ? { caption: o.caption } : {}),
          ...(o.media !== undefined ? { media: fillMedia(o.media) } : {}),
          suggested: o.suggested === true,
        },
  )
  let picked = options.picked ?? null
  const root = el(doc, "div", "knobs-wt-options")
  root.setAttribute("role", "radiogroup")
  root.setAttribute("aria-label", "Options")
  root.style.setProperty("--kw-n", String(Math.min(list.length, 3)))
  if (!container.closest(".knobs-ui")) applyLook(root, options)
  const slots: MediaSlot[] = []
  const tiles = list.map((o, i) => {
    const tile = el(doc, "div", "knobs-wt-option")
    const pick = el(doc, "button", "knobs-wt-pick")
    pick.type = "button"
    pick.setAttribute("role", "radio")
    if (i < 9) pick.setAttribute("aria-keyshortcuts", String(i + 1))
    const letter = el(doc, "span", "knobs-wt-letter")
    letter.textContent = o.letter
    const name = el(doc, "span", "knobs-wt-olabel")
    name.textContent = o.label
    pick.append(letter, name)
    if (o.suggested) {
      const s = el(doc, "span", "knobs-wt-suggested")
      s.textContent = "Suggested"
      pick.append(s)
    }
    if (i < 9) {
      const key = el(doc, "span", "knobs-wt-key")
      key.textContent = String(i + 1)
      pick.append(key)
    }
    const check = el(doc, "span", "knobs-wt-check")
    check.innerHTML = CHECK
    pick.append(check)
    pick.addEventListener("click", () => {
      const next = picked === o.id ? null : o.id
      api.pick(next)
      options.onPick?.(next)
    })
    tile.append(pick)
    if (o.media)
      slots.push(
        mediaSlot(tile, {
          ...look,
          media: o.media,
          ...(options.lazy === false ? { lazy: false } : {}),
        }),
      )
    if (o.caption) tile.append(prose(doc, "p", "knobs-wt-ocap", o.caption))
    root.append(tile)
    return { tile, pick }
  })
  const sync = () => {
    root.toggleAttribute("data-has-pick", picked !== null)
    tiles.forEach(({ tile, pick }, i) => {
      const on = list[i]!.id === picked
      tile.toggleAttribute("data-picked", on)
      pick.setAttribute("aria-checked", String(on))
    })
  }
  sync()
  container.append(root)
  const api: TasteTest = {
    element: root,
    get picked() {
      return picked
    },
    slots,
    pick(id) {
      picked = id
      sync()
    },
    pause: () => slots.forEach((s) => s.pause()),
    dispose() {
      slots.forEach((s) => s.dispose())
      root.remove()
    },
  }
  return api
}

// ——— the page ———

export interface WalkthroughOptions extends UiLook {
  readonly doc: WalkthroughDoc
  /** Where Kit's answers are kept (localStorage by default; `null` keeps none). */
  readonly storage?: StoragePort | null
  /** Every change to Kit's answers, as the agent reads them. */
  readonly onFeedback?: (feedback: WalkthroughFeedback) => void
  /** The page's keys (on by default). */
  readonly keys?: boolean
  /** The contents and progress rail (on by default). */
  readonly rail?: boolean
  /** Sending a note moves on to the next step (on by default). */
  readonly advance?: boolean
}

export interface Walkthrough {
  readonly element: HTMLElement
  /** The document, filled in. */
  readonly page: WalkPage
  readonly state: WalkthroughState
  readonly feedback: WalkthroughFeedback
  /** The step Kit is on (its key); null above the first. */
  readonly current: string | null
  /** The feedback as Markdown, for the agent. */
  markdown(): string
  /** Goes to a step (its key), the page gliding to it. */
  go(key: string): void
  /** The current step full-window (`true`), back in the page (`false`), or the other way. */
  full(on?: boolean): void
  /** Sends a note from the page's code, as the bar would: on the current step, with its context. */
  send(text: string): void
  /** A new draft of the document: answers carry over by step key. */
  set(doc: WalkthroughDoc): void
  /** Forgets every answer. */
  reset(): void
  dispose(): void
}

interface StepView {
  readonly step: WalkStep
  readonly card: HTMLElement
  readonly media: HTMLElement | null
  readonly notes: HTMLElement
  readonly toc: HTMLElement | null
  readonly glyph: HTMLElement | null
  readonly taste: TasteTest | null
  readonly slots: MediaSlot[]
}

interface Full {
  readonly v: StepView
  readonly hold: HTMLElement
  readonly p: Spring
}

/** The nearest ancestor that scrolls, else the document's scroller. */
function scrollerOf(el: HTMLElement): HTMLElement {
  const doc = el.ownerDocument
  const win = doc.defaultView!
  for (let n = el.parentElement; n && n !== doc.body; n = n.parentElement) {
    const o = win.getComputedStyle(n).overflowY
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n
  }
  return (doc.scrollingElement as HTMLElement) ?? doc.documentElement
}

export function walkthrough(container: HTMLElement, options: WalkthroughOptions): Walkthrough {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  injectWalkthroughStyles(doc)
  const look = lookOf(options)
  const storage = options.storage === undefined ? browserStorage() : options.storage
  const root = el(doc, "div", "knobs-walkthrough")
  applyLook(root, options)
  container.append(root)

  let page = normalizeWalkthrough(options.doc)
  const keyOf = () => storageKey(page.id, "walkthrough")
  const load = () => {
    try {
      return readState(storage?.getItem(keyOf()))
    } catch {
      return EMPTY_STATE
    }
  }
  let state = load()
  let views: StepView[] = []
  let current: string | null = null
  let log: ContextEvent[] = []
  let pinUntil = 0
  let emitTimer = 0
  let disposed = false
  let count: HTMLElement | null = null
  let fill: HTMLElement | null = null
  let tocEl: HTMLElement | null = null
  let mark: HTMLElement | null = null
  let full: Full | null = null

  const viewOf = (key: string | null) => views.find((v) => v.step.key === key)
  const feedback = () => collectFeedback(page, state)
  const markdown = () => feedbackMarkdown(feedback(), page.verdicts)
  const reduced = () => reducedMotion(win)
  const record = (e: Omit<ContextEvent, "at">) => {
    log = pushContext(log, { ...e, at: Date.now() })
  }

  const save = () => {
    try {
      storage?.setItem(keyOf(), JSON.stringify(state))
    } catch {}
  }
  const emit = (soon = false) => {
    win.clearTimeout(emitTimer)
    const run = () => {
      save()
      options.onFeedback?.(feedback())
    }
    if (soon) emitTimer = win.setTimeout(run, 400)
    else run()
  }

  // ——— motion: the contents' pill, the page's scroll, full-window, on one loop ———
  const pillY = new Spring(0, CALM.omega, CALM.zeta, 0.25)
  const pillH = new Spring(0, CALM.omega, CALM.zeta, 0.25)
  let pillPlaced = false
  const scroll = {
    spring: new Spring(0, CALM.omega, CALM.zeta, 0.5),
    to: null as StepView | null,
    el: null as HTMLElement | null,
  }
  const motion = frameLoop(win, (dt) => {
    let more = false
    if (mark) {
      pillY.step(dt)
      pillH.step(dt)
      mark.style.transform = `translateY(${grid(pillY.x)}px)`
      mark.style.height = `${grid(pillY.x + pillH.x) - grid(pillY.x)}px`
      more ||= !pillY.resting || !pillH.resting
    }
    if (scroll.to && scroll.el) {
      // Aimed afresh each frame, so cards above that settle their height don't throw it off.
      scroll.spring.set(scrollTarget(scroll.to, scroll.el))
      scroll.spring.step(dt)
      scroll.el.scrollTop = scroll.spring.x
      if (scroll.spring.resting) {
        scroll.to = null
        pinUntil = performance.now() + 120
      } else {
        pinUntil = performance.now() + 120
        more = true
      }
    }
    if (full) {
      full.p.step(dt)
      placeFull(full)
      if (full.p.resting) {
        if (full.p.target === 0) closeFull()
      } else more = true
    }
    return more
  })

  const scrollMargin = () =>
    (root.querySelector(".knobs-wt-layout")?.clientWidth ?? 1000) <= 880 ? 60 : 16
  const scrollTarget = (v: StepView, s: HTMLElement) => {
    const top = s === doc.scrollingElement ? 0 : s.getBoundingClientRect().top
    const max = s.scrollHeight - s.clientHeight
    return Math.max(
      0,
      Math.min(max, s.scrollTop + v.card.getBoundingClientRect().top - top - scrollMargin()),
    )
  }
  const stopScroll = () => {
    scroll.to = null
  }
  for (const type of ["wheel", "touchstart"] as const)
    win.addEventListener(type, stopScroll, { passive: true })

  const scrollToCard = (v: StepView) => {
    const s = scrollerOf(root)
    if (reduced()) {
      s.scrollTop = scrollTarget(v, s)
      pinUntil = performance.now() + 250
      return
    }
    if (!scroll.to) scroll.spring.snap(s.scrollTop)
    scroll.to = v
    scroll.el = s
    pinUntil = performance.now() + 120
    motion.wake()
  }

  // ——— progress and the contents ———
  const syncProgress = () => {
    const p = walkthroughProgress(page, state)
    if (count) count.innerHTML = `<span><b>${p.done}</b> of ${p.total} reviewed</span>`
    fill?.style.setProperty("--kw-done", String(p.total ? p.done / p.total : 0))
  }
  const syncGlyph = (v: StepView) => {
    if (!v.glyph) return
    const done = isAnswered(v.step, state)
    v.glyph.toggleAttribute("data-done", done)
    const verdict = state.steps[v.step.key]?.verdict
    v.glyph.dataset.tone =
      v.step.ask === "none"
        ? "none"
        : verdict
          ? verdictTone(
              verdict,
              page.verdicts.findIndex((x) => x.id === verdict),
            )
          : done
            ? "accent"
            : "dim"
  }
  const placeMark = () => {
    if (!mark || !tocEl) return
    const row = viewOf(current)?.toc
    if (!row) return void mark.removeAttribute("data-on")
    mark.dataset.on = ""
    if (!pillPlaced || reduced()) {
      pillY.snap(row.offsetTop)
      pillH.snap(row.offsetHeight)
      pillPlaced = true
    } else {
      pillY.set(row.offsetTop)
      pillH.set(row.offsetHeight)
    }
    motion.wake()
    // The row stays in the rail's view.
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < tocEl.scrollTop + 8) tocEl.scrollTop = Math.max(0, top - 24)
    else if (bottom > tocEl.scrollTop + tocEl.clientHeight - 8)
      tocEl.scrollTop = bottom - tocEl.clientHeight + 24
  }
  const setCurrent = (key: string | null) => {
    if (key === current) return
    viewOf(current)?.card.removeAttribute("data-current")
    viewOf(current)?.toc?.removeAttribute("aria-current")
    current = key
    const v = viewOf(key)
    v?.card.setAttribute("data-current", "")
    v?.toc?.setAttribute("aria-current", "step")
    if (key) record({ what: "step", step: key })
    placeMark()
    bar.sync()
  }
  /** The last card whose top has passed a line a third of the way down the view; none above. */
  const fromScroll = () => {
    if (disposed || full || performance.now() < pinUntil || !views.length) return
    const line = win.innerHeight * 0.34
    let pick: string | null = null
    for (const v of views) {
      if (v.card.getBoundingClientRect().top <= line) pick = v.step.key
      else break
    }
    setCurrent(pick)
  }
  let scrollRaf = 0
  const onScroll = () => {
    if (!scrollRaf)
      scrollRaf = win.requestAnimationFrame(() => {
        scrollRaf = 0
        fromScroll()
      })
  }
  win.addEventListener("scroll", onScroll, { passive: true, capture: true })
  win.addEventListener("resize", onScroll, { passive: true })

  const go = (key: string) => {
    const v = viewOf(key)
    if (!v) return
    if (full && full.v !== v) setFull(false)
    setCurrent(key)
    scrollToCard(v)
    v.card.focus({ preventScroll: true })
  }

  // ——— the step on show: its media, for keys and a note's context ———
  const slotsOf = (v: StepView | undefined) => (v ? [...v.slots, ...(v.taste?.slots ?? [])] : [])
  const mediaContext = (v: StepView | undefined): MediaContext | undefined => {
    const slots = slotsOf(v)
    const ctx =
      slots.map((s) => s.context()).find((c) => c && (c.time !== undefined || c.file)) ??
      slots.map((s) => s.context()).find(Boolean)
    if (!ctx) return undefined
    return full && full.v === v ? { ...ctx, full: true } : ctx
  }
  const seekBy = (d: number) => {
    for (const s of slotsOf(viewOf(current))) if (s.seekBy(d)) return true
    return false
  }

  // ——— full-window ———
  const scrim = el(doc, "div", "knobs-wt-scrim")
  scrim.addEventListener("click", () => setFull(false))
  const fullRect = () => ({ x: 12, y: 12, w: win.innerWidth - 24, h: win.innerHeight - 24 })
  const placeFull = (f: Full) => {
    const a = f.hold.getBoundingClientRect()
    const b = fullRect()
    const k = reduced() ? Math.round(f.p.target) : f.p.x
    // One progress drives every edge, so the card travels one straight path.
    const left = grid(a.left + (b.x - a.left) * k)
    const top = grid(a.top + (b.y - a.top) * k)
    const right = grid(a.right + (b.x + b.w - a.right) * k)
    const bottom = grid(a.bottom + (b.y + b.h - a.bottom) * k)
    const s = f.v.card.style
    s.left = `${left}px`
    s.top = `${top}px`
    s.width = `${right - left}px`
    s.height = `${bottom - top}px`
    scrim.style.opacity = String(reduced() ? f.p.x : k)
  }
  const closeFull = () => {
    if (!full) return
    const { v, hold } = full
    v.card.removeAttribute("data-full")
    for (const p of ["left", "top", "width", "height"] as const) v.card.style[p] = ""
    for (const slot of v.slots) slot.fill(false)
    hold.remove()
    scrim.removeAttribute("data-on")
    scrim.style.opacity = "0"
    full = null
    win.removeEventListener("resize", onFullResize)
    bar.sync()
  }
  const onFullResize = () => full && placeFull(full)
  const setFull = (on: boolean, v = viewOf(current)) => {
    if (on) {
      if (!v) return
      if (full && full.v !== v) {
        full.p.snap(0)
        closeFull()
      }
      if (!full) {
        const r = v.card.getBoundingClientRect()
        const hold = el(doc, "div", "knobs-wt-hold-card")
        hold.style.height = `${r.height}px`
        v.card.before(hold)
        v.card.dataset.full = ""
        for (const slot of v.slots) slot.fill(true)
        full = { v, hold, p: new Spring(0, SMOOTH.omega, SMOOTH.zeta, 1e-3) }
        scrim.dataset.on = ""
        placeFull(full)
        win.addEventListener("resize", onFullResize)
      }
      tune(full.p, reduced() ? springMotion({ duration: 0.2, bounce: 0 }) : SMOOTH)
      full.p.set(1)
      record({ what: "full", step: v.step.key, detail: "on" })
    } else {
      if (!full) return
      tune(full.p, reduced() ? springMotion({ duration: 0.16, bounce: 0 }) : SMOOTH)
      full.p.set(0)
      record({ what: "full", step: full.v.step.key, detail: "off" })
    }
    motion.wake()
    bar.sync()
  }

  // ——— ink over the step's media ———
  const ink = {
    on: false,
    step: null as string | null,
    paths: [] as string[],
    aspect: 1,
    layer: null as SVGSVGElement | null,
  }
  const SVG = "http://www.w3.org/2000/svg"
  const clearInk = () => {
    ink.layer?.remove()
    ink.layer = null
    ink.paths = []
    ink.step = null
    ink.on = false
    root.removeAttribute("data-inking")
  }
  const setInk = (on: boolean) => {
    if (!on) {
      ink.on = false
      ink.layer?.removeAttribute("data-on")
      root.removeAttribute("data-inking")
      bar.sync()
      return
    }
    const v = viewOf(current)
    if (!v?.media) {
      toast("Nothing to draw on in this step", { look, doc })
      return
    }
    if (ink.step && ink.step !== v.step.key) clearInk()
    if (!ink.layer) {
      const layer = doc.createElementNS(SVG, "svg")
      layer.classList.add("knobs-wt-ink")
      layer.setAttribute("viewBox", "0 0 1 1")
      layer.setAttribute("preserveAspectRatio", "none")
      v.media.append(layer)
      ink.layer = layer
      ink.step = v.step.key
      let points: { x: number; y: number }[] = []
      let live: SVGPathElement | null = null
      let box = { left: 0, top: 0, width: 1, height: 1 }
      layer.addEventListener("pointerdown", (e) => {
        if (!ink.on || e.button !== 0) return
        e.preventDefault()
        layer.setPointerCapture(e.pointerId)
        const r = layer.getBoundingClientRect()
        box = { left: r.left, top: r.top, width: r.width, height: r.height }
        ink.aspect = r.width / Math.max(1, r.height)
        points = [{ x: e.clientX - box.left, y: e.clientY - box.top }]
        live = doc.createElementNS(SVG, "path")
        layer.append(live)
      })
      layer.addEventListener("pointermove", (e) => {
        if (!live) return
        points.push({ x: e.clientX - box.left, y: e.clientY - box.top })
        live.setAttribute("d", inkPath(points, box.width, box.height))
      })
      const end = () => {
        if (!live) return
        const d = inkPath(points, box.width, box.height)
        if (d.includes("L")) ink.paths.push(d)
        else live.remove()
        live = null
        record({ what: "ink", step: ink.step ?? undefined, detail: `${ink.paths.length} strokes` })
        bar.sync()
      }
      layer.addEventListener("pointerup", end)
      layer.addEventListener("pointercancel", end)
    }
    ink.on = true
    ink.layer.dataset.on = ""
    root.dataset.inking = ""
    bar.sync()
  }

  // ——— voice ———
  const voice = {
    recorder: null as MediaRecorder | null,
    started: 0,
    pending: null as WalkVoice | null,
    timer: 0,
  }
  const toggleVoice = async () => {
    if (voice.recorder) return voice.recorder.stop()
    const media = win.navigator.mediaDevices
    if (!media?.getUserMedia || typeof win.MediaRecorder !== "function") {
      toast("Voice notes need a microphone and MediaRecorder", { tone: "warn", look, doc })
      return
    }
    try {
      const stream = await media.getUserMedia({ audio: true })
      const rec = new win.MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.addEventListener("dataavailable", (e) => e.data.size && chunks.push(e.data))
      rec.addEventListener("stop", () => {
        for (const t of stream.getTracks()) t.stop()
        win.clearInterval(voice.timer)
        const duration = (performance.now() - voice.started) / 1000
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" })
        if (voice.pending) URL.revokeObjectURL(voice.pending.url)
        voice.pending = {
          url: URL.createObjectURL(blob),
          duration: Math.round(duration * 10) / 10,
          mime: blob.type,
        }
        voice.recorder = null
        bar.sync()
      })
      voice.recorder = rec
      voice.started = performance.now()
      rec.start()
      voice.timer = win.setInterval(() => bar.sync(), 250)
      bar.sync()
    } catch {
      toast("Couldn't reach the microphone", { tone: "warn", look, doc })
    }
  }

  // ——— the note bar ———
  const backPill = el(doc, "button", "knobs-wt-back")
  backPill.type = "button"
  let backTo: string | null = null
  let backTimer = 0
  backPill.addEventListener("click", () => {
    if (backTo) go(backTo)
    hideBack()
  })
  const hideBack = () => {
    win.clearTimeout(backTimer)
    backPill.removeAttribute("data-on")
    backTo = null
  }
  const showBack = (key: string) => {
    const v = viewOf(key)
    if (!v) return
    backTo = key
    backPill.textContent = `← Back to ${v.step.number}`
    backPill.dataset.on = ""
    win.clearTimeout(backTimer)
    backTimer = win.setTimeout(hideBack, BACK_MS)
  }

  const bar = (() => {
    const dock = el(doc, "div", "knobs-wt-dock")
    const box = el(doc, "div", "knobs-wt-notebar")
    const on = el(doc, "div", "knobs-wt-on")
    const row = el(doc, "div", "knobs-wt-row")
    const input = el(doc, "textarea", "knobs-wt-input")
    input.rows = 1
    input.setAttribute("aria-label", "Note")
    const attach = el(doc, "div", "knobs-wt-attach")
    const btn = (icon: string, label: string, run: () => void) => {
      const b = el(doc, "button", "knobs-wt-tool")
      b.type = "button"
      b.innerHTML = icon
      b.setAttribute("aria-label", label)
      b.title = label
      b.addEventListener("click", run)
      return b
    }
    const fullBtn = btn(ICON.full, "Full window · f", () => setFull(!full))
    const penBtn = btn(ICON.pen, "Draw on the media", () => setInk(!ink.on))
    const micBtn = btn(ICON.mic, "Record a voice note", () => void toggleVoice())
    const micTime = el(doc, "span", "knobs-wt-rec")
    micBtn.append(micTime)
    const sendBtn = btn(ICON.send, "Send · Enter", () => send())
    sendBtn.dataset.send = ""
    row.append(input, attach, fullBtn, penBtn, micBtn, sendBtn)
    box.append(on, row)
    dock.append(backPill, box)
    const fit = () => {
      input.style.height = "auto"
      input.style.height = `${Math.min(140, input.scrollHeight)}px`
    }
    input.addEventListener("input", () => {
      fit()
      sync()
    })
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault()
        send()
      } else if (e.key === "Escape") {
        e.preventDefault()
        input.blur()
        viewOf(current)?.card.focus({ preventScroll: true })
      }
    })
    const chip = (text: string, clear: () => void) => {
      const c = el(doc, "span", "knobs-wt-chip-a")
      c.append(text)
      const x = el(doc, "button", "knobs-wt-x")
      x.type = "button"
      x.innerHTML = ICON.close
      x.setAttribute("aria-label", `Remove ${text}`)
      x.addEventListener("click", clear)
      c.append(x)
      return c
    }
    let lastOn = ""
    let lastMic = ""
    const sync = () => {
      const v = viewOf(current)
      const ctx = describeMedia(mediaContext(v))
      const where = v ? `${v.step.number} ${v.step.title}` : "General note"
      const text = ctx ? `${where} · ${ctx}` : where
      if (text !== lastOn) {
        on.textContent = text
        lastOn = text
      }
      input.placeholder = v ? `Note on ${v.step.number}…  (n)` : "A note on the whole page…  (n)"
      // Rebuilt only when what's attached changes, so a chip under the pointer stays put.
      const attached = `${voice.pending?.url ?? ""}|${ink.paths.length}`
      if (attached !== lastAttached) {
        lastAttached = attached
        attach.textContent = ""
      } else return syncTools(v)
      if (voice.pending)
        attach.append(
          chip(`Voice ${formatTime(voice.pending.duration)}`, () => {
            URL.revokeObjectURL(voice.pending!.url)
            voice.pending = null
            sync()
          }),
        )
      if (ink.paths.length)
        attach.append(
          chip(`Ink · ${ink.paths.length}`, () => {
            clearInk()
            sync()
          }),
        )
      syncTools(v)
    }
    let lastAttached = "|0"
    const syncTools = (v: StepView | undefined) => {
      penBtn.setAttribute("aria-pressed", String(ink.on))
      micBtn.setAttribute("aria-pressed", String(Boolean(voice.recorder)))
      const mic = voice.recorder ? "stop" : "mic"
      if (mic !== lastMic) {
        lastMic = mic
        micBtn.innerHTML = voice.recorder ? ICON.stop : ICON.mic
        micBtn.append(micTime)
      }
      micTime.textContent = voice.recorder
        ? formatTime((performance.now() - voice.started) / 1000).replace(/\.\d$/, "")
        : ""
      fullBtn.innerHTML = full ? ICON.exit : ICON.full
      fullBtn.setAttribute("aria-pressed", String(Boolean(full)))
      fullBtn.hidden = !v?.media
      const ready = Boolean(input.value.trim() || voice.pending || ink.paths.length)
      sendBtn.toggleAttribute("data-ready", ready)
    }
    return {
      dock,
      input,
      sync,
      clear() {
        input.value = ""
        fit()
      },
    }
  })()
  // The bar's context line follows a playing video.
  const ticker = win.setInterval(() => !doc.hidden && bar.sync(), 500)

  const send = (text = bar.input.value) => {
    if (voice.recorder) return toast("Stop the recording first", { look, doc })
    const step = ink.paths.length && ink.step ? ink.step : current
    const v = viewOf(step)
    const now = Date.now()
    const note: WalkNote = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      step,
      at: now,
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(voice.pending ? { voice: voice.pending } : {}),
      ...(ink.paths.length
        ? { ink: { paths: [...ink.paths], aspect: Math.round(ink.aspect * 1000) / 1000 } }
        : {}),
      context: {
        step,
        ...(mediaContext(v) ? { media: mediaContext(v)! } : {}),
        log: recentContext(log, now),
      },
    }
    const next = addNote(state, note)
    if (next === state) return
    state = next
    voice.pending = null
    clearInk()
    bar.clear()
    if (v) {
      renderNote(v, note, true)
      syncGlyph(v)
    } else toast("Note sent", { look, doc })
    syncProgress()
    emit()
    bar.sync()
    // On to the next step, with a way back.
    if (v && options.advance !== false) {
      const to = adjacentStep(
        views.map((x) => x.step.key),
        v.step.key,
        1,
      )
      if (to && to !== v.step.key) {
        if (full) setFull(false)
        go(to)
        showBack(v.step.key)
        bar.input.focus({ preventScroll: true })
      }
    }
  }

  // ——— a step's sent notes ———
  const renderNote = (v: StepView, n: WalkNote, entering = false) => {
    const row = el(doc, "div", "knobs-wt-n")
    row.dataset.id = n.id
    const meta = el(doc, "span", "knobs-wt-n-meta")
    const m = n.context.media
    meta.textContent =
      m?.time !== undefined ? formatTime(m.time) : m?.file ? m.file.split("/").pop()! : "·"
    if (m?.time !== undefined) {
      meta.title = "Go to this moment"
      meta.dataset.seek = ""
      meta.addEventListener("click", () => {
        const now = mediaContext(v)?.time
        if (now !== undefined) for (const s of slotsOf(v)) if (s.seekBy(m.time! - now)) break
      })
    }
    row.append(meta)
    const body = el(doc, "div", "knobs-wt-n-body")
    if (n.text) body.append(prose(doc, "p", "knobs-wt-n-text", n.text))
    if (n.voice) {
      const a = el(doc, "audio", "knobs-wt-n-voice")
      a.controls = true
      a.preload = "none"
      a.src = n.voice.url
      body.append(a)
    }
    if (n.ink?.paths.length) {
      const thumb = doc.createElementNS(SVG, "svg")
      thumb.classList.add("knobs-wt-n-ink")
      thumb.setAttribute("viewBox", "0 0 1 1")
      thumb.setAttribute("preserveAspectRatio", "none")
      thumb.style.aspectRatio = String(n.ink.aspect)
      for (const d of n.ink.paths) {
        const p = doc.createElementNS(SVG, "path")
        p.setAttribute("d", d)
        thumb.append(p)
      }
      body.append(thumb)
    }
    row.append(body)
    const x = el(doc, "button", "knobs-wt-x")
    x.type = "button"
    x.innerHTML = ICON.close
    x.setAttribute("aria-label", "Delete this note")
    x.addEventListener("click", () => {
      state = removeNote(state, n.id)
      if (n.voice) URL.revokeObjectURL(n.voice.url)
      leave(row)
      syncGlyph(v)
      syncProgress()
      emit()
    })
    row.append(x)
    v.notes.append(row)
    if (entering) enter(row)
  }
  // kit-motion: a note row grows in place (no jump below it) and shrinks away when deleted.
  const enter = (row: HTMLElement) => {
    if (reduced()) return
    const h = row.offsetHeight
    row.style.height = "0px"
    row.dataset.entering = ""
    void row.offsetHeight
    row.style.height = `${h}px`
    delete row.dataset.entering
    row.addEventListener("transitionend", () => (row.style.height = ""), { once: true })
  }
  const leave = (row: HTMLElement) => {
    if (reduced()) return row.remove()
    row.style.height = `${row.offsetHeight}px`
    void row.offsetHeight
    row.dataset.leaving = ""
    row.style.height = "0px"
    const done = () => row.remove()
    row.addEventListener("transitionend", done, { once: true })
    win.setTimeout(done, 600)
  }

  // ——— building it ———
  const build = () => {
    for (const v of views) {
      v.slots.forEach((s) => s.dispose())
      v.taste?.dispose()
    }
    if (full) {
      full.p.snap(0)
      closeFull()
    }
    clearInk()
    views = []
    pillPlaced = false
    root.textContent = ""
    root.removeAttribute("data-settled")
    const layout = el(doc, "div", "knobs-wt-layout")
    const main = el(doc, "div", "knobs-wt-main")

    // The head.
    const head = el(doc, "header", "knobs-wt-head")
    const h1 = el(doc, "h1", "knobs-wt-title")
    h1.textContent = page.title
    head.append(h1)
    if (page.summary) head.append(prose(doc, "p", "knobs-wt-summary", page.summary))
    if (page.meta.length) {
      const meta = el(doc, "div", "knobs-wt-meta")
      for (const m of page.meta) {
        const s = el(doc, "span")
        s.append(m.label)
        const b = el(doc, "b")
        if (m.href) {
          const a = el(doc, "a")
          a.href = m.href
          a.target = "_blank"
          a.rel = "noreferrer"
          a.textContent = m.value
          b.append(a)
        } else b.textContent = m.value
        s.append(b)
        meta.append(s)
      }
      head.append(meta)
    }
    main.append(head)

    // The feed: the agent's updates and answers, newest first.
    if (page.feed.length) {
      const feed = el(doc, "section", "knobs-wt-feed")
      feed.setAttribute("aria-label", "Latest")
      const list = el(doc, "ol", "knobs-wt-feed-list knobs-scroll-fade")
      const now = Date.now()
      for (const f of page.feed) {
        const li = el(doc, "li", "knobs-wt-fi")
        li.dataset.kind = f.kind
        const when = el(doc, "span", "knobs-wt-fi-when")
        when.textContent = f.at === null ? "" : ago(f.at, now)
        if (f.at !== null) when.title = new Date(f.at).toLocaleString()
        const kind = el(doc, "span", "knobs-wt-fi-kind")
        kind.textContent = f.kind === "qa" ? "Answer" : "Update"
        const body = el(doc, "div", "knobs-wt-fi-body")
        if (f.q) body.append(prose(doc, "p", "knobs-wt-fi-q", f.q))
        body.append(prose(doc, "p", "knobs-wt-fi-text", f.text))
        li.append(when, kind, body)
        if (f.step) {
          const target = f.step
          const link = el(doc, "button", "knobs-wt-fi-step")
          link.type = "button"
          link.textContent = page.steps.find((s) => s.key === target)?.number ?? ""
          link.title = "Go to the step"
          link.addEventListener("click", () => go(target))
          li.append(link)
        }
        list.append(li)
      }
      feed.append(list)
      main.append(feed)
    }

    // The rail.
    let rail: HTMLElement | null = null
    count = fill = tocEl = mark = null
    if (options.rail !== false) {
      rail = el(doc, "aside", "knobs-wt-rail")
      rail.setAttribute("aria-label", "Progress")
      const progress = el(doc, "div", "knobs-wt-progress")
      count = el(doc, "div", "knobs-wt-count")
      const meter = el(doc, "div", "knobs-wt-bar")
      fill = el(doc, "div", "knobs-wt-fill")
      meter.append(fill)
      progress.append(count, meter)
      tocEl = el(doc, "nav", "knobs-wt-toc")
      tocEl.setAttribute("aria-label", "Contents")
      mark = el(doc, "div", "knobs-wt-toc-mark")
      tocEl.append(mark)
      rail.append(progress, tocEl, actions(true))
      if (options.keys !== false) {
        const keys = el(doc, "div", "knobs-wt-keys")
        keys.innerHTML =
          "<kbd>j</kbd> <kbd>k</kbd> steps · <kbd>←</kbd> <kbd>→</kbd> seek · <kbd>f</kbd> full · <kbd>n</kbd> note" +
          (page.steps.some((s) => s.ask === "pick") ? " · <kbd>1</kbd>–<kbd>9</kbd> pick" : "")
        rail.append(keys)
      }
    }

    // The sections and their steps.
    for (const section of page.sections) {
      const sec = el(doc, "section", "knobs-wt-section")
      sec.id = `wt-${section.id}`
      const sh = el(doc, "header", "knobs-wt-shead")
      if (section.link || section.status) {
        const kicker = el(doc, "div", "knobs-wt-kicker")
        if (section.link) {
          const a = el(doc, "a")
          a.href = section.link.href
          a.target = "_blank"
          a.rel = "noreferrer"
          a.textContent = `${section.link.label} ↗`
          kicker.append(a)
        }
        if (section.status) {
          const s = statusLook(section.status)
          const chip = el(doc, "span", "knobs-wt-chip")
          chip.dataset.tone = s.tone
          chip.textContent = s.label
          kicker.append(chip)
        }
        sh.append(kicker)
      }
      const h2 = el(doc, "h2", "knobs-wt-stitle")
      h2.textContent = section.title
      sh.append(h2)
      if (section.summary) sh.append(prose(doc, "p", "knobs-wt-ssum", section.summary))
      sec.append(sh)
      if (tocEl) {
        const t = el(doc, "div", "knobs-wt-toc-section")
        t.textContent = section.link ? `${section.link.label} ${section.title}` : section.title
        t.title = section.title
        tocEl.append(t)
      }
      for (const step of section.steps) {
        const v = stepView(step)
        sec.append(v.card)
        views.push(v)
      }
      main.append(sec)
    }
    main.append(bar.dock)

    if (rail) layout.append(rail)
    layout.append(main)
    root.append(layout, scrim)
    for (const v of views) {
      syncGlyph(v)
      for (const n of notesOn(state, v.step.key)) renderNote(v, n)
    }
    syncProgress()
    current = null
    fromScroll()
    placeMark()
    bar.sync()
    // Transitions start once the first frame is drawn: nothing moves on load.
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        if (!disposed && !reduced()) root.dataset.settled = ""
      }),
    )
  }

  const actions = (rail: boolean) => {
    const row = el(doc, "div", "knobs-wt-actions")
    const btn = (text: string, run: () => void, primary = false) => {
      const b = el(doc, "button", "knobs-wt-btn")
      b.type = "button"
      b.textContent = text
      if (primary) b.dataset.primary = ""
      b.addEventListener("click", run)
      row.append(b)
      return b
    }
    btn("Copy feedback", () => copy("markdown"), true)
    btn("JSON", () => copy("json"))
    if (rail)
      btn("Reset", async () => {
        const ok = await confirm({
          title: "Forget every answer on this page?",
          confirm: "Reset",
          destructive: true,
          look,
          doc,
        })
        if (ok) api.reset()
      })
    return row
  }
  const copy = async (format: "markdown" | "json") => {
    const text = format === "json" ? JSON.stringify(feedback(), null, 2) : markdown()
    try {
      await win.navigator.clipboard.writeText(text)
      toast(format === "json" ? "Feedback copied as JSON" : "Feedback copied as Markdown", {
        look,
        doc,
      })
    } catch {
      toast("Couldn't reach the clipboard", { tone: "warn", look, doc })
    }
  }

  const stepView = (step: WalkStep): StepView => {
    const card = el(doc, "article", "knobs-wt-step knobs-surface")
    card.id = `wt-${step.key.replace("/", "--")}`
    card.tabIndex = -1
    card.dataset.key = step.key
    card.setAttribute("aria-label", `${step.number} ${step.title}`)
    const head = el(doc, "header", "knobs-wt-step-head")
    const num = el(doc, "span", "knobs-wt-num")
    num.textContent = step.number
    const h3 = el(doc, "h3", "knobs-wt-stepTitle")
    h3.textContent = step.title
    head.append(num, h3)
    card.append(head)
    if (step.caption) card.append(prose(doc, "p", "knobs-wt-caption", step.caption))
    const slots: MediaSlot[] = []
    const onEvent = (e: Omit<ContextEvent, "at" | "step">) => record({ ...e, step: step.key })
    let media: HTMLElement | null = null
    if (step.media.length) {
      media = el(doc, "div", "knobs-wt-media")
      media.style.setProperty("--kw-n", String(Math.min(step.media.length, 3)))
      for (const m of step.media) slots.push(mediaSlot(media, { ...look, media: m, onEvent }))
      card.append(media)
    }
    let taste: TasteTest | null = null
    if (step.question) card.append(prose(doc, "p", "knobs-wt-question", step.question))
    if (step.ask === "pick") {
      taste = tasteTest(card, {
        ...look,
        options: step.options,
        picked: state.steps[step.key]?.pick ?? null,
        onPick: (id) => pick(step.key, id),
      })
      media ??= taste.element
    }
    const notes = el(doc, "div", "knobs-wt-notes")
    card.append(notes)
    card.addEventListener("focusin", () => {
      if (scroll.to) return
      pinUntil = performance.now() + 250
      setCurrent(step.key)
    })
    let toc: HTMLElement | null = null
    let glyph: HTMLElement | null = null
    if (tocEl) {
      toc = el(doc, "button", "knobs-wt-toc-step")
      ;(toc as HTMLButtonElement).type = "button"
      glyph = el(doc, "span", "knobs-wt-toc-glyph")
      const label = el(doc, "span", "knobs-wt-toc-label")
      label.textContent = step.title
      toc.title = `${step.number} ${step.title}`
      toc.append(glyph, label)
      toc.addEventListener("click", () => go(step.key))
      tocEl.append(toc)
    }
    return { step, card, media, notes, toc, glyph, taste, slots }
  }

  const pick = (key: string, id: string | null) => {
    state = setFeedback(state, key, { pick: id })
    const v = viewOf(key)
    if (v) {
      v.taste?.pick(id)
      syncGlyph(v)
    }
    record({ what: "pick", step: key, detail: id ?? "cleared" })
    syncProgress()
    emit()
  }

  // ——— keys ———
  // Heard as they bubble: a focused piece's own keys (a compare's ←/→, digits, or Escape while
  // zoomed) claim them first, and the page takes the rest.
  const LEAVE = "[role=tree],[role=listbox],[role=grid],[role=slider],[role=menu],.knobs-timeline"
  const onKey = (e: KeyboardEvent) => {
    if (disposed || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    if (isTypingTarget(e.target)) return
    const target = e.target instanceof Element ? e.target : null
    if (target && target !== doc.body && target !== doc.documentElement && !root.contains(target))
      return
    const own = target?.closest(LEAVE)
    const claim = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (key === "Escape") {
      if (ink.on) return claim(), setInk(false)
      // A zoomed compare goes back to the whole picture before the step leaves full-window.
      if (slotsOf(viewOf(current)).some((s) => s.unzoom())) return claim()
      if (full) return claim(), setFull(false)
      return
    }
    if (key === "f" && !e.shiftKey) {
      if (!viewOf(current)?.media) return
      claim()
      return setFull(!full)
    }
    if (own) return
    if (key === "j" || key === "k" || key === "ArrowDown" || key === "ArrowUp") {
      if (e.shiftKey && key.startsWith("Arrow")) return
      const dir = key === "j" || key === "ArrowDown" ? 1 : -1
      const next = adjacentStep(
        views.map((v) => v.step.key),
        current,
        dir,
      )
      if (!next) return
      claim()
      if (full) setFull(false)
      return go(next)
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const d = (key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 2 : 0.5)
      if (seekBy(d)) claim()
      return
    }
    if (key === "n") {
      claim()
      bar.input.focus({ preventScroll: true })
      return
    }
    const v = viewOf(current)
    if (!v || e.shiftKey) return
    const choice = digitChoice(v.step, state.steps[v.step.key], key)
    if (choice === undefined) return
    claim()
    pick(v.step.key, choice)
  }
  if (options.keys !== false) doc.addEventListener("keydown", onKey)

  // The current step's picks, the bar and the rail's buttons join the page's hint mode (s).
  const unregisterHints = hints.register(
    root,
    () => {
      const v = viewOf(current)
      return [
        ...(v ? v.card.querySelectorAll<HTMLElement>(".knobs-wt-pick") : []),
        ...root.querySelectorAll<HTMLElement>(
          ".knobs-wt-tool:not([hidden]),.knobs-wt-rail .knobs-wt-btn",
        ),
      ]
    },
    { listen: false, rank: 1 },
  )

  build()

  const api: Walkthrough = {
    element: root,
    get page() {
      return page
    },
    get state() {
      return state
    },
    get feedback() {
      return feedback()
    },
    get current() {
      return current
    },
    markdown,
    go: (key) => go(key),
    full: (on) => setFull(on ?? !full),
    send: (text) => send(text),
    set(next) {
      const keep = current
      const sameId = next.id === page.id
      page = normalizeWalkthrough(next)
      if (!sameId) state = load()
      build()
      if (keep && viewOf(keep)) go(keep)
    },
    reset() {
      state = EMPTY_STATE
      for (const v of views) {
        v.taste?.pick(null)
        v.notes.textContent = ""
        syncGlyph(v)
      }
      syncProgress()
      emit()
    },
    dispose() {
      if (disposed) return
      disposed = true
      win.clearTimeout(emitTimer)
      win.clearTimeout(backTimer)
      win.clearInterval(ticker)
      win.clearInterval(voice.timer)
      voice.recorder?.stop()
      motion.stop()
      if (scrollRaf) win.cancelAnimationFrame(scrollRaf)
      win.removeEventListener("scroll", onScroll, { capture: true })
      win.removeEventListener("resize", onScroll)
      win.removeEventListener("resize", onFullResize)
      for (const type of ["wheel", "touchstart"] as const) win.removeEventListener(type, stopScroll)
      doc.removeEventListener("keydown", onKey)
      unregisterHints()
      for (const v of views) {
        v.slots.forEach((s) => s.dispose())
        v.taste?.dispose()
      }
      root.remove()
    },
  }
  return api
}
