import type { MountPanelOptions } from "../core/store.js"
import type { Panel } from "./panel.js"
import { placeSegPill } from "./seg.js"
import { panOptions } from "./swipe.js"

export interface MountPageOptions extends MountPanelOptions {
  /** Section order; sections not listed follow in the order they first appear. */
  readonly sections?: readonly string[]
  /** The narrowest a column may get before the page drops one (px). Default 300. */
  readonly columnWidth?: number
  /** `/` filters rows by label, live. Default true. */
  readonly filter?: boolean
}

export interface PageCardOptions {
  readonly title?: string
  /** The section the card sits in; a new one is added after the others. */
  readonly section?: string
  /** Any content, placed in the card's body (more can follow with `card.body.append`). */
  readonly element?: HTMLElement
}

export interface PageAction {
  readonly label: string
  run(): void
  readonly disabled?: boolean
}

/** A control in a custom card; `set` shows a value that arrived from elsewhere (no `onChange`). */
export interface PageControl<T> {
  readonly element: HTMLElement
  get(): T
  set(value: T): void
}

export interface PageCard {
  /** The card itself. */
  readonly element: HTMLElement
  /** Where content goes. */
  readonly body: HTMLElement
  /** Right side of the card's header, for a badge or a small button. */
  readonly accessory: HTMLElement
  /** A segmented row, like a choice field (no `label` spans the card). */
  choice<T extends string>(options: {
    readonly label?: string
    readonly options: readonly (T | { readonly value: T; readonly label: string })[]
    readonly value: T
    onChange(value: T): void
  }): PageControl<T>
  /** A switch row. */
  toggle(options: {
    readonly label: string
    readonly value: boolean
    onChange(value: boolean): void
  }): PageControl<boolean>
  /** A row of buttons; `set` replaces them. */
  actions(items: readonly PageAction[]): {
    readonly element: HTMLElement
    set(items: readonly PageAction[]): void
  }
  /** A list row: a label, a quieter detail and, with `onSelect`, a keyboard stop (Enter). */
  item(options: {
    readonly label: string
    readonly detail?: string
    onSelect?(): void
  }): HTMLElement
  /** Empties the body. */
  clear(): void
  remove(): void
}

export interface Page extends Panel {
  /** A card of your own in the page's grid, styled by the same tokens. */
  card(options: PageCardOptions): PageCard
}

interface Section {
  readonly name: string
  readonly rank: number
  readonly element: HTMLElement
  readonly head: HTMLElement | null
  readonly grid: HTMLElement
  readonly columns: HTMLElement[]
  readonly tiles: HTMLElement[]
}

export interface PageLayout {
  readonly sections: readonly Section[]
  add(tile: HTMLElement, section: string): void
  remove(tile: HTMLElement): void
  /** Columns follow the width; tiles keep their order, split into balanced runs per column. */
  pack(force?: boolean): void
  readonly version: number
  dispose(): void
}

/**
 * Splits `heights` into at most `n` contiguous runs whose tallest is as short as possible, so
 * reading down a column and on to the next follows the original order.
 */
export function balancedRuns(heights: readonly number[], n: number, gap = 0): number[] {
  const m = heights.length
  const k = Math.max(1, Math.min(n, m))
  if (m === 0) return []
  const prefix = [0]
  for (const h of heights) prefix.push(prefix[prefix.length - 1]! + h)
  const run = (i: number, j: number) => prefix[j]! - prefix[i]! + gap * (j - i - 1)
  // best[c][j]: the tallest column when the first j tiles fill c columns.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(m + 1).fill(Infinity))
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(m + 1).fill(0))
  best[0]![0] = 0
  for (let c = 1; c <= k; c++)
    for (let j = c; j <= m; j++)
      for (let i = c - 1; i < j; i++) {
        const v = Math.max(best[c - 1]![i]!, run(i, j))
        if (v < best[c]![j]! - 1e-6) {
          best[c]![j] = v
          cut[c]![j] = i
        }
      }
  const sizes: number[] = []
  let j = m
  for (let c = k; c >= 1; c--) {
    const i = cut[c]![j]!
    sizes.unshift(j - i)
    j = i
  }
  return sizes
}

