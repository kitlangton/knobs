// OpenCode Desktop's components lab in miniature (used by tests/browser/components-lab.spec.ts):
// a three-pane split with a tree of stories (two share a title, told apart by their `detail`), the
// story in the middle, and its controls in the right pane: one preset per state, a toolbar that
// steps and plays through them, and the story's args as knobs. A story's motion knobs have presets
// of their own at the top of their card. A story without args says so. The card entrance is
// timed on tracks: a clip per part over a timeline, the panel's rows and the clips the same fields.
import {
  defineControls,
  easing,
  fitTracks,
  knob,
  sampleTracks,
  spring,
  text,
  toolbar,
  track,
  type Controls,
  type Field,
  type HeaderButton,
  type Value,
} from "knobs"
import { split, timeline, tracks, tree } from "knobs/ui"

interface Row {
  id: string
  label: string
  detail?: string
  children?: Row[]
}

interface Story {
  title: string
  states: { name: string; args: Record<string, number | string> }[]
  fields: Record<string, Field>
  /** Presets for the story's Motion group, beside the shipped values. */
  motion?: Record<string, Record<string, Value>>
  /** Presets over all its fields, beside the shipped values. */
  presets?: Record<string, Record<string, Value>>
  constrain?: (
    values: Readonly<Record<string, unknown>>,
    rolled: readonly string[],
  ) => Record<string, unknown>
  buttons?: HeaderButton[]
  render(stage: HTMLElement, args: Record<string, unknown>): void
  /** A story that keeps its stage and follows the store itself; returns its teardown. */
  mount?(
    stage: HTMLElement,
    store: Controls<Record<string, Field>>,
  ): { dispose(): void; highlight?(group: string | null): void }
}

const activity: Story = {
  title: "OpenCode / Session / Activity chips",
  states: [
    { name: "No activity", args: { subagents: 0, shells: 0, caption: "" } },
    { name: "One subagent", args: { subagents: 1, shells: 0, caption: "" } },
    { name: "Two subagents", args: { subagents: 2, shells: 0, caption: "" } },
    { name: "One shell", args: { subagents: 0, shells: 1, caption: "" } },
    { name: "Subagents and shells", args: { subagents: 2, shells: 2, caption: "" } },
    { name: "Many subagents", args: { subagents: 6, shells: 0, caption: "Delegating the audit" } },
    { name: "Live", args: { subagents: 3, shells: 1, caption: "Running in the background" } },
  ],
  fields: {
    subagents: knob(0, { min: 0, max: 8, step: 1 }),
    shells: knob(0, { min: 0, max: 4, step: 1 }),
    caption: text("", { placeholder: "No caption" }),
    enter: spring({ duration: 0.3, bounce: 0 }, { group: "Motion" }),
    stagger: knob(0.04, { min: 0, max: 0.2, step: 0.01, unit: "s", group: "Motion" }),
  },
  motion: {
    Snappy: { enter: { duration: 0.2, bounce: 0 }, stagger: 0.02 },
    Smooth: { enter: { duration: 0.45, bounce: 0 }, stagger: 0.06 },
    Calm: { enter: { duration: 0.6, bounce: 0 }, stagger: 0.1 },
  },
  render(stage, args) {
    const chips = document.createElement("div")
    chips.className = "chips"
    for (let i = 0; i < Number(args.subagents); i++) chips.append(chip(`Subagent ${i + 1}`))
    for (let i = 0; i < Number(args.shells); i++) chips.append(chip(`Shell ${i + 1}`))
    if (!chips.childElementCount) chips.append(chip("Idle"))
    const caption = document.createElement("div")
    caption.className = "caption"
    caption.textContent = String(args.caption ?? "")
    stage.replaceChildren(chips, caption)
  },
}

const composer: Story = {
  title: "OpenCode / Session / Composer",
  states: [
    { name: "Empty", args: { prompt: "" } },
    { name: "One line", args: { prompt: "Fix the flaky timeline test" } },
    {
      name: "Several lines",
      args: {
        prompt:
          "Review the split pane:\n- one surface\n- no empty header band\n- presets as a list",
      },
    },
  ],
  fields: { prompt: text("", { multiline: true, placeholder: "Ask anything" }) },
  render(stage, args) {
    const box = document.createElement("div")
    box.className = "composer"
    box.textContent = String(args.prompt ?? "") || "Ask anything"
    box.toggleAttribute("data-empty", !args.prompt)
    stage.replaceChildren(box)
  },
}

const spinner: Story = {
  title: "UI / Status / Spinner",
  states: [{ name: "Default", args: {} }],
  fields: {},
  render(stage) {
    const spin = document.createElement("div")
    spin.className = "spinner"
    stage.replaceChildren(spin)
  },
}

const welcome: Story = { ...spinner, title: "App / Dialogs / Connect Provider" }

