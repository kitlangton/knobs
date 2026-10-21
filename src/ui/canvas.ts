import { aliased } from "../core/glide.js"
import { SPRINGS } from "../core/motion.js"
import { Spring, springMotion } from "../core/spring.js"
import { canvasCss } from "./canvas-css.js"
import {
  boundsOf,
  COAST_TAU,
  clamp,
  dotGrid,
  fitView,
  KEY_ZOOM,
  keyAction,
  layoutCanvas,
  releaseVelocity,
  snapView,
  viewPath,
  zoomAround,
  type CanvasPoint,
  type CanvasRect,
  type CanvasView,
} from "./canvas-model.js"
import { applyLook, frameLoop, isTypingTarget, reducedMotion, svg, tune, type UiLook } from "./look.js"

export interface CanvasItem {
  readonly id: string
  /** Where it sits on the canvas (world px). Without both, it packs into the grid. */
  readonly x?: number
  readonly y?: number
  /** The card's size (px). Without them, the card takes its content's size. */
  readonly w?: number
  readonly h?: number
  /** Shown above the card. */
  readonly title?: string
  /** Draws the item into its card; return a cleanup for when it goes. */
  readonly render: (el: HTMLElement) => void | (() => void)
}

export interface CanvasOptions extends UiLook {
  readonly items: readonly CanvasItem[]
  /** Between packed items, world px (48). */
  readonly gap?: number
  /** Around what `fit` and `focus` show, px on screen (48). */
  readonly padding?: number
  /** How wide packed rows run, world px (as wide as makes the set about the canvas's shape). */
  readonly width?: number
  /** The zoom's range (.05 … 8). */
  readonly minZoom?: number
  readonly maxZoom?: number
  /** The zoom readout, with fit and 100% (true). */
  readonly readout?: boolean
  /** The view moved: a gesture, a key, a fit or a focus. */
  readonly onView?: (view: CanvasView) => void
  /** The canvas's accessible name. */
  readonly label?: string
}

export interface Canvas {
  readonly element: HTMLElement
  readonly view: CanvasView
  /** Each item's place (world px, its title included). */
  readonly rects: ReadonlyMap<string, CanvasRect>
  /** Shows every item. */
  fit(): void
  /** Brings an item to the middle and zooms to fit it (at most 200%). */
  focus(id: string): void
  /** Zooms to `scale` around a point on the canvas (its middle by default). */
  zoomTo(scale: number, at?: CanvasPoint): void
  /** New items: those that stay keep their content and glide to new places; new ones fade in, gone ones out. */
  update(items: readonly CanvasItem[]): void
  /** Whether anything is moving (the frame loop runs only then). */
  readonly moving: boolean
  /** Frames stepped, and the script time each took (ms), for perf checks. */
  stats(): { frames: number; p50: number; p95: number; max: number }
  dispose(): void
}

// Kit's motion: the hand is 1:1 and coasts on release; what the hand didn't do springs, without
// bounce: a fit or focus on smooth, a key's zoom on default, a mouse wheel's notch on instant,
// and tiles reflowing on calm.
const FIT = springMotion(SPRINGS.smooth)
const KEY = springMotion(SPRINGS.default)
const NOTCH = springMotion(SPRINGS.instant)
const LAYOUT = springMotion(SPRINGS.calm)
const FOCUS_MAX = 2
/** The fastest a fling coasts (px/s). */
const MAX_FLING = 8000
/** The view rests (and draws crisp, on the pixel grid) this long after the last change. */
const SETTLE_MS = 200
const INTERACTIVE =
  "a,button,input,select,textarea,label,summary,[contenteditable],[role=button],[role=slider],[role=switch],[role=checkbox],[role=tab],[role=option],[role=textbox]"

const ICON_FIT = svg('<path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10"/>')

