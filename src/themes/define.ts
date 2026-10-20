import {
  apca,
  oklchToHex,
  over,
  parseColor,
  type Rgba,
  toOklch,
  withAlpha,
} from "../tokens/color.js"
import { themeCss, tokensCss } from "../tokens/css.js"
import { evaluate } from "../tokens/evaluate.js"
import {
  type ColorTokenName,
  TOKEN_BY_NAME,
  TOKENS,
  type TokenName,
  tokenForProperty,
} from "../tokens/schema.js"

export type Appearance = "dark" | "light"
export type Density = "compact" | "default" | "comfortable"
export type Material = "glass" | "solid" | "flat"
export type TokenOverrides = Partial<Record<TokenName, string>>

/** What `defineTheme` takes. Everything but `name` is optional and deep-merges over `extends`. */
export interface ThemeSpec {
  readonly name: string
  readonly extends?: Theme
  /** Tint of the neutral ladder. Chroma 0–0.02; 0.004 reads as neutral with a hint of hue. */
  readonly gray?: { readonly hue?: number; readonly chroma?: number }
  /** The accent: one colour (its dark-appearance value; light is derived) or one per appearance. */
  readonly accent?: string | { readonly dark: string; readonly light: string }
  /** 0–100, 50 by default: spreads the surface ladder and text tiers, scales fills and borders. */
  readonly contrast?: number
  /** Control radius in px. */
  readonly radius?: number
  readonly density?: Density
  readonly material?: Material
  readonly font?: { readonly sans?: string; readonly mono?: string }
  /** Escape hatch: any token's value, per appearance. Applied after generation. */
  readonly tokens?: { readonly dark?: TokenOverrides; readonly light?: TokenOverrides }
}

/** A spec with every dial filled in. */
export interface ThemeInputs {
  readonly gray: { readonly hue: number; readonly chroma: number }
  readonly accent: string | { readonly dark: string; readonly light: string }
  readonly contrast: number
  readonly radius: number
  readonly density: Density
  readonly material: Material
  readonly font: { readonly sans: string; readonly mono: string }
  readonly tokens: { readonly dark: TokenOverrides; readonly light: TokenOverrides }
}

export type ResolvedTokens = Readonly<Record<TokenName, string>>
export type GpuColors = Readonly<Record<ColorTokenName, Rgba>>

export interface Theme {
  readonly name: string
  readonly inputs: ThemeInputs
  /**
   * Every token for each appearance. Colours are fully resolved hex (`#rrggbb` or `#rrggbbaa`);
   * other tokens carry their CSS value or derivation.
   */
  readonly dark: ResolvedTokens
  readonly light: ResolvedTokens
  /** What the theme itself declares (generated values plus overrides); the CSS is built from it. */
  readonly declared: { readonly dark: TokenOverrides; readonly light: TokenOverrides }
  /** Every colour token as linear-light sRGB floats `[r, g, b, a]` (straight alpha), for WebGPU. */
  readonly gpu: { readonly dark: GpuColors; readonly light: GpuColors }
  /**
   * The theme's CSS in `@layer knobs.tokens`. With no selector, the full default sheet (inputs on
   * `:root`, derivations on `.knobs-root`, deprecated aliases, appearance rules). With a selector,
   * one block of what this theme declares, to scope it to part of a page.
   */
  css(options?: { readonly selector?: string }): string
}

const DEFAULT_SANS = 'system-ui,-apple-system,"SF Pro Text",sans-serif'
const DEFAULT_MONO = '"SF Mono",SFMono-Regular,ui-monospace,Menlo,monospace'

const BASE: ThemeInputs = {
  gray: { hue: 0, chroma: 0 },
  accent: "#ffffff",
  contrast: 50,
  radius: 8,
  density: "default",
  material: "solid",
  font: { sans: DEFAULT_SANS, mono: DEFAULT_MONO },
  tokens: { dark: {}, light: {} },
}

