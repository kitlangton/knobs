// selectionPill(container, { selected }): the one move for a highlight that travels between rows
// (segmented bars, tabs, a file tree, an outline, a chapter list). A fill slides to the selected
// row on the state spring (or `spring`), taking that row's box and corner radius as it goes; a bright copy of the
// rows under it is clipped to the pill, so the text stays sharp and changes colour exactly where
// the pill's edge passes, instead of every row crossfading. With nothing selected the pill fades
// out where it is, and the next selection lands there without travelling from a stale place.
// Nothing moves on first paint; with reduced motion it lands on its row.
import { SPRINGS } from "../core/motion.js"
import { Spring, springMotion, type SpringValue } from "../core/spring.js"
import { frameLoop, injectUiStyles, reducedMotion } from "./look.js"

/** A box in the container's coordinates (its padding box, scrolled content included). */
export interface PillBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface SelectionPillOptions {
  /** The selected row, or null for none. Read on `update()`. */
  selected(): HTMLElement | null
  /**
   * The rows the pill moves between, for the bright copy. The container's own children by
   * default (the pill's parts left out).
   */
  rows?(): Iterable<HTMLElement>
  /** A row's corner radius (px); its computed `border-top-left-radius` by default. */
  radius?(row: HTMLElement): number
  /** The bright copy of the rows clipped to the pill (true). */
  copy?: boolean
  /**
   * The copy's text colour (`var(--_k-fg)`), set on each copied row; a row's parts with colours
   * of their own keep them unless you restyle them under `.knobs-pick-copy`.
   */
  color?: string
  /** The spring it travels on (`SPRINGS.default`, the state spring); 1.4× as long past 400 px. */
  spring?: SpringValue
}

export interface SelectionPill {
  /** The fill. */
  readonly element: HTMLElement
  /**
   * Reads the selection and the rows again (after a click, a key, new content). The pill travels
   * to a new row; `snap` lands it there instead (content swapped wholesale, a row that moved with
   * its list).
   */
  update(options?: { readonly snap?: boolean }): void
  dispose(): void
}

/** The state spring for a trip of `distance` px, 1.4× as long past 400 px. */
export function pillSpring(distance: number, base: SpringValue = SPRINGS.default): SpringValue {
  return distance > 400 ? { duration: base.duration * 1.4, bounce: base.bounce } : base
}

/** Where `row` sits in `container`'s coordinates, from their client rects and its scroll. */
export function pillBoxOf(
  row: { left: number; top: number; width: number; height: number },
  container: {
    left: number
    top: number
    scrollLeft: number
    scrollTop: number
    clientLeft: number
    clientTop: number
  },
): PillBox {
  return {
    x: row.left - container.left - container.clientLeft + container.scrollLeft,
    y: row.top - container.top - container.clientTop + container.scrollTop,
    w: row.width,
    h: row.height,
  }
}

/**
 * The radius on the way from one row to the next: it follows the height when the rows differ in
 * height (so the pill keeps each row's proportion), else the trip's progress `k`.
 */
export function pillRadius(
  from: { readonly h: number; readonly r: number },
  to: { readonly h: number; readonly r: number },
  h: number,
  k: number,
): number {
  const t =
    Math.abs(to.h - from.h) > 0.5 ? (h - from.h) / (to.h - from.h) : Number.isFinite(k) ? k : 1
  return from.r + (to.r - from.r) * Math.min(1, Math.max(0, t))
}

/** How far along a trip from `from` to `to` the box `at` is (1 when there's no trip). */
export function pillProgress(from: PillBox, to: PillBox, at: PillBox): number {
  const d = Math.hypot(to.x - from.x, to.y - from.y)
  if (d < 0.5) return 1
  const p = ((at.x - from.x) * (to.x - from.x) + (at.y - from.y) * (to.y - from.y)) / (d * d)
  return Math.min(1, Math.max(0, p))
}

export type PillPlan =
  | { readonly kind: "hide" }
  | { readonly kind: "stay" }
  | { readonly kind: "land"; readonly box: PillBox }
  | {
      readonly kind: "travel"
      readonly box: PillBox
      readonly spring: SpringValue
    }

