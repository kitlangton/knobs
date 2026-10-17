// One outline per letter. Faces and weights move the same points, not the opacity of
// overlapping words. No font loading, text measurement, masks or changing glyph identity.
import data from "./site-title-shapes.json?raw"
import type { FontKey, Look } from "./site-look-math"

type Point = readonly [number, number]
interface Letter {
  readonly advance: number
  readonly contours: readonly (readonly Point[])[]
}
interface Master {
  readonly weight: number
  readonly letters: readonly Letter[]
}

export const titleShapes = JSON.parse(data) as Readonly<Record<FontKey, readonly Master[]>>
const FACES = ["sans", "serif", "mono", "wide"] as const

/** Compatible contours make any mixture valid, including a third face picked mid-morph. */
export function titleOutline(fonts: Look["fonts"], weight: number, tracking: number) {
  const layers: { letters: readonly Letter[]; share: number }[] = []
  const total = FACES.reduce((sum, face) => sum + Math.max(0, fonts[face] ?? 0), 0)
  for (const face of FACES) {
    const share = total ? Math.max(0, fonts[face] ?? 0) / total : face === "sans" ? 1 : 0
    if (!share) continue
    const masters = titleShapes[face]
    const w = Math.max(masters[0]!.weight, Math.min(masters.at(-1)!.weight, weight))
    const hi = masters.findIndex((m) => m.weight >= w)
    const a = masters[Math.max(0, hi - 1)]!
    const b = masters[hi]!
    const t = a === b ? 0 : (w - a.weight) / (b.weight - a.weight)
    if (t < 1) layers.push({ letters: a.letters, share: share * (1 - t) })
    if (t > 0) layers.push({ letters: b.letters, share: share * t })
  }
  // Tracking can't join adjacent letters. Conservative blended ink bounds also keep
  // the counters and stems readable halfway between two very different silhouettes.
  const ink = Array.from({ length: 5 }, (_, i) => {
    let left = 0
    let right = 0
    for (const layer of layers) {
      const xs = layer.letters[i]!.contours[0]!.map((p) => p[0])
      left += Math.min(...xs) * layer.share
      right += Math.max(...xs) * layer.share
    }
    return { left, right }
  })
  const paths: string[] = []
  let cursor = 0
  for (let i = 0; i < 5; i++) {
    const contours: string[] = []
    for (const [ci, contour] of titleShapes.sans[0]!.letters[i]!.contours.entries()) {
      const points: string[] = []
      for (let pi = 0; pi < contour.length; pi++) {
        let x = cursor
        let y = 0
        for (const layer of layers) {
          const p = layer.letters[i]!.contours[ci]![pi]!
          x += p[0] * layer.share
          y += p[1] * layer.share
        }
        points.push(`${pi ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`)
      }
      contours.push(`${points.join("")}Z`)
    }
    paths.push(contours.join(""))
    const advance = layers.reduce((sum, layer) => sum + layer.letters[i]!.advance * layer.share, 0)
    cursor +=
      i < 4 ? Math.max(advance + tracking, ink[i]!.right - ink[i + 1]!.left + 0.035) : advance
  }
  return { paths, advance: cursor }
}

export interface TitleFade {
  readonly from: Look
  readonly to: Look
  readonly at: number
}

export function mountTitle(host: HTMLElement) {
  const ns = "http://www.w3.org/2000/svg"
  // The resting sans outline is already in the HTML: mounting doesn't reveal or fade it in.
  const svg = host.querySelector<SVGSVGElement>("svg") ?? document.createElementNS(ns, "svg")
  svg.classList.add("mast-vector")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("fill", "currentColor")
  svg.setAttribute("fill-rule", "evenodd")
  const paths = Array.from({ length: 5 }, (_, i) => {
    const path = svg.children[i] as SVGPathElement | undefined
    if (path) return path
    const created = document.createElementNS(ns, "path")
    svg.append(created)
    return created
  })
  host.replaceChildren(svg)
  let key = ""
  return (look: Look, fade?: TitleFade) => {
    // Reduced motion replaces the whole word through a short out/in fade, without
    // travelling through intermediate letter shapes or introducing a second word.
    if (fade) {
      const opacity = Math.abs(2 * fade.at - 1)
      svg.style.opacity = String(opacity * opacity * (3 - 2 * opacity))
      look = fade.at < 0.5 ? fade.from : fade.to
    } else svg.style.removeProperty("opacity")
    const next = `${FACES.map((f) => (look.fonts[f] ?? 0).toFixed(5)).join(",")}|${look.num.tWeight!.toFixed(2)}|${look.num.tTrack!.toFixed(5)}`
    if (next === key) return
    key = next
    const word = titleOutline(look.fonts, look.num.tWeight!, look.num.tTrack!)
    for (let i = 0; i < paths.length; i++) paths[i]!.setAttribute("d", word.paths[i]!)
    const advance = word.advance.toFixed(5)
    svg.setAttribute("viewBox", `0 -1 ${advance} 1`)
    svg.style.setProperty("--title-advance", advance)
  }
}
