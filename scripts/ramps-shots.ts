// Proof shots for gradients and curves (examples/ramps.html): DOM and GPU sheets of the collapsed
// rows and open editors under labPreset and the default theme, and frame sheets of a stop drag, a
// curve preset morph and a gradient preset glide in both renderers. The page's clock and its CSS
// motion run SLOW times slower while filming, so headless screenshots keep up with the springs.
// BASE=http://127.0.0.1:4005 OUT=dir bun scripts/ramps-shots.ts   (ONLY=static,drag,… SLOW=20)
import { type Browser, chromium, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const out = process.env.OUT ?? "/tmp/ramps"
const prefix = process.env.PREFIX ?? "2026-10-15-knobs-ramps"
const only = process.env.ONLY?.split(",")
const slow = Number(process.env.SLOW) || 20
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }
type Shot = { t: number; png: Buffer }
const MODES = ["dom", "gpu"] as const

async function open(gpu: boolean) {
  const page = await browser.newPage({
    viewport: { width: 760, height: 1000 },
    deviceScaleFactor: 2,
  })
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  await page.addInitScript(() => {
    const real = performance.now.bind(performance)
    let rate = 1
    let from = 0
    let at = 0
    const now = () => at + (real() - from) * rate
    ;(window as any).__slow = (s: number) => {
      at = now()
      from = real()
      rate = 1 / s
    }
    performance.now = now
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf(() => cb(now()))
  })
  await page.goto(`${base}/ramps.html${gpu ? "?gpu" : ""}`)
  await sleep(1200)
  if (gpu && (await page.locator('#lab [data-gpu-active="true"]').count()) === 0)
    errors.push("the GPU overlay didn't start")
  return page
}
const expand = async (page: Page, names: string[]) => {
  for (const name of names) await page.getByRole("button", { name, exact: true }).click()
  await sleep(900)
}
const regionOf = async (page: Page, selector: string): Promise<Region> => {
  const b = (await page.locator(selector).boundingBox())!
  return { x: b.x - 4, y: b.y - 4, width: b.width + 8, height: b.height + 8 }
}

async function film(page: Page, region: Region, ms: number, act: () => Promise<void>, n = 8) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
  const shots: Shot[] = []
  const start = Date.now()
  const acting = act()
  while (Date.now() - start < ms * slow) {
    const from = Date.now() - start
    const png = await page.screenshot({ clip: region })
    shots.push({ t: (from + Date.now() - start) / 2, png })
  }
  await acting
  await page.evaluate(() => (window as any).__slow(1))
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  // Evenly spaced in time, each the nearest shot taken.
  const last = shots.at(-1)!.t
  const pick = Array.from({ length: n }, (_, i) => {
    const want = (i * last) / (n - 1)
    return shots.reduce(
      (best, s, j) => (Math.abs(s.t - want) < Math.abs(shots[best]!.t - want) ? j : best),
      0,
    )
  })
  return [...new Set(pick)].map((i) => ({ t: shots[i]!.t / slow, png: shots[i]!.png }))
}

async function sheet(
  title: string,
  note: string,
  rows: { label: string; shots: Shot[]; caption?: (s: Shot) => string }[],
  path: string,
  width = 300,
  perRow = 8,
) {
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:12px -apple-system,system-ui;padding:16px">
    <div style="font-size:15px;color:#eee;margin-bottom:4px">${title}</div>
    <div style="margin-bottom:10px;max-width:${perRow * (width + 6)}px">${note}</div>
    ${rows
      .map(
        (r) => `<div style="color:#ddd;margin:10px 0 6px">${r.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start">${r.shots
        .map(
          (s) =>
            `<figure style="margin:0"><img style="display:block;width:${width}px" src="data:image/png;base64,${s.png.toString("base64")}"><figcaption>${r.caption ? r.caption(s) : `${s.t.toFixed(0)} ms`}</figcaption></figure>`,
        )
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5 })
  await p.setViewportSize({ width: perRow * (width + 6) + 32, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

if (want("static")) {
  for (const [state, names] of [
    ["collapsed", []],
    ["expanded", ["Smoke over life", "Light falloff", "Sky by hour", "Response"]],
  ] as const) {
    const rows: { label: string; shots: Shot[]; caption: (s: Shot) => string }[] = []
    for (const panel of ["lab", "default"] as const) {
      const shots: Shot[] = []
      for (const mode of MODES) {
        const page = await open(mode === "gpu")
        await expand(page, [...names])
        if (state === "expanded" && panel === "lab") {
          // The crosshair, under a resting pointer.
          const g = (await page
            .locator('#lab .knobs-graph[aria-label="Light falloff points"]')
            .boundingBox())!
          await page.mouse.move(g.x + g.width * 0.3, g.y + g.height * 0.45)
          await sleep(500)
        }
        const png = await page.screenshot({ clip: await regionOf(page, `#${panel} .knobs-panel`) })
        shots.push({ t: mode === "dom" ? 0 : 1, png })
        await page.close()
      }
      rows.push({
        label:
          panel === "lab"
            ? "labPreset (square, flat, compact)"
            : "Default theme (remote descriptors)",
        shots,
        caption: (s) => (s.t === 0 ? "DOM" : "WebGPU overlay"),
      })
    }
    await sheet(
      `Gradients and curves, ${state}: DOM beside the GPU overlay`,
      state === "collapsed"
        ? "Each row: its label, then a gradient's swatch strip with stop ticks, or a curve's preset name and mini curve."
        : "Open: a gradient's strip with a pin per stop (the selected one full size), the stop's colour strips and presets; a curve's graph with its grid, points (the selected one filled), the hover crosshair and its readout, and the shape chips.",
      rows,
      `${out}/${prefix}-${state}.png`,
      420,
      2,
    )
  }
}

