import { describe, expect, it, vi } from "vitest"
import rolling from "../src/panel/rolling-css.js"
import { rollingModule, rollingSource } from "../scripts/rolling-css.js"
import {
  choice,
  createRemoteControls,
  defineControls,
  knob,
  memoryStorage,
  toggle,
  type ControlDescriptor,
} from "../src/index.js"
import { storageKey } from "../src/core/storage.js"

describe("rolling-number's stylesheet as a module", () => {
  it("matches the installed package (run `bun scripts/rolling-css.ts` after upgrading)", async () => {
    expect(rolling).toBe(rollingSource())
    const { readFileSync } = await import("node:fs")
    expect(readFileSync("src/panel/rolling-css.ts", "utf8")).toBe(rollingModule(rolling))
  })
})

/** A seeded stream over [0, 1). */
const seeded = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
const schema = {
  intensity: knob(0.5, { min: 0, max: 1, step: 0.01 }),
  size: knob(4, { min: 1, max: 30, step: 0.5 }),
  seed: knob(7, { min: 0, max: 1000, step: 1, random: false }),
  snow: toggle(false),
  style: choice("a", ["a", "b", "c"]),
}

describe("seedable Random and Mutate", () => {
  it("draws from `random`, so the same seed rolls the same values", () => {
    const roll = (seed: number) => {
      const c = defineControls("seeded", schema, {
        enabled: true,
        storage: null,
        random: seeded(seed),
      })
      c.randomize()
      const first = c.get()
      c.mutate()
      return [first, c.get()]
    }
    expect(roll(41)).toEqual(roll(41))
    expect(roll(41)).not.toEqual(roll(42))
  })

  it("skips `random: false` and what `tunable` refuses, as it skips locks", () => {
    const c = defineControls("tunable", schema, {
      enabled: true,
      storage: null,
      random: seeded(3),
      tunable: (key) => key !== "snow" && key !== "style",
    })
    c.lock("size")
    for (let i = 0; i < 25; i++) {
      c.randomize()
      c.mutate()
    }
    expect(c.get().seed).toBe(7)
    expect(c.get().snow).toBe(false)
    expect(c.get().style).toBe("a")
    expect(c.get().size).toBe(4)
    expect(c.get().intensity).not.toBe(0.5)
    expect(c.canRoll("intensity")).toBe(true)
    expect(["seed", "snow", "style", "size"].map((k) => c.canRoll(k as "seed"))).toEqual([
      false,
      false,
      false,
      false,
    ])
    // Asking for only skipped fields does nothing at all (no undo step).
    const before = c.get()
    c.randomize(["seed", "snow"])
    expect(c.get()).toBe(before)
  })

  it("descriptors take `random: false` too", () => {
    const remote = createRemoteControls(
      "remote-seeded",
      [
        { key: "a", kind: "number", default: 1, min: 0, max: 10, step: 1 },
        { key: "b", kind: "number", default: 1, min: 0, max: 10, step: 1, random: false },
      ],
      { random: seeded(9) },
    )
    for (let i = 0; i < 10; i++) remote.randomize()
    expect(remote.get().b).toBe(1)
  })
})

describe("host-owned history", () => {
  it("undo and redo call the host; canUndo follows it; compare still uses knobs' entries", () => {
    let depth = 0
    const subs = new Set<() => void>()
    const history = {
      undo: vi.fn(() => depth--),
      redo: vi.fn(() => depth++),
      canUndo: () => depth > 0,
      canRedo: () => false,
      subscribe: (cb: () => void) => {
        subs.add(cb)
        return () => subs.delete(cb)
      },
    }
    const c = defineControls("hosted", schema, { enabled: true, storage: null, history })
    const heard = vi.fn()
    const stop = c.subscribe(heard)
    expect(subs.size).toBe(1)
    expect(c.canUndo).toBe(false)
    depth = 2
    for (const cb of subs) cb()
    expect(heard).toHaveBeenCalled()
    expect(c.canUndo).toBe(true)
    c.set({ intensity: 0.9 })
    c.undo()
    expect(history.undo).toHaveBeenCalledTimes(1)
    // knobs' own values are untouched by undo: the host syncs them back.
    expect(c.get().intensity).toBe(0.9)
    c.compare(true)
    expect(c.get().intensity).toBe(0.5)
    c.compare(false)
    c.redo()
    expect(history.redo).toHaveBeenCalledTimes(1)
    stop()
    expect(subs.size).toBe(0)
  })
})