interface Tile {
  id: string
  item: CanvasItem
  el: HTMLElement
  title: HTMLElement | null
  card: HTMLElement
  cleanup: (() => void) | undefined
  x: Spring
  y: Spring
  w: number
  h: number
  placed: boolean
  leaving: boolean
  gone: boolean
  drawn: string
}

interface Jump {
  from: CanvasView
  to: CanvasView
  path: (t: number) => CanvasView
  t: Spring
}

const injectCanvasStyles = (doc: Document) => {
  if (doc.querySelector("style[data-knobs-canvas]")) return
  const style = doc.createElement("style")
  style.dataset.knobsCanvas = ""
  style.textContent = aliased(canvasCss)
  doc.head.append(style)
}

/**
 * An infinite canvas: items as cards on a dotted page that pans and zooms freely. Drag the page
 * (or hold Space, or the middle button, and drag anywhere) or scroll with two fingers to pan;
 * pinch or ⌘/ctrl-scroll to zoom around the pointer. Both follow the hand 1:1 and coast on
 * release. 0 fits everything, 1 is 100%, = and - zoom, and a double-click focuses an item (again,
 * or on the page, fits). Items stay live: clicks and keys reach them. Items without a place pack
 * into rows sized to their content. Nothing moves on load: the first fit is instant.
 */
