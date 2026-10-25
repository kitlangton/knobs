import { describe, expect, it } from "vitest"
import { colorHex, colorHexAlpha, formatColor, parseColor, sameColor } from "../src/core/color.js"
import { createRemoteControls, defineControls } from "../src/index.js"
import { mutateStops } from "../src/core/ramp.js"
import { color } from "../src/core/schema.js"

describe("colour alpha", () => {
  it.each([
    ["#3d8bff80", "#3d8bff", 128 / 255],
    ["#3D8BFF80", "#3d8bff", 128 / 255],
    ["#f008", "#ff0000", 0x88 / 255],
    ["oklch(1 0 0 / 0.5)", "#ffffff", 0.5],
    ["oklch(100% 0 0 / 25%)", "#ffffff", 0.25],
  ])("parses %s as its RGB plus alpha", (input, hex, alpha) => {
    const parsed = parseColor(input)!
    expect(colorHex(parsed)).toBe(hex)
    expect(parsed.alpha).toBeCloseTo(alpha, 6)
  })

  it.each(["#3d8bffff", "#f00f", "oklch(1 0 0 / 1)", "oklch(1 0 0 / 100%)", "#3d8bff"])(
    "treats %s as opaque",
    (input) => {
      expect(parseColor(input)!.alpha).toBeUndefined()
      expect(formatColor(parseColor(input)!)).not.toContain("/")
    },
  )

  it("round-trips every 8-bit alpha through the stored value", () => {
    for (let a = 0; a < 255; a += 7) {
      const hex = `#3d8bff${a.toString(16).padStart(2, "0")}`
      expect(colorHexAlpha(color(hex).value)).toBe(hex)
    }
  })

  it("keeps a field's alpha through normalisation and sync", () => {
    const controls = defineControls(
      "colour-alpha",
      { tint: color("#ff000080") },
      {
        enabled: true,
        storage: null,
      },
    )
    expect(colorHexAlpha(controls.get().tint)).toBe("#ff000080")
    controls.set({ tint: "#00ff0040" })
    expect(colorHexAlpha(controls.get().tint)).toBe("#00ff0040")
  })

  it("shows a remote #rrggbbaa default as its colour, not the grey fallback", () => {
    const remote = createRemoteControls(
      "colour-alpha-remote",
      [{ key: "tint", kind: "color", default: "#3d8bff80" }],
      { storage: null },
    )
    expect(colorHex(remote.get().tint as string)).toBe("#3d8bff")
    expect(colorHexAlpha(remote.get().tint)).toBe("#3d8bff80")
  })

  it("compares colours across syntaxes by 8-bit RGBA", () => {
    expect(sameColor("#3d8bff", formatColor(parseColor("#3d8bff")!))).toBe(true)
    expect(sameColor("#3d8bff80", "#3d8bff")).toBe(false)
    expect(sameColor("#3d8bff", "#3d8bfe")).toBe(false)
    expect(sameColor("#3d8bff", "not a colour")).toBe(false)
  })
})

describe("gradient stops", () => {
  it("keep alpha through mutation", () => {
    const stops = [
      { at: 0, color: "oklch(0.5 0.1 200 / 0.5)" },
      { at: 1, color: "oklch(0.7 0.1 40)" },
    ]
    const out = mutateStops(stops, () => 0.3, [10, 20], [0.02, 0.05])
    expect(parseColor(out[0]!.color)?.alpha).toBe(0.5)
    expect(parseColor(out[1]!.color)?.alpha).toBeUndefined()
  })
})
