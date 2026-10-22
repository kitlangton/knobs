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

/**
 * Tells `report` what the pointer or focus is on in `root` (see `activeReporter`), resolving the
 * element under them with `resolve`. Focus in one of the panel's menus (they live on the body)
 * keeps the row that opened it. Returns a cleanup.
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
  const inside = (node: EventTarget | null) => node instanceof Node && root.contains(node)
  const over = (e: PointerEvent) => reporter.pointer(e.target as Element)
  const out = (e: PointerEvent) => {
    if (!inside(e.relatedTarget)) reporter.pointer(null)
  }
  const focusIn = (e: FocusEvent) => {
    const target = e.target as Element
    if (inside(target)) reporter.focus(target)
    else if (!(target instanceof Element && target.closest(".knobs-menu"))) reporter.focus(null)
  }
  // Focus going nowhere (the window losing it, a row removed) fires no focusin.
  const focusOut = (e: FocusEvent) => {
    if (e.relatedTarget === null) reporter.focus(null)
  }
  root.addEventListener("pointerover", over)
  root.addEventListener("pointerout", out)
  root.addEventListener("focusout", focusOut)
  doc.addEventListener("focusin", focusIn)
  if (inside(doc.activeElement)) reporter.focus(doc.activeElement)
  return {
    dispose() {
      root.removeEventListener("pointerover", over)
      root.removeEventListener("pointerout", out)
      root.removeEventListener("focusout", focusOut)
      doc.removeEventListener("focusin", focusIn)
      reporter.dispose()
    },
  }
}