export function createPageLayout(
  doc: Document,
  host: HTMLElement,
  options: { order: readonly string[]; columnWidth: number; onLayout(): void },
): PageLayout {
  const sections: Section[] = []
  let appeared = 0
  let cols = 0
  let version = 0
  const el = (cls: string, tag: keyof HTMLElementTagNameMap = "div") => {
    const node = doc.createElement(tag)
    node.className = cls
    return node
  }
  const sectionFor = (name: string) => {
    let s = sections.find((x) => x.name === name)
    if (s) return s
    const listed = options.order.indexOf(name)
    const rank =
      name === "" && listed < 0 ? -1 : listed >= 0 ? listed : options.order.length + appeared++
    const element = el("knobs-section", "section")
    element.dataset.section = name
    const head = name ? el("knobs-section-head", "h2") : null
    if (head) {
      head.textContent = name
      element.setAttribute("aria-label", name)
      element.append(head)
    }
    const grid = el("knobs-columns")
    element.append(grid)
    s = { name, rank, element, head, grid, columns: [], tiles: [] }
    const after = sections.findIndex((x) => x.rank > rank)
    if (after < 0) {
      sections.push(s)
      host.append(element)
    } else {
      host.insertBefore(element, sections[after]!.element)
      sections.splice(after, 0, s)
    }
    return s
  }
  const gapOf = (grid: HTMLElement) => parseFloat(getComputedStyle(grid).columnGap) || 0

  function pack(force = false) {
    const first = sections[0]
    if (!first) return
    const gap = gapOf(first.grid)
    const width = first.grid.clientWidth
    // As many columns as fit, but no more than the fullest section fills: wider cards beat empty
    // columns.
    const most = Math.max(1, ...sections.map((s) => s.tiles.filter((t) => !t.hidden).length))
    const n = Math.max(
      1,
      Math.min(8, most, Math.floor((width + gap) / (options.columnWidth + gap))),
    )
    if (n === cols && !force) return
    cols = n
    host.style.setProperty("--k-cols", String(n))
    const active = doc.activeElement as HTMLElement | null
    for (const s of sections) {
      while (s.columns.length < n) {
        const column = el("knobs-column")
        s.columns.push(column)
        s.grid.append(column)
      }
      while (s.columns.length > n) s.columns.pop()!.remove()
      const shown = s.tiles.filter((t) => !t.hidden)
      s.element.hidden = shown.length === 0
      // Measured at the column width, all in one column, then split into balanced runs.
      for (const t of s.tiles) s.columns[0]!.append(t)
      const sizes = balancedRuns(
        shown.map((t) => t.offsetHeight),
        n,
        gap,
      )
      let at = 0
      sizes.forEach((size, c) => {
        for (const t of shown.slice(at, at + size)) s.columns[c]!.append(t)
        at += size
      })
    }
    // Moving a tile takes focus with it; put it back without scrolling.
    if (active && active !== doc.activeElement && active.isConnected)
      active.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    version++
    options.onLayout()
  }

  const resize = new ResizeObserver(() => pack())
  resize.observe(host)
  return {
    sections,
    add(tile, name) {
      sectionFor(name).tiles.push(tile)
      sectionFor(name).columns[0]?.append(tile)
    },
    remove(tile) {
      for (const s of sections) {
        const i = s.tiles.indexOf(tile)
        if (i >= 0) s.tiles.splice(i, 1)
      }
      tile.remove()
    },
    pack,
    get version() {
      return version
    },
    dispose() {
      resize.disconnect()
    },
  }
}

