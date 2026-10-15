// The Lab's viewport: a real-time WebGPU night street that the panels drive. Rain (or snow) falls
// through a sodium streetlamp's cone, splashes and ripples in the puddles; fog glows in the lights;
// the propane tank goes up in a fireball when the timeline passes Boom or Retrigger is pressed.
//
// - The station's precipitation and splash values, the details' weather stage, lighting and
//   fireball values, and the inspector's FX tab (smoke over life, sky and fog by hour, the falloff
//   and unseen curves, sampled in the shaders from a ramp texture) all apply live.
// - The timeline drives scene time: playing advances it, scrubbing moves rain and fire back and
//   forth; ❚❚ (the live feed's pause) freezes it. Paused with nothing gliding, nothing runs.
// - The outliner's objects are in the street: selecting one rims it, hiding or deleting fades it
//   out (its light too), locking stops it being picked; clicking in the viewport selects.
// - The dock's Variants apply a weather set; Compare's A/B wipe splits the frame between a snapshot
//   and the live values, and Grid shows the live scene beside three other variants.
// - The Live readouts report this scene's real numbers (GPU time from timestamp queries).
//
// Query flags: ?noscene shows the fallback still; ?reduced draws as on a software GPU (half
// resolution, fewer drops, fewer fog steps); ?debug=nofog,noshadow,noao,norain turns parts off, to
// measure them with scripts/scene-perf.ts.
import type { Value } from "knobs"
import { springMotion } from "knobs"
import type { SeekSource, Timeline } from "knobs/ui"
import type { FxValues } from "./lab-fx"
import type { LiveFeed } from "./lab-live"
import { PASSES, SceneRenderer, type ViewDraw } from "./lab-scene-gpu"
import {
  type Camera,
  FRAME_FLOATS,
  kelvin,
  type LightSlot,
  Look,
  MAX_OCCLUDERS,
  matrices,
  packFrame,
  RAMP_ROWS,
  RAMP_W,
  VARIANTS,
  weather,
} from "./lab-scene-params"
import {
  MESHES,
  type ObjectDef,
  partMatrix,
  pick,
  SODIUM,
  type Vec3,
  WORLD,
} from "./lab-scene-world"

interface TreeItem {
  id: string
  label: string
  children?: TreeItem[]
}
export interface SceneHost {
  viewport: HTMLElement
  /** The host's settings (station and details), read each frame. */
  settings(): Record<string, Value>
  fx(): FxValues
  /** Any panel store changed. */
  subscribe(cb: () => void): void
  /** Applies values through the host's own writes (so they're undoable). */
  apply(values: Record<string, Value>): void
  sceneTime: {
    timeline: Timeline
    explode(): void
    onSeek(f: (time: number, source: SeekSource) => void): void
    onCue(f: (id: string) => void): void
  }
  workspace: {
    readonly scene: readonly TreeItem[]
    hidden: ReadonlySet<string>
    locked: ReadonlySet<string>
    outline: { readonly selection: readonly string[] }
    /** Selects as a click on its row would. */
    select(ids: readonly string[]): void
    onChange(f: () => void): void
  }
  live: LiveFeed
}

const DEFAULT = springMotion({ duration: 0.3, bounce: 0 })
const SNAPPY = springMotion({ duration: 0.25, bounce: 0 })
const CALM = springMotion({ duration: 0.4, bounce: 0 })
const SMOOTH = springMotion({ duration: 0.45, bounce: 0 })

/** A spring for the scene's own state (selection, visibility, the compare wipe). */
class Spring {
  v = 0
  target: number
  constructor(
    public x: number,
    public m: { omega: number; zeta: number },
  ) {
    this.target = x
  }
  set(t: number) {
    this.target = t
    return this
  }
  snap(x: number) {
    this.x = this.target = x
    this.v = 0
    return this
  }
  step(dt: number) {
    if (this.resting) return this.x
    const h = 1 / 480
    for (let t = 0; t < Math.min(dt, 0.1); t += h) {
      const a =
        -(this.m.omega ** 2) * (this.x - this.target) - 2 * this.m.zeta * this.m.omega * this.v
      this.v += a * h
      this.x += this.v * h
    }
    if (Math.abs(this.x - this.target) < 5e-4 && Math.abs(this.v) < 5e-3) this.snap(this.target)
    return this.x
  }
  get resting() {
    return this.x === this.target && this.v === 0
  }
}

/** One object in the street: an outliner item (or the set), with its fades. */
interface Entry {
  key: string
  def: ObjectDef
  /** Its outliner item; null for the set. */
  id: string | null
  /** Copies stand beside their original. */
  offset: number
  vis: Spring
  hl: Spring
  /** Its lamp's level (the streetlamp's toggle). */
  lvl: Spring
  bounds: { min: Vec3; max: Vec3 } | null
  /** Each part's bounds, for picking what's under the pointer. */
  boxes: { min: Vec3; max: Vec3 }[]
}

interface Blast {
  t0: number
  size: number
  dur: number
  temp: number
}

const CAMERA: Camera = { pos: [-2.6, 1.7, 9.6], target: [0.6, 2.35, -3.0], fov: 46 }
const TANK: Vec3 = [-5.3, 1.4, -5.5]
const VENT: Vec3 = [-1.6, 0.02, 3.2]
const params = new URLSearchParams(location.search)

const CSS = `
.lab-scene-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.lab-scene-still { position: absolute; inset: 0; background-size: cover; background-position: center; }
.lab-scene-note { position: absolute; left: 50%; bottom: 14px; translate: -50% 0; max-width: calc(100% - 28px); padding: 6px 12px; border-radius: 8px; background: rgba(0, 0, 0, .55); color: rgba(255, 255, 255, .86); font: 500 11.5px/1.35 var(--sans); text-align: center; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
html[data-look="lab"] .lab-scene-note { border-radius: 0; border: 1px solid var(--line); background: #101114; font-family: var(--mono); }
.lab-scene-wipe { position: absolute; top: 0; bottom: 0; width: 24px; margin-left: -12px; cursor: ew-resize; touch-action: none; outline: none; }
.lab-scene-wipe::before { content: ""; position: absolute; top: 0; bottom: 0; left: 11.5px; width: 1px; background: rgba(255, 255, 255, .85); box-shadow: 0 0 0 .5px rgba(0, 0, 0, .35); }
.lab-scene-wipe::after { content: ""; position: absolute; left: 4px; top: 50%; width: 16px; height: 28px; margin-top: -14px; border-radius: 8px; background: rgba(255, 255, 255, .92); box-shadow: 0 1px 3px rgba(0, 0, 0, .4); }
.lab-scene-wipe:focus-visible::after { box-shadow: 0 0 0 2px var(--blue, #4d8dff), 0 1px 3px rgba(0, 0, 0, .4); }
html[data-look="lab"] .lab-scene-wipe::after { border-radius: 0; width: 10px; left: 7px; }
.lab-scene-label { position: absolute; padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, .45); color: #fff; font: 500 11px/16px var(--sans); pointer-events: none; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); white-space: nowrap; }
html[data-look="lab"] .lab-scene-label { border-radius: 0; font-family: var(--mono); background: #101114; border: 1px solid var(--line); }
.lab-scene-viewport .tag { z-index: 1; }
`

