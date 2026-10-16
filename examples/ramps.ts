// Gradients and curves in two inline panels: the Lab's square, flat, compact look, and the default
// theme built from remote descriptors. `?gpu` draws both with the WebGPU overlay. Used by
// tests/browser/ramps.spec.ts and scripts/ramps-shots.ts.
import {
  createRemoteControls,
  curve,
  defineControls,
  gradient,
  toggle,
  type ControlDescriptor,
  type State,
} from "knobs"
import { mountPanel } from "knobs/panel"
import { labPreset } from "knobs/themes"
import { SKIES } from "./lab-fx"

const fire = [
  { at: 0, color: "#fff2c4" },
  { at: 0.12, color: "#ff8a2a" },
  { at: 0.3, color: "#7a2e14" },
  { at: 0.6, color: "#4a4744" },
  { at: 1, color: "#2a2a2c" },
]
const lab = defineControls(
  "ramps-lab",
  {
    smoke: gradient(fire, {
      label: "Smoke over life",
      group: "fx",
      presets: {
        Fire: fire,
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
    }),
    falloff: curve("inverse²", { label: "Light falloff", group: "fx" }),
    lock: toggle(false, { label: "Lock ramps", group: "gates" }),
    fog: gradient(
      [
        { at: 0, color: "#1a1f2e" },
        { at: 0.5, color: "#c9d3dc" },
        { at: 1, color: "#1a1f2e" },
      ],
      { label: "Fog", group: "gates", space: "srgb", readOnly: (v) => v.lock === true },
    ),
    unseen: curve(
      [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.1 },
        { x: 1, y: 0.9 },
      ],
      { label: "Unseen", group: "gates", disabled: (v) => v.lock === true },
    ),
  },
  { storage: null, groupLabels: { fx: "FX", gates: "Gates" } },
)
const descriptors: ControlDescriptor[] = [
  {
    key: "sky",
    kind: "gradient",
    label: "Sky by hour",
    group: "sky",
    default: SKIES.Clear,
    presets: SKIES,
  },
  {
    key: "response",
    kind: "curve",
    label: "Response",
    group: "sky",
    default: [
      { x: 0, y: 0 },
      { x: 0.4, y: 1.2 },
      { x: 1, y: 2 },
    ],
    range: [0, 2],
    interp: "linear",
  },
  {
    key: "bands",
    kind: "curve",
    label: "Bands",
    group: "sky",
    default: [
      { x: 0, y: 0.2 },
      { x: 0.35, y: 0.6 },
      { x: 0.7, y: 1 },
      { x: 1, y: 1 },
    ],
    interp: "step",
    shapes: false,
  },
]
const sent: { key: string; value: unknown }[] = []
const remote = createRemoteControls("ramps-remote", descriptors, {
  onSet: (key, value) => sent.push({ key, value }),
})
const gpu = new URLSearchParams(location.search).has("gpu")
const common = {
  title: false as const,
  header: { buttons: ["random", "reset", "undo", "redo"] as const },
  variants: false,
  haptics: false,
  session: false,
  renderer: gpu ? ("gpu" as const) : ("dom" as const),
}
mountPanel(lab, document.getElementById("lab")!, {
  ...common,
  preset: labPreset,
  theme: "dark",
  density: "compact",
})
mountPanel(remote, document.getElementById("default")!, common)

Object.assign(window, {
  __ramps: {
    lab,
    remote,
    sent,
    descriptors,
    /** A multi-selection whose items differ in these keys. */
    mixed(keys: string[]) {
      remote.update(descriptors, remote.get() as State, { mixed: keys })
    },
  },
})
