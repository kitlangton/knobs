import { describe, expect, it } from "vitest"
import { choice, defineControls, knob, memoryStorage, spring, toggle } from "../src/index.js"
import { storageKey } from "../src/core/storage.js"

// OpenCode Desktop's Motion workspace: Global pinned, a Sidebars tab whose springs take the
// presets, and an Experiments tab that has none.
const schema = () => ({
  speed: knob(1, { min: 0.25, max: 4, step: 0.05, group: "Global" }),
  slow: toggle(false, { group: "Global" }),
  sidebars: spring({ duration: 0.3, bounce: 0 }, { group: "Sidebars", tab: "Sidebars" }),
  panel: spring({ duration: 0.35, bounce: 0 }, { group: "Sidebars" }),
  hover: spring({ duration: 0.14, bounce: 0 }, { group: "Experiments", tab: "Experiments" }),
  avatars: choice("letters", ["letters", "generated"], { group: "Experiments" }),
})
const s = (duration: number) => ({ duration, bounce: 0 })
const sidebars = {
  snappy: { sidebars: s(0.2), panel: s(0.25) },
  calm: { sidebars: s(0.45), panel: s(0.5) },
}
const make = (storage = memoryStorage(), extra: Record<string, unknown> = {}) =>
  defineControls("scoped", schema(), {
    enabled: true,
    storage,
    pinned: ["Global"],
    scopedPresets: { Sidebars: sidebars },
    ...extra,
  })

