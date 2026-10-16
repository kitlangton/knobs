// The focus lens: one shape that marks where keys go (a part of an open editor, a row, its card,
// the panel) and morphs between them. Going in it shrinks onto the target; Esc grows it out to
// the parent; leaving the panel it grows to the panel's edge and fades. A row to its neighbour
// glides. It's a soft wash with a hairline edge, drawn by the DOM (a div in the panel) or the GPU
// overlay from the same frames.
//
// The shape is the target's live rect plus an offset that springs to zero (by duration, no
// bounce), so at rest it sits exactly on its target however the panel scrolls or reflows, and a
// retarget mid-flight keeps the shape where it's drawn and the speed it has.

import { clamp, Roll } from "./motion.js"

/** A rounded box in viewport px. */
export interface LensBox {
  x: number
  y: number
  w: number
  h: number
  r: number
}

export type LensLevel = "editor" | "row" | "card" | "panel"

/**
 * One shape to draw: its box, how present it is (0–1), its wash and edge (shares of
 * --k-surface-hi and --k-line-hi) and the accent's tint while a scoped action lights it.
 */
export interface LensShape extends LensBox {
  alpha: number
  wash: number
  line: number
  tint: number
}

/** The look, from the panel's `--k-lens-*` and `--k-armed-*` tokens (see the README). */
export interface LensTune {
  /** The morph's duration (ms), a spring with no bounce. */
  ms: number
  /** How much quicker the size settles than the position (width leads). */
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
  /** How far a scoped action lights the shape: its wash and edge brighten, tinted by the accent. */
  flash: number
  /** How long that light takes to fade (ms). */
  flashMs: number
}

export const LENS_DEFAULTS: LensTune = {
  ms: 340,
  lead: 1.25,
  wash: 0.9,
  line: 0.65,
  panelWash: 0.35,
  inset: 2,
  panelInset: 4,
  flash: 1,
  flashMs: 520,
}

const TUNE_PROPS: Record<keyof LensTune, string> = {
  ms: "--k-lens-ms",
  lead: "--k-lens-lead",
  wash: "--k-lens-wash",
  line: "--k-lens-line",
  panelWash: "--k-lens-panel-wash",
  inset: "--k-lens-inset",
  panelInset: "--k-lens-panel-inset",
  flash: "--k-lens-flash",
  flashMs: "--k-lens-flash-ms",
}

export function readLensTune(style: CSSStyleDeclaration): LensTune {
  const out = { ...LENS_DEFAULTS }
  for (const key of Object.keys(TUNE_PROPS) as (keyof LensTune)[]) {
    const v = parseFloat(style.getPropertyValue(TUNE_PROPS[key]))
    if (Number.isFinite(v)) out[key] = v
  }
  out.ms = Math.max(0, out.ms)
  out.lead = Math.max(0.1, out.lead)
  return out
}

/**
 * Offsets that decay to zero on a critically damped spring (ω = 2π / duration), sampled by time:
 * x(t) = (x₀ + (v₀ + ωx₀)t)·e^(−ωt). Each channel has its own ω (the size's leads).
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

/** A scoped action's light at `t` ms: up at once (40 ms), then fading over `ms`. */
export function flashAt(t: number, ms: number): number {
  if (t < 0 || t >= ms) return 0
  if (t < 40) return t / 40
  const u = (t - 40) / Math.max(1, ms - 40)
  return (1 - u) * (1 - u)
}

const boxDiff = (a: LensBox, b: LensBox) => [a.x - b.x, a.y - b.y, a.w - b.w, a.h - b.h, a.r - b.r]

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
  /** Lights what a scoped action affected. */
  flash(els: readonly HTMLElement[]): void
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

