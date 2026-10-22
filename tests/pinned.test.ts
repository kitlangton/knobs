import { describe, expect, it } from "vitest"
import { choice, defineControls, knob, spring, text, toggle } from "../src/index.js"
import { pinnedKeys, variantsOf } from "../src/core/schema.js"
import { presetsTouch, type PresetEntry } from "../src/panel/presets.js"

const schema = () => ({
  speed: knob(1, { min: 0.25, max: 4, step: 0.05, group: "Global" }),
  slow: toggle(false, { group: "Global" }),
  sidebars: spring({ duration: 0.3, bounce: 0 }, { group: "Sidebars", tab: "Sidebars" }),
  hover: spring({ duration: 0.14, bounce: 0 }, { group: "Experiments", tab: "Experiments" }),
})
const presets = {
  snappy: { sidebars: { duration: 0.2, bounce: 0 }, hover: { duration: 0.1, bounce: 0 } },
  calm: { sidebars: { duration: 0.45, bounce: 0 }, hover: { duration: 0.22, bounce: 0 }, speed: 2 },
}
const make = (options: { pinned?: readonly string[] } = { pinned: ["Global"] }) =>
  defineControls("pinned", schema(), { enabled: true, storage: null, presets, ...options })

describe("pinned groups", () => {
  it("pins a group by the store's list or by its first field that says", () => {
    expect(make().isPinned("speed")).toBe(true)
    expect(make().isPinned("slow")).toBe(true)
    expect(make().isPinned("sidebars")).toBe(false)
    const byField = defineControls(
      "pinned-field",
      {
        speed: knob(1, { min: 0, max: 4, group: "Global", pinned: true }),
        slow: toggle(false, { group: "Global" }),
        loose: toggle(false, { pinned: true }),
        other: toggle(false),
      },
      { enabled: true, storage: null },
    )
    expect(["speed", "slow", "loose", "other"].map((k) => byField.isPinned(k))).toEqual([
      true,
      true,
      true,
      false,
    ])
    expect([...pinnedKeys({ a: toggle(false, { group: "G", pinned: false }) }, ["G"])]).toEqual([
      "a",
    ])
  })

  it("applying a preset leaves pinned keys alone, even ones the preset names", () => {
    const c = make()
    c.set({ speed: 1.5, slow: true })
    c.preset("calm")
    expect(c.get()).toMatchObject({
      speed: 1.5,
      slow: true,
      sidebars: { duration: 0.45, bounce: 0 },
      hover: { duration: 0.22, bounce: 0 },
    })
    expect(c.presets.calm!.speed).toBe(1)
    // Back to the shipped values: the pinned keys still stay.
    c.preset("default")
    expect(c.get()).toMatchObject({ speed: 1.5, slow: true, sidebars: { duration: 0.3 } })
  })

  it("matches a preset whatever the pinned keys hold, and marks them against their defaults", () => {
    const c = make()
    c.preset("snappy")
    c.set({ slow: true })
    expect(c.matchingPreset()).toBe("snappy")
    expect(c.isModified("sidebars")).toBe(false)
    expect(c.isModified("slow")).toBe(true)
    expect(c.baseValues().speed).toBe(1)
  })

  it("saving a variant keeps pinned keys out, and loading one leaves them alone", () => {
    const c = make()
    c.variants.list()
    c.set({ speed: 2, sidebars: { duration: 0.5, bounce: 0 } })
    const saved = c.variants.save("Mine")
    expect(saved.values.speed).toBe(1)
    expect(saved.values.sidebars).toEqual({ duration: 0.5, bounce: 0 })
    c.set({ speed: 3, sidebars: { duration: 0.3, bounce: 0 } })
    c.variants.load(saved.id)
    expect(c.get()).toMatchObject({ speed: 3, sidebars: { duration: 0.5, bounce: 0 } })
  })

  it("Reset and Random still reach pinned keys, rolling them freely under a preset", () => {
    const c = defineControls("pinned-roll", schema(), {
      enabled: true,
      storage: null,
      presets,
      pinned: ["Global"],
      random: () => 0.999,
    })
    c.preset("snappy")
    c.randomize(["speed"])
    // Anywhere in range (the top, here), not near the default as a preset's keys would land.
    expect(c.get().speed).toBe(4)
    c.reset()
    expect(c.get()).toMatchObject({ speed: 1, sidebars: { duration: 0.2 } })
    c.reset()
    expect(c.get()).toMatchObject({ speed: 1, sidebars: { duration: 0.3 } })
  })

  it("without pinned groups, presets behave as before", () => {
    const c = make({})
    c.set({ speed: 1.5 })
    c.preset("calm")
    expect(c.get().speed).toBe(2)
  })
})