describe("scoped presets", () => {
  it("belong to their tab: each key knows its scope, pinned keys have none", () => {
    const c = make()
    expect(Object.keys(c.scopes)).toEqual(["Sidebars"])
    expect(c.scopes.Sidebars!.keys).toEqual(["sidebars", "panel"])
    expect(Object.keys(c.scopes.Sidebars!.presets)).toEqual(["default", "snappy", "calm"])
    expect(["speed", "sidebars", "panel", "hover"].map((k) => c.scopeOf(k))).toEqual([
      undefined,
      "Sidebars",
      "Sidebars",
      "",
    ])
    // The panel's own presets are just the defaults now.
    expect(Object.keys(c.presets)).toEqual(["default"])
  })

  it("applying one moves only its scope's keys", () => {
    const c = make()
    c.set({ speed: 2, hover: s(0.5), avatars: "generated" })
    c.preset("calm", { scope: "Sidebars" })
    expect(c.get()).toMatchObject({
      speed: 2,
      hover: s(0.5),
      avatars: "generated",
      sidebars: s(0.45),
      panel: s(0.5),
    })
    expect(c.activePreset("Sidebars")).toEqual({ kind: "preset", id: "calm" })
    expect(c.activePreset()).toBeNull()
    // Shipped puts the scope back to its defaults and leaves the rest.
    c.preset("default", { scope: "Sidebars" })
    expect(c.get()).toMatchObject({ hover: s(0.5), sidebars: s(0.3), panel: s(0.35) })
    expect(c.activePreset("Sidebars")).toBeNull()
  })

  it("marks only its own keys modified, and matches over them alone", () => {
    const c = make()
    c.preset("snappy", { scope: "Sidebars" })
    c.set({ hover: s(0.6) })
    expect(c.matchingPreset("Sidebars")).toBe("snappy")
    expect(c.isModified("sidebars")).toBe(false)
    // Modified against its own default: no preset reaches it.
    expect(c.isModified("hover")).toBe(true)
    c.set({ panel: s(0.3) })
    expect(c.matchingPreset("Sidebars")).toBe("custom")
    expect(c.isModified("panel")).toBe(true)
    // A reset of the drifted key goes back to the scope's preset first.
    c.resetKey("panel")
    expect(c.get().panel).toEqual(s(0.25))
  })

  it("a switch is one undo step, values and active preset together", () => {
    const c = make()
    c.preset("snappy", { scope: "Sidebars" })
    c.preset("calm", { scope: "Sidebars" })
    c.undo()
    expect(c.get().sidebars).toEqual(s(0.2))
    expect(c.activePreset("Sidebars")).toEqual({ kind: "preset", id: "snappy" })
    c.undo()
    expect(c.activePreset("Sidebars")).toBeNull()
    c.redo()
    expect(c.activePreset("Sidebars")).toEqual({ kind: "preset", id: "snappy" })
  })

  it("two scopes keep their own active presets", () => {
    const c = make(memoryStorage(), {
      scopedPresets: { Sidebars: sidebars, Experiments: { slow: { hover: s(0.4) } } },
    })
    c.preset("calm", { scope: "Sidebars" })
    c.preset("slow", { scope: "Experiments" })
    expect(c.activePreset("Sidebars")).toEqual({ kind: "preset", id: "calm" })
    expect(c.activePreset("Experiments")).toEqual({ kind: "preset", id: "slow" })
    expect(c.get()).toMatchObject({ sidebars: s(0.45), hover: s(0.4) })
    expect(c.baseValues()).toMatchObject({ sidebars: s(0.45), hover: s(0.4), speed: 1 })
    // A reset of everything forgets them all.
    c.reset()
    c.reset()
    expect(c.activePreset("Sidebars")).toBeNull()
    expect(c.activePreset("Experiments")).toBeNull()
  })

  it("a group can be a scope too", () => {
    const c = defineControls(
      "scoped-group",
      {
        a: knob(1, { min: 0, max: 10, group: "Shape" }),
        b: knob(1, { min: 0, max: 10, group: "Color" }),
      },
      { enabled: true, storage: null, scopedPresets: { Shape: { big: { a: 9, b: 9 } } } },
    )
    c.preset("big", { scope: "Shape" })
    expect(c.get()).toEqual({ a: 9, b: 1 })
    expect(() => c.preset("big", { scope: "Color" })).toThrow(/Unknown preset scope/)
  })

  it("a group's Reset forgets the group's own scoped preset", () => {
    const c = defineControls(
      "scoped-group-reset",
      {
        a: knob(1, { min: 0, max: 10, group: "Shape" }),
        b: knob(1, { min: 0, max: 10, group: "Shape" }),
        c: knob(1, { min: 0, max: 10, group: "Color" }),
      },
      { enabled: true, storage: null, scopedPresets: { Shape: { big: { a: 9, b: 8 } } } },
    )
    c.preset("big", { scope: "Shape" })
    c.set({ a: 5 })
    // Off the preset, Reset goes back to it first…
    c.resetGroup("Shape")
    expect(c.get()).toEqual({ a: 9, b: 8, c: 1 })
    expect(c.activePreset("Shape")?.id).toBe("big")
    // …then to the defaults, with nothing left to reset.
    c.resetGroup("Shape")
    expect(c.get()).toEqual({ a: 1, b: 1, c: 1 })
    expect(c.activePreset("Shape")).toBeNull()
    expect(c.isModified("a")).toBe(false)
    expect(c.canReset(["a", "b"])).toBe(false)
    // A further Reset stays at the defaults.
    c.resetGroup("Shape")
    expect(c.get()).toEqual({ a: 1, b: 1, c: 1 })
  })

  it("a variants choice on a tab makes that tab's presets", () => {
    const c = defineControls(
      "scoped-variants",
      {
        look: choice("today", ["today", "glide"], {
          variants: true,
          group: "Experiments",
          tab: "Experiments",
        }),
        hover: spring(s(0.14), { group: "Experiments" }),
        sidebars: spring(s(0.3), { group: "Sidebars", tab: "Sidebars" }),
      },
      {
        enabled: true,
        storage: null,
        scopedPresets: { Sidebars: sidebars },
        presetLabels: { glide: "Glide" },
      },
    )
    expect(Object.keys(c.scopes).sort()).toEqual(["Experiments", "Sidebars"])
    expect(Object.keys(c.scopes.Experiments!.presets)).toEqual(["default", "glide"])
    expect(c.presetLabel("default", "Experiments")).toBe("today")
    expect(c.presetLabel("default", "Sidebars")).toBe("default")
    // By scope: each strip's default chip has its own name.
    const named = defineControls(
      "scoped-default-labels",
      { a: knob(1, { min: 0, max: 9 }), b: knob(1, { min: 0, max: 9, group: "Motion" }) },
      {
        enabled: true,
        storage: null,
        presets: { big: { a: 9 } },
        scopedPresets: { Motion: { snappy: { b: 2 } } },
        defaultLabel: { "": "Empty", Motion: "Shipped" },
      },
    )
    expect(named.presetLabel("default")).toBe("Empty")
    expect(named.presetLabel("default", "Motion")).toBe("Shipped")
    c.preset("calm", { scope: "Sidebars" })
    c.preset("glide", { scope: "Experiments" })
    expect(c.get()).toMatchObject({ look: "glide", sidebars: s(0.45) })
  })

  it("saved variants are the scope's own and move only its keys", () => {
    const storage = memoryStorage()
    const c = make(storage)
    const v = c.scopes.Sidebars!.variants
    v.list()
    c.set({ sidebars: s(0.6), hover: s(0.9), speed: 3 })
    const saved = v.save("Slow")
    expect(saved.values).toMatchObject({ sidebars: s(0.6), hover: s(0.14), speed: 1 })
    expect(c.variants.list()).toEqual([])
    c.set({ sidebars: s(0.3), hover: s(0.2) })
    v.load(saved.id)
    expect(c.get()).toMatchObject({ sidebars: s(0.6), hover: s(0.2), speed: 3 })
    expect(c.activePreset("Sidebars")).toEqual({ kind: "variant", id: saved.id })
    expect(storage.getItem(storageKey("scoped", "variants:Sidebars"))).toContain("Slow")
    // Deleting it lets go of it as the active preset.
    v.remove(saved.id)
    expect(c.activePreset("Sidebars")).toBeNull()
  })

  it("keeps each scope's active preset across a reload", () => {
    const storage = memoryStorage()
    make(storage).preset("calm", { scope: "Sidebars" })
    const again = make(storage)
    expect(again.activePreset("Sidebars")).toEqual({ kind: "preset", id: "calm" })
    expect(again.get().sidebars).toEqual(s(0.45))
  })

  it("moves an active preset saved panel-wide to the scope that now has it", () => {
    const storage = memoryStorage()
    const before = defineControls("scoped", schema(), {
      enabled: true,
      storage,
      pinned: ["Global"],
      presets: sidebars,
    })
    before.preset("calm")
    expect(before.activePreset()).toEqual({ kind: "preset", id: "calm" })
    const after = make(storage)
    expect(after.activePreset()).toBeNull()
    expect(after.activePreset("Sidebars")).toEqual({ kind: "preset", id: "calm" })
    expect(after.isModified("sidebars")).toBe(false)
  })

  it("starts each scope with the panel's earlier saved variants that move it", () => {
    const storage = memoryStorage()
    const before = defineControls("scoped", schema(), {
      enabled: true,
      storage,
      persist: "variants",
      pinned: ["Global"],
      presets: sidebars,
    })
    before.variants.list()
    before.set({ sidebars: s(0.7), hover: s(0.9) })
    before.variants.save("Mine")
    before.reset()
    before.reset()
    before.set({ hover: s(0.8) })
    before.variants.save("Hover only")
    const after = make(storage, { persist: "variants" })
    const list = after.scopes.Sidebars!.variants.list()
    expect(list.map((v) => v.name)).toEqual(["Mine"])
    expect(list[0]!.values).toMatchObject({ sidebars: s(0.7), hover: s(0.14) })
  })

  it("moves an active saved variant from before the scopes into each scope it started out in", () => {
    const storage = memoryStorage()
    const ab = () => ({
      a: knob(1, { min: 0, max: 10, step: 1, group: "A", tab: "A" }),
      b: knob(1, { min: 0, max: 10, step: 1, group: "B", tab: "B" }),
    })
    const before = defineControls("scoped-variant", ab(), {
      enabled: true,
      storage,
      presets: { three: { a: 3 } },
    })
    before.variants.list()
    before.set({ a: 8 })
    before.variants.load(before.variants.save("Eight").id)
    expect(before.activePreset()?.kind).toBe("variant")
    const after = defineControls("scoped-variant", ab(), {
      enabled: true,
      storage,
      scopedPresets: { A: { three: { a: 3 } } },
    })
    const ref = after.activePreset("A")
    expect(ref?.kind).toBe("variant")
    expect(after.scopes.A!.variants.list().map((v) => v.id)).toContain(ref!.id)
    expect(after.activePreset()).toBeNull()
    expect(after.baseValues().a).toBe(8)
    expect(after.isModified("a")).toBe(false)
  })

  it("a scoped preset or variant lets go of a group preset it takes keys from, and only that", () => {
    const c = defineControls(
      "scoped-groups",
      {
        a: knob(1, { min: 0, max: 10, step: 1, group: "G", tab: "A" }),
        b: knob(1, { min: 0, max: 10, step: 1, group: "H", tab: "B" }),
      },
      {
        enabled: true,
        storage: null,
        scopedPresets: { A: { nine: { a: 9 } } },
        groupPresets: {
          G: [{ name: "Five", values: { a: 5 } }],
          H: [{ name: "Six", values: { b: 6 } }],
        },
      },
    )
    c.groupPreset("G", 0)
    c.groupPreset("H", 0)
    c.preset("nine", { scope: "A" })
    expect(c.get()).toEqual({ a: 9, b: 6 })
    expect(c.activeGroupPreset("G")).toBe(-1)
    expect(c.activeGroupPreset("H")).toBe(0)
    expect(c.baseValues()).toMatchObject({ a: 9, b: 6 })
    c.set({ a: 7 })
    c.resetKey("a")
    expect(c.get().a).toBe(9)
    // A scoped saved variant does the same.
    c.groupPreset("G", 0)
    const v = c.scopes.A!.variants
    v.list()
    c.set({ a: 2 })
    v.load(v.save("Two").id)
    expect(c.activeGroupPreset("G")).toBe(-1)
    expect(c.baseValues().a).toBe(2)
    // Undo brings the group's preset back with its value.
    c.undo()
    expect(c.activeGroupPreset("G")).toBe(0)
  })

  it("without scopes, presets work as before", () => {
    const c = defineControls("plain", schema(), {
      enabled: true,
      storage: null,
      pinned: ["Global"],
      presets: sidebars,
    })
    expect(c.scopes).toEqual({})
    expect(c.scopeOf("hover")).toBe("")
    c.set({ hover: s(0.5) })
    c.preset("calm")
    // A panel preset is complete: what it leaves out goes back to its default.
    expect(c.get().hover).toEqual(s(0.14))
  })
})

