// Comprehensive, repeatable performance benchmark for knobs (DOM & WebGPU modes, 1x & 4x CPU throttle).
import { chromium, type Browser, type CDPSession, type Page } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"

const DEFAULT_PORT = 4540
const FALLBACK_PORT = 5194
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface BenchMetrics {
  scenario: string
  mode: "dom" | "gpu"
  throttle: number
  wallMs: number
  frames: number
  p50FrameMs: number
  p95FrameMs: number
  maxFrameMs: number
  longTasks: number
  longTaskMs: number
  taskMs: number
  scriptMs: number
  styleMs: number
  layoutMs: number
  styleCount: number
  layoutCount: number
  heapDeltaKB: number
  bcrCalls: number
  gcsCalls: number
  matchesCalls: number
  getAnimCalls: number
  atlasRasters: number
  domMutations: number
  gpuFrames: number
  gpuTickTotalMs: number
  gpuTickP50Ms: number
  gpuTickP95Ms: number
  gpuTickMaxMs: number
  gpuUploadBytes: number
  gpuWriteBuffers: number
}

export interface LatencyMetrics {
  mode: "dom" | "gpu"
  throttle: number
  dragInputToDomMs: number
  dragInputToPaintMs: number
  dragFillTrackingLagRatio: number
  keyInputToDomMs: number
  keyInputToPaintMs: number
  presetCascadeSettleMs: number
  dieRollSettleMs: number
}

declare global {
  interface Window {
    __perfStart?: () => void
    __perfStop?: () => {
      frameDeltas: number[]
      longTasks: number
      longTaskMs: number
      bcrCalls: number
      gcsCalls: number
      matchesCalls: number
      getAnimCalls: number
      atlasRasters: number
      domMutations: number
      gpuTickTimes: number[]
      gpuUploadBytes: number
      gpuWriteBuffers: number
      gpuFrames: number
    }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))
  return sorted[idx]!
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// --port=N runs its own server there instead of reusing the live preview on 4540.
const OWN_PORT = Number(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]) || 0

async function ensureServer(): Promise<{ baseUrl: string; server?: ChildProcess }> {
  if (!OWN_PORT)
    try {
      const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/`)
      if (res.ok) return { baseUrl: `http://127.0.0.1:${DEFAULT_PORT}` }
    } catch {}
  const port = OWN_PORT || FALLBACK_PORT
  const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore",
  })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) {
        return { baseUrl: `http://127.0.0.1:${port}`, server }
      }
    } catch {}
    await sleep(150)
  }
  throw new Error("Failed to start Vite server")
}

