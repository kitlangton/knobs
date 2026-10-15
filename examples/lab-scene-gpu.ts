/// <reference types="@webgpu/types" />
// The night street's WebGPU side: targets, pipelines and the frame's passes. Scene (opaque props,
// ground and sky, with fog marched per pixel) → Rain & FX (smoke and fire sprites, rain, splashes,
// depth-tested, nothing written) → Bloom (down and up a half-size chain) → Post (exposure, tone,
// vignette, dither into the canvas). Each view (the live scene, an A/B snapshot, a grid cell)
// draws inside its own rect with its own Frame uniform; every pass is timed when the adapter
// offers timestamp queries.
import postWgsl from "./lab-scene-post.wgsl?raw"
import sceneWgsl from "./lab-scene.wgsl?raw"
import { buildMeshes, MESHES, type MeshKind } from "./lab-scene-world"
import { FRAME_FLOATS, RAMP_ROWS, RAMP_W } from "./lab-scene-params"

const HDR: GPUTextureFormat = "rgba16float"
const DEPTH: GPUTextureFormat = "depth32float"
const FRAME_BYTES = FRAME_FLOATS * 4
// Views sit at dynamic offsets, a multiple of 256 apart.
const FRAME_STRIDE = Math.ceil(FRAME_BYTES / 256) * 256
const MAX_VIEWS = 4
const MAX_PARTS = 512
const MAX_OBJECTS = 64
const MAX_SPRITES = 2048
const PART_FLOATS = 28
const SPRITE_FLOATS = 16
const BLOOM_LEVELS = 5
const POST_SLOT = 256
export const PASSES = ["Scene", "Rain & FX", "Bloom", "Post"] as const

export interface ViewDraw {
  /** Where the view's camera frames (target px), and where it may draw (the A/B wipe's half). */
  rect: [number, number, number, number]
  clip: [number, number, number, number]
  frame: Float32Array
  drops: number
  splashes: number
  /** Its exposure (linear), so an A/B snapshot keeps its own. */
  exposure: number
}
export interface FrameDraw {
  views: ViewDraw[]
  /** Per-view ramp rows, view-major (4 rows × RAMP_W texels × rgba each). */
  ramps: Float32Array | null
  objects: Float32Array
  parts: { data: Float32Array; ranges: Record<MeshKind, { first: number; count: number }> } | null
  sprites: Float32Array
  spriteCount: number
  /** Something is fading in or out: draw with the surface pipeline that discards. */
  fading: boolean
  exposure: number
  bloom: number
  vignette: number
  grain: number
}
export interface Timing {
  /** ms per pass, as PASSES. */
  passes: number[]
  total: number
}

const f16 = (() => {
  const f = new Float32Array(1)
  const u = new Uint32Array(f.buffer)
  return (v: number) => {
    f[0] = v
    const x = u[0]!
    const sign = (x >>> 16) & 0x8000
    const exp = ((x >>> 23) & 0xff) - 127 + 15
    const mant = x & 0x7fffff
    if (exp <= 0) return sign
    if (exp >= 31) return sign | 0x7c00
    return sign | (exp << 10) | (mant >>> 13)
  }
})()

export class SceneRenderer {
  device!: GPUDevice
  timed = false
  adapterName = ""
  software = false
  /** The latest resolved timings (a frame or two behind). */
  timing: Timing | null = null
  width = 0
  height = 0
  private context!: GPUCanvasContext
  private format!: GPUTextureFormat
  private frameBuf!: GPUBuffer
  private partBuf!: GPUBuffer
  private objectBuf!: GPUBuffer
  private spriteBuf!: GPUBuffer
  private postBuf!: GPUBuffer
  private vertexBuf!: GPUBuffer
  private indexBuf!: GPUBuffer
  private rampTex!: GPUTexture
  private dummy!: GPUTexture
  private sampler!: GPUSampler
  private sceneLayout!: GPUBindGroupLayout
  private postLayout!: GPUBindGroupLayout
  private sceneGroup!: GPUBindGroup
  private pipes!: Record<
    "surface" | "surfaceFade" | "sky" | "rain" | "splash" | "sprite" | "down" | "up" | "composite",
    GPURenderPipeline
  >
  private hdr: GPUTexture | null = null
  private depth: GPUTexture | null = null
  private bloomTex: GPUTexture[] = []
  private postGroups: GPUBindGroup[] = []
  private ranges: Record<MeshKind, { first: number; count: number }> = {
    cone: { first: 0, count: 0 },
    cylinder: { first: 0, count: 0 },
    sphere: { first: 0, count: 0 },
    box: { first: 0, count: 0 },
  }
  private meshRanges!: ReturnType<typeof buildMeshes>["ranges"]
  private querySet: GPUQuerySet | null = null
  private resolveBuf: GPUBuffer | null = null
  private readbacks: GPUBuffer[] = []
  private ramp16 = new Uint16Array(RAMP_W * RAMP_ROWS * MAX_VIEWS * 4)
  private postData = new Float32Array((POST_SLOT / 4) * 12)
  lost: Promise<string> | null = null

