// Every control in knobs, one section each, down one scrolling page: the field kinds, the
// readouts, the panel's structure, remote descriptors, knobs/ui and the looks. Most panels drive a
// small preview beside them (examples/controls-motion.ts moves them on knobs' springs); some stand
// alone. ?gpu draws the panels with the WebGPU renderer, ?theme=light starts light. ⌘K lists the
// page's sections and controls.
import {
  action,
  angle,
  bezierPoint,
  type Bezier,
  type ChangeMeta,
  choice,
  color,
  colorHex,
  comboParts,
  type ControlDescriptor,
  type Controls,
  type ControlsOptions,
  createRemoteControls,
  curve,
  defineControls,
  easing,
  flatSpring,
  gradient,
  gradientCss,
  graph,
  keybind,
  knob,
  log,
  matchesCombo,
  meter,
  type MountPanelOptions,
  point,
  range,
  sampleCurve,
  sampleGradient,
  type Schema,
  seed,
  sparkline,
  spring,
  springMotion,
  type State,
  table,
  toggle,
  toolbar,
  type Values,
  vec2,
  vec3,
  watch,
} from "knobs"
import { mountPanel, type Panel } from "knobs/panel"
import { labPreset } from "knobs/themes"
import {
  type Command,
  commandPalette,
  commandsFrom,
  overlayLook,
  readout,
  restyle,
  toast,
  tooltips,
} from "knobs/ui"
import { type Feel, Stage, type Val } from "./controls-motion"
import { uiSections } from "./controls-ui"

const params = new URLSearchParams(location.search)
const gpu = params.has("gpu")
let theme: "dark" | "light" = document.documentElement.dataset.theme === "light" ? "light" : "dark"

// biome-ignore lint/suspicious/noExplicitAny: any store
type AnyControls = Controls<any>
type How = "init" | "hand" | "other"

// ── Page scaffolding ─────────────────────────────────────────────────────────────────────────

const main = document.getElementById("main")!
const scroller = document.getElementById("scroller")!

interface SectionInfo {
  readonly id: string
  readonly cat: string
  readonly title: string
  readonly el: HTMLElement
}
const sections: SectionInfo[] = []
const cats: { id: string; title: string; el: HTMLElement }[] = []
let currentCat = ""

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  html = "",
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag)
  if (className) el.className = className
  if (html) el.innerHTML = html
  return el
}

