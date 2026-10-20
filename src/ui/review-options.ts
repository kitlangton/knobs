// What a decision and a taste test share: options as columns that fill whole rows with hairlines
// between, each a kicker ("Option 1 · Recommended"), a title, a sentence, media and facts; and
// facts themselves, terms beside their values.
import {
  inlineMarkdown,
  optionColumns,
  type WalkFact,
  type WalkFactGroup,
} from "./walkthrough-model.js"

const el = <K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string) => {
  const n = doc.createElement(tag)
  if (cls) n.className = cls
  return n
}

/** Facts as a `<dl>` per group under its heading: terms in a gutter, values beside them. */
export function renderFacts(doc: Document, groups: readonly WalkFactGroup[]): HTMLElement {
  const box = el(doc, "div", "knobs-wt-facts")
  for (const g of groups) {
    if (!g.facts.length && !g.title) continue
    const group = el(doc, "section", "knobs-wt-fgroup")
    if (g.title) {
      const head = el(doc, "h3", "knobs-wt-fhead")
      head.innerHTML = inlineMarkdown(g.title)
      group.append(head)
    }
    if (g.facts.length) group.append(factList(doc, g.facts))
    box.append(group)
  }
  return box
}

function factList(doc: Document, facts: readonly WalkFact[]): HTMLElement {
  const dl = el(doc, "dl", "knobs-wt-fterms")
  for (const f of facts) {
    const row = el(doc, "div", "knobs-wt-fact")
    const dt = el(doc, "dt")
    dt.innerHTML = inlineMarkdown(f.term)
    const dd = el(doc, "dd")
    if (f.code) {
      dd.dataset.code = ""
      for (const v of f.value) {
        const chip = el(doc, "code")
        chip.textContent = v
        dd.append(chip)
      }
    } else
      for (const v of f.value) {
        const line = el(doc, "div")
        line.innerHTML = inlineMarkdown(v)
        dd.append(line)
      }
    row.append(dt, dd)
    dl.append(row)
  }
  return dl
}

export interface OptionView {
  /** "Option 1". */
  readonly number: string
  readonly title: string
  readonly summary?: string
  readonly recommended: boolean
  readonly facts?: readonly WalkFact[]
}

/**
 * One option's column: its head (a `div`, or the `button` given for picking), its sentence, then
 * `media(tile)` and its facts.
 */
export function optionTile(
  doc: Document,
  o: OptionView,
  options: { readonly head?: HTMLElement; readonly media?: (tile: HTMLElement) => void } = {},
): { readonly tile: HTMLElement; readonly head: HTMLElement; readonly kicker: HTMLElement } {
  const tile = el(doc, "div", "knobs-wt-option")
  const head = options.head ?? el(doc, "div")
  head.classList.add("knobs-wt-ohead")
  const kicker = el(doc, "span", "knobs-wt-okicker")
  const n = el(doc, "span")
  n.textContent = o.number
  kicker.append(n)
  if (o.recommended) {
    const rec = el(doc, "span", "knobs-wt-orec")
    rec.textContent = "Recommended"
    kicker.append(rec)
  }
  const title = el(doc, "span", "knobs-wt-otitle")
  title.innerHTML = inlineMarkdown(o.title)
  head.append(kicker, title)
  tile.append(head)
  if (o.summary) {
    const p = el(doc, "p", "knobs-wt-osum")
    p.innerHTML = inlineMarkdown(o.summary)
    tile.append(p)
  }
  options.media?.(tile)
  if (o.facts?.length) tile.append(renderFacts(doc, [{ facts: o.facts }]))
  return { tile, head, kicker }
}

/**
 * Lays `tiles` out in `root` as columns that fill whole rows, marking each with its column and
 * row for the hairlines, again whenever `root`'s width changes. Returns the cleanup.
 */
export function layoutOptions(root: HTMLElement, tiles: readonly HTMLElement[]): () => void {
  let cols = 0
  const layout = () => {
    const width = root.clientWidth
    if (!width) return
    const next = optionColumns(tiles.length, width)
    if (next === cols) return
    cols = next
    root.style.setProperty("--kw-cols", String(cols))
    const rows = Math.ceil(tiles.length / cols)
    tiles.forEach((t, i) => {
      const row = Math.floor(i / cols)
      t.dataset.col = String(i % cols)
      t.dataset.row = String(row)
      t.toggleAttribute("data-end", i % cols === cols - 1)
      t.toggleAttribute("data-last-row", row === rows - 1)
    })
  }
  layout()
  const win = root.ownerDocument.defaultView
  if (!win || typeof win.ResizeObserver !== "function") return () => {}
  const ro = new win.ResizeObserver(layout)
  ro.observe(root)
  return () => ro.disconnect()
}
