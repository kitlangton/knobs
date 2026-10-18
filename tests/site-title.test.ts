import { describe, expect, it } from "vitest"
import { titleOutline, titlePresence, titleShapes } from "../examples/site-title"

describe("title outline data and interpolation", () => {
  it("keeps contour topology compatible across every face and weight master", () => {
    const reference = titleShapes.sans[0]!.letters
    for (const masters of Object.values(titleShapes)) {
      for (const master of masters) {
        expect(master.letters).toHaveLength(reference.length)
        master.letters.forEach((letter, i) => {
          expect(letter.advance).toBeGreaterThan(0)
          expect(letter.contours).toHaveLength(reference[i]!.contours.length)
          letter.contours.forEach((contour, ci) => {
            expect(contour).toHaveLength(reference[i]!.contours[ci]!.length)
            for (const p of contour) expect(p.every(Number.isFinite)).toBe(true)
          })
        })
      }
    }
  })

  it("interpolates advances linearly, including a three-way interrupted blend", () => {
    const sans = titleOutline({ sans: 1 }, 500, 0.1).advance
    const serif = titleOutline({ serif: 1 }, 500, 0.1).advance
    const wide = titleOutline({ wide: 1 }, 500, 0.1).advance
    const blend = titleOutline({ sans: 0.2, serif: 0.3, wide: 0.5 }, 500, 0.1)
    expect(blend.advance).toBeCloseTo(sans * 0.2 + serif * 0.3 + wide * 0.5, 8)
    expect(blend.paths).toHaveLength(5)
    for (const path of blend.paths) {
      expect(path).not.toMatch(/NaN|Infinity/)
      expect(path.startsWith("M")).toBe(true)
      expect(path.endsWith("Z")).toBe(true)
    }
  })

  it("normalizes blend weights and safely falls back when their total is zero", () => {
    expect(titleOutline({ sans: 2, serif: 2 }, 400, 0)).toEqual(
      titleOutline({ sans: 0.5, serif: 0.5 }, 400, 0),
    )
    expect(titleOutline({}, 400, 0)).toEqual(titleOutline({ sans: 1 }, 400, 0))
  })

  it("clamps weight to the baked range and adds tracking only between letters", () => {
    expect(titleOutline({ sans: 1 }, -100, 0)).toEqual(titleOutline({ sans: 1 }, 100, 0))
    expect(titleOutline({ sans: 1 }, 2000, 0)).toEqual(titleOutline({ sans: 1 }, 900, 0))
    const plain = titleOutline({ sans: 1 }, 650, 0)
    const spaced = titleOutline({ sans: 1 }, 650, 0.1)
    expect(spaced.advance - plain.advance).toBeCloseTo(0.4, 8)
  })
})

describe("single-word face replacement", () => {
  it("starts at rest and only changes face at zero opacity", () => {
    const step = titlePresence()
    expect(step("sans", 0)).toEqual({ face: "sans", opacity: 1, moving: false })
    let previous = "sans"
    let swaps = 0
    let result = step("serif", 1 / 120)
    for (let i = 0; i < 240; i++) {
      result = step("serif", 1 / 120)
      if (result.face !== previous) {
        expect(result.opacity).toBe(0)
        swaps++
      }
      previous = result.face
    }
    expect(swaps).toBe(1)
    expect(result).toEqual({ face: "serif", opacity: 1, moving: false })
  })

  it("keeps the current opacity when reversed or retargeted to a third face", () => {
    const step = titlePresence()
    step("sans", 0)
    let result = step("serif", 1 / 60)
    for (let i = 0; i < 3; i++) result = step("serif", 1 / 60)
    const opacity = result.opacity
    expect(opacity).toBeLessThan(1)
    expect(opacity).toBeGreaterThan(0)
    expect(step("mono", 0)).toEqual({ face: "sans", opacity, moving: true })
    expect(step("sans", 0)).toEqual({ face: "sans", opacity, moving: true })
    for (let i = 0; i < 120; i++) result = step("mono", 1 / 60)
    expect(result).toEqual({ face: "mono", opacity: 1, moving: false })
  })
})
