// knobs' home page: every control, down one scrolling page. A hero first (a dial on a field of
// light, with the knobs that drive it round its edges); then a few scenes, each one panel of several
// kinds of control driving something together (the lamp, the object and the dots and sky are
// drawn by WebGPU through controls-gpu.ts); then the panel's structure, a remote store, knobs/ui
// and the looks. ?gpu draws the panels with the WebGPU renderer, ?nogpu keeps the previews on the
// DOM, ?theme=light starts light. ⌘K lists the page's sections and controls.
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
  keybind,
  knob,
  log,
  type MountPanelOptions,
  meter,
  range,
  type Schema,
  type State,
  sampleGradient,
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
import dotsWgsl from "./controls-dots.wgsl?raw"
import { gpuView, initGpu, kelvinRgb, linearRgb, toLinear } from "./controls-gpu"
import {
  blurFor,
  clamp01,
  ColorVal,
  DirBlur,
  FEEL,
  type How,
  live,
  oklabCss,
  oklabRgb,
  px,
  rad,
  reduced,
  rgbaOf,
  Smear,
  Stage,
  stretchFor,
  type Val,
} from "./controls-motion"
import { heroScene } from "./controls-hero"
import { lampScene } from "./controls-scene-lamp"
import { motionScene } from "./controls-scene-motion"
import { objectScene } from "./controls-scene-object"
import skyWgsl from "./controls-sky.wgsl?raw"
import { uiSections } from "./controls-ui"
import { speakerToggle } from "./sound-toggle"

await initGpu()

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
  /** One to three words. */
  readonly title: string
  /** One short line under the title. */
  readonly sub?: string
  /** A hint, as the title's tooltip. */
  readonly tip?: string
  /** The kinds of control it shows, as tiny chips under the subtitle. */
  readonly shows?: readonly string[]
  /** A visual on the right (else the slot spans the row). */
  readonly stage?: boolean
  readonly wide?: boolean
  /** A scene: a big visual that a panel of several kinds of control drives. */
  readonly scene?: boolean
}
export function section(spec: SectionSpec) {
  const el = h("section", `demo${spec.wide ? " wide" : ""}${spec.scene ? " scene" : ""}`)
  el.id = spec.id
  const head = h("header")
  const title = h("h2")
  title.textContent = spec.title
  if (spec.tip) title.dataset.tip = spec.tip
  head.append(title)
  if (spec.sub) head.append(Object.assign(h("p"), { textContent: spec.sub }))
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
  main.append(el)
  sections.push({ id: spec.id, cat: currentCat, title: spec.title, el })
  return { el, slot, side, stage: stage as HTMLElement }
}

// ── Stores and panels ────────────────────────────────────────────────────────────────────────

const stores: { store: AnyControls; title: string }[] = []
const panels = new Map<string, Panel>()
const EAGER_STORES = new Set(["catalog-lamp", "catalog-object"])
const RESERVED_HEIGHT: Record<string, number> = {
  "catalog-motion": 308,
  "catalog-dots": 180,
  "catalog-sky": 180,
  "catalog-readouts": 520,
  "catalog-feed": 120,
  "catalog-tabs": 264,
  "catalog-folds": 234,
  "catalog-search": 498,
  "catalog-presets": 291,
  "catalog-gates": 438,
  "catalog-accessories": 236,
  "catalog-remote": 272,
  "catalog-looks": 384,
}
const pendingBySection = new Map<HTMLElement, (() => void)[]>()
const pendingByStore = new Map<string, () => void>()
const mountIo = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) mountSection(e.target as HTMLElement)
  },
  { root: scroller, rootMargin: "600px 0px" },
)

function mountSection(sec: HTMLElement) {
  const fns = pendingBySection.get(sec)
  if (!fns) return
  pendingBySection.delete(sec)
  mountIo.unobserve(sec)
  for (const fn of fns) fn()
}

function mountUpTo(target: HTMLElement) {
  const sec =
    target.closest<HTMLElement>("section.demo") ??
    (target.nextElementSibling?.closest<HTMLElement>("section.demo") || target)
  for (const info of sections) {
    mountSection(info.el)
    if (info.el === sec) break
  }
  mountSection(sec)
}

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
  sound: true,
})

