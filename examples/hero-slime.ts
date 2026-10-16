/// <reference types="@webgpu/types" />
// A hero: a slime mould. About a million agents crawl a trail field in compute shaders
// (hero-slime-sim.wgsl), each smelling ahead, turning toward the strongest scent and leaving its
// own, and a living network grows out of them: veins that branch, merge and pulse. A render pass
// (hero-slime-look.wgsl) lights the field as raised, glowing tubes, and the catalog's post pass
// (controls-post.wgsl) blooms, tones and dithers it into the page's own dark. The knobs panel
// beside it steers the agents; the pointer is food: wherever it hovers smells faintly, and a
// press or drag sets the Food row, so the network reroutes toward it. Without WebGPU (or with
// ?nogpu), a still of it stands in (assets/hero-slime-still.jpg, from window.__heroSlime.reseed).
import { choice, defineControls, knob, point, springMotion, type Values } from "knobs"
import { mountPanel } from "knobs/panel"
import postWgsl from "./controls-post.wgsl?raw"
import lookWgsl from "./hero-slime-look.wgsl?raw"
import simWgsl from "./hero-slime-sim.wgsl?raw"

const stillUrl = new URL("./assets/hero-slime-still.jpg", import.meta.url).href

const PALETTES = ["Ember", "Abyss", "Moss", "Orchid"] as const
type Palette = (typeof PALETTES)[number]
/** Each palette: fresh trail (deep, body, core), then the kept highways' (deep, body, core). */
const RAMPS: Record<Palette, readonly string[]> = {
  Ember: ["#2b0a04", "#c2410c", "#ffcf8a", "#3a1704", "#f08a24", "#fff0d2"],
  Abyss: ["#03121f", "#0b84b8", "#a8f0ff", "#0b0f33", "#4d5ee8", "#dfe4ff"],
  Moss: ["#08200f", "#2f9a50", "#d6ffb0", "#1a2406", "#9abb2c", "#f6ffd2"],
  Orchid: ["#24072e", "#a63fcf", "#ffc8f0", "#062430", "#23b3a4", "#d2fff3"],
}

// The ranges are the band where the mould makes networks: past them it smears into fog, stalls
// in dots or collapses into one fat loop, so Random (around the preset) stays beautiful.
const schema = {
  senseAngle: knob(22.5, { min: 15, max: 85, step: 0.5, unit: "°", label: "Sense angle" }),
  senseDist: knob(9, { min: 5, max: 28, step: 0.5, unit: "px", label: "Sense dist" }),
  turn: knob(45, { min: 10, max: 50, step: 1, unit: "°", label: "Turn" }),
  speed: knob(1, { min: 0.7, max: 1.8, step: 0.05, label: "Speed" }),
  decay: knob(20, { min: 6, max: 28, step: 0.5, unit: "%", label: "Decay" }),
  population: knob(50, { min: 35, max: 90, step: 1, unit: "%", label: "Population" }),
  palette: choice("Ember", PALETTES, { label: "Palette" }),
  food: point({ x: 0.36, y: 0.56 }, { min: 0, max: 1, step: 0.005, label: "Food", random: false }),
}
type V = Values<typeof schema>
const PRESETS: Record<string, Partial<V>> = {
  Coral: {
    senseAngle: 80,
    senseDist: 10,
    turn: 40,
    speed: 1.2,
    decay: 15,
    population: 70,
    palette: "Orchid",
    food: { x: 0.4, y: 0.5 },
  },
  Mesh: {
    senseAngle: 60,
    senseDist: 6,
    turn: 30,
    speed: 1,
    decay: 15,
    population: 60,
    palette: "Abyss",
    food: { x: 0.3, y: 0.62 },
  },
  Streams: {
    senseAngle: 20,
    senseDist: 25,
    turn: 10,
    speed: 1.5,
    decay: 8,
    population: 65,
    palette: "Moss",
    food: { x: 0.37, y: 0.52 },
  },
}

/** Sim steps a second (the agents' clock, whatever the display's rate). */
const RATE = 60
/** The most agents there are room for, and how many a cell holds at full population. */
const MAX_AGENTS = 1 << 20
const PER_CELL = 0.9
/** The most cells the trail field has: above it, a cell spans more than a CSS pixel. */
const MAX_CELLS = 1_300_000
const DEPOSIT = 1
const HDR: GPUTextureFormat = "rgba16float"
const LEVELS = 5
const PRESET_GLIDE = springMotion({ duration: 1.2, bounce: 0 })
const HAND_SWAP = springMotion({ duration: 0.35, bounce: 0 })
const ENTRANCE = springMotion({ duration: 1.1, bounce: 0 })
const FADE = springMotion({ duration: 0.2, bounce: 0 })
const CHURN = springMotion({ duration: 2.4, bounce: 0 })
/** The chance an agent respawns a step: always a little, and much more while it changes. */
const RESPAWN = [0.0003, 0.012] as const

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
const reduced = () => reducedQuery.matches
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
const hexLinear = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "")
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
}
const rampOf = (p: Palette) => RAMPS[p].map(hexLinear)

