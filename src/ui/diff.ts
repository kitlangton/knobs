import { Spring, springMotion } from "../core/spring.js"
import { aliased } from "../core/glide.js"
import { FADE as FADE_SPRING, SPRINGS } from "../core/motion.js"
import { browserStorage, storageKey, type StoragePort } from "../core/storage.js"
import { diffCss } from "./diff-css.js"
import { codeBars, edgeFades, rendererCss, type CodeBars, type EdgeFades } from "./diff-scroll.js"
import {
  diffBar,
  diffFiles,
  diffFolders,
  diffStats,
  diffTree,
  filesUnder,
  keepFile,
  matchPath,
  saveViewed,
  splitPath,
  stepFile,
  stillViewed,
  type DiffFile,
  type DiffInput,
  type DiffSource,
  type DiffTreeItem,
} from "./diff-model.js"
import {
  applyLook,
  frameLoop,
  ICONS,
  notifyLayout,
  reducedMotion,
  svg,
  syncFrame,
  tune,
  type UiLook,
} from "./look.js"
import { parseCssColor, rgbaCss, type Rgba } from "./rgba.js"
import { overlayScrollbar } from "./scrollbar.js"
import { tree, type Tree } from "./tree.js"

export type DiffLayout = "split" | "unified"

/** Lines picked in a diff (`onLines`): a range on one side, or across both. */
export interface DiffLines {
  readonly start: number
  readonly end: number
  readonly side?: "deletions" | "additions"
  readonly endSide?: "deletions" | "additions"
}

export interface CodeDiffOptions extends UiLook {
  /** A unified patch: `git diff` or `git show` output, one file or many. */
  readonly patch?: string
  /** Or files as before and after text (`patch` wins when both are set). */
  readonly files?: readonly DiffSource[]
  /** The file on show (its path); the first unless set. */
  readonly file?: string | null
  /** Side by side (default) or one column. */
  readonly layout?: DiffLayout
  /** Long lines wrap instead of scrolling sideways. */
  readonly wrap?: boolean
  /**
   * `"fill"` (default): the card fills its container and the diff scrolls inside it. `"auto"`:
   * the card is as tall as the file's diff, up to `maxHeight`, and springs to each new height;
   * it holds the height the diff will take from the start, so a page doesn't jump as it loads.
   */
  readonly height?: "fill" | "auto"
  /** Pixels, for `height: "auto"` (640, or 70% of the window when that's less); it scrolls past. */
  readonly maxHeight?: number
  /**
   * Draws only near the viewport (a screen ahead) and lets go of a diff far behind, keeping its
   * height; on by default with `height: "auto"`, for a long page of them. `ready` waits for it.
   */
  readonly lazy?: boolean
  /**
   * Every file down one scroller, each under its own header (status, path, counts, Viewed)
   * that sticks to the top until the next file's pushes it off; ‹ › and `show()` glide to a
   * file, and the file on show follows the scroll. Each file draws when it's near the view.
   */
  readonly stack?: boolean
  /** The files marked viewed; with this or `onViewed`, a Viewed check in the header. */
  readonly viewed?: readonly string[]
  /** The header's Viewed check marked or cleared the file on show. */
  readonly onViewed?: (viewed: readonly string[], file: string) => void
  /** ‹ 2 of 5 › in the header when there are several files (on by default). */
  readonly nav?: boolean
  /** Shiki themes for the code, dark and light (Pierre's own unless set). */
  readonly syntax?: { readonly dark: string; readonly light: string }
  /** Its own controls changed the file (‹ ›); `show()` doesn't call it. */
  readonly onFile?: (name: string) => void
  readonly onLayout?: (layout: DiffLayout) => void
  readonly onWrap?: (wrap: boolean) => void
  /** Lines picked by dragging over line numbers; turns line selection on. */
  readonly onLines?: (lines: DiffLines | null, file: string) => void
  /** Shown with no files. */
  readonly empty?: string
  /** An element of your own at the start of the header (diffReview puts its list's toggle here). */
  readonly lead?: HTMLElement
}

export interface CodeDiffUpdate {
  readonly patch?: string
  readonly files?: readonly DiffSource[]
  readonly file?: string | null
  readonly layout?: DiffLayout
  readonly wrap?: boolean
  readonly viewed?: readonly string[]
  /**
   * Switches between filling the container and its diff's own height, in place: the views and
   * their scroll stay. The new height is taken as it is, not sprung, so a container whose size
   * is moving (a card going full window) is followed rather than fought.
   */
  readonly height?: "fill" | "auto"
  readonly maxHeight?: number
}

export interface CodeDiff {
  readonly element: HTMLElement
  /** The diff's files, counted, in tree order. */
  readonly files: readonly DiffFile[]
  readonly file: string | null
  readonly layout: DiffLayout
  readonly wrap: boolean
  readonly viewed: readonly string[]
  /** Shows a file: the new one fades in over the last, in place. */
  show(name: string): void
  /** The file before or after the one on show. */
  step(dir: -1 | 1): void
  /** New input or settings; a new patch keeps the file on show if it's still there. */
  update(next: CodeDiffUpdate): void
  /** Settles once the first file is drawn. */
  readonly ready: Promise<void>
  dispose(): void
}

// The renderer and its highlighter load on first use, so knobs/ui doesn't carry them.
type Lib = typeof import("@pierre/diffs")
type View = InstanceType<Lib["FileDiff"]>
type Meta = NonNullable<View["fileDiff"]>
let lib: Promise<Lib> | undefined
const load = () => (lib ??= import("@pierre/diffs"))

const SYNTAX = { dark: "pierre-dark", light: "pierre-light" }
// A file or layout replacing the last in place: the new one comes in on the default spring, the
// old goes a little quicker, each with a soft blur while it fades; under reduced motion, a
// short fade with no blur. The card's height (height: "auto") moves on the calm spring.
const IN = springMotion(SPRINGS.default)
const OUT = springMotion(SPRINGS.snappy)
const FADE = springMotion(FADE_SPRING)
const HEIGHT = springMotion(SPRINGS.calm)
const DRAWER = springMotion(SPRINGS.calm)
const BLUR = 3

const WRAP = svg(
  '<path d="M2.5 4h11"/><path d="M2.5 8h9a2 2 0 0 1 0 4H8.5"/><path d="M10 10.5 8.5 12l1.5 1.5"/><path d="M2.5 12h3"/>',
)
const PREV = svg('<path d="M10 3.5 5.5 8l4.5 4.5"/>')
const UNVIEWED = svg('<circle cx="8" cy="8" r="5.5"/>')
const VIEWED = svg('<circle cx="8" cy="8" r="5.5"/><path d="m5.6 8.1 1.7 1.7 3.2-3.5"/>')
const SEARCH = svg('<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/>')
const CLEAR = svg('<path d="m5 5 6 6M11 5l-6 6"/>')
const SIDEBAR = svg('<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6.5 3v10"/>')
// A hunk separator's height in @pierre/diffs, for the height reserved before it loads (its block
// gap is the card's inset; the scrollbar under the code takes none, see diff-scroll.ts).
const SEPARATOR = 32

/** Adds the diff's stylesheet once per document. */
function injectDiffStyles(doc: Document) {
  if (doc.querySelector("style[data-knobs-ui-diff]")) return
  const style = doc.createElement("style")
  style.dataset.knobsUiDiff = ""
  style.textContent = aliased(diffCss)
  doc.head.append(style)
}