describe("the preset strip on a tab", () => {
  const entry = (rawId: string, values: Record<string, unknown>): PresetEntry => ({
    id: `p:${rawId}`,
    kind: "preset",
    rawId,
    label: rawId,
    values,
    apply: () => {},
  })
  const defaults = { a: 1, b: 2 }
  it("shows only where a preset (not the defaults) moves something", () => {
    const entries = [entry("default", defaults), entry("x", { a: 5, b: 2 })]
    expect(presetsTouch(entries, ["a"], defaults)).toBe(true)
    expect(presetsTouch(entries, ["b"], defaults)).toBe(false)
    expect(presetsTouch([entry("default", defaults)], ["a", "b"], defaults)).toBe(false)
    expect(presetsTouch(entries, [], defaults)).toBe(false)
  })
})

describe("pinned groups with a variants choice", () => {
  const variantSchema = () => ({
    variant: choice("A", ["A", "B", "C"], { variants: true }),
    speed: knob(1, { min: 0, max: 4, step: 0.1, group: "Global" }),
    caption: text("Hello", { group: "Global" }),
    size: knob(10, { min: 0, max: 40, step: 1 }),
  })

  it("variant presets never touch pinned values, text included", () => {
    const c = defineControls("pinned-variants", variantSchema(), {
      enabled: true,
      storage: null,
      pinned: ["Global"],
      presets: { B: { speed: 3, caption: "Bye", size: 20 } },
    })
    expect(Object.keys(c.presets)).toEqual(["default", "B", "C"])
    expect(c.presets.B).toEqual({ variant: "B", speed: 1, caption: "Hello", size: 20 })
    c.set({ speed: 2, caption: "Mine" })
    c.preset("B")
    expect(c.get()).toEqual({ variant: "B", speed: 2, caption: "Mine", size: 20 })
    expect(c.matchingPreset()).toBe("B")
    c.preset("default")
    expect(c.get()).toEqual({ variant: "A", speed: 2, caption: "Mine", size: 10 })
  })

  it("a pinned variants choice is an ordinary choice: pinned wins, its options make no presets", () => {
    const schema = {
      variant: choice("A", ["A", "B"], { variants: true, group: "Global" }),
      size: knob(10, { min: 0, max: 40, step: 1 }),
    }
    const c = defineControls("pinned-variants-choice", schema, {
      enabled: true,
      storage: null,
      pinned: ["Global"],
      presets: { B: { size: 20 } },
    })
    expect(variantsOf(schema, (k) => c.isPinned(k))).toBeUndefined()
    expect(Object.keys(c.presets)).toEqual(["default", "B"])
    expect(c.presets.B).toEqual({ variant: "A", size: 20 })
    expect(c.presetLabel("default")).toBe("default")
    c.set({ variant: "B" })
    c.preset("B")
    expect(c.get()).toEqual({ variant: "B", size: 20 })
    // By a field's own `pinned: true` as well.
    const byField = defineControls(
      "pinned-variants-field",
      { variant: choice("A", ["A", "B"], { variants: true, pinned: true }) },
      { enabled: true, storage: null },
    )
    expect(Object.keys(byField.presets)).toEqual(["default"])
  })

  it("a variant counts as moving its choice, which has no row, on the strip's tab check", () => {
    const c = defineControls("pinned-variants-touch", variantSchema(), {
      enabled: true,
      storage: null,
      pinned: ["Global"],
    })
    const entries: PresetEntry[] = Object.entries(c.presets).map(([rawId, values]) => ({
      id: `p:${rawId}`,
      kind: "preset",
      rawId,
      label: rawId,
      values,
      apply: () => {},
    }))
    expect(presetsTouch(entries, ["size"], c.locked)).toBe(false)
    expect(presetsTouch(entries, ["size", "variant"], c.locked)).toBe(true)
  })
})
