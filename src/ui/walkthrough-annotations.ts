// Annotations on a step's pictures: a calm ring round a box, a dot or an arrow at a point, each
// with a small label, placed in 0–1 of the picture. On a video or compare each shows only between
// its `at` times; on a compare it's drawn on both sides and follows the zoom. One switch per page
// (the slot's eye button, or `a`) shows or hides them all; they're on by default.
// kit-motion: nothing moves on load; a mark coming or going fades with a small blur on the quick
// spring, top-anchored, and a mark that moves (a zoom, a resize) moves 1:1 with the picture.
import type { WalkthroughAnnotation } from "./walkthrough-model.js"

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** The part of the picture in view, 0–1 (`{ u: 0, v: 0, w: 1, h: 1 }` is all of it). */
export interface View {
  readonly u: number
  readonly v: number
  readonly w: number
  readonly h: number
}

/** Where the picture sits now: its rects in the layer (one, or a compare's two), view and time. */
export interface Placement {
  readonly rects: readonly Rect[]
  readonly view?: View
  readonly time?: number
}

export interface AnnotationLayer {
  readonly element: HTMLElement
  /** Places the marks again: after a resize, a zoom, a seek, a mode change. */
  update(): void
  dispose(): void
}

// Phosphor regular (eye, eye-slash), the set icons.ts copies from.
const EYE =
  "M247.31,124.76c-.35-.79-8.82-19.58-27.65-38.41C194.57,61.26,162.88,48,128,48S61.43,61.26,36.34,86.35C17.51,105.18,9,124,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208s66.57-13.26,91.66-38.34c18.83-18.83,27.3-37.61,27.65-38.4A8,8,0,0,0,247.31,124.76ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.47,133.47,0,0,1,25,128,133.33,133.33,0,0,1,48.07,97.25C70.33,75.19,97.22,64,128,64s57.67,11.19,79.93,33.25A133.46,133.46,0,0,1,231.05,128C223.84,141.46,192.43,192,128,192Zm0-112a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Z"
const EYE_OFF =
  "M53.92,34.62A8,8,0,1,0,42.08,45.38L61.32,66.55C25,88.84,9.38,123.2,8.69,124.76a8,8,0,0,0,0,6.5c.35.79,8.82,19.57,27.65,38.4C61.43,194.74,93.12,208,128,208a127.11,127.11,0,0,0,52.07-10.83l22,24.21a8,8,0,1,0,11.84-10.76Zm47.33,75.84,41.67,45.85a32,32,0,0,1-41.67-45.85ZM128,192c-30.78,0-57.67-11.19-79.93-33.25A133.16,133.16,0,0,1,25,128c4.69-8.79,19.66-33.39,47.35-49.38l18,19.75a48,48,0,0,0,63.66,70l14.73,16.2A112,112,0,0,1,128,192Zm6-95.43a8,8,0,0,1,3-15.72,48.16,48.16,0,0,1,38.77,42.64,8,8,0,0,1-7.22,8.71,6.39,6.39,0,0,1-.75,0,8,8,0,0,1-8-7.26A32.09,32.09,0,0,0,134,96.57Zm113.28,34.69c-.42.94-10.55,23.37-33.36,43.8a8,8,0,1,1-10.67-11.92A132.77,132.77,0,0,0,231.05,128a133.15,133.15,0,0,0-23.12-30.77C185.67,75.19,158.78,64,128,64a118.37,118.37,0,0,0-19.36,1.57A8,8,0,1,1,106,49.79,134,134,0,0,1,128,48c34.88,0,66.57,13.26,91.66,38.35,18.83,18.83,27.3,37.62,27.65,38.41A8,8,0,0,1,247.31,131.26Z"
