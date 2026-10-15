// Times batch value changes on a tune-like page (examples/presets-bench.html): page presets,
// card presets, Native and reset-all, by click and by key, in the DOM and GPU renderers. Each
// switch gets a 1.1 s window of a Chrome trace; per switch it reports main-thread task time,
// style recalc, layout, layerize and paint (sums over the window), the input handler's time,
// and how many style recalcs and layouts script forced. Medians over the rounds.
//
//   bun scripts/perf-presets.ts [--port=5310] [--renderer=dom,gpu] [--rounds=8] [--out=perf/x.json]
//     [--url=http://127.0.0.1:5178]   reuse a running example server instead of starting one
//     [--trace=dir]                   keep the raw traces
//     [--profile]                     add the JS sampler to the trace (stacks for forced styles)
//     [--invalidations]               add style invalidation tracking (what dirtied each recalc)
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const arg = (name: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=")
const flag = (name: string) => process.argv.includes(`--${name}`)
const port = Number(arg("port")) || 5310
const rounds = Number(arg("rounds")) || 8
const renderers = (arg("renderer") ?? "dom,gpu").split(",") as ("dom" | "gpu")[]
const out = arg("out")
const traceDir = arg("trace")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const WINDOW_MS = 1100

interface Switch {
  name: string
  /** Runs before the window opens (focus, closing menus). */
  prepare?(page: Page): Promise<void>
  act(page: Page): Promise<void>
}
const presetChip = (page: Page, name: string) =>
  page.locator(".knobs-presets").getByRole("radio", { name, exact: true })
/** Focuses the first slider of a card, so its digits and the page's keys reach it. */
const focusCard = (page: Page, group: string) =>
  page.evaluate((g) => {
    const head = document.querySelector<HTMLElement>(`.knobs-group-head[data-group="${g}"]`)
    const tile = head?.closest(".knobs-tile")
    tile?.querySelector<HTMLElement>(".knobs-track, .knobs-seg, .knobs-toggle")?.focus({
      preventScroll: true,
    })
  }, group)
const cardPreset = (page: Page, group: string, label: string) =>
  page
    .locator(`.knobs-group-head[data-group="${group}"]`)
    .getByRole("radio", { name: label, exact: true })

// In order, each one a real change from the state the one before left.
const SWITCHES: Switch[] = [
  { name: "Lively (click)", act: (p) => presetChip(p, "Lively").click() },
  // The tune page's order: rows stay modified, so only their values move.
  { name: "Lively → Compact", act: (p) => presetChip(p, "Compact").click() },
  { name: "Compact → Lively", act: (p) => presetChip(p, "Lively").click() },
  {
    name: "Reset all (key R)",
    prepare: (p) => focusCard(p, "Rows"),
    act: (p) => p.keyboard.press("Shift+R"),
  },
  { name: "Compact (click)", act: (p) => presetChip(p, "Compact").click() },
  { name: "Native (click)", act: (p) => presetChip(p, "Native").click() },
  { name: "Card Snappy (click)", act: (p) => cardPreset(p, "Rows", "2 Snappy").click() },
  {
    name: "Card Gentle (key 3)",
    prepare: (p) => focusCard(p, "Arrivals"),
    act: (p) => p.keyboard.press("3"),
  },
  {
    name: "Prev preset (key [)",
    prepare: (p) => focusCard(p, "Rows"),
    act: (p) => p.keyboard.press("["),
  },
]

type Ev = {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: any
}
export interface SwitchMetrics {
  taskMs: number
  longestTaskMs: number
  /** The input events' handlers (pointer, click and key). */
  handlerMs: number
  /** The tasks those ran in, with whatever else ran in them (the switch itself). */
  inputTaskMs: number
  /** The longest task after them: the glide's worst frame. */
  frameMaxMs: number
  scriptMs: number
  styleMs: number
  styleCount: number
  styleElements: number
  layoutMs: number
  layerizeMs: number
  paintMs: number
  forcedStyles: number
  forcedLayouts: number
  frames: number
}

/** Main-thread metrics for each window that starts at a `perf:<name>` user-timing mark. */
export function analyse(events: Ev[], windowMs = WINDOW_MS) {
  const threads = events.filter((e) => e.ph === "M" && e.name === "thread_name")
  const marks = events.filter(
    (e) => e.cat.includes("blink.user_timing") && e.name.startsWith("perf:"),
  )
  if (!marks.length) throw new Error("No perf marks in the trace")
  const markPid = marks[0]!.pid
  const main = threads.find((t) => t.pid === markPid && t.args?.name === "CrRendererMain")
  if (!main) throw new Error("No renderer main thread")
  const th = events
    .filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === "X")
    .sort((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0))
  // Each event's enclosing events, to tell forced work (inside script) from the frame's own.
  const parents = new Map<Ev, Ev[]>()
  const stack: Ev[] = []
  for (const e of th) {
    while (stack.length && stack.at(-1)!.ts + (stack.at(-1)!.dur ?? 0) <= e.ts) stack.pop()
    parents.set(e, [...stack])
    stack.push(e)
  }
  const SCRIPT = new Set([
    "FunctionCall",
    "EventDispatch",
    "FireAnimationFrame",
    "TimerFire",
    "EvaluateScript",
    "v8.callFunction",
  ])
  const TASK = new Set(["RunTask", "ThreadControllerImpl::RunTask"])
  const INPUT = new Set(["pointerdown", "pointerup", "click", "keydown", "keyup"])
  const results: { name: string; metrics: SwitchMetrics }[] = []
  for (const mark of marks.sort((a, b) => a.ts - b.ts)) {
    const from = mark.ts
    const to = from + windowMs * 1000
    const inWin = th.filter((e) => e.ts >= from && e.ts < to)
    const top = (names: Set<string> | string) => {
      const set = typeof names === "string" ? new Set([names]) : names
      return inWin.filter((e) => set.has(e.name) && !parents.get(e)!.some((p) => set.has(p.name)))
    }
    const sum = (list: Ev[]) => list.reduce((s, e) => s + (e.dur ?? 0), 0) / 1000
    const tasks = top(TASK)
    const styles = top("UpdateLayoutTree")
    const layouts = top("Layout")
    const forced = (list: Ev[]) =>
      list.filter((e) => parents.get(e)!.some((p) => SCRIPT.has(p.name))).length
    const inputs = top("EventDispatch").filter((e) => INPUT.has(e.args?.data?.type))
    const inputTasks = tasks.filter((t) =>
      inputs.some((e) => e.ts >= t.ts && e.ts <= t.ts + (t.dur ?? 0)),
    )
    results.push({
      name: mark.name.slice(5),
      metrics: {
        taskMs: sum(tasks),
        longestTaskMs: Math.max(0, ...tasks.map((t) => (t.dur ?? 0) / 1000)),
        handlerMs: sum(inputs),
        inputTaskMs: sum(inputTasks),
        frameMaxMs: Math.max(
          0,
          ...tasks.filter((t) => !inputTasks.includes(t)).map((t) => (t.dur ?? 0) / 1000),
        ),
        scriptMs: sum(top(SCRIPT)),
        styleMs: sum(styles),
        styleCount: styles.length,
        styleElements: styles.reduce((s, e) => s + (e.args?.elementCount ?? 0), 0),
        layoutMs: sum(layouts),
        layerizeMs: sum(top("Layerize")),
        paintMs: sum(top("Paint")),
        forcedStyles: forced(styles),
        forcedLayouts: forced(layouts),
        frames: inWin.filter((e) => e.name === "Layerize").length,
      },
    })
  }
  return results
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

async function startServer() {
  const given = arg("url")
  if (given) return { url: given, stop: () => {} }
  // Vite itself (not through bunx), so stopping it stops the server this started.
  const server = spawn("node_modules/.bin/vite", ["--config", "examples/vite.config.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  })
  const url = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/presets-bench.html`)).ok) break
    } catch {}
    await sleep(200)
  }
  return { url, stop: () => server.kill() }
}

const server = await startServer()
const report: Record<string, Record<string, SwitchMetrics & { n: number }>> = {}
const samples: Record<string, Record<string, SwitchMetrics[]>> = {}
try {
  const browser = await chromium.launch({ args: ["--enable-gpu", "--enable-unsafe-webgpu"] })
  for (const renderer of renderers) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${server.url}/presets-bench.html?renderer=${renderer}`)
    await page.locator(".knobs-page").waitFor()
    // Vite's first load compiles modules; settle before measuring.
    await sleep(1500)
    if (renderer === "gpu") {
      const active = await page.evaluate(() => Boolean((window as any).__knobsGpu))
      if (!active) console.warn("GPU renderer did not start; timings are the DOM's")
    }
    const run = async (s: Switch, mark: boolean) => {
      await s.prepare?.(page)
      await sleep(150)
      if (mark) await page.evaluate((n) => performance.mark(`perf:${n}`), s.name)
      await s.act(page)
      await sleep(WINDOW_MS + 100)
    }
    // Warm up: each switch once, untraced.
    for (const s of SWITCHES) await run(s, false)
    await browser.startTracing(page, {
      categories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "toplevel",
        "blink.user_timing",
        "v8.execute",
        ...(flag("profile") ? ["disabled-by-default-v8.cpu_profiler"] : []),
        ...(flag("invalidations")
          ? ["disabled-by-default-devtools.timeline.invalidationTracking"]
          : []),
      ],
    })
    for (let r = 0; r < rounds; r++) for (const s of SWITCHES) await run(s, true)
    const buffer = await browser.stopTracing()
    if (traceDir) {
      mkdirSync(traceDir, { recursive: true })
      writeFileSync(`${traceDir}/presets-${renderer}.trace.json`, buffer)
    }
    const parsed = JSON.parse(buffer.toString())
    const events: Ev[] = Array.isArray(parsed) ? parsed : parsed.traceEvents
    const windows = analyse(events)
    const byName = new Map<string, SwitchMetrics[]>()
    for (const w of windows) byName.set(w.name, [...(byName.get(w.name) ?? []), w.metrics])
    report[renderer] = {}
    samples[renderer] = Object.fromEntries(byName)
    for (const [name, list] of byName) {
      const keys = Object.keys(list[0]!) as (keyof SwitchMetrics)[]
      report[renderer][name] = {
        n: list.length,
        ...(Object.fromEntries(
          keys.map((k) => [k, median(list.map((m) => m[k]))]),
        ) as unknown as SwitchMetrics),
      }
    }
    await context.close()
  }
  await browser.close()
} finally {
  server.stop()
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
for (const [renderer, rows] of Object.entries(report)) {
  console.log(
    `\n${renderer.toUpperCase()}  (medians over ${rounds} rounds, ${WINDOW_MS} ms windows)`,
  )
  const cols: (keyof SwitchMetrics)[] = [
    "taskMs",
    "longestTaskMs",
    "handlerMs",
    "inputTaskMs",
    "frameMaxMs",
    "styleMs",
    "layoutMs",
    "layerizeMs",
    "paintMs",
    "forcedStyles",
    "forcedLayouts",
    "styleElements",
    "frames",
  ]
  console.log(
    ["switch".padEnd(22), ...cols.map((c) => c.replace(/Ms$/, "").slice(0, 9).padStart(9))].join(
      " ",
    ),
  )
  for (const [name, m] of Object.entries(rows))
    console.log([name.padEnd(22), ...cols.map((c) => fmt(m[c]).padStart(9))].join(" "))
}
if (out) {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(
    out,
    `${JSON.stringify({ at: new Date().toISOString(), rounds, report, samples }, null, 2)}\n`,
  )
}
