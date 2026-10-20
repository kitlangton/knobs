import {
  formatHex,
  linearToOklch,
  normalize,
  type Oklch,
  oklchToLinear,
  parseColor,
} from "./color.js"

/**
 * Evaluates the small CSS colour language the token derivations are written in: `var(--k-…)`
 * (with fallbacks), `color-mix(in oklch, A p, B q)` (premultiplied, shorter hue, as browsers do),
 * `calc(N% * var(--k-contrast))` percentages, and plain colours. The same strings are emitted as
 * CSS, so the TypeScript-resolved maps and the browser agree by construction.
 */
export type Lookup = (cssName: string) => string | undefined

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === "," && depth === 0) {
      out.push(s.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(s.slice(start).trim())
  return out
}

const call = (s: string, fn: string) =>
  s.startsWith(`${fn}(`) && s.endsWith(")") ? s.slice(fn.length + 1, -1) : undefined

export function evaluate(input: string, lookup: Lookup): string {
  const s = input.trim()
  const v = call(s, "var")
  if (v !== undefined) {
    const [name, ...fallback] = splitTop(v)
    const value = lookup(name!)
    if (value !== undefined) return evaluate(value, lookup)
    if (fallback.length) return evaluate(fallback.join(","), lookup)
    throw new Error(`Unresolved ${name}`)
  }
  const mix = call(s, "color-mix")
  if (mix !== undefined) return colorMix(mix, lookup)
  return normalize(s)
}

/** A percentage, possibly `calc(N% * var(--k-…))`, as a fraction. */
function percent(s: string, lookup: Lookup): number {
  const c = call(s, "calc")
  if (c === undefined) return Number.parseFloat(s) / 100
  const [a, b] = c.split("*").map((x) => x.trim())
  const num = (x: string) => {
    const inner = call(x, "var")
    if (inner !== undefined)
      return Number.parseFloat(lookup(splitTop(inner)[0]!) ?? Number.NaN.toString())
    return x.endsWith("%") ? Number.parseFloat(x) / 100 : Number.parseFloat(x)
  }
  const out = num(a!) * num(b!)
  if (!Number.isFinite(out)) throw new Error(`Bad percentage: ${s}`)
  return out
}

/** A colour followed by an optional percentage: `var(--k-fg) 5.5%`. */
function stop(s: string, lookup: Lookup): { color: string; p?: number } {
  const m = /^(.*?)\s+((?:calc\(.*\))|(?:[\d.]+%))$/.exec(s)
  if (!m) return { color: evaluate(s, lookup) }
  return { color: evaluate(m[1]!, lookup), p: percent(m[2]!, lookup) }
}

function colorMix(args: string, lookup: Lookup): string {
  const [space, a, b] = splitTop(args)
  if (space !== "in oklch")
    throw new Error(`Only color-mix(in oklch, …) is supported, got ${space}`)
  const x = stop(a!, lookup)
  const y = stop(b!, lookup)
  let p1 = x.p ?? (y.p === undefined ? 0.5 : 1 - y.p)
  let p2 = y.p ?? 1 - p1
  const sum = p1 + p2
  const scale = sum < 1 ? sum : 1
  p1 /= sum
  p2 /= sum
  const ca = linearToOklch(parseColor(x.color))
  const cb = linearToOklch(parseColor(y.color))
  const a1 = ca.alpha ?? 1
  const a2 = cb.alpha ?? 1
  const alpha = a1 * p1 + a2 * p2
  if (alpha <= 0) return "#00000000"
  // Achromatic colours (and transparent) have no hue: they take the other side's.
  const powerless = (c: Oklch, alpha: number) => c.c < 2e-4 || alpha === 0
  const h1 = powerless(ca, a1) ? cb.h : ca.h
  const h2 = powerless(cb, a2) ? h1 : cb.h
  let dh = h2 - h1
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  const pre = (u: number, v: number) => (u * a1 * p1 + v * a2 * p2) / alpha
  const rgb = oklchToLinear({
    l: pre(ca.l, cb.l),
    c: pre(ca.c, cb.c),
    h: (h1 + dh * p2 + 360) % 360,
  })
  return formatHex([rgb[0], rgb[1], rgb[2], alpha * scale])
}
