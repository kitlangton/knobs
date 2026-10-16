import { describe, expect, it } from "vitest"
import {
  cadence,
  changeCue,
  createDetents,
  createLimiter,
  createSound,
  DETENTS,
  FRESH_MS,
  GAPS,
  MAX_VOICES,
  recipe,
  resolveSound,
  type SoundCue,
  themed,
} from "../src/panel/sound.js"

// A stand-in for Web Audio that records what the engine builds.
class Param {
  calls: [string, ...number[]][] = []
  constructor(public value = 0) {}
  setValueAtTime(v: number, t: number) {
    this.calls.push(["set", v, t])
    this.value = v
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(["linear", v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(["exp", v, t])
  }
  setTargetAtTime(v: number, t: number, c: number) {
    this.calls.push(["target", v, t, c])
  }
  cancelScheduledValues(t: number) {
    this.calls.push(["cancel", t])
  }
}
class Node_ {
  connect<T>(next: T) {
    return next
  }
  disconnect() {}
}
class Source extends Node_ {
  started: number[] = []
  start(t: number) {
    this.started.push(t)
  }
  stop() {}
}
class FakeContext {
  static made = 0
  state: AudioContextState = "running"
  currentTime = 1
  sampleRate = 4000
  destination = new Node_()
  gains: { gain: Param }[] = []
  sources: Source[] = []
  constructor() {
    FakeContext.made++
  }
  createGain() {
    const g = Object.assign(new Node_(), { gain: new Param(1) })
    this.gains.push(g)
    return g
  }
  createBiquadFilter() {
    return Object.assign(new Node_(), { type: "", frequency: new Param(), Q: new Param() })
  }
  createDynamicsCompressor() {
    return Object.assign(new Node_(), {
      threshold: new Param(),
      knee: new Param(),
      ratio: new Param(),
      attack: new Param(),
      release: new Param(),
    })
  }
  createBuffer(_channels: number, length: number) {
    const data = [new Float32Array(length), new Float32Array(length)]
    return { getChannelData: (c: number) => data[c]! }
  }
  createConvolver() {
    return Object.assign(new Node_(), { normalize: true, buffer: null })
  }
  createOscillator() {
    const o = Object.assign(new Source(), { type: "sine", frequency: new Param() })
    this.sources.push(o)
    return o
  }
  createBufferSource() {
    const s = Object.assign(new Source(), { buffer: null, loop: false })
    this.sources.push(s)
    return s
  }
  resume() {
    this.state = "running"
    return Promise.resolve()
  }
}

const setup = (activated = true) => {
  let t = 0
  let ctx: FakeContext | undefined
  const sound = createSound({
    AudioContext: class extends FakeContext {
      constructor() {
        super()
        ctx = this
      }
    } as unknown as { new (): AudioContext },
    activated: () => activated,
    now: () => t,
    random: () => 0.5,
  })
  return {
    sound,
    ctx: () => ctx,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe("sound: cadence and the limiter", () => {
  it("lightens repeats as they come faster", () => {
    expect(cadence(1000)).toBe(0)
    expect(cadence(240)).toBe(0)
    expect(cadence(70)).toBe(1)
    expect(cadence(10)).toBe(1)
    expect(cadence(155)).toBeCloseTo(0.5, 1)
  })
  it("drops a cue repeated inside its gap and lets the next one through", () => {
    const admit = createLimiter({ step: 24 })
    expect(admit("step", 0)).toBe(0)
    expect(admit("step", 10)).toBeNull()
    expect(admit("step", 23)).toBeNull()
    expect(admit("step", 30)).toBe(1)
    // Other cues keep their own time.
    expect(admit("toggle", 31)).toBe(0)
  })
  it("gives every cue a gap", () => {
    for (const gap of Object.values(GAPS)) expect(gap).toBeGreaterThan(0)
  })
})

describe("sound: slider detents", () => {
  it("ticks for a fresh change, and within a drag only across a detent", () => {
    const tick = createDetents()
    expect(tick("a", 0.5, 0.51, DETENTS, 0)).toBe(true)
    expect(tick("a", 0.51, 0.515, DETENTS, 16)).toBe(false)
    expect(tick("a", 0.515, 0.54, DETENTS, 32)).toBe(true)
    // A pause makes the next change fresh again.
    expect(tick("a", 0.54, 0.541, DETENTS, 32 + FRESH_MS + 1)).toBe(true)
    // Sliders don't share their timing.
    expect(tick("b", 0.2, 0.201, DETENTS, 40)).toBe(true)
  })
  it("ticks every stop of a stepped slider", () => {
    const tick = createDetents()
    tick("s", 0, 0.1, 10, 0)
    for (let i = 1; i < 10; i++) expect(tick("s", i / 10, (i + 1) / 10, 10, i * 10)).toBe(true)
  })
})

describe("sound: a change's cue", () => {
  const knobField = { kind: "knob", value: 50, min: 0, max: 100, step: 1 }
  it("pitches a step by position and firms it on the default", () => {
    const c = changeCue(knobField, 20, 30)!
    expect(c.cue).toBe("step")
    expect(c.detail.position).toBeCloseTo(0.3)
    expect(c.detail.strong).toBe(false)
    expect(c.detents).toBe(DETENTS)
    expect(changeCue(knobField, 49, 50)!.detail.strong).toBe(true)
    expect(changeCue({ ...knobField, max: 5 }, 1, 2)!.detents).toBe(5)
  })
  it("follows the part that moved", () => {
    const range = { kind: "range", value: [20, 80], min: 0, max: 100, step: 1 }
    expect(changeCue(range, [20, 80], [20, 90])!.detail.position).toBeCloseTo(0.9)
    const vec = { kind: "vec", value: { x: 0, y: 0 }, min: -1, max: 1, step: 0.1 }
    expect(changeCue(vec, { x: 0, y: 0 }, { x: 0, y: 1 })!.detail.position).toBeCloseTo(1)
  })
  it("throws a switch, steps a choice by direction and captures a key", () => {
    expect(changeCue({ kind: "toggle" }, false, true)).toMatchObject({
      cue: "toggle",
      detail: { direction: 1 },
    })
    expect(changeCue({ kind: "toggle" }, true, false)!.detail.direction).toBe(-1)
    const choice = { kind: "choice", options: ["a", "b", "c"] }
    expect(changeCue(choice, "a", "c")!.detail.direction).toBeGreaterThan(0)
    expect(changeCue(choice, "c", "b")!.detail.direction).toBeLessThan(0)
    expect(changeCue({ kind: "keybind" }, "", "Meta+K")!.cue).toBe("capture")
    // A colour has no range: a plain step that only a fresh change sounds.
    expect(changeCue({ kind: "color" }, "a", "b")).toMatchObject({ cue: "step", detents: 1 })
  })
})

describe("sound: the option", () => {
  it("is off unless asked for", () => {
    expect(resolveSound(undefined)).toBeNull()
    expect(resolveSound(false)).toBeNull()
    expect(resolveSound(true)).toEqual({})
    expect(resolveSound({ volume: 2, theme: "mech" })).toEqual({ volume: 1, theme: "mech" })
    expect(resolveSound({ volume: -1 })).toEqual({ volume: 0 })
  })
})

describe("sound: recipes", () => {
  const all = Object.keys(GAPS) as SoundCue[]
  it("keeps every cue short, quiet and under 5 kHz", () => {
    for (const c of all) {
      const { layers } = recipe(c, { direction: 1, position: 1 }, 0, () => 0.99)
      expect(layers.length).toBeGreaterThan(0)
      for (const l of layers) {
        expect(Math.max(l.f, l.to ?? 0)).toBeLessThanOrEqual(5000)
        expect((l.at ?? 0) + l.a + l.d).toBeLessThan(0.4)
        expect(l.p).toBeLessThanOrEqual(1)
      }
    }
  })
  it("rises with a step's position and a choice's direction", () => {
    const pitch = (c: SoundCue, d: object) => recipe(c, d).layers[0]!.f
    expect(pitch("step", { position: 1 })).toBeGreaterThan(pitch("step", { position: 0 }))
    expect(pitch("select", { direction: 1 })).toBeGreaterThan(pitch("select", { direction: -1 }))
  })
  it("tumbles a die in clicks that come sooner and softer", () => {
    const clicks = recipe("random", {}, 0, () => 0.5).layers.filter((l) => !l.wave)
    expect(clicks).toHaveLength(5)
    const gaps = clicks.slice(1).map((l, i) => (l.at ?? 0) - (clicks[i]!.at ?? 0))
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!)
    for (let i = 1; i < clicks.length; i++) expect(clicks[i]!.p).toBeLessThan(clicks[i - 1]!.p)
    expect(recipe("mutate", {}, 0, () => 0.5).layers.filter((l) => !l.wave)).toHaveLength(2)
  })
  it("plays a fast scrub lighter, without its ring", () => {
    const slow = recipe("step", { position: 0.5 }, 0)
    const fast = recipe("step", { position: 0.5 }, 1)
    expect(fast.layers[0]!.p).toBeLessThan(slow.layers[0]!.p)
    expect(fast.layers.some((l) => l.wave)).toBe(false)
    expect(slow.layers.some((l) => l.wave)).toBe(true)
  })
  it("tells a switch's on from its off", () => {
    const on = recipe("toggle", { direction: 1 }).layers
    const off = recipe("toggle", { direction: -1 }).layers
    expect(on[1]!.f).toBeGreaterThan(off[1]!.f)
  })
  it("dries the rings in the mech theme", () => {
    const glassy = recipe("copy").layers
    const dry = themed(glassy, "mech")
    const tone = (ls: typeof glassy) => ls.filter((l) => l.wave).reduce((s, l) => s + l.p, 0)
    expect(tone(dry)).toBeLessThan(tone(glassy))
  })
})

describe("sound: the engine", () => {
  it("makes no context before the page has been touched", () => {
    const { sound, ctx } = setup(false)
    sound.play("press")
    expect(ctx()).toBeUndefined()
    expect(sound.output()).toBeNull()
  })
  it("plays through one lazy context and bus", () => {
    const { sound, ctx, advance } = setup()
    expect(ctx()).toBeUndefined()
    sound.play("press")
    const c = ctx()!
    expect(c).toBeDefined()
    const sources = c.sources.length
    expect(sources).toBeGreaterThan(0)
    advance(100)
    sound.play("toggle", { direction: 1 })
    expect(ctx()).toBe(c)
    expect(c.sources.length).toBeGreaterThan(sources)
    expect(sound.output()?.context).toBe(c)
  })
  it("drops a repeat inside the cue's gap", () => {
    const { sound, ctx, advance } = setup()
    sound.play("copy")
    const n = ctx()!.sources.length
    advance(50)
    sound.play("copy")
    expect(ctx()!.sources.length).toBe(n)
    advance(GAPS.copy)
    sound.play("copy")
    expect(ctx()!.sources.length).toBeGreaterThan(n)
  })
  it("stays silent when switched off and fades the bus out", () => {
    const { sound, ctx, advance } = setup()
    const heard: boolean[] = []
    sound.subscribe(() => heard.push(sound.enabled))
    sound.play("press")
    const c = ctx()!
    const bus = c.gains[0]!
    sound.enable(false)
    expect(heard).toEqual([false])
    expect(bus.gain.calls.at(-1)).toEqual(["linear", 0, expect.any(Number)])
    const n = c.sources.length
    advance(500)
    sound.play("press")
    expect(c.sources.length).toBe(n)
    sound.enable()
    expect(heard).toEqual([false, true])
    expect(bus.gain.calls.at(-1)).toEqual(["linear", 1, expect.any(Number)])
  })
  it("clamps and reports the volume", () => {
    const { sound } = setup()
    let calls = 0
    const off = sound.subscribe(() => calls++)
    sound.setVolume(2)
    expect(sound.volume).toBe(1)
    sound.setVolume(0.25)
    expect(sound.volume).toBe(0.25)
    off()
    sound.setVolume(0.5)
    expect(calls).toBe(1)
    sound.setTheme("mech")
    expect(sound.theme).toBe("mech")
    sound.setTheme("nope" as never)
    expect(sound.theme).toBe("mech")
  })
  it("caps the voices sounding at once", () => {
    const { sound, ctx, advance } = setup()
    for (let i = 0; i < MAX_VOICES + 4; i++) {
      sound.play("press")
      advance(GAPS.press + 1)
    }
    // Each play's own gain fades the oldest once the cap is reached.
    const faded = ctx()!.gains.filter((g) => g.gain.calls.some(([k]) => k === "cancel"))
    expect(faded.length).toBe(4)
  })
})
