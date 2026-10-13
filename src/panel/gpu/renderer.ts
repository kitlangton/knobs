import type { RendererMode } from "../../core/store.js"
import { clamp, Spring } from "../motion.js"
import type { PresetStrip } from "../presets.js"
import type { Slider } from "../slider.js"
import { ATLAS_SIZE, LabelAtlas } from "./atlas.js"
import { mixColor, readPanelTokens, withAlpha, type Rgba } from "./color.js"
import { FLOATS_PER_PRIM, panelWgsl } from "./shader.wgsl.js"

const MAX_PRIMS = 4096

export interface GpuKnobRow {
  readonly kind: "knob"
  readonly key: string
  readonly display: string
  readonly row: HTMLElement
  readonly slider: Slider
  isModified(): boolean
}

export interface GpuChoiceRow {
  readonly kind: "choice"
  readonly key: string
  readonly display: string
  readonly row: HTMLElement
  readonly labelEl: HTMLElement
  readonly segEl: HTMLElement
  readonly buttons: readonly HTMLButtonElement[]
  readonly pillX: Spring
  readonly pillW: Spring
  isModified(): boolean
}

export interface GpuToggleRow {
  readonly kind: "toggle"
  readonly key: string
  readonly display: string
  readonly row: HTMLElement
  readonly labelEl: HTMLElement
  readonly toggleEl: HTMLButtonElement
  readonly toggleSpring: Spring
  isModified(): boolean
}

export type GpuRowBinding = GpuKnobRow | GpuChoiceRow | GpuToggleRow

export interface GpuGroupBinding {
  readonly element: HTMLElement
  readonly labelEl: HTMLElement
  readonly buttons: readonly HTMLButtonElement[]
}

export interface GpuPanelBinding {
  readonly id: string
  readonly root: HTMLElement
  readonly body: HTMLElement
  readonly inline: boolean
  readonly header: HTMLElement | null
  readonly titleEl: HTMLElement | null
  readonly headerButtons: readonly { button: HTMLButtonElement; icon: string }[]
  readonly presetStrip: PresetStrip
  readonly groups: readonly GpuGroupBinding[]
  readonly rows: readonly GpuRowBinding[]
  readonly actionButtons: readonly HTMLButtonElement[]
  isPopoverOpen(): boolean
}

export interface KnobsGpuDiagnostics {
  readonly supported: boolean
  readonly active: boolean
  readonly backend: "webgpu" | "dom"
  readonly panelCount: number
  readonly frameCount: number
  readonly skippedFrames: number
  readonly sleeping: boolean
  readonly lastInstanceCount: number
  forceDeviceLoss(): void
  wake(): void
}

declare global {
  interface Window {
    __knobsGpu?: KnobsGpuDiagnostics
  }
}

export function resolveRendererMode(mode: RendererMode, doc: Document): "gpu" | "dom" {
  if (mode === "dom") return "dom"
  const rootMode = doc.documentElement.dataset.knobsRenderer
  if (rootMode === "dom") return "dom"
  if (rootMode === "gpu") return "gpu"
  const search = doc.defaultView?.location?.search ?? ""
  if (search) {
    const params = new URLSearchParams(search)
    const r = params.get("renderer")
    if (
      r === "dom" ||
      params.has("dom") ||
      params.get("gpu") === "0" ||
      params.get("gpu") === "false"
    ) {
      return "dom"
    }
    if (r === "gpu" || params.has("gpu")) {
      return "gpu"
    }
  }
  return mode === "gpu" ? "gpu" : "dom"
}

function getEffectiveClipRect(
  el: HTMLElement,
  win: Window,
  stopAt?: HTMLElement,
): [number, number, number, number] {
  let minX = 0
  let minY = 0
  let maxX = win.innerWidth
  let maxY = win.innerHeight
  let curr: HTMLElement | null = el.parentElement
  while (curr && curr !== el.ownerDocument.body && curr !== el.ownerDocument.documentElement) {
    const style = win.getComputedStyle(curr)
    const ox = style.overflowX
    const oy = style.overflowY
    if (
      ox === "auto" ||
      ox === "scroll" ||
      ox === "hidden" ||
      ox === "clip" ||
      oy === "auto" ||
      oy === "scroll" ||
      oy === "hidden" ||
      oy === "clip"
    ) {
      const r = curr.getBoundingClientRect()
      minX = Math.max(minX, r.left)
      minY = Math.max(minY, r.top)
      maxX = Math.min(maxX, r.right)
      maxY = Math.min(maxY, r.bottom)
    }
    if (curr === stopAt) break
    curr = curr.parentElement
  }
  return [minX, minY, Math.max(minX, maxX), Math.max(minY, maxY)]
}

function intersectClip(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): [number, number, number, number] {
  const x0 = Math.max(a[0], b[0])
  const y0 = Math.max(a[1], b[1])
  const x1 = Math.max(x0, Math.min(a[2], b[2]))
  const y1 = Math.max(y0, Math.min(a[3], b[3]))
  return [x0, y0, x1, y1]
}

class GpuOverlayManager {
  private readonly panels = new Set<GpuPanelBinding>()
  private canvas: HTMLCanvasElement | null = null
  private adapter: any = null
  private device: any = null
  private context: any = null
  private format = "bgra8unorm"
  private pipeline: any = null
  private primBuffer: any = null
  private viewBuffer: any = null
  private labelTexture: any = null
  private sampler: any = null
  private bindGroup: any = null
  private readonly atlas = new LabelAtlas()

  private readonly data = new Float32Array(MAX_PRIMS * FLOATS_PER_PRIM)
  private readonly prevData = new Float32Array(MAX_PRIMS * FLOATS_PER_PRIM)
  private primCount = 0
  private prevPrimCount = -1
  private prevCanvasW = 0
  private prevCanvasH = 0

