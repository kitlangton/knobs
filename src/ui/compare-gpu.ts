// The compare viewer's WebGPU path: one fullscreen pass with a mode uniform. Each side's latest
// frame lives in a texture of its own, copied in only when a new frame arrives (a video's frame
// callback or seek, an image's load), and a second texture per side holds a cached frame shown
// while a seek is in flight; pointer moves change uniforms and draw once. Two modes are composited
// and mixed, so a mode change crossfades instead of popping. Every viewer on the page shares one
// device and pipeline; each has its own canvas, textures and uniforms.
import type { Rect } from "./compare-model.js"

export const MODE_INDEX = { side: 0, wipe: 1, difference: 2 } as const

export interface CompareDraw {
  /** Device px: where each side's picture lands (zoomed, it's larger than its clip). */
  readonly before: Rect
  readonly after: Rect
  /** Device px: the part of the stage each side may draw in. */
  readonly beforeClip: Rect
  readonly afterClip: Rect
  /** Device px: the clips' corner radii, Before's left and right, then After's. */
  readonly radii: readonly [number, number, number, number]
  readonly width: number
  readonly height: number
  readonly dpr: number
  /**
   * Where Before is cut (device px: the split side by side, the wipe's line fused) and its soft
   * edge either side (device px). Side and Wipe composite the same way; only the cut moves.
   */
  readonly wipeX: number
  readonly soft: number
  readonly from: number
  readonly to: number
  /** 0 shows `from`, 1 shows `to`. */
  readonly mix: number
  readonly threshold: number
  readonly gain: number
  readonly accent: readonly [number, number, number]
  /** Device px centre and radius, and zoom; null for none. */
  readonly loupe: {
    readonly x: number
    readonly y: number
    readonly r: number
    readonly zoom: number
  } | null
  /** Each side shows its preview texture (a cached frame) instead of its video's. */
  readonly preview: readonly [boolean, boolean]
}

export interface CompareGpu {
  /**
   * Copies a frame in (0 Before, 1 After; 2 and 3 their previews); false if it couldn't (no data
   * yet, or a tainted source).
   */
  upload(slot: 0 | 1 | 2 | 3, source: CanvasImageSource, w: number, h: number): boolean
  /** Forgets a side's frame (a new source is loading). */
  clear(side: 0 | 1): void
  /** Frees the textures and shrinks the canvas (off screen); uploads bring them back. */
  shrink(): void
  draw(frame: CompareDraw): void
  dispose(): void
}

