// The motion scene: three pucks run the same trip on an easing, a spring and a flat spring, while a
// timeline is the clock. Everything is a pure function of the timeline's time (the springs by
// their analytic step response, the trip back by superposition), so scrubbing is exact, slow
// motion is exact, and a change of curve morphs every puck to where it would be.
import {
  action,
  type Bezier,
  bezierPoint,
  easing,
  flatSpring,
  keybind,
  knob,
  matchesCombo,
  spring,
  springMotion,
  toolbar,
} from "knobs"
import { timeline } from "knobs/ui"
import type { SceneKit } from "./controls"
import { DirBlur, rolling, Speed, Stage, stretchAlong } from "./controls-motion"

/** The timeline: out at 0, back at HALF, four seconds round. */
const D = 4
const HALF = 2
const SVG = "http://www.w3.org/2000/svg"
const px = (n: number) => `${Math.round(n * 100) / 100}px`

/** y at x along a cubic bezier (x is monotonic within 0–1). */
function bezierY(b: Bezier, x: number) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (bezierPoint(b, mid)[0] < x) lo = mid
    else hi = mid
  }
  return bezierPoint(b, (lo + hi) / 2)[1]
}

/** A spring's step response from rest at 0 towards 1, `t` seconds in. */
function stepResponse(omega: number, zeta: number, t: number) {
  if (t <= 0) return 0
  if (zeta < 0.999) {
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    return (
      1 -
      Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
    )
  }
  if (zeta <= 1.001) return 1 - Math.exp(-omega * t) * (1 + omega * t)
  const s = Math.sqrt(zeta * zeta - 1)
  const r1 = -omega * (zeta - s)
  const r2 = -omega * (zeta + s)
  return 1 + (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r1 - r2)
}

