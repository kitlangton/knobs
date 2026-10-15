import { describe, expect, expectTypeOf, it, vi } from "vitest"
import { createRoot as createSolidRoot, type Accessor } from "solid-js"
import {
  choice,
  color,
  colorHex,
  createRemoteControls,
  defineControls,
  formatCode,
  formatSwift,
  fromDescriptors,
  easing,
  knob,
  memoryStorage,
  point,
  spring,
  springCss,
  toggle,
  urlFlag,
  type Bezier,
  type ControlDescriptor,
  type Point,
  type SpringValue,
  type Values,
} from "../src/index.js"
import { maxChroma, parseColor } from "../src/core/color.js"
import { normalize } from "../src/core/schema.js"
import { randomValues } from "../src/core/random.js"
import { mutateValues } from "../src/core/mutate.js"
import { storageKey } from "../src/core/storage.js"
import { useControls } from "../src/react/useControls.js"
import { useControls as useSolidControls } from "../src/solid/index.js"
import { computeHintPrefixes } from "../src/panel/hints.js"
import { readableTitle } from "../src/panel/panel.js"
import { Edges, LEAD, popScale, Spring, springEasing, TRAIL } from "../src/panel/motion.js"
import {
  nextPresetIndex,
  resolveActivePresetEntry,
  type PresetEntry,
} from "../src/panel/presets.js"

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
  it("clamps, keeps incoming values exact, drops extra keys and rejects non-finite input", () => {
    expect(
      normalize(schema, { count: 999, size: 1.7, flavor: "bad", grain: "false", extra: 4 }),
    ).toEqual({ count: 300, size: 1.7, flavor: "inked", grain: true })
    // Whole-number fields stay whole.
    expect(normalize(schema, { count: 104.7 }).count).toBe(105)
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
  it("keeps declared defaults and incoming values off the step lattice exactly (as on the phone)", () => {
    // OpenCode iOS tunables: defaults that sit between min-relative steps must read exactly.
    const tune = {
      promotion: knob(0.4, { min: 0.15, max: 1, step: 0.02 }),
      jump: knob(0.5, { min: 0.15, max: 1, step: 0.02 }),
      reveal: knob(0.78, { min: 0.55, max: 1, step: 0.02 }),
    }
    expect(normalize(tune, {})).toEqual({ promotion: 0.4, jump: 0.5, reveal: 0.78 })
    expect(normalize(tune, { promotion: 0.4, reveal: 0.79 })).toMatchObject({
      promotion: 0.4,
      reveal: 0.79,
    })
  })
  it("never overshoots when the maximum isn't on the lattice", () => {
    const s = { n: knob(0.1, { min: 0.1, max: 1, step: 0.2 }) }
    expect(normalize(s, { n: 1.4 }).n).toBe(1)
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

describe("spring, color, point and easing fields", () => {
  const rich = {
    reveal: spring({ duration: 0.4, bounce: 0.2 }, { label: "Reveal", group: "Motion" }),
    tint: color("#4f8cff", { group: "Look" }),
    origin: point({ x: 0, y: 0 }, { min: -1, max: 1, step: 0.05 }),
    curve: easing("ease-out"),
  }
  const makeRich = (storage = memoryStorage()) =>
    defineControls("rich", rich, {
      enabled: true,
      storage,
      presets: { calm: { reveal: { duration: 0.8, bounce: 0 }, curve: [0.42, 0, 0.58, 1] } },
    })

  it("infers value types and keeps metadata", () => {
    const c = makeRich()
    expectTypeOf(c.get().reveal).toEqualTypeOf<SpringValue>()
    expectTypeOf(c.get().tint).toEqualTypeOf<string>()
    expectTypeOf(c.get().origin).toEqualTypeOf<Point>()
    expectTypeOf(c.get().curve).toEqualTypeOf<Bezier>()
    expectTypeOf<ReturnType<typeof useControls<typeof rich>>["origin"]>().toEqualTypeOf<Point>()
    createSolidRoot((dispose) => {
      const values = useSolidControls(c)
      expectTypeOf(values().reveal).toEqualTypeOf<SpringValue>()
      c.set({ origin: { x: 0.5, y: 0.5 } })
      expect(values().origin).toEqual({ x: 0.5, y: 0.5 })
      dispose()
    })
    expect(rich.reveal).toMatchObject({ label: "Reveal", group: "Motion" })
    expect(c.locked.reveal).toEqual({ duration: 0.4, bounce: 0.2 })
    expect(c.locked.curve).toEqual([0, 0, 0.58, 1])
    expect(c.locked.tint).toMatch(/^oklch\(0\.\d+ 0\.\d+ \d+(\.\d+)?\)$/)
    expect(colorHex(c.locked.tint)).toBe("#4f8cff")
    expect(rich.origin).toMatchObject({ min: { x: -1, y: -1 }, step: { x: 0.05, y: 0.05 } })
    expect(() => point({ x: 0, y: 0 }, { min: 1, max: 0 })).toThrow()
    expect(() => color("tomato")).toThrow()
    // @ts-expect-error Unknown easing names are rejected.
    expect(() => easing("wobble")).toThrow()
  })

  it("clamps and snaps every part, fits colours inside sRGB, and falls back on junk", () => {
    expect(
      normalize(rich, {
        reveal: { duration: 9, bounce: -3 },
        tint: "oklch(0.7 0.4 145)",
        origin: { x: 0.123, y: -7 },
        curve: [-1, 3, 2, -2],
      }),
    ).toMatchObject({
      reveal: { duration: 2, bounce: -0.5 },
      origin: { x: 0.1, y: -1 },
      curve: [0, 1.6, 1, -0.6],
    })
    const fitted = parseColor(normalize(rich, { tint: "oklch(0.7 0.4 145)" }).tint)!
    expect(fitted.c).toBeLessThanOrEqual(maxChroma(0.7, 145))
    expect(fitted.c).toBeGreaterThan(maxChroma(0.7, 145) - 0.002)
    expect(normalize(rich, { tint: "oklch(72% 0.1 400)" }).tint).toBe("oklch(0.72 0.1 40)")
    expect(normalize(rich, { reveal: "fast", origin: null, curve: [1, 2] })).toMatchObject({
      reveal: rich.reveal.value,
      origin: rich.origin.value,
      curve: rich.curve.value,
    })
  })

  it("randomizes inside sensible bounds", () => {
    for (let i = 0; i <= 20; i++) {
      const r = randomValues(rich, () => i / 20)
      expect(r.reveal.duration).toBeGreaterThanOrEqual(0.2)
      expect(r.reveal.duration).toBeLessThanOrEqual(0.9)
      expect(r.reveal.bounce).toBeGreaterThanOrEqual(0)
      expect(r.reveal.bounce).toBeLessThanOrEqual(0.45)
      expect(Math.abs(r.origin.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(r.origin.y)).toBeLessThanOrEqual(1)
      expect(r.curve.every(Number.isFinite)).toBe(true)
      const t = parseColor(r.tint)!
      expect(t.l).toBeGreaterThanOrEqual(0.5)
      expect(t.c).toBeLessThanOrEqual(maxChroma(t.l, t.h) + 1e-9)
    }
  })

  it("compares by value: no-op sets, modified, reset, presets, undo coalescing", () => {
    const c = makeRich()
    const listener = vi.fn()
    c.subscribe(listener)
    c.set({ reveal: { duration: 0.4, bounce: 0.2 } })
    expect(listener).not.toHaveBeenCalled()
    expect(c.isModified()).toBe(false)
    const before = c.get()
    c.set({ origin: { x: 0.2, y: 0 } })
    c.set({ origin: { x: 0.4, y: 0.1 } }, { coalesce: true })
    expect(c.get().reveal).toBe(before.reveal)
    expect(c.modified()).toEqual({ origin: { x: 0.4, y: 0.1 } })
    c.undo()
    expect(c.get().origin).toEqual({ x: 0, y: 0 })
    c.preset("calm")
    expect(c.matchingPreset()).toBe("calm")
    expect(c.isModified("curve")).toBe(true)
    c.resetKey("curve")
    expect(c.isModified("curve")).toBe(false)
    c.resetGroup("Motion")
    expect(c.matchingPreset()).toBe("default")
  })

  it("round-trips through storage, JSON variants and code", () => {
    const storage = memoryStorage()
    const c = makeRich(storage)
    c.set({ tint: "oklch(0.6 0.12 30)", curve: [0.3, 1.2, 0.6, 1], origin: { x: 0.5, y: -0.5 } })
    const saved = c.variants.save("warm")
    expect(makeRich(storage).get()).toEqual(c.get())
    const other = makeRich()
    other.variants.list()
    other.variants.import(c.variants.export())
    other.variants.load(saved.id)
    expect(other.get()).toEqual(c.get())
    expect(JSON.parse(c.code("json"))).toEqual(c.get())
    expect(c.code()).toContain('reveal: { duration: 0.4, bounce: 0.2 }, tint: "oklch(0.6 0.12 30)"')
    expect(c.code("jsx")).toContain("curve={[0.3, 1.2, 0.6, 1]}")
  })

  it("maps springs like SwiftUI and exports them as CSS linear() easings", () => {
    const { easing: css, duration } = springCss({ duration: 0.5, bounce: 0 })
    expect(css).toMatch(/^linear\(0,.*,1\)$/)
    expect(duration).toBeGreaterThan(500)
    expect(duration).toBeLessThan(800)
    expect(springCss({ duration: 0.5, bounce: 0.4 }).easing).toMatch(/1\.\d+/)
  })

  it("travels as remote descriptors and emits matching Swift", () => {
    const descriptors: ControlDescriptor[] = [
      {
        key: "sheet.spring",
        label: "Sheet",
        kind: "spring",
        default: { duration: 0.35, bounce: 0.1 },
      },
      { key: "sheet.tint", label: "Tint", kind: "color", default: "#ff6b3d" },
      {
        key: "sheet.anchor",
        label: "Anchor",
        kind: "point",
        default: { x: 0.5, y: 0.5 },
        min: 0,
        max: 1,
        step: 0.01,
      },
      { key: "sheet.curve", label: "Curve", kind: "easing", default: [0.25, 0.1, 0.25, 1] },
    ]
    const sent: [string, unknown][] = []
    const remote = createRemoteControls("phone", descriptors, {
      onSet: (key, value) => sent.push([key, value]),
    })
    expect(remote.schema["sheet.anchor"]).toMatchObject({ kind: "point", max: { x: 1, y: 1 } })
    remote.set({
      "sheet.spring": { duration: 0.5, bounce: 0.3 },
      "sheet.tint": "#3d8bff",
      "sheet.anchor": { x: 0.25, y: 0.75 },
      "sheet.curve": [0.32, 0.72, 0, 1],
    })
    expect(sent.map(([k]) => k)).toEqual(descriptors.map((d) => d.key))
    remote.set({ "sheet.anchor": { x: 0.5, y: 0.5 } })
    expect(sent.at(-1)).toEqual(["sheet.anchor", null])
    const swift = remote.swift()
    expect(swift).toContain(
      'TunableSpring("sheet.spring", "Sheet", duration: 0.5, bounce: 0.3)  // was duration: 0.35, bounce: 0.1',
    )
    expect(swift).toMatch(
      /Tunable<Color>\("sheet.tint", "Tint", default: Color\(red: 0.2\d*, green: 0.5\d*, blue: (1|0.99\d*)\)\)  \/\/ #3d8bff · was Color/,
    )
    expect(swift).toContain(
      'Tunable<UnitCurve>("sheet.curve", "Curve", default: .bezier(startControlPoint: UnitPoint(x: 0.32, y: 0.72), endControlPoint: UnitPoint(x: 0, y: 1)))',
    )
    expect(swift).not.toContain("sheet.anchor")
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
    const sent: [string, unknown][] = []
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

    // Multi-word labels use short word-initial codes ("ah", "ac", "pw") with no spaces and stay stable while typing
    const metaItems = [
      { key: "theme", display: "Theme" },
      { key: "accentHue", display: "Accent hue" },
      { key: "accentChroma", display: "Accent chroma" },
      { key: "contrast", display: "Contrast" },
      { key: "width", display: "Panel width" },
      { key: "pad", display: "Panel padding" },
      { key: "panelRadius", display: "Panel radius" },
    ]
    const metaInit = computeHintPrefixes(metaItems, "")
    expect(metaInit.badges.map((b) => b.prefix)).toEqual(["t", "ah", "ac", "c", "pw", "pp", "pr"])
    for (const b of metaInit.badges) {
      expect(b.prefix).toMatch(/^[a-z]{1,3}$/)
    }
    const metaAfterA = computeHintPrefixes(metaItems, "a")
    expect(metaAfterA.matchIndices).toEqual([1, 2])
    expect(metaAfterA.badges[1]).toEqual({ match: true, prefix: "ah", typed: "a", rest: "h" })
    expect(metaAfterA.badges[2]).toEqual({ match: true, prefix: "ac", typed: "a", rest: "c" })
    expect(computeHintPrefixes(metaItems, "ah").uniqueMatchIndex).toBe(1)
    expect(computeHintPrefixes(metaItems, "ac").uniqueMatchIndex).toBe(2)
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

describe("panel titles", () => {
  it("reads ids as words without touching titles that already have spaces", () => {
    expect(readableTitle("synth-voice")).toBe("Synth voice")
    expect(readableTitle("knobs-tokens")).toBe("Knobs tokens")
    expect(readableTitle("knobsTokens")).toBe("Knobs tokens")
    expect(readableTitle("splat")).toBe("Splat")
    expect(readableTitle("phone_tune")).toBe("Phone tune")
    expect(readableTitle("iOS-tune")).toBe("iOS tune")
    expect(readableTitle("Drawer motion")).toBe("Drawer motion")
  })
})

describe("motion", () => {
  it("holds a delayed retarget for its cascade turn, then springs; the same target doesn't restart the wait", () => {
    let now = 1000
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now)
    const s = new Spring(0, 30, 1)
    s.set(1, 50)
    expect(s.resting).toBe(false)
    now += 30
    s.step(1 / 60)
    expect(s.x).toBe(0)
    s.set(1, 50)
    now += 25
    s.step(1 / 60)
    expect(s.x).toBeGreaterThan(0)
    s.snap(0)
    expect(s.resting).toBe(true)
    clock.mockRestore()
  })

  it("leads with the edge facing the move and trails the other, longer as --k-blur grows", () => {
    const e = new Edges(0, 20)
    e.to(100, 120, 0, 1)
    expect(e.end.omega).toBe(LEAD.omega)
    expect(e.start.omega).toBe(TRAIL.omega)
    e.step(0.08)
    expect(e.end.x - e.start.x).toBeGreaterThan(30)
    e.to(0, 20, 0, 1.4)
    expect(e.start.omega).toBe(LEAD.omega)
    expect(e.end.omega).toBeCloseTo(TRAIL.omega / 1.4)
    for (let i = 0; i < 120; i++) e.step(1 / 60)
    expect(e.resting).toBe(true)
    expect([e.start.x, e.end.x]).toEqual([0, 20])
  })

  it("samples springs into CSS linear() easings and pops readouts by a hair", () => {
    const { easing, ms } = springEasing(LEAD.omega, LEAD.zeta)
    expect(easing).toMatch(/^linear\(0,.*,1\)$/)
    expect(ms).toBeGreaterThan(150)
    expect(ms).toBeLessThan(600)
    expect(popScale(55)).toBeCloseTo(1.04, 3)
    expect(popScale(0)).toBe(1)
    expect(popScale(400)).toBe(1)
  })
})

describe("locks, mutate and compare", () => {
  const mixed = {
    count: knob(98, { min: 0, max: 300, step: 1 }),
    size: knob(7, { min: 1, max: 30, step: 0.5 }),
    coarse: knob(0, { min: 0, max: 10, step: 5 }),
    flavor: choice("inked", ["inked", "clean", "rough"]),
    grain: toggle(true),
    reveal: spring({ duration: 0.4, bounce: 0.2 }),
    tint: color("#4f8cff"),
    origin: point({ x: 0, y: 0 }, { min: -1, max: 1, step: 0.05 }),
    curve: easing("ease-out"),
  }
  const makeMixed = (storage = memoryStorage(), onChange = vi.fn()) =>
    defineControls("mixed", mixed, { enabled: true, storage, onChange })
  // A deterministic stream that walks the whole [0, 1) range.
  const stream = (seed: number) => {
    let s = seed
    return () => {
      s = (s * 16807) % 2147483647
      return (s - 1) / 2147483646
    }
  }

  it("Random and Mutate skip locked fields; Reset still resets them; locks persist", () => {
    const storage = memoryStorage()
    const c = makeMixed(storage)
    c.set({ count: 120, flavor: "clean" })
    c.lock(["count", "flavor"])
    expect(c.isLocked("count")).toBe(true)
    expect(c.isLocked("size")).toBe(false)
    for (let i = 0; i < 20; i++) {
      c.randomize()
      c.mutate()
    }
    expect(c.get().count).toBe(120)
    expect(c.get().flavor).toBe("clean")
    c.randomize(["count", "flavor"])
    expect(c.get().count).toBe(120)

    // Saved with the values, and back after a reload.
    expect(JSON.parse(storage.getItem(storageKey("mixed", "state"))!).locks).toEqual([
      "count",
      "flavor",
    ])
    const reloaded = makeMixed(storage)
    expect(reloaded.isLocked("flavor")).toBe(true)
    expect(reloaded.get().count).toBe(120)

    c.lock("flavor", false)
    expect(c.isLocked("flavor")).toBe(false)
    expect(() => c.lock("nope" as "count")).toThrow()
    c.reset()
    expect(c.get().count).toBe(98)
    expect(c.isLocked("count")).toBe(true)
    c.lock("count", false)
    expect(JSON.parse(storage.getItem(storageKey("mixed", "state"))!).locks).toBeUndefined()
  })

  it("locking notifies subscribers without touching history or onChange", () => {
    const onChange = vi.fn()
    const c = makeMixed(memoryStorage(), onChange)
    const listener = vi.fn()
    c.subscribe(listener)
    c.lock("size")
    c.lock("size")
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
    expect(c.canUndo).toBe(false)
  })

  it("resets a set of keys as one undo step", () => {
    const c = makeMixed()
    c.set({ count: 1, size: 2, grain: false })
    c.reset(["count", "size"])
    expect(c.get()).toMatchObject({ count: 98, size: 7, grain: false })
    c.undo()
    expect(c.get()).toMatchObject({ count: 1, size: 2 })
  })

  it("mutates within bounds: numbers 8–12% of range, stepped and clamped; rare flips", () => {
    const random = stream(7)
    let flips = 0
    const runs = 400
    for (let i = 0; i < runs; i++) {
      const current = randomValues(mixed, random)
      const next = mutateValues(mixed, current, undefined, random) as Values<typeof mixed>
      const near = (a: number, b: number, span: number, step: number) => {
        const d = Math.abs(a - b)
        expect(d).toBeLessThanOrEqual(Math.max(span * 0.12 + step / 2, step) + 1e-9)
        expect(d).toBeGreaterThan(0)
      }
      near(next.count, current.count, 300, 1)
      near(next.size, current.size, 29, 0.5)
      expect([0, 5, 10]).toContain(next.coarse)
      expect(next.count % 1).toBe(0)
      expect((next.size * 2) % 1).toBe(0)
      expect(next.count).toBeGreaterThanOrEqual(0)
      expect(next.count).toBeLessThanOrEqual(300)
      for (const axis of ["x", "y"] as const) {
        expect(Math.abs(next.origin[axis] - current.origin[axis])).toBeLessThanOrEqual(0.25 + 1e-9)
        expect(Math.abs(next.origin[axis])).toBeLessThanOrEqual(1)
      }
      expect(Math.abs(next.reveal.duration - current.reveal.duration)).toBeLessThanOrEqual(0.09)
      expect(Math.abs(next.reveal.bounce - current.reveal.bounce)).toBeLessThanOrEqual(0.06)
      next.curve.forEach((v, j) => {
        expect(Math.abs(v - current.curve[j]!)).toBeLessThanOrEqual(0.065)
      })
      const a = parseColor(current.tint)!
      const b = parseColor(next.tint)!
      const dh = Math.abs(((b.h - a.h + 540) % 360) - 180)
      expect(dh).toBeLessThanOrEqual(12.5)
      expect(Math.abs(b.l - a.l)).toBeLessThanOrEqual(0.046)
      if (next.flavor !== current.flavor) flips++
      if (next.grain !== current.grain) flips++
    }
    // About 15% each for the choice and the switch.
    expect(flips / (runs * 2)).toBeGreaterThan(0.08)
    expect(flips / (runs * 2)).toBeLessThan(0.22)

    // Only switches asked for and none flipped: one flips anyway.
    const quiet = mutateValues(mixed, randomValues(mixed, random), ["grain"], () => 0.9)
    expect(quiet.grain).toBeDefined()
  })

  it("mutates in one undo step with source mutate", () => {
    const onChange = vi.fn()
    const c = makeMixed(memoryStorage(), onChange)
    const before = c.get()
    c.mutate()
    expect(c.get()).not.toEqual(before)
    expect(onChange.mock.lastCall![2]).toEqual({ source: "mutate" })
    c.undo()
    expect(c.get()).toEqual(before)
    expect(c.canUndo).toBe(false)
  })

  it("compare shows the previous undo entry while held and restores exactly, without history or storage", () => {
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, "setItem")
    const onChange = vi.fn()
    const c = makeMixed(storage, onChange)
    c.set({ count: 10 })
    c.set({ count: 20, size: 3 })
    const current = c.get()
    const writes = setItem.mock.calls.length
    onChange.mockClear()
    const listener = vi.fn()
    c.subscribe(listener)

    c.compare(true)
    expect(c.comparing).toBe(true)
    expect(c.get()).toMatchObject({ count: 10, size: 7 })
    expect(onChange).toHaveBeenLastCalledWith(
      { count: 10, size: 7 },
      expect.objectContaining({ count: 10 }),
      { source: "compare" },
    )
    c.compare(true)
    c.compare(false)
    expect(c.comparing).toBe(false)
    expect(c.get()).toBe(current)
    expect(onChange).toHaveBeenLastCalledWith({ count: 20, size: 3 }, current, {
      source: "compare",
    })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(setItem.mock.calls.length).toBe(writes)
    c.undo()
    expect(c.get().count).toBe(10)

    // A change while held starts from the current values.
    c.redo()
    c.compare(true)
    c.set({ grain: false })
    expect(c.comparing).toBe(false)
    expect(c.get()).toMatchObject({ count: 20, size: 3, grain: false })
    c.undo()
    expect(c.get()).toBe(current)

    // Nothing to compare against: nothing happens.
    const fresh = makeMixed()
    fresh.compare(true)
    expect(fresh.comparing).toBe(false)
  })

  it("remote controls lock, skip locks on Random and preview compare through onSet", () => {
    const onSet = vi.fn()
    const remote = createRemoteControls(
      "phone",
      [
        { key: "a", kind: "number", default: 1, min: 0, max: 10, step: 1 },
        { key: "b", kind: "number", default: 2, min: 0, max: 10, step: 1 },
      ],
      { onSet },
    )
    remote.lock("a")
    expect(remote.isLocked("a")).toBe(true)
    for (let i = 0; i < 10; i++) remote.randomize()
    expect(remote.get().a).toBe(1)
    remote.reset()
    remote.set({ b: 9 })
    onSet.mockClear()
    remote.compare(true)
    expect(remote.comparing).toBe(true)
    expect(onSet).toHaveBeenCalledWith("b", null, { source: "compare" })
    remote.compare(false)
    expect(onSet).toHaveBeenLastCalledWith("b", 9, { source: "compare" })
  })
})

describe("sections and group presets", () => {
  const tuned = () => ({
    rise: knob(6, { min: 0, max: 24, step: 1, group: "Arrivals", section: "Transcript" }),
    fade: knob(0.25, { min: 0.05, max: 0.8, step: 0.01, group: "Arrivals", section: "Transcript" }),
    stagger: toggle(false, { group: "Arrivals", section: "Transcript" }),
    font: choice("body", ["body", "callout"], { group: "Rows", section: "Session list" }),
  })

  it("keeps section metadata on fields and descriptors", () => {
    const fields = tuned()
    expect(fields.rise.section).toBe("Transcript")
    expect(fields.font.section).toBe("Session list")
    expect(spring({}, { section: "Motion" }).section).toBe("Motion")
    expect(knob(1, { min: 0, max: 2 }).section).toBeUndefined()
    const schema = fromDescriptors([
      { key: "a.b", kind: "number", default: 1, min: 0, max: 2, group: "B", section: "A" },
      { key: "a.c", kind: "bool", default: true, group: "B" },
    ])
    expect(schema["a.b"]!.section).toBe("A")
    expect(schema["a.c"]!.section).toBeUndefined()
  })

  it("applies numbered group presets over every key they cover, matches and undoes them", () => {
    const presets: { group: string; index: number; name: string }[] = []
    const sources: string[] = []
    const c = defineControls("group-presets", tuned(), {
      enabled: true,
      storage: null,
      groupPresets: {
        Arrivals: [
          { name: "Today", values: {} },
          { name: "Brisk", values: { rise: 4, fade: 0.15 } },
          { name: "Soft", values: { fade: 0.5, stagger: true } },
        ],
      },
      onPreset: (target) => presets.push(target),
      onChange: (_patch, _values, meta) => sources.push(`${meta.source}:${meta.group ?? ""}`),
    })
    // Every preset spans the union of named keys; "Today" is the defaults.
    expect(c.groupPresets.Arrivals!.map((p) => p.values)).toEqual([
      { rise: 6, fade: 0.25, stagger: false },
      { rise: 4, fade: 0.15, stagger: false },
      { rise: 6, fade: 0.5, stagger: true },
    ])
    expect(c.matchingGroupPreset("Arrivals")).toBe(0)
    c.groupPreset("Arrivals", 2)
    expect(c.get()).toMatchObject({ rise: 6, fade: 0.5, stagger: true })
    expect(c.matchingGroupPreset("Arrivals")).toBe(2)
    c.groupPreset("Arrivals", 1)
    expect(c.get()).toMatchObject({ rise: 4, fade: 0.15, stagger: false })
    expect(presets).toEqual([
      { group: "Arrivals", index: 2, name: "Soft" },
      { group: "Arrivals", index: 1, name: "Brisk" },
    ])
    expect(sources).toEqual(["preset:Arrivals", "preset:Arrivals"])
    c.set({ rise: 5 })
    expect(c.matchingGroupPreset("Arrivals")).toBe(-1)
    expect(c.matchingGroupPreset("Rows")).toBe(-1)
    c.undo()
    expect(c.matchingGroupPreset("Arrivals")).toBe(1)
    c.undo()
    expect(c.matchingGroupPreset("Arrivals")).toBe(2)
    expect(() => c.groupPreset("Arrivals", 7)).toThrow()
  })

  it("lets a remote peer apply its own group presets, and holds local edits against stale echoes", () => {
    vi.useFakeTimers()
    try {
      const sent: unknown[] = []
      const remote = createRemoteControls(
        "iphone",
        [
          {
            key: "t.rise",
            kind: "number",
            default: 6,
            min: 0,
            max: 24,
            step: 1,
            group: "Arrivals",
          },
          {
            key: "t.fade",
            kind: "number",
            default: 0.25,
            min: 0,
            max: 1,
            step: 0.01,
            group: "Arrivals",
          },
        ],
        {
          groupPresets: {
            Arrivals: [
              { name: "Today", values: {} },
              { name: "Brisk", values: { "t.rise": 4 } },
            ],
          },
          onSet: (key, value) => sent.push({ type: "set", key, value }),
          onPreset: ({ group, index }) => sent.push({ type: "preset", group, index }),
        },
      )
      remote.groupPreset("Arrivals", 1)
      expect(remote.get()["t.rise"]).toBe(4)
      // The phone applies its own preset: no per-key sets go out.
      expect(sent).toEqual([{ type: "preset", group: "Arrivals", index: 1 }])

      // A drag sends 10; the phone's state still says 8 when it crosses in flight.
      remote.set({ "t.rise": 10 })
      expect(sent.at(-1)).toEqual({ type: "set", key: "t.rise", value: 10 })
      remote.sync({ "t.rise": 8, "t.fade": 0.5 }, { replace: true })
      expect(remote.get()).toEqual({ "t.rise": 10, "t.fade": 0.5 })
      // Once the window passes, the peer's latest state stands (it may have clamped the value).
      vi.advanceTimersByTime(700)
      expect(remote.get()).toEqual({ "t.rise": 8, "t.fade": 0.5 })
      expect(sent).toHaveLength(2)

      // Without onPreset, a preset reaches the peer as ordinary sets.
      const plain: unknown[] = []
      const other = createRemoteControls(
        "plain",
        [{ key: "x", kind: "number", default: 1, min: 0, max: 2, step: 1, group: "G" }],
        {
          groupPresets: { G: [{ name: "Two", values: { x: 2 } }] },
          onSet: (key, value) => plain.push([key, value]),
        },
      )
      other.groupPreset("G", 0)
      expect(plain).toEqual([["x", 2]])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("page layout", () => {
  it("splits cards into balanced runs that keep their order down each column", async () => {
    const { balancedRuns } = await import("../src/panel/page.js")
    expect(balancedRuns([100, 100, 100, 100], 2)).toEqual([2, 2])
    expect(balancedRuns([300, 100, 100, 100], 2, 10)).toEqual([1, 3])
    expect(balancedRuns([50, 60], 4)).toEqual([1, 1])
    expect(balancedRuns([], 3)).toEqual([])
    expect(balancedRuns([80, 400, 90, 120, 60], 3)).toEqual([1, 1, 3])
  })

  it("gives sections their own columns, keeps reading order and makes the tallest column shortest", async () => {
    const { pageColumns } = await import("../src/panel/page.js")
    const cards = (section: number, ...heights: number[]) =>
      heights.map((height) => ({ height, section }))
    // The tune page: Playground, Session List, Transcript, Composer.
    const items = [
      ...cards(0, 300, 100),
      ...cards(1, 300, 200, 250),
      ...cards(2, 250, 280, 250, 250),
      ...cards(3, 210, 240, 210),
    ]
    const options = { gap: 16, space: 12, label: () => 30 }
    const starts = (n: number) => pageColumns(items, n, options).map((c) => c.start)
    // One section per column when they fit; the longest takes two; short ones stack.
    expect(starts(4)).toEqual([0, 2, 5, 9])
    expect(starts(5)).toEqual([0, 2, 5, 7, 9])
    expect(starts(3)).toEqual([0, 5, 9])
    expect(starts(1)).toEqual([0])
    // Labels top each column (blank where a section continues) and each stacked section.
    const three = pageColumns(items, 3, options)
    expect(three[0]!.entries).toEqual([
      { kind: "label", section: 0, continued: false },
      { kind: "card", index: 0 },
      { kind: "card", index: 1 },
      { kind: "label", section: 1, continued: false },
      { kind: "card", index: 2 },
      { kind: "card", index: 3 },
      { kind: "card", index: 4 },
    ])
    expect(three[0]!.height).toBe(30 + 16 + 400 + 16 + (30 + 12 + 16) + 750 + 3 * 16)
    expect(pageColumns(items, 5, options)[3]!.entries[0]).toEqual({
      kind: "label",
      section: 2,
      continued: true,
    })
    expect(pageColumns([], 3, options)).toEqual([])

    // Against every valid split of small random pages: order kept, tallest as short as can be.
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let round = 0; round < 200; round++) {
      const m = 1 + Math.floor(random() * 7)
      const page: { height: number; section: number }[] = []
      let section = 0
      for (let i = 0; i < m; i++) {
        if (i > 0 && random() < 0.4) section++
        page.push({ height: 40 + Math.floor(random() * 300), section })
      }
      const n = 1 + Math.floor(random() * 4)
      const got = pageColumns(page, n, options)
      expect(
        got.flatMap((c) => c.entries.filter((e) => e.kind === "card").map((e) => e.index)),
      ).toEqual(page.map((_, i) => i))
      expect(got.length).toBe(Math.min(n, m))
      let best = Infinity
      const k = Math.min(n, m)
      const sec = page.map((p) => p.section)
      const valid = (i: number, j: number) =>
        sec[i] === sec[j - 1] ||
        ((i === 0 || sec[i - 1] !== sec[i]) && (j === m || sec[j] !== sec[j - 1]))
      const height = (i: number, j: number) => pageColumns(page.slice(i, j), 1, options)[0]!.height
      const walk = (i: number, left: number, tallest: number) => {
        if (left === 0) {
          if (i === m) best = Math.min(best, tallest)
          return
        }
        for (let j = i + 1; j <= m - left + 1; j++)
          if (valid(i, j)) walk(j, left - 1, Math.max(tallest, height(i, j)))
      }
      walk(0, k, 0)
      expect(Math.max(...got.map((c) => c.height))).toBeCloseTo(best, 5)
    }
  })

  it("drops a card title's repeated section prefix, only after a separator", async () => {
    const { cardTitle } = await import("../src/panel/page.js")
    expect(cardTitle("Transcript · Arrivals", ["Transcript"])).toBe("Arrivals")
    expect(cardTitle("transcript: Follow", ["Transcript"])).toBe("Follow")
    expect(cardTitle("Session — Header Style", ["session", "Session List"])).toBe("Header Style")
    expect(cardTitle("Composer / Actions", ["composer", "Composer"])).toBe("Actions")
    // No separator, nothing left, or another section: kept as it is.
    expect(cardTitle("Transcript Arrivals", ["Transcript"])).toBe("Transcript Arrivals")
    expect(cardTitle("Transcript", ["Transcript"])).toBe("Transcript")
    expect(cardTitle("Transcript · ", ["Transcript"])).toBe("Transcript · ")
    expect(cardTitle("Composer · Layout", ["Transcript"])).toBe("Composer · Layout")
    expect(cardTitle("Spacing", [""])).toBe("Spacing")
  })
})

describe("labels apart from ids", () => {
  it("resolves group, section and preset labels: options first, then the first field's", () => {
    const controls = defineControls(
      "labels",
      {
        a: knob(1, {
          min: 0,
          max: 2,
          group: "drawer.spacing",
          groupLabel: "Spacing",
          section: "drawer",
          sectionLabel: "Session List",
        }),
        b: knob(1, {
          min: 0,
          max: 2,
          group: "drawer.spacing",
          groupLabel: "Ignored",
          section: "drawer",
        }),
        c: knob(1, { min: 0, max: 2, group: "composer.spacing", section: "composer" }),
      },
      {
        enabled: true,
        storage: memoryStorage(),
        groupLabels: { "composer.spacing": "Spacing" },
        sectionLabels: { composer: "Composer" },
        defaultLabel: "Native",
        presets: { airy: { a: 2 } },
        presetLabels: { airy: "Airy" },
      },
    )
    expect(controls.groupLabel("drawer.spacing")).toBe("Spacing")
    expect(controls.groupLabel("composer.spacing")).toBe("Spacing")
    expect(controls.groupLabel("nowhere")).toBeUndefined()
    expect(controls.sectionLabel("drawer")).toBe("Session List")
    expect(controls.sectionLabel("composer")).toBe("Composer")
    expect(controls.presetLabel("default")).toBe("Native")
    expect(controls.presetLabel("airy")).toBe("Airy")
    expect(controls.presetLabel("other")).toBe("other")
    // Ids stay the identity: the preset is still "default", the group still its id.
    expect(Object.keys(controls.presets)).toEqual(["default", "airy"])
    expect(controls.groupPresetDisplay).toBe("auto")
    controls.set({ a: 2, c: 2 })
    controls.resetGroup("drawer.spacing")
    expect(controls.get()).toMatchObject({ a: 1, b: 1, c: 2 })
  })

  it("carries descriptor labels through remote controls; Swift and resets keep the ids", () => {
    const resets: unknown[] = []
    const remote = createRemoteControls(
      "remote-labels",
      [
        {
          key: "drawer.row.height",
          kind: "number",
          default: 44,
          min: 28,
          max: 72,
          step: 1,
          swiftType: "CGFloat",
          group: "drawer.spacing",
          groupLabel: "Spacing",
          section: "drawer",
          sectionLabel: "Session List",
        },
        {
          key: "composer.spacing.margin",
          kind: "number",
          default: 20,
          min: 8,
          max: 48,
          step: 1,
          swiftType: "CGFloat",
          group: "composer.spacing",
          section: "composer",
        },
        {
          key: "drawer.open",
          kind: "spring",
          bind: { duration: "drawer.open.duration", bounce: "drawer.open.bounce" },
          default: { duration: 0.4, bounce: 0.1 },
          group: "drawer.motion",
          groupLabel: "Motion",
        },
      ],
      {
        groupLabels: { "composer.spacing": "Spacing" },
        defaultLabel: "Native",
        groupPresetDisplay: "menu",
        onReset: (t) => resets.push(t),
      },
    )
    expect(remote.groupLabel("drawer.spacing")).toBe("Spacing")
    expect(remote.groupLabel("composer.spacing")).toBe("Spacing")
    expect(remote.groupLabel("drawer.motion")).toBe("Motion")
    expect(remote.sectionLabel("drawer")).toBe("Session List")
    expect(remote.presetLabel("default")).toBe("Native")
    expect(remote.groupPresetDisplay).toBe("menu")
    remote.set({ "drawer.row.height": 50, "composer.spacing.margin": 30 })
    expect(remote.swift("drawer.spacing")).toContain("drawer.row.height")
    expect(remote.swift("drawer.spacing")).not.toContain("composer.spacing.margin")
    remote.resetGroup("composer.spacing")
    expect(resets).toEqual([{ group: "composer.spacing" }])
    expect(remote.get()["drawer.row.height"]).toBe(50)
  })

  it("folds a pan across a card's presets into one undo step", () => {
    const controls = defineControls(
      "pan-presets",
      { a: knob(1, { min: 0, max: 9, step: 1, group: "g" }) },
      {
        enabled: true,
        storage: memoryStorage(),
        groupPresets: {
          g: [
            { name: "One", values: {} },
            { name: "Two", values: { a: 2 } },
            { name: "Three", values: { a: 3 } },
          ],
        },
      },
    )
    controls.groupPreset("g", 1)
    controls.groupPreset("g", 2, { coalesce: true })
    expect(controls.get().a).toBe(3)
    controls.undo()
    expect(controls.get().a).toBe(1)
  })
})
