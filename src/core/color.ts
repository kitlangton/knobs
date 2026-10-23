/** An OKLCH colour: lightness 0…1, chroma 0…0.37, hue in degrees, and an optional alpha 0…1. */
export interface Oklch {
  readonly l: number
  readonly c: number
  readonly h: number
  /** Opacity 0…1; absent means opaque. */
  readonly alpha?: number
}

export const CHROMA_MAX = 0.37

const round = (n: number, places: number) => Number(n.toFixed(places))
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** OKLCH → linear-light sRGB (unclamped). */
export function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

/** The most chroma this lightness and hue can carry inside sRGB. */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0
  let lo = 0
  let hi = CHROMA_MAX
  if (inGamut(oklchToLinear({ l, c: hi, h }))) return hi
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklchToLinear({ l, c: mid, h }))) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Gamut-mapped sRGB channels 0…1: a colour inside sRGB (any hex, as the string keeps it) converts
 * as it is; one outside drops chroma until it fits, keeping lightness and hue.
 */
export function oklchToRgb(color: Oklch): [number, number, number] {
  let rgb = oklchToLinear(color)
  if (!inGamut(rgb))
    rgb = oklchToLinear({ ...color, c: Math.min(color.c, maxChroma(color.l, color.h)) })
  const [r, g, b] = rgb
  return [clamp01(gamma(r)), clamp01(gamma(g)), clamp01(gamma(b))]
}

export function rgbToOklch(r: number, g: number, b: number): Oklch {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)]
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363377612 * lg + 0.0514459929 * lb)
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(a, bb)
  const h = c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return { l: L, c, h }
}

const withAlpha = (color: Oklch, alpha: number | undefined): Oklch =>
  alpha === undefined || alpha >= 1 ? color : { ...color, alpha: clamp01(alpha) }

/**
 * Reads `oklch(L C H)` or `oklch(L C H / A)` (L and A as 0…1 or a percentage), `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, or `{ l, c, h, alpha? }`. Opaque colours carry no `alpha`.
 */
export function parseColor(input: unknown): Oklch | undefined {
  if (typeof input === "object" && input !== null) {
    const { l, c, h, alpha } = input as Record<string, unknown>
    if (![l, c, h].every((n) => typeof n === "number" && Number.isFinite(n))) return undefined
    if (alpha !== undefined && !(typeof alpha === "number" && Number.isFinite(alpha)))
      return undefined
    return withAlpha({ l: l as number, c: c as number, h: h as number }, alpha)
  }
  if (typeof input !== "string") return undefined
  const s = input.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((d) => d + d).join("") : hex
    const [r, g, b, a] = [0, 2, 4, 6].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    return withAlpha(rgbToOklch(r!, g!, b!), full.length === 8 ? a : undefined)
  }
  const m =
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/.exec(s)
  if (!m) return undefined
  const l = Number(m[1]) / (m[2] ? 100 : 1)
  const alpha = m[5] === undefined ? undefined : Number(m[5]) / (m[6] ? 100 : 1)
  const parts = [l, Number(m[3]), Number(m[4]), alpha ?? 1]
  return parts.every(Number.isFinite)
    ? withAlpha({ l: parts[0]!, c: parts[1]!, h: parts[2]! }, alpha)
    : undefined
}

/**
 * Clamps into range and into sRGB (by chroma), rounded to what the string keeps: five places for
 * lightness and chroma and three for hue, enough for every hex to come back exactly.
 */
export function fitColor({ l, c, h, alpha }: Oklch): Oklch {
  const L = round(clamp01(l), 5)
  const H = round(((h % 360) + 360) % 360, 3) % 360
  const C0 = round(Math.min(CHROMA_MAX, Math.max(0, c)), 5)
  // Four places keep every 8-bit alpha exact.
  const A = alpha === undefined ? undefined : round(clamp01(alpha), 4)
  // Colours already inside sRGB (like any hex) keep their chroma, as rounded.
  if (inGamut(oklchToLinear({ l: L, c: C0, h: H }))) return withAlpha({ l: L, c: C0, h: H }, A)
  const max = Math.min(CHROMA_MAX, maxChroma(L, H))
  return withAlpha({ l: L, c: Math.min(C0, Math.floor(max * 1e5) / 1e5), h: H }, A)
}

/** `oklch(L C H)`, or `oklch(L C H / A)` when translucent. */
export function formatColor({ l, c, h, alpha }: Oklch): string {
  const a = alpha === undefined || alpha >= 1 ? "" : ` / ${round(clamp01(alpha), 4)}`
  return `oklch(${round(l, 5)} ${round(c, 5)} ${round(h, 3)}${a})`
}

const byte = (v: number) => Math.round(clamp01(v) * 255)
const hex2 = (n: number) => n.toString(16).padStart(2, "0")

/** Gamut-mapped sRGB and alpha as 8-bit channels, or undefined when `value` isn't a colour. */
export function colorBytes(value: unknown): [number, number, number, number] | undefined {
  const color = parseColor(value)
  if (!color) return undefined
  const [r, g, b] = oklchToRgb(color).map(byte)
  return [r!, g!, b!, byte(color.alpha ?? 1)]
}

/** A colour field's value as `#rrggbb` (sRGB), ignoring alpha. */
export function colorHex(value: string | Oklch): string {
  const bytes = colorBytes(value)
  return bytes ? `#${bytes.slice(0, 3).map(hex2).join("")}` : "#000000"
}

/** `#rrggbb`, or `#rrggbbaa` when the colour is translucent; undefined when it isn't a colour. */
export function colorHexAlpha(value: unknown): string | undefined {
  const bytes = colorBytes(value)
  if (!bytes) return undefined
  return `#${(bytes[3] === 255 ? bytes.slice(0, 3) : bytes).map(hex2).join("")}`
}

/** Whether two colours, in any syntax, land on the same 8-bit sRGB and alpha. */
export function sameColor(a: unknown, b: unknown): boolean {
  if (a === b) return true
  const x = colorBytes(a)
  const y = colorBytes(b)
  return x !== undefined && y !== undefined && x.every((v, i) => v === y[i])
}
