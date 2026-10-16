// The hero: hardware twins. A faceplate in the dark under one soft spot, with six physical controls
// on it, each the twin of a row in the knobs panel floating over its right edge: twist, flick or
// drag the hardware and the row follows; move the row and the hardware glides to it. Every row
// changes how the hardware or its light looks. Thin lines of light run from each row to its twin
// and brighten while either is hovered, focused or in hand. WebGPU draws it (controls-hero.wgsl);
// without it, a CSS still of the plate stands in.
import { choice, color, knob, point, springMotion, toggle } from "knobs"
import { sound } from "knobs/panel"
import type { SceneKit } from "./controls"
import { gpuView, kelvinRgb, linearRgb, toLinear } from "./controls-gpu"
import heroWgsl from "./controls-hero.wgsl?raw"
import {
  ColorVal,
  clamp01,
  type How,
  oklab,
  oklabCss,
  oklabRgb,
  px,
  reduced,
  SHUTTER_S,
  Stage,
  type Val,
} from "./controls-motion"

const FINISHES = ["Matte", "Brushed", "Anodised"] as const
type Key = "keyLight" | "finish" | "leds" | "spot" | "shadow" | "accent"
const ARC = (135 * Math.PI) / 180
/** The selector's detents, one per finish. */
const DETENT = [-0.7, 0, 0.7]
const TOGGLE = 0.38
const TILT = 0.42
const PT = 0.32
const ENTRANCE = springMotion({ duration: 1.3, bounce: 0 })
/** LEDs warm up like a filament and fade a little slower than they came. */
const WARM = springMotion({ duration: 0.28, bounce: 0 })
const COOL = springMotion({ duration: 0.6, bounce: 0 })
const SNAP = springMotion({ duration: 0.22, bounce: 0.25 })
/**
 * Every frame is jittered and folded into a history. While anything changes, each new frame
 * counts MOVING of it (the rest clipped to what's on screen now); at rest, REST more frames
 * average in and then it stops.
 */
const MOVING = 0.14
const REST = 32
/** Where the scene reads what changed since the frame before (see controls-hero.wgsl, u.v[14]). */
const AT = (i: number, c = 0) => 4 + i * 4 + c
const POSES: readonly (readonly number[])[] = [
  [AT(9, 0), AT(9, 1)], // key knob: angle, spin
  [AT(7, 3), AT(9, 2)], // colour knob
  [AT(8, 3), AT(9, 3)], // selector
  [AT(10, 0)], // toggle
  [AT(10, 1)], // fader
  [AT(10, 2), AT(10, 3)], // joystick
]
const LIGHT = [AT(5, 0), AT(5, 1), AT(5, 2), AT(4, 3)]

type V3 = readonly [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a)
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/** The camera: straight on, looking down at 62°, so the side walls and the knobs' grips show. */
const TARGET: V3 = [0, 0, 0.15]
const EL = (62 * Math.PI) / 180
const CAM: V3 = [0, 13 * Math.sin(EL), TARGET[2] + 13 * Math.cos(EL)]
const FWD = norm(sub(TARGET, CAM))
const RIGHT = norm(cross(FWD, [0, 1, 0]))
const UP = cross(RIGHT, FWD)
/** On screen at focal 1 about the principal point. */
const project1 = (p: V3): [number, number] => {
  const d = sub(p, CAM)
  const z = dot(d, FWD)
  return [dot(d, RIGHT) / z, -dot(d, UP) / z]
}

/**
 * Each twin: where it sits, how big it is and which side of it its wire leaves from. The sides
 * (and the panel's row order) are the ones whose straight wires don't cross.
 */
const TWINS: Record<Key, { at: V3; r: number; side: "right" | "top" | "bottom"; cursor: string }> =
  {
    keyLight: { at: [-1.85, 0.3, -0.8], r: 0.66, side: "right", cursor: "grab" },
    finish: { at: [0, 0.22, -0.8], r: 0.58, side: "right", cursor: "pointer" },
    leds: { at: [1.85, 0.25, -0.8], r: 0.42, side: "bottom", cursor: "pointer" },
    spot: { at: [0, 0.3, 0.95], r: 0.62, side: "top", cursor: "move" },
    accent: { at: [1.85, 0.25, 0.95], r: 0.56, side: "right", cursor: "grab" },
    shadow: { at: [-1.9, 0.1, 0.95], r: 0.36, side: "right", cursor: "ns-resize" },
  }
