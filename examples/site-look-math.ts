// The site look's blending, kept pure so it can be tested: colours mix in OKLab (premultiplied, as
// CSS does), numbers mix linearly, and a look between two themes is a valid look of its own.
//
// Light and dark can't meet by mixing alone: a text colour and its background that swap places
// must, somewhere on the way, be equal. So the two kinds of colour travel differently. Grounds
// (pages, cards, a panel's background) follow the knob and, crossing from dark to light, pass
// through the one grey that white and black text both read on (4.6:1) exactly halfway. Inks (text,
// lines, washes, accents) take the polarity instead: the side of that grey the knob is on, with a
// little hysteresis, which the page eases over on a short spring of its own. At rest every
// position's text reads.

/** sRGB 0–1 with straight alpha. */
export type Rgba = readonly [number, number, number, number]

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (commas or spaces, alpha as a number or %). */
export function parseColor(css: string): Rgba {
  const s = css.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(s)?.[1]
  if (hex) {
    const full =
      hex.length <= 4
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16) / 255
    return [n(0), n(2), n(4), full.length === 8 ? n(6) : 1]
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(s)?.[1]
  if (fn) {
    const parts = fn.split(/[\s,/]+/).filter(Boolean)
    const ch = (p: string | undefined) => (p ? parseFloat(p) / 255 : 0)
    const a = parts[3]
    const alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a)
    return [ch(parts[0]), ch(parts[1]), ch(parts[2]), clamp01(alpha)]
  }
  throw new Error(`Unparsed colour: ${css}`)
}

const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
const toGamma = (x: number) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055)

