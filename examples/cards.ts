import {
  choice,
  defineControls,
  knob,
  memoryStorage,
  spring,
  toggle,
  type PanelActive,
} from "knobs"
import { mountPanel } from "knobs/panel"

// OpenCode Desktop's Motion workspace with a card per experiment: each says where to look in the
// app, folds to one line that sums it up, and outlines its part of the app while it's active.
const controls = defineControls(
  "opencode-cards",
  {
    speed: knob(1, {
      min: 0.25,
      max: 4,
      step: 0.05,
      unit: "×",
      label: "Speed",
      group: "Global",
      description: "Multiplies every animation's speed",
    }),
    slow: toggle(false, { label: "Slow motion (0.25×)", group: "Global" }),
    sidebars: spring(
      { duration: 0.3, bounce: 0 },
      { label: "Spring", group: "Sidebars", tab: "Sidebars" },
    ),
    panel: spring({ duration: 0.35, bounce: 0 }, { label: "Side panel", group: "Sidebars" }),
    avatars: choice("letters", ["letters", "generated"], {
      label: "Style",
      labels: { letters: "Letters", generated: "Generated" },
      group: "Project avatars",
      groupDescription: "Projects in the sidebar",
      tab: "Experiments",
      folded: true,
    }),
    spinner: choice("today", ["today", "css", "soft", "ripple"], {
      label: "Style",
      labels: { today: "Today", css: "CSS orb", soft: "Soft radar", ripple: "Centre ripple" },
      group: "Activity spinner",
      groupDescription: "A session that's working, in the sidebar",
      tab: "Experiments",
      folded: true,
    }),
    hoverStyle: choice("today", ["today", "glide"], {
      label: "Style",
      labels: { today: "Today", glide: "Glide" },
      group: "Sidebar hover",
      groupDescription: "Hover a session in the sidebar",
      tab: "Experiments",
      folded: true,
    }),
    hover: spring(
      { duration: 0.14, bounce: 0 },
      { label: "Glide", group: "Sidebar hover", tab: "Experiments" },
    ),
    menu: choice("today", ["today", "floating", "inline"], {
      label: "Style",
      labels: { today: "Today", floating: "Floating", inline: "Inline" },
      group: "Message menu",
      groupDescription: "Hover a message in the timeline",
      tab: "Experiments",
    }),
    stopSize: knob(10, {
      min: 6,
      max: 14,
      step: 1,
      unit: "px",
      label: "Size",
      group: "Rounded stops",
      groupDescription: "The markers down the timeline's left edge",
      tab: "Experiments",
      folded: true,
    }),
  },
  { enabled: true, persist: "none", pinned: ["Global"] },
)

// Where each experiment shows in the app.
const areas: Record<string, string> = {
  "Project avatars": "sidebar",
  "Activity spinner": "sidebar",
  "Sidebar hover": "sidebar",
  "Message menu": "timeline",
  "Rounded stops": "timeline",
}
const readout = document.getElementById("readout")!
const heard: (PanelActive | null)[] = []
const onActive = (at: PanelActive | null) => {
  heard.push(at)
  readout.textContent = `onActive: ${at ? JSON.stringify(at) : "null"}`
  for (const area of document.querySelectorAll<HTMLElement>("[data-area]"))
    area.toggleAttribute("data-active", Boolean(at && areas[at.group] === area.dataset.area))
}

const query = new URLSearchParams(location.search)
const container = document.getElementById("panel")!
// The WebGPU renderer draws a panel only outside a stacking context (a fixed container is one).
const gpu = query.get("renderer") === "gpu"
if (gpu) container.style.position = "absolute"
const panel = mountPanel(controls, container, {
  title: "Knobs",
  theme: "auto",
  toggleKey: false,
  hints: "panel",
  tabs: ["Sidebars", "Experiments"],
  tab: query.get("tab") ?? "Experiments",
  session: false,
  search: query.has("search"),
  renderer: gpu ? "gpu" : "dom",
  onActive,
})

// A couple of experiments already moved, so their folded cards have something to say.
controls.set({ spinner: "css", hoverStyle: "glide", hover: { duration: 0.2, bounce: 0 } })

// The specs build their own stores and panels beside this one (tests/browser/folds.spec.ts).
Object.assign(window, {
  cards: { controls, panel, heard, mountPanel, defineControls, knob, toggle, memoryStorage },
})
