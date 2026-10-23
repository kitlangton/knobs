// The walkthrough's data blocks, light enough to draw at once: a history (dated events on a spine,
// where each came from), a merge stack (PRs as a branch graph off the trunk), a table (a real
// <table>, its head stuck while it scrolls, or its rows as blocks where the step is too narrow),
// the chapters under a video or compare (a readout list under the selection pill), and the quiet
// disclosure that folds a feed item's context away. Each sits on the step's card, so none draws a
// card of its own: hairlines only.
import { reducedMotion, SPRINGS } from "../core/motion.js"
import { Spring, springMotion } from "../core/spring.js"
import { history } from "./history.js"
import { icon } from "./icons.js"
import { frameLoop } from "./look.js"
import { selectionPill } from "./selection-pill.js"
import {
  chapterAt,
  clock,
  type ContextEvent,
  inlineMarkdown,
  plainMarkdown,
  stackLayout,
  tableStacks,
  type WalkChapter,
  type WalkMedia,
  type WalkTableCell,
  type WalkTableColumn,
  prStatus,
  type PRState,
} from "./walkthrough-model.js"

/** The glyphs the blocks draw. */
export const GLYPH = {
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

/**
 * Makes a whole row go to the step a ref names (a click away from its links, Enter or Space when
 * it has focus); nothing trails it, so rows with and without a step line up.
 */
export function rowLink(row: HTMLElement, ref: string | undefined, steps: StepLinks | undefined) {
  const s = ref && steps?.find(ref)
  if (!s || !steps) return
  const doc = row.ownerDocument
  row.dataset.go = ""
  row.tabIndex = 0
  row.title = `Go to “${plainMarkdown(s.title)}”`
  row.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest("a,button")) return
    if (doc.getSelection()?.toString()) return
    steps.go(s.key)
  })
  row.addEventListener("keydown", (e) => {
    if (e.target !== row || (e.key !== "Enter" && e.key !== " ")) return
    e.preventDefault()
    steps.go(s.key)
  })
}

// ——— history ———

/** A history through `history()`: lanes of spans over a date axis, or the older groups of events. */
export function mountHistory(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "history" }>,
  steps: StepLinks | undefined,
): Block {
  const h = history(host, {
    data: m.data,
    ...(m.label ? { label: m.label } : {}),
    ...(m.marks ? { marks: m.marks } : {}),
    ...(steps
      ? {
          onJump: (ref: string) => {
            const s = steps.find(ref)
            if (s) steps.go(s.key)
          },
        }
      : {}),
  })
  return {
    dispose: () => h.dispose(),
    context: () => ({ kind: "history" }),
  }
}

// ——— stack ———