const glyph = (d: string) =>
  `<svg class="knobs-icon" viewBox="0 0 256 256" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
const ARROW =
  '<svg class="knobs-wt-anno-arrow" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path d="M3 3 L24 24 M24 24 L24 13 M24 24 L13 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const shapeOf = (a: WalkthroughAnnotation) =>
  a.shape ?? (a.w !== undefined && a.h !== undefined ? "box" : "dot")

/** Whether a mark shows at `time` (always without `at`, or without a time). */
export const showsAt = (a: WalkthroughAnnotation, time: number | undefined) =>
  !a.at || time === undefined || (time >= a.at[0] && time <= a.at[1])

/**
 * A mark's box in the layer, in px, for a picture at `rect` showing `view` of itself; null when
 * it's out of view.
 */
export function placeMark(a: WalkthroughAnnotation, rect: Rect, view: View = ALL): Rect | null {
  const w = a.w ?? 0
  const h = a.h ?? 0
  const x = (a.x - view.u) / view.w
  const y = (a.y - view.v) / view.h
  const ww = w / view.w
  const hh = h / view.h
  if (x + ww < 0 || y + hh < 0 || x > 1 || y > 1) return null
  return { x: rect.x + x * rect.w, y: rect.y + y * rect.h, w: ww * rect.w, h: hh * rect.h }
}
const ALL: View = { u: 0, v: 0, w: 1, h: 1 }

/** The page (or the lone slot) whose switch a slot follows. */
const scopeOf = (el: HTMLElement) =>
  (el.closest(".knobs-walkthrough") as HTMLElement | null) ??
  (el.closest(".knobs-wt-slot") as HTMLElement | null) ??
  el

/** Whether a page's annotations show. */
export const annotationsOn = (scope: HTMLElement) => scope.dataset.annotations !== "off"

/** Shows or hides every annotation on a page (or a lone slot); its eye buttons follow. */
export function setAnnotations(scope: HTMLElement, on: boolean) {
  if (on) delete scope.dataset.annotations
  else scope.dataset.annotations = "off"
  for (const b of Array.from(scope.querySelectorAll<HTMLElement>(".knobs-wt-anno-toggle")))
    syncToggle(b, on)
}

function syncToggle(b: HTMLElement, on: boolean) {
  b.setAttribute("aria-pressed", String(on))
  b.title = on ? "Hide annotations (a)" : "Show annotations (a)"
  b.innerHTML = glyph(on ? EYE : EYE_OFF)
}

/**
 * Draws `list` over `host` (positioned, the picture's box or a compare's stage), placing it with
 * `place()`; the eye button goes in `corner` (the host by default).
 */
export function annotationLayer(
  host: HTMLElement,
  list: readonly WalkthroughAnnotation[],
  place: () => Placement,
  corner: HTMLElement = host,
): AnnotationLayer {
  const doc = host.ownerDocument
  const layer = doc.createElement("div")
  layer.className = "knobs-wt-anno"
  layer.setAttribute("aria-hidden", "true")
  host.append(layer)
  const toggle = doc.createElement("button")
  toggle.type = "button"
  toggle.className = "knobs-wt-anno-toggle"
  toggle.setAttribute("aria-label", "Annotations")
  syncToggle(toggle, annotationsOn(scopeOf(host)))
  toggle.addEventListener("click", (e) => {
    e.stopPropagation()
    const scope = scopeOf(host)
    setAnnotations(scope, !annotationsOn(scope))
  })
  corner.append(toggle)

  let marks: HTMLElement[][] = []
  const make = (a: WalkthroughAnnotation) => {
    const m = doc.createElement("div")
    const shape = shapeOf(a)
    m.className = "knobs-wt-mark"
    m.dataset.shape = shape
    m.dataset.hidden = ""
    if (shape === "arrow") m.innerHTML = ARROW
    if (a.label) {
      const l = doc.createElement("span")
      l.className = "knobs-wt-mark-label"
      l.textContent = a.label
      m.append(l)
    }
    layer.append(m)
    return m
  }
  let settled = false
  const update = () => {
    const p = place()
    if (marks.length !== p.rects.length) {
      for (const row of marks) for (const m of row) m.remove()
      marks = p.rects.map(() => list.map(make))
    }
    p.rects.forEach((rect, i) => {
      list.forEach((a, j) => {
        const m = marks[i]![j]!
        const box = placeMark(a, rect, p.view)
        const show = box !== null && showsAt(a, p.time)
        if (box) {
          m.style.transform = `translate(${box.x.toFixed(2)}px,${box.y.toFixed(2)}px)`
          m.style.width = `${box.w.toFixed(2)}px`
          m.style.height = `${box.h.toFixed(2)}px`
        }
        m.toggleAttribute("data-hidden", !show)
      })
    })
    // Transitions start once the marks have been placed: nothing fades in on load.
    if (!settled) {
      settled = true
      requestAnimationFrame(() => requestAnimationFrame(() => (layer.dataset.settled = "")))
    }
  }
  const ro = new ResizeObserver(() => update())
  ro.observe(host)
  update()
  return {
    element: layer,
    update,
    dispose() {
      ro.disconnect()
      layer.remove()
      toggle.remove()
    },
  }
}
