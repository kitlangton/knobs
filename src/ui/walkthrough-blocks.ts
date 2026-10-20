// The walkthrough's data blocks, light enough to draw at once: a history (dated events on a spine,
// where each came from), a merge stack (PRs as a branch graph off the trunk), a table (a real
// <table>, its head stuck while it scrolls, or its rows as blocks where the step is too narrow),
// the chapters under a video or compare (a readout list under the selection pill), and the quiet
// disclosure that folds a feed item's context away. Each sits on the step's card, so none draws a
// card of its own: hairlines only.
import { reducedMotion, SPRINGS } from "../core/motion.js"
import { Spring, springMotion } from "../core/spring.js"
import { icon } from "./icons.js"
import { frameLoop } from "./look.js"
import { selectionPill } from "./selection-pill.js"
import {
  chapterAt,
  clock,
  type ContextEvent,
  inlineMarkdown,
  stackLayout,
  tableStacks,
  type WalkChapter,
  type WalkMedia,
  type WalkTableCell,
  type WalkTableColumn,
  type WalkthroughEvidence,
  type WalkthroughHistoryEvent,
} from "./walkthrough-model.js"

/** The glyphs the blocks draw. */
export const GLYPH = {
  go: icon("caretRight", { small: true }),
  caret: icon("caretRight", { small: true }),
}

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

/** A small arrow that goes to the step a ref names; null when it names none. */
export function stepButton(doc: Document, ref: string | undefined, steps: StepLinks | undefined) {
  const s = ref && steps?.find(ref)
  if (!s || !steps) return null
  const b = el(doc, "button", "knobs-wt-steplink")
  b.innerHTML = GLYPH.go
  b.type = "button"
  b.title = `Go to “${s.title}”`
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
      title.title = `Go to “${target.title}”`
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

/** A cell's content: a chip for a badge, a link, code, toned text, and its step's arrow. */
function cellContent(doc: Document, into: HTMLElement, cell: WalkTableCell, steps: StepLinks | undefined) {
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
  into.append(content)
  const go = stepButton(doc, cell.step, steps)
  if (go) into.append(go)
}

const cellAttrs = (td: HTMLElement, c: WalkTableColumn) => {
  td.dataset.align = c.align
  if (c.mono) td.dataset.mono = ""
}

export function mountTable(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "table" }>,
  steps: StepLinks | undefined,
): Block {
  const doc = host.ownerDocument
  const win = doc.defaultView
  const box = el(doc, "div", "knobs-wt-tablebox")
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
      cellAttrs(td, c)
      const cell = r[c.key]
      if (cell) {
        if (cell.text.length > 40 && !c.mono && !cell.code) td.dataset.long = ""
        cellContent(doc, td, cell, steps)
      }
      tr.append(td)
    }
    body.append(tr)
  }
  table.append(head, body)
  scroller.append(table)

  // The same rows as blocks: the primary cell titles each, the rest as term and value.
  const stack = el(doc, "div", "knobs-wt-tstack")
  stack.setAttribute("role", "list")
  if (m.caption) stack.setAttribute("aria-label", m.caption)
  const primary = m.columns.find((c) => c.key === m.primary) ?? m.columns[0]
  for (const r of m.rows) {
    const item = el(doc, "div", "knobs-wt-trow")
    item.setAttribute("role", "listitem")
    const title = el(doc, "div", "knobs-wt-ttitle")
    if (primary) {
      cellAttrs(title, primary)
      const cell = r[primary.key]
      if (cell) cellContent(doc, title, cell, steps)
    }
    // Badges ride on the title's line, at its end; the rest go under it as term and value.
    const line = el(doc, "div", "knobs-wt-tline")
    line.append(title)
    const badges = el(doc, "div", "knobs-wt-tbadges")
    for (const c of m.columns) {
      const cell = r[c.key]
      if (c !== primary && cell?.badge) cellContent(doc, badges, cell, steps)
    }
    if (badges.childNodes.length) line.append(badges)
    item.append(line)
    const terms = el(doc, "dl", "knobs-wt-tterms")
    for (const c of m.columns) {
      if (c === primary) continue
      const cell = r[c.key]
      if (!cell || cell.text === "" || cell.badge) continue
      const dd = el(doc, "dd")
      cellAttrs(dd, c)
      dd.removeAttribute("data-align")
      cellContent(doc, dd, cell, steps)
      terms.append(text(doc, "dt", "", c.label), dd)
    }
    if (terms.childNodes.length) item.append(terms)
    stack.append(item)
  }
  if (m.caption) stack.append(text(doc, "p", "knobs-wt-tcaption", m.caption))
  box.append(scroller, stack)
  host.append(box)

  // The columns' natural width: the table at its narrowest without anything spilling (long text
  // keeps its measure, code and mono cells stay on one line), read once it's laid out.
  let natural = 0
  const measureNatural = () => {
    if (!box.isConnected) return 0
    const was = box.dataset.stacked
    delete box.dataset.stacked
    box.dataset.measure = ""
    const w = table.getBoundingClientRect().width
    delete box.dataset.measure
    if (was !== undefined) box.dataset.stacked = was
    return w
  }
  // The top fade starts under the stuck head; a table that scrolls takes the keyboard's arrows.
  const measure = () => {
    if (!natural) natural = measureNatural()
    const stacked = tableStacks(m.stack, box.clientWidth, natural)
    box.toggleAttribute("data-stacked", stacked)
    scroller.style.setProperty("--kw-thead", `${head.offsetHeight}px`)
    const scrolls =
      !stacked &&
      (scroller.scrollWidth > scroller.clientWidth + 1 ||
        scroller.scrollHeight > scroller.clientHeight + 1)
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
  if (m.stack === "always") box.dataset.stacked = ""
  const ro = win && "ResizeObserver" in win ? new win.ResizeObserver(measure) : null
  ro?.observe(box)
  measure()
  // Web fonts change the natural width once they arrive.
  void doc.fonts?.ready.then(() => {
    if (!box.isConnected) return
    natural = 0
    measure()
  })
  return {
    dispose: () => {
      ro?.disconnect()
      box.remove()
    },
    context: () => ({ kind: "table" }),
  }
}

