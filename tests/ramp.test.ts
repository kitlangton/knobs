import { describe, expect, expectTypeOf, it } from "vitest"
import {
  color,
  createRemoteControls,
  curve,
  CURVE_SHAPES,
  defineControls,
  formatCode,
  formatSwift,
  fromDescriptors,
  gradient,
  gradientCss,
  memoryStorage,
  sampleCurve,
  sampleGradient,
  type ControlDescriptor,
  type CurvePoint,
  type GradientStop,
} from "../src/index.js"
import { mutateValues } from "../src/core/mutate.js"
import { randomValues } from "../src/core/random.js"
import { curveSamples, gradientSamples } from "../src/core/ramp.js"
import { normalize, same } from "../src/core/schema.js"

const fire = [
  { at: 0, color: "#fff4d6" },
  { at: 0.3, color: "#ff8a1f" },
  { at: 1, color: "#20242c" },
]

describe("gradient", () => {
  it("keeps stops sorted, clamped and as oklch strings, and infers its value type", () => {
    const g = gradient([
      { at: 1.4, color: "#000" },
      { at: -1, color: "oklch(0.9 0.05 80)" },
      { at: 0.5, color: { l: 0.6, c: 0.2, h: 40 } },
    ])
    expect(g.value.map((s) => s.at)).toEqual([0, 0.5, 1])
    expect(g.value.every((s) => s.color.startsWith("oklch("))).toBe(true)
    expect(g.space).toBe("oklab")
    const c = defineControls(
      "ramp-types",
      { g, k: curve("linear") },
      { enabled: true, storage: null },
    )
    expectTypeOf(c.get().g).toEqualTypeOf<readonly GradientStop[]>()
    expectTypeOf(c.get().k).toEqualTypeOf<readonly CurvePoint[]>()
    expect(() => gradient([{ at: 0, color: "#fff" }])).toThrow()
  })

  it("falls back on junk and keeps one stop's order among equals", () => {
    const g = gradient(fire)
    const v = normalize({ g }, { g: [{ at: 0.5, color: "nope" }] }).g
    expect(v).toBe(g.value)
    const tie = normalize(
      { g },
      {
        g: [
          { at: 0.5, color: "#ff0000" },
          { at: 0.5, color: "#0000ff" },
          { at: 0, color: "#000" },
        ],
      },
    ).g
    expect(tie.map((s) => s.color)).toEqual(
      ["#000", "#ff0000", "#0000ff"].map((c) => color(c).value),
    )
  })

  it("samples in oklab or srgb, holds its end colours, and answers in four forms", () => {
    const bw = [
      { at: 0.2, color: "#000000" },
      { at: 0.8, color: "#ffffff" },
    ]
    expect(sampleGradient(bw, 0, { as: "hex" })).toBe("#000000")
    expect(sampleGradient(bw, 1, { as: "hex" })).toBe("#ffffff")
    // Halfway in sRGB is 50% grey; oklab's midpoint is perceptual lightness 0.5.
    const srgb = sampleGradient(bw, 0.5, { space: "srgb", as: "rgb" })
    const oklab = sampleGradient(bw, 0.5, { as: "rgb" })
    expect(srgb[0]).toBeCloseTo(0.5, 3)
    expect(oklab[0]).toBeCloseTo(0.389, 2)
    expect(sampleGradient(bw, 0.5, { space: "srgb", as: "linear" })[0]).toBeCloseTo(0.214, 2)
    expect(sampleGradient(bw, 0.5)).toMatch(/^oklch\(/)
    expect(gradientCss(bw)).toMatch(/^linear-gradient\(to right,rgb\(0 0 0\) 0%/)
    // A hard edge: two stops at one place.
    const hard = [
      { at: 0, color: "#ff0000" },
      { at: 0.5, color: "#ff0000" },
      { at: 0.5, color: "#2050f0" },
      { at: 1, color: "#2050f0" },
    ]
    expect(sampleGradient(hard, 0.49, { as: "hex" })).toBe("#ff0000")
    expect(sampleGradient(hard, 0.51, { as: "hex" })).toBe("#2050f0")
    expect(gradientSamples(hard, "oklab", 64)).toHaveLength(192)
  })

  it("randomizes as one ramp with as many stops, and mutates without reordering", () => {
    const schema = { g: gradient(fire) }
    let s = 7
    const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 20; i++) {
      const v = randomValues(schema, random).g
      expect(v).toHaveLength(3)
      expect(v.map((x) => x.at)).toEqual([...v.map((x) => x.at)].sort((a, b) => a - b))
    }
    const before = schema.g.value
    const after = mutateValues(schema, { g: before }, ["g"], random).g as readonly GradientStop[]
    expect(after).toHaveLength(3)
    expect(same(after, before)).toBe(false)
    for (let i = 1; i < after.length; i++)
      expect(after[i]!.at).toBeGreaterThanOrEqual(after[i - 1]!.at)
    for (const [i, stop] of after.entries())
      expect(Math.abs(stop.at - before[i]!.at)).toBeLessThan(0.06)
  })
})

describe("curve", () => {
  it("pins its ends, sorts and clamps into its range", () => {
    const c = curve(
      [
        { x: 0.6, y: 3 },
        { x: 0.2, y: -2 },
        { x: 0.9, y: 0.5 },
      ],
      { range: [0, 2] },
    )
    expect(c.value).toEqual([
      { x: 0, y: 0 },
      { x: 0.6, y: 2 },
      { x: 1, y: 0.5 },
    ])
    expect(c.interp).toBe("smooth")
    expect(curve("bell", { range: [0, 10] }).value[2]).toEqual({ x: 0.5, y: 10 })
    expect(() => curve([{ x: 0, y: 0 }])).toThrow()
    expect(() => curve("linear", { range: [1, 1] })).toThrow()
  })

  it("samples smooth without overshooting, linear and step exactly", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.3, y: 1 },
      { x: 0.6, y: 1 },
      { x: 1, y: 0 },
    ]
    for (let i = 0; i <= 200; i++) {
      const y = sampleCurve(pts, i / 200)
      expect(y).toBeGreaterThanOrEqual(-1e-9)
      expect(y).toBeLessThanOrEqual(1 + 1e-9)
    }
    // Flat between two equal points: monotone, no bulge.
    expect(sampleCurve(pts, 0.45)).toBeCloseTo(1, 9)
    expect(sampleCurve(pts, 0.15, { interp: "linear" })).toBeCloseTo(0.5, 9)
    expect(sampleCurve(pts, 0.29, { interp: "step" })).toBe(0)
    expect(sampleCurve(pts, 0.3, { interp: "step" })).toBe(1)
    expect(sampleCurve(pts, -5)).toBe(0)
    expect(sampleCurve(pts, 5)).toBe(0)
    // The inverse-square falloff stays a falloff all the way.
    const fall = CURVE_SHAPES["inverse²"]
    let last = Infinity
    for (let i = 0; i <= 100; i++) {
      const y = sampleCurve(fall, i / 100)
      expect(y).toBeLessThanOrEqual(last + 1e-12)
      last = y
    }
  })

  it("draws from a fixed number of samples that land on its points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0.33, y: 1 },
      { x: 1, y: 0.25 },
    ]
    const s = curveSamples(pts, "linear", 129)
    expect(s).toHaveLength(258)
    const xs = s.filter((_, i) => i % 2 === 0)
    expect(xs).toContain(0.33)
    const step = curveSamples(pts, "step", 129)
    const at = step.findIndex((v, i) => i % 2 === 0 && v === 0.33)
    // A step rises straight up: two samples at the point, before and after.
    expect(step[at + 1]).toBe(0)
    expect(step[at + 3]).toBe(1)
    expect(step[at + 2]).toBe(0.33)
  })

  it("randomizes to a shape in range and mutates with its ends pinned", () => {
    const schema = { k: curve("smoothstep", { range: [0, 4] }) }
    let s = 3
    const random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < 20; i++) {
      const v = randomValues(schema, random).k
      expect(v[0]!.x).toBe(0)
      expect(v[v.length - 1]!.x).toBe(1)
      for (const p of v) expect(p.y).toBeGreaterThanOrEqual(0)
      for (const p of v) expect(p.y).toBeLessThanOrEqual(4)
    }
    const after = mutateValues(schema, { k: schema.k.value }, ["k"], random)
      .k as readonly CurvePoint[]
    expect(after).toHaveLength(5)
    expect(after[0]!.x).toBe(0)
    expect(after[4]!.x).toBe(1)
    for (let i = 1; i < 5; i++) expect(after[i]!.x).toBeGreaterThan(after[i - 1]!.x)
  })
})

