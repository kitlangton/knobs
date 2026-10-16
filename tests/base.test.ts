import { describe, expect, it, vi } from "vitest"
import {
  choice,
  color,
  createRemoteControls,
  defineControls,
  knob,
  memoryStorage,
  toggle,
} from "../src/index.js"
import { AROUND } from "../src/core/random.js"

const schema = {
  stars: knob(500, { min: 0, max: 1000, step: 1, group: "Sky" }),
  glow: knob(0.5, { min: 0, max: 1, step: 0.01, group: "Sky" }),
  arms: choice("two", ["one", "two", "three", "four"], { group: "Shape" }),
  hero: toggle(true, { group: "Shape" }),
  dust: toggle(false, { group: "Shape", random: true }),
  tint: color("#4f8cff"),
}
const STORM = { stars: 900, glow: 0.9, arms: "four" } as const

/** A seeded generator, so a run of rolls is the same every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const make = (storage = memoryStorage(), random: () => number = seeded(7)) =>
  defineControls("galaxy", schema, {
    enabled: true,
    storage,
    random,
    presets: { Storm: STORM, Calm: { stars: 100, glow: 0.1 } },
    groupPresets: {
      Sky: [
        { name: "Dim", values: { stars: 50, glow: 0.05 } },
        { name: "Bright", values: { stars: 950, glow: 1 } },
      ],
    },
  })

describe("an applied preset is the base", () => {
  it("is active once applied, and the default preset or a full reset to the defaults clears it", () => {
    const c = make()
    expect(c.activePreset()).toBeNull()
    expect(c.baseValues()).toBe(c.locked)
    c.preset("Storm")
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    expect(c.baseValues()).toEqual({ ...c.locked, ...STORM })
    c.preset("default")
    expect(c.activePreset()).toBeNull()
    c.preset("Calm")
    c.reset()
    c.reset()
    expect(c.activePreset()).toBeNull()
  })

  it("resets to the preset first, then to the defaults", () => {
    const c = make()
    c.preset("Storm")
    c.set({ stars: 10, glow: 0.2 })
    expect(c.isModified("stars")).toBe(true)
    expect(c.isModified("hero")).toBe(false)
    c.reset()
    expect(c.get()).toEqual({ ...c.locked, ...STORM })
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    // At the preset nothing's modified, yet a reset still has somewhere to go.
    expect(c.isModified()).toBe(false)
    expect(c.canReset()).toBe(true)
    c.reset()
    expect(c.get()).toEqual(c.locked)
    expect(c.activePreset()).toBeNull()
    expect(c.canReset()).toBe(false)
  })

  it("climbs the same ladder for a key and a group", () => {
    const c = make()
    c.preset("Storm")
    c.set({ stars: 10 })
    c.resetKey("stars")
    expect(c.get().stars).toBe(900)
    c.resetKey("stars")
    expect(c.get().stars).toBe(500)
    // A row reset never forgets the preset; the row now differs from it.
    expect(c.activePreset()).not.toBeNull()
    expect(c.isModified("stars")).toBe(true)

    c.preset("Storm")
    c.set({ glow: 0.3 })
    c.resetGroup("Sky")
    expect(c.get()).toMatchObject({ stars: 900, glow: 0.9 })
    c.resetGroup("Sky")
    expect(c.get()).toMatchObject({ stars: 500, glow: 0.5, arms: "four" })
  })

  it("takes a group preset as that group's base, over the panel's", () => {
    const c = make()
    c.preset("Storm")
    c.groupPreset("Sky", 0)
    expect(c.activeGroupPreset("Sky")).toBe(0)
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    c.set({ stars: 600, arms: "one" })
    c.resetGroup("Sky")
    expect(c.get()).toMatchObject({ stars: 50, glow: 0.05, arms: "one" })
    // At the group preset, the group's reset goes to its defaults and forgets its preset.
    c.resetGroup("Sky")
    expect(c.get()).toMatchObject({ stars: 500, glow: 0.5 })
    expect(c.activeGroupPreset("Sky")).toBe(-1)
    // Applying a panel preset sets every key, so it replaces the group's.
    c.groupPreset("Sky", 1)
    c.preset("Calm")
    expect(c.activeGroupPreset("Sky")).toBe(-1)
  })

  it("makes one undo step of each apply, reset and roll, restoring the base with the values", () => {
    const c = make()
    c.preset("Storm")
    c.set({ stars: 10 })
    c.randomize()
    c.reset()
    c.reset()
    expect(c.activePreset()).toBeNull()
    c.undo() // the reset to the defaults
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    expect(c.get()).toEqual({ ...c.locked, ...STORM })
    c.undo() // the reset to Storm
    c.undo() // the roll
    expect(c.get().stars).toBe(10)
    c.undo() // the edit
    c.undo() // applying Storm
    expect(c.get()).toEqual(c.locked)
    expect(c.activePreset()).toBeNull()
    expect(c.canUndo).toBe(false)
    c.redo()
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
  })

  it("records making the preset active even when the values already match it", () => {
    const c = make()
    c.set(STORM)
    const listener = vi.fn()
    c.subscribe(listener)
    c.preset("Storm")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(c.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    c.undo()
    expect(c.activePreset()).toBeNull()
    expect(c.get()).toMatchObject(STORM)
  })

  it("keeps the base with the values in storage", () => {
    const storage = memoryStorage()
    const c = make(storage)
    c.preset("Storm")
    c.groupPreset("Sky", 1)
    const again = make(storage)
    expect(again.activePreset()).toEqual({ kind: "preset", id: "Storm" })
    expect(again.activeGroupPreset("Sky")).toBe(1)
    again.reset()
    again.reset()
    expect(make(storage).activePreset()).toBeNull()
  })

  it("takes a loaded variant as the base, and lets go of it once deleted", () => {
    const c = make()
    c.set({ stars: 321 })
    const saved = c.variants.save("Nebula")
    c.reset()
    c.variants.load(saved.id)
    expect(c.activePreset()).toEqual({ kind: "variant", id: saved.id })
    c.set({ stars: 1 })
    c.reset()
    expect(c.get().stars).toBe(321)
    c.variants.remove(saved.id)
    expect(c.activePreset()).toBeNull()
    expect(c.baseValues()).toBe(c.locked)
  })
})

describe("Random around a preset", () => {
  const span = { stars: 1000, glow: 1 }
  it("lands within the spread of the preset's values", () => {
    const c = make(memoryStorage(), seeded(11))
    c.preset("Storm")
    for (let i = 0; i < 200; i++) {
      c.randomize()
      const v = c.get()
      // The window is AROUND.spread of the range wide, slid inward at an end (Storm sits high).
      expect(v.stars).toBeGreaterThanOrEqual(1000 - span.stars * AROUND.spread - 1e-9)
      expect(v.glow).toBeGreaterThanOrEqual(1 - span.glow * AROUND.spread - 1e-9)
      expect(v.hero).toBe(true)
    }
  })

  it("keeps a choice's pick most of the time, and rolls freely without a preset", () => {
    const c = make(memoryStorage(), seeded(5))
    c.preset("Storm")
    let kept = 0
    for (let i = 0; i < 400; i++) {
      c.preset("Storm")
      c.randomize()
      if (c.get().arms === "four") kept++
    }
    expect(kept / 400).toBeGreaterThan(0.6)
    expect(kept / 400).toBeLessThan(0.8)
    const free = make(memoryStorage(), seeded(5))
    let low = 0
    for (let i = 0; i < 200; i++) {
      free.randomize()
      if (free.get().stars < 500) low++
    }
    expect(low).toBeGreaterThan(60)
  })

  it("explores only the keys a group preset covers, the rest freely", () => {
    const c = make(memoryStorage(), seeded(3))
    c.groupPreset("Sky", 0)
    for (let i = 0; i < 100; i++) {
      c.randomize()
      expect(c.get().stars).toBeLessThanOrEqual(span.stars * AROUND.spread)
    }
  })
})

describe("switches sit out of Random", () => {
  it("unless `random: true`", () => {
    const c = make(memoryStorage(), seeded(9))
    expect(c.canRoll("hero")).toBe(false)
    expect(c.canRoll("dust")).toBe(true)
    const seen = new Set<boolean>()
    for (let i = 0; i < 50; i++) {
      c.randomize()
      c.mutate()
      expect(c.get().hero).toBe(true)
      seen.add(c.get().dust)
    }
    expect(seen.size).toBe(2)
  })

  it("descriptors' toggles too", () => {
    const r = createRemoteControls(
      "settings",
      [
        { key: "on", kind: "toggle", default: true },
        { key: "fx", kind: "toggle", default: false, random: true },
      ],
      { random: seeded(1) },
    )
    expect(r.canRoll("on")).toBe(false)
    expect(r.canRoll("fx")).toBe(true)
  })
})

describe("naming saved presets", () => {
  it("renames a variant and keeps the name in storage", () => {
    const storage = memoryStorage()
    const c = make(storage)
    const saved = c.variants.save("Variant 1")
    c.variants.rename(saved.id, "  Spiral  ")
    expect(c.variants.list()[0]?.name).toBe("Spiral")
    const again = make(storage)
    expect(again.variants.list()[0]).toMatchObject({ id: saved.id, name: "Spiral" })
    again.variants.rename(saved.id, "")
    expect(again.variants.list()[0]?.name).toBeUndefined()
    expect(() => again.variants.rename("missing", "x")).toThrow()
    expect(() => again.variants.rename(saved.id, "x".repeat(101))).toThrow()
  })

  it("keeps the variant the base through a rename", () => {
    const c = make()
    const saved = c.variants.save("Variant 1")
    c.variants.load(saved.id)
    c.variants.rename(saved.id, "Spiral")
    expect(c.activePreset()).toEqual({ kind: "variant", id: saved.id })
  })
})

describe("remote resets back to a preset", () => {
  it("sends the preset's values, or asks the peer to apply its group preset again", () => {
    const sets: [string, unknown][] = []
    const presets: unknown[] = []
    const resets: unknown[] = []
    const r = createRemoteControls(
      "peer",
      [
        { key: "a", kind: "number", default: 1, min: 0, max: 10, step: 1, group: "G" },
        { key: "b", kind: "number", default: 2, min: 0, max: 10, step: 1 },
      ],
      {
        presets: { Big: { a: 8, b: 8 } },
        groupPresets: { G: [{ name: "Wide", values: { a: 9 } }] },
        onSet: (key, value) => sets.push([key, value]),
        onPreset: (target) => presets.push(target),
        onReset: (target) => resets.push(target),
      },
    )
    r.preset("Big")
    r.set({ b: 3 })
    sets.length = 0
    r.resetKey("b")
    expect(sets).toEqual([["b", 8]])
    expect(resets).toEqual([])
    r.groupPreset("G", 0)
    r.set({ a: 4 })
    sets.length = 0
    presets.length = 0
    r.resetGroup("G")
    expect(r.get().a).toBe(9)
    expect(sets).toEqual([])
    expect(presets).toEqual([{ group: "G", index: 0, name: "Wide" }])
  })
})
