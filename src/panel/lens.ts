// The focus lens: one shape that marks where keys go (a part of an open editor, a row, its card,
// the panel) and morphs between them. Going in it shrinks onto the target; Esc grows it out to
// the parent; leaving the panel it grows to the panel's edge and fades. A row to its neighbour
// glides. It's a soft wash with a hairline edge, drawn by the DOM (a div in the panel) or the GPU
// overlay from the same frames.
//
// The shape is the target's live rect and corners plus an offset that springs to zero (by
// duration, no bounce), so at rest it sits exactly on its target (a row's own shape inside its
// card, a card's own rounded rect) however the panel scrolls or reflows, and a retarget mid-flight
// goes straight from where the shape is drawn, keeping its speed. A target that doesn't show (a
// row under the pointer, say) gets no travel: the shape fades where it was.

import { clamp, Roll } from "./motion.js"

/** Corner radii: top left, top right, bottom right, bottom left. */
export type LensCorners = [number, number, number, number]

/** A box with its corners, in viewport px. */
export interface LensBox {
  x: number
  y: number
  w: number
  h: number
  r: LensCorners
}

export type LensLevel = "editor" | "row" | "card" | "panel"

/**
 * One shape to draw: its box, how present it is (0–1), and its wash and edge (shares of
 * --k-surface-hi and --k-line-hi).
 */
export interface LensShape extends LensBox {
  alpha: number
  wash: number
  line: number
}

/** The look, from the panel's `--k-lens-*` tokens (see the README). */
export interface LensTune {
  /** The morph's duration (ms), a spring with no bounce. */
  ms: number
  /** How much quicker the size settles than the position (1: together). */
  lead: number
  /** The wash: a share of --k-surface-hi. */
  wash: number
  /** The hairline edge: a share of --k-line-hi. */
  line: number
  /** The wash at the panel's level, where the shape covers everything (a share of `wash`). */
  panelWash: number
  /** A row's (or an editor part's) shape sits this far inside it (px). */
  inset: number
  /** The panel's shape sits this far inside its edge (px). */
  panelInset: number
}

export const LENS_DEFAULTS: LensTune = {
  ms: 180,
  lead: 1,
  wash: 0.9,
  line: 0.65,
  panelWash: 0.35,
  inset: 0,
  panelInset: 0,
}

const TUNE_PROPS: Record<keyof LensTune, string> = {
  ms: "--k-lens-ms",
  lead: "--k-lens-lead",
  wash: "--k-lens-wash",
  line: "--k-lens-line",
  panelWash: "--k-lens-panel-wash",
  inset: "--k-lens-inset",
  panelInset: "--k-lens-panel-inset",
}

export function readLensTune(style: CSSStyleDeclaration): LensTune {
  const out = { ...LENS_DEFAULTS }
  for (const key of Object.keys(TUNE_PROPS) as (keyof LensTune)[]) {
    const v = parseFloat(style.getPropertyValue(TUNE_PROPS[key]))
    if (Number.isFinite(v)) out[key] = v
  }
  out.ms = Math.max(0, out.ms)
  out.lead = Math.max(0.1, out.lead)
  out.inset = Math.max(0, out.inset)
  out.panelInset = Math.max(0, out.panelInset)
  return out
}

/**
 * Offsets that decay to zero on a critically damped spring (ω = 2π / duration), sampled by time:
 * x(t) = (x₀ + (v₀ + ωx₀)t)·e^(−ωt). Each channel has its own ω.
 */
export class Glide {
  private x0: number[]
  private v0: number[]
  private t0 = 0
  constructor(
    public omegas: readonly number[],
    private readonly eps = 0.2,
  ) {
    this.x0 = omegas.map(() => 0)
    this.v0 = omegas.map(() => 0)
  }
  sample(now: number): { x: number[]; v: number[] } {
    const t = Math.max(0, (now - this.t0) / 1000)
    const x: number[] = []
    const v: number[] = []
    this.omegas.forEach((w, i) => {
      const a = this.x0[i]!
      const b = this.v0[i]! + w * a
      const e = Math.exp(-w * t)
      x.push((a + b * t) * e)
      v.push((this.v0[i]! - w * b * t) * e)
    })
    return { x, v }
  }
  /** From `now`, the offsets are `x` moving at `v` (px/s). */
  set(x: readonly number[], v: readonly number[], now: number, omegas?: readonly number[]) {
    if (omegas) this.omegas = omegas
    this.x0 = this.omegas.map((_, i) => x[i] ?? 0)
    this.v0 = this.omegas.map((_, i) => v[i] ?? 0)
    this.t0 = now
  }
  zero() {
    this.x0 = this.x0.map(() => 0)
    this.v0 = this.v0.map(() => 0)
  }
  resting(now: number) {
    const { x, v } = this.sample(now)
    return x.every((d) => Math.abs(d) < this.eps) && v.every((d) => Math.abs(d) < this.eps * 8)
  }
}