export function canvas(container: HTMLElement, options: CanvasOptions): Canvas {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  const gap = options.gap ?? 48
  const pad = options.padding ?? 48
  const minZoom = options.minZoom ?? 0.05
  const maxZoom = options.maxZoom ?? 8
  let items = options.items

  const root = doc.createElement("div")
  root.className = "knobs-canvas"
  root.tabIndex = 0
  root.setAttribute("role", "region")
  root.setAttribute("aria-roledescription", "canvas")
  root.setAttribute("aria-label", options.label ?? "Canvas")
  applyLook(root, options)
  injectCanvasStyles(doc)
  const stage = doc.createElement("div")
  stage.className = "knobs-canvas-stage"
  const dots = doc.createElement("div")
  dots.className = "knobs-canvas-dots"
  const world = doc.createElement("div")
  world.className = "knobs-canvas-world"
  stage.append(dots, world)
  root.append(stage)

  let pct: HTMLButtonElement | null = null
  if (options.readout !== false) {
    const bar = doc.createElement("div")
    bar.className = "knobs-canvas-zoom"
    const fitBtn = doc.createElement("button")
    fitBtn.type = "button"
    fitBtn.className = "knobs-canvas-btn"
    fitBtn.innerHTML = ICON_FIT
    fitBtn.title = "Fit (0)"
    fitBtn.setAttribute("aria-label", "Fit")
    fitBtn.addEventListener("click", () => api.fit())
    pct = doc.createElement("button")
    pct.type = "button"
    pct.className = "knobs-canvas-btn knobs-canvas-pct"
    pct.title = "100% (1)"
    pct.setAttribute("aria-label", "Zoom to 100%")
    pct.addEventListener("click", () => api.zoomTo(1))
    bar.append(fitBtn, pct)
    bar.addEventListener("dblclick", (e) => e.stopPropagation())
    root.append(bar)
  }
  container.append(root)

  const motionQuery = win.matchMedia?.("(prefers-reduced-motion: reduce)")
  const reduced = () => motionQuery?.matches ?? reducedMotion(win)

  let view: CanvasView = { x: 0, y: 0, scale: 1 }
  let vw = 0
  let vh = 0
  /** Nobody has moved the view yet: a change in size or content fits again, instantly. */
  let pristine = true
  let rowW: number | undefined
  let rects = new Map<string, CanvasRect>()
  let jump: Jump | null = null
  let coast: { vx: number; vy: number; vs: number; at: CanvasPoint } | null = null
  let frames = 0
  const times: number[] = []
  const tiles = new Map<string, Tile>()

  // ---- Drawing ------------------------------------------------------------------------------
  let drawnView = ""
  let drawnDots = ""
  let drawnPct = ""
  const drawView = () => {
    const v = view
    const key = `${v.x}|${v.y}|${v.scale}`
    if (key === drawnView) return
    drawnView = key
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.scale})`
    const g = dotGrid(v.scale)
    if (g.alpha <= 0.001) {
      if (drawnDots !== "off") dots.style.visibility = "hidden"
      drawnDots = "off"
    } else {
      // An oversized layer moved by less than one step: panning is only a transform.
      const ox = (((v.x + 128 - g.size / 2) % g.size) + g.size) % g.size
      const oy = (((v.y + 128 - g.size / 2) % g.size) + g.size) % g.size
      const size = `${g.size}px ${g.size}px`
      const a = String(Math.round(g.alpha * 1000) / 1000)
      if (drawnDots === "off") dots.style.visibility = ""
      if (dots.style.backgroundSize !== size) dots.style.backgroundSize = size
      if (dots.style.opacity !== a) dots.style.opacity = a
      dots.style.transform = `translate(${ox}px,${oy}px)`
      drawnDots = "on"
    }
    if (pct) {
      const label = `${Math.round(v.scale * 100)}%`
      if (label !== drawnPct) pct.textContent = drawnPct = label
    }
    options.onView?.(v)
  }

  let settleTimer = 0
  let held = false
  /** The scale the world's layer was drawn at, while it's one (`data-moving`). */
  let layerScale = 0
  const settle = () => {
    settleTimer = 0
    if (held) return
    if (loop.running) {
      settleTimer = win.setTimeout(settle, SETTLE_MS)
      return
    }
    view = snapView(view, win.devicePixelRatio || 1)
    // A pan leaves the layer as sharp as it was drawn, so it stays a layer and the next pan
    // starts at once. After a zoom it was drawn at another scale: draw it again, crisp.
    if (Math.abs(view.scale / layerScale - 1) > 1e-6) {
      delete root.dataset.moving
      layerScale = 0
    }
    drawView()
  }
  /** The view is about to move: one layer while it does, re-drawn crisp once it rests. */
  const moved = () => {
    if (!layerScale) {
      root.dataset.moving = ""
      layerScale = view.scale
    }
    win.clearTimeout(settleTimer)
    settleTimer = win.setTimeout(settle, SETTLE_MS)
  }
  const setView = (v: CanvasView) => {
    view = v
    moved()
    drawView()
  }

  const drawTile = (t: Tile) => {
    const key = `${t.x.x}|${t.y.x}`
    if (key === t.drawn) return
    t.drawn = key
    t.el.style.translate = `${t.x.x}px ${t.y.x}px`
  }

  // ---- Tiles --------------------------------------------------------------------------------
  const sizeCard = (t: Tile) => {
    const { w, h } = t.item
    t.card.style.width = w === undefined ? "" : `${w}px`
    t.card.style.height = h === undefined ? "" : `${h}px`
  }
  const setTitle = (t: Tile) => {
    const text = t.item.title
    if (text && !t.title) {
      t.title = doc.createElement("div")
      t.title.className = "knobs-canvas-title"
      t.el.prepend(t.title)
    }
    if (t.title) {
      if (text) t.title.textContent = text
      else {
        t.title.remove()
        t.title = null
      }
    }
  }
  const mount = (it: CanvasItem, enter: boolean) => {
    const el = doc.createElement("div")
    el.className = "knobs-canvas-tile"
    el.dataset.id = it.id
    const card = doc.createElement("div")
    card.className = "knobs-canvas-card"
    el.append(card)
    const t: Tile = {
      id: it.id,
      item: it,
      el,
      title: null,
      card,
      cleanup: undefined,
      x: new Spring(0, LAYOUT.omega, LAYOUT.zeta, 0.05),
      y: new Spring(0, LAYOUT.omega, LAYOUT.zeta, 0.05),
      w: 0,
      h: 0,
      placed: false,
      leaving: false,
      gone: false,
      drawn: "",
    }
    setTitle(t)
    sizeCard(t)
    world.append(el)
    t.cleanup = it.render(card) || undefined
    tiles.set(it.id, t)
    ro.observe(el)
    if (enter) {
      const r = reduced()
      el.animate(
        r
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, scale: 0.96, filter: "blur(3px)" },
              { opacity: 1, scale: 1, filter: "blur(0px)" },
            ],
        { duration: r ? 160 : 260, easing: "cubic-bezier(.2,.8,.2,1)" },
      )
    }
    return t
  }
  const unmount = (t: Tile) => {
    if (t.gone) return
    t.gone = true
    ro.unobserve(t.el)
    t.cleanup?.()
    t.el.remove()
    if (tiles.get(t.id) === t) tiles.delete(t.id)
  }
  const leave = (t: Tile) => {
    t.leaving = true
    tiles.delete(t.id)
    t.el.style.pointerEvents = "none"
    const r = reduced()
    const a = t.el.animate(
      r
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, scale: 1, filter: "blur(0px)" },
            { opacity: 0, scale: 0.96, filter: "blur(3px)" },
          ],
      { duration: r ? 160 : 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
    )
    a.onfinish = () => {
      leaving.delete(t)
      unmount(t)
    }
    leaving.add(t)
  }
  const leaving = new Set<Tile>()

  // ---- Layout -------------------------------------------------------------------------------
  const measure = () => {
    for (const t of tiles.values()) {
      t.w = t.el.offsetWidth
      t.h = t.el.offsetHeight
    }
  }
  const fitTarget = (): CanvasView | null => {
    const b = boundsOf([...rects.values()])
    if (!b || !vw || !vh) return null
    return fitView(b, vw, vh, { pad, min: minZoom, max: Math.min(maxZoom, 1) })
  }
  const relayout = (glide: boolean) => {
    const live = items.map((it) => tiles.get(it.id)!).filter(Boolean)
    const sizes = live.map((t) => ({ x: t.item.x, y: t.item.y, w: t.w, h: t.h }))
    if (pristine) rowW = options.width
    const out = layoutCanvas(sizes, {
      gap,
      width: rowW,
      aspect: vw && vh ? vw / vh : undefined,
    })
    rowW = out.width
    const next = new Map<string, CanvasRect>()
    const animate = glide && !pristine && !reduced()
    let moving = false
    live.forEach((t, i) => {
      const r = out.rects[i]!
      next.set(t.id, r)
      if (!animate || !t.placed) {
        t.x.snap(r.x)
        t.y.snap(r.y)
      } else {
        tune(t.x, LAYOUT).set(r.x)
        tune(t.y, LAYOUT).set(r.y)
        moving ||= !t.x.resting || !t.y.resting
      }
      t.placed = true
      drawTile(t)
    })
    rects = next
    if (pristine) {
      const f = fitTarget()
      if (f) {
        view = snapView(f, win.devicePixelRatio || 1)
        drawView()
      }
    }
    if (moving) loop.wake()
  }

  let relayoutQueued = 0
  const ro = new win.ResizeObserver((entries) => {
    let changed = false
    for (const e of entries) {
      const t = tiles.get((e.target as HTMLElement).dataset.id ?? "")
      if (!t || t.el !== e.target) continue
      const w = t.el.offsetWidth
      const h = t.el.offsetHeight
      if (w !== t.w || h !== t.h) {
        t.w = w
        t.h = h
        changed = true
      }
    }
    if (changed && !relayoutQueued)
      relayoutQueued = win.requestAnimationFrame(() => {
        relayoutQueued = 0
        relayout(true)
      })
  })
  const rootRo = new win.ResizeObserver(() => {
    const w = root.clientWidth
    const h = root.clientHeight
    if (w === vw && h === vh) return
    const was = { w: vw, h: vh }
    vw = w
    vh = h
    if (pristine) return relayout(false)
    // Keep what was in the middle in the middle.
    if (was.w && was.h) {
      const dx = (w - was.w) / 2
      const dy = (h - was.h) / 2
      if (jump)
        startJump(
          { x: jump.to.x + dx, y: jump.to.y + dy, scale: jump.to.scale },
          jump.t.omega === FIT.omega ? FIT : KEY,
        )
      view = { x: view.x + dx, y: view.y + dy, scale: view.scale }
      drawView()
    }
  })

  // ---- The frame loop -----------------------------------------------------------------------
  const frame = (dt: number) => {
    const t0 = performance.now()
    frames++
    let moving = false
    if (jump) {
      jump.t.step(dt)
      if (jump.t.resting) {
        view = jump.to
        jump = null
      } else {
        view = jump.path(Math.min(1, jump.t.x))
        moving = true
      }
      moved()
    }
    if (coast) {
      const decay = Math.exp(-dt / COAST_TAU)
      const travel = COAST_TAU * (1 - decay)
      let v: CanvasView = {
        x: view.x + coast.vx * travel,
        y: view.y + coast.vy * travel,
        scale: view.scale,
      }
      if (coast.vs) v = zoomAround(v, v.scale * Math.exp(coast.vs * travel), coast.at, minZoom, maxZoom)
      view = v
      coast.vx *= decay
      coast.vy *= decay
      coast.vs *= decay
      if (Math.hypot(coast.vx, coast.vy) < 10 && Math.abs(coast.vs) < 0.02) coast = null
      else moving = true
      moved()
    }
    drawView()
    for (const t of tiles.values())
      if (!t.x.resting || !t.y.resting) {
        t.x.step(dt)
        t.y.step(dt)
        drawTile(t)
        moving = true
      }
    times.push(performance.now() - t0)
    if (times.length > 600) times.splice(0, times.length - 600)
    return moving
  }
  const loop = frameLoop(win, frame)

  // ---- Jumps the hand didn't make -----------------------------------------------------------
  const pathLength = (a: CanvasView, b: CanvasView) =>
    Math.abs(Math.log(b.scale / a.scale)) + Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, vw, vh)
  const startJump = (to: CanvasView, m: { omega: number; zeta: number }) => {
    pristine = false
    coast = null
    if (reduced()) {
      jump = null
      setView(to)
      return
    }
    // Retargeted mid-flight, it carries on at the same speed along the new path.
    let v = 0
    if (jump) {
      const len = pathLength(view, to)
      if (len > 1e-6) v = clamp((jump.t.v * pathLength(jump.from, jump.to)) / len, 0, 40)
    }
    const t = new Spring(0, m.omega, m.zeta, 0.0005).set(1)
    t.v = v
    jump = { from: view, to, path: viewPath(view, to), t }
    moved()
    loop.wake()
  }
  const target = () => jump?.to ?? view
  const centre = (): CanvasPoint => ({ x: vw / 2, y: vh / 2 })

  // ---- The hand -----------------------------------------------------------------------------
  /** The hand takes over: whatever was moving stops where it is. */
  const grab = () => {
    pristine = false
    jump = null
    coast = null
  }
  const local = (e: { clientX: number; clientY: number }): CanvasPoint => {
    const r = root.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  let pointer: CanvasPoint | null = null
  let pinching = false

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1
    if (e.ctrlKey || e.metaKey) {
      if (pinching) return
      const dy = e.deltaY * k
      const at = local(e)
      // A trackpad's pinch (ctrl, small steps) follows 1:1; a mouse wheel's notch springs a step.
      if (Math.abs(dy) >= 40) {
        const from = target()
        startJump(zoomAround(from, from.scale * Math.exp(-dy * 0.0025), at, minZoom, maxZoom), NOTCH)
        return
      }
      grab()
      setView(zoomAround(view, view.scale * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0025)), at, minZoom, maxZoom))
      return
    }
    let dx = e.deltaX * k
    let dy = e.deltaY * k
    if (e.shiftKey && !dx) {
      dx = dy
      dy = 0
    }
    grab()
    setView({ x: view.x - dx, y: view.y - dy, scale: view.scale })
  }

  // Safari's trackpad pinch.
  let gestureScale = 1
  const onGesture = (e: Event) => {
    e.preventDefault()
    const g = e as Event & { scale: number; clientX: number; clientY: number }
    if (e.type === "gesturestart") {
      gestureScale = 1
      pinching = true
      grab()
      return
    }
    if (e.type === "gestureend") {
      pinching = false
      return
    }
    const at = g.clientX !== undefined ? local(g) : centre()
    setView(zoomAround(view, (view.scale * g.scale) / gestureScale, at, minZoom, maxZoom))
    gestureScale = g.scale
  }

  // Dragging: the page with the primary button, anywhere with Space or the middle button, one
  // finger on the page, two fingers anywhere (a pinch).
  type Drag = { id: number; last: CanvasPoint; samples: { x: number; y: number; t: number }[] }
  let drag: Drag | null = null
  const touches = new Map<number, CanvasPoint>()
  let pinch: { d: number; mid: CanvasPoint; samples: { x: number; y: number; t: number; s: number }[] } | null = null
  let space = false
  let spaceDragged = false
  let hovering = false

  /** What the last press landed on: a captured drag's clicks land on the canvas itself. */
  let pressed: Element | null = null
  const capped = (v: CanvasPoint) => {
    const speed = Math.hypot(v.x, v.y)
    return speed > MAX_FLING ? { x: (v.x / speed) * MAX_FLING, y: (v.y / speed) * MAX_FLING } : v
  }
  const onBackground = (target: EventTarget | null) => {
    const el = target as Element | null
    return !el?.closest?.(".knobs-canvas-card,.knobs-canvas-zoom")
  }
  const beginDrag = (e: PointerEvent, grabbing: boolean) => {
    grab()
    held = true
    drag = { id: e.pointerId, last: local(e), samples: [] }
    root.dataset.panning = ""
    if (space) spaceDragged = true
    if (grabbing) root.dataset.grabbing = ""
    try {
      root.setPointerCapture(e.pointerId)
    } catch {}
    moved()
  }
  const endDrag = (coastOn: boolean) => {
    const d = drag
    drag = null
    held = false
    delete root.dataset.panning
    delete root.dataset.grabbing
    if (!d) return
    const v = coastOn ? capped(releaseVelocity(d.samples, performance.now())) : { x: 0, y: 0 }
    if (Math.hypot(v.x, v.y) > 60) {
      coast = { vx: v.x, vy: v.y, vs: 0, at: centre() }
      loop.wake()
    }
    moved()
  }
  const spread = () => {
    const [a, b] = [...touches.values()]
    return a && b ? { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } } : null
  }

  const onPointerDown = (e: PointerEvent) => {
    pristine = false
    if (e.isPrimary) pressed = e.target as Element
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, local(e))
      if (touches.size === 2) {
        if (drag) endDrag(false)
        const s = spread()!
        grab()
        held = true
        pinch = { d: s.d, mid: s.mid, samples: [] }
        root.dataset.panning = ""
        for (const id of touches.keys())
          try {
            root.setPointerCapture(id)
          } catch {}
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (touches.size === 1 && onBackground(e.target)) beginDrag(e, false)
      return
    }
    const middle = e.button === 1
    if (!middle && e.button !== 0) return
    if (!middle && !space && !onBackground(e.target)) return
    e.preventDefault()
    if (!middle && onBackground(e.target)) root.focus({ preventScroll: true })
    beginDrag(e, middle || space)
  }
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "touch") pointer = local(e)
    if (touches.has(e.pointerId)) touches.set(e.pointerId, local(e))
    if (pinch) {
      const s = spread()
      if (!s) return
      let v = zoomAround(view, view.scale * (s.d / Math.max(1, pinch.d)), s.mid, minZoom, maxZoom)
      v = { x: v.x + s.mid.x - pinch.mid.x, y: v.y + s.mid.y - pinch.mid.y, scale: v.scale }
      pinch.d = s.d
      pinch.mid = s.mid
      pinch.samples.push({ x: s.mid.x, y: s.mid.y, t: performance.now(), s: Math.log(v.scale) })
      if (pinch.samples.length > 12) pinch.samples.shift()
      setView(v)
      return
    }
    if (!drag || drag.id !== e.pointerId) return
    const p = local(e)
    const dx = p.x - drag.last.x
    const dy = p.y - drag.last.y
    drag.last = p
    drag.samples.push({ x: p.x, y: p.y, t: performance.now() })
    if (drag.samples.length > 12) drag.samples.shift()
    setView({ x: view.x + dx, y: view.y + dy, scale: view.scale })
  }
  const onPointerUp = (e: PointerEvent) => {
    if (touches.delete(e.pointerId) && pinch) {
      if (touches.size < 2) {
        const p = pinch
        pinch = null
        held = false
        delete root.dataset.panning
        const now = performance.now()
        const v = capped(releaseVelocity(p.samples, now))
        const first = p.samples.find((s) => now - s.t <= 80) ?? p.samples[0]
        const last = p.samples.at(-1)
        const dt = first && last ? (last.t - first.t) / 1000 : 0
        const vs = dt > 0 && now - last!.t < 60 ? clamp((last!.s - first!.s) / dt, -4, 4) : 0
        if (Math.hypot(v.x, v.y) > 60 || Math.abs(vs) > 0.3) {
          coast = { vx: v.x, vy: v.y, vs, at: p.mid }
          loop.wake()
        }
        moved()
      }
      return
    }
    if (drag && drag.id === e.pointerId) endDrag(e.type === "pointerup")
  }

  const onDblClick = (e: MouseEvent) => {
    if (space) return
    const el = (e.target === root && pressed && root.contains(pressed) ? pressed : e.target) as Element
    const tileEl = el.closest?.<HTMLElement>(".knobs-canvas-tile")
    if (tileEl) {
      const card = el.closest(".knobs-canvas-card")
      if (card && (el.closest(INTERACTIVE) || isTypingTarget(el))) return
      const id = tileEl.dataset.id!
      const f = focusTarget(id)
      if (!f) return
      const t = target()
      const there =
        Math.abs(t.scale / f.scale - 1) < 0.02 && Math.abs(t.x - f.x) < 4 && Math.abs(t.y - f.y) < 4
      if (there) api.fit()
      else startJump(f, FIT)
      return
    }
    if (onBackground(el)) api.fit()
  }

  const keyAnchor = () => (hovering && pointer ? pointer : centre())
  const onKey = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return
    const a = keyAction(e)
    // ⌘1 is the browser's (the first tab); ⌘0, ⌘= and ⌘- zoom the canvas, not the page.
    if (!a || (a === "actual" && (e.metaKey || e.ctrlKey))) return
    e.preventDefault()
    e.stopPropagation()
    if (a === "fit") return api.fit()
    const from = target()
    const scale = a === "actual" ? 1 : a === "in" ? from.scale * KEY_ZOOM : from.scale / KEY_ZOOM
    startJump(zoomAround(from, scale, keyAnchor(), minZoom, maxZoom), KEY)
  }
  const spaceOwner = (e: KeyboardEvent) =>
    e.key === " " &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !isTypingTarget(e.target) &&
    (hovering || root.contains(doc.activeElement))
  // Space held pans. On a control inside an item, the key still presses it unless a drag
  // happened while it was down (controls act on the key's release).
  const onControl = () => {
    const el = doc.activeElement
    return !!el && el !== root && root.contains(el) && !!el.closest(INTERACTIVE)
  }
  const onDocKeyDown = (e: KeyboardEvent) => {
    if (!spaceOwner(e)) return
    if (!onControl()) e.preventDefault()
    if (space) return
    space = true
    spaceDragged = false
    root.dataset.space = ""
  }
  const endSpace = () => {
    space = false
    delete root.dataset.space
    if (!drag) delete root.dataset.grabbing
  }
  const onDocKeyUp = (e: KeyboardEvent) => {
    if (e.key !== " " || !space) return
    if (spaceDragged || !onControl()) e.preventDefault()
    endSpace()
  }

  root.addEventListener("wheel", onWheel, { passive: false })
  root.addEventListener("gesturestart", onGesture)
  root.addEventListener("gesturechange", onGesture)
  root.addEventListener("gestureend", onGesture)
  root.addEventListener("pointerdown", onPointerDown, { capture: true })
  root.addEventListener("pointermove", onPointerMove)
  root.addEventListener("pointerup", onPointerUp)
  root.addEventListener("pointercancel", onPointerUp)
  root.addEventListener("pointerenter", () => (hovering = true))
  root.addEventListener("pointerleave", () => {
    hovering = false
  })
  root.addEventListener("auxclick", (e) => e.button === 1 && e.preventDefault())
  root.addEventListener("dblclick", onDblClick)
  root.addEventListener("keydown", onKey)
  doc.addEventListener("keydown", onDocKeyDown, { capture: true })
  doc.addEventListener("keyup", onDocKeyUp, { capture: true })
  win.addEventListener("blur", endSpace)
  root.addEventListener("knobs-restyle", () => {
    measure()
    relayout(true)
  })

  const focusTarget = (id: string) => {
    const r = rects.get(id)
    if (!r || !vw || !vh) return null
    return fitView(r, vw, vh, { pad, min: minZoom, max: Math.min(maxZoom, FOCUS_MAX) })
  }

  // ---- First paint: everything measured and fitted before anything shows -------------------
  for (const it of items) mount(it, false)
  vw = root.clientWidth
  vh = root.clientHeight
  measure()
  relayout(false)
  rootRo.observe(root)
  drawView()

  const api: Canvas = {
    element: root,
    get view() {
      return view
    },
    get rects() {
      return rects
    },
    fit() {
      const f = fitTarget()
      if (f) startJump(f, FIT)
    },
    focus(id) {
      const f = focusTarget(id)
      if (f) startJump(f, FIT)
    },
    zoomTo(scale, at) {
      const from = target()
      startJump(zoomAround(from, scale, at ?? centre(), minZoom, maxZoom), KEY)
    },
    update(next) {
      const ids = new Set(next.map((it) => it.id))
      for (const t of [...tiles.values()]) if (!ids.has(t.id)) leave(t)
      for (const it of next) {
        const t = tiles.get(it.id)
        if (!t) {
          mount(it, true)
          continue
        }
        if (t.item.render !== it.render) {
          t.cleanup?.()
          t.card.replaceChildren()
          t.cleanup = it.render(t.card) || undefined
        }
        t.item = it
        setTitle(t)
        sizeCard(t)
      }
      items = next
      measure()
      relayout(true)
    },
    get moving() {
      return loop.running
    },
    stats() {
      const s = [...times].sort((a, b) => a - b)
      const q = (p: number) => Math.round((s[Math.floor(p * (s.length - 1))] ?? 0) * 1000) / 1000
      return { frames, p50: q(0.5), p95: q(0.95), max: q(1) }
    },
    dispose() {
      loop.stop()
      ro.disconnect()
      rootRo.disconnect()
      win.clearTimeout(settleTimer)
      if (relayoutQueued) win.cancelAnimationFrame(relayoutQueued)
      doc.removeEventListener("keydown", onDocKeyDown, { capture: true })
      doc.removeEventListener("keyup", onDocKeyUp, { capture: true })
      win.removeEventListener("blur", endSpace)
      for (const t of [...tiles.values(), ...leaving]) unmount(t)
      root.remove()
    },
  }
  return api
}
