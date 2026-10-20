// The site's settings over its theme, kept pure so it can be tested. A theme (site-look-math.ts)
// gives the page its grounds, inks, type and shapes at any point of the sweep; the settings then
// dress that look: an accent, contrast, the title's size, weight and tracking, the body's size,
// corners, the surface (flat, glass, raised), density, the page's width and grain. Every setting
// is a number (the accent is three, in OKLab), so a look between two settings is a look too, and
// whatever they're set to, the text still reads: the accent's lightness follows the polarity, and
// lowering contrast gives way near the grey where light and dark meet.
import { fromOklab, type Look, lerp, oklab, PIVOT_L, type Rgba, TEXT_INKS } from "./site-look-math"

export interface Settings {
  /** The accent, in OKLab (L, a, b): its hue and chroma are kept, its lightness suits the ground. */
  readonly accent: readonly [number, number, number]
  /** −1 softer … 1 crisper; 0 the theme's own. */
  readonly contrast: number
  /** Noise on the ground, 0–1. */
  readonly grain: number
  /** The title's size, × the theme's. */
  readonly titleSize: number
  /** Added to the title's weight. */
  readonly weight: number
  /** The body's size (px). */
  readonly body: number
  /** −1 tight … 1 open, on the title, headings, kickers and body. */
  readonly tracking: number
  /** −1 square … 0 the theme's … 1 round. */
  readonly corners: number
  /** 0 flat … 1 the theme's glass … 2 raised. */
  readonly surface: number
  /** The page's vertical rhythm, × the theme's. */
  readonly density: number
  /** The page's width (px). */
  readonly width: number
}

/** The settings as they ship: Night is the page as it was. */
export const NEUTRAL: Settings = {
  accent: [1, 0, 0],
  contrast: 0,
  grain: 0,
  titleSize: 1,
  weight: 0,
  body: 13,
  tracking: 0,
  corners: 0,
  surface: 1,
  density: 1,
  width: 1180,
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** A colour field's `oklch(L C H)` as OKLab. */
export function labOf(oklch: string): [number, number, number] {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(oklch)
  if (!m) return [1, 0, 0]
  const h = (Number(m[3]) * Math.PI) / 180
  return [Number(m[1]), Number(m[2]) * Math.cos(h), Number(m[2]) * Math.sin(h)]
}

/** The accent as text (kickers, the page's accent) and as a fill (sliders, the chosen chip). */
export function accentAt(accent: Settings["accent"], light: number) {
  const [L, a, b] = accent
  const ink = lerp(clamp(L, 0.76, 0.97), clamp(L, 0.36, 0.54), light)
  const fill = lerp(clamp(L, 0.62, 0.96), clamp(L, 0.46, 0.72), light)
  return { ink: fromOklab(ink, a, b), fill: fromOklab(fill, a, b), chroma: Math.hypot(a, b) }
}

const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], clamp(a, 0, 1)]

/** Lines and washes: contrast and the surface scale how much they show. */
const WASHES = [
  "line",
  "faint",
  "surface",
  "surfaceHi",
  "kLine",
  "kLineHi",
  "kSurface",
  "kSurfaceHi",
] as const

/** Each corner's roundest (px) when corners go to 1. */
const ROUND: Record<string, number> = { kRadius: 14, kPanelRadius: 22, rStage: 30, rCtl: 14 }

/**
 * `look` (a theme at some point, its inks at `light`, 0 dark … 1 light) dressed by `s`. Its `num`
 * gains what the page reads beside the theme's: `body`, `bodyScale`, `bodyTrack`, `pageW`,
 * `grain`, `shadowK` (× the panels' shadows), `raise` and `flat` (0–1, the page's cards) and
 * `lift` (the panels' small shadows).
 */
export function dress(look: Look, s: Settings, light: number): Look {
  const colors: Record<string, Rgba> = { ...look.colors }
  const num: Record<string, number> = { ...look.num }

  // The accent.
  const acc = accentAt(s.accent, light)
  colors.accent = acc.ink
  // A grey accent leaves the kickers quiet; a colourful one lets them speak.
  colors.kicker = withAlpha(acc.ink, lerp(0.5, 1, clamp(acc.chroma / 0.08, 0, 1)))
  colors.kAccent = acc.fill
  colors.kModified = withAlpha(acc.fill, lerp(0.55, 0.85, clamp(acc.chroma / 0.08, 0, 1)))

  // Contrast: crisper pushes text toward white or black and solid, and lines up; softer thins
  // them, but gives way near the pivot grey, where text has no room to spare.
  const pageL = colors.page ? oklab(colors.page)[0] : 0
  const near = Math.max(0, 1 - Math.abs(pageL - PIVOT_L) / 0.34)
  const c = s.contrast < 0 ? s.contrast * (1 - near) : s.contrast
  for (const k of TEXT_INKS) {
    const col = colors[k]
    if (!col) continue
    if (c > 0) {
      const [L, a, b] = oklab(col)
      const t = c * 0.5
      colors[k] = fromOklab(
        lerp(L, 1 - light, t),
        a * (1 - t),
        b * (1 - t),
        lerp(col[3], 1, c * 0.6),
      )
    } else colors[k] = withAlpha(col, col[3] * (1 + c * 0.28))
  }

  // The surface: flat (no glass, glow or shadow, a hairline on the page's cards), the theme's
  // glass, or raised (cards lifted on a deeper shadow, less glass).
  const sf = clamp(s.surface, 0, 2)
  const up = Math.max(0, sf - 1)
  const on = Math.min(1, sf)
  num.kGlass = (num.kGlass ?? 0) * on * (1 - up * 0.7)
  num.kGlow = (num.kGlow ?? 0) * on * (1 - up * 0.6)
  num.shadowK = on * (1 + up * 1.6)
  num.lift = on
  num.raise = up
  // A hairline theme (Void) keeps its cards flat whatever the surface.
  num.flat = 1 - on * (1 - (num.hair ?? 0))
  const wash = clamp(1 + c * 0.7, 0.3, 2.2)
  for (const k of WASHES) {
    const col = colors[k]
    if (col) colors[k] = withAlpha(col, col[3] * wash)
  }
  for (const k of ["kRim", "kEdge"]) {
    const col = colors[k]
    if (col) colors[k] = withAlpha(col, col[3] * on * (1 + up * 0.5))
  }

  // Corners: toward square, or toward round, from the theme's.
  const r = clamp(s.corners, -1, 1)
  for (const [k, most] of Object.entries(ROUND)) {
    const v = num[k] ?? 0
    num[k] = r < 0 ? v * (1 + r) : lerp(v, Math.max(v, most), r)
  }
  const round = num.kRound ?? 1
  num.kRound = r < 0 ? round * (1 + r) : lerp(round, 1, r)

  // Type.
  num.tSize = (num.tSize ?? 1) * s.titleSize
  num.tWeight = clamp((num.tWeight ?? 400) + s.weight, 100, 900)
  num.tTrack = (num.tTrack ?? 0) + s.tracking * 0.035
  num.hTrack = (num.hTrack ?? 0) + s.tracking * 0.015
  num.catTrack = Math.max(0, (num.catTrack ?? 0) + s.tracking * 0.05)
  num.bodyTrack = s.tracking * 0.012
  num.body = s.body
  num.bodyScale = s.body / 13

  // Space and texture.
  num.density = (num.density ?? 1) * s.density
  num.pageW = s.width
  num.grain = clamp(s.grain, 0, 1)
  return { colors, num, fonts: look.fonts }
}
