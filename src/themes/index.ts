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
export { knobs, voidTheme }
export type { Appearance } from "../core/appearance.js"
export type { PublicTokenName, TokenName, TokenProperty } from "../tokens/schema.js"

/** The shipped themes: Knobs (the default) and Void (true black, flat, for OLED and video). */
export const themes = { knobs, void: voidTheme } as const

export { labPreset, presetCss, problemsPreset, type TokenPreset } from "../core/theme.js"