const WGSL = /* wgsl */ `
struct U {
  ra: vec4f, rb: vec4f,
  view: vec4f,   // w, h, dpr, _
  wipe: vec4f,   // x, soft, _, _
  modes: vec4f,  // from, to, mix, _
  diff: vec4f,   // threshold, gain, readyA, readyB
  accent: vec4f,
  loupe: vec4f,  // x, y, r, zoom (0: none)
  src: vec4f,    // Before, After from their previews
  ca: vec4f, cb: vec4f, // where each side may draw
  radii: vec4f,  // the clips' corners: Before left, right; After left, right
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var A: texture_2d<f32>;
@group(0) @binding(2) var B: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
@group(0) @binding(4) var PA: texture_2d<f32>;
@group(0) @binding(5) var PB: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

// Coverage of rect r at p: 1 inside, 0 outside, a one-pixel antialiased edge.
fn cover(p: vec2f, r: vec4f) -> f32 {
  let d = min(min(p.x - r.x, r.x + r.z - p.x), min(p.y - r.y, r.y + r.w - p.y));
  return clamp(d + 0.5, 0.0, 1.0);
}

// Coverage of rect r at p with its left corners rounded rl and its right ones rr.
fn coverRound(p: vec2f, r: vec4f, rl: f32, rr: f32) -> f32 {
  let h = r.zw * 0.5;
  let q0 = p - (r.xy + h);
  let rad = min(select(rl, rr, q0.x > 0.0), min(h.x, h.y));
  let q = abs(q0) - h + vec2f(rad);
  let d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - rad;
  return clamp(0.5 - d, 0.0, 1.0);
}

// A side's colour where rect r maps it to p, and its coverage inside clip c (corners rc) there.
fn take(t: texture_2d<f32>, p: vec2f, r: vec4f, c0: vec4f, rc: vec2f, near: bool, ready: f32) -> vec4f {
  let uv = clamp((p - r.xy) / max(r.zw, vec2f(1e-3)), vec2f(0.0), vec2f(1.0));
  var c: vec3f;
  if (near) {
    let s = vec2f(textureDimensions(t));
    c = textureLoad(t, vec2i(min(uv * s, s - 1.0)), 0).rgb;
  } else {
    c = textureSampleLevel(t, smp, uv, 0.0).rgb;
  }
  return vec4f(c, min(cover(p, r), coverRound(p, c0, rc.x, rc.y)) * ready);
}

fn takeA(p: vec2f, r: vec4f, c0: vec4f, near: bool) -> vec4f {
  if (u.src.x > 0.5) { return take(PA, p, r, c0, u.radii.xy, near, 1.0); }
  return take(A, p, r, c0, u.radii.xy, near, u.diff.z);
}
fn takeB(p: vec2f, r: vec4f, c0: vec4f, near: bool) -> vec4f {
  if (u.src.y > 0.5) { return take(PB, p, r, c0, u.radii.zw, near, 1.0); }
  return take(B, p, r, c0, u.radii.zw, near, u.diff.w);
}

fn pm(c: vec4f) -> vec4f { return vec4f(c.rgb * c.a, c.a); }

fn composite(mode: u32, p: vec2f, a: vec4f, b: vec4f) -> vec4f {
  switch mode {
    case 2u: {
      let d = abs(a.rgb - b.rgb);
      let h = smoothstep(u.diff.x, u.diff.x + 0.06, max(d.r, max(d.g, d.b)) * u.diff.y) * min(a.a, b.a);
      let c = mix(vec3f(luma(b.rgb) * 0.35), u.accent.rgb, h);
      return pm(vec4f(c, max(a.a, b.a)));
    }
    default: {}
  }
  // Side by side, fusing and wiping: Before over After, cut at the seam with its feather.
  let s = max(u.wipe.y, 0.5);
  let ka = a.a * (1.0 - smoothstep(u.wipe.x - s, u.wipe.x + s, p.x));
  return vec4f(a.rgb * ka + b.rgb * b.a * (1.0 - ka), ka + b.a * (1.0 - ka));
}

@fragment fn fs(@builtin(position) q: vec4f) -> @location(0) vec4f {
  var p = q.xy;
  var near = false;
  var ring = 0.0;
  let L = u.loupe;
  if (L.w > 0.0) {
    let d = distance(p, L.xy);
    if (d < L.z) {
      p = L.xy + (p - L.xy) / L.w;
      near = true;
    }
    ring = clamp(1.0 - abs(d - L.z) / max(u.view.z, 1.0), 0.0, 1.0);
  }
  let a = takeA(p, u.ra, u.ca, near);
  let b = takeB(p, u.rb, u.cb, near);
  var o = mix(composite(u32(u.modes.x), p, a, b), composite(u32(u.modes.y), p, a, b), u.modes.z);
  if (near) { o = o + vec4f(0.05, 0.05, 0.06, 1.0) * (1.0 - o.a); }
  o = mix(o, vec4f(0.92), ring * 0.9);
  return o;
}
`

const TEXTURE_BINDING = 4
const COPY_DST = 2
const RENDER_ATTACHMENT = 16

// WebGPU's types aren't in this project's lib, as in the panel's renderer.
interface Shared {
  readonly adapter: any
  readonly device: any
  readonly format: string
  readonly pipeline: any
  readonly sampler: any
}
let shared: Promise<Shared | null> | null = null
const lostListeners = new Set<() => void>()

/** The page's one device and pipeline; a lost device tells every viewer and is made again. */
function sharedGpu(nav: any): Promise<Shared | null> {
  shared ??= (async () => {
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" })
      if (!adapter) return null
      const device = await adapter.requestDevice()
      const format = nav.gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm"
      const module = device.createShaderModule({ code: WGSL })
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module, entryPoint: "vs" },
        fragment: { module, entryPoint: "fs", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      })
      const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
      // Held for the page's life: a device whose adapter was collected can be lost.
      const s: Shared = { adapter, device, format, pipeline, sampler }
      device.lost.then(() => {
        shared = null
        for (const f of [...lostListeners]) f()
      })
      return s
    } catch {
      shared = null
      return null
    }
  })()
  return shared
}

