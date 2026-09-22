import { storageKey, type StoragePort } from "../core/storage.js"

export function positionPanel(
  panel: HTMLElement,
  header: HTMLElement,
  anchor: HTMLElement,
  id: string,
  storage: () => StoragePort | null,
) {
  const win = panel.ownerDocument.defaultView!
  const bounds = anchor.getBoundingClientRect()
  let x = bounds.right + 8
  let y = bounds.top
  if (x + 310 > win.innerWidth - 8) x = Math.max(8, bounds.left - 318)
  const key = storageKey(id, "position")
  try {
    const saved = JSON.parse(storage()?.getItem(key) ?? "null")
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      x = saved.x
      y = saved.y
    }
  } catch {
    /* Position is optional; tuning and variant storage report their own errors. */
  }
  const constrain = () => {
    x = Math.max(8, Math.min(x, win.innerWidth - panel.offsetWidth - 8))
    y = Math.max(8, Math.min(y, win.innerHeight - panel.offsetHeight - 8))
    panel.style.left = `${x}px`
    panel.style.top = `${y}px`
  }
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined
  header.onpointerdown = (event) => {
    if (event.button !== 0 || (event.target as Element).closest("button,select,input")) return
    event.preventDefault()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: x, top: y }
    header.setPointerCapture(event.pointerId)
  }
  header.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.id) return
    x = drag.left + event.clientX - drag.x
    y = drag.top + event.clientY - drag.y
    constrain()
  }
  header.onlostpointercapture = () => {
    drag = undefined
    try {
      storage()?.setItem(key, JSON.stringify({ x, y }))
    } catch {
      /* Keep the live position. */
    }
  }
  const observer = new ResizeObserver(constrain)
  observer.observe(panel)
  win.addEventListener("resize", constrain)
  constrain()
  return () => {
    observer.disconnect()
    win.removeEventListener("resize", constrain)
  }
}