/**
 * A file's `+12 −3`, coloured, for a row of your own (a tree's `detail`); `bar` adds five
 * squares that show the share added and removed, as GitHub does.
 */
export function diffCounts(
  file: DiffFile,
  doc: Document = document,
  options: { readonly bar?: boolean } = {},
): HTMLElement {
  injectDiffStyles(doc)
  const el = doc.createElement("span")
  el.className = "knobs-diff-counts"
  const add = doc.createElement("span")
  add.className = "knobs-diff-add"
  add.textContent = file.additions ? `+${file.additions}` : ""
  const del = doc.createElement("span")
  del.className = "knobs-diff-del"
  del.textContent = file.deletions ? `−${file.deletions}` : ""
  el.append(add, del)
  if (options.bar) el.append(barOf(file, doc))
  el.setAttribute("aria-label", `${file.additions} added, ${file.deletions} removed`)
  return el
}

function barOf(file: DiffFile, doc: Document): HTMLElement {
  const bar = doc.createElement("span")
  bar.className = "knobs-diff-bar"
  paintBar(bar, file)
  return bar
}

function paintBar(
  bar: HTMLElement,
  file: { readonly additions: number; readonly deletions: number } | null,
) {
  const [add, del] = diffBar(file?.additions ?? 0, file?.deletions ?? 0)
  const doc = bar.ownerDocument
  while (bar.childElementCount < 5) bar.append(doc.createElement("i"))
  for (let i = 0; i < 5; i++)
    (bar.children[i] as HTMLElement).dataset.kind = i < add ? "add" : i < add + del ? "del" : ""
}

/** A file's change as a letter (M, A, D, R), for a tree's `icon`. */
export function diffStatus(file: DiffFile, doc: Document = document): HTMLElement {
  injectDiffStyles(doc)
  const el = doc.createElement("span")
  el.className = "knobs-diff-status"
  el.dataset.change = file.change
  el.textContent = { change: "M", new: "A", deleted: "D", rename: "R" }[file.change]
  el.setAttribute("aria-hidden", "true")
  return el
}

/** The colour showing through at `el`: its own and its ancestors' backgrounds, composited. */
function backdrop(el: Element | null, view: Window): Rgba | null {
  const layers: Rgba[] = []
  for (let e = el; e; e = e.parentElement) {
    const c = parseCssColor(view.getComputedStyle(e).backgroundColor, [0, 0, 0, 0])
    if (c[3] <= 0.001) continue
    layers.push(c)
    if (c[3] >= 0.999) break
  }
  let out = layers.pop()
  if (!out) return null
  for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i]!, out)
  return out
}

/** `top` laid over `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  const [r, g, b, a] = top
  const [R, G, B, A] = under
  const o = a + A * (1 - a)
  if (o <= 0) return [0, 0, 0, 0]
  const mix = (t: number, u: number) => (t * a + u * A * (1 - a)) / o
  return [mix(r, R), mix(g, G), mix(b, B), o]
}

/** The nearest ancestor that scrolls up and down, if it isn't the page. */
function scrollParent(el: HTMLElement, view: Window): HTMLElement | null {
  const doc = el.ownerDocument
  for (
    let e = el.parentElement;
    e && e !== doc.body && e !== doc.documentElement;
    e = e.parentElement
  ) {
    const y = view.getComputedStyle(e).overflowY
    if (y === "auto" || y === "scroll" || y === "overlay") return e
  }
  return null
}

/**
 * A code diff in a knobs card: a header with the file's path, its counts and Split | Unified
 * over the diff, drawn by `@pierre/diffs` (Shiki highlighting, word-level changes, hunks that
 * expand when the whole files are known). Takes a unified patch or before and after pairs.
 * Changing the file or the layout fades the new view in over the old, in place; each file
 * keeps its scroll. On another surface (a card, a split's pane, a walkthrough's step) it draws
 * no card of its own. Needs `@pierre/diffs` installed; it loads on first use.
 */
