import { createRemoteControls, type ControlDescriptor, type GroupAction, type Value } from "knobs"
import { mountPanel } from "knobs/panel"

// OpenCode Desktop's Stack: a settings page per feature, built by the host (its navigation, title
// and description), each with one embedded group of knobs and the feature's own presets. One
// remote store holds every feature, as `motionTuning` does; its values live in the host.
const s = (duration: number, bounce = 0) => ({ duration, bounce })
const FEATURES = [
  {
    key: "Sidebars · Peek",
    area: "Sidebars",
    name: "Peek",
    description: "Hovering the edge of a closed sidebar slides it in over the timeline.",
    presets: {
      Snappy: { "peek.spring": s(0.2), "peek.delay": 0.05 },
      Smooth: { "peek.spring": s(0.4, 0.1), "peek.delay": 0.15 },
      Calm: { "peek.spring": s(0.55), "peek.delay": 0.25 },
    },
  },
  {
    key: "Composer · Dock",
    area: "Composer",
    name: "Dock",
    description: "The todo dock lifts out of the composer while agents work.",
    presets: {
      Snappy: { "dock.spring": s(0.18), "dock.lift": 6 },
      Smooth: { "dock.spring": s(0.36, 0.1), "dock.lift": 10 },
      Calm: { "dock.spring": s(0.5), "dock.lift": 12 },
    },
  },
] as const

const descriptors: ControlDescriptor[] = [
  {
    key: "peek.spring",
    label: "Spring",
    kind: "spring",
    default: s(0.3),
    group: "Sidebars · Peek",
  },
  {
    key: "peek.delay",
    label: "Delay",
    kind: "number",
    default: 0.1,
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: "s",
    group: "Sidebars · Peek",
  },
  {
    key: "peek.edge",
    label: "Edge",
    kind: "number",
    default: 12,
    min: 4,
    max: 32,
    step: 1,
    unit: "px",
    group: "Sidebars · Peek",
  },
  {
    key: "dock.spring",
    label: "Spring",
    kind: "spring",
    default: s(0.25, 0.1),
    group: "Composer · Dock",
  },
  {
    key: "dock.lift",
    label: "Lift",
    kind: "number",
    default: 8,
    min: 0,
    max: 20,
    step: 1,
    unit: "px",
    group: "Composer · Dock",
  },
  {
    key: "dock.blur",
    label: "Blur behind",
    kind: "toggle",
    default: true,
    group: "Composer · Dock",
  },
]

// The host's own state: what `onSet` writes (null puts a key back to its default).
const defaults: Record<string, Value> = Object.fromEntries(
  descriptors.flatMap((d) => (d.default === undefined ? [] : [[d.key, d.default]])),
)
const values: Record<string, Value> = { ...defaults }

const motion = createRemoteControls("motion", descriptors, {
  values,
  scopedPresets: Object.fromEntries(FEATURES.map((f) => [f.key, f.presets])),
  defaultLabel: Object.fromEntries(FEATURES.map((f) => [f.key, "Shipped"])),
  onSet: (key, value) => {
    values[key] = value ?? defaults[key]!
  },
})

const stage = document.getElementById("stage")!
for (const feature of FEATURES) {
  const page = document.createElement("section")
  page.className = "page"
  const eyebrow = document.createElement("div")
  eyebrow.className = "eyebrow"
  eyebrow.textContent = feature.area
  const title = document.createElement("h2")
  title.textContent = feature.name
  const description = document.createElement("p")
  description.textContent = feature.description
  const preview = document.createElement("div")
  preview.className = "preview"
  const block = document.createElement("i")
  preview.append(block)
  const host = document.createElement("div")
  page.append(eyebrow, title, description, preview, host)
  stage.append(page)

  const prefix = feature.key === "Sidebars · Peek" ? "peek" : "dock"
  const replay = () => {
    const spring = values[`${prefix}.spring`] as { duration: number; bounce: number }
    // An overshoot as deep as the bounce; good enough for a preview.
    const over = 1 + spring.bounce * 0.6
    block.animate([{ transform: "translateX(0)" }, { transform: "translateX(260px)" }], {
      duration: spring.duration * 1000,
      easing: `cubic-bezier(.2,${over},.3,1)`,
      fill: "forwards",
    })
  }
  const actions: GroupAction[] = [
    { label: "Replay", icon: "retrigger", run: replay },
    {
      label: "Focus",
      icon: "target",
      title: "Outline it in the app",
      run: () => {
        preview.toggleAttribute("data-focus")
      },
    },
  ]
  mountPanel(motion, host, {
    embed: true,
    groups: [feature.key],
    surface: "flat",
    appearance: "dark",
    groupActions: () => actions,
  })
}