const KEYS = Object.keys(TWINS) as Key[]
const FADER_L = 0.72

export function heroScene({ define, mount, h }: SceneKit, root: HTMLElement) {
  const stageEl = root.querySelector<HTMLElement>(".hero-stage")!
  const slot = root.querySelector<HTMLElement>(".hero-panel")!
  const narrow = matchMedia("(max-width: 900px)")

  const { store, on } = define(
    "hero",
    "Hardware",
    {
      keyLight: knob(70, { min: 0, max: 100, step: 1, unit: "%", label: "Key light" }),
      finish: choice("Matte", FINISHES, { label: "Finish", display: "segmented" }),
      leds: toggle(true, { label: "LEDs" }),
      spot: point({ x: 0.42, y: 0.6 }, { min: 0, max: 1, step: 0.01, label: "Spot" }),
      accent: color("#ffa53d", { label: "Accent" }),
      shadow: knob(45, { min: 0, max: 100, step: 1, unit: "%", label: "Shadow" }),
    },
    {
      defaultLabel: "Amber",
      presets: {
        Studio: {
          keyLight: 88,
          finish: "Brushed",
          leds: true,
          spot: { x: 0.5, y: 0.36 },
          shadow: 78,
          accent: "#eef2ff",
        },
        Night: {
          keyLight: 24,
          finish: "Matte",
          leds: true,
          spot: { x: 0.64, y: 0.3 },
          shadow: 22,
          accent: "#38d6ff",
        },
        Anodised: {
          keyLight: 66,
          finish: "Anodised",
          leds: true,
          spot: { x: 0.34, y: 0.5 },
          shadow: 55,
          accent: "#4f7dff",
        },
      },
    },
  )
  mount(store, slot, { title: "Hardware", theme: "dark" })
  const panelEl = () => slot.querySelector<HTMLElement>(".knobs-panel")
  // The pad starts open, as on the hardware: it's the joystick's twin.
  slot
    .querySelector<HTMLElement>('[data-field="spot"] .knobs-x-head[aria-expanded="false"]')
    ?.click()

  // The page's own dark, exactly: everything the light doesn't reach is this colour.
  const night = getComputedStyle(document.documentElement).getPropertyValue("--night").trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(night)?.[1] ?? "101012"
  const page = [0, 2, 4].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ]
  const view = gpuView(stageEl, {
    wgsl: heroWgsl,
    label: "hero",
    tone: "neutral",
    bloom: 0.12,
    maxDpr: 2,
    temporal: true,
    base: page,
    edge: 0.07,
  })
  const still = view ? null : cssStill(stageEl, h)

  // ── Layout: the plate fitted into the room the panel leaves, one projection for all ──
  const layout = {
    focal: 1,
    pp: [0, 0] as [number, number],
    w: 0,
    h: 0,
    panel: null as DOMRect | null,
  }
  const project = (p: V3): [number, number] => {
    const [x, y] = project1(p)
    return [layout.pp[0] + layout.focal * x, layout.pp[1] + layout.focal * y]
  }
  /** A twin on screen: its centre and its radii across and up the screen. */
  const disc = (k: Key) => {
    const t = TWINS[k]
    const c = project(t.at)
    const rx = Math.abs(project([t.at[0] + t.r, t.at[1], t.at[2]])[0] - c[0])
    const ry = Math.abs(project([t.at[0], t.at[1], t.at[2] + t.r])[1] - c[1])
    return { c, rx, ry }
  }
  const fit = () => {
    const w = stage.width || stageEl.clientWidth
    const hh = stage.height || stageEl.clientHeight
    const beside = !narrow.matches && !!panelEl()
    // The plate below the title, with room for its pool; beside the panel, the two together are
    // centred, the plate's right edge passing under the panel.
    const pw = beside ? slot.offsetWidth : 0
    const overlap = beside ? 56 : 0
    const margin = beside ? 64 : 20
    const top = hh * (beside ? 0.13 : 0.1)
    const bottom = hh * (beside ? 0.81 : 0.86)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const x of [-3, 3])
      for (const z of [-2.05, 2.05])
        for (const y of [-PT, 0.6]) {
          const [sx, sy] = project1([x, y, z])
          x0 = Math.min(x0, sx)
          x1 = Math.max(x1, sx)
          y0 = Math.min(y0, sy)
          y1 = Math.max(y1, sy)
        }
    const room = w - 2 * margin - pw + overlap
    const focal = Math.min(room / (x1 - x0), (bottom - top) / (y1 - y0), beside ? 1900 : Infinity)
    const plateW = focal * (x1 - x0)
    const left = Math.max(margin, (w - (plateW + pw - overlap)) / 2)
    layout.focal = focal
    layout.pp = [left - focal * x0, (top + bottom) / 2 - (focal * (y0 + y1)) / 2]
    layout.w = w
    layout.h = hh
    layout.panel = null
    if (!beside) {
      slot.style.right = ""
      return
    }
    const panelLeft = left + plateW - overlap
    const right = `${Math.round(w - panelLeft - pw)}px`
    if (slot.style.right !== right) slot.style.right = right
    const hero = stageEl.getBoundingClientRect()
    const pr = panelEl()!.getBoundingClientRect()
    layout.panel = new DOMRect(pr.left - hero.left, pr.top - hero.top, pr.width, pr.height)
  }

  // ── The springs ──
  const stage = new Stage(stageEl, () => {
    fit()
    wires.paint()
    const lab = accent.lab
    const acc = linearRgb(oklabRgb(lab))
    const accMax = Math.max(...acc, 1e-4)
    // The key takes on the accent: its colour is the room's, on the floor and in every reflection.
    const warm = kelvinRgb(4800)
    const tint = acc.map((c, i) => warm[i]! * 0.55 + (c / accMax) * 0.45)
    const lum = 0.2126 * tint[0]! + 0.7152 * tint[1]! + 0.0722 * tint[2]!
    const light: V3 = [-3.2 + 6.4 * spotX.x, 4.6, -2.4 + 5.2 * spotY.x]
    const k = clamp01(key.x)
    const ledOn = clamp01(leds.x) ** 1.5
    const arrive = [0, 1, 2, 3, 4, 5].map((i) => {
      const t = clamp01((intro.x - 0.35 - 0.08 * i) / 0.35)
      return t * t * (3 - 2 * t)
    })
    if (!view) {
      still!.draw({
        project,
        k,
        ledOn,
        rotK: rotK.x,
        spot: [spotX.x, spotY.x],
        css: oklabCss(lab),
        on: leds.target > 0.5,
        fader: shadowV.x,
      })
      return
    }
    // Spinning: the angle each knob turns in a shutter, and so how many instants to render.
    const moving = !reduced() && stage.active
    const rPx = (r: number, at: V3) =>
      Math.abs(project([at[0] + r, at[1], at[2]])[0] - project(at)[0])
    const spin = (v: Val, r: number, at: V3) => {
      const d = moving ? v.v * SHUTTER_S : 0
      return Math.abs(d) * rPx(r, at) < 0.4 ? 0 : d
    }
    const dK = spin(rotK, 0.6, TWINS.keyLight.at)
    const dC = spin(rotC, 0.5, TWINS.accent.at)
    const dS = spin(rotS, 0.5, TWINS.finish.at)
    const arc = Math.max(
      Math.abs(dK) * rPx(0.6, TWINS.keyLight.at),
      Math.abs(dC) * rPx(0.5, TWINS.accent.at),
      Math.abs(dS) * rPx(0.5, TWINS.finish.at),
    )
    const data = view.data
    const v = (i: number, a: number, b: number, c: number, d: number) =>
      data.set([a, b, c, d], 4 + i * 4)
    v(0, layout.pp[0], layout.pp[1], layout.focal, 0)
    v(1, CAM[0], CAM[1], CAM[2], clamp01(intro.x))
    v(2, RIGHT[0], RIGHT[1], RIGHT[2], ledOn)
    v(3, UP[0], UP[1], UP[2], k)
    v(4, FWD[0], FWD[1], FWD[2], clamp01(shadowV.x))
    v(5, light[0], light[1], light[2], 3 + 75 * k * k)
    v(
      6,
      tint[0]! / lum,
      tint[1]! / lum,
      tint[2]! / lum,
      arc ? Math.min(12, Math.max(4, Math.ceil(arc * 1.2))) : 0,
    )
    v(7, acc[0], acc[1], acc[2], rotC.x)
    v(8, Math.max(0, fin[0]!.x), Math.max(0, fin[1]!.x), Math.max(0, fin[2]!.x), rotS.x)
    v(9, rotK.x, dK, dC, dS)
    v(10, toggleA.x, clamp01(shadowV.x), (spotX.x - 0.5) * 2 * TILT, (spotY.x - 0.5) * 2 * TILT)
    v(11, arrive[0]!, arrive[1]!, arrive[2]!, arrive[3]!)
    v(12, arrive[4]!, arrive[5]!, 0, 0)
    v(13, page[0], page[1], page[2], 0)
    // Moving: each frame folds in at MOVING. At rest: REST more, from the next frame.
    cancelAnimationFrame(refining)
    refining = 0
    if (stage.active) {
      settled = REST
      shoot(MOVING, true)
    } else {
      settled = 0
      refining = requestAnimationFrame(refine)
    }
  })
  // ── Frames: jittered, with what changed since the last one, into the history ──
  let frames = 0
  const last = new Float32Array(view?.data.length ?? 0)
  /** One frame: an R2 sub-pixel offset (Roberts' sequence), its noise seed and what moved. */
  const shoot = (blend: number, clip: boolean) => {
    if (!view) return
    const d = view.data
    frames++
    d[AT(0, 3)] = frames % 4096
    d[AT(12, 2)] = ((0.5 + frames * 0.7548776662) % 1) - 0.5
    d[AT(12, 3)] = ((0.5 + frames * 0.569840291) % 1) - 0.5
    let mask = 0
    POSES.forEach((at, i) => {
      if (at.some((j) => d[j] !== last[j])) mask |= 1 << i
    })
    const moved = LIGHT.some((j) => d[j] !== last[j]) ? 1 : 0
    d[AT(14, 0)] = moved
    d[AT(14, 1)] = mask
    last.set(d)
    view.render({ blend, clip })
  }
  let settled = REST
  let refining = 0
  const inView = () => {
    const r = stageEl.getBoundingClientRect()
    return !document.hidden && r.bottom > 0 && r.top < innerHeight
  }
  const refine = () => {
    refining = 0
    if (!view || settled >= REST || !inView()) return
    // The first few still clip (whatever the move left behind goes), then they simply average.
    shoot(1 / (settled + 4), settled < 8)
    settled++
    if (settled < REST) refining = requestAnimationFrame(refine)
  }
  // Measurements (the catalog's dev hook): GPU ms a frame for each kind of change.
  const bench = async (n = 40) => {
    if (!view) return null
    const d = view.data
    const keep = d.slice()
    const run = async (moved: number, mask: number, uncached = false) => {
      d[AT(14, 0)] = moved
      d[AT(14, 1)] = mask
      return +(await view.bench(n, { blend: MOVING, clip: true }, uncached)).toFixed(2)
    }
    // Each row's drag also moves its twin: Key light turns the big knob (bit 1), Accent the
    // colour knob (2), Spot moves the light and leans the joystick (32), Shadow resizes the
    // light and slides the fader (16).
    const out: Record<string, number> = {}
    out.uncached = await run(1, 63, true)
    out.keyLight = await run(0, 1)
    out.accent = await run(0, 2)
    out.spot = await run(1, 32)
    out.shadow = await run(1, 16)
    out.still = await run(0, 0)
    // The big knob flicked: mid-spin, with its shutter's instants.
    d[AT(9, 1)] = 0.12
    d[AT(6, 3)] = 8
    out.knobSpin = await run(0, 1)
    d.set(keep)
    out.dpr = view.dpr
    stage.paint()
    return out
  }
  Object.assign(window, { __hero: { bench } })
  // Scrolled away or hidden mid-refinement: it carries on when it's back.
  const resume = () => {
    if (settled > 0 && settled < REST && !refining && inView())
      refining = requestAnimationFrame(refine)
  }
  new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && resume()).observe(
    stageEl,
  )
  document.addEventListener("visibilitychange", resume)
  const intro = stage.val(0, 0.001)
  const key = stage.val(0.7, 0.0005)
  const rotK = stage.val(-ARC + 2 * ARC * 0.7, 0.0005)
  const fin = FINISHES.map((f) => stage.val(f === "Matte" ? 1 : 0, 0.0005))
  const rotS = stage.val(DETENT[0]!, 0.0005)
  const leds = stage.val(1, 0.001)
  const toggleA = stage.val(-TOGGLE, 0.0005)
  const spotX = stage.val(0.42, 0.0005)
  const spotY = stage.val(0.6, 0.0005)
  const shadowV = stage.val(0.45, 0.0005)
  const accent = new ColorVal(stage, "#ffa53d")
  const rotC = stage.val(0, 0.0005)

  const wrap = (a: number) =>
    ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI

  // ── Rows → hardware ──
  /** Under the hand it follows; from anything else (Random, a preset, undo, a peer) it glides. */
  const go = (val: Val, to: number, how: How, feel: Parameters<Val["to"]>[1] = "calm") =>
    how === "init" ? val.snap(to) : val.to(to, how === "hand" ? "follow" : feel)
  on((v, how) => {
    go(key, v.keyLight / 100, how)
    go(rotK, -ARC + 2 * ARC * (v.keyLight / 100), how)
    const i = Math.max(0, FINISHES.indexOf(v.finish as (typeof FINISHES)[number]))
    FINISHES.forEach((_, j) => {
      go(fin[j]!, j === i ? 1 : 0, how === "hand" ? "other" : how, "morph")
    })
    // A detented selector always snaps into its detent, by hand too.
    go(rotS, DETENT[i]!, how === "hand" ? "other" : how, SNAP)
    if (how === "init" || reduced()) leds.snap(v.leds ? 1 : 0)
    else leds.to(v.leds ? 1 : 0, v.leds ? WARM : COOL)
    go(toggleA, v.leds ? -TOGGLE : TOGGLE, how === "hand" ? "other" : how, SNAP)
    go(spotX, v.spot.x, how)
    go(spotY, v.spot.y, how)
    go(shadowV, v.shadow / 100, how)
    accent.go(v.accent, how, "calm")
    // The colour knob turns to the hue, the short way round from wherever it's heading.
    const [, a, b] = oklab(v.accent)
    go(rotC, rotC.target + wrap(-Math.atan2(b, a) - rotC.target), how)
  })
  // The entrance: the spot fades up out of the dark and each twin's LEDs arrive after it.
  if (reduced()) intro.snap(1)
  else requestAnimationFrame(() => intro.to(1, ENTRANCE))

  // ── Hardware → rows ──
  let hover: Key | null = null
  let drag: Key | null = null
  let focus: Key | null = null
  const screenR = (k: Key) => disc(k).rx
  const faderEnds = () => {
    const t = TWINS.shadow.at
    return [project([t[0], 0.1, t[2] + FADER_L]), project([t[0], 0.1, t[2] - FADER_L])] as const
  }
  const pick = (x: number, y: number): Key | null => {
    let best: Key | null = null
    let bestD = Infinity
    for (const k of KEYS) {
      let d: number
      let r: number
      if (k === "shadow") {
        const [a, b] = faderEnds()
        d = segDist([x, y], a, b)
        r = screenR(k) * 0.9
      } else {
        const c = project(TWINS[k].at)
        d = Math.hypot(x - c[0], y - c[1])
        r = screenR(k) * 1.1
      }
      if (d < r && d / r < bestD) {
        bestD = d / r
        best = k
      }
    }
    return best
  }
  const local = (e: PointerEvent): [number, number] => {
    const r = stageEl.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  /** Screen angle about a twin, clockwise from up. */
  const angleAt = (k: Key, x: number, y: number) => {
    const c = project(TWINS[k].at)
    return Math.atan2(x - c[0], -(y - c[1]))
  }
  let first = true
  const set = (patch: Partial<ReturnType<typeof store.get>>) => {
    store.set(patch, { coalesce: !first })
    first = false
  }
  const ticks = new Map<string, number>()
  /** A detent's tick when a value crosses into another of `n` steps. */
  const tick = (id: string, at: number, n: number) => {
    const step = Math.round(clamp01(at) * n)
    if (ticks.get(id) === step) return
    ticks.set(id, step)
    sound.play("step", { position: clamp01(at) })
  }
  let grab: {
    key: Key
    x: number
    y: number
    moved: boolean
    angle: number
    value: number
    spot: { x: number; y: number }
    hue: number
    lc: [number, number]
    radial: boolean
  } | null = null

  stageEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    const [x, y] = local(e)
    const k = pick(x, y)
    if (!k) return
    e.preventDefault()
    stageEl.setPointerCapture(e.pointerId)
    const v = store.get()
    const [L, a, b] = oklab(v.accent)
    const c = project(TWINS[k].at)
    grab = {
      key: k,
      x,
      y,
      moved: false,
      angle: angleAt(k, x, y),
      value: k === "keyLight" ? v.keyLight : v.shadow,
      spot: { ...v.spot },
      hue: Math.atan2(b, a),
      lc: [L, Math.hypot(a, b)],
      radial: Math.hypot(x - c[0], y - c[1]) > screenR(k) * 0.38,
    }
    first = true
    drag = k
    ticks.clear()
    stageEl.style.cursor = k === "keyLight" || k === "accent" ? "grabbing" : TWINS[k].cursor
    lightWires()
    if (k === "shadow") faderTo(x, y)
  })
  const faderTo = (x: number, y: number) => {
    const [a, b] = faderEnds()
    const t = clamp01(
      ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) /
        Math.max(1, (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2),
    )
    const value = Math.round(t * 100)
    if (value !== store.get().shadow) {
      set({ shadow: value })
      tick("shadow", t, 24)
    }
  }
  stageEl.addEventListener("pointermove", (e) => {
    const [x, y] = local(e)
    if (!grab) {
      const k = pick(x, y)
      if (k !== hover) {
        hover = k
        stageEl.style.cursor = k ? TWINS[k].cursor : ""
        lightWires()
      }
      return
    }
    const g = grab
    if (Math.hypot(x - g.x, y - g.y) > 4) g.moved = true
    const a = angleAt(g.key, x, y)
    const da = wrap(a - g.angle)
    if (g.key === "keyLight") {
      // Round the knob by its angle; near its centre, up and down.
      if (g.radial) g.value += (da / (2 * ARC)) * 100
      else g.value -= (e.movementY || 0) * 0.5
      g.angle = a
      g.value = Math.min(100, Math.max(0, g.value))
      const value = Math.round(g.value)
      if (value !== store.get().keyLight) {
        set({ keyLight: value })
        tick("keyLight", value / 100, 24)
      }
    } else if (g.key === "accent") {
      g.hue -= g.radial ? da : (e.movementY || 0) * 0.02
      g.angle = a
      const deg = ((((g.hue * 180) / Math.PI) % 360) + 360) % 360
      set({ accent: `oklch(${g.lc[0].toFixed(4)} ${g.lc[1].toFixed(4)} ${deg.toFixed(2)})` })
      tick("accent", deg / 360, 24)
    } else if (g.key === "finish" && g.moved) {
      // Turned toward a detent: the nearest within reach of the pointer's angle.
      const i = DETENT.reduce(
        (best, d, j) => (Math.abs(wrap(a - d)) < Math.abs(wrap(a - DETENT[best]!)) ? j : best),
        0,
      )
      if (Math.abs(wrap(a - DETENT[i]!)) < 1.1) {
        const was = FINISHES.indexOf(store.get().finish as (typeof FINISHES)[number])
        if (i !== was) {
          set({ finish: FINISHES[i]! })
          sound.play("select", { direction: Math.sign(i - was) })
        }
      }
    } else if (g.key === "leds" && g.moved) {
      // Flicked: up throws it on, down off.
      const on = y < g.y
      if (on !== store.get().leds) {
        set({ leds: on })
        sound.play("toggle", { direction: on ? 1 : -1 })
      }
    } else if (g.key === "shadow") {
      faderTo(x, y)
    } else if (g.key === "spot") {
      // The stick pushes the spot; it holds where it's left, as the value does.
      const reach = screenR("spot") * 2.4
      const sx = clamp01(g.spot.x + (x - g.x) / reach)
      const sy = clamp01(g.spot.y + (y - g.y) / reach)
      const spot = { x: Math.round(sx * 100) / 100, y: Math.round(sy * 100) / 100 }
      const now = store.get().spot
      if (spot.x !== now.x || spot.y !== now.y) {
        set({ spot })
        tick("spot", (sx + sy) / 2, 16)
      }
    }
  })
  const release = (e: PointerEvent) => {
    if (!grab) return
    const g = grab
    grab = null
    if (stageEl.hasPointerCapture(e.pointerId)) stageEl.releasePointerCapture(e.pointerId)
    if (!g.moved && e.type === "pointerup") {
      // A click: the selector steps to its next position, the switch flips.
      if (g.key === "finish") {
        const was = FINISHES.indexOf(store.get().finish as (typeof FINISHES)[number])
        const i = (was + 1) % FINISHES.length
        set({ finish: FINISHES[i]! })
        sound.play("select", { direction: i > was ? 1 : -1 })
      } else if (g.key === "leds") {
        const on = !store.get().leds
        set({ leds: on })
        sound.play("toggle", { direction: on ? 1 : -1 })
      }
    }
    drag = null
    const [x, y] = local(e)
    hover = pick(x, y)
    stageEl.style.cursor = hover ? TWINS[hover].cursor : ""
    lightWires()
  }
  stageEl.addEventListener("pointerup", release)
  stageEl.addEventListener("pointercancel", release)
  stageEl.addEventListener("pointerleave", () => {
    if (grab || !hover) return
    hover = null
    stageEl.style.cursor = ""
    lightWires()
  })

  // ── Wires: a thin line of light from each row to its twin ──
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const wireBox = h("div", "hero-wires")
  wireBox.setAttribute("aria-hidden", "true")
  wireBox.append(svg)
  root.insertBefore(wireBox, slot)
  // The wires run over the hardware: a hairline of light in a soft glow.
  const SVG = "http://www.w3.org/2000/svg"
  const lines = KEYS.map(() => {
    const g = document.createElementNS(SVG, "g")
    const halo = document.createElementNS(SVG, "path")
    const line = document.createElementNS(SVG, "path")
    const ends = [0, 1].map(() => document.createElementNS(SVG, "circle"))
    halo.setAttribute("class", "halo")
    for (const c of ends) c.setAttribute("r", "2.2")
    g.append(halo, line, ...ends)
    svg.append(g)
    return { g, halo, line, ends }
  })
  const rowFor = (k: Key) => {
    const row = panelEl()?.querySelector<HTMLElement>(`[data-field="${k}"]`)
    return row?.querySelector<HTMLElement>(".knobs-x-head") ?? row ?? null
  }
  const wires = new Stage(wireBox, () => {
    const panel = layout.panel
    wireBox.style.display = panel ? "" : "none"
    if (!panel) return
    const hero = stageEl.getBoundingClientRect()
    const fade = clamp01((intro.x - 0.45) / 0.45)
    const css = oklabCss(accent.lab)
    KEYS.forEach((k, i) => {
      const row = rowFor(k)?.getBoundingClientRect()
      const parts = lines[i]!
      if (!row) {
        parts.g.style.display = "none"
        return
      }
      parts.g.style.display = ""
      const { c, rx, ry } = disc(k)
      const side = TWINS[k].side
      const start: [number, number] =
        side === "right" ? [c[0] + rx, c[1]] : [c[0], c[1] + (side === "top" ? -ry : ry)]
      const end: [number, number] = [panel.left, row.top - hero.top + row.height / 2]
      const d = `M${start[0].toFixed(1)} ${start[1].toFixed(1)} L${end[0].toFixed(1)} ${end[1].toFixed(1)}`
      const glow = clamp01(glows[i]!.x)
      parts.line.setAttribute("d", d)
      parts.halo.setAttribute("d", d)
      parts.g.style.color = css
      parts.line.style.opacity = ((0.28 + 0.72 * glow) * fade).toFixed(3)
      parts.halo.style.opacity = ((0.12 + 0.5 * glow) * fade).toFixed(3)
      parts.ends[0]!.setAttribute("cx", start[0].toFixed(1))
      parts.ends[0]!.setAttribute("cy", start[1].toFixed(1))
      parts.ends[1]!.setAttribute("cx", end[0].toFixed(1))
      parts.ends[1]!.setAttribute("cy", end[1].toFixed(1))
      for (const e of parts.ends) e.style.opacity = ((0.45 + 0.55 * glow) * fade).toFixed(3)
    })
  })
  const glows = KEYS.map(() => wires.val(0, 0.002))
  /** Each wire brightens while its row or twin is hovered, focused or in hand. */
  const lightWires = () => {
    KEYS.forEach((k, i) => {
      glows[i]!.to(
        k === hover || k === drag || k === focus ? 1 : 0,
        k === drag ? "snappy" : "default",
      )
    })
  }

  // Rows hovered or focused light their wires too.
  const keyOf = (t: EventTarget | null) =>
    ((t as HTMLElement | null)?.closest?.("[data-field]") as HTMLElement | null)?.dataset.field as
      | Key
      | undefined
  slot.addEventListener("pointerover", (e) => {
    const k = keyOf(e.target)
    if (k && KEYS.includes(k) && k !== hover) {
      hover = k
      lightWires()
    }
  })
  slot.addEventListener("pointerleave", () => {
    hover = null
    lightWires()
  })
  slot.addEventListener("focusin", (e) => {
    focus = keyOf(e.target) ?? null
    lightWires()
  })
  slot.addEventListener("focusout", () => {
    focus = null
    lightWires()
  })
  // The rows move when the panel scrolls, folds or reflows.
  new ResizeObserver(() => stage.paint()).observe(slot)
  narrow.addEventListener("change", () => stage.paint())
}

