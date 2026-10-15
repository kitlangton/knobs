// The Lab scene's GPU cost: renders frames back to back at a given viewport size and reports the
// median GPU time per pass (timestamp queries) and the wall time per frame.
// bun scripts/scene-perf.ts [--port=4012] [--width=2560] [--height=1440] [--frames=120] [--dpr=1]
//   [--full] [--query=look=lab] [--preset=Fog]
import { chromium } from "@playwright/test"

const arg = (name: string, fallback: number) =>
  Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]) || fallback
const port = arg("port", 4012)
const width = arg("width", 2560)
const height = arg("height", 1440)
const frames = arg("frames", 120)
const dpr = arg("dpr", 1)
const query = process.argv.find((a) => a.startsWith("--query="))?.slice(8) ?? ""

const browser = await chromium.launch({ args: ["--enable-gpu"] })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr })
page.on("pageerror", (e) => console.log("pageerror:", e.message))
await page.goto(`http://127.0.0.1:${port}/lab.html?paused${query ? `&${query}` : ""}`)
await page.waitForFunction(
  () => (window as any).__scene?.ready || (window as any).__scene?.failed,
  null,
  {
    timeout: 30_000,
  },
)
// --full gives the viewport most of the window, as a full-screen editor would; else the Lab's layout.
if (process.argv.includes("--full"))
  await page.evaluate(() => {
    const w = (window as any).__workspace
    w.main.collapse("left")
    w.main.collapse("right")
    w.center.collapse("dock")
  })
const preset = process.argv.find((a) => a.startsWith("--preset="))?.slice(9)
if (preset)
  await page.evaluate((p) => {
    const s = (window as any).__scene
    ;(window as any).__lab.details.set({ preset: p })
    // Past the preset's glide.
    for (let i = 0; i < 120; i++) (window as any).__live.tick(16.7)
    return s.stats.frames
  }, preset)
await page.waitForTimeout(800)
const result = await page.evaluate(async (n) => {
  const s = (window as any).__scene
  const device = s.renderer.device as GPUDevice
  const walls: number[] = []
  const gpu: number[][] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    s.render()
    await device.queue.onSubmittedWorkDone()
    walls.push(performance.now() - t0)
    // Timings resolve a frame behind.
    if (i > 5 && s.timing) gpu.push([...s.timing.passes, s.timing.total])
  }
  // Throughput: frames queued back to back, so the GPU never waits on the page.
  await device.queue.onSubmittedWorkDone()
  const t1 = performance.now()
  for (let i = 0; i < n; i++) s.render()
  await device.queue.onSubmittedWorkDone()
  const throughput = (performance.now() - t1) / n
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const min = (xs: number[]) => Math.min(...xs)
  return {
    size: `${s.renderer.width}×${s.renderer.height}`,
    throughput,
    wallMedian: med(walls),
    wallMin: min(walls),
    gpuMedian: gpu[0] ? gpu[0].map((_, k) => med(gpu.map((g) => g[k]!))) : null,
    gpuMin: gpu[0] ? gpu[0].map((_, k) => min(gpu.map((g) => g[k]!))) : null,
    stats: s.stats,
  }
}, frames)
const f = (xs: number[] | null) => xs?.map((x) => x.toFixed(2)).join(" / ")
console.log(`target ${result.size}`)
console.log(`queued frames: ${result.throughput.toFixed(2)} ms each`)
console.log(
  `wall per frame: median ${result.wallMedian.toFixed(2)} ms, min ${result.wallMin.toFixed(2)} ms`,
)
console.log(`GPU Scene / Rain & FX / Bloom / Post / total, median: ${f(result.gpuMedian)}`)
console.log(`GPU min: ${f(result.gpuMin)}`)
console.log(
  `drops ${result.stats.drops}, splashes ${result.stats.splashes}, sprites ${result.stats.sprites}`,
)
await browser.close()
