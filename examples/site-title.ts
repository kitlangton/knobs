// One outline per letter. Faces and weights move the same points, not the opacity of
// overlapping words. The letters morph in a short left-to-right wave, each softened only
// while it is between faces, and the word keeps one left edge, ascender and baseline.
import data from "./site-title-shapes.json?raw"
import { type FontKey, type Look, stepSpring } from "./site-look-math"

type Point = readonly [number, number]
interface Letter {
  readonly advance: number
  readonly contours: readonly (readonly Point[])[]
}
interface Master {
  readonly weight: number
  readonly letters: readonly Letter[]
}
type Fonts = Look["fonts"]

export const titleShapes = JSON.parse(data) as Readonly<Record<FontKey, readonly Master[]>>
const FACES = ["sans", "serif", "mono", "wide"] as const
/** Seconds between one letter starting its morph and the next. */
const STAGGER = 0.04
/** Peak softening halfway between two faces, in em (≈ 2 px at the largest title). */
const SOFTEN = 0.018

function layersOf(fonts: Fonts, weight: number, i: number) {
  const layers: { letter: Letter; share: number }[] = []
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
    if (t < 1) layers.push({ letter: a.letters[i]!, share: share * (1 - t) })
    if (t > 0) layers.push({ letter: b.letters[i]!, share: share * t })
  }
  return layers
}

/**
 * Compatible contours make any mixture valid, including a third face picked mid-morph.
 * `fonts` is one mixture for the whole word, or one per letter.
 */
export function titleOutline(fonts: Fonts | readonly Fonts[], weight: number, tracking: number) {
  const perLetter = Array.from({ length: 5 }, (_, i) =>
    layersOf(Array.isArray(fonts) ? (fonts as readonly Fonts[])[i]! : (fonts as Fonts), weight, i),
  )
  // Tracking can't join adjacent letters. Conservative blended ink bounds also keep
  // the counters and stems readable halfway between two very different silhouettes.
  const ink = perLetter.map((layers) => {
    let left = 0
    let right = 0
    for (const layer of layers) {
      const xs = layer.letter.contours[0]!.map((p) => p[0])
      left += Math.min(...xs) * layer.share
      right += Math.max(...xs) * layer.share
    }
    return { left, right }
  })
  const paths: string[] = []
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let cursor = 0
  for (let i = 0; i < 5; i++) {
    const layers = perLetter[i]!
    const contours: string[] = []
    for (const [ci, contour] of titleShapes.sans[0]!.letters[i]!.contours.entries()) {
      const points: string[] = []
      for (let pi = 0; pi < contour.length; pi++) {
        let x = cursor
        let y = 0
        for (const layer of layers) {
          const p = layer.letter.contours[ci]![pi]!
          x += p[0] * layer.share
          y += p[1] * layer.share
        }
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        points.push(`${pi ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`)
      }
      contours.push(`${points.join("")}Z`)
    }
    paths.push(contours.join(""))
    const advance = layers.reduce((sum, layer) => sum + layer.letter.advance * layer.share, 0)
    cursor +=
      i < 4 ? Math.max(advance + tracking, ink[i]!.right - ink[i + 1]!.left + 0.035) : advance
  }
  return { paths, advance: cursor, bounds: { left, right, top } }
}

const normalize = (fonts: Fonts): Record<FontKey, number> => {
  const total = FACES.reduce((sum, f) => sum + Math.max(0, fonts[f] ?? 0), 0)
  return Object.fromEntries(
    FACES.map((f) => [f, total ? Math.max(0, fonts[f] ?? 0) / total : f === "sans" ? 1 : 0]),
  ) as Record<FontKey, number>
}
const sameFonts = (a: Record<FontKey, number>, b: Record<FontKey, number>) =>
  FACES.every((f) => Math.abs(a[f] - b[f]) < 1e-6)

/**
 * Each letter's face shares, springing toward the word's target. Letter `i` takes a new
 * target `i × STAGGER` after it was chosen; position and velocity carry through every retarget.
 */
export function titleMorph() {
  const letters = Array.from({ length: 5 }, () => ({
    goal: undefined as Record<FontKey, number> | undefined,
    shares: Object.fromEntries(FACES.map((f) => [f, { x: 0, v: 0 }])) as Record<
      FontKey,
      { x: number; v: number }
    >,
  }))
  let goal: Record<FontKey, number> | undefined
  let since = 0
  return (fonts: Fonts, dt: number, duration: number) => {
    const target = normalize(fonts)
    if (!goal || dt === 0) {
      goal = target
      since = Infinity
      for (const l of letters) {
        l.goal = target
        for (const f of FACES) l.shares[f] = { x: target[f], v: 0 }
      }
    } else if (!sameFonts(goal, target)) {
      goal = target
      since = 0
    }
    since += dt
    let moving = false
    const out = letters.map((l, i) => {
      if (since >= i * STAGGER) l.goal = goal
      else moving = true
      for (const f of FACES) {
        const s = l.shares[f]
        const to = l.goal![f]
        stepSpring(s, to, duration, dt)
        if (Math.abs(s.x - to) < 1e-4 && Math.abs(s.v) < 1e-3) {
          s.x = to
          s.v = 0
        } else moving = true
      }
      const mix = normalize(Object.fromEntries(FACES.map((f) => [f, l.shares[f].x])))
      // 0 at rest in one face, 1 exactly halfway between two.
      const between = Math.min(1, 2 * (1 - Math.max(...FACES.map((f) => mix[f]))))
      return { fonts: mix, between }
    })
    return { letters: out, moving }
  }
}

