// Appearance is a preference, not a theme coordinate. Presets, Random, Reset and
// theme undo cannot change it; System follows the OS instead of the selected look.
import type { ChangeMeta } from "knobs"
import {
  css,
  blendThemes,
  crossL,
  fromOklab,
  lerp,
  lookAt,
  type Look,
  mixColors,
  oklab,
  parseColor,
  PIVOT_L,
  type Rgba,
  TEXT_INKS,
} from "./site-look-math"
import { type SiteTheme, THEMES } from "./site-look-themes"

export const APPEARANCES = ["system", "light", "dark"] as const
export type Appearance = (typeof APPEARANCES)[number]
export const APPEARANCE_KEY = "knobs-site-appearance"
export const appearanceOf = (value: unknown): Appearance =>
  value === "light" || value === "dark" ? value : "system"
export const appearanceDark = (mode: Appearance, systemDark: boolean) =>
  mode === "system" ? systemDark : mode === "dark"
export const nextAppearance = (mode: Appearance): Appearance =>
  APPEARANCES[(APPEARANCES.indexOf(mode) + 1) % APPEARANCES.length]!

export function readAppearance(): Appearance {
  const query = new URLSearchParams(location.search).get("appearance")
  if (APPEARANCES.includes(query as Appearance)) return query as Appearance
  try {
    return appearanceOf(localStorage.getItem(APPEARANCE_KEY))
  } catch {
    return "system"
  }
}

export function appearanceAfterChange(
  current: Appearance,
  incoming: Appearance,
  source: ChangeMeta["source"],
): Appearance {
  return source === "local" || source === "remote" ? incoming : current
}

// Counterparts preserve the face, spacing, corner language and hue of each theme.
// Grounds are authored, not inverted; ink lightness changes while its hue stays put.
const grounds: Readonly<Record<string, SiteTheme["ground"]>> = {
  night: { page: "#f5f5f7", card: "#ffffff", night: "#101012", kBg: "#ffffff", kPage: "#f5f5f7" },
  ocean: { page: "#edf5f8", card: "#f9fdff", night: "#030d15", kBg: "#f9fdff", kPage: "#edf5f8" },
  synth: { page: "#f7effc", card: "#fffbff", night: "#0c0416", kBg: "#fffbff", kPage: "#f7effc" },
  brutal: { page: "#101010", card: "#1b1b1b", night: "#0b0b0b", kBg: "#1b1b1b", kPage: "#101010" },
  paper: { page: "#191611", card: "#26211a", night: "#110e0b", kBg: "#26211a", kPage: "#191611" },
}
const colored = new Set(["accent", "warm", "cool", "kAccent", "kModified", "kicker", "kGroupInk"])
function counterpart(theme: SiteTheme): SiteTheme {
  const dark = !theme.dark
  const ink = { ...theme.ink }
  for (const key of Object.keys(ink) as (keyof typeof ink)[]) {
    if (key === "liftA" || key === "liftB") continue // shadows remain shadows
    const c = parseColor(ink[key])
    const [L, a, b] = oklab(c)
    const lightness = colored.has(key)
      ? dark
        ? Math.max(0.78, L)
        : Math.min(0.48, L)
      : dark
        ? 0.96 - L * 0.1
        : 0.12 + (1 - L) * 0.08
    ink[key] = css(fromOklab(lightness, a, b, c[3]))
  }
  ink.kThumb = "#ffffff"
  return {
    ...theme,
    dark,
    ground: grounds[theme.id]!,
    ink,
    num: { ...theme.num, shadow: dark ? 0 : 1, kGlassTone: dark ? 0.5 : 1.08 },
  }
}
export const DARK_THEMES = THEMES.map((t) => (t.dark ? t : counterpart(t)))
export const LIGHT_THEMES = THEMES.map((t) => (t.dark ? counterpart(t) : t))
const GROUND_KEYS = new Set(["page", "card", "night", "kBg", "kPage"])

/** A theme in either appearance. Only an appearance change crosses the pivot grey. */
export function appearanceLook(
  theme: number | readonly number[],
  light: number,
  inkLight = light,
): Look {
  const at = (themes: readonly SiteTheme[], mode: number) =>
    typeof theme === "number" ? lookAt(themes, theme, mode) : blendThemes(themes, theme)
  if (light === 0 && inkLight === 0) return at(DARK_THEMES, 0)
  if (light === 1 && inkLight === 1) return at(LIGHT_THEMES, 1)
  const a = at(DARK_THEMES, 0)
  const b = at(LIGHT_THEMES, 1)
  const colors: Record<string, Rgba> = {}
  for (const key of Object.keys(a.colors)) {
    const ca = a.colors[key]!
    const cb = b.colors[key]!
    const ground = GROUND_KEYS.has(key)
    const la = oklab(ca)[0]
    const lb = oklab(cb)[0]
    const crosses = ground && (la - PIVOT_L) * (lb - PIVOT_L) < 0
    const t = ground ? light : inkLight
    colors[key] = mixColors([ca, cb], [1 - t, t], crosses ? () => crossL(la, lb, light) : undefined)
  }
  const firm = 0.9 * Math.max(0, 1 - Math.abs(oklab(colors.page!)[0] - PIVOT_L) / 0.24)
  for (const key of TEXT_INKS) {
    const c = colors[key]
    if (!c || !firm) continue
    const [L, A, B] = oklab(c)
    colors[key] = fromOklab(lerp(L, 1 - inkLight, firm), A, B, lerp(c[3], 1, firm))
  }
  const num: Record<string, number> = {}
  for (const key of Object.keys(a.num)) num[key] = lerp(a.num[key]!, b.num[key]!, light)
  return { colors, num, fonts: a.fonts }
}
