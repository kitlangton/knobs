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