/** One number on a critically damped spring: retargets keep position and velocity. */
class Glide {
  v = 0
  target: number
  omega = PRESET_GLIDE.omega
  constructor(public x: number) {
    this.target = x
  }
  to(target: number, spring = PRESET_GLIDE) {
    this.target = target
    this.omega = spring.omega
  }
  snap(x: number) {
    this.x = this.target = x
    this.v = 0
  }
  step(dt: number) {
    const d = this.x - this.target
    if (Math.abs(d) < 1e-5 && Math.abs(this.v) < 1e-4) {
      this.x = this.target
      this.v = 0
      return
    }
    const w = this.omega
    const e = Math.exp(-w * dt)
    const c = this.v + w * d
    this.x = this.target + (d + c * dt) * e
    this.v = (this.v - c * w * dt) * e
  }
}

export function mountHeroSlime(host: HTMLElement): { dispose(): void } {
  const made: HTMLElement[] = []
  const part = (cls: string, make: () => HTMLElement) => {
    const found = host.querySelector<HTMLElement>(`.${cls}`)
    if (found) return found
    const el = make()
    el.className = cls
    host.append(el)
    made.push(el)
    return el
  }
  const stageEl = part("hero-stage", () => document.createElement("div"))
  const titleEl = part("hero-title", () => {
    const el = document.createElement("div")
    const h1 = document.createElement("h1")
    h1.textContent = "knobs"
    el.append(h1)
    return el
  })
  const slot = part("hero-panel", () => document.createElement("div"))
  const narrow = matchMedia("(max-width: 900px)")
  const cleanup: (() => void)[] = []
  const listen = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => {
    el.addEventListener(type, fn)
    cleanup.push(() => el.removeEventListener(type, fn))
  }

  // ── The values: rows glide the sim there, except under the hand, which moves it at once ──
  const glides = {
    senseAngle: new Glide(0),
    senseDist: new Glide(0),
    turn: new Glide(0),
    speed: new Glide(0),
    decay: new Glide(0),
    population: new Glide(0),
    foodX: new Glide(0),
    foodY: new Glide(0),
  }
  type G = keyof typeof glides
  let palette = rampOf("Ember")
  let palFrom = palette
  let palTo = palette
  const palMix = new Glide(1)
  let dragging = false
  let wake = () => {}
  const churn = new Glide(0)
  const apply = (v: V, how: "init" | "hand" | "other") => {
    const set = (k: G, x: number) => {
      const g = glides[k]
      if (how === "init" || how === "hand" || reduced()) g.snap(x)
      else g.to(x)
    }
    set("senseAngle", v.senseAngle)
    set("senseDist", v.senseDist)
    set("turn", v.turn)
    set("speed", v.speed)
    set("decay", v.decay)
    set("population", v.population)
    if (!dragging) {
      set("foodX", v.food.x)
      set("foodY", v.food.y)
    }
    const next = rampOf(v.palette as Palette)
    if (how === "init") {
      palette = palFrom = palTo = next
      palMix.snap(1)
    } else if (RAMPS[v.palette as Palette] !== lastRamp) {
      palFrom = palette
      palTo = next
      palMix.snap(0)
      palMix.to(1, reduced() ? FADE : how === "hand" ? HAND_SWAP : PRESET_GLIDE)
    }
    lastRamp = RAMPS[v.palette as Palette]
    // A new habit: the old network dissolves into it (less so under the hand's small moves).
    if (how !== "init") {
      churn.snap(Math.max(churn.x, how === "hand" ? 0.25 : 1))
      churn.to(0, CHURN)
    }
    wake()
  }
  let lastRamp = RAMPS.Ember

  const store = defineControls("hero-slime", schema, {
    enabled: true,
    storage: null,
    defaultLabel: "Veins",
    presets: PRESETS,
    onChange(_patch, values, meta) {
      apply(values, meta.source === "local" ? "hand" : "other")
    },
  })
  apply(store.get(), "init")
  const panel = mountPanel(store, slot, {
    title: "Physarum",
    theme: "dark",
    session: false,
    variants: false,
    haptics: false,
    sound: false,
  })
  const panelEl = () => slot.querySelector<HTMLElement>(".knobs-panel")
  // The Food pad starts open: it's the pointer's twin.
  slot
    .querySelector<HTMLElement>('[data-field="food"] .knobs-x-head[aria-expanded="false"]')
    ?.click()

  // ── The pointer: a faint scent where it hovers; pressed, it puts the food down ──
  const hover = { x: 0, y: 0, amp: new Glide(0) }
  const local = (e: PointerEvent) => {
    const r = stageEl.getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const
  }
  const nearFood = (e: PointerEvent) => {
    const r = stageEl.getBoundingClientRect()
    const fx = r.left + glides.foodX.x * r.width
    const fy = r.top + glides.foodY.x * r.height
    return Math.hypot(e.clientX - fx, e.clientY - fy) < 22
  }
  let first = true
  const putFood = (x: number, y: number) => {
    const fx = clamp01(x)
    const fy = clamp01(y)
    glides.foodX.snap(fx)
    glides.foodY.snap(fy)
    const round = (n: number) => Math.round(n * 200) / 200
    const food = { x: round(fx), y: round(fy) }
    const now = store.get().food
    if (food.x !== now.x || food.y !== now.y) store.set({ food }, { coalesce: !first })
    first = false
  }
  listen(stageEl, "pointerdown", (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    stageEl.setPointerCapture(e.pointerId)
    dragging = true
    first = true
    stageEl.style.cursor = "grabbing"
    const [x, y] = local(e)
    putFood(x, y)
    wake()
  })
  listen(stageEl, "pointermove", (e) => {
    const [x, y] = local(e)
    hover.x = x
    hover.y = y
    if (dragging) putFood(x, y)
    else {
      hover.amp.to(e.pointerType === "mouse" ? 1 : 0, HAND_SWAP)
      stageEl.style.cursor = nearFood(e) ? "grab" : "crosshair"
    }
    wake()
  })
  const release = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId)
    stageEl.style.cursor = nearFood(e) ? "grab" : "crosshair"
  }
  listen(stageEl, "pointerup", release)
  listen(stageEl, "pointercancel", release)
  listen(stageEl, "pointerleave", () => {
    hover.amp.to(0, PRESET_GLIDE)
    wake()
  })

  // ── WebGPU, or the still ──
  let disposed = false
  let gpu: Gpu | null = null
  let still: HTMLElement | null = null
  const showStill = () => {
    if (still || disposed) return
    still = stillOf()
    stageEl.prepend(still)
  }
  const presence = new Glide(0)
  void startGpu(stageEl).then((g) => {
    if (disposed) {
      g?.destroy()
      return
    }
    if (!g) return showStill()
    gpu = g
    g.onLost = () => {
      gpu = null
      showStill()
    }
    begin(g)
  })

  function begin(g: Gpu) {
    let raf = 0
    let last = performance.now()
    let acc = 0
    let seen = true
    const running = () => !disposed && seen && !document.hidden && gpu === g
    const frame = (now: number) => {
      raf = 0
      if (!running()) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      for (const k of Object.keys(glides) as G[]) glides[k].step(dt)
      hover.amp.step(dt)
      presence.step(dt)
      churn.step(dt)
      palMix.step(dt)
      const t = palMix.x
      palette = palFrom.map((c, i) =>
        c.map((x, j) => x + (palTo[i]![j]! - x) * t),
      ) as typeof palette
      // The agents keep their own clock: a step every 60th of a second (a quarter as often
      // under reduced motion), at most three a frame; between them, nothing new to draw.
      acc += dt * RATE * (reduced() ? 0.25 : 1)
      let steps = Math.floor(acc)
      acc -= steps
      if (steps > 3) steps = 3
      if (steps > 0) g.frame(steps, scene(now))
      raf = requestAnimationFrame(frame)
    }
    wake = () => {
      if (!raf && running()) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    const io = new IntersectionObserver((entries) => {
      seen = entries.some((e) => e.isIntersecting)
      wake()
    })
    io.observe(stageEl)
    document.addEventListener("visibilitychange", wake)
    cleanup.push(() => {
      io.disconnect()
      document.removeEventListener("visibilitychange", wake)
      cancelAnimationFrame(raf)
    })
    // The first frame already holds a young network, grown from spores strewn everywhere, and
    // it fades up out of the page while it settles.
    g.seed(scene(performance.now()), reduced() ? 400 : 120)
    presence.to(1, reduced() ? FADE : ENTRANCE)
    wake()
    Object.assign(window, {
      __heroSlime: {
        store,
        bench: (n = 60) => g.bench(n, scene(performance.now())),
        /** Strews the spores again, with no panel or title to grow around if `noPanel`. */
        reseed: (noPanel = false) => {
          bare = noPanel
          g.seed(scene(performance.now()), 120)
        },
        gpuMs: () => g.gpuMs,
      },
    })
  }

  const titleRange = document.createRange()
  /** The dev hook's: no panel or title for the mould to grow around (for the still). */
  let bare = false
  /** What the GPU needs this frame, in CSS px of the stage. */
  const scene = (now: number): SceneState => {
    const r = stageEl.getBoundingClientRect()
    const box = (b: DOMRect | undefined) =>
      b?.width
        ? ([b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top] as const)
        : null
    const p = narrow.matches || bare ? null : box(panelEl()?.getBoundingClientRect())
    // The title's words, not its full-width line.
    titleRange.selectNodeContents(titleEl.querySelector("h1") ?? titleEl)
    const title = bare ? null : box(titleRange.getBoundingClientRect())
    return {
      w: r.width,
      h: r.height,
      senseAngle: (glides.senseAngle.x * Math.PI) / 180,
      senseDist: glides.senseDist.x,
      turn: (glides.turn.x * Math.PI) / 180,
      speed: glides.speed.x,
      decay: clamp01(glides.decay.x / 100),
      population: clamp01(glides.population.x / 100),
      food: [glides.foodX.x * r.width, glides.foodY.x * r.height],
      hover: [hover.x * r.width, hover.y * r.height, hover.amp.x],
      panel: p,
      title,
      palette,
      presence: presence.x,
      churn: churn.x,
      time: now / 1000,
      pulse: reduced() ? 0 : 0.22,
    }
  }

  return {
    dispose() {
      if (disposed) return
      disposed = true
      for (const f of cleanup) f()
      panel.dispose()
      gpu?.destroy()
      still?.remove()
      for (const el of made) el.remove()
    },
  }
}

