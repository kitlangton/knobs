import { Spring, springMotion, type SpringValue } from "../core/spring.js"

// A die drawn like Phosphor's dice icons, but solid: a rounded cube whose bevel is inked wherever the
// surface turns more than `bevel` degrees from a face. Face-on, that band is exactly the glyph's
// outline (outer corner 32, inner 16, stroke 16 on the 256 grid), so at rest it is the icon; mid-roll
// every edge and corner is one continuous surface. The DOM traces it on a small canvas, the GPU in
// WGSL generated from the same constants, so both draw identical pixels.

/**
 * Icon units (Phosphor's 256 grid): half the cube's edge, its rounding, and the pip radius. The ink
 * band runs from `bevel` off one face to `bevel` off the next; seen face-on its edges sit at
 * inner + round·sin(bevel) and inner + round·cos(bevel), with corner radii round·sin and round·cos.
 * Phosphor's outline (80 to 96, corners 16 and 32) needs round·sin = 16 and round·cos = 32: a
 * rounding of 16√5 on a 64 inner half, with the bevel at atan(½).
 */
const ROUND = 16 * Math.sqrt(5)
export const DIE = { half: 64 + ROUND, round: ROUND, pip: 12 } as const

/** Pip centres per face value, relative to the face centre, in icon units (y down). */
export const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [
    [-20, -20],
    [20, 20],
  ],
  3: [
    [-36, -36],
    [0, 0],
    [36, 36],
  ],
  4: [
    [-28, -28],
    [28, -28],
    [-28, 28],
    [28, 28],
  ],
  5: [
    [-36, -36],
    [36, -36],
    [0, 0],
    [-36, 36],
    [36, 36],
  ],
  6: [
    [-36, -44],
    [36, -44],
    [-36, 0],
    [36, 0],
    [-36, 44],
    [36, 44],
  ],
}

type V3 = readonly [number, number, number]

/** CSS `rotateX(ax) rotateY(ay)` (degrees) applied to a vector (y down, z towards the viewer). */
function rotate([x, y, z]: V3, ax: number, ay: number): V3 {
  const a = (ay * Math.PI) / 180
  const b = (ax * Math.PI) / 180
  const x1 = x * Math.cos(a) + z * Math.sin(a)
  const z1 = -x * Math.sin(a) + z * Math.cos(a)
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)]
}
const round = (v: V3): V3 => [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])]

/**
 * Faces: value, the cube rotation that brings it to the front, and its outward normal and in-plane
 * axes in cube space (the front face rotated by the inverse turn). Opposites sum to 7.
 */
export const FACES = (
  [
    [5, 0, 0],
    [2, 0, 180],
    [3, 0, -90],
    [4, 0, 90],
    [1, -90, 0],
    [6, 90, 0],
  ] as const
).map(([value, fx, fy]) => {
  // Undo the front rotation: rotateY(-fy) then rotateX(-fx) is its inverse.
  const axis = (v: V3) => round(rotate(rotate(v, -fx, 0), 0, -fy))
  return {
    value,
    front: [fx, fy] as const,
    n: axis([0, 0, 1]),
    u: axis([1, 0, 0]),
    v: axis([0, 1, 0]),
  }
})

export interface DieLook {
  /** Eye distance in icon sizes at full spin (the resting die is seen orthographically). */
  readonly perspective: number
  /** How far a spinning die rises towards the eye, in icon sizes, at full spin. */
  readonly lift: number
  /** Degrees from a face where the inked bevel begins (atan ½ ≈ 26.6° is Phosphor's outline). */
  readonly bevel: number
  /** Face fill while spinning: ambient and lit (Lambert) parts. */
  readonly fill: number
  readonly shade: number
}
export const DIE_LOOK: DieLook = {
  perspective: 3.2,
  lift: 0.45,
  bevel: +((Math.atan(0.5) * 180) / Math.PI).toFixed(2),
  fill: 0.1,
  shade: 0.22,
}

export interface DieSpin {
  readonly spring: SpringValue
  /** Extra whole turns per roll. */
  readonly turns: number
}
export const DIE_SPIN: DieSpin = { spring: { duration: 0.38, bounce: 0.3 }, turns: 1 }

/** The canvas box around a die of `size` px: room for the corners while it tumbles and lifts. */
export const dieBox = (size: number) => Math.ceil(size * 1.6)
/** Supersamples per axis: dense at icon sizes, cheaper when large. */
export const dieSamples = (size: number) => (size <= 40 ? 3 : 2)

export class DieMotion {
  readonly rx = new Spring(0, 24, 0.86, 0.25)
  readonly ry = new Spring(0, 24, 0.86, 0.25)
  value = 5
  turns = DIE_SPIN.turns

  constructor(spin: DieSpin = DIE_SPIN) {
    this.tune(spin)
  }

