import { Spring } from "./motion.js"

// A die drawn like Phosphor's dice icons: six flat faces (a rounded-square outline with pips) folded
// into a cube and seen in perspective. Face-on at rest it is exactly the dice-five glyph; a roll
// tumbles it to another face. Both renderers read the same orientation from `DieMotion`.

/** Icon units (Phosphor's 256 grid): outer half-size, stroke, corner radius and pip radius. */
export const DIE = { half: 96, stroke: 16, radius: 32, pip: 12 } as const

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

/**
 * Faces in cube space: value, the face's own rotation (CSS `rotateX`/`rotateY`, degrees) before it is
 * pushed out by half the edge, and the cube rotation that brings it to the front. Opposites sum to 7.
 */
export const FACES = [
  { value: 5, face: [0, 0], front: [0, 0] },
  { value: 2, face: [0, 180], front: [0, 180] },
  { value: 3, face: [0, 90], front: [0, -90] },
  { value: 4, face: [0, -90], front: [0, 90] },
  { value: 1, face: [90, 0], front: [-90, 0] },
  { value: 6, face: [-90, 0], front: [90, 0] },
] as const

/** Perspective distance, and how far a spinning die lifts towards the eye, in icon sizes. */
export const DIE_PERSPECTIVE = 3.2
export const DIE_LIFT = 0.45

const SPIN = { omega: 15, zeta: 0.64 }

export class DieMotion {
  readonly rx = new Spring(0, SPIN.omega, SPIN.zeta)
  readonly ry = new Spring(0, SPIN.omega, SPIN.zeta)
  value = 5

  /** Tumble to a different face (or `to`), at least one full turn, from wherever it is now. */
  roll(to?: number, random = Math.random) {
    const others = FACES.filter((f) => f.value !== this.value)
    const face = FACES.find((f) => f.value === to) ?? others[Math.floor(random() * others.length)]!
    this.value = face.value
    const [bx, by] = face.front
    const sign = () => (random() < 0.5 ? -1 : 1)
    // One axis takes the full turn; the other just goes where it must, so it reads as a flick.
    const flipX = random() < 0.5
    this.rx.set(nearest(bx, this.rx.target + (flipX ? 360 * sign() : 0)))
    this.ry.set(nearest(by, this.ry.target + (flipX ? 0 : 360 * sign())))
    return face.value
  }

  snapTo(value: number) {
    const face = FACES.find((f) => f.value === value) ?? FACES[0]
    this.value = face.value
    this.rx.snap(face.front[0])
    this.ry.snap(face.front[1])
  }

  /** Advance; returns the orientation (degrees) and spin energy 0…1 for shading. */
  step(dt: number) {
    const rx = this.rx.step(dt)
    const ry = this.ry.step(dt)
    const energy = Math.min(1, (Math.abs(this.rx.v) + Math.abs(this.ry.v)) / 900)
    return { rx, ry, energy }
  }

  get resting() {
    return this.rx.resting && this.ry.resting
  }
}

/** The value congruent to `base` (mod 360) closest to `around`. */
function nearest(base: number, around: number) {
  return base + 360 * Math.round((around - base) / 360)
}

/** Light direction for the spin shading (towards the viewer, from the upper left; y down). */
const LIGHT = normalize([-0.45, -0.6, 0.66])

/** Lambert term per face for a cube orientation, in `FACES` order. */
export function faceLight(rx: number, ry: number): number[] {
  return FACES.map(({ face }) => {
    const n = rotate(rotate([0, 0, 1], face[0], face[1]), rx, ry)
    return Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
  })
}

type V3 = [number, number, number]
/** CSS `rotateX(ax) rotateY(ay)` applied to a vector (y down, z towards the viewer). */
function rotate([x, y, z]: V3, ax: number, ay: number): V3 {
  const a = (ay * Math.PI) / 180
  const b = (ax * Math.PI) / 180
  const x1 = x * Math.cos(a) + z * Math.sin(a)
  const z1 = -x * Math.sin(a) + z * Math.cos(a)
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)]
}
function normalize([x, y, z]: number[]): V3 {
  const l = Math.hypot(x!, y!, z!)
  return [x! / l, y! / l, z! / l]
}

