// CSS colours as straight RGBA in 0–1, for drawing the same colours on a 2D canvas and on the GPU.
export type Rgba = readonly [number, number, number, number]

const cache = new Map<string, Rgba>()
let probe: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
const probeCtx = () => {
  if (probe) return probe
  if (typeof OffscreenCanvas !== "undefined")
    probe = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true })
  else if (typeof document !== "undefined") {
    const c = document.createElement("canvas")
    c.width = c.height = 1
    probe = c.getContext("2d", { willReadFrequently: true })
  }
  return probe
}

/** Any CSS colour (hex, rgb(), oklch(), color-mix(), calc() inside) as RGBA; `fallback` if not one. */
export function parseCssColor(raw: string, fallback: Rgba = [1, 1, 1, 1]): Rgba {
  const s = raw.trim()
  if (!s) return fallback
  const hit = cache.get(s)
  if (hit) return hit
  let out: Rgba | undefined
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s)?.[1]
  if (hex && (hex.length === 3 || hex.length === 6 || hex.length === 8)) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex
    out = [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255,
      full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
    ]
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
    const ctx = probeCtx()
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "#000"
      ctx.fillStyle = s
      ctx.fillRect(0, 0, 1, 1)
      const d = ctx.getImageData(0, 0, 1, 1).data
      // Straight alpha back out of the premultiplied pixel.
      const a = d[3]! / 255
      out = a > 0 ? [d[0]! / 255, d[1]! / 255, d[2]! / 255, a] : [0, 0, 0, 0]
    }
  }
  out ??= fallback
  if (cache.size > 1024) cache.clear()
  cache.set(s, out)
  return out
}

export const withAlpha = (c: Rgba, k: number): Rgba => [
  c[0],
  c[1],
  c[2],
  Math.max(0, Math.min(1, c[3] * k)),
]

export const mixRgba = (a: Rgba, b: Rgba, t: number): Rgba => {
  const u = Math.max(0, Math.min(1, t))
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
    a[3] + (b[3] - a[3]) * u,
  ]
}

export const rgbaCss = (c: Rgba) =>
  `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.round(c[3] * 1000) / 1000})`

/**
 * A token's computed value with each `light-dark(a, b)` in it (as theme colours arrive in custom
 * properties) replaced by the side `light` picks, so a canvas can parse it.
 */
export function pickScheme(raw: string, light: boolean): string {
  let s = raw
  for (let at = s.lastIndexOf("light-dark("); at >= 0; at = s.lastIndexOf("light-dark(")) {
    let depth = 0
    let comma = -1
    let end = -1
    for (let i = at + 11; i < s.length; i++) {
      const ch = s[i]
      if (ch === "(") depth++
      else if (ch === ")") {
        if (depth === 0) {
          end = i
          break
        }
        depth--
      } else if (ch === "," && depth === 0 && comma < 0) comma = i
    }
    if (end < 0 || comma < 0) break
    const side = light ? s.slice(at + 11, comma) : s.slice(comma + 1, end)
    s = s.slice(0, at) + side.trim() + s.slice(end + 1)
  }
  return s
}

/** Whether a knobs root (or anything in one) shows its light appearance. */
export const isLightStyle = (style: CSSStyleDeclaration) =>
  style.getPropertyValue("--_k-light").trim() === "1"

/** A colour token (`--kv-fg`, `--_k-warn`) as `style`'s element shows it. */
export function tokenColor(style: CSSStyleDeclaration, name: string, fallback: Rgba): Rgba {
  const raw = style.getPropertyValue(name).trim()
  return raw ? parseCssColor(pickScheme(raw, isLightStyle(style)), fallback) : fallback
}

/** A colour token as CSS a canvas takes, or `fallback`. */
export function tokenCss(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = style.getPropertyValue(name).trim()
  return raw ? pickScheme(raw, isLightStyle(style)) : fallback
}
