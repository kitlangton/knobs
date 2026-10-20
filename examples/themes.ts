// The theme gallery: every knobs piece in four columns, each a theme and an appearance (Knobs and
// Void, dark and light by default). A column's name opens a menu to show another theme or
// appearance there, and everything in it glides over (`restyle`). The builder on the right is a
// panel of `defineTheme`'s dials; its theme ("Custom") shows in any column that picks it, live,
// and "Copy as code" hands over the `defineTheme` call.
//   ?renderer=dom|gpu   the panels' renderer (auto by default)
import {
  action,
  angle,
  choice,
  color,
  curve,
  defineControls,
  easing,
  gradient,
  graph,
  keybind,
  knob,
  log,
  meter,
  point,
  range,
  seed,
  sparkline,
  spring,
  table,
  toggle,
  toolbar,
  vec2,
  vec3,
  watch,
} from "knobs"
import { mountPanel } from "knobs/panel"
import { defineTheme, type Density, type Material, type Theme, themes } from "knobs/themes"
import {
  activity,
  bento,
  codeDiff,
  commandPalette,
  compare,
  confirm,
  diffReview,
  menu,
  optionPicker,
  popover,
  readout,
  restyle,
  split,
  timeline,
  toast,
  tooltip,
  tree,
  walkthrough,
  type CommandPalette,
  type MenuEntry,
  type UiLook,
} from "knobs/ui"
import patch from "./lab-diff.patch?raw"

type ThemeKey = "knobs" | "void" | "gallery" | "custom"
type Mode = "dark" | "light"

const params = new URLSearchParams(location.search)
const renderer =
  params.get("renderer") === "dom" ? "dom" : params.get("renderer") === "gpu" ? "gpu" : "auto"
const NAMES: Record<ThemeKey, string> = {
  knobs: "Knobs",
  void: "Void",
  gallery: "Gallery",
  custom: "Custom",
}

// ——— the builder's theme ———

const builder = defineControls(
  "themes-builder",
  {
    hue: knob(285, { min: 0, max: 360, step: 1, unit: "°", label: "Gray hue" }),
    chroma: knob(0.004, { min: 0, max: 0.02, step: 0.001, decimals: 3, label: "Gray chroma" }),
    accent: color("#ffffff", { label: "Accent" }),
    contrast: knob(50, { min: 0, max: 100, step: 1, label: "Contrast" }),
    radius: knob(8, { min: 0, max: 16, step: 1, unit: "px", label: "Radius" }),
    density: choice("default", ["compact", "default", "comfortable"], {
      label: "Density",
      labels: { compact: "Compact", default: "Default", comfortable: "Comfy" },
    }),
    material: choice("glass", ["glass", "solid", "flat"], {
      label: "Material",
      labels: { glass: "Glass", solid: "Solid", flat: "Flat" },
    }),
    copy: action("Copy as code", { run: () => void copyCode() }),
  },
  { storage: null, enabled: true },
)

interface Dials {
  hue: number
  chroma: number
  accent: string
  contrast: number
  radius: number
  density: Density
  material: Material
}
const dials = (): Dials => {
  const v = builder.get()
  return { ...v, density: v.density as Density, material: v.material as Material }
}
const make = (d: Dials) =>
  defineTheme({
    name: "custom",
    gray: { hue: d.hue, chroma: d.chroma },
    accent: d.accent,
    contrast: d.contrast,
    radius: d.radius,
    density: d.density,
    material: d.material,
  })
let custom = make(dials())

const code = (d: Dials) => `import { defineTheme } from "knobs/themes"

export const custom = defineTheme({
  name: "custom",
  gray: { hue: ${d.hue}, chroma: ${d.chroma} },
  accent: "${d.accent}",
  contrast: ${d.contrast},
  radius: ${d.radius},
  density: "${d.density}",
  material: "${d.material}",
})
`
async function copyCode() {
  try {
    await navigator.clipboard.writeText(code(dials()))
    toast("Copied the defineTheme call")
  } catch {
    toast("Couldn't reach the clipboard", { tone: "warn" })
  }
}

const themeOf = (key: ThemeKey): Theme => (key === "custom" ? custom : themes[key])

