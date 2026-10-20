// A history that reads at a glance: a shared date axis (month ticks, today's line) over lanes, one
// per channel or track, each carrying spans whose tone says their state ("v1 works", "v2 broken")
// and marks for releases and deletions (commits and the rest appear while the pointer is on their
// lane, or behind "Show commits"). Inferred spans are hatched and inferred marks hollow, with a
// legend only when there's both. Everything else waits for the pointer or the keys: hovering shows a date line and a
// small tooltip, a click (or ←/→ through the events) opens the one detail area under the chart,
// whose height springs as its content fades in place. It draws no card of its own.
// kit-motion: nothing moves on load; the selection and the pointer's line go where the hand
// puts them, at once; the detail's height takes the state spring (.3 s, no bounce), from where it
// is, so a change mid-flight carries on; reduced motion drops the travel and keeps short fades.
import { reducedMotion, SPRINGS } from "../core/motion.js"
import { aliased } from "../core/glide.js"
import { Spring, springMotion } from "../core/spring.js"
import { historyCss } from "./history-css.js"
import {
  bandRoom,
  clipSpan,
  dayScale,
  DEFAULT_MARKS,
  firstSentence,
  fitLabels,
  fitTag,
  formatDay,
  formatDays,
  formatRange,
  monthTicks,
  nearestEvent,
  normalizeHistory,
  quietEvents,
  quietLabel,
  stepEvent,
  type HistoryData,
  type HistoryModel,
  type HyItem,
} from "./history-model.js"
import { applyLook, frameLoop, svg, type UiLook } from "./look.js"
import { inlineMarkdown } from "./walkthrough-model.js"

export type {
  HistoryBand,
  HistoryData,
  HistoryEvent,
  HistoryEvidence,
  HistoryGroup,
  HistoryLane,
  HistoryProvenance,
  HistorySpan,
  HistoryState,
  HistoryTone,
} from "./history-model.js"

export interface HistoryOptions extends UiLook {
  /** Lanes of spans and events (or the walkthrough's `groups` of events): plain JSON. */
  readonly data: HistoryData
  /** The selected event or span's id. */
  readonly selected?: string | null
  /** Clicks and keys moved the selection (a host's `select()` doesn't call it). */
  readonly onSelect?: (id: string | null) => void
  /** Draws "Go to step" in the detail of anything with a `step`, and Enter on it. */
  readonly onJump?: (step: string) => void
  /** Its accessible name. */
  readonly label?: string
  /** Under this width (px) lane labels sit above their lanes instead of beside them (560). */
  readonly narrow?: number
  /**
   * The event types marked from the start (releases and deletions, or `"all"`); the rest show
   * while the pointer is on their lane, and all of them behind a "Show commits" toggle.
   */
  readonly marks?: readonly string[] | "all"
}

export interface History {
  readonly element: HTMLElement
  /** The data filled in: whole days, lanes, the axis and the order ←/→ walk. */
  readonly model: HistoryModel
  readonly selected: string | null
  /** Selects an event or span (`null` clears); doesn't call `onSelect`. */
  select(id: string | null): void
  set(data: HistoryData): void
  focus(): void
  dispose(): void
  /** The same as `dispose`. */
  destroy(): void
}

const HEIGHT = springMotion(SPRINGS.default)
const GO = svg('<path d="M5 5h6v6M11 5l-6 6"/>')
const TYPE_NAMES: Record<string, string> = {
  commit: "Commit",
  release: "Release",
  deletion: "Deletion",
  channel: "Channel switch",
  audit: "Finding",
}
const typeName = (t: string) => TYPE_NAMES[t] ?? t.charAt(0).toUpperCase() + t.slice(1)
/** How far (px) the pointer reaches for a mark it isn't quite on. */
const REACH = 8

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string) => {
  const n = doc.createElement(tag)
  if (cls) n.className = cls
  return n
}
const text = <K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  cls: string,
  value: string,
) => {
  const n = el(doc, tag, cls)
  n.textContent = value
  return n
}

/** Adds the history's stylesheet once per document. */
export function injectHistoryStyles(doc: Document) {
  if (doc.querySelector("style[data-knobs-history]")) return
  const style = doc.createElement("style")
  style.dataset.knobsHistory = ""
  style.textContent = aliased(historyCss)
  doc.head.append(style)
}