export function startScene(host: SceneHost) {
  const { viewport, live, workspace, sceneTime } = host
  if (!document.getElementById("lab-scene-css")) {
    const style = document.createElement("style")
    style.id = "lab-scene-css"
    style.textContent = CSS
    document.head.append(style)
  }
  viewport.classList.add("lab-scene-viewport")
  const canvas = document.createElement("canvas")
  canvas.className = "lab-scene-canvas"
  canvas.setAttribute("role", "img")
  canvas.setAttribute("aria-label", "Night street scene")
  viewport.prepend(canvas)
  const overlay = document.createElement("div")
  overlay.style.cssText = "position:absolute;inset:0;pointer-events:none"
  viewport.append(overlay)

  // ——— clock ———
  let time = 100 // scene seconds (W): rain, ripples, fire; starts away from 0 so hashes stay positive
  let fall = 0 // metres fallen: rain's phase, so a speed change never reshuffles the drops
  let speed = 1
  let lastSeek = sceneTime.timeline.time
  let scrub = 0
  let running = false
  let visible = !document.hidden
  const blasts: Blast[] = []
  const bursts: { t0: number; kind: "debris" | "smoke" }[] = []
  let soak = -1

  // ——— looks: the live one, and the compare's ———
  const inputs = () => ({ settings: host.settings(), fx: host.fx() })
  const liveLook = new Look(inputs())
  let snapshot: Look | null = null
  const gridLooks = new Map<string, Look>()
  let compare: "none" | "wipe" | "grid" = "none"
  const wipe = new Spring(1, CALM)
  const grid = new Spring(0, SMOOTH)
  let lastPreset = liveLook.status()

  // ——— objects ———
  const entries: Entry[] = []
  const byKey = new Map<string, Entry>()
  const defs = new Map(WORLD.map((d) => [d.key, d]))
  const idOf = new Map<string, string>()
  const walk = (
    items: readonly TreeItem[],
    f: (item: TreeItem, ancestors: string[]) => void,
    up: string[] = [],
  ) => {
    for (const i of items) {
      f(i, up)
      if (i.children) walk(i.children, f, [...up, i.id])
    }
  }
  walk(workspace.scene, (i) => {
    if (defs.has(i.label)) idOf.set(i.label, i.id)
  })
  const entryFor = (key: string, def: ObjectDef, id: string | null, offset: number) => {
    let e = byKey.get(key)
    if (!e) {
      e = {
        key,
        def,
        id,
        offset,
        vis: new Spring(1, DEFAULT),
        hl: new Spring(0, SNAPPY),
        lvl: new Spring(1, CALM),
        bounds: null,
        boxes: [],
      }
      byKey.set(key, e)
      entries.push(e)
      structure = true
    }
    return e
  }
  let structure = true
  entryFor("static", WORLD[0]!, null, 0)
  for (const def of WORLD.slice(1)) entryFor(def.key, def, idOf.get(def.key) ?? null, 0)
  /** The outliner, now: what's present, hidden, selected; copies get entries of their own. */
  const syncObjects = (first = false) => {
    const present = new Map<string, { hidden: boolean; selected: boolean; label: string }>()
    const sel = new Set(workspace.outline.selection)
    walk(workspace.scene, (i, up) => {
      present.set(i.id, {
        label: i.label,
        hidden: workspace.hidden.has(i.id) || up.some((a) => workspace.hidden.has(a)),
        selected: sel.has(i.id) || up.some((a) => sel.has(a)),
      })
    })
    // Copies: "Cone #93 copy", "… copy copy", each a step further along.
    for (const [id, p] of present) {
      if ([...idOf.values()].includes(id)) continue
      const m = /^(.*?)((?: copy)+)$/.exec(p.label)
      const base = m && defs.get(m[1]!)
      if (!base?.copyable) continue
      const e = entryFor(`copy:${id}`, base, id, m![2]!.length / 5)
      if (first) e.vis.snap(0)
    }
    for (const e of entries) {
      if (!e.id) continue
      const p = present.get(e.id)
      const on = !!p && !p.hidden
      e.vis.set(on ? 1 : 0)
      e.hl.set(p?.selected ? 1 : 0)
      if (first) {
        e.vis.snap(e.vis.target)
        e.hl.snap(e.hl.target)
      }
    }
    wake()
  }
  // Read on the next frame: the outliner reports a selection before it holds it.
  let outlineChanged = false
  workspace.onChange(() => {
    outlineChanged = true
    wake()
  })

  // Parts, sorted by mesh, and each entry's bounds; rebuilt when entries come or go.
  let partData: Float32Array | null = null
  let partRanges = {} as Record<(typeof MESHES)[number], { first: number; count: number }>
  const buildParts = () => {
    const rows: { mesh: string; data: number[] }[] = []
    entries.forEach((e, index) => {
      const at: Vec3 = [e.def.at[0] + e.offset * 0.85, e.def.at[1], e.def.at[2] + e.offset * 0.25]
      let min: Vec3 = [Infinity, Infinity, Infinity]
      let max: Vec3 = [-Infinity, -Infinity, -Infinity]
      e.boxes = []
      for (const part of e.def.parts) {
        const m = partMatrix({ at, yaw: e.def.yaw ?? 0 }, part)
        e.boxes.push({ min: m.min, max: m.max })
        min = min.map((v, k) => Math.min(v, m.min[k]!)) as Vec3
        max = max.map((v, k) => Math.max(v, m.max[k]!)) as Vec3
        const emit = part.emit ?? [0, 0, 0]
        rows.push({
          mesh: part.mesh,
          data: [
            ...m.rows[0]!,
            ...m.rows[1]!,
            ...m.rows[2]!,
            ...m.inv,
            0,
            ...part.color,
            part.rough,
            part.metal ?? 0,
            part.emitStrength ?? 0,
            part.pattern ?? 0,
            index,
            ...emit,
            0,
          ],
        })
      }
      e.bounds = e.def.parts.length ? { min, max } : null
    })
    const data: number[] = []
    for (const mesh of MESHES) {
      const of = rows.filter((r) => r.mesh === mesh)
      partRanges[mesh] = { first: data.length / 28, count: of.length }
      for (const r of of) data.push(...r.data)
    }
    partData = new Float32Array(data)
    structure = false
  }

  // ——— the GPU ———
  let renderer: SceneRenderer | null = null
  let failed: string | null = null
  const reduced = params.has("reduced")
  let scale = 1
  let sized = false
  const resize = () => {
    if (!renderer) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = viewport.clientWidth * dpr
    let h = viewport.clientHeight * dpr
    // Past ~4 MP the eye can't tell; the budget can.
    const cap = 4.2e6
    if (w * h > cap) {
      const k = Math.sqrt(cap / (w * h))
      w *= k
      h *= k
    }
    const lowRes = renderer.software || reduced
    if (renderer.resize(canvas, w, h, lowRes ? 0.5 : scale)) {
      if (sized)
        live.event("debug", `Viewport ${renderer.width}×${renderer.height} (${dpr}× pixels)`)
      sized = true
    }
  }
  new ResizeObserver(() => {
    resize()
    wake()
  }).observe(viewport)

  const fail = (why: string) => {
    failed = why
    renderer = null
    canvas.remove()
    const still = document.createElement("div")
    still.className = "lab-scene-still"
    still.style.backgroundImage = `url(${new URL("./lab-scene-still.jpg", import.meta.url).href})`
    const note = document.createElement("div")
    note.className = "lab-scene-note"
    note.textContent = `A still of the live scene: ${why}. The panels still work.`
    viewport.prepend(still)
    overlay.append(note)
    live.event("warn", `Scene unavailable: ${why}`)
    viewport.dataset.scene = "fallback"
  }
  ;(params.has("noscene")
    ? Promise.reject(new Error("the scene is off (?noscene)"))
    : SceneRenderer.create(canvas)
  )
    .then((r) => {
      renderer = r
      resize()
      viewport.dataset.scene = "webgpu"
      live.event(
        "info",
        `Scene on ${r.adapterName}${r.timed ? " · GPU timestamps on" : " · no GPU timestamps"}${r.software ? " · reduced (software)" : ""}`,
      )
      live.event("info", "Weather station ready")
      r.lost?.then((why) => {
        if (renderer === r) fail(`the GPU device was lost (${why})`)
      })
      wake()
    })
    .catch((e: Error) => fail(e.message.replace(/\.$/, "")))

  // ——— timeline, cues ———
  sceneTime.onSeek((t, source) => {
    if (source !== "play") scrub += t - lastSeek
    lastSeek = t
    wake()
  })
  sceneTime.onCue((id) => {
    if (id === "boom") {
      const s = host.settings()
      const blast = {
        t0: time,
        size: Number(s.fbSize),
        dur: Number(s.fbDuration),
        temp: Number(s.fbTemp),
      }
      blasts.push(blast)
      live.event(
        "info",
        `Fireball at Propane tank #96: ${blast.size.toFixed(2)} m, ${blast.dur.toFixed(2)} s, ${blast.temp.toFixed(2)}×`,
      )
    } else if (id === "debris" || id === "smoke") {
      bursts.push({ t0: time, kind: id })
      live.event(
        "debug",
        id === "debris" ? "Debris: embers thrown from the tank" : "Smoke burst over the tank",
      )
    }
    wake()
  })

  // ——— the loop ———
  let raf = 0
  let lastFrame = 0
  let fps = 60
  let dirty = true
  function wake() {
    dirty = true
    if (!raf && visible && renderer) raf = requestAnimationFrame(frame)
  }
  // Read on the next frame: the host's settings take a store's change after its listeners run.
  let changed = false
  host.subscribe(() => {
    changed = true
    viewport.dataset.hour = host.fx().hour.toFixed(2)
    wake()
  })
  viewport.dataset.hour = host.fx().hour.toFixed(2)
  const takeInputs = () => {
    if (!changed) return
    changed = false
    liveLook.update(inputs())
    for (const [name, l] of gridLooks) l.update(gridInputs(name))
  }
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden
    lastFrame = 0
    if (visible) wake()
  })
  live.attach({
    start() {
      running = true
      lastFrame = 0
      wake()
    },
    stop() {
      running = false
    },
    // Each tick reports a sample; a burst of ticks sends the GPU one frame, at its end (a software
    // GPU would take seconds over ninety, and input would wait behind them).
    tick(ms) {
      advance(ms / 1000, true)
      draw(ms, false)
      if (tickDraw) return
      tickDraw = true
      queueMicrotask(() => {
        tickDraw = false
        draw(undefined, true, false)
      })
    },
  })
  let tickDraw = false

  const gridNames = () =>
    ["Rain", "Storm", "Fog", "Snow", "Drizzle"].filter((n) => n !== liveLook.preset).slice(0, 3)
  const gridInputs = (name: string) => ({
    settings: { ...host.settings(), ...VARIANTS[name] },
    fx: host.fx(),
  })

  /** Moves the scene's clock and every spring; true while something still moves. */
  function advance(dt: number, forced = false): boolean {
    takeInputs()
    if (outlineChanged) {
      outlineChanged = false
      syncObjects()
    }
    const playing = sceneTime.timeline.playing
    let dW = running || playing || forced ? dt * speed : 0
    dW += scrub
    scrub = 0
    const w = weather(liveLook)
    time += dW
    fall += dW * w.speed
    // The street soaks while it rains and dries slowly after; snow settles the same way.
    const wantSoak = w.amount > 0.04 ? 1 : 0
    if (soak < 0) soak = wantSoak
    soak += (wantSoak - soak) * (1 - Math.exp(-Math.abs(dW) / (wantSoak ? 5 : 16)))
    let moving = liveLook.step(dt)
    if (snapshot?.step(dt)) moving = true
    for (const l of gridLooks.values()) if (l.step(dt)) moving = true
    const streetlamp = liveLook.get("streetlamp")
    for (const e of entries) {
      if (e.def.light === 0) e.lvl.snap(streetlamp)
      e.vis.step(dt)
      e.hl.step(dt)
      if (!e.vis.resting || !e.hl.resting) moving = true
    }
    // A copy that has faded out after its item left goes for good.
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!
      if (e.key.startsWith("copy:") && e.vis.resting && e.vis.x === 0) {
        entries.splice(i, 1)
        byKey.delete(e.key)
        structure = true
      }
    }
    wipe.step(dt)
    grid.step(dt)
    if (!wipe.resting || !grid.resting) moving = true
    if (compare === "wipe" && wipe.resting && wipe.x === 0) {
      compare = "none"
      snapshot = null
      syncCompareUi()
    }
    if (compare === "grid" && grid.resting && grid.x === 0) {
      compare = "none"
      gridLooks.clear()
      syncCompareUi()
    }
    const status = liveLook.status()
    if (status !== lastPreset) {
      lastPreset = status
      live.event("info", `Weather → ${status}`)
    }
    blasts.splice(
      0,
      blasts.length,
      ...blasts.filter((b) => time - b.t0 < b.dur + 7 && time - b.t0 > -60),
    )
    bursts.splice(0, bursts.length, ...bursts.filter((b) => time - b.t0 < 8 && time - b.t0 > -60))
    // Fire moves while the clock does; nothing else needs a frame.
    return moving
  }

  // Lightning: strikes come from the clock, so a scrub replays them.
  let lastStrike = -1
  const flashAt = (t: number, weight: number) => {
    if (weight < 0.01) return 0
    const period = 7.5
    const k = Math.floor(t / period)
    const h = Math.sin(k * 127.1 + 3.7) * 43758.5453
    const r = h - Math.floor(h)
    if (r > 0.6) return 0
    const t0 = k * period + r * 4
    if (t < t0) return 0
    if (k !== lastStrike && t - t0 < 0.2 && running) {
      lastStrike = k
      live.event("debug", "Lightning strike")
    }
    let f = 0
    for (const [d, a] of [
      [0, 1],
      [0.09, 0.55],
      [0.21, 0.8],
    ] as const)
      if (t > t0 + d) f += a * Math.exp(-(t - t0 - d) * 22)
    return f * weight
  }

  // The splashes alive this frame, by the shader's own hash (see vs_splash).
  const pcg = (v: number) => {
    const s = (Math.imul(v, 747796405) + 2891336453) >>> 0
    const w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0
    return ((w >>> 22) ^ w) >>> 0
  }
  const aliveSplashes = (count: number) => {
    const t = Math.fround(time)
    let alive = 0
    for (let i = 0; i < count; i++) {
      const a = pcg((i * 7 + 11) >>> 0)
      const b = pcg((a ^ 0x9e3779b9) >>> 0)
      const rate = 1.3 * (0.7 + 0.6 * (a / 4294967295))
      const cyc = t * rate + b / 4294967295
      if ((cyc - Math.floor(cyc)) / rate <= 0.24) alive++
    }
    return alive
  }

  const sprites = new Float32Array(2048 * 16)
  const rnd = (i: number) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  /** Smoke, fire, embers and drips, placed from the clock. */
  function buildSprites(look: Look): number {
    let n = 0
    const put = (
      pos: Vec3,
      size: number,
      col: [number, number, number, number],
      emit: [number, number, number],
      info: [number, number, number, number],
    ) => {
      if (n >= 2048) return
      sprites.set(
        [...pos, size, ...col, ...emit, info[0] === 2 ? 0 : (info[1] * 6.28) % 6.28, ...info],
        n * 16,
      )
      n++
    }
    const wind = look.get("wind") * 0.12
    const vent = byKey.get("Steam vent")
    const ventVis = vent?.vis.x ?? 0
    if (ventVis > 0.01) {
      const count = Math.round(look.get("puffs") * 6)
      const life = 3.4
      for (let i = 0; i < count; i++) {
        const h = rnd(i + 1)
        const a = (((time / life + i / count + h * 0.13) % 1) + 1) % 1
        const age = a * life
        const sway = Math.sin(time * 0.7 + i * 1.7) * 0.25 * a
        const pos: Vec3 = [
          VENT[0] + sway + wind * age * 2.5 + (h - 0.5) * 0.3,
          VENT[1] + 0.1 + age * (0.55 + 0.25 * h) + age * age * 0.05,
          VENT[2] + (rnd(i + 7) - 0.5) * 0.4 * a,
        ]
        const fade = Math.min(1, a / 0.06) * (1 - a) ** 1.6
        put(
          pos,
          0.1 + a * 0.8,
          [1, 1, 1, 0.45 * fade * ventVis],
          [0.8 * (1 - Math.min(1, a / 0.2)) * ventVis, 0, 0],
          [0, h, 0, a * 0.95],
        )
      }
    }
    for (const b of blasts) {
      const age = time - b.t0
      if (age < 0) continue
      const k = 26
      const grow = 1 - (1 - Math.min(1, age / b.dur)) ** 3
      for (let j = 0; j < k; j++) {
        const h1 = rnd(j * 3 + 11)
        const h2 = rnd(j * 3 + 12)
        const h3 = rnd(j * 3 + 13)
        const th = h1 * Math.PI * 2
        const up = 0.15 + h2 * 0.85
        const r = b.size * (0.2 + 0.8 * grow) * (0.35 + 0.65 * h3)
        const rise = age * (0.35 + 0.4 * h2) + age * age * 0.12
        const pos: Vec3 = [
          TANK[0] + Math.cos(th) * Math.sqrt(1 - up * up) * r + wind * age * 2,
          TANK[1] + up * r * 0.9 + rise,
          TANK[2] + Math.sin(th) * Math.sqrt(1 - up * up) * r * 0.8,
        ]
        const life = age < b.dur ? 0.3 * (age / b.dur) : 0.3 + 0.7 * Math.min(1, (age - b.dur) / 6)
        const size = b.size * (0.42 + 0.45 * grow + 0.22 * age) * (0.7 + 0.5 * h1)
        const smoke = life < 0.3 ? 0.65 : 0.65 * (1 - (life - 0.3) / 0.7) ** 1.3
        const hot = age < b.dur ? 1 : Math.exp(-(age - b.dur) * 7)
        put(
          pos,
          size,
          [1, 1, 1, smoke],
          [b.temp * 5 * hot, (b.temp - 1) * 0.35, 0],
          [hot > 0.5 ? 1 : 0, h1, 0, life],
        )
      }
      // Embers thrown out with the blast.
      ember(b.t0, 36, b.size, 101)
    }
    for (const b of bursts) {
      const age = time - b.t0
      if (age < 0) continue
      if (b.kind === "debris") ember(b.t0, 48, 1.4, 303)
      else
        for (let j = 0; j < 14; j++) {
          const h = rnd(j + 500)
          const pos: Vec3 = [
            TANK[0] + (h - 0.5) * 1.2 + wind * age * 3,
            TANK[1] + 0.3 + age * (0.5 + 0.3 * rnd(j + 600)),
            TANK[2] + (rnd(j + 700) - 0.5) * 0.8,
          ]
          const life = 0.45 + 0.55 * Math.min(1, age / 7)
          put(
            pos,
            0.5 + age * 0.35,
            [1, 1, 1, 0.55 * Math.min(1, age * 3) * (1 - Math.min(1, age / 7.5))],
            [0, 0, 0],
            [0, h, 0, life],
          )
        }
    }
    function ember(t0: number, count: number, size: number, seed: number) {
      const age = time - t0
      if (age < 0 || age > 2.2) return
      for (let j = 0; j < count; j++) {
        const h1 = rnd(j + seed)
        const h2 = rnd(j + seed + 50)
        const th = h1 * Math.PI * 2
        const sp = (2.5 + 4 * h2) * Math.sqrt(size)
        const v: Vec3 = [
          Math.cos(th) * sp * 0.7,
          3 + 4 * rnd(j + seed + 90),
          Math.sin(th) * sp * 0.5,
        ]
        let y = TANK[1] + v[1] * age - 4.9 * age * age
        const landed = y < 0.16
        if (landed) y = 0.16
        const pos: Vec3 = [TANK[0] + v[0] * age, y, TANK[2] + v[2] * age]
        const glow = Math.max(0, 1 - age / (1.2 + h2)) ** 1.5
        if (glow <= 0) continue
        const stretch = landed ? 0 : Math.min(6, Math.hypot(v[0], v[1] - 9.8 * age) * 0.4)
        put(pos, 0.025, [1, 0.42, 0.12, glow], [9 * glow, 0, 0], [2, h1, stretch, -1])
      }
    }
    const drip = byKey.get("Gutter drip")
    const dripVis =
      (drip?.vis.x ?? 0) * Math.min(1, weather(look).amount * 2) * (1 - weather(look).snowness)
    if (dripVis > 0.02) {
      for (let j = 0; j < 4; j++) {
        const period = 0.55
        const a = ((((time + j * 0.137) / period) % 1) + 1) % 1
        const age = a * period
        const y = 1.32 - 4.9 * age * age
        if (y < 0.16) continue
        put(
          [5.9 + (rnd(j) - 0.5) * 0.03, y, -6.26],
          0.012,
          [0.7, 0.8, 0.9, 0.8 * dripVis],
          [0.6, 0, 0],
          [3, j, Math.min(5, 9.8 * age * 0.5), -1],
        )
      }
    }
    return n
  }

  const v3 = {
    sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k],
    scale: (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
    norm: (a: Vec3): Vec3 => {
      const l = Math.hypot(...a) || 1
      return [a[0] / l, a[1] / l, a[2] / l]
    },
  }
  const rampAt = (look: Look, row: number, t: number): Vec3 => {
    const i = (row * RAMP_W + Math.round(Math.min(1, Math.max(0, t)) * (RAMP_W - 1))) * 4
    return [look.ramp[i]!, look.ramp[i + 1]!, look.ramp[i + 2]!]
  }

  /** The sphere around a cone of light, apex to `length` along `dir` (where fog is marched). */
  const coneVol = (
    apex: Vec3,
    dir: Vec3,
    half: number,
    length: number,
  ): [number, number, number, number] => {
    const r = Math.min(length * Math.tan((half * Math.PI) / 180), length * 1.5)
    const m = Math.max(length * 0.5, (length * length + r * r) / (2 * length))
    const c = v3.add(apex, dir, Math.min(m, length))
    return [...c, Math.max(m, Math.hypot(length - Math.min(m, length), r))]
  }

  /** The eight light slots, from a look (see lab-scene.wgsl). */
  function lights(look: Look, m: ReturnType<typeof matrices>, flash: number): LightSlot[] {
    const g = (k: string) => look.get(k)
    const rad = Math.PI / 180
    const off: LightSlot = {
      pos: [0, 0, 0],
      range: 1,
      color: [0, 0, 0],
      kind: 0,
      dir: [0, -1, 0],
      size: 0,
      cosOuter: 0,
      cosInner: 1,
      fog: 0,
      shadows: 0,
    }
    const level = (key: string) => {
      const e = byKey.get(key)
      return e ? e.vis.x * e.lvl.x : 0
    }
    const areaW = g("areaW")
    const sunW = g("sunW")
    const outer = Math.min(89, g("cone") * (1 - areaW) + 84 * areaW)
    const soft = g("falloff") * (1 - areaW) + areaW
    const inner = outer * (1 - soft * 0.95)
    const lamp: LightSlot = {
      pos: [1.6, 5.52, -1.95],
      range: 18,
      color: v3.scale(SODIUM, 95 * level("2100K Sodium streetlamp") * (1 - 0.85 * sunW)),
      kind: 1,
      dir: v3.norm([0, -1, 0.12]),
      size: 0.2 + areaW * 1.1,
      cosOuter: Math.cos(outer * rad),
      cosInner: Math.cos(inner * rad),
      fog: 1,
      shadows: 1,
    }
    lamp.vol = coneVol(lamp.pos, lamp.dir, outer, 5.6)
    const flicker = 0.92 + 0.08 * Math.sin(time * 13.1) * Math.sin(time * 7.3 + 1)
    const porch: LightSlot = {
      ...off,
      pos: [-3.7, 2.13, -5.9],
      range: 7,
      color: v3.scale([1, 0.58, 0.26], 9 * level("Porch post lantern") * flicker),
      size: 0.15,
      fog: 1,
      shadows: 1,
      vol: [-3.7, 2.13, -5.9, 4.5],
    }
    const win: LightSlot = {
      pos: [3.6, 1.75, -6.2],
      range: 8,
      color: v3.scale([1, 0.6, 0.3], 7 * level("Window glow")),
      kind: 1,
      dir: [0, 0, 1],
      size: 0.8,
      cosOuter: 0.02,
      cosInner: 0.85,
      fog: 0.7,
      shadows: 1,
      vol: [3.6, 1.75, -4.2, 3.4],
    }
    const flashOn = g("flashlight")
    const fpos = v3.add(v3.add(CAMERA.pos, m.right, 0.32), m.up, -0.28)
    const torch: LightSlot = {
      pos: fpos,
      range: 26,
      color: v3.scale(kelvin(5600), 160 * flashOn),
      kind: 1,
      dir: v3.norm(v3.sub([0.6, 1.0, -2.6], fpos)),
      size: 0.02,
      cosOuter: Math.cos(13 * rad),
      cosInner: Math.cos(6 * rad),
      fog: 1.4,
      shadows: 1,
    }
    torch.vol = coneVol(torch.pos, torch.dir, 13, 16)
    let fire = { ...off }
    for (const b of blasts) {
      const age = time - b.t0
      if (age < 0 || age > b.dur + 1.5) continue
      const env =
        age < b.dur
          ? (1 - age / b.dur) ** 0.6 * Math.min(1, age / 0.04)
          : 0.12 * Math.exp(-(age - b.dur) * 3)
      const c = rampAt(look, 0, Math.min(0.3, (0.3 * age) / b.dur))
      fire = {
        ...off,
        pos: [TANK[0], TANK[1] + b.size * 0.6 + age * 0.4, TANK[2]],
        range: 8 + b.size * 5,
        color: v3.scale(v3.norm([c[0] + 0.05, c[1] + 0.02, c[2]]), 260 * b.temp * b.temp * env),
        size: b.size * 0.6,
        fog: 0.8,
        shadows: 1,
        vol: [TANK[0], TANK[1] + b.size * 0.6 + age * 0.4, TANK[2], Math.min(7, 3 + b.size * 2)],
      }
    }
    const ventE = byKey.get("Steam vent")
    const vc = rampAt(look, 0, 0.04)
    const heat = Math.max(0, Math.min(1, (vc[0] - vc[2]) * 1.8))
    const vent: LightSlot = {
      ...off,
      pos: [VENT[0], 0.45, VENT[2]],
      range: 4.5,
      color: v3.scale(
        vc,
        6 *
          heat *
          (ventE?.vis.x ?? 0) *
          (0.85 + 0.15 * Math.sin(time * 17) * Math.sin(time * 5.1)) *
          Math.min(1, look.get("puffs") / 4),
      ),
      size: 0.3,
      fog: 0.7,
      shadows: 0,
      vol: [VENT[0], 0.45, VENT[2], 2.5],
    }
    // The sun by day, the moon by night; the light style "Sun" makes it the key light.
    const hour = g("hour")
    const elev = Math.sin(((hour - 6) / 12) * Math.PI)
    const az = (hour / 24) * Math.PI * 2 + 0.6
    const day = Math.max(0, elev)
    const travel = v3.norm([
      -Math.cos(az),
      -Math.max(Math.abs(elev), 0.25),
      -Math.sin(az) * 0.6 + 0.4,
    ])
    const overcast = g("overcast")
    const sky: LightSlot = {
      ...off,
      kind: 3,
      dir: travel,
      color:
        day > 0.02
          ? v3.scale(
              kelvin(2600 + 3200 * Math.sqrt(day)),
              7 * day ** 0.6 * (1 - 0.8 * overcast) * (0.35 + 0.65 * Math.max(sunW, 0.5)),
            )
          : v3.scale([0.45, 0.55, 0.9], (0.06 + 0.9 * sunW) * (1 - 0.7 * overcast)),
    }
    // A moon too dim to cast a visible shadow casts none (and saves every pixel the test).
    sky.shadows = sky.color[0] + sky.color[1] + sky.color[2] > 0.15 ? 1 : 0
    const bolt: LightSlot = {
      ...off,
      kind: 3,
      dir: v3.norm([0.25, -0.75, 0.6]),
      color: v3.scale([0.75, 0.8, 1], 9 * flash),
      shadows: 1,
    }
    return [lamp, porch, win, torch, fire, vent, sky, bolt]
  }

  const occluders = () => {
    const out: number[] = []
    entries.forEach((e, index) => {
      if (!e.def.occluders || e.vis.x < 0.01) return
      const yaw = e.def.yaw ?? 0
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      for (const [x, y, z, r] of e.def.occluders) {
        if (out.length >= MAX_OCCLUDERS * 4) return
        out.push(
          e.def.at[0] + e.offset * 0.85 + x * c + z * s,
          e.def.at[1] + y,
          e.def.at[2] + e.offset * 0.25 - x * s + z * c,
          r * e.vis.x + 100 * index,
        )
      }
    })
    return out
  }

  const objects = new Float32Array(64 * 4)
  const frames: Float32Array[] = Array.from({ length: 4 }, () => new Float32Array(FRAME_FLOATS))
  const ramps = new Float32Array(RAMP_W * RAMP_ROWS * 4 * 4)
  let rampsKey: unknown[] = []
  let drawsLast = [0, 0, 0, 0]
  let statusAt = 0
  const statusEls = [...document.querySelectorAll<HTMLElement>(".status span")]

  /** The views for this frame: rects in target pixels, and whose look each draws. */
  function views(): {
    rect: [number, number, number, number]
    clip: [number, number, number, number]
    look: Look
    label?: string
  }[] {
    const W = renderer!.width
    const H = renderer!.height
    const full: [number, number, number, number] = [0, 0, W, H]
    if (compare === "wipe" && snapshot) {
      const x = Math.round(W * wipe.x)
      return [
        { rect: full, clip: [0, 0, x, H], look: snapshot },
        { rect: full, clip: [x, 0, W - x, H], look: liveLook },
      ]
    }
    if (compare === "grid") {
      const gap = Math.round(2 * (W / Math.max(1, viewport.clientWidth)))
      const cw = (W - gap) / 2
      const ch = (H - gap) / 2
      const cells: [number, number, number, number][] = [
        [0, 0, cw, ch],
        [cw + gap, 0, cw, ch],
        [0, ch + gap, cw, ch],
        [cw + gap, ch + gap, cw, ch],
      ]
      const t = grid.x
      const lerp = (a: number[], b: number[]) =>
        a.map((v, i) => v + (b[i]! - v) * t) as [number, number, number, number]
      const out: ReturnType<typeof views> = gridNames().map((name, i) => {
        let l = gridLooks.get(name)
        if (!l) {
          l = new Look(gridInputs(name))
          gridLooks.set(name, l)
        }
        return { rect: cells[i + 1]!, clip: cells[i + 1]!, look: l, label: name }
      })
      const own = lerp(full, cells[0]!)
      out.push({ rect: own, clip: own, look: liveLook, label: "Live" })
      return out
    }
    return [{ rect: full, clip: full, look: liveLook }]
  }

  /** Builds the frame and sends it to the GPU (`submit`), and reports its sample (`report`). */
  function draw(tickMs?: number, submit = true, report = true) {
    if (!renderer) {
      if (!report) return
      // No scene (yet): the feed still reports the page's own frame rate.
      live.report({
        cpu: 0,
        gpu: null,
        fps: tickMs ? 1000 / tickMs : fps,
        drops: 0,
        particles: 0,
        status: liveLook.status(),
        memory: 0,
        draws: 0,
        soak: null,
        passes: PASSES.map((p) => [p, "—", 0] as [string, string, number]),
      })
      return
    }
    const t0 = performance.now()
    resize()
    if (structure) buildParts()
    // Object fades and highlights.
    objects.fill(0)
    entries.forEach((e, i) => objects.set([e.id ? e.vis.x : 1, e.hl.x, e.lvl.x, 0], i * 4))
    const vs = views()
    const occl = occluders()
    const flash = flashAt(time, liveLook.get("lightning"))
    const spriteCount = buildSprites(liveLook)
    const draws: ViewDraw[] = []
    let drops = 0
    let splashes = 0
    vs.forEach((v, i) => {
      const m = matrices(CAMERA, v.rect[2] / v.rect[3])
      const w = weather(v.look)
      const rainVis = byKey.get("Rain sheet")?.vis.x ?? 1
      const cap =
        renderer!.software || reduced ? 15000 : params.get("debug")?.includes("norain") ? 0 : 90000
      const dropCount = Math.min(cap, rainVis > 0.001 ? w.drops : 0)
      const splashCount = Math.round(w.splashes * rainVis)
      if (v.look === liveLook) {
        drops = dropCount
        splashes = splashCount
      }
      const frame = packFrame(
        {
          m,
          cam: CAMERA.pos,
          time,
          rect: v.rect,
          look: v.look,
          viewIndex: i,
          flash: v.look.get("lightning") > 0.01 ? flash : 0,
          fall: fall * (w.speed / Math.max(0.5, weather(liveLook).speed)),
          soak: Math.max(0, soak),
          lights: lights(v.look, m, v.look.get("lightning") > 0.01 ? flash : 0),
          occluders: occl,
          drops: dropCount,
          splashes: splashCount,
          seed: Number(host.settings().roomSeed ?? 7) * 1013,
          rainVisible: rainVis,
          windowLevel:
            (byKey.get("Window glow")?.vis.x ?? 0) * (byKey.get("Window glow")?.lvl.x ?? 0),
          reduced: renderer!.software || reduced,
        },
        frames[i],
      )
      draws.push({
        rect: v.rect,
        clip: v.clip,
        frame,
        drops: dropCount,
        splashes: splashCount,
        exposure: 2 ** v.look.get("exposure"),
      })
    })
    if (submit) send(renderer, vs, draws, spriteCount)
    Object.assign(stats, { drops, splashes, sprites: spriteCount, time, soak })
    if (!report) return
    const cpu = performance.now() - t0
    const timing = renderer.timing
    const sample = {
      cpu,
      gpu: timing ? timing.total : null,
      fps: tickMs ? 1000 / tickMs : fps,
      drops,
      particles: (drops + aliveSplashes(splashes) + spriteCount) / 1000,
      status: liveLook.status(),
      memory: renderer.memory / (1024 * 1024),
      draws: drawsLast.reduce((a, b) => a + b, 0),
      soak: Math.max(0, soak),
      passes: PASSES.map(
        (p, i) =>
          [p, timing ? Number(timing.passes[i]!.toFixed(2)) : "—", drawsLast[i]!] as [
            string,
            number | string,
            number,
          ],
      ),
    }
    live.report(sample)
    const now = performance.now()
    if (now >= statusAt) {
      statusAt = now + 250
      if (statusEls[0])
        statusEls[0].textContent = `Weather · ${sample.status} · ${drops.toLocaleString("en-US")} drops`
      if (statusEls[2])
        statusEls[2].textContent = timing ? `GPU ${timing.total.toFixed(2)} ms` : "GPU —"
    }
  }

  /** Sends a built frame to the GPU. */
  function send(
    r: SceneRenderer,
    vs: ReturnType<typeof views>,
    draws: ViewDraw[],
    spriteCount: number,
  ) {
    // Ramps only travel when they change.
    const key = vs.map((v) => v.look.ramp)
    const rampsChanged = key.length !== rampsKey.length || key.some((k, i) => k !== rampsKey[i])
    if (rampsChanged) {
      vs.forEach((v, i) => ramps.set(v.look.ramp, i * RAMP_W * RAMP_ROWS * 4))
      rampsKey = key
    }
    drawsLast = r.render({
      views: draws,
      ramps: rampsChanged ? ramps : null,
      objects,
      parts: partData ? { data: partData, ranges: partRanges } : null,
      sprites,
      spriteCount,
      fading: entries.some((e) => e.vis.x > 0.001 && e.vis.x < 0.999),
      exposure: 1.1,
      bloom: 0.055,
      vignette: 0.32,
      grain: time % 97,
    })
    partData = null
    syncLabels(vs)
    stats.frames++
  }

  function frame(now: number) {
    raf = 0
    if (!visible || !renderer) return
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 1 / 60
    if (lastFrame) fps += (1000 / Math.max(1, now - lastFrame) - fps) * 0.1
    lastFrame = now
    const moving = advance(dt)
    const animating = running || sceneTime.timeline.playing || moving
    if (animating || dirty) draw()
    dirty = false
    if (animating) raf ||= requestAnimationFrame(frame)
    else if (!raf) lastFrame = 0
  }

  // ——— labels for compare views ———
  const labels: HTMLElement[] = []
  function syncLabels(vs: ReturnType<typeof views>) {
    const want: { text: string; x: number; y: number }[] = []
    const W = renderer!.width
    const k = viewport.clientWidth / W
    if (compare === "wipe") {
      want.push({ text: "A · snapshot", x: 10, y: 40 }, { text: "B · live", x: -10, y: 40 })
    } else if (compare === "grid" && grid.x > 0.5) {
      // Bottom left of each cell, clear of the viewport's own tag.
      for (const v of vs)
        if (v.label)
          want.push({ text: v.label, x: v.rect[0] * k + 10, y: (v.rect[1] + v.rect[3]) * k - 30 })
    }
    while (labels.length < want.length) {
      const el = document.createElement("span")
      el.className = "lab-scene-label"
      overlay.append(el)
      labels.push(el)
    }
    labels.forEach((el, i) => {
      const w = want[i]
      el.hidden = !w
      if (!w) return
      el.textContent = w.text
      el.style.left = w.x >= 0 ? `${w.x}px` : ""
      el.style.right = w.x < 0 ? `${-w.x}px` : ""
      el.style.top = `${w.y}px`
    })
    if (handle) {
      handle.hidden = compare !== "wipe"
      handle.style.left = `${wipe.x * 100}%`
      handle.setAttribute("aria-valuenow", String(Math.round(wipe.x * 100)))
    }
  }

  // ——— compare: A/B wipe and grid ———
  const handle = document.createElement("div")
  handle.className = "lab-scene-wipe"
  handle.hidden = true
  handle.tabIndex = 0
  handle.setAttribute("role", "slider")
  handle.setAttribute("aria-label", "A/B wipe")
  handle.setAttribute("aria-valuemin", "0")
  handle.setAttribute("aria-valuemax", "100")
  handle.style.pointerEvents = "auto"
  overlay.append(handle)
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault()
    handle.setPointerCapture(e.pointerId)
    handle.focus()
    const move = (ev: PointerEvent) => {
      const r = viewport.getBoundingClientRect()
      wipe.snap(Math.min(0.98, Math.max(0.02, (ev.clientX - r.left) / r.width)))
      wake()
    }
    move(e)
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", move), {
      once: true,
    })
  })
  handle.addEventListener("keydown", (e) => {
    const by = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0
    if (!by) return
    e.preventDefault()
    wipe.snap(Math.min(0.98, Math.max(0.02, wipe.target + by * (e.shiftKey ? 0.1 : 0.02))))
    wake()
  })
  const chipSets = [...document.querySelectorAll<HTMLElement>(".dock .chips")]
  const variantChips = [...(chipSets[0]?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
  const compareChips = [...(chipSets[1]?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
  const setCompare = (mode: "wipe" | "grid") => {
    if (compare === mode) {
      // Out: the wipe slides to the left edge (live everywhere), the grid's live cell grows back.
      if (mode === "wipe") wipe.set(0)
      else grid.set(0)
      live.event("info", `Compare: ${mode === "wipe" ? "A/B wipe" : "grid"} off`)
    } else {
      if (compare !== "none") {
        snapshot = null
        gridLooks.clear()
        wipe.snap(1)
        grid.snap(0)
      }
      compare = mode
      if (mode === "wipe") {
        // A is the scene as it is now; the line comes in from the right as B (live) is revealed.
        snapshot = new Look(inputs())
        wipe.snap(1).set(0.5)
      } else grid.snap(0).set(1)
      live.event(
        "info",
        `Compare: ${mode === "wipe" ? "A/B wipe (A is a snapshot of now)" : "grid of variants"}`,
      )
    }
    syncCompareUi()
    wake()
  }
  function syncCompareUi() {
    compareChips[0]?.classList.toggle("on", compare === "wipe" && wipe.target > 0)
    compareChips[1]?.classList.toggle("on", compare === "grid" && grid.target > 0)
    compareChips.forEach((b) => b.setAttribute("aria-pressed", String(b.classList.contains("on"))))
  }
  compareChips[0]?.addEventListener("click", () => setCompare("wipe"))
  compareChips[1]?.addEventListener("click", () => setCompare("grid"))
  syncCompareUi()

  const variantNames = variantChips.map((b) => b.textContent!.replace(/^⇧\d/, "").trim())
  const applyVariant = (name: string) => {
    const v = VARIANTS[name]
    if (v) host.apply(v)
  }
  variantChips.forEach((b, i) => b.addEventListener("click", () => applyVariant(variantNames[i]!)))
  const syncVariants = () => {
    const preset = String(host.settings().preset)
    variantChips.forEach((b, i) => {
      b.classList.toggle("on", variantNames[i] === preset)
      b.setAttribute("aria-pressed", String(variantNames[i] === preset))
    })
  }
  host.subscribe(syncVariants)
  syncVariants()
  document.addEventListener("keydown", (e) => {
    const m = /^Digit([1-5])$/.exec(e.code)
    if (!m || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement
    if (t.closest("input, textarea, [contenteditable]")) return
    e.preventDefault()
    applyVariant(variantNames[Number(m[1]) - 1]!)
  })

  // ——— picking: a click in the viewport selects what's under it ———
  let down: { x: number; y: number } | null = null
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY }
  })
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || !renderer) return
    down = null
    const r = canvas.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * renderer.width
    const py = ((e.clientY - r.top) / r.height) * renderer.height
    const v = views().find(
      (v) =>
        px >= v.clip[0] &&
        px < v.clip[0] + v.clip[2] &&
        py >= v.clip[1] &&
        py < v.clip[1] + v.clip[3],
    )
    if (!v) return
    const m = matrices(CAMERA, v.rect[2] / v.rect[3])
    const nx = ((px - v.rect[0]) / v.rect[2]) * 2 - 1
    const ny = 1 - ((py - v.rect[1]) / v.rect[3]) * 2
    const inv = m.invViewProj
    const far = [0, 1, 2, 3].map(
      (k) => inv[k]! * nx + inv[4 + k]! * ny + inv[8 + k]! + inv[12 + k]!,
    )
    const p: Vec3 = [far[0]! / far[3]!, far[1]! / far[3]!, far[2]! / far[3]!]
    const dir = v3.norm(v3.sub(p, CAMERA.pos))
    const pickable = entries.filter(
      (e) => e.id && e.bounds && e.vis.target > 0 && !workspace.locked.has(e.id),
    )
    const owners = pickable.flatMap((e) => e.boxes.map(() => e))
    const hit = pick(
      CAMERA.pos,
      dir,
      pickable.flatMap((e) => e.boxes),
    )
    const id = hit.index >= 0 ? owners[hit.index]!.id! : null
    workspace.select(id ? [id] : [])
  })

  syncObjects(true)

  const stats = { frames: 0, drops: 0, splashes: 0, sprites: 0, time: 0, soak: 0 }
  const api = {
    stats,
    /** The scene has drawn its first frame (and, paused, has nothing left to draw). */
    get ready() {
      return !!renderer && stats.frames > 0 && (running || !raf)
    },
    get failed() {
      return failed
    },
    get compare() {
      return compare
    },
    get renderer() {
      return renderer
    },
    get running() {
      return !!raf
    },
    setSpeed(s: number) {
      speed = s
    },
    setCompare,
    /** Renders a frame now (tests: after a change, before reading pixels). */
    render() {
      advance(0)
      draw()
    },
    /** The latest GPU timings, if timed. */
    get timing() {
      return renderer?.timing ?? null
    },
    /** The live view's ramp rows as the shaders sample them (smoke, sky, fog, curves). */
    ramps() {
      return Array.from(liveLook.ramp)
    },
    /** The sky's colour at the current hour (linear rgb), from the ramp. */
    sky() {
      return rampAt(liveLook, 1, liveLook.get("hour") / 24)
    },
    /** Each outliner object in the street: its fade, highlight and lamp level. */
    objects() {
      return entries
        .filter((e) => e.id)
        .map((e) => ({ key: e.key, id: e.id, vis: e.vis.x, hl: e.hl.x, lvl: e.lvl.x }))
    },
    /** Where an object's centre lands in the viewport (CSS px from its top left). */
    project(key: string) {
      const e = byKey.get(key)
      if (!e?.bounds || !renderer) return null
      const c = [0, 1, 2].map((k) => (e.bounds!.min[k]! + e.bounds!.max[k]!) / 2)
      const m = matrices(CAMERA, renderer.width / renderer.height)
      const v = m.viewProj
      const clip = [0, 1, 3].map(
        (r) => v[r]! * c[0]! + v[4 + r]! * c[1]! + v[8 + r]! * c[2]! + v[12 + r]!,
      )
      return {
        x: ((clip[0]! / clip[2]! + 1) / 2) * viewport.clientWidth,
        y: ((1 - clip[1]! / clip[2]!) / 2) * viewport.clientHeight,
      }
    },
  }
  Object.assign(window, { __scene: api })
  return api
}
