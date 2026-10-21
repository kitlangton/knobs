// The scope line beside a panel's title: where keys go (`› Shape › Cohesion`, the deepest crumb
// bright and its parents dim) and, for a moment after a key, a faint `esc ↑ Shape` for where Esc
// goes. Crumbs keep their identity as focus moves: one that stays glides to its new place, one
// that changes fades out as the new one fades in beside it, nothing pops. A click on a crumb (or
// on the title) takes focus to its level. The GPU overlay draws the same spans (see renderer).

import { springLinear, SPRINGS } from "../core/motion.js"
import { type Crumb, type CrumbLevel, fitCrumbs } from "./scope.js"

/** Crumbs glide on Kit's "default" spring (.3 s, no bounce). */
const glide = springLinear(SPRINGS.default)
export const CRUMB_GLIDE = `${glide.ms}ms ${glide.easing}`
/** How far a crumb arriving (or leaving) travels as it fades (px). */
const SLIDE = 5
/** Between the title and the trail, and before the Esc hint (px). */
const GAP = 6
const HINT_GAP = 10
const SEP = "›"

export interface CrumbsView {
  readonly element: HTMLElement
  /** The trail for where focus is, and where Esc goes from there (none at the panel). */
  set(trail: readonly Crumb[], esc?: string): void
  /** Shows or quiets the Esc hint. */
  hint(on: boolean): void
  /** Re-place it after the header's layout changed. */
  layout(): void
  dispose(): void
}

interface Piece {
  key: string
  text: string
  kind: "crumb" | "sep" | "esc"
  level?: CrumbLevel
  deep?: boolean
}