if (want("drag")) {
  const rows = []
  for (const mode of MODES) {
    const page = await open(mode === "gpu")
    await expand(page, ["Smoke over life"])
    const strip = page.getByRole("slider", { name: "Smoke over life stops" })
    const b = (await strip.boundingBox())!
    const xAt = (t: number) => b.x + b.height / 2 + (b.width - b.height) * t
    const y = b.y + b.height / 2
    const region = { x: b.x - 10, y: b.y - 60, width: b.width + 20, height: 230 }
    const shots = await film(
      page,
      region,
      900,
      async () => {
        // The orange stop past its neighbour, then down off the strip and back.
        // Paced in page time, so the slowed clock sees a hand-speed drag.
        let at = [xAt(0.12), y]
        const glide = async (x: number, to: number, ms: number) => {
          const [x0, y0] = at as [number, number]
          const n = Math.max(2, Math.round(ms / 30))
          for (let i = 1; i <= n; i++) {
            await page.mouse.move(x0 + ((x - x0) * i) / n, y0 + ((to - y0) * i) / n)
            await sleep(30 * slow)
          }
          at = [x, to]
        }
        await page.mouse.move(at[0]!, at[1]!)
        await page.mouse.down()
        await sleep(60 * slow)
        await glide(xAt(0.45), y, 240)
        await glide(xAt(0.45), y + 70, 150)
        await sleep(90 * slow)
        await glide(xAt(0.5), y, 150)
        await page.mouse.up()
      },
      8,
    )
    rows.push({ label: mode === "dom" ? "DOM" : "WebGPU overlay", shots })
    await page.close()
  }
  await sheet(
    "Gradient: dragging a stop",
    "The orange stop is dragged right past its neighbour (it keeps its selection; the strip and the head's swatch follow at once), pulled down off the strip (it dims: let go there and it goes), then brought back.",
    rows,
    `${out}/${prefix}-drag.png`,
    420,
    4,
  )
}

if (want("morph")) {
  const rows = []
  for (const mode of MODES) {
    const page = await open(mode === "gpu")
    await expand(page, ["Light falloff"])
    const region = await regionOf(page, '#lab .knobs-graph[aria-label="Light falloff points"]')
    region.y -= 30
    region.height += 30
    const shots = await film(page, region, 240, () =>
      page.locator("#lab").getByRole("radio", { name: "bell" }).click(),
    )
    rows.push({ label: mode === "dom" ? "DOM" : "WebGPU overlay", shots })
    await page.close()
  }
  await sheet(
    "Curve: a preset morphs",
    "inverse² to bell: both curves are sampled at the same 129 x's and the samples blend on the panel's spring (the DOM's path transition, the GPU's morph), so the curve bends into its new shape; the points glide to theirs.",
    rows,
    `${out}/${prefix}-morph.png`,
    300,
    8,
  )
}

if (want("glide")) {
  const rows = []
  for (const mode of MODES) {
    const page = await open(mode === "gpu")
    await expand(page, ["Sky by hour"])
    const region = await regionOf(page, '#default .knobs-grad[aria-label="Sky by hour stops"]')
    region.y -= 40
    region.height += 40
    const shots = await film(page, region, 240, () =>
      page.locator("#default").getByRole("radio", { name: "Alien" }).click(),
    )
    rows.push({ label: mode === "dom" ? "DOM" : "WebGPU overlay", shots })
    await page.close()
  }
  await sheet(
    "Gradient: a preset glides",
    "Clear (nine stops) to Alien (five): the strip's 64 samples blend on the panel's spring, the first five pins glide to their new places and colours, and the four left over go.",
    rows,
    `${out}/${prefix}-glide.png`,
    300,
    8,
  )
}

await browser.close()
if (errors.length) {
  console.error(errors.join("\n"))
  process.exit(1)
}
console.log("done", out)
