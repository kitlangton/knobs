// The Problems viewer's right panel on knobs: what packages/web would ship. A fake board server
// takes optimistic writes and echoes them late (sometimes corrected); a fake hosted prototype
// reports its settings over postMessage. The host's keys (1–9, J/K, R, Tab, Esc) stay global;
// the panels hear keys only while focus is inside them.
import {
  choice,
  createRemoteControls,
  defineControls,
  fromSettings,
  springCss,
  type ControlDescriptor,
  type SettingsGroup,
  type State,
} from "knobs"
import { KnobsPanel, useModified, useValue } from "knobs/solid"
import { problemsPreset } from "knobs/themes"
import { createMemo, createRoot, createSignal, For, type JSX } from "solid-js"
import html from "solid-js/html"
import { render } from "solid-js/web"

// ── The board's data: Problems' ParamSpec, per variation ─────────────────────────────────────
interface ParamSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  value: number
  unit?: string
  decimals?: number
  group?: "main" | "spring"
}
interface Variation {
  id: string
  name: string
  params: ParamSpec[]
}
interface Item {
  id: string
  title: string
  variations: Variation[]
}
const size: ParamSpec = {
  key: "size",
  label: "Size",
  min: 24,
  max: 160,
  step: 1,
  value: 88,
  unit: "px",
}
const radius: ParamSpec = {
  key: "radius",
  label: "Radius",
  min: 0,
  max: 48,
  step: 2,
  value: 18,
  unit: "px",
}
const stops: ParamSpec = { key: "stops", label: "Stops", min: 2, max: 5, step: 1, value: 4 }
const level: ParamSpec = { key: "level", label: "Active stop", min: 1, max: 5, step: 1, value: 3 }
const glow: ParamSpec = {
  key: "glow",
  label: "Afterglow",
  min: 0,
  max: 100,
  step: 5,
  value: 70,
  unit: "%",
}
const tilt: ParamSpec = {
  key: "tilt",
  label: "Tilt",
  min: -30,
  max: 30,
  step: 1,
  value: 0,
  unit: "°",
}
const duration: ParamSpec = {
  key: "duration",
  label: "Duration",
  min: 0.1,
  max: 1,
  step: 0.05,
  value: 0.45,
  unit: "s",
  decimals: 2,
  group: "spring",
}
const bounce: ParamSpec = {
  key: "bounce",
  label: "Bounce",
  min: 0,
  max: 0.7,
  step: 0.05,
  value: 0.3,
  decimals: 2,
  group: "spring",
}
const items: Item[] = [
  {
    id: "D-43",
    title: "Reasoning level icon",
    variations: [
      { id: "A", name: "Rising Bars", params: [stops, level, size, duration, bounce] },
      {
        id: "B",
        name: "Arc Dial",
        params: [stops, level, { ...radius, label: "Sweep", max: 80 }, tilt],
      },
      { id: "C", name: "Concentric Iris", params: [stops, level, glow] },
      { id: "D", name: "Dot-Matrix Orb", params: [stops, level, glow, duration, bounce] },
      { id: "E", name: "Stacked Planes", params: [] },
    ],
  },
  {
    id: "OC-35",
    title: "Requests sheet",
    variations: [
      { id: "A", name: "Docked", params: [{ ...size, value: 120 }, radius, duration, bounce] },
      { id: "B", name: "Floating", params: [{ ...size, value: 64 }, tilt, duration, bounce] },
    ],
  },
]

// ── ParamSpec → descriptors: one spring card binds the flat duration and bounce keys ─────────
const descriptorCache = new Map<Variation, ControlDescriptor[]>()
function paramDescriptors(variation: Variation): ControlDescriptor[] {
  const known = descriptorCache.get(variation)
  if (known) return known
  const list: ControlDescriptor[] = variation.params.map((p) => ({
    key: p.key,
    label: p.label,
    kind: "number",
    default: p.value,
    min: p.min,
    max: p.max,
    step: p.step,
    ...(p.unit ? { unit: p.unit } : {}),
    ...(p.decimals !== undefined ? { decimals: p.decimals } : {}),
    ...(p.group === "spring" ? { group: "Spring" } : {}),
  }))
  const keys = new Set(variation.params.map((p) => p.key))
  if (keys.has("duration") && keys.has("bounce"))
    list.push({
      key: "spring",
      kind: "spring",
      label: "Spring",
      group: "Spring",
      bind: { duration: "duration", bounce: "bounce" },
    })
  descriptorCache.set(variation, list)
  return list
}

