// The lamp scene: one real light that six kinds of control drive together. Drawn by WebGPU
// (controls-lamp.wgsl through controls-gpu.ts); without it, a quiet DOM lamp stands in.
//
// Switching on is a filament warming: heat rises on a spring while an ignition flicker dies away,
// and the colour climbs from ember red to the set temperature. Switching off cools it to an ember
// that fades. The cord is a lightly damped pendulum, nudged by each switch and each turn of Aim.
import { angle, color, curve, knob, range, sampleCurve, springMotion, toggle } from "knobs"
import type { SceneKit } from "./controls"
import { gpuView, kelvinRgb, linearRgb } from "./controls-gpu"
import { live } from "./controls-live"
import lampWgsl from "./controls-lamp.wgsl?raw"
import { ColorVal, oklabRgb, reduced, SHUTTER_S, Stage } from "./controls-motion"

const IGNITE = springMotion({ duration: 0.5, bounce: 0 })
const COOL = springMotion({ duration: 1.3, bounce: 0 })
const FLICKER = springMotion({ duration: 0.6, bounce: 0 })
const CORD = 2.6
/** A pendulum on that cord: ω = √(g/L) (a 3.2 s period), lightly damped by the air. */
const SWAY = { omega: Math.sqrt(9.81 / CORD), zeta: 0.15 }
const ANCHOR = [0, 4.2, -0.2] as const
const N = 32

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const rad = (deg: number) => (deg * Math.PI) / 180
/** An angle as signed degrees, −180…180. */
const signed = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

export function lampScene({ section, define, mount, h }: SceneKit) {
  const s = section({
    id: "lamp",
    title: "Lamp",
    sub: "A pendant light, ray-traced on the GPU.",
    shows: ["toggle()", "knob()", "color()", "angle()", "range()", "curve()"],
    stage: true,
    scene: true,
  })
  const { store, on } = define("lamp", "Lamp", {
    on: toggle(true, { label: "Light", group: "bulb", groupLabel: "Bulb" }),
    brightness: knob(800, {
      min: 0,
      max: 1600,
      step: 10,
      unit: "lm",
      label: "Brightness",
      group: "bulb",
    }),
    temperature: knob(2700, {
      min: 1800,
      max: 6500,
      step: 50,
      unit: "K",
      label: "Temperature",
      group: "bulb",
    }),
    shade: color("#3f7a62", { label: "Enamel", group: "shade", groupLabel: "Shade" }),
    aim: angle(0, { label: "Aim", group: "shade" }),
    beam: range([26, 64], { min: 4, max: 86, step: 1, unit: "°", label: "Beam", group: "shade" }),
    falloff: curve("inverse²", { label: "Falloff", group: "room", groupLabel: "Room" }),
    haze: knob(0.4, { min: 0, max: 1, step: 0.01, label: "Haze", group: "room" }),
  })
  mount(store, s.slot, { title: "Lamp" })
  s.stage.style.display = "block"

  const view = gpuView(s.stage, {
    wgsl: lampWgsl,
    label: "lamp",
    tone: "agx",
    bloom: 0.07,
    maxDpr: 1.5,
    vignette: 0.3,
    saturation: 1.06,
  })
  const fallback = view ? null : domLamp(s.stage, h)
  const data = view?.data
  const stage = new Stage(s.stage, () => {
    const hot = clamp01(heat.x)
    const now = performance.now() / 1000
    // Two incommensurate sines: an irregular strike that the flicker spring damps away.
    const n = 0.5 + 0.5 * Math.sin(now * 67) * Math.sin(now * 23.3 + 1.7)
    const flicker = 1 - 0.75 * clamp01(flick.x) * n
    const k = Math.max(0, brightness.x) / 800
    const kelvin = 900 + (temperature.x - 900) * Math.sqrt(hot)
    const lc = kelvinRgb(kelvin)
    const intensity = 13 * k * hot ** 2.4 * flicker
    live.lumens = 800 * k * hot ** 2.4 * flicker
    if (!data || !view) {
      fallback?.(lc, intensity / 13, oklabRgb(shade.lab))
      return
    }
    const phi = sway.x
    live.sway = phi
    live.swayV = sway.v
    // The swing's travel in one shutter, and how far that moves the dome on screen (px), which
    // sets how many instants are rendered: 4 at rest (anti-aliasing only), up to 12 when fast.
    const blur = !reduced() && stage.active
    let dphi = blur ? sway.v * SHUTTER_S : 0
    let dtau = blur ? rad(tilt.v) * SHUTTER_S : 0
    const arc = ((Math.abs(dphi) * CORD + Math.abs(dtau) * 0.3) * 1.5 * s.stage.clientHeight) / 3.6
    if (arc < 0.25) dphi = dtau = 0
    const samples = dphi || dtau ? Math.min(12, Math.max(4, Math.ceil(arc * 1.5))) : 4
    const v = (i: number, x: number, y: number, z: number, w: number) =>
      data.set([x, y, z, w], 4 + i * 4)
    v(0, ANCHOR[0], ANCHOR[1], ANCHOR[2], CORD)
    v(1, phi, rad(tilt.x), dphi, dtau)
    v(2, lc[0], lc[1], lc[2], Math.cos(rad(Math.min(lo.x, hi.x - 0.5))))
    const fil = 30 * hot ** 1.3 * flicker * Math.min(1, 0.25 + k)
    v(3, lc[0] * fil, lc[1] * fil, lc[2] * fil, Math.cos(rad(hi.x)))
    const sc = linearRgb(oklabRgb(shade.lab))
    v(4, sc[0], sc[1], sc[2], 7 * k * hot ** 2.2 * flicker)
    v(5, intensity, haze.x * 0.03, tone.x, samples)
    v(6, intensity * 0.0032, 0, 0, 0)
    for (let i = 0; i < N; i++) data[4 + 7 * 4 + i] = ys[i]!.x
    view.exposure = 1.08 - 0.08 * tone.x
    view.render()
  })
  const heat = stage.val(1, 0.0005)
  const flick = stage.val(0, 0.002)
  // Rest is within 0.001 rad: under half a pixel at the dome.
  const sway = stage.val(0, 0.001)
  const brightness = stage.val(800, 0.5)
  const temperature = stage.val(2700, 1)
  const tilt = stage.val(0, 0.02)
  const lo = stage.val(26, 0.02)
  const hi = stage.val(64, 0.02)
  const haze = stage.val(0.4, 0.001)
  const shade = new ColorVal(stage, "#3f7a62")
  const ys = Array.from({ length: N }, () => stage.val(0, 0.0005))
  const isLight = () => document.documentElement.dataset.theme === "light"
  const tone = stage.val(isLight() ? 1 : 0, 0.001)
  new MutationObserver(() => tone.to(isLight() ? 1 : 0, "calm")).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  new ResizeObserver(() => stage.paint()).observe(s.stage)

  let lit: boolean | null = null
  on((v, how) => {
    if (how === "init") heat.snap(v.on ? 1 : 0)
    else if (v.on !== lit) {
      live.log(v.on ? "Lamp struck" : "Lamp off, cooling")
      if (v.on) {
        heat.to(1, IGNITE)
        flick.snap(1).to(0, FLICKER)
      } else heat.to(0, COOL)
      // The switch's tug sets the cord swinging, a little.
      sway.to(0, SWAY).push(v.on ? 0.1 : -0.07)
    }
    lit = v.on
    brightness.go(v.brightness, how, "calm")
    temperature.go(v.temperature, how, "calm")
    shade.go(v.shade, how, "default")
    const aim = Math.max(-55, Math.min(55, signed(v.aim)))
    if (how !== "init" && Math.abs(aim - tilt.target) > 0.01)
      sway.to(0, SWAY).push(-rad(aim - tilt.target) * 0.5)
    tilt.go(aim, how, "default")
    lo.go(v.beam[0], how)
    hi.go(v.beam[1], how)
    haze.go(v.haze, how, "calm")
    ys.forEach((y, i) => {
      y.go(
        sampleCurve(v.falloff, i / (N - 1), { interp: store.schema.falloff.interp }),
        how,
        "calm",
      )
    })
  })
  return store
}