export function codeDiff(container: HTMLElement, options: CodeDiffOptions): CodeDiff {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  let input: DiffInput = { patch: options.patch, files: options.files }
  let files = diffFiles(input)
  let current = keepFile([], files, options.file)
  let layout: DiffLayout = options.layout ?? "split"
  let wrap = options.wrap ?? false
  let auto = options.height === "auto"
  let maxOption = options.maxHeight
  const maxHeight = () => maxOption ?? Math.min(640, Math.round(win.innerHeight * 0.7))
  const lazy = options.lazy ?? auto
  const stack = options.stack ?? false
  const checkable = options.viewed !== undefined || options.onViewed !== undefined
  let viewed = new Set(options.viewed)
  let disposed = false

  const root = doc.createElement("div")
  root.className = "knobs-diff"
  root.dataset.height = auto ? "auto" : "fill"
  if (stack) root.dataset.stack = ""
  applyLook(root, options)
  injectDiffStyles(doc)

  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const el = doc.createElement(tag)
    el.className = cls
    return el
  }
  const head = make("div", "knobs-diff-head")
  const path = make("span", "knobs-diff-path knobs-scroll-fade-x")
  const from = make("span", "knobs-diff-from")
  const dir = make("span", "knobs-diff-dir")
  const base = make("span", "knobs-diff-base")
  path.append(from, dir, base)
  const stat = make("span", "knobs-diff-stat knobs-diff-counts")
  const add = make("span", "knobs-diff-add")
  const del = make("span", "knobs-diff-del")
  const bar = make("span", "knobs-diff-bar")
  stat.append(add, del, bar)
  const button = (label: string, icon: string) => {
    const b = make("button", "knobs-diff-btn")
    b.type = "button"
    b.innerHTML = icon
    b.setAttribute("aria-label", label)
    b.dataset.tip = label
    return b
  }
  const nav = make("span", "knobs-diff-nav")
  const prev = button("Previous file", PREV)
  const next = button("Next file", ICONS.caret)
  const place = make("span", "")
  nav.append(prev, place, next)
  const wrapButton = button("Wrap lines", WRAP)
  const viewedToggle = () => {
    const b = make("button", "knobs-diff-viewed")
    b.type = "button"
    b.append(make("span", ""), "Viewed")
    return b
  }
  const paintViewed = (b: HTMLElement, on: boolean) => {
    if (b.getAttribute("aria-pressed") === String(on)) return
    b.setAttribute("aria-pressed", String(on))
    b.firstElementChild!.innerHTML = on ? VIEWED : UNVIEWED
  }
  const viewedButton = viewedToggle()
  viewedButton.hidden = !checkable || stack
  const seg = make("div", "knobs-diff-seg")
  seg.setAttribute("role", "radiogroup")
  seg.setAttribute("aria-label", "Layout")
  const pill = make("i", "knobs-diff-pill")
  const choice = (value: DiffLayout, label: string) => {
    const b = make("button", "")
    b.type = "button"
    b.setAttribute("role", "radio")
    b.dataset.value = value
    b.textContent = label
    return b
  }
  const splitButton = choice("split", "Split")
  const unifiedButton = choice("unified", "Unified")
  seg.append(pill, splitButton, unifiedButton)
  if (options.lead) head.append(options.lead)
  head.append(path, stat, make("span", "knobs-diff-fill"), nav, wrapButton, seg, viewedButton)
  const body = make("div", "knobs-diff-body")
  const note = make("div", "knobs-diff-note")
  note.hidden = true
  // Measures a row of code (--kd-line), for the height to hold before the renderer loads.
  const probe = make("i", "knobs-diff-probe")
  body.append(note, probe)
  root.append(head, body)
  container.append(root)

  const fileNow = () => files.find((f) => f.name === current) ?? null

  const paintHead = () => {
    const file = fileNow()
    const at = files.findIndex((f) => f.name === current)
    if (stack) {
      // The card's header is the whole change's; each file has its own header below.
      const total = diffStats(files)
      dir.textContent = ""
      base.textContent = files.length === 1 ? "1 file" : `${files.length} files`
      from.hidden = true
      add.textContent = total.additions ? `+${total.additions}` : ""
      del.textContent = total.deletions ? `−${total.deletions}` : ""
      stat.hidden = !total.additions && !total.deletions
      paintBar(bar, total)
    } else {
      const { dir: d, base: b } = splitPath(file?.name ?? "")
      dir.textContent = d
      base.textContent = b
      from.textContent = file?.prevName ? `${file.prevName} → ` : ""
      from.hidden = !file?.prevName
      add.textContent = file?.additions ? `+${file.additions}` : ""
      del.textContent = file?.deletions ? `−${file.deletions}` : ""
      stat.hidden = !file || (!file.additions && !file.deletions)
      if (file)
        stat.setAttribute("aria-label", `${file.additions} added, ${file.deletions} removed`)
      paintBar(bar, file)
    }
    nav.hidden = options.nav === false || files.length < 2
    place.textContent = `${at + 1} of ${files.length}`
    prev.disabled = at <= 0
    next.disabled = at >= files.length - 1
    wrapButton.setAttribute("aria-pressed", String(wrap))
    seg.dataset.value = layout
    splitButton.setAttribute("aria-checked", String(layout === "split"))
    unifiedButton.setAttribute("aria-checked", String(layout === "unified"))
    splitButton.tabIndex = layout === "split" ? 0 : -1
    unifiedButton.tabIndex = layout === "unified" ? 0 : -1
    root.dataset.layout = layout
    const on = Boolean(!stack && file && viewed.has(file.name))
    viewedButton.hidden = !checkable || stack || !file
    paintViewed(viewedButton, on)
    root.toggleAttribute("data-viewed", on)
    for (const p of parts) paintPart(p)
  }

  // Dark or light code, from the text colour the tokens give the card.
  const schemeNow = (): "dark" | "light" => {
    const [r, g, b] = parseCssColor(win.getComputedStyle(root).color, [1, 1, 1, 1])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "dark" : "light"
  }
  let scheme = schemeNow()

  const viewOptions = (L: Lib, name: () => string | null) => ({
    theme: options.syntax ?? SYNTAX,
    themeType: scheme,
    diffStyle: layout,
    overflow: wrap ? ("wrap" as const) : ("scroll" as const),
    disableFileHeader: true,
    hunkSeparators: "line-info" as const,
    diffIndicators: "bars" as const,
    lineDiffType: "word-alt" as const,
    unsafeCSS: rendererCss(() => L.wrapCoreCSS("")),
    ...(options.onLines
      ? {
          enableLineSelection: true,
          onLineSelected: (range: DiffLines | null) => {
            const n = name()
            if (n) options.onLines?.(range, n)
          },
        }
      : {}),
  })

  const metas = new WeakMap<DiffFile, Meta | null>()
  const metaOf = (L: Lib, file: DiffFile): Meta | null => {
    if (metas.has(file)) return metas.get(file)!
    let meta: Meta | null = null
    try {
      if (file.patch !== undefined) meta = L.parsePatchFiles(file.patch)[0]?.files[0] ?? null
      else {
        const lang = file.lang as Meta["lang"]
        meta = L.parseDiffFromFile(
          { name: file.name, contents: file.before ?? "", ...(lang ? { lang } : {}) },
          { name: file.name, contents: file.after ?? "", ...(lang ? { lang } : {}) },
        )
      }
    } catch (error) {
      console.error(error)
    }
    metas.set(file, meta)
    return meta
  }
  /** Loads the file's languages, so it's highlighted from its first frame. */
  const highlight = async (L: Lib, meta: Meta) => {
    const langs = meta.lang
      ? [meta.lang]
      : [...new Set([meta.prevName ?? meta.name, meta.name].map(L.getFiletypeFromFileName))]
    try {
      await L.getSharedHighlighter(
        L.getHighlighterOptions(langs, { theme: options.syntax ?? SYNTAX }),
      )
    } catch (error) {
      console.error(error)
    }
  }
  const emptyText = (file: DiffFile, meta: Meta | null) =>
    file.binary
      ? "Binary file not shown"
      : !meta
        ? "Couldn't read this file's diff"
        : file.prevName
          ? `Moved from ${file.prevName}, no changes`
          : "No changes"

  // The renderer's block gap is the card's inset (--kd-i), read with the row's height.
  let gap = 8
  const measureGap = () => {
    gap = Number.parseFloat(win.getComputedStyle(root).getPropertyValue("--kd-i")) || 8
  }
  /** What a file's diff will take before it's drawn: its rows, separators and gaps. */
  const reserveOf = (file: DiffFile | null) => {
    const rows = file?.rows
    if (!rows) return 0
    const n = layout === "split" ? rows.split : rows.unified
    if (n === 0) return 0
    const line = probe.offsetHeight || 20
    // A gap above and below the code and each separator; the first separator, at the top, has
    // none above it.
    const seps = rows.separators ? rows.separators * (SEPARATOR + 2 * gap) - gap : 0
    return n * line + seps + 2 * gap
  }

  const height = new Spring(0, HEIGHT.omega, HEIGHT.zeta, 0.25)
  let shownHeight = 0
  const grid = (v: number) => Math.round(v * 64) / 64
  const viewKey = () => `${current}|${layout}|${wrap}`
  // The heights views took, so one let go of (lazy) comes back at the height it had.
  const known = new Map<string, number>()

  // ── One file at a time: a scroller per view, the new fading in over the old ──────────────
  interface Slot {
    /** Fades in and out; holds the scroller and, over it, the bars across. */
    el: HTMLElement
    sc: HTMLElement
    box: HTMLElement
    layer: HTMLElement
    view: View
    o: Spring
    file: string
    /** The file, layout and wrap it shows, for the height it took. */
    key: string
    leaving: boolean
    bar: ReturnType<typeof overlayScrollbar>
    bars: CodeBars
    fades: EdgeFades
  }
  const live: Slot[] = []
  const pool: Slot[] = []
  const all = () => [...live, ...pool]
  const scrolls = new Map<string, number>()
  /** The view on show (the newest that isn't leaving). */
  const top = () => {
    for (let i = live.length - 1; i >= 0; i--) if (!live[i]!.leaving) return live[i]
    return undefined
  }

  // ── Every file down one scroller (stack), each under a header that sticks ─────────────────
  interface Part {
    file: DiffFile
    el: HTMLElement
    head: HTMLElement
    viewed: HTMLElement
    box: HTMLElement
    note: HTMLElement
    view?: View
    meta?: Meta | null
    bars?: CodeBars
    near: boolean
    token: number
  }
  let parts: Part[] = []
  const scroller = stack ? make("div", "knobs-diff-scroll") : null
  const list = make("div", "knobs-diff-files-stack")
  const stackLayer = make("div", "knobs-diff-layer")
  if (scroller) {
    const wrapper = make("div", "knobs-diff-slot")
    scroller.append(list)
    wrapper.append(scroller, stackLayer)
    body.append(wrapper)
  }
  const stackBar = scroller ? overlayScrollbar(scroller, list) : null
  const stackFades = scroller ? edgeFades(scroller, list) : null

  const contentHeight = () => {
    if (stack) return list.offsetHeight
    const slot = top()
    if (slot) {
      const h = slot.box.offsetHeight
      if (h > 0) known.set(slot.key, h)
      return h
    }
    if (!note.hidden) return note.offsetHeight
    return known.get(viewKey()) ?? reserveOf(fileNow())
  }
  // The first height is taken as it is (nothing moves on load); later ones spring.
  let placed = false
  const fitHeight = () => {
    if (!auto || !root.isConnected) return
    const target = Math.min(maxHeight(), contentHeight())
    if (placed && Math.abs(target - height.target) < 0.5) return
    if (placed && !reducedMotion(win)) {
      height.set(target)
      loop.wake()
    } else {
      placed = true
      height.snap(target)
      shownHeight = target
      body.style.height = `${grid(target)}px`
      notifyLayout(doc)
    }
  }
  const sizes = new ResizeObserver(() => fitHeight())
  /** Fill or auto, live: auto takes its height at once (placed afresh), fill lets go of it. */
  const setHeight = (mode: "fill" | "auto") => {
    auto = mode === "auto"
    root.dataset.height = mode
    if (auto) {
      placed = false
      fitHeight()
    } else {
      height.snap(height.x)
      body.style.height = ""
      notifyLayout(doc)
    }
  }
  if (stack) sizes.observe(list)

  const style = (slot: Slot) => {
    const o = Math.max(0, Math.min(1, slot.o.x))
    slot.el.style.opacity = o < 0.999 ? o.toFixed(3) : ""
    const blur = reducedMotion(win) ? 0 : (1 - o) * BLUR
    slot.el.style.filter = blur >= 0.05 ? `blur(${blur.toFixed(2)}px)` : ""
  }
  const retire = (slot: Slot) => {
    live.splice(live.indexOf(slot), 1)
    slot.el.hidden = true
    slot.el.style.opacity = slot.el.style.filter = ""
    if (pool.length < 2) pool.push(slot)
    else drop(slot)
  }
  const drop = (slot: Slot) => {
    slot.view.cleanUp()
    slot.bar.dispose()
    slot.bars.dispose()
    slot.fades.dispose()
    slot.el.remove()
  }

  // A file picked in the stack glides there on the calm spring; a wheel or a key takes over.
  const scrollY = new Spring(0, HEIGHT.omega, HEIGHT.zeta, 0.5)
  let gliding = false
  const stopGlide = () => {
    gliding = false
  }
  const loop = frameLoop(win, (dt) => {
    let moving = false
    for (const slot of [...live]) {
      slot.o.step(dt)
      style(slot)
      if (!slot.o.resting) moving = true
      else if (slot.leaving) retire(slot)
    }
    if (auto) {
      height.step(dt)
      if (height.x !== shownHeight) {
        shownHeight = height.x
        body.style.height = `${grid(height.x)}px`
        notifyLayout(doc)
      }
      if (!height.resting) moving = true
    }
    if (gliding && scroller) {
      scrollY.step(dt)
      scroller.scrollTop = scrollY.x
      if (scrollY.resting) gliding = false
      else moving = true
    }
    return moving
  })

  /** Fades every view out (to an empty card or a note). */
  const clear = () => {
    for (const slot of live) leave(slot)
    loop.wake()
  }
  const leave = (slot: Slot) => {
    if (top() === slot && slot.file) scrolls.set(slot.file, slot.sc.scrollTop)
    slot.leaving = true
    slot.el.dataset.leaving = ""
    tune(slot.o, reducedMotion(win) ? FADE : OUT).set(0)
  }
  const say = (text: string | null) => {
    note.textContent = text ?? ""
    note.hidden = text === null
  }
  /** The header shows its hairline once what's under it has scrolled. */
  const syncScrolled = () => {
    const el = scroller ?? top()?.sc
    root.toggleAttribute("data-scrolled", Boolean(el && el.scrollTop > 0.5))
  }

  let resolveReady!: () => void
  const ready = new Promise<void>((r) => (resolveReady = r))
  let token = 0

  async function present() {
    const my = ++token
    paintHead()
    if (stack) {
      buildParts()
      fitHeight()
      if (!near) return
      for (const p of parts) if (p.near) drawPart(p)
      return
    }
    if (!near) {
      fitHeight()
      return
    }
    const file = fileNow()
    if (!file) {
      clear()
      say(options.empty ?? "No changes")
      fitHeight()
      return
    }
    if (file.binary) {
      clear()
      say(emptyText(file, null))
      fitHeight()
      return
    }
    let L: Lib
    try {
      L = await load()
    } catch (error) {
      console.error(error)
      if (my === token && !disposed) say("Install @pierre/diffs to show diffs")
      return
    }
    if (my !== token || disposed || !near) return
    const meta = metaOf(L, file)
    if (!meta || meta.hunks.length === 0) {
      clear()
      say(emptyText(file, meta))
      fitHeight()
      return
    }
    await highlight(L, meta)
    if (my !== token || disposed || !near) return
    draw(L, file, meta)
  }

  function draw(L: Lib, file: DiffFile, meta: Meta) {
    const last = top()
    const same = last?.file === file.name
    const along = last
      ? last.sc.scrollTop / Math.max(1, last.sc.scrollHeight - last.sc.clientHeight)
      : 0
    for (const slot of live) if (!slot.leaving) leave(slot)
    say(null)
    let slot = pool.pop()
    if (!slot) {
      const el = make("div", "knobs-diff-slot")
      const sc = make("div", "knobs-diff-scroll")
      const layer = make("div", "knobs-diff-layer")
      const box = make("div", "knobs-diff-box")
      sc.append(box)
      el.append(sc, layer)
      const s: Slot = {
        el,
        sc,
        box,
        layer,
        view: new L.FileDiff(viewOptions(L, () => s.file)),
        o: new Spring(0, IN.omega, IN.zeta, 0.002),
        file: "",
        key: "",
        leaving: false,
        bar: overlayScrollbar(sc, box),
        bars: codeBars(sc, layer, () => box.querySelector("diffs-container")?.shadowRoot),
        fades: edgeFades(sc, box),
      }
      sc.addEventListener(
        "scroll",
        () => {
          if (top() === s) syncScrolled()
        },
        { passive: true },
      )
      slot = s
    }
    slot.el.hidden = false
    delete slot.el.dataset.leaving
    slot.leaving = false
    slot.file = file.name
    slot.key = viewKey()
    body.append(slot.el)
    const shown = slot
    shown.view.setOptions(viewOptions(L, () => shown.file))
    slot.view.render({ fileDiff: meta, containerWrapper: slot.box, forceRender: true })
    slot.bars.rescan()
    slot.sc.scrollTop = same
      ? along * (slot.sc.scrollHeight - slot.sc.clientHeight)
      : (scrolls.get(file.name) ?? 0)
    slot.fades.update()
    tune(slot.o, reducedMotion(win) ? FADE : IN)
      .snap(0)
      .set(1)
    style(slot)
    live.push(slot)
    sizes.disconnect()
    sizes.observe(slot.box)
    syncScrolled()
    fitHeight()
    loop.wake()
    resolveReady()
  }

  // ── The stack's parts ─────────────────────────────────────────────────────────────────────
  const paintPart = (p: Part) => {
    paintViewed(p.viewed, viewed.has(p.file.name))
    p.el.toggleAttribute("data-viewed", viewed.has(p.file.name))
  }
  const makePart = (file: DiffFile): Part => {
    const el = make("section", "knobs-diff-part")
    el.dataset.file = file.name
    const h = make("div", "knobs-diff-part-head")
    const p = make("span", "knobs-diff-path knobs-scroll-fade-x")
    const { dir: d, base: b } = splitPath(file.name)
    if (file.prevName)
      p.append(
        Object.assign(make("span", "knobs-diff-from"), { textContent: `${file.prevName} → ` }),
      )
    p.append(
      Object.assign(make("span", "knobs-diff-dir"), { textContent: d }),
      Object.assign(make("span", "knobs-diff-base"), { textContent: b }),
    )
    const v = viewedToggle()
    v.hidden = !checkable
    h.append(
      diffStatus(file, doc),
      p,
      diffCounts(file, doc, { bar: true }),
      make("span", "knobs-diff-fill"),
      v,
    )
    const box = make("div", "knobs-diff-box")
    const n = make("div", "knobs-diff-part-note")
    n.hidden = true
    el.append(h, box, n)
    const part: Part = { file, el, head: h, viewed: v, box, note: n, near: false, token: 0 }
    v.addEventListener("click", () => markViewed(file.name))
    reserve(part)
    paintPart(part)
    return part
  }
  const reserve = (p: Part) => {
    if (p.view) return
    const k = `${p.file.name}|${layout}|${wrap}`
    p.box.style.minHeight = `${known.get(k) ?? reserveOf(p.file)}px`
  }
  let partsFor: readonly DiffFile[] | null = null
  const near1 = scroller ? partObserver(1, true) : null
  const far4 = scroller ? partObserver(4, false) : null
  function partObserver(screens: number, entering: boolean) {
    if (typeof IntersectionObserver === "undefined") return null
    return new IntersectionObserver(
      (es) => {
        for (const e of es) {
          const p = parts.find((x) => x.el === e.target)
          if (!p) continue
          if (entering && e.isIntersecting && !p.near) {
            p.near = true
            if (near) drawPart(p)
          } else if (!entering && !e.isIntersecting && p.near) {
            p.near = false
            releasePart(p)
          }
        }
      },
      { root: scroller, rootMargin: `${Math.round((win.innerHeight || 800) * screens)}px 0px` },
    )
  }
  function buildParts() {
    if (!scroller || partsFor === files) return
    partsFor = files
    const old = new Map(parts.map((p) => [p.file.name, p]))
    const nextParts = files.map((f) => {
      const was = old.get(f.name)
      if (was && was.file === f) {
        old.delete(f.name)
        return was
      }
      return makePart(f)
    })
    for (const p of old.values()) {
      releasePart(p)
      near1?.unobserve(p.el)
      far4?.unobserve(p.el)
    }
    parts = nextParts
    list.replaceChildren(...parts.map((p) => p.el))
    for (const p of parts) {
      near1?.observe(p.el)
      far4?.observe(p.el)
      if (!near1) p.near = true
    }
    say(parts.length ? null : (options.empty ?? "No changes"))
  }
  async function drawPart(p: Part) {
    const my = ++p.token
    if (p.view) return
    let L: Lib
    try {
      L = await load()
    } catch (error) {
      console.error(error)
      if (!disposed) say("Install @pierre/diffs to show diffs")
      return
    }
    if (my !== p.token || disposed || !near || !p.near) return
    const meta = p.file.binary ? null : metaOf(L, p.file)
    if (!meta || meta.hunks.length === 0) {
      p.note.textContent = emptyText(p.file, meta)
      p.note.hidden = false
      p.box.style.minHeight = ""
      return
    }
    await highlight(L, meta)
    if (my !== p.token || disposed || !near || !p.near || p.view) return
    const anchor = anchorOf()
    p.meta = meta
    p.view = new L.FileDiff(viewOptions(L, () => p.file.name))
    p.view.render({ fileDiff: meta, containerWrapper: p.box, forceRender: true })
    p.box.style.minHeight = ""
    known.set(`${p.file.name}|${layout}|${wrap}`, p.box.offsetHeight)
    p.bars = codeBars(
      scroller!,
      stackLayer,
      () => p.box.querySelector("diffs-container")?.shadowRoot,
    )
    p.bars.rescan()
    restore(anchor)
    resolveReady()
  }
  function releasePart(p: Part) {
    p.token++
    if (!p.view) return
    const h = p.box.offsetHeight
    known.set(`${p.file.name}|${layout}|${wrap}`, h)
    p.view.cleanUp()
    p.view = undefined
    p.bars?.dispose()
    p.bars = undefined
    p.box.replaceChildren()
    p.box.style.minHeight = `${h}px`
  }
  /** Redraws the stack's views for a new layout or wrap, keeping the file at the top in place. */
  async function restack() {
    const anchor = anchorOf()
    let L: Lib | undefined
    try {
      L = await load()
    } catch {
      return
    }
    for (const p of parts) {
      if (p.view && p.meta) {
        p.view.setOptions(viewOptions(L, () => p.file.name))
        p.view.render({ fileDiff: p.meta, containerWrapper: p.box, forceRender: true })
        p.bars?.rescan()
      } else reserve(p)
    }
    restore(anchor)
  }
  /** The part at the top of the stack's view, and how far into it. */
  const anchorOf = () => {
    if (!scroller) return null
    const y = scroller.scrollTop
    const p = parts.find((x) => x.el.offsetTop + x.el.offsetHeight > y)
    return p ? { p, into: y - p.el.offsetTop } : null
  }
  const restore = (a: ReturnType<typeof anchorOf>) => {
    if (!a || !scroller || gliding) return
    scroller.scrollTop = a.p.el.offsetTop + Math.min(a.into, a.p.el.offsetHeight - 1)
  }
  const partNow = () => {
    if (!scroller) return null
    const y = scroller.scrollTop + 1
    return parts.find((x) => x.el.offsetTop + x.el.offsetHeight > y) ?? null
  }
  /** Which file's header is stuck (its hairline shows), and the file on show follows it. */
  const spy = () => {
    if (!scroller) return
    const y = scroller.scrollTop
    let stick = 0
    let next = Number.POSITIVE_INFINITY
    parts.forEach((p, i) => {
      const t = p.el.offsetTop
      const stuck = t < y - 0.5 && t + p.el.offsetHeight > y
      p.head.toggleAttribute("data-stuck", stuck)
      if (!stuck) return
      // The top fade starts under the stuck header (less of it as the next pushes it off), and
      // eases away while the next header passes through it, so a header is never faded.
      stick = Math.max(0, Math.min(p.head.offsetHeight, t + p.el.offsetHeight - y))
      const after = parts[i + 1]
      if (after) next = after.el.offsetTop - y
    })
    scroller.style.setProperty("--kd-stick", `${stick.toFixed(1)}px`)
    scroller.toggleAttribute("data-handoff", next < stick + fadeLength() + 1)
    syncScrolled()
    if (gliding) return
    const p = partNow()
    if (p && p.file.name !== current) {
      current = p.file.name
      paintHead()
      options.onFile?.(current)
    }
  }
  let fade = -1
  const fadeLength = () => {
    if (fade < 0)
      fade = Number.parseFloat(win.getComputedStyle(root).getPropertyValue("--kd-fade")) || 20
    return fade
  }
  let spyFrame = 0
  scroller?.addEventListener(
    "scroll",
    () => {
      if (!spyFrame)
        spyFrame = win.requestAnimationFrame(() => {
          spyFrame = 0
          spy()
        })
    },
    { passive: true },
  )
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"])
    scroller?.addEventListener(type, stopGlide, { passive: true })
  /** Brings a file's header to the top of the stack. */
  const glideTo = (name: string) => {
    const p = parts.find((x) => x.file.name === name)
    if (!p || !scroller) return
    const y = Math.min(p.el.offsetTop, scroller.scrollHeight - scroller.clientHeight)
    if (reducedMotion(win) || Math.abs(y - scroller.scrollTop) < 1) {
      gliding = false
      scroller.scrollTop = y
      return
    }
    scrollY.snap(scroller.scrollTop)
    scrollY.set(y)
    gliding = true
    loop.wake()
  }

  const markViewed = (name: string) => {
    if (viewed.has(name)) viewed.delete(name)
    else viewed.add(name)
    paintHead()
    options.onViewed?.([...viewed], name)
  }

  const picked = (name: string | null) => {
    if (name === null || name === current) return
    current = name
    if (stack) {
      paintHead()
      glideTo(name)
    } else present()
    options.onFile?.(name)
  }
  prev.addEventListener("click", () => picked(stepFile(files, current, -1)))
  next.addEventListener("click", () => picked(stepFile(files, current, 1)))
  const relayout = () => {
    if (stack) {
      paintHead()
      restack()
    } else present()
  }
  const setLayout = (value: DiffLayout, notify: boolean) => {
    if (value === layout) return
    layout = value
    relayout()
    if (notify) options.onLayout?.(value)
  }
  const setWrap = (value: boolean, notify: boolean) => {
    if (value === wrap) return
    wrap = value
    relayout()
    if (notify) options.onWrap?.(value)
  }
  splitButton.addEventListener("click", () => setLayout("split", true))
  unifiedButton.addEventListener("click", () => setLayout("unified", true))
  seg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const value = e.key === "ArrowLeft" ? "split" : "unified"
    setLayout(value, true)
    ;(value === "split" ? splitButton : unifiedButton).focus()
  })
  wrapButton.addEventListener("click", () => setWrap(!wrap, true))
  viewedButton.addEventListener("click", () => current && markViewed(current))

  /**
   * Where it sits: on another surface (a host's card, a walkthrough's step) its content lines
   * up with the surface's (no inset of its own); in a split's pane, or on its own as a card, it
   * keeps its inset. Its inner corners (separators, the header's controls) are the outer
   * corner less the distance in, so they're concentric. And with no fill of its own, the
   * renderer still needs an opaque one under its sticky line numbers: the colour behind it.
   */
  const syncSurface = () => {
    const outer = root.parentElement?.closest<HTMLElement>(
      ".knobs-surface,.knobs-pane-clip,.knobs-diff-review",
    )
    if (outer?.classList.contains("knobs-surface")) root.dataset.on = "surface"
    else if (outer) root.dataset.on = "pane"
    else delete root.dataset.on
    root.style.removeProperty("--kd-inner")
    root.style.removeProperty("--kd-fill")
    const cs = win.getComputedStyle(root)
    measureGap()
    const x = Number.parseFloat(cs.getPropertyValue("--kd-x")) || 0
    const edge = outer ?? root
    const r = Number.parseFloat(win.getComputedStyle(edge).borderTopLeftRadius) || 0
    const d =
      x + (outer ? root.getBoundingClientRect().left - outer.getBoundingClientRect().left : 0)
    root.style.setProperty("--kd-inner", `${Math.max(3, r - d).toFixed(1)}px`)
    const own = parseCssColor(cs.backgroundColor, [0, 0, 0, 0])
    if (own[3] >= 0.999) return
    const behind = backdrop(root.parentElement, win)
    if (behind) root.style.setProperty("--kd-fill", rgbaCss(over(own, behind)))
  }
  const rescheme = () => {
    syncFrame(root)
    syncSurface()
    const next = schemeNow()
    if (next === scheme) return
    scheme = next
    for (const slot of all()) slot.view.setThemeType(scheme)
    for (const p of parts) p.view?.setThemeType(scheme)
  }
  root.addEventListener("knobs-restyle", rescheme)
  const media = win.matchMedia?.("(prefers-color-scheme: light)")
  media?.addEventListener("change", rescheme)

  // Lazy: drawn once within a screen of the viewport (of the scroller it's in), let go of past
  // four, at the height it had.
  let near = !lazy
  let watchers: IntersectionObserver[] = []
  const release = () => {
    token++
    const slot = top()
    if (slot) scrolls.set(slot.file, slot.sc.scrollTop)
    for (const s of all()) drop(s)
    live.length = pool.length = 0
    for (const p of parts) releasePart(p)
    if (!stack) sizes.disconnect()
  }
  const watch = () => {
    if (!lazy || watchers.length) return
    if (typeof IntersectionObserver === "undefined") {
      near = true
      present()
      return
    }
    const outer = scrollParent(root, win)
    const span = outer?.clientHeight || win.innerHeight
    const observe = (screens: number, seen: (hit: boolean) => void) => {
      const io = new IntersectionObserver((es) => seen(es[es.length - 1]!.isIntersecting), {
        root: outer,
        rootMargin: `${Math.round(span * screens)}px 0px`,
      })
      io.observe(root)
      return io
    }
    watchers = [
      observe(1, (hit) => {
        if (!hit || near || disposed) return
        near = true
        present()
      }),
      observe(4, (hit) => {
        if (hit || !near || disposed) return
        // A card that's gone full window (position: fixed) has left its scroller's clip but is
        // in view: keep it.
        const r = root.getBoundingClientRect()
        if (r.bottom > -span * 4 && r.top < win.innerHeight + span * 4 && r.width > 0) return
        near = false
        release()
      }),
    ]
  }
  // Once it's in the page (now, or when a framework puts it there): its frame and fill, the
  // height to hold, and the watch for the viewport.
  let attached = false
  const attach = () => {
    if (attached || !root.isConnected) return
    attached = true
    attaching.disconnect()
    rescheme()
    if (stack) for (const p of parts) reserve(p)
    fitHeight()
    watch()
  }
  const attaching = new ResizeObserver(attach)
  attaching.observe(root)
  // A new width (a window resized, a host card gone full window): corners measured again, and
  // the height to hold (its cap follows the window).
  // Measured once it settles, not on every frame of a drawer's spring.
  let width = -1
  let settle = 0
  const resized = new ResizeObserver(() => {
    const w = root.clientWidth
    if (!attached || Math.abs(w - width) < 0.5) return
    const first = width < 0
    width = w
    if (first) return
    win.clearTimeout(settle)
    settle = win.setTimeout(() => {
      if (disposed) return
      syncSurface()
      fitHeight()
    }, 120)
  })
  resized.observe(root)
  const onWindow = () => fitHeight()
  win.addEventListener("resize", onWindow)

  paintHead()
  attach()
  present()

  return {
    element: root,
    get files() {
      return files
    },
    get file() {
      return current
    },
    get layout() {
      return layout
    },
    get wrap() {
      return wrap
    },
    get viewed() {
      return [...viewed]
    },
    show(name) {
      if (name === current || !files.some((f) => f.name === name)) return
      current = name
      if (stack) {
        paintHead()
        glideTo(name)
      } else present()
    },
    step: (dir) => picked(stepFile(files, current, dir)),
    update(next) {
      let redraw = false
      let moved = false
      let restyle = false
      if ("patch" in next || "files" in next) {
        const was = files
        input = {
          patch: "patch" in next ? next.patch : input.patch,
          files: "files" in next ? next.files : input.files,
        }
        files = diffFiles(input)
        current = keepFile(was, files, next.file ?? current)
        redraw = true
      } else if (
        next.file != null &&
        next.file !== current &&
        files.some((f) => f.name === next.file)
      ) {
        current = next.file
        moved = true
      }
      if (next.layout && next.layout !== layout) {
        layout = next.layout
        restyle = true
      }
      if (next.wrap !== undefined && next.wrap !== wrap) {
        wrap = next.wrap
        restyle = true
      }
      if (next.viewed) viewed = new Set(next.viewed)
      if (next.maxHeight !== undefined && next.maxHeight !== maxOption) {
        maxOption = next.maxHeight
        fitHeight()
      }
      if (next.height && (next.height === "auto") !== auto) setHeight(next.height)
      if (stack) {
        if (redraw) present()
        else if (restyle) relayout()
        else paintHead()
        if (moved && current) glideTo(current)
      } else if (redraw || moved || restyle) present()
      else if (next.viewed) paintHead()
    },
    ready,
    dispose() {
      disposed = true
      loop.stop()
      sizes.disconnect()
      attaching.disconnect()
      resized.disconnect()
      win.clearTimeout(settle)
      win.removeEventListener("resize", onWindow)
      for (const w of watchers) w.disconnect()
      near1?.disconnect()
      far4?.disconnect()
      win.cancelAnimationFrame(spyFrame)
      media?.removeEventListener("change", rescheme)
      for (const slot of all()) drop(slot)
      for (const p of parts) {
        p.view?.cleanUp()
        p.bars?.dispose()
      }
      stackBar?.dispose()
      stackFades?.dispose()
      root.remove()
    },
  }
}

