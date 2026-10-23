import { defineControls, knob, spring, toggle } from "knobs"

// A game with its tuning panel open: press the canvas and its keys (WASD, arrows, R, S) are the
// game's again while the panel stays where it is. Drag the panel by its header; it stays put.
const controls = defineControls(
  "play",
  {
    speed: knob(260, {
      min: 60,
      max: 640,
      step: 10,
      unit: "px/s",
      label: "Speed",
      group: "Player",
      description: "How fast the square moves while a key is held",
    }),
    size: knob(28, {
      min: 12,
      max: 64,
      step: 1,
      unit: "px",
      label: "Size",
      group: "Player",
      description: "The square's side",
    }),
    trail: toggle(true, {
      label: "Trail",
      group: "Player",
      description: "A fading trail behind the square",
    }),
    hue: knob(212, { min: 0, max: 360, step: 1, unit: "°", label: "Hue", group: "Look" }),
    glow: knob(0.4, {
      min: 0,
      max: 1,
      step: 0.05,
      label: "Strength",
      group: "Look",
      subsection: "Glow",
    }),
    spread: knob(18, {
      min: 0,
      max: 48,
      step: 1,
      unit: "px",
      label: "Spread",
      group: "Look",
      subsection: "Glow",
    }),
    camera: spring(
      { duration: 0.35, bounce: 0 },
      {
        label: "Follow",
        group: "Camera",
        folded: true,
        description: "How the view catches up with the square",
      },
    ),
    hitboxes: toggle(false, { label: "Show hitboxes", group: "Debug" }),
  },
  { enabled: true },
)

const canvas = document.getElementById("stage") as HTMLCanvasElement
const heardEl = document.getElementById("heard")!
const ctx = canvas.getContext("2d")!
const heard: string[] = []
const held = new Set<string>()
const MOVES: Record<string, [number, number]> = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  arrowup: [0, -1],
  arrowleft: [-1, 0],
  arrowdown: [0, 1],
  arrowright: [1, 0],
}
// Games cancel the press so the canvas never takes focus or selects text.
for (const type of ["pointerdown", "mousedown"])
  canvas.addEventListener(type, (event) => event.preventDefault())
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase()
  heard.push(key)
  heardEl.textContent = `game heard: ${heard.slice(-6).join(" ")}`
  if (MOVES[key]) {
    held.add(key)
    event.preventDefault()
  }
})
window.addEventListener("keyup", (event) => held.delete(event.key.toLowerCase()))

let x = innerWidth * 0.62
let y = innerHeight * 0.5
const trail: [number, number][] = []
let last = performance.now()
const frame = (now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const v = controls.get()
  let dx = 0
  let dy = 0
  for (const key of held) {
    dx += MOVES[key]![0]
    dy += MOVES[key]![1]
  }
  x = Math.max(0, Math.min(innerWidth, x + dx * v.speed * dt))
  y = Math.max(0, Math.min(innerHeight, y + dy * v.speed * dt))
  trail.push([x, y])
  if (trail.length > 24) trail.shift()
  const dpr = devicePixelRatio
  if (canvas.width !== innerWidth * dpr) canvas.width = innerWidth * dpr
  if (canvas.height !== innerHeight * dpr) canvas.height = innerHeight * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  const color = `hsl(${v.hue} 80% 60%)`
  if (v.trail)
    trail.forEach(([tx, ty], i) => {
      ctx.globalAlpha = (i / trail.length) * 0.25
      ctx.fillStyle = color
      ctx.fillRect(tx - v.size / 2, ty - v.size / 2, v.size, v.size)
    })
  ctx.globalAlpha = 1
  ctx.shadowColor = color
  ctx.shadowBlur = v.glow * v.spread
  ctx.fillStyle = color
  ctx.fillRect(x - v.size / 2, y - v.size / 2, v.size, v.size)
  ctx.shadowBlur = 0
  if (v.hitboxes) {
    ctx.strokeStyle = "#ff5f5f"
    ctx.strokeRect(x - v.size / 2, y - v.size / 2, v.size, v.size)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

controls.attach(canvas, { label: "Tune", reveal: "always" })

Object.assign(window, { play: { controls, heard } })
