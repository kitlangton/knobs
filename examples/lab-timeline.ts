// The Lab's timeline, under the viewport: it drives the fake scene's clock (the orb drifts, the
// top bar's time follows) and its markers cue the scene: playback passing "Boom" retriggers the
// explosion, as the inspector's Retrigger does. Space plays, ←/→ step frames, [ ] jump between
// markers, I / O set the loop, M adds a marker; ⌘wheel or a pinch zooms the ruler.
import { timeline, type TimelineMarker } from "knobs/ui"
import { uiLook } from "./lab-look"

export function startTimeline(host: HTMLElement, viewport: HTMLElement) {
  const clock = document.querySelector<HTMLElement>(".top .mono")
  const orb = viewport.querySelector<HTMLElement>(".orb")
  const boom = document.createElement("div")
  boom.className = "boom"
  boom.setAttribute("aria-hidden", "true")
  viewport.append(boom)
  const booms: number[] = []
  const explode = () => {
    booms.push(performance.now())
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      boom.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 200 })
      return
    }
    // A flash that blooms and fades, and the orb kicked out of its rest.
    boom.animate(
      [
        { opacity: 0.95, scale: "0.35" },
        { opacity: 0.55, scale: "1", offset: 0.35 },
        { opacity: 0, scale: "1.5" },
      ],
      { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" },
    )
    orb?.animate([{ scale: "1" }, { scale: "1.12", offset: 0.18 }, { scale: "1" }], {
      duration: 520,
      easing: "cubic-bezier(.2,.8,.2,1)",
    })
  }
  const paint = (t: number) => {
    if (clock) clock.textContent = `${t.toFixed(2)}s · f${Math.round(t * 30)}`
    if (orb)
      orb.style.translate = `${(Math.sin(t * 1.3) * 18).toFixed(2)}px ${(Math.cos(t * 2.1) * 8).toFixed(2)}px`
  }
  const markers: TimelineMarker[] = [
    { id: "boom", time: 1.2, label: "Boom" },
    { id: "debris", time: 2.4, label: "Debris" },
    { id: "smoke", time: 3.6, label: "Smoke" },
  ]
  const tl = timeline(host, {
    ...uiLook(),
    duration: 6,
    fps: 30,
    time: 0.06,
    markers,
    ranges: [{ id: "loop", start: 0.8, end: 4.2, loop: true }],
    label: "Scene time",
    onSeek: paint,
    onCross: (m) => m.id === "boom" && explode(),
  })
  paint(tl.time)
  return { timeline: tl, explode, booms }
}
