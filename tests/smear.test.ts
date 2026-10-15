import { describe, expect, it } from "vitest"
import { rangeSmear } from "../src/panel/smear.js"

describe("range edge smear", () => {
  it("is exactly 0 at rest and under a quarter pixel, so a resting band stays crisp", () => {
    expect(rangeSmear(0, 0.5)).toBe(0)
    expect(rangeSmear(20, 0.5)).toBe(0)
    expect(rangeSmear(5000, 0)).toBe(0)
  })
  it("grows with speed and strength, capped like the slider fill's edge", () => {
    expect(rangeSmear(1000, 0.5)).toBeCloseTo(11)
    expect(rangeSmear(1000, 1)).toBeCloseTo(22)
    expect(rangeSmear(100000, 1)).toBe(28)
  })
})
