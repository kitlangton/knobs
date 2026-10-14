// Choice rows that must drop down a menu when segments won't fit: the iOS tune page's "Scene"
// (six long labels) and "Row Font" (eight options), in an inline panel and a page card. Used by
// tests/browser/choices.spec.ts.
import { createRemoteControls, type ControlDescriptor } from "knobs"
import { mountPage, mountPanel } from "knobs/panel"

const scenes = [
  "Everything",
  "Streaming Markdown",
  "Tool Calls & Errors",
  "Long History",
  "Draft",
  "Steer",
]
const fonts = [
  "caption2",
  "caption",
  "footnote",
  "subheadline",
  "callout",
  "body",
  "headline",
  "title3",
]
const descriptors: ControlDescriptor[] = [
  {
    key: "scene",
    label: "Scene",
    kind: "choice",
    default: scenes[0]!,
    choices: scenes.slice(0, 4),
  },
  { key: "rowFont", label: "Row Font", kind: "choice", default: "body", choices: fonts },
  {
    key: "mode",
    label: "Mode",
    kind: "choice",
    default: "Floating sheet",
    choices: ["Docked panel", "Floating sheet", "Hidden"],
  },
  { key: "size", label: "Size", kind: "choice", default: "M", choices: ["S", "M", "L"] },
  {
    key: "forced",
    label: "Forced",
    kind: "choice",
    default: "a",
    choices: ["a", "b", "c", "d", "e", "f"],
    display: "segmented",
  },
  {
    key: "pick",
    label: "Pick",
    kind: "choice",
    default: "On",
    choices: ["On", "Off"],
    display: "menu",
  },
  { key: "font", label: "Font", kind: "number", default: 15, min: 10, max: 24, step: 1 },
]
const sets: [string, unknown][] = []
const inline = createRemoteControls("choices", descriptors, {
  storage: null,
  nullDefaults: false,
  onSet: (k, v) => sets.push([k, v]),
})
const inlinePanel = mountPanel(inline, document.getElementById("inline")!, {
  title: "Inline",
  variants: false,
})

const tune = createRemoteControls("choices-page", descriptors.slice(0, 2), { storage: null })
const page = mountPage(tune, document.getElementById("page")!, { title: "Page", columnWidth: 300 })
const card = page.card({ title: "Transcript Replays", section: "Playground" })
const chosen: string[] = []
const scene = card.choice({
  label: "Scene",
  options: scenes,
  value: "Everything",
  onChange: (v) => chosen.push(v),
})
const speed = card.choice({
  label: "Speed",
  options: ["0.5×", "1×", "2×"],
  value: "1×",
  onChange: (v) => chosen.push(v),
})
const forced = card.choice({
  label: "Forced",
  options: ["a", "b"],
  value: "a",
  display: "menu",
  onChange: (v) => chosen.push(v),
})
Object.assign(window, { __choices: { sets, chosen, scene, speed, forced, inline, inlinePanel } })
