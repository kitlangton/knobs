import { describe, expect, expectTypeOf, it, vi } from "vitest"
import {
  choice,
  defineControls,
  formatCode,
  knob,
  memoryStorage,
  toggle,
  urlFlag,
  type Values,
} from "../src/index.js"
import { normalize } from "../src/core/schema.js"
import { randomValues } from "../src/core/random.js"
import { storageKey } from "../src/core/storage.js"
import { useControls } from "../src/react/useControls.js"

const schema = {
  count: knob(98, { min: 0, max: 300, step: 1 }),
  size: knob(7, { min: 1, max: 30, step: 0.5 }),
  flavor: choice("inked", ["inked", "clean"]),
  grain: toggle(true),
}
const make = (storage = memoryStorage()) =>
  defineControls("splat", schema, {
    enabled: true,
    storage,
    presets: { subtle: { count: 40, size: 4 } },
  })

describe("schema", () => {
  it("infers choice literals, numeric knobs and booleans through React", () => {
    const controls = make()
    expectTypeOf(controls.get().flavor).toEqualTypeOf<"inked" | "clean">()
    expectTypeOf(controls.get().count).toEqualTypeOf<number>()
    expectTypeOf(controls.locked.grain).toEqualTypeOf<boolean>()
    expectTypeOf<ReturnType<typeof useControls<typeof schema>>>().toEqualTypeOf<
      Values<typeof schema>
    >()
    if (false) {
      // @ts-expect-error Unknown choices cannot be assigned.
      controls.set({ flavor: "paper" })
      // @ts-expect-error Unknown schema keys cannot be assigned.
      controls.set({ missing: 3 })
    }
  })
  it("clamps, snaps relative to min, drops extra keys and rejects non-finite input", () => {
    expect(
      normalize(schema, { count: 999, size: 1.7, flavor: "bad", grain: "false", extra: 4 }),
    ).toEqual({ count: 300, size: 1.5, flavor: "inked", grain: true })
    expect(normalize(schema, { count: NaN, size: -100, grain: false })).toEqual({
      count: 98,
      size: 1,
      flavor: "inked",
      grain: false,
    })
    expect(normalize(schema, { count: Infinity }).count).toBe(98)
    expect(() => knob(1, { min: 0, max: 5, step: 0 })).toThrow()
    expect(() => knob(1, { min: 2, max: 1 })).toThrow()
    expect(() => choice("a", ["a", "a"])).toThrow()
  })
  it("never overshoots or lands off-step when the maximum isn't on the lattice", () => {
    const s = { n: knob(0.1, { min: 0.1, max: 1, step: 0.2 }) }
    expect(normalize(s, { n: 1 }).n).toBe(0.9)
    for (let i = 0; i <= 100; i++) {
      const n = randomValues(s, () => i / 100).n
      expect(n).toBeLessThanOrEqual(1)
      expect((n - 0.1) / 0.2).toBeCloseTo(Math.round((n - 0.1) / 0.2))
    }
    expect(randomValues(schema, () => 0)).toEqual({
      count: 0,
      size: 1,
      flavor: "inked",
      grain: false,
    })
    expect(randomValues(schema, () => 1)).toEqual({
      count: 300,
      size: 30,
      flavor: "clean",
      grain: true,
    })
  })
})

describe("store", () => {
  it("has stable immutable snapshots, subscription cleanup and no-op suppression", () => {
    const c = make(),
      listener = vi.fn(),
      unsubscribe = c.subscribe(listener)
    expect(c.get()).toBe(c.get())
    c.set({ count: 98 })
    expect(listener).not.toHaveBeenCalled()
    c.set({ count: 104.7 })
    expect(c.get().count).toBe(105)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(c.get())).toBe(true)
    expect(c.locked.count).toBe(98)
    unsubscribe()
    c.reset()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(c.getServerSnapshot()).toBe(c.locked)
  })
  it("normalizes persisted current state and keeps the snapshot stable on reads", () => {
    const storage = memoryStorage()
    storage.setItem(
      storageKey("splat", "state"),
      JSON.stringify({ version: 1, values: { count: -99, size: 800, flavor: "bad" } }),
    )
    const c = make(storage)
    expect(c.get()).toEqual({ count: 0, size: 30, flavor: "inked", grain: true })
    c.set({ count: 41 })
    expect(make(storage).get()).toEqual(c.get())
  })
  it("merges presets with locked defaults and identifies custom states", () => {
    const c = make()
    expect(c.matchingPreset()).toBe("default")
    c.preset("subtle")
    expect(c.get()).toEqual({ ...c.locked, count: 40, size: 4 })
    expect(c.matchingPreset()).toBe("subtle")
    c.set({ grain: false })
    expect(c.matchingPreset()).toBe("custom")
    expect(() => c.preset("missing")).toThrow()
    expect(() => c.preset("toString")).toThrow()
    c.reset()
    expect(c.get()).toEqual(c.locked)
  })
  it("disabled controls never read/write storage or touch the DOM", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("must not read")
      }),
      setItem: vi.fn(),
    }
    const c = defineControls("off", schema, { enabled: false, storage })
    c.set({ count: 11 })
    c.randomize()
    c.reset()
    expect(c.get()).toBe(c.locked)
    expect(c.getServerSnapshot()).toBe(c.locked)
    expect(c.variants.list()).toEqual([])
    expect(() => c.variants.save()).toThrow("disabled")
    expect(storage.getItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(urlFlag("knobs")()).toBe(false)
  })
  it("uses the boolean gate on each read", () => {
    let enabled = true
    const c = defineControls("gate", schema, { enabled: () => enabled, storage: null })
    c.set({ count: 2 })
    enabled = false
    expect(c.get()).toBe(c.locked)
    enabled = true
    expect(c.get().count).toBe(2)
  })
  it("keeps live changes when storage fails and exposes the error", () => {
    const c = defineControls("bad", schema, {
      enabled: true,
      storage: {
        getItem: () => {
          throw new Error("unavailable")
        },
        setItem: () => {
          throw new Error("full")
        },
      },
    })
    expect(c.get()).toEqual(c.locked)
    expect(c.error).toContain("unavailable")
    c.set({ count: 7 })
    expect(c.get().count).toBe(7)
    expect(c.error).toContain("full")
  })
})