/** The ω for a spring that settles in `ms` with no bounce (knobs' mapping: ω = 2π / duration). */
export const omegaOf = (ms: number) => (2 * Math.PI) / Math.max(0.001, ms / 1000)

/** A box as glide channels (x, y, w, h, then the four radii), and back. */
export const boxChannels = (b: LensBox) => [b.x, b.y, b.w, b.h, ...b.r]
export const boxPlus = (b: LensBox, d: readonly number[]): LensBox => ({
  x: b.x + (d[0] ?? 0),
  y: b.y + (d[1] ?? 0),
  w: b.w + (d[2] ?? 0),
  h: b.h + (d[3] ?? 0),
  r: [0, 1, 2, 3].map((i) => Math.max(0, b.r[i]! + (d[4 + i] ?? 0))) as LensCorners,
})
const boxDiff = (a: LensBox, b: LensBox) => {
  const x = boxChannels(a)
  const y = boxChannels(b)
  return x.map((v, i) => v - y[i]!)
}

/**
 * The corners a box inside a rounded container shows: where one of its corners sits on the
 * container's (within half a pixel), the container's radius there, else its own. A row in a card
 * is square but for the card's corners it reaches; so is an editor's part.
 */
export function cornersWithin(
  box: { left: number; top: number; right: number; bottom: number },
  own: LensCorners,
  outer?: { left: number; top: number; right: number; bottom: number; r: LensCorners },
): LensCorners {
  if (!outer) return own
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5
  const l = near(box.left, outer.left)
  const r = near(box.right, outer.right)
  const t = near(box.top, outer.top)
  const b = near(box.bottom, outer.bottom)
  return [
    l && t ? Math.max(own[0], outer.r[0]) : own[0],
    r && t ? Math.max(own[1], outer.r[1]) : own[1],
    r && b ? Math.max(own[2], outer.r[2]) : own[2],
    l && b ? Math.max(own[3], outer.r[3]) : own[3],
  ]
}

export interface LensTarget {
  readonly el: HTMLElement
  readonly level: LensLevel
}

export interface LensOptions {
  readonly root: HTMLElement
  /** A page: the panel's level is what shows of it under its header. */
  readonly header?: HTMLElement
  readonly page?: boolean
  /** Whether a target shows now (a row's only while keys are in use, say). */
  readonly shown: (target: LensTarget) => boolean
  readonly reduced: () => boolean
  /** Asks the GPU overlay for a frame. */
  readonly wake: () => void
  /** While the layout glides (a page's cards): the DOM shape is re-placed every frame. */
  readonly follow?: () => boolean
}

export interface Lens {
  /** The element the DOM draws it with. */
  readonly element: HTMLElement
  /** Where focus is: a target, `null` to fade where it is, or "out" to grow out and fade. */
  set(target: LensTarget | null | "out"): void
  readonly target: LensTarget | null
  /** The shapes to draw at `now` (viewport px). */
  frame(now: number): LensShape[]
  moving(now: number): boolean
  tune(): LensTune
  /** Re-place it (a scroll, a resize, a change in what shows). */
  poke(followMs?: number): void
  dispose(): void
}

interface Ghost {
  target: LensTarget
  from: number
  start: number
}

