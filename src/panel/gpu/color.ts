import { springMotion } from "../../core/spring.js"

export type Rgba = readonly [number, number, number, number]

const colorCache = new Map<string, Rgba>()
let probeCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

function getProbeCtx() {
  if (probeCtx) return probeCtx
  if (typeof OffscreenCanvas !== "undefined") {
    probeCtx = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })
  } else if (typeof document !== "undefined") {
    const c = document.createElement("canvas")
    c.width = 1
    c.height = 1
    probeCtx = c.getContext("2d", { willReadFrequently: true })
  }
  return probeCtx
}

export function parseCssColor(raw: string, fallback: Rgba = [1, 1, 1, 1]): Rgba {
  const s = raw.trim()
  if (!s) return fallback
  const hit = colorCache.get(s)
  if (hit) return hit

  let out: Rgba | undefined
  if (s.startsWith("#")) {
    const hex = s.slice(1)
    if (hex.length === 3) {
      out = [
        parseInt(hex[0]! + hex[0]!, 16) / 255,
        parseInt(hex[1]! + hex[1]!, 16) / 255,
        parseInt(hex[2]! + hex[2]!, 16) / 255,
        1,
      ]
    } else if (hex.length === 6 || hex.length === 8) {
      out = [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
        hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ]
    }
  } else if (s.startsWith("rgb")) {
    const nums = s.match(/[\d.]+/g)?.map(Number)
    if (nums && nums.length >= 3) {
      out = [
        Math.min(1, Math.max(0, nums[0]! / 255)),
        Math.min(1, Math.max(0, nums[1]! / 255)),
        Math.min(1, Math.max(0, nums[2]! / 255)),
        nums.length >= 4 ? Math.min(1, Math.max(0, nums[3]!)) : 1,
      ]
    }
  }

  if (!out) {
    const ctx = getProbeCtx()
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = s
      ctx.fillRect(0, 0, 1, 1)
      const data = ctx.getImageData(0, 0, 1, 1).data
      out = [data[0]! / 255, data[1]! / 255, data[2]! / 255, data[3]! / 255]
    } else {
      out = fallback
    }
  }

  if (colorCache.size > 1024) colorCache.clear()
  colorCache.set(s, out)
  return out
}

export function withAlpha(c: Rgba, alphaFactor: number): Rgba {
  return [c[0], c[1], c[2], Math.min(1, Math.max(0, c[3] * alphaFactor))]
}

export function mixColor(a: Rgba, b: Rgba, t: number): Rgba {
  const u = Math.min(1, Math.max(0, t))
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u,
  ]
}

/** CSS `color-mix(in srgb, a p, b)`, interpolated with premultiplied alpha like the browser. */
export function cssMix(a: Rgba, b: Rgba, p: number): Rgba {
  const alpha = a[3] * p + b[3] * (1 - p)
  if (alpha <= 0) return [0, 0, 0, 0]
  const ch = (i: number) => (a[i]! * a[3] * p + b[i]! * b[3] * (1 - p)) / alpha
  return [ch(0), ch(1), ch(2), alpha]
}

export interface PanelThemeTokens {
  readonly bg: Rgba
  readonly surface: Rgba
  readonly surfaceHi: Rgba
  readonly line: Rgba
  readonly lineHi: Rgba
  readonly text: Rgba
  readonly label: Rgba
  readonly dim: Rgba
  readonly accent: Rgba
  readonly modified: Rgba
  readonly segBg: Rgba
  readonly segActive: Rgba
  readonly toggleTrack: Rgba
  readonly rim: Rgba
  readonly radius: number
  readonly panelRadius: number
  readonly inset: number
  readonly fontSize: number
  readonly labelWeight: number
  readonly blurStrength: number
  readonly glowStrength: number
  /** 0 is an opaque panel; up to 1 thins it over a blurred backdrop (--k-glass). */
  readonly glass: number
  /** Backdrop brightness under full glass (dims what shows through dark panels). */
  readonly glassTone: number
  /** The spring values settle on (--k-spring: duration bounce), as ω and ζ. */
  readonly fillOmega: number
  readonly fillZeta: number
  readonly fontFamily: string
  readonly monoFamily: string
  readonly isLight: boolean
}

const numProp = (style: CSSStyleDeclaration, name: string, fallback: number): number => {
  const raw = parseFloat(style.getPropertyValue(name))
  return Number.isFinite(raw) ? raw : fallback
}

const tokenCache = new WeakMap<HTMLElement, { version: number; tokens: PanelThemeTokens }>()

