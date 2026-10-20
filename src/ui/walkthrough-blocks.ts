// The walkthrough's data blocks, light enough to draw at once: a history (dated events on a spine,
// where each came from), a merge stack (PRs as a branch graph off the trunk), a table (a real
// <table>, its head stuck while it scrolls), and the chapter pills under a video or compare. Each
// sits on the step's card, so none draws a card of its own: hairlines and fills only.
import { MOTION, reducedMotion } from "../core/motion.js"
import { Spring } from "../core/spring.js"
import { frameLoop } from "./look.js"
import {
  chapterAt,
  clock,
  type ContextEvent,
  inlineMarkdown,
  stackLayout,
  type WalkChapter,
  type WalkMedia,
  type WalkthroughEvidence,
  type WalkthroughHistoryEvent,
} from "./walkthrough-model.js"

/** How media reach the page's steps: `step` on a history event, a stack item or a table cell. */
export interface StepLinks {
  /** The step a ref names (its key, id or number), or null when there's none. */
  find(
    ref: string,
  ): { readonly key: string; readonly number: string; readonly title: string } | null
  /** Goes to the step, as j / k do. */
  go(key: string): void
}

type OnEvent = ((event: Omit<ContextEvent, "at" | "step">) => void) | undefined

export interface Block {
  dispose(): void
  context?(): { kind: string }
}

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
const prose = (doc: Document, tag: "p" | "div", cls: string, value: string) => {
  const n = el(doc, tag, cls)
  n.innerHTML = inlineMarkdown(value)
  return n
}
const link = (doc: Document, cls: string, label: string, href: string | undefined) => {
  if (!href) return text(doc, "span", cls, label)
  const a = text(doc, "a", cls, label)
  a.href = href
  a.target = "_blank"
  a.rel = "noreferrer"
  return a
}

/** The step's number as a small button that goes there; null when the ref names no step. */
function stepButton(doc: Document, ref: string | undefined, steps: StepLinks | undefined) {
  const s = ref && steps?.find(ref)
  if (!s || !steps) return null
  const b = text(doc, "button", "knobs-wt-steplink", s.number)
  b.type = "button"
  b.title = `Go to ${s.number} ${s.title}`
  b.setAttribute("aria-label", b.title)
  b.addEventListener("click", (e) => {
    e.stopPropagation()
    steps.go(s.key)
  })
  return b
}

const tags = (doc: Document, list: readonly WalkthroughEvidence[] | undefined) => {
  if (!list?.length) return null
  const row = el(doc, "div", "knobs-wt-tags")
  for (const e of list) row.append(link(doc, "knobs-wt-tag", e.label, e.href))
  return row
}

// ——— history ———

export function mountHistory(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "history" }>,
  steps: StepLinks | undefined,
): Block {
  const doc = host.ownerDocument
  const root = el(doc, "div", "knobs-wt-history")
  // One date column for every group, as wide as the longest date or age (within reason).
  const longest = Math.max(
    6,
    ...m.groups.flatMap((g) => g.events.flatMap((e) => [e.date.length, e.age?.length ?? 0])),
  )
  root.style.setProperty("--kw-hw", `${Math.min(16, longest + 1)}ch`)
  for (const g of m.groups) {
    const group = el(doc, "section", "knobs-wt-hgroup")
    if (g.heading || g.summary) {
      const head = el(doc, "header", "knobs-wt-hhead")
      if (g.heading) head.append(text(doc, "h4", "knobs-wt-hheading", g.heading))
      if (g.summary) head.append(text(doc, "span", "knobs-wt-hsum", g.summary))
      group.append(head)
    }
    const list = el(doc, "ol", "knobs-wt-hlist")
    for (const e of g.events) list.append(historyEvent(doc, e, steps))
    group.append(list)
    root.append(group)
  }
  host.append(root)
  return { dispose: () => root.remove(), context: () => ({ kind: "history" }) }
}