  private initializing: Promise<boolean> | null = null
  private supported = false
  private failed = false
  private rafId = 0
  private sleeping = true
  private dirty = true
  private settleFrames = 0
  private lastTick = 0
  private frameCount = 0
  private skippedFrames = 0
  private listenersAttached = false

  constructor(private readonly doc: Document) {
    this.publishDiagnostics()
  }

  private get win(): Window {
    return this.doc.defaultView!
  }

  private publishDiagnostics() {
    if (!this.doc.defaultView) return
    const self = this
    this.doc.defaultView.__knobsGpu = {
      get supported() {
        return self.supported
      },
      get active() {
        return self.supported && !self.failed && self.panels.size > 0 && Boolean(self.device)
      },
      get backend() {
        return self.supported && !self.failed && self.panels.size > 0 && Boolean(self.device)
          ? "webgpu"
          : "dom"
      },
      get panelCount() {
        return self.panels.size
      },
      get frameCount() {
        return self.frameCount
      },
      get skippedFrames() {
        return self.skippedFrames
      },
      get sleeping() {
        return self.sleeping
      },
      get lastInstanceCount() {
        return self.primCount
      },
      forceDeviceLoss() {
        if (self.device) {
          try {
            self.device.destroy()
          } catch {
            // ignore
          }
        }
      },
      wake() {
        self.wake()
      },
    }
  }

  register(panel: GpuPanelBinding): () => void {
    this.panels.add(panel)
    panel.root.dataset.renderer = "gpu"
    this.attachGlobalListeners()
    void this.ensureInitialized().then((ok) => {
      if (!this.panels.has(panel)) return
      panel.root.dataset.gpuActive = ok ? "true" : "false"
      this.publishDiagnostics()
      if (ok) this.wake()
    })
    return () => {
      this.panels.delete(panel)
      delete panel.root.dataset.gpuActive
      delete panel.root.dataset.renderer
      this.publishDiagnostics()
      if (this.panels.size === 0) {
        this.stopLoop()
        if (this.canvas) {
          this.canvas.remove()
          this.canvas = null
          this.context = null
        }
      } else {
        this.wake()
      }
    }
  }

  wake = () => {
    this.dirty = true
    this.settleFrames = 0
    if (!this.rafId && this.panels.size > 0 && this.device && !this.failed) {
      this.sleeping = false
      this.lastTick = performance.now()
      this.rafId = this.win.requestAnimationFrame(this.tick)
    }
  }