const DENSITY: Record<Density, number> = { compact: 0.875, default: 1, comfortable: 1.1875 }

/**
 * OKLCH lightness targets (%), measured from the Knobs main look; the light set is the same roles
 * with elevation flipped (the page is darkest, raised and overlay surfaces reach white).
 */
const SURFACES = {
  dark: { "bg-page": 14.5, "bg-inset": 19.6, bg: 22.6, "bg-raised": 25.7, "bg-overlay": 28.1 },
  light: { "bg-page": 92.6, "bg-inset": 94.6, bg: 97.1, "bg-raised": 100, "bg-overlay": 100 },
} as const
/**
 * Inks are placed by APCA Lc on `bg` rather than by lightness, so the hierarchy reads the same in
 * both appearances (APCA climbs faster on light grounds). Dark targets are the Knobs table's
 * measured values; light keeps today's `#1a1a1c` text.
 */
const INKS = {
  dark: { fg: 99.7, "fg-2": 76.7, "fg-3": 48.4, "fg-4": 31.9, "border-strong": 15.8 },
  light: { fg: 98.35, "fg-2": 78, "fg-3": 50, "fg-4": 34, "border-strong": 17 },
} as const
/** The APCA budget each ink must meet on `bg`. */
export const APCA_BUDGET = {
  fg: 90,
  "fg-2": 75,
  "fg-3": 45,
  "fg-4": 30,
  "accent-fg": 60,
  "border-strong": 15,
} as const
/** Neutral chroma per role, as a multiple of `gray.chroma`: surfaces carry less tint than inks. */
const TINT = { surface: { dark: 0.5, light: 0.7 }, fg: 1.35, ink: 1.5, border: 1.25 } as const

const STATUS = {
  dark: {
    ok: [78, 0.15, 155],
    warn: [83, 0.14, 80],
    danger: [70, 0.18, 25],
    info: [75, 0.13, 240],
  },
  light: {
    ok: [52, 0.14, 150],
    warn: [60, 0.14, 65],
    danger: [55, 0.2, 27],
    info: [53, 0.15, 245],
  },
} as const
const SERIES_HUES = [250, 155, 75, 25, 305, 195]
const SERIES = { dark: { l: 74, c: 0.12 }, light: { l: 56, c: 0.14 } } as const

const contrastMultiplier = (contrast: number) => 0.5 + Math.min(100, Math.max(0, contrast)) / 100