// ── A fake board server: optimistic writes, echoes 350 ms later, stepped values corrected ────
const server = new Map<string, Record<string, number>>()
const slot = (item: string, variation: string) => `${item}/${variation}`
const [edits, setEdits] = createSignal<Record<string, Record<string, number>>>({})
const log: string[] = []
const [logText, setLogText] = createSignal("")
const note = (line: string) => {
  log.push(line)
  if (log.length > 5) log.shift()
  setLogText(log.join("\n"))
}
function write(item: string, variation: string, key: string, value: number | null) {
  const at = slot(item, variation)
  // Optimistic: the host's own state changes at once.
  setEdits((all) => {
    const next = { ...(all[at] ?? {}) }
    if (value === null) delete next[key]
    else next[key] = value
    return { ...all, [at]: next }
  })
  setTimeout(() => {
    const stored = { ...(server.get(at) ?? {}) }
    if (value === null) delete stored[key]
    else stored[key] = Math.round(value * 1000) / 1000
    server.set(at, stored)
    // The echo: the server's whole record for this slot.
    setEdits((all) => ({ ...all, [at]: { ...stored } }))
  }, 350)
}

// ── Host state ───────────────────────────────────────────────────────────────────────────────
const [itemIndex, setItemIndex] = createSignal(0)
const [variationIndex, setVariationIndex] = createSignal(
  Number(new URLSearchParams(location.search).get("v") ?? 1) - 1,
)
const [landing, setLanding] = createSignal(false)
const item = () => items[itemIndex()]!
const variation = () => item().variations[Math.min(variationIndex(), item().variations.length - 1)]!
const descriptors = createRoot(() => createMemo(() => paramDescriptors(variation())))
const values = createRoot(() =>
  createMemo<State>(() => {
    const own = edits()[slot(item().id, variation().id)] ?? {}
    return Object.fromEntries(variation().params.map((p) => [p.key, own[p.key] ?? p.value]))
  }),
)

const params = createRemoteControls("parameters", [], {
  nullDefaults: false,
  toggleKey: false,
  storage: null,
  onSet: (key, value) => {
    note(`set ${key} = ${value}`)
    write(item().id, variation().id, key, value as number)
  },
  onReset: ({ key, group }) => {
    note(`reset ${key ?? group ?? "all"}`)
    const specs = variation().params.filter((p) =>
      key ? p.key === key : group ? (p.group === "spring" ? "Spring" : undefined) === group : true,
    )
    for (const p of specs) write(item().id, variation().id, p.key, null)
  },
})
const anyEdits = createRoot(() => useModified(params))
const sizeValue = createRoot(() => useValue(params, "size"))

// ── A fake hosted prototype, speaking viewer.js's pv:settings / board:setting ─────────────────
const prototype = {
  theme: "dark",
  motion: false,
  device: "iphone-16",
  replays: 0,
}
const devices = [
  ["iphone-se", "iPhone SE"],
  ["iphone-16", "iPhone 16"],
  ["iphone-16-pro", "iPhone 16 Pro"],
  ["iphone-16-max", "iPhone 16 Pro Max"],
  ["ipad-mini", "iPad mini"],
  ["ipad-pro", "iPad Pro"],
] as const
const frame = new MessageChannel()
// The "iframe": reports its settings, and applies the board's.
const report = () =>
  frame.port2.postMessage({
    type: "pv:settings",
    groups: [
      {
        title: "Scenario",
        items: [
          {
            id: "0.0",
            label: "Appearance",
            kind: "choice",
            choices: [
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" },
            ],
            value: prototype.theme,
          },
          {
            id: "0.1",
            label: "Device",
            kind: "choice",
            choices: devices.map(([id, label]) => ({ id, label })),
            value: prototype.device,
          },
          { id: "0.2", label: "Reduce Motion", kind: "toggle", value: prototype.motion },
        ],
      },
      { title: "Actions", items: [{ id: "1.0", label: "Replay arrival", kind: "action" }] },
    ] satisfies SettingsGroup[],
  })
