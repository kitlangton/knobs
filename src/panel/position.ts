import { storageKey, type StoragePort } from "../core/storage.js"

/** Where a floating panel was left: `x` from the left edge, or from the right with `right`. */
export interface SavedPosition {
  readonly x: number
  readonly y: number
  readonly right?: boolean
}

/**
 * The position to keep for a panel dropped at `left`, `top`: a panel on the right half keeps its
 * distance from the right edge, so a wider or narrower window leaves it by the same edge.
 */
export function savedPosition(left: number, top: number, width: number, view: number) {
  const right = left + width / 2 > view / 2
  return right ? { x: view - left - width, y: top, right } : { x: left, y: top }
}

/** The left edge a saved position asks for in a `view` px wide window. */
export const leftOf = (saved: SavedPosition, width: number, view: number) =>
  saved.right ? view - width - saved.x : saved.x

/** Reads a saved position, or `undefined` for none (or one that isn't a position). */
export function readPosition(raw: string | null | undefined): SavedPosition | undefined {
  try {
    const saved = JSON.parse(raw ?? "null")
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y))
      return { x: saved.x, y: saved.y, ...(saved.right === true ? { right: true } : {}) }
  } catch {
    /* Position is optional; tuning and variant storage report their own errors. */
  }
  return undefined
}

export function positionPanel(
  panel: HTMLElement,
  header: HTMLElement,
  anchor: HTMLElement,
  id: string,
  storage: () => StoragePort | null,
) {
  const doc = panel.ownerDocument
  const win = doc.defaultView!
  const bounds = anchor.getBoundingClientRect()
  const w = panel.offsetWidth || 288
  const clampX = (v: number) => Math.max(8, Math.min(v, win.innerWidth - w - 8))
  let x = bounds.right + w <= win.innerWidth - 8 ? bounds.right + 8 : clampX(bounds.left - w - 8)
  let y = Math.max(8, bounds.top)
  const key = storageKey(id, "position")
  let saved: SavedPosition | undefined
  try {
    saved = readPosition(storage()?.getItem(key))
  } catch {
    /* Storage that refuses reads remembers nothing. */
  }
  if (saved) {
    x = leftOf(saved, w, win.innerWidth)
    y = saved.y
  } else {
    const others = [...doc.querySelectorAll<HTMLElement>(".knobs-panel:not(.knobs-inline)")]
      .filter((el) => el !== panel)
      .map((el) => el.getBoundingClientRect())
    if (others.length > 0) {
      const overlaps = (cx: number, cy: number) =>
        others.some((r) => Math.abs(cx - r.left) < w - 24 && Math.abs(cy - r.top) < 120)
      if (overlaps(x, y)) {
        const candidates = [
          bounds.right + 8,
          bounds.left - w - 8,
          bounds.left + 8,
          bounds.right - w - 8,
          ...others.flatMap((r) => [r.right + 12, r.left - w - 12]),
        ].map(clampX)
        const free = candidates.find((cx) => !overlaps(cx, y))
        if (free !== undefined) x = free
        else {
          x = clampX(x + others.length * 24)
          y = Math.max(8, y + others.length * 32)
        }
      }
    }
  }
  // x, y is where the panel wants to be; it shows clamped inside the viewport, so an editor
  // opening near the bottom lifts it and closing that editor lets it settle back. A panel left
  // by the right edge follows that edge when the window changes width.
  let shown = { x, y }
  const constrain = () => {
    if (saved && !drag) x = leftOf(saved, panel.offsetWidth, win.innerWidth)
    shown = {
      x: Math.max(8, Math.min(x, win.innerWidth - panel.offsetWidth - 8)),
      y: Math.max(8, Math.min(y, win.innerHeight - panel.offsetHeight - 8)),
    }
    panel.style.left = `${shown.x}px`
    panel.style.top = `${shown.y}px`
  }
  // The header carries the panel 1:1 with the pointer, and it stays where it's let go. A press
  // that doesn't move is a click: the pointer is captured only once it moves, so the click still
  // reaches the title (which takes focus to the panel).
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined
  header.onpointerdown = (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button,select,input")) return
    event.preventDefault()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: shown.x, top: shown.y }
  }
  header.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.id) return
    if (!("dragging" in panel.dataset)) {
      // Let go somewhere the header didn't hear: that press is over.
      if (!(event.buttons & 1)) return void (drag = undefined)
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= 2) return
      panel.dataset.dragging = ""
      header.setPointerCapture(event.pointerId)
    }
    x = drag.left + event.clientX - drag.x
    y = drag.top + event.clientY - drag.y
    constrain()
  }
  header.onpointerup = header.onpointercancel = () => {
    if (drag && !("dragging" in panel.dataset)) drag = undefined
  }
  header.onlostpointercapture = () => {
    if (!drag) return
    drag = undefined
    delete panel.dataset.dragging
    ;({ x, y } = shown)
    saved = savedPosition(x, y, panel.offsetWidth, win.innerWidth)
    try {
      storage()?.setItem(key, JSON.stringify(saved))
    } catch {
      /* Keep the live position. */
    }
  }
  const observer = new ResizeObserver(constrain)
  observer.observe(panel)
  win.addEventListener("resize", constrain)
  constrain()
  return {
    constrain,
    dispose() {
      observer.disconnect()
      win.removeEventListener("resize", constrain)
    },
  }
}
