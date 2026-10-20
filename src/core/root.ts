import { knobs } from "../themes/knobs.js"
import { tokensCss } from "../tokens/css.js"
import { DRIVERS } from "./glide.js"
import { DEFAULT_LINEAR, motionCss } from "./motion.js"

/**
 * The class every knobs top-level element carries: panels, chips, menus, the status notice, and
 * every knobs/ui piece's root. Each resolves the design tokens for itself (see tokens/css.ts), so
 * a theme, an appearance or a host's token on any ancestor reaches what's derived from it.
 */
export const ROOT_CLASS = "knobs-root"

// What every knobs root resolves beyond the design tokens: the panel's dials that differ by
// appearance (numbers, which light-dark() can't pick: --_k-light is 0 or 1), and the slider fill's
// base. Fixed shadows (a chip's, a tooltip's, a toast's) scale with --_k-shadow-k: as dark as they
// were on dark, lighter on light.
const extras = `:where(.${ROOT_CLASS}){--_k-shadow-k:calc(var(--k-shadow-strength,calc(.48 - .32 * var(--_k-light,0))) / .48);--_k-glass-tone:var(--k-glass-tone,calc(.5 + .58 * var(--_k-light,0)));--_k-fill-base:var(--k-fill-base,var(--_k-fill-selected));--_k-fill-hover-mix:var(--k-fill-hover-mix,var(--k-fill-rest-mix,20%));--_k-reveal-ease:var(--k-ease,cubic-bezier(.2,.8,.2,1))}`

// The default spring as CSS (what tokens glide on, and slider fills).
const spring = `:where(:root,:host){--k-fill-ease:${DEFAULT_LINEAR.easing};--k-fill-ms:${DEFAULT_LINEAR.ms}}`

/**
 * The token sheet: the Knobs theme's defaults, every root's resolution and appearance, the
 * drivers that make tokens glide, and the motion tokens.
 */
export const rootCss = `${tokensCss(knobs)}\n${extras}\n${spring}\n${DRIVERS}\n${motionCss}`

/** Adds the token sheet once per document. */
export function injectTokens(doc: Document) {
  if (doc.querySelector("style[data-knobs-tokens]")) return
  const style = doc.createElement("style")
  style.dataset.knobsTokens = ""
  style.textContent = rootCss
  doc.head.append(style)
}