  private stopLoop() {
    if (this.rafId) {
      this.win.cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    this.sleeping = true
  }

  private attachGlobalListeners() {
    if (this.listenersAttached) return
    this.listenersAttached = true
    const win = this.win
    win.addEventListener("scroll", this.wake, { capture: true, passive: true })
    win.addEventListener("resize", this.wake, { passive: true })
    win.visualViewport?.addEventListener("resize", this.wake, { passive: true })
    win.visualViewport?.addEventListener("scroll", this.wake, { passive: true })
    this.doc.addEventListener("pointermove", this.onDocPointer, { passive: true })
    this.doc.addEventListener("pointerdown", this.wake, { capture: true, passive: true })
    this.doc.addEventListener("pointerup", this.wake, { capture: true, passive: true })
    this.doc.addEventListener("focusin", this.wake, { capture: true })
    this.doc.addEventListener("focusout", this.wake, { capture: true })
    this.doc.addEventListener("keydown", this.wake, { capture: true })
  }

  private onDocPointer = (e: PointerEvent) => {
    for (const p of this.panels) {
      const r = p.root.getBoundingClientRect()
      if (
        e.clientX >= r.left - 24 &&
        e.clientX <= r.right + 24 &&
        e.clientY >= r.top - 24 &&
        e.clientY <= r.bottom + 24
      ) {
        this.wake()
        return
      }
    }
  }

  private async ensureInitialized(): Promise<boolean> {
    if (this.device && !this.failed) {
      this.ensureCanvas()
      return true
    }
    if (this.initializing) return this.initializing
    this.initializing = this.initWebGpu()
    const ok = await this.initializing
    this.initializing = null
    return ok
  }

  private ensureCanvas() {
    if (this.canvas && this.doc.body.contains(this.canvas)) return
    const c = this.doc.createElement("canvas")
    c.className = "knobs-gpu-canvas"
    c.dataset.knobsGpu = ""
    c.setAttribute("aria-hidden", "true")
    c.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147480002;display:block;"
    this.doc.body.append(c)
    this.canvas = c
    if (this.device) {
      const ctx = (c as any).getContext("webgpu")
      if (ctx) {
        ctx.configure({
          device: this.device,
          format: this.format,
          alphaMode: "premultiplied",
        })
        this.context = ctx
      }
    }
  }

  private async initWebGpu(): Promise<boolean> {
    try {
      const nav = this.win.navigator as any
      if (!nav?.gpu) {
        this.supported = false
        this.failed = true
        this.setAllPanelsActive(false)
        return false
      }
      const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" })
      if (!adapter) {
        this.supported = false
        this.failed = true
        this.setAllPanelsActive(false)
        return false
      }
      const device = await adapter.requestDevice()
      this.adapter = adapter
      this.device = device
      this.supported = true
      this.failed = false

      device.lost.then(() => {
        if (this.device !== device) return
        this.device = null
        this.context = null
        this.setAllPanelsActive(false)
        this.stopLoop()
        this.publishDiagnostics()
        if (this.panels.size > 0) {
          setTimeout(() => {
            if (this.panels.size > 0) {
              void this.ensureInitialized().then((ok) => {
                this.setAllPanelsActive(ok)
                if (ok) this.wake()
              })
            }
          }, 150)
        }
      })

      this.format = nav.gpu.getPreferredCanvasFormat
        ? nav.gpu.getPreferredCanvasFormat()
        : "bgra8unorm"

      const shaderModule = device.createShaderModule({ code: panelWgsl })
      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: 1 | 2, buffer: { type: "read-only-storage" } },
          { binding: 1, visibility: 1 | 2, buffer: { type: "uniform" } },
          { binding: 2, visibility: 2, texture: { sampleType: "float" } },
          { binding: 3, visibility: 2, sampler: { type: "filtering" } },
        ],
      })
      const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      })
      this.pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format: this.format,
              blend: {
                color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
      })

      // GPUBufferUsage: STORAGE = 0x80, COPY_DST = 0x08, UNIFORM = 0x40
      this.primBuffer = device.createBuffer({
        size: MAX_PRIMS * FLOATS_PER_PRIM * 4,
        usage: 0x80 | 0x08,
      })
      this.viewBuffer = device.createBuffer({
        size: 16,
        usage: 0x40 | 0x08,
      })
      // GPUTextureUsage: TEXTURE_BINDING = 0x04, COPY_DST = 0x02, RENDER_ATTACHMENT = 0x10
      this.labelTexture = device.createTexture({
        size: [ATLAS_SIZE, ATLAS_SIZE],
        format: "rgba8unorm",
        usage: 0x04 | 0x02 | 0x10,
      })
      this.sampler = device.createSampler({
        magFilter: "linear",
        minFilter: "linear",
      })
      this.bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.primBuffer } },
          { binding: 1, resource: { buffer: this.viewBuffer } },
          { binding: 2, resource: this.labelTexture.createView() },
          { binding: 3, resource: this.sampler },
        ],
      })

      this.atlas.clear()
      this.ensureCanvas()
      this.setAllPanelsActive(true)
      this.publishDiagnostics()
      this.wake()
      return true
    } catch {
      this.supported = false
      this.failed = true
      this.setAllPanelsActive(false)
      this.publishDiagnostics()
      return false
    }
  }

  private setAllPanelsActive(active: boolean) {
    for (const p of this.panels) {
      p.root.dataset.gpuActive = active ? "true" : "false"
    }
  }

  private pushPrim(o: {
    x: number
    y: number
    w: number
    h: number
    clip: readonly [number, number, number, number]
    uv?: readonly [number, number, number, number]
    color: Rgba
    color2?: Rgba
    radius?: number
    strokeWidth?: number
    glowOrBlur?: number
    kind: number
    blurX?: number
    blurY?: number
    stretchX?: number
    stretchOrigin?: number
    p0?: number
    p1?: number
    p2?: number
    p3?: number
  }) {
    if (this.primCount >= MAX_PRIMS) return
    const b = this.primCount++ * FLOATS_PER_PRIM
    const d = this.data
    d[b] = o.x
    d[b + 1] = o.y
    d[b + 2] = o.w
    d[b + 3] = o.h

    d[b + 4] = o.clip[0]
    d[b + 5] = o.clip[1]
    d[b + 6] = o.clip[2]
    d[b + 7] = o.clip[3]

    const uv = o.uv ?? [0, 0, 1, 1]
    d[b + 8] = uv[0]
    d[b + 9] = uv[1]
    d[b + 10] = uv[2]
    d[b + 11] = uv[3]

    d[b + 12] = o.color[0]
    d[b + 13] = o.color[1]
    d[b + 14] = o.color[2]
    d[b + 15] = o.color[3]

    const c2 = o.color2 ?? [1, 1, 1, 0]
    d[b + 16] = c2[0]
    d[b + 17] = c2[1]
    d[b + 18] = c2[2]
    d[b + 19] = c2[3]

    d[b + 20] = o.radius ?? 0
    d[b + 21] = o.strokeWidth ?? 0
    d[b + 22] = o.glowOrBlur ?? 0
    d[b + 23] = o.kind

    d[b + 24] = o.blurX ?? 0
    d[b + 25] = o.blurY ?? 0
    d[b + 26] = o.stretchX ?? 0
    d[b + 27] = o.stretchOrigin ?? 0

    d[b + 28] = o.p0 ?? 0
    d[b + 29] = o.p1 ?? 0
    d[b + 30] = o.p2 ?? 0
    d[b + 31] = o.p3 ?? 0
  }

  private pushLabel(
    text: string,
    x: number,
    centerY: number,
    px: number,
    weight: number,
    family: string,
    color: Rgba,
    clip: readonly [number, number, number, number],
    scale: number,
    align: "left" | "center" | "right" = "left",
    blurX = 0,
    blurY = 0,
    letterSpacing = 0,
  ) {
    if (!text) return 0
    const entry = this.atlas.get(text, px, weight, family, scale, letterSpacing)
    let drawX = x - entry.pad
    if (align === "center") drawX = x - entry.w * 0.5
    else if (align === "right") drawX = x - entry.w + entry.pad
    const drawY = centerY - entry.h * 0.5
    this.pushPrim({
      x: drawX,
      y: drawY,
      w: entry.w,
      h: entry.h,
      clip,
      uv: entry.uv,
      color,
      kind: 5,
      blurX,
      blurY,
    })
    return entry.textW
  }

  private buildScene(dt: number, scale: number, reducedMotion: boolean): boolean {
    this.primCount = 0
    let anyMoving = false
    const win = this.win
    const activeEl = this.doc.activeElement

    // Sort panels by z-index / DOM order so floating panels render on top of inline panels
    const orderedPanels = [...this.panels].sort((a, b) => {
      if (a.inline !== b.inline) return a.inline ? -1 : 1
      const za = parseInt(a.root.style.zIndex || "0", 10) || 0
      const zb = parseInt(b.root.style.zIndex || "0", 10) || 0
      return za - zb
    })

    for (const panel of orderedPanels) {
      if (!this.doc.body.contains(panel.root) || panel.root.hidden) continue
      const pRect = panel.root.getBoundingClientRect()
      if (pRect.width <= 0 || pRect.height <= 0) continue

      const tokens = readPanelTokens(panel.root)
      const blurMul = reducedMotion ? 0 : tokens.blurStrength
      const outerClip = panel.inline
        ? getEffectiveClipRect(panel.root, win)
        : ([0, 0, win.innerWidth, win.innerHeight] as [number, number, number, number])

      const panelClip = intersectClip(outerClip, [pRect.left, pRect.top, pRect.right, pRect.bottom])

      // 1. Panel card background + border + drop shadow
      this.pushPrim({
        x: pRect.left,
        y: pRect.top,
        w: pRect.width,
        h: pRect.height,
        clip: outerClip,
        color: tokens.bg,
        color2: tokens.line,
        radius: tokens.panelRadius,
        strokeWidth: 1,
        glowOrBlur: panel.inline ? 0 : 18,
        kind: 0,
        p0: panel.inline ? 0 : tokens.isLight ? 0.16 : 0.48,
        p1: tokens.isLight ? 0.4 : 1,
      })

      // If popover is open, compute its rect so underlying rows don't draw over the DOM popover
      let bodyClip: [number, number, number, number] = [
        panelClip[0] + 1,
        panelClip[1] + 1,
        panelClip[2] - 1,
        panelClip[3] - 1,
      ]
      if (panel.isPopoverOpen()) {
        const pop = panel.root.querySelector<HTMLElement>(".knobs-popover:not([hidden])")
        if (pop) {
          const popRect = pop.getBoundingClientRect()
          // Clip GPU rows to start below the popover
          bodyClip = [
            bodyClip[0],
            Math.max(bodyClip[1], popRect.bottom + 2),
            bodyClip[2],
            bodyClip[3],
          ]
        }
      }

      // 2. Header title & icon buttons
      if (panel.header && panel.titleEl) {
        const tRect = panel.titleEl.getBoundingClientRect()
        this.pushLabel(
          panel.titleEl.textContent ?? "",
          tRect.left,
          tRect.top + tRect.height * 0.5,
          tokens.fontSize + 1,
          600,
          tokens.fontFamily,
          tokens.text,
          panelClip,
          scale,
          "left",
        )
        for (const hb of panel.headerButtons) {
          if (hb.button.hidden) continue
          const bRect = hb.button.getBoundingClientRect()
          const hovered = hb.button.matches(":hover")
          const focused = activeEl === hb.button
          const disabled = hb.button.disabled
          const expanded = hb.button.getAttribute("aria-expanded") === "true"
          if (hovered || focused || expanded) {
            this.pushPrim({
              x: bRect.left,
              y: bRect.top,
              w: bRect.width,
              h: bRect.height,
              clip: panelClip,
              color: expanded ? tokens.surfaceHi : tokens.surface,
              color2: tokens.accent,
              radius: bRect.height * 0.5,
              glowOrBlur: tokens.glowStrength * 8,
              kind: 1,
              p0: hovered ? 1 : 0,
              p1: focused ? 1 : 0,
            })
          }
          const iconCol = disabled
            ? withAlpha(tokens.dim, 0.45)
            : hovered || focused || expanded
              ? tokens.text
              : tokens.label
          this.pushLabel(
            hb.icon,
            bRect.left + bRect.width * 0.5,
            bRect.top + bRect.height * 0.5,
            tokens.fontSize + 0.5,
            600,
            tokens.fontFamily,
            iconCol,
            panelClip,
            scale,
            "center",
          )
        }
      }

      // 3. Preset selector strip
      const ps = panel.presetStrip
      if (!ps.element.hidden) {
        const psRect = ps.element.getBoundingClientRect()
        const trackRect = ps.track.getBoundingClientRect()
        const psFocused = activeEl === ps.element || ps.element.contains(activeEl)
        this.pushPrim({
          x: psRect.left,
          y: psRect.top,
          w: psRect.width,
          h: psRect.height,
          clip: bodyClip,
          color: tokens.segBg,
          color2: tokens.accent,
          radius: tokens.radius,
          glowOrBlur: tokens.glowStrength * 8,
          kind: 1,
          p0: ps.element.matches(":hover") ? 0.4 : 0,
          p1: psFocused ? 1 : 0,
        })

        const stripClip = intersectClip(bodyClip, [
          trackRect.left + 1,
          trackRect.top + 1,
          trackRect.right - 1,
          trackRect.bottom - 1,
        ])

        const activeState = ps.getActiveState()
        const chipButtons = ps.getButtons()
        const activeBtn =
          activeState.activeIndex >= 0 ? chipButtons[activeState.activeIndex] : undefined
        if (activeBtn && !activeState.isCustom) {
          const tx = activeBtn.offsetLeft
          const tw = Math.max(18, activeBtn.offsetWidth)
          if (ps.pillW.x <= 1) {
            ps.pillX.snap(tx)
            ps.pillW.snap(tw)
          } else {
            ps.pillX.set(tx)
            ps.pillW.set(tw)
          }
          ps.pillAlpha.set(1)
        } else {
          ps.pillAlpha.set(0)
        }

        if (reducedMotion) {
          ps.pillX.snap(ps.pillX.target)
          ps.pillW.snap(ps.pillW.target)
          ps.pillAlpha.snap(ps.pillAlpha.target)
        } else {
          ps.pillX.step(dt)
          ps.pillW.step(dt)
          ps.pillAlpha.step(dt)
          if (!ps.pillX.resting || !ps.pillW.resting || !ps.pillAlpha.resting) {
            anyMoving = true
          }
        }

        const pillAlpha = clamp(ps.pillAlpha.x, 0, 1)
        if (pillAlpha > 0.01) {
          const pillScreenX = trackRect.left + ps.pillX.x - ps.track.scrollLeft
          const pillW = Math.max(18, ps.pillW.x)
          const pillH = Math.max(16, trackRect.height - 4)
          const pillY = trackRect.top + (trackRect.height - pillH) * 0.5
          const blurX = clamp(ps.pillX.v * 0.018 * blurMul, -24, 24)
          const stretch = clamp(Math.abs(ps.pillX.v) * 0.008 * blurMul, 0, 8)
          this.pushPrim({
            x: pillScreenX - stretch * 0.5,
            y: pillY,
            w: pillW + stretch,
            h: pillH,
            clip: stripClip,
            color: withAlpha(tokens.segActive, pillAlpha),
            color2: withAlpha(tokens.lineHi, pillAlpha),
            radius: Math.max(2, tokens.radius - 2),
            kind: 3,
            blurX,
          })
        }

        for (let i = 0; i < chipButtons.length; i++) {
          const btn = chipButtons[i]!
          const br = btn.getBoundingClientRect()
          if (br.right < stripClip[0] || br.left > stripClip[2]) continue
          const isActive = i === activeState.activeIndex
          const isHovered = btn.matches(":hover")
          const col = isActive ? tokens.text : isHovered ? tokens.text : tokens.label
          this.pushLabel(
            btn.textContent ?? "",
            br.left + br.width * 0.5,
            br.top + br.height * 0.5,
            tokens.fontSize - 0.5,
            isActive ? 600 : tokens.labelWeight,
            tokens.fontFamily,
            col,
            stripClip,
            scale,
            "center",
          )
        }

        if (!ps.customBadge.hidden) {
          const cr = ps.customBadge.getBoundingClientRect()
          // Modified dot + "custom" label
          this.pushPrim({
            x: cr.left + 4,
            y: cr.top + cr.height * 0.5 - 2,
            w: 4,
            h: 4,
            clip: bodyClip,
            color: tokens.modified,
            glowOrBlur: 2.5,
            kind: 7,
          })
          this.pushLabel(
            "custom",
            cr.left + 12,
            cr.top + cr.height * 0.5,
            tokens.fontSize - 1.5,
            500,
            tokens.monoFamily,
            tokens.label,
            bodyClip,
            scale,
            "left",
          )
        }
      }

      // 4. Group headers
      for (const g of panel.groups) {
        const gr = g.element.getBoundingClientRect()
        if (gr.bottom < bodyClip[1] || gr.top > bodyClip[3]) continue
        const lr = g.labelEl.getBoundingClientRect()
        this.pushLabel(
          (g.labelEl.textContent ?? "").toUpperCase(),
          lr.left,
          lr.top + lr.height * 0.5,
          Math.max(9.5, tokens.fontSize - 2),
          600,
          tokens.fontFamily,
          tokens.dim,
          bodyClip,
          scale,
          "left",
          0,
          0,
          0.04,
        )
        for (const gb of g.buttons) {
          const br = gb.getBoundingClientRect()
          const hovered = gb.matches(":hover") && !gb.disabled
          const focused = activeEl === gb
          if (hovered || focused) {
            this.pushPrim({
              x: br.left,
              y: br.top,
              w: br.width,
              h: br.height,
              clip: bodyClip,
              color: tokens.surfaceHi,
              color2: tokens.accent,
              radius: 4,
              glowOrBlur: tokens.glowStrength * 6,
              kind: 1,
              p0: hovered ? 1 : 0,
              p1: focused ? 1 : 0,
            })
          }
          const col = gb.disabled
            ? withAlpha(tokens.dim, 0.38)
            : hovered || focused
              ? tokens.text
              : tokens.label
          this.pushLabel(
            gb.textContent ?? "",
            br.left + br.width * 0.5,
            br.top + br.height * 0.5,
            Math.max(10, tokens.fontSize - 1.5),
            500,
            tokens.fontFamily,
            col,
            bodyClip,
            scale,
            "center",
          )
        }
      }

      // 5. Control rows (sliders, segmented choices, switches) + hint badges
      const hinting = panel.root.classList.contains("knobs-hinting")
      for (const row of panel.rows) {
        const rRect = row.row.getBoundingClientRect()
        if (rRect.bottom < bodyClip[1] || rRect.top > bodyClip[3]) continue
        const hintMiss = hinting && row.row.classList.contains("knobs-hint-miss")
        const rowAlpha = hintMiss ? 0.35 : 1

        if (row.kind === "knob") {
          const sl = row.slider
          if (reducedMotion) {
            sl.fillSpring.snap(sl.fillSpring.target)
            sl.stretchSpring.snap(sl.stretchSpring.target)
            sl.handleSpring.snap(sl.handleSpring.target)
            for (const ds of sl.digitSprings) ds.snap(ds.target)
          } else {
            sl.fillSpring.step(dt)
            sl.stretchSpring.step(dt)
            sl.handleSpring.step(dt)
            for (const ds of sl.digitSprings) ds.step(dt)
            if (
              !sl.fillSpring.resting ||
              !sl.stretchSpring.resting ||
              !sl.handleSpring.resting ||
              sl.digitSprings.some((ds) => !ds.resting)
            ) {
              anyMoving = true
            }
          }

          const hovered = row.row.matches(":hover")
          const focused = activeEl === sl.track
          const dragging = sl.isDragging()
          const stretchX = sl.stretchSpring.x * blurMul

          // Slider track surface
          this.pushPrim({
            x: rRect.left,
            y: rRect.top,
            w: rRect.width,
            h: rRect.height,
            clip: bodyClip,
            color: withAlpha(tokens.surface, rowAlpha),
            color2: tokens.accent,
            radius: tokens.radius,
            glowOrBlur: tokens.glowStrength * 8,
            kind: 1,
            stretchX,
            p0: hovered || dragging ? 0.6 : 0,
            p1: focused ? 1 : 0,
          })

          // Slider fill + ticks + handle with directional motion blur
          const dragVel = sl.velocity.velocity[0]
          const springVel = sl.fillSpring.v
          const rawVelPx =
            (Math.abs(springVel) > Math.abs(dragVel) ? springVel : dragVel) * rRect.width
          const blurX = clamp(rawVelPx * 0.022 * blurMul, -28, 28)

          this.pushPrim({
            x: rRect.left,
            y: rRect.top,
            w: rRect.width,
            h: rRect.height,
            clip: bodyClip,
            color: withAlpha(dragging ? tokens.lineHi : tokens.surfaceHi, rowAlpha),
            color2: withAlpha(tokens.accent, rowAlpha),
            radius: tokens.radius,
            glowOrBlur: tokens.glowStrength,
            kind: 2,
            blurX,
            stretchX,
            p0: sl.fillSpring.x,
            p1: sl.handleSpring.x,
            p2: sl.tickCount,
            p3: dragging ? 1 : hovered ? 0.7 : 0,
          })

          // Label + modified dot
          const lRect = sl.label.getBoundingClientRect()
          const labelW = this.pushLabel(
            row.display,
            lRect.left + stretchX * 0.35,
            rRect.top + rRect.height * 0.5,
            tokens.fontSize,
            tokens.labelWeight,
            tokens.fontFamily,
            withAlpha(tokens.label, rowAlpha),
            bodyClip,
            scale,
            "left",
          )
          if (row.isModified()) {
            this.pushPrim({
              x: lRect.left + labelW + 5 + stretchX * 0.35,
              y: rRect.top + rRect.height * 0.5 - 2,
              w: 4,
              h: 4,
              clip: bodyClip,
              color: withAlpha(tokens.modified, rowAlpha),
              glowOrBlur: 2.5,
              kind: 7,
            })
          }

          // Value readout (GPU rolling digits with vertical motion smear!) when not editing inline
          if (!sl.isEditing()) {
            const vRect = sl.valueButton.getBoundingClientRect()
            const unitText = sl.getUnitText()
            const digitsText = sl.getDigitsText()
            const valCol = withAlpha(dragging || focused ? tokens.text : tokens.label, rowAlpha)
            let rightEdge = vRect.right - 2 + stretchX * 0.35
            if (unitText) {
              const uw = this.pushLabel(
                unitText,
                rightEdge,
                rRect.top + rRect.height * 0.5,
                tokens.fontSize - 0.5,
                400,
                tokens.monoFamily,
                withAlpha(tokens.dim, rowAlpha),
                bodyClip,
                scale,
                "right",
              )
              rightEdge -= uw + 3.5
            }

            // Render per-digit columns so rolling digits blur vertically
            const anyDigitRolling = !reducedMotion && sl.digitSprings.some((ds) => !ds.resting)
            if (!anyDigitRolling) {
              this.pushLabel(
                digitsText,
                rightEdge,
                rRect.top + rRect.height * 0.5,
                tokens.fontSize - 0.5,
                500,
                tokens.monoFamily,
                valCol,
                bodyClip,
                scale,
                "right",
              )
            } else {
              const charAdvance = this.atlas.get(
                "0",
                tokens.fontSize - 0.5,
                500,
                tokens.monoFamily,
                scale,
              ).textW
              const slotH = Math.min(rRect.height - 6, tokens.fontSize * 1.35)
              const slotTop = rRect.top + (rRect.height - slotH) * 0.5
              const slotClip = intersectClip(bodyClip, [
                rRect.left,
                slotTop,
                rRect.right,
                slotTop + slotH,
              ])
              for (let ci = digitsText.length - 1; ci >= 0; ci--) {
                const ch = digitsText[ci]!
                const sp = sl.digitSprings[ci]
                const cx = rightEdge - (digitsText.length - 1 - ci) * charAdvance
                if (!sp || ch < "0" || ch > "9" || sp.resting) {
                  this.pushLabel(
                    ch,
                    cx,
                    rRect.top + rRect.height * 0.5,
                    tokens.fontSize - 0.5,
                    500,
                    tokens.monoFamily,
                    valCol,
                    slotClip,
                    scale,
                    "right",
                  )
                } else {
                  const baseDigit = Math.floor(sp.x)
                  const frac = sp.x - baseDigit
                  const blurY = clamp(sp.v * 0.45 * blurMul, -12, 12)
                  const d0 = String(((baseDigit % 10) + 10) % 10)
                  const d1 = String((((baseDigit + 1) % 10) + 10) % 10)
                  this.pushLabel(
                    d0,
                    cx,
                    rRect.top + rRect.height * 0.5 - frac * slotH * 0.85,
                    tokens.fontSize - 0.5,
                    500,
                    tokens.monoFamily,
                    withAlpha(valCol, 1 - frac * 0.6),
                    slotClip,
                    scale,
                    "right",
                    0,
                    blurY,
                  )
                  if (frac > 0.02) {
                    this.pushLabel(
                      d1,
                      cx,
                      rRect.top + rRect.height * 0.5 + (1 - frac) * slotH * 0.85,
                      tokens.fontSize - 0.5,
                      500,
                      tokens.monoFamily,
                      withAlpha(valCol, 0.4 + frac * 0.6),
                      slotClip,
                      scale,
                      "right",
                      0,
                      blurY,
                    )
                  }
                }
              }
            }
          }
        } else if (row.kind === "choice") {
          const focused = activeEl === row.segEl || row.segEl.contains(activeEl)
          const hovered = row.row.matches(":hover")
          this.pushPrim({
            x: rRect.left,
            y: rRect.top,
            w: rRect.width,
            h: rRect.height,
            clip: bodyClip,
            color: withAlpha(focused ? tokens.surfaceHi : tokens.surface, rowAlpha),
            color2: tokens.accent,
            radius: tokens.radius,
            glowOrBlur: tokens.glowStrength * 8,
            kind: 1,
            p0: hovered ? 0.5 : 0,
            p1: focused ? 1 : 0,
          })

          const lRect = row.labelEl.getBoundingClientRect()
          const labelW = this.pushLabel(
            row.display,
            lRect.left,
            rRect.top + rRect.height * 0.5,
            tokens.fontSize,
            tokens.labelWeight,
            tokens.fontFamily,
            withAlpha(tokens.label, rowAlpha),
            bodyClip,
            scale,
            "left",
          )
          if (row.isModified()) {
            this.pushPrim({
              x: lRect.left + labelW + 5,
              y: rRect.top + rRect.height * 0.5 - 2,
              w: 4,
              h: 4,
              clip: bodyClip,
              color: withAlpha(tokens.modified, rowAlpha),
              glowOrBlur: 2.5,
              kind: 7,
            })
          }

          const segRect = row.segEl.getBoundingClientRect()
          this.pushPrim({
            x: segRect.left,
            y: segRect.top,
            w: segRect.width,
            h: segRect.height,
            clip: bodyClip,
            color: withAlpha(tokens.segBg, rowAlpha),
            radius: Math.max(2, tokens.radius - 2),
            kind: 1,
          })

          // Step segmented active pill spring
          const activeBtn = row.buttons.find((b) => b.getAttribute("aria-checked") === "true")
          if (activeBtn) {
            const targetX = activeBtn.offsetLeft
            const targetW = activeBtn.offsetWidth
            if (reducedMotion || row.pillW.x <= 1) {
              row.pillX.snap(targetX)
              row.pillW.snap(targetW)
            } else {
              row.pillX.set(targetX)
              row.pillW.set(targetW)
              row.pillX.step(dt)
              row.pillW.step(dt)
              if (!row.pillX.resting || !row.pillW.resting) anyMoving = true
            }
            const blurX = clamp(row.pillX.v * 0.016 * blurMul, -18, 18)
            this.pushPrim({
              x: segRect.left + row.pillX.x,
              y: segRect.top + 2,
              w: Math.max(12, row.pillW.x),
              h: Math.max(12, segRect.height - 4),
              clip: bodyClip,
              color: withAlpha(tokens.segActive, rowAlpha),
              color2: withAlpha(tokens.lineHi, rowAlpha),
              radius: Math.max(2, tokens.radius - 3),
              kind: 3,
              blurX,
            })
          }

          for (const b of row.buttons) {
            const br = b.getBoundingClientRect()
            const checked = b.getAttribute("aria-checked") === "true"
            const bHover = b.matches(":hover")
            this.pushLabel(
              b.textContent ?? "",
              br.left + br.width * 0.5,
              br.top + br.height * 0.5,
              tokens.fontSize - 0.5,
              checked ? 500 : 400,
              tokens.fontFamily,
              withAlpha(checked || bHover ? tokens.text : tokens.label, rowAlpha),
              bodyClip,
              scale,
              "center",
            )
          }
        } else {
          // Toggle row
          const focused = activeEl === row.toggleEl
          const hovered = row.row.matches(":hover")
          const checked = row.toggleEl.getAttribute("aria-checked") === "true"
          const target = checked ? 1 : 0
          if (reducedMotion) {
            row.toggleSpring.snap(target)
          } else {
            row.toggleSpring.set(target)
            row.toggleSpring.step(dt)
            if (!row.toggleSpring.resting) anyMoving = true
          }

          this.pushPrim({
            x: rRect.left,
            y: rRect.top,
            w: rRect.width,
            h: rRect.height,
            clip: bodyClip,
            color: withAlpha(focused ? tokens.surfaceHi : tokens.surface, rowAlpha),
            color2: tokens.accent,
            radius: tokens.radius,
            glowOrBlur: tokens.glowStrength * 8,
            kind: 1,
            p0: hovered ? 0.5 : 0,
            p1: focused ? 1 : 0,
          })

          const lRect = row.labelEl.getBoundingClientRect()
          const labelW = this.pushLabel(
            row.display,
            lRect.left,
            rRect.top + rRect.height * 0.5,
            tokens.fontSize,
            tokens.labelWeight,
            tokens.fontFamily,
            withAlpha(tokens.label, rowAlpha),
            bodyClip,
            scale,
            "left",
          )
          if (row.isModified()) {
            this.pushPrim({
              x: lRect.left + labelW + 5,
              y: rRect.top + rRect.height * 0.5 - 2,
              w: 4,
              h: 4,
              clip: bodyClip,
              color: withAlpha(tokens.modified, rowAlpha),
              glowOrBlur: 2.5,
              kind: 7,
            })
          }

          const tRect = row.toggleEl.getBoundingClientRect()
          const prog = clamp(row.toggleSpring.x, 0, 1)
          const trackColor = mixColor(tokens.toggleTrack, tokens.accent, prog)
          const thumbColor = mixColor([1, 1, 1, 1], tokens.isLight ? [1, 1, 1, 1] : tokens.bg, prog)
          this.pushPrim({
            x: tRect.left,
            y: tRect.top,
            w: tRect.width,
            h: tRect.height,
            clip: bodyClip,
            color: withAlpha(trackColor, rowAlpha),
            color2: withAlpha(thumbColor, rowAlpha),
            kind: 4,
            blurX: row.toggleSpring.v * 6 * blurMul,
            p0: prog,
            p1: focused ? 1 : 0,
          })
        }

        // Hint badge if active on this row
        if (hinting) {
          const hintEl = row.row.querySelector<HTMLElement>(".knobs-hint:not([hidden])")
          if (hintEl) {
            const hr = hintEl.getBoundingClientRect()
            this.pushPrim({
              x: hr.left,
              y: hr.top,
              w: hr.width,
              h: hr.height,
              clip: bodyClip,
              color: tokens.accent,
              radius: 4,
              kind: 3,
            })
            const typedText =
              hintEl.querySelector(".knobs-hint-typed")?.textContent?.toUpperCase() ?? ""
            const restText =
              hintEl.querySelector(".knobs-hint-rest")?.textContent?.toUpperCase() ??
              (typedText ? "" : (hintEl.textContent ?? "").toUpperCase())
            let hx = hr.left + 5
            if (typedText) {
              const tw = this.pushLabel(
                typedText,
                hx,
                hr.top + hr.height * 0.5,
                tokens.fontSize - 1.5,
                700,
                tokens.monoFamily,
                withAlpha(tokens.bg, 0.45),
                bodyClip,
                scale,
                "left",
              )
              hx += tw
            }
            if (restText) {
              this.pushLabel(
                restText,
                hx,
                hr.top + hr.height * 0.5,
                tokens.fontSize - 1.5,
                700,
                tokens.monoFamily,
                tokens.bg,
                bodyClip,
                scale,
                "left",
              )
            }
          }
        }
      }

      // 6. Action buttons (primary footer bar + custom actions)
      for (const btn of panel.actionButtons) {
        if (btn.hidden || !this.doc.body.contains(btn)) continue
        const br = btn.getBoundingClientRect()
        if (br.width <= 0 || br.height <= 0) continue
        if (br.bottom < bodyClip[1] || br.top > bodyClip[3]) continue
        const hovered = btn.matches(":hover") && !btn.disabled
        const focused = activeEl === btn
        const expanded = btn.getAttribute("aria-expanded") === "true"
        const alpha = btn.disabled ? 0.38 : 1
        this.pushPrim({
          x: br.left,
          y: br.top,
          w: br.width,
          h: br.height,
          clip: bodyClip,
          color: withAlpha(expanded ? tokens.surfaceHi : tokens.surface, alpha),
          color2: tokens.accent,
          radius: tokens.radius,
          glowOrBlur: tokens.glowStrength * 7,
          kind: 1,
          p0: hovered ? 1 : 0,
          p1: focused ? 1 : 0,
        })
        this.pushLabel(
          btn.textContent ?? "",
          br.left + br.width * 0.5,
          br.top + br.height * 0.5,
          tokens.fontSize - 0.5,
          500,
          tokens.fontFamily,
          withAlpha(hovered || focused || expanded ? tokens.text : tokens.label, alpha),
          bodyClip,
          scale,
          "center",
        )
      }
    }

    return anyMoving
  }

  private isDataUnchanged(canvasW: number, canvasH: number): boolean {
    if (
      this.primCount !== this.prevPrimCount ||
      canvasW !== this.prevCanvasW ||
      canvasH !== this.prevCanvasH ||
      this.atlas.isDirty
    ) {
      return false
    }
    const len = this.primCount * FLOATS_PER_PRIM
    for (let i = 0; i < len; i++) {
      if (this.data[i] !== this.prevData[i]) return false
    }
    return true
  }

  private tick = (now: number) => {
    this.rafId = 0
    if (!this.device || !this.canvas || !this.context || this.panels.size === 0) {
      this.sleeping = true
      this.publishDiagnostics()
      return
    }

    const dt = Math.min(0.05, Math.max(1 / 240, (now - this.lastTick) / 1000))
    this.lastTick = now

    const win = this.win
    const vv = win.visualViewport
    const dpr = Math.min(3, Math.max(1, win.devicePixelRatio || 1))
    const vvScale = vv?.scale ?? 1
    const effectiveScale = dpr * vvScale
    const cssW = Math.max(1, win.innerWidth)
    const cssH = Math.max(1, win.innerHeight)
    const pixelW = Math.max(1, Math.round(cssW * dpr))
    const pixelH = Math.max(1, Math.round(cssH * dpr))

    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW
      this.canvas.height = pixelH
    }

    const reducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const anyMoving = this.buildScene(dt, effectiveScale, reducedMotion)

    if (!this.dirty && !anyMoving && this.isDataUnchanged(pixelW, pixelH)) {
      this.skippedFrames++
      this.settleFrames++
      if (this.settleFrames < 2) {
        this.rafId = win.requestAnimationFrame(this.tick)
      } else {
        this.sleeping = true
      }
      this.publishDiagnostics()
      return
    }

    this.dirty = false
    this.settleFrames = 0
    this.frameCount++

    const floatLen = this.primCount * FLOATS_PER_PRIM
    this.prevData.set(this.data.subarray(0, floatLen))
    this.prevPrimCount = this.primCount
    this.prevCanvasW = pixelW
    this.prevCanvasH = pixelH

    try {
      this.atlas.flush(this.device, this.labelTexture)
      if (floatLen > 0) {
        this.device.queue.writeBuffer(
          this.primBuffer,
          0,
          this.data.buffer,
          this.data.byteOffset,
          floatLen * 4,
        )
      }
      const viewArr = new Float32Array([cssW, cssH, dpr, now / 1000])
      this.device.queue.writeBuffer(this.viewBuffer, 0, viewArr)

      const textureView = this.context.getCurrentTexture().createView()
      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      })
      if (this.primCount > 0) {
        pass.setPipeline(this.pipeline)
        pass.setBindGroup(0, this.bindGroup)
        pass.draw(6, this.primCount, 0, 0)
      }
      pass.end()
      this.device.queue.submit([encoder.finish()])
    } catch {
      // Transient surface error during resize; next frame will recover.
    }

    this.publishDiagnostics()
    this.rafId = win.requestAnimationFrame(this.tick)
  }
}

const managers = new WeakMap<Document, GpuOverlayManager>()

export function getGpuOverlayManager(doc: Document): GpuOverlayManager {
  let m = managers.get(doc)
  if (!m) {
    m = new GpuOverlayManager(doc)
    managers.set(doc, m)
  }
  return m
}