// The entrance: the card fades and scales in, then its header, then the rows rise one after
// another, then the button. Each is a track; the stage reads them all at the playhead's time.
const LENGTH = 1.6
const entranceTracks = [
  track("card", { ease: spring({ duration: 0.4, bounce: 0 }), max: LENGTH }),
  track("header", { start: 0.12, duration: 0.3, ease: easing("out"), max: LENGTH }),
  track("rows", {
    start: 0.2,
    ease: spring({ duration: 0.35, bounce: 0 }),
    stagger: 0.04,
    items: 7,
    max: LENGTH,
  }),
  track("button", { start: 0.62, duration: 0.25, ease: easing("snappy"), max: LENGTH }),
] as const
const ROWS = ["Overview", "Sessions", "Agents", "Models", "Providers", "Keybinds", "Themes"]

const entrance: Story = {
  title: "UI / Motion / Card entrance",
  states: [{ name: "Shipped", args: {} }],
  fields: Object.assign({}, ...entranceTracks.map((t) => t.fields)),
  presets: {
    Snappy: {
      "card.ease": { duration: 0.25, bounce: 0 },
      "header.start": 0.06,
      "header.duration": 0.2,
      "rows.start": 0.1,
      "rows.ease": { duration: 0.25, bounce: 0 },
      "rows.stagger": 0.025,
      "button.start": 0.36,
      "button.duration": 0.18,
    },
    Smooth: {
      "card.ease": { duration: 0.55, bounce: 0 },
      "header.start": 0.18,
      "header.duration": 0.45,
      "header.ease": [0.65, 0, 0.35, 1],
      "rows.start": 0.3,
      "rows.ease": { duration: 0.5, bounce: 0 },
      "rows.stagger": 0.06,
      "button.start": 0.9,
      "button.duration": 0.4,
      "button.ease": [0.65, 0, 0.35, 1],
    },
    Playful: {
      "card.ease": { duration: 0.5, bounce: 0.3 },
      "header.start": 0.15,
      "header.duration": 0.35,
      "header.ease": [0.34, 1.56, 0.64, 1],
      "rows.start": 0.25,
      "rows.ease": { duration: 0.45, bounce: 0.35 },
      "rows.stagger": 0.05,
      "rows.from": "center",
      "button.start": 0.8,
      "button.duration": 0.35,
      "button.ease": [0.34, 1.56, 0.64, 1],
    },
  },
  constrain: fitTracks(entranceTracks, { length: LENGTH }),
  buttons: ["random", "undo", "redo", "reset"],
  render() {},
  mount(stage, store) {
    const scene = document.createElement("div")
    scene.className = "entrance"
    const card = document.createElement("div")
    card.className = "entrance-card"
    const header = document.createElement("div")
    header.className = "entrance-header"
    header.textContent = "Settings"
    const list = ROWS.map((label) => {
      const row = document.createElement("div")
      row.className = "entrance-row"
      row.textContent = label
      return row
    })
    const button = document.createElement("div")
    button.className = "entrance-button"
    button.textContent = "Done"
    card.append(header, ...list, button)
    scene.append(card)
    const dock = document.createElement("div")
    dock.className = "entrance-dock"
    stage.replaceChildren(scene, dock)

    const fade = (n: HTMLElement, p: number, transform: string) => {
      n.style.opacity = String(Math.min(1, Math.max(0, p)))
      n.style.transform = transform
    }
    const paint = (t: number) => {
      const at = sampleTracks(entranceTracks, store.get(), t)
      const c = at.card[0]!
      fade(card, c, `scale(${0.94 + 0.06 * c})`)
      fade(header, at.header[0]!, `translateY(${(1 - at.header[0]!) * 6}px)`)
      list.forEach((row, i) => fade(row, at.rows[i]!, `translateY(${(1 - at.rows[i]!) * 12}px)`))
      fade(button, at.button[0]!, `scale(${0.92 + 0.08 * at.button[0]!})`)
    }
    const tl = timeline(dock, {
      theme: "dark",
      duration: LENGTH,
      fps: 60,
      time: LENGTH,
      label: "Entrance time",
      onSeek: paint,
    })
    const view = tracks(dock, {
      theme: "dark",
      controls: store,
      tracks: entranceTracks,
      timeline: tl,
      label: "Entrance tracks",
    })
    const stop = store.subscribe(() => paint(tl.time))
    paint(tl.time)
    return {
      highlight: view.highlight,
      dispose() {
        stop()
        view.dispose()
        tl.dispose()
      },
    }
  },
}

const stories: Record<string, Story> = {
  "activity-chips.stories.tsx": activity,
  "composer.stories.tsx": composer,
  "spinner.stories.tsx": spinner,
  "chatgpt-usage-limit.stories.tsx": welcome,
  "chatgpt-welcome.stories.tsx": welcome,
  "card-entrance.stories.tsx": entrance,
}