// ——— columns ———

interface Column {
  theme: ThemeKey
  appearance: Mode
  readonly cells: HTMLElement[]
  readonly onLook: (() => void)[]
  name?: HTMLButtonElement
}
const columns: Column[] = (
  [
    ["knobs", "dark"],
    ["knobs", "light"],
    ["void", "dark"],
    ["void", "light"],
  ] as const
).map(([theme, appearance]) => ({ theme, appearance, cells: [], onLook: [] }))

const look = (c: Column): UiLook => ({ theme: themeOf(c.theme), appearance: c.appearance })

/** The cell's page and ink from the theme's own values, so the column reads as its page. */
function paintCell(c: Column, cell: HTMLElement) {
  const t = themeOf(c.theme)[c.appearance]
  cell.style.setProperty("--cell-page", t["bg-page"])
  cell.style.setProperty("--cell-text", t.fg)
  cell.style.setProperty("--cell-dim", t["fg-3"])
  cell.style.colorScheme = c.appearance
}

function relook(c: Column) {
  if (c.name) c.name.textContent = `${NAMES[c.theme]} · ${c.appearance}`
  for (const cell of c.cells) {
    paintCell(c, cell)
    restyle(cell, look(c))
  }
  for (const f of c.onLook) f()
}

const gallery = document.getElementById("gallery")!
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

/** A row of the gallery: one cell per column, each filled by `fill`. */
function row(title: string, fill: (cell: HTMLElement, c: Column, i: number) => void) {
  columns.forEach((c, i) => {
    const cell = el("div", "cell")
    if (title) cell.append(el("h3", "", title))
    paintCell(c, cell)
    c.cells.push(cell)
    gallery.append(cell)
    fill(cell, c, i)
  })
}

// The column heads: a name that opens a menu of themes and appearances.
row("", (cell, c) => {
  cell.classList.add("head")
  const name = el("button", "pick")
  name.type = "button"
  name.setAttribute("aria-haspopup", "menu")
  c.name = name
  name.textContent = `${NAMES[c.theme]} · ${c.appearance}`
  const items = (): MenuEntry[] => [
    ...(["knobs", "void", "gallery", "custom"] as const).map((key) => ({
      label: NAMES[key],
      radio: true,
      checked: c.theme === key,
      run: () => {
        c.theme = key
        relook(c)
      },
    })),
    "-",
    ...(["dark", "light"] as const).map((mode) => ({
      label: mode === "dark" ? "Dark" : "Light",
      radio: true,
      checked: c.appearance === mode,
      run: () => {
        c.appearance = mode
        relook(c)
      },
    })),
  ]
  name.addEventListener("click", (e) =>
    menu(name, items(), { label: "Look", look: look(c), keyboard: e.detail === 0 }),
  )
  cell.append(name)
})

// ——— panel: every control kind, one store shared by the four panels ———

