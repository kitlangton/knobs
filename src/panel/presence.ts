import { springMotion } from "../core/spring.js"
import { FADE as FADE_SPRING, SPRINGS } from "../core/motion.js"
import type { MorphFrame } from "./morph.js"
import { clamp, Spring } from "./motion.js"

// Showing and hiding a panel with the page's toggle key (see toggle.ts). One spring, 0 hidden and
// 1 shown, carries it both ways and keeps its velocity when the key is pressed mid-flight.
// Leaving it softens: it fades, blurs (4 px at most) and shrinks (to .96 at least) on a .25 s
// spring with no bounce; arriving is the reverse on a slightly longer one. An inline panel also
// folds its space shut, its content gone before the last of the height, so nothing below jumps.
// Reduced motion keeps only a short fade. Hidden, the panel is `hidden` and `inert`: no space, no
// focus, no hint codes, and the GPU overlay skips it.
const EXIT = springMotion(SPRINGS.snappy)
const ENTER = springMotion(SPRINGS.default)
const FADE = springMotion(FADE_SPRING)
const BLUR = 4
const SCALE = 0.96
/** An inline panel's content has faded by the time this much of its height is left. */
const LEAD = 0.4
/** The inline styles a fold sets, cleared at rest. */
const FOLDED = [
  "height",
  "min-height",
  "flex",
  "margin-top",
  "margin-bottom",
  "padding-top",
  "padding-bottom",
  "overflow",
] as const
const LOOK = ["opacity", "filter", "scale", "transform-origin"] as const

export interface Presence {
  readonly shown: boolean
  /** Shows or hides the panel; `animate: false` puts it there at once (a reload, a first paint). */
  set(shown: boolean, animate: boolean): void
  /** The shape the GPU overlay draws while it shows or hides (see `MorphFrame`), else undefined. */
  frame(now: number): MorphFrame | undefined
  dispose(): void
}

/** What the panel looks like at `x` (0 hidden, 1 shown) on the way in or out. */
export function presenceLook(x: number, inline: boolean, reduced: boolean) {
  if (reduced) return { opacity: clamp(x, 0, 1), blur: 0, scale: 1, fold: x > 0 ? 1 : 0 }
  const v = inline ? clamp((x - LEAD) / (1 - LEAD), 0, 1) : clamp(x, 0, 1)
  return {
    opacity: v,
    blur: BLUR * (1 - v),
    scale: SCALE + (1 - SCALE) * v,
    fold: inline ? clamp(x, 0, 1) : 1,
  }
}

export function createPresence(
  root: HTMLElement,
  options: { readonly inline: boolean; readonly wake: () => void },
): Presence {
  const win = root.ownerDocument.defaultView!
  const { inline } = options
  const spring = new Spring(1, ENTER.omega, ENTER.zeta, 0.001)
  let shown = true
  let reduced = false
  let raf = 0
  let last = 0
  /** An inline panel's resting box, read when it leaves rest. */
  let box = { height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }
  let radius: number | undefined

  const gpu = () => root.dataset.gpuActive === "true"
  const measure = () => {
    const cs = win.getComputedStyle(root)
    box = {
      height: root.offsetHeight,
      marginTop: parseFloat(cs.marginTop) || 0,
      marginBottom: parseFloat(cs.marginBottom) || 0,
      paddingTop: parseFloat(cs.paddingTop) || 0,
      paddingBottom: parseFloat(cs.paddingBottom) || 0,
    }
  }
  const clear = () => {
    for (const name of [...FOLDED, ...LOOK]) root.style.removeProperty(name)
    delete root.dataset.presence
  }
  const apply = (x: number) => {
    const look = presenceLook(x, inline, reduced)
    const px = (v: number) => `${v.toFixed(2)}px`
    root.style.opacity = look.opacity.toFixed(3)
    // The overlay blurs and scales what it draws itself (see `frame`); the DOM only fades.
    const dom = !gpu()
    if (dom && look.blur > 0.01) root.style.filter = `blur(${look.blur.toFixed(2)}px)`
    else root.style.removeProperty("filter")
    if (dom && look.scale < 1) {
      root.style.scale = look.scale.toFixed(4)
      root.style.transformOrigin = inline ? "50% 0" : "50% 50%"
    } else {
      root.style.removeProperty("scale")
      root.style.removeProperty("transform-origin")
    }
    if (!inline || reduced) return
    const f = look.fold
    root.style.overflow = "hidden"
    root.style.flex = "none"
    root.style.minHeight = "0px"
    root.style.height = px(box.height * f)
    root.style.marginTop = px(box.marginTop * f)
    root.style.marginBottom = px(box.marginBottom * f)
    root.style.paddingTop = px(box.paddingTop * f)
    root.style.paddingBottom = px(box.paddingBottom * f)
  }
  const settle = () => {
    clear()
    if (!shown) root.hidden = true
    options.wake()
  }
  const tick = (now: number) => {
    raf = 0
    spring.step(Math.max(0, now - last) / 1000)
    last = now
    if (spring.resting) return settle()
    apply(spring.x)
    options.wake()
    raf = win.requestAnimationFrame(tick)
  }

  return {
    get shown() {
      return shown
    },
    set(next, animate) {
      if (next === shown && (animate || !raf)) return
      const resting = !raf
      shown = next
      reduced = win.matchMedia("(prefers-reduced-motion: reduce)").matches
      // Hidden, nothing in it is reachable by Tab, a click or a hint code, even on the way out.
      root.inert = !next
      if (next && root.hidden) {
        root.hidden = false
        clear()
        // A floating panel's CSS entrance would replay as it comes back from display: none.
        if (!inline) root.style.animation = "none"
        if (inline) measure()
      } else if (!next && resting && inline) measure()
      if (!animate) {
        if (raf) win.cancelAnimationFrame(raf)
        raf = 0
        spring.snap(next ? 1 : 0)
        settle()
        return
      }
      const m = reduced ? FADE : next ? ENTER : EXIT
      spring.omega = m.omega
      spring.zeta = m.zeta
      spring.set(next ? 1 : 0)
      root.dataset.presence = next ? "in" : "out"
      apply(spring.x)
      if (!raf) {
        last = performance.now()
        raf = win.requestAnimationFrame(tick)
      }
      options.wake()
    },
    frame() {
      if (!root.dataset.presence || root.hidden) return undefined
      const look = presenceLook(spring.x, inline, reduced)
      const r = root.getBoundingClientRect()
      radius ??= parseFloat(win.getComputedStyle(root).getPropertyValue("--kv-radius-frame")) || 12
      const s = look.scale
      const ox = r.left + r.width / 2
      const oy = inline ? r.top : r.top + r.height / 2
      return {
        x: ox + (r.left - ox) * s,
        y: oy + (r.top - oy) * s,
        w: r.width * s,
        h: r.height * s,
        radius: radius * s,
        progress: 1,
        // Equal: no reveal band, the whole panel shows.
        fadeTop: 0,
        fadeBottom: 0,
        blur: look.blur,
        // The overlay already fades the whole panel with the root's opacity.
        opacity: 1,
        scale: s,
        originX: ox,
        originY: oy,
        specular: 0,
      }
    },
    dispose() {
      if (raf) win.cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
