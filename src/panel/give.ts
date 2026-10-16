import { roundOf, stretchOf, thinOf } from "./feel.js"
import { tick } from "./haptics.js"
import { Spring } from "./motion.js"

// Every pannable control meets its ends the same way: instead of stopping dead it gives a little,
// like a rubber band, never more than `GIVE` px, with one tick as it starts to stretch. Pushing
// further stretches it less and less; turning back takes the give up 1:1 first (nothing is
// banked, so the value answers at once), and letting go springs it home.

/** The most a control gives past an end (px). */
export const GIVE = 6
/** The most a slider's row stretches past an end (px), dragged or panned alike. */
export const STRETCH = 14
/** How long (s) a give takes to spring home, with no bounce: a readout's, and a stretch's. */
export const HOME_S = 0.25
export const STRETCH_HOME_S = 0.35

/** The give `over` px of push past an end makes: 1:1 at first, never reaching `max`. */
export const rubber = (over: number, max = GIVE) =>
  over === 0 ? 0 : (Math.sign(over) * max * Math.abs(over)) / (Math.abs(over) + max)
/** The push (px) that makes `give` (`rubber`'s inverse). */
export const unrubber = (give: number, max = GIVE) =>
  give === 0
    ? 0
    : (Math.sign(give) * max * Math.abs(give)) / (max - Math.min(Math.abs(give), max * 0.999))

/** A position (px) between two ends, and how far it gives past one of them. */
export interface Band {
  readonly at: number
  readonly give: number
}

/**
 * Moves `from.at` by `d` px within [lo, hi]. Past an end the rest of the push stretches the give;
 * travel back takes the give up first, 1:1, and moves on with what's left.
 */
export function band(from: Band, d: number, lo: number, hi: number, max = GIVE): Band {
  let { at, give } = from
  if (give !== 0 && Math.sign(d) !== Math.sign(give)) {
    const left = give + d
    if (Math.sign(left) === Math.sign(give)) return { at, give: left }
    d = left
    give = 0
  }
  at += d
  if (at > hi) {
    give = rubber(unrubber(Math.max(0, give), max) + at - hi, max)
    at = hi
  } else if (at < lo) {
    give = rubber(unrubber(Math.min(0, give), max) + at - lo, max)
    at = lo
  }
  return { at, give }
}

/** A pan counted in whole steps: travel (px) toward the next one, and any give past an end. */
export interface Steps {
  readonly travel: number
  readonly give: number
}

/**
 * Adds `d` px of pan to `from`, a step every `size` px. `room` is how many steps there are each
 * way (down, up) before this pan: once a way has none left, travel that way stretches the give.
 * Returns the state and the steps to take (signed).
 */
export function stepBand(
  from: Steps,
  d: number,
  size: number,
  room: readonly [number, number],
  max = GIVE,
): { readonly next: Steps; readonly steps: number } {
  let { travel, give } = from
  if (give !== 0 && Math.sign(d) !== Math.sign(give)) {
    const left = give + d
    if (Math.sign(left) === Math.sign(give)) return { next: { travel, give: left }, steps: 0 }
    d = left
    give = 0
  }
  travel += d
  let steps = 0
  for (;;) {
    const dir = Math.sign(travel)
    if (dir === 0) break
    const left = dir > 0 ? room[1] - steps : room[0] + steps
    if (left <= 0) {
      give = rubber(unrubber(dir > 0 ? Math.max(0, give) : Math.min(0, give), max) + travel, max)
      travel = 0
      break
    }
    if (Math.abs(travel) < size) break
    steps += dir
    travel -= dir * size
  }
  return { next: { travel, give }, steps }
}

/** Px of pan per item when a pan steps through a list (a menu's choices, a ramp's presets). */
export const LIST_STEP = 28

/**
 * Where a pan through `count` items lands from `at` (-1: none of them, so the first step picks an
 * end), and the state it leaves; `index` is undefined while it stays put.
 */
export function stepList(from: Steps, d: number, at: number, count: number, size = LIST_STEP) {
  const none = at < 0
  const { next, steps } = stepBand(from, d, size, none ? [count, count] : [at, count - 1 - at])
  const index =
    steps === 0
      ? undefined
      : none
        ? Math.max(0, Math.min(count - 1, steps > 0 ? steps - 1 : count + steps))
        : at + steps
  return { next, index }
}

/** Whether a move went from no give to some: the moment to tick. */
export const stretched = (before: number, after: number) => before === 0 && after !== 0

/** The fingers' speed (px/ms, signed) over their last `window` ms of moves before a lift. */
export function speedOf(moves: readonly { readonly t: number; readonly d: number }[], window = 80) {
  const last = moves[moves.length - 1]
  if (!last) return 0
  let sum = 0
  let first = last.t
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!
    if (last.t - m.t > window) break
    sum += m.d
    first = m.t
  }
  // A lone event spans a frame or so.
  return sum / Math.max(8, last.t - first)
}

/** How many steps a lift at `speed` (px/ms) carries on for: none from a still hand, three at most. */
export const carrySteps = (speed: number) => Math.min(3, Math.floor(Math.abs(speed) / 0.4))
/** When each carried step lands (ms after the lift), slowing as it goes. */
export const carryAt = (i: number) => Math.round((45 * (1.45 ** (i + 1) - 1)) / 0.45)

/** Keeps a pan's recent moves (for `speedOf`), forgetting the old ones. */
export function moves() {
  let list: { t: number; d: number }[] = []
  return {
    add(d: number, t = performance.now()) {
      list.push({ t, d })
      while (list.length > 2 && t - list[0]!.t > 200) list.shift()
    },
    speed: () => speedOf(list),
    reset() {
      list = []
    },
  }
}