  tune({ spring, turns }: DieSpin) {
    const { omega, zeta } = springMotion(spring)
    for (const s of [this.rx, this.ry]) {
      s.omega = omega
      s.zeta = zeta
    }
    this.turns = turns
  }

  /** Tumble to a different face (or `to`) from wherever it is now. */
  roll(to?: number, random = Math.random) {
    const others = FACES.filter((f) => f.value !== this.value)
    const face = FACES.find((f) => f.value === to) ?? others[Math.floor(random() * others.length)]!
    this.value = face.value
    const [bx, by] = face.front
    const spin = 360 * this.turns * (random() < 0.5 ? -1 : 1)
    // One axis takes the extra turns; the other just goes where it must, so it reads as a flick.
    const flipX = random() < 0.5
    this.rx.set(nearest(bx, this.rx.target + (flipX ? spin : 0)))
    this.ry.set(nearest(by, this.ry.target + (flipX ? 0 : spin)))
    return face.value
  }

  /** A quarter turn onto a neighbouring face: a nudge rather than a roll. */
  nudge(random = Math.random) {
    const opposite = 7 - this.value
    const near = FACES.filter((f) => f.value !== this.value && f.value !== opposite)
    const face = near[Math.floor(random() * near.length)]!
    this.value = face.value
    this.rx.set(nearest(face.front[0], this.rx.target))
    this.ry.set(nearest(face.front[1], this.ry.target))
    return face.value
  }

  snapTo(value: number) {
    const face = FACES.find((f) => f.value === value) ?? FACES[0]!
    this.value = face.value
    this.rx.snap(face.front[0])
    this.ry.snap(face.front[1])
  }

  /** Advance; returns the orientation (degrees) and spin energy 0…1 for lift and shading. */
  step(dt: number): DieView {
    const rx = this.rx.step(dt)
    const ry = this.ry.step(dt)
    const energy = Math.min(1, (Math.abs(this.rx.v) + Math.abs(this.ry.v)) / 900)
    return { rx, ry, energy }
  }

  get resting() {
    return this.rx.resting && this.ry.resting
  }
}

export interface DieView {
  readonly rx: number
  readonly ry: number
  readonly energy: number
}

/** The value congruent to `base` (mod 360) closest to `around`. */
function nearest(base: number, around: number) {
  return base + 360 * Math.round((around - base) / 360)
}

/** Light direction for the spin shading (towards the viewer, from the upper left; y down). */
export const DIE_LIGHT: V3 = [-0.4818, -0.6424, 0.5961]

const INNER = DIE.half - DIE.round
const BOUND = INNER * Math.sqrt(3) + DIE.round + 1
/** How far in front of the icon plane rays start (icon units): beyond any lifted corner. */
const START = 512

/** A ray that misses the die (coverage 0), told apart so the canvas can skip empty pixels. */
const MISS = -1

/**
 * Traces one ray through the pixel offset (`x`, `y`) px from the die's centre and returns
 * ink + fill coverage (0…1), or `MISS`. Mirrors `die_trace` in die.wgsl.ts step for step.
 */