interface SceneState {
  w: number
  h: number
  senseAngle: number
  senseDist: number
  turn: number
  speed: number
  decay: number
  population: number
  food: readonly [number, number]
  hover: readonly [number, number, number]
  panel: readonly [number, number, number, number] | null
  title: readonly [number, number, number, number] | null
  palette: readonly (readonly number[])[]
  presence: number
  /** How much the agents respawn (0 settled, 1 just after a preset or Random). */
  churn: number
  time: number
  pulse: number
}

interface Gpu {
  frame(steps: number, s: SceneState): void
  seed(s: SceneState, warm: number): void
  bench(n: number, s: SceneState): Promise<Record<string, unknown>>
  /** Timestamp queries, smoothed: the sim's compute pass and the render passes (ms). */
  gpuMs: { sim: number; draw: number } | null
  onLost: () => void
  destroy(): void
}

async function startGpu(stageEl: HTMLElement): Promise<Gpu | null> {
  if (new URLSearchParams(location.search).has("nogpu") || !navigator.gpu) return null
  let device: GPUDevice
  let timestamps = false
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" })
    if (!adapter) return null
    timestamps = adapter.features.has("timestamp-query")
    device = await adapter.requestDevice({
      requiredFeatures: timestamps ? ["timestamp-query"] : [],
    })
  } catch (e) {
    console.warn("hero-slime: no WebGPU", e)
    return null
  }
  const format = navigator.gpu.getPreferredCanvasFormat()
  const canvas = document.createElement("canvas")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
  canvas.setAttribute("aria-hidden", "true")
  stageEl.prepend(canvas)
  const ctx = canvas.getContext("webgpu")!
  ctx.configure({ device, format, alphaMode: "opaque" })
  const page = hexLinear(
    getComputedStyle(document.documentElement).getPropertyValue("--night").trim() || "#101012",
  )

  // ── Pipelines ──
  const simModule = device.createShaderModule({ code: simWgsl, label: "slime sim" })
  const C = GPUShaderStage.COMPUTE
  const simLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: C, buffer: { type: "uniform" } },
      { binding: 1, visibility: C, buffer: { type: "storage" } },
      { binding: 2, visibility: C, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: C, buffer: { type: "storage" } },
      { binding: 4, visibility: C, buffer: { type: "storage" } },
      { binding: 5, visibility: C, buffer: { type: "storage" } },
      {
        binding: 6,
        visibility: C,
        storageTexture: { access: "write-only", format: HDR },
      },
    ],
  })
  const simPl = device.createPipelineLayout({ bindGroupLayouts: [simLayout] })
  const compute = (entryPoint: string) =>
    device.createComputePipeline({
      layout: simPl,
      compute: { module: simModule, entryPoint },
    })
  const crawl = compute("crawl")
  const diffuse = compute("diffuse")
  const seeder = compute("seed")
  const remapper = compute("remap")

  const lookModule = device.createShaderModule({ code: lookWgsl, label: "slime look" })
  const F = GPUShaderStage.FRAGMENT
  const lookLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: F, buffer: {} },
      { binding: 1, visibility: F, texture: {} },
      { binding: 2, visibility: F, sampler: {} },
    ],
  })
  const lookPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [lookLayout] }),
    vertex: { module: lookModule, entryPoint: "vs" },
    fragment: { module: lookModule, entryPoint: "fs", targets: [{ format: HDR }] },
    primitive: { topology: "triangle-list" },
  })

  const postModule = device.createShaderModule({ code: postWgsl, label: "slime post" })
  const postLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: F, texture: {} },
      { binding: 1, visibility: F, sampler: {} },
      { binding: 2, visibility: F, buffer: {} },
      { binding: 3, visibility: F, texture: {} },
      { binding: 4, visibility: F, texture: { sampleType: "unfilterable-float" } },
    ],
  })
  const postPl = device.createPipelineLayout({ bindGroupLayouts: [postLayout] })
  const post = (entry: string, target: GPUTextureFormat, add = false) =>
    device.createRenderPipeline({
      layout: postPl,
      vertex: { module: postModule, entryPoint: "vs_full" },
      fragment: {
        module: postModule,
        entryPoint: entry,
        targets: [
          add
            ? {
                format: target,
                blend: {
                  color: { srcFactor: "one", dstFactor: "one", operation: "add" },
                  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
                },
              }
            : { format: target },
        ],
      },
      primitive: { topology: "triangle-list" },
    })
  const down = post("fs_down", HDR)
  const up = post("fs_up", HDR, true)
  const composite = post("fs_composite", format)
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
  const noiseTex = device.createTexture({
    size: [64, 64],
    format: "r32float",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture({ texture: noiseTex }, blueNoise(64), { bytesPerRow: 256 }, [64, 64])
  const noise = noiseTex.createView()

  // ── Buffers that outlive a resize ──
  const agents = device.createBuffer({
    size: MAX_AGENTS * 16,
    usage: GPUBufferUsage.STORAGE,
  })
  const simData = new Float32Array(36)
  const simBuf = device.createBuffer({
    size: simData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const lookData = new Float32Array(44)
  const lookBuf = device.createBuffer({
    size: lookData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const query = timestamps ? device.createQuerySet({ type: "timestamp", count: 4 }) : null
  const queryBuf = query
    ? device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      })
    : null
  const readBuf = query
    ? device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    : null
  let reading = false

  // ── The field: sized to the stage, a cell a CSS pixel until that's too many ──
  interface Field {
    W: number
    H: number
    k: number
    trail: GPUBuffer[]
    deposit: GPUBuffer
    slow: GPUBuffer
    look: GPUTexture
    binds: GPUBindGroup[]
    lookBind: GPUBindGroup
  }
  let field: Field | null = null
  let parity = 0
  const makeField = (cssW: number, cssH: number): Field => {
    const k = Math.min(1, Math.sqrt(MAX_CELLS / Math.max(1, cssW * cssH)))
    const W = Math.max(8, Math.round(cssW * k))
    const H = Math.max(8, Math.round(cssH * k))
    const n = W * H
    const buf = () =>
      device.createBuffer({ size: n * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    const trail = [buf(), buf()]
    const deposit = buf()
    const slow = buf()
    const look = device.createTexture({
      size: [W, H],
      format: HDR,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
    const lookView = look.createView()
    const binds = [0, 1].map((p) =>
      device.createBindGroup({
        layout: simLayout,
        entries: [
          { binding: 0, resource: { buffer: simBuf } },
          { binding: 1, resource: { buffer: agents } },
          { binding: 2, resource: { buffer: trail[p]! } },
          { binding: 3, resource: { buffer: trail[1 - p]! } },
          { binding: 4, resource: { buffer: deposit } },
          { binding: 5, resource: { buffer: slow } },
          { binding: 6, resource: lookView },
        ],
      }),
    )
    const lookBind = device.createBindGroup({
      layout: lookLayout,
      entries: [
        { binding: 0, resource: { buffer: lookBuf } },
        { binding: 1, resource: lookView },
        { binding: 2, resource: sampler },
      ],
    })
    return { W, H, k, trail, deposit, slow, look, binds, lookBind }
  }
  const dropField = (f: Field) => {
    for (const b of [...f.trail, f.deposit, f.slow]) b.destroy()
    f.look.destroy()
  }

  // ── The canvas's targets: the scene in HDR, and the bloom's chain ──
  interface Targets {
    w: number
    h: number
    dpr: number
    hdr: GPUTexture
    levels: GPUTexture[]
    bufs: GPUBuffer[]
    binds: GPUBindGroup[]
  }
  let targets: Targets | null = null
  const postData = new Float32Array(16)
  const writePost = (buf: GPUBuffer, tex: GPUTexture, firstLevel: number) => {
    const u = postData
    u.fill(0)
    u[0] = 1 / tex.width
    u[1] = 1 / tex.height
    u[4] = firstLevel
    u[5] = 1
    u[6] = 0.2 // bloom
    u[7] = 1 // exposure
    u[8] = 1 // neutral tone: the page and everything under 0.8 exactly as drawn
    u[10] = 1
    u[11] = 1
    u[12] = page[0]
    u[13] = page[1]
    u[14] = page[2]
    u[15] = 0.08
    device.queue.writeBuffer(buf, 0, u)
  }
  const makeTargets = (cssW: number, cssH: number): Targets | null => {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (w < 2 || h < 2) return null
    canvas.width = w
    canvas.height = h
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const hdr = tex(w, h)
    const hdrView = hdr.createView()
    const levels: GPUTexture[] = []
    for (let i = 0; i < LEVELS; i++) levels.push(tex(w >> (i + 1), h >> (i + 1)))
    const views = levels.map((t) => t.createView())
    const bufs: GPUBuffer[] = []
    for (let i = 0; i < LEVELS * 2; i++)
      bufs.push(
        device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      )
    const bind = (src: GPUTextureView, buf: GPUBuffer, bloom: GPUTextureView) =>
      device.createBindGroup({
        layout: postLayout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: buf } },
          { binding: 3, resource: bloom },
          { binding: 4, resource: noise },
        ],
      })
    // Down: scene → L0 → … → L4. Up: L4 → L3 … L1 → L0, added on. Composite: scene with L0.
    const binds: GPUBindGroup[] = []
    for (let i = 0; i < LEVELS; i++) {
      binds.push(bind(i ? views[i - 1]! : hdrView, bufs[i]!, hdrView))
      writePost(bufs[i]!, i ? levels[i - 1]! : hdr, i ? 0 : 1)
    }
    for (let i = LEVELS - 1; i > 0; i--) {
      const b = bufs[LEVELS + (LEVELS - 1 - i)]!
      binds.push(bind(views[i]!, b, hdrView))
      writePost(b, levels[i]!, 0)
    }
    binds.push(bind(hdrView, bufs[LEVELS * 2 - 1]!, views[0]!))
    writePost(bufs[LEVELS * 2 - 1]!, hdr, 0)
    return { w, h, dpr: w / cssW, hdr, levels, bufs, binds }
  }
  const dropTargets = (t: Targets) => {
    t.hdr.destroy()
    for (const l of t.levels) l.destroy()
    for (const b of t.bufs) b.destroy()
  }

  // ── Per frame ──
  let cssW = 0
  let cssH = 0
  let fieldTimer = 0
  let pendingField: [number, number] | null = null
  const agentsFor = (f: Field, s: SceneState) =>
    Math.max(1024, Math.round(Math.min(MAX_AGENTS, f.W * f.H * PER_CELL) * s.population))
  const writeSim = (f: Field, s: SceneState) => {
    const d = simData
    const k = f.k
    const n = agentsFor(f, s)
    // The trail a cell on a vein settles at, so the food, the panel and the edges smell alike
    // however dense the agents or slow the fade.
    const level = (DEPOSIT * (n / (f.W * f.H)) * 2.5) / Math.max(0.01, s.decay)
    d.set([f.W, f.H, n, k], 0)
    d.set([s.senseAngle, s.senseDist * k, s.turn, s.speed * k], 4)
    d.set([1 - s.decay, DEPOSIT, 0.7, 0.012], 8)
    d.set([s.food[0] * k, s.food[1] * k, 4, 42 * k], 12)
    d.set([s.hover[0] * k, s.hover[1] * k, 3 * s.hover[2], 48 * k], 16)
    const p = s.panel
    d.set(p ? [p[0] * k, p[1] * k, p[2] * k, p[3] * k] : [0, 0, 0, 0], 20)
    const t = s.title
    d.set(t ? [t[0] * k, t[1] * k, t[2] * k, t[3] * k] : [0, 0, 0, 0], 24)
    d.set([12 * k, p ? 0.7 : 0, 0.6, level], 28)
    d.set([0, 0, RESPAWN[0] + (RESPAWN[1] - RESPAWN[0]) * clamp01(s.churn), 0], 32)
    device.queue.writeBuffer(simBuf, 0, d)
    return { n, level }
  }
  const writeLook = (f: Field, t: Targets, s: SceneState, level: number) => {
    const d = lookData
    const r = t.dpr
    d.set([t.w, t.h, f.W, f.H], 0)
    d.set([1 / (level * 3.5), 4.5, s.time % 1000, s.presence], 4)
    d.set([page[0], page[1], page[2], 0.1 * Math.min(t.w, t.h)], 8)
    d.set([s.food[0] * r, s.food[1] * r, 0.55, s.pulse], 12)
    s.palette.forEach((c, i) => d.set([c[0]!, c[1]!, c[2]!, 0], 16 + i * 4))
    d.set([1.6, 1, 1.45, r], 40)
    device.queue.writeBuffer(lookBuf, 0, d)
  }
  /** The stage's size now: the canvas's targets at once, the field once it's settled. */
  const fit = (s: SceneState) => {
    const w = Math.round(s.w)
    const h = Math.round(s.h)
    const dpr = Math.min(2, devicePixelRatio || 1)
    if (!targets || w !== cssW || h !== cssH || Math.abs(targets.dpr - dpr) > 0.01) {
      if (targets) dropTargets(targets)
      targets = makeTargets(w, h)
      cssW = w
      cssH = h
      if (!field) setField(w, h, s)
      else {
        pendingField = [w, h]
        clearTimeout(fieldTimer)
        fieldTimer = window.setTimeout(() => {
          if (pendingField && !lost) setField(pendingField[0], pendingField[1], s)
          pendingField = null
        }, 160)
      }
    }
    return targets
  }
  const setField = (w: number, h: number, s: SceneState) => {
    const old = field
    field = makeField(w, h)
    parity = 0
    if (!old) return
    // The agents keep their places in the stage; the trail starts again under them.
    simData.fill(0)
    simData.set([field.W, field.H, 0, field.k], 0)
    simData.set([field.W / old.W, field.H / old.H, 0, 0], 32)
    device.queue.writeBuffer(simBuf, 0, simData)
    const enc = device.createCommandEncoder()
    const p = enc.beginComputePass()
    p.setPipeline(remapper)
    p.setBindGroup(0, field.binds[0]!)
    p.dispatchWorkgroups(MAX_AGENTS / 256)
    p.end()
    device.queue.submit([enc.finish()])
    dropField(old)
    writeSim(field, s)
  }
  const encode = (steps: number, s: SceneState, timed: boolean, draw = true) => {
    const t = fit(s)
    const f = field
    if (!t || !f) return
    const { n, level } = writeSim(f, s)
    writeLook(f, t, s, level)
    const enc = device.createCommandEncoder()
    const cp = enc.beginComputePass(
      timed && query
        ? {
            timestampWrites: {
              querySet: query,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {},
    )
    for (let i = 0; i < steps; i++) {
      cp.setBindGroup(0, f.binds[parity]!)
      cp.setPipeline(crawl)
      cp.dispatchWorkgroups(Math.ceil(n / 256))
      cp.setPipeline(diffuse)
      cp.dispatchWorkgroups(Math.ceil(f.W / 16), Math.ceil(f.H / 16))
      parity ^= 1
    }
    cp.end()
    if (!draw) {
      device.queue.submit([enc.finish()])
      return
    }
    const pass = (view: GPUTextureView, load: GPULoadOp, stamp?: "begin" | "end") =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
        ...(stamp && timed && query
          ? {
              timestampWrites:
                stamp === "begin"
                  ? { querySet: query, beginningOfPassWriteIndex: 2 }
                  : { querySet: query, endOfPassWriteIndex: 3 },
            }
          : {}),
      })
    let p = pass(t.hdr.createView(), "clear", "begin")
    p.setPipeline(lookPipe)
    p.setBindGroup(0, f.lookBind)
    p.draw(3)
    p.end()
    for (let i = 0; i < LEVELS; i++) {
      p = pass(t.levels[i]!.createView(), "clear")
      p.setPipeline(down)
      p.setBindGroup(0, t.binds[i]!)
      p.draw(3)
      p.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      p = pass(t.levels[LEVELS - 2 - k]!.createView(), "load")
      p.setPipeline(up)
      p.setBindGroup(0, t.binds[LEVELS + k]!)
      p.draw(3)
      p.end()
    }
    p = pass(ctx.getCurrentTexture().createView(), "clear", "end")
    p.setPipeline(composite)
    p.setBindGroup(0, t.binds[LEVELS * 2 - 1]!)
    p.draw(3)
    p.end()
    const read = timed && query && queryBuf && readBuf && !reading
    if (read) {
      enc.resolveQuerySet(query, 0, 4, queryBuf, 0)
      enc.copyBufferToBuffer(queryBuf, 0, readBuf, 0, 32)
    }
    device.queue.submit([enc.finish()])
    if (read) {
      reading = true
      readBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const [a, b, c, d] = new BigUint64Array(readBuf.getMappedRange().slice(0))
          readBuf.unmap()
          const sim = Number(b! - a!) / 1e6
          const draw = Number(d! - c!) / 1e6
          if (sim >= 0 && draw >= 0 && sim + draw < 100) {
            const m = gpu.gpuMs
            gpu.gpuMs = m
              ? { sim: m.sim * 0.95 + sim * 0.05, draw: m.draw * 0.95 + draw * 0.05 }
              : { sim, draw }
          }
        })
        .catch(() => {})
        .finally(() => {
          reading = false
        })
    }
  }

  let lost = false
  const gpu: Gpu = {
    gpuMs: null,
    onLost: () => {},
    frame(steps, s) {
      if (lost) return
      try {
        encode(steps, s, true)
      } catch (e) {
        console.error("hero-slime: frame failed", e)
      }
    },
    seed(s, warm) {
      const t = fit(s)
      const f = field
      if (!t || !f) return
      writeSim(f, s)
      simData.set([0, 0, 0, 7], 32)
      device.queue.writeBuffer(simBuf, 0, simData)
      const enc = device.createCommandEncoder()
      const p = enc.beginComputePass()
      p.setPipeline(seeder)
      p.setBindGroup(0, f.binds[0]!)
      p.dispatchWorkgroups(MAX_AGENTS / 256)
      p.end()
      device.queue.submit([enc.finish()])
      // Grown a little before it's seen, in steps of a few at a time.
      for (let left = warm; left > 0; left -= 10) encode(Math.min(10, left), s, false)
    },
    async bench(n, s) {
      // Back to back, so the GPU is at its clocks: a frame, its sim step alone, its render alone.
      const time = async (steps: number, draw: boolean) => {
        encode(steps, s, false, draw)
        await device.queue.onSubmittedWorkDone()
        const t0 = performance.now()
        for (let i = 0; i < n; i++) encode(steps, s, false, draw)
        await device.queue.onSubmittedWorkDone()
        return +((performance.now() - t0) / n).toFixed(3)
      }
      const frameMs = await time(1, true)
      const stepMs = await time(1, false)
      const renderMs = await time(0, true)
      const f = field!
      return {
        frameMs,
        stepMs,
        renderMs,
        simMs: gpu.gpuMs && +gpu.gpuMs.sim.toFixed(3),
        drawMs: gpu.gpuMs && +gpu.gpuMs.draw.toFixed(3),
        agents: agentsFor(f, s),
        cells: f.W * f.H,
        canvas: `${targets?.w}×${targets?.h}`,
      }
    },
    destroy() {
      lost = true
      clearTimeout(fieldTimer)
      canvas.remove()
      device.destroy()
    },
  }
  device.lost.then((info) => {
    if (info.reason === "destroyed") return
    console.error("hero-slime: device lost", info.message)
    lost = true
    canvas.remove()
    gpu.onLost()
  })
  return gpu
}

/** Without WebGPU: a still of the mould itself, grown on the GPU with nothing in its way. */
function stillOf() {
  const el = document.createElement("div")
  el.setAttribute("aria-hidden", "true")
  el.style.cssText = `position:absolute;inset:0;background:var(--night, #101012) url("${stillUrl}") center / cover no-repeat`
  return el
}

/**
 * Blue noise by repeated high-pass (white noise minus its wrapped blur, three times), then ranked
 * so the values are uniform (as controls-gpu.ts makes it), for the post pass's dither.
 */
function blueNoise(n: number) {
  let v = new Float32Array(n * n)
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let i = 0; i < v.length; i++) v[i] = rnd()
  const K = [0.06, 0.24, 0.4, 0.24, 0.06]
  for (let pass = 0; pass < 3; pass++) {
    const a = new Float32Array(v.length)
    const b = new Float32Array(v.length)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0
        for (let k = -2; k <= 2; k++) s += K[k + 2]! * v[y * n + ((x + k + n) % n)]!
        a[y * n + x] = s
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let s = 0
        for (let k = -2; k <= 2; k++) s += K[k + 2]! * a[((y + k + n) % n) * n + x]!
        b[y * n + x] = v[y * n + x]! - s
      }
    v = b
  }
  const order = [...v.keys()].sort((i, j) => v[i]! - v[j]!)
  const out = new Float32Array(v.length)
  order.forEach((i, rank) => {
    out[i] = (rank + 0.5) / v.length
  })
  return out
}
