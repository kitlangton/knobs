// The lamp's sounds, through knobs' sound bus so the page's speaker mutes them: a wall switch's
// click and a glassy tick or two as the bulb cools. The light itself is silent. Nothing sounds
// while the lamp is off screen or the tab is hidden.
import { sound, type SoundLayer } from "knobs/panel"

const click = (f: number, p: number, d: number, q = 2, at = 0): SoundLayer => ({
  f,
  q,
  a: 0.0008,
  d,
  p,
  at,
})
/** A rocker switch: it leaves its detent, then the contact snaps over with a thunk in the plate. */
const SWITCH = (on: boolean): SoundLayer[] => [
  click(on ? 3600 : 3200, 0.12, 0.003, 3),
  click(on ? 2300 : 2000, 0.45, 0.006, 2, 0.011),
  click(on ? 900 : 780, 0.5, 0.022, 2.2, 0.011),
  { filter: "lowpass", f: 170, q: 0.7, a: 0.002, d: 0.045, p: 0.9, at: 0.011 },
]
/** Glass and metal contracting as the bulb cools: a tiny high ping. */
const PING = (f: number): SoundLayer[] => [
  click(3200, 0.05, 0.002, 3),
  { wave: "sine", f, a: 0.002, d: 0.11, p: 0.016 },
  { wave: "sine", f: f * 2.76 < 5000 ? f * 2.76 : f * 1.5, a: 0.002, d: 0.05, p: 0.004 },
]

export function lampSound(stage: HTMLElement) {
  let seen = false
  let lit = false
  let cooling: ReturnType<typeof setTimeout>[] = []
  const audible = () => seen && document.visibilityState === "visible" && sound.enabled
  new IntersectionObserver(([entry]) => {
    seen = Boolean(entry?.isIntersecting)
  }).observe(stage)

  return {
    /** The switch was thrown (by hand, a key, undo or a remote). */
    switched(on: boolean) {
      lit = on
      for (const t of cooling) clearTimeout(t)
      cooling = []
      if (!audible()) return
      sound.play(SWITCH(on), { volume: 0.9 })
      if (on) return
      // A moment after it goes dark, the glass ticks as it cools, once and maybe again.
      for (const [at, f] of [
        [420 + 200 * Math.random(), 2300 + 500 * Math.random()],
        [1100 + 500 * Math.random(), 2700 + 500 * Math.random()],
      ] as const)
        cooling.push(
          setTimeout(() => {
            if (!lit && audible()) sound.play(PING(f), { volume: 0.8 })
          }, at),
        )
    },
  }
}