function historyEvent(doc: Document, e: WalkthroughHistoryEvent, steps: StepLinks | undefined) {
  const li = el(doc, "li", "knobs-wt-hev")
  if (e.tone) li.dataset.tone = e.tone
  if (e.type) li.dataset.type = e.type
  if (e.provenance) li.dataset.provenance = e.provenance
  const when = el(doc, "div", "knobs-wt-hwhen")
  when.append(text(doc, "time", "knobs-wt-hdate", e.date))
  if (e.age) when.append(text(doc, "span", "knobs-wt-hage", e.age))
  const spine = el(doc, "span", "knobs-wt-hspine")
  spine.setAttribute("aria-hidden", "true")
  spine.append(el(doc, "span", "knobs-wt-hdot"))
  const main = el(doc, "div", "knobs-wt-hmain")
  const title = el(doc, "div", "knobs-wt-htitle")
  title.append(text(doc, "span", "knobs-wt-htext", e.title))
  if (e.provenance || e.source) {
    const p = text(
      doc,
      "span",
      "knobs-wt-prov",
      [e.provenance, e.source].filter(Boolean).join(" · "),
    )
    if (e.provenance === "inferred") p.title = "Inferred from behaviour, not seen in the record"
    else if (e.provenance === "verified") p.title = "Seen in the record"
    title.append(p)
  }
  const go = stepButton(doc, e.step, steps)
  if (go) title.append(go)
  main.append(title)
  if (e.detail) main.append(prose(doc, "p", "knobs-wt-hdetail", e.detail))
  const t = tags(doc, e.evidence)
  if (t) main.append(t)
  li.append(when, spine, main)
  return li
}

// ——— stack ———

export function mountStack(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "stack" }>,
  steps: StepLinks | undefined,
): Block {
  const doc = host.ownerDocument
  const layout = stackLayout(m)
  const root = el(doc, "div", "knobs-wt-stack")
  root.toggleAttribute("data-flat", layout.flat)
  const lane = (kind: string) => {
    const s = el(doc, "span", "knobs-wt-lane")
    s.dataset.rail = kind
    return s
  }
  const node = (down: boolean) => {
    const s = lane("node")
    s.toggleAttribute("data-down", down)
    return s
  }
  // Rails start at the trunk's level, or at the first stacked level when there's no trunk.
  const from = layout.trunk ? 0 : 1
  if (layout.trunk && layout.rows.length) {
    const row = el(doc, "div", "knobs-wt-srow")
    row.dataset.trunk = ""
    const lanes = el(doc, "span", "knobs-wt-lanes")
    lanes.setAttribute("aria-hidden", "true")
    lanes.append(node(true))
    row.append(lanes, text(doc, "span", "knobs-wt-trunk", layout.trunk))
    root.append(row)
  }
  for (const r of layout.rows) {
    const it = r.item
    const row = el(doc, "div", "knobs-wt-srow")
    if (!layout.flat) {
      const lanes = el(doc, "span", "knobs-wt-lanes")
      lanes.setAttribute("aria-hidden", "true")
      for (let k = from; k < r.depth; k++) lanes.append(lane(r.rails[k] ? "pass" : "none"))
      if (r.depth >= from) lanes.append(lane(r.last ? "end" : "tee"))
      lanes.append(node(r.children > 0))
      row.append(lanes)
    }
    const main = el(doc, "div", "knobs-wt-smain")
    const line = el(doc, "div", "knobs-wt-sline")
    if (it.order) line.append(text(doc, "span", "knobs-wt-sord", it.order))
    line.append(link(doc, "knobs-wt-spr", it.pr, it.href))
    const target = it.step ? steps?.find(it.step) : null
    if (target && steps) {
      const title = text(doc, "button", "knobs-wt-stitle", it.title)
      title.type = "button"
      title.title = `Go to ${target.number} ${target.title}`
      title.addEventListener("click", (e) => {
        e.stopPropagation()
        steps.go(target.key)
      })
      line.append(title)
      const go = stepButton(doc, it.step, steps)
      if (go) line.append(go)
      row.dataset.go = ""
      row.addEventListener("click", (e) => {
        const t = e.target as Element | null
        if (t?.closest("a,button")) return
        if (doc.getSelection()?.toString()) return
        steps.go(target.key)
      })
    } else line.append(text(doc, "span", "knobs-wt-stitle", it.title))
    main.append(line)
    if (it.summary) main.append(prose(doc, "p", "knobs-wt-ssummary", it.summary))
    const meta = el(doc, "div", "knobs-wt-smeta")
    if (it.head) {
      const branch = r.offBase ? `${it.head} → ${r.offBase}` : it.head
      meta.append(text(doc, "span", "knobs-wt-sbranch", branch))
    }
    if (it.delta !== undefined) meta.append(delta(doc, it.delta))
    if (meta.childNodes.length) main.append(meta)
    row.append(main)
    if (it.status) {
      const chip = text(doc, "span", "knobs-wt-chip knobs-wt-sstatus", it.status)
      chip.dataset.tone = it.tone ?? "dim"
      row.append(chip)
    }
    root.append(row)
  }
  host.append(root)
  return { dispose: () => root.remove(), context: () => ({ kind: "stack" }) }
}

