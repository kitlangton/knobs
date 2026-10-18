import { Spring, springMotion } from "../core/spring.js"

/** Tabs replace content in place. Disclosures alone use the accordion/reveal motion.
 * Outgoing nodes keep their full geometry until transparent; shared rows never leave.
 * Height springs carry the surfaces, not one shrinking spring per row.
 */
export function tabTransition(body: HTMLElement, wake: () => void) {
  const win = body.ownerDocument.defaultView!
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)")
  const motion = (duration: number) => springMotion({ duration, bounce: 0 })
  const layout = motion(0.4)
  const sizes = new Map<HTMLElement, { height: Spring; original: string }>()
  const states = new Map<
    HTMLElement,
    {
      alpha: Spring
      opacity: string
      base: number
      inert: boolean
    }
  >()
  let wanted = new Map<HTMLElement, boolean>()
  let pending = false
  let raf = 0
  let then = 0
  let resizing = false

  const restore = (node: HTMLElement) => {
    const s = states.get(node)
    if (!s) return
    node.style.opacity = s.opacity
    node.inert = s.inert
    delete node.dataset.presence
    delete node.dataset.leaving
    delete node.dataset.tabOpacity
    states.delete(node)
  }
  const state = (node: HTMLElement, initial: number) => {
    let s = states.get(node)
    if (!s) {
      const { omega, zeta } = motion(0.16)
      s = {
        alpha: new Spring(initial, omega, zeta, 0.001),
        opacity: node.style.opacity,
        base: Number(win.getComputedStyle(node).opacity),
        inert: node.inert,
      }
      states.set(node, s)
    }
    return s
  }
  // If a whole card changes, fade it once, not once again for each of its rows.
  const outermost = (nodes: HTMLElement[]) =>
    nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)))
  const naturalHeight = () => {
    for (const [node, s] of sizes) node.style.height = s.original
    const targets = [...sizes.keys()].map((node) => node.getBoundingClientRect().height)
    ;[...sizes].forEach(([node, s], i) => {
      s.height.set(targets[i]!)
      node.style.height = `${s.height.x}px`
    })
    resizing = [...sizes.values()].some((s) => !s.height.resting)
  }
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, Math.max(0, (now - then) / 1000))
    then = now
    let moving = false
    for (const [node, s] of states) {
      const show = wanted.get(node) ?? !node.hidden
      const { omega, zeta } = motion(show ? 0.16 : 0.12)
      s.alpha.omega = omega
      s.alpha.zeta = zeta
      // Grow the surface before revealing rows beyond its old edge. On contraction
      // the new content already fits, so its entrance and the resize run together.
      const fits = [...sizes.values()].every((s) => s.height.x >= s.height.target - 0.5)
      s.alpha.set(show && fits ? 1 : 0)
      s.alpha.step(dt)
      const a = Math.max(0, Math.min(1, s.alpha.x))
      node.style.opacity = String(s.base * a)
      node.dataset.tabOpacity = String(a)
      if (!s.alpha.resting) moving = true
    }
    if (pending) {
      const leaving = [...states].some(
        ([node, s]) => wanted.get(node) === false && (!s.alpha.resting || s.alpha.x > 0),
      )
      if (!leaving) {
        const arrivals = outermost(
          [...wanted].filter(([n, show]) => show && n.hidden).map(([n]) => n),
        )
        for (const node of arrivals) {
          // Measure the original opacity with its ancestors open, while still at zero
          // for this paint. No cloned rows or duplicate interactive controls.
          node.hidden = false
          const s = state(node, 0)
          node.style.opacity = "0"
          node.dataset.tabOpacity = "0"
          node.dataset.presence = "in"
          s.alpha.snap(0)
        }
        for (const [node, show] of wanted) node.hidden = !show
        for (const [node] of states) if (!wanted.get(node)) restore(node)
        naturalHeight()
        pending = false
        moving = true
      }
    }
    if (resizing) {
      for (const [node, s] of sizes) {
        if (reduced.matches) s.height.snap(s.height.target)
        else s.height.step(dt)
        node.style.height = `${s.height.x}px`
      }
      resizing = [...sizes.values()].some((s) => !s.height.resting)
      moving ||= resizing
    }
    wake()
    if (moving || pending) raf = win.requestAnimationFrame(frame)
    else {
      for (const [node] of states) restore(node)
      for (const [node, s] of sizes) node.style.height = s.original
      sizes.clear()
      raf = 0
      wake()
    }
  }
  const finish = () => {
    win.cancelAnimationFrame(raf)
    for (const [node, show] of wanted) node.hidden = !show
    for (const [node] of states) restore(node)
    for (const [node, s] of sizes) node.style.height = s.original
    sizes.clear()
    pending = resizing = false
    raf = 0
  }
  return {
    get running() {
      return raf !== 0
    },
    finish,
    to(want: Map<HTMLElement, boolean>) {
      wanted = want
      if (!raf) {
        for (const node of [body, ...body.querySelectorAll<HTMLElement>(":scope > .knobs-card")]) {
          sizes.set(node, {
            height: new Spring(
              node.getBoundingClientRect().height,
              layout.omega,
              layout.zeta,
              0.02,
            ),
            original: node.style.height,
          })
        }
        then = win.performance.now()
      }
      const leaving = outermost([...want].filter(([n, show]) => !show && !n.hidden).map(([n]) => n))
      for (const node of leaving) state(node, 1)
      for (const [node, s] of states) {
        const show = want.get(node) ?? !node.hidden
        node.inert = !show || s.inert
        node.dataset.presence = show ? "in" : "out"
        if (!show) node.dataset.leaving = "true"
        else delete node.dataset.leaving
      }
      pending = true
      if (!raf) raf = win.requestAnimationFrame(frame)
      wake()
    },
  }
}
