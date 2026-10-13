export const ATLAS_SIZE = 2048

export interface AtlasEntry {
  readonly uv: readonly [number, number, number, number]
  readonly w: number
  readonly h: number
  readonly pad: number
  readonly textW: number
}

export class LabelAtlas {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  private readonly ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  private readonly map = new Map<string, AtlasEntry>()
  private lx = 0
  private ly = 0
  private rowH = 0
  private dirty = false
  private dirtyY0 = ATLAS_SIZE
  private dirtyY1 = 0
  private currentScale = 0

  constructor() {
    if (typeof OffscreenCanvas !== "undefined") {
      this.canvas = new OffscreenCanvas(ATLAS_SIZE, ATLAS_SIZE)
    } else {
      const c = document.createElement("canvas")
      c.width = ATLAS_SIZE
      c.height = ATLAS_SIZE
      this.canvas = c
    }
    this.ctx = this.canvas.getContext("2d")!
  }

  clear() {
    this.lx = 0
    this.ly = 0
    this.rowH = 0
    this.map.clear()
    this.ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)
    this.dirty = true
    this.dirtyY0 = 0
    this.dirtyY1 = ATLAS_SIZE
  }

  ensureScale(scale: number) {
    const quantized = Math.max(2, Math.min(4, Math.ceil(scale * 2) / 2))
    if (this.currentScale !== quantized) {
      this.currentScale = quantized
      this.clear()
    }
    return quantized
  }

  get(
    text: string,
    px: number,
    weight: number,
    family: string,
    scaleFactor = 3,
    letterSpacingEm = 0,
  ): AtlasEntry {
    const scale = this.ensureScale(scaleFactor)
    const key = `${text}|${px}|${weight}|${family}|${scale}|${letterSpacingEm}`
    const hit = this.map.get(key)
    if (hit) return hit

    const ctx = this.ctx
    const scaledPx = px * scale
    ctx.font = `${weight} ${scaledPx}px ${family}`
    if ("letterSpacing" in ctx) {
      ;(ctx as any).letterSpacing = `${letterSpacingEm * scaledPx}px`
    }
    if ("fontKerning" in ctx) {
      ;(ctx as any).fontKerning = "normal"
    }

    const pad = Math.ceil(4 * scale)
    const measuredW = ctx.measureText(text).width
    const w = Math.min(ATLAS_SIZE - 8, Math.max(4, Math.ceil(measuredW) + pad * 2))
    const h = Math.max(4, Math.ceil(scaledPx * 1.35) + pad * 2)

    if (this.lx + w > ATLAS_SIZE) {
      this.lx = 0
      this.ly += this.rowH + 2
      this.rowH = 0
    }
    if (this.ly + h > ATLAS_SIZE) {
      this.clear()
    }
    this.rowH = Math.max(this.rowH, h)

    ctx.fillStyle = "#ffffff"
    ctx.textBaseline = "middle"
    ctx.textAlign = "left"
    ctx.fillText(text, this.lx + pad, this.ly + h * 0.5)

    const entry: AtlasEntry = {
      uv: [
        this.lx / ATLAS_SIZE,
        this.ly / ATLAS_SIZE,
        (this.lx + w) / ATLAS_SIZE,
        (this.ly + h) / ATLAS_SIZE,
      ],
      w: w / scale,
      h: h / scale,
      pad: pad / scale,
      textW: measuredW / scale,
    }

    this.dirtyY0 = Math.min(this.dirtyY0, this.ly)
    this.dirtyY1 = Math.max(this.dirtyY1, this.ly + h)
    this.lx += w + 2
    this.map.set(key, entry)
    this.dirty = true
    return entry
  }

  get isDirty() {
    return this.dirty
  }

  flush(device: any, texture: any) {
    if (!this.dirty) return
    const y0 = Math.max(0, Math.min(ATLAS_SIZE - 1, this.dirtyY0))
    const y1 = Math.max(y0 + 1, Math.min(ATLAS_SIZE, this.dirtyY1))
    device.queue.copyExternalImageToTexture(
      { source: this.canvas, origin: [0, y0] },
      { texture, origin: [0, y0] },
      [ATLAS_SIZE, y1 - y0],
    )
    this.dirty = false
    this.dirtyY0 = ATLAS_SIZE
    this.dirtyY1 = 0
  }
}