/** OKLab (L, a, b) of an sRGB colour. */
export function oklab(c: Rgba): [number, number, number] {
  const r = toLinear(c[0])
  const g = toLinear(c[1])
  const b = toLinear(c[2])
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** An OKLab colour back in sRGB 0–1 (clipped to the gamut), with `alpha`. */
export function fromOklab(L: number, a: number, b: number, alpha = 1): Rgba {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp01(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    clamp01(alpha),
  ]
}

/**
 * Colours mixed by weight in OKLab, premultiplied by alpha (so a transparent end takes no hue).
 * `l` reshapes the mixed lightness when given (the grounds' path through the grey).
 */
export function mixColors(
  colors: readonly Rgba[],
  weights: readonly number[],
  l?: (L: number) => number,
): Rgba {
  return mixLab(colors.map(toLab), weights, l)
}

/** A colour as OKLab with its alpha: what mixing works in, converted once. */
export type Lab4 = readonly [number, number, number, number]
const toLab = (c: Rgba): Lab4 => {
  const [L, a, b] = oklab(c)
  return [L, a, b, c[3]]
}

function mixLab(labs: readonly Lab4[], weights: readonly number[], l?: (L: number) => number) {
  let L = 0
  let A = 0
  let B = 0
  let alpha = 0
  let total = 0
  for (let i = 0; i < labs.length; i++) {
    const w = weights[i] ?? 0
    if (w <= 0) continue
    const c = labs[i]!
    L += c[0] * c[3] * w
    A += c[1] * c[3] * w
    B += c[2] * c[3] * w
    alpha += c[3] * w
    total += w
  }
  if (total <= 0 || alpha <= 1e-6) return [0, 0, 0, 0] as Rgba
  alpha /= total
  const k = 1 / (alpha * total)
  const mixedL = L * k
  return fromOklab(l ? l(mixedL) : mixedL, A * k, B * k, alpha)
}

export const mix = (a: Rgba, b: Rgba, t: number): Rgba => mixColors([a, b], [1 - t, t])

/** WCAG relative luminance. */
export const luminance = (c: Rgba) =>
  0.2126 * toLinear(c[0]) + 0.7152 * toLinear(c[1]) + 0.0722 * toLinear(c[2])

/** `fg` composited over an opaque `bg`. */
export const over = (fg: Rgba, bg: Rgba): Rgba => [
  lerp(bg[0], fg[0], fg[3]),
  lerp(bg[1], fg[1], fg[3]),
  lerp(bg[2], fg[2], fg[3]),
  1,
]

/** WCAG contrast of `fg` (composited) on an opaque `bg`. */
export function contrast(fg: Rgba, bg: Rgba) {
  const a = luminance(over(fg, bg))
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The grey that white and black text read on equally (≈ 4.58:1 each), as OKLab lightness. */
export const PIVOT_L = Math.cbrt(Math.sqrt(1.05 * 0.05) - 0.05)

/**
 * A ground's lightness from `la` to `lb` across a dark ↔ light segment: smooth (monotone cubic
 * Hermite) and through the pivot exactly halfway, so every ground on the page passes it together.
 */
export function crossL(la: number, lb: number, u: number) {
  const d0 = 2 * (PIVOT_L - la)
  const d1 = 2 * (lb - PIVOT_L)
  // Slower through the pivot than the harmonic mean: the grounds linger at the grey either side
  // of the middle, where the polarity is held.
  const m1 = d0 * d1 > 0 ? (0.7 * 2 * d0 * d1) / (d0 + d1) : 0
  const hermite = (y0: number, y1: number, m0: number, m2: number, t: number) => {
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * y0 +
      (t3 - 2 * t2 + t) * 0.5 * m0 +
      (-2 * t3 + 3 * t2) * y1 +
      (t3 - t2) * 0.5 * m2
    )
  }
  return u <= 0.5
    ? hermite(la, PIVOT_L, d0, m1, u / 0.5)
    : hermite(PIVOT_L, lb, m1, d1, (u - 0.5) / 0.5)
}

// ── Themes and looks ──

export type FontKey = "sans" | "serif" | "mono" | "wide"

export interface Theme<G extends string, I extends string, N extends string> {
  readonly id: string
  readonly name: string
  readonly dark: boolean
  /** Backgrounds: they follow the knob. */
  readonly ground: Readonly<Record<G, string>>
  /** Text, lines, washes and accents: they follow the polarity. */
  readonly ink: Readonly<Record<I, string>>
  readonly num: Readonly<Record<N, number>>
  readonly font: FontKey
  /** The Swarm's colour scheme. */
  readonly scheme: string
}

/** Everything the page shows at one position, resolved. */
export interface Look {
  readonly colors: Readonly<Record<string, Rgba>>
  readonly num: Readonly<Record<string, number>>
  /** Each display face's share of the title (they crossfade). */
  readonly fonts: Readonly<Record<string, number>>
  /** Each Swarm scheme's share of its palette. */
  readonly schemes: Readonly<Record<string, number>>
}

// biome-ignore lint/suspicious/noExplicitAny: any theme
type AnyTheme = Theme<any, any, any>

/** The segment a position falls in: its themes' indices and how far along (0–1). */
export function segment(count: number, x: number) {
  const at = Math.min(Math.max(x, 0), count - 1)
  const i = Math.min(count - 2, Math.floor(at))
  return { i, u: at - i }
}

/** Polarity at `x` (true is dark), holding the previous one for `hold` past a crossing's middle. */
export function darkAt(themes: readonly AnyTheme[], x: number, wasDark?: boolean, hold = 0.03) {
  const { i, u } = segment(themes.length, x)
  const a = themes[i]!
  const b = themes[i + 1]!
  if (a.dark === b.dark) return u < 0.5 ? a.dark : b.dark
  const mid = wasDark === undefined ? 0.5 : wasDark === a.dark ? 0.5 + hold : 0.5 - hold
  return u < mid ? a.dark : b.dark
}

/** The index of the theme of polarity `dark` nearest `x` (the earlier one on a tie). */
export function nearestTheme(themes: readonly AnyTheme[], x: number, dark: boolean) {
  let best = -1
  themes.forEach((t, i) => {
    if (t.dark !== dark) return
    if (best < 0 || Math.abs(i - x) < Math.abs(best - x) - 1e-9) best = i
  })
  return best
}

/**
 * The weight of each theme in a polarity's inks at `x`: between the nearest themes of that
 * polarity on either side, or the nearest one alone past the last.
 */
function polarityWeights(themes: readonly AnyTheme[], x: number, dark: boolean) {
  const w = themes.map(() => 0)
  let prev = -1
  let next = -1
  themes.forEach((t, i) => {
    if (t.dark !== dark) return
    if (i <= x) prev = i
    if (i >= x && next < 0) next = i
  })
  if (prev < 0 && next < 0) return w
  if (prev < 0) w[next] = 1
  else if (next < 0 || next === prev) w[prev] = 1
  else {
    const t = (x - prev) / (next - prev)
    w[prev] = 1 - t
    w[next] = t
  }
  return w
}

/** Text inks firm up near the pivot, where they'd otherwise read faintest. */
export const TEXT_INKS = new Set(["text", "label", "dim", "kicker", "kText", "kLabel", "kDim"])

/**
 * The look at `x`, with `light` (0–1) the polarity the inks show: 0 dark, 1 light. At rest it's
 * `darkAt(x)`'s; it eases there on its own spring.
 */
/** Each theme's colours in OKLab, by key, converted once per theme list. */
const prepared = new WeakMap<
  readonly AnyTheme[],
  { ground: Record<string, Lab4[]>; ink: Record<string, Lab4[]> }
>()
function prepare(themes: readonly AnyTheme[]) {
  let p = prepared.get(themes)
  if (p) return p
  const by = (pick: (t: AnyTheme) => Readonly<Record<string, string>>) => {
    const out: Record<string, Lab4[]> = {}
    for (const k of Object.keys(pick(themes[0]!)))
      out[k] = themes.map((t) => toLab(parseColor(pick(t)[k]!)))
    return out
  }
  p = { ground: by((t) => t.ground), ink: by((t) => t.ink) }
  prepared.set(themes, p)
  return p
}

export function lookAt(themes: readonly AnyTheme[], x: number, light: number): Look {
  const { i, u } = segment(themes.length, x)
  const a = themes[i]!
  const b = themes[i + 1]!
  const crossing = a.dark !== b.dark
  const labs = prepare(themes)
  const colors: Record<string, Rgba> = {}
  for (const k of Object.keys(labs.ground)) {
    const ca = labs.ground[k]![i]!
    const cb = labs.ground[k]![i + 1]!
    const straddles = crossing && (ca[0] - PIVOT_L) * (cb[0] - PIVOT_L) < 0
    colors[k] = mixLab([ca, cb], [1 - u, u], straddles ? () => crossL(ca[0], cb[0], u) : undefined)
  }
  const wd = polarityWeights(themes, x, true)
  const wl = polarityWeights(themes, x, false)
  const weights = themes.map((_, j) => (1 - light) * wd[j]! + light * wl[j]!)
  // How near the page is to the pivot: text inks firm up there, more opaque and further from the
  // grey, toward white while the polarity is dark and black while it's light.
  const pageL = colors.page ? oklab(colors.page)[0] : 0
  const firm = 0.9 * Math.max(0, 1 - Math.abs(pageL - PIVOT_L) / 0.24)
  for (const k of Object.keys(labs.ink)) {
    const text = TEXT_INKS.has(k) && firm > 0
    const c = mixLab(labs.ink[k]!, weights, text ? (L) => lerp(L, 1 - light, firm) : undefined)
    colors[k] = text ? [c[0], c[1], c[2], lerp(c[3], 1, firm)] : c
  }
  const num: Record<string, number> = {}
  for (const k of Object.keys(a.num)) num[k] = lerp(a.num[k], b.num[k], u)
  const fonts: Record<string, number> = {}
  // A face crosses over the segment's middle, easing in and out, while sizes and weights move
  // throughout.
  const c = a.font === b.font ? u : smoothstep(0.2, 0.8, u)
  fonts[a.font] = (fonts[a.font] ?? 0) + 1 - c
  fonts[b.font] = (fonts[b.font] ?? 0) + c
  const schemes: Record<string, number> = {}
  schemes[a.scheme] = (schemes[a.scheme] ?? 0) + 1 - u
  schemes[b.scheme] = (schemes[b.scheme] ?? 0) + u
  return { colors, num, fonts, schemes }
}

/**
 * Where two faces meet at `x`: the next theme's face wipes in from the left over the segment's
 * middle (`at`, 0–1 across the title), the last one's out to the right. Null with one face.
 */
export function faceWipe(themes: readonly AnyTheme[], x: number) {
  const { i, u } = segment(themes.length, x)
  const from = themes[i]!.font
  const to = themes[i + 1]!.font
  const at = smoothstep(0.2, 0.8, u)
  if (from === to || at <= 0 || at >= 1) return null
  return { from, to, at }
}

const mixWeights = (
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
  t: number,
) => {
  const out: Record<string, number> = {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    out[k] = lerp(a[k] ?? 0, b[k] ?? 0, t)
  return out
}

/** Two looks mixed: a fade from one to the other with no stops between (reduced motion). */
export function mixLooks(a: Look, b: Look, t: number): Look {
  const colors: Record<string, Rgba> = {}
  for (const k of Object.keys(b.colors))
    colors[k] = a.colors[k] ? mix(a.colors[k]!, b.colors[k]!, t) : b.colors[k]!
  const num: Record<string, number> = {}
  for (const k of Object.keys(b.num)) num[k] = lerp(a.num[k] ?? b.num[k]!, b.num[k]!, t)
  return {
    colors,
    num,
    fonts: mixWeights(a.fonts, b.fonts, t),
    schemes: mixWeights(a.schemes, b.schemes, t),
  }
}

/**
 * A critically damped spring by duration (Kit's bounce 0: ω = 2π / duration), stepped exactly,
 * so it keeps its velocity when retargeted.
 */
export function stepSpring(
  s: { x: number; v: number },
  target: number,
  duration: number,
  dt: number,
) {
  const w = (2 * Math.PI) / duration
  const d = s.x - target
  const e = Math.exp(-w * dt)
  const k = s.v + w * d
  s.x = target + (d + k * dt) * e
  s.v = (s.v - w * dt * k) * e
}

/** A corner's "roundness" (0 square … 1 a capsule) as the px --k-round takes. */
export const roundPx = (r: number) => (r >= 0.999 ? 999 : Math.min(999, (24 * r) / (1 - r)))

/** A colour as CSS, at sub-8-bit precision. */
export const css = (c: Rgba) =>
  `rgb(${(c[0] * 255).toFixed(1)} ${(c[1] * 255).toFixed(1)} ${(c[2] * 255).toFixed(1)}${c[3] < 1 ? ` / ${c[3].toFixed(3)}` : ""})`
