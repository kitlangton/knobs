/// <reference types="@webgpu/types" />
// The catalog's WebGPU previews: one device for every preview canvas. Each view is a full-screen
// fragment shader (its scene, in linear HDR) drawn into a half-float target, then bloomed down and
// up a chain of smaller targets and tone-mapped into its canvas with blue-noise dither
// (controls-post.wgsl). A view draws only when its Stage asks (something visible changed), so a
// still page costs nothing. A temporal view (the hero) keeps a history of its jittered frames,
// folded together with neighbourhood clipping, and a per-pixel cache its scene reuses.
// Without WebGPU (or with ?nogpu) `gpuView` returns null and the section keeps its DOM preview.
import { clamp01, live } from "./controls-motion"
import postWgsl from "./controls-post.wgsl?raw"

const HDR: GPUTextureFormat = "rgba16float"
const LEVELS = 5
/** Floats in a scene's uniform block: vec4 0 is (width, height, dpr, time), 63 more are its own. */
export const SCENE_FLOATS = 256

interface Shared {
  device: GPUDevice
  format: GPUTextureFormat
  sampler: GPUSampler
  noise: GPUTextureView
  layout: GPUBindGroupLayout
  down: GPURenderPipeline
  up: GPURenderPipeline
  composite: GPURenderPipeline
  /** Folds a temporal view's frame into its history. */
  taa: GPURenderPipeline
  /** A scene's uniform block; a temporal scene's also last frame's cache. */
  sceneLayout: GPUPipelineLayout
  temporalLayout: GPUPipelineLayout
  scenes: Map<string, GPURenderPipeline>
}
let shared: Shared | null = null

export const hasGpu = () => shared !== null

const views = new Set<GpuView>()
let gpuErrors = 0
let restores = 0

/** After a lost device: a new one, and every view rebuilt on it and redrawn; else they say so. */
async function restore() {
  if (restores++ >= 3) {
    for (const v of views) v.fail()
    return
  }
  await initGpu()
  const s = shared
  for (const v of views) {
    if (s) v.rebuild(s)
    else v.fail()
  }
  if (s) live.log("WebGPU restored")
}

