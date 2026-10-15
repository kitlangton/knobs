// The Lab's timeline, under the viewport: it drives the scene's clock (examples/lab-scene.ts
// follows its seeks, and plays while it plays; the top bar's time follows) and its markers cue the
// scene: playback passing "Boom" sets off the propane tank, as the inspector's Retrigger does, and
// "Debris" and "Smoke" throw embers and a smoke burst. Space plays, ←/→ step frames, [ ] jump
// between markers, I / O set the loop, M adds a marker; ⌘wheel or a pinch zooms the ruler.
import { type SeekSource, timeline, type TimelineMarker } from "knobs/ui"
import { uiLook } from "./lab-look"

export function startTimeline(host: HTMLElement) {
  const clock = document.querySelector<HTMLElement>(".top .mono")
  const booms: number[] = []
  const seeks = new Set<(time: number, source: SeekSource) => void>()
  const cues = new Set<(id: string) => void>()
  const explode = () => {
    booms.push(performance.now())
    for (const f of cues) f("boom")
  }
  const paint = (t: number) => {
    if (clock) clock.textContent = `${t.toFixed(2)}s · f${Math.round(t * 30)}`
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
    onSeek: (t, source) => {
      paint(t)
      for (const f of seeks) f(t, source)
    },
    onCross: (m) => {
      if (m.id === "boom") explode()
      else for (const f of cues) f(m.id)
    },
  })
  paint(tl.time)
  return {
    timeline: tl,
    explode,
    booms,
    /** Each seek: a scrub, a key, a marker jump, playback or code. */
    onSeek(f: (time: number, source: SeekSource) => void) {
      seeks.add(f)
      return () => seeks.delete(f)
    },
    /** A marker passed in playback, or a retrigger ("boom"). */
    onCue(f: (id: string) => void) {
      cues.add(f)
      return () => cues.delete(f)
    },
  }
}
