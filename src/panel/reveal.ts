const EASE_OUT = "cubic-bezier(.2,.8,.2,1)"
const EASE_IN = "cubic-bezier(.4,0,.8,.4)"

/**
 * Shows or hides an in-flow element by animating its height (and margins/padding) open or shut,
 * so the content below glides instead of jumping. Interruptible: reversing mid-flight continues
 * from the current height.
 */
export function reveal(node: HTMLElement, show: boolean, after?: () => void) {
  const win = node.ownerDocument.defaultView!
  const leaving = node.dataset.leaving === "true"
  if (show && !node.hidden && !leaving) return after?.()
  if (!show && (node.hidden || leaving)) return
  const fromHeight = node.hidden ? 0 : node.getBoundingClientRect().height
  const fromOpacity = node.hidden ? 0 : Number(win.getComputedStyle(node).opacity)
  for (const a of node.getAnimations()) a.cancel()
  node.hidden = false
  delete node.dataset.leaving
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    node.hidden = !show
    return after?.()
  }
  const cs = win.getComputedStyle(node)
  const height = node.getBoundingClientRect().height
  const open: Keyframe = {
    height: `${height}px`,
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    opacity: 1,
  }
  const f = height > 0 ? Math.min(1, fromHeight / height) : 0
  const scaled = (v: string) => `${(parseFloat(v) || 0) * f}px`
  const current: Keyframe = {
    height: `${fromHeight}px`,
    marginTop: scaled(cs.marginTop),
    marginBottom: scaled(cs.marginBottom),
    paddingTop: scaled(cs.paddingTop),
    paddingBottom: scaled(cs.paddingBottom),
    opacity: fromOpacity,
  }
  const closed: Keyframe = {
    height: "0px",
    marginTop: "0px",
    marginBottom: "0px",
    paddingTop: "0px",
    paddingBottom: "0px",
    opacity: 0,
  }
  node.style.overflow = "hidden"
  if (!show) node.dataset.leaving = "true"
  const animation = node.animate([current, show ? open : closed], {
    duration: show ? 240 : 170,
    easing: show ? EASE_OUT : EASE_IN,
  })
  animation.onfinish = () => {
    node.style.overflow = ""
    if (!show) {
      node.hidden = true
      delete node.dataset.leaving
    }
    after?.()
  }
}
