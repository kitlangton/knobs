import { describe, expect, it } from "vitest"
import { leftOf, readPosition, savedPosition } from "../src/panel/position.js"

describe("floating panel position", () => {
  it("keeps a panel dropped on the right half by the right edge", () => {
    const saved = savedPosition(1100, 40, 288, 1440)
    expect(saved).toEqual({ x: 52, y: 40, right: true })
    // The same distance from the right edge in a narrower or wider window.
    expect(leftOf(saved, 288, 1440)).toBe(1100)
    expect(leftOf(saved, 288, 1000)).toBe(660)
    expect(leftOf(saved, 288, 1920)).toBe(1580)
  })

  it("keeps a panel dropped on the left half by the left edge", () => {
    const saved = savedPosition(120, 300, 288, 1440)
    expect(saved).toEqual({ x: 120, y: 300 })
    expect(leftOf(saved, 288, 900)).toBe(120)
  })

  it("reads positions saved before edges were kept, and nothing else", () => {
    expect(readPosition('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 })
    expect(readPosition('{"x":10,"y":20,"right":true}')).toEqual({ x: 10, y: 20, right: true })
    expect(readPosition('{"x":"a","y":20}')).toBeUndefined()
    expect(readPosition("not json")).toBeUndefined()
    expect(readPosition(null)).toBeUndefined()
  })
})