function delta(doc: Document, d: string | { add: number; del: number }) {
  const s = el(doc, "span", "knobs-wt-delta")
  if (typeof d === "string") {
    s.textContent = d
    return s
  }
  const n = (v: number) => v.toLocaleString("en-US")
  s.append(text(doc, "span", "knobs-wt-add", `+${n(d.add)}`))
  s.append(text(doc, "span", "knobs-wt-del", `−${n(d.del)}`))
  s.setAttribute("aria-label", `${d.add} added, ${d.del} removed`)
  return s
}

// ——— table ———

export function mountTable(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "table" }>,
  steps: StepLinks | undefined,
): Block {
  const doc = host.ownerDocument
  const win = doc.defaultView
  const scroller = el(doc, "div", "knobs-wt-table")
  const table = el(doc, "table")
  if (m.caption) table.append(text(doc, "caption", "", m.caption))
  const head = el(doc, "thead")
  const hr = el(doc, "tr")
  for (const c of m.columns) {
    const th = text(doc, "th", "", c.label)
    th.scope = "col"
    th.dataset.align = c.align
    hr.append(th)
  }
  head.append(hr)
  const body = el(doc, "tbody")
  for (const r of m.rows) {
    const tr = el(doc, "tr")
    for (const c of m.columns) {
      const td = el(doc, "td")
      td.dataset.align = c.align
      if (c.mono) td.dataset.mono = ""
      const cell = r[c.key]
      if (cell) {
        if (cell.text.length > 40 && !c.mono && !cell.code) td.dataset.long = ""
        let content: HTMLElement
        if (cell.badge) {
          content = link(doc, "knobs-wt-chip", cell.text, cell.href)
          content.dataset.tone = cell.badge
        } else {
          const inner = cell.code ? text(doc, "code", "", cell.text) : null
          if (cell.href) {
            content = link(doc, "knobs-wt-clink", inner ? "" : cell.text, cell.href)
            if (inner) content.append(inner)
          } else content = inner ?? text(doc, "span", "", cell.text)
          if (cell.tone) {
            content.classList.add("knobs-wt-ctone")
            content.dataset.tone = cell.tone
          }
        }
        td.append(content)
        const go = stepButton(doc, cell.step, steps)
        if (go) td.append(go)
      }
      tr.append(td)
    }
    body.append(tr)
  }
  table.append(head, body)
  scroller.append(table)
  host.append(scroller)
  // The top fade starts under the stuck head; a table that scrolls takes the keyboard's arrows.
  const measure = () => {
    scroller.style.setProperty("--kw-thead", `${head.offsetHeight}px`)
    const scrolls =
      scroller.scrollWidth > scroller.clientWidth + 1 ||
      scroller.scrollHeight > scroller.clientHeight + 1
    if (scrolls) {
      scroller.tabIndex = 0
      scroller.setAttribute("role", "region")
      scroller.setAttribute("aria-label", m.caption ?? "Table")
    } else {
      scroller.removeAttribute("tabindex")
      scroller.removeAttribute("role")
      scroller.removeAttribute("aria-label")
    }
  }
  const ro = win && "ResizeObserver" in win ? new win.ResizeObserver(measure) : null
  ro?.observe(scroller)
  measure()
  return {
    dispose: () => {
      ro?.disconnect()
      scroller.remove()
    },
    context: () => ({ kind: "table" }),
  }
}