export interface DiffReviewOptions extends CodeDiffOptions {
  /**
   * Saves whether the file list is open and the files marked viewed, under this id. A viewed
   * file whose change moves on comes back unviewed.
   */
  readonly id?: string
  readonly storage?: StoragePort | null
  /** The file list's title ("Files"). */
  readonly title?: string
  /** The file list's width in pixels when open (256). */
  readonly listSize?: number
  /** The file list starts open (the default) or closed; what was last chosen wins, with an id. */
  readonly listOpen?: boolean
  /** A field over the file list that narrows it by path (on by default). */
  readonly search?: boolean
}

export interface DiffReview {
  readonly element: HTMLElement
  readonly tree: Tree<DiffTreeItem>
  readonly diff: CodeDiff
  /** The files marked viewed. */
  readonly viewed: readonly string[]
  /** Marks files viewed or not (a folder's id marks what's in it). */
  setViewed(names: readonly string[], viewed: boolean): void
  /** Narrows the file list to paths with every word of `query`. */
  filter(query: string): void
  /** Whether the file list is open. */
  readonly listOpen: boolean
  /** Springs the file list open or closed (toggles without an argument). */
  toggleList(open?: boolean): void
  update(next: CodeDiffUpdate): void
  dispose(): void
}

/**
 * A diff beside its file list, as a review, in one card: the list is a drawer at its left that
 * springs open and shut (0 to 256px, .4 s, no bounce; the diff reflows as it moves) from a
 * button at the start of the diff's header, or ⌘B / Ctrl+B. In it, a field that narrows the list
 * by path, then the changed files as a compact tree (folders folded into paths), each with its
 * change as a letter (M, A, D, R, coloured), its +/− counts and their bar, and a tick to mark it
 * viewed; one highlight glides to the file on show. Viewed files dim, count in the list's title
 * and, with an `id`, are remembered until their change moves on. `tree` and `diff` are the pieces.
 */
