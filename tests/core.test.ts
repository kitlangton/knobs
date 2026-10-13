import { describe, expect, expectTypeOf, it, vi } from "vitest"
import { createRoot as createSolidRoot, type Accessor } from "solid-js"
import {
  choice,
  createRemoteControls,
  defineControls,
  formatCode,
  formatSwift,
  fromDescriptors,
  knob,
  memoryStorage,
  toggle,
  urlFlag,
  type ControlDescriptor,
  type Values,
} from "../src/index.js"
import { normalize } from "../src/core/schema.js"
import { randomValues } from "../src/core/random.js"
import { storageKey } from "../src/core/storage.js"
import { useControls } from "../src/react/useControls.js"
import { useControls as useSolidControls } from "../src/solid/index.js"
import { computeHintPrefixes } from "../src/panel/hints.js"
import { nextPresetIndex, resolveActivePresetEntry, type PresetEntry } from "../src/panel/presets.js"

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
  it("undoes and redoes every change, coalescing drags into one entry", () => {
    const c = make()
    expect(c.canUndo).toBe(false)
    c.set({ count: 10 })
    c.set({ count: 20 }, { coalesce: true })
    c.set({ count: 30 }, { coalesce: true })
    c.set({ flavor: "clean" })
    expect(c.get()).toMatchObject({ count: 30, flavor: "clean" })
    c.undo()
    expect(c.get()).toMatchObject({ count: 30, flavor: "inked" })
    c.undo()
    expect(c.get().count).toBe(98)
    expect(c.canUndo).toBe(false)
    expect(c.canRedo).toBe(true)
    c.redo()
    expect(c.get().count).toBe(30)
    c.randomize()
    expect(c.canRedo).toBe(false)
    c.undo()
    expect(c.get().count).toBe(30)
  })
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

