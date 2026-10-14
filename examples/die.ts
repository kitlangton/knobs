import { defineControls, knob, spring } from "knobs"
import { mountPanel } from "knobs/panel"
import {
  createDieCanvas,
  DIE_LOOK,
  DIE_SPIN,
  type DieLook,
  DieMotion,
  type DieView,
  dieBox,
  dieSamples,
} from "../src/panel/die.js"
import { DIE_WGSL } from "../src/panel/gpu/die.wgsl.js"

const controls = defineControls(
  "die",
  {
    spin: spring(DIE_SPIN.spring, { label: "Spin", group: "Roll" }),
    turns: knob(DIE_SPIN.turns, { min: 0, max: 3, step: 1, label: "Extra turns", group: "Roll" }),
    perspective: knob(DIE_LOOK.perspective, {
      min: 1.5,
      max: 10,
      step: 0.1,
      label: "Perspective",
      group: "Shape",
    }),
    lift: knob(DIE_LOOK.lift, { min: 0, max: 1, step: 0.01, label: "Lift", group: "Shape" }),
    bevel: knob(DIE_LOOK.bevel, {
      min: 10,
      max: 50,
      step: 1,
      unit: "°",
      label: "Bevel",
      group: "Shape",
    }),
    fill: knob(DIE_LOOK.fill, { min: 0, max: 0.5, step: 0.01, label: "Ambient", group: "Light" }),
    shade: knob(DIE_LOOK.shade, { min: 0, max: 0.6, step: 0.01, label: "Light", group: "Light" }),
    slow: knob(1, {
      min: 1,
      max: 10,
      step: 0.5,
      unit: "×",
      label: "Slow motion",
      group: "Preview",
    }),
    size: knob(120, { min: 15, max: 200, step: 1, unit: "px", label: "Size", group: "Preview" }),
  },
  {
    enabled: true,
    // The panel's Random (its button or `r`) rolls the demo dice along with its own; Mutate (⌥R)
    // nudges them a quarter turn.
    onChange: (_patch, _values, { source }) => {
      if (source === "randomize") roll()
      if (source === "mutate") {
        motion.nudge()
        kick()
      }
    },
  },
)
mountPanel(controls, document.getElementById("panel")!)

const motion = new DieMotion()
let view: DieView = { rx: 0, ry: 0, energy: 0 }
const look = (): DieLook => {
  const v = controls.get()
  return { perspective: v.perspective, lift: v.lift, bevel: v.bevel, fill: v.fill, shade: v.shade }
}

const SHADER = /* wgsl */ `
${DIE_WGSL}
struct U { look: vec4f, color: vec4f, rot: vec2f, size: f32, dpr: f32, energy: f32, shade: f32, samples: f32, box: f32 }
@group(0) @binding(0) var<uniform> u: U;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let origin = vec2f(u.box * u.dpr / 2.0);
  let a = die_coverage(pos.xy, origin, u.dpr, u32(u.samples), u.size, u.rot, u.energy, u.look, u.shade) * u.color.a;
  return vec4f(u.color.rgb * a, a);
}`

type Rgba = readonly [number, number, number, number]
const colorOf = (el: Element): Rgba => {
  const [r, g, b, a] = getComputedStyle(el)
    .color.match(/[\d.]+/g)!
    .map(Number)
  return [r!, g!, b!, a ?? 1]
}

interface Die {
  draw(): void
  remove(): void
}

function domDie(host: HTMLElement, size: number): Die {
  const die = createDieCanvas(document, size)
  host.style.position = "relative"
  host.append(die.canvas)
  return {
    draw: () => {
      // Centred in the host, on whole device pixels.
      const dpr = devicePixelRatio
      const r = host.getBoundingClientRect()
      const w = die.pixels(dpr)
      const left = Math.round((r.left + r.width / 2) * dpr - w / 2)
      const top = Math.round((r.top + r.height / 2) * dpr - w / 2)
      die.canvas.style.left = `${left / dpr - r.left}px`
      die.canvas.style.top = `${top / dpr - r.top}px`
      const centre = [
        (r.left + r.width / 2) * dpr - left,
        (r.top + r.height / 2) * dpr - top,
      ] as const
      die.render(view, look(), colorOf(host), dpr, centre)
    },
    remove: () => die.canvas.remove(),
  }
}

// biome-ignore lint: no WebGPU types in this repo (the renderer uses `any` too)
const gpu = (navigator as any).gpu
const device = await (await gpu?.requestAdapter())?.requestDevice()
const format = gpu?.getPreferredCanvasFormat()
const pipeline = device?.createRenderPipeline({
  layout: "auto",
  vertex: { module: device.createShaderModule({ code: SHADER }), entryPoint: "vs" },
  fragment: {
    module: device.createShaderModule({ code: SHADER }),
    entryPoint: "fs",
    targets: [{ format }],
  },
})

function gpuDie(host: HTMLElement, size: number): Die {
  if (!device) {
    host.textContent = "no WebGPU"
    return { draw() {}, remove() {} }
  }
  const box = dieBox(size)
  const dpr = devicePixelRatio
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = Math.round(box * dpr)
  canvas.style.cssText = `width:${box}px;height:${box}px;margin:${(size - box) / 2}px;display:block;pointer-events:none`
  host.append(canvas)
  const ctx = canvas.getContext("webgpu") as any
  ctx.configure({ device, format, alphaMode: "premultiplied" })
  const buf = device.createBuffer({ size: 64, usage: 0x40 | 0x08 })
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: buf } }],
  })
  return {
    draw() {
      const l = look()
      const [r, g, b, a] = colorOf(host)
      const d2r = Math.PI / 180
      device.queue.writeBuffer(
        buf,
        0,
        new Float32Array([
          l.perspective,
          l.lift,
          Math.cos(l.bevel * d2r),
          l.fill,
          r / 255,
          g / 255,
          b / 255,
          a,
          view.rx * d2r,
          view.ry * d2r,
          size,
          dpr,
          view.energy,
          l.shade,
          dieSamples(size),
          box,
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
    remove: () => canvas.remove(),
  }
}

const el = (id: string) => document.getElementById(id)!
const small = [domDie(el("dom-small"), 15), gpuDie(el("gpu-small"), 15)]
let big: Die[] = []
let bigSize = 0
function layout() {
  const size = controls.get().size
  if (size === bigSize) return
  bigSize = size
  for (const d of big) d.remove()
  big = [domDie(el("dom-big"), size), gpuDie(el("gpu-big"), size)]
}

let last = performance.now()
let running = false
function frame(now: number) {
  view = motion.step((now - last) / 1000 / controls.get().slow)
  last = now
  for (const d of [...small, ...big]) d.draw()
  if (motion.resting) running = false
  else requestAnimationFrame(frame)
}
function kick() {
  if (running) return
  running = true
  last = performance.now()
  requestAnimationFrame(frame)
}
function roll() {
  motion.roll()
  kick()
}

controls.subscribe(() => {
  const v = controls.get()
  motion.tune({ spring: v.spin, turns: v.turns })
  layout()
  kick()
})
for (const id of ["dom-small", "gpu-small", "dom-big", "gpu-big"])
  el(id).addEventListener("click", roll)
addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === " " && !(e.target as Element).closest?.(".knobs-panel, input")) {
    e.preventDefault()
    roll()
  }
})
;(window as unknown as { __die: unknown }).__die = { motion, roll, kick, controls }
motion.tune({ spring: controls.get().spin, turns: controls.get().turns })
layout()
kick()