const specimen = defineControls(
  "themes-specimen",
  {
    size: knob(42, { min: 0, max: 100, step: 1, unit: "px", label: "Size", group: "basics" }),
    opacity: knob(0.8, { min: 0, max: 1, step: 0.01, label: "Opacity", group: "basics" }),
    fit: choice("fill", ["fill", "fit", "crop"], {
      label: "Fit",
      labels: { fill: "Fill", fit: "Fit", crop: "Crop" },
      group: "basics",
    }),
    blend: choice(
      "normal",
      ["normal", "multiply", "screen", "overlay", "soft-light", "difference"],
      {
        label: "Blend",
        display: "menu",
        group: "basics",
      },
    ),
    visible: toggle(true, { label: "Visible", group: "basics" }),
    wire: toggle(false, { label: "Wireframe", group: "basics" }),
    seed: seed(42, { label: "Seed", group: "basics" }),
    key: keybind("Mod+K", { label: "Shortcut", group: "basics" }),
    spring: spring({ duration: 0.4, bounce: 0.2 }, { label: "Spring", group: "motion" }),
    ease: easing("snappy", { label: "Easing", group: "motion" }),
    life: range([0.6, 1.8], {
      min: 0,
      max: 4,
      step: 0.05,
      unit: "s",
      label: "Life",
      group: "motion",
    }),
    yaw: angle(90, { label: "Yaw", group: "motion" }),
    falloff: curve(
      [
        { x: 0, y: 1 },
        { x: 0.45, y: 0.7 },
        { x: 1, y: 0 },
      ],
      { label: "Falloff", group: "motion" },
    ),
    offset: point(
      { x: 0.2, y: -0.3 },
      { min: -1, max: 1, step: 0.01, label: "Offset", group: "space" },
    ),
    scale: vec2({ x: 1, y: 1 }, { min: 0, max: 4, step: 0.01, label: "Scale", group: "space" }),
    position: vec3(
      { x: 0, y: 1.2, z: -4 },
      { min: -10, max: 10, step: 0.1, label: "Position", group: "space" },
    ),
    tint: color("#3a8dff", { label: "Tint", group: "colour" }),
    ramp: gradient(
      [
        { at: 0, color: "#1b1f3a" },
        { at: 0.55, color: "#ff7a59" },
        { at: 1, color: "#ffe9a8" },
      ],
      { label: "Ramp", group: "colour" },
    ),
    transport: toolbar(
      [
        { id: "play", label: "Play", icon: "play" },
        { id: "frame", label: "Frame", icon: "frame" },
        { id: "again", label: "Retrigger", icon: "retrigger" },
      ],
      { label: "Transport", group: "actions" },
    ),
    bake: action("Bake", { group: "actions" }),
    fps: watch({ label: "FPS", decimals: 0, group: "readouts" }),
    frame: graph({
      label: "Frame",
      series: [
        { id: "cpu", label: "CPU", area: true },
        { id: "gpu", label: "GPU" },
      ],
      unit: "ms",
      decimals: 1,
      min: 0,
      height: 48,
      thresholds: [{ value: 16.7, label: "60 fps" }],
      group: "readouts",
    }),
    output: meter({
      label: "Output",
      max: 1600,
      unit: "lm",
      decimals: 0,
      warn: 1200,
      critical: 1500,
      group: "readouts",
    }),
    energy: sparkline({ label: "Energy", unit: "lm", decimals: 0, min: 0, group: "readouts" }),
    views: table({ label: "Views", columns: ["View", "Renders", "ms"], group: "readouts" }),
    events: log({ label: "Events", lines: 4, group: "readouts" }),
  },
  { storage: null, enabled: true },
)
// A still picture of the readouts: their history filled at once, nothing ticking.
for (let i = 0; i < 60; i++) {
  const cpu = 7 + 3 * Math.sin(i / 6) + (i % 7) * 0.3
  specimen.watch("frame", { cpu, gpu: cpu * 0.6 + 2 })
  specimen.watch("energy", 900 + 300 * Math.sin(i / 9))
}
specimen.watch("fps", 120)
specimen.watch("output", 1320)
specimen.watch("views", [
  ["Hero", 1204, 0.42],
  ["Panel", 388, 0.08],
])
specimen.watch("events", "Page built")
specimen.watch("events", { text: "Over budget once", level: "warn" })

row("Panel", (cell, c) => {
  const slot = el("div")
  cell.append(slot)
  mountPanel(specimen, slot, {
    ...look(c),
    title: "Specimen",
    renderer,
    session: false,
    crumbs: false,
    variants: false,
    haptics: false,
    toggleKey: false,
  })
})

// ——— chip and notice ———

const gear =
  '<svg class="knobs-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></svg>'
row("Chip & notice", (cell, c) => {
  const line = el("div", "row")
  const bare = el("button", "knobs-root knobs-chip")
  bare.type = "button"
  bare.dataset.shown = "true"
  bare.innerHTML = gear
  const labelled = el("button", "knobs-root knobs-chip")
  labelled.type = "button"
  labelled.dataset.shown = "true"
  labelled.dataset.label = ""
  labelled.innerHTML = `${gear}<span>knobs</span>`
  const notice = el("div", "knobs-root knobs-notice", "knobs on")
  notice.dataset.shown = "true"
  line.append(bare, labelled, notice)
  cell.append(line)
  restyle(line, look(c))
})