  static async create(canvas: HTMLCanvasElement): Promise<SceneRenderer> {
    const r = new SceneRenderer()
    await r.init(canvas)
    return r
  }

  private async init(canvas: HTMLCanvasElement) {
    const gpu = navigator.gpu
    if (!gpu) throw new Error("WebGPU isn't available in this browser")
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" })
    if (!adapter) throw new Error("No WebGPU adapter")
    const info = adapter.info
    this.adapterName =
      [info?.vendor, info?.architecture, info?.description].filter(Boolean).join(" ") || "WebGPU"
    this.software = info?.architecture === "swiftshader" || /swiftshader/i.test(this.adapterName)
    this.timed = adapter.features.has("timestamp-query")
    const device = await adapter.requestDevice({
      requiredFeatures: this.timed ? ["timestamp-query"] : [],
    })
    this.device = device
    this.lost = device.lost.then((i) => i.message || i.reason || "lost")
    device.addEventListener("uncapturederror", (e) =>
      console.error("[lab-scene]", (e as GPUUncapturedErrorEvent).error.message),
    )
    this.context = canvas.getContext("webgpu")!
    this.format = gpu.getPreferredCanvasFormat()
    this.context.configure({ device, format: this.format, alphaMode: "opaque" })

    const U = GPUBufferUsage
    this.frameBuf = device.createBuffer({
      size: FRAME_STRIDE * MAX_VIEWS,
      usage: U.UNIFORM | U.COPY_DST,
    })
    this.partBuf = device.createBuffer({
      size: MAX_PARTS * PART_FLOATS * 4,
      usage: U.STORAGE | U.COPY_DST,
    })
    this.objectBuf = device.createBuffer({ size: MAX_OBJECTS * 16, usage: U.STORAGE | U.COPY_DST })
    this.spriteBuf = device.createBuffer({
      size: MAX_SPRITES * SPRITE_FLOATS * 4,
      usage: U.STORAGE | U.COPY_DST,
    })
    this.postBuf = device.createBuffer({ size: POST_SLOT * 12, usage: U.UNIFORM | U.COPY_DST })
    const mesh = buildMeshes()
    this.meshRanges = mesh.ranges
    this.vertexBuf = device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: U.VERTEX | U.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuf, 0, mesh.vertices)
    const indexBytes = Math.ceil(mesh.indices.byteLength / 4) * 4
    this.indexBuf = device.createBuffer({ size: indexBytes, usage: U.INDEX | U.COPY_DST })
    const padded = new Uint16Array(indexBytes / 2)
    padded.set(mesh.indices)
    device.queue.writeBuffer(this.indexBuf, 0, padded)
    const T = GPUTextureUsage
    this.rampTex = device.createTexture({
      size: [RAMP_W, RAMP_ROWS * MAX_VIEWS],
      format: "rgba16float",
      usage: T.TEXTURE_BINDING | T.COPY_DST,
    })
    this.dummy = device.createTexture({ size: [1, 1], format: HDR, usage: T.TEXTURE_BINDING })
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    })

    const VF = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
    this.sceneLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: VF,
          buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: FRAME_BYTES },
        },
        { binding: 1, visibility: VF, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: VF, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: VF, texture: { sampleType: "float" } },
        { binding: 4, visibility: VF, sampler: { type: "filtering" } },
        { binding: 5, visibility: VF, buffer: { type: "read-only-storage" } },
        { binding: 6, visibility: VF, texture: { sampleType: "float" } },
        { binding: 7, visibility: VF, sampler: { type: "filtering" } },
      ],
    })
    this.sceneGroup = device.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuf, size: FRAME_BYTES } },
        { binding: 1, resource: { buffer: this.partBuf } },
        { binding: 2, resource: { buffer: this.objectBuf } },
        { binding: 3, resource: this.rampTex.createView() },
        { binding: 4, resource: this.sampler },
        { binding: 5, resource: { buffer: this.spriteBuf } },
        { binding: 6, resource: this.noiseTexture().createView() },
        {
          binding: 7,
          resource: this.device.createSampler({
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "linear",
            mipmapFilter: "linear",
            maxAnisotropy: 8,
          }),
        },
      ],
    })
    this.postLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: 128 },
        },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    })

    const scene = device.createShaderModule({ code: sceneWgsl, label: "lab-scene" })
    const post = device.createShaderModule({ code: postWgsl, label: "lab-scene-post" })
    for (const [m, name] of [
      [scene, "lab-scene.wgsl"],
      [post, "lab-scene-post.wgsl"],
    ] as const) {
      const info = await m.getCompilationInfo()
      const errors = info.messages.filter((x) => x.type === "error")
      if (errors.length)
        throw new Error(
          `${name}: ${errors.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`,
        )
    }
    const sceneLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] })
    const postLayout = device.createPipelineLayout({ bindGroupLayouts: [this.postLayout] })
    const premul: GPUBlendState = {
      color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
    }
    const add: GPUBlendState = {
      color: { srcFactor: "one", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
    }
    const fx = (vs: string, fs: string): GPURenderPipelineDescriptor => ({
      layout: sceneLayout,
      vertex: { module: scene, entryPoint: vs },
      fragment: { module: scene, entryPoint: fs, targets: [{ format: HDR, blend: premul }] },
      primitive: { topology: "triangle-list" },
      depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less" },
    })
    const full = (
      fs: string,
      format: GPUTextureFormat,
      blend?: GPUBlendState,
    ): GPURenderPipelineDescriptor => ({
      layout: postLayout,
      vertex: { module: post, entryPoint: "vs_full" },
      fragment: {
        module: post,
        entryPoint: fs,
        targets: [{ format, ...(blend ? { blend } : {}) }],
      },
      primitive: { topology: "triangle-list" },
    })
    // Two surface pipelines: one that never discards (so a tiled GPU can drop hidden fragments before
    // shading them), and one with the dithered fade, used only while something fades.
    const surfacePipe = (fs: string): GPURenderPipelineDescriptor => ({
      layout: sceneLayout,
      vertex: {
        module: scene,
        entryPoint: "vs_surface",
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: { module: scene, entryPoint: fs, targets: [{ format: HDR }] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: "less" },
    })
    const [surface, surfaceFade, sky, rain, splash, sprite, down, up, composite] =
      await Promise.all([
        device.createRenderPipelineAsync(surfacePipe("fs_surface")),
        device.createRenderPipelineAsync(surfacePipe("fs_surface_fade")),
        device.createRenderPipelineAsync({
          layout: sceneLayout,
          vertex: { module: scene, entryPoint: "vs_full" },
          fragment: { module: scene, entryPoint: "fs_sky", targets: [{ format: HDR }] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less-equal" },
        }),
        device.createRenderPipelineAsync(fx("vs_rain", "fs_rain")),
        device.createRenderPipelineAsync(fx("vs_splash", "fs_splash")),
        device.createRenderPipelineAsync(fx("vs_sprite", "fs_sprite")),
        device.createRenderPipelineAsync(full("fs_down", HDR)),
        device.createRenderPipelineAsync(full("fs_up", HDR, add)),
        device.createRenderPipelineAsync(full("fs_composite", this.format)),
      ])
    this.pipes = { surface, surfaceFade, sky, rain, splash, sprite, down, up, composite }

    if (this.timed) {
      this.querySet = device.createQuerySet({ type: "timestamp", count: 8 })
      this.resolveBuf = device.createBuffer({ size: 64, usage: U.QUERY_RESOLVE | U.COPY_SRC })
      for (let i = 0; i < 3; i++)
        this.readbacks.push(device.createBuffer({ size: 64, usage: U.MAP_READ | U.COPY_DST }))
    }
  }

  /** Tiling noise with its mips (see lab-scene.wgsl's `nt`): fbm at three scales, value noise. */
  private noiseTexture() {
    const N = 256
    const lattice = (period: number, seed: number) => {
      const v = new Float32Array(period * period)
      let s = seed
      for (let i = 0; i < v.length; i++) {
        s = (s * 16807) % 2147483647
        v[i] = s / 2147483647
      }
      return (x: number, y: number) => {
        const xi = Math.floor(x)
        const yi = Math.floor(y)
        const fx = x - xi
        const fy = y - yi
        const ux = fx * fx * (3 - 2 * fx)
        const uy = fy * fy * (3 - 2 * fy)
        const at = (i: number, j: number) =>
          v[(((j % period) + period) % period) * period + (((i % period) + period) % period)]!
        const a = at(xi, yi)
        const b = at(xi + 1, yi)
        const c = at(xi, yi + 1)
        const d = at(xi + 1, yi + 1)
        return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
      }
    }
    const fbm = (base: number, seed: number) => {
      const oct = [0, 1, 2, 3].map((o) => lattice(base << o, seed + o * 101))
      return (u: number, v: number) => {
        let sum = 0
        let amp = 0.5
        oct.forEach((n, o) => {
          sum += amp * n(u * (base << o), v * (base << o))
          amp *= 0.5
        })
        return sum / 0.9375
      }
    }
    const chans = [
      fbm(4, 7),
      fbm(8, 19),
      fbm(16, 31),
      (() => {
        const n = lattice(64, 43)
        return (u: number, v: number) => n(u * 64, v * 64)
      })(),
    ]
    let level = new Float32Array(N * N * 4)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        for (let c = 0; c < 4; c++) level[(y * N + x) * 4 + c] = chans[c]!(x / N, y / N)
    const mips = Math.log2(N) + 1
    const tex = this.device.createTexture({
      size: [N, N],
      format: "rgba8unorm",
      mipLevelCount: mips,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    let size = N
    for (let m = 0; m < mips; m++) {
      const bytes = new Uint8Array(size * size * 4)
      for (let i = 0; i < bytes.length; i++)
        bytes[i] = Math.round(Math.min(1, Math.max(0, level[i]!)) * 255)
      this.device.queue.writeTexture(
        { texture: tex, mipLevel: m },
        bytes,
        { bytesPerRow: size * 4 },
        [size, size],
      )
      if (size === 1) break
      const half = size >> 1
      const next = new Float32Array(half * half * 4)
      for (let y = 0; y < half; y++)
        for (let x = 0; x < half; x++)
          for (let c = 0; c < 4; c++) {
            const at = (dx: number, dy: number) =>
              level[((y * 2 + dy) * size + x * 2 + dx) * 4 + c]!
            next[(y * half + x) * 4 + c] = (at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4
          }
      level = next
      size = half
    }
    return tex
  }

  /** Sizes the canvas and the targets: `w` × `h` device pixels on screen, rendered at `scale`. */
  resize(canvas: HTMLCanvasElement, w: number, h: number, scale: number) {
    w = Math.max(16, Math.round(w))
    h = Math.max(16, Math.round(h))
    const rw = Math.max(16, Math.round(w * scale))
    const rh = Math.max(16, Math.round(h * scale))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    if (this.hdr && this.width === rw && this.height === rh) return false
    this.width = rw
    this.height = rh
    this.hdr?.destroy()
    this.depth?.destroy()
    for (const t of this.bloomTex) t.destroy()
    const T = GPUTextureUsage
    this.hdr = this.device.createTexture({
      size: [rw, rh],
      format: HDR,
      usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING,
    })
    this.depth = this.device.createTexture({
      size: [rw, rh],
      format: DEPTH,
      usage: T.RENDER_ATTACHMENT,
    })
    this.bloomTex = []
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const bw = Math.max(1, rw >> (i + 1))
      const bh = Math.max(1, rh >> (i + 1))
      this.bloomTex.push(
        this.device.createTexture({
          size: [bw, bh],
          format: HDR,
          usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING,
        }),
      )
    }
    // Bind groups: the 5 downsamples, the 4 upsamples, then the composite.
    const group = (src: GPUTexture, extra: GPUTexture = this.dummy) =>
      this.device.createBindGroup({
        layout: this.postLayout,
        entries: [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: { buffer: this.postBuf, size: 128 } },
          { binding: 3, resource: extra.createView() },
        ],
      })
    this.postGroups = [group(this.hdr)]
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) this.postGroups.push(group(this.bloomTex[i]!))
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) this.postGroups.push(group(this.bloomTex[i]!))
    this.postGroups.push(group(this.hdr, this.bloomTex[0]!))
    return true
  }

  /** Bytes held on the GPU by the scene (targets, the canvas's chain and buffers). */
  get memory() {
    const px = this.width * this.height
    let bytes = px * 8 + px * 4
    for (let i = 0; i < BLOOM_LEVELS; i++) bytes += (px >> (2 * (i + 1))) * 8
    const canvas = this.context?.canvas as HTMLCanvasElement | undefined
    if (canvas) bytes += canvas.width * canvas.height * 4 * 3
    bytes +=
      FRAME_STRIDE * MAX_VIEWS +
      256 * 256 * 4 * 1.34 +
      MAX_PARTS * PART_FLOATS * 4 +
      MAX_SPRITES * SPRITE_FLOATS * 4
    bytes += RAMP_W * RAMP_ROWS * MAX_VIEWS * 8
    return bytes
  }

  /** Encodes and submits one frame; returns the draw calls per pass. */
  render(f: FrameDraw): number[] {
    const d = this.device
    const q = d.queue
    if (!this.hdr || !this.depth) return [0, 0, 0, 0]
    f.views.forEach((v, i) =>
      q.writeBuffer(this.frameBuf, i * FRAME_STRIDE, v.frame as Float32Array<ArrayBuffer>),
    )
    q.writeBuffer(this.objectBuf, 0, f.objects as Float32Array<ArrayBuffer>)
    if (f.parts) {
      q.writeBuffer(this.partBuf, 0, f.parts.data as Float32Array<ArrayBuffer>)
      this.ranges = f.parts.ranges
    }
    if (f.spriteCount)
      q.writeBuffer(
        this.spriteBuf,
        0,
        f.sprites as Float32Array<ArrayBuffer>,
        0,
        f.spriteCount * SPRITE_FLOATS,
      )
    if (f.ramps) {
      const n = Math.min(f.ramps.length, this.ramp16.length)
      for (let i = 0; i < n; i++) this.ramp16[i] = f16(f.ramps[i]!)
      q.writeTexture({ texture: this.rampTex }, this.ramp16, { bytesPerRow: RAMP_W * 8 }, [
        RAMP_W,
        RAMP_ROWS * MAX_VIEWS,
      ])
    }
    const enc = d.createCommandEncoder()
    const ts = (i: number): GPURenderPassTimestampWrites | undefined =>
      this.querySet
        ? {
            querySet: this.querySet,
            beginningOfPassWriteIndex: i * 2,
            endOfPassWriteIndex: i * 2 + 1,
          }
        : undefined
    const draws = [0, 0, 0, 0]

    // Scene
    const hdrView = this.hdr.createView()
    const depthView = this.depth.createView()
    let pass = enc.beginRenderPass({
      colorAttachments: [
        { view: hdrView, clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
      ...(ts(0) ? { timestampWrites: ts(0) } : {}),
    })
    pass.setVertexBuffer(0, this.vertexBuf)
    pass.setIndexBuffer(this.indexBuf, "uint16")
    f.views.forEach((v, i) => {
      this.viewport(pass, v.rect, v.clip)
      pass.setBindGroup(0, this.sceneGroup, [i * FRAME_STRIDE])
      pass.setPipeline(f.fading ? this.pipes.surfaceFade : this.pipes.surface)
      for (const kind of MESHES) {
        const r = this.ranges[kind]
        if (!r.count) continue
        const m = this.meshRanges[kind]
        pass.drawIndexed(m.count, r.count, m.first, 0, r.first)
        draws[0]++
      }
      pass.setPipeline(this.pipes.sky)
      pass.draw(3)
      draws[0]++
    })
    pass.end()

    // Rain & FX
    pass = enc.beginRenderPass({
      colorAttachments: [{ view: hdrView, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: { view: depthView, depthReadOnly: true },
      ...(ts(1) ? { timestampWrites: ts(1) } : {}),
    })
    f.views.forEach((v, i) => {
      this.viewport(pass, v.rect, v.clip)
      pass.setBindGroup(0, this.sceneGroup, [i * FRAME_STRIDE])
      if (f.spriteCount) {
        pass.setPipeline(this.pipes.sprite)
        pass.draw(6, f.spriteCount)
        draws[1]++
      }
      if (v.drops > 0) {
        pass.setPipeline(this.pipes.rain)
        pass.draw(6, v.drops)
        draws[1]++
      }
      if (v.splashes > 0) {
        pass.setPipeline(this.pipes.splash)
        pass.draw(6, v.splashes)
        draws[1]++
      }
    })
    pass.end()

    // Bloom: post slots 0–4 go down, 5–8 come up; slot 9 is the composite.
    const P = this.postData
    const slot = (
      i: number,
      texel: [number, number],
      params: number[],
      extra: number[] = [0, 0, 0, 0],
    ) => P.set([texel[0], texel[1], 0, 0, ...params, ...extra], (i * POST_SLOT) / 4)
    slot(0, [1 / this.width, 1 / this.height], [0, 0, 0, -1])
    for (let i = 1; i < BLOOM_LEVELS; i++) {
      const s = this.bloomTex[i - 1]!
      slot(i, [1 / s.width, 1 / s.height], [0, 0, 0, 0])
    }
    for (let k = 0; k < BLOOM_LEVELS - 1; k++) {
      const s = this.bloomTex[BLOOM_LEVELS - 1 - k]!
      slot(BLOOM_LEVELS + k, [1 / s.width, 1 / s.height], [0, 0, 0, 1])
    }
    const C = BLOOM_LEVELS * 2 - 1
    slot(
      C,
      [1 / this.width, 1 / this.height],
      [f.exposure, f.bloom, f.grain, 0],
      [f.vignette, 0, 0, Math.min(4, f.views.length)],
    )
    // Each view's exposure and where it shows (uv), for the composite to pick per pixel.
    const at = (C * POST_SLOT) / 4 + 12
    f.views.slice(0, 4).forEach((v, i) => {
      P[at + i] = v.exposure
      P.set(
        [
          v.clip[0] / this.width,
          v.clip[1] / this.height,
          (v.clip[0] + v.clip[2]) / this.width,
          (v.clip[1] + v.clip[3]) / this.height,
        ],
        at + 4 + i * 4,
      )
    })
    q.writeBuffer(this.postBuf, 0, P)
    const full = (
      view: GPUTextureView,
      pipe: GPURenderPipeline,
      group: number,
      load: boolean,
      t?: GPURenderPassTimestampWrites,
    ) => {
      const p = enc.beginRenderPass({
        colorAttachments: [
          { view, loadOp: load ? "load" : "clear", clearValue: [0, 0, 0, 1], storeOp: "store" },
        ],
        ...(t ? { timestampWrites: t } : {}),
      })
      p.setPipeline(pipe)
      p.setBindGroup(0, this.postGroups[group]!, [group * POST_SLOT])
      p.draw(3)
      p.end()
    }
    const qs = this.querySet
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      const t = qs && i === 0 ? { querySet: qs, beginningOfPassWriteIndex: 4 } : undefined
      full(this.bloomTex[i]!.createView(), this.pipes.down, i, false, t)
      draws[2]++
    }
    for (let k = 0; k < BLOOM_LEVELS - 1; k++) {
      const target = this.bloomTex[BLOOM_LEVELS - 2 - k]!
      const t = qs && k === BLOOM_LEVELS - 2 ? { querySet: qs, endOfPassWriteIndex: 5 } : undefined
      full(target.createView(), this.pipes.up, BLOOM_LEVELS + k, true, t)
      draws[2]++
    }
    full(this.context.getCurrentTexture().createView(), this.pipes.composite, C, false, ts(3))
    draws[3]++

    let readback: GPUBuffer | undefined
    if (this.querySet && this.resolveBuf) {
      enc.resolveQuerySet(this.querySet, 0, 8, this.resolveBuf, 0)
      readback = this.readbacks.pop()
      if (readback) enc.copyBufferToBuffer(this.resolveBuf, 0, readback, 0, 64)
    }
    q.submit([enc.finish()])
    if (readback) {
      const buf = readback
      buf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const t = new BigUint64Array(buf.getMappedRange())
          const ms = (a: number, b: number) => (t[b]! > t[a]! ? Number(t[b]! - t[a]!) / 1e6 : 0)
          // A tiled GPU overlaps passes, so each pass is timed from the end of the one before:
          // the four add up to the frame's span on the GPU.
          const passes = [ms(0, 1), ms(1, 3), ms(3, 5), ms(5, 7)]
          const total = ms(0, 7)
          if (total > 0 && total < 1000) this.timing = { passes, total }
          buf.unmap()
          this.readbacks.push(buf)
        })
        .catch(() => {})
    }
    return draws
  }

  private viewport(
    pass: GPURenderPassEncoder,
    rect: [number, number, number, number],
    clip: [number, number, number, number],
  ) {
    pass.setViewport(rect[0], rect[1], Math.max(1, rect[2]), Math.max(1, rect[3]), 0, 1)
    const [x, y, w, h] = clip
    const cx = Math.max(0, Math.min(this.width - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(this.height - 1, Math.round(y)))
    const cw = Math.max(1, Math.min(this.width - cx, Math.round(x + w) - cx))
    const ch = Math.max(1, Math.min(this.height - cy, Math.round(y + h) - cy))
    pass.setScissorRect(cx, cy, cw, ch)
  }

  destroy() {
    this.device?.destroy()
  }
}