// A group presets leave alone still answers to a scope of its own name: other scopes' presets
// (the panel's, tabs', other groups') leave it alone, its own move it.
describe("a group outside the presets with a scope of its own", () => {
  const motion = () => ({
    state: choice("A", ["A", "B"], { variants: true }),
    height: spring({ duration: 0.4, bounce: 0 }, { group: "Motion" }),
  })
  const snappy = { height: s(0.3) }
  const make = (extra: Record<string, unknown> = { inPresets: { Motion: false } }) => {
    const changes: { patch: unknown; source: unknown }[] = []
    const c = defineControls("own-scope", motion(), {
      enabled: true,
      storage: null,
      presets: { B: {} },
      defaultLabel: { "": "A", Motion: "Shipped" },
      scopedPresets: { Motion: { Snappy: snappy } },
      onChange: (patch, _values, meta) => changes.push({ patch, source: meta.source }),
      ...extra,
    })
    return { c, changes }
  }

  it("its chip applies the preset and fires onChange from the preset", () => {
    const { c, changes } = make()
    expect(c.inPresets("height")).toBe(false)
    expect(c.scopeOf("height")).toBe("Motion")
    expect(c.scopes.Motion!.keys).toEqual(["height"])
    c.preset("Snappy", { scope: "Motion" })
    expect(c.get().height).toEqual(s(0.3))
    expect(changes).toEqual([{ patch: { height: s(0.3) }, source: "preset" }])
    expect(c.activePreset("Motion")).toEqual({ kind: "preset", id: "Snappy" })
    expect(c.matchingPreset("Motion")).toBe("Snappy")
    expect(c.isModified("height")).toBe(false)
    c.set({ height: s(0.5) })
    expect(c.matchingPreset("Motion")).toBe("custom")
    expect(c.isModified("height")).toBe(true)
    c.undo()
    expect(c.get().height).toEqual(s(0.3))
    c.undo()
    expect(c.get().height).toEqual(s(0.4))
    expect(c.activePreset("Motion")).toBe(null)
  })

  it("the panel's state presets leave Motion alone, and their chip stays lit when it moves", () => {
    const { c } = make()
    c.preset("Snappy", { scope: "Motion" })
    c.preset("B")
    expect(c.get()).toEqual({ state: "B", height: s(0.3) })
    expect(c.matchingPreset("")).toBe("B")
    c.set({ height: s(0.6) })
    expect(c.matchingPreset("")).toBe("B")
    c.preset("default")
    expect(c.get()).toEqual({ state: "A", height: s(0.6) })
    expect(c.matchingPreset("")).toBe("default")
    // A variant saved on the panel's strip leaves Motion out; Motion's own keeps only Motion.
    const saved = c.variants.save("Mine")
    expect(c.variants.list().find((v) => v.id === saved.id)!.values.height).toEqual(s(0.4))
    const own = c.scopes.Motion!.variants.save("Slow")
    expect(c.scopes.Motion!.variants.list().find((v) => v.id === own.id)!.values).toEqual({
      state: "A",
      height: s(0.6),
    })
  })

  it("a pinned group with a scope of its own takes its presets too", () => {
    const { c, changes } = make({ pinned: ["Motion"] })
    expect(c.isPinned("height")).toBe(true)
    expect(c.scopeOf("height")).toBe("Motion")
    c.preset("Snappy", { scope: "Motion" })
    expect(c.get().height).toEqual(s(0.3))
    expect(changes.at(-1)).toEqual({
      patch: { height: s(0.3) },
      source: "preset",
    })
    c.preset("B")
    expect(c.get()).toEqual({ state: "B", height: s(0.3) })
    expect(c.matchingPreset("Motion")).toBe("Snappy")
  })

  it("a field that says inPresets: false itself stays out of its group's scope", () => {
    const c = defineControls(
      "own-scope-field",
      {
        height: spring({ duration: 0.4, bounce: 0 }, { group: "Motion", inPresets: false }),
        width: spring({ duration: 0.4, bounce: 0 }, { group: "Motion" }),
      },
      {
        enabled: true,
        storage: null,
        scopedPresets: {
          Motion: { Snappy: { height: s(0.3), width: s(0.3) } },
        },
      },
    )
    expect(c.scopeOf("height")).toBe(undefined)
    c.preset("Snappy", { scope: "Motion" })
    expect(c.get()).toEqual({ height: s(0.4), width: s(0.3) })
  })
})