export function mount(store: AnyControls, slot: HTMLElement, options: MountPanelOptions = {}) {
  const run = () => {
    slot.style.minHeight = ""
    const panel = mountPanel(store, slot, { ...panelOptions(), ...options })
    if (!panels.has(store.id)) panels.set(store.id, panel)
  }
  const sec = slot.closest<HTMLElement>("section.demo")
  if (!sec || EAGER_STORES.has(store.id)) {
    run()
    return
  }
  const minH = RESERVED_HEIGHT[store.id]
  if (minH) slot.style.minHeight = `${minH}px`
  let list = pendingBySection.get(sec)
  if (!list) {
    list = []
    pendingBySection.set(sec, list)
    mountIo.observe(sec)
  }
  let done = false
  const once = () => {
    if (done) return
    done = true
    run()
  }
  list.push(once)
  const prev = pendingByStore.get(store.id)
  pendingByStore.set(
    store.id,
    prev
      ? () => {
          prev()
          once()
        }
      : once,
  )
}

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

// ── Hero ─────────────────────────────────────────────────────────────────────────────────────

heroScene(kit, document.getElementById("hero")!)

// ── Scenes ───────────────────────────────────────────────────────────────────────────────────

category("Scenes")
const lamp = lampScene(kit)
objectScene(kit)
motionScene(kit)