/** The date an item shows: a day, a range, or a span's range and length. */
const when = (it: HyItem) =>
  it.kind === "span"
    ? `${formatRange(it.from, it.to, it.open)} · ${formatDays(it.to - it.from)}`
    : formatRange(it.from, it.to)

export function history(container: HTMLElement, options: HistoryOptions): History {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const root = el(doc, "div", "knobs-history")
  applyLook(root, options)
  injectHistoryStyles(doc)
  root.tabIndex = 0
  root.setAttribute("role", "group")
  root.setAttribute("aria-label", options.label ?? "History")
  root.setAttribute("aria-roledescription", "timeline")

  const chart = el(doc, "div", "knobs-hy-chart")
  const foot = el(doc, "div", "knobs-hy-foot")
  const detail = el(doc, "div", "knobs-hy-detail")
  detail.setAttribute("aria-live", "polite")
  const tip = el(doc, "div", "knobs-hy-tip")
  tip.setAttribute("aria-hidden", "true")
  const tipTitle = el(doc, "div", "knobs-hy-tt")
  const tipDate = el(doc, "div", "knobs-hy-td")
  const tipLine = el(doc, "div", "knobs-hy-tl")
  tip.append(tipTitle, tipDate, tipLine)
  root.append(chart, foot, detail, tip)
  container.append(root)

  let model = normalizeHistory(options.data)
  let selected: string | null =
    options.selected && model.items.has(options.selected) ? options.selected : null
  let disposed = false
  let quiet = quietEvents(model.events, options.marks ?? DEFAULT_MARKS)
  let showAll = false
  /** The events ←/→ walk: the ones drawn. */
  const walked = () => (showAll ? model.events : model.events.filter((e) => !quiet.has(e.id)))

  // What the last draw made.
  let nodes = new Map<string, HTMLElement>()
  let tracks = new Map<string, HTMLElement>()
  let over: HTMLElement | null = null
  let hoverLine: HTMLElement | null = null
  let selLine: HTMLElement | null = null
  let scale = dayScale(model.from, model.to, 1)
  let drawnWidth = -1
  let hovered: HTMLElement | null = null
  let tipKey = ""

  // The font as canvas reads it: the computed `font` shorthand is empty when a feature it can't
  // say (tabular figures) is set.
  const fontOf = (n: Element) => {
    const c = win.getComputedStyle(n)
    return `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
  }
  let measureCtx: CanvasRenderingContext2D | null | undefined
  const measure = (s: string, font: string) => {
    if (measureCtx === undefined) measureCtx = doc.createElement("canvas").getContext("2d")
    if (!measureCtx) return s.length * 6.4
    measureCtx.font = font
    return measureCtx.measureText(s).width
  }

  /** Under the chart: the toggle for held-back marks, and a legend only where hatching needs one. */
  function drawFoot() {
    foot.textContent = ""
    root.toggleAttribute("data-all", showAll)
    if (quiet.size) {
      const t = el(doc, "button", "knobs-hy-more")
      t.type = "button"
      t.setAttribute("aria-pressed", String(showAll))
      t.textContent = `${showAll ? "Hide" : "Show"} ${quietLabel(model.events, quiet)}`
      t.addEventListener("click", () => {
        showAll = !showAll
        if (!showAll && selected && quiet.has(selected)) select(null, true, true)
        drawFoot()
      })
      foot.append(t)
    }
    if (model.inferred && model.verified) {
      const legend = el(doc, "span", "knobs-hy-legend")
      for (const [label, inferred] of [
        ["Verified", false],
        ["Inferred", true],
      ] as const) {
        const k = el(doc, "span", "knobs-hy-key")
        const sw = el(doc, "span", "knobs-hy-swatch")
        sw.dataset.tone = "dim"
        if (inferred) sw.dataset.inferred = ""
        k.append(sw, text(doc, "span", "", label))
        legend.append(k)
      }
      foot.append(legend)
    }
    foot.hidden = !foot.childElementCount
  }

  function draw() {
    const width = root.clientWidth
    drawnWidth = width
    const narrow = width > 0 && width < (options.narrow ?? 560)
    root.toggleAttribute("data-narrow", narrow)
    root.toggleAttribute("data-bands", model.bands.length > 0)
    hideHover()
    chart.textContent = ""
    nodes = new Map()
    tracks = new Map()
    // The label column: as wide as the longest label (within reason), so few need to fade.
    let gutter = 0
    if (!narrow) {
      const probe = el(doc, "div", "knobs-hy-label")
      chart.append(probe)
      const font = fontOf(probe)
      const gap = parseFloat(win.getComputedStyle(probe).marginRight) || 0
      probe.remove()
      const longest = Math.max(0, ...model.lanes.map((l) => measure(l.label, font)))
      gutter = Math.round(Math.min(Math.max(longest + gap + 2, 64), Math.max(96, width * 0.3), 200))
    }
    root.style.setProperty("--hy-gutter", `${gutter}px`)
    const plotW = Math.max(1, width - gutter)
    scale = dayScale(model.from, model.to, plotW)
    const pct = (d: number) => `${(scale.f(d) * 100).toFixed(4)}%`

    const rows = ["auto"]
    for (let i = 0; i < model.lanes.length; i++)
      rows.push(...(narrow ? ["auto", "var(--hy-lane)"] : ["var(--hy-lane)"]))
    chart.style.gridTemplateRows = rows.join(" ")

    // Behind the lanes: the bands, the month lines.
    const behind = el(doc, "div", "knobs-hy-layer")
    behind.setAttribute("aria-hidden", "true")
    for (const b of model.bands) {
      const c = clipSpan(b.from, b.to, model.from, model.to)
      if (!c) continue
      const band = el(doc, "div", "knobs-hy-band")
      band.style.left = pct(c.from)
      band.style.width = pct(model.from + (c.to - c.from))
      behind.append(band)
    }
    const ticks = monthTicks(model.from, model.to, plotW)
    for (const t of ticks) {
      const line = el(doc, "div", "knobs-hy-grid")
      line.style.left = pct(t.day)
      behind.append(line)
    }
    chart.append(behind)

    // The axis: band labels over month labels, and today's.
    const axis = el(doc, "div", "knobs-hy-axis")
    axis.setAttribute("aria-hidden", "true")
    const tickEls = ticks.map((t) => {
      const n = text(doc, "span", "knobs-hy-tick", t.label)
      n.style.left = pct(t.day)
      axis.append(n)
      return n
    })
    const showToday = model.today >= model.from && model.today <= model.to
    const now = showToday ? text(doc, "span", "knobs-hy-now", "Today") : null
    if (now) axis.append(now)
    const room = bandRoom(model.bands, scale.x)
    const bandEls = model.bands.map((b, i) => {
      const n = text(doc, "span", "knobs-hy-blabel", b.label)
      n.style.left = pct(Math.max(b.from, model.from))
      n.style.maxWidth = `${Math.max(0, room[i]!)}px`
      axis.append(n)
      return n
    })
    chart.append(axis)

    // The lanes.
    model.lanes.forEach((lane, i) => {
      const row = narrow ? 2 + i * 2 : 2 + i
      const label = text(doc, "div", "knobs-hy-label", lane.label)
      label.style.gridRow = String(row)
      label.title = lane.label
      const track = el(doc, "div", "knobs-hy-track")
      track.style.gridRow = String(narrow ? row + 1 : row)
      track.dataset.lane = lane.id
      tracks.set(lane.id, track)
      for (const s of lane.spans) {
        const c = clipSpan(s.from, s.to, model.from, model.to)
        if (!c) continue
        const b = el(doc, "button", "knobs-hy-span")
        b.type = "button"
        b.tabIndex = -1
        b.dataset.id = s.id
        b.dataset.tone = s.tone
        if (s.inferred) b.dataset.inferred = ""
        if (c.clipStart) b.dataset.clipStart = ""
        if (c.clipEnd) b.dataset.clipEnd = ""
        b.style.left = pct(c.from)
        b.style.width = pct(model.from + (c.to - c.from))
        b.setAttribute("aria-label", `${s.title}, ${when(s)}`)
        if (s.tags.length) b.append(text(doc, "span", "knobs-hy-tag", s.tags[0]!))
        track.append(b)
        nodes.set(s.id, b)
      }
      for (const e of lane.events) {
        if (e.to < model.from || e.from > model.to) continue
        const b = el(doc, "button", "knobs-hy-ev")
        b.type = "button"
        b.tabIndex = -1
        b.dataset.id = e.id
        b.dataset.tone = e.tone
        if (e.type) b.dataset.type = e.type
        if (e.inferred) b.dataset.inferred = ""
        if (quiet.has(e.id)) b.dataset.quiet = ""
        b.style.left = pct(Math.max(e.from, model.from))
        if (e.to > e.from) {
          b.dataset.range = ""
          b.style.setProperty("--hy-w", `${scale.x(model.from + (e.to - e.from)).toFixed(2)}px`)
        }
        b.setAttribute("aria-label", `${when(e)}: ${e.title}`)
        track.append(b)
        nodes.set(e.id, b)
      }
      chart.append(label, track)
    })

    // Over the lanes: today, the selection's line, the pointer's.
    over = el(doc, "div", "knobs-hy-layer")
    over.setAttribute("aria-hidden", "true")
    if (showToday) {
      const today = el(doc, "div", "knobs-hy-today")
      today.style.left = pct(model.today)
      over.append(today)
    }
    selLine = el(doc, "div", "knobs-hy-sel")
    hoverLine = el(doc, "div", "knobs-hy-hover")
    over.append(selLine, hoverLine)
    chart.append(over)

    // Measured once it's all in: which labels fit, what's cut short.
    const reserved: { x0: number; x1: number }[] = []
    if (now) {
      const w = now.offsetWidth
      const x0 = Math.max(0, Math.min(plotW - w, scale.x(model.today) - w / 2))
      now.style.left = `${x0}px`
      reserved.push({ x0, x1: x0 + w })
    }
    const fits = fitLabels(
      ticks.map((t, i) => ({ x: scale.x(t.day), w: tickEls[i]!.offsetWidth })),
      plotW,
      reserved,
    )
    tickEls.forEach((n, i) => (n.hidden = !fits[i]))
    for (const n of bandEls) n.toggleAttribute("data-overflow", n.scrollWidth > n.clientWidth + 1)
    for (const n of chart.querySelectorAll<HTMLElement>(".knobs-hy-label"))
      n.toggleAttribute("data-overflow", n.scrollWidth > n.clientWidth + 1)
    for (const lane of model.lanes) {
      const spans = lane.spans
        .map((s) => ({ s, c: clipSpan(s.from, s.to, model.from, model.to) }))
        .filter((x) => x.c)
        .sort((a, b) => a.c!.from - b.c!.from)
      spans.forEach(({ s, c }, i) => {
        const b = nodes.get(s.id)
        const tag = b?.querySelector<HTMLElement>(".knobs-hy-tag")
        if (!b || !tag) return
        const font = fontOf(tag)
        const widths = s.tags.map((t) => measure(t, font))
        const next = spans[i + 1]?.c
        const spanW = scale.x(c!.to) - scale.x(c!.from)
        const after = (next ? scale.x(next.from) : plotW) - scale.x(c!.to)
        const fit = fitTag(widths, spanW, after)
        tag.textContent = fit ? s.tags[fit.index]! : (s.tags[0] ?? "")
        tag.dataset.place = fit ? fit.place : "none"
      })
    }
    paintSelection()
  }

  // ——— selection and the detail ———

  const h = new Spring(0, HEIGHT.omega, HEIGHT.zeta, 0.25)
  let goal = 0
  let content: HTMLElement | null = null
  const loop = frameLoop(win, (dt) => {
    h.step(dt)
    const moving = !h.resting
    detail.style.height = moving ? `${Math.max(0, h.x).toFixed(2)}px` : goal > 0 ? "" : "0px"
    detail.toggleAttribute("data-moving", moving)
    return moving
  })

  function buildDetail(it: HyItem) {
    const c = el(doc, "div", "knobs-hy-dc")
    const meta = el(doc, "div", "knobs-hy-dmeta")
    meta.append(text(doc, "time", "", when(it)))
    const lane = model.lanes.find((l) => l.id === it.lane)
    if (lane && (model.lanes.length > 1 || lane.id !== "code"))
      meta.append(text(doc, "span", "", lane.label))
    if (it.type) meta.append(text(doc, "span", "", typeName(it.type)))
    if (it.provenance || it.source) {
      const p = text(doc, "span", "", [it.provenance, it.source].filter(Boolean).join(" · "))
      if (it.inferred) {
        p.dataset.tone = "warn"
        p.title = "Worked out from behaviour, not seen in the record"
      }
      meta.append(p)
    }
    c.append(meta, text(doc, "div", "knobs-hy-dtitle", it.title))
    if (it.detail) {
      const p = el(doc, "p", "knobs-hy-dtext")
      p.innerHTML = inlineMarkdown(it.detail)
      c.append(p)
    }
    const foot = el(doc, "div", "knobs-hy-dfoot")
    for (const e of it.evidence) {
      const tag = text(doc, e.href ? "a" : "span", "knobs-hy-evidence", e.label)
      if (tag instanceof HTMLAnchorElement && e.href) {
        tag.href = e.href
        tag.target = "_blank"
        tag.rel = "noreferrer"
      }
      foot.append(tag)
    }
    if (it.step && options.onJump) {
      const go = el(doc, "button", "knobs-hy-jump")
      go.type = "button"
      go.append(text(doc, "span", "", "Go to step"))
      go.insertAdjacentHTML("beforeend", GO)
      const step = it.step
      go.addEventListener("click", () => options.onJump?.(step))
      foot.append(go)
    }
    c.append(foot)
    return c
  }

  function showDetail(it: HyItem | null, animate: boolean) {
    const from = detail.offsetHeight
    const old = content
    const next = it ? buildDetail(it) : null
    if (old) {
      if (animate) {
        old.dataset.leave = ""
        const drop = () => old.remove()
        old.addEventListener("transitionend", drop, { once: true })
        win.setTimeout(drop, 400)
      } else old.remove()
    }
    content = next
    if (next) {
      detail.append(next)
      if (animate) {
        next.dataset.enter = ""
        void next.offsetHeight
        delete next.dataset.enter
      }
    }
    goal = next ? next.offsetHeight : 0
    if (!animate || reducedMotion(win)) {
      loop.stop()
      h.snap(goal)
      detail.style.height = goal > 0 ? "" : "0px"
      detail.removeAttribute("data-moving")
      return
    }
    // From the height on screen, so a change mid-flight carries on.
    if (h.resting) h.snap(from)
    h.set(goal)
    loop.wake()
  }

  function paintSelection() {
    for (const [id, n] of nodes) n.toggleAttribute("data-selected", id === selected)
    const it = selected ? model.items.get(selected) : undefined
    if (selLine) {
      const on = it?.kind === "event"
      selLine.toggleAttribute("data-on", on)
      if (on) selLine.style.left = `${(scale.f(it.from) * 100).toFixed(4)}%`
    }
  }

  function select(id: string | null, animate: boolean, notify: boolean) {
    const next = id && model.items.has(id) ? id : null
    if (next === selected) return
    selected = next
    paintSelection()
    showDetail(next ? model.items.get(next)! : null, animate)
    if (notify) options.onSelect?.(next)
  }

  // ——— the pointer ———

  /** What the pointer is on: a mark or span under it, else a mark within reach in its lane. */
  function itemAt(e: PointerEvent | MouseEvent): { it: HyItem | null; x: number } | null {
    if (!over) return null
    const r = over.getBoundingClientRect()
    if (!r.width) return null
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left))
    const target = e.target instanceof Element ? e.target : null
    const hit = target?.closest<HTMLElement>("[data-id]")
    if (hit && chart.contains(hit)) return { it: model.items.get(hit.dataset.id!) ?? null, x }
    const laneId = target?.closest<HTMLElement>(".knobs-hy-track")?.dataset.lane
    const lane = laneId ? model.lanes.find((l) => l.id === laneId) : undefined
    if (lane) {
      const reach = (REACH / r.width) * (model.to - model.from)
      const near = nearestEvent(lane.events, scale.day(x), reach)
      if (near) return { it: near, x }
    }
    return { it: null, x }
  }

  function hideHover() {
    hoverLine?.removeAttribute("data-on")
    tip.removeAttribute("data-on")
    hovered?.removeAttribute("data-hover")
    hovered = null
    tipKey = ""
  }

  function hover(e: PointerEvent) {
    const at = itemAt(e)
    if (!at || !over || !hoverLine) return hideHover()
    const { it, x } = at
    const lineX = it?.kind === "event" ? scale.x(it.from) : x
    hoverLine.style.left = `${lineX.toFixed(2)}px`
    hoverLine.setAttribute("data-on", "")
    const node = it ? (nodes.get(it.id) ?? null) : null
    if (node !== hovered) {
      hovered?.removeAttribute("data-hover")
      node?.setAttribute("data-hover", "")
      hovered = node
    }
    const key = it ? it.id : `d${Math.round(scale.day(x))}`
    if (key !== tipKey) {
      tipKey = key
      tipTitle.textContent = it ? it.title : formatDay(Math.round(scale.day(x)))
      tipDate.textContent = it ? [when(it), it.type ? typeName(it.type) : ""].filter(Boolean).join(" · ") : ""
      tipDate.hidden = !it
      tipLine.textContent = it ? firstSentence(it.detail) : ""
    }
    // Over the lane it's on (under it where there's no room above), centred on the line.
    const rr = root.getBoundingClientRect()
    const or = over.getBoundingClientRect()
    const laneId = it?.lane ?? (e.target instanceof Element ? e.target.closest<HTMLElement>(".knobs-hy-track")?.dataset.lane : undefined)
    const lr = (laneId && tracks.get(laneId)?.getBoundingClientRect()) || or
    const tw = tip.offsetWidth
    const th = tip.offsetHeight
    const left = Math.max(0, Math.min(rr.width - tw, or.left - rr.left + lineX - tw / 2))
    let top = lr.top - rr.top - th - 6
    if (top + rr.top < 0) top = lr.bottom - rr.top + 6
    tip.style.transform = `translate3d(${Math.round(left)}px,${Math.round(top)}px,0)`
    tip.setAttribute("data-on", "")
  }

  chart.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return
    hover(e)
  })
  chart.addEventListener("pointerleave", hideHover)
  // A click on a mark leaves the focus on the history, so ←/→ carry on from it.
  chart.addEventListener("mousedown", (e) => {
    if (!(e.target instanceof Element) || !e.target.closest("button")) return
    e.preventDefault()
    root.focus({ preventScroll: true })
  })
  chart.addEventListener("click", (e) => {
    const at = itemAt(e)
    const id = at?.it?.id ?? null
    select(id !== null && id === selected ? null : id, true, true)
  })

  // ——— keys ———

  root.addEventListener("keydown", (e) => {
    const onChart = e.target instanceof Node && chart.contains(e.target)
    if ((e.target !== root && !onChart) || e.metaKey || e.ctrlKey || e.altKey) return
    let next: HyItem | null | undefined
    const order = walked()
    const at = selected ? model.items.get(selected)?.from : undefined
    if (e.key === "ArrowRight") next = stepEvent(order, selected, 1, at)
    else if (e.key === "ArrowLeft") next = stepEvent(order, selected, -1, at)
    else if (e.key === "Home") next = order[0] ?? null
    else if (e.key === "End") next = order[order.length - 1] ?? null
    else if (e.key === "Escape" && selected) next = null
    else if (e.key === "Enter" && selected) {
      const step = model.items.get(selected)?.step
      if (!step || !options.onJump) return
      options.onJump(step)
      e.preventDefault()
      e.stopPropagation()
      return
    } else return
    e.preventDefault()
    e.stopPropagation()
    hideHover()
    select(next?.id ?? null, true, true)
  })

  // ——— size ———

  let raf = 0
  const ro = new ResizeObserver(() => {
    if (raf || disposed) return
    raf = win.requestAnimationFrame(() => {
      raf = 0
      if (!disposed && root.clientWidth !== drawnWidth) draw()
    })
  })
  ro.observe(root)
  const restyle = () => draw()
  root.addEventListener("knobs-restyle", restyle)

  drawFoot()
  draw()
  detail.style.height = "0px"
  if (selected) showDetail(model.items.get(selected)!, false)

  const dispose = () => {
    if (disposed) return
    disposed = true
    ro.disconnect()
    if (raf) win.cancelAnimationFrame(raf)
    loop.stop()
    root.removeEventListener("knobs-restyle", restyle)
    root.remove()
  }

  return {
    element: root,
    get model() {
      return model
    },
    get selected() {
      return selected
    },
    select(id) {
      select(id, true, false)
    },
    set(data) {
      model = normalizeHistory(data)
      const keep = selected && model.items.has(selected) ? selected : null
      selected = keep
      quiet = quietEvents(model.events, options.marks ?? DEFAULT_MARKS)
      drawFoot()
      draw()
      showDetail(keep ? model.items.get(keep)! : null, false)
    },
    focus() {
      root.focus()
    },
    dispose,
    destroy: dispose,
  }
}