export function dieTracer(size: number, view: DieView, look: DieLook) {
  const unit = size / 256
  // Perspective grows with the spin: at rest the projection is orthographic, so the die is exactly
  // the glyph; tumbling, the eye sits `perspective` icon sizes away.
  const k = view.energy / (look.perspective * 256)
  const cz = look.lift * view.energy * 256 - DIE.half
  const ax = (view.rx * Math.PI) / 180
  const ay = (view.ry * Math.PI) / 180
  const cx = Math.cos(ax)
  const sx = Math.sin(ax)
  const cy = Math.cos(ay)
  const sy = Math.sin(ay)
  const cosBevel = Math.cos((look.bevel * Math.PI) / 180)
  const toWorld = (v: V3) => rotate(v, view.rx, view.ry)
  return (x: number, y: number): number => {
    // The ray through (x, y) on the icon plane, started well in front of the die.
    const ix = x / unit
    const iy = y / unit
    let rx = ix * k
    let ry = iy * k
    let rz = -1
    const l = Math.sqrt(rx * rx + ry * ry + rz * rz)
    rx /= l
    ry /= l
    rz /= l
    const wx = ix - rx * START
    const wy = iy - ry * START
    const wz = -rz * START - cz
    // Enter the bounding sphere in world space (rotation preserves dot products) before rotating.
    const b = wx * rx + wy * ry + wz * rz
    const c = wx * wx + wy * wy + wz * wz - BOUND * BOUND
    const disc = b * b - c
    if (disc < 0) return MISS
    // Into cube space: undo rotateX, then rotateY.
    let y1 = ry * cx + rz * sx
    let z1 = -ry * sx + rz * cx
    const d0 = rx * cy - z1 * sy
    const d1 = y1
    const d2 = rx * sy + z1 * cy
    y1 = wy * cx + wz * sx
    z1 = -wy * sx + wz * cx
    const o0 = wx * cy - z1 * sy
    const o1 = y1
    const o2 = wx * sy + z1 * cy
    let t = Math.max(0, -b - Math.sqrt(disc))
    const far = -b + Math.sqrt(disc)
    let px = 0
    let py = 0
    let pz = 0
    let hit = false
    for (let i = 0; i < 48 && t < far; i++) {
      px = o0 + t * d0
      py = o1 + t * d1
      pz = o2 + t * d2
      const qx = Math.abs(px) - INNER
      const qy = Math.abs(py) - INNER
      const qz = Math.abs(pz) - INNER
      const mx = qx > 0 ? qx : 0
      const my = qy > 0 ? qy : 0
      const mz = qz > 0 ? qz : 0
      const inside = qx > qy ? (qx > qz ? qx : qz) : qy > qz ? qy : qz
      const dist = Math.sqrt(mx * mx + my * my + mz * mz) + (inside < 0 ? inside : 0) - DIE.round
      if (dist < 0.02) {
        hit = true
        break
      }
      t += dist
    }
    if (!hit) return MISS
    let nx = Math.max(Math.abs(px) - INNER, 0) * Math.sign(px)
    let ny = Math.max(Math.abs(py) - INNER, 0) * Math.sign(py)
    let nz = Math.max(Math.abs(pz) - INNER, 0) * Math.sign(pz)
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    if (Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz)) < cosBevel) return 1
    let best = 0
    let score = -2
    for (let f = 0; f < 6; f++) {
      const n = FACES[f]!.n
      const s = n[0] * nx + n[1] * ny + n[2] * nz
      if (s > score) {
        score = s
        best = f
      }
    }
    const face = FACES[best]!
    const u = face.u[0] * px + face.u[1] * py + face.u[2] * pz
    const v = face.v[0] * px + face.v[1] * py + face.v[2] * pz
    for (const [x0, y0] of PIPS[face.value]!)
      if ((u - x0) * (u - x0) + (v - y0) * (v - y0) < DIE.pip * DIE.pip) return 1
    const w = toWorld([nx, ny, nz])
    const lambert = Math.max(0, w[0] * DIE_LIGHT[0] + w[1] * DIE_LIGHT[1] + w[2] * DIE_LIGHT[2])
    return view.energy * (look.fill + look.shade * lambert)
  }
}

/** The DOM die: a canvas sized for `size` px, traced in JS only when its view changes. */
export function createDieCanvas(doc: Document, size: number) {
  const canvas = doc.createElement("canvas")
  canvas.className = "knobs-die"
  canvas.setAttribute("aria-hidden", "true")
  const box = dieBox(size)
  const inset = (size - box) / 2
  canvas.style.cssText = `width:${box}px;height:${box}px;margin:${inset}px;display:block;pointer-events:none`
  const ctx = canvas.getContext("2d")!
  let img: ImageData | undefined
  let hit: Uint8Array | undefined
  return {
    canvas,
    render(view: DieView, look: DieLook, rgba: readonly [number, number, number, number]) {
      const dpr = doc.defaultView?.devicePixelRatio ?? 1
      const w = Math.round(box * dpr)
      if (canvas.width !== w || !img || !hit) {
        canvas.width = canvas.height = w
        img = ctx.createImageData(w, w)
        hit = new Uint8Array(w * w)
      } else {
        img.data.fill(0)
      }
      const trace = dieTracer(size, view, look)
      const s = dieSamples(size)
      const at = (i: number, j: number, a: number, b: number) =>
        trace((i + a) / dpr - box / 2, (j + b) / dpr - box / 2)
      // One ray per pixel finds the die; only pixels on or beside it are supersampled.
      for (let j = 0; j < w; j++)
        for (let i = 0; i < w; i++) hit[j * w + i] = at(i, j, 0.5, 0.5) === MISS ? 0 : 1
      for (let j = 0; j < w; j++)
        for (let i = 0; i < w; i++) {
          let near = 0
          for (let y = Math.max(0, j - 1); y <= Math.min(w - 1, j + 1) && !near; y++)
            for (let x = Math.max(0, i - 1); x <= Math.min(w - 1, i + 1); x++)
              near |= hit[y * w + x]!
          if (!near) continue
          let cov = 0
          for (let b = 0; b < s; b++)
            for (let a = 0; a < s; a++) cov += Math.max(0, at(i, j, (a + 0.5) / s, (b + 0.5) / s))
          const k = (j * w + i) * 4
          img.data[k] = rgba[0]
          img.data[k + 1] = rgba[1]
          img.data[k + 2] = rgba[2]
          img.data[k + 3] = Math.round((cov / (s * s)) * rgba[3] * 255)
        }
      ctx.putImageData(img, 0, 0)
    },
  }
}

