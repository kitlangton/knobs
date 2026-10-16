// The lamp's sounds, through knobs' sound bus so the page's speaker mutes them: a wall switch's
// click, the filament's ticks and buzz while the ignition flicker lasts (fed by the same flicker
// spring), a warm mains hum while lit that follows the light (all but inaudible), and a glassy tick
// or two as the bulb cools. Nothing sounds while the lamp is off screen or the tab is hidden.
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
/** The filament catching: one dry spark. */
const SPARK = (p: number): SoundLayer[] => [click(3900 + 600 * Math.random(), p, 0.0025, 3)]
/** Glass and metal contracting as the bulb cools: a tiny high ping. */
const PING = (f: number): SoundLayer[] => [
  click(3200, 0.05, 0.002, 3),
  { wave: "sine", f, a: 0.002, d: 0.11, p: 0.016 },
  { wave: "sine", f: f * 2.76 < 5000 ? f * 2.76 : f * 1.5, a: 0.002, d: 0.05, p: 0.004 },
]

/** The mains hum's level at full light (it scales with how much light there is). */
const HUM = 0.006
/** The buzz at the flicker's strongest arc. */
const BUZZ = 0.02

export function lampSound(stage: HTMLElement) {
  let seen = false
  let shown = document.visibilityState === "visible"
  let lit = false
  let hum = 0
  let last = 0
  let cooling: ReturnType<typeof setTimeout>[] = []
  const audible = () => seen && shown && sound.enabled
  let voice: { ctx: AudioContext; hum: GainNode; buzz: GainNode } | null = null

  /** The hum and buzz: sines at 120, 240 and 360 Hz, and a sawtooth through a narrow band. */
  const build = () => {
    if (voice) return voice
    const out = sound.output()
    if (!out) return null
    const { context: ctx, destination } = out
    const humGain = ctx.createGain()
    humGain.gain.value = 0
    for (const [f, a] of [
      [120, 1],
      [240, 0.45],
      [360, 0.15],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.frequency.value = f
      const g = ctx.createGain()
      g.gain.value = a
      osc.connect(g).connect(humGain)
      osc.start()
    }
    humGain.connect(destination)
    const saw = ctx.createOscillator()
    saw.type = "sawtooth"
    saw.frequency.value = 120
    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = 1700
    band.Q.value = 1.3
    const buzz = ctx.createGain()
    buzz.gain.value = 0
    saw.connect(band).connect(buzz).connect(destination)
    saw.start()
    voice = { ctx, hum: humGain, buzz }
    return voice
  }
  const glide = (param: AudioParam, to: number, ctx: AudioContext, tau = 0.05) =>
    param.setTargetAtTime(to, ctx.currentTime, tau)
  /** Brings the hum to where the light is, or quiet while it can't be heard. */
  const sync = () => {
    const v = audible() && (hum > 0 || voice) ? build() : voice
    if (!v) return
    glide(v.hum.gain, audible() ? hum : 0, v.ctx, 0.12)
    if (!audible()) glide(v.buzz.gain, 0, v.ctx, 0.02)
  }

  new IntersectionObserver(([entry]) => {
    seen = Boolean(entry?.isIntersecting)
    sync()
  }).observe(stage)
  document.addEventListener("visibilitychange", () => {
    shown = document.visibilityState === "visible"
    sync()
  })
  sound.subscribe(sync)
  // The first touch of the page makes the audio context: the hum can start then.
  for (const type of ["pointerdown", "keydown"])
    addEventListener(type, () => queueMicrotask(sync), { capture: true, once: true })

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
    /**
     * Each frame drawn: `hot` (0–1, the filament's heat), `flicker` (the ignition spring, 1 at the
     * strike and dying away), `arc` (the flicker's irregular strike, 0–1) and `light` (brightness
     * as a share of the default's).
     */
    frame(hot: number, flicker: number, arc: number, light: number) {
      hum = HUM * Math.min(1.6, light) * hot ** 2.4
      if (!audible()) return
      const v = build()
      if (!v) return
      glide(v.hum.gain, hum, v.ctx, 0.12)
      // The buzz chatters with the arc; it fades with the flicker spring.
      glide(v.buzz.gain, BUZZ * flicker * arc * Math.min(1, light + 0.3), v.ctx, 0.012)
      // A spark each time the arc strikes hard.
      if (flicker > 0.12 && arc > 0.8 && last <= 0.8) sound.play(SPARK(0.35 * flicker))
      last = arc
    },
  }
}