/** Resolves the device before the page builds, so each section picks GPU or DOM once. */
export async function initGpu() {
  if (new URLSearchParams(location.search).has("nogpu")) return
  try {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })
    if (!adapter) return
    const device = await adapter.requestDevice()
    device.addEventListener("uncapturederror", (e) => {
      const message = (e as GPUUncapturedErrorEvent).error.message
      if (gpuErrors++ < 20) console.error("controls-gpu: uncaptured error:", message)
      if (gpuErrors < 5) live.log(`WebGPU error: ${message.split("\n")[0]}`, "error")
    })
    device.lost.then((info) => {
      if (info.reason === "destroyed") return
      console.error("controls-gpu: device lost:", info.reason, info.message)
      live.log(`WebGPU device lost (${info.message || info.reason}): rebuilding`, "error")
      if (shared?.device === device) shared = null
      void restore()
    })
    const format = navigator.gpu.getPreferredCanvasFormat()
    const module = compile(device, postWgsl, "post")
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" },
        },
      ],
    })
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] })
    const pipe = (entry: string, target: GPUTextureFormat, add = false) =>
      device.createRenderPipeline({
        layout: pl,
        vertex: { module, entryPoint: "vs_full" },
        fragment: {
          module,
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
    const noiseTex = device.createTexture({
      size: [64, 64],
      format: "r32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    device.queue.writeTexture(
      { texture: noiseTex },
      blueNoise(64),
      { bytesPerRow: 64 * 4 },
      [64, 64],
    )
    const uniform: GPUBindGroupLayoutEntry = {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: {},
    }
    shared = {
      device,
      format,
      sampler: device.createSampler({ magFilter: "linear", minFilter: "linear" }),
      noise: noiseTex.createView(),
      layout,
      down: pipe("fs_down", HDR),
      up: pipe("fs_up", HDR, true),
      composite: pipe("fs_composite", format),
      taa: pipe("fs_taa", HDR),
      sceneLayout: device.createPipelineLayout({
        bindGroupLayouts: [device.createBindGroupLayout({ entries: [uniform] })],
      }),
      temporalLayout: device.createPipelineLayout({
        bindGroupLayouts: [
          device.createBindGroupLayout({
            entries: [
              uniform,
              {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: "unfilterable-float" },
              },
            ],
          }),
        ],
      }),
      scenes: new Map(),
    }
  } catch (e) {
    console.warn("controls-gpu: no WebGPU", e)
    shared = null
  }
}

function compile(device: GPUDevice, code: string, label: string) {
  const module = device.createShaderModule({ code, label })
  module.getCompilationInfo().then((info) => {
    for (const m of info.messages)
      if (m.type === "error")
        console.error(`controls-gpu ${label} ${m.lineNum}:${m.linePos} ${m.message}`)
  })
  return module
}

/**
 * Blue noise by repeated high-pass (white noise minus its wrapped blur, three times), then ranked
 * so the values are uniform. Not void-and-cluster, but its energy sits at high frequencies, which
 * is what a dither needs.
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

/** What every scene shares: its uniforms, a full-screen triangle and a few helpers. */
const COMMON = /* wgsl */ `
struct U { frame: vec4f, v: array<vec4f, ${SCENE_FLOATS / 4 - 1}> }
@group(0) @binding(0) var<uniform> u: U;
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}
const PI = 3.14159265;
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`
/** The prelude: a scene's colour, one fragment a pixel. */
const PRELUDE = /* wgsl */ `${COMMON}
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(max(scene(fc.xy), vec3f(0.0)), 1.0);
}
`
/**
 * A temporal scene's prelude: it also reads last frame's per-pixel cache (`cacheIn`, whatever
 * the scene keeps: a hit distance, a shadow) and writes this frame's (`cacheOut`). `u.v[62].x`
 * is 1 while the cache and the history hold an earlier frame of this size, 0 on the first.
 */
const TEMPORAL = /* wgsl */ `${COMMON}
@group(0) @binding(1) var cacheIn: texture_2d<f32>;
var<private> cacheOut: vec4f;
struct SceneOut {
  @location(0) color: vec4f,
  @location(1) cache: vec4f,
}
@fragment
fn fs(@builtin(position) fc: vec4f) -> SceneOut {
  cacheOut = vec4f(0.0, 0.0, 1.0, -2.0);
  let c = max(scene(fc.xy), vec3f(0.0));
  return SceneOut(vec4f(c, 1.0), cacheOut);
}
`
/** Where a temporal view says its cache and history are good (see TEMPORAL). */
const VALID = 4 + 62 * 4

export interface ViewSpec {
  /** WGSL defining `fn scene(px: vec2f) -> vec3f` (device pixels, y down), reading `u.v[i]`. */
  readonly wgsl: string
  readonly label: string
  /** "agx" for lit scenes; "neutral" keeps colours under 0.8 exactly as drawn. */
  readonly tone?: "agx" | "neutral"
  /** How much of the bloom is mixed in (0–1). */
  readonly bloom?: number
  readonly exposure?: number
  readonly vignette?: number
  readonly saturation?: number
  /** The most device pixels per CSS pixel it draws at (2): lower for heavy scenes. */
  readonly maxDpr?: number
  /**
   * The colour the scene sits on (linear). Given, the bloom fades out over `edge` (a fraction of
   * each side) so nothing glows at the canvas's edge, and there's no dither where the frame is
   * exactly this colour: a scene that converges to its page has no visible boundary.
   */
  readonly base?: readonly [number, number, number]
  readonly edge?: number
  /**
   * Temporal: each frame (jittered by the scene) goes into a history, which is what's shown, and
   * the scene keeps a per-pixel cache from frame to frame (see TEMPORAL). `render({ blend, clip })`.
   */
  readonly temporal?: boolean
}

interface Targets {
  w: number
  h: number
  dpr: number
  hdr: GPUTexture
  hdrView: GPUTextureView
  levels: GPUTexture[]
  levelViews: GPUTextureView[]
  /** One small uniform block per pass: down × LEVELS, up × (LEVELS − 1), composite, history. */
  bufs: GPUBuffer[]
  /** Per frame parity (one set without a history): bloom down, up, composite, then the history. */
  binds: GPUBindGroup[][]
  scenes: GPUBindGroup[]
  /** Temporal: the cache and the history, each a pair that swaps every frame. */
  cache: GPUTexture[]
  history: GPUTexture[]
  parity: number
  valid: boolean
  exposure: number
}

export interface RenderOptions {
  /** Temporal views: how much of this frame goes into the history (1 replaces it). */
  readonly blend?: number
  /** Temporal views: clip the history to this frame's neighbourhood first (anything changing). */
  readonly clip?: boolean
}

const byCanvas = new WeakMap<Element, GpuView>()
const canvasRo = new ResizeObserver((entries) => {
  for (const e of entries) {
    const view = byCanvas.get(e.target)
    if (!view) continue
    view.cssW = Math.round(e.contentRect.width)
    view.cssH = Math.round(e.contentRect.height)
  }
})

/** One preview canvas and its passes. Fill `data` (from index 4), then `render()`. */
export class GpuView {
  readonly canvas = document.createElement("canvas")
  readonly data = new Float32Array(SCENE_FLOATS)
  exposure: number
  cssW = 0
  cssH = 0
  private ctx!: GPUCanvasContext
  private pipeline!: GPURenderPipeline
  private sceneBuf!: GPUBuffer
  private readonly postData = new Float32Array(16)
  private targets: Targets | null = null
  private readonly t0 = performance.now()
  private failures = 0
  private retry = 0
  constructor(
    private s: Shared,
    private readonly host: HTMLElement,
    private readonly spec: ViewSpec,
  ) {
    this.exposure = spec.exposure ?? 1
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
    this.canvas.setAttribute("aria-hidden", "true")
    host.prepend(this.canvas)
    this.cssW = this.canvas.clientWidth
    this.cssH = this.canvas.clientHeight
    byCanvas.set(this.canvas, this)
    canvasRo.observe(this.canvas)
    this.build(s)
    views.add(this)
  }
  private build(s: Shared) {
    this.s = s
    this.ctx = this.canvas.getContext("webgpu")!
    this.ctx.configure({ device: s.device, format: s.format, alphaMode: "opaque" })
    const temporal = !!this.spec.temporal
    let pipeline = s.scenes.get(this.spec.wgsl)
    if (!pipeline) {
      const module = compile(
        s.device,
        (temporal ? TEMPORAL : PRELUDE) + this.spec.wgsl,
        this.spec.label,
      )
      pipeline = s.device.createRenderPipeline({
        layout: temporal ? s.temporalLayout : s.sceneLayout,
        vertex: { module, entryPoint: "vs" },
        fragment: {
          module,
          entryPoint: "fs",
          targets: temporal ? [{ format: HDR }, { format: HDR }] : [{ format: HDR }],
        },
        primitive: { topology: "triangle-list" },
      })
      s.scenes.set(this.spec.wgsl, pipeline)
    }
    this.pipeline = pipeline
    this.sceneBuf = s.device.createBuffer({
      size: SCENE_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.dropTargets()
  }
  private dropTargets() {
    const t = this.targets
    if (!t) return
    for (const x of [t.hdr, ...t.levels, ...t.cache, ...t.history]) x.destroy()
    for (const b of t.bufs) b.destroy()
    this.targets = null
  }
  /** On a new device: everything again, then the last frame's data drawn. */
  rebuild(s: Shared) {
    this.build(s)
    this.failures = 0
    this.render()
  }
  /** No device to be had: say so where the scene was. */
  fail() {
    if (this.host.querySelector("[data-gpu-lost]")) return
    const note = document.createElement("div")
    note.dataset.gpuLost = ""
    note.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;color:var(--dim);font-size:12px;background:var(--surface)"
    note.textContent = "WebGPU stopped. Reload to draw this scene again."
    this.host.append(note)
  }
  /** Seconds since the view was made, for scenes that shimmer. */
  get time() {
    return (performance.now() - this.t0) / 1000
  }
  private writePost(buf: GPUBuffer, tex: GPUTexture, first: number, radius: number) {
    const u = this.postData
    u[0] = 1 / tex.width
    u[1] = 1 / tex.height
    u[4] = first
    u[5] = radius
    u[6] = this.spec.bloom ?? 0.06
    u[7] = this.exposure
    u[8] = this.spec.tone === "neutral" ? 1 : 0
    u[9] = this.spec.vignette ?? 0
    u[10] = this.spec.saturation ?? 1
    const base = this.spec.base
    u[11] = base ? 1 : 0
    u[12] = base?.[0] ?? 0
    u[13] = base?.[1] ?? 0
    u[14] = base?.[2] ?? 0
    u[15] = base ? (this.spec.edge ?? 0.06) : 0
    this.s.device.queue.writeBuffer(buf, 0, u)
  }
  /** Device pixels per CSS pixel it draws at. */
  get dpr() {
    return Math.min(this.spec.maxDpr ?? 2, devicePixelRatio || 1)
  }
  private fit() {
    const cssW = this.cssW || (this.cssW = this.canvas.clientWidth)
    const cssH = this.cssH || (this.cssH = this.canvas.clientHeight)
    const w = Math.round(cssW * this.dpr)
    const h = Math.round(cssH * this.dpr)
    if (w < 2 || h < 2) return null
    if (this.targets && this.targets.w === w && this.targets.h === h) return this.targets
    this.dropTargets()
    this.canvas.width = w
    this.canvas.height = h
    const temporal = !!this.spec.temporal
    const { device, layout, sampler, noise } = this.s
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const hdr = tex(w, h)
    const hdrView = hdr.createView()
    const cache = temporal ? [tex(w, h), tex(w, h)] : []
    const history = temporal ? [tex(w, h), tex(w, h)] : []
    const levels: GPUTexture[] = []
    const levelViews: GPUTextureView[] = []
    for (let i = 0; i < LEVELS; i++) {
      const t = tex(w >> (i + 1), h >> (i + 1))
      levels.push(t)
      levelViews.push(t.createView())
    }
    const bind = (src: GPUTextureView, buf: GPUBuffer, bloom: GPUTextureView) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: buf } },
          { binding: 3, resource: bloom },
          { binding: 4, resource: noise },
        ],
      })
    const bufs: GPUBuffer[] = []
    for (let i = 0; i < LEVELS * 2 + 1; i++)
      bufs.push(
        device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
      )
    // Down: shown → L0 → … → L4. Up: L4 → L3 … L1 → L0 (added on). Composite: shown with L0.
    // What's shown is the frame itself, or for a temporal view this parity's history (made from
    // the frame and the other history).
    const binds: GPUBindGroup[][] = []
    for (let parity = 0; parity < (temporal ? 2 : 1); parity++) {
      const shown = temporal ? history[parity]!.createView() : hdrView
      const set: GPUBindGroup[] = []
      for (let i = 0; i < LEVELS; i++)
        set.push(bind(i ? levelViews[i - 1]! : shown, bufs[i]!, shown))
      for (let i = LEVELS - 1; i > 0; i--)
        set.push(bind(levelViews[i]!, bufs[LEVELS + (LEVELS - 1 - i)]!, shown))
      set.push(bind(shown, bufs[LEVELS * 2 - 1]!, levelViews[0]!))
      if (temporal) set.push(bind(hdrView, bufs[LEVELS * 2]!, history[1 - parity]!.createView()))
      binds.push(set)
    }
    for (let i = 0; i < LEVELS; i++)
      this.writePost(bufs[i]!, i ? levels[i - 1]! : hdr, i ? 0 : 1, 1)
    for (let i = LEVELS - 1; i > 0; i--)
      this.writePost(bufs[LEVELS + (LEVELS - 1 - i)]!, levels[i]!, 0, 1)
    this.writePost(bufs[LEVELS * 2 - 1]!, hdr, 0, 1)
    const scenes = temporal
      ? [0, 1].map((parity) =>
          device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: this.sceneBuf } },
              { binding: 1, resource: cache[1 - parity]!.createView() },
            ],
          }),
        )
      : [
          device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: this.sceneBuf } }],
          }),
        ]
    this.targets = {
      w,
      h,
      dpr: w / Math.max(1, cssW),
      hdr,
      hdrView,
      levels,
      levelViews,
      bufs,
      binds,
      scenes,
      cache,
      history,
      parity: 0,
      valid: false,
      exposure: this.exposure,
    }
    return this.targets
  }
  render(options: RenderOptions = {}): boolean {
    try {
      this.draw(options)
      this.failures = 0
    } catch (e) {
      // A frame that fails (a context mid-loss, a canvas mid-resize) tries again next frame.
      if (this.failures++ < 3) {
        console.error(`controls-gpu ${this.spec.label}: frame failed`, e)
        cancelAnimationFrame(this.retry)
        this.retry = requestAnimationFrame(() => this.render(options))
      }
      return false
    }
    return true
  }
  /**
   * GPU time per frame (ms) of `frames` renders of the current data back to back, for the
   * catalog's measurements: whatever the queue takes, divided out. `uncached`: as if each were
   * a temporal view's first.
   */
  async bench(frames: number, options: RenderOptions = {}, uncached = false) {
    this.draw(options, false)
    await this.s.device.queue.onSubmittedWorkDone()
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
      if (uncached && this.targets) this.targets.valid = false
      this.draw(options, false)
    }
    await this.s.device.queue.onSubmittedWorkDone()
    return (performance.now() - t0) / frames
  }
  private draw({ blend = 1, clip = false }: RenderOptions, log = true) {
    const t = this.fit()
    if (!t) return
    const { device } = this.s
    const q = device.queue
    const temporal = !!this.spec.temporal
    if (temporal) t.parity = 1 - t.parity
    const parity = temporal ? t.parity : 0
    this.data[0] = t.w
    this.data[1] = t.h
    this.data[2] = t.dpr
    this.data[3] = this.time
    if (temporal) this.data[VALID] = t.valid ? 1 : 0
    q.writeBuffer(this.sceneBuf, 0, this.data)
    if (this.exposure !== t.exposure) {
      this.writePost(t.bufs[LEVELS * 2 - 1]!, t.hdr, 0, 1)
      t.exposure = this.exposure
    }
    const binds = t.binds[parity]!

    const enc = device.createCommandEncoder()
    const pass = (view: GPUTextureView, load: GPULoadOp, extra?: GPUTextureView) =>
      enc.beginRenderPass({
        colorAttachments: [
          { view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] },
          ...(extra
            ? [
                {
                  view: extra,
                  loadOp: "clear" as const,
                  storeOp: "store" as const,
                  clearValue: [0, 0, 0, 1],
                },
              ]
            : []),
        ],
      })
    let p = pass(t.hdrView, "clear", temporal ? t.cache[parity]!.createView() : undefined)
    p.setPipeline(this.pipeline)
    p.setBindGroup(0, t.scenes[parity]!)
    p.draw(3)
    p.end()
    if (temporal) {
      // The history: this frame folded into the last (clipped to what's here now, if asked).
      const u = this.postData
      u.fill(0)
      u[4] = t.valid ? blend : 1
      u[5] = clip ? 1 : 0
      u[6] = 1.25
      q.writeBuffer(t.bufs[LEVELS * 2]!, 0, u)
      p = pass(t.history[parity]!.createView(), "clear")
      p.setPipeline(this.s.taa)
      p.setBindGroup(0, binds[LEVELS * 2]!)
      p.draw(3)
      p.end()
      t.valid = true
    }
    for (let i = 0; i < LEVELS; i++) {
      p = pass(t.levelViews[i]!, "clear")
      p.setPipeline(this.s.down)
      p.setBindGroup(0, binds[i]!)
      p.draw(3)
      p.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      const i = LEVELS - 1 - k
      p = pass(t.levelViews[i - 1]!, "load")
      p.setPipeline(this.s.up)
      p.setBindGroup(0, binds[LEVELS + k]!)
      p.draw(3)
      p.end()
    }
    p = pass(this.ctx.getCurrentTexture().createView(), "clear")
    p.setPipeline(this.s.composite)
    p.setBindGroup(0, binds[LEVELS * 2 - 1]!)
    p.draw(3)
    p.end()
    q.submit([enc.finish()])
    if (!log) return
    const t0 = performance.now()
    const label = this.spec.label
    q.onSubmittedWorkDone().then(() => {
      const ms = performance.now() - t0
      const v = live.views.get(label) ?? { renders: 0, ms: 0 }
      live.views.set(label, { renders: v.renders + 1, ms })
      live.gpuMs += ms
    })
  }
}

/** A WebGPU preview in `host` (behind its other children), or null without WebGPU. */
export function gpuView(host: HTMLElement, spec: ViewSpec) {
  return shared ? new GpuView(shared, host, spec) : null
}

// ── Light ────────────────────────────────────────────────────────────────────────────────────

/** An sRGB 0–1 channel as linear light. */
export const toLinear = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)

/**
 * A black body's colour at `kelvin`, linear sRGB, scaled to unit luminance (Tanner Helland's fit
 * of the Planckian locus, good from 1000 K to 40000 K; below that it carries on reddening).
 */
export function kelvinRgb(kelvin: number): [number, number, number] {
  const t = Math.max(500, kelvin) / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const lin = [r, g, b].map((c) => toLinear(clamp01(c / 255))) as [number, number, number]
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  return lin.map((c) => c / Math.max(1e-4, y)) as [number, number, number]
}

/** An sRGB hex or CSS rgb colour as linear 0–1 channels. */
export function linearRgb(rgb255: readonly number[]): [number, number, number] {
  return rgb255.slice(0, 3).map((c) => toLinear(c / 255)) as [number, number, number]
}