async function installInstrumentation(page: Page) {
  await page.addInitScript(() => {
    let active = false
    let frameDeltas: number[] = []
    let lastFrameTime = 0
    let rafLoopId = 0
    let longTasks = 0
    let longTaskMs = 0
    let bcrCalls = 0
    let gcsCalls = 0
    let matchesCalls = 0
    let getAnimCalls = 0
    let atlasRasters = 0
    let domMutations = 0
    let gpuTickTimes: number[] = []
    let gpuUploadBytes = 0
    let gpuWriteBuffers = 0
    let gpuFramesStart = 0

    try {
      const po = new PerformanceObserver((list) => {
        if (!active) return
        for (const entry of list.getEntries()) {
          longTasks++
          longTaskMs += entry.duration
        }
      })
      po.observe({ entryTypes: ["longtask"] })
    } catch {}

    const mo = new MutationObserver((records) => {
      if (!active) return
      domMutations += records.length
    })
    window.addEventListener("DOMContentLoaded", () => {
      mo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
    })

    const origBCR = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      if (active) bcrCalls++
      return origBCR.call(this)
    }

    const origGCS = window.getComputedStyle
    window.getComputedStyle = function (el: Element, pseudo?: string | null) {
      if (active) gcsCalls++
      return origGCS.call(window, el, pseudo)
    }

    const origMatches = Element.prototype.matches
    Element.prototype.matches = function (selectors: string) {
      if (active) matchesCalls++
      return origMatches.call(this, selectors)
    }

    if (Element.prototype.getAnimations) {
      const origGetAnim = Element.prototype.getAnimations
      Element.prototype.getAnimations = function (opts?: GetAnimationsOptions) {
        if (active) getAnimCalls++
        return origGetAnim.call(this, opts)
      }
    }

    const origFillText = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (
      text: string,
      x: number,
      y: number,
      maxWidth?: number,
    ) {
      if (active && this.canvas?.width === 2048) atlasRasters++
      return maxWidth !== undefined
        ? origFillText.call(this, text, x, y, maxWidth)
        : origFillText.call(this, text, x, y)
    }

    const nav = navigator as any
    if (nav.gpu?.requestAdapter) {
      const origReqAdapter = nav.gpu.requestAdapter.bind(nav.gpu)
      nav.gpu.requestAdapter = async function (...args: any[]) {
        const adapter = await origReqAdapter(...args)
        if (!adapter) return adapter
        const origReqDevice = adapter.requestDevice.bind(adapter)
        adapter.requestDevice = async function (...dArgs: any[]) {
          const device = await origReqDevice(...dArgs)
          if (device?.queue?.writeBuffer) {
            const origWB = device.queue.writeBuffer.bind(device.queue)
            device.queue.writeBuffer = function (
              buffer: any,
              bufferOffset: number,
              data: any,
              dataOffset?: number,
              size?: number,
            ) {
              if (active) {
                gpuWriteBuffers++
                const bytes =
                  typeof size === "number"
                    ? size
                    : typeof data?.byteLength === "number"
                      ? data.byteLength
                      : 0
                gpuUploadBytes += bytes
              }
              return origWB(buffer, bufferOffset, data, dataOffset, size)
            }
          }
          return device
        }
        return adapter
      }
    }

    const origRAF = window.requestAnimationFrame.bind(window)
    const origCAF = window.cancelAnimationFrame.bind(window)
    let nextRafId = 1
    const rafQueue = new Map<number, FrameRequestCallback>()
    let rafScheduled = false
    let lastVsync = performance.now()

    function flushRaf(now: number) {
      rafScheduled = false
      const dtVsync = now - lastVsync
      if (active && lastFrameTime > 0) {
        frameDeltas.push(now - lastFrameTime)
      }
      lastFrameTime = now
      lastVsync = now
      const batch = [...rafQueue.entries()]
      rafQueue.clear()
      for (const [, cb] of batch) {
        if (!active) {
          try {
            cb(now)
          } catch {}
          continue
        }
        const gBefore = window.__knobsGpu?.frameCount ?? 0
        const sBefore = window.__knobsGpu?.skippedFrames ?? 0
        const t0 = performance.now()
        try {
          cb(now)
        } finally {
          const dt = performance.now() - t0
          const gAfter = window.__knobsGpu?.frameCount ?? 0
          const sAfter = window.__knobsGpu?.skippedFrames ?? 0
          if (gAfter > gBefore || sAfter > sBefore) {
            gpuTickTimes.push(dt)
          }
        }
      }
      void dtVsync
    }

    function scheduleVsync() {
      if (rafScheduled || rafQueue.size === 0) return
      rafScheduled = true
      const wait = Math.max(0, 16 - (performance.now() - lastVsync))
      if (wait > 1) {
        setTimeout(() => origRAF(flushRaf), wait)
      } else {
        origRAF(flushRaf)
      }
    }

    window.requestAnimationFrame = function (cb: FrameRequestCallback): number {
      const id = nextRafId++
      rafQueue.set(id, cb)
      scheduleVsync()
      return id
    }
    window.cancelAnimationFrame = function (id: number) {
      rafQueue.delete(id)
      origCAF(id)
    }

    function meterLoop() {
      if (!active) return
      rafLoopId = window.requestAnimationFrame(meterLoop)
    }

    window.__perfStart = () => {
      frameDeltas = []
      lastFrameTime = 0
      longTasks = 0
      longTaskMs = 0
      bcrCalls = 0
      gcsCalls = 0
      matchesCalls = 0
      getAnimCalls = 0
      atlasRasters = 0
      domMutations = 0
      gpuTickTimes = []
      gpuUploadBytes = 0
      gpuWriteBuffers = 0
      gpuFramesStart = window.__knobsGpu?.frameCount ?? 0
      active = true
      rafLoopId = window.requestAnimationFrame(meterLoop)
    }

    window.__perfStop = () => {
      active = false
      if (rafLoopId) cancelAnimationFrame(rafLoopId)
      rafLoopId = 0
      const gpuFramesEnd = window.__knobsGpu?.frameCount ?? 0
      return {
        frameDeltas,
        longTasks,
        longTaskMs,
        bcrCalls,
        gcsCalls,
        matchesCalls,
        getAnimCalls,
        atlasRasters,
        domMutations,
        gpuTickTimes,
        gpuUploadBytes,
        gpuWriteBuffers,
        gpuFrames: Math.max(0, gpuFramesEnd - gpuFramesStart),
      }
    }
  })
}

