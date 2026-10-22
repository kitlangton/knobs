import type { PanelActive } from "../core/store.js"

const same = (a: PanelActive | null, b: PanelActive | null) =>
  a === b || (a !== null && b !== null && a.group === b.group && a.key === b.key)

/**
 * What's active in a panel, from where the pointer is and where focus is, each told as it moves.
 * Whichever last moved onto something leads; while it's on nothing (or off the panel), the
 * other's target stands. `report` hears the result at most once a frame (`schedule`), and never
 * the same value twice in a row.
 */
export function activeReporter<T>(
  resolve: (target: T | null) => PanelActive | null,
  report: (at: PanelActive | null) => void,
  schedule: (flush: () => void) => () => void,
) {
  let hover: T | null = null
  let focus: T | null = null
  let lead: "pointer" | "focus" = "pointer"
  let last: PanelActive | null = null
  let cancel: (() => void) | undefined
  const flush = () => {
    cancel = undefined
    const [first, second] = lead === "pointer" ? [hover, focus] : [focus, hover]
    const at = resolve(first) ?? resolve(second)
    if (same(at, last)) return
    last = at
    report(at)
  }
  const touch = () => {
    cancel ??= schedule(flush)
  }
  return {
    pointer(target: T | null) {
      hover = target
      if (target !== null) lead = "pointer"
      touch()
    },
    focus(target: T | null) {
      focus = target
      if (target !== null) lead = "focus"
      touch()
    },
    /** Stops listening; what was active is no longer, so a last `null` is reported. */
    dispose() {
      cancel?.()
      cancel = undefined
      hover = focus = null
      if (last !== null) report((last = null))
    },
  }
}

/** Where an event's node is: in the panel, in one of its menus (on the body), or elsewhere. */
export type ActiveWhere = "inside" | "menu" | "outside"

/**
 * The panel's pointer and focus events, told to `reporter` (see `activeReporter`). Focus that
 * moves into one of the panel's menus keeps the row that opened it until it comes back, moves
 * elsewhere, or leaves the menu for nowhere (a blur, the menu closing without handing it back).
 * A pointer that moves (not just one the page scrolled under) takes the lead back from focus.
 */
export function activeEvents<T>(
  reporter: { pointer(target: T | null): void; focus(target: T | null): void },
  where: (node: T | null) => ActiveWhere,
) {
  let inMenu = false
  return {
    over(e: { readonly target: T | null }) {
      reporter.pointer(e.target)
    },
    move(e: { readonly target: T | null; readonly movementX: number; readonly movementY: number }) {
      if (e.movementX || e.movementY) reporter.pointer(e.target)
    },
    out(e: { readonly relatedTarget: T | null }) {
      if (where(e.relatedTarget) !== "inside") reporter.pointer(null)
    },
    /** On the document: focus arriving anywhere. */
    focusIn(e: { readonly target: T | null }) {
      const at = where(e.target)
      inMenu = at === "menu"
      if (at === "inside") reporter.focus(e.target)
      else if (at === "outside") reporter.focus(null)
    },
    /** On the document: focus going nowhere (the window losing it, a blur) fires no focusin. */
    focusOut(e: { readonly target: T | null; readonly relatedTarget: T | null }) {
      if (e.relatedTarget !== null) return
      const at = where(e.target)
      if (at === "inside" || (at === "menu" && inMenu)) {
        inMenu = false
        reporter.focus(null)
      }
    },
  }
}

/**
 * Tells `report` what the pointer or focus is on in `root` (see `activeReporter` and
 * `activeEvents`), resolving the element under them with `resolve`. Returns a cleanup.
 */
export function watchActive(
  root: HTMLElement,
  resolve: (node: Element | null) => PanelActive | null,
  report: (at: PanelActive | null) => void,
): { dispose(): void } {
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const reporter = activeReporter<Element>(resolve, report, (flush) => {
    const id = win.requestAnimationFrame(flush)
    return () => win.cancelAnimationFrame(id)
  })
  const events = activeEvents<Element>(reporter, (node) =>
    node instanceof Node && root.contains(node)
      ? "inside"
      : node instanceof Element && node.closest(".knobs-menu")
        ? "menu"
        : "outside",
  )
  // Every node these events name is an Element (or null).
  const el = (node: EventTarget | null) => node as Element | null
  const over = (e: PointerEvent) => events.over({ target: el(e.target) })
  const move = (e: PointerEvent) =>
    events.move({ target: el(e.target), movementX: e.movementX, movementY: e.movementY })
  const out = (e: PointerEvent) => events.out({ relatedTarget: el(e.relatedTarget) })
  const focusIn = (e: FocusEvent) => events.focusIn({ target: el(e.target) })
  const focusOut = (e: FocusEvent) =>
    events.focusOut({ target: el(e.target), relatedTarget: el(e.relatedTarget) })
  root.addEventListener("pointerover", over)
  root.addEventListener("pointermove", move)
  root.addEventListener("pointerout", out)
  doc.addEventListener("focusin", focusIn)
  doc.addEventListener("focusout", focusOut)
  if (doc.activeElement && root.contains(doc.activeElement)) reporter.focus(doc.activeElement)
  return {
    dispose() {
      root.removeEventListener("pointerover", over)
      root.removeEventListener("pointermove", move)
      root.removeEventListener("pointerout", out)
      doc.removeEventListener("focusin", focusIn)
      doc.removeEventListener("focusout", focusOut)
      reporter.dispose()
    },
  }
}