export function category(title: string) {
  currentCat = title
  const el = h("div", "cathead", title)
  el.id = `cat-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  main.append(el)
  cats.push({ id: el.id, title, el })
}

export interface SectionSpec {
  readonly id: string
  readonly title: string
  /** The API it shows, beside the title. */
  readonly code?: string
  readonly tag?: string
  readonly what: string
  /** Things to try, as HTML. */
  readonly tries?: readonly string[]
  /** A preview stage on the right (else the tries sit there). */
  readonly stage?: boolean
  readonly wide?: boolean
}
export function section(spec: SectionSpec) {
  const el = h("section", `demo${spec.wide ? " wide" : ""}`)
  el.id = spec.id
  const head = h("header")
  const title = h("h2")
  title.textContent = spec.title
  if (spec.code) title.append(Object.assign(h("code"), { textContent: spec.code }))
  if (spec.tag) title.append(Object.assign(h("span", "tag"), { textContent: spec.tag }))
  const what = h("p", "", spec.what)
  head.append(title, what)
  const slot = h("div", "slot")
  const side = h("div", "side")
  el.append(head, slot, side)
  let stage: HTMLElement | undefined
  if (spec.stage) {
    stage = h("div", "stage")
    side.append(stage)
  }
  if (spec.tries?.length) {
    const list = h("ul", "try")
    for (const t of spec.tries) list.append(h("li", "", t))
    side.append(list)
  }
  main.append(el)
  sections.push({ id: spec.id, cat: currentCat, title: spec.title, el })
  return { el, slot, side, stage: stage as HTMLElement }
}

// ── Stores and panels ────────────────────────────────────────────────────────────────────────

const stores: { store: AnyControls; title: string }[] = []
const panels = new Map<string, Panel>()

/** A store that's on over the tailnet too, keeps nothing, and reports who changed it. */
export function define<S extends Schema>(
  id: string,
  title: string,
  schema: S,
  options: Omit<ControlsOptions<S>, "enabled" | "storage"> = {},
) {
  const listeners: ((values: Values<S>, how: How, meta: ChangeMeta | null) => void)[] = []
  const store = defineControls(`catalog-${id}`, schema, {
    ...options,
    enabled: true,
    storage: null,
    onChange(patch, values, meta) {
      options.onChange?.(patch, values, meta)
      const how: How = meta.source === "local" ? "hand" : "other"
      const now = store.get()
      for (const f of listeners) f(now, how, meta)
    },
  })
  stores.push({ store, title })
  const on = (f: (values: Values<S>, how: How, meta: ChangeMeta | null) => void) => {
    listeners.push(f)
    f(store.get(), "init", null)
  }
  return { store, on }
}

export const panelOptions = (): MountPanelOptions => ({
  theme,
  renderer: gpu ? "gpu" : "dom",
  session: false,
  variants: false,
  haptics: false,
})

export function mount(store: AnyControls, slot: HTMLElement, options: MountPanelOptions = {}) {
  const panel = mountPanel(store, slot, { ...panelOptions(), ...options })
  if (!panels.has(store.id)) panels.set(store.id, panel)
  return panel
}

/** Moves a value: at once on first paint, following the hand, else on `feel`. */
const go = (v: Val, target: number, how: How, feel: Feel = "default", delay = 0) => {
  if (how === "init") v.snap(target)
  else v.to(target, how === "hand" ? "follow" : feel, delay)
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ── Basics ───────────────────────────────────────────────────────────────────────────────────

category("Basics")

{
  const s = section({
    id: "slider",
    title: "Sliders",
    code: "knob()",
    what: "Numbers with units, steps and a default notch. Ten steps or fewer become stops that resist, then snap.",
    stage: true,
    tries: [
      "Drag a fill; <kbd>⌥</kbd>-drag for 1/10 speed, or pan sideways with two fingers",
      "Type a number on a focused row, <kbd>Enter</kbd> to commit",
      "Count is stepped: feel it catch on each stop",
    ],
  })
  const { store, on } = define("slider", "Sliders", {
    size: knob(22, { min: 8, max: 44, step: 1, unit: "px", label: "Size" }),
    count: knob(5, { min: 1, max: 7, step: 1, label: "Count" }),
    spread: knob(40, { min: 0, max: 100, step: 1, unit: "%", label: "Spread" }),
    arc: knob(0, { min: -24, max: 24, step: 0.5, unit: "px", label: "Arc" }),
  })
  mount(store, s.slot, { title: "Dots" })
  const MAX = 7
  const dots = Array.from({ length: MAX }, () => {
    const el = h("div", "abs")
    el.style.cssText +=
      "width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--text)"
    s.stage.append(el)
    return el
  })
  s.stage.style.display = "block"
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    const w = s.stage.clientWidth / 2
    const hh = s.stage.clientHeight / 2
    for (let i = 0; i < MAX; i++) {
      const d = vals[i]!
      const o = clamp01(d.o.x)
      dots[i]!.style.transform =
        `translate(${px(w + d.x.x)},${px(hh + d.y.x)}) scale(${(d.s.x / 44).toFixed(4)})`
      dots[i]!.style.opacity = (o * 0.92).toFixed(3)
      dots[i]!.style.filter = o < 0.98 ? `blur(${((1 - o) * 4).toFixed(2)}px)` : ""
    }
  })
  const vals = dots.map(() => ({
    x: stage.val(0, 0.05),
    y: stage.val(0, 0.05),
    s: stage.val(22, 0.02),
    o: stage.val(1, 0.002, true),
  }))
  on((v, how) => {
    const gap = v.size * (1 + (v.spread / 100) * 1.4) + 4
    for (let i = 0; i < MAX; i++) {
      const shown = i < v.count
      const slot = Math.min(i, v.count - 1)
      const c = slot - (v.count - 1) / 2
      const n = v.count > 1 ? c / ((v.count - 1) / 2) : 0
      const d = vals[i]!
      // A dot leaving folds into its neighbour, smaller and soft; one arriving grows out of it.
      go(d.x, c * gap, how, "calm")
      go(d.y, -v.arc * (1 - n * n), how, "calm")
      go(d.s, shown ? v.size : v.size * 0.9, how, shown ? "calm" : "snappy")
      go(d.o, shown ? 1 : 0, how, shown ? "default" : "snappy")
    }
    caption.textContent = `${v.count} × ${v.size}px`
  })
}

{
  const s = section({
    id: "toggle",
    title: "Switches",
    code: "toggle()",
    what: "On or off. The thumb stretches toward where it's going and settles.",
    stage: true,
    tries: [
      "<kbd>←</kbd> <kbd>→</kbd> or <kbd>Space</kbd> flip a focused switch",
      "Hold <kbd>\\</kbd> to see the light as it was before your last change",
    ],
  })
  const { store, on } = define("toggle", "Switches", {
    on: toggle(true, { label: "Light" }),
    warm: toggle(true, { label: "Warm" }),
    pool: toggle(true, { label: "Floor pool" }),
  })
  mount(store, s.slot, { title: "Lamp" })
  s.stage.innerHTML = `
    <div style="position:relative;width:200px;height:170px">
      <div data-l="pool-warm" style="position:absolute;left:10px;right:10px;bottom:6px;height:44px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--warm) 55%,transparent),transparent)"></div>
      <div data-l="pool-cool" style="position:absolute;left:10px;right:10px;bottom:6px;height:44px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--cool) 50%,transparent),transparent)"></div>
      <div style="position:absolute;left:99px;top:0;width:2px;height:58px;background:var(--faint)"></div>
      <div data-l="glow-warm" style="position:absolute;left:30px;top:18px;width:140px;height:140px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--warm) 60%,transparent),transparent)"></div>
      <div data-l="glow-cool" style="position:absolute;left:30px;top:18px;width:140px;height:140px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--cool) 55%,transparent),transparent)"></div>
      <div style="position:absolute;left:84px;top:56px;width:32px;height:32px;border-radius:50%;background:var(--surface-hi);box-shadow:inset 0 0 0 1.5px var(--faint)"></div>
      <div data-l="core-warm" style="position:absolute;left:84px;top:56px;width:32px;height:32px;border-radius:50%;background:#ffe2b8;box-shadow:0 0 18px var(--warm)"></div>
      <div data-l="core-cool" style="position:absolute;left:84px;top:56px;width:32px;height:32px;border-radius:50%;background:#e4f3ff;box-shadow:0 0 18px var(--cool)"></div>
    </div>`
  const layer = (name: string) => s.stage.querySelector<HTMLElement>(`[data-l="${name}"]`)!
  const L = Object.fromEntries(
    ["pool-warm", "pool-cool", "glow-warm", "glow-cool", "core-warm", "core-cool"].map((n) => [
      n,
      layer(n),
    ]),
  )
  const stage = new Stage(s.stage, () => {
    const on = on1.x
    const w = warm.x
    const p = pool.x
    L["glow-warm"]!.style.opacity = (on * w).toFixed(3)
    L["glow-cool"]!.style.opacity = (on * (1 - w)).toFixed(3)
    L["core-warm"]!.style.opacity = (on * w).toFixed(3)
    L["core-cool"]!.style.opacity = (on * (1 - w)).toFixed(3)
    L["pool-warm"]!.style.opacity = (on * w * p).toFixed(3)
    L["pool-cool"]!.style.opacity = (on * (1 - w) * p).toFixed(3)
    const sc = 0.96 + 0.04 * on
    L["glow-warm"]!.style.transform = L["glow-cool"]!.style.transform = `scale(${sc.toFixed(4)})`
  })
  const on1 = stage.val(1, 0.002, true)
  const warm = stage.val(1, 0.002, true)
  const pool = stage.val(1, 0.002, true)
  on((v, how) => {
    // A light is the switch's result, not the hand itself: it eases on and off either way.
    const h2 = how === "init" ? "init" : "other"
    go(on1, v.on ? 1 : 0, h2, v.on ? "calm" : "default")
    go(warm, v.warm ? 1 : 0, h2, "calm")
    go(pool, v.pool ? 1 : 0, h2, "calm")
  })
}

{
  const s = section({
    id: "choice",
    title: "Choices",
    code: "choice()",
    what: "Segments while the labels fit, a menu otherwise, and a searchable menu past eight options.",
    stage: true,
    tries: [
      "<kbd>←</kbd> <kbd>→</kbd> step through any choice; pan sideways over segments to drag the pill",
      "Open Colour and type to filter its fourteen options",
      'Fill is a menu by <code>display: "menu"</code>',
    ],
  })
  const COLOURS: Record<string, string> = {
    Tomato: "#ff6347",
    Tangerine: "#ff9150",
    Saffron: "#f4c430",
    Lime: "#a4d65e",
    Mint: "#3eb489",
    Teal: "#2a9d8f",
    Sky: "#7cc4ff",
    Azure: "#3a8dff",
    Indigo: "#5b5bd6",
    Violet: "#8f5cf7",
    Orchid: "#d36fd8",
    Rose: "#f2668b",
    Slate: "#708090",
    Graphite: "#4a4d55",
  }
  const names = Object.keys(COLOURS) as [string, ...string[]]
  const FILLS = ["solid", "stripes", "dots", "rings", "grid"] as const
  const { store, on } = define("choice", "Choices", {
    shape: choice("circle", ["circle", "square", "diamond"], { label: "Shape" }),
    fill: choice("stripes", FILLS, { label: "Fill", display: "menu" }),
    colour: choice("Azure", names, { label: "Colour" }),
  })
  mount(store, s.slot, { title: "Tile" })
  const TEX: Record<string, string> = {
    solid: "none",
    stripes: "repeating-linear-gradient(45deg,rgba(255,255,255,.26) 0 6px,transparent 6px 13px)",
    dots: "radial-gradient(rgba(255,255,255,.4) 2.2px,transparent 2.8px) 0 0/13px 13px",
    rings:
      "repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.24) 0 3px,transparent 3px 10px)",
    grid: "linear-gradient(rgba(255,255,255,.24) 1px,transparent 1px) 0 0/14px 14px,linear-gradient(90deg,rgba(255,255,255,.24) 1px,transparent 1px) 0 0/14px 14px",
  }
  const SHAPES = {
    circle: { radius: "50%", rot: 0, scale: 1 },
    square: { radius: "24%", rot: 0, scale: 0.94 },
    diamond: { radius: "16%", rot: 45, scale: 0.76 },
  } as const
  const wrap = h("div")
  wrap.style.cssText = "position:relative;width:112px;height:112px"
  s.stage.append(wrap)
  const shapes = (Object.keys(SHAPES) as (keyof typeof SHAPES)[]).map((k) => {
    const el = h("div")
    el.style.cssText = `position:absolute;inset:0;border-radius:${SHAPES[k].radius};overflow:hidden;transition:background-color .3s cubic-bezier(.2,.8,.2,1);box-shadow:inset 0 1px 0 rgba(255,255,255,.18)`
    const tex = FILLS.map((f) => {
      const t = h("div")
      t.style.cssText = `position:absolute;inset:-20%;background:${TEX[f]}`
      el.append(t)
      return t
    })
    wrap.append(el)
    return { key: k, el, tex }
  })
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    for (let i = 0; i < shapes.length; i++) {
      const sh = shapes[i]!
      const o = clamp01(shapeVals[i]!.x)
      const base = SHAPES[sh.key]
      sh.el.style.opacity = o.toFixed(3)
      sh.el.style.transform = `rotate(${base.rot}deg) scale(${(base.scale * (0.94 + 0.06 * o)).toFixed(4)})`
      for (let j = 0; j < FILLS.length; j++)
        sh.tex[j]!.style.opacity = clamp01(fillVals[j]!.x).toFixed(3)
    }
  })
  const shapeVals = shapes.map(() => stage.val(0, 0.002, true))
  const fillVals = FILLS.map(() => stage.val(0, 0.002, true))
  on((v, how) => {
    const h2 = how === "init" ? "init" : "other"
    shapes.forEach((sh, i) => {
      go(shapeVals[i]!, sh.key === v.shape ? 1 : 0, h2, sh.key === v.shape ? "default" : "snappy")
    })
    FILLS.forEach((f, j) => {
      go(fillVals[j]!, f === v.fill ? 1 : 0, h2, "default")
    })
    for (const sh of shapes) sh.el.style.backgroundColor = COLOURS[v.colour] ?? "#888"
    caption.textContent = `${v.colour} · ${v.fill} · ${v.shape}`
  })
}

{
  const s = section({
    id: "actions",
    title: "Action rows",
    code: "action()",
    what: "Buttons as rows. Each tile keeps its identity as it travels.",
    stage: true,
    tries: [
      "Shuffle twice quickly: tiles turn mid-flight without snapping",
      "<kbd>Enter</kbd> or <kbd>Space</kbd> presses a focused action",
    ],
  })
  let order = Array.from({ length: 9 }, (_, i) => i)
  let pulse = () => {}
  let place = (_how: How) => {}
  const { store } = define("actions", "Actions", {
    shuffle: action("Shuffle", {
      run: () => {
        const next = [...order]
        do {
          for (let i = next.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[next[i], next[j]] = [next[j]!, next[i]!]
          }
        } while (next.every((x, i) => x === order[i]))
        order = next
        place("other")
      },
    }),
    sort: action("Sort", {
      run: () => {
        order = order.map((_, i) => i)
        place("other")
      },
    }),
    pulse: action("Pulse", { run: () => pulse() }),
  })
  mount(store, s.slot, { title: "Tiles", header: { title: true, buttons: [] } })
  s.stage.style.display = "block"
  const TILE = 38
  const GAP = 8
  const tiles = order.map((i) => {
    const el = h("div", "abs")
    el.style.cssText += `width:${TILE}px;height:${TILE}px;border-radius:10px;display:grid;place-items:center;font:600 13px var(--sans);color:var(--text);background:color-mix(in srgb,var(--text) ${6 + i * 2.2}%,transparent)`
    el.textContent = String(i + 1)
    s.stage.append(el)
    return el
  })
  const stage = new Stage(s.stage, () => {
    const ox = s.stage.clientWidth / 2 - (TILE * 3 + GAP * 2) / 2
    const oy = s.stage.clientHeight / 2 - (TILE * 3 + GAP * 2) / 2
    tiles.forEach((el, i) => {
      const t = tv[i]!
      el.style.transform = `translate(${px(ox + t.x.x)},${px(oy + t.y.x)}) scale(${t.s.x.toFixed(4)})`
    })
  })
  const tv = tiles.map(() => ({
    x: stage.val(0, 0.05),
    y: stage.val(0, 0.05),
    s: stage.val(1, 0.001),
  }))
  place = (how) => {
    order.forEach((tile, slot) => {
      const t = tv[tile]!
      go(t.x, (slot % 3) * (TILE + GAP), how, "calm", slot * 14)
      go(t.y, Math.floor(slot / 3) * (TILE + GAP), how, "calm", slot * 14)
    })
  }
  pulse = () => {
    order.forEach((tile, slot) => {
      const d = (slot % 3) + Math.floor(slot / 3)
      setTimeout(() => tv[tile]!.s.to(1, "playful").push(2.4), d * 45)
    })
  }
  place("init")
}

// ── Colour and motion ────────────────────────────────────────────────────────────────────────

category("Colour & motion")

{
  const s = section({
    id: "color",
    title: "Colour",
    code: "color()",
    what: "OKLCH, kept inside sRGB, stored as a string that drops straight into CSS. The strips paint their real gradients.",
    stage: true,
    tries: [
      "<kbd>Enter</kbd> opens the editor; <kbd>↓</kbd> walks into hue, chroma and lightness",
      "<kbd>←</kbd> <kbd>→</kbd> on a closed row turn the hue",
    ],
  })
  const { store, on } = define("color", "Colour", {
    tint: color("#ff7a45", { label: "Tint" }),
    glow: color("#ffb35c", { label: "Glow" }),
  })
  mount(store, s.slot, { title: "Sphere" })
  s.stage.innerHTML = `
    <div style="position:relative;width:150px;height:150px">
      <div data-glow style="position:absolute;inset:-30px;border-radius:50%;opacity:.55;transition:background-color .3s cubic-bezier(.2,.8,.2,1);-webkit-mask:radial-gradient(closest-side,#000,transparent);mask:radial-gradient(closest-side,#000,transparent)"></div>
      <div data-ball style="position:absolute;inset:25px;border-radius:50%;transition:background-color .3s cubic-bezier(.2,.8,.2,1);box-shadow:inset -10px -14px 28px rgba(0,0,0,.35),inset 8px 10px 18px rgba(255,255,255,.28)"></div>
    </div>`
  const ball = s.stage.querySelector<HTMLElement>("[data-ball]")!
  const glow = s.stage.querySelector<HTMLElement>("[data-glow]")!
  const caption = h("div", "caption")
  s.stage.append(caption)
  on((v) => {
    ball.style.backgroundColor = v.tint
    glow.style.backgroundColor = v.glow
    caption.textContent = `${colorHex(v.tint)} · ${colorHex(v.glow)}`
  })
}

{
  const s = section({
    id: "point",
    title: "Point",
    code: "point()",
    what: "A 2D pad. The ring marks the default; y grows downward, as in CSS.",
    stage: true,
    tries: [
      "Open the pad and drag the puck; <kbd>⌥</kbd> drags at 1/10 speed",
      "Arrows move it from the keyboard, <kbd>⇧</kbd> by ten",
    ],
  })
  const { store, on } = define("point", "Point", {
    at: point({ x: 0.3, y: 0.62 }, { min: 0, max: 1, step: 0.01, label: "Position" }),
    size: knob(14, { min: 6, max: 28, step: 1, unit: "px", label: "Dot" }),
  })
  mount(store, s.slot, { title: "Dot" })
  const B = 150
  const box = h("div")
  box.style.cssText = `position:relative;width:${B}px;height:${B}px;border-radius:12px;background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/${B / 4}px ${B / 4}px,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/${B / 4}px ${B / 4}px;box-shadow:inset 0 0 0 1px var(--line)`
  const trail = h("div", "abs")
  trail.style.cssText +=
    "width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--faint)"
  const dot = h("div", "abs")
  dot.style.cssText +=
    "width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:var(--text)"
  box.append(trail, dot)
  s.stage.append(box)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    dot.style.transform = `translate(${px(x.x * B)},${px(y.x * B)}) scale(${(size.x / 28).toFixed(4)})`
    trail.style.transform = `translate(${px(tx.x * B)},${px(ty.x * B)})`
  })
  const x = stage.val(0, 0.0005)
  const y = stage.val(0, 0.0005)
  const tx = stage.val(0, 0.0005)
  const ty = stage.val(0, 0.0005)
  const size = stage.val(14, 0.02)
  on((v, how) => {
    go(x, v.at.x, how)
    go(y, v.at.y, how)
    // The ring trails on the panel's softer spring, so the dot leads and it follows.
    if (how === "init") {
      tx.snap(v.at.x)
      ty.snap(v.at.y)
    } else {
      tx.to(v.at.x, { omega: 18, zeta: 1 })
      ty.to(v.at.y, { omega: 18, zeta: 1 })
    }
    go(size, v.size, how)
    caption.textContent = `x ${v.at.x.toFixed(2)} · y ${v.at.y.toFixed(2)}`
  })
}

/** y at x along a cubic bezier (x is monotonic within 0–1). */
function bezierY(b: Bezier, x: number) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (bezierPoint(b, mid)[0] < x) lo = mid
    else hi = mid
  }
  return bezierPoint(b, (lo + hi) / 2)[1]
}

{
  const s = section({
    id: "easing",
    title: "Easing",
    code: "easing()",
    what: "A cubic bezier with named curves. The ball runs it after every change; click the stage to run it again.",
    stage: true,
    tries: [
      "<kbd>←</kbd> <kbd>→</kbd> cycle the named curves",
      "Open it and drag a handle past the top: Back overshoots",
    ],
  })
  const { store, on } = define("easing", "Easing", {
    curve: easing("ease-in-out", { label: "Curve" }),
    time: knob(0.9, { min: 0.2, max: 2, step: 0.05, unit: "s", label: "Duration" }),
  })
  mount(store, s.slot, { title: "Ball" })
  s.stage.dataset.replay = ""
  const G = 108
  s.stage.innerHTML = `
    <div style="display:flex;align-items:center;gap:28px">
      <svg width="${G + 16}" height="${G + 60}" viewBox="-8 -30 ${G + 16} ${G + 60}" style="overflow:visible">
        <rect x="0" y="0" width="${G}" height="${G}" rx="6" style="fill:none;stroke:var(--line)"/>
        <path data-curve stroke-width="2" stroke-linecap="round" style="fill:none;stroke:var(--text)"/>
        <circle data-gdot r="4.5" style="fill:var(--text)"/>
      </svg>
      <div style="position:relative;width:180px;height:44px">
        <div style="position:absolute;left:0;right:0;top:21px;height:2px;border-radius:1px;background:var(--line)"></div>
        <div data-ball class="abs" style="width:28px;height:28px;top:8px;border-radius:50%;background:var(--text)"></div>
      </div>
    </div>`
  const path = s.stage.querySelector<SVGPathElement>("[data-curve]")!
  const gdot = s.stage.querySelector<SVGCircleElement>("[data-gdot]")!
  const ball = s.stage.querySelector<HTMLElement>("[data-ball]")!
  let b: Bezier = [0.42, 0, 0.58, 1]
  let duration = 0.9
  let t = 1
  let from = 0
  let to = 1
  const paint = () => {
    const y = bezierY(b, t)
    gdot.setAttribute("cx", (t * G).toFixed(2))
    gdot.setAttribute("cy", ((1 - y) * G).toFixed(2))
    ball.style.transform = `translateX(${px(lerp(from, to, y) * 152)})`
  }
  const stage = new Stage(s.stage, paint)
  const play = () => {
    // Runs from where the last run ended, so it never jumps back to the start.
    if (t >= 1) {
      from = to
      to = 1 - to
    }
    t = 0
    stage.loop((dt) => {
      t = Math.min(1, t + dt / duration)
      return t < 1
    })
  }
  s.stage.addEventListener("click", play)
  on((v, how) => {
    b = v.curve
    duration = v.time
    path.setAttribute(
      "d",
      `M0 ${G} C${b[0] * G} ${(1 - b[1]) * G} ${b[2] * G} ${(1 - b[3]) * G} ${G} 0`,
    )
    if (how === "init") stage.paint()
    else play()
  })
}

{
  const s = section({
    id: "spring",
    title: "Spring",
    code: "spring() · flatSpring()",
    what: "SwiftUI's duration and bounce beside the live step response. The top card moves on Spring, one { duration, bounce } value; the lower one on Settle, a flat spring of two plain number keys drawn as one card.",
    stage: true,
    tries: [
      "Set bounce to 0.5 and let go of the slider: the cards replay",
      "Click the stage to send them back",
    ],
  })
  let replay = () => {}
  const settle = flatSpring({ duration: 0.3, bounce: 0 }, { label: "Settle" })
  const { store, on } = define(
    "spring",
    "Spring",
    {
      motion: spring({ duration: 0.5, bounce: 0.3 }, { label: "Spring" }),
      settleDuration: settle.duration,
      settleBounce: settle.bounce,
      travel: knob(150, { min: 60, max: 220, step: 1, unit: "px", label: "Travel" }),
    },
    { onGesture: ({ phase }) => phase === "end" && replay() },
  )
  mount(store, s.slot, { title: "Cards" })
  s.stage.dataset.replay = ""
  s.stage.style.display = "block"
  const box = (css: string) => {
    const el = h("div", "abs")
    el.style.cssText += `width:44px;height:56px;margin:-28px 0 0 -22px;border-radius:10px;${css}`
    s.stage.append(el)
    return el
  }
  const ghost = "box-shadow:inset 0 0 0 1.5px var(--line)"
  const ends = [box(ghost), box(ghost), box(ghost), box(ghost)]
  const cards = [
    box("background:var(--text);box-shadow:0 6px 18px rgba(0,0,0,.25)"),
    box("background:color-mix(in srgb,var(--text) 55%,transparent)"),
  ]
  const caption = h("div", "caption")
  s.stage.append(caption)
  let travel = 150
  const stage = new Stage(s.stage, () => {
    const cx = s.stage.clientWidth / 2
    const cy = s.stage.clientHeight / 2
    ;[cy - 36, cy + 36].forEach((y, row) => {
      ends[row * 2]!.style.transform = `translate(${px(cx - travel / 2)},${px(y)})`
      ends[row * 2 + 1]!.style.transform = `translate(${px(cx + travel / 2)},${px(y)})`
      cards[row]!.style.transform = `translate(${px(cx + (pos[row]!.x - 0.5) * travel)},${px(y)})`
    })
  })
  const pos = [stage.val(0, 0.0004), stage.val(0, 0.0004)]
  let side = 0
  replay = () => {
    const v = store.get()
    side = 1 - side
    pos[0]!.to(side, springMotion(v.motion))
    pos[1]!.to(side, springMotion({ duration: v.settleDuration, bounce: v.settleBounce }))
  }
  s.stage.addEventListener("click", () => replay())
  on((v, how, meta) => {
    travel = v.travel
    caption.textContent = `${v.motion.duration.toFixed(2)}s · ${v.motion.bounce.toFixed(2)}  /  ${v.settleDuration.toFixed(2)}s · ${v.settleBounce.toFixed(2)}`
    stage.paint()
    // Presets, Random, Reset and undo land at once; drags and keys wait for the gesture's end.
    if (how === "other" && meta?.source !== "compare") replay()
  })
}

// ── Inspector fields ─────────────────────────────────────────────────────────────────────────

category("Inspector")

{
  const s = section({
    id: "vectors",
    title: "Vectors",
    code: "vec2() · vec3()",
    what: "Inline number cells, each a stop to scrub or type. Scale is linked: change one axis and the others follow.",
    stage: true,
    tries: [
      "Drag a cell sideways to scrub; <kbd>Enter</kbd> or a digit types",
      "Unlink scale with its chain button and stretch one axis",
    ],
  })
  const { store, on } = define("vectors", "Vectors", {
    position: vec2({ x: 0, y: 0 }, { min: -1, max: 1, step: 0.01, label: "Position" }),
    scale: vec3(
      { x: 1, y: 1, z: 1 },
      { min: 0.3, max: 1.8, step: 0.01, link: true, linked: true, label: "Scale" },
    ),
    spin: knob(-32, { min: -90, max: 90, step: 1, unit: "°", label: "Spin" }),
  })
  mount(store, s.slot, { title: "Box" })
  const S = 54
  const face = (t: string, shade: number) =>
    `<div style="position:absolute;inset:0;transform:${t};background:color-mix(in srgb,var(--text) ${shade}%,var(--page));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 18%,transparent);border-radius:4px"></div>`
  s.stage.style.perspective = "700px"
  s.stage.innerHTML = `<div data-cube style="position:relative;width:${S}px;height:${S}px;transform-style:preserve-3d">
    ${face(`translateZ(${S / 2}px)`, 62)}${face(`rotateY(180deg) translateZ(${S / 2}px)`, 40)}
    ${face(`rotateY(90deg) translateZ(${S / 2}px)`, 44)}${face(`rotateY(-90deg) translateZ(${S / 2}px)`, 50)}
    ${face(`rotateX(90deg) translateZ(${S / 2}px)`, 80)}${face(`rotateX(-90deg) translateZ(${S / 2}px)`, 30)}
  </div>`
  const cube = s.stage.querySelector<HTMLElement>("[data-cube]")!
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    cube.style.transform = `translate(${px(x.x * 90)},${px(y.x * 52)}) rotateX(-24deg) rotateY(${spin.x.toFixed(2)}deg) scale3d(${sx.x.toFixed(4)},${sy.x.toFixed(4)},${sz.x.toFixed(4)})`
  })
  const [x, y, sx, sy, sz, spin] = [0, 0, 1, 1, 1, -32].map((n) => stage.val(n, 0.0005))
  on((v, how) => {
    go(x!, v.position.x, how)
    go(y!, v.position.y, how)
    go(sx!, v.scale.x, how)
    go(sy!, v.scale.y, how)
    go(sz!, v.scale.z, how)
    go(spin!, v.spin, how)
    caption.textContent = `${v.position.x.toFixed(2)}, ${v.position.y.toFixed(2)} · ×${v.scale.x.toFixed(2)} ${v.scale.y.toFixed(2)} ${v.scale.z.toFixed(2)}`
  })
}

{
  const s = section({
    id: "range",
    title: "Range",
    code: "range()",
    what: "One slider, two thumbs that can't cross. Press inside the band to move it whole.",
    stage: true,
    tries: [
      "Press well inside the band and drag: both ends travel",
      "Focus a thumb, then <kbd>←</kbd> <kbd>→</kbd>; <kbd>Tab</kbd> reaches the other",
    ],
  })
  const { store, on } = define("range", "Range", {
    band: range([30, 68], { min: 0, max: 100, step: 1, unit: "%", label: "Band" }),
  })
  mount(store, s.slot, { title: "Waveform" })
  const N = 36
  const W = 252
  const wrap = h("div")
  wrap.style.cssText = `position:relative;width:${W}px;height:96px`
  const band = h("div", "abs")
  band.style.cssText += `width:${W}px;height:96px;border-radius:8px;background:var(--surface-hi);transform-origin:0 0`
  wrap.append(band)
  const bars = Array.from({ length: N }, (_, i) => {
    const el = h("div")
    const hgt = 14 + Math.abs(Math.sin(i * 0.9) * 34 + Math.sin(i * 0.31) * 26)
    el.style.cssText = `position:absolute;bottom:${48 - hgt / 2}px;left:${(i + 0.5) * (W / N) - 1.5}px;width:3px;height:${hgt}px;border-radius:2px;background:var(--text)`
    wrap.append(el)
    return el
  })
  s.stage.append(wrap)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    const l = lo.x / 100
    const r = hi.x / 100
    band.style.transform = `translateX(${px(l * W)}) scaleX(${Math.max(0.001, r - l).toFixed(4)})`
    bars.forEach((el, i) => {
      const at = (i + 0.5) / N
      const inside = clamp01(Math.min(at - l, r - at) * N + 0.5)
      el.style.opacity = (0.22 + 0.7 * inside).toFixed(3)
    })
  })
  const lo = stage.val(30, 0.02)
  const hi = stage.val(68, 0.02)
  on((v, how) => {
    go(lo, v.band[0], how)
    go(hi, v.band[1], how)
    caption.textContent = `${v.band[0]}–${v.band[1]}%`
  })
}

{
  const s = section({
    id: "angle",
    title: "Angle",
    code: "angle()",
    what: "Degrees on a small dial, 0° up and clockwise; a full turn wraps 359° on to 0°.",
    stage: true,
    tries: [
      "Drag the hand round; <kbd>⇧</kbd> snaps to 15°",
      "Hold <kbd>→</kbd> past 359°: the arrow carries on the short way",
    ],
  })
  const { store, on } = define("angle", "Angle", {
    heading: angle(45, { label: "Heading" }),
  })
  mount(store, s.slot, { title: "Compass" })
  const D = 132
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const major = i % 6 === 0
    return `<div style="position:absolute;left:${D / 2 - 1}px;top:4px;width:2px;height:${major ? 9 : 5}px;border-radius:1px;background:${major ? "var(--label)" : "var(--faint)"};transform-origin:1px ${D / 2 - 4}px;transform:rotate(${i * 15}deg)"></div>`
  }).join("")
  s.stage.innerHTML = `<div style="position:relative;width:${D}px;height:${D}px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line)">${ticks}
    <svg data-arrow width="${D}" height="${D}" viewBox="0 0 ${D} ${D}" style="position:absolute;inset:0">
      <path d="M${D / 2} 22 L${D / 2 + 9} ${D / 2 + 4} L${D / 2} ${D / 2 - 4} L${D / 2 - 9} ${D / 2 + 4} Z" style="fill:var(--text)"/>
      <circle cx="${D / 2}" cy="${D / 2}" r="3" style="fill:var(--text)"/>
    </svg></div>`
  const arrow = s.stage.querySelector<SVGElement>("[data-arrow]")!
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    arrow.style.transform = `rotate(${a.x.toFixed(3)}deg)`
  })
  const a = stage.val(45, 0.01)
  on((v, how) => {
    // The shortest way round from wherever the arrow is heading.
    const delta = ((((v.heading - a.target) % 360) + 540) % 360) - 180
    go(a, a.target + delta, how)
    caption.textContent = `${Math.round(v.heading)}°`
  })
}

/** mulberry32: a small seeded random. */
const seeded = (n: number) => {
  let s = n >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

{
  const s = section({
    id: "seed",
    title: "Seed",
    code: "seed()",
    what: "A whole number with a die. Random and Mutate leave seeds alone; the die rolls a new one.",
    stage: true,
    tries: [
      "Click the die, or focus the row and press <kbd>Space</kbd>",
      "<kbd>←</kbd> <kbd>→</kbd> step to neighbouring seeds",
    ],
  })
  const { store, on } = define("seed", "Seed", {
    pattern: seed(1234, { label: "Seed" }),
    weight: knob(2, { min: 1, max: 4, step: 0.5, unit: "px", label: "Line" }),
  })
  mount(store, s.slot, { title: "Truchet" })
  const C = 7
  const R = 5
  const T = 26
  const grid = h("div")
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${C},${T}px);grid-auto-rows:${T}px`
  const tiles = Array.from({ length: C * R }, () => {
    const el = h("div")
    el.innerHTML = `<svg width="${T}" height="${T}" viewBox="0 0 ${T} ${T}" style="display:block;overflow:visible"><path d="M0 ${T / 2} A${T / 2} ${T / 2} 0 0 0 ${T / 2} 0 M${T} ${T / 2} A${T / 2} ${T / 2} 0 0 0 ${T / 2} ${T}" stroke-width="2" stroke-linecap="round" style="fill:none;stroke:var(--text)"/></svg>`
    grid.append(el)
    return el
  })
  const paths = tiles.map((el) => el.querySelector("path")!)
  s.stage.append(grid)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const stage = new Stage(s.stage, () => {
    tiles.forEach((el, i) => {
      el.style.transform = `rotate(${rot[i]!.x.toFixed(2)}deg)`
    })
  })
  const rot = tiles.map(() => stage.val(0, 0.05))
  on((v, how) => {
    const rnd = seeded(v.pattern)
    tiles.forEach((_, i) => {
      const want = rnd() < 0.5 ? 0 : 90
      const cur = rot[i]!.target
      // Turn the short way to the new orientation (half turns look the same).
      const delta = ((((want - cur) % 180) + 270) % 180) - 90
      const d = (i % C) + Math.floor(i / C)
      go(rot[i]!, cur + delta, how === "init" ? "init" : "other", "calm", d * 22)
    })
    for (const p of paths) p.setAttribute("stroke-width", String(v.weight))
    caption.textContent = `seed ${v.pattern}`
  })
}

