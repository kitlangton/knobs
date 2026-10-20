import { Spring, springMotion } from "../core/spring.js"
import { SPRINGS } from "../core/motion.js"

/** Layout moves and the surface's height: Kit's "default" spring. */
const LAYOUT = springMotion(SPRINGS.default)
/** Arrivals fade in a little slower than leavers fade out. */
const IN = springMotion({ duration: 0.2, bounce: 0 })
const OUT = springMotion({ duration: 0.14, bounce: 0 })
/** Between one arriving block and the next (ms), and how many get their own step. */
const STAGGER = 18
const STAGGER_MAX = 6
/** How far an arriving block rises as it fades in (px). */
const RISE = 6

interface Leaver {
  readonly alpha: Spring
  readonly base: number
  readonly style: string
  readonly inert: boolean
}
interface Arrival {
  readonly alpha: Spring
  readonly base: number
  readonly at: number
}

/**
 * A tab change, as one layout animation: what leaves fades out where it stood (lifted out of the
 * flow, so it takes no room), what arrives fades in block by block with a small rise, what stays
 * glides to its new place, and the surface (and any card whose rows change) springs to its new
 * height. Every spring keeps its position and velocity when another tab is picked mid-flight.
 *
 * While the pointer stays on the panel the surface never shrinks: a panel anchored at its foot
 * (or centred) would otherwise move its tabs out from under the pointer between two clicks. It
 * settles to its size once the pointer leaves.
 */
