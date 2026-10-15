// The object scene: one ray-marched object that eight controls shape, place, cut, pattern and
// light together. Drawn by WebGPU (controls-object.wgsl); without it, a plain sphere stands in.
import { angle, choice, color, point, range, seed, springMotion, vec2, vec3 } from "knobs"
import type { SceneKit } from "./controls"
import { gpuView, linearRgb } from "./controls-gpu"
import { live } from "./controls-live"
import { ColorVal, oklabRgb, reduced, SHUTTER_S, Stage } from "./controls-motion"
import objectWgsl from "./controls-object.wgsl?raw"

const SHAPES = ["sphere", "cube", "torus"] as const
const FINISH = { Matte: 0.72, Satin: 0.42, Gloss: 0.2 } as const
const TURN = springMotion({ duration: 0.9, bounce: 0 })
const rad = (deg: number) => (deg * Math.PI) / 180

export function objectScene({ section, define, mount, h }: SceneKit) {
  const s = section({
    id: "object",
    title: "Object",
    sub: "One shape to morph, move, pattern, cut and light.",
    shows: ["choice()", "color()", "vec2()", "vec3()", "angle()", "seed()", "range()", "point()"],
    stage: true,
    scene: true,
  })
  const { store, on } = define("object", "Object", {
    shape: choice("sphere", SHAPES, { label: "Shape", group: "form", groupLabel: "Form" }),
    colour: color("#ff7a45", { label: "Colour", group: "form" }),
    finish: choice("Satin", ["Matte", "Satin", "Gloss"], {
      label: "Finish",
      display: "menu",
      group: "form",
    }),
    position: vec2(
      { x: 0, y: 0 },
      {
        min: -1,
        max: 1,
        step: 0.01,
        label: "Position",
        group: "transform",
        groupLabel: "Transform",
      },
    ),
    scale: vec3(
      { x: 1, y: 1, z: 1 },
      {
        min: 0.4,
        max: 1.6,
        step: 0.01,
        link: true,
        linked: true,
        label: "Scale",
        group: "transform",
      },
    ),
    spin: angle(35, { label: "Spin", group: "transform" }),
    pattern: seed(1234, { label: "Pattern", group: "surface", groupLabel: "Surface" }),
    slice: range([0, 100], {
      min: 0,
      max: 100,
      step: 1,
      unit: "%",
      label: "Slice",
      group: "surface",
    }),
    light: point(
      { x: 0.3, y: 0.32 },
      { min: 0, max: 1, step: 0.01, label: "Light", group: "light", groupLabel: "Light" },
    ),
  })
  mount(store, s.slot, { title: "Object" })
  s.stage.style.display = "block"

  const view = gpuView(s.stage, {
    wgsl: objectWgsl,
    label: "object",
    tone: "neutral",
    bloom: 0.04,
    maxDpr: 1.5,
  })
  let fallback: HTMLElement | null = null
  if (!view) {
    fallback = h("div")
    fallback.style.cssText =
      "position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px;border-radius:50%;box-shadow:inset -14px -18px 36px rgba(0,0,0,.35),inset 10px 12px 22px rgba(255,255,255,.25)"
    s.stage.prepend(fallback)
  }
  const data = view?.data
  const stage = new Stage(s.stage, () => {
    const lab = colour.lab
    if (!data || !view) {
      if (fallback) {
        fallback.style.backgroundColor = colour.css()
        fallback.style.transform = `translate(${(px.x * 120).toFixed(1)}px,${(py.x * 60).toFixed(1)}px) scale(${sx.x.toFixed(3)},${sy.x.toFixed(3)})`
      }
      return
    }
    const v = (i: number, a: number, b: number, c: number, d: number) =>
      data.set([a, b, c, d], 4 + i * 4)
    const X = 1.25
    const Y = -0.5
    const vx = px.v * X
    const vy = py.v * Y
    const vs = rad(spin.v)
    const moving = !reduced() && (Math.hypot(vx, vy) > 0.03 || Math.abs(vs) > 0.08)
    v(0, px.x * X, py.x * Y, 0, rad(spin.x))
    v(1, vx, vy, 0, vs)
    v(2, sx.x, sy.x, sz.x, moving ? SHUTTER_S : 0)
    v(3, Math.max(0, w[0]!.x), Math.max(0, w[1]!.x), Math.max(0, w[2]!.x), tone.x)
    const alb = linearRgb(oklabRgb(lab))
    v(4, alb[0], alb[1], alb[2], moving ? 5 : 4)
    const az = (lx.x - 0.5) * 2.6
    const el = 1.25 - ly.x * 1.1
    v(5, Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el), turn.x)
    v(6, -0.95 + (1.9 * lo.x) / 100, -0.95 + (1.9 * hi.x) / 100, seedFrom % 9973, seedTo % 9973)
    v(7, rough.x, 1, 0, 0)
    view.render()
  })
  const px = stage.val(0, 0.0005)
  const py = stage.val(0, 0.0005)
  const sx = stage.val(1, 0.0005)
  const sy = stage.val(1, 0.0005)
  const sz = stage.val(1, 0.0005)
  const spin = stage.val(35, 0.01)
  const w = SHAPES.map((k) => stage.val(k === "sphere" ? 1 : 0, 0.0005))
  const colour = new ColorVal(stage, "#ff7a45")
  const rough = stage.val(0.42, 0.001)
  const lx = stage.val(0.3, 0.0005)
  const ly = stage.val(0.32, 0.0005)
  const lo = stage.val(0, 0.02)
  const hi = stage.val(100, 0.02)
  const turn = stage.val(1, 0.0005)
  let seedFrom = 1234
  let seedTo = 1234
  const isLight = () => document.documentElement.dataset.theme === "light"
  const tone = stage.val(isLight() ? 1 : 0, 0.001)
  new MutationObserver(() => tone.to(isLight() ? 1 : 0, "calm")).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  new ResizeObserver(() => stage.paint()).observe(s.stage)

  on((v, how) => {
    // A choice is a discrete step even from the hand: the shape travels.
    const step = how === "init" ? "init" : "other"
    SHAPES.forEach((k, i) => {
      w[i]!.go(k === v.shape ? 1 : 0, step, "morph")
    })
    colour.go(v.colour, how)
    rough.go(FINISH[v.finish as keyof typeof FINISH] ?? 0.42, step, "calm")
    px.go(v.position.x, how)
    py.go(v.position.y, how)
    sx.go(v.scale.x, how)
    sy.go(v.scale.y, how)
    sz.go(v.scale.z, how)
    // The short way round from wherever it's heading, keeping its velocity.
    const delta = ((((v.spin - spin.target) % 360) + 540) % 360) - 180
    spin.go(spin.target + delta, how)
    lo.go(v.slice[0], how)
    hi.go(v.slice[1], how)
    lx.go(v.light.x, how)
    ly.go(v.light.y, how)
    if (how === "init") {
      seedFrom = seedTo = v.pattern
    } else if (v.pattern !== seedTo) {
      live.log(`Pattern ${seedTo} → ${v.pattern}`)
      seedFrom = seedTo
      seedTo = v.pattern
      turn.snap(0).to(1, TURN)
    }
  })
}