export function readPanelTokens(panel: HTMLElement, version = -1): PanelThemeTokens {
  if (version >= 0) {
    const hit = tokenCache.get(panel)
    if (hit && hit.version === version) return hit.tokens
  }
  const style = getComputedStyle(panel)
  const bg = parseCssColor(style.getPropertyValue("--k-bg"), [0.11, 0.11, 0.12, 1])
  const isLight = bg[0] * 0.2126 + bg[1] * 0.7152 + bg[2] * 0.0722 > 0.55
  const surface = parseCssColor(
    style.getPropertyValue("--k-surface"),
    isLight ? [0, 0, 0, 0.05] : [1, 1, 1, 0.055],
  )
  const surfaceHi = parseCssColor(
    style.getPropertyValue("--k-surface-hi"),
    isLight ? [0, 0, 0, 0.095] : [1, 1, 1, 0.11],
  )
  const line = parseCssColor(
    style.getPropertyValue("--k-line"),
    isLight ? [0, 0, 0, 0.1] : [1, 1, 1, 0.1],
  )
  const lineHi = parseCssColor(
    style.getPropertyValue("--k-line-hi"),
    isLight ? [0, 0, 0, 0.2] : [1, 1, 1, 0.18],
  )
  const text = parseCssColor(
    style.getPropertyValue("--k-text"),
    isLight ? [0, 0, 0, 0.88] : [1, 1, 1, 0.92],
  )
  const label = parseCssColor(
    style.getPropertyValue("--k-label"),
    isLight ? [0.23, 0.23, 0.26, 0.68] : [1, 1, 1, 0.64],
  )
  const dim = parseCssColor(
    style.getPropertyValue("--k-dim"),
    isLight ? [0.23, 0.23, 0.26, 0.44] : [1, 1, 1, 0.42],
  )
  const accent = parseCssColor(
    style.getPropertyValue("--k-accent"),
    isLight ? [0.11, 0.11, 0.12, 1] : [1, 1, 1, 1],
  )
  const modified = parseCssColor(
    style.getPropertyValue("--k-modified"),
    isLight ? [0.85, 0.47, 0.02, 1] : [1, 0.62, 0.04, 1],
  )
  const segBg = parseCssColor(
    style.getPropertyValue("--k-seg-bg"),
    isLight ? [0, 0, 0, 0.065] : [0, 0, 0, 0.25],
  )
  const segActive = parseCssColor(style.getPropertyValue("--k-seg-active"), surfaceHi)
  const toggleTrack = parseCssColor(
    style.getPropertyValue("--k-toggle-track"),
    isLight ? [0, 0, 0, 0.14] : [1, 1, 1, 0.14],
  )

  const [duration, bounce] = style.getPropertyValue("--k-spring").trim().split(/\s+/).map(Number)
  const fill =
    Number.isFinite(duration) && Number.isFinite(bounce)
      ? springMotion({ duration: duration!, bounce: bounce! })
      : { omega: 26, zeta: 0.84 }

  const fontFamily =
    style.fontFamily ||
    style.getPropertyValue("--k-font").trim() ||
    'system-ui, -apple-system, "SF Pro Text", sans-serif'
  const monoFamily =
    style.getPropertyValue("--k-mono").trim() ||
    'ui-monospace, "Geist Mono", SFMono-Regular, Menlo, monospace'

  const tokens: PanelThemeTokens = {
    bg,
    surface,
    surfaceHi,
    line,
    lineHi,
    text,
    label,
    dim,
    accent,
    modified,
    segBg,
    segActive,
    toggleTrack,
    rim: parseCssColor(
      style.getPropertyValue("--k-rim"),
      isLight ? [1, 1, 1, 0.75] : [1, 1, 1, 0.09],
    ),
    radius: numProp(style, "--k-radius", 8),
    panelRadius: numProp(style, "--k-panel-radius", 12),
    inset: numProp(style, "--k-inset", 10),
    fontSize: parseFloat(style.fontSize) || numProp(style, "--k-font-size", 12),
    labelWeight: numProp(style, "--k-label-weight", 500),
    blurStrength: numProp(style, "--k-blur", 1),
    glowStrength: numProp(style, "--k-glow", 0.5),
    glass: Math.min(1, Math.max(0, numProp(style, "--k-glass", 0))),
    glassTone: numProp(style, "--k-glass-tone", isLight ? 1.08 : 0.5),
    fillOmega: fill.omega,
    fillZeta: fill.zeta,
    fontFamily,
    monoFamily,
    isLight,
  }
  if (version >= 0) tokenCache.set(panel, { version, tokens })
  return tokens
}