{
  const s = section({
    id: "keybind",
    title: "Key combination",
    code: "keybind()",
    what: "Captures a combination as key caps. Press it anywhere on this page and the caps answer.",
    stage: true,
    tries: [
      "Focus the row and press <kbd>Enter</kbd>, then the new combination; <kbd>Esc</kbd> cancels, <kbd>⌫</kbd> clears",
      "Click outside the panel and press it",
    ],
  })
  const { store, on } = define("keybind", "Key combination", {
    fire: keybind("Shift+K", { label: "Ping" }),
  })
  mount(store, s.slot, { title: "Shortcut" })
  const caps = h("div")
  caps.style.cssText = "display:flex;gap:8px;align-items:center"
  const ring = h("div", "abs")
  ring.style.cssText =
    "position:absolute;left:50%;top:50%;width:160px;height:160px;margin:-80px 0 0 -80px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--text);opacity:0;pointer-events:none"
  s.stage.append(ring, caps)
  const caption = h("div", "caption")
  s.stage.append(caption)
  let count = 0
  let capEls: HTMLElement[] = []
  const stage = new Stage(s.stage, () => {
    const p = press.x
    for (const c of capEls) {
      c.style.transform = `translateY(${px(p * 3)}) scale(${(1 - p * 0.04).toFixed(4)})`
    }
    caps.style.opacity = clamp01(enter.x).toFixed(3)
    ring.style.opacity = (clamp01(1 - wave.x) * 0.5 * Math.min(1, wave.x * 6)).toFixed(3)
    ring.style.transform = `scale(${(0.5 + wave.x * 0.7).toFixed(4)})`
  })
  const press = stage.val(0, 0.002)
  const enter = stage.val(1, 0.002, true)
  const wave = stage.val(1, 0.002)
  on((v, how) => {
    caps.replaceChildren(
      ...(comboParts(v.fire).length ? comboParts(v.fire) : ["—"]).map((p) => {
        const k = h("div")
        k.textContent = p
        k.style.cssText =
          "min-width:44px;height:44px;padding:0 12px;display:grid;place-items:center;border-radius:10px;background:var(--surface-hi);box-shadow:inset 0 -2px 0 var(--line),0 1px 0 var(--line);font:500 17px var(--sans);color:var(--text)"
        return k
      }),
    )
    capEls = [...caps.children] as HTMLElement[]
    if (how !== "init") {
      enter.snap(0.4)
      enter.to(1, "default")
    }
    stage.paint()
    caption.textContent = count ? `pressed ${count}×` : "not pressed yet"
  })
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.repeat) return
    const t = e.target as HTMLElement | null
    if (t?.closest("input,textarea,[contenteditable]")) return
    if (!matchesCombo(store.get().fire, e)) return
    e.preventDefault()
    count++
    caption.textContent = `pressed ${count}×`
    press.snap(1).to(0, "playful")
    wave.snap(0).to(1, { omega: (2 * Math.PI) / 0.85, zeta: 1 })
  })
}

