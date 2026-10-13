import type { RendererMode } from "../../core/store.js"
import { ICONS, type IconName } from "../icons.js"
import { clamp, entranceOffset, numeral, Spring } from "../motion.js"
import type { PresetStrip } from "../presets.js"
import type { Slider } from "../slider.js"
import { ATLAS_SIZE, LabelAtlas } from "./atlas.js"
import { mixColor, readPanelTokens, withAlpha, type PanelThemeTokens, type Rgba } from "./color.js"
import { FLOATS_PER_PRIM, panelWgsl } from "./shader.wgsl.js"

const MAX_PRIMS = 4096
type Clip = readonly [number, number, number, number]

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
  readonly headerButtons: readonly { button: HTMLButtonElement; icon: IconName }[]
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
  if (rootMode === "dom" || rootMode === "gpu") return rootMode
  const search = doc.defaultView?.location?.search ?? ""
  if (search) {
    const p = new URLSearchParams(search)
    const r = p.get("renderer")
    if (r === "dom" || p.has("dom") || p.get("gpu") === "0" || p.get("gpu") === "false")
      return "dom"
    if (r === "gpu" || p.has("gpu")) return "gpu"
  }
  return mode === "gpu" ? "gpu" : "dom"
}

function getEffectiveClipRect(el: HTMLElement, win: Window): [number, number, number, number] {
  let minX = 0,
    minY = 0,
    maxX = win.innerWidth,
    maxY = win.innerHeight
  let curr: HTMLElement | null = el.parentElement
  while (curr && curr !== el.ownerDocument.body && curr !== el.ownerDocument.documentElement) {
    const s = win.getComputedStyle(curr)
    if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
      const r = curr.getBoundingClientRect()
      minX = Math.max(minX, r.left)
      minY = Math.max(minY, r.top)
      maxX = Math.min(maxX, r.right)
      maxY = Math.min(maxY, r.bottom)
    }
    curr = curr.parentElement
  }
  return [minX, minY, Math.max(minX, maxX), Math.max(minY, maxY)]
}

const intersectClip = (a: Clip, b: Clip): [number, number, number, number] => {
  const x0 = Math.max(a[0], b[0]),
    y0 = Math.max(a[1], b[1])
  return [x0, y0, Math.max(x0, Math.min(a[2], b[2])), Math.max(y0, Math.min(a[3], b[3]))]
}

interface TextOpts {
  px?: number
  weight?: number
  mono?: boolean
  align?: "left" | "center" | "right"
  clip?: Clip
  blurY?: number
  track?: number
  /** Vertical feather (px) from the clip's top and bottom edges, for rolling digits. */
  feather?: number
}

class GpuOverlayManager {
  private readonly panels = new Set<GpuPanelBinding>()
  private canvas: HTMLCanvasElement | null = null
  private device: any = null
  private context: any = null
  private format = "bgra8unorm"
  private pipeline: any = null
  private primBuffer: any = null
  private viewBuffer: any = null
  private labelTexture: any = null
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

  private curClip: Clip = [0, 0, 0, 0]
  private curScale = 2
  private curTokens!: PanelThemeTokens

  constructor(private readonly doc: Document) {
    this.publishDiagnostics()
  }

  private get win(): Window {
    return this.doc.defaultView!
  }