/**
 * Reduced motion: a face changes only while the word is invisible. Retargets keep opacity
 * and velocity.
 */
export function titlePresence() {
  let face: FontKey | undefined
  const alpha = { x: 1, v: 0 }
  return (desired: FontKey, dt: number) => {
    if (face === undefined) face = desired
    const target = face === desired ? 1 : 0
    stepSpring(alpha, target, target ? 0.16 : 0.12, dt)
    if (Math.abs(alpha.x - target) < 0.001 && Math.abs(alpha.v) < 0.01) {
      alpha.x = target
      alpha.v = 0
      if (!target) face = desired
    }
    return {
      face,
      opacity: Math.max(0, Math.min(1, alpha.x)),
      moving: face !== desired || alpha.x !== 1 || alpha.v !== 0,
    }
  }
}

let mounted = 0

export function mountTitle(host: HTMLElement) {
  const ns = "http://www.w3.org/2000/svg"
  // The resting outline is already in the HTML: mounting doesn't reveal or fade it in.
  const svg = host.querySelector<SVGSVGElement>("svg") ?? document.createElementNS(ns, "svg")
  svg.classList.add("mast-vector")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("fill", "currentColor")
  svg.setAttribute("fill-rule", "evenodd")
  const existing = [...svg.querySelectorAll("path")]
  const paths = Array.from({ length: 5 }, (_, i) => {
    const path = existing[i]
    if (path) return path
    const created = document.createElementNS(ns, "path")
    svg.append(created)
    return created
  })
  // One soft-focus filter per letter, applied only while that letter is between faces.
  const id = `title-soft-${mounted++}`
  const defs = document.createElementNS(ns, "defs")
  const blurs = paths.map((_, i) => {
    const filter = document.createElementNS(ns, "filter")
    filter.id = `${id}-${i}`
    for (const [k, v] of Object.entries({ x: "-25%", y: "-25%", width: "150%", height: "150%" }))
      filter.setAttribute(k, v)
    const blur = document.createElementNS(ns, "feGaussianBlur")
    blur.setAttribute("stdDeviation", "0")
    filter.append(blur)
    defs.append(filter)
    return blur
  })
  svg.append(defs)
  host.replaceChildren(svg)
  let key = ""
  const morph = titleMorph()
  const presence = titlePresence()
  const reduced = matchMedia("(prefers-reduced-motion: reduce)")
  return (look: Look, dt: number, duration = 0.4) => {
    let fonts: Fonts[]
    let between = [0, 0, 0, 0, 0]
    let moving: boolean
    if (reduced.matches) {
      const desired = FACES.reduce((best, f) =>
        (look.fonts[f] ?? 0) > (look.fonts[best] ?? 0) ? f : best,
      )
      const p = presence(desired, dt)
      morph({ [p.face]: 1 }, 0, duration)
      fonts = Array.from({ length: 5 }, () => ({ [p.face]: 1 }))
      svg.style.opacity = String(p.opacity)
      moving = p.moving
    } else {
      const m = morph(look.fonts, dt, duration)
      fonts = m.letters.map((l) => l.fonts)
      between = m.letters.map((l) => l.between)
      svg.style.removeProperty("opacity")
      moving = m.moving
    }
    paths.forEach((path, i) => {
      const soft = between[i]! > 0.01
      blurs[i]!.setAttribute("stdDeviation", soft ? (SOFTEN * between[i]!).toFixed(5) : "0")
      if (soft) path.setAttribute("filter", `url(#${id}-${i})`)
      else path.removeAttribute("filter")
    })
    const next = `${fonts.map((f) => FACES.map((k) => (f[k] ?? 0).toFixed(4)).join(",")).join("|")}|${look.num.tWeight!.toFixed(2)}|${look.num.tTrack!.toFixed(5)}`
    if (next !== key) {
      key = next
      const word = titleOutline(fonts, look.num.tWeight!, look.num.tTrack!)
      for (let i = 0; i < paths.length; i++) paths[i]!.setAttribute("d", word.paths[i]!)
      // Align the actual ink, not the font's side bearings, at a shared ascender and baseline.
      const em = -word.bounds.top / 0.78
      const width = word.bounds.right - word.bounds.left
      svg.setAttribute("viewBox", `${word.bounds.left} ${-em} ${width} ${em}`)
      svg.style.setProperty("--title-advance", (width / em).toFixed(5))
    }
    return moving
  }
}