describe("gradients and curves in the store", () => {
  it("compare by value, undo a drag as one step, persist, and copy as code", () => {
    const storage = memoryStorage()
    const schema = {
      smoke: gradient(fire, { label: "Smoke" }),
      falloff: curve("inverse²", { label: "Falloff" }),
    }
    const c = defineControls("ramp-store", schema, { enabled: true, storage })
    const moved = c.get().smoke.map((s, i) => (i === 1 ? { ...s, at: 0.4 } : s))
    c.set({ smoke: moved })
    c.set(
      { smoke: c.get().smoke.map((s, i) => (i === 1 ? { ...s, at: 0.45 } : s)) },
      { coalesce: true },
    )
    expect(c.isModified("smoke")).toBe(true)
    // An equal copy is no change.
    const before = c.get()
    c.set({ smoke: c.get().smoke.map((s) => ({ ...s })) })
    expect(c.get()).toBe(before)
    c.undo()
    expect(c.isModified("smoke")).toBe(false)
    c.redo()
    expect(c.get().smoke[1]!.at).toBe(0.45)
    const again = defineControls("ramp-store", schema, { enabled: true, storage })
    expect(same(again.get().smoke, c.get().smoke)).toBe(true)
    const code = formatCode({ falloff: c.get().falloff })
    expect(code).toBe(
      "{ falloff: [{ x: 0, y: 1 }, { x: 0.1, y: 0.85 }, { x: 0.25, y: 0.47 }, { x: 0.5, y: 0.15 }, { x: 1, y: 0 }] }",
    )
    expect(JSON.parse(formatCode({ smoke: c.get().smoke }, "json")).smoke[1].at).toBe(0.45)
  })

  it("travels as remote descriptors and emits Swift", () => {
    const descriptors: ControlDescriptor[] = [
      {
        key: "sky",
        kind: "gradient",
        label: "Sky",
        default: [
          { at: 0, color: "#0b1026" },
          { at: 1, color: "#87b5ff" },
        ],
        space: "srgb",
        presets: { Dusk: fire },
      },
      {
        key: "unseen",
        kind: "curve",
        label: "Unseen",
        default: [
          { x: 0, y: 0 },
          { x: 1, y: 2 },
        ],
        range: [0, 2],
        interp: "linear",
      },
      { key: "bad", kind: "gradient", default: "nope" as never },
    ]
    const schema = fromDescriptors(descriptors)
    expect(schema.sky).toMatchObject({ kind: "gradient", space: "srgb" })
    expect(Object.keys((schema.sky as { presets: object }).presets)).toEqual(["Dusk"])
    expect(schema.unseen).toMatchObject({ kind: "curve", range: [0, 2], interp: "linear" })
    expect((schema.bad as unknown as { value: unknown[] }).value).toHaveLength(2)
    const sent: unknown[] = []
    const remote = createRemoteControls("ramp-remote", descriptors, {
      enabled: true,
      onSet: (key, value) => sent.push([key, value]),
    })
    remote.set({
      unseen: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    })
    expect(sent).toEqual([
      [
        "unseen",
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
    ])
    remote.set({ unseen: descriptors[1]!.default as CurvePoint[] })
    expect(sent.at(-1)).toEqual(["unseen", null])
    remote.set({ sky: fire as GradientStop[] })
    const swift = formatSwift(descriptors, remote.get())
    expect(swift).toContain(
      'Tunable<Gradient>("sky", "Sky", default: Gradient(stops: [.init(color: Color(red: 1',
    )
  })
})