const rows: Row[] = [
  {
    id: "folder:App",
    label: "App",
    children: [
      {
        id: "folder:App/Dialogs",
        label: "Dialogs",
        children: [
          {
            id: "chatgpt-usage-limit.stories.tsx",
            label: "Connect Provider",
            detail: "chatgpt-usage-limit",
          },
          {
            id: "chatgpt-welcome.stories.tsx",
            label: "Connect Provider",
            detail: "chatgpt-welcome",
          },
        ],
      },
    ],
  },
  {
    id: "folder:OpenCode",
    label: "OpenCode",
    children: [
      {
        id: "folder:OpenCode/Session",
        label: "Session",
        children: [
          { id: "activity-chips.stories.tsx", label: "Activity chips" },
          { id: "composer.stories.tsx", label: "Composer" },
        ],
      },
    ],
  },
  {
    id: "folder:UI",
    label: "UI",
    children: [
      {
        id: "folder:UI/Status",
        label: "Status",
        children: [{ id: "spinner.stories.tsx", label: "Spinner" }],
      },
      {
        id: "folder:UI/Motion",
        label: "Motion",
        children: [{ id: "card-entrance.stories.tsx", label: "Card entrance" }],
      },
    ],
  },
]

const chip = (label: string) => {
  const el = document.createElement("span")
  el.className = "chip"
  el.textContent = label
  return el
}

const stage = document.createElement("div")
stage.className = "story"
const controls = document.createElement("div")
controls.style.height = "100%"
const outline = document.createElement("div")
outline.style.height = "100%"

const layout = split(document.getElementById("lab")!, {
  theme: "dark",
  storage: null,
  panes: [
    {
      id: "stories",
      size: 260,
      min: 200,
      max: 420,
      collapsible: true,
      title: "Components",
      count: Object.keys(stories).length,
      element: outline,
    },
    { id: "stage", min: 360, element: stage },
    {
      id: "inspector",
      size: 300,
      min: 260,
      max: 460,
      collapsible: true,
      title: "",
      element: controls,
    },
  ],
})

let unmount: (() => void) | undefined
let unmountStory: (() => void) | undefined
let timer: ReturnType<typeof setTimeout> | undefined

function open(file: string) {
  const story = stories[file]
  if (!story) return
  unmount?.()
  unmountStory?.()
  unmountStory = undefined
  clearTimeout(timer)
  layout.pane("inspector").title(story.title.split("/").join(" / ").replace(/\s+/g, " "))
  const names = story.states.map((s) => s.name)
  const [first, ...rest] = names
  const step = (by: number) => {
    const at = Math.max(0, names.indexOf(String(store.activePreset()?.id ?? "default")))
    const next = (at + by + names.length) % names.length
    store.preset(next === 0 ? "default" : names[next]!)
  }
  const play = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      step(1)
      play()
    }, 1600)
  }
  const states: Record<string, Field> =
    first === undefined || rest.length === 0
      ? {}
      : {
          play: toolbar([
            {
              id: "previous",
              label: "Previous",
              icon: "M200 48 80 128l120 80ZM48 48h16v160H48Z",
              run: () => step(-1),
            },
            { id: "play", label: "Play", icon: "play", run: play },
            { id: "pause", label: "Pause", icon: "pause", run: () => clearTimeout(timer) },
            {
              id: "next",
              label: "Next",
              icon: "M56 48l120 80-120 80ZM192 48h16v160h-16Z",
              run: () => step(1),
            },
          ]),
        }
  const store = defineControls(
    `lab-${file}`,
    { ...states, ...story.fields },
    {
      enabled: true,
      storage: null,
      persist: "none",
      defaultLabel: { "": first ?? "default", Motion: "Shipped" },
      presets: {
        ...Object.fromEntries(story.states.slice(1).map((s) => [s.name, s.args])),
        ...story.presets,
      },
      ...(story.motion ? { scopedPresets: { Motion: story.motion } } : {}),
      ...(story.constrain ? { constrain: story.constrain } : {}),
      onChange: (_patch, values) => story.render(stage, values),
    },
  )
  const mounted = story.mount?.(stage, store)
  unmountStory = mounted?.dispose
  if (!mounted) story.render(stage, { ...story.states[0]?.args, ...store.get() })
  unmount = store.mount(controls, {
    theme: "dark",
    header: { title: false, buttons: story.buttons ?? ["undo", "redo", "reset"] },
    ...(mounted?.highlight
      ? { onActive: (at: { group: string } | null) => mounted.highlight!(at?.group ?? null) }
      : {}),
    variants: false,
    session: false,
    hints: { digits: "always" },
    empty: "This story has no controls",
  })
}

const asked = new URLSearchParams(location.search).get("story")
const initial = asked && asked in stories ? asked : "activity-chips.stories.tsx"

tree(outline, {
  theme: "dark",
  items: rows,
  label: "Components",
  detail: (row) => row.detail,
  expanded: [
    "folder:App",
    "folder:App/Dialogs",
    "folder:OpenCode",
    "folder:OpenCode/Session",
    "folder:UI",
    "folder:UI/Status",
    "folder:UI/Motion",
  ],
  selection: [initial],
  onSelect: (_, primary) => primary && !primary.startsWith("folder:") && open(primary),
})

open(initial)