describe("disabled, read-only and mixed fields", () => {
  const gated = {
    light: choice("spot", ["spot", "area"]),
    cone: knob(30, { min: 1, max: 90, step: 1, disabled: (v) => v.light !== "spot" }),
    lux: knob(100, { min: 0, max: 1000, step: 1, readOnly: true }),
    soft: knob(0.2, { min: 0, max: 1, step: 0.01 }),
  }
  it("Random, Mutate and Reset skip them; a disabled predicate reads the values", () => {
    const onReset = vi.fn()
    const c = defineControls("gated", gated, {
      enabled: true,
      storage: null,
      random: seeded(5),
      onReset,
    })
    expect(c.isDisabled("cone")).toBe(false)
    c.set({ cone: 60, soft: 0.8 })
    c.set({ light: "area" })
    expect(c.isDisabled("cone")).toBe(true)
    expect(c.isReadOnly("lux")).toBe(true)
    for (let i = 0; i < 10; i++) {
      c.randomize(["cone", "lux", "soft"])
      c.mutate(["cone", "lux", "soft"])
    }
    expect(c.get().cone).toBe(60)
    expect(c.get().lux).toBe(100)
    c.reset()
    expect(c.get().cone).toBe(60)
    expect(c.get().soft).toBe(0.2)
    expect(c.get().light).toBe("spot")
    // Some fields stayed, so the reset is reported key by key, never as "everything".
    expect(onReset).not.toHaveBeenCalledWith({})
    expect(onReset).toHaveBeenCalledWith({ key: "soft" })
    c.resetKey("cone")
    expect(c.get().cone).toBe(30) // enabled again now that light is spot
  })

  it("a mixed key shows until edited, and its first edit reports even the value shown", () => {
    const sets: [string, unknown][] = []
    const descriptors: ControlDescriptor[] = [
      { key: "size", kind: "number", default: 2, min: 0, max: 10, step: 1 },
      { key: "on", kind: "toggle", default: false },
    ]
    const remote = createRemoteControls("inspector", descriptors, {
      nullDefaults: false,
      onSet: (k, v) => sets.push([k, v]),
    })
    const heard = vi.fn()
    remote.subscribe(heard)
    remote.update(descriptors, { size: 4 }, { mixed: ["size"] })
    expect(remote.isMixed("size")).toBe(true)
    expect(heard).toHaveBeenCalled()
    remote.set({ size: 4 })
    expect(sets).toEqual([["size", 4]])
    expect(remote.isMixed("size")).toBe(false)
    remote.setMixed(["on"])
    expect(remote.isMixed("on")).toBe(true)
    remote.sync({}, { mixed: [] })
    expect(remote.isMixed("on")).toBe(false)
  })

  it("new predicate closures on unchanged descriptors keep values and history", () => {
    const make = (off: boolean): ControlDescriptor[] => [
      { key: "a", kind: "number", default: 1, min: 0, max: 10, step: 1, disabled: () => off },
    ]
    const remote = createRemoteControls("closures", make(false), { echo: 0 })
    remote.set({ a: 5 })
    remote.update(make(true), { a: 5 })
    expect(remote.isDisabled("a")).toBe(true)
    expect(remote.canUndo).toBe(true)
    expect(remote.get().a).toBe(5)
  })
})

describe("persist", () => {
  const save = (persist: "all" | "variants" | "none") => {
    const storage = memoryStorage()
    const c = defineControls("kept", schema, { enabled: true, storage, persist })
    c.set({ size: 9 })
    c.lock("intensity")
    c.variants.save("Nine")
    return { storage, again: defineControls("kept", schema, { enabled: true, storage, persist }) }
  }
  it('"all" keeps values, locks and variants', () => {
    const { storage, again } = save("all")
    expect(storage.getItem(storageKey("kept", "state"))).not.toBeNull()
    expect(again.get().size).toBe(9)
    expect(again.variants.list().length).toBe(1)
  })
  it('"variants" keeps only saved variants', () => {
    const { storage, again } = save("variants")
    expect(storage.getItem(storageKey("kept", "state"))).toBeNull()
    expect(again.get().size).toBe(4)
    expect(again.isLocked("intensity")).toBe(false)
    expect(again.variants.list().map((v) => v.name)).toEqual(["Nine"])
  })
  it('"none" keeps nothing', () => {
    const { storage, again } = save("none")
    expect(storage.getItem(storageKey("kept", "state"))).toBeNull()
    expect(storage.getItem(storageKey("kept", "variants"))).toBeNull()
    expect(again.variants.list()).toEqual([])
  })
})