{
  const s = section({
    id: "toolbar",
    title: "Toolbar",
    code: "toolbar()",
    what: "A row of buttons with shortcut chips. Panel shortcuts work while it has focus; a global one works anywhere.",
    stage: true,
    tries: [
      "Focus the panel and press <kbd>Space</kbd> to play or pause",
      "<kbd>P</kbd> pulses from anywhere on the page (it's global)",
      "Reverse's <kbd>V</kbd> works while the panel has focus",
    ],
  })
  let playing = false
  let dir = 1
  let stage!: Stage
  let pulseVal!: Val
  let phase = 0
  let stopLoop: (() => void) | null = null
  const togglePlay = () => {
    playing = !playing
    if (playing)
      stopLoop = stage.loop((dt) => {
        phase += dt * dir * speed
        return playing
      })
    else stopLoop?.()
    status.textContent = playing ? "playing" : "paused"
  }
  let speed = 1.4
  const { store, on } = define("toolbar", "Toolbar", {
    tools: toolbar(
      [
        { id: "play", label: "Play", icon: "play", shortcut: "Space", run: () => togglePlay() },
        {
          id: "pulse",
          label: "Pulse",
          icon: "sparkle",
          shortcut: "P",
          global: true,
          run: () => pulseVal.snap(1).to(0, "calm"),
        },
        {
          id: "reverse",
          label: "Reverse",
          icon: "retrigger",
          shortcut: "V",
          run: () => (dir = -dir),
        },
        { id: "record", label: "Record", icon: "camera", disabled: true },
      ],
      { label: "Orbit" },
    ),
    speed: knob(1.4, { min: 0.2, max: 4, step: 0.1, unit: "×", label: "Speed" }),
  })
  mount(store, s.slot, { title: "Orbit" })
  s.stage.innerHTML = `<div style="position:relative;width:130px;height:130px">
    <div data-ring style="position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--line)"></div>
    <div style="position:absolute;left:55px;top:55px;width:20px;height:20px;border-radius:50%;background:var(--surface-hi)"></div>
    <div data-sat class="abs" style="width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:var(--text)"></div>
  </div>`
  const sat = s.stage.querySelector<HTMLElement>("[data-sat]")!
  const ringEl = s.stage.querySelector<HTMLElement>("[data-ring]")!
  const status = h("div", "caption")
  status.textContent = "paused"
  s.stage.append(status)
  stage = new Stage(s.stage, () => {
    const a = phase * Math.PI * 2 * 0.25 - Math.PI / 2
    sat.style.transform = `translate(${px(65 + Math.cos(a) * 65)},${px(65 + Math.sin(a) * 65)}) scale(${(1 + pulseVal.x * 0.5).toFixed(4)})`
    ringEl.style.transform = `scale(${(1 + pulseVal.x * 0.06).toFixed(4)})`
  })
  pulseVal = stage.val(0, 0.002)
  on((v) => {
    speed = v.speed
    stage.paint()
  })
}