  private publishDiagnostics() {
    if (!this.doc.defaultView) return
    const s = this
    const isActive = () => s.supported && !s.failed && s.panels.size > 0 && Boolean(s.device)
    this.doc.defaultView.__knobsGpu = {
      get supported() {
        return s.supported
      },
      get active() {
        return isActive()
      },
      get backend() {
        return isActive() ? "webgpu" : "dom"
      },
      get panelCount() {
        return s.panels.size
      },
      get frameCount() {
        return s.frameCount
      },
      get skippedFrames() {
        return s.skippedFrames
      },
      get sleeping() {
        return s.sleeping
      },
      get lastInstanceCount() {
        return s.primCount
      },
      forceDeviceLoss: () => {
        try {
          s.device?.destroy()
        } catch {}
      },
      wake: () => s.wake(),
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
        if (this.rafId) this.win.cancelAnimationFrame(this.rafId)
        this.rafId = 0
        this.sleeping = true
        this.canvas?.remove()
        this.canvas = null
        this.context = null
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

  private attachGlobalListeners() {
    if (this.listenersAttached) return
    this.listenersAttached = true
    const win = this.win
    win.addEventListener("scroll", this.wake, { capture: true, passive: true })
    win.addEventListener("resize", this.wake, { passive: true })
    win.visualViewport?.addEventListener("resize", this.wake, { passive: true })
    win.visualViewport?.addEventListener("scroll", this.wake, { passive: true })
    this.doc.addEventListener("pointermove", this.onDocPointer, { passive: true })
    for (const ev of ["pointerdown", "pointerup", "focusin", "focusout", "keydown"] as const) {
      this.doc.addEventListener(ev, this.wake, { capture: true, passive: true })
    }
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
      ctx?.configure({ device: this.device, format: this.format, alphaMode: "premultiplied" })
      this.context = ctx
    }
  }

  private async initWebGpu(): Promise<boolean> {
    try {
      const nav = this.win.navigator as any
      const adapter = await nav?.gpu?.requestAdapter({ powerPreference: "high-performance" })
      if (!adapter) throw new Error("No WebGPU adapter")
      const device = await adapter.requestDevice()
      this.device = device
      this.supported = true
      this.failed = false

      device.lost.then(() => {
        if (this.device !== device) return
        this.device = null
        this.context = null
        this.setAllPanelsActive(false)
        if (this.rafId) this.win.cancelAnimationFrame(this.rafId)
        this.rafId = 0
        this.sleeping = true
        this.publishDiagnostics()
        if (this.panels.size > 0) {
          setTimeout(() => {
            if (this.panels.size > 0)
              void this.ensureInitialized().then((ok) => {
                this.setAllPanelsActive(ok)
                if (ok) this.wake()
              })
          }, 150)
        }
      })

      this.format = nav.gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm"
      const shaderModule = device.createShaderModule({ code: panelWgsl })
      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: 1 | 2, buffer: { type: "read-only-storage" } },
          { binding: 1, visibility: 1 | 2, buffer: { type: "uniform" } },
          { binding: 2, visibility: 2, texture: { sampleType: "float" } },
          { binding: 3, visibility: 2, sampler: { type: "filtering" } },
        ],
      })
      this.pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
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

      this.primBuffer = device.createBuffer({
        size: MAX_PRIMS * FLOATS_PER_PRIM * 4,
        usage: 0x80 | 0x08,
      })
      this.viewBuffer = device.createBuffer({ size: 16, usage: 0x40 | 0x08 })
      this.labelTexture = device.createTexture({
        size: [ATLAS_SIZE, ATLAS_SIZE],
        format: "rgba8unorm",
        usage: 0x04 | 0x02 | 0x10,
      })
      const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" })
      this.bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.primBuffer } },
          { binding: 1, resource: { buffer: this.viewBuffer } },
          { binding: 2, resource: this.labelTexture.createView() },
          { binding: 3, resource: sampler },
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
    for (const p of this.panels) p.root.dataset.gpuActive = active ? "true" : "false"
  }

  private pushPrim(o: {
    x: number
    y: number
    w: number
    h: number
    clip?: Clip
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
    p0?: number
    p1?: number
    p2?: number
    p3?: number
  }) {
    if (this.primCount >= MAX_PRIMS) return
    const clip = o.clip ?? this.curClip
    const uv = o.uv ?? [0, 0, 1, 1]
    const c2 = o.color2 ?? [1, 1, 1, 0]
    this.data.set(
      [
        o.x,
        o.y,
        o.w,
        o.h,
        ...clip,
        ...uv,
        ...o.color,
        ...c2,
        o.radius ?? 0,
        o.strokeWidth ?? 0,
        o.glowOrBlur ?? 0,
        o.kind,
        o.blurX ?? 0,
        o.blurY ?? 0,
        o.stretchX ?? 0,
        0,
        o.p0 ?? 0,
        o.p1 ?? 0,
        o.p2 ?? 0,
        o.p3 ?? 0,
      ],
      this.primCount++ * FLOATS_PER_PRIM,
    )
  }

  private drawText(text: string, x: number, centerY: number, color: Rgba, opts: TextOpts = {}) {
    if (!text) return 0
    const t = this.curTokens
    const px = opts.px ?? t.fontSize
    const weight = opts.weight ?? t.labelWeight
    const family = opts.mono ? t.monoFamily : t.fontFamily
    const entry = this.atlas.get(text, px, weight, family, this.curScale, opts.track ?? 0)
    const align = opts.align ?? "left"
    const drawX =
      align === "center"
        ? x - entry.w * 0.5
        : align === "right"
          ? x - entry.w + entry.pad
          : x - entry.pad
    this.pushPrim({
      x: drawX,
      y: centerY - entry.h * 0.5,
      w: entry.w,
      h: entry.h,
      clip: opts.clip ?? this.curClip,
      uv: entry.uv,
      color,
      kind: 5,
      blurY: opts.blurY ?? 0,
      p0: opts.feather ?? 0,
    })
    return entry.textW
  }

  private drawRowLabel(
    labelEl: HTMLElement,
    text: string,
    modified: boolean,
    rowCenterY: number,
    rowAlpha: number,
    stretchOffset = 0,
  ) {
    const t = this.curTokens
    const lRect = labelEl.getBoundingClientRect()
    const w = this.drawText(
      text,
      lRect.left + stretchOffset,
      rowCenterY,
      withAlpha(t.label, rowAlpha),
    )
    if (modified) {
      this.pushPrim({
        x: lRect.left + w + 5 + stretchOffset,
        y: rowCenterY - 2,
        w: 4,
        h: 4,
        color: withAlpha(t.modified, rowAlpha),
        glowOrBlur: 0.5,
        kind: 7,
      })
    }
  }

  private drawButton(
    btn: HTMLButtonElement,
    activeEl: Element | null,
    hinting: boolean,
    radius: number,
    px: number,
    alwaysBg: boolean,
  ) {
    const t = this.curTokens
    const br = btn.getBoundingClientRect()
    if (br.width <= 0 || br.height <= 0 || br.bottom < this.curClip[1] || br.top > this.curClip[3])
      return
    const hovered = btn.matches(":hover") && !btn.disabled
    const focused = activeEl === btn && btn.matches(":focus-visible")
    const expanded = btn.getAttribute("aria-expanded") === "true"
    const alpha =
      (btn.disabled ? 0.36 : 1) * (hinting && btn.classList.contains("knobs-hint-miss") ? 0.32 : 1)
    if (alwaysBg || hovered || focused || expanded) {
      this.pushPrim({
        x: br.left,
        y: br.top,
        w: br.width,
        h: br.height,
        color: withAlpha(expanded || !alwaysBg ? t.surfaceHi : t.surface, alpha),
        color2: t.accent,
        radius,
        glowOrBlur: t.glowStrength * 7,
        kind: 1,
        p0: hovered ? 1 : 0,
        p1: focused ? 1 : 0,
      })
    }
    this.drawText(
      btn.textContent ?? "",
      br.left + br.width * 0.5,
      br.top + br.height * 0.5,
      withAlpha(hovered || focused || expanded ? t.text : t.label, alpha),
      { px, align: "center" },
    )
  }

  private drawRowSurface(
    rRect: DOMRect,
    focused: boolean,
    hovered: boolean,
    rowAlpha: number,
    stretchX = 0,
  ) {
    const t = this.curTokens
    this.pushPrim({
      x: rRect.left,
      y: rRect.top,
      w: rRect.width,
      h: rRect.height,
      color: withAlpha(focused ? t.surfaceHi : t.surface, rowAlpha),
      color2: t.accent,
      radius: t.radius,
      glowOrBlur: t.glowStrength * 8,
      kind: 1,
      stretchX,
      p0: hovered ? 0.5 : 0,
      p1: focused ? 1 : 0,
    })
  }

  private buildScene(dt: number, scale: number, reducedMotion: boolean): boolean {
    this.primCount = 0
    this.curScale = scale
    let anyMoving = false
    const win = this.win
    const activeEl = this.doc.activeElement

    const orderedPanels = [...this.panels].sort((a, b) => {
      if (a.inline !== b.inline) return a.inline ? -1 : 1
      return (
        (parseInt(a.root.style.zIndex || "0", 10) || 0) -
        (parseInt(b.root.style.zIndex || "0", 10) || 0)
      )
    })

    for (const panel of orderedPanels) {
      if (!this.doc.body.contains(panel.root) || panel.root.hidden) continue
      const pRect = panel.root.getBoundingClientRect()
      if (pRect.width <= 0 || pRect.height <= 0) continue

      const tokens = readPanelTokens(panel.root)
      this.curTokens = tokens
      const blurMul = reducedMotion ? 0 : tokens.blurStrength
      const outerClip = panel.inline
        ? getEffectiveClipRect(panel.root, win)
        : ([0, 0, win.innerWidth, win.innerHeight] as [number, number, number, number])
      const panelClip = intersectClip(outerClip, [pRect.left, pRect.top, pRect.right, pRect.bottom])
      const pillFill = mixColor(tokens.segActive, withAlpha(tokens.accent, 0.28), 0.35)
      const pillBorder = mixColor(tokens.lineHi, withAlpha(tokens.accent, 0.55), 0.5)

      // 1. Panel card
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

      let bodyClip: [number, number, number, number] = [
        panelClip[0] + 1,
        panelClip[1] + 1,
        panelClip[2] - 1,
        panelClip[3] - 1,
      ]
      if (panel.isPopoverOpen()) {
        const pop = panel.root.querySelector<HTMLElement>(".knobs-popover:not([hidden])")
        if (pop)
          bodyClip = [
            bodyClip[0],
            Math.max(bodyClip[1], pop.getBoundingClientRect().bottom + 2),
            bodyClip[2],
            bodyClip[3],
          ]
      }
      this.curClip = bodyClip

      // 2. Header
      if (panel.header && panel.titleEl) {
        const tRect = panel.titleEl.getBoundingClientRect()
        this.drawText(
          panel.titleEl.textContent ?? "",
          tRect.left,
          tRect.top + tRect.height * 0.5,
          tokens.text,
          { px: tokens.fontSize + 1, weight: 600, clip: panelClip },
        )
        for (const hb of panel.headerButtons) {
          if (hb.button.hidden) continue
          const bRect = hb.button.getBoundingClientRect()
          const hovered = hb.button.matches(":hover")
          const focused = activeEl === hb.button && hb.button.matches(":focus-visible")
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
          const iconCol = hb.button.disabled
            ? withAlpha(tokens.label, 0.3)
            : hovered || focused || expanded
              ? tokens.text
              : tokens.label
          const entry = this.atlas.icon(ICONS[hb.icon], 15, scale)
          this.pushPrim({
            x: bRect.left + (bRect.width - entry.w) * 0.5,
            y: bRect.top + (bRect.height - entry.h) * 0.5,
            w: entry.w,
            h: entry.h,
            clip: panelClip,
            uv: entry.uv,
            color: iconCol,
            kind: 5,
          })
        }
      }

      // 3. Preset strip
      const ps = panel.presetStrip
      const hinting = panel.root.classList.contains("knobs-hinting")
      if (!ps.element.hidden) {
        const psRect = ps.element.getBoundingClientRect()
        const trackRect = ps.track.getBoundingClientRect()
        this.pushPrim({
          x: psRect.left,
          y: psRect.top,
          w: psRect.width,
          h: psRect.height,
          color: tokens.segBg,
          color2: tokens.accent,
          radius: tokens.radius,
          glowOrBlur: tokens.glowStrength * 8,
          kind: 1,
          p0: ps.element.matches(":hover") ? 0.4 : 0,
          p1: ps.element.matches(":focus-visible") ? 1 : 0,
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
          const tx = activeBtn.offsetLeft,
            ty = activeBtn.offsetTop,
            tw = Math.max(18, activeBtn.offsetWidth)
          if (ps.pillW.x <= 1) {
            ps.pillX.snap(tx)
            ps.pillY.snap(ty)
            ps.pillW.snap(tw)
          } else {
            ps.pillX.set(tx)
            ps.pillY.set(ty)
            ps.pillW.set(tw)
          }
          ps.pillAlpha.set(1)
        } else {
          ps.pillAlpha.set(0)
        }

        for (const sp of [ps.pillX, ps.pillY, ps.pillW, ps.pillAlpha]) {
          if (reducedMotion) sp.snap(sp.target)
          else {
            sp.step(dt)
            if (!sp.resting) anyMoving = true
          }
        }

        const pillAlpha = clamp(ps.pillAlpha.x, 0, 1)
        if (pillAlpha > 0.01) {
          const blurX = clamp(ps.pillX.v * 0.018 * blurMul, -24, 24)
          const stretch = clamp(Math.abs(ps.pillX.v) * 0.008 * blurMul, 0, 8)
          this.pushPrim({
            x: trackRect.left + ps.pillX.x - stretch * 0.5,
            y: trackRect.top + ps.pillY.x,
            w: Math.max(18, ps.pillW.x) + stretch,
            h: Math.max(16, activeBtn?.offsetHeight ?? trackRect.height),
            clip: stripClip,
            color: withAlpha(pillFill, pillAlpha),
            color2: withAlpha(pillBorder, pillAlpha),
            radius: Math.max(2, tokens.radius - 2),
            glowOrBlur: tokens.glowStrength,
            kind: 3,
            blurX,
          })
        }

        for (let i = 0; i < chipButtons.length; i++) {
          const btn = chipButtons[i]!
          const br = btn.getBoundingClientRect()
          if (br.right < stripClip[0] || br.left > stripClip[2]) continue
          const isActive = i === activeState.activeIndex
          const missed = hinting && btn.classList.contains("knobs-hint-miss")
          this.drawText(
            btn.textContent ?? "",
            br.left + br.width * 0.5,
            br.top + br.height * 0.5,
            withAlpha(
              isActive || btn.matches(":hover") ? tokens.text : tokens.label,
              missed ? 0.32 : 1,
            ),
            {
              px: tokens.fontSize - 0.5,
              weight: isActive ? 600 : tokens.labelWeight,
              align: "center",
              clip: stripClip,
            },
          )
        }

        if (ps.saveButton && !ps.saveButton.hidden) {
          const sr = ps.saveButton.getBoundingClientRect()
          const hot = ps.saveButton.matches(":hover")
          this.drawText(
            "+",
            sr.left + sr.width * 0.5,
            sr.top + sr.height * 0.5,
            hot ? tokens.text : tokens.dim,
            {
              px: tokens.fontSize + 2,
              weight: 400,
              align: "center",
            },
          )
        }

        if (!ps.customBadge.hidden) {
          const cr = ps.customBadge.getBoundingClientRect()
          const textW = this.drawText(
            "custom",
            cr.left + cr.width * 0.5 + 4,
            cr.top + cr.height * 0.5,
            tokens.label,
            { px: tokens.fontSize - 1.5, weight: 500, mono: true, align: "center" },
          )
          this.pushPrim({
            x: cr.left + cr.width * 0.5 - textW * 0.5 - 5,
            y: cr.top + cr.height * 0.5 - 2,
            w: 4,
            h: 4,
            color: tokens.modified,
            glowOrBlur: 0.5,
            kind: 7,
          })
        }
      }

      // 4. Group headers
      for (const g of panel.groups) {
        const gr = g.element.getBoundingClientRect()
        if (gr.bottom < bodyClip[1] || gr.top > bodyClip[3]) continue
        const lr = g.labelEl.getBoundingClientRect()
        this.drawText(
          (g.labelEl.textContent ?? "").toUpperCase(),
          lr.left,
          lr.top + lr.height * 0.5,
          tokens.dim,
          { px: Math.max(9.5, tokens.fontSize - 2), weight: 600, track: 0.04 },
        )
        for (const gb of g.buttons) {
          this.drawButton(gb, activeEl, hinting, 4, Math.max(10, tokens.fontSize - 1.5), false)
        }
      }

      // 5. Control rows
      for (const row of panel.rows) {
        const rRect = row.row.getBoundingClientRect()
        if (rRect.bottom < bodyClip[1] || rRect.top > bodyClip[3]) continue
        const rowAlpha = hinting && row.row.classList.contains("knobs-hint-miss") ? 0.32 : 1
        const rowCenterY = rRect.top + rRect.height * 0.5
        const hovered = row.row.matches(":hover")

        if (row.kind === "knob") {
          const sl = row.slider
          const clock = performance.now()
          const rolling =
            !reducedMotion &&
            sl.digitPlaces.some(
              (d) =>
                !d.wheel.resting(clock) ||
                !d.presence.resting(clock) ||
                clock - d.enterAt < d.enterMs,
            )
          if (rolling) anyMoving = true
          for (const sp of [sl.fillSpring, sl.stretchSpring, sl.handleSpring]) {
            if (reducedMotion) sp.snap(sp.target)
            else {
              sp.step(dt)
              if (!sp.resting) anyMoving = true
            }
          }
          const focused = activeEl === sl.track && sl.track.matches(":focus-visible")
          const dragging = sl.isDragging()
          const stretchX = sl.stretchSpring.x * blurMul

          this.drawRowSurface(rRect, focused, hovered || dragging, rowAlpha, stretchX)

          const dragVel = sl.velocity.velocity[0]
          const springVel = sl.fillSpring.v
          const rawVelPx =
            (Math.abs(springVel) > Math.abs(dragVel) ? springVel : dragVel) * rRect.width
          const blurX = clamp(rawVelPx * 0.022 * blurMul, -28, 28)
          const fillTint = mixColor(
            dragging ? tokens.lineHi : tokens.surfaceHi,
            withAlpha(tokens.accent, tokens.isLight ? 0.2 : 0.25),
            dragging ? 0.45 : 0.35,
          )

          this.pushPrim({
            x: rRect.left,
            y: rRect.top,
            w: rRect.width,
            h: rRect.height,
            color: withAlpha(fillTint, rowAlpha),
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

          this.drawRowLabel(
            sl.label,
            row.display,
            row.isModified(),
            rowCenterY,
            rowAlpha,
            stretchX * 0.35,
          )

          if (!sl.isEditing()) {
            const vRect = sl.valueButton.getBoundingClientRect()
            const unitText = sl.getUnitText()
            const digitsText = sl.getDigitsText()
            const valCol = withAlpha(dragging || focused ? tokens.text : tokens.label, rowAlpha)
            const valPx = tokens.fontSize - 0.5
            let rightEdge = vRect.right + stretchX * 0.35
            if (unitText) {
              rightEdge -=
                this.drawText(unitText, rightEdge, rowCenterY, withAlpha(tokens.dim, rowAlpha), {
                  px: valPx,
                  weight: 400,
                  align: "right",
                }) + 3.5
            }

            if (!rolling) {
              this.drawText(digitsText, rightEdge, rowCenterY, valCol, {
                px: valPx,
                weight: 400,
                align: "right",
              })
            } else {
              // A reel per place, read through a feathered slot: every face between the old and
              // new digit passes by, blurring with speed the way rolling-number's envelope does.
              const charAdvance = this.atlas.get("0", valPx, 400, tokens.fontFamily, scale).textW
              const faceH = valPx * 1.5
              const slotClip = intersectClip(bodyClip, [
                rRect.left,
                rRect.top + 1,
                rRect.right,
                rRect.bottom - 1,
              ])
              const feather = (rRect.height - 2) * 0.34
              const text = {
                px: valPx,
                weight: 400,
                align: "right" as const,
                clip: slotClip,
                feather,
              }
              const maxBlur = faceH * 0.45 * blurMul
              sl.digitPlaces.forEach((place, j) => {
                const presence = clamp(place.presence.sample(clock).position, 0, 1)
                if (presence <= 0.005) return
                const cx = rightEdge - j * charAdvance
                const rise = entranceOffset(clock - place.enterAt, place.enterMs) * faceH
                const col = withAlpha(valCol, presence)
                const isDigit = place.ch >= "0" && place.ch <= "9"
                if (!isDigit) {
                  this.drawText(place.ch, cx, rowCenterY + rise, col, text)
                  return
                }
                const { position, velocity } = place.wheel.sample(clock)
                // 4 faces/s starts the smear; 24 faces/s is full strength.
                const speed = Math.abs(velocity)
                const blurY = clamp((speed - 4) / 20, 0, 1) * maxBlur
                const base = Math.floor(position)
                for (let k = base - 1; k <= base + 2; k++) {
                  const y = rowCenterY + rise + (k - position) * faceH
                  if (Math.abs(y - rowCenterY) > rRect.height * 0.5 + faceH * 0.5) continue
                  this.drawText(numeral(k), cx, y, col, { ...text, blurY })
                }
              })
            }
          }
        } else if (row.kind === "choice") {
          this.drawRowSurface(rRect, row.segEl.matches(":focus-visible"), hovered, rowAlpha)
          this.drawRowLabel(row.labelEl, row.display, row.isModified(), rowCenterY, rowAlpha)

          const segRect = row.segEl.getBoundingClientRect()
          this.pushPrim({
            x: segRect.left,
            y: segRect.top,
            w: segRect.width,
            h: segRect.height,
            color: withAlpha(tokens.segBg, rowAlpha),
            radius: Math.max(2, tokens.radius - 2),
            kind: 1,
          })

          const activeBtn = row.buttons.find((b) => b.getAttribute("aria-checked") === "true")
          if (activeBtn) {
            const targetX = activeBtn.offsetLeft,
              targetW = activeBtn.offsetWidth
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
            this.pushPrim({
              x: segRect.left + row.pillX.x,
              y: segRect.top + 2,
              w: Math.max(12, row.pillW.x),
              h: Math.max(12, segRect.height - 4),
              color: withAlpha(pillFill, rowAlpha),
              color2: withAlpha(pillBorder, rowAlpha),
              radius: Math.max(2, tokens.radius - 3),
              glowOrBlur: tokens.glowStrength * 0.6,
              kind: 3,
              blurX: clamp(row.pillX.v * 0.016 * blurMul, -18, 18),
            })
          }

          for (const b of row.buttons) {
            const br = b.getBoundingClientRect()
            const checked = b.getAttribute("aria-checked") === "true"
            this.drawText(
              b.textContent ?? "",
              br.left + br.width * 0.5,
              br.top + br.height * 0.5,
              withAlpha(checked || b.matches(":hover") ? tokens.text : tokens.label, rowAlpha),
              {
                px: tokens.fontSize - 0.5,
                weight: checked ? 600 : tokens.labelWeight,
                align: "center",
              },
            )
          }
        } else {
          const focused = row.toggleEl.matches(":focus-visible")
          const target = row.toggleEl.getAttribute("aria-checked") === "true" ? 1 : 0
          if (reducedMotion) row.toggleSpring.snap(target)
          else {
            row.toggleSpring.set(target)
            row.toggleSpring.step(dt)
            if (!row.toggleSpring.resting) anyMoving = true
          }

          this.drawRowSurface(rRect, focused, hovered, rowAlpha)
          this.drawRowLabel(row.labelEl, row.display, row.isModified(), rowCenterY, rowAlpha)

          const tRect = row.toggleEl.getBoundingClientRect()
          const prog = clamp(row.toggleSpring.x, 0, 1)
          this.pushPrim({
            x: tRect.left,
            y: tRect.top,
            w: tRect.width,
            h: tRect.height,
            color: withAlpha(mixColor(tokens.toggleTrack, tokens.accent, prog), rowAlpha),
            color2: withAlpha(
              mixColor([1, 1, 1, 1], tokens.isLight ? [1, 1, 1, 1] : tokens.bg, prog),
              rowAlpha,
            ),
            glowOrBlur: tokens.glowStrength,
            kind: 4,
            blurX: row.toggleSpring.v * 6 * blurMul,
            p0: prog,
            p1: focused ? 1 : 0,
          })
        }
      }

      // 6. Action buttons
      for (const btn of panel.actionButtons) {
        if (!btn.hidden && this.doc.body.contains(btn)) {
          this.drawButton(btn, activeEl, hinting, tokens.radius, tokens.fontSize - 0.5, true)
        }
      }

      // 7. Hint badges
      if (hinting) {
        for (const hintEl of panel.root.querySelectorAll<HTMLElement>(
          ".knobs-hint-layer .knobs-hint:not([hidden])",
        )) {
          const hr = hintEl.getBoundingClientRect()
          if (hr.width <= 0 || hr.height <= 0) continue
          this.pushPrim({
            x: hr.left,
            y: hr.top,
            w: hr.width,
            h: hr.height,
            clip: panelClip,
            color: tokens.accent,
            color2: tokens.accent,
            radius: 4,
            glowOrBlur: tokens.glowStrength * 0.5,
            kind: 3,
          })
          const typedText =
            hintEl.querySelector(".knobs-hint-typed")?.textContent?.toUpperCase() ?? ""
          const restText =
            hintEl.querySelector(".knobs-hint-rest")?.textContent?.toUpperCase() ?? ""
          let hx = hr.left + 4
          for (const [text, color] of [
            [typedText, withAlpha(tokens.bg, 0.45)],
            [restText, tokens.bg],
          ] as const) {
            if (!text) continue
            hx += this.drawText(text, hx, hr.top + hr.height * 0.5, color, {
              px: tokens.fontSize - 2.5,
              weight: 700,
              mono: true,
              clip: panelClip,
              track: 0.04,
            })
          }
        }
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
    )
      return false
    const len = this.primCount * FLOATS_PER_PRIM
    for (let i = 0; i < len; i++) if (this.data[i] !== this.prevData[i]) return false
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
    const dpr = Math.min(3, Math.max(1, win.devicePixelRatio || 1))
    const effectiveScale = dpr * (win.visualViewport?.scale ?? 1)
    const cssW = Math.max(1, win.innerWidth),
      cssH = Math.max(1, win.innerHeight)
    const pixelW = Math.max(1, Math.round(cssW * dpr)),
      pixelH = Math.max(1, Math.round(cssH * dpr))

    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW
      this.canvas.height = pixelH
    }

    const reducedMotion = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const anyMoving = this.buildScene(dt, effectiveScale, reducedMotion)

    if (!this.dirty && !anyMoving && this.isDataUnchanged(pixelW, pixelH)) {
      this.skippedFrames++
      if (++this.settleFrames < 2) this.rafId = win.requestAnimationFrame(this.tick)
      else this.sleeping = true
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
      this.device.queue.writeBuffer(
        this.viewBuffer,
        0,
        new Float32Array([cssW, cssH, dpr, now / 1000]),
      )

      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.context.getCurrentTexture().createView(),
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
    } catch {}

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
