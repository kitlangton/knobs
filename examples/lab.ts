// A Lab-style editor (Arcade's tuning workbench) with knobs panels in its right column, themed
// with labPreset. The host owns the settings and its undo stack; knobs shows them, rolls them
// from a recorded seed, skips seeds and switches, gates rows on other settings, folds advanced
// groups and carries the host's pins in each row. Used by tests/browser/lab.spec.ts.
import {
  createRemoteControls,
  type ChangeMeta,
  type ControlDescriptor,
  type State,
  type Value,
} from "knobs"
import { mountPanel } from "knobs/panel"
import { labPreset } from "knobs/themes"

const scenes = [
  "Outbreak · Streetlamp & rain",
  "Outbreak · Alley at dusk",
  "Outbreak · Parking deck",
  "Blackout · Rooftop",
  "Blackout · Server room",
  "Getaway · Muscle car",
  "Getaway · Highway night",
  "Carrier · Flight deck",
  "Survivor · Forest edge",
  "Survivor · Cabin interior",
  "Proving yard",
  "Look & threat by hour · noon",
  "Look & threat by hour · midnight",
  "3 · High-contrast noir / storm",
]
const descriptors: ControlDescriptor[] = [
  {
    key: "intensity",
    label: "Weather intensity",
    kind: "number",
    default: 1,
    min: 0,
    max: 2,
    step: 0.01,
    decimals: 2,
    group: "precip",
    groupLabel: "Precipitation",
  },
  {
    key: "density",
    label: "Drop density",
    kind: "number",
    default: 2.25,
    min: 0,
    max: 4,
    step: 0.05,
    unit: "×",
    group: "precip",
  },
  {
    key: "size",
    label: "Drop size",
    kind: "number",
    default: 1.26,
    min: 0.2,
    max: 3,
    step: 0.02,
    unit: "×",
    group: "precip",
  },
  {
    key: "streak",
    label: "Streak length",
    kind: "number",
    default: 1.62,
    min: 0,
    max: 4,
    step: 0.02,
    unit: "×",
    group: "precip",
  },
  {
    key: "fall",
    label: "Fall speed",
    kind: "number",
    default: 15,
    min: 1,
    max: 30,
    step: 0.5,
    decimals: 1,
    unit: "m/s",
    group: "precip",
  },
  {
    key: "litOnly",
    label: "Lit-only visibility",
    kind: "number",
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.01,
    group: "precip",
  },
  { key: "snow", label: "Snow mode", kind: "toggle", default: false, group: "precip" },
  { key: "rollPrecip", label: "Randomize Precipitation", kind: "action", group: "precip" },
  {
    key: "splash",
    label: "Splash & drip rate",
    kind: "number",
    default: 2.25,
    min: 0,
    max: 4,
    step: 0.05,
    unit: "×",
    group: "splash",
    groupLabel: "Splashes & wetness",
  },
  {
    key: "wetness",
    label: "Surface wetness",
    kind: "number",
    default: 1,
    min: 0,
    max: 1,
    step: 0.01,
    group: "splash",
  },
  {
    key: "puddles",
    label: "Puddle coverage",
    kind: "number",
    default: 1.32,
    min: 0,
    max: 2,
    step: 0.02,
    unit: "×",
    group: "splash",
  },
]
const detailDescriptors: ControlDescriptor[] = [
  {
    key: "preset",
    label: "Weather preset",
    kind: "choice",
    default: "Storm",
    choices: ["Rain", "Drizzle", "Storm", "Fog", "Snow", "Clear"],
    display: "menu",
    group: "stage",
    groupLabel: "Weather stage",
  },
  {
    key: "scene",
    label: "Test scene",
    kind: "choice",
    default: scenes[0]!,
    choices: scenes,
    group: "stage",
  },
  { key: "flashlight", label: "Flashlight beam", kind: "toggle", default: false, group: "stage" },
  {
    key: "streetlamp",
    label: "Overhead streetlamp",
    kind: "toggle",
    default: true,
    group: "stage",
  },
  {
    key: "roomSeed",
    label: "Room seed",
    kind: "number",
    default: 7,
    min: 0,
    max: 999,
    step: 1,
    group: "stage",
    random: false,
    readOnly: true,
  },
  {
    key: "light",
    label: "Light style",
    kind: "choice",
    default: "Spot",
    choices: ["Spot", "Area", "Sun"],
    group: "light",
    groupLabel: "Lighting",
  },
  {
    key: "cone",
    label: "Spot cone",
    kind: "number",
    default: 32,
    min: 4,
    max: 90,
    step: 1,
    unit: "°",
    group: "light",
    disabled: (v: State) => v.light !== "Spot",
  },
  {
    key: "falloff",
    label: "Spot falloff",
    kind: "number",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.01,
    group: "light",
    disabled: (v: State) => v.light !== "Spot",
  },
  {
    key: "exposure",
    label: "Exposure",
    kind: "number",
    default: 0,
    min: -3,
    max: 3,
    step: 0.1,
    decimals: 1,
    unit: "EV",
    group: "light",
  },
  {
    key: "fbSize",
    label: "Fireball size",
    kind: "number",
    default: 1.25,
    min: 0.2,
    max: 4,
    step: 0.05,
    unit: "m",
    group: "fireball",
    groupLabel: "Fireball",
    folded: true,
  },
  {
    key: "fbDuration",
    label: "Fireball duration",
    kind: "number",
    default: 0.58,
    min: 0.1,
    max: 2,
    step: 0.02,
    unit: "s",
    group: "fireball",
  },
  {
    key: "fbTemp",
    label: "Fireball temperature",
    kind: "number",
    default: 1.25,
    min: 0.5,
    max: 3,
    step: 0.05,
    unit: "×",
    group: "fireball",
  },
]
const spawnTime = new Set(["fbSize", "fbDuration", "fbTemp"])

