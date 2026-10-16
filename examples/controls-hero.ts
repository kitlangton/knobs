// The hero: one dial on a field of light, with the knobs that drive it floating round its edges.
// WebGPU draws it (controls-hero.wgsl); without it, a CSS dial on CSS gradients turns the same way.
import { choice, color, knob, point, spring, springMotion, toggle } from "knobs"
import type { SceneKit } from "./controls"
import { gpuView, linearRgb, toLinear } from "./controls-gpu"
import heroWgsl from "./controls-hero.wgsl?raw"
import {
  ColorVal,
  clamp01,
  oklabCss,
  oklabRgb,
  px,
  rad,
  reduced,
  SHUTTER_S,
  Stage,
} from "./controls-motion"

const MATERIALS = ["Glass", "Metal", "Obsidian"] as const
/** The dial turns through 270°, from −135° (0%) to 135° (100%). */
const ARC = rad(135)
const TICKS = 41
/** The field's drift eases in and out over a second and a half instead of stopping dead. */
const DRIFT = springMotion({ duration: 1.5, bounce: 0 })
const PAGE = { dark: [16, 16, 18], light: [233, 233, 238] }

/** Three colours from one: the colour itself, and two neighbours either side of its hue. */
function palette([L, a, b]: readonly number[]) {
  const c = Math.hypot(a!, b!)
  const h = Math.atan2(b!, a!)
  const at = (l: number, k: number, dh: number) =>
    [l, k * Math.cos(h + dh), k * Math.sin(h + dh)] as const
  return [at(L!, c, 0), at(Math.min(0.92, L! + 0.05), c * 0.9, 0.85), at(L! - 0.03, c * 0.85, -0.8)]
}

export function heroScene({ define, mount, h }: SceneKit, root: HTMLElement) {
  const stageEl = root.querySelector<HTMLElement>(".hero-stage")!
  const slot = (name: string) => root.querySelector<HTMLElement>(`[data-hero="${name}"]`)!

  const dialStore = define("hero-dial", "Hero dial", {
    level: knob(62, { min: 0, max: 100, step: 1, unit: "%", label: "Level" }),
    feel: spring({ duration: 0.6, bounce: 0.32 }, { label: "Spring" }),
  })
  const materialStore = define("hero-material", "Hero material", {
    material: choice("Glass", MATERIALS, { label: "Material" }),
  })
  const fieldStore = define("hero-field", "Hero field", {
    colour: color("#5b8cff", { label: "Colour" }),
    drift: toggle(true, { label: "Drift" }),
  })
  const lightStore = define("hero-light", "Hero light", {
    light: point({ x: 0.3, y: 0.26 }, { min: 0, max: 1, step: 0.01, label: "Light" }),
  })
  mount(dialStore.store, slot("dial"), { title: "Dial", header: false })
  mount(materialStore.store, slot("material"), { title: "Material", header: false })
  mount(fieldStore.store, slot("field"), { title: "Field", header: false })
  mount(lightStore.store, slot("light"), { title: "Light", header: false })

  const view = gpuView(stageEl, {
    wgsl: heroWgsl,
    label: "hero",
    tone: "neutral",
    bloom: 0.08,
    maxDpr: 1.5,
  })
  const css = view ? null : cssDial(stageEl, h)
  let clock = 14

  const stage = new Stage(stageEl, () => {
    const w = stage.width || stageEl.clientWidth
    const hh = stage.height || stageEl.clientHeight
    if (w < 2 || hh < 2) return
    const R = Math.min(w, hh) * 0.235
    const cx = w / 2
    const cy = hh * 0.52
    // The ring lights up to where the dial is, overshoot and all, not to where it's going.
    const lit = clamp01((angle.x + ARC) / (2 * ARC))
    const weights = w3.map((v) => Math.max(0, v.x))
    const labs = palette(colour.lab)
    const dx = (lx.x - 0.5) * 2.2
    const dy = (ly.x - 0.5) * 2.2
    const len = Math.hypot(dx, dy, 1.1)
    const l = [dx / len, dy / len, 1.1 / len]
    if (!view) {
      css!.draw({ cx, cy, R, rot: angle.x, lit, weights, labs, light: l })
      return
    }
    // The angle travelled in one shutter, and how far that carries the rim (px), set how many
    // instants are rendered: 4 at rest (anti-aliasing only), up to 12 when it spins fast.
    let dRot = !reduced() && stage.active ? angle.v * SHUTTER_S : 0
    const arc = Math.abs(dRot) * R
    if (arc < 0.3) dRot = 0
    const samples = dRot ? Math.min(12, Math.max(5, Math.ceil(arc * 1.2))) : 4
    const page = PAGE.dark.map((c, i) => toLinear((c + (PAGE.light[i]! - c) * tone.x) / 255))
    const data = view.data
    const v = (i: number, a: number, b: number, c: number, d: number) =>
      data.set([a, b, c, d], 4 + i * 4)
    v(0, cx, cy, R, angle.x)
    v(1, dRot, samples, lit, tone.x)
    v(2, l[0]!, l[1]!, l[2]!, clock)
    v(3, weights[0]!, weights[1]!, weights[2]!, 0.3 + 0.7 * lit)
    labs.forEach((lab, i) => {
      const c = linearRgb(oklabRgb(lab))
      v(4 + i, c[0], c[1], c[2], 0)
    })
    v(7, page[0]!, page[1]!, page[2]!, 0)
    view.render()
  })
  const angle = stage.val(-ARC + 2 * ARC * 0.62, 0.0005)
  const w3 = MATERIALS.map((m) => stage.val(m === "Glass" ? 1 : 0, 0.0005))
  const colour = new ColorVal(stage, "#5b8cff")
  const lx = stage.val(0.3, 0.0005)
  const ly = stage.val(0.26, 0.0005)
  const driftRate = stage.val(0, 0.001)
  const isLight = () => document.documentElement.dataset.theme === "light"
  const tone = stage.val(isLight() ? 1 : 0, 0.001)
  new MutationObserver(() => tone.to(isLight() ? 1 : 0, "calm")).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })

  // Ambient drift: a clock that runs at the drift's rate while the hero is in view (the stage
  // sleeps off screen and with the tab hidden). Under reduced motion it never starts.
  let drifting = false
  const drift = () => {
    if (drifting || reduced() || driftRate.target === 0) return
    drifting = true
    stage.loop((dt) => {
      clock += dt * driftRate.x
      drifting = driftRate.target > 0 || !driftRate.spring.resting
      return drifting
    })
  }

  let feel = ""
  let pluck = 1
  dialStore.on((v, how) => {
    const target = -ARC + 2 * ARC * (v.level / 100)
    const motion = springMotion({
      duration: Math.max(0.05, v.feel.duration),
      bounce: v.feel.bounce,
    })
    const next = `${v.feel.duration} ${v.feel.bounce}`
    if (how === "init") angle.snap(target)
    else {
      // The dial always travels on its own spring, under the hand too: that spring is the point.
      angle.to(target, motion)
      // A new spring plucks the dial, so its feel shows at once.
      if (next !== feel) {
        angle.push(pluck * 3.2)
        pluck = -pluck
      }
    }
    feel = next
  })
  materialStore.on((v, how) => {
    const step = how === "init" ? "init" : "other"
    MATERIALS.forEach((m, i) => {
      w3[i]!.go(m === v.material ? 1 : 0, step, "morph")
    })
  })
  fieldStore.on((v, how) => {
    colour.go(v.colour, how, "calm")
    if (how === "init" || reduced()) driftRate.snap(v.drift && !reduced() ? 1 : 0)
    else driftRate.to(v.drift ? 1 : 0, DRIFT)
    drift()
  })
  lightStore.on((v, how) => {
    lx.go(v.light.x, how)
    ly.go(v.light.y, how)
  })
}