/** Without WebGPU: a disc of glow, a bulb and a pool on the floor, in the light's colour. */
function domLamp(host: HTMLElement, h: SceneKit["h"]) {
  const box = h("div")
  box.style.cssText = "position:absolute;inset:0"
  box.innerHTML = `
    <div data-l="pool" style="position:absolute;left:18%;right:18%;bottom:10%;height:22%;border-radius:50%"></div>
    <div style="position:absolute;left:calc(50% - 1px);top:0;width:2px;height:34%;background:var(--faint)"></div>
    <div data-l="glow" style="position:absolute;left:calc(50% - 110px);top:calc(34% - 70px);width:220px;height:220px;border-radius:50%"></div>
    <div data-l="dome" style="position:absolute;left:calc(50% - 38px);top:34%;width:76px;height:38px;border-radius:38px 38px 6px 6px"></div>
    <div data-l="bulb" style="position:absolute;left:calc(50% - 13px);top:calc(34% + 30px);width:26px;height:26px;border-radius:50%"></div>`
  host.prepend(box)
  const el = (n: string) => box.querySelector<HTMLElement>(`[data-l="${n}"]`)!
  const [pool, glow, dome, bulb] = ["pool", "glow", "dome", "bulb"].map(el) as [
    HTMLElement,
    HTMLElement,
    HTMLElement,
    HTMLElement,
  ]
  return (lc: readonly number[], on: number, shade: readonly number[]) => {
    const m = Math.max(...lc)
    const rgb = lc.map((c) => Math.round(255 * (c / m) ** (1 / 2.2))).join(",")
    const o = clamp01(on)
    pool.style.background = `radial-gradient(closest-side,rgba(${rgb},${(0.5 * o).toFixed(3)}),transparent)`
    glow.style.background = `radial-gradient(closest-side,rgba(${rgb},${(0.45 * o).toFixed(3)}),transparent)`
    bulb.style.background = `rgba(${rgb},${(0.25 + 0.75 * o).toFixed(3)})`
    bulb.style.boxShadow = `0 0 ${Math.round(24 * o)}px rgba(${rgb},${o.toFixed(3)})`
    dome.style.background = `rgb(${shade.join(",")})`
  }
}