const gives = new WeakMap<Element, number>()
/** How far (px) a text readout is giving right now, for the GPU to draw it there too. */
export const giveOf = (el: Element) => gives.get(el) ?? 0

/**
 * A text readout's give (a number that can't go further). While in hand it's held where the
 * pan puts it; let go, it springs home on one loop that both renderers read: the DOM as a
 * `translate`, the GPU through `giveOf`.
 */
export function textGive(
  el: HTMLElement | SVGElement,
  wake: () => void,
  o: {
    /** Seconds to spring home (`HOME_S` by default). */
    readonly home?: number
    /** Draws the give in the DOM (a `translate` by default; not called while the GPU draws). */
    readonly draw?: (px: number) => void
  } = {},
) {
  const spring = new Spring(0, (2 * Math.PI) / (o.home ?? HOME_S), 1, 0.02)
  let frame = 0
  let last = 0
  const win = el.ownerDocument.defaultView
  const draw = o.draw ?? ((px: number) => (el.style.translate = px === 0 ? "" : `${px}px 0`))
  const write = (px: number) => {
    if (px === 0) gives.delete(el)
    else gives.set(el, px)
    const gpu = el.closest('[data-gpu-active="true"]') !== null
    draw(gpu ? 0 : px)
    wake()
  }
  const step = (now: number) => {
    const x = spring.step((now - last) / 1000)
    last = now
    write(spring.resting ? 0 : x)
    frame = spring.resting ? 0 : (win?.requestAnimationFrame(step) ?? 0)
  }
  let held = 0
  return {
    /** The give as last held (0 once let go). */
    get give() {
      return held
    },
    /** Holds the give at `px` (signed), ticking as it starts. */
    hold(px: number) {
      if (frame) win?.cancelAnimationFrame(frame)
      frame = 0
      if (stretched(spring.x, px)) tick(el, "limit")
      spring.snap(px)
      held = px
      write(px)
    },
    /** Lets go: the give springs home. */
    release() {
      held = 0
      if (spring.x === 0 || frame) return
      const still = win?.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (still || !win) {
        spring.snap(0)
        write(0)
        return
      }
      spring.set(0)
      last = win.performance.now()
      frame = win.requestAnimationFrame(step)
    },
  }
}
export type TextGive = ReturnType<typeof textGive>

/**
 * Draws `el` stretched like rubber, `x` px past an end along it (and `y` px down or up, for a pad):
 * scaled about the end that stays put, thinner across it as it lengthens (`thin`), its stretching
 * corners rounding off. CSS reads the vars (.knobs-stretching); `unclip` is a parent whose clip it
 * may draw past meanwhile (its card).
 */
export function drawStretch(
  el: HTMLElement,
  x: number,
  y: number,
  size: { readonly w: number; readonly h: number },
  o: { readonly thin?: boolean; readonly unclip?: Element | null } = {},
) {
  const on = x !== 0 || y !== 0
  el.classList.toggle("knobs-stretching", on)
  o.unclip?.toggleAttribute("data-k-stretch", on)
  const st = el.style
  if (!on) {
    for (const v of STRETCH_VARS) st.removeProperty(v)
    delete el.dataset.stretch
    return
  }
  const sx = stretchOf(x, size.w)
  const sy = o.thin ? { scale: thinOf(sx.scale), anchor: 0.5 } : stretchOf(y, size.h)
  st.setProperty("--k-sx", sx.scale.toFixed(5))
  st.setProperty("--k-sy", sy.scale.toFixed(5))
  st.setProperty("--k-sox", `${sx.anchor * 100}%`)
  st.setProperty("--k-soy", `${(y === 0 && !o.thin ? 0.5 : sy.anchor) * 100}%`)
  st.setProperty("--k-sf", roundOf(x || y).toFixed(3))
  st.setProperty("--k-w", `${size.w}px`)
  st.setProperty("--k-ox", `${sx.anchor * size.w}px`)
  el.dataset.stretch = x > 0 ? "end" : x < 0 ? "start" : "none"
}
const STRETCH_VARS = ["--k-sx", "--k-sy", "--k-sox", "--k-soy", "--k-sf", "--k-w", "--k-ox"]

/**
 * How far (px) `el` can stretch each way before an ancestor clips it (its overflow isn't
 * visible), passing over `skip` (a card it unclips while it stretches).
 */
export function roomOf(el: Element, skip?: Element | null) {
  const r = el.getBoundingClientRect()
  const room = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity }
  const win = el.ownerDocument.defaultView
  let found = { x: false, y: false }
  for (let a = el.parentElement; a && !(found.x && found.y); a = a.parentElement) {
    if (a === skip) continue
    const cs = win?.getComputedStyle(a)
    if (!cs) break
    const box = a.getBoundingClientRect()
    const left = box.left + a.clientLeft
    const top = box.top + a.clientTop
    // A panel's glass edge bounds it too, clipped or not (a flat one has none).
    const glass =
      a.classList.contains("knobs-panel") && Number(cs.getPropertyValue("--k-chrome") || 1) > 0
    if (!found.x && (glass || cs.overflowX !== "visible")) {
      found = { ...found, x: true }
      room.left = r.left - left
      room.right = left + a.clientWidth - r.right
    }
    if (!found.y && (glass || cs.overflowY !== "visible")) {
      found = { ...found, y: true }
      room.top = r.top - top
      room.bottom = top + a.clientHeight - r.bottom
    }
  }
  return room
}