function segDist(p: [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const t = clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / Math.max(1e-6, dx * dx + dy * dy))
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t)
}

interface StillFrame {
  project: (p: V3) => [number, number]
  k: number
  ledOn: number
  rotK: number
  spot: [number, number]
  css: string
  on: boolean
  fader: number
}

/** Without WebGPU: the plate and its twins in CSS, lit by a radial spot, still but live. */
function cssStill(host: HTMLElement, h: SceneKit["h"]) {
  host.classList.add("hero-css")
  const spot = h("div", "hero-spot")
  const plate = h("div", "hero-plate")
  const knobs = (["keyLight", "finish", "leds", "spot", "accent"] as Key[]).map((k) => {
    const el = h("div", `hero-knob hero-${k}`)
    el.append(h("i"))
    return [k, el] as const
  })
  const fader = h("div", "hero-fader")
  const cap = h("i")
  fader.append(cap)
  host.append(spot, plate, fader, ...knobs.map(([, el]) => el))
  return {
    draw(f: StillFrame) {
      const [x0, y0] = f.project([-3, 0, -2.05])
      const [x1, y1] = f.project([3, 0, 2.05])
      plate.style.cssText = `left:${px(x0)};top:${px(y0)};width:${px(x1 - x0)};height:${px(y1 - y0)}`
      const [sx, sy] = f.project([-3 + 6 * f.spot[0], 0, -2.05 + 4.1 * f.spot[1]])
      spot.style.background = `radial-gradient(${px((x1 - x0) * 0.55)} at ${px(sx)} ${px(sy)}, rgba(255,214,170,${(0.1 + 0.22 * f.k).toFixed(3)}), transparent 70%)`
      host.style.setProperty("--accent", f.css)
      host.style.setProperty("--leds", f.ledOn.toFixed(3))
      for (const [k, el] of knobs) {
        const t = TWINS[k]
        const [cx, cy] = f.project(t.at)
        const r = Math.abs(f.project([t.at[0] + t.r, t.at[1], t.at[2]])[0] - cx)
        el.style.cssText = `left:${px(cx - r)};top:${px(cy - r)};width:${px(r * 2)};height:${px(r * 2)}`
        if (k === "keyLight")
          (el.firstChild as HTMLElement).style.transform = `rotate(${f.rotK.toFixed(3)}rad)`
        if (k === "leds") el.classList.toggle("on", f.on)
      }
      const [fx, fy0] = f.project([TWINS.shadow.at[0], 0, TWINS.shadow.at[2] - FADER_L])
      const [, fy1] = f.project([TWINS.shadow.at[0], 0, TWINS.shadow.at[2] + FADER_L])
      fader.style.cssText = `left:${px(fx - 3)};top:${px(fy0)};height:${px(fy1 - fy0)}`
      cap.style.top = `${((1 - f.fader) * 100).toFixed(2)}%`
    },
  }
}
