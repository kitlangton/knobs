import { action, choice, defineControls, knob, spring, toggle } from "knobs"
import { mountPanel } from "knobs/panel"

// OpenCode Desktop's Motion workspace: a Global group pinned over two tabs. The presets belong to
// Sidebars and set only its springs; Experiments has none, so it shows no strip.
const preset = (sidebars: number, panel: number) => ({
  sidebars: { duration: sidebars, bounce: 0 },
  panel: { duration: panel, bounce: 0 },
})

const controls = defineControls(
  "opencode-motion",
  {
    speed: knob(1, { min: 0.25, max: 4, step: 0.05, unit: "×", label: "Speed", group: "Global" }),
    slow: toggle(false, { label: "Slow motion (0.25×)", group: "Global" }),
    sidebars: spring(
      { duration: 0.3, bounce: 0 },
      { label: "Spring", group: "Sidebars", tab: "Sidebars" },
    ),
    panel: spring({ duration: 0.35, bounce: 0 }, { label: "Side panel", group: "Sidebars" }),
    style: choice("spring", ["spring", "instant"], {
      label: "Motion",
      labels: { spring: "Spring", instant: "Instant" },
      group: "Sidebars",
    }),
    "action.left": action("Toggle the left sidebar", { group: "Sidebars", subsection: "Replay" }),
    "action.panel": action("Toggle the side panel", { group: "Sidebars", subsection: "Replay" }),
    avatars: choice("letters", ["letters", "generated"], {
      label: "Project avatars",
      labels: { letters: "Letters", generated: "Generated" },
      group: "Experiments",
      tab: "Experiments",
    }),
    spinner: choice("today", ["today", "soft", "orb", "ripple", "snake", "spiral", "grid"], {
      label: "Activity spinner",
      labels: {
        today: "Today",
        soft: "Soft Radar",
        orb: "Orb Radar",
        ripple: "Centre Ripple",
        snake: "Border Snake",
        spiral: "Spiral Fill",
        grid: "Breathing Grid",
      },
      group: "Experiments",
    }),
    hoverStyle: choice("today", ["today", "glide"], {
      label: "Sidebar hover",
      labels: { today: "Today", glide: "Glide" },
      group: "Experiments",
    }),
    hover: spring(
      { duration: 0.14, bounce: 0 },
      { label: "Sidebar hover glide", group: "Experiments" },
    ),
    stopSize: knob(10, {
      min: 6,
      max: 14,
      step: 1,
      unit: "px",
      label: "Rounded stop size",
      group: "Experiments",
    }),
  },
  {
    enabled: true,
    persist: "none",
    pinned: ["Global"],
    defaultLabel: "Shipped",
    presetLabels: { snappy: "Snappy", smooth: "Smooth", calm: "Calm" },
    scopedPresets: {
      Sidebars: { snappy: preset(0.2, 0.25), smooth: preset(0.3, 0.35), calm: preset(0.45, 0.5) },
    },
  },
)

const query = new URLSearchParams(location.search)
const container = document.getElementById("panel")!
// Desktop's container before it padded the panel (?flush): its overflow clips anything outside.
if (query.has("flush")) container.style.padding = "0"

const panel = mountPanel(controls, container, {
  title: "Knobs",
  theme: "auto",
  toggleKey: false,
  hints: "panel",
  tabs: ["Sidebars", "Experiments"],
  search: query.has("search"),
})

Object.assign(window, { pinned: { controls, panel } })