// ——— chapters: a readout list under a video or compare, the selection pill on the one playing ———

export interface ChapterPills {
  /** The chapter the time is in (call as it plays or seeks): the pill slides to it. */
  sync(): void
  /** The chapter playing, or null. */
  readonly current: WalkChapter | null
  dispose(): void
}

// Each chapter a row: its number, label and start. The current one is the last that started at
// or before the playhead; a click selects it at once while the media seeks there. The selection
// pill slides between rows on the state spring and fades out in place when playback leaves the
// chapters; nothing moves on first paint.
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
  const list = el(doc, "div", "knobs-wt-chapters")
  list.setAttribute("role", "group")
  list.setAttribute("aria-label", "Chapters")
  let at = -2
  const rows = chapters.map((c, i) => {
    const b = el(doc, "button", "knobs-wt-chapter")
    b.type = "button"
    b.append(text(doc, "span", "knobs-wt-chapter-n", String(i + 1)))
    b.append(text(doc, "span", "knobs-wt-chapter-label", c.label))
    b.append(text(doc, "span", "knobs-wt-chapter-time", clock(c.start)))
    b.addEventListener("click", () => {
      io.onEvent?.({ what: "seek", time: Math.round(c.start * 100) / 100, detail: c.label })
      io.seek(c.start)
      select(i)
    })
    list.append(b)
    return b
  })
  host.append(list)
  const pill = selectionPill(list, {
    selected: () => rows[at] ?? null,
    rows: () => rows,
  })
  const select = (i: number) => {
    if (i === at) return
    at = i
    rows.forEach((b, k) =>
      k === at ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current"),
    )
    pill.update()
  }
  const sync = () => select(chapterAt(chapters, io.now()))
  sync()
  return {
    sync,
    get current() {
      return chapters[at] ?? null
    },
    dispose() {
      pill.dispose()
      list.remove()
    },
  }
}