frame.port2.onmessage = (event) => {
  const { type, id, value } = event.data
  if (type !== "board:setting") return
  // The page takes a moment, then reports its state again.
  setTimeout(() => {
    if (id === "0.0") prototype.theme = value
    if (id === "0.1") prototype.device = value
    if (id === "0.2") prototype.motion = value
    if (id === "1.0") prototype.replays++
    report()
  }, 120)
}
const [settings, setSettings] = createSignal(fromSettings([]))
// Each setting's home is what the prototype first reported: it owns the state.
let home: State = {}
frame.port1.onmessage = (event) => {
  if (event.data.type !== "pv:settings") return
  const next = fromSettings(event.data.groups, home)
  home = { ...next.values, ...home }
  setSettings(next)
}
let settingsShape = ""
const settingsDescriptors = createRoot(() =>
  createMemo<ControlDescriptor[]>((previous) => {
    const next = settings().descriptors
    // Same shape, same array: the panel only syncs values.
    const shape = JSON.stringify(next)
    if (previous && shape === settingsShape) return previous
    settingsShape = shape
    return next
  }),
)
const prototypeSettings = createRemoteControls("prototype-settings", [], {
  nullDefaults: false,
  // The prototype's values aren't "modified" from anything: no dots, no resets.
  marks: false,
  toggleKey: false,
  storage: null,
  onSet: (id, value) => {
    note(`board:setting ${id} = ${value}`)
    frame.port1.postMessage({ type: "board:setting", id, value })
  },
  onAction: (id) => {
    note(`board:setting ${id} (action)`)
    frame.port1.postMessage({ type: "board:setting", id, value: null })
  },
})
report()

// ── The dev-only "Prototype" dock: local controls instead of local signals ───────────────────
const dock = defineControls(
  "prototype-dock",
  {
    panel: choice("shown", ["shown", "hidden"], {
      label: "Video panel",
      labels: { shown: "Shown", hidden: "Hidden" },
    }),
    submit: choice("arrow", ["arrow", "send"], {
      label: "Submit button",
      labels: { arrow: "↑ Arrow", send: "Send" },
    }),
  },
  { enabled: true, storage: null },
)
const dockPanel = createRoot(() => useValue(dock, "panel"))

// ── Host keys: global, except while a panel has focus (its keys stop there) ───────────────────
let focusParams = () => {}
function switchItem(delta: number) {
  setLanding(true)
  setItemIndex((i) => (i + delta + items.length) % items.length)
  setVariationIndex(0)
  queueMicrotask(() => setLanding(false))
  note(`item ${item().id} (lands)`)
}
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key
  if (/^[1-9]$/.test(key)) {
    const i = Number(key) - 1
    if (i < item().variations.length) setVariationIndex(i)
  } else if (key === "j" || key === "J") switchItem(1)
  else if (key === "k" || key === "K") switchItem(-1)
  else if (key === "r" || key === "R") note("host: next round (R)")
  // Tab tunes; inside a panel it's the panel's own Tab order.
  else if (key === "Tab" && !(event.target as HTMLElement).closest(".knobs-panel")) focusParams()
  else if (key === "Enter" && !(event.target as HTMLElement).closest("button,[role=radiogroup]"))
    note(`host: choose ${variationIndex() + 1}`)
  else return
  event.preventDefault()
})

// Problems' own keys win: J/K switch items and 1–9 variations even while tuning, Enter chooses.
const paramKeys = {
  random: false,
  mutate: false,
  compare: false,
  hint: false,
  undo: false,
  redo: false,
  presets: false,
  save: false,
  copy: false,
  resetAll: false,
  vim: false,
  edit: false,
  bigStep: 5,
  wrap: false,
} as const