export function createCrumbs(o: {
  header: HTMLElement
  title: HTMLElement
  jump: (level: CrumbLevel | "panel") => void
  reduced: () => boolean
  wake: () => void
}): CrumbsView {
  const doc = o.header.ownerDocument
  const element = doc.createElement("div")
  element.className = "knobs-crumbs"
  element.setAttribute("aria-hidden", "true")
  o.header.append(element)
  const live = new Map<string, HTMLElement>()
  let trail: readonly Crumb[] = []
  let esc: string | undefined
  let hinting = false
  let ctx: CanvasRenderingContext2D | null | undefined

  const width = (text: string) => {
    if (ctx === undefined) ctx = doc.createElement("canvas").getContext("2d")
    if (!ctx) return text.length * 6
    const cs = getComputedStyle(element)
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    return ctx.measureText(text).width
  }
  /** Where the title's text ends, in the header's box. */
  const titleEnd = (head: DOMRect) => {
    const t = o.title.getBoundingClientRect()
    if (!o.title.textContent) return { x: t.left - head.left, right: t.right - head.left, t }
    const range = doc.createRange()
    range.selectNodeContents(o.title)
    const r = range.getBoundingClientRect()
    return { x: Math.min(r.right, t.right) - head.left + GAP, right: t.right - head.left, t }
  }

  const build = (): { pieces: Piece[]; xs: number[] } => {
    if (!trail.length) return { pieces: [], xs: [] }
    const head = o.header.getBoundingClientRect()
    const { x, right } = titleEnd(head)
    const sepW = width(SEP) + GAP * 2
    const escText = esc ? `esc ↑ ${esc}` : ""
    const fit = fitCrumbs(
      trail.map((c) => width(c.label)),
      Math.max(0, right - x - sepW),
      sepW,
      escText ? width(escText) + HINT_GAP - sepW : 0,
    )
    if (fit.from >= trail.length) return { pieces: [], xs: [] }
    const pieces: Piece[] = [{ key: "sep:lead", text: SEP, kind: "sep" }]
    trail.forEach((c, i) => {
      if (i < fit.from) return
      if (i > fit.from) pieces.push({ key: `sep:${c.level}`, text: SEP, kind: "sep" })
      pieces.push({
        key: `${c.level}:${c.label}`,
        text: c.label,
        kind: "crumb",
        level: c.level,
        deep: i === trail.length - 1,
      })
    })
    if (escText && fit.hint) pieces.push({ key: `esc:${esc}`, text: escText, kind: "esc" })
    const xs: number[] = []
    let at = x
    for (const p of pieces) {
      if (p.kind === "esc") at += HINT_GAP - GAP
      xs.push(at)
      at += width(p.text) + (p.kind === "sep" ? GAP : p.kind === "esc" ? 0 : GAP)
    }
    return { pieces, xs }
  }

  const place = () => {
    const head = o.header.getBoundingClientRect()
    const t = o.title.getBoundingClientRect()
    element.style.top = `${(t.top - head.top + t.height / 2).toFixed(2)}px`
  }

  const leave = (key: string, node: HTMLElement, x: number) => {
    live.delete(key)
    node.dataset.leaving = ""
    node.style.opacity = "0"
    if (!o.reduced()) node.style.translate = `${(x - SLIDE).toFixed(2)}px -50%`
    setTimeout(() => node.remove(), 320)
  }

  const render = () => {
    place()
    const { pieces, xs } = build()
    const keep = new Set(pieces.map((p) => p.key))
    for (const [key, node] of live)
      if (!keep.has(key)) leave(key, node, parseFloat(node.dataset.x ?? "0"))
    const reduced = o.reduced()
    pieces.forEach((p, i) => {
      const x = xs[i]!
      let node = live.get(p.key)
      if (!node) {
        node = doc.createElement("span")
        node.className = `knobs-crumb-${p.kind}`
        node.textContent = p.text
        if (p.level) node.dataset.level = p.level
        node.style.opacity = "0"
        node.style.translate = `${(x + (reduced ? 0 : SLIDE)).toFixed(2)}px -50%`
        element.append(node)
        live.set(p.key, node)
        // Starts from there: the next frame's change transitions.
        node.getBoundingClientRect()
      }
      node.dataset.x = String(x)
      node.toggleAttribute("data-deep", Boolean(p.deep))
      node.style.translate = `${x.toFixed(2)}px -50%`
      node.style.opacity = p.kind === "esc" && !hinting ? "0" : "1"
    })
    o.wake()
  }

  // A click on a crumb takes focus there; it never starts a drag or takes focus itself.
  const onDown = (event: PointerEvent) => {
    if (!(event.target as Element).closest?.("[data-level]")) return
    event.preventDefault()
    event.stopPropagation()
  }
  const onClick = (event: MouseEvent) => {
    const node = (event.target as Element).closest?.<HTMLElement>("[data-level]")
    if (!node || "leaving" in node.dataset) return
    event.stopPropagation()
    o.jump(node.dataset.level as CrumbLevel)
  }
  element.addEventListener("pointerdown", onDown)
  element.addEventListener("mousedown", onDown as (e: MouseEvent) => void)
  element.addEventListener("click", onClick)
  // The header's width (or the title's) changing moves where the trail starts and what fits.
  let size = ""
  const sizes =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          const r = o.title.getBoundingClientRect()
          const next = `${r.width}|${r.height}|${o.title.textContent}`
          if (next === size) return
          size = next
          if (trail.length) render()
        })
  sizes?.observe(o.header)
  sizes?.observe(o.title)

  return {
    element,
    set(next, nextEsc) {
      const same =
        next.length === trail.length &&
        next.every((c, i) => c.level === trail[i]!.level && c.label === trail[i]!.label) &&
        nextEsc === esc
      if (same) return
      trail = next
      esc = nextEsc
      render()
    },
    hint(on) {
      if (on === hinting) return
      hinting = on
      for (const [key, node] of live)
        if (key.startsWith("esc:")) node.style.opacity = on ? "1" : "0"
      o.wake()
    },
    layout() {
      if (trail.length) render()
    },
    dispose() {
      sizes?.disconnect()
      element.remove()
    },
  }
}