/** Phosphor's dice-N glyph (regular weight) as an even-odd SVG path on the 256 grid. */
export function facePath(value: number): string {
  const rr = (h: number, r: number) =>
    `M${128 - h + r},${128 - h}H${128 + h - r}A${r},${r},0,0,1,${128 + h},${128 - h + r}V${128 + h - r}A${r},${r},0,0,1,${128 + h - r},${128 + h}H${128 - h + r}A${r},${r},0,0,1,${128 - h},${128 + h - r}V${128 - h + r}A${r},${r},0,0,1,${128 - h + r},${128 - h}Z`
  const pip = DIE.pip
  const dots = (PIPS[value] ?? []).map(
    ([x, y]) =>
      `M${128 + x - pip},${128 + y}a${pip},${pip},0,1,0,${2 * pip},0a${pip},${pip},0,1,0,${-2 * pip},0Z`,
  )
  // The hole winds the other way, so it stays open under nonzero filling too (the GPU atlas).
  const hole = (h: number, r: number) =>
    `M${128 - h + r},${128 - h}A${r},${r},0,0,0,${128 - h},${128 - h + r}V${128 + h - r}A${r},${r},0,0,0,${128 - h + r},${128 + h}H${128 + h - r}A${r},${r},0,0,0,${128 + h},${128 + h - r}V${128 - h + r}A${r},${r},0,0,0,${128 + h - r},${128 - h}Z`
  return rr(96, 32) + hole(80, 16) + dots.join("")
}

/** Icon size of the header die (px), matching the other header icons. */
export const HEADER_DIE = 15
/** A group's die, beside its reset icon. */
export const GROUP_DIE = 13

/**
 * A Random button's die, `size` px. At rest it is the face's glyph (an SVG, so hover colours
 * transition like every icon); a roll swaps in the traced canvas until it settles. In GPU mode the
 * canvas is skipped and the renderer draws `view` itself; `onFrame` wakes it.
 */
export function createHeaderDie(doc: Document, onFrame: () => void, size = HEADER_DIE) {
  const node = doc.createElement("span")
  node.className = "knobs-die-icon"
  node.style.width = node.style.height = `${size}px`
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 256 256")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("class", "knobs-icon")
  svg.style.width = svg.style.height = `${size}px`
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("fill", "currentColor")
  path.setAttribute("fill-rule", "evenodd")
  svg.append(path)
  node.append(svg)
  // The canvas only exists once a DOM-rendered roll needs it.
  let canvas: ReturnType<typeof createDieCanvas> | undefined
  const traced = () => {
    if (!canvas) {
      canvas = createDieCanvas(doc, size)
      node.append(canvas.canvas)
    }
    return canvas
  }

  const motion = new DieMotion()
  let view: DieView = { rx: 0, ry: 0, energy: 0 }
  let frame = 0
  let last = 0
  const show = (rolling: boolean) => {
    if (canvas) canvas.canvas.hidden = !rolling
    svg.style.visibility = rolling ? "hidden" : ""
    if (!rolling) path.setAttribute("d", facePath(motion.value))
  }
  show(false)
  let cachedColor: readonly [number, number, number, number] = [255, 255, 255, 1]
  const gpu = () => node.closest('[data-gpu-active="true"]') !== null
  const tick = (now: number) => {
    view = motion.step((now - last) / 1000)
    last = now
    if (!gpu()) traced().render(view, DIE_LOOK, cachedColor)
    onFrame()
    if (motion.resting) {
      frame = 0
      show(false)
      onFrame()
    } else frame = requestAnimationFrame(tick)
  }
  return {
    node,
    size,
    /** Tumble to another face; `nudge` turns a quarter onto a neighbour instead (Mutate). */
    roll(nudge = false) {
      const still = doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      if (still) {
        const others = FACES.filter((f) => f.value !== motion.value)
        motion.snapTo(others[Math.floor(Math.random() * others.length)]!.value)
        show(false)
        onFrame()
        return
      }
      if (!gpu()) {
        const m = getComputedStyle(node).color.match(/[\d.]+/g)
        if (m && m.length >= 3) {
          cachedColor = [Number(m[0]), Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 1]
        }
      }
      if (nudge) motion.nudge()
      else motion.roll()
      if (!gpu()) traced()
      show(true)
      if (!frame) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    },
    get view() {
      return view
    },
    get value() {
      return motion.value
    },
    get rolling() {
      return frame !== 0
    },
    dispose() {
      cancelAnimationFrame(frame)
    },
  }
}
export type HeaderDie = ReturnType<typeof createHeaderDie>
