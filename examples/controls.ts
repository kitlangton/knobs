// Every control in knobs, one section each, down one scrolling page: the field kinds, the
// readouts, the panel's structure, remote descriptors, knobs/ui and the looks. Most panels drive a
// small preview beside them (examples/controls-motion.ts moves them on knobs' springs); some stand
// alone. ?gpu draws the panels with the WebGPU renderer, ?theme=light starts light. ⌘K lists the
// page's sections and controls.
import {
  action,
  angle,
  type ChangeMeta,
  type ControlDescriptor,
  type Controls,
  type ControlsOptions,
  choice,
  color,
  createRemoteControls,
  defineControls,
  gradient,
  graph,
  knob,
  log,
  type MountPanelOptions,
  meter,
  parseColor,
  point,
  range,
  type Schema,
  type State,
  sampleGradient,
  seed,
  sparkline,
  springMotion,
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
import { Goo } from "./controls-goo"
import {
  blurFor,
  ColorVal,
  DirBlur,
  FEEL,
  type How,
  oklabCss,
  reduced,
  rgbaOf,
  rolling,
  Smear,
  Stage,
  stretchFor,
  type Val,
} from "./controls-motion"
import { lampScene } from "./controls-scene-lamp"
import { motionScene } from "./controls-scene-motion"
import { uiSections } from "./controls-ui"

const params = new URLSearchParams(location.search)
const gpu = params.has("gpu")
let theme: "dark" | "light" = document.documentElement.dataset.theme === "light" ? "light" : "dark"

// biome-ignore lint/suspicious/noExplicitAny: any store
type AnyControls = Controls<any>

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
  /** A scene: a big stage that several kinds of control drive together. */
  readonly scene?: boolean
  /** The kinds of control it shows, as chips under the title. */
  readonly shows?: readonly string[]
}
export function section(spec: SectionSpec) {
  const el = h("section", `demo${spec.wide ? " wide" : ""}${spec.scene ? " scene" : ""}`)
  el.id = spec.id
  const head = h("header")
  const title = h("h2")
  title.textContent = spec.title
  if (spec.code) title.append(Object.assign(h("code"), { textContent: spec.code }))
  if (spec.tag) title.append(Object.assign(h("span", "tag"), { textContent: spec.tag }))
  const what = h("p", "", spec.what)
  head.append(title, what)
  if (spec.shows?.length) {
    const shows = h("div", "shows")
    for (const k of spec.shows) shows.append(Object.assign(h("code"), { textContent: k }))
    head.append(shows)
  }
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

const px = (n: number) => `${Math.round(n * 100) / 100}px`
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** What a scene module needs from the page. */
export interface SceneKit {
  readonly section: typeof section
  readonly define: typeof define
  readonly mount: typeof mount
  readonly h: typeof h
  readonly theme: () => "dark" | "light"
}
const kit: SceneKit = { section, define, mount, h, theme: () => theme }

// ── Scenes ───────────────────────────────────────────────────────────────────────────────────

category("Scenes")
lampScene(kit)
motionScene(kit)

// ── Basics ───────────────────────────────────────────────────────────────────────────────────

category("Basics")

{
  const s = section({
    id: "slider",
    title: "Sliders",
    code: "knob()",
    what: "Numbers with units, steps and a default notch. Ten steps or fewer become stops that resist, then snap. The dots are metaballs: one smooth field, so a new dot buds out of its neighbour and a leaving one is swallowed by it.",
    stage: true,
    tries: [
      "Step Count down: the end dot pours into its neighbour as a teardrop in a fifth of a second, which gives a small gulp, while the rest respace at once",
      "Step Count up: a new dot stretches out of its neighbour, necks and pinches off",
      "Scrub Count fast both ways: buds and merges turn back mid-way, never snapping",
      "Throw Size, Spread or Arc: every moving dot stretches and smears along its path, crisp again at rest",
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
  /** The merge: a 185 ms surface-tension collapse into the neighbour (bridges early, then snaps). */
  const MERGE_MS = 185
  /** The bud and the row's respacing (duration / bounce). */
  const BUD = springMotion({ duration: 0.25, bounce: 0.08 })
  s.stage.style.display = "block"
  const canvas = h("canvas")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;color:var(--text)"
  s.stage.append(canvas)
  const goo = new Goo(canvas)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [{ id: "n" }, " × ", { id: "size" }, "px"])
  let inkFrom = rgbaOf(getComputedStyle(canvas).color)
  let inkTo = inkFrom
  let k = 8
  const shown: boolean[] = Array.from({ length: MAX }, () => false)
  /** A dot pouring into its neighbour: where it started and when. */
  const merging: ({ x: number; y: number; r: number; at: number } | null)[] = Array.from(
    { length: MAX },
    () => null,
  )
  const inkAt = () => {
    const t = clamp01(ink.x)
    return inkFrom.map((c, i) => c + (inkTo[i]! - c) * t)
  }
  // Shutter travel (px) for the WebGL coverage integrator: C¹ toe near rest, up to 16 px on throws.
  const dotBlur = (speed: number) => {
    if (reduced() || speed < 4) return 0
    const raw = (speed - 4) / 28
    const eased = (raw * raw) / (raw + 0.32)
    return (16 * eased) / Math.hypot(16, eased)
  }
  const dotRadialBlur = (vr: number) => {
    if (reduced() || Math.abs(vr) < 3) return 0
    return Math.sign(vr) * Math.min(8, (Math.abs(vr) - 3) / 26)
  }
  const dotStretch = (speed: number) => (reduced() ? 1 : 1 + Math.min(0.34, speed / 620))
  const stage = new Stage(s.stage, () => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    goo.fit(dpr)
    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight / 2
    // A hidden dot rides inside its neighbour, so it buds from wherever that one is.
    if (!reduced())
      for (let i = 1; i < MAX; i++)
        if (!shown[i] && !merging[i]) {
          dots[i]!.x.spring.target = dots[i - 1]!.x.x
          dots[i]!.y.spring.target = dots[i - 1]!.y.x
        }
    goo.draw(
      dots.map((d, i) => {
        const vx = d.x.v
        const vy = d.y.v
        const speed = Math.hypot(vx, vy)
        const m = merging[i]
        const t = m ? clamp01((performance.now() - m.at) / MERGE_MS) : 0
        const e = m ? t * (0.36 + 0.64 * t * t) : 0
        // Dynamic neck: reaches out at the start of a merge, and thins cleanly when pinching off.
        let neck = 1
        if (m) {
          neck = 1.25 - 0.78 * e
        } else if (i > 0 && shown[i]) {
          const nb = dots[i - 1]!
          const dist = Math.hypot(d.x.x - nb.x.x, d.y.x - nb.y.x)
          const touch = d.r.x + nb.r.x
          const sepVel = (d.x.x - nb.x.x) * (d.x.v - nb.x.v) + (d.y.x - nb.y.x) * (d.y.v - nb.y.v)
          if (sepVel > 6 && dist > touch * 0.75) {
            const pinch = clamp01((dist - touch * 0.75) / Math.max(4, k * 0.85))
            neck = 1.15 - 0.62 * pinch
          }
        }
        return {
          x: cx + d.x.x,
          y: cy + d.y.x,
          r: Math.max(0, d.r.x) * (1 + d.pulse.x),
          a: clamp01(d.a.x),
          vx,
          vy,
          rBlur: dotRadialBlur(d.r.v + d.r.x * d.pulse.v),
          // Pouring in, it draws out into a teardrop along its path and snaps into the neighbour.
          stretch: Math.max(dotStretch(speed), 1 + 0.62 * Math.sin(t * Math.PI)),
          blur: dotBlur(speed),
          goo: neck,
        }
      }),
      { dpr, k, goo: !reduced(), color: inkAt() },
    )
  })
  const ink = stage.val(1, 0.001)
  const dots = Array.from({ length: MAX }, () => ({
    x: stage.val(0, 0.01),
    y: stage.val(0, 0.01),
    r: stage.val(0, 0.01),
    a: stage.val(1, 0.002, true),
    pulse: stage.val(0, 0.0005),
  }))
  let pouring = false
  /** Steps the merges, after the springs and before drawing: it owns those dots meanwhile. */
  const pour = () => {
    if (pouring) return
    pouring = true
    stage.loop(() => {
      const now = performance.now()
      let any = false
      merging.forEach((m, i) => {
        if (!m) return
        const d = dots[i]!
        const nb = dots[i - 1]!
        const t = clamp01((now - m.at) / MERGE_MS)
        // Immediate surface-tension pull at t=0, accelerating decisively into the neighbour.
        const e = t * (0.36 + 0.64 * t * t)
        const de = (0.36 + 1.92 * t * t) / (MERGE_MS / 1000)
        const dx = nb.x.x - m.x
        const dy = nb.y.x - m.y
        // Position, radius and their velocities (including the moving neighbour's), so a reversal
        // or shutter sample picks up the exact screen-space trajectory.
        d.x.spring.x = d.x.spring.target = m.x + dx * e
        d.y.spring.x = d.y.spring.target = m.y + dy * e
        d.x.spring.v = dx * de + nb.x.v * e
        d.y.spring.v = dy * de + nb.y.v * e
        const left = Math.max(0, 1 - e ** 1.7)
        d.r.spring.x = d.r.spring.target = m.r * left ** 0.55
        d.r.spring.v = left > 0.001 ? -0.935 * m.r * e ** 0.7 * left ** -0.45 * de : 0
        if (t < 1) {
          any = true
          return
        }
        merging[i] = null
        d.x.spring.snap(nb.x.x)
        d.y.spring.snap(nb.y.x)
        d.r.spring.snap(0)
        // The neighbour gulps (~3.8% on a snappy spring) and absorbs a touch of the droplet's momentum.
        if (shown[i - 1]) {
          nb.pulse.to(0, "snappy").push(0.038 * FEEL.snappy.omega * Math.E)
          nb.x.push(dx * 0.32)
          nb.y.push(dy * 0.32)
        }
      })
      pouring = any
      return any
    })
  }
  new ResizeObserver(() => stage.paint()).observe(s.stage)
  new MutationObserver(() => {
    inkFrom = inkAt() as typeof inkFrom
    inkTo = rgbaOf(getComputedStyle(canvas).color)
    ink.snap(0).to(1, "calm")
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  let count = 0
  on((v, how) => {
    const r0 = v.size / 2
    k = r0 * 0.78
    const gap = v.size * (1 + (v.spread / 100) * 1.4) + 4
    // A count change respaces the row at once on a brisk spring, even from the hand: that's the point.
    const countChanged = how !== "init" && v.count !== count
    const slot = (i: number) => {
      const c = i - (v.count - 1) / 2
      const n = v.count > 1 ? c / ((v.count - 1) / 2) : 0
      return [c * gap, -v.arc * (1 - n * n)] as const
    }
    const last = slot(v.count - 1)
    for (let i = 0; i < MAX; i++) {
      const d = dots[i]!
      const on = i < v.count
      if (on) {
        const [tx, ty] = slot(i)
        if (!shown[i] && how !== "init") {
          if (reduced()) {
            d.x.snap(tx)
            d.y.snap(ty)
            d.r.snap(r0)
            d.a.to(1)
          } else {
            // Bud: from inside the neighbour (if it had fully merged), out on the bud spring.
            // Mid-merge it turns back from where it is, with the velocity it had.
            merging[i] = null
            if (d.r.x < 0.5) {
              d.x.snap(dots[i - 1]!.x.x)
              d.y.snap(dots[i - 1]!.y.x)
              d.r.snap(r0 * 0.38)
            }
            d.a.snap(1)
            d.x.to(tx, BUD)
            d.y.to(ty, BUD)
            d.r.to(r0, BUD)
          }
        } else if (countChanged) {
          d.x.to(tx, "snappy")
          d.y.to(ty, "snappy")
          d.r.go(r0, how, "snappy")
        } else {
          d.x.go(tx, how, "calm")
          d.y.go(ty, how, "calm")
          d.r.go(r0, how, "calm")
          d.a.go(1, how === "init" ? "init" : "other")
        }
      } else if (how === "init" || reduced()) {
        if (how === "init" || !shown[i]) {
          d.x.snap(last[0])
          d.y.snap(last[1])
        }
        d.r.go(reduced() ? r0 : 0, how === "init" ? "init" : "other")
        d.a.go(reduced() ? 0 : 1, how === "init" ? "init" : "other")
      } else if (shown[i] && !merging[i]) {
        // Merge: it pours into its neighbour, wherever that one is heading.
        merging[i] = { x: d.x.x, y: d.y.x, r: Math.max(0, d.r.x), at: performance.now() }
        pour()
      }
      shown[i] = on
    }
    count = v.count
    setCaption({ n: v.count, size: v.size })
  })
}

{
  const s = section({
    id: "choice",
    title: "Choices",
    code: "choice()",
    what: "Segments while the labels fit, a menu otherwise, and a searchable menu past eight options. The tile is one shape that morphs.",
    stage: true,
    tries: [
      "Step Shape with <kbd>←</kbd> <kbd>→</kbd>: circle, square and diamond are one shape bending and turning",
      "Open Colour and type to filter its fourteen options; the tile crosses over in OKLab",
      'Fill is a menu by <code>display: "menu"</code>; patterns bloom in as the old one softens out',
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
    circle: { radius: 50, rot: 0, scale: 1 },
    square: { radius: 24, rot: 0, scale: 0.94 },
    diamond: { radius: 16, rot: 45, scale: 0.76 },
  } as const
  const wrap = h("div")
  wrap.style.cssText = "position:relative;width:112px;height:112px"
  // Rotational arc & corner-morph shutter ghosts behind the tile, active only during motion.
  const SHUTTER_TAPS = [
    { tau: -0.45, w: 0.16 },
    { tau: -0.22, w: 0.28 },
    { tau: 0.22, w: 0.28 },
    { tau: 0.45, w: 0.16 },
  ] as const
  const ghosts = SHUTTER_TAPS.map(() => {
    const g = h("div")
    g.style.cssText =
      "position:absolute;inset:0;pointer-events:none;opacity:0;will-change:transform,opacity"
    wrap.append(g)
    return g
  })
  const tile = h("div")
  tile.style.cssText =
    "position:relative;width:112px;height:112px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.18);will-change:transform"
  const tex = FILLS.map((f) => {
    const t = h("div")
    t.style.cssText = `position:absolute;inset:-20%;background:${TEX[f]}`
    tile.append(t)
    return t
  })
  wrap.append(tile)
  s.stage.append(wrap)
  const tileBlur = new DirBlur(tile)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [
    { id: "colour", text: true },
    " · ",
    { id: "fill", text: true },
    " · ",
    { id: "shape", text: true },
  ])
  const stage = new Stage(s.stage, () => {
    const bg = colour.css()
    tile.style.borderRadius = `${radius.x.toFixed(2)}%`
    tile.style.transform = `rotate(${rot.x.toFixed(2)}deg) scale(${scale.x.toFixed(4)})`
    tile.style.backgroundColor = bg
    // Arc speed from rotation + corner morph speed from border-radius and scale.
    const arcSpeed = Math.abs((rot.v * Math.PI) / 180) * 56
    const morphSpeed = Math.abs(radius.v) * 1.4 + Math.abs(scale.v) * 110
    const b = blurFor(arcSpeed + morphSpeed * 0.7, 2.4)
    tileBlur.set(b, b * 0.65)
    const activeArc = !reduced() && arcSpeed + morphSpeed > 12
    const strength = activeArc ? clamp01((arcSpeed + morphSpeed - 12) / 140) : 0
    ghosts.forEach((g, idx) => {
      if (!activeArc) {
        if (g.style.opacity !== "0") g.style.opacity = "0"
        return
      }
      const { tau, w } = SHUTTER_TAPS[idx]!
      const gRad = Math.max(0, Math.min(50, radius.x + tau * radius.v * 0.038))
      const gRot = rot.x + tau * rot.v * 0.038
      const gSc = Math.max(0.2, scale.x + tau * scale.v * 0.038)
      g.style.borderRadius = `${gRad.toFixed(2)}%`
      g.style.backgroundColor = bg
      g.style.transform = `rotate(${gRot.toFixed(2)}deg) scale(${gSc.toFixed(4)})`
      g.style.opacity = (w * strength).toFixed(3)
    })
    tex.forEach((t, j) => {
      const f = fills[j]!
      const o = clamp01(f.x)
      t.style.opacity = o.toFixed(3)
      const soft = !reduced() && o > 0.001 && (o < 0.999 || !f.spring.resting)
      t.style.transform = soft ? `scale(${(1 + (1 - o) * 0.08).toFixed(4)})` : ""
      const fb = (1 - o) * 2.8 + blurFor(Math.abs(f.v) * 80, 1.8)
      t.style.filter = soft && fb >= 0.05 ? `blur(${fb.toFixed(2)}px)` : ""
    })
  })
  const radius = stage.val(50, 0.01)
  const rot = stage.val(0, 0.01)
  const scale = stage.val(1, 0.0005)
  const colour = new ColorVal(stage, COLOURS.Azure!)
  const fills = FILLS.map(() => stage.val(0, 0.002, true))
  on((v, how) => {
    const shape = SHAPES[v.shape]
    // A choice is a discrete step even from the hand: it travels.
    const h2: How = how === "init" ? "init" : "other"
    radius.go(shape.radius, h2, "default")
    rot.go(shape.rot, h2, "default")
    scale.go(shape.scale, h2, "default")
    colour.go(COLOURS[v.colour] ?? "#888", h2, "default")
    FILLS.forEach((f, j) => {
      fills[j]!.go(f === v.fill ? 1 : 0, h2, f === v.fill ? "default" : "snappy")
    })
    setCaption({ colour: v.colour, fill: v.fill, shape: v.shape })
  })
}

// ── Colour and motion ────────────────────────────────────────────────────────────────────────

category("Colour & motion")

{
  const s = section({
    id: "color",
    title: "Colour",
    code: "color()",
    what: "OKLCH, kept inside sRGB, stored as a string that drops straight into CSS. The sphere crosses over in OKLab; its glow follows a beat behind.",
    stage: true,
    tries: [
      "Drag the hue strip end to end: the sphere follows your hand, the glow trails it",
      "Press <kbd>r</kbd> in the panel: both cross over perceptually, never through grey",
      "<kbd>Enter</kbd> opens the editor; <kbd>←</kbd> <kbd>→</kbd> on a closed row turn the hue",
    ],
  })
  const { store, on } = define("color", "Colour", {
    tint: color("#ff7a45", { label: "Tint" }),
    glow: color("#ffb35c", { label: "Glow" }),
  })
  mount(store, s.slot, { title: "Sphere" })
  s.stage.innerHTML = `
    <div style="position:relative;width:150px;height:150px">
      <div data-glow style="position:absolute;inset:-30px;border-radius:50%;opacity:.55;-webkit-mask:radial-gradient(closest-side,#000,transparent);mask:radial-gradient(closest-side,#000,transparent)"></div>
      <div data-ball style="position:absolute;inset:25px;border-radius:50%;box-shadow:inset -10px -14px 28px rgba(0,0,0,.35),inset 8px 10px 18px rgba(255,255,255,.28)"></div>
    </div>`
  const ball = s.stage.querySelector<HTMLElement>("[data-ball]")!
  const glowEl = s.stage.querySelector<HTMLElement>("[data-glow]")!
  const ballBlur = new DirBlur(ball)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [
    "L ",
    { id: "l", decimals: 2 },
    "  C ",
    { id: "c", decimals: 2 },
    "  H ",
    { id: "h" },
    "°",
  ])
  const stage = new Stage(s.stage, () => {
    ball.style.backgroundColor = tint.css()
    glowEl.style.backgroundColor = glow.css()
    // Perceptual speed in OKLab: a fast hue scrub or Random blooms the sphere and trails the halo.
    const cSpeed = Math.hypot(tint.l.v, tint.a.v * 2.2, tint.b.v * 2.2) * 260
    const gSpeed = Math.hypot(glow.l.v, glow.a.v * 2.2, glow.b.v * 2.2) * 260
    const bSc = 1 + Math.min(0.05, cSpeed / 8000)
    const gSc = 1 + Math.min(0.1, gSpeed / 5000)
    ball.style.transform = bSc > 1.001 ? `scale(${bSc.toFixed(4)})` : ""
    glowEl.style.transform = gSc > 1.001 ? `scale(${gSc.toFixed(4)})` : ""
    const bb = blurFor(cSpeed * 0.45, 2)
    ballBlur.set(bb, bb)
  })
  const tint = new ColorVal(stage, "#ff7a45")
  const glow = new ColorVal(stage, "#ffb35c")
  on((v, how) => {
    tint.go(v.tint, how, "default")
    // The glow lags: a softer trail behind the hand, a little later otherwise.
    if (how === "init") glow.go(v.glow, "init")
    else glow.go(v.glow, "other", how === "hand" ? "trail" : "smooth", how === "hand" ? 0 : 70)
    const c = parseColor(v.tint)
    if (c) setCaption({ l: c.l, c: c.c, h: Math.round(c.h) })
  })
}

{
  const s = section({
    id: "point",
    title: "Point",
    code: "point()",
    what: "A 2D pad. The ring marks the default; y grows downward, as in CSS. The dot stretches along its path and the ring trails it.",
    stage: true,
    tries: [
      "Open the pad and fling the puck: the dot smears along its path and the ring catches up",
      "Press <kbd>⇧R</kbd> in the panel: both travel home on a spring",
      "<kbd>⌥</kbd> drags at 1/10 speed; arrows move it, <kbd>⇧</kbd> by ten",
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
  const setCaption = rolling(caption, [
    "x ",
    { id: "x", decimals: 2 },
    " · y ",
    { id: "y", decimals: 2 },
  ])
  const dotSmear = new Smear(dot)
  const trailSmear = new Smear(trail)
  const stage = new Stage(s.stage, () => {
    const k = size.x / 28
    dot.style.transform = `translate(${px(x.x * B)},${px(y.x * B)}) scale(${k.toFixed(4)})${dotSmear.transform(x.v * B, y.v * B, k, Math.abs(size.v) * 6)}`
    trail.style.transform = `translate(${px(tx.x * B)},${px(ty.x * B)})${trailSmear.transform(tx.v * B, ty.v * B)}`
  })
  const x = stage.val(0, 0.0005)
  const y = stage.val(0, 0.0005)
  const tx = stage.val(0, 0.0005)
  const ty = stage.val(0, 0.0005)
  const size = stage.val(14, 0.02)
  on((v, how) => {
    x.go(v.at.x, how)
    y.go(v.at.y, how)
    // The ring trails on the panel's softer spring, so the dot leads and it follows.
    tx.go(v.at.x, how === "init" ? "init" : "other", how === "hand" ? "trail" : "calm")
    ty.go(v.at.y, how === "init" ? "init" : "other", how === "hand" ? "trail" : "calm")
    size.go(v.size, how)
    setCaption({ x: v.at.x, y: v.at.y })
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
      "Scrub Position x fast: the cube smears sideways and is crisp the moment it stops",
      "Press <kbd>r</kbd> in the panel: it travels, turns and rescales at once",
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
  const facesHtml = `${face(`translateZ(${S / 2}px)`, 62)}${face(`rotateY(180deg) translateZ(${S / 2}px)`, 40)}${face(`rotateY(90deg) translateZ(${S / 2}px)`, 44)}${face(`rotateY(-90deg) translateZ(${S / 2}px)`, 50)}${face(`rotateX(90deg) translateZ(${S / 2}px)`, 80)}${face(`rotateX(-90deg) translateZ(${S / 2}px)`, 30)}`
  // The blur sits on a flat wrapper that holds the perspective, while 3D shutter sub-cubes fan
  // along the true rotateY arc and scale3d axes during 3D motion.
  s.stage.innerHTML = `<div data-view style="position:absolute;inset:0;display:grid;place-items:center;perspective:700px">
    <div data-cube style="grid-area:1/1;position:relative;width:${S}px;height:${S}px;transform-style:preserve-3d">${facesHtml}</div>
  </div>`
  const view = s.stage.querySelector<HTMLElement>("[data-view]")!
  const cube = s.stage.querySelector<HTMLElement>("[data-cube]")!
  const CUBE_TAPS = [
    { tau: -0.44, w: 0.16 },
    { tau: -0.22, w: 0.28 },
    { tau: 0.22, w: 0.28 },
    { tau: 0.44, w: 0.16 },
  ] as const
  const ghostCubes = CUBE_TAPS.map(() => {
    const g = h("div", "", facesHtml)
    g.style.cssText = `grid-area:1/1;position:relative;width:${S}px;height:${S}px;transform-style:preserve-3d;pointer-events:none;display:none`
    view.insertBefore(g, cube)
    return g
  })
  const blur = new DirBlur(view)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [
    { id: "x", decimals: 2 },
    ", ",
    { id: "y", decimals: 2 },
    " · ×",
    { id: "sx", decimals: 2 },
    " ",
    { id: "sy", decimals: 2 },
    " ",
    { id: "sz", decimals: 2 },
  ])
  const stage = new Stage(s.stage, () => {
    const pxX = x!.x * 90
    const pxY = y!.x * 52
    const vx = x!.v * 90
    const vy = y!.v * 52
    cube.style.transform = `translate(${px(pxX)},${px(pxY)}) rotateX(-24deg) rotateY(${spin!.x.toFixed(2)}deg) scale3d(${sx!.x.toFixed(4)},${sy!.x.toFixed(4)},${sz!.x.toFixed(4)})`
    const spinSpeed = Math.abs((spin!.v * Math.PI) / 180) * 34
    const scaleSpeed = Math.hypot(sx!.v, sy!.v, sz!.v) * 42
    const motion3d = spinSpeed + scaleSpeed
    const show3d = !reduced() && motion3d > 6
    const blend3d = show3d ? clamp01((motion3d - 6) / 110) : 0
    cube.style.opacity = (1 - blend3d * 0.24).toFixed(3)
    ghostCubes.forEach((g, idx) => {
      if (!show3d) {
        if (g.style.display !== "none") g.style.display = "none"
        return
      }
      if (g.style.display !== "block") g.style.display = "block"
      const { tau, w } = CUBE_TAPS[idx]!
      const dt = tau * 0.036
      const gx = pxX + vx * dt
      const gy = pxY + vy * dt
      const gSpin = spin!.x + spin!.v * dt
      const gsx = Math.max(0.15, sx!.x + sx!.v * dt)
      const gsy = Math.max(0.15, sy!.x + sy!.v * dt)
      const gsz = Math.max(0.15, sz!.x + sz!.v * dt)
      g.style.transform = `translate(${px(gx)},${px(gy)}) rotateX(-24deg) rotateY(${gSpin.toFixed(2)}deg) scale3d(${gsx.toFixed(4)},${gsy.toFixed(4)},${gsz.toFixed(4)})`
      g.style.opacity = (w * blend3d).toFixed(3)
    })
    // 2D translational velocity + a bridging component for 3D spin and scale.
    const transSpeed = Math.hypot(vx, vy)
    if (transSpeed >= 6) {
      const b = blurFor(transSpeed + motion3d * 0.45)
      blur.set((vx / transSpeed) * b, (vy / transSpeed) * b)
    } else {
      blur.set(blurFor(spinSpeed * 0.7 + scaleSpeed * 0.5, 2.2), blurFor(scaleSpeed * 0.5, 1.8))
    }
  })
  const [x, y, sx, sy, sz, spin] = [0, 0, 1, 1, 1, -32].map((n) => stage.val(n, 0.0005))
  on((v, how) => {
    x!.go(v.position.x, how)
    y!.go(v.position.y, how)
    sx!.go(v.scale.x, how)
    sy!.go(v.scale.y, how)
    sz!.go(v.scale.z, how)
    spin!.go(v.spin, how)
    setCaption({
      x: v.position.x,
      y: v.position.y,
      sx: v.scale.x,
      sy: v.scale.y,
      sz: v.scale.z,
    })
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
      "Press well inside the band and throw it: the highlight's edges travel on springs and smear",
      "<kbd>⇧R</kbd> resets: the band glides home and the bars brighten and dim as it passes",
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
  const bandBlur = new DirBlur(band)
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
  const setCaption = rolling(caption, [{ id: "lo" }, "–", { id: "hi" }, "%"])
  const stage = new Stage(s.stage, () => {
    const l = lo.x / 100
    const r = hi.x / 100
    const sc = Math.max(0.001, r - l)
    band.style.transform = `translateX(${px(l * W)}) scaleX(${sc.toFixed(4)})`
    // The band's own x is scaled, so divide to keep the smear the same on screen.
    const edge = (Math.max(Math.abs(lo.v), Math.abs(hi.v)) * W) / 100
    bandBlur.set(blurFor(edge) / sc, 0)
    bars.forEach((el, i) => {
      const at = (i + 0.5) / N
      const inside = clamp01(Math.min(at - l, r - at) * N + 0.5)
      el.style.opacity = (0.22 + 0.7 * inside).toFixed(3)
      el.style.transform = `scaleY(${(0.92 + 0.12 * inside).toFixed(4)})`
    })
  })
  const lo = stage.val(30, 0.02)
  const hi = stage.val(68, 0.02)
  on((v, how) => {
    lo.go(v.band[0], how)
    hi.go(v.band[1], how)
    setCaption({ lo: v.band[0], hi: v.band[1] })
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
      "Press <kbd>r</kbd> a few times: the arrow swings the short way round, smearing along its turn",
      "Hold <kbd>→</kbd> past 359°: it carries on through 0° without unwinding",
      "Drag the hand round; <kbd>⇧</kbd> snaps to 15°",
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
  const needleD = `M${D / 2} 22 L${D / 2 + 9} ${D / 2 + 4} L${D / 2} ${D / 2 - 4} L${D / 2 - 9} ${D / 2 + 4} Z`
  const ARC_TAPS = [
    { tau: -0.45, w: 0.14 },
    { tau: -0.3, w: 0.24 },
    { tau: -0.15, w: 0.42 },
    { tau: 0, w: 0.82 },
    { tau: 0.15, w: 0.42 },
    { tau: 0.3, w: 0.24 },
    { tau: 0.45, w: 0.14 },
  ] as const
  s.stage.innerHTML = `<div style="position:relative;width:${D}px;height:${D}px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line)">${ticks}
    <svg data-arrow width="${D}" height="${D}" viewBox="0 0 ${D} ${D}" style="position:absolute;inset:0;overflow:visible">
      <g data-fan>${ARC_TAPS.map((_, i) => `<path d="${needleD}" style="fill:var(--text);opacity:${i === 3 ? 1 : 0}"/>`).join("")}</g>
      <circle cx="${D / 2}" cy="${D / 2}" r="3" style="fill:var(--text)"/>
    </svg></div>`
  const arrow = s.stage.querySelector<SVGElement>("[data-arrow]")!
  const fan = s.stage.querySelector<SVGGElement>("[data-fan]")!
  const needlePaths = [...fan.querySelectorAll("path")]
  // Polar arc shutter blur: 7 rotated needle samples fanned around (D/2, D/2) + tangential bridge,
  // while the center pin sits outside `fan` and stays razor-sharp at every speed.
  const fanBlur = new DirBlur(fan)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [{ id: "deg" }, "°"])
  const stage = new Stage(s.stage, () => {
    arrow.style.transform = `rotate(${a.x.toFixed(3)}deg)`
    const av = Math.abs(a.v)
    if (reduced() || av < 8) {
      fanBlur.set(0, 0)
      needlePaths.forEach((p, i) => {
        const want = i === 3 ? "1" : "0"
        if (p.style.opacity !== want) p.style.opacity = want
        if (i !== 3 && p.hasAttribute("transform")) p.removeAttribute("transform")
      })
      return
    }
    const dDeg = Math.max(-34, Math.min(34, a.v * 0.032))
    const blend = clamp01((av - 8) / 160)
    ARC_TAPS.forEach(({ tau, w }, i) => {
      const p = needlePaths[i]!
      if (i !== 3)
        p.setAttribute("transform", `rotate(${(tau * dDeg).toFixed(2)} ${D / 2} ${D / 2})`)
      const op = i === 3 ? 1 - blend * (1 - w) : blend * w
      p.style.opacity = op.toFixed(3)
    })
    fanBlur.set(blurFor(((a.v * Math.PI) / 180) * 14, 1.8), 0)
  })
  const a = stage.val(45, 0.01)
  on((v, how) => {
    // The shortest way round from wherever the arrow is heading, keeping its velocity.
    const delta = ((((v.heading - a.target) % 360) + 540) % 360) - 180
    a.go(a.target + delta, how)
    setCaption({ deg: Math.round(v.heading) })
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
      "Click the die: tiles turn the short way in a sweep, softly blurred mid-turn",
      "Hold <kbd>→</kbd> on the row: each new seed retargets the turns already under way",
      "Drag Line: the strokes thicken on a spring",
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
  const SEED_TAPS = [
    { tau: -0.42, w: 0.18 },
    { tau: -0.21, w: 0.34 },
    { tau: 0, w: 0.76 },
    { tau: 0.21, w: 0.34 },
    { tau: 0.42, w: 0.18 },
  ] as const
  const arcD = `M0 ${T / 2} A${T / 2} ${T / 2} 0 0 0 ${T / 2} 0 M${T} ${T / 2} A${T / 2} ${T / 2} 0 0 0 ${T / 2} ${T}`
  const grid = h("div")
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${C},${T}px);grid-auto-rows:${T}px`
  const tiles = Array.from({ length: C * R }, () => {
    const el = h("div")
    el.innerHTML = `<svg width="${T}" height="${T}" viewBox="0 0 ${T} ${T}" style="display:block;overflow:visible">${SEED_TAPS.map((_, j) => `<path d="${arcD}" stroke-width="2" stroke-linecap="round" style="fill:none;stroke:var(--text);opacity:${j === 2 ? 1 : 0}"/>`).join("")}</svg>`
    grid.append(el)
    return el
  })
  const tilePaths = tiles.map((el) => [...el.querySelectorAll("path")])
  const allPaths = tilePaths.flat()
  s.stage.append(grid)
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, ["seed ", { id: "seed" }])
  const spinning = tiles.map(() => false)
  let lastWeight = ""
  const stage = new Stage(s.stage, () => {
    tiles.forEach((el, i) => {
      const r = rot[i]!
      el.style.transform = `rotate(${r.x.toFixed(2)}deg)`
      const rv = Math.abs(r.v)
      const ps = tilePaths[i]!
      if (reduced() || rv < 10) {
        if (spinning[i]) {
          spinning[i] = false
          ps.forEach((p, j) => {
            p.style.opacity = j === 2 ? "1" : "0"
            if (j !== 2) p.removeAttribute("transform")
          })
        }
        return
      }
      spinning[i] = true
      // Rotational arc shutter samples around the tile center (T/2, T/2), no CSS filter needed.
      const dDeg = Math.max(-28, Math.min(28, r.v * 0.034))
      const blend = clamp01((rv - 10) / 150)
      SEED_TAPS.forEach(({ tau, w }, j) => {
        const p = ps[j]!
        if (j !== 2)
          p.setAttribute("transform", `rotate(${(tau * dDeg).toFixed(2)} ${T / 2} ${T / 2})`)
        const op = j === 2 ? 1 - blend * (1 - w) : blend * w
        p.style.opacity = op.toFixed(3)
      })
    })
    const w = weight.x.toFixed(2)
    if (w !== lastWeight) {
      lastWeight = w
      for (const p of allPaths) p.setAttribute("stroke-width", w)
    }
  })
  const rot = tiles.map(() => stage.val(0, 0.05))
  const weight = stage.val(2, 0.005)
  on((v, how) => {
    const rnd = seeded(v.pattern)
    tiles.forEach((_, i) => {
      const want = rnd() < 0.5 ? 0 : 90
      const cur = rot[i]!.target
      // Turn the short way to the new orientation (half turns look the same).
      const delta = ((((want - cur) % 180) + 270) % 180) - 90
      const d = (i % C) + Math.floor(i / C)
      rot[i]!.go(cur + delta, how === "init" ? "init" : "other", "calm", d * 22)
    })
    weight.go(v.weight, how)
    setCaption({ seed: v.pattern })
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
      "Pick a preset chip: the sky sweeps from one to the other, every colour travelling in OKLab",
      "Throw Hour from 6 to 20: the sun rides its arc and the sky warms, then dims",
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
    <div data-mark class="abs" style="width:2px;height:20px;bottom:9px;top:auto;border-radius:1px;background:#fff"></div>
    <div data-clock class="caption right" style="color:rgba(255,255,255,.7)"></div>`
  const scene = s.stage.querySelector<HTMLElement>("[data-scene]")!
  const bar = s.stage.querySelector<HTMLElement>("[data-bar]")!
  const mark = s.stage.querySelector<HTMLElement>("[data-mark]")!
  const sun = s.stage.querySelector<HTMLElement>("[data-sun]")!
  const setClock = rolling(s.stage.querySelector<HTMLElement>("[data-clock]")!, [
    { id: "h", pad: 2 },
    ":",
    { id: "m", pad: 2 },
  ])
  const sunSmear = new Smear(sun)
  const markBlur = new DirBlur(mark)
  const N = 32
  const stage = new Stage(s.stage, () => {
    const t = clamp01(hour.x / 24)
    const labs = samples.map((c) => c.lab)
    bar.style.background = `linear-gradient(to right,${labs.map((l, i) => `${oklabCss(l)} ${((i / (N - 1)) * 100).toFixed(2)}%`).join(",")})`
    const f = t * (N - 1)
    const i0 = Math.min(N - 2, Math.floor(f))
    const u = f - i0
    scene.style.background = oklabCss(labs[i0]!.map((c, j) => lerp(c, labs[i0 + 1]![j]!, u)))
    const w = s.stage.clientWidth
    const vxMark = (hour.v / 24) * (w - 24)
    const stMark = stretchFor(vxMark, 0.35)
    mark.style.transform = `translateX(${px(12 + t * (w - 24) - 1)}) scaleX(${stMark.toFixed(4)})`
    markBlur.set(blurFor(vxMark) / stMark, 0)
    // The sun rides an arc from 6h to 18h, under the hills outside it.
    const day = (hour.x - 6) / 12
    const hh = s.stage.clientHeight
    const up = day < 0 || day > 1 ? -0.25 : Math.sin(Math.PI * clamp01(day))
    const sx = lerp(30, w - 30, clamp01(day))
    const sy = hh - 70 - up * (hh - 110)
    const vxDay = day >= 0 && day <= 1 ? ((w - 60) * hour.v) / 12 : 0
    const vyDay =
      day >= 0 && day <= 1 ? (-(hh - 110) * Math.cos(Math.PI * day) * Math.PI * hour.v) / 12 : 0
    sun.style.transform = `translate(${px(sx)},${px(sy)})${sunSmear.transform(vxDay, vyDay)}`
    sun.style.opacity = clamp01(up * 4 + 0.6).toFixed(3)
  })
  const hour = stage.val(18.5, 0.002)
  const samples = Array.from(
    { length: N },
    (_, i) => new ColorVal(stage, sampleGradient(SKIES.Clear, i / (N - 1))),
  )
  on((v, how) => {
    // Every sample travels to its new colour, in a quick left-to-right sweep for a preset.
    samples.forEach((c, i) => {
      c.go(sampleGradient(v.sky, i / (N - 1)), how, "calm", i * 5)
    })
    hour.go(v.hour, how, "calm")
    setClock({ h: Math.floor(v.hour) % 24, m: Math.round((v.hour % 1) * 60) })
  })
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
    what: "A strip of presets above the rows and named presets in a card's header. Switching ripples the rows top to bottom, and the cards follow one after another.",
    stage: true,
    tries: [
      "Press <kbd>]</kbd> repeatedly: the hand re-deals card by card, each smearing with its speed, and turns mid-flight",
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
  const blurs = cards.map((el) => new DirBlur(el))
  const stage = new Stage(s.stage, () => {
    const cx = s.stage.clientWidth / 2
    const cy = s.stage.clientHeight / 2 + 8
    cards.forEach((el, i) => {
      const c = cv[i]!
      const rad = (c.rot.x * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      // Turning about (50%, 130%) — 66 px below the card's center — sweeps the face along an arc.
      const vTurn = ((c.rot.v * Math.PI) / 180) * 66
      const vxLocal = c.x.v * cos + c.y.v * sin + vTurn
      const vyLocal = -c.x.v * sin + c.y.v * cos + c.s.v * 45
      const st = stretchFor(vxLocal, 0.1)
      el.style.transform = `translate(${px(cx + c.x.x)},${px(cy + c.y.x)}) rotate(${c.rot.x.toFixed(2)}deg) scale(${(c.s.x * st).toFixed(4)},${(c.s.x / Math.sqrt(st)).toFixed(4)})`
      blurs[i]!.speed(vxLocal, vyLocal, c.s.x)
    })
  })
  const cv = cards.map(() => ({
    x: stage.val(0, 0.02),
    y: stage.val(0, 0.02),
    rot: stage.val(0, 0.01),
    s: stage.val(1, 0.0005),
  }))
  on((v, how) => {
    cv.forEach((c, i) => {
      const k = i - 1.5
      const n = k / 1.5
      // A cascade, left to right, for anything but the hand.
      const delay = i * 28
      c.x.go(k * v.spacing, how, "calm", delay)
      c.y.go(-v.lift * (1 - n * n), how, "calm", delay)
      c.rot.go(k * v.tilt, how, "calm", delay)
      c.s.go(v.scale, how, "calm", delay)
    })
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
      "Drag Height: each change goes out as a message that slides into the log; the drawer answers on the spring you sent",
      "Turn Open off and on with a bouncy Spring: the drawer smears as it drops and rises",
      "Nudge from the device: the value lands in the panel without echoing back",
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
  let say = (_line: string) => {}
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
  drawer.style.cssText += "left:6px;width:104px;height:160px;border-radius:16px 16px 18px 18px"
  const handle = h("div")
  handle.style.cssText =
    "width:26px;height:4px;margin:7px auto 0;border-radius:2px;background:rgba(255,255,255,.55)"
  drawer.append(handle)
  phone.append(drawer)
  const logEl = h("div")
  logEl.style.cssText =
    "position:absolute;right:12px;top:12px;width:46%;height:150px;font:11px/18px var(--mono);color:var(--dim);overflow:hidden"
  const nudge = h("button", "chip quiet", "Nudge from device")
  nudge.style.cssText = "position:absolute;right:12px;bottom:12px"
  s.stage.append(phone, logEl, nudge)
  const LINE = 18
  const lines: { el: HTMLElement; pos: Val; o: Val; gone: boolean }[] = []
  const drawerBlur = new DirBlur(drawer)
  drawer.style.transformOrigin = "50% 100%"
  const stage = new Stage(s.stage, () => {
    const st = stretchFor(y.v, 0.08)
    drawer.style.transform = `translateY(${px(200 - y.x)}) scale(${(1 / Math.sqrt(st)).toFixed(4)},${st.toFixed(4)})`
    drawerBlur.set(0, blurFor(y.v * 1.25))
    drawer.style.backgroundColor = tint.css()
    for (const l of [...lines]) {
      const o = clamp01(l.o.x)
      if (l.gone && o <= 0.001 && l.o.spring.resting) {
        l.el.remove()
        stage.drop(l.pos)
        stage.drop(l.o)
        lines.splice(lines.indexOf(l), 1)
        continue
      }
      const fade = clamp01(1 - l.pos.x * 0.11)
      l.el.style.opacity = (o * fade).toFixed(3)
      const soft = !reduced() && (o < 0.999 || !l.pos.spring.resting)
      l.el.style.transform = `translateY(${px(l.pos.x * LINE)})${soft ? ` scale(${(0.96 + 0.04 * o).toFixed(4)})` : ""}`
      const b = (1 - o) * 3 + blurFor(l.pos.v * LINE * 1.8, 2.5)
      l.el.style.filter = soft && b >= 0.05 ? `blur(${b.toFixed(2)}px)` : ""
    }
  })
  const y = stage.val(96, 0.05)
  const tint = new ColorVal(stage, "#3a8dff")
  // A new message blooms in at the top; the others slide down a line; the ninth softens away.
  say = (text: string) => {
    const el = h("div")
    el.style.cssText =
      "position:absolute;left:0;right:0;top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform-origin:0 50%"
    el.textContent = text
    logEl.append(el)
    const line = { el, pos: stage.val(0, 0.002), o: stage.val(0, 0.002, true), gone: false }
    line.o.to(1, "default")
    lines.unshift(line)
    lines.forEach((l, i) => {
      if (l === line) return
      l.pos.to(i, "calm")
      if (i >= 8 && !l.gone) {
        l.gone = true
        l.o.to(0, "snappy")
      }
    })
  }
  render = (animate) => {
    const open = device["drawer.open"] === true
    const target = open ? Number(device["drawer.height"]) : -8
    // The device moves on its own spring: the one the panel sends.
    if (animate) {
      y.to(target, springMotion(device["drawer.spring"] as { duration: number; bounce: number }))
      tint.go(String(device["drawer.tint"]), "other")
    } else {
      y.snap(target)
      tint.go(String(device["drawer.tint"]), "init")
    }
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