/**
 * What the pill does next. Nothing selected: it fades out in place. Shown for the first time, after
 * a fade-out, on first paint, with reduced motion or asked to snap: it lands on the row. Otherwise
 * it travels there from wherever it is (mid-trip included), on a spring for the distance.
 */
export function planPill(
  state: {
    readonly shown: boolean
    readonly at: PillBox | null
    readonly target: PillBox | null
  },
  next: PillBox | null,
  flags: {
    readonly first?: boolean
    readonly reduced?: boolean
    readonly snap?: boolean
    readonly spring?: SpringValue
  } = {},
): PillPlan {
  if (!next) return { kind: "hide" }
  if (!state.shown || !state.at || flags.first || flags.reduced || flags.snap)
    return { kind: "land", box: next }
  const t = state.target
  if (t && t.x === next.x && t.y === next.y && t.w === next.w && t.h === next.h)
    return { kind: "stay" }
  const d = Math.hypot(next.x - state.at.x, next.y - state.at.y)
  return { kind: "travel", box: next, spring: pillSpring(d, flags.spring) }
}

/** Whether two boxes overlap. */
export const boxesMeet = (a: PillBox, b: PillBox) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** The box around both. */
export const boxUnion = (a: PillBox, b: PillBox): PillBox => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

/** Two-edge snap on 1/64 px, so an edge that stays put never jiggles as the other moves. */
const grid = (v: number) => Math.round(v * 64) / 64

/**
 * The selection pill over `container`'s rows. The container is positioned if it isn't; its rows
 * may be anywhere in it (flex children, absolutely placed, scrolled), as the pill measures them.
 */
