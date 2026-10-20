import { gallery } from "./gallery.js"
import { knobs } from "./knobs.js"
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
export { gallery, knobs, voidTheme }
export type { Appearance } from "../core/appearance.js"
export type { PublicTokenName, TokenName, TokenProperty } from "../tokens/schema.js"

/**
 * The shipped themes: Knobs (the default), Void (true black, flat, for OLED and video) and Gallery
 * (the PROBLEMS review pages' near-black and one neutral ink, coral Before).
 */
export const themes = { knobs, void: voidTheme, gallery } as const

export { labPreset, presetCss, problemsPreset, type TokenPreset } from "../core/theme.js"
