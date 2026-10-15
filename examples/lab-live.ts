// The Lab's Live dock: readouts fed by the fake viewport. A frame graph, live values, sparklines,
// budget meters, a pass table and an event log, in two knobs panels (DOM, or ?gpu for the overlay).
// ❚❚ in the top bar pauses the feed; paused, every readout sleeps.
// ?sparks=20 adds twenty more sparklines (the perf check).
import {
  type Controls,
  defineControls,
  graph,
  log,
  meter,
  type Schema,
  sparkline,
  table,
  watch,
} from "knobs"
import { mountPanel } from "knobs/panel"
import { labPreset } from "knobs/themes"

const params = new URLSearchParams(location.search)
const gpu = params.has("gpu")
const extra = Number(params.get("sparks")) || 0

const sparks = Object.fromEntries(
  Array.from({ length: extra }, (_, i) => [
    `spark${i}`,
    sparkline({ label: `Emitter ${i + 1}`, unit: "k", group: "emitters", groupLabel: "Emitters" }),
  ]),
)
export const live = defineControls(
  "lab-live",
  {
    frame: graph({
      label: "Frame time",
      series: [
        { id: "cpu", label: "CPU", area: true },
        { id: "gpu", label: "GPU" },
      ],
      unit: "ms",
      decimals: 1,
      min: 0,
      history: 150,
      height: 56,
      thresholds: [{ value: 16.7, label: "60 fps" }],
      group: "frame",
      groupLabel: "Frame",
    }),
    fps: watch({ label: "FPS", decimals: 0, group: "frame" }),
    drops: sparkline({ label: "Drops", decimals: 0, min: 0, group: "frame" }),
    particles: sparkline({ label: "Particles", unit: "k", decimals: 1, min: 0, group: "frame" }),
    status: watch({ label: "Weather", group: "frame" }),
    memory: meter({
      label: "GPU memory",
      max: 512,
      unit: "MB",
      decimals: 0,
      warn: 384,
      critical: 470,
      group: "budget",
      groupLabel: "Budget",
    }),
    draws: meter({
      label: "Draw calls",
      max: 2000,
      decimals: 0,
      segments: 10,
      warn: 1400,
      critical: 1800,
      group: "budget",
    }),
    stream: meter({ label: "Streaming", group: "budget" }),
    ...sparks,
  },
  { storage: null },
)
export const diag = defineControls(
  "lab-diag",
  {
    passes: table({
      label: "Passes",
      columns: ["Pass", "ms", "Draws"],
      decimals: 2,
      group: "render",
      groupLabel: "Render",
    }),
    events: log({ label: "Events", lines: 7, group: "events", groupLabel: "Events" }),
  },
  { storage: null },
)

const mount = <S extends Schema>(controls: Controls<S>, host: HTMLElement) =>
  mountPanel(controls, host, {
    title: false,
    header: false,
    preset: labPreset,
    theme: "dark",
    density: "compact",
    variants: false,
    haptics: false,
    session: false,
    renderer: gpu ? "gpu" : "dom",
  })

// The fake viewport: a frame's CPU and GPU time with noise and the odd spike, rain that thickens
// and thins, a streaming level that loads, and events now and then.
let running = !params.has("paused")
let t = 0
let last = 0
let spike = 0
let streamAt = 0
let nextEvent = 0
let nextTable = 0
const rnd = (() => {
  let s = 7
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
})()
const events: [number, "info" | "warn" | "error" | "debug", string][] = [
  [0.5, "info", "Rain sheet: 1428 drops"],
  [0.15, "debug", "Splash pool grew to 512"],
  [0.12, "warn", "Gutter drip over budget: 0.42 ms"],
  [0.08, "info", "Wetness ramp settled"],
  [0.06, "error", "Shadow atlas full: dropped 3 casters"],
  [0.09, "info", "Streetlamp retriggered"],
]
const pick = () => {
  let r = rnd()
  for (const e of events) if ((r -= e[0]) <= 0) return e
  return events[0]!
}
const step = (now: number) => {
  if (!running) {
    last = 0
    return
  }
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
  last = now
  t += dt
  if (rnd() < 0.004) spike = 1
  spike *= 0.9
  const cpu = 5.6 + Math.sin(t * 1.3) * 0.8 + rnd() * 0.9 + spike * 9
  const gpuMs = 8.4 + Math.sin(t * 0.7 + 1) * 1.6 + rnd() * 1.2 + spike * 5
  live.watch("frame", { cpu, gpu: gpuMs })
  live.watch("fps", 1000 / Math.max(16.67, cpu + gpuMs * 0.4))
  const drops = Math.round(1400 + Math.sin(t * 0.4) * 520 + rnd() * 40)
  live.watch("drops", drops)
  live.watch("particles", 18 + Math.sin(t * 0.9) * 6 + rnd())
  live.watch("status", drops > 1700 ? "Storm" : drops > 1100 ? "Rain" : "Drizzle")
  live.watch("memory", 300 + Math.sin(t * 0.21) * 140 + rnd() * 6)
  live.watch("draws", 1100 + Math.sin(t * 0.5) * 650)
  // Streaming: indeterminate while it looks for the level, then it loads.
  streamAt += dt
  const cycle = streamAt % 9
  live.watch("stream", cycle < 2 ? null : Math.min(1, (cycle - 2) / 5))
  for (let i = 0; i < extra; i++)
    live.watch(`spark${i}` as "drops", 10 + Math.sin(t * (0.5 + i * 0.07) + i) * 4 + rnd())
  if (t >= nextTable) {
    nextTable = t + 0.25
    diag.watch("passes", [
      ["Shadow", 0.42 + rnd() * 0.05, 12],
      ["Rain", 1.1 + Math.sin(t) * 0.3, Math.round(drops / 120)],
      ["Splashes", 0.38 + rnd() * 0.1, 4],
      ["Post", 0.61 + rnd() * 0.04, 3],
    ])
  }
  if (t >= nextEvent) {
    nextEvent = t + 0.6 + rnd() * 1.6
    const [, level, text] = pick()
    diag.watch("events", { level, text })
  }
}
const loop = (now: number) => {
  step(now)
  if (running) requestAnimationFrame(loop)
}

export function startLive(liveHost: HTMLElement, diagHost: HTMLElement) {
  const panels = [mount(live, liveHost), mount(diag, diagHost)]
  // A little history to start from.
  for (let i = 0; i < 40; i++)
    diag.watch("events", { level: "debug", text: `Warm-up frame ${i + 1}` })
  diag.watch("events", { level: "info", text: "Weather station ready" })
  if (running) requestAnimationFrame(loop)
  else step(0)
  return {
    panels,
    get running() {
      return running
    },
    pause(on = running) {
      if (on === !running) return
      running = !on
      if (running) requestAnimationFrame(loop)
    },
    /** One frame of the feed (for tests and shots while paused). */
    tick(ms = 16.7) {
      const was = running
      running = true
      step((last || performance.now()) + ms)
      running = was
    },
  }
}