// ——— overlays: menus, palette, popover, confirm, toast, tooltip ———

row("Menus, palette, toast, tooltip", (cell, c) => {
  const line = el("div", "row")
  const button = (label: string, run: (b: HTMLButtonElement, e: MouseEvent) => void) => {
    const b = el("button", "act", label)
    b.type = "button"
    b.addEventListener("click", (e) => run(b, e))
    line.append(b)
    return b
  }
  const entries = (): MenuEntry[] => [
    { label: "Small", radio: true, checked: false, shortcut: "S" },
    { label: "Medium", radio: true, checked: true, shortcut: "M" },
    "-",
    { label: "Outline", checked: true, shortcut: "Mod+O" },
    {
      label: "Colour",
      items: () =>
        ["Azure", "Mint", "Rose"].map((label, i) => ({ label, radio: true, checked: i === 0 })),
    },
    { label: "Duplicate", hint: "soon", disabled: true },
    "-",
    { label: "Delete", destructive: true },
  ]
  button("Menu ▾", (b, e) =>
    menu(b, entries(), { label: "Options", look: look(c), keyboard: e.detail === 0 }),
  )
  let palette: CommandPalette | undefined
  button("Palette", () => {
    palette?.dispose()
    palette = commandPalette({
      look: look(c),
      hotkey: false,
      recents: false,
      commands: [
        { label: "Frame selection", section: "View", shortcut: "F" },
        { label: "Toggle grid", section: "View", shortcut: "G" },
        { label: "Bake lighting", section: "Scene" },
        { label: "Export as PNG", section: "File", shortcut: "Mod+Shift+E" },
      ],
    })
    palette.open()
  })
  button("Popover", (b) => {
    const body = el("div")
    body.style.cssText = "padding:12px;width:200px;font:12px/1.45 var(--k-font,system-ui)"
    body.innerHTML =
      "<b>Share this panel</b><div style='opacity:.7;margin-top:4px'>Anyone with the link sees the same values.</div>"
    popover(b, body, { placement: "bottom-start", label: "Share", role: "dialog", look: look(c) })
  })
  button("Confirm", async () => {
    const ok = await confirm({
      title: "Delete “Barrier”?",
      body: "It leaves the scene, with anything inside it.",
      confirm: "Delete",
      destructive: true,
      look: look(c),
    })
    if (ok) toast("Deleted Barrier", { look: look(c), action: { label: "Undo", run: () => {} } })
  })
  button("Toast", () => toast("Saved", { look: look(c) }))
  button("Warn", () => toast("Frame over budget", { tone: "warn", look: look(c) }))
  const tip = button("Tooltip", () => {})
  const tips = () => tooltip(tip, { text: "Hover text", shortcut: "Mod+K" }, { look: look(c) })
  tips()
  c.onLook.push(tips)
  cell.append(line)
})

// ——— split and tree ———

const fileIcon =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 2h5.2L12 4.8V14H4Z"/><path d="M9 2v3h3"/></svg>'

row("Split", (cell, c, i) => {
  const box = el("div", "box split-box")
  cell.append(box)
  const files = el("div")
  files.style.cssText = "position:absolute;inset:0"
  tree(files, {
    ...look(c),
    label: "Files",
    items: ["index.ts", "scene.ts", "look.ts"].map((id) => ({ id, label: id })),
    icon: () => fileIcon,
  })
  const canvas = el("div", "canvas", "Canvas")
  const inspector = el("div", "note", "Panes collapse to a rail.")
  split(box, {
    ...look(c),
    id: `themes-split-${i}`,
    storage: null,
    panes: [
      {
        id: "files",
        size: 110,
        min: 90,
        collapsible: true,
        title: "Files",
        count: 3,
        element: files,
      },
      { id: "canvas", min: 60, element: canvas },
      {
        id: "inspector",
        size: 100,
        min: 80,
        collapsible: true,
        title: "Inspector",
        element: inspector,
      },
    ],
  })
})