// ——— disclosure: a quiet toggle that folds context away ———

export interface Disclosure {
  readonly element: HTMLElement
  readonly open: boolean
  toggle(open?: boolean): void
  dispose(): void
}

// kit-motion: the body's height springs on the state spring (.3 s, no bounce) while its content
// fades in place, top-anchored, under a soft bottom mask; at rest it's plain flow (auto height,
// nothing clipped). The first paint is the resting state; reduced motion keeps a short fade.
export function disclosure(
  host: HTMLElement,
  options: { label: string; count?: number; open?: boolean; content: HTMLElement },
): Disclosure {
  const doc = host.ownerDocument
  const win = doc.defaultView!
  let open = options.open === true
  const root = el(doc, "div", "knobs-wt-disc")
  const toggle = el(doc, "button", "knobs-wt-disc-toggle")
  toggle.type = "button"
  toggle.innerHTML = GLYPH.caret
  toggle.append(text(doc, "span", "", options.label))
  if (options.count !== undefined)
    toggle.append(text(doc, "span", "knobs-wt-disc-count", String(options.count)))
  const viewport = el(doc, "div", "knobs-wt-disc-body")
  const content = el(doc, "div", "knobs-wt-disc-content")
  content.append(options.content)
  viewport.append(content)
  root.append(toggle, viewport)
  host.append(root)
  const STATE = springMotion(SPRINGS.default)
  const h = new Spring(0, STATE.omega, STATE.zeta, 0.25)
  let full = 0
  const paint = (moving: boolean) => {
    const k = full > 0 ? Math.max(0, Math.min(1, h.x / full)) : open ? 1 : 0
    viewport.style.height = !moving && open ? "" : `${Math.max(0, h.x).toFixed(2)}px`
    viewport.toggleAttribute("data-moving", moving)
    content.style.opacity = (open ? Math.min(1, k * 1.25) : Math.max(0, k * 1.5 - 0.5)).toFixed(3)
  }
  const loop = frameLoop(win, (dt) => {
    h.step(dt)
    const moving = !h.resting
    paint(moving)
    return moving
  })
  const sync = () => {
    root.toggleAttribute("data-open", open)
    toggle.setAttribute("aria-expanded", String(open))
    viewport.inert = !open
  }
  sync()
  h.snap(0)
  paint(false)
  if (open) {
    viewport.style.height = ""
    content.style.opacity = "1"
  }
  const api: Disclosure = {
    element: root,
    get open() {
      return open
    },
    toggle(next = !open) {
      if (next === open) return
      open = next
      sync()
      full = content.offsetHeight
      if (reducedMotion(win)) {
        loop.stop()
        h.snap(open ? full : 0)
        viewport.style.height = open ? "" : "0px"
        content.style.opacity = open ? "1" : "0"
        return
      }
      // From the height on screen, so a reversal mid-flight carries on.
      if (h.resting) h.snap(open ? 0 : full)
      h.set(open ? full : 0)
      paint(true)
      loop.wake()
    },
    dispose() {
      loop.stop()
      root.remove()
    },
  }
  toggle.addEventListener("click", () => api.toggle())
  return api
}

// ——— pull requests ———

// Phosphor regular (git-pull-request, git-merge), the set icons.ts copies from.
const PR_PATHS = {
  pull: "M104,64A32,32,0,1,0,64,95v66a32,32,0,1,0,16,0V95A32.06,32.06,0,0,0,104,64ZM56,64A16,16,0,1,1,72,80,16,16,0,0,1,56,64ZM88,192a16,16,0,1,1-16-16A16,16,0,0,1,88,192Zm120-31V110.63a23.85,23.85,0,0,0-7-17L163.31,56H192a8,8,0,0,0,0-16H144a8,8,0,0,0-8,8V96a8,8,0,0,0,16,0V67.31L189.66,105a8,8,0,0,1,2.34,5.66V161a32,32,0,1,0,16,0Zm-8,47a16,16,0,1,1,16-16A16,16,0,0,1,200,208Z",
  merge:
    "M208,112a32.05,32.05,0,0,0-30.69,23l-42.21-6a8,8,0,0,1-4.95-2.71L94.43,84.55A32,32,0,1,0,72,87v82a32,32,0,1,0,16,0V101.63l30,35a24,24,0,0,0,14.83,8.14l44,6.28A32,32,0,1,0,208,112ZM64,56A16,16,0,1,1,80,72,16,16,0,0,1,64,56ZM96,200a16,16,0,1,1-16-16A16,16,0,0,1,96,200Zm112-40a16,16,0,1,1,16-16A16,16,0,0,1,208,160Z",
}
const prGlyph = (merged: boolean) =>
  `<svg class="knobs-icon" viewBox="0 0 256 256" width="12" height="12" fill="currentColor" aria-hidden="true" focusable="false"><path d="${merged ? PR_PATHS.merge : PR_PATHS.pull}"/></svg>`