function fontStack(family: string, fallback: string): string {
  if (family.includes(",")) return family
  const quoted = /\s/.test(family) && !/^["']/.test(family) ? `"${family}"` : family
  return family === fallback ? family : `${quoted},${fallback}`
}

function mergeInputs(parent: ThemeInputs, spec: ThemeSpec): ThemeInputs {
  return {
    gray: { ...parent.gray, ...spec.gray },
    accent: spec.accent ?? parent.accent,
    contrast: spec.contrast ?? parent.contrast,
    radius: spec.radius ?? parent.radius,
    density: spec.density ?? parent.density,
    material: spec.material ?? parent.material,
    font: {
      sans: spec.font?.sans ? fontStack(spec.font.sans, DEFAULT_SANS) : parent.font.sans,
      mono: spec.font?.mono ? fontStack(spec.font.mono, DEFAULT_MONO) : parent.font.mono,
    },
    tokens: {
      dark: { ...parent.tokens.dark, ...spec.tokens?.dark },
      light: { ...parent.tokens.light, ...spec.tokens?.light },
    },
  }
}

/** Moves `l` (OKLCH %, 0–100) away from `bg` until `make(l)` reaches `floor` Lc on it. */
function meet(
  l: number,
  floor: number,
  bg: string,
  away: 1 | -1,
  make: (l: number) => string,
): string {
  let x = l
  while (apca(make(x), bg) < floor + 0.5 && x >= 0 && x <= 100) x += away * 0.25
  return make(Math.min(100, Math.max(0, x)))
}

/** The lightness on the far side of `bg` at which `make(l)` reads `target` Lc (or the extreme). */
function solve(target: number, bg: string, away: 1 | -1, make: (l: number) => string): number {
  let near = toOklch(bg).l * 100
  let far = away > 0 ? 100 : 0
  if (apca(make(far), bg) <= target) return far
  for (let i = 0; i < 30; i++) {
    const mid = (near + far) / 2
    if (apca(make(mid), bg) < target) near = mid
    else far = mid
  }
  return far
}

function accentPair(inputs: ThemeInputs): Record<Appearance, string> {
  if (typeof inputs.accent !== "string") return { ...inputs.accent }
  const dark = inputs.accent
  const o = toOklch(dark)
  const light =
    o.c < 0.02
      ? oklchToHex({ l: 0.227, c: inputs.gray.chroma, h: inputs.gray.hue })
      : oklchToHex({ l: Math.min(0.6, Math.max(0.45, o.l - 0.15)), c: o.c * 1.1, h: o.h })
  return { dark, light }
}

/** The theme-sourced values for one appearance, with surface overrides honoured before inks. */
function generate(inputs: ThemeInputs, appearance: Appearance, accent: string): TokenOverrides {
  const m = contrastMultiplier(inputs.contrast)
  const { hue, chroma } = inputs.gray
  const neutral = (l: number, tint: number) => oklchToHex({ l: l / 100, c: chroma * tint, h: hue })
  const user = inputs.tokens[appearance]
  const out: Record<string, string> = {}

  const surfaces = SURFACES[appearance]
  for (const [role, l] of Object.entries(surfaces)) {
    const spread = surfaces.bg + (l - surfaces.bg) * m
    out[role] =
      user[role as TokenName] ??
      neutral(Math.min(100, Math.max(0, spread)), TINT.surface[appearance])
  }
  const bg = out.bg!
  const away = appearance === "dark" ? 1 : -1
  const inkSpread = 1 + (m - 1) * 0.4
  for (const [role, target] of Object.entries(INKS[appearance])) {
    const tint = role === "fg" ? TINT.fg : role === "border-strong" ? TINT.border : TINT.ink
    const make = (x: number) => neutral(x, tint)
    const l = solve(target * inkSpread, bg, away, make)
    out[role] = meet(l, APCA_BUDGET[role as keyof typeof APCA_BUDGET], bg, away, make)
  }

  out.accent = accent
  const a = toOklch(accent)
  out["accent-fg"] = meet(a.l * 100, APCA_BUDGET["accent-fg"], bg, away, (x) =>
    oklchToHex({ l: x / 100, c: a.c, h: a.h }),
  )
  out["on-accent"] = apca("#111111", accent) >= apca("#ffffff", accent) ? "#111111" : "#ffffff"

  for (const [role, [l, c, h]] of Object.entries(STATUS[appearance]))
    out[role] = oklchToHex({ l: l / 100, c, h })
  const s = SERIES[appearance]
  const start = a.c >= 0.04 ? a.h - SERIES_HUES[0]! : 0
  SERIES_HUES.forEach((h, i) => {
    out[`series-${i + 1}`] = oklchToHex({ l: s.l / 100, c: s.c, h: (h + start + 360) % 360 })
  })
  out.scrim = appearance === "dark" ? "#00000099" : "#00000040"

  out.contrast = String(Math.round(m * 1000) / 1000)
  out.radius = `${inputs.radius}px`
  out.density = String(DENSITY[inputs.density])
  out.font = inputs.font.sans
  out.mono = inputs.font.mono

  const material = inputs.material
  out.glass = material === "glass" ? "0.6" : "0"
  out.glow = material === "glass" ? "0.5" : "0"
  out.rim = material === "flat" ? "transparent" : appearance === "dark" ? "#ffffff1a" : "#ffffff99"
  if (material === "flat") {
    // Flat surfaces draw solid hairlines: the alpha borders composited onto bg.
    out["border-subtle"] = over(withAlpha(out.fg!, 0.06 * m), bg)
    out.border = over(withAlpha(out.fg!, 0.1 * m), bg)
  }
  return out as TokenOverrides
}

function shadows(material: Material, borderStrong: Record<Appearance, string>): TokenOverrides {
  if (material === "flat")
    return {
      "shadow-raised": "none",
      "shadow-overlay": `0 0 0 1px light-dark(${borderStrong.light},${borderStrong.dark})`,
    }
  return {
    "shadow-raised": "0 1px 2px light-dark(#0000001f,#00000029)",
    "shadow-overlay":
      "0 12px 36px light-dark(#00000024,#00000085),0 1px 2px light-dark(#00000014,#0000004d)",
  }
}

function resolve(declared: TokenOverrides): ResolvedTokens {
  const raw = (name: TokenName): string => {
    const def = TOKEN_BY_NAME.get(name)!
    const own = declared[name]
    if (own !== undefined) return own
    const source = def.source
    if ("css" in source) return source.css
    if ("value" in source) return source.value
    throw new Error(`Theme does not supply ${name}`)
  }
  const lookup = (property: string) => {
    const name = tokenForProperty(property)
    return name ? raw(name) : undefined
  }
  const out: Record<string, string> = {}
  for (const t of TOKENS)
    out[t.name] = t.type === "color" ? evaluate(raw(t.name), lookup) : raw(t.name)
  return out as ResolvedTokens
}

function gpuOf(resolved: ResolvedTokens): GpuColors {
  const out: Record<string, Rgba> = {}
  for (const t of TOKENS) if (t.type === "color") out[t.name] = parseColor(resolved[t.name])
  return out as GpuColors
}

function validate(name: string, inputs: ThemeInputs) {
  if (!/^[\w-]+$/.test(name)) throw new Error(`Invalid theme name: ${name}`)
  for (const appearance of ["dark", "light"] as const)
    for (const key of Object.keys(inputs.tokens[appearance]))
      if (!TOKEN_BY_NAME.has(key as TokenName))
        throw new Error(`Unknown token in theme ${name}: ${key}`)
}

/**
 * Builds a theme from a few dials: a neutral ladder generated in OKLCH and checked against the
 * APCA budget, an accent with its text and on-accent colours, a shared status palette, chart
 * series and material values, resolved for both appearances.
 */
export function defineTheme(spec: ThemeSpec): Theme {
  const inputs = mergeInputs(spec.extends?.inputs ?? BASE, spec)
  validate(spec.name, inputs)
  const accent = accentPair(inputs)
  const generated = {
    dark: generate(inputs, "dark", accent.dark),
    light: generate(inputs, "light", accent.light),
  }
  const material = shadows(inputs.material, {
    dark: inputs.tokens.dark["border-strong"] ?? generated.dark["border-strong"]!,
    light: inputs.tokens.light["border-strong"] ?? generated.light["border-strong"]!,
  })
  const declared = {
    dark: { ...generated.dark, ...material, ...inputs.tokens.dark },
    light: { ...generated.light, ...material, ...inputs.tokens.light },
  }
  for (const [key, dark] of Object.entries(declared.dark)) {
    const def = TOKEN_BY_NAME.get(key as TokenName)!
    const light = declared.light[key as TokenName]
    if (def.type !== "color" && light !== undefined && light !== dark)
      throw new Error(`Theme ${spec.name}: only colours may differ by appearance (${key})`)
  }
  const dark = resolve(declared.dark)
  const light = resolve(declared.light)
  const theme: Theme = {
    name: spec.name,
    inputs,
    dark,
    light,
    declared,
    gpu: { dark: gpuOf(dark), light: gpuOf(light) },
    css: (options) => (options?.selector ? themeCss(theme, options.selector) : tokensCss(theme)),
  }
  return theme
}