interface CssFrame {
  cx: number
  cy: number
  R: number
  rot: number
  lit: number
  weights: number[]
  labs: readonly (readonly number[])[]
  light: number[]
}

/** The dial in CSS: conic and radial gradients for the materials, a ring of tick elements. */
function cssDial(host: HTMLElement, h: SceneKit["h"]) {
  host.classList.add("hero-css")
  const glow = h("div", "hero-glow")
  const dial = h("div", "hero-dial")
  const layers = MATERIALS.map((m) => {
    const el = h("i", `hero-${m.toLowerCase()}`)
    dial.append(el)
    return el
  })
  const turn = h("div", "hero-turn")
  const bead = h("b", "hero-bead")
  turn.append(bead)
  dial.append(turn)
  const ticks = Array.from({ length: TICKS }, (_, i) => {
    const t = h("span", `hero-tick${i % 5 === 0 ? " major" : ""}`)
    host.append(t)
    return t
  })
  host.append(glow, dial)
  return {
    draw({ cx, cy, R, rot, lit, weights, labs, light }: CssFrame) {
      const [a, b, c] = labs.map((l) => oklabCss(l))
      glow.style.background = `radial-gradient(${px(R * 3)} ${px(R * 2.4)} at ${px(cx - R * 1.5)} ${px(cy - R * 0.5)}, ${oklabCss(labs[0]!, 0.42 * (0.3 + 0.7 * lit))}, transparent 70%), radial-gradient(${px(R * 3.2)} ${px(R * 2.6)} at ${px(cx + R * 1.6)} ${px(cy + R * 0.3)}, ${oklabCss(labs[1]!, 0.32)}, transparent 70%), radial-gradient(${px(R * 2.8)} ${px(R * 2.2)} at ${px(cx)} ${px(cy + R * 1.5)}, ${oklabCss(labs[2]!, 0.3)}, transparent 70%)`
      dial.style.cssText = `left:${px(cx - R)};top:${px(cy - R)};width:${px(R * 2)};height:${px(R * 2)};--light:${Math.atan2(light[0]!, -light[1]!).toFixed(3)}rad;--a:${a};--b:${b};--c:${c}`
      layers.forEach((el, i) => {
        el.style.opacity = weights[i]!.toFixed(3)
      })
      turn.style.transform = `rotate(${rot.toFixed(4)}rad)`
      bead.style.background = a!
      ticks.forEach((t, i) => {
        const ang = -ARC + (2 * ARC * i) / (TICKS - 1)
        t.style.transform = `translate(${px(cx)},${px(cy)}) rotate(${ang.toFixed(4)}rad) translateY(${px(-R * 1.24)})`
        t.style.background = clamp01(lit * TICKS - i) > 0.5 ? a! : ""
      })
    },
  }
}