interface Flash {
  el: HTMLElement
  level: LensLevel
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
    return [w, w, w * tune.lead, w * tune.lead, w * tune.lead]
  }
  const glide = new Glide(omegas())
  const alpha = new Roll(0)
  let alphaTarget = 0
  let current: LensTarget | null = null
  let out = false
  let ghosts: Ghost[] = []
  let flashes: Flash[] = []

  const radiusOf = (el: Element) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  const panelRadius = () =>
    parseFloat(getComputedStyle(root).getPropertyValue("--kt-panel-radius")) || radiusOf(root)
  /** The panel's box: inside its edge, or on a page what shows under its header. */
  const panelBox = (inset: number): LensBox => {
    const r = root.getBoundingClientRect()
    if (o.page) {
      const top = Math.max(r.top, o.header?.getBoundingClientRect().bottom ?? 0)
      const bottom = Math.min(r.bottom, win?.innerHeight ?? r.bottom)
      const pad = 8 + inset
      return {
        x: r.left + pad,
        y: top + pad,
        w: Math.max(0, r.width - pad * 2),
        h: Math.max(0, bottom - top - pad * 2),
        r: Math.max(0, panelRadius()),
      }
    }
    const edge = root.clientLeft
    const k = edge + inset
    return {
      x: r.left + k,
      y: r.top + k,
      w: Math.max(0, r.width - k * 2),
      h: Math.max(0, r.height - k * 2),
      r: Math.max(0, panelRadius() - k),
    }
  }
  const measure = (t: LensTarget): LensBox => {
    if (t.level === "panel") return panelBox(tune.panelInset)
    const r = t.el.getBoundingClientRect()
    if (t.level === "card")
      return { x: r.left, y: r.top, w: r.width, h: r.height, r: radiusOf(t.el) }
    const k = Math.min(tune.inset, r.height / 4)
    const card = t.el.closest<HTMLElement>(".knobs-card")
    const cardR = card ? radiusOf(card) : 8
    return {
      x: r.left + k,
      y: r.top + k,
      w: Math.max(0, r.width - k * 2),
      h: Math.max(0, r.height - k * 2),
      r: Math.max(0, Math.min(cardR - k, (r.height - k * 2) / 2)),
    }
  }
  /** Where the shape heads: its target, or on the way out the panel's edge. */
  const goal = (): LensBox | undefined => {
    if (out) return panelBox(0)
    return current?.el.isConnected ? measure(current) : undefined
  }
  let last: { box: LensBox; at: number } | undefined
  const drawnAt = (now: number): { box: LensBox; v: number[] } | undefined => {
    const live = goal()
    if (!live) return last ? { box: last.box, v: [0, 0, 0, 0, 0] } : undefined
    const { x, v } = glide.sample(now)
    const box = {
      x: live.x + x[0]!,
      y: live.y + x[1]!,
      w: live.w + x[2]!,
      h: live.h + x[3]!,
      r: live.r + x[4]!,
    }
    return { box, v }
  }
  const visibleNow = () => (current && !out ? current.el.isConnected && o.shown(current) : false)
  const fadeMs = () => (o.reduced() ? 160 : Math.min(220, tune.ms * 0.6))
  const syncAlpha = (now: number) => {
    const next = visibleNow() ? 1 : 0
    if (next === alphaTarget) return
    alphaTarget = next
    // Out of the panel the shape fades as it grows, on the morph's own time.
    alpha.set(next, out && !o.reduced() ? tune.ms * 0.9 : fadeMs(), now)
  }

  const set = (next: LensTarget | null | "out") => {
    const now = performance.now()
    tune = readLensTune(getComputedStyle(root))
    const leaving = next === "out"
    const target = leaving || next === null ? null : next
    if (
      !leaving &&
      target &&
      current &&
      !out &&
      target.el === current.el &&
      target.level === current.level
    )
      return
    if (leaving && (out || !current)) return
    const shownAlpha = clamp(alpha.sample(now).position, 0, 1)
    const was = drawnAt(now)
    const reduced = o.reduced()
    if (next === null) {
      // Focus is somewhere the lens doesn't mark (a header button, a tab): it fades in place.
      if (was) last = { box: was.box, at: now }
      if (current && shownAlpha > 0.02)
        ghosts.push({ target: current, from: shownAlpha, start: now })
      current = null
      out = false
      alpha.snap(0)
      alphaTarget = 0
      glide.zero()
      return poke(0)
    }
    if (leaving && reduced) {
      // Reduced motion: no growing out, it fades where it is.
      if (current && shownAlpha > 0.02)
        ghosts.push({ target: current, from: shownAlpha, start: now })
      out = true
      alpha.snap(0)
      alphaTarget = 0
      glide.zero()
      return poke(0)
    }
    if (leaving) {
      out = true
      const live = panelBox(0)
      if (was && !reduced) glide.set(boxDiff(was.box, live), was.v, now, omegas())
      else glide.zero()
      syncAlpha(now)
      return poke(0)
    }
    out = false
    const prev = current
    current = target
    const live = measure(target!)
    const travel = was && shownAlpha > 0.05 && !reduced
    if (travel) glide.set(boxDiff(was!.box, live), was!.v, now, omegas())
    else {
      glide.zero()
      // Reduced motion (or nothing showing): the old shape fades where it is, the new one in.
      if (prev && shownAlpha > 0.02) ghosts.push({ target: prev, from: shownAlpha, start: now })
      alpha.snap(0)
      alphaTarget = 0
    }
    syncAlpha(now)
    observe()
    poke(0)
  }

  const flash = (els: readonly HTMLElement[]) => {
    const now = performance.now()
    tune = readLensTune(getComputedStyle(root))
    flashes = flashes.filter((f) => now - f.start < tune.flashMs)
    for (const el of els.slice(0, 24)) {
      const level: LensLevel =
        el === root
          ? "panel"
          : el.classList.contains("knobs-card") || el.classList.contains("knobs-tile")
            ? "card"
            : "row"
      flashes = flashes.filter((f) => f.el !== el)
      flashes.push({ el, level, start: now })
    }
    poke(0)
  }

  /** A shape's look at `level`, lit `f` (0–1) by a scoped action. */
  const look = (box: LensBox, level: LensLevel, a: number, f: number): LensShape => {
    const wash = tune.wash * (level === "panel" ? tune.panelWash : 1)
    const k = clamp(f * tune.flash, 0, 1)
    return {
      ...box,
      alpha: a,
      wash: wash + (1 - wash) * k,
      line: tune.line + (1 - tune.line) * k,
      tint: 0.16 * k,
    }
  }
  const frame = (now: number): LensShape[] => {
    syncAlpha(now)
    const shapes: LensShape[] = []
    const a = clamp(alpha.sample(now).position, 0, 1)
    const lit = (el: HTMLElement) => {
      let f = 0
      for (const fl of flashes)
        if (fl.el === el) f = Math.max(f, flashAt(now - fl.start, tune.flashMs))
      return f
    }
    const d = drawnAt(now)
    const mainEl = current && !out ? current.el : null
    if (d && a > 0.002) {
      last = { box: d.box, at: now }
      shapes.push(
        look(d.box, out ? "panel" : (current?.level ?? "panel"), a, mainEl ? lit(mainEl) : 0),
      )
    }
    const fade = fadeMs()
    ghosts = ghosts.filter((g) => now - g.start < fade && g.target.el.isConnected)
    for (const g of ghosts) {
      const k = 1 - (now - g.start) / fade
      shapes.push(look(measure(g.target), g.target.level, g.from * k * k, 0))
    }
    flashes = flashes.filter((f) => now - f.start < tune.flashMs && f.el.isConnected)
    for (const f of flashes) {
      // The shape itself lights when it's on what was affected.
      if (f.el === mainEl && a > 0.5) continue
      const k = flashAt(now - f.start, tune.flashMs)
      if (k <= 0.002) continue
      const box = measure({ el: f.el, level: f.level })
      shapes.push(look(box, f.level, k, k))
    }
    return shapes
  }

  const moving = (now: number) =>
    !glide.resting(now) ||
    !alpha.resting(now) ||
    ghosts.length > 0 ||
    flashes.some((f) => now - f.start < tune.flashMs)

  // ——— The DOM's shape: a div per shape, placed in the panel's own coordinates ———
  let raf = 0
  let followUntil = 0
  const place = (node: HTMLElement, s: LensShape | undefined, origin: DOMRect) => {
    if (!s) {
      if (node.style.opacity !== "0") node.style.opacity = "0"
      return
    }
    const x = s.x - origin.left - root.clientLeft + root.scrollLeft
    const y = s.y - origin.top - root.clientTop + root.scrollTop
    node.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`
    node.style.width = `${Math.max(0, s.w).toFixed(2)}px`
    node.style.height = `${Math.max(0, s.h).toFixed(2)}px`
    node.style.borderRadius = `${Math.max(0, s.r).toFixed(2)}px`
    node.style.opacity = s.alpha.toFixed(3)
    node.style.setProperty("--kl-w", s.wash.toFixed(3))
    node.style.setProperty("--kl-l", s.line.toFixed(3))
    node.style.setProperty("--kl-t", s.tint.toFixed(3))
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
    flash,
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
