import { describe, expect, it } from "vitest"
import { stepValue } from "../src/panel/slider.js"

describe("stepValue", () => {
  const promotion = { min: 0.15, max: 1, step: 0.02 }
  it("steps whole grid steps from a value on the grid", () => {
    expect(stepValue(promotion, 0.41, 1)).toBe(0.43)
    expect(stepValue(promotion, 0.41, -1)).toBe(0.39)
    expect(stepValue(promotion, 0.41, 5)).toBe(0.51)
  })
  it("from a value between grid points, lands on the next grid point that way", () => {
    expect(stepValue(promotion, 0.4, 1)).toBe(0.41)
    expect(stepValue(promotion, 0.4, -1)).toBe(0.39)
    expect(stepValue(promotion, 0.4, 5)).toBe(0.49)
  })
  it("clamps at the ends", () => {
    expect(stepValue(promotion, 0.99, 3)).toBe(1)
    expect(stepValue(promotion, 0.15, -1)).toBe(0.15)
  })
})
