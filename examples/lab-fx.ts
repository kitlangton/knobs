// The Lab's FX tab feeds the viewport's scene (examples/lab-scene.ts), which samples each field in
// its shaders from a small ramp texture: the sky and fog take their colours from gradients at the
// hour, smoke takes its colour from a colour-over-life gradient by age, every lamp fades by the
// light-falloff curve, and "the unseen" darkens what lies past the lights by a curve of its own.
import { curve, gradient, knob, type CurvePoint, type GradientStop } from "knobs"

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
  hour: knob(21.5, { label: "Hour", min: 0, max: 24, step: 0.25, unit: "h", group: "sky", ...fx }),
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

export type FxValues = {
  readonly smoke: readonly GradientStop[]
  readonly puffs: number
  readonly hour: number
  readonly sky: readonly GradientStop[]
  readonly fog: readonly GradientStop[]
  readonly falloff: readonly CurvePoint[]
  readonly unseen: readonly CurvePoint[]
}
