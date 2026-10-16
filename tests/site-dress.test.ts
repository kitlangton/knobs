import { describe, expect, it } from "vitest"
import { accentAt, dress, labOf, NEUTRAL, type Settings } from "../examples/site-dress"
import { contrast, darkAt, lookAt, over } from "../examples/site-look-math"
import { THEMES } from "../examples/site-look-themes"

const at = (x: number, s: Partial<Settings> = {}, wasDark?: boolean) => {
  const dark = darkAt(THEMES, x, wasDark)
  const light = dark ? 0 : 1
  return dress(lookAt(THEMES, x, light), { ...NEUTRAL, ...s }, light)
}

/** Accents a roll or a person might pick: greys, pastels, deep and vivid ones. */
const ACCENTS = [
  "oklch(1 0 0)",
  "oklch(0.2 0 0)",
  "oklch(0.9 0.05 90)",
  "oklch(0.45 0.2 270)",
  "oklch(0.65 0.25 30)",
  "oklch(0.8 0.18 145)",
]

describe("dressing a theme", () => {
  it("leaves the theme's numbers alone at the neutral settings", () => {
    THEMES.forEach((t, i) => {
      const look = at(i)
      for (const [k, v] of Object.entries(t.num))
        expect(look.num[k], `${t.name} ${k}`).toBeCloseTo(v, 6)
    })
  })

  it("reads OKLab from a colour field's oklch()", () => {
    const [L, a, b] = labOf("oklch(0.7 0.1 90)")
    expect(L).toBeCloseTo(0.7, 6)
    expect(a).toBeCloseTo(0, 6)
    expect(b).toBeCloseTo(0.1, 6)
  })

  it("keeps text readable at every theme, whatever the contrast", () => {
    for (const c of [-0.5, 0, 1]) {
      let wasDark: boolean | undefined
      for (let x = 0; x <= THEMES.length - 1; x += 0.01) {
        wasDark = darkAt(THEMES, x, wasDark)
        const look = at(x, { contrast: c }, wasDark)
        const page = look.colors.page!
        const panel = over(look.colors.kBg!, page)
        const where = `x ${x.toFixed(2)}, contrast ${c}`
        expect(contrast(look.colors.text!, page), `text at ${where}`).toBeGreaterThan(4)
        expect(contrast(look.colors.label!, page), `label at ${where}`).toBeGreaterThan(2.8)
        expect(contrast(look.colors.kText!, panel), `panel text at ${where}`).toBeGreaterThan(4)
      }
    }
  })

  it("makes any accent read as text on any theme's ground", () => {
    for (const acc of ACCENTS) {
      THEMES.forEach((t, i) => {
        const look = at(i, { accent: labOf(acc) })
        expect(
          contrast(look.colors.accent!, look.colors.page!),
          `${acc} on ${t.name}`,
        ).toBeGreaterThan(3)
      })
    }
  })

  it("moves the accent's lightness with the polarity, keeping its hue", () => {
    const acc = labOf("oklch(0.65 0.2 30)")
    const d = accentAt(acc, 0)
    const l = accentAt(acc, 1)
    expect(d.chroma).toBeCloseTo(0.2, 6)
    const [dr, dg, db] = d.ink
    const [lr, lg, lb] = l.ink
    expect(dr + dg + db).toBeGreaterThan(lr + lg + lb)
  })

  it("squares and rounds corners continuously through the theme's", () => {
    const night = THEMES[0]!.num
    expect(at(0, { corners: -1 }).num.kRadius).toBe(0)
    expect(at(0, { corners: 0 }).num.kRadius).toBeCloseTo(night.kRadius, 6)
    expect(at(0, { corners: 1 }).num.rStage).toBe(30)
    // Brutal is square; rounding still reaches it.
    expect(at(3, { corners: 1 }).num.rStage).toBe(30)
    const a = at(0, { corners: -0.001 }).num.kRadius!
    const b = at(0, { corners: 0.001 }).num.kRadius!
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it("goes from flat through the theme's glass to raised without a step", () => {
    const night = THEMES[0]!.num
    const flat = at(0, { surface: 0 }).num
    expect(flat.kGlass).toBe(0)
    expect(flat.shadowK).toBe(0)
    expect(flat.flat).toBe(1)
    const glass = at(0, { surface: 1 }).num
    expect(glass.kGlass).toBeCloseTo(night.kGlass, 6)
    expect(glass.shadowK).toBe(1)
    const raised = at(0, { surface: 2 }).num
    expect(raised.raise).toBe(1)
    expect(raised.shadowK).toBeGreaterThan(2)
    for (const k of ["kGlass", "shadowK", "raise", "flat"]) {
      const lo = at(0, { surface: 0.999 }).num[k]!
      const hi = at(0, { surface: 1.001 }).num[k]!
      expect(Math.abs(lo - hi), k).toBeLessThan(0.01)
    }
  })

  it("scales the title and moves its weight within what the faces have", () => {
    const n = at(1, { titleSize: 1.2, weight: -300 }).num
    expect(n.tSize).toBeCloseTo(THEMES[1]!.num.tSize * 1.2, 6)
    expect(n.tWeight).toBe(100)
    expect(at(2, { weight: 300 }).num.tWeight).toBe(900)
  })
})