export function mountStack(
  host: HTMLElement,
  m: Extract<WalkMedia, { kind: "stack" }>,
  steps: StepLinks | undefined,
  findPR?: (n: string) => PRInfo | null,
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
    // The number links out to the PR; the row goes to its step.
    const known = findPR?.(it.pr.replace(/^#/, "")) ?? null
    const pr = link(doc, "knobs-wt-spr", it.pr, it.href ?? known?.href)
    pr.addEventListener("click", (e) => e.stopPropagation())
    line.append(pr)
    const target = it.step ? steps?.find(it.step) : null
    if (target && steps) {
      const title = text(doc, "button", "knobs-wt-stitle", it.title)
      title.type = "button"
      title.title = `Go to “${plainMarkdown(target.title)}”`
      title.addEventListener("click", (e) => {
        e.stopPropagation()
        steps.go(target.key)
      })
      line.append(title)
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
    // Its state the GitHub way, from the page's PRs or the status words (never the tone), with a
    // check where they say the checks pass; any other status is a chip in its tone.
    const said = prStatus(it.status)
    const state = known?.state ?? said.state
    if (state) row.append(prStateLabel(doc, state, said.checks, it.status))
    else if (it.status) {
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

/** A cell's content: a chip for a badge, a link, code or toned text. */
function cellContent(doc: Document, into: HTMLElement, cell: WalkTableCell) {
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
}

/** The step a row goes to: its first cell's that names one. */
const rowStep = (r: Readonly<Record<string, WalkTableCell>>, columns: readonly WalkTableColumn[]) =>
  columns.map((c) => r[c.key]?.step).find((step) => step !== undefined)

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
        cellContent(doc, td, cell)
      }
      tr.append(td)
    }
    rowLink(tr, rowStep(r, m.columns), steps)
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
      if (cell) cellContent(doc, title, cell)
    }
    // Badges ride on the title's line, at its end; the rest go under it as term and value.
    const line = el(doc, "div", "knobs-wt-tline")
    line.append(title)
    const badges = el(doc, "div", "knobs-wt-tbadges")
    for (const c of m.columns) {
      const cell = r[c.key]
      if (c !== primary && cell?.badge) cellContent(doc, badges, cell)
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
      cellContent(doc, dd, cell)
      terms.append(text(doc, "dt", "", c.label), dd)
    }
    if (terms.childNodes.length) item.append(terms)
    rowLink(item, rowStep(r, m.columns), steps)
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
    spring: SPRINGS.snappy,
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
  options: { label: string; open?: boolean; content: HTMLElement },
): Disclosure {
  const doc = host.ownerDocument
  const win = doc.defaultView!
  let open = options.open === true
  const root = el(doc, "div", "knobs-wt-disc")
  const toggle = el(doc, "button", "knobs-wt-disc-toggle")
  toggle.type = "button"
  toggle.innerHTML = GLYPH.caret
  toggle.append(text(doc, "span", "", options.label))
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
    // Blur-in: the words come into focus as they fade in, top-anchored (3 px at nothing, none
    // once there), and soften the same way, a little sooner, as they go.
    const o = open ? Math.min(1, k * 1.25) : Math.max(0, k * 1.5 - 0.5)
    content.style.opacity = o.toFixed(3)
    content.style.filter = o >= 1 ? "" : `blur(${((1 - o) * 3).toFixed(2)}px)`
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
        content.style.filter = ""
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
// A draft is the pull request's left half over a ring with two dots above it (GitHub's draft).
const DRAFT =
  "M104,64A32,32,0,1,0,64,95v66a32,32,0,1,0,16,0V95A32.06,32.06,0,0,0,104,64ZM56,64A16,16,0,1,1,72,80,16,16,0,0,1,56,64ZM88,192a16,16,0,1,1-16-16A16,16,0,0,1,88,192ZM232,192a32,32,0,1,1-32-32A32,32,0,0,1,232,192ZM216,192a16,16,0,1,0-16,16A16,16,0,0,0,216,192ZM212,120a12,12,0,1,1-12-12A12,12,0,0,1,212,120ZM212,60a12,12,0,1,1-12-12A12,12,0,0,1,212,60Z"
const X =
  "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"
const CHECK =
  "M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"
const svg12 = (d: string, evenodd = false) =>
  `<svg class="knobs-icon" viewBox="0 0 256 256" width="12" height="12" fill="currentColor"${evenodd ? ' fill-rule="evenodd"' : ""} aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
/** A pull request's glyph the GitHub way: merged, draft, closed, else open. */
const prGlyph = (state: PRState | undefined) =>
  state === "merged"
    ? svg12(PR_PATHS.merge)
    : state === "draft"
      ? svg12(DRAFT, true)
      : state === "closed"
        ? svg12(X)
        : svg12(PR_PATHS.pull)

const PR_STATE = { merged: "Merged", open: "Open", draft: "Draft", closed: "Closed" } as const
export { prStatus, type PRState }
// Phosphor regular (circle-dot): an issue.
const ISSUE =
  "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm16-88a16,16,0,1,1-16-16A16,16,0,0,1,144,128Z"

/** A pull request's state as GitHub shows it: its glyph and word, quietly tinted; a check after. */
export function prStateLabel(doc: Document, state: PRState, checks: boolean, title?: string) {
  const s = el(doc, "span", "knobs-wt-prstate")
  s.dataset.state = state
  s.innerHTML = prGlyph(state)
  s.append(text(doc, "span", "", PR_STATE[state]))
  if (checks) {
    const c = el(doc, "span", "knobs-wt-prchecks")
    c.innerHTML = svg12(CHECK)
    c.title = "Checks pass"
    c.setAttribute("aria-label", "checks pass")
    s.append(c)
  }
  if (title) s.title = title
  return s
}

export interface PRInfo {
  readonly state?: PRState
  readonly kind?: "pr" | "issue"
  readonly checks?: boolean
  readonly title?: string
  readonly href?: string
}

/**
 * A pull request (or an issue) as a capsule: its state's glyph and number, tinted quietly by state
 * (neutral where none is known), a faint check where its checks pass, title and state on hover.
 */
export function prChip(doc: Document, n: string, pr: PRInfo): HTMLElement {
  const chip = el(doc, pr.href ? "a" : "span", "knobs-wt-pr")
  if (pr.href) {
    chip.setAttribute("href", pr.href)
    chip.setAttribute("target", "_blank")
    chip.setAttribute("rel", "noreferrer")
  }
  const issue = pr.kind === "issue"
  if (issue) chip.dataset.kind = "issue"
  if (pr.state) chip.dataset.state = pr.state
  chip.innerHTML = issue ? svg12(ISSUE) : prGlyph(pr.state)
  chip.append(text(doc, "span", "", `#${n}`))
  if (pr.checks) {
    const c = el(doc, "span", "knobs-wt-prchecks")
    c.innerHTML = svg12(CHECK)
    chip.append(c)
  }
  const words = [
    `${issue ? "Issue" : "Pull request"} #${n}`,
    pr.title,
    pr.state ? PR_STATE[pr.state] : "",
    pr.checks ? "checks pass" : "",
  ].filter(Boolean)
  chip.title = words.slice(1).length ? `#${n} · ${words.slice(1).join(" · ")}` : `#${n}`
  chip.setAttribute("aria-label", words.join(" · "))
  return chip
}

const PR_URL = /^https?:\/\/[^/]+\/.+\/(?:pull|merge_requests)\/(\d+)\/?(?:[?#].*)?$/
const ISSUE_URL = /^https?:\/\/[^/]+\/.+\/issues\/(\d+)\/?(?:[?#].*)?$/
const REF = /(^|[^\w&/#:])(issue:)?#(\d{3,7})\b/gi
const WHOLE_REF = /^(issue:)?#(\d{1,7})$/i

/** What the page knows of a pull request or issue by number (null when nothing). */
export type FindPR = (n: string, kind: "pr" | "issue") => PRInfo | null

/** Where refs stay as written: links, buttons, code blocks, chips, and media other than tables. */
const KEEP = 'a,pre,button,.knobs-wt-pr,.knobs-wt-slot:not([data-kind="table"]),.knobs-wt-stack'

/**
 * Turns every pull request and issue ref in some rendered prose into a capsule: links to one
 * whose words are its number or URL, inline code that's just a ref, and bare `#57148`s
 * (`issue:#123` for an issue). One the page knows nothing of is a neutral chip, linked only where
 * the page has a repo.
 */
export function linkPRs(root: HTMLElement, find: FindPR): void {
  const doc = root.ownerDocument
  const chip = (n: string, kind: "pr" | "issue", href?: string) =>
    prChip(doc, n, {
      ...(kind === "issue" ? { kind } : {}),
      ...find(n, kind),
      ...(href ? { href } : {}),
    })
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    if (a.classList.contains("knobs-wt-pr") || a.parentElement?.closest(KEEP)) continue
    const url = a.getAttribute("href") ?? ""
    const pr = PR_URL.exec(url)?.[1]
    const n = pr ?? ISSUE_URL.exec(url)?.[1]
    if (!n) continue
    const words = (a.textContent ?? "").trim().replace(/^issue:/i, "")
    if (!(words === `#${n}` || words === n || words === url)) continue
    a.replaceWith(chip(n, pr ? "pr" : "issue", a.href))
  }
  for (const c of Array.from(root.querySelectorAll<HTMLElement>("code"))) {
    if (c.closest("pre") || c.parentElement?.closest(KEEP)) continue
    const m = WHOLE_REF.exec((c.textContent ?? "").trim())
    if (m) c.replaceWith(chip(m[2]!, m[1] ? "issue" : "pr"))
  }
  // Elements and text (1 | 4), so every engine walks down through the elements to their text.
  const walker = doc.createTreeWalker(root, 5)
  const hits: Text[] = []
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.nodeType !== 3) continue
    const p = t.parentElement
    if (!p || p.closest(`${KEEP},code`)) continue
    REF.lastIndex = 0
    if (REF.test(t.nodeValue ?? "")) hits.push(t as Text)
  }
  for (const t of hits) {
    const value = t.nodeValue ?? ""
    const frag = doc.createDocumentFragment()
    let last = 0
    REF.lastIndex = 0
    for (let m = REF.exec(value); m; m = REF.exec(value)) {
      const at = m.index + m[1]!.length
      frag.append(value.slice(last, at), chip(m[3]!, m[2] ? "issue" : "pr"))
      last = m.index + m[0].length
    }
    frag.append(value.slice(last))
    t.replaceWith(frag)
  }
}