{
  const s = section({
    id: "dots",
    title: "Dots",
    sub: "Four sliders and a row of metaballs.",
    shows: ["knob()"],
    stage: true,
    scene: true,
  })
  const { store, on } = define("dots", "Dots", {
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
  // WebGPU lights the metaball field; DOM dots stand in without it.
  const view = gpuView(s.stage, { wgsl: dotsWgsl, label: "dots", tone: "neutral", bloom: 0.03 })
  const domDots = view
    ? null
    : Array.from({ length: MAX }, () => {
        const el = h("div", "abs")
        el.style.cssText +=
          "width:2px;height:2px;margin:-1px 0 0 -1px;border-radius:50%;background:var(--text)"
        s.stage.append(el)
        return el
      })
  // The stage's own colour, read from the theme (not the page's background, which is mid-transition).
  const probe = h("div")
  probe.style.cssText = "display:none;background:var(--page);color:var(--surface)"
  s.stage.append(probe)
  const stageColor = () => {
    const page = rgbaOf(getComputedStyle(probe).backgroundColor)
    const surf = rgbaOf(getComputedStyle(probe).color)
    return [0, 1, 2].map((j) => page[j]! + (surf[j]! - page[j]!) * surf[3]!)
  }
  let bgFrom = stageColor()
  let bgTo = bgFrom
  let inkFrom = rgbaOf(getComputedStyle(s.stage).color)
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
  // Shutter travel (px) for the coverage integrator: C¹ toe near rest, up to 16 px on throws.
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
    const w = stage.width || s.stage.clientWidth
    const h = stage.height || s.stage.clientHeight
    const cx = w / 2
    const cy = h / 2
    // A hidden dot rides inside its neighbour, so it buds from wherever that one is.
    if (!reduced())
      for (let i = 1; i < MAX; i++)
        if (!shown[i] && !merging[i]) {
          dots[i]!.x.spring.target = dots[i - 1]!.x.x
          dots[i]!.y.spring.target = dots[i - 1]!.y.x
        }
    let maxShift = 0
    const data = view?.data
    data?.fill(0, 4)
    dots.forEach((d, i) => {
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
      const x = cx + d.x.x
      const y = cy + d.y.x
      const r = Math.max(0, d.r.x) * (1 + d.pulse.x)
      const a = clamp01(d.a.x)
      const rBlur = dotRadialBlur(d.r.v + d.r.x * d.pulse.v)
      // Pouring in, it draws out into a teardrop along its path and snaps into the neighbour.
      const stretch = Math.max(dotStretch(speed), 1 + 0.62 * Math.sin(t * Math.PI))
      const blur = dotBlur(speed)
      if (!data) {
        const el = domDots![i]!
        const ang = speed > 0.5 ? ((Math.atan2(vy, vx) * 180) / Math.PI).toFixed(1) : "0"
        el.style.opacity = (r < 0.05 ? 0 : a).toFixed(3)
        el.style.transform = `translate(${px(x)},${px(y)}) rotate(${ang}deg) scale(${(r * stretch).toFixed(3)},${(r / Math.sqrt(stretch)).toFixed(3)})`
        return
      }
      data.set([x, y, r, a], 4 + i * 4)
      data.set(
        [speed > 0.001 ? vx / speed : 1, speed > 0.001 ? vy / speed : 0, stretch, blur],
        4 + (8 + i) * 4,
      )
      data.set([neck, rBlur], 4 + 16 * 4 + i * 2)
      if (r >= 0.05) maxShift = Math.max(maxShift, blur + Math.abs(rBlur))
    })
    if (!view || !data) return
    const samples = maxShift < 0.15 ? 1 : Math.min(14, Math.max(4, Math.ceil(maxShift * 1.1)))
    const gooOn = !reduced()
    const color = inkAt()
    const bg = bgFrom.map((c, j) => c + (bgTo[j]! - c) * clamp01(ink.x))
    data.set([gooOn ? k : 0, gooOn ? 1 : 0, samples, dpr], 4 + 20 * 4)
    const ca = color[3] ?? 1
    const inkLin = [0, 1, 2].map((j) => toLinear(bg[j]! + (color[j]! - bg[j]!) * ca))
    const lum = 0.2126 * bg[0]! + 0.7152 * bg[1]! + 0.0722 * bg[2]!
    data.set([inkLin[0]!, inkLin[1]!, inkLin[2]!, lum > 0.5 ? 1 : 0], 4 + 21 * 4)
    data.set([toLinear(bg[0]!), toLinear(bg[1]!), toLinear(bg[2]!), k / 0.78], 4 + 22 * 4)
    view.render()
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
  new MutationObserver(() => {
    const t = clamp01(ink.x)
    bgFrom = bgFrom.map((c, j) => c + (bgTo[j]! - c) * t)
    bgTo = stageColor()
    inkFrom = inkAt() as typeof inkFrom
    inkTo = rgbaOf(getComputedStyle(s.stage).color)
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
    // Mark the new state first: drawing (which every snap does off screen) pulls hidden dots
    // into their neighbours, so a dot about to show must already count as shown.
    const was = [...shown]
    for (let i = 0; i < MAX; i++) shown[i] = i < v.count
    for (let i = 0; i < MAX; i++) {
      const d = dots[i]!
      const on = i < v.count
      if (on) {
        const [tx, ty] = slot(i)
        if (!was[i] && how !== "init") {
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
        if (how === "init" || !was[i]) {
          d.x.snap(last[0])
          d.y.snap(last[1])
        }
        d.r.go(reduced() ? r0 : 0, how === "init" ? "init" : "other")
        d.a.go(reduced() ? 0 : 1, how === "init" ? "init" : "other")
      } else if (was[i] && !merging[i]) {
        // Merge: it pours into its neighbour, wherever that one is heading.
        merging[i] = { x: d.x.x, y: d.y.x, r: Math.max(0, d.r.x), at: performance.now() }
        pour()
      }
    }
    if (how !== "init" && v.count !== count) live.log(`Dots ${count} → ${v.count}`, "debug")
    count = v.count
  })
}

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
    id: "sky",
    title: "Sky",
    sub: "A gradient, read as the sky through a day.",
    shows: ["gradient()", "knob()", "toggle()"],
    stage: true,
    scene: true,
  })
  const { store, on } = define("sky", "Sky", {
    sky: gradient(SKIES.Clear, { label: "Sky by hour", presets: SKIES }),
    hour: knob(17.5, { min: 0, max: 24, step: 0.25, unit: "h", label: "Hour" }),
    clouds: knob(0.45, { min: 0, max: 1, step: 0.01, label: "Clouds" }),
    stars: toggle(true, { label: "Stars" }),
  })
  mount(store, s.slot, { title: "Sky" })
  s.stage.style.display = "block"
  s.stage.innerHTML = `
    <div data-dom data-scene style="position:absolute;inset:0"></div>
    <div data-dom data-sun class="abs" style="width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff6dc;box-shadow:0 0 24px rgba(255,236,190,.8)"></div>
    <svg data-dom viewBox="0 0 400 120" preserveAspectRatio="none" style="position:absolute;left:0;right:0;bottom:38px;width:100%;height:70px">
      <path d="M0 80 C60 40 110 50 170 72 C230 94 290 40 400 58 L400 120 L0 120Z" fill="rgba(0,0,0,.32)"/>
      <path d="M0 100 C80 74 160 90 230 100 C300 110 350 86 400 92 L400 120 L0 120Z" fill="rgba(0,0,0,.45)"/>
    </svg>
    <div style="position:absolute;left:0;right:0;bottom:0;height:38px;background:rgba(0,0,0,.45)"></div>
    <div data-bar style="position:absolute;left:12px;right:12px;bottom:12px;height:14px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)"></div>
    <div data-mark class="abs" style="width:2px;height:20px;bottom:9px;top:auto;border-radius:1px;background:#fff"></div>
`
  const view = gpuView(s.stage, {
    wgsl: skyWgsl,
    label: "sky",
    tone: "agx",
    bloom: 0.09,
    exposure: 1.2,
    saturation: 1.12,
  })
  if (view) for (const el of s.stage.querySelectorAll<HTMLElement>("[data-dom]")) el.remove()
  const scene = s.stage.querySelector<HTMLElement>("[data-scene]")
  const sun = s.stage.querySelector<HTMLElement>("[data-sun]")
  const bar = s.stage.querySelector<HTMLElement>("[data-bar]")!
  const mark = s.stage.querySelector<HTMLElement>("[data-mark]")!
  const sunSmear = sun ? new Smear(sun) : null
  const markBlur = new DirBlur(mark)
  const N = 32
  let lastBar = ""
  const stage = new Stage(s.stage, () => {
    const t = clamp01(hour.x / 24)
    const labs = samples.map((c) => c.lab)
    const barBg = `linear-gradient(to right,${labs.map((l, i) => `${oklabCss(l)} ${((i / (N - 1)) * 100).toFixed(2)}%`).join(",")})`
    if (barBg !== lastBar) {
      lastBar = barBg
      bar.style.background = barBg
    }
    const f = t * (N - 1)
    const i0 = Math.min(N - 2, Math.floor(f))
    const u = f - i0
    const now = labs[i0]!.map((c, j) => lerp(c, labs[i0 + 1]![j]!, u))
    const w = stage.width || s.stage.clientWidth
    const vxMark = (hour.v / 24) * (w - 24)
    const stMark = stretchFor(vxMark, 0.35)
    mark.style.transform = `translateX(${px(12 + t * (w - 24) - 1)}) scaleX(${stMark.toFixed(4)})`
    markBlur.set(blurFor(vxMark) / stMark, 0)
    // The sun rides an arc from 6h to 18h, under the hills outside it.
    const day = (hour.x - 6) / 12
    if (view) {
      const elev = Math.sin(Math.PI * day)
      // Warmer and dimmer as it nears the horizon.
      const sc = kelvinRgb(2000 + 4000 * clamp01(elev) ** 0.6)
      const k = 3.2 * clamp01(elev * 3 + 0.4)
      const sky = linearRgb(oklabRgb(now))
      // Overhead, the ramp two hours further from noon: deeper by day, night coming at dusk.
      const zh = clamp01((hour.x + (hour.x < 12 ? -2 : 2)) / 24) * (N - 1)
      const z0 = Math.min(N - 2, Math.floor(zh))
      const zenith = linearRgb(
        oklabRgb(labs[z0]!.map((c, j) => lerp(c, labs[z0 + 1]![j]!, zh - z0))),
      )
      view.data.set([sky[0], sky[1], sky[2], day, sc[0] * k, sc[1] * k, sc[2] * k, elev], 4)
      view.data.set([starsOn.x, clouds.x, 0, 7, zenith[0], zenith[1], zenith[2], 0], 12)
      view.render()
      return
    }
    scene!.style.background = oklabCss(now)
    const hh = stage.height || s.stage.clientHeight
    const up = day < 0 || day > 1 ? -0.25 : Math.sin(Math.PI * clamp01(day))
    const sx = lerp(30, w - 30, clamp01(day))
    const sy = hh - 70 - up * (hh - 110)
    const vxDay = day >= 0 && day <= 1 ? ((w - 60) * hour.v) / 12 : 0
    const vyDay =
      day >= 0 && day <= 1 ? (-(hh - 110) * Math.cos(Math.PI * day) * Math.PI * hour.v) / 12 : 0
    sun!.style.transform = `translate(${px(sx)},${px(sy)})${sunSmear!.transform(vxDay, vyDay)}`
    sun!.style.opacity = clamp01(up * 4 + 0.6).toFixed(3)
  })
  const hour = stage.val(17.5, 0.002)
  const clouds = stage.val(0.45, 0.001)
  const starsOn = stage.val(1, 0.002, true)
  const samples = Array.from(
    { length: N },
    (_, i) => new ColorVal(stage, sampleGradient(SKIES.Clear, i / (N - 1))),
  )
  let lastSky: unknown = null
  on((v, how) => {
    // Every sample travels to its new colour, in a quick left-to-right sweep for a preset.
    if (v.sky !== lastSky) {
      lastSky = v.sky
      samples.forEach((c, i) => {
        c.go(sampleGradient(v.sky, i / (N - 1)), how, "calm", i * 5)
      })
    }
    hour.go(v.hour, how, "calm")
    clouds.go(v.clouds, how, "calm")
    starsOn.go(v.stars ? 1 : 0, how === "init" ? "init" : "other", "calm")
  })
}