interface Node {
  id: string
  label: string
  icon?: string
  children?: Node[]
}
const scene: Node[] = [
  {
    id: "lights",
    label: "Lights",
    icon: "☀︎",
    children: [
      { id: "sun", label: "Sun", icon: "○" },
      { id: "fill", label: "Fill", icon: "○" },
    ],
  },
  {
    id: "props",
    label: "Props",
    icon: "▢",
    children: [
      { id: "crate", label: "Crate", icon: "▫︎" },
      { id: "lamp", label: "Street lamp", icon: "▫︎" },
    ],
  },
  { id: "camera", label: "Camera", icon: "◎" },
]
row("Tree", (cell, c) => {
  const box = el("div", "box tree-box")
  cell.append(box)
  const hidden = new Set(["fill"])
  const t = tree<Node>(box, {
    ...look(c),
    items: scene,
    label: "Scene",
    expanded: ["lights", "props"],
    selection: ["crate"],
    icon: (n) => n.icon,
    detail: (n) => (n.children ? String(n.children.length) : undefined),
    toggles: [
      {
        id: "visible",
        label: "Visible",
        get: (n) => !hidden.has(n.id),
        set: (ids, on) => {
          for (const id of ids) on ? hidden.delete(id) : hidden.add(id)
          t.refresh()
        },
      },
    ],
  })
})

// ——— timeline ———

row("Timeline", (cell, c) => {
  const box = el("div")
  cell.append(box)
  timeline(box, {
    ...look(c),
    duration: 12,
    time: 4.2,
    markers: [
      { id: "in", time: 2, label: "In" },
      { id: "beat", time: 7.5, label: "Beat" },
    ],
    ranges: [{ id: "loop", start: 3, end: 6, loop: true }],
  })
})

// ——— readouts on their own ———

row("Readouts", (cell, c) => {
  const stack = el("div", "stack")
  cell.append(stack)
  const fps = readout(sparkline({ label: "FPS", decimals: 0, min: 0 }), look(c))
  const frame = readout(
    graph({
      label: "Frame",
      series: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, label: id.toUpperCase() })),
      unit: "ms",
      min: 0,
      height: 56,
    }),
    look(c),
  )
  const out = readout(
    meter({ label: "Output", max: 100, unit: "%", warn: 70, critical: 90 }),
    look(c),
  )
  for (let i = 0; i < 60; i++) {
    fps.push(110 + 10 * Math.sin(i / 5))
    frame.push(
      Object.fromEntries(
        ["a", "b", "c", "d", "e", "f"].map((id, k) => [id, 2 + k * 1.6 + Math.sin(i / 7 + k)]),
      ),
    )
  }
  out.push(76)
  stack.append(fps.element, frame.element, out.element)
})

// ——— activity ———

const svgThumb = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="36" height="36" fill="url(#g)"/></svg>`)}`

row("Activity", (cell, c) => {
  const box = el("div", "box activity-box")
  cell.append(box)
  activity(box, {
    ...look(c),
    label: "Activity",
    expanded: ["work"],
    events: [
      { id: "asked", kind: "you", actor: "You", title: "Make it a knobs component", time: "48m" },
      {
        id: "picked",
        kind: "agent",
        actor: "Agent",
        title: "Picked it up",
        time: "46m",
        dimmed: true,
      },
      {
        id: "work",
        kind: "agent",
        actor: "Agent",
        time: "40m",
        children: [
          { id: "w1", kind: "agent", title: "Read the task", time: "44m" },
          { id: "w2", kind: "agent", title: "Sketched the API", time: "42m" },
        ],
      },
      {
        id: "proposal",
        kind: "proposal",
        actor: "Proposal",
        title: "Three rails",
        time: "31m",
        thumbs: [svgThumb("#5e5ce6", "#bf5af2"), svgThumb("#64d2ff", "#0a84ff")],
      },
      {
        id: "review",
        kind: "review",
        actor: "Review",
        title: "Walkthrough",
        duration: 32,
        time: "28m",
      },
      {
        id: "build",
        kind: "build",
        actor: "Build",
        title: "typecheck · tests · build",
        time: "12m",
      },
      { id: "blocked", kind: "blocked", actor: "Agent", title: "Waiting on a token", time: "8m" },
      {
        id: "pr",
        kind: "pr",
        actor: "GitHub",
        title: "#412 Activity rail",
        time: "6m",
        current: true,
      },
    ],
  })
})

