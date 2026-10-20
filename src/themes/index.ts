import { knobs } from "./knobs.js"
import { reviewTheme } from "./review.js"
import { voidTheme } from "./void.js"

export {
  APCA_BUDGET,
  type Appearance as ThemeAppearance,
  type Density,
  defineTheme,
  type GpuColors,
  type Material,
  type ResolvedTokens,
  type Theme,
  type ThemeInputs,
  type ThemeSpec,
  type TokenOverrides,
} from "./define.js"
export { knobs, reviewTheme, voidTheme }
export type { Appearance } from "../core/appearance.js"
export type { PublicTokenName, TokenName, TokenProperty } from "../tokens/schema.js"

/**
 * The shipped themes: Knobs (the default), Void (true black, flat, for OLED and video) and Review
 * (the review pieces' own default: Void with hairlines you can see).
 */
export const themes = { knobs, void: voidTheme, review: reviewTheme } as const

export { labPreset, presetCss, problemsPreset, type TokenPreset } from "../core/theme.js"
