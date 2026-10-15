/// <reference types="@webgpu/types" />
// The catalog's WebGPU previews: one device for every preview canvas. Each view is a full-screen
// fragment shader (its scene, in linear HDR) drawn into a half-float target, then bloomed down and
// up a chain of smaller targets and tone-mapped into its canvas with blue-noise dither
// (controls-post.wgsl). A view draws only when its Stage asks (something visible changed), so a
// still page costs nothing. Without WebGPU (or with ?nogpu) `gpuView` returns null and the
// section keeps its DOM preview.
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
  scenes: Map<string, GPURenderPipeline>
}
let shared: Shared | null = null

export const hasGpu = () => shared !== null

/** Resolves the device before the page builds, so each section picks GPU or DOM once. */
export async function initGpu() {
  if (new URLSearchParams(location.search).has("nogpu")) return
  try {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })
    if (!adapter) return
    const device = await adapter.requestDevice()
    device.addEventListener("uncapturederror", (e) =>
      console.error("controls-gpu:", (e as GPUUncapturedErrorEvent).error.message),
    )
    device.lost.then((info) => {
      if (info.reason !== "destroyed") console.warn("controls-gpu: device lost", info.message)
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
    shared = {
      device,
      format,
      sampler: device.createSampler({ magFilter: "linear", minFilter: "linear" }),
      noise: noiseTex.createView(),
      layout,
      down: pipe("fs_down", HDR),
      up: pipe("fs_up", HDR, true),
      composite: pipe("fs_composite", format),
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

/** The prelude every scene shares: its uniforms, a full-screen triangle and the entry points. */
const PRELUDE = /* wgsl */ `
struct U { frame: vec4f, v: array<vec4f, ${SCENE_FLOATS / 4 - 1}> }
@group(0) @binding(0) var<uniform> u: U;
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let uv = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
}
@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(max(scene(fc.xy), vec3f(0.0)), 1.0);
}
const PI = 3.14159265;
fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

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
}

interface Targets {
  w: number
  h: number
  hdr: GPUTexture
  levels: GPUTexture[]
  binds: GPUBindGroup[]
  scene: GPUBindGroup
}

/** One preview canvas and its passes. Fill `data` (from index 4), then `render()`. */
export class GpuView {
  readonly canvas = document.createElement("canvas")
  readonly data = new Float32Array(SCENE_FLOATS)
  exposure: number
  private readonly ctx: GPUCanvasContext
  private readonly pipeline: GPURenderPipeline
  private readonly sceneBuf: GPUBuffer
  private readonly postBufs: GPUBuffer[] = []
  private targets: Targets | null = null
  private readonly t0 = performance.now()
  constructor(
    private readonly s: Shared,
    host: HTMLElement,
    private readonly spec: ViewSpec,
  ) {
    this.exposure = spec.exposure ?? 1
    this.canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block"
    this.canvas.setAttribute("aria-hidden", "true")
    host.prepend(this.canvas)
    this.ctx = this.canvas.getContext("webgpu")!
    this.ctx.configure({ device: s.device, format: s.format, alphaMode: "opaque" })
    let pipeline = s.scenes.get(spec.wgsl)
    if (!pipeline) {
      const module = compile(s.device, PRELUDE + spec.wgsl, spec.label)
      pipeline = s.device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format: HDR }] },
        primitive: { topology: "triangle-list" },
      })
      s.scenes.set(spec.wgsl, pipeline)
    }
    this.pipeline = pipeline
    this.sceneBuf = s.device.createBuffer({
      size: SCENE_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    // One small uniform block per pass: down × LEVELS, up × (LEVELS − 1), composite.
    for (let i = 0; i < LEVELS * 2; i++)
      this.postBufs.push(
        s.device.createBuffer({
          size: 48,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      )
  }
  /** Seconds since the view was made, for scenes that shimmer. */
  get time() {
    return (performance.now() - this.t0) / 1000
  }
  private fit() {
    const dpr = Math.min(2, devicePixelRatio || 1)
    const w = Math.round(this.canvas.clientWidth * dpr)
    const h = Math.round(this.canvas.clientHeight * dpr)
    if (w < 2 || h < 2) return null
    if (this.targets && this.targets.w === w && this.targets.h === h) return this.targets
    const { device, layout, sampler, noise } = this.s
    if (this.targets) {
      this.targets.hdr.destroy()
      for (const t of this.targets.levels) t.destroy()
    }
    this.canvas.width = w
    this.canvas.height = h
    const tex = (tw: number, th: number) =>
      device.createTexture({
        size: [Math.max(1, tw), Math.max(1, th)],
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      })
    const hdr = tex(w, h)
    const levels: GPUTexture[] = []
    for (let i = 0; i < LEVELS; i++) levels.push(tex(w >> (i + 1), h >> (i + 1)))
    const bind = (src: GPUTexture, buf: GPUBuffer, bloom: GPUTexture) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: buf } },
          { binding: 3, resource: bloom.createView() },
          { binding: 4, resource: noise },
        ],
      })
    const binds: GPUBindGroup[] = []
    // Down: hdr → L0 → … → L4. Up: L4 → L3 … L1 → L0 (added on). Composite: hdr with L0.
    for (let i = 0; i < LEVELS; i++)
      binds.push(bind(i ? levels[i - 1]! : hdr, this.postBufs[i]!, hdr))
    for (let i = LEVELS - 1; i > 0; i--)
      binds.push(bind(levels[i]!, this.postBufs[LEVELS + (LEVELS - 1 - i)]!, hdr))
    binds.push(bind(hdr, this.postBufs[LEVELS * 2 - 1]!, levels[0]!))
    const scene = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.sceneBuf } }],
    })
    this.targets = { w, h, hdr, levels, binds, scene }
    return this.targets
  }
  render() {
    const t = this.fit()
    if (!t) return
    const { device } = this.s
    const q = device.queue
    this.data[0] = t.w
    this.data[1] = t.h
    this.data[2] = t.w / Math.max(1, this.canvas.clientWidth)
    this.data[3] = this.time
    q.writeBuffer(this.sceneBuf, 0, this.data)
    const post = (i: number, texel: [number, number], first: number, radius: number) =>
      q.writeBuffer(
        this.postBufs[i]!,
        0,
        new Float32Array([
          texel[0],
          texel[1],
          0,
          0,
          first,
          radius,
          this.spec.bloom ?? 0.06,
          this.exposure,
          this.spec.tone === "neutral" ? 1 : 0,
          this.spec.vignette ?? 0,
          this.spec.saturation ?? 1,
          0,
        ]),
      )
    const size = (tex: GPUTexture): [number, number] => [1 / tex.width, 1 / tex.height]
    for (let i = 0; i < LEVELS; i++) post(i, size(i ? t.levels[i - 1]! : t.hdr), i ? 0 : 1, 1)
    for (let i = LEVELS - 1; i > 0; i--) post(LEVELS + (LEVELS - 1 - i), size(t.levels[i]!), 0, 1)
    post(LEVELS * 2 - 1, size(t.hdr), 0, 1)

    const enc = device.createCommandEncoder()
    const pass = (view: GPUTextureView, load: GPULoadOp) =>
      enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: load, storeOp: "store", clearValue: [0, 0, 0, 1] }],
      })
    let p = pass(t.hdr.createView(), "clear")
    p.setPipeline(this.pipeline)
    p.setBindGroup(0, t.scene)
    p.draw(3)
    p.end()
    for (let i = 0; i < LEVELS; i++) {
      p = pass(t.levels[i]!.createView(), "clear")
      p.setPipeline(this.s.down)
      p.setBindGroup(0, t.binds[i]!)
      p.draw(3)
      p.end()
    }
    for (let k = 0; k < LEVELS - 1; k++) {
      const i = LEVELS - 1 - k
      p = pass(t.levels[i - 1]!.createView(), "load")
      p.setPipeline(this.s.up)
      p.setBindGroup(0, t.binds[LEVELS + k]!)
      p.draw(3)
      p.end()
    }
    p = pass(this.ctx.getCurrentTexture().createView(), "clear")
    p.setPipeline(this.s.composite)
    p.setBindGroup(0, t.binds[LEVELS * 2 - 1]!)
    p.draw(3)
    p.end()
    q.submit([enc.finish()])
  }
}

/** A WebGPU preview in `host` (behind its other children), or null without WebGPU. */
export function gpuView(host: HTMLElement, spec: ViewSpec) {
  return shared ? new GpuView(shared, host, spec) : null
}

// ── Light ────────────────────────────────────────────────────────────────────────────────────

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
  const lin = [r, g, b].map((c) => {
    const x = Math.min(1, Math.max(0, c / 255))
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
  return lin.map((c) => c / Math.max(1e-4, y)) as [number, number, number]
}

/** An sRGB hex or CSS rgb colour as linear 0–1 channels. */
export function linearRgb(rgb255: readonly number[]): [number, number, number] {
  return rgb255.slice(0, 3).map((c) => {
    const x = c / 255
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
}
