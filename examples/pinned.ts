import { action, choice, defineControls, knob, spring, toggle } from "knobs"
import { mountPanel } from "knobs/panel"

// OpenCode Desktop's Motion workspace: a Global group pinned over two tabs, and presets that set
// every spring at once. A third tab, Composer, has no springs, so it shows no preset strip.
const springs = {
  sidebars: { duration: 0.3, bounce: 0 },
  hover: { duration: 0.14, bounce: 0 },
}
const preset = (sidebars: number, hover: number) => ({
  sidebars: { duration: sidebars, bounce: 0 },
  hover: { duration: hover, bounce: 0 },
})

const controls = defineControls(
  "opencode-motion",
  {
    speed: knob(1, { min: 0.25, max: 4, step: 0.05, unit: "×", label: "Speed", group: "Global" }),
    slow: toggle(false, { label: "Slow motion (0.25×)", group: "Global" }),
    sidebars: spring(springs.sidebars, { label: "Spring", group: "Sidebars", tab: "Sidebars" }),
    style: choice("spring", ["spring", "instant"], {
      label: "Motion",
      labels: { spring: "Spring", instant: "Instant" },
      group: "Sidebars",
    }),
    "action.left": action("Toggle the left sidebar", { group: "Sidebars", subsection: "Replay" }),
    "action.panel": action("Toggle the side panel", { group: "Sidebars", subsection: "Replay" }),
    hoverStyle: choice("today", ["today", "glide"], {
      label: "Sidebar hover",
      labels: { today: "Today", glide: "Glide" },
      group: "Experiments",
      tab: "Experiments",
    }),
    hover: spring(springs.hover, { label: "Sidebar hover glide", group: "Experiments" }),
    sendIcon: choice("today", ["today", "ios", "heavy"], {
      label: "Send icon",
      labels: { today: "Today", ios: "iOS", heavy: "Heavier" },
      group: "Composer",
      tab: "Composer",
    }),
    stopSize: knob(10, {
      min: 6,
      max: 14,
      step: 1,
      unit: "px",
      label: "Stop size",
      group: "Composer",
    }),
  },
  {
    enabled: true,
    persist: "none",
    pinned: ["Global"],
    defaultLabel: "Shipped",
    presetLabels: { snappy: "Snappy", smooth: "Smooth", calm: "Calm" },
    presets: { snappy: preset(0.2, 0.1), smooth: preset(0.3, 0.14), calm: preset(0.45, 0.22) },
  },
)

const panel = mountPanel(controls, document.getElementById("panel")!, {
  title: "Knobs",
  appearance: "light",
  toggleKey: false,
  hints: "panel",
  tabs: ["Sidebars", "Experiments", "Composer"],
  search: new URLSearchParams(location.search).has("search"),
})

Object.assign(window, { pinned: { controls, panel } })
