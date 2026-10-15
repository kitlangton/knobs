// The Lab's Live dock: readouts fed by the viewport's WebGPU scene (examples/lab-scene.ts). A frame
// graph, live values, sparklines, budget meters, a pass table and an event log, in two knobs panels
// (DOM, or ?gpu for the overlay). ❚❚ in the top bar pauses the scene and its feed; paused, every
// readout sleeps.
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
import { lookOptions } from "./lab-look"

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
      max: 100,
      decimals: 0,
      segments: 10,
      warn: 70,
      critical: 90,
      group: "budget",
    }),
    soak: meter({ label: "Surface soak", group: "budget" }),
    ...sparks,
  },
  // On by default only on localhost: the Lab is also opened over the tailnet.
  { storage: null, enabled: true },
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
  // On by default only on localhost: the Lab is also opened over the tailnet.
  { storage: null, enabled: true },
)

const mount = <S extends Schema>(controls: Controls<S>, host: HTMLElement) =>
  mountPanel(controls, host, {
    title: false,
    header: false,
    ...lookOptions(),
    variants: false,
    haptics: false,
    session: false,
    renderer: gpu ? "gpu" : "dom",
  })

/** One rendered frame, as the readouts show it. */
export interface LiveSample {
  /** ms of script per frame. */
  cpu: number
  /** ms on the GPU (timestamp queries), or null where the adapter can't time passes. */
  gpu: number | null
  fps: number
  drops: number
  /** Thousands. */
  particles: number
  status: string
  /** MB. */
  memory: number
  draws: number
  /** 0…1, or null while there's no scene yet. */
  soak: number | null
  /** Name, ms (or "—" untimed), draws. */
  passes: [string, number | string, number][]
}
/** What runs the feed: the scene's frame loop. */
export interface LiveDriver {
  start(): void
  stop(): void
  /** One frame of `ms`, now (for tests and shots while paused). */
  tick(ms: number): void
}

let running = !params.has("paused")
let driver: LiveDriver | null = null
let nextTable = 0

export function startLive(liveHost: HTMLElement, diagHost: HTMLElement) {
  const panels = [mount(live, liveHost), mount(diag, diagHost)]
  return {
    panels,
    live,
    diag,
    get running() {
      return running
    },
    pause(on = running) {
      if (on === !running) return
      running = !on
      if (running) driver?.start()
      else driver?.stop()
    },
    /** One frame of the feed (for tests and shots while paused). */
    tick(ms = 16.7) {
      driver?.tick(ms)
    },
    /** The scene takes over the clock; it starts if the feed is running. */
    attach(next: LiveDriver) {
      driver = next
      if (running) next.start()
    },
    report(s: LiveSample, now = performance.now()) {
      live.watch("frame", s.gpu === null ? { cpu: s.cpu } : { cpu: s.cpu, gpu: s.gpu })
      live.watch("fps", s.fps)
      live.watch("drops", s.drops)
      live.watch("particles", s.particles)
      live.watch("status", s.status)
      live.watch("memory", s.memory)
      live.watch("draws", s.draws)
      live.watch("soak", s.soak)
      for (let i = 0; i < extra; i++) live.watch(`spark${i}` as "drops", s.particles)
      if (now >= nextTable) {
        nextTable = now + 250
        diag.watch("passes", s.passes)
      }
    },
    event(level: "info" | "warn" | "error" | "debug", text: string) {
      diag.watch("events", { level, text })
    },
  }
}
export type LiveFeed = ReturnType<typeof startLive>