const PR_STATE = { merged: "Merged", open: "Open", draft: "Draft", closed: "Closed" } as const

export interface PRInfo {
  readonly state?: keyof typeof PR_STATE
  readonly title?: string
  readonly href?: string
}

/** A pull request as a small chip: its state's icon and number, the title and state on hover. */
export function prChip(doc: Document, n: string, pr: PRInfo): HTMLElement {
  const chip = el(doc, pr.href ? "a" : "span", "knobs-wt-pr")
  if (pr.href) {
    chip.setAttribute("href", pr.href)
    chip.setAttribute("target", "_blank")
    chip.setAttribute("rel", "noreferrer")
  }
  if (pr.state) chip.dataset.state = pr.state
  chip.innerHTML = prGlyph(pr.state === "merged")
  chip.append(text(doc, "span", "", `#${n}`))
  const tip = [`#${n}`, pr.title, pr.state ? PR_STATE[pr.state] : ""].filter(Boolean).join(" · ")
  chip.title = tip
  chip.setAttribute("aria-label", `Pull request ${tip}`)
  return chip
}

const PR_URL = /^https?:\/\/[^/]+\/.+\/(?:pull|merge_requests)\/(\d+)\/?(?:[?#].*)?$/
const PR_REF = /(^|[^\w&/#])#(\d{3,7})\b/g

/**
 * Turns the pull requests in some rendered prose into chips: links to one whose words are its
 * number or URL, and bare `#57148`s the page can resolve. Code, buttons and media stay as they are.
 */
export function linkPRs(
  root: HTMLElement,
  find: (n: string) => PRInfo | null,
): void {
  const doc = root.ownerDocument
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (a.classList.contains("knobs-wt-pr") || a.closest(".knobs-wt-slot,button")) continue
    const n = PR_URL.exec(a.getAttribute("href") ?? "")?.[1]
    const words = a.textContent?.trim() ?? ""
    if (!n || !(words === `#${n}` || words === n || words === a.getAttribute("href"))) continue
    a.replaceWith(prChip(doc, n, { href: a.href, ...find(n) }))
  }
  // Elements and text (1 | 4), so every engine walks down through the elements to their text.
  const walker = doc.createTreeWalker(root, 5)
  const hits: Text[] = []
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.nodeType !== 3) continue
    const p = t.parentElement
    if (!p || p.closest("a,code,pre,button,.knobs-wt-slot,.knobs-wt-pr")) continue
    PR_REF.lastIndex = 0
    if (PR_REF.test(t.nodeValue ?? "")) hits.push(t as Text)
  }
  for (const t of hits) {
    const value = t.nodeValue ?? ""
    const frag = doc.createDocumentFragment()
    let last = 0
    let changed = false
    PR_REF.lastIndex = 0
    for (let m = PR_REF.exec(value); m; m = PR_REF.exec(value)) {
      const pr = find(m[2]!)
      if (!pr) continue
      const at = m.index + m[1]!.length
      frag.append(value.slice(last, at), prChip(doc, m[2]!, pr))
      last = at + m[2]!.length + 1
      changed = true
    }
    if (!changed) continue
    frag.append(value.slice(last))
    t.replaceWith(frag)
  }
}