function cdpMap(metrics: { name: string; value: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of metrics) out[m.name] = m.value
  return out
}

async function measureScenario(
  page: Page,
  cdp: CDPSession,
  scenario: string,
  mode: "dom" | "gpu",
  throttle: number,
  fn: () => Promise<void>,
): Promise<BenchMetrics> {
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  const beforeCdp = cdpMap((await cdp.send("Performance.getMetrics")).metrics)
  await page.evaluate(() => window.__perfStart!())
  const t0 = performance.now()
  try {
    await fn()
  } finally {
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  }
  const wallMs = performance.now() - t0
  const inPage = await page.evaluate(() => window.__perfStop!())
  const afterCdp = cdpMap((await cdp.send("Performance.getMetrics")).metrics)

  const sortedFrames = [...inPage.frameDeltas].sort((a, b) => a - b)
  const sortedGpu = [...inPage.gpuTickTimes].sort((a, b) => a - b)
  const gpuTickTotalMs = inPage.gpuTickTimes.reduce((a, b) => a + b, 0)

  return {
    scenario,
    mode,
    throttle,
    wallMs: +wallMs.toFixed(1),
    frames: sortedFrames.length,
    p50FrameMs: +percentile(sortedFrames, 0.5).toFixed(2),
    p95FrameMs: +percentile(sortedFrames, 0.95).toFixed(2),
    maxFrameMs: +(sortedFrames.at(-1) ?? 0).toFixed(2),
    longTasks: inPage.longTasks,
    longTaskMs: +inPage.longTaskMs.toFixed(1),
    taskMs: +(((afterCdp.TaskDuration ?? 0) - (beforeCdp.TaskDuration ?? 0)) * 1000).toFixed(1),
    scriptMs: +(((afterCdp.ScriptDuration ?? 0) - (beforeCdp.ScriptDuration ?? 0)) * 1000).toFixed(
      1,
    ),
    styleMs: +(
      ((afterCdp.RecalcStyleDuration ?? 0) - (beforeCdp.RecalcStyleDuration ?? 0)) *
      1000
    ).toFixed(1),
    layoutMs: +(((afterCdp.LayoutDuration ?? 0) - (beforeCdp.LayoutDuration ?? 0)) * 1000).toFixed(
      1,
    ),
    styleCount: (afterCdp.RecalcStyleCount ?? 0) - (beforeCdp.RecalcStyleCount ?? 0),
    layoutCount: (afterCdp.LayoutCount ?? 0) - (beforeCdp.LayoutCount ?? 0),
    heapDeltaKB: Math.round(
      ((afterCdp.JSHeapUsedSize ?? 0) - (beforeCdp.JSHeapUsedSize ?? 0)) / 1024,
    ),
    bcrCalls: inPage.bcrCalls,
    gcsCalls: inPage.gcsCalls,
    matchesCalls: inPage.matchesCalls,
    getAnimCalls: inPage.getAnimCalls,
    atlasRasters: inPage.atlasRasters,
    domMutations: inPage.domMutations,
    gpuFrames: inPage.gpuFrames,
    gpuTickTotalMs: +gpuTickTotalMs.toFixed(2),
    gpuTickP50Ms: +percentile(sortedGpu, 0.5).toFixed(2),
    gpuTickP95Ms: +percentile(sortedGpu, 0.95).toFixed(2),
    gpuTickMaxMs: +(sortedGpu.at(-1) ?? 0).toFixed(2),
    gpuUploadBytes: inPage.gpuUploadBytes,
    gpuWriteBuffers: inPage.gpuWriteBuffers,
  }
}