export function createLens(o: LensOptions): Lens {
  const { root } = o
  const doc = root.ownerDocument
  const win = doc.defaultView
  const element = doc.createElement("div")
  element.className = "knobs-lens"
  element.setAttribute("aria-hidden", "true")
  root.append(element)
  const extras: HTMLElement[] = []

  let tune = readLensTune(getComputedStyle(root))
  const omegas = () => {
    const w = omegaOf(tune.ms)
    const s = w * tune.lead
    return [w, w, s, s, s, s, s, s]
  }
  const glide = new Glide(omegas())
  const alpha = new Roll(0)
  let alphaTarget = 0
  let current: LensTarget | null = null
  let out = false
  let ghosts: Ghost[] = []

  const radiiOf = (el: Element): LensCorners => {
    const cs = getComputedStyle(el)
    return [
      parseFloat(cs.borderTopLeftRadius) || 0,
      parseFloat(cs.borderTopRightRadius) || 0,
      parseFloat(cs.borderBottomRightRadius) || 0,
      parseFloat(cs.borderBottomLeftRadius) || 0,
    ]
  }
  const all = (r: number): LensCorners => [r, r, r, r]
  /** The panel's box: inside its edge, or on a page what shows under its header. */
  const panelBox = (inset: number): LensBox => {
    const r = root.getBoundingClientRect()
    if (o.page) {
      const top = Math.max(r.top, o.header?.getBoundingClientRect().bottom ?? 0)
      const bottom = Math.min(r.bottom, win?.innerHeight ?? r.bottom)
      const pad = 8 + inset
      const radius = parseFloat(getComputedStyle(root).getPropertyValue("--kt-panel-radius")) || 0
      return {
        x: r.left + pad,
        y: top + pad,
        w: Math.max(0, r.width - pad * 2),
        h: Math.max(0, bottom - top - pad * 2),
        r: all(Math.max(0, radius)),
      }
    }
    // Inside the panel's border: its own corners, less the border and the inset.
    const k = root.clientLeft + inset
    return {
      x: r.left + k,
      y: r.top + k,
      w: Math.max(0, r.width - k * 2),
      h: Math.max(0, r.height - k * 2),
      r: radiiOf(root).map((v) => Math.max(0, v - k)) as LensCorners,
    }
  }
  const measure = (t: LensTarget): LensBox => {
    if (t.level === "panel") return panelBox(tune.panelInset)
    const r = t.el.getBoundingClientRect()
    if (t.level === "card")
      return { x: r.left, y: r.top, w: r.width, h: r.height, r: radiiOf(t.el) }
    // A row (or an editor's part) as it shows: its own corners, rounded where it meets its card's.
    const card = t.el.closest<HTMLElement>(".knobs-card")
    const cr = card?.getBoundingClientRect()
    const corners = cornersWithin(
      r,
      radiiOf(t.el),
      cr && { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom, r: radiiOf(card!) },
    )
    const k = Math.min(tune.inset, r.height / 4)
    return {
      x: r.left + k,
      y: r.top + k,
      w: Math.max(0, r.width - k * 2),
      h: Math.max(0, r.height - k * 2),
      r: corners.map((v) => Math.max(0, v - k)) as LensCorners,
    }
  }
  /** Where the shape heads: its target, or on the way out the panel's edge. */
  const goal = (): LensBox | undefined => {
    if (out) return panelBox(0)
    return current?.el.isConnected ? measure(current) : undefined
  }
  const drawnAt = (now: number): { box: LensBox; v: number[] } | undefined => {
    const live = goal()
    if (!live) return undefined
    const { x, v } = glide.sample(now)
    return { box: boxPlus(live, x), v }
  }
  const visibleNow = () => (current && !out ? current.el.isConnected && o.shown(current) : false)
  const fadeMs = () => (o.reduced() ? 160 : Math.min(160, Math.max(90, tune.ms * 0.7)))
  const syncAlpha = (now: number) => {
    const next = visibleNow() ? 1 : 0
    if (next === alphaTarget) return
    alphaTarget = next
    // Out of the panel the shape fades as it grows, on the morph's own time.
    alpha.set(next, out && !o.reduced() ? tune.ms : fadeMs(), now)
  }
  /** The shape now showing fades where it is (no travel). */
  const fadeHere = (now: number, shownAlpha: number) => {
    if (current && !out && shownAlpha > 0.02)
      ghosts.push({ target: current, from: shownAlpha, start: now })
    alpha.snap(0)
    alphaTarget = 0
    glide.zero()
  }

  const set = (next: LensTarget | null | "out") => {
    const now = performance.now()
    tune = readLensTune(getComputedStyle(root))
    const leaving = next === "out"
    const target = leaving || next === null ? null : next
    if (target && current && !out && target.el === current.el && target.level === current.level)
      return
    if (leaving && (out || !current)) return
    const shownAlpha = clamp(alpha.sample(now).position, 0, 1)
    const was = shownAlpha > 0.02 ? drawnAt(now) : undefined
    const reduced = o.reduced()
    if (next === null) {
      // Focus is somewhere the lens doesn't mark (a header button, a tab): it fades in place.
      fadeHere(now, shownAlpha)
      current = null
      out = false
      return poke(0)
    }
    if (leaving) {
      if (reduced || !was) {
        // No growing out under reduced motion (or with nothing showing): it fades where it is.
        fadeHere(now, shownAlpha)
      } else {
        glide.set(boxDiff(was.box, panelBox(0)), was.v, now, omegas())
      }
      out = true
      syncAlpha(now)
      return poke(0)
    }
    const live = measure(target!)
    // Straight from where the shape is drawn to the new target, keeping its speed, but only
    // when both show: a hidden target gets no travel, so nothing passes through other levels.
    const travel = was && !out && !reduced && o.shown(target!)
    if (travel) glide.set(boxDiff(was.box, live), was.v, now, omegas())
    else fadeHere(now, shownAlpha)
    out = false
    current = target
    syncAlpha(now)
    observe()
    poke(0)
  }

  /** A shape's look at `level`. */
  const look = (box: LensBox, level: LensLevel, a: number): LensShape => ({
    ...box,
    alpha: a,
    wash: tune.wash * (level === "panel" ? tune.panelWash : 1),
    line: tune.line,
  })
  const frame = (now: number): LensShape[] => {
    syncAlpha(now)
    const shapes: LensShape[] = []
    const a = clamp(alpha.sample(now).position, 0, 1)
    const d = a > 0.002 ? drawnAt(now) : undefined
    if (d) shapes.push(look(d.box, out ? "panel" : (current?.level ?? "panel"), a))
    const fade = fadeMs()
    ghosts = ghosts.filter((g) => now - g.start < fade && g.target.el.isConnected)
    for (const g of ghosts) {
      const k = 1 - (now - g.start) / fade
      shapes.push(look(measure(g.target), g.target.level, g.from * k * k))
    }
    return shapes
  }

  const moving = (now: number) => !glide.resting(now) || !alpha.resting(now) || ghosts.length > 0

  // ——— The DOM's shape: a div per shape, placed in the panel's own coordinates ———
  let raf = 0
  let followUntil = 0
  const px = (v: number) => `${Math.max(0, v).toFixed(2)}px`
  const place = (node: HTMLElement, s: LensShape | undefined, origin: DOMRect) => {
    if (!s) {
      if (node.style.opacity !== "0") node.style.opacity = "0"
      return
    }
    const x = s.x - origin.left - root.clientLeft + root.scrollLeft
    const y = s.y - origin.top - root.clientTop + root.scrollTop
    node.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`
    node.style.width = px(s.w)
    node.style.height = px(s.h)
    node.style.borderRadius = s.r.map(px).join(" ")
    node.style.opacity = s.alpha.toFixed(3)
    node.style.setProperty("--kl-w", s.wash.toFixed(3))
    node.style.setProperty("--kl-l", s.line.toFixed(3))
  }
  const draw = (now: number) => {
    const shapes = frame(now)
    // The GPU overlay draws them meanwhile (the DOM's are hidden under it).
    if (root.dataset.gpuActive === "true") return
    const origin = root.getBoundingClientRect()
    place(element, shapes[0], origin)
    for (let i = 1; i < shapes.length; i++) {
      let node = extras[i - 1]
      if (!node) {
        node = doc.createElement("div")
        node.className = "knobs-lens"
        node.setAttribute("aria-hidden", "true")
        root.append(node)
        extras.push(node)
      }
      place(node, shapes[i], origin)
    }
    for (let i = Math.max(0, shapes.length - 1); i < extras.length; i++)
      place(extras[i]!, undefined, origin)
  }
  const tick = () => {
    raf = 0
    const now = performance.now()
    draw(now)
    if (moving(now) || now < followUntil || o.follow?.())
      raf = win?.requestAnimationFrame(tick) ?? 0
  }
  const poke = (followMs = 0) => {
    const now = performance.now()
    followUntil = Math.max(followUntil, now + followMs)
    if (!raf && win) raf = win.requestAnimationFrame(tick)
    o.wake()
  }

  // A target that changes size (an editor opening, a card folding) or a panel that does.
  const sizes =
    typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => poke(0))
  let observed: Element | null = null
  const observe = () => {
    const el = current?.el ?? null
    if (el === observed || !sizes) return
    if (observed && observed !== root) sizes.unobserve(observed)
    if (el && el !== root) sizes.observe(el)
    observed = el
  }
  sizes?.observe(root)
  // Keys taking over from the pointer (or the pointer coming back) change what shows.
  const attrs = new MutationObserver(() => poke(0))
  attrs.observe(root, { attributes: true, attributeFilter: ["data-k-row-hover", "data-keyboard"] })

  return {
    element,
    set,
    get target() {
      return out ? null : current
    },
    frame,
    moving,
    tune: () => tune,
    poke,
    dispose() {
      if (raf) win?.cancelAnimationFrame(raf)
      sizes?.disconnect()
      attrs.disconnect()
      element.remove()
      for (const e of extras) e.remove()
    },
  }
}