/** The host's settings and its own undo stack (⌘Z in the Lab covers placements too). */
const settings: Record<string, Value> = {}
for (const d of [...descriptors, ...detailDescriptors])
  if (d.kind !== "action" && !d.bind) settings[d.key] = d.default as Value
const past: Record<string, Value>[] = []
const future: Record<string, Value>[] = []
const historyListeners = new Set<() => void>()
const notifyHistory = () => {
  for (const cb of historyListeners) cb()
}
const history = {
  undo() {
    const prev = past.pop()
    if (!prev) return
    future.push({ ...settings })
    Object.assign(settings, prev)
    refresh()
    notifyHistory()
  },
  redo() {
    const next = future.pop()
    if (!next) return
    past.push({ ...settings })
    Object.assign(settings, next)
    refresh()
    notifyHistory()
  },
  canUndo: () => past.length > 0,
  canRedo: () => future.length > 0,
  subscribe(cb: () => void) {
    historyListeners.add(cb)
    return () => historyListeners.delete(cb)
  },
}
let gesture: ReturnType<typeof setTimeout> | undefined
/** One undo entry per burst of writes (a drag, a roll). */
const write = (key: string, value: Value | null, meta: ChangeMeta) => {
  if (value === null) return
  if (meta.source === "randomize" || meta.source === "mutate") rolled()
  if (!gesture) {
    past.push({ ...settings })
    future.length = 0
    notifyHistory()
  }
  clearTimeout(gesture)
  gesture = setTimeout(() => (gesture = undefined), 300)
  settings[key] = value
  // The rows gated on this value follow it.
  details.sync({ [key]: value } as State)
}

/** Random and Mutate draw from a recorded tuning seed, so a roll can be reproduced. */
const tuning = { seed: 41 }
const seeded = () => {
  let s = tuning.seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
let draw = seeded()
const random = () => draw()
let rolling = false
/** After a roll, the next one draws from the next seed. */
const rolled = () => {
  if (rolling) return
  rolling = true
  queueMicrotask(() => {
    rolling = false
    tuning.seed++
    draw = seeded()
  })
}

const pins = new Set<string>()
const accessory = (key: string) => {
  const box = document.createElement("span")
  box.style.cssText = "display:inline-flex;align-items:center;gap:4px"
  if (spawnTime.has(key)) {
    const dot = document.createElement("span")
    dot.className = "lab-spawn"
    dot.title = "A spawn-time value: retrigger to see the change"
    box.append(dot)
  }
  const pin = document.createElement("button")
  pin.className = "lab-pin"
  pin.type = "button"
  pin.textContent = "•"
  pin.setAttribute("aria-label", `Pin ${key} to Watch`)
  pin.setAttribute("aria-pressed", String(pins.has(key)))
  pin.onclick = () => {
    if (pins.has(key)) pins.delete(key)
    else pins.add(key)
    pin.setAttribute("aria-pressed", String(pins.has(key)))
  }
  box.append(pin)
  return box
}

const common = {
  nullDefaults: false,
  echo: 0,
  random,
  history,
  tunable: (key: string) => !key.toLowerCase().includes("seed"),
  onSet: (key: string, value: Value | null, meta: ChangeMeta) => write(key, value, meta),
}
const station = createRemoteControls("lab-station", descriptors, {
  ...common,
  values: settings,
  onAction: (key) => {
    if (key === "rollPrecip")
      station.randomize(descriptors.filter((d) => d.group === "precip").map((d) => d.key))
  },
})
const details = createRemoteControls("lab-details", detailDescriptors, {
  ...common,
  values: settings,
})
const refresh = () => {
  station.sync(settings as State, { replace: true })
  details.sync(settings as State, { replace: true })
}

const gpu = new URLSearchParams(location.search).has("gpu")
const panels = [
  mountPanel(station, document.getElementById("controls")!, {
    title: false,
    header: { buttons: ["random", "reset", "undo", "redo", "help"] },
    preset: labPreset,
    theme: "dark",
    density: "compact",
    variants: false,
    haptics: false,
    session: false,
    renderer: gpu ? "gpu" : "dom",
    keys: { leave: "Escape" },
    rowAccessory: accessory,
  }),
  mountPanel(details, document.getElementById("details")!, {
    title: false,
    header: false,
    preset: labPreset,
    theme: "dark",
    density: "compact",
    variants: false,
    haptics: false,
    session: false,
    renderer: gpu ? "gpu" : "dom",
    rowAccessory: accessory,
  }),
]
Object.assign(window, {
  __lab: { station, details, panels, settings, history, past, pins, tuning, scenes },
})