export function motionScene({ section, define, mount, h, theme }: SceneKit) {
  const s = section({
    id: "motion",
    title: "Motion",
    scene: true,
    shows: [
      "easing()",
      "spring()",
      "flatSpring()",
      "knob()",
      "toolbar()",
      "action()",
      "keybind()",
      "timeline()",
    ],
    what: "One trip, three ways to make it: an easing curve over a duration, a spring, and a flat spring kept as two plain numbers. The timeline under the stage is the clock: play it, scrub it, slow it down. The graph is each one's path over time.",
    stage: true,
    tries: [
      "Press Play (<kbd>Space</kbd> with the panel focused) and watch the three arrive differently; each smears with its speed",
      "Scrub the timeline slowly: every puck, springs too, sits exactly where it would be",
      "Set Spring's bounce to 0.6: its curve and puck overshoot, live, even while paused",
      "<kbd>S</kbd> toggles slow motion; <kbd>P</kbd> pulses from anywhere; your Replay key restarts it from anywhere",
    ],
  })
  let tl!: ReturnType<typeof timeline>
  let slow = false
  let pulse = () => {}
  const replay = () => {
    tl.seek(0)
    tl.play()
  }
  const settle = flatSpring({ duration: 0.3, bounce: 0 }, { label: "Settle" })
  const { store, on } = define("motion", "Motion", {
    curve: easing("ease-in-out", { label: "Easing" }),
    time: knob(0.9, { min: 0.2, max: 1.8, step: 0.05, unit: "s", label: "Duration" }),
    motion: spring({ duration: 0.6, bounce: 0.3 }, { label: "Spring" }),
    settleDuration: settle.duration,
    settleBounce: settle.bounce,
    transport: toolbar(
      [
        { id: "play", label: "Play", icon: "play", shortcut: "Space", run: () => tl.toggle() },
        {
          id: "slow",
          label: "Slow motion",
          icon: "retrigger",
          shortcut: "S",
          run: () => {
            slow = !slow
            tl.update({ speed: slow ? 0.25 : 1 })
            setCaption({ speed: slow ? "¼×" : "1×" })
          },
        },
        {
          id: "pulse",
          label: "Pulse",
          icon: "sparkle",
          shortcut: "P",
          global: true,
          run: () => pulse(),
        },
        { id: "record", label: "Record", icon: "camera", disabled: true },
      ],
      { label: "Transport" },
    ),
    replay: action("Replay", { run: replay }),
    key: keybind("Shift+K", { label: "Replay key" }),
  })
  mount(store, s.slot, { title: "Motion" })

  // The stage: a graph of each path over time, and three tracks.
  s.stage.style.display = "block"
  const graph = document.createElementNS(SVG, "svg")
  graph.style.cssText = "position:absolute;overflow:visible"
  const axis = document.createElementNS(SVG, "path")
  axis.setAttribute("style", "fill:none;stroke:var(--line)")
  graph.append(axis)
  const COLORS = ["var(--text)", "var(--warm)", "var(--cool)"]
  const NAMES = ["Easing", "Spring", "Settle"]
  const curves = COLORS.map((c) => {
    const p = document.createElementNS(SVG, "path")
    p.setAttribute(
      "style",
      `fill:none;stroke:${c};stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round`,
    )
    graph.append(p)
    return p
  })
  const marks = COLORS.map((c) => {
    const m = document.createElementNS(SVG, "circle")
    m.setAttribute("r", "3.5")
    m.setAttribute("style", `fill:${c}`)
    graph.append(m)
    return m
  })
  s.stage.append(graph)
  const rows = COLORS.map((c, i) => {
    const track = h("div", "abs")
    track.style.cssText += "width:1px;height:1px;background:var(--line);transform-origin:0 0"
    const ends = [0, 1].map(() => {
      const e = h("div", "abs")
      e.style.cssText +=
        "width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:11px;box-shadow:inset 0 0 0 1.5px var(--line)"
      return e
    })
    const label = h("div", "abs")
    label.style.cssText += "color:var(--dim);font:500 11px/1 var(--sans)"
    label.textContent = NAMES[i]!
    const puck = h("div", "abs")
    puck.style.cssText += `width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:11px;background:${c};box-shadow:0 6px 18px rgba(0,0,0,.22)`
    s.stage.append(track, ...ends, label, puck)
    return { track, ends, label, puck, blur: new DirBlur(puck) }
  })
  const caption = h("div", "caption")
  s.stage.append(caption)
  const setCaption = rolling(caption, [
    { id: "t", decimals: 2 },
    " s · ",
    { id: "speed", text: true },
  ])

  let T = 0.62
  const stage = new Stage(s.stage, () => {
    const w = s.stage.clientWidth
    const hh = s.stage.clientHeight
    const showGraph = w >= 560
    const G = 168
    const gx = 34
    const gy = hh / 2 - G / 2
    const bz: Bezier = [b[0]!.x, b[1]!.x, b[2]!.x, b[3]!.x]
    const dur = Math.max(0.05, dur_.x)
    const sm = springMotion({ duration: Math.max(0.05, sd.x), bounce: sb.x })
    const tm = springMotion({ duration: Math.max(0.05, td.x), bounce: tb.x })
    const paths = [
      (t: number) => (t <= 0 ? 0 : bezierY(bz, Math.min(1, t / dur))),
      (t: number) => stepResponse(sm.omega, sm.zeta, t),
      (t: number) => stepResponse(tm.omega, tm.zeta, t),
    ]
    // Out at 0, back at HALF: by superposition, so a trip still moving when the next begins carries on.
    const at = (f: (t: number) => number, t: number) => f(t) - f(t - HALF)
    graph.style.display = showGraph ? "" : "none"
    if (showGraph) {
      graph.style.left = px(gx)
      graph.style.top = px(gy)
      graph.setAttribute("width", String(G))
      graph.setAttribute("height", String(G))
      // y from −0.2 to 1.3, so overshoot has room.
      const Y = (y: number) => G - ((y + 0.2) / 1.5) * G
      axis.setAttribute("d", `M0 ${Y(0)}H${G}M0 ${Y(1)}H${G}`)
      const run = ((T % HALF) + HALF) % HALF
      paths.forEach((f, i) => {
        let d = ""
        for (let k = 0; k <= 56; k++) {
          const t = (k / 56) * HALF
          d += `${k ? "L" : "M"}${((t / HALF) * G).toFixed(2)} ${Y(f(t)).toFixed(2)}`
        }
        curves[i]!.setAttribute("d", d)
        marks[i]!.setAttribute("cx", ((run / HALF) * G).toFixed(2))
        marks[i]!.setAttribute("cy", Y(f(run)).toFixed(2))
      })
    }
    const x0 = showGraph ? gx + G + 64 : 48
    const x1 = w - 48
    rows.forEach((r, i) => {
      const y = hh / 2 + (i - 1) * 70
      r.track.style.transform = `translate(${px(x0)},${px(y)}) scaleX(${(x1 - x0).toFixed(2)})`
      r.ends[0]!.style.transform = `translate(${px(x0)},${px(y)})`
      r.ends[1]!.style.transform = `translate(${px(x1)},${px(y)})`
      r.label.style.transform = `translate(${px(x0 - 18)},${px(y - 36)})`
      const x = x0 + at(paths[i]!, T) * (x1 - x0)
      const sp = speeds[i]!
      sp.feed(x, y)
      const k = 1 + pulseVal.x * 0.22
      r.puck.style.transform = `translate(${px(x)},${px(y)}) scale(${k.toFixed(4)})${stretchAlong(sp.vx.x, 0)}`
      r.blur.speed(sp.vx.x, 0)
    })
  })
  const b = [0.42, 0, 0.58, 1].map((n) => stage.val(n, 0.0005))
  const dur_ = stage.val(0.9, 0.001)
  const sd = stage.val(0.6, 0.001)
  const sb = stage.val(0.3, 0.001)
  const td = stage.val(0.3, 0.001)
  const tb = stage.val(0, 0.001)
  const pulseVal = stage.val(0, 0.002)
  const speeds = rows.map(() => new Speed(stage))
  pulse = () => pulseVal.to(0, "playful").push(5)
  new ResizeObserver(() => stage.paint()).observe(s.stage)

  const tlBox = h("div", "ui-box")
  tlBox.style.height = "78px"
  s.side.insertBefore(tlBox, s.stage.nextSibling)
  tl = timeline(tlBox, {
    theme: theme(),
    duration: D,
    fps: 60,
    time: T,
    markers: [
      { id: "out", time: 0, label: "Out" },
      { id: "back", time: HALF, label: "Back" },
    ],
    ranges: [{ id: "loop", start: 0, end: D, loop: true }],
    label: "Motion time",
    onSeek: (t) => {
      T = t
      setCaption({ t })
      stage.paint()
    },
    onCross: () => pulse(),
  })
  setCaption({ t: T, speed: "1×" })

  on((v, how) => {
    v.curve.forEach((n, i) => {
      b[i]!.go(n, how)
    })
    dur_.go(v.time, how, "calm")
    sd.go(v.motion.duration, how, "calm")
    sb.go(v.motion.bounce, how, "calm")
    td.go(v.settleDuration, how, "calm")
    tb.go(v.settleBounce, how, "calm")
  })
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.repeat) return
    const t = e.target as HTMLElement | null
    if (t?.closest("input,textarea,[contenteditable]")) return
    if (!matchesCombo(store.get().key, e)) return
    e.preventDefault()
    replay()
  })
}
