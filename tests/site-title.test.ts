import { describe, expect, it } from "vitest"
import { titleOutline, titleShapes } from "../examples/site-title"

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
