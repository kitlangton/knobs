// The Lab's compare: the top bar's View switch (or ?compare, ?compare=stills) lays a before/after
// viewer over the viewport, run by the scene's own timeline under it: its playhead drives both
// videos and playing follows After's clock. S side by side (the default: a split screen; pinch,
// ⌘-wheel or double-click zooms both, drag pans), W wipe (drag the line, or press anywhere and it
// catches up), hold Z for the loupe, L loops; Space plays, ←/→ seek half a second (⇧ two), , and .
// step a frame. The media
// are generated (assets/compare/make.sh): After moves a card, recolours a button, widens the ball
// and flashes a badge from 1.5 s to 2.6 s.
import { compare, type Compare, type Timeline } from "knobs/ui"
import { uiLook } from "./lab-look"

const asset = (name: string) => new URL(`./assets/compare/${name}`, import.meta.url).href
const PAIRS = {
  videos: { before: { src: asset("before.mp4") }, after: { src: asset("after.mp4") } },
  stills: { before: { src: asset("before.png") }, after: { src: asset("after.png") } },
}
type View = "scene" | keyof typeof PAIRS

export function startCompare(viewport: HTMLElement, timeline: Timeline) {
  const layer = document.createElement("div")
  layer.className = "compare-layer"
  viewport.append(layer)
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("#view-seg [data-view]")]
  let view: View = "scene"
  let cmp: Compare | null = null
  let leaving = 0
  const show = (next: View) => {
    view = next
    for (const b of buttons) {
      const on = b.dataset.view === next
      b.classList.toggle("on", on)
      b.setAttribute("aria-checked", String(on))
    }
    if (next === "scene") {
      layer.removeAttribute("data-shown")
      // It fades out first; then the viewer goes and the timeline runs on its own clock again.
      window.clearTimeout(leaving)
      leaving = window.setTimeout(() => {
        cmp?.dispose()
        cmp = null
      }, 240)
      return
    }
    window.clearTimeout(leaving)
    const pair = PAIRS[next]
    if (cmp) cmp.update(pair)
    else
      cmp = compare(layer, {
        ...uiLook(),
        ...pair,
        timeline,
        label: "Before and after",
      })
    layer.setAttribute("data-shown", "")
  }
  for (const b of buttons) b.addEventListener("click", () => show(b.dataset.view as View))
  const asked = new URLSearchParams(location.search).get("compare")
  show(asked === null ? "scene" : asked === "stills" ? "stills" : "videos")
  return {
    show,
    get view() {
      return view
    },
    get compare() {
      return cmp
    },
  }
}
