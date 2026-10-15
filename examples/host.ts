// Two panels (the default look and labPreset) under a hostile host stylesheet. Every kind of row
// and the header's buttons, the preset strip and an open editor, so the browser test can measure
// each element with the host's rules on and off. Used by tests/browser/host.spec.ts.
import { action, choice, color, defineControls, easing, knob, point, spring, toggle } from "knobs"
import { mountPanel } from "knobs/panel"
import { labPreset } from "knobs/themes"

const schema = {
  size: knob(42, { min: 0, max: 100, step: 1, unit: "px", group: "Shape" }),
  bounce: knob(0.3, { min: 0, max: 1, step: 0.01, group: "Shape" }),
  mode: choice("soft", ["soft", "hard", "none"], { group: "Shape" }),
  scene: choice("one", ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"], {
    label: "Scene",
    group: "Shape",
  }),
  live: toggle(true, { group: "Shape" }),
  replay: action("Replay", { group: "Shape" }),
  tint: color("#4f8cff", { group: "Look" }),
  origin: point({ x: 0, y: 0 }, { min: -1, max: 1, group: "Look" }),
  curve: easing("ease-out", { group: "Look" }),
  motion: spring({ duration: 0.4, bounce: 0.2 }, { group: "Look" }),
}
const make = (id: string) =>
  defineControls(id, schema, { enabled: true, storage: null, presets: { tight: { size: 20 } } })
const plain = make("host-plain")
const lab = make("host-lab")
const gpu = new URLSearchParams(location.search).has("gpu")
const panels = [
  mountPanel(plain, document.getElementById("plain")!, {
    title: "Plain",
    renderer: gpu ? "gpu" : "dom",
    haptics: false,
  }),
  mountPanel(lab, document.getElementById("lab")!, {
    title: "Lab",
    preset: labPreset,
    density: "compact",
    renderer: gpu ? "gpu" : "dom",
    haptics: false,
  }),
]
Object.assign(window, {
  __host: {
    panels,
    hostile: (on: boolean) => {
      ;(document.getElementById("hostile") as HTMLStyleElement).disabled = !on
    },
  },
})