{
  const s = section({
    id: "readouts",
    title: "Readouts",
    sub: "This page's frames, GPU time and lamp output, live.",
    shows: ["watch()", "sparkline()", "graph()", "meter()", "table()", "log()", "readout()"],
  })
  const { store: feed, on } = define("feed", "Feed", {
    running: toggle(true, { label: "Running" }),
    flick: action("Flick lamp", {
      run: () => lamp.set({ on: !lamp.get().on }, { source: "remote" }),
    }),
  })
  const { store: watched } = define("readouts", "Readouts", {
    frame: graph({
      label: "Frame",
      series: [
        { id: "frame", label: "Frame", area: true },
        { id: "gpu", label: "GPU" },
      ],
      unit: "ms",
      decimals: 1,
      min: 0,
      height: 56,
      thresholds: [{ value: 16.7, label: "60 fps" }],
    }),
    fps: watch({ label: "FPS", decimals: 0 }),
    moving: watch({ label: "Moving previews", decimals: 0 }),
    light: meter({
      label: "Lamp output",
      max: 1600,
      unit: "lm",
      decimals: 0,
      warn: 1200,
      critical: 1500,
    }),
    energy: sparkline({ label: "Light", unit: "lm", decimals: 0, min: 0 }),
    views: table({ label: "WebGPU views", columns: ["View", "Renders", "GPU ms"] }),
    events: log({ label: "Events", lines: 6 }),
  })
  mount(watched, s.slot, { title: "This page", header: { title: true, buttons: [] } })
  const right = h("div", "slot")
  s.side.prepend(right)
  mount(feed, right, { title: "Feed" })
  // A readout on its own, outside any panel.
  const solo = readout(sparkline({ label: "FPS", decimals: 0, min: 0 }), { theme })
  const soloRow = h("div")
  soloRow.style.cssText = "display:flex;flex-direction:column;gap:6px"
  const soloNote = h("div", "", "<code>readout()</code>, outside a panel")
  soloNote.style.cssText = "color:var(--dim);font-size:12px"
  solo.element.style.cssText += ";max-width:300px"
  soloRow.append(soloNote, solo.element)
  s.side.append(soloRow)
  let visible = false
  let timer = 0
  let frames = live.frames
  let still = 0
  let lumens = -1
  let n = 0
  live.log("Page built")
  const tick = () => {
    n++
    const stepped = live.frames - frames
    frames = live.frames
    if (stepped > 0) {
      still = 0
      const fps = Math.min(240, 1000 / Math.max(1, live.frameMs))
      watched.watch("frame", { frame: live.frameMs, gpu: live.gpuMs / stepped })
      watched.watch("fps", fps)
      solo.push(fps)
    } else if (++still === 3) live.log("Nothing moving: the loop sleeps", "debug")
    live.gpuMs = 0
    watched.watch("moving", stepped > 0 ? live.moving : 0)
    if (Math.abs(live.lumens - lumens) > 0.5) {
      lumens = live.lumens
      watched.watch("light", lumens)
      watched.watch("energy", lumens)
    }
    if (n % 10 === 1)
      watched.watch(
        "views",
        [...live.views].map(([name, v]) => [name, v.renders, +v.ms.toFixed(2)]),
      )
    for (const e of live.events.splice(0)) watched.watch("events", e)
  }
  const sync = () => {
    const run = visible && feed.get().running
    if (run && !timer) timer = window.setInterval(tick, 100)
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

category("Panel")

let structureSide!: HTMLElement
let rowsSide!: HTMLElement

{
  const s = section({
    id: "structure",
    title: "Structure",
    sub: "Tabs, sub-headings and folding groups.",
    tip: "⌥1, ⌥2 and ⌥3 switch tabs.",
    shows: ["tab", "subsection", "folded", "keybind()"],
  })
  structureSide = s.side
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
    burst: keybind("Shift+B", { label: "Burst key", group: "emitter" }),
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
  const s = { slot: h("div", "slot") }
  structureSide.prepend(s.slot)
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
    title: "Search",
    sub: "Filter rows by name, then by chip.",
    tip: "Press / inside the panel.",
    shows: ["search: { chips }"],
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
    sub: "Presets for the whole panel and for one group.",
    tip: "[ and ] step through them.",
    shows: ["presets", "groupPresets"],
    stage: true,
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
    const cx = (stage.width || s.stage.clientWidth) / 2
    const cy = (stage.height || s.stage.clientHeight) / 2 + 8
    cards.forEach((el, i) => {
      const c = cv[i]!
      const a = rad(c.rot.x)
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      // Turning about (50%, 130%) — 66 px below the card's center — sweeps the face along an arc.
      const vTurn = rad(c.rot.v) * 66
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
    id: "rows",
    title: "Row states",
    sub: "Disabled, read-only and mixed rows, and accessories of your own.",
    shows: ["disabled", "readOnly", "setMixed", "rowAccessory"],
  })
  rowsSide = s.side
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
  const s = { slot: h("div", "slot") }
  rowsSide.prepend(s.slot)
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
  s.slot.after(pinned$)
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

{
  const s = section({
    id: "remote",
    title: "Remote",
    sub: "A store built from descriptors, talking to a pretend phone.",
    shows: ["createRemoteControls()"],
    stage: true,
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
uiSections({ section, h, theme: () => theme, define, mount })

// ── Matching your app ────────────────────────────────────────────────────────────────────────

category("Matching your app")

{
  const s = section({
    id: "looks",
    title: "Looks",
    sub: "One store in three looks: default, labPreset and flat.",
    shows: ["labPreset", "--k-frame: flat"],
    wide: true,
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
speakerToggle(document.getElementById("sound") as HTMLButtonElement)

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

// The side index and the narrow strip, following the scroll.
const index = document.getElementById("index")!
const strip = document.getElementById("strip")!
const links = new Map<string, HTMLAnchorElement>()
const catLinks = new Map<string, HTMLAnchorElement>()
const jump = (el: HTMLElement) => (e: Event) => {
  e.preventDefault()
  mountUpTo(el)
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
// The brand goes back up to the hero.
document.getElementById("brand")!.addEventListener("click", (e) => {
  e.preventDefault()
  scroller.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" })
  history.replaceState(null, "", location.pathname + location.search)
})
// The Lab, the dense editor this page used to sit beside.
index.append(Object.assign(h("div", "cat"), { textContent: "More" }))
index.append(Object.assign(h("a"), { textContent: "Lab", href: "lab.html" }))
strip.append(Object.assign(h("a"), { textContent: "Lab", href: "lab.html" }))
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
if (location.hash) {
  const target = document.getElementById(location.hash.slice(1))
  if (target) {
    mountUpTo(target)
    target.scrollIntoView({ block: "start" })
  }
}

// ⌘K: the page's sections, then every store's actions, presets and fields.
const reveal = (store: AnyControls) => (key: string) => {
  pendingByStore.get(store.id)?.()
  const panelEl = document.querySelector<HTMLElement>(`[data-controls="${store.id}"]`)
  if (panelEl) mountUpTo(panelEl)
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

Object.assign(window, { __catalog: { stores, panels, palette, toast, live } })