async function measureLatency(
  page: Page,
  cdp: CDPSession,
  baseUrl: string,
  mode: "dom" | "gpu",
  throttle: number,
): Promise<LatencyMetrics> {
  const q = mode === "gpu" ? "?gpu" : "?dom"
  await page.goto(`${baseUrl}/${q}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const sb = (await study.boundingBox())!
  await study.hover({ position: { x: sb.width - 20, y: 60 } })
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.waitFor()
  await sleep(180)
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  let res: Omit<LatencyMetrics, "mode" | "throttle">
  try {
    res = await page.evaluate(async () => {
      const sleepRaf = () => new Promise<number>((r) => requestAnimationFrame(r))
      const panelEl = document.querySelector<HTMLElement>('[aria-label="splat controls"]')!
      const countRow = panelEl.querySelector<HTMLElement>('[data-field="count"]')!
      const track = countRow.querySelector<HTMLElement>(".knobs-track")!
      const fill = countRow.querySelector<HTMLElement>(".knobs-fill")!
      const rect = track.getBoundingClientRect()
      const cy = rect.top + rect.height * 0.5

      // 1. Measure pointer drag latency & 1:1 tracking lag
      const dragDomTimes: number[] = []
      const dragPaintTimes: number[] = []
      let maxTrackingLag = 0

      track.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          clientX: rect.left + rect.width * 0.2,
          clientY: cy,
        }),
      )
      await sleepRaf()

      for (let i = 1; i <= 12; i++) {
        const ratio = 0.2 + (i / 12) * 0.6
        const cx = rect.left + rect.width * ratio
        const t0 = performance.now()
        track.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerId: 1,
            clientX: cx,
            clientY: cy,
          }),
        )
        const tDom = performance.now() - t0
        dragDomTimes.push(tDom)
        const styleFill = parseFloat(fill.style.getPropertyValue("--k-fill")) / 100
        const compFill = parseFloat(getComputedStyle(fill).getPropertyValue("--k-fill")) / 100
        const lag = Math.abs((Number.isFinite(compFill) ? compFill : styleFill) - ratio)
        if (lag > maxTrackingLag) maxTrackingLag = lag
        await sleepRaf()
        dragPaintTimes.push(performance.now() - t0)
      }
      track.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          clientX: rect.left + rect.width * 0.8,
          clientY: cy,
        }),
      )
      await sleepRaf()

      // 2. Measure keyboard step latency
      track.focus()
      const keyDomTimes: number[] = []
      const keyPaintTimes: number[] = []
      for (let i = 0; i < 8; i++) {
        const t0 = performance.now()
        track.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: i % 2 === 0 ? "ArrowLeft" : "ArrowRight",
            bubbles: true,
            cancelable: true,
          }),
        )
        keyDomTimes.push(performance.now() - t0)
        await sleepRaf()
        keyPaintTimes.push(performance.now() - t0)
      }

      // Wait for idle before measuring preset cascade settle
      const tIdle0 = performance.now()
      while (performance.now() - tIdle0 < 1500) {
        await sleepRaf()
        if (panelEl.dataset.gpuActive === "true") {
          if (window.__knobsGpu?.sleeping) break
        } else if (panelEl.getAnimations({ subtree: true }).length === 0) {
          break
        }
      }

      // 3. Measure preset cascade total settle duration
      const tCascade0 = performance.now()
      panelEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "]",
          bubbles: true,
          cancelable: true,
        }),
      )
      let settleMs = 0
      while (performance.now() - tCascade0 < 2500) {
        await sleepRaf()
        const gpuActive = panelEl.dataset.gpuActive === "true"
        if (gpuActive) {
          if (window.__knobsGpu?.sleeping) {
            settleMs = performance.now() - tCascade0
            break
          }
        } else {
          const anims = panelEl.getAnimations({ subtree: true })
          if (anims.length === 0) {
            settleMs = performance.now() - tCascade0
            break
          }
        }
      }
      if (settleMs === 0) settleMs = performance.now() - tCascade0

      // 4. Measure die roll settle duration
      const tDie0 = performance.now()
      panelEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "r",
          bubbles: true,
          cancelable: true,
        }),
      )
      let dieSettleMs = 0
      // The traced canvas only exists for DOM-rendered rolls; the GPU draws its own die.
      const dieCanvas = panelEl.querySelector<HTMLElement>(".knobs-die")
      while (performance.now() - tDie0 < 2500) {
        await sleepRaf()
        if (
          (!dieCanvas || dieCanvas.hidden) &&
          (panelEl.dataset.gpuActive !== "true" || window.__knobsGpu?.sleeping)
        ) {
          dieSettleMs = performance.now() - tDie0
          break
        }
      }
      if (dieSettleMs === 0) dieSettleMs = performance.now() - tDie0

      const med = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b)
        return s[Math.floor(s.length / 2)] ?? 0
      }
      return {
        dragInputToDomMs: +med(dragDomTimes).toFixed(3),
        dragInputToPaintMs: +med(dragPaintTimes).toFixed(2),
        dragFillTrackingLagRatio: +maxTrackingLag.toFixed(4),
        keyInputToDomMs: +med(keyDomTimes).toFixed(3),
        keyInputToPaintMs: +med(keyPaintTimes).toFixed(2),
        presetCascadeSettleMs: +settleMs.toFixed(1),
        dieRollSettleMs: +dieSettleMs.toFixed(1),
      }
    })
  } finally {
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  }

  return {
    mode,
    throttle,
    ...res,
  }
}

async function runSuite(
  browser: Browser,
  baseUrl: string,
  mode: "dom" | "gpu",
  throttle: number,
): Promise<{ benchmarks: BenchMetrics[]; latency: LatencyMetrics }> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  const page = await context.newPage()
  await installInstrumentation(page)
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")

  const q = mode === "gpu" ? "?gpu" : "?dom"
  const benchmarks: BenchMetrics[] = []

  await page.goto(`${baseUrl}/${q}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await sleep(200)

  // 1. Open and close panel (3 cycles)
  benchmarks.push(
    await measureScenario(page, cdp, "open_close", mode, throttle, async () => {
      for (let i = 0; i < 3; i++) {
        const study = page.locator('[data-study="splat"]')
        const b = (await study.boundingBox())!
        await study.hover({ position: { x: b.width - 20, y: 60 } })
        await page.getByRole("button", { name: "Tune splat", exact: true }).click()
        const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
        await panel.waitFor()
        await sleep(120)
        await page.keyboard.press("Escape")
        await sleep(160)
      }
    }),
  )

  // Open splat panel
  {
    const study = page.locator('[data-study="splat"]')
    const b = (await study.boundingBox())!
    await study.hover({ position: { x: b.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune splat", exact: true }).click()
    await page.getByRole("dialog", { name: "splat controls", exact: true }).waitFor()
    await sleep(200)
  }
  const splatPanel = page.getByRole("dialog", { name: "splat controls", exact: true })

  // 2. Hover across rows
  benchmarks.push(
    await measureScenario(page, cdp, "hover_rows", mode, throttle, async () => {
      const box = (await splatPanel.boundingBox())!
      await page.mouse.move(box.x + box.width * 0.5, box.y + 20)
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height - 15, { steps: 18 })
      await page.mouse.move(box.x + box.width * 0.5, box.y + 20, { steps: 18 })
      await sleep(80)
    }),
  )

  // 3. Continuous slider drag (60 rAF-paced pointer moves + rubber band stretch)
  benchmarks.push(
    await measureScenario(page, cdp, "slider_drag", mode, throttle, async () => {
      const count = splatPanel.getByRole("slider", { name: "count", exact: true })
      const cb = (await count.boundingBox())!
      const y = cb.y + cb.height * 0.5
      await page.mouse.move(cb.x + 15, y)
      await page.mouse.down()
      await page.mouse.move(cb.x + cb.width + 40, y, { steps: 30 })
      await page.mouse.move(cb.x - 40, y, { steps: 30 })
      await page.mouse.move(cb.x + cb.width * 0.5, y, { steps: 15 })
      await page.mouse.up()
      await sleep(100)
    }),
  )

  // 4. Held arrow keys (keyboard nudging burst)
  benchmarks.push(
    await measureScenario(page, cdp, "keyboard_nudge", mode, throttle, async () => {
      const count = splatPanel.getByRole("slider", { name: "count", exact: true })
      await count.focus()
      for (let i = 0; i < 16; i++) {
        await page.keyboard.press(i < 8 ? "ArrowRight" : "ArrowLeft")
      }
      await sleep(180)
    }),
  )

  // 5. Preset switching ([ / ]) and preset strip scrubbing (cascade)
  benchmarks.push(
    await measureScenario(page, cdp, "preset_cascade", mode, throttle, async () => {
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("]")
        await sleep(60)
      }
      const strip = splatPanel.locator(".knobs-presets")
      const chips = strip.locator(".knobs-preset-chip[role=radio]")
      const c0 = (await chips.first().boundingBox())!
      const cl = (await chips.last().boundingBox())!
      await page.mouse.move(c0.x + 6, c0.y + c0.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(cl.x + cl.width - 6, cl.y + cl.height * 0.5, { steps: 12 })
      await page.mouse.move(c0.x + 6, c0.y + c0.height * 0.5, { steps: 12 })
      await page.mouse.up()
      await sleep(220)
    }),
  )

  // 6. Random (3D header die roll) + undo/redo bursts
  benchmarks.push(
    await measureScenario(page, cdp, "random_die_undo", mode, throttle, async () => {
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("r")
        await sleep(80)
      }
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("u")
        await sleep(25)
      }
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("Shift+U")
        await sleep(25)
      }
      await sleep(220)
    }),
  )

  // 7. Wheel nudges and hint mode (`s`)
  benchmarks.push(
    await measureScenario(page, cdp, "wheel_and_hints", mode, throttle, async () => {
      const count = splatPanel.getByRole("slider", { name: "count", exact: true })
      const cb = (await count.boundingBox())!
      await page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.5)
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(i % 2 === 0 ? 14 : -14, 0)
      }
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("s")
        await sleep(25)
        await page.keyboard.press("c")
        await sleep(20)
        await page.keyboard.press("Escape")
        await sleep(25)
      }
      await sleep(80)
    }),
  )

  await page.keyboard.press("Escape")
  await sleep(80)

  // 8. Compound editors: expand/collapse and drag inside spring, color, point, easing
  {
    const mStudy = page.locator('[data-study="motion"]')
    const mb = (await mStudy.boundingBox())!
    await mStudy.hover({ position: { x: mb.width - 20, y: 60 } })
    await page.getByRole("button", { name: "Tune motion", exact: true }).click()
    await page.getByRole("dialog", { name: "motion controls", exact: true }).waitFor()
    await sleep(160)
  }
  const motionPanel = page.getByRole("dialog", { name: "motion controls", exact: true })

  benchmarks.push(
    await measureScenario(page, cdp, "compound_editors", mode, throttle, async () => {
      for (const name of ["Tint", "Target", "Curve"]) {
        await motionPanel.getByRole("button", { name, exact: true }).click()
        await sleep(120)
      }
      const hue = (await motionPanel.getByRole("slider", { name: "Tint hue" }).boundingBox())!
      await page.mouse.move(hue.x + 15, hue.y + hue.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(hue.x + hue.width - 15, hue.y + hue.height * 0.5, { steps: 14 })
      await page.mouse.up()

      const pad = (await motionPanel.getByRole("slider", { name: "Target" }).boundingBox())!
      await page.mouse.move(pad.x + pad.width * 0.25, pad.y + pad.height * 0.25)
      await page.mouse.down()
      await page.mouse.move(pad.x + pad.width * 0.75, pad.y + pad.height * 0.75, { steps: 14 })
      await page.mouse.up()

      const handle = (await motionPanel
        .getByRole("slider", { name: "Curve start handle" })
        .boundingBox())!
      await page.mouse.move(handle.x + handle.width * 0.5, handle.y + handle.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(handle.x + 35, handle.y - 35, { steps: 12 })
      await page.mouse.up()

      for (const name of ["Curve", "Target", "Tint"]) {
        await motionPanel.getByRole("button", { name, exact: true }).click()
        await sleep(100)
      }
      await sleep(100)
    }),
  )

  // 9. Meta page token changes & resizing
  await page.goto(`${baseUrl}/meta.html${q}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const tokensPanel = page.getByRole("region", { name: "knobs-tokens controls" })
  await tokensPanel.waitFor()
  await sleep(200)

  benchmarks.push(
    await measureScenario(page, cdp, "meta_tokens", mode, throttle, async () => {
      const strip = tokensPanel.getByRole("radiogroup", { name: "Preset or variant" })
      for (const preset of ["compact", "airy", "paper", "terminal", "cobalt", "frost", "default"]) {
        await strip.getByRole("radio", { name: preset, exact: true }).click()
        await sleep(60)
      }
      const contrast = tokensPanel.getByRole("slider", { name: "Contrast", exact: true })
      const cb = (await contrast.boundingBox())!
      await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(cb.x + cb.width * 0.8, cb.y + cb.height * 0.5, { steps: 18 })
      await page.mouse.up()
      await sleep(140)
    }),
  )

  benchmarks.push(
    await measureScenario(page, cdp, "resize_and_width", mode, throttle, async () => {
      const widthSlider = tokensPanel.getByRole("slider", { name: "Panel width", exact: true })
      const wb = (await widthSlider.boundingBox())!
      await page.mouse.move(wb.x + wb.width * 0.25, wb.y + wb.height * 0.5)
      await page.mouse.down()
      await page.mouse.move(wb.x + wb.width * 0.85, wb.y + wb.height * 0.5, { steps: 15 })
      await page.mouse.move(wb.x + wb.width * 0.35, wb.y + wb.height * 0.5, { steps: 15 })
      await page.mouse.up()
      await sleep(120)
    }),
  )

  // 10. The full page (tune.html): wheel scrolling under the sticky header, keys across cards and
  // a numbered group preset.
  await page.goto(`${baseUrl}/tune.html${q}`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator(".knobs-page .knobs-tile").first().waitFor()
  // A throttled page is still settling its first paint for a while after it appears.
  await sleep(1500)
  benchmarks.push(
    await measureScenario(page, cdp, "page_scroll_keys", mode, throttle, async () => {
      await page.mouse.move(700, 500)
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, 60)
        await sleep(16)
      }
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -60)
        await sleep(16)
      }
      await page.getByRole("slider", { name: "Row height" }).focus()
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("j")
        await sleep(40)
      }
      await page.keyboard.press("Tab")
      await page.keyboard.press("Tab")
      await sleep(120)
      await page.getByRole("slider", { name: "Row height" }).focus()
      await page.keyboard.press("3")
      await sleep(300)
      await page.keyboard.press("1")
      await sleep(300)
    }),
  )

  const latency = await measureLatency(page, cdp, baseUrl, mode, throttle)

  await context.close()
  return { benchmarks, latency }
}

const { baseUrl, server } = await ensureServer()
const browser = await chromium.launch({
  args: [
    "--enable-unsafe-webgpu",
    "--enable-gpu",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
  ],
})

try {
  const args = process.argv.slice(2)
  const saveAs = args.find((a) => a.startsWith("--save="))?.split("=")[1]
  const quick = args.includes("--quick")
  const configs: { mode: "dom" | "gpu"; throttle: number }[] = quick
    ? [
        { mode: "dom", throttle: 4 },
        { mode: "gpu", throttle: 4 },
      ]
    : [
        { mode: "dom", throttle: 1 },
        { mode: "gpu", throttle: 1 },
        { mode: "dom", throttle: 4 },
        { mode: "gpu", throttle: 4 },
      ]

  const allBenchmarks: BenchMetrics[] = []
  const allLatencies: LatencyMetrics[] = []

  for (const cfg of configs) {
    console.log(`\n=== Running suite: mode=${cfg.mode.toUpperCase()} throttle=${cfg.throttle}x ===`)
    const { benchmarks, latency } = await runSuite(browser, baseUrl, cfg.mode, cfg.throttle)
    allBenchmarks.push(...benchmarks)
    allLatencies.push(latency)

    console.table(
      benchmarks.map((b) => ({
        scenario: b.scenario,
        p50: b.p50FrameMs,
        p95: b.p95FrameMs,
        max: b.maxFrameMs,
        long: `${b.longTasks} (${b.longTaskMs}ms)`,
        taskMs: b.taskMs,
        scriptMs: b.scriptMs,
        styleMs: `${b.styleMs} (${b.styleCount})`,
        layoutMs: `${b.layoutMs} (${b.layoutCount})`,
        bcr: b.bcrCalls,
        gcs: b.gcsCalls,
        matches: b.matchesCalls,
        anim: b.getAnimCalls,
        mut: b.domMutations,
        gpuTickP95: b.gpuTickP95Ms,
        gpuTickTot: b.gpuTickTotalMs,
      })),
    )
    console.log("Latency:", latency)
  }

  for (const cfg of configs) {
    const sub = allBenchmarks.filter((b) => b.mode === cfg.mode && b.throttle === cfg.throttle)
    const tag = `${cfg.mode}_${cfg.throttle}x`
    const totTask = sub.reduce((a, b) => a + b.taskMs, 0)
    const totScript = sub.reduce((a, b) => a + b.scriptMs, 0)
    const totStyle = sub.reduce((a, b) => a + b.styleMs, 0)
    const totLayout = sub.reduce((a, b) => a + b.layoutMs, 0)
    const totBcr = sub.reduce((a, b) => a + b.bcrCalls, 0)
    const totGcs = sub.reduce((a, b) => a + b.gcsCalls, 0)
    const totMatches = sub.reduce((a, b) => a + b.matchesCalls, 0)
    const totAnim = sub.reduce((a, b) => a + b.getAnimCalls, 0)
    const totMut = sub.reduce((a, b) => a + b.domMutations, 0)
    const totGpuTick = sub.reduce((a, b) => a + b.gpuTickTotalMs, 0)
    const medP95 = median(sub.map((b) => b.p95FrameMs))
    const lat = allLatencies.find((l) => l.mode === cfg.mode && l.throttle === cfg.throttle)!

    console.log(`METRIC ${tag}_total_task_ms=${totTask.toFixed(1)}`)
    console.log(`METRIC ${tag}_total_script_ms=${totScript.toFixed(1)}`)
    console.log(`METRIC ${tag}_total_style_ms=${totStyle.toFixed(1)}`)
    console.log(`METRIC ${tag}_total_layout_ms=${totLayout.toFixed(1)}`)
    console.log(`METRIC ${tag}_median_p95_frame_ms=${medP95.toFixed(2)}`)
    console.log(`METRIC ${tag}_bcr_calls=${totBcr}`)
    console.log(`METRIC ${tag}_gcs_calls=${totGcs}`)
    console.log(`METRIC ${tag}_matches_calls=${totMatches}`)
    console.log(`METRIC ${tag}_getanim_calls=${totAnim}`)
    console.log(`METRIC ${tag}_dom_mutations=${totMut}`)
    if (cfg.mode === "gpu") {
      console.log(`METRIC ${tag}_gpu_tick_total_ms=${totGpuTick.toFixed(1)}`)
    }
    console.log(`METRIC ${tag}_cascade_settle_ms=${lat.presetCascadeSettleMs}`)
    console.log(`METRIC ${tag}_die_settle_ms=${lat.dieRollSettleMs}`)
  }

  if (saveAs) {
    mkdirSync("perf", { recursive: true })
    writeFileSync(
      `perf/${saveAs}.json`,
      JSON.stringify({ timestamp: new Date().toISOString(), allBenchmarks, allLatencies }, null, 2),
    )
    console.log(`Saved results to perf/${saveAs}.json`)
  }
} finally {
  await browser.close()
  server?.kill()
}