// ——— option picker ———

const hueThumb = (hue: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 80% 62%)"/><stop offset="1" stop-color="hsl(${hue + 50} 70% 38%)"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/></svg>`,
  )}`

row("Option picker", (cell, c) => {
  const box = el("div")
  cell.append(box)
  optionPicker(box, {
    ...look(c),
    label: "Options",
    selected: "bars",
    options: [
      { id: "bars", label: "Rising Bars", suggested: true, thumb: hueThumb(200) },
      { id: "dial", label: "Arc Dial", thumb: hueThumb(237) },
      { id: "iris", label: "Concentric Iris", thumb: hueThumb(274) },
    ],
  })
})

// ——— bento ———

const ideas = import.meta.glob("./assets/ideas/*-wide-640.jpg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>
row("Bento", (cell, c) => {
  const box = el("div", "box bento-box")
  cell.append(box)
  bento(box, {
    ...look(c),
    label: "Ideas",
    rowHeight: 70,
    items: Object.entries(ideas)
      .slice(0, 6)
      .map(([path, src]) => ({
        id: path,
        src,
        label: path.replace(/^.*\/\d+-|-wide-640\.jpg$/g, ""),
        aspect: 16 / 10,
      })),
  })
})

// ——— compare ———

const still = (name: string) => new URL(`./assets/compare/${name}.png`, import.meta.url).href
row("Compare", (cell, c) => {
  const box = el("div")
  cell.append(box)
  compare(box, {
    ...look(c),
    before: { src: still("before") },
    after: { src: still("after") },
    aspect: 16 / 9,
    label: "Compare",
  })
})

// ——— code diff and review ———

const before = `export function springMotion({ duration, bounce }: SpringValue) {
  return { omega: (2 * Math.PI) / duration, zeta: 1 - bounce }
}
`
const after = `export function springMotion({ duration, bounce }: SpringValue) {
  return {
    omega: (2 * Math.PI) / Math.max(0.01, duration),
    zeta: bounce >= 0 ? 1 - bounce : 1 / (1 + bounce),
  }
}
`
row("Code diff", (cell, c) => {
  const box = el("div")
  cell.append(box)
  codeDiff(box, {
    ...look(c),
    height: "auto",
    layout: "unified",
    files: [{ name: "src/core/spring.ts", before, after }],
  })
})

row("Diff review", (cell, c, i) => {
  const box = el("div", "box review-box")
  cell.append(box)
  diffReview(box, { ...look(c), id: `themes-review-${i}`, patch, layout: "unified" })
})

// ——— walkthrough ———

row("Walkthrough", (cell, c, i) => {
  const box = el("div")
  cell.append(box)
  walkthrough(box, {
    ...look(c),
    keys: false,
    rail: false,
    advance: false,
    storage: null,
    doc: {
      id: `themes-walk-${i}`,
      title: "Activity rail",
      summary: "Two steps: a taste test and a note.",
      meta: { branch: "design-system" },
      sections: [
        {
          title: "Rail",
          status: "ready",
          steps: [
            {
              title: "Which rail?",
              ask: "pick",
              options: [
                { label: "Hairline", media: { kind: "image", src: hueThumb(210) } },
                { label: "Beads", suggested: true, media: { kind: "image", src: hueThumb(280) } },
              ],
            },
            { title: "Anything else?", caption: "A note on the `beads` rail, if any." },
          ],
        },
      ],
    },
  })
})

for (const c of columns) c.cells.at(-1)?.classList.add("last")

// ——— the builder panel ———

mountPanel(builder, document.getElementById("builder")!, {
  title: "Theme builder",
  renderer,
  session: false,
  crumbs: false,
  variants: false,
  haptics: false,
  toggleKey: false,
})
builder.subscribe(() => {
  custom = make(dials())
  for (const c of columns) if (c.theme === "custom") relook(c)
})

Object.assign(window, { __themes: { columns, builder, specimen, code: () => code(dials()) } })
