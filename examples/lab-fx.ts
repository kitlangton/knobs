// The Lab's FX tab feeds the fake viewport: the sky and fog take their colours from gradients at
// the hour, smoke puffs take theirs from a colour-over-life gradient by age, the lamp's glow is
// drawn from a light-falloff curve and "the unseen" darkens the frame by a falloff of its own.
// Everything is CSS gradients written on change, so nothing runs while nothing changes.
import {
  curve,
  gradient,
  knob,
  sampleCurve,
  sampleGradient,
  type CurvePoint,
  type GradientStop,
} from "knobs"

const fx = { tab: "fx" } as const
const sky = (stops: [number, string][]) => stops.map(([at, color]) => ({ at, color }))
export const SKIES = {
  Clear: sky([
    [0, "#0b1026"],
    [0.22, "#2b2d5c"],
    [0.27, "#f4a261"],
    [0.36, "#8ec5ff"],
    [0.5, "#6fb3ff"],
    [0.7, "#7fb8f0"],
    [0.77, "#ff7b54"],
    [0.84, "#3a2d5e"],
    [1, "#0b1026"],
  ]),
  Overcast: sky([
    [0, "#14161c"],
    [0.25, "#4a4f5a"],
    [0.5, "#9aa3ad"],
    [0.75, "#5d5a63"],
    [1, "#14161c"],
  ]),
  Storm: sky([
    [0, "#07080c"],
    [0.3, "#2a3140"],
    [0.5, "#4b5566"],
    [0.72, "#2b2f3d"],
    [1, "#07080c"],
  ]),
  Alien: sky([
    [0, "#12051f"],
    [0.3, "#4b1d6b"],
    [0.5, "#2fbf9f"],
    [0.75, "#d9467a"],
    [1, "#12051f"],
  ]),
}

export const fxSchema = {
  smoke: gradient(
    [
      { at: 0, color: "#fff2c4" },
      { at: 0.12, color: "#ff8a2a" },
      { at: 0.3, color: "#7a2e14" },
      { at: 0.6, color: "#4a4744" },
      { at: 1, color: "#2a2a2c" },
    ],
    {
      label: "Smoke over life",
      group: "smoke",
      ...fx,
      presets: {
        Fire: [
          { at: 0, color: "#fff2c4" },
          { at: 0.12, color: "#ff8a2a" },
          { at: 0.3, color: "#7a2e14" },
          { at: 0.6, color: "#4a4744" },
          { at: 1, color: "#2a2a2c" },
        ],
        Steam: [
          { at: 0, color: "#ffffff" },
          { at: 0.5, color: "#c9d1d9" },
          { at: 1, color: "#6b7480" },
        ],
        Toxic: [
          { at: 0, color: "#e9ff7a" },
          { at: 0.25, color: "#5fd35a" },
          { at: 0.7, color: "#2f5b3a" },
          { at: 1, color: "#1b2420" },
        ],
      },
    },
  ),
  puffs: knob(6, { label: "Puffs", min: 1, max: 12, step: 1, group: "smoke" }),
  hour: knob(17.5, { label: "Hour", min: 0, max: 24, step: 0.25, unit: "h", group: "sky", ...fx }),
  sky: gradient(SKIES.Clear, { label: "Sky by hour", group: "sky", presets: SKIES }),
  fog: gradient(
    [
      { at: 0, color: "#1a1f2e" },
      { at: 0.3, color: "#c99a7a" },
      { at: 0.5, color: "#c9d3dc" },
      { at: 0.78, color: "#b27a6e" },
      { at: 1, color: "#1a1f2e" },
    ],
    { label: "Fog by hour", group: "sky", space: "srgb" },
  ),
  falloff: curve("inverse²", { label: "Light falloff", group: "light", ...fx }),
  unseen: curve(
    [
      { x: 0, y: 0 },
      { x: 0.45, y: 0.08 },
      { x: 0.8, y: 0.62 },
      { x: 1, y: 0.9 },
    ],
    { label: "Unseen falloff", group: "light" },
  ),
} as const

type FxValues = {
  readonly smoke: readonly GradientStop[]
  readonly puffs: number
  readonly hour: number
  readonly sky: readonly GradientStop[]
  readonly fog: readonly GradientStop[]
  readonly falloff: readonly CurvePoint[]
  readonly unseen: readonly CurvePoint[]
}

/** Paints the viewport from the FX values, now and on each change. */
export function startFx(
  controls: { get(): unknown; subscribe(cb: () => void): () => void },
  viewport: HTMLElement,
) {
  const layer = document.createElement("div")
  layer.className = "fx"
  layer.setAttribute("aria-hidden", "true")
  layer.innerHTML = `<div class="fx-sky"></div><div class="fx-glow"></div><div class="fx-smoke"></div><div class="fx-unseen"></div>`
  viewport.prepend(layer)
  const [skyEl, glow, smoke, unseen] = [...layer.children] as HTMLElement[]
  const rgba = (rgb: readonly number[], a: number) =>
    `rgb(${rgb.map((v) => Math.round(v * 255)).join(" ")} / ${a.toFixed(3)})`
  const paint = (v: FxValues) => {
    const t = v.hour / 24
    const top = sampleGradient(v.sky, t, { ...fxSchema.sky, as: "rgb" })
    const low = sampleGradient(v.fog, t, { ...fxSchema.fog, as: "rgb" })
    skyEl!.style.background = `linear-gradient(to bottom,${rgba(top, 1)},${rgba(low, 1)} 78%)`
    // The lamp's glow: alpha by the falloff, out to its radius.
    const steps = Array.from({ length: 13 }, (_, i) => i / 12)
    glow!.style.background = `radial-gradient(circle at 62% 30%,${steps
      .map(
        (d) =>
          `${rgba([1, 0.82, 0.55], 0.75 * sampleCurve(v.falloff, d, fxSchema.falloff))} ${(d * 46).toFixed(1)}%`,
      )
      .join(",")})`
    // Smoke: puffs rising from the lamp, coloured and faded by their age.
    smoke!.replaceChildren(
      ...Array.from({ length: v.puffs }, (_, i) => {
        const age = v.puffs === 1 ? 0.5 : i / (v.puffs - 1)
        const puff = document.createElement("i")
        const size = 18 + age * 70
        puff.style.cssText = `left:calc(62% + ${(Math.sin(i * 1.7) * 26 * age).toFixed(1)}px);top:calc(30% - ${(age * 120).toFixed(1)}px);width:${size}px;height:${size}px;background:${sampleGradient(v.smoke, age, { ...fxSchema.smoke, as: "hex" })};opacity:${(0.9 - age * 0.55).toFixed(2)}`
        return puff
      }),
    )
    // The unseen: past the light, the frame sinks into darkness by its curve.
    unseen!.style.background = `radial-gradient(ellipse at 55% 40%,${steps
      .map(
        (d) =>
          `rgb(0 0 0 / ${sampleCurve(v.unseen, d, fxSchema.unseen).toFixed(3)}) ${(d * 78).toFixed(1)}%`,
      )
      .join(",")})`
    viewport.dataset.hour = v.hour.toFixed(2)
  }
  paint(controls.get() as FxValues)
  return controls.subscribe(() => paint(controls.get() as FxValues))
}