// ——— chapters: pills under a video or compare, one highlight springing to the one playing ———

export interface ChapterPills {
  /** The chapter the time is in (call as it plays or seeks): the highlight springs to it. */
  sync(): void
  /** The chapter playing, or null. */
  readonly current: WalkChapter | null
  dispose(): void
}

// kit-motion: the highlight moves on the calm spring (.4 s, no bounce) as the contents' pill does;
// it lands at once on first draw, a resize, or under reduced motion, and fades in or out (never
// travelling from where it last was) when playback enters or leaves the chapters.
const grid = (v: number) => Math.round(v * 64) / 64

export function chapterPills(
  host: HTMLElement,
  chapters: readonly WalkChapter[],
  io: {
    /** Seconds. */
    now(): number
    /** Seeks and plays. */
    seek(time: number): void
    onEvent: OnEvent
  },
): ChapterPills {
  const doc = host.ownerDocument
  const win = doc.defaultView!
  const bar = el(doc, "div", "knobs-wt-chapters")
  bar.setAttribute("role", "group")
  bar.setAttribute("aria-label", "Chapters")
  const mark = el(doc, "span", "knobs-wt-chapter-mark")
  mark.setAttribute("aria-hidden", "true")
  bar.append(mark)
  const pills = chapters.map((c) => {
    const b = el(doc, "button", "knobs-wt-chapter")
    b.type = "button"
    b.append(text(doc, "span", "knobs-wt-chapter-time", clock(c.start)))
    b.append(text(doc, "span", "knobs-wt-chapter-label", c.label))
    b.addEventListener("click", () => {
      io.onEvent?.({ what: "seek", time: Math.round(c.start * 100) / 100, detail: c.label })
      io.seek(c.start)
      sync()
    })
    bar.append(b)
    return b
  })
  host.append(bar)

  const x = new Spring(0, MOTION.calm.omega, MOTION.calm.zeta, 0.25)
  const y = new Spring(0, MOTION.calm.omega, MOTION.calm.zeta, 0.25)
  const w = new Spring(0, MOTION.calm.omega, MOTION.calm.zeta, 0.25)
  const draw = () => {
    const left = grid(x.x)
    mark.style.transform = `translate(${left}px,${grid(y.x)}px)`
    mark.style.width = `${grid(x.x + w.x) - left}px`
  }
  const loop = frameLoop(win, (dt) => {
    x.step(dt)
    y.step(dt)
    w.step(dt)
    draw()
    return !x.resting || !y.resting || !w.resting
  })
  let at = -2
  let shown = false
  const place = (snap: boolean) => {
    const p = pills[at]
    if (!p) {
      mark.removeAttribute("data-on")
      pills.forEach((b) => b.removeAttribute("aria-current"))
      shown = false
      return
    }
    pills.forEach((b, i) =>
      i === at ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current"),
    )
    const to = [p.offsetLeft, p.offsetTop, p.offsetWidth] as const
    if (snap || !shown || reducedMotion(win)) {
      x.snap(to[0])
      y.snap(to[1])
      w.snap(to[2])
      draw()
    } else {
      x.set(to[0])
      y.set(to[1])
      w.set(to[2])
      loop.wake()
    }
    mark.style.height = `${p.offsetHeight}px`
    mark.dataset.on = ""
    shown = true
  }
  const sync = () => {
    const next = chapterAt(chapters, io.now())
    if (next === at) return
    at = next
    place(false)
  }
  sync()
  const ro = "ResizeObserver" in win ? new win.ResizeObserver(() => place(true)) : null
  ro?.observe(bar)
  return {
    sync,
    get current() {
      return chapters[at] ?? null
    },
    dispose() {
      loop.stop()
      ro?.disconnect()
      bar.remove()
    },
  }
}
