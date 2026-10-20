import { springEasing, springMotion, type SpringValue } from "./spring.js"

/**
 * The five named springs (SwiftUI duration and bounce), all without bounce. Every motion in knobs
 * uses one of these unless it's tuned for one feature.
 */
export const SPRINGS = {
  /** Press feedback, focus, selection, pointer-tied moves. */
  instant: { duration: 0.1, bounce: 0 },
  /** Value fills, thumbs, toggles, small controls, menus, exits. */
  snappy: { duration: 0.25, bounce: 0 },
  /** Most state changes: popovers, panel open and close, restyle glides (`--k-spring`). */
  default: { duration: 0.3, bounce: 0 },
  /** Layout reflow, split panes, list reorders. */
  calm: { duration: 0.4, bounce: 0 },
  /** Appearance and theme changes, drawers, page-scale moves. */
  smooth: { duration: 0.45, bounce: 0 },
} as const satisfies Record<string, SpringValue>

export type SpringName = keyof typeof SPRINGS

/** A quick fade that isn't travel (and what any fade becomes under reduced motion). */
export const FADE: SpringValue = { duration: 0.16, bounce: 0 }
/** A popover or menu closing: a little shorter than snappy. */
export const CLOSE: SpringValue = { duration: 0.18, bounce: 0 }

/** The named springs as ω/ζ, for `new Spring(x, omega, zeta)`. */
export const MOTION = Object.fromEntries(
  Object.entries(SPRINGS).map(([name, spring]) => [name, springMotion(spring)]),
) as { readonly [K in SpringName]: { readonly omega: number; readonly zeta: number } }

export const reducedMotion = (win: Window | null | undefined) =>
  win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false

/**
 * The reduced-motion policy: movement doesn't travel (`null`: go straight to the end), and a fade
 * keeps a short fade (at most `FADE`).
 */
export function reducedSpring(
  spring: SpringValue,
  kind: "move" | "fade",
  reduced: boolean,
): SpringValue | null {
  if (!reduced) return spring
  if (kind === "move") return null
  return spring.duration <= FADE.duration ? spring : FADE
}

/** A spring as a CSS `linear()` easing and its settle time (ms). */
export const springLinear = (spring: SpringValue) => {
  const { omega, zeta } = springMotion(spring)
  return springEasing(omega, zeta)
}

const names = Object.keys(SPRINGS) as SpringName[]
const linear = Object.fromEntries(names.map((n) => [n, springLinear(SPRINGS[n])])) as Record<
  SpringName,
  { easing: string; ms: number }
>

/** `--k-spring`'s default: the default spring as "duration bounce". */
export const SPRING_TOKEN = `${SPRINGS.default.duration} ${SPRINGS.default.bounce}`
/** The default spring as CSS, for `--k-fill-ease` and `--k-fill-ms`. */
export const DEFAULT_LINEAR = linear.default

/**
 * Each named spring as CSS on :root: `--_k-motion-<name>` (a `linear()` easing) and
 * `--_k-motion-<name>-ms` (its settle time, a number of ms). Under reduced motion they take 0 ms:
 * movement doesn't travel.
 */
export const motionCss = `:where(:root,:host){${names
  .map((n) => `--_k-motion-${n}:${linear[n].easing};--_k-motion-${n}-ms:${linear[n].ms}`)
  .join(";")}}
@media(prefers-reduced-motion:reduce){:where(:root,:host){${names
  .map((n) => `--_k-motion-${n}-ms:0`)
  .join(";")}}}`