describe("variants", () => {
  it("round-trips a versioned envelope, loads, merges IDs, copies and removes", () => {
    const storage = memoryStorage(),
      c = make(storage),
      listener = vi.fn()
    c.subscribe(listener)
    c.set({ count: 42 })
    const variant = c.variants.save(" Forty two ")
    expect(variant.name).toBe("Forty two")
    c.reset()
    c.variants.load(variant.id)
    expect(c.get().count).toBe(42)
    const json = c.variants.export()
    expect(JSON.parse(json).version).toBe(1)
    expect(make(storage).variants.list()).toEqual([variant])
    const other = make()
    expect(() => other.variants.import(json)).toThrow("Read variants")
    other.variants.list()
    other.variants.import(json)
    other.variants.import(json)
    expect(other.variants.list()).toEqual([variant])
    expect(c.code("ts", variant.values)).toContain("count: 42")
    other.variants.remove(variant.id)
    expect(other.variants.list()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(4)
  })
  it.each([
    { count: -1 },
    { count: 1.5 },
    { count: "12" },
    { flavor: "other" },
    { grain: 1 },
    { extra: 1 },
  ])("rejects schema-invalid imports atomically: %j", (patch) => {
    const c = make()
    c.variants.save("keep")
    const before = c.variants.export()
    const incoming = JSON.stringify({
      version: 1,
      controls: "splat",
      variants: [{ id: "incoming", values: { ...c.locked, ...patch } }],
    })
    expect(() => c.variants.import(incoming)).toThrow()
    expect(c.variants.export()).toBe(before)
  })
  it("rejects wrong versions, foreign controls, missing fields and duplicate IDs", () => {
    const c = make()
    c.variants.list()
    const v = { id: "x", values: c.locked }
    for (const data of [
      { version: 2, controls: "splat", variants: [] },
      { version: 1, controls: "other", variants: [] },
      { version: 1, controls: "splat", variants: [{ id: "x", values: {} }] },
      { version: 1, controls: "splat", variants: [v, v] },
      { version: 1, controls: "splat", variants: [{ ...v, name: 123 }] },
    ])
      expect(() => c.variants.import(JSON.stringify(data))).toThrow()
  })
  it("refuses to overwrite unread/corrupt storage, then recovers after repair", () => {
    const storage = memoryStorage(),
      key = storageKey("splat", "variants")
    storage.setItem(key, "broken")
    const c = make(storage)
    expect(() => c.variants.list()).toThrow()
    expect(c.variants.ready).toBe(false)
    expect(() => c.variants.save()).toThrow()
    expect(() => c.variants.remove("any")).toThrow()
    expect(() => c.variants.import('{"version":1,"controls":"splat","variants":[]}')).toThrow()
    expect(storage.getItem(key)).toBe("broken")
    storage.setItem(key, '{"version":1,"controls":"splat","variants":[]}')
    expect(c.variants.list()).toEqual([])
    expect(c.variants.ready).toBe(true)
    expect(c.variants.save().values).toEqual(c.locked)
  })
  it("does not claim a saved variant on quota failure", () => {
    const c = make({
      getItem: () => null,
      setItem: () => {
        throw new Error("quota")
      },
    })
    c.variants.list()
    expect(() => c.variants.save()).toThrow("quota")
    expect(c.variants.list()).toEqual([])
  })
})

describe("code", () => {
  it("formats TS, JSON and safe JSX expression props", () => {
    const c = make()
    expect(c.code()).toBe('{ count: 98, size: 7, flavor: "inked", grain: true }')
    expect(JSON.parse(c.code("json"))).toEqual(c.locked)
    expect(c.code("jsx")).toBe('count={98} size={7} flavor={"inked"} grain={true}')
    const odd = { "font-size": 12, text: 'a"<&\n' }
    expect(formatCode(odd)).toContain('["font-size"]: 12')
    expect(formatCode(odd, "jsx")).toContain('text={"a\\\"<&\\n"}')
  })
})