// ── The page ─────────────────────────────────────────────────────────────────────────────────
const springOf = () => {
  const v = values()
  return springCss({ duration: Number(v.duration ?? 0.45), bounce: Number(v.bounce ?? 0.3) })
}
function Stage(): JSX.Element {
  return html`<div class="stage" hidden=${() => dockPanel() === "hidden"}>
    <div class="device">
      <span class="caption">${() => `${item().id} · ${variation().id} ${variation().name}`}</span>
      <div
        class="chip"
        style=${() => {
          const v = values()
          const { easing, duration } = springOf()
          const s = Number(sizeValue() ?? 88)
          return `width:${s}px;height:${s}px;border-radius:${v.radius ?? 18}px;opacity:${0.4 + Number(v.glow ?? 100) / 166};transform:rotate(${v.tilt ?? 0}deg);transition:all ${duration}ms ${easing}`
        }}
      ></div>
      <div class="dots">
        <${For} each=${() => Array.from({ length: Number(values().stops ?? 0) }, (_, i) => i)}>
          ${(i: number) => html`<i class=${() => (i < Number(values().level ?? 0) ? "on" : "")}></i>`}
        <//>
      </div>
    </div>
  </div>` as unknown as JSX.Element
}
function App(): JSX.Element {
  return html`
    <div class="top">
      <b>Problems</b>
      <span class="item">${() => `${item().id} — ${item().title}`}</span>
      <span class="keys">1–9 variation · J/K item · R round · Tab tune · ↵ choose · Esc leave</span>
      <button
        onClick=${() => {
          const root = document.documentElement
          root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light"
        }}
      >Theme</button>
    </div>
    <div class="uv">
      <div class="uv-vars">
        <${For} each=${() => item().variations}>
          ${(v: Variation, i: () => number) =>
            html`<button class=${() => `uv-var${i() === variationIndex() ? " cur" : ""}`} onClick=${() => setVariationIndex(i())}>
              <span class="dc-letter">${() => i() + 1}</span>${v.name}
            </button>`}
        <//>
      </div>
      <${Stage} />
      <aside class="side" aria-label="Inspector">
        <h4 class="uv-head">
          <span class="dc-letter">${() => variationIndex() + 1}</span>
          <span>Parameters</span>
          <button class=${() => `reset${anyEdits() ? " show" : ""}`} onClick=${() => params.reset()}>Reset</button>
        </h4>
        <${KnobsPanel}
          controls=${params}
          descriptors=${() => descriptors()}
          values=${() => values()}
          land=${() => landing()}
          header=${false}
          variants=${false}
          theme="auto"
          preset=${problemsPreset}
          keys=${paramKeys}
          onReady=${(panel: { focus(): void }) => (focusParams = () => panel.focus())}
        />
        <button class="choose">
          Choose ${() => variationIndex() + 1}<i class=${() => `dot${anyEdits() ? " on" : ""}`}></i>
        </button>
        <div class="section-gap"></div>
        <h4>Prototype settings</h4>
        <${KnobsPanel}
          controls=${prototypeSettings}
          descriptors=${() => settingsDescriptors()}
          values=${() => settings().values}
          header=${false}
          variants=${false}
          theme="auto"
          preset=${problemsPreset}
          keys=${{ random: false, mutate: false, compare: false, hint: false, undo: false, redo: false, presets: false, save: false, copy: false, resetAll: false, reset: false }}
        />
        <div class="log" aria-live="polite">${logText}</div>
      </aside>
    </div>
    <div class="proto-dock">
      <button>Prototype ▾</button>
      <${KnobsPanel} controls=${dock} header=${false} variants=${false} theme="auto" preset=${problemsPreset} keys=${{ random: false, mutate: false, hint: false, menu: false }} />
    </div>
  ` as unknown as JSX.Element
}
render(App, document.getElementById("app")!)
Object.assign(window, {
  __problems: {
    params,
    prototypeSettings,
    dock,
    edits,
    server,
    prototype,
    /** The board changes a value of the open variation on its own (another person, a clamp). */
    serverSet(key: string, value: number) {
      const at = slot(item().id, variation().id)
      setEdits((all) => ({ ...all, [at]: { ...(all[at] ?? {}), [key]: value } }))
    },
    state: () => ({ item: item().id, variation: variation().id, values: values() }),
  },
})
