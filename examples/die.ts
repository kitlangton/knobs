import { createDieElement, DIE_CSS, DieMotion } from "../src/panel/die.js"
import { DIE_WGSL } from "../src/panel/gpu/die.wgsl.js"

const style = document.createElement("style")
style.textContent = DIE_CSS
document.head.append(style)

const motion = new DieMotion()
const doms = ["dom-small", "dom-big"].map((id) => {
  const die = createDieElement(document)
  document.getElementById(id)!.append(die.root)
  return die
})

const SHADER = /* wgsl */ `
${DIE_WGSL}
struct U { size: f32, dpr: f32, rot: vec2f, energy: f32, pad: f32, box: vec2f, color: vec4f }
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = pos.xy / u.dpr - u.box / 2.0;
  let c = die_coverage(p, u.size, u.rot, u.energy);
  let a = c.x + c.y * (1.0 - c.x);
  return vec4f(u.color.rgb * a * u.color.a, a * u.color.a);
}`

interface GpuDie {
  draw(rx: number, ry: number, energy: number): void
}

async function gpuDie(host: HTMLElement, size: number, box: number): Promise<GpuDie | undefined> {
  // biome-ignore lint: no WebGPU types in this repo (the renderer uses `any` too)
  const gpu = (navigator as any).gpu
  const adapter = await gpu?.requestAdapter()
  const device = await adapter?.requestDevice()
  if (!device) {
    host.textContent = "no WebGPU"
    return
  }
  const dpr = devicePixelRatio
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(box * dpr)
  canvas.height = Math.round(box * dpr)
  canvas.style.width = canvas.style.height = `${box}px`
  canvas.style.margin = `${(size - box) / 2}px`
  host.append(canvas)
  const ctx = canvas.getContext("webgpu") as any
  const format = gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: "premultiplied" })
  const module = device.createShaderModule({ code: SHADER })
  const info = await module.getCompilationInfo()
  for (const m of info.messages) console.warn(m.lineNum, m.message)
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
  })
  const buf = device.createBuffer({ size: 48, usage: 0x40 | 0x08 })
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: buf } }],
  })
  const color = getComputedStyle(host.closest(".btn") ?? document.body)
    .color.match(/[\d.]+/g)!
    .map(Number)
  return {
    draw(rx, ry, energy) {
      const d2r = Math.PI / 180
      device.queue.writeBuffer(
        buf,
        0,
        new Float32Array([
          size,
          dpr,
          rx * d2r,
          ry * d2r,
          energy,
          0,
          box,
          box,
          color[0]! / 255,
          color[1]! / 255,
          color[2]! / 255,
          color[3] ?? 1,
        ]),
      )
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 0],
          },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bind)
      pass.draw(3)
      pass.end()
      device.queue.submit([enc.finish()])
    },
  }
}

const gpus = (
  await Promise.all([
    gpuDie(document.getElementById("gpu-small")!, 15, 24),
    gpuDie(document.getElementById("gpu-big")!, 120, 192),
  ])
).filter((g): g is GpuDie => Boolean(g))

const slow = document.getElementById("slow") as HTMLInputElement
const valueEl = document.getElementById("value")!
let last = performance.now()
let running = false

function frame(now: number) {
  const dt = (now - last) / 1000 / Number(slow.value)
  last = now
  const { rx, ry, energy } = motion.step(dt)
  for (const d of doms) d.render(rx, ry, energy)
  for (const g of gpus) g.draw(rx, ry, energy)
  if (motion.resting) {
    running = false
    return
  }
  requestAnimationFrame(frame)
}

function kick() {
  if (running) return
  running = true
  last = performance.now()
  requestAnimationFrame(frame)
}

function roll() {
  valueEl.textContent = String(motion.roll())
  kick()
}

for (const el of document.querySelectorAll(".btn, #dom-big, #gpu-big"))
  el.addEventListener("click", roll)
addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === " ") {
    e.preventDefault()
    roll()
  }
})
;(window as unknown as { __die: unknown }).__die = { motion, roll, kick }
kick()
