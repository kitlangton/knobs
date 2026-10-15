// Inspector rows set into a host's column, in knobs' look, the Lab's (labPreset, flat and
// chromeless) and the Lab's with button tokens, each drawn by the DOM and by the GPU: a choice
// whose segments are wide, vectors named x and z, sub-headings whose rows aren't next to each
// other in the schema, toolbar chips that only show a key, an action row and presets. The dashed
// guides are the column's edges. Used by tests/browser/rows.spec.ts and scripts/batche-shots.ts.
import { action, choice, defineControls, knob, toggle, toolbar, vec2, vec3 } from "knobs"
import { mountPanel, type Panel } from "knobs/panel"
import { labPreset, type TokenPreset } from "knobs/themes"

const schema = {
  tools: toolbar(
    [
      { id: "frame", label: "Frame", icon: "frame", shortcut: { key: "F", scope: "none" } },
      { id: "grid", label: "Grid", shortcut: { key: "G", scope: "none" } },
      { id: "play", label: "Play", icon: "play", shortcut: "Space" },
    ],
    { label: "View" },
  ),
  keyLabels: choice("QWERTY", ["QWERTY", "My keyboard layout"], {
    label: "Key labels",
    group: "input",
  }),
  hand: choice("Right", ["Left", "Right"], { label: "Handedness", group: "input" }),
  invert: toggle(false, { label: "Invert look Y", group: "input" }),
  position: vec2(
    { x: 2, y: -4 },
    { label: "Position", min: -50, max: 50, step: 0.1, axes: ["x", "z"], group: "place" },
  ),
  pivotX: knob(0.5, {
    label: "Pivot X",
    min: 0,
    max: 1,
    step: 0.01,
    group: "place",
    subsection: "Pivot",
  }),
  yaw: knob(90, { label: "Yaw", min: 0, max: 360, step: 1, unit: "°", group: "place" }),
  drag: knob(0.2, {
    label: "Drag",
    min: 0,
    max: 1,
    step: 0.01,
    group: "place",
    subsection: "Forces",
  }),
  pivotY: knob(0, {
    label: "Pivot Y",
    min: 0,
    max: 1,
    step: 0.01,
    group: "place",
    subsection: "Pivot",
  }),
  scale: vec3(
    { x: 1, y: 1, z: 1 },
    { label: "Scale", min: 0.1, max: 10, step: 0.1, group: "place" },
  ),
  gust: knob(0.35, {
    label: "Gust",
    min: 0,
    max: 2,
    step: 0.01,
    group: "place",
    subsection: "Forces",
  }),
  retrigger: action("Retrigger", { group: "fx" }),
  boom: knob(1.2, { label: "Boom size", min: 0, max: 4, step: 0.05, unit: "m", group: "fx" }),
}

const labButtons: TokenPreset = {
  ...labPreset,
  name: "lab-buttons",
  dark: {
    ...labPreset.dark,
    "button-bg": "#202227",
    "button-line": "#2c2f35",
    "button-hover-bg": "#2a2d33",
    "button-hover-line": "#3a3e46",
    "button-color": "#d8dbe0",
    "button-h": "20px",
    "button-radius": "2px",
  },
}
const looks = [
  { id: "knobs", title: "knobs", preset: undefined },
  { id: "lab", title: "labPreset", preset: labPreset },
  { id: "buttons", title: "labPreset + button tokens", preset: labButtons },
] as const
const gridEl = document.getElementById("grid")!
const panels: Record<string, Panel> = {}
const stores: Record<string, ReturnType<typeof make>> = {}
const presses: string[] = []
function make(id: string) {
  return defineControls(`rows-${id}`, schema, {
    enabled: true,
    storage: null,
    presets: { Calm: { boom: 0.6, drag: 0.1 }, Storm: { boom: 2.4, drag: 0.6 } },
    onAction: (key) => presses.push(`${id}:${key}`),
  })
}
for (const renderer of ["dom", "gpu"] as const)
  for (const look of looks) {
    const id = `${look.id}-${renderer}`
    const cell = document.createElement("div")
    const heading = document.createElement("h2")
    heading.textContent = `${look.title} · ${renderer.toUpperCase()}`
    const slot = document.createElement("div")
    slot.className = "slot"
    slot.dataset.look = look.id
    slot.id = id
    cell.append(heading, slot)
    gridEl.append(cell)
    stores[id] = make(id)
    panels[id] = mountPanel(stores[id], slot, {
      title: false,
      header: { buttons: ["random", "reset"] },
      ...(look.preset ? { preset: look.preset } : {}),
      variants: false,
      haptics: false,
      session: false,
      renderer,
      search: { chips: ["modified"] },
    })
  }

Object.assign(window, { __rows: { panels, stores, presses } })
