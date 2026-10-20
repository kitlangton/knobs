import { reviewTheme } from "../themes/review.js"
import type { UiLook } from "./look.js"

const MODES = { dark: "dark", light: "light", auto: "system" } as const
const THEMED = '[data-knobs-theme]:not([data-knobs-theme="dark"],[data-knobs-theme="light"])'

/**
 * A review piece's look: the theme it's given, else the theme of the knobs element it sits in,
 * else the review theme (quiet, true black, visible hairlines) rather than the panel's glass.
 */
export function reviewLook<T extends UiLook>(options: T, container?: Element): T {
  const t = options.theme
  if (typeof t === "object") return options
  if (!t && container?.closest(THEMED)) return options
  const appearance = options.appearance ?? (t ? MODES[t] : undefined)
  return { ...options, theme: reviewTheme, ...(appearance ? { appearance } : {}) }
}