export function tabTransition(body: HTMLElement, root: HTMLElement, wake: () => void) {
  const win = body.ownerDocument.defaultView!
  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)")
  const leavers = new Map<HTMLElement, Leaver>()
  const arrivals = new Map<HTMLElement, Arrival>()
  const moves = new Map<HTMLElement, Spring>()
  const heights = new Map<HTMLElement, { spring: Spring; style: string }>()
  let wanted = new Map<HTMLElement, boolean>()
  let raf = 0
  let then = 0
  /** The tallest the surface has been since the pointer came onto the panel (0: not holding). */
  let held = 0

  const spring = (x: number, m: { omega: number; zeta: number }, eps: number) =>
    new Spring(x, m.omega, m.zeta, eps)
  const opacityOf = (node: HTMLElement) => Number(win.getComputedStyle(node).opacity) || 1
  const outermost = (nodes: HTMLElement[]) =>
    nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)))
  const showing = (node: HTMLElement) => !node.hidden && !leavers.has(node)
  /** What can move on its own: the body's blocks, and the rows of the cards among them. */
  const units = () => {
    const out: HTMLElement[] = []
    for (const child of body.children as HTMLCollectionOf<HTMLElement>) {
      if (child.hidden || leavers.has(child)) continue
      out.push(child)
      if (child.classList.contains("knobs-card"))
        for (const row of child.children as HTMLCollectionOf<HTMLElement>)
          if (!row.hidden && !leavers.has(row)) out.push(row)
    }
    return out
  }
  /** A unit's top, relative to what it moves within (so a row's count apart from its card's). */
  const topOf = (node: HTMLElement) => {
    const r = node.getBoundingClientRect().top
    const parent = node.parentElement!
    return parent === body
      ? r - body.getBoundingClientRect().top
      : r - parent.getBoundingClientRect().top
  }
  const sized = () =>
    [
      body,
      ...[...(body.children as HTMLCollectionOf<HTMLElement>)].filter(
        (c) => c.classList.contains("knobs-card") && !c.hidden && !leavers.has(c),
      ),
    ] as HTMLElement[]
  const insideLeaver = (node: HTMLElement) =>
    [...leavers.keys()].some((l) => l !== node && l.contains(node))

  const paint = (node: HTMLElement, alpha: number, base: number) => {
    const a = Math.max(0, Math.min(1, alpha))
    node.style.opacity = String(base * a)
    node.dataset.tabOpacity = String(a)
  }
  const lift = (node: HTMLElement) => {
    // Out of the flow where it stands, at its width; it keeps its look while it fades.
    const { offsetLeft: left, offsetWidth: width } = node
    const top = node.offsetTop + (moves.get(node)?.x ?? 0)
    // Its own style, without this transition's paint (a fade or glide it was in the middle of).
    node.style.removeProperty("opacity")
    node.style.removeProperty("translate")
    moves.delete(node)
    const style = node.getAttribute("style") ?? ""
    const base = arrivals.get(node)?.base ?? opacityOf(node)
    const alpha = arrivals.get(node)?.alpha.x ?? 1
    arrivals.delete(node)
    node.style.position = "absolute"
    node.style.top = `${top}px`
    node.style.left = `${left}px`
    node.style.width = `${width}px`
    node.style.margin = "0"
    node.style.pointerEvents = "none"
    node.style.removeProperty("translate")
    const s = spring(alpha, OUT, 0.002)
    leavers.set(node, { alpha: s, base, style, inert: node.inert })
    node.inert = true
    node.dataset.presence = "out"
    node.dataset.leaving = "true"
    paint(node, alpha, base)
  }
  const drop = (node: HTMLElement, hide: boolean) => {
    const l = leavers.get(node)
    if (!l) return
    leavers.delete(node)
    node.setAttribute("style", l.style)
    if (!node.getAttribute("style")) node.removeAttribute("style")
    node.inert = l.inert
    delete node.dataset.presence
    delete node.dataset.leaving
    delete node.dataset.tabOpacity
    if (!hide) return
    node.hidden = true
    // What it held takes the visibility it was waiting to take.
    for (const [n, show] of wanted) if (n !== node && node.contains(n)) n.hidden = !show
  }
  const settle = (node: HTMLElement) => {
    arrivals.delete(node)
    node.style.removeProperty("opacity")
    node.style.removeProperty("translate")
    delete node.dataset.presence
    delete node.dataset.tabOpacity
  }
  const naturalHeights = () => {
    const nodes = sized()
    for (const n of nodes) {
      const h = heights.get(n)
      if (h) n.style.height = h.style
    }
    body.style.removeProperty("min-height")
    return new Map(nodes.map((n) => [n, n.getBoundingClientRect().height]))
  }
  /** Back to the page's own styles once nothing moves (a hold keeps only a min-height). */
  const rest = () => {
    if (leavers.size || arrivals.size || moves.size || heights.size) return
    body.style.removeProperty("position")
    body.style.removeProperty("overflow")
    body.style.removeProperty("overflow-clip-margin")
    if (held) body.style.minHeight = `${held}px`
  }

  const frame = (now: number) => {
    const dt = Math.min(1 / 30, Math.max(0, (now - then) / 1000))
    then = now
    let moving = false
    for (const [node, l] of leavers) {
      l.alpha.set(0)
      l.alpha.step(dt)
      paint(node, l.alpha.x, l.base)
      if (l.alpha.resting || l.alpha.x <= 0) drop(node, true)
      else moving = true
    }
    for (const [node, a] of arrivals) {
      if (now >= a.at) a.alpha.set(1)
      a.alpha.step(dt)
      paint(node, a.alpha.x, a.base)
      if (a.alpha.resting && a.alpha.x >= 1) settle(node)
      else moving = true
    }
    for (const [node, s] of moves) {
      s.step(dt)
      if (s.resting && Math.abs(s.x) < 0.05) {
        moves.delete(node)
        node.style.removeProperty("translate")
      } else {
        node.style.translate = `0 ${s.x.toFixed(2)}px`
        moving = true
      }
    }
    for (const [node, h] of heights) {
      h.spring.step(dt)
      node.style.height = `${h.spring.x.toFixed(2)}px`
      if (!h.spring.resting) moving = true
      else {
        node.style.height = h.style
        heights.delete(node)
      }
    }
    // The next frame is asked for first: a host's redraw that throws can't stall the motion.
    raf = moving ? win.requestAnimationFrame(frame) : 0
    if (!moving) rest()
    wake()
  }
  const run = () => {
    if (raf) return
    then = win.performance.now()
    raf = win.requestAnimationFrame(frame)
  }

  const release = () => {
    if (!held) return
    held = 0
    const h = heights.get(body)
    const was = body.getBoundingClientRect().height
    if (h) body.style.height = h.style
    body.style.removeProperty("min-height")
    const to = body.getBoundingClientRect().height
    if (h) h.spring.set(to)
    else if (Math.abs(was - to) >= 0.5)
      heights.set(body, { spring: spring(was, LAYOUT, 0.05).set(to), style: body.style.height })
    else return
    body.style.height = `${was}px`
    run()
  }
  root.addEventListener("pointerleave", release)

  const finish = () => {
    win.cancelAnimationFrame(raf)
    raf = 0
    for (const node of [...leavers.keys()]) drop(node, wanted.get(node) === false)
    for (const node of [...arrivals.keys()]) settle(node)
    for (const node of moves.keys()) node.style.removeProperty("translate")
    moves.clear()
    for (const [node, h] of heights) node.style.height = h.style
    heights.clear()
    held = 0
    body.style.removeProperty("min-height")
    rest()
  }

  return {
    get running() {
      return raf !== 0 || leavers.size > 0
    },
    finish,
    to(want: Map<HTMLElement, boolean>) {
      wanted = want
      // Reduced motion: no travel or growth, only the fades.
      const still = reduced.matches
      // Leavers stand inside the surface; they're nearly gone by the time its edge reaches them.
      body.style.position = "relative"
      body.style.overflow = "clip"
      body.style.overflowClipMargin = "8px"
      // First: where everything is now, as seen (mid-flight included).
      const before = new Map(units().map((n) => [n, topOf(n)]))
      const visualHeights = new Map(sized().map((n) => [n, n.getBoundingClientRect().height]))
      if (!still && (held || root.matches(":hover")))
        held = Math.max(held, visualHeights.get(body) ?? 0)

      // What leaves lifts out where it stands; what comes back rejoins the flow at its fade.
      const leaving = outermost(
        [...want].filter(([n, show]) => !show && showing(n)).map(([n]) => n),
      )
      for (const node of leaving) lift(node)
      for (const [node, l] of [...leavers]) {
        if (want.get(node) !== true) continue
        const alpha = l.alpha.x
        drop(node, false)
        arrivals.set(node, { alpha: spring(alpha, IN, 0.002), base: l.base, at: 0 })
        node.dataset.presence = "in"
        paint(node, alpha, l.base)
      }
      const coming = outermost(
        [...want].filter(([n, show]) => show && n.hidden).map(([n]) => n),
      ).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      const now = win.performance.now()
      coming.forEach((node, i) => {
        node.hidden = false
        const base = opacityOf(node)
        arrivals.set(node, {
          alpha: spring(0, IN, 0.002),
          base,
          at: now + Math.min(i, STAGGER_MAX) * STAGGER,
        })
        node.dataset.presence = "in"
        paint(node, 0, base)
      })
      for (const [node, show] of want)
        if (!leavers.has(node) && !insideLeaver(node)) node.hidden = !show

      // Last: the new layout, without this transition's own offsets and heights.
      for (const node of moves.keys()) node.style.removeProperty("translate")
      const natural = naturalHeights()
      const after = units()

      // Invert: everything that stays starts where it was seen and glides home.
      if (still) {
        for (const node of moves.keys()) node.style.removeProperty("translate")
        moves.clear()
        for (const [node, h] of heights) node.style.height = h.style
        heights.clear()
      }
      for (const node of still ? [] : after) {
        const from = before.get(node)
        const rise = arrivals.has(node) && !before.has(node) ? RISE : 0
        const delta = from === undefined ? rise : from - topOf(node)
        const s = moves.get(node)
        if (Math.abs(delta) < 0.5 && !s) continue
        if (s) {
          s.x = delta
          s.target = 0
        } else moves.set(node, spring(delta, LAYOUT, 0.05).set(0))
        node.style.translate = `0 ${delta.toFixed(2)}px`
      }
      for (const [node, to] of still ? [] : natural) {
        const from = visualHeights.get(node) ?? to
        const target = node === body && held ? Math.max(to, held) : to
        let h = heights.get(node)
        if (!h && Math.abs(from - target) < 0.5) {
          // Already the height it's held at: nothing springs, but leavers no longer prop it up.
          if (node === body && held) body.style.minHeight = `${held}px`
          continue
        }
        if (!h) {
          h = { spring: spring(from, LAYOUT, 0.05), style: node.style.height }
          heights.set(node, h)
        }
        h.spring.x = from
        h.spring.set(target)
        node.style.height = `${from}px`
      }
      if (held) held = Math.max(held, natural.get(body) ?? 0)
      run()
      wake()
    },
  }
}