/** A renderer on `canvas`, or null where WebGPU isn't there. `onLost` hears a lost device. */
export async function createCompareGpu(
  canvas: HTMLCanvasElement,
  onLost: () => void,
): Promise<CompareGpu | null> {
  const nav = canvas.ownerDocument.defaultView?.navigator as any
  if (!nav?.gpu) return null
  const s = await sharedGpu(nav)
  if (!s) return null
  const { device, pipeline, sampler, format } = s
  const ctx = canvas.getContext("webgpu") as any
  if (!ctx) return null
  ctx.configure({ device, format, alphaMode: "premultiplied" })
  let disposed = false
  const lost = () => {
    if (!disposed) onLost()
  }
  lostListeners.add(lost)

  const uniforms = device.createBuffer({ size: 192, usage: 64 | 8 /* UNIFORM | COPY_DST */ })
  const data = new Float32Array(48)
  const make = (w: number, h: number) =>
    device.createTexture({
      size: [Math.max(1, w), Math.max(1, h)],
      format: "rgba8unorm",
      usage: TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT,
    })
  const tex = [make(1, 1), make(1, 1), make(1, 1), make(1, 1)]
  const ready = [0, 0]
  let group: any = null
  const bind = () => {
    group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        { binding: 1, resource: tex[0].createView() },
        { binding: 2, resource: tex[1].createView() },
        { binding: 3, resource: sampler },
        { binding: 4, resource: tex[2].createView() },
        { binding: 5, resource: tex[3].createView() },
      ],
    })
  }
  bind()

  return {
    upload(slot, source, w, h) {
      if (disposed || w <= 0 || h <= 0) return false
      try {
        if (tex[slot].width !== w || tex[slot].height !== h) {
          tex[slot].destroy()
          tex[slot] = make(w, h)
          bind()
        }
        device.queue.copyExternalImageToTexture({ source }, { texture: tex[slot] }, [w, h])
        if (slot < 2) ready[slot] = 1
        return true
      } catch {
        return false
      }
    },
    clear(side) {
      ready[side] = 0
    },
    shrink() {
      for (let i = 0; i < 4; i++) {
        tex[i].destroy()
        tex[i] = make(1, 1)
      }
      ready[0] = ready[1] = 0
      bind()
      canvas.width = canvas.height = 1
    },
    draw(f) {
      if (disposed) return
      if (canvas.width !== f.width || canvas.height !== f.height) {
        canvas.width = Math.max(1, f.width)
        canvas.height = Math.max(1, f.height)
      }
      const r = (o: number, x: Rect) => data.set([x.x, x.y, x.w, x.h], o)
      r(0, f.before)
      r(4, f.after)
      data.set([f.width, f.height, f.dpr, 0], 8)
      data.set([f.wipeX, f.soft, 0, 0], 12)
      data.set([f.from, f.to, f.mix, 0], 16)
      data.set([f.threshold, f.gain, ready[0]!, ready[1]!], 20)
      data.set([f.accent[0], f.accent[1], f.accent[2], 1], 24)
      const l = f.loupe
      data.set(l ? [l.x, l.y, l.r, l.zoom] : [0, 0, 0, 0], 28)
      data.set([f.preview[0] ? 1 : 0, f.preview[1] ? 1 : 0, 0, 0], 32)
      r(36, f.beforeClip)
      r(40, f.afterClip)
      data.set(f.radii, 44)
      device.queue.writeBuffer(uniforms, 0, data)
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.draw(3)
      pass.end()
      device.queue.submit([encoder.finish()])
    },
    dispose() {
      disposed = true
      lostListeners.delete(lost)
      for (const t of tex) t.destroy()
      uniforms.destroy()
      try {
        ctx.unconfigure?.()
      } catch {}
    },
  }
}

/** The shared device once made (null before it is, or without WebGPU): for checks. */
export const sharedDevice = async (): Promise<unknown> =>
  shared ? ((await shared)?.device ?? null) : null
