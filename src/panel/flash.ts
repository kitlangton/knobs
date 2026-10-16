/**
 * A button's press flash: its wash brightens at once and eases out, so a command fired from a key
 * shows on the button it belongs to (Undo, Redo, Reset, Copy, Random, a group's die and reset).
 * The DOM runs it as a CSS animation (`data-k-flash`, see the styles); the GPU renderer draws the
 * same curve from `flashOf`.
 */
export const FLASH_MS = 320
const flashes = new WeakMap<Element, number>()

export function flash(button: HTMLElement | undefined, wake?: () => void) {
  if (!button || button.hidden) return
  flashes.set(button, button.ownerDocument.defaultView?.performance.now() ?? performance.now())
  // Two names for one animation: switching restarts it without a reflow.
  button.dataset.kFlash = button.dataset.kFlash === "a" ? "b" : "a"
  wake?.()
}

/**
 * How much of `button`'s flash is left at `now` (1 to 0): ease-out cubic, as the DOM's
 * `cubic-bezier(.33,1,.68,1)` from the flash back to the button's own wash.
 */
export function flashOf(button: Element, now: number) {
  const at = flashes.get(button)
  if (at === undefined) return 0
  const p = (now - at) / FLASH_MS
  if (p >= 1 || p < 0) return 0
  return (1 - p) ** 3
}