// ── Ramps ────────────────────────────────────────────────────────────────────────────────────

category("Gradients & curves")

const sky = (stops: [number, string][]) => stops.map(([at, c]) => ({ at, color: c }))
const SKIES = {
  Clear: sky([
    [0, "#0b1026"],
    [0.22, "#2b2d5c"],
    [0.27, "#f4a261"],
    [0.36, "#8ec5ff"],
    [0.5, "#6fb3ff"],
    [0.7, "#7fb8f0"],
    [0.77, "#ff7b54"],
    [0.84, "#3a2d5e"],
    [1, "#0b1026"],
  ]),
  Overcast: sky([
    [0, "#14161c"],
    [0.25, "#4a4f5a"],
    [0.5, "#9aa3ad"],
    [0.75, "#5d5a63"],
    [1, "#14161c"],
  ]),
  Alien: sky([
    [0, "#12051f"],
    [0.3, "#4b1d6b"],
    [0.5, "#2fbf9f"],
    [0.75, "#d9467a"],
    [1, "#12051f"],
  ]),
}

{
  const s = section({
    id: "gradient",
    title: "Gradient",
    code: "gradient()",
    what: "A colour ramp of draggable stops, blended in OKLab. The bar is the whole day; the hour samples it.",
    stage: true,
    tries: [
      "Pick a preset chip: the bar shifts colour on the panel's spring",
      "Open it, click the strip to add a stop, pull a pin off to remove it",
    ],
  })
  const { store, on } = define("gradient", "Gradient", {
    sky: gradient(SKIES.Clear, { label: "Sky by hour", presets: SKIES }),
    hour: knob(18.5, { min: 0, max: 24, step: 0.25, unit: "h", label: "Hour" }),
  })
  mount(store, s.slot, { title: "Sky" })
  s.stage.style.display = "block"
  s.stage.innerHTML = `
    <div data-scene style="position:absolute;inset:0"></div>
    <div data-sun class="abs" style="width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff6dc;box-shadow:0 0 24px rgba(255,236,190,.8)"></div>
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:38px;width:100%;height:70px">
      <path d="M0 80 C60 40 110 50 170 72 C230 94 290 40 400 58 L400 120 L0 120Z" fill="rgba(0,0,0,.32)"/>
      <path d="M0 100 C80 74 160 90 230 100 C300 110 350 86 400 92 L400 120 L0 120Z" fill="rgba(0,0,0,.45)"/>
    </svg>
    <div style="position:absolute;left:0;right:0;bottom:0;height:38px;background:rgba(0,0,0,.45)"></div>
    <div data-bar style="position:absolute;left:12px;right:12px;bottom:12px;height:14px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)"></div>
    <div data-mark class="abs" style="width:2px;height:20px;bottom:9px;top:auto;border-radius:1px;background:#fff"></div>`
  const scene = s.stage.querySelector<HTMLElement>("[data-scene]")!
  const bar = s.stage.querySelector<HTMLElement>("[data-bar]")!
  const mark = s.stage.querySelector<HTMLElement>("[data-mark]")!
  const sun = s.stage.querySelector<HTMLElement>("[data-sun]")!
  let stops = SKIES.Clear as readonly { at: number; color: string }[]
  const stage = new Stage(s.stage, () => {
    const t = hour.x / 24
    scene.style.background = sampleGradient(stops, t)
    const w = s.stage.clientWidth
    mark.style.transform = `translateX(${px(12 + t * (w - 24) - 1)})`
    // The sun rides an arc from 6h to 18h, under the hills outside it.
    const day = (hour.x - 6) / 12
    const a = Math.PI * clamp01(day)
    const hh = s.stage.clientHeight
    const up = day < 0 || day > 1 ? -0.25 : Math.sin(a)
    sun.style.transform = `translate(${px(lerp(30, w - 30, clamp01(day)))},${px(hh - 70 - up * (hh - 110))})`
    sun.style.opacity = clamp01(up * 4 + 0.6).toFixed(3)
  })
  const hour = stage.val(18.5, 0.005)
  on((v, how) => {
    stops = v.sky
    bar.style.background = gradientCss(v.sky, { direction: "to right" })
    go(hour, v.hour, how, "calm")
    stage.paint()
  })
}

{
  const s = section({
    id: "curve",
    title: "Curve",
    code: "curve()",
    what: "A 1D curve of draggable points. Here it's how a lamp's light falls off with distance.",
    stage: true,
    tries: [
      "Try the shape chips: Bell makes a ring of light",
      "Open it, double-click empty space to add a point, drag one out to remove it",
    ],
  })
  const { store, on } = define("curve", "Curve", {
    falloff: curve("inverse²", { label: "Falloff" }),
    radius: knob(110, { min: 40, max: 180, step: 1, unit: "px", label: "Radius" }),
    warmth: color("#ffcf8a", { label: "Light" }),
  })
  mount(store, s.slot, { title: "Lamp" })
  s.stage.style.display = "block"
  const canvas = h("canvas")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%"
  s.stage.append(canvas)
  const draw = () => {
    const v = store.get()
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = s.stage.clientWidth
    const hh = s.stage.clientHeight
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr)
    if (canvas.height !== Math.round(hh * dpr)) canvas.height = Math.round(hh * dpr)
    const ctx = canvas.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, hh)
    const cx = w / 2
    const cy = hh * 0.55
    const hex = colorHex(v.warmth)
    const rgb = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, v.radius)
    for (let i = 0; i <= 32; i++) {
      const x = i / 32
      const a = clamp01(sampleCurve(v.falloff, x, { interp: store.schema.falloff.interp }))
      g.addColorStop(x, `rgba(${rgb.join(",")},${(a * 0.85).toFixed(3)})`)
    }
    ctx.save()
    ctx.translate(0, cy)
    ctx.scale(1, 0.42)
    ctx.translate(0, -cy)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, v.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = hex
    ctx.shadowColor = hex
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.arc(cx, cy - 46, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = "rgba(128,128,128,.35)"
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, cy - 53)
    ctx.stroke()
  }
  new ResizeObserver(draw).observe(s.stage)
  on(() => draw())
}

// ── Readouts ─────────────────────────────────────────────────────────────────────────────────

category("Readouts")