/** Whether a field, group or card answers the filter: every word appears somewhere in `text`. */
export function matchesFilter(query: string, ...text: (string | undefined)[]) {
  const hay = text.filter(Boolean).join(" ").toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

export function createCustomCard(
  doc: Document,
  options: PageCardOptions,
  hooks: { wake(): void; remove(tile: HTMLElement): void },
): PageCard {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const node = doc.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }
  const tile = el("div", "knobs-tile knobs-live")
  const head = el("div", "knobs-group-head")
  const accessory = el("span")
  if (options.title) {
    tile.dataset.card = options.title
    tile.setAttribute("aria-label", options.title)
    const title = el("span", "knobs-group-title")
    title.append(el("span", "knobs-group-label", options.title))
    head.append(title, accessory)
    tile.append(head)
  }
  const body = el("div", "knobs-tile-body")
  tile.append(body)
  if (options.element) body.append(options.element)
  /** Rows join the inset card above them, as fields do; anything else starts a new one. */
  const inset = () => {
    const last = body.lastElementChild
    if (last?.classList.contains("knobs-card")) return last as HTMLElement
    const card = el("div", "knobs-card")
    body.append(card)
    return card
  }
  const arrows = (event: KeyboardEvent) =>
    event.key === "ArrowLeft" || event.key === "h"
      ? -1
      : event.key === "ArrowRight" || event.key === "l"
        ? 1
        : 0
  const quiet = (node: HTMLElement) =>
    node.focus({ preventScroll: true, focusVisible: false } as FocusOptions)

  return {
    element: tile,
    body,
    accessory,
    choice<T extends string>(o: {
      readonly label?: string
      readonly options: readonly (T | { readonly value: T; readonly label: string })[]
      readonly value: T
      onChange(value: T): void
    }) {
      const list = o.options.map((x) => (typeof x === "string" ? { value: x, label: x } : x))
      const row = el("div", o.label ? "knobs-row" : "knobs-row knobs-row-full")
      if (o.label) row.append(el("span", undefined, o.label))
      const seg = el("div", "knobs-seg")
      const pill = el("span", "knobs-seg-pill")
      pill.setAttribute("aria-hidden", "true")
      seg.append(pill)
      seg.tabIndex = 0
      seg.dataset.knobsStop = ""
      seg.setAttribute("role", "radiogroup")
      if (o.label) seg.setAttribute("aria-label", o.label)
      let value = o.value
      const choose = (next: T) => {
        if (next === value) return
        value = next
        placeSegPill(seg, buttons, value)
        o.onChange(value)
        hooks.wake()
      }
      const buttons = list.map((x) => {
        const b = el("button", undefined, x.label)
        b.type = "button"
        b.tabIndex = -1
        b.dataset.value = x.value
        b.setAttribute("role", "radio")
        b.onclick = () => {
          choose(x.value)
          quiet(seg)
        }
        seg.append(b)
        return b
      })
      const step = (direction: number) => {
        const at = list.findIndex((x) => x.value === value)
        const next = (at + direction + list.length) % list.length
        if (list[next]) choose(list[next]!.value)
      }
      seg.addEventListener("keydown", (event) => {
        const d = arrows(event)
        if (!d || event.metaKey || event.altKey) return
        event.preventDefault()
        event.stopPropagation()
        step(d)
      })
      panOptions(seg, {
        box: seg,
        pill,
        buttons: () => buttons,
        selected: () => list.findIndex((x) => x.value === value),
        select: (i) => choose(list[i]!.value),
        rest: () => placeSegPill(seg, buttons, value),
        wake: () => hooks.wake(),
      })
      new ResizeObserver(() => placeSegPill(seg, buttons, value, true)).observe(seg)
      row.append(seg)
      inset().append(row)
      placeSegPill(seg, buttons, value)
      return {
        element: row,
        get: () => value,
        set(next: T) {
          if (next === value) return
          value = next
          placeSegPill(seg, buttons, value)
          hooks.wake()
        },
      }
    },
    toggle(o) {
      const row = el("div", "knobs-row")
      row.append(el("span", undefined, o.label))
      const toggle = el("button", "knobs-toggle")
      toggle.type = "button"
      toggle.dataset.knobsStop = ""
      toggle.setAttribute("role", "switch")
      toggle.setAttribute("aria-label", o.label)
      toggle.append(el("i"))
      let value = o.value
      const paint = () => toggle.setAttribute("aria-checked", String(value))
      const flip = () => {
        value = !value
        paint()
        o.onChange(value)
        hooks.wake()
      }
      toggle.onclick = flip
      toggle.addEventListener("keydown", (event) => {
        if (!arrows(event)) return
        event.preventDefault()
        event.stopPropagation()
        flip()
      })
      paint()
      row.append(toggle)
      inset().append(row)
      return {
        element: row,
        get: () => value,
        set(next: boolean) {
          if (next === value) return
          value = next
          paint()
          hooks.wake()
        },
      }
    },
    actions(items) {
      const bar = el("div", "knobs-custom-actions")
      // One ↑↓ stop for the row; ←→ move along it and focus lands on the last button used.
      bar.tabIndex = -1
      bar.dataset.knobsStop = ""
      let last: HTMLButtonElement | undefined
      const buttons = () => [...bar.querySelectorAll("button")].filter((b) => !b.disabled)
      bar.addEventListener("focus", () => {
        const list = buttons()
        ;(last && list.includes(last) ? last : list[0])?.focus({ preventScroll: true })
      })
      bar.addEventListener("focusin", (event) => {
        if (event.target instanceof HTMLButtonElement) last = event.target
      })
      bar.addEventListener("keydown", (event) => {
        const d = arrows(event)
        const list = buttons()
        const at = list.indexOf(event.target as HTMLButtonElement)
        if (!d || at < 0) return
        event.preventDefault()
        event.stopPropagation()
        list[(at + d + list.length) % list.length]?.focus()
      })
      const set = (next: readonly PageAction[]) => {
        bar.replaceChildren(
          ...next.map((a) => {
            const b = el("button", undefined, a.label)
            b.type = "button"
            b.disabled = Boolean(a.disabled)
            b.onclick = () => {
              a.run()
              hooks.wake()
            }
            return b
          }),
        )
        hooks.wake()
      }
      set(items)
      body.append(bar)
      return { element: bar, set }
    },
    item(o) {
      const row = el("div", "knobs-row knobs-item")
      row.append(el("span", undefined, o.label))
      if (o.detail) row.append(el("span", "knobs-item-detail", o.detail))
      if (o.onSelect) {
        const select = o.onSelect
        row.tabIndex = 0
        row.dataset.knobsStop = ""
        row.setAttribute("role", "button")
        row.onclick = () => select()
        row.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          select()
        })
      }
      inset().append(row)
      return row
    },
    clear() {
      body.replaceChildren()
      hooks.wake()
    },
    remove() {
      hooks.remove(tile)
    },
  }
}
