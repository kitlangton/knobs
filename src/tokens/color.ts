/**
 * The colour maths the theme generator needs and nothing more: OKLCH ↔ sRGB (Björn Ottosson's
 * OKLab matrices), hex parsing and formatting with alpha, and APCA 0.0.98G contrast.
 */

/** Linear-light sRGB, each channel 0–1, plus straight (not premultiplied) alpha. */
export type Rgba = readonly [r: number, g: number, b: number, a: number]

export interface Oklch {
  /** Perceived lightness, 0–1. */
  readonly l: number
  readonly c: number
  /** Hue in degrees. */
  readonly h: number
  readonly alpha?: number
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

/** Linear sRGB → OKLCH. */
export function linearToOklch([r, g, b, a]: Rgba): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  const h = c < 1e-7 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360
  return { l: L, c, h, alpha: a }
}

/** OKLCH → linear sRGB, unclamped (may fall outside the gamut). */
export function oklchToLinear({ l: L, c, h, alpha = 1 }: Oklch): Rgba {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    alpha,
  ]
}

const inGamut = ([r, g, b]: Rgba) => [r, g, b].every((x) => x >= -1e-5 && x <= 1 + 1e-5)

/** OKLCH → linear sRGB inside the gamut, reducing chroma (keeping L and h) when it doesn't fit. */
export function oklchToLinearInGamut(color: Oklch): Rgba {
  let rgb = oklchToLinear(color)
  if (inGamut(rgb)) return clampRgba(rgb)
  let lo = 0
  let hi = color.c
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    rgb = oklchToLinear({ ...color, c: mid })
    if (inGamut(rgb)) lo = mid
    else hi = mid
  }
  return clampRgba(oklchToLinear({ ...color, c: lo }))
}

const clampRgba = ([r, g, b, a]: Rgba): Rgba => [clamp01(r), clamp01(g), clamp01(b), clamp01(a)]

/** Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `oklch(L% C H / A)` and `rgb()/rgba()`. */
export function parseColor(input: string): Rgba {
  const s = input.trim().toLowerCase()
  if (s === "transparent") return [0, 0, 0, 0]
  if (s.startsWith("#")) {
    let hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join("")
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) throw new Error(`Invalid colour: ${input}`)
    const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return [toLinear(n(0)), toLinear(n(2)), toLinear(n(4)), hex.length === 8 ? n(6) : 1]
  }
  const fn = /^(oklch|rgba?)\(([^)]*)\)$/.exec(s)
  if (!fn) throw new Error(`Unsupported colour: ${input}`)
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean)
  const num = (p: string | undefined, scale: number) =>
    p === undefined
      ? 1
      : p.endsWith("%")
        ? Number.parseFloat(p) / 100
        : Number.parseFloat(p) / scale
  if (fn[1] === "oklch") {
    const l = num(parts[0], 1)
    return oklchToLinearInGamut({
      l,
      c: Number.parseFloat(parts[1]!),
      h: Number.parseFloat(parts[2]!),
      alpha: num(parts[3], 1),
    })
  }
  return [
    toLinear(num(parts[0], 255)),
    toLinear(num(parts[1], 255)),
    toLinear(num(parts[2], 255)),
    num(parts[3], 1),
  ]
}

export const toOklch = (input: string): Oklch => linearToOklch(parseColor(input))

const byte = (c: number) =>
  Math.round(clamp01(c) * 255)
    .toString(16)
    .padStart(2, "0")

/** Linear sRGB → `#rrggbb`, or `#rrggbbaa` when not opaque. */
export function formatHex([r, g, b, a]: Rgba): string {
  const rgb = `#${byte(toGamma(r))}${byte(toGamma(g))}${byte(toGamma(b))}`
  return a >= 0.9995 ? rgb : rgb + byte(a)
}

export const oklchToHex = (color: Oklch) => formatHex(oklchToLinearInGamut(color))

/** Rounds to the 8-bit hex grid, so values compare and serialise the same everywhere. */
export const normalize = (input: string) => formatHex(parseColor(input))

/** `color` at `alpha` (multiplying any alpha it already has). */
export function withAlpha(input: string, alpha: number): string {
  const [r, g, b, a] = parseColor(input)
  return formatHex([r, g, b, a * alpha])
}

/** `top` composited over an opaque `bottom` in gamma-encoded sRGB (what browsers paint). */
export function over(top: string, bottom: string): string {
  const t = parseColor(top)
  const b = parseColor(bottom)
  const a = t[3]
  const mix = (i: 0 | 1 | 2) => toLinear(toGamma(t[i]) * a + toGamma(b[i]) * (1 - a))
  return formatHex([mix(0), mix(1), mix(2), 1])
}

/** `a` mixed toward `b` by `t` (0–1) in OKLCH, the hue taking the shorter arc. */
export function mixOklch(a: string, b: string, t: number): string {
  const x = toOklch(a)
  const y = toOklch(b)
  const hx = x.c < 1e-4 ? y.h : x.h
  const hy = y.c < 1e-4 ? hx : y.h
  let dh = hy - hx
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return oklchToHex({
    l: x.l + (y.l - x.l) * t,
    c: x.c + (y.c - x.c) * t,
    h: (hx + dh * t + 360) % 360,
    alpha: (x.alpha ?? 1) + ((y.alpha ?? 1) - (x.alpha ?? 1)) * t,
  })
}

/** APCA's screen luminance Y: gamma 2.4 on the sRGB channels, no linear segment (0.0.98G). */
function apcaY(input: string): number {
  const [r, g, b] = parseColor(input).map(toGamma) as unknown as Rgba
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4
}

/**
 * APCA 0.0.98G lightness contrast of `text` on `background`, as an absolute Lc (light text on
 * dark is negative in APCA; this returns its magnitude). A translucent text colour is composited
 * over the background first.
 */
export function apca(text: string, background: string): number {
  const bgOpaque = parseColor(background)[3] < 1 ? over(background, "#000") : background
  const fg = parseColor(text)[3] < 1 ? over(text, bgOpaque) : text
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA's black-clamp exponent, not √2
  const soft = (y: number) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414)
  const yt = soft(apcaY(fg))
  const yb = soft(apcaY(bgOpaque))
  if (Math.abs(yb - yt) < 0.0005) return 0
  if (yb > yt) {
    const sapc = (yb ** 0.56 - yt ** 0.57) * 1.14
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100
  }
  const sapc = (yb ** 0.65 - yt ** 0.62) * 1.14
  return sapc > -0.1 ? 0 : -(sapc + 0.027) * 100
}