{
  const s = section({
    id: "readouts",
    title: "Readouts",
    code: "watch · sparkline · graph · meter · table · log",
    what: "Rows that show what a running thing is doing. They hold no value, cost nothing at rest, and sleep when the feed pauses.",
    tries: [
      "Push Load up: the graph crosses its 60 fps line, the meter turns amber, then red",
      "Hover the graph for a crosshair; <kbd>←</kbd> <kbd>→</kbd> walk it",
      "In the log: level chips, <kbd>f</kbd> to filter, scroll up and a “new ↓” pill appears",
    ],
  })
  const { store: signal, on } = define("signal", "Signal", {
    running: toggle(true, { label: "Running" }),
    load: knob(0.35, { min: 0, max: 1, step: 0.01, label: "Load" }),
    noise: knob(0.3, { min: 0, max: 1, step: 0.01, label: "Noise" }),
    spike: action("Spike", { run: () => (spikeAt = performance.now()) }),
  })
  mount(signal, s.slot, { title: "Signal" })
  const { store: live } = define("readouts", "Readouts", {
    frame: graph({
      label: "Frame time",
      series: [
        { id: "cpu", label: "CPU", area: true },
        { id: "gpu", label: "GPU" },
      ],
      unit: "ms",
      decimals: 1,
      min: 0,
      height: 56,
      thresholds: [{ value: 16.7, label: "60 fps" }],
    }),
    fps: watch({ label: "FPS", decimals: 0 }),
    drops: sparkline({ label: "Drops", decimals: 0, min: 0 }),
    memory: meter({ label: "Memory", max: 512, unit: "MB", decimals: 0, warn: 360, critical: 450 }),
    passes: table({ label: "Passes", columns: ["Pass", "ms", "Draws"] }),
    events: log({ label: "Events", lines: 5 }),
  })
  const right = h("div", "slot")
  s.side.prepend(right)
  mount(live, right, { title: "Live", header: { title: true, buttons: [] } })
  // A readout on its own, outside any panel.
  const solo = readout(sparkline({ label: "Frame", unit: "ms", decimals: 1, min: 0 }), { theme })
  const soloRow = h("div")
  soloRow.style.cssText = "display:flex;flex-direction:column;gap:6px"
  const soloNote = h("div", "", "On its own, outside a panel: <code>readout(sparkline())</code>")
  soloNote.style.cssText = "color:var(--dim);font-size:12px"
  solo.element.style.cssText += ";max-width:300px"
  soloRow.append(soloNote, solo.element)
  s.side.append(soloRow)
  let spikeAt = -1e9
  let visible = false
  let timer = 0
  let t = 0
  let drops = 0
  let n = 0
  let mem = 220
  const tick = () => {
    const v = signal.get()
    t += 0.05
    n++
    const spike = Math.max(0, 1 - (performance.now() - spikeAt) / 600)
    const jitter = () => (Math.random() - 0.5) * v.noise * 4
    const cpu = Math.max(0.5, 3 + v.load * 11 + Math.sin(t * 1.7) * 0.8 + jitter() + spike * 14)
    const gpu = Math.max(0.5, 5 + v.load * 13 + Math.sin(t * 0.6 + 1) * 1.2 + jitter() + spike * 9)
    const frame = Math.max(cpu, gpu)
    if (frame > 16.7) drops++
    mem += (180 + v.load * 300 + spike * 120 - mem) * 0.06 + jitter()
    live.watch("frame", { cpu, gpu })
    solo.push(frame)
    live.watch("fps", Math.min(120, 1000 / frame))
    live.watch("drops", drops)
    live.watch("memory", mem)
    if (n % 10 === 0)
      live.watch("passes", [
        ["Shadow", +(gpu * 0.18).toFixed(2), 12],
        ["Opaque", +(gpu * 0.46).toFixed(2), 84 + Math.round(v.load * 60)],
        ["Post", +(gpu * 0.2).toFixed(2), 4],
      ])
    if (spike > 0.95)
      live.watch("events", { level: "error", text: `Spike: frame ${frame.toFixed(1)} ms` })
    else if (frame > 16.7 && n % 8 === 0)
      live.watch("events", { level: "warn", text: `Over budget: ${frame.toFixed(1)} ms` })
    else if (n % 40 === 0) live.watch("events", `Streamed tile ${(n / 40) % 64}`)
  }
  const sync = () => {
    const run = visible && signal.get().running
    if (run && !timer) timer = window.setInterval(tick, 50)
    if (!run && timer) {
      clearInterval(timer)
      timer = 0
    }
  }
  new IntersectionObserver((e) => {
    visible = e.some((x) => x.isIntersecting)
    sync()
  }).observe(s.el)
  on(() => sync())
}

// ── Panel structure ──────────────────────────────────────────────────────────────────────────

category("Panel structure")

{
  const s = section({
    id: "tabs",
    title: "Tabs & sub-headings",
    code: "tab · subsection",
    what: "Fields name a tab and a sub-heading. Rows cross as tabs change; sub-headings fold inside their card.",
    tries: [
      "<kbd>⌥1</kbd> <kbd>⌥2</kbd> <kbd>⌥3</kbd> pick a tab",
      "Click Forces to fold it; <kbd>←</kbd> folds and <kbd>→</kbd> opens on a focused heading",
    ],
  })
  const { store } = define("tabs", "Tabs", {
    position: vec3(
      { x: 0, y: 1.2, z: -4 },
      { min: -50, max: 50, step: 0.1, label: "Position", group: "xform", tab: "transform" },
    ),
    yaw: angle(90, { label: "Yaw", group: "xform" }),
    pivotX: knob(0.5, {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Pivot X",
      group: "xform",
      subsection: "Pivot",
    }),
    pivotY: knob(0, {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Pivot Y",
      group: "xform",
      subsection: "Pivot",
    }),
    rate: knob(120, {
      min: 0,
      max: 400,
      step: 1,
      unit: "/s",
      label: "Rate",
      group: "emitter",
      tab: "emitter",
    }),
    life: range([0.6, 1.8], {
      min: 0,
      max: 4,
      step: 0.05,
      unit: "s",
      label: "Life",
      group: "emitter",
    }),
    drag: knob(0.2, {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Drag",
      group: "emitter",
      subsection: "Forces",
    }),
    gravity: knob(-9.8, {
      min: -20,
      max: 20,
      step: 0.1,
      label: "Gravity",
      group: "emitter",
      subsection: "Forces",
    }),
    tint: color("#9ad1ff", { label: "Tint", group: "look", tab: "look" }),
    blend: choice("add", ["add", "alpha", "screen"], { label: "Blend", group: "look" }),
  })
  mount(store, s.slot, {
    title: "Emitter",
    tabs: [
      { id: "transform", label: "Transform" },
      { id: "emitter", label: "Emitter" },
      { id: "look", label: "Look" },
    ],
    tab: "transform",
  })
}

{
  const s = section({
    id: "folds",
    title: "Folding groups",
    code: "folded: true",
    what: "A group with a folded field folds to its header. Each card has a reset and a die of its own.",
    tries: [
      "Click Shadow's header to open it",
      "<kbd>g</kbd> randomizes the focused row's group; <kbd>⌥G</kbd> mutates it",
    ],
  })
  const { store } = define("folds", "Folding groups", {
    radius: knob(14, { min: 0, max: 32, step: 1, unit: "px", label: "Radius", group: "Shape" }),
    padding: knob(16, { min: 0, max: 40, step: 1, unit: "px", label: "Padding", group: "Shape" }),
    offset: vec2(
      { x: 0, y: 8 },
      { min: -24, max: 24, step: 1, label: "Offset", group: "Shadow", folded: true },
    ),
    blur: knob(24, { min: 0, max: 64, step: 1, unit: "px", label: "Blur", group: "Shadow" }),
    opacity: knob(0.3, { min: 0, max: 1, step: 0.01, label: "Opacity", group: "Shadow" }),
    glow: toggle(false, { label: "Glow", group: "Glow", folded: true }),
    glowColor: color("#7cc4ff", { label: "Colour", group: "Glow" }),
  })
  mount(store, s.slot, { title: "Card" })
}

{
  const s = section({
    id: "search",
    title: "Search & chips",
    code: "search: { chips }",
    what: "Filters rows by label, key, group or sub-heading across every tab. Chips narrow it further.",
    tries: [
      "Press <kbd>/</kbd> inside the panel and type “sh”",
      "Change a value, then tap Modified",
      "Colours is a chip of our own with a count",
    ],
  })
  const { store } = define("search", "Search", {
    font: choice("Inter", ["Inter", "SF Pro", "Söhne", "Graphik"], {
      label: "Font",
      group: "Type",
    }),
    size: knob(15, { min: 10, max: 32, step: 1, unit: "px", label: "Size", group: "Type" }),
    tracking: knob(0, {
      min: -0.05,
      max: 0.1,
      step: 0.005,
      unit: "em",
      label: "Tracking",
      group: "Type",
    }),
    ink: color("#e8e8ea", { label: "Ink", group: "Colour" }),
    paper: color("#1c1c1e", { label: "Paper", group: "Colour" }),
    accent: color("#3a8dff", { label: "Accent", group: "Colour" }),
    shadow: knob(12, { min: 0, max: 40, step: 1, unit: "px", label: "Shadow", group: "Depth" }),
    shine: toggle(true, { label: "Shine", group: "Depth" }),
  })
  mount(store, s.slot, {
    title: "Style",
    search: {
      placeholder: "Filter",
      chips: [
        "modified",
        {
          id: "colours",
          label: "Colours",
          count: true,
          test: (key, c) => c.schema[key]?.kind === "color",
        },
      ],
    },
  })
}