/** Phosphor's dice-N glyph (regular weight) as an SVG path in icon units, built from the same constants. */
export function facePath(value: number): string {
  const { half, stroke, radius, pip } = DIE
  const rr = (h: number, r: number) =>
    `M${128 - h + r},${128 - h}H${128 + h - r}A${r},${r},0,0,1,${128 + h},${128 - h + r}V${128 + h - r}A${r},${r},0,0,1,${128 + h - r},${128 + h}H${128 - h + r}A${r},${r},0,0,1,${128 - h},${128 + h - r}V${128 - h + r}A${r},${r},0,0,1,${128 - h + r},${128 - h}Z`
  const dots = PIPS[value]!.map(
    ([x, y]) =>
      `M${128 + x - pip},${128 + y}a${pip},${pip},0,1,0,${2 * pip},0a${pip},${pip},0,1,0,${-2 * pip},0Z`,
  )
  return rr(half, radius) + rr(half - stroke, radius - stroke) + dots.join("")
}

const faceMask = (value: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${128 - DIE.half} ${128 - DIE.half} ${2 * DIE.half} ${2 * DIE.half}"><path fill-rule="evenodd" d="${facePath(value)}"/></svg>`,
  )}")`

/** The DOM die: a CSS 3D cube of six faces, each the dice glyph as a vector mask, sized by `--die`. */
export function createDieElement(doc: Document): {
  root: HTMLElement
  render(rx: number, ry: number, energy: number): void
} {
  const root = doc.createElement("span")
  root.className = "knobs-die"
  root.setAttribute("aria-hidden", "true")
  const cube = doc.createElement("span")
  cube.className = "knobs-die-cube"
  root.append(cube)
  const faces = FACES.map(({ value, face }) => {
    const el = doc.createElement("span")
    el.className = "knobs-die-face"
    el.style.transform = `rotateX(${face[0]}deg) rotateY(${face[1]}deg) translateZ(calc(var(--die) * ${DIE.half / 256}))`
    el.style.setProperty("--face", faceMask(value))
    cube.append(el)
    return el
  })
  return {
    root,
    render(rx, ry, energy) {
      cube.style.transform = `translateZ(calc(var(--die) * ${(DIE_LIFT * energy - DIE.half / 256).toFixed(4)})) rotateX(${rx}deg) rotateY(${ry}deg)`
      const light = faceLight(rx, ry)
      faces.forEach((el, i) => {
        el.style.setProperty("--die-fill", String(fillAlpha(energy, light[i]!)))
      })
    },
  }
}

/** Fill opacity of a face mid-spin; zero at rest so the die is pure line art. */
export const fillAlpha = (energy: number, light: number) =>
  +(energy * (0.1 + 0.22 * light)).toFixed(3)

const u = (n: number) => `calc(var(--die) * ${n / 256})`
export const DIE_CSS = `
.knobs-die{--die:15px;position:relative;display:inline-block;width:var(--die);height:var(--die);perspective:calc(var(--die) * ${DIE_PERSPECTIVE});vertical-align:middle}
.knobs-die-cube{position:absolute;inset:0;transform-style:preserve-3d}
.knobs-die-face{position:absolute;left:${u(128 - DIE.half)};top:${u(128 - DIE.half)};width:${u(2 * DIE.half)};height:${u(2 * DIE.half)};border-radius:${u(DIE.radius)};backface-visibility:hidden;background:color-mix(in srgb,currentColor calc(var(--die-fill,0) * 100%),transparent)}
.knobs-die-face::after{content:"";position:absolute;inset:0;background:currentColor;-webkit-mask:var(--face) center/100% 100% no-repeat;mask:var(--face) center/100% 100% no-repeat}
`