export function diffReview(container: HTMLElement, options: DiffReviewOptions): DiffReview {
  const doc = container.ownerDocument
  const look: UiLook = {
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.appearance ? { appearance: options.appearance } : {}),
  }
  const title = options.title ?? "Files"
  const store = options.storage === undefined ? browserStorage() : options.storage
  const key = options.id ? storageKey(options.id, "viewed") : undefined
  const saved = (): Record<string, string> => {
    if (!store || !key) return {}
    try {
      const raw = JSON.parse(store.getItem(key) ?? "{}") as unknown
      return raw && typeof raw === "object" ? (raw as Record<string, string>) : {}
    } catch {
      return {}
    }
  }
  const win = doc.defaultView!
  const openKey = options.id ? storageKey(options.id, "drawer") : undefined
  const savedOpen = store && openKey ? store.getItem(openKey) : null
  let open = savedOpen === null ? options.listOpen !== false : savedOpen === "1"
  const size = options.listSize ?? 256

  const root = doc.createElement("div")
  root.className = "knobs-diff-review"
  root.dataset.height = options.height ?? "fill"
  applyLook(root, look)
  injectDiffStyles(doc)
  const drawer = doc.createElement("div")
  drawer.className = "knobs-diff-drawer"
  const inner = doc.createElement("div")
  inner.className = "knobs-diff-drawer-in"
  inner.style.width = `${size}px`
  const head = doc.createElement("div")
  head.className = "knobs-diff-drawer-head"
  const heading = doc.createElement("span")
  heading.className = "knobs-diff-drawer-title"
  heading.textContent = title
  const tally = doc.createElement("span")
  tally.className = "knobs-diff-drawer-count"
  head.append(heading, tally)
  drawer.append(inner)
  const main = doc.createElement("div")
  main.className = "knobs-diff-main"
  root.append(drawer, main)
  container.append(root)

  const toggle = doc.createElement("button")
  toggle.type = "button"
  toggle.className = "knobs-diff-btn knobs-diff-toggle"
  toggle.innerHTML = SIDEBAR
  toggle.setAttribute("aria-label", `${title} (⌘B)`)
  toggle.dataset.tip = `${title} ⌘B`
  toggle.setAttribute(
    "aria-controls",
    (inner.id = `knobs-diff-files-${Math.random().toString(36).slice(2, 8)}`),
  )

  const d = codeDiff(main, {
    ...options,
    height: options.height ?? "fill",
    lazy: false,
    nav: false,
    lead: toggle,
    viewed: options.viewed ?? [],
    onFile: (name) => {
      follow(name)
      options.onFile?.(name)
    },
    onViewed: (_, name) => setViewed([name], d.viewed.includes(name), true),
  })

  // The drawer: its width on the calm spring (no bounce), the list inside it pinned to its right
  // edge so it slides out from under the diff rather than squeezing; shut, it leaves the tab order.
  const width = new Spring(open ? size : 0, DRAWER.omega, DRAWER.zeta, 0.25)
  const paintDrawer = () => {
    const w = Math.max(0, width.x)
    drawer.style.width = `${Math.round(w * 2) / 2}px`
    inner.style.opacity = String(Math.min(1, (w / size) * 1.25).toFixed(3))
    const shut = width.resting && width.target === 0
    inner.inert = shut
    drawer.toggleAttribute("data-shut", shut)
    toggle.setAttribute("aria-pressed", String(open))
    toggle.setAttribute("aria-expanded", String(open))
  }
  const loop = frameLoop(win, (dt) => {
    width.step(dt)
    paintDrawer()
    return !width.resting
  })
  const toggleList = (next = !open) => {
    if (next === open) return
    open = next
    if (store && openKey) store.setItem(openKey, open ? "1" : "0")
    if (reducedMotion(win)) width.snap(open ? size : 0)
    else width.set(open ? size : 0)
    paintDrawer()
    loop.wake()
    if (!open && inner.contains(doc.activeElement)) toggle.focus()
  }
  toggle.addEventListener("click", () => toggleList())
  // ⌘B / Ctrl+B (an editor's sidebar key) while you're working in this review.
  let engaged = false
  const onDown = (e: Event) => {
    engaged = root.contains(e.target as Node)
  }
  const onKey = (e: KeyboardEvent) => {
    if (!engaged || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    if (e.key.toLowerCase() !== "b") return
    e.preventDefault()
    toggleList()
  }
  doc.addEventListener("pointerdown", onDown, true)
  doc.addEventListener("focusin", onDown, true)
  doc.addEventListener("keydown", onKey)
  paintDrawer()
  let viewed = new Set([...(options.viewed ?? []), ...stillViewed(saved(), d.files)])
  let items = diffTree(d.files)
  let files0 = d.files
  const byId = new Map<string, DiffTreeItem>()
  const index = () => {
    byId.clear()
    const walk = (list: readonly DiffTreeItem[]) =>
      list.forEach((i) => {
        byId.set(i.id, i)
        walk(i.children ?? [])
      })
    walk(items)
  }
  index()

  const box = doc.createElement("div")
  box.className = "knobs-diff-files"
  const field = doc.createElement("label")
  field.className = "knobs-diff-filter"
  field.hidden = options.search === false
  field.insertAdjacentHTML("afterbegin", SEARCH)
  const input = doc.createElement("input")
  input.type = "text"
  input.spellcheck = false
  input.autocomplete = "off"
  input.placeholder = "Filter files"
  input.setAttribute("aria-label", "Filter files")
  const clear = doc.createElement("button")
  clear.type = "button"
  clear.innerHTML = CLEAR
  clear.setAttribute("aria-label", "Clear filter")
  clear.hidden = true
  field.append(input, clear)
  const list = doc.createElement("div")
  list.className = "knobs-diff-list"
  box.append(field, list)
  inner.append(head, box)

  let query = ""
  const words = () => query.trim()
  /** The file's name with the first word of the filter it has marked. */
  const nameOf = (file: DiffFile) => {
    const { base } = splitPath(file.name)
    const el = doc.createElement("span")
    if (file.change === "deleted") el.className = "knobs-diff-gone"
    el.title = file.prevName ? `${file.prevName} → ${file.name}` : file.name
    const lower = base.toLowerCase()
    for (const word of words().toLowerCase().split(/\s+/)) {
      const at = word ? lower.indexOf(word) : -1
      if (at < 0) continue
      const mark = doc.createElement("mark")
      mark.className = "knobs-tree-mark"
      mark.textContent = base.slice(at, at + word.length)
      el.append(base.slice(0, at), mark, base.slice(at + word.length))
      return el
    }
    el.textContent = base
    return el
  }
  const isViewed = (item: DiffTreeItem) => {
    const names = filesUnder(item)
    return names.length > 0 && names.every((n) => viewed.has(n))
  }

  const t = tree<DiffTreeItem>(list, {
    ...look,
    items,
    label: title,
    glide: true,
    expanded: diffFolders(items),
    selection: d.file ? [d.file] : [],
    get empty() {
      return words() ? "No files match" : (options.empty ?? "No changes")
    },
    icon: (item) => (item.file ? diffStatus(item.file, doc) : undefined),
    detail: (item) => (item.file ? diffCounts(item.file, doc, { bar: true }) : undefined),
    render: (item) => (item.file ? nameOf(item.file) : undefined),
    toggles: [
      {
        id: "viewed",
        label: "Viewed",
        get: (item) => !isViewed(item),
        set: (ids, unviewed) =>
          setViewed(
            ids.flatMap((id) => {
              const item = byId.get(id)
              return item ? filesUnder(item) : []
            }),
            !unviewed,
            true,
          ),
        icon: (unviewed) => (unviewed ? UNVIEWED : VIEWED),
      },
    ],
    onSelect: (_, primary) => {
      if (!primary || primary.startsWith("dir:") || primary === d.file) return
      d.show(primary)
      options.onFile?.(primary)
    },
  })
  const follow = (name: string | null) => {
    if (!name) return
    t.reveal(name)
    t.select([name])
  }
  const count = () => {
    const n = d.files.length
    const v = d.files.filter((f) => viewed.has(f.name)).length
    tally.textContent = v ? `${v}/${n}` : String(n)
  }
  function setViewed(names: readonly string[], on: boolean, notify = false) {
    const next = new Set(viewed)
    for (const n of names) {
      const item = byId.get(n)
      for (const f of item ? filesUnder(item) : [n]) {
        if (on) next.add(f)
        else next.delete(f)
      }
    }
    if (next.size === viewed.size && [...next].every((n) => viewed.has(n))) return
    viewed = next
    const marked = [...viewed]
    d.update({ viewed: marked })
    t.refresh()
    count()
    if (store && key) store.setItem(key, JSON.stringify(saveViewed(viewed, d.files)))
    if (notify) options.onViewed?.(marked, names[0] ?? "")
  }
  d.update({ viewed: [...viewed] })

  const filter = (next: string) => {
    query = next
    if (input.value !== next) input.value = next
    clear.hidden = !next
    const w = words()
    t.filter(w ? (item: DiffTreeItem) => Boolean(item.file && matchPath(item.file.name, w)) : null)
    t.refresh()
  }
  const firstFile = () => t.rows().find((id) => !id.startsWith("dir:"))
  input.addEventListener("input", () => filter(input.value))
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault()
      if (query) filter("")
      else t.focus()
    } else if (e.key === "ArrowDown" || e.key === "Enter") {
      const id = (d.file && t.rows().includes(d.file) ? d.file : undefined) ?? firstFile()
      if (!id) return
      e.preventDefault()
      if (e.key === "Enter" && id !== d.file) {
        t.select([id])
        d.show(id)
        options.onFile?.(id)
      }
      t.focus(id)
    }
  })
  clear.addEventListener("click", () => {
    filter("")
    input.focus()
  })
  count()

  return {
    element: root,
    tree: t,
    diff: d,
    get viewed() {
      return [...viewed]
    },
    setViewed: (names, on) => setViewed(names, on),
    filter,
    get listOpen() {
      return open
    },
    toggleList: (next) => toggleList(next),
    update(next) {
      const { viewed: marks, ...rest } = next
      if (next.height) root.dataset.height = next.height
      d.update(rest)
      if (marks) {
        const want = new Set(marks)
        setViewed(
          [...viewed].filter((n) => !want.has(n)),
          false,
        )
        setViewed(marks, true)
      }
      if ("patch" in next || "files" in next) {
        const seen = new Set(diffFolders(items))
        items = diffTree(d.files)
        index()
        // Viewed files stay viewed while their change is the one marked.
        const marks = saveViewed(viewed, files0)
        files0 = d.files
        viewed = stillViewed(marks, d.files)
        d.update({ viewed: [...viewed] })
        t.update(items)
        // Folders open as they first appear; one folded by hand stays folded.
        for (const id of diffFolders(items)) if (!seen.has(id)) t.expand(id, true)
        t.refresh()
        count()
      }
      if (d.file && t.selection[0] !== d.file) follow(d.file)
    },
    dispose() {
      loop.stop()
      doc.removeEventListener("pointerdown", onDown, true)
      doc.removeEventListener("focusin", onDown, true)
      doc.removeEventListener("keydown", onKey)
      d.dispose()
      t.dispose()
      root.remove()
    },
  }
}
