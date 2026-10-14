import {
  bezierPoint,
  choice,
  color,
  defineControls,
  easing,
  knob,
  parseColor,
  point,
  spring,
  springMotion,
  toggle,
  type Bezier,
} from "knobs"
import { useEffect, useRef } from "react"
import { reducedMotion, registerStore, site } from "../site"
import type { Controls, Schema } from "knobs"

// The home page's centrepiece: a grid of dots swelling around an origin. Nearly every field
// kind drives it, and dragging on the stage writes the origin back into the same store.
export const field = defineControls(
  "centrepiece",
  {
    columns: knob(22, { min: 8, max: 40, step: 1, label: "Columns", group: "Grid" }),
    size: knob(0.86, { min: 0.2, max: 1.2, step: 0.01, label: "Dot size", group: "Grid" }),
    shape: choice("circle", ["circle", "square", "diamond"], { label: "Shape", group: "Grid" }),
    origin: point(
      { x: 0.7, y: 0.45 },
      { min: 0, max: 1, step: 0.01, label: "Origin", group: "Wave" },
    ),
    reach: knob(0.55, { min: 0.1, max: 1.4, step: 0.01, label: "Reach", group: "Wave" }),
    falloff: easing("ease-out", { label: "Falloff", group: "Wave" }),
    pulse: toggle(true, { label: "Pulse", group: "Wave" }),
    tint: color("oklch(0.66 0.19 256)", { label: "Tint", group: "Colour" }),
    spread: knob(70, {
      min: 0,
      max: 220,
      step: 1,
      unit: "°",
      label: "Hue spread",
      group: "Colour",
    }),
    settle: spring({ duration: 0.6, bounce: 0.35 }, { label: "Settle", group: "Motion" }),
  },
  {
    enabled: true,
    theme: "auto",
    presets: {
      ember: {
        tint: "oklch(0.7 0.18 45)",
        spread: 40,
        shape: "square",
        size: 0.7,
        falloff: [0.65, 0, 0.35, 1],
      },
      lattice: { columns: 34, size: 0.5, shape: "diamond", reach: 0.9, spread: 160 },
      soft: { columns: 14, size: 1.1, reach: 0.8, settle: { duration: 1.1, bounce: 0.05 } },
    },
  },
)
registerStore(field as unknown as Controls<Schema>)

/** The falloff curve as y at evenly spaced x, so each dot is one lookup. */
function lut(curve: Bezier, n = 64) {
  const out = new Float32Array(n + 1)
  for (let i = 0; i <= n; i++) {
    const x = i / n
    let lo = 0
    let hi = 1
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2
      if (bezierPoint(curve, mid)[0] < x) lo = mid
      else hi = mid
    }
    out[i] = bezierPoint(curve, (lo + hi) / 2)[1]
  }
  return out
}

