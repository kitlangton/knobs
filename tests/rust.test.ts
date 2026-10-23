import { describe, expect, it } from "vitest"
import {
  createRemoteControls,
  formatRust,
  formatSwift,
  type ControlDescriptor,
} from "../src/index.js"

describe("Rust copy-as-code", () => {
  it("emits Rune springs, including paired flat descriptors, once with their defaults", () => {
    const descriptors: ControlDescriptor[] = [
      { key: "open", kind: "spring", default: { duration: 0.4, bounce: 0.2 } },
      { key: "close.duration", kind: "number", default: 0.5 },
      { key: "close.bounce", kind: "number", default: 0 },
    ]
    expect(
      formatRust(descriptors, {
        open: { duration: 1, bounce: 0.3 },
        "close.duration": 0.8,
        "close.bounce": 0.1,
      }),
    ).toBe(
      [
        'rune::tune!("open", rune::Spring::new(1.0_f32, 0.3_f32))  // was rune::Spring::new(0.4_f32, 0.2_f32)',
        'rune::tune!("close", rune::Spring::new(0.8_f32, 0.1_f32))  // was duration: 0.5_f32, bounce: 0.0_f32',
      ].join("\n"),
    )
    expect(formatRust(descriptors, { "close.bounce": 0.2 })).toContain(
      'rune::tune!("close", rune::Spring::new(0.5_f32, 0.2_f32))',
    )
  })

  it("keeps floats floating even when whole, and emits integer descriptors as integers", () => {
    const descriptors: ControlDescriptor[] = [
      { key: "size", kind: "number", default: 0.5 },
      { key: "count", kind: "number", default: 2, swiftType: "Int" },
      { key: "steps", kind: "number", default: 3, min: 0, max: 10, step: 1 },
      { key: "fractional", kind: "number", default: 1.5, min: 0.5, max: 10, step: 1 },
      { key: "seed", kind: "seed", default: 1 },
    ]
    expect(
      formatRust(descriptors, { size: 1, count: 4, steps: 5, fractional: 2.5, seed: 42 }),
    ).toBe(
      [
        'rune::tune!("size", 1.0_f32)  // was 0.5_f32',
        'rune::tune!("count", 4)  // was 2',
        'rune::tune!("steps", 5.0_f32)  // was 3.0_f32',
        'rune::tune!("fractional", 2.5_f32)  // was 1.5_f32',
        'rune::tune!("seed", 42)  // was 1',
      ].join("\n"),
    )
  })

  it.each([NaN, Infinity, -Infinity, 2147483648, -2147483649, 1e21])(
    "comments integer values outside i32: %s",
    (value) => {
      for (const descriptor of [
        { key: "count", kind: "number", default: 0, swiftType: "Int" },
        { key: "count", kind: "seed", default: 0 },
      ] satisfies ControlDescriptor[]) {
        expect(formatRust([descriptor], { count: value })).toBe(
          `// unsupported: "count" (${descriptor.kind})`,
        )
        expect(formatRust([{ ...descriptor, default: value }], { count: 1 })).toBe(
          `// unsupported: "count" (${descriptor.kind})`,
        )
      }
    },
  )

  it.each([-2147483648, 2147483647])("keeps i32 boundary literals: %s", (value) => {
    expect(
      formatRust([{ key: "count", kind: "number", default: 0, swiftType: "Int" }], {
        count: value,
      }),
    ).toBe(`rune::tune!("count", ${value})  // was 0`)
  })

  it.each([
    [Number.MAX_VALUE, "f32::MAX"],
    [-Number.MAX_VALUE, "f32::MIN"],
    [3.4028234663852886e38, "f32::MAX"],
    [-3.4028234663852886e38, "f32::MIN"],
    [Infinity, "f32::MAX"],
    [-Infinity, "f32::MIN"],
    [NaN, "f32::NAN"],
  ])("bounds floats before decimal conversion: %s", (value, literal) => {
    expect(formatRust([{ key: "size", kind: "number", default: 0 }], { size: value })).toBe(
      `rune::tune!("size", ${literal})  // was 0.0_f32`,
    )
  })

  it.each([
    ["#3d8bff", "#3d8bff"],
    ["#3D8BFF80", "#3d8bff80"],
    ["#3d8bffff", "#3d8bff"],
    ["#f008", "#ff000088"],
    ["oklch(1 0 0)", "#ffffff"],
    ["oklch(1 0 0 / 0.5)", "#ffffff80"],
    ["oklch(1 0 0 / 50%)", "#ffffff80"],
    ["oklch(1 0 0 / 0)", "#ffffff00"],
    ["oklch(1 0 0 / 100%)", "#ffffff"],
  ])("emits sRGB hex including alpha: %s", (value, hex) => {
    expect(formatRust([{ key: "tint", kind: "color", default: "#000" }], { tint: value })).toBe(
      `rune::tune!("tint", rune::color::hex("${hex}").unwrap())  // was rune::color::hex("#000000").unwrap()`,
    )
  })

  it("comments unrecognized colour syntax instead of exporting an opaque fallback", () => {
    expect(
      formatRust([{ key: "tint", kind: "color", default: "#000" }], {
        tint: "rgba(255, 255, 255, 0.5)",
      }),
    ).toBe('// unsupported: "tint" (color)')
  })

  it("quotes and escapes keys, text and choices using Rust escapes", () => {
    const key = 'say "hi"\\\n'
    expect(
      formatRust(
        [
          { key, kind: "text", default: "Hi" },
          { key: "mode", kind: "choice", default: "one", choices: ["one", "two\\three"] },
          { key: "on", kind: "bool", default: false },
        ],
        { [key]: '"Hello"\\\n\r\t\b\f\0🎛', mode: "two\\three", on: true },
      ),
    ).toBe(
      [
        'rune::tune!("say \\"hi\\"\\\\\\n", "\\"Hello\\"\\\\\\n\\r\\t\\u{8}\\u{c}\\u{0}🎛")  // was "Hi"',
        'rune::tune!("mode", "two\\\\three")  // was "one"',
        'rune::tune!("on", true)  // was false',
      ].join("\n"),
    )
  })

  it("only emits modified values, filters by group and skips non-value descriptors", () => {
    const descriptors: ControlDescriptor[] = [
      { key: "a", kind: "number", default: 0, group: "one" },
      { key: "b", kind: "number", default: 0, group: "two" },
      { key: "same", kind: "number", default: 1 },
      { key: "missing", kind: "number", default: 2 },
      { key: "go", kind: "action" },
      { key: "read", kind: "watch" },
      { key: "tools", kind: "toolbar", items: [] },
      { key: "bound", kind: "spring", bind: { duration: "d", bounce: "b" } },
    ]
    expect(formatRust(descriptors, { a: 1, b: 2, same: 1, go: true, read: 2, tools: true })).toBe(
      [
        'rune::tune!("a", 1.0_f32)  // was 0.0_f32',
        'rune::tune!("b", 2.0_f32)  // was 0.0_f32',
      ].join("\n"),
    )
    expect(formatRust(descriptors, { a: 1, b: 2 }, "two")).toBe(
      'rune::tune!("b", 2.0_f32)  // was 0.0_f32',
    )
    expect(formatRust(descriptors, {})).toBe("")
  })

  it("comments unsupported structured kinds rather than inventing Rune types", () => {
    expect(
      formatRust(
        [
          { key: "position", kind: "vec2", default: { x: 0, y: 0 } },
          {
            key: "curve",
            kind: "curve",
            default: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
        {
          position: { x: 1, y: 2 },
          curve: [
            { x: 0, y: 1 },
            { x: 1, y: 0 },
          ],
        },
      ),
    ).toBe('// unsupported: "position" (vec2)\n// unsupported: "curve" (curve)')
  })

  it("exports current remote values and follows descriptor updates", () => {
    const remote = createRemoteControls(
      "rust",
      [
        { key: "a", kind: "number", default: 0, min: 0, max: 10, group: "one" },
        { key: "b", kind: "bool", default: false, group: "two" },
      ],
      { values: { a: 1, b: true } },
    )
    expect(remote.rust("two")).toBe('rune::tune!("b", true)  // was false')
    expect(remote.rust()).toContain('rune::tune!("a", 1.0_f32)')
    remote.update([{ key: "c", kind: "text", default: "old" }], { c: "new" }, { land: true })
    expect(remote.rust()).toBe('rune::tune!("c", "new")  // was "old"')
  })

  it("skips colours whose control value equals a hex default in another syntax", () => {
    const descriptors: ControlDescriptor[] = [
      { key: "tint", kind: "color", default: "#3d8bff" },
      { key: "glass", kind: "color", default: "#3d8bff80" },
    ]
    const remote = createRemoteControls("rust-colour-defaults", descriptors, { storage: null })
    // The control holds OKLCH strings; the descriptors hold hex.
    const values = { tint: remote.get().tint, glass: remote.get().glass }
    expect(values.tint).toMatch(/^oklch\(/)
    expect(values.glass).toMatch(/^oklch\(.* \/ 0\.502\)$/)
    expect(formatRust(descriptors, values)).toBe("")
    expect(formatSwift(descriptors, values)).toBe("")
    expect(remote.rust()).toBe("")
    expect(remote.swift()).toBe("")
  })

  it("lists a changed colour, including one that only changed alpha", () => {
    const descriptors: ControlDescriptor[] = [
      { key: "tint", kind: "color", default: "#3d8bff" },
      { key: "glass", kind: "color", default: "#3d8bff80" },
    ]
    expect(formatRust(descriptors, { tint: "oklch(0.7 0.1 30)", glass: "#3d8bff" })).toBe(
      [
        'rune::tune!("tint", rune::color::hex("#d58679").unwrap())  // was rune::color::hex("#3d8bff").unwrap()',
        'rune::tune!("glass", rune::color::hex("#3d8bff").unwrap())  // was rune::color::hex("#3d8bff80").unwrap()',
      ].join("\n"),
    )
    expect(formatSwift(descriptors, { tint: "oklch(0.7 0.1 30)" })).toContain(
      'Tunable<Color>("tint"',
    )
    expect(formatSwift(descriptors, { glass: "oklch(0.7 0.1 30 / 0.5)" })).toContain(
      "opacity: 0.5)",
    )
  })
})