export function selectionPill(
  container: HTMLElement,
  options: SelectionPillOptions,
): SelectionPill {
  const doc = container.ownerDocument
  const win = doc.defaultView!
  injectUiStyles(doc)
  if (win.getComputedStyle(container).position === "static") container.style.position = "relative"
  const pill = doc.createElement("i")
  pill.className = "knobs-pick-pill"
  pill.setAttribute("aria-hidden", "true")
  pill.dataset.off = ""
  const copyOn = options.copy !== false
  const copy = doc.createElement("div")
  copy.className = "knobs-pick-copy"
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  copy.dataset.off = ""
  const copyRows = doc.createElement("div")
  copyRows.className = "knobs-pick-copy-rows"
  copy.append(copyRows)
  container.prepend(pill)
  if (copyOn) container.append(copy)

  const { omega, zeta } = springMotion(options.spring ?? SPRINGS.default)
  const springs = [0, 0, 0, 0].map(() => new Spring(0, omega, zeta, 0.01))
  const [sx, sy, sw, sh] = springs as [Spring, Spring, Spring, Spring]
  let shown = false
  let first = true
  let target: PillBox | null = null
  let from: PillBox = { x: 0, y: 0, w: 0, h: 0 }
  let fromR = 0
  let toR = 0
  /** The rows and their boxes at the last update, for the copy. */
  let rowBoxes: { row: HTMLElement; box: PillBox }[] = []
  const clones = new Map<HTMLElement, HTMLElement>()
  let disposed = false

  const radiusOf = (row: HTMLElement) =>
    options.radius?.(row) ?? (Number.parseFloat(win.getComputedStyle(row).borderTopLeftRadius) || 0)
  const rowsNow = (): HTMLElement[] =>
    options.rows
      ? [...options.rows()]
      : ([...container.children] as HTMLElement[]).filter((n) => n !== pill && n !== copy)
  const measure = (row: HTMLElement): PillBox => {
    const c = container.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    return pillBoxOf(r, {
      left: c.left,
      top: c.top,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
      clientLeft: container.clientLeft,
      clientTop: container.clientTop,
    })
  }
  const at = (): PillBox => ({ x: sx.x, y: sy.x, w: sw.x, h: sh.x })

  /** Copies of the rows the trip passes over, in the container's coordinates. */
  const syncCopy = (span: PillBox) => {
    if (!copyOn) return
    const keep = new Set<HTMLElement>()
    for (const { row, box } of rowBoxes) {
      if (!boxesMeet(box, span)) continue
      keep.add(row)
      let n = clones.get(row)
      if (!n) {
        n = row.cloneNode(true) as HTMLElement
        n.removeAttribute("id")
        for (const d of n.querySelectorAll("[id]")) d.removeAttribute("id")
        clones.set(row, n)
        copyRows.append(n)
      }
      const s = n.style
      s.position = "absolute"
      s.inset = "auto"
      s.left = `${box.x}px`
      s.top = `${box.y}px`
      s.width = `${box.w}px`
      s.height = `${box.h}px`
      s.margin = "0"
      s.transform = "none"
      s.clipPath = ""
      s.opacity = ""
      s.boxSizing = "border-box"
      s.color = options.color ?? "var(--_k-fg)"
    }
    for (const [row, n] of clones)
      if (!keep.has(row)) {
        n.remove()
        clones.delete(row)
      }
  }

  const paint = () => {
    const b = at()
    const x0 = grid(b.x)
    const y0 = grid(b.y)
    const w = grid(b.x + b.w) - x0
    const h = grid(b.y + b.h) - y0
    const r = target
      ? pillRadius(
          { h: from.h, r: fromR },
          { h: target.h, r: toR },
          b.h,
          pillProgress(from, target, b),
        )
      : toR
    const radius = `${Math.max(0, Math.min(r, h / 2, w / 2)).toFixed(2)}px`
    for (const n of copyOn ? [pill, copy] : [pill]) {
      n.style.transform = `translate3d(${x0}px,${y0}px,0)`
      n.style.width = `${w}px`
      n.style.height = `${h}px`
      n.style.borderRadius = radius
    }
    if (copyOn) copyRows.style.transform = `translate3d(${-x0}px,${-y0}px,0)`
  }

  const loop = frameLoop(win, (dt) => {
    for (const s of springs) s.step(dt)
    paint()
    return springs.some((s) => !s.resting)
  })

  const show = (on: boolean) => {
    shown = on
    pill.toggleAttribute("data-off", !on)
    copy.toggleAttribute("data-off", !on)
    container.toggleAttribute("data-pick-empty", !on)
  }

  const update = (o?: { readonly snap?: boolean }) => {
    if (disposed) return
    const row = options.selected()
    const next = row?.isConnected ? measure(row) : null
    const plan = planPill({ shown, at: shown ? at() : null, target }, next, {
      first,
      reduced: reducedMotion(win),
      ...(o?.snap ? { snap: true } : {}),
      ...(options.spring ? { spring: options.spring } : {}),
    })
    first = false
    // The copy is taken afresh: a row's content or state may have changed.
    for (const n of clones.values()) n.remove()
    clones.clear()
    rowBoxes = copyOn
      ? rowsNow()
          .filter((r) => r.isConnected)
          .map((r) => ({ row: r, box: measure(r) }))
      : []
    if (plan.kind === "hide") {
      if (shown) show(false)
      return
    }
    if (plan.kind === "stay") {
      syncCopy(boxUnion(at(), target!))
      return
    }
    const r = radiusOf(row!)
    if (plan.kind === "land") {
      sx.snap(plan.box.x)
      sy.snap(plan.box.y)
      sw.snap(plan.box.w)
      sh.snap(plan.box.h)
      from = plan.box
      fromR = r
      toR = r
      target = plan.box
      syncCopy(plan.box)
      paint()
      loop.stop()
      if (!shown) show(true)
      return
    }
    const m = springMotion(plan.spring)
    for (const s of springs) {
      s.omega = m.omega
      s.zeta = m.zeta
    }
    const now = at()
    // The radius where it is now, so a retarget mid-trip carries on from the shape on screen.
    fromR = target
      ? pillRadius(
          { h: from.h, r: fromR },
          { h: target.h, r: toR },
          now.h,
          pillProgress(from, target, now),
        )
      : r
    from = now
    toR = r
    target = plan.box
    sx.set(plan.box.x)
    sy.set(plan.box.y)
    sw.set(plan.box.w)
    sh.set(plan.box.h)
    syncCopy(boxUnion(now, plan.box))
    loop.wake()
  }

  // The container resizing moves its rows with it: the pill follows at once.
  const ro = "ResizeObserver" in win ? new win.ResizeObserver(() => update({ snap: true })) : null
  ro?.observe(container)
  update()

  return {
    element: pill,
    update,
    dispose() {
      disposed = true
      loop.stop()
      ro?.disconnect()
      pill.remove()
      copy.remove()
      container.removeAttribute("data-pick-empty")
    },
  }
}