export function Field() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext("2d")!
    let w = 0
    let h = 0
    let dpr = 1
    let radius = new Float32Array(0)
    let velocity = new Float32Array(0)
    let raf = 0
    let last = 0
    let visible = true
    let curveKey = ""
    let curve = lut([0, 0, 0.58, 1])
    const fills = new Map<number, string>()
    // Colour eases toward its target (hue the short way round) so Random and presets glide;
    // a drag in the panel follows exactly.
    let shown: { l: number; c: number; h: number; spread: number } | undefined

    const resize = () => {
      const box = el.getBoundingClientRect()
      dpr = Math.min(devicePixelRatio || 1, 2)
      w = box.width
      h = box.height
      el.width = Math.round(w * dpr)
      el.height = Math.round(h * dpr)
      wake()
    }

    const frame = (now: number) => {
      raf = 0
      const v = field.get()
      const still = reducedMotion() || !site.get().motion
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      const key = v.falloff.join()
      if (key !== curveKey) {
        curveKey = key
        curve = lut(v.falloff)
      }
      const cell = w / v.columns
      const cols = v.columns
      const rows = Math.ceil(h / cell)
      const count = cols * rows
      if (radius.length !== count) {
        radius = new Float32Array(count)
        velocity = new Float32Array(count)
      }
      const { omega, zeta } = springMotion(v.settle)
      const ox = v.origin.x * w
      const oy = v.origin.y * h
      const reach = v.reach * Math.max(w, h)
      const target = { ...(parseColor(v.tint) ?? { l: 0.66, c: 0.19, h: 256 }), spread: v.spread }
      const scrub = document.documentElement.hasAttribute("data-knobs-scrub")
      if (!shown || still || scrub || dt === 0) shown = { ...target }
      else {
        const k = 1 - Math.exp(-dt * 9)
        const dh = ((((target.h - shown.h) % 360) + 540) % 360) - 180
        shown = {
          l: shown.l + (target.l - shown.l) * k,
          c: shown.c + (target.c - shown.c) * k,
          h: shown.h + dh * k,
          spread: shown.spread + (target.spread - shown.spread) * k,
        }
      }
      const settling =
        Math.abs(target.l - shown.l) > 0.002 ||
        Math.abs(target.c - shown.c) > 0.002 ||
        Math.abs(((((target.h - shown.h) % 360) + 540) % 360) - 180) > 0.5 ||
        Math.abs(target.spread - shown.spread) > 0.5
      const tint = {
        l: Math.round(shown.l * 1000) / 1000,
        c: Math.round(shown.c * 1000) / 1000,
        h: shown.h,
      }
      const t = now / 1000
      const pulse = v.pulse && !still
      let moving = settling
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const offsetY = (h - rows * cell) / 2
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const cx = (c + 0.5) * cell
          const cy = offsetY + (r + 0.5) * cell
          const d = Math.hypot(cx - ox, cy - oy) / reach
          let amp = d >= 1 ? 0 : curve[Math.round((1 - d) * 64)]!
          if (pulse) amp += 0.22 * Math.sin(d * 9 - t * 2.6) * Math.max(0, 1 - d * 0.7)
          const target = (cell / 2) * v.size * Math.max(0.06, Math.min(1.15, 0.1 + amp * 0.9))
          if (still || dt === 0) {
            radius[i] = target
            velocity[i] = 0
          } else {
            // Semi-implicit Euler in 240 Hz substeps, the same spring the panel draws.
            for (let s = 0; s < dt; s += 1 / 240) {
              const k = Math.min(1 / 240, dt - s)
              const a = -omega * omega * (radius[i] - target) - 2 * zeta * omega * velocity[i]!
              velocity[i] += a * k
              radius[i] += velocity[i] * k
            }
            if (Math.abs(radius[i] - target) > 0.05 || Math.abs(velocity[i]) > 0.2) moving = true
            else {
              radius[i] = target
              velocity[i] = 0
            }
          }
          const size = Math.max(0, radius[i])
          if (size < 0.3) continue
          const hue = Math.round(tint.h + shown.spread * (Math.min(1, amp) - 0.5))
          const key = hue * 1e6 + tint.l * 1e3 + tint.c
          let fill = fills.get(key)
          if (!fill) {
            fill = `oklch(${tint.l} ${tint.c} ${hue})`
            if (fills.size > 720) fills.clear()
            fills.set(key, fill)
          }
          ctx.fillStyle = fill
          ctx.globalAlpha = 0.35 + Math.min(1, Math.max(0, amp)) * 0.65
          ctx.beginPath()
          if (v.shape === "circle") ctx.arc(cx, cy, size, 0, Math.PI * 2)
          else if (v.shape === "square")
            ctx.roundRect(cx - size, cy - size, size * 2, size * 2, size * 0.3)
          else {
            ctx.moveTo(cx, cy - size * 1.2)
            ctx.lineTo(cx + size * 1.2, cy)
            ctx.lineTo(cx, cy + size * 1.2)
            ctx.lineTo(cx - size * 1.2, cy)
          }
          ctx.fill()
        }
      ctx.globalAlpha = 1
      // The origin, ringed like the point pad marks its default.
      ctx.strokeStyle = `oklch(${tint.l} ${tint.c} ${tint.h} / 0.9)`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(ox, oy, 7, 0, Math.PI * 2)
      ctx.stroke()
      if ((pulse || moving) && visible) raf = requestAnimationFrame(frame)
      else last = 0
    }
    const wake = () => {
      if (!raf && w > 0) raf = requestAnimationFrame(frame)
    }

    let dragging = false
    const setOrigin = (event: PointerEvent) => {
      const box = el.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
      const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
      field.set(
        { origin: { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } },
        { coalesce: dragging },
      )
      dragging = true
    }
    const down = (event: PointerEvent) => {
      el.setPointerCapture(event.pointerId)
      dragging = false
      setOrigin(event)
    }
    const move = (event: PointerEvent) => {
      if (el.hasPointerCapture(event.pointerId)) setOrigin(event)
    }
    el.addEventListener("pointerdown", down)
    el.addEventListener("pointermove", move)
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      if (visible) wake()
    })
    io.observe(el)
    const unsubscribe = field.subscribe(wake)
    const unsubscribeSite = site.subscribe(wake)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      unsubscribe()
      unsubscribeSite()
      el.removeEventListener("pointerdown", down)
      el.removeEventListener("pointermove", move)
    }
  }, [])
  return (
    <canvas
      ref={canvas}
      className="field-canvas"
      role="img"
      aria-label="A grid of dots that swell around an origin point. Drag to move the origin."
    />
  )
}