{
  const s = section({
    id: "presets",
    title: "Presets",
    code: "presets · groupPresets",
    what: "A strip of presets above the rows and named presets in a card's header. Switching ripples the rows top to bottom.",
    stage: true,
    tries: [
      "<kbd>[</kbd> <kbd>]</kbd> cycle presets from anywhere in the panel",
      "<kbd>+</kbd> or <kbd>⇧S</kbd> saves the current values as a chip",
      "Fan's own presets sit in its header",
    ],
  })
  const { store, on } = define(
    "presets",
    "Presets",
    {
      spacing: knob(30, {
        min: 0,
        max: 70,
        step: 1,
        unit: "px",
        label: "Spacing",
        group: "layout",
        groupLabel: "Layout",
      }),
      lift: knob(10, { min: -30, max: 40, step: 1, unit: "px", label: "Lift", group: "layout" }),
      tilt: knob(8, {
        min: 0,
        max: 30,
        step: 0.5,
        unit: "°",
        label: "Tilt",
        group: "fan",
        groupLabel: "Fan",
      }),
      scale: knob(1, { min: 0.6, max: 1.3, step: 0.01, label: "Scale", group: "fan" }),
    },
    {
      presets: {
        Tidy: { spacing: 6, lift: 0, tilt: 0, scale: 1 },
        Fanned: { spacing: 34, lift: 14, tilt: 12, scale: 1 },
        Scattered: { spacing: 62, lift: -18, tilt: 26, scale: 0.86 },
      },
      groupPresets: {
        fan: [
          { name: "Flat", values: { tilt: 0, scale: 1 } },
          { name: "Gentle", values: { tilt: 8, scale: 1 } },
          { name: "Wide", values: { tilt: 22, scale: 0.92 } },
        ],
      },
    },
  )
  mount(store, s.slot, { title: "Hand", variants: true })
  s.stage.style.display = "block"
  const SUITS = ["♠", "♥", "♦", "♣"]
  const cards = SUITS.map((suit, i) => {
    const el = h("div", "abs")
    el.style.cssText += `width:58px;height:82px;margin:-41px 0 0 -29px;border-radius:9px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line),0 6px 16px rgba(0,0,0,.22);display:grid;place-items:center;font:600 22px var(--sans);color:${i % 3 === 0 ? "var(--text)" : "#ff6b5e"};transform-origin:50% 130%`
    el.textContent = suit
    s.stage.append(el)
    return el
  })
  const stage = new Stage(s.stage, () => {
    const cx = s.stage.clientWidth / 2
    const cy = s.stage.clientHeight / 2 + 8
    cards.forEach((el, i) => {
      const c = i - 1.5
      const n = c / 1.5
      el.style.transform = `translate(${px(cx + c * sp.x)},${px(cy - lift.x * (1 - n * n))}) rotate(${(c * tilt.x).toFixed(2)}deg) scale(${sc.x.toFixed(4)})`
    })
  })
  const sp = stage.val(30, 0.02)
  const lift = stage.val(10, 0.02)
  const tilt = stage.val(8, 0.01)
  const sc = stage.val(1, 0.0005)
  on((v, how) => {
    go(sp, v.spacing, how)
    go(lift, v.lift, how)
    go(tilt, v.tilt, how)
    go(sc, v.scale, how)
  })
}

{
  const s = section({
    id: "gates",
    title: "Disabled, read-only and mixed",
    code: "disabled · readOnly · setMixed",
    what: "A disabled row dims; a read-only one keeps full strength. Mixed rows read “—” until edited, as for a multi-selection.",
    tries: [
      "Turn on Lock size: Size and Corner become read-only",
      "Shadow colour is disabled while Shadow is off",
      "Edit Opacity once and it stops being mixed; the action mixes it again",
    ],
  })
  const { store } = define("gates", "Gates", {
    lock: toggle(false, { label: "Lock size", group: "Size" }),
    size: knob(48, {
      min: 16,
      max: 96,
      step: 1,
      unit: "px",
      label: "Size",
      group: "Size",
      readOnly: (v) => v.lock === true,
    }),
    corner: knob(10, {
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      label: "Corner",
      group: "Size",
      readOnly: (v) => v.lock === true,
    }),
    shadow: toggle(false, { label: "Shadow", group: "Shadow" }),
    shadowColor: color("#000000", {
      label: "Shadow colour",
      group: "Shadow",
      disabled: (v) => v.shadow !== true,
    }),
    opacity: knob(0.8, {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Opacity",
      group: "Selection",
      groupLabel: "Selection · 3 items",
    }),
    blend: choice("normal", ["normal", "multiply", "screen"], {
      label: "Blend",
      group: "Selection",
    }),
    remix: action("Select three items again", {
      group: "Selection",
      run: () => store.setMixed(["opacity", "blend"], true),
    }),
  })
  mount(store, s.slot, { title: "Layer" })
  store.setMixed(["opacity", "blend"], true)
}

{
  const s = section({
    id: "accessories",
    title: "Row accessories",
    code: "rowAccessory(key)",
    what: "Your own node just after a row's label: a pin, a marker. It stays yours to style and listen on.",
    tries: [
      "Hover a row to see its pin; click to pin it",
      "The amber dot marks values that only apply at spawn",
    ],
  })
  const pinned = new Set(["gravity"])
  const SPAWN = new Set(["count", "spread"])
  const { store } = define("accessories", "Row accessories", {
    count: knob(240, {
      min: 0,
      max: 1000,
      step: 10,
      label: "Count",
      group: "spawn",
      groupLabel: "Particles",
    }),
    spread: knob(35, { min: 0, max: 180, step: 1, unit: "°", label: "Spread", group: "spawn" }),
    gravity: knob(-4, { min: -20, max: 20, step: 0.1, label: "Gravity", group: "spawn" }),
    wind: knob(1.5, { min: 0, max: 10, step: 0.1, label: "Wind", group: "spawn" }),
    mode: choice("burst", ["burst", "stream", "trail"], { label: "Mode", group: "spawn" }),
  })
  const pinned$ = h("p", "", "")
  pinned$.style.cssText = "margin:0;color:var(--label);font-size:12px"
  const showPins = () => {
    pinned$.textContent = pinned.size
      ? `Pinned: ${[...pinned].map((k) => store.schema[k as keyof typeof store.schema]?.label ?? k).join(", ")}`
      : "Nothing pinned"
  }
  s.side.prepend(pinned$)
  showPins()
  mount(store, s.slot, {
    title: "Emitter",
    rowAccessory: (key) => {
      const wrap = document.createElement("span")
      wrap.style.cssText = "display:inline-flex;gap:4px;align-items:center"
      if (SPAWN.has(key)) {
        const dot = document.createElement("span")
        dot.dataset.tip = "Applies at spawn"
        dot.style.cssText = "width:5px;height:5px;border-radius:50%;background:#ff9f0a"
        wrap.append(dot)
      }
      const pin = document.createElement("button")
      pin.type = "button"
      pin.className = "catalog-pin"
      pin.ariaLabel = `Pin ${key}`
      pin.innerHTML = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M9.8 1.5l4.7 4.7-1.4.6-2.6 2.6.2 3.1-1.2 1.2-2.9-2.9-3.6 3.6H2v-1l3.6-3.6-2.9-2.9 1.2-1.2 3.1.2L9.6 3z"/></svg>`
      pin.toggleAttribute("data-pinned", pinned.has(key))
      pin.onclick = () => {
        if (!pinned.delete(key)) pinned.add(key)
        pin.toggleAttribute("data-pinned", pinned.has(key))
        showPins()
      }
      wrap.append(pin)
      return wrap
    },
  })
  const style = document.createElement("style")
  style.textContent = `.catalog-pin{width:16px;height:16px;padding:0;border:0;border-radius:4px;background:none;color:var(--dim);display:grid;place-items:center;opacity:0;cursor:pointer;transition:opacity .15s,color .15s}
  .catalog-pin[data-pinned]{opacity:1;color:var(--text)}
  .knobs-row:hover .catalog-pin,.knobs-row:focus-within .catalog-pin{opacity:1}`
  document.head.append(style)
}

// ── Remote ───────────────────────────────────────────────────────────────────────────────────

category("Remote")