describe("metadata, per-key/group reset, sync, remote descriptors and Solid", () => {
  it("preserves field metadata and resets single keys or groups", () => {
    const grouped = defineControls(
      "grouped",
      {
        duration: knob(0.4, {
          min: 0.1,
          max: 1,
          step: 0.05,
          unit: "s",
          label: "Duration",
          group: "Spring",
        }),
        bounce: knob(0.3, { min: 0, max: 0.7, step: 0.05, label: "Bounce", group: "Spring" }),
        mode: choice("split", ["split", "flip"], {
          label: "View mode",
          group: "Stage",
          shortcut: "m",
        }),
        muted: toggle(true, { label: "Muted", group: "Stage", shortcut: "t" }),
      },
      { enabled: true, storage: null },
    )
    expect(grouped.schema.duration.label).toBe("Duration")
    expect(grouped.schema.mode.group).toBe("Stage")
    expect(grouped.isModified()).toBe(false)
    grouped.set({ duration: 0.6, bounce: 0.5, mode: "flip" })
    expect(grouped.isModified()).toBe(true)
    expect(grouped.isModified("duration")).toBe(true)
    expect(grouped.isModified("muted")).toBe(false)
    expect(grouped.modified()).toEqual({ duration: 0.6, bounce: 0.5, mode: "flip" })
    grouped.resetKey("mode")
    expect(grouped.get().mode).toBe("split")
    expect(grouped.isModified("mode")).toBe(false)
    grouped.resetGroup("Spring")
    expect(grouped.get()).toEqual(grouped.locked)
    expect(grouped.isModified()).toBe(false)
  })

  it("syncs remote values without polluting local undo history or echoing local onChange", () => {
    const changes: { patch: unknown; source: string }[] = []
    const c = defineControls("remote-sync", schema, {
      enabled: true,
      storage: null,
      onChange: (patch, _values, meta) => changes.push({ patch, source: meta.source }),
    })
    c.sync({ count: 120, flavor: "clean" })
    expect(c.get()).toMatchObject({ count: 120, flavor: "clean" })
    expect(c.canUndo).toBe(false)
    expect(changes).toEqual([{ patch: { count: 120, flavor: "clean" }, source: "remote" }])
    // replace: true restores omitted keys back to locked defaults
    c.sync({ count: 55 }, { replace: true })
    expect(c.get()).toEqual({ ...c.locked, count: 55 })
  })

  it("builds remote controls from socket descriptors and formats Swift declarations", () => {
    const descriptors: ControlDescriptor[] = [
      {
        key: "drawer.edge.fade",
        label: "Edge fade",
        kind: "number",
        swiftType: "Double",
        default: 16,
        min: 0,
        max: 40,
        step: 1,
        group: "drawer",
      },
      {
        key: "drawer.spring.duration",
        label: "Drawer spring duration",
        kind: "number",
        swiftType: "Double",
        default: 0.35,
        min: 0.1,
        max: 1,
        step: 0.05,
        group: "drawer",
      },
      {
        key: "drawer.spring.bounce",
        label: "Drawer spring bounce",
        kind: "number",
        swiftType: "Double",
        default: 0.15,
        min: 0,
        max: 0.6,
        step: 0.05,
        group: "drawer",
      },
      {
        key: "composer.chrome",
        label: "Chrome",
        kind: "choice",
        swiftType: "ChromeStyle",
        default: "glass",
        choices: ["glass", "solid"],
        group: "composer",
      },
    ]
    const sent: [string, number | string | boolean | null][] = []
    const resets: { key?: string; group?: string }[] = []
    const remote = createRemoteControls("iphone", descriptors, {
      values: { "drawer.edge.fade": 24 },
      onSet: (key, value) => sent.push([key, value]),
      onReset: (target) => resets.push(target),
    })
    expect(remote.get()["drawer.edge.fade"]).toBe(24)
    expect(sent).toEqual([])
    remote.set({ "drawer.spring.duration": 0.45, "composer.chrome": "solid" })
    expect(sent).toEqual([
      ["drawer.spring.duration", 0.45],
      ["composer.chrome", "solid"],
    ])
    const swiftAll = remote.swift()
    expect(swiftAll).toContain(
      'Tunable<Double>("drawer.edge.fade", "Edge fade", default: 24, in: 0...40, step: 1)  // was 16',
    )
    expect(swiftAll).toContain(
      'TunableSpring("drawer.spring", "Drawer spring", duration: 0.45, bounce: 0.15)  // was duration: 0.35, bounce: 0.15',
    )
    expect(remote.swift("composer")).toBe(
      'Tunable<ChromeStyle>("composer.chrome", "Chrome", default: .solid)  // was .glass',
    )
    remote.resetKey("composer.chrome")
    expect(sent.at(-1)).toEqual(["composer.chrome", null])
    remote.resetGroup("drawer")
    expect(resets.at(-1)).toEqual({ group: "drawer" })
    expect(fromDescriptors(descriptors)["composer.chrome"].kind).toBe("choice")
    expect(formatSwift(descriptors, {})).toBe("")
  })

  it("drives Solid reactive accessors and cleans up on dispose", () => {
    const c = make()
    expectTypeOf<ReturnType<typeof useSolidControls<typeof schema>>>().toEqualTypeOf<
      Accessor<Values<typeof schema>>
    >()
    createSolidRoot((dispose) => {
      const values = useSolidControls(c)
      expect(values().count).toBe(98)
      c.set({ count: 140 })
      expect(values().count).toBe(140)
      dispose()
    })
  })

  it("computes minimal unique hint prefixes, dims typed chars, and detects single match", () => {
    const items = [
      { key: "seed", display: "seed" },
      { key: "count", display: "count" },
      { key: "size", display: "size" },
      { key: "flavor", display: "flavor" },
      { key: "grain", display: "grain" },
    ]
    const initial = computeHintPrefixes(items, "")
    expect(initial.uniqueMatchIndex).toBe(-1)
    expect(initial.badges.map((b) => b.prefix)).toEqual(["se", "c", "si", "f", "g"])
    expect(initial.badges[0]).toEqual({ match: true, prefix: "se", typed: "", rest: "se" })

    const afterS = computeHintPrefixes(items, "s")
    expect(afterS.uniqueMatchIndex).toBe(-1)
    expect(afterS.matchIndices).toEqual([0, 2])
    expect(afterS.badges[0]).toEqual({ match: true, prefix: "se", typed: "s", rest: "e" })
    expect(afterS.badges[2]).toEqual({ match: true, prefix: "si", typed: "s", rest: "i" })
    expect(afterS.badges[1]?.match).toBe(false)

    const afterSe = computeHintPrefixes(items, "se")
    expect(afterSe.uniqueMatchIndex).toBe(0)

    const afterC = computeHintPrefixes(items, "c")
    expect(afterC.uniqueMatchIndex).toBe(1)
  })

  it("never gets stuck when cycling presets and a saved variant equals a preset", () => {
    const c = make()
    // Save a variant whose values equal the "default" preset
    const vDefault = c.variants.save("Saved default")
    const entries: PresetEntry<Values<typeof schema>>[] = [
      ...Object.entries(c.presets).map(([id, values]) => ({
        id: `p:${id}`,
        kind: "preset" as const,
        rawId: id,
        label: id,
        values,
        apply: () => c.preset(id),
      })),
      {
        id: `v:${vDefault.id}`,
        kind: "variant" as const,
        rawId: vDefault.id,
        label: vDefault.name ?? vDefault.id,
        values: vDefault.values,
        apply: () => c.variants.load(vDefault.id),
      },
    ]
    // entries: [p:default, p:subtle, v:<id>] where p:default and v:<id> have identical values
    let lastAppliedId: string | null = null
    const visited: string[] = []
    for (let step = 0; step < entries.length; step++) {
      const state = resolveActivePresetEntry(entries, c.get(), lastAppliedId)
      const nextIdx = nextPresetIndex(entries.length, state.activeIndex, 1)
      const entry = entries[nextIdx]!
      lastAppliedId = entry.id
      entry.apply()
      const after = resolveActivePresetEntry(entries, c.get(), lastAppliedId)
      visited.push(after.activeId)
    }
    expect(visited).toEqual(["p:subtle", `v:${vDefault.id}`, "p:default"])
  })

  it("exposes renderer mode option on controls and remote controls", () => {
    const gpuCtl = defineControls("gpu-test", schema, { renderer: "gpu", storage: null })
    expect(gpuCtl.renderer).toBe("gpu")
    const remote = createRemoteControls(
      "remote-gpu",
      [{ key: "x", kind: "number", default: 1, min: 0, max: 10 }],
      { renderer: "dom" },
    )
    expect(remote.renderer).toBe("dom")
  })
})