{
  const s = section({
    id: "remote",
    title: "Remote controls",
    code: "createRemoteControls(descriptors)",
    tag: "descriptors",
    what: "A store built from runtime descriptors, for values that live elsewhere: a phone over a socket. This one talks to a pretend device with 120 ms of latency.",
    stage: true,
    tries: [
      "Drag Height: each change goes out as a message; the device answers with its own spring",
      "Nudge from the device: the value lands in the panel without echoing back",
      "Copy as Swift writes the Tunables",
    ],
  })
  const descriptors: ControlDescriptor[] = [
    { key: "drawer.open", kind: "toggle", label: "Open", default: true, group: "Drawer" },
    {
      key: "drawer.height",
      kind: "number",
      swiftType: "Double",
      label: "Height",
      default: 96,
      min: 48,
      max: 150,
      step: 1,
      unit: "pt",
      group: "Drawer",
    },
    {
      key: "drawer.spring",
      kind: "spring",
      label: "Spring",
      default: { duration: 0.45, bounce: 0.2 },
      group: "Drawer",
    },
    { key: "drawer.tint", kind: "color", label: "Tint", default: "#3a8dff", group: "Drawer" },
  ]
  const defaults: State = Object.fromEntries(
    descriptors.map((d) => [d.key, (d as { default: unknown }).default]),
  ) as State
  const device: Record<string, unknown> = { ...defaults }
  const lines: string[] = []
  const logEl = h("div")
  logEl.style.cssText =
    "position:absolute;right:12px;top:12px;width:46%;font:11px/1.6 var(--mono);color:var(--dim);white-space:nowrap;overflow:hidden;text-align:left"
  const say = (line: string) => {
    lines.unshift(line)
    lines.length = Math.min(lines.length, 8)
    logEl.innerHTML = lines
      .map(
        (l, i) =>
          `<div style="opacity:${(1 - i * 0.11).toFixed(2)};overflow:hidden;text-overflow:ellipsis">${l}</div>`,
      )
      .join("")
  }
  let render = (_animate: boolean) => {}
  const short = (v: unknown) =>
    typeof v === "object" && v ? JSON.stringify(v).replace(/"/g, "") : JSON.stringify(v)
  const remote = createRemoteControls("catalog-remote", descriptors, {
    values: device as State,
    storage: null,
    enabled: true,
    onSet: (key, value) => {
      say(`→ set ${key.replace("drawer.", "")} ${value === null ? "null" : short(value)}`)
      setTimeout(() => {
        device[key] = value ?? defaults[key]
        render(true)
      }, 120)
    },
    onReset: ({ key }) => {
      say(`→ reset ${key ?? "all"}`)
      setTimeout(() => {
        for (const d of descriptors) if (!key || d.key === key) device[d.key] = defaults[d.key]
        render(true)
      }, 120)
    },
    actions: [
      {
        label: "Copy as Swift",
        run: () => navigator.clipboard.writeText(remote.swift()).then(() => "Copied Swift."),
      },
    ],
  })
  stores.push({ store: remote, title: "Remote" })
  mount(remote, s.slot, { title: "iPhone" })
  s.stage.style.display = "block"
  s.stage.style.minHeight = "232px"
  const phone = h("div")
  phone.style.cssText =
    "position:absolute;left:28px;top:16px;width:116px;height:200px;border-radius:22px;background:var(--page);box-shadow:inset 0 0 0 1.5px var(--faint);overflow:hidden"
  const drawer = h("div", "abs")
  drawer.style.cssText +=
    "left:6px;width:104px;height:160px;border-radius:16px 16px 18px 18px;transition:background-color .3s cubic-bezier(.2,.8,.2,1)"
  const handle = h("div")
  handle.style.cssText =
    "width:26px;height:4px;margin:7px auto 0;border-radius:2px;background:rgba(255,255,255,.55)"
  drawer.append(handle)
  phone.append(drawer)
  const nudge = h("button", "chip quiet", "Nudge from device")
  nudge.style.cssText = "position:absolute;right:12px;bottom:12px"
  s.stage.append(phone, logEl, nudge)
  const stage = new Stage(s.stage, () => {
    drawer.style.transform = `translateY(${px(200 - y.x)})`
  })
  const y = stage.val(96, 0.05)
  render = (animate) => {
    const open = device["drawer.open"] === true
    const target = open ? Number(device["drawer.height"]) : -8
    drawer.style.backgroundColor = String(device["drawer.tint"])
    // The device moves on its own spring: the one the panel sends.
    if (animate)
      y.to(target, springMotion(device["drawer.spring"] as { duration: number; bounce: number }))
    else y.snap(target)
  }
  render(false)
  nudge.addEventListener("click", () => {
    device["drawer.height"] = Math.round(56 + Math.random() * 90)
    device["drawer.open"] = true
    render(true)
    say(`← state height ${device["drawer.height"]}`)
    remote.sync(device as State)
  })
}

// ── knobs/ui ─────────────────────────────────────────────────────────────────────────────────

category("knobs/ui")
uiSections({ section, h, theme: () => theme })

// ── Matching your app ────────────────────────────────────────────────────────────────────────

category("Matching your app")

{
  const s = section({
    id: "looks",
    title: "Matching your app",
    code: "preset · --k-frame: flat",
    what: "One store, three panels: knobs' own look, the Arcade Lab's labPreset (square, flat, mono readouts), and knobs' look set flat into a host's card. Change one and the others follow.",
    wide: true,
    tries: [
      "Drag Exposure in any of the three",
      "The light toggle in the top bar restyles the first and third; labPreset stays dark",
    ],
  })
  const { store } = define("looks", "Looks", {
    tools: toolbar(
      [
        { id: "frame", label: "Frame", icon: "frame", shortcut: { key: "F", scope: "none" } },
        { id: "play", label: "Play", icon: "play", shortcut: "Space" },
      ],
      { label: "View" },
    ),
    exposure: knob(0.4, {
      min: -2,
      max: 2,
      step: 0.05,
      unit: "EV",
      label: "Exposure",
      group: "Camera",
    }),
    lens: choice("35mm", ["24mm", "35mm", "50mm"], { label: "Lens", group: "Camera" }),
    fog: toggle(true, { label: "Fog", group: "Camera" }),
    position: vec2(
      { x: 2, y: -4 },
      { min: -50, max: 50, step: 0.1, axes: ["x", "z"], label: "Position", group: "Place" },
    ),
    sun: color("#ffcf8a", { label: "Sun", group: "Place" }),
    rebake: action("Rebake lighting", { group: "Place" }),
  })
  const looks = h("div", "looks")
  const cell = (title: string, cls: string) => {
    const c = h("div")
    c.append(Object.assign(h("h3"), { textContent: title }))
    const host = h("div", `host ${cls}`)
    c.append(host)
    looks.append(c)
    return host
  }
  const a = cell("knobs", "knobs-host")
  const b = cell("labPreset", "lab-host")
  const c = cell("knobs · flat frame", "flat-host")
  b.dataset.ownLook = ""
  s.slot.replaceWith(looks)
  s.el.append(s.side)
  const opts: MountPanelOptions = { title: false, header: { buttons: ["random", "reset"] } }
  mount(store, a, opts)
  mount(store, b, { ...opts, preset: labPreset, theme: "dark", density: "compact" })
  mount(store, c, opts)
}

// ── Top bar, index and palette ───────────────────────────────────────────────────────────────

overlayLook({ theme })
tooltips(document)

const themeButton = document.getElementById("theme") as HTMLButtonElement
const syncThemeButton = () => {
  themeButton.textContent = theme === "dark" ? "☾" : "☀"
}
function setTheme(next: "dark" | "light") {
  theme = next
  document.documentElement.dataset.theme = next
  for (const el of document.querySelectorAll<HTMLElement>(".knobs-ui,.knobs-panel"))
    if (!el.closest("[data-own-look]")) restyle(el, { theme: next })
  overlayLook({ theme: next })
  const url = new URL(location.href)
  if (next === "light") url.searchParams.set("theme", "light")
  else url.searchParams.delete("theme")
  history.replaceState(null, "", url)
  syncThemeButton()
  syncRendererLinks()
}
themeButton.addEventListener("click", () => setTheme(theme === "dark" ? "light" : "dark"))
syncThemeButton()

const domLink = document.getElementById("dom") as HTMLAnchorElement
const gpuLink = document.getElementById("gpu") as HTMLAnchorElement
function syncRendererLinks() {
  const url = new URL(location.href)
  url.searchParams.delete("gpu")
  domLink.href = url.pathname + url.search + url.hash
  url.searchParams.set("gpu", "")
  gpuLink.href = (url.pathname + url.search).replace("gpu=", "gpu") + url.hash
  domLink.classList.toggle("on", !gpu)
  gpuLink.classList.toggle("on", gpu)
  domLink.setAttribute("aria-checked", String(!gpu))
  gpuLink.setAttribute("aria-checked", String(gpu))
}
syncRendererLinks()
if (gpu)
  document.getElementById("renderer-note")!.textContent = !("gpu" in navigator)
    ? "WebGPU isn't available in this browser, so the panels fall back to the DOM renderer, which looks the same."
    : "Panels are drawn by the WebGPU renderer, on one canvas over the page."

// The side index and the narrow strip, following the scroll.
const index = document.getElementById("index")!
const strip = document.getElementById("strip")!
const links = new Map<string, HTMLAnchorElement>()
const catLinks = new Map<string, HTMLAnchorElement>()
const jump = (el: HTMLElement) => (e: Event) => {
  e.preventDefault()
  el.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  })
  history.replaceState(null, "", `#${el.id}`)
}
for (const cat of cats) {
  index.append(Object.assign(h("div", "cat"), { textContent: cat.title }))
  const first = sections.find((x) => x.cat === cat.title)
  const chip = Object.assign(h("a"), { textContent: cat.title, href: `#${first?.id ?? cat.id}` })
  chip.addEventListener("click", jump(first?.el ?? cat.el))
  strip.append(chip)
  catLinks.set(cat.title, chip)
  for (const sec of sections.filter((x) => x.cat === cat.title)) {
    const a = Object.assign(h("a"), { textContent: sec.title, href: `#${sec.id}` })
    a.addEventListener("click", jump(sec.el))
    index.append(a)
    links.set(sec.id, a)
  }
}
let active = ""
const markActive = (id: string) => {
  if (id === active) return
  links.get(active)?.classList.remove("on")
  active = id
  const link = links.get(id)
  link?.classList.add("on")
  // Keep the active link in the index's own view, without touching the page's scroll.
  if (link) {
    const top = link.offsetTop // the sticky index is the links' offset parent
    if (top < index.scrollTop + 24) index.scrollTop = Math.max(0, top - 24)
    else if (top + link.offsetHeight > index.scrollTop + index.clientHeight - 24)
      index.scrollTop = top + link.offsetHeight - index.clientHeight + 24
  }
  const cat = sections.find((x) => x.id === id)?.cat
  for (const [title, chip] of catLinks) chip.classList.toggle("on", title === cat)
}
const seen = new Map<string, boolean>()
{
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set((e.target as HTMLElement).id, e.isIntersecting)
      const first = sections.find((x) => seen.get(x.id))
      if (first) markActive(first.id)
    },
    { root: scroller, rootMargin: "-12% 0px -62% 0px" },
  )
  for (const sec of sections) io.observe(sec.el)
}
if (location.hash)
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" })

// ⌘K: the page's sections, then every store's actions, presets and fields.
const reveal = (store: AnyControls) => (key: string) => {
  const field = store.schema[key] as { tab?: string; group?: string } | undefined
  const panel = panels.get(store.id)
  if (field?.tab) panel?.tab(field.tab)
  if (field?.group) panel?.fold(field.group, false)
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      `[data-controls="${store.id}"] [data-field="${key}"]`,
    )
    if (!row) return
    row.scrollIntoView({ block: "center", behavior: "smooth" })
    row
      .querySelector<HTMLElement>('[role="slider"],[tabindex="0"],input,button')
      ?.focus({ preventScroll: true })
  })
}
const commands = (): Command[] => [
  ...sections.map((sec) => ({
    id: `go/${sec.id}`,
    label: sec.title,
    section: "Sections",
    hint: sec.cat,
    run: () => jump(sec.el)(new Event("click")),
  })),
  {
    id: "page/theme",
    label: theme === "dark" ? "Light appearance" : "Dark appearance",
    section: "Page",
    keywords: ["theme", "dark", "light"],
    run: () => setTheme(theme === "dark" ? "light" : "dark"),
  },
  {
    id: "page/renderer",
    label: gpu ? "Draw panels with the DOM" : "Draw panels with WebGPU",
    section: "Page",
    keywords: ["gpu", "renderer", "dom"],
    run: () => {
      location.href = gpu ? domLink.href : gpuLink.href
    },
  },
  ...stores.flatMap(({ store, title }) => commandsFrom(store, { title, reveal: reveal(store) })),
]
const palette = commandPalette({
  commands,
  recents: "catalog",
  placeholder: "Sections and controls",
})
document.getElementById("palette")!.addEventListener("click", () => palette.open())

Object.assign(window, { __catalog: { stores, panels, palette, toast } })
