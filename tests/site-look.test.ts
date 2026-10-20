import { describe, expect, it } from "vitest"
import {
  contrast,
  crossL,
  darkAt,
  faceWipe,
  lookAt,
  mix,
  mixLooks,
  nearestTheme,
  oklab,
  over,
  PIVOT_L,
  parseColor,
  type Rgba,
  roundPx,
  stepSpring,
} from "../examples/site-look-math"
import { THEMES } from "../examples/site-look-themes"

const close = (a: readonly number[], b: readonly number[], eps = 1e-3) =>
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, -Math.log10(eps)))

describe("OKLab mixing", () => {
  it("round-trips sRGB", () => {
    for (const hex of ["#101012", "#f3ecdf", "#ff3b00", "#52e3d4", "#ffffff", "#000000"]) {
      const c = parseColor(hex)
      close(mix(c, c, 0.37), c)
    }
  })

  it("matches the ends exactly and moves lightness evenly between them", () => {
    const a = parseColor("#000000")
    const b = parseColor("#ffffff")
    close(mix(a, b, 0), a)
    close(mix(a, b, 1), b)
    // Halfway in OKLab is a perceptual mid grey (L .5), not sRGB's #808080 (L .6).
    expect(oklab(mix(a, b, 0.5))[0]).toBeCloseTo(0.5, 3)
  })

  it("mixes premultiplied, so a transparent end lends no colour", () => {
    const red = parseColor("#ff0000")
    const clear = parseColor("rgba(0,0,255,0)")
    const m = mix(red, clear, 0.5)
    expect(m[3]).toBeCloseTo(0.5, 5)
    close(m.slice(0, 3), [1, 0, 0])
  })

  it("parses the forms the themes use", () => {
    close(parseColor("rgba(255,255,255,.045)"), [1, 1, 1, 0.045])
    close(parseColor("rgb(255 0 0 / 50%)"), [1, 0, 0, 0.5])
    close(parseColor("#fff"), [1, 1, 1, 1])
  })
})

describe("token interpolation", () => {
  it("lands on each theme at its stop", () => {
    THEMES.forEach((t, i) => {
      const look = lookAt(THEMES, i, t.dark ? 0 : 1)
      for (const [k, v] of Object.entries(t.num)) expect(look.num[k]).toBeCloseTo(v, 6)
      close(look.colors.page!, parseColor(t.ground.page))
      close(look.colors.text!, parseColor(t.ink.text), 2e-3)
      expect(look.fonts[t.font]).toBeCloseTo(1, 6)
    })
  })

  it("is continuous along the whole sweep", () => {
    const dist = (a: Rgba, b: Rgba) =>
      Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3])
    let prevDark: boolean | undefined
    let prev = lookAt(THEMES, 0, 0)
    for (let x = 0.001; x <= THEMES.length - 1; x += 0.001) {
      const dark = darkAt(THEMES, x, prevDark)
      prevDark = dark
      // Polarity changes ease over time, so a position step holds it.
      const look = lookAt(THEMES, x, x < 2.5 ? 0 : 1)
      for (const k of ["page", "card", "kBg", "night"])
        expect(dist(look.colors[k]!, prev.colors[k]!)).toBeLessThan(0.02)
      for (const k of Object.keys(look.num))
        expect(Math.abs(look.num[k]! - prev.num[k]!)).toBeLessThan(1)
      for (const k of Object.keys(look.fonts))
        expect(Math.abs((look.fonts[k] ?? 0) - (prev.fonts[k] ?? 0))).toBeLessThan(0.01)
      prev = look
    }
  })

  it("crossfades a face only while sizes keep moving, with no step at the ends", () => {
    // Brutal (mono) to Paper (serif).
    expect(lookAt(THEMES, 3.15, 1).fonts.mono).toBe(1)
    expect(lookAt(THEMES, 3.5, 1).fonts.mono).toBeCloseTo(0.5, 6)
    expect(lookAt(THEMES, 3.85, 1).fonts.serif).toBe(1)
    // Night and Ocean share a face: no crossfade, the weight just moves.
    expect(lookAt(THEMES, 0.5, 0).fonts.sans).toBeCloseTo(1, 6)
  })

  it("wipes one face into the next across the middle of a segment", () => {
    expect(faceWipe(THEMES, 0.5)).toBeNull() // Night and Ocean share a face
    expect(faceWipe(THEMES, 3.1)).toBeNull()
    expect(faceWipe(THEMES, 3.5)).toMatchObject({ from: "mono", to: "serif" })
    expect(faceWipe(THEMES, 3.5)!.at).toBeCloseTo(0.5, 9)
    const a = faceWipe(THEMES, 3.4)!.at
    const b = faceWipe(THEMES, 3.6)!.at
    expect(a).toBeLessThan(0.5)
    expect(b).toBeGreaterThan(0.5)
    expect(faceWipe(THEMES, 3.9)).toBeNull()
  })

  it("mixes two looks for a fade", () => {
    const a = lookAt(THEMES, 0, 0)
    const b = lookAt(THEMES, 4, 1)
    const m = mixLooks(a, b, 0.5)
    expect(m.num.tWeight).toBeCloseTo((a.num.tWeight! + b.num.tWeight!) / 2, 6)
    expect(m.fonts.sans).toBeCloseTo(0.5, 6)
    expect(m.fonts.serif).toBeCloseTo(0.5, 6)
  })
})

describe("light and dark", () => {
  it("passes every ground through the pivot grey halfway across", () => {
    expect(crossL(0.2, 0.95, 0)).toBeCloseTo(0.2, 6)
    expect(crossL(0.2, 0.95, 0.5)).toBeCloseTo(PIVOT_L, 6)
    expect(crossL(0.2, 0.95, 1)).toBeCloseTo(0.95, 6)
    let prev = 0
    for (let u = 0; u <= 1; u += 0.01) {
      const l = crossL(0.2, 0.95, u)
      expect(l).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = l
    }
    const mid = lookAt(THEMES, 2.5, 0)
    for (const k of ["page", "card", "kBg", "kPage"])
      expect(oklab(mid.colors[k]!)[0]).toBeCloseTo(PIVOT_L, 3)
  })

  it("snaps polarity at the middle of the crossing, holding it a little either side", () => {
    expect(darkAt(THEMES, 2.4)).toBe(true)
    expect(darkAt(THEMES, 2.6)).toBe(false)
    // Coming from dark it stays dark until past the middle by the hold; and back.
    expect(darkAt(THEMES, 2.52, true)).toBe(true)
    expect(darkAt(THEMES, 2.56, true)).toBe(false)
    expect(darkAt(THEMES, 2.48, false)).toBe(false)
    expect(darkAt(THEMES, 2.44, false)).toBe(true)
    expect(darkAt(THEMES, 0.7)).toBe(true)
    expect(darkAt(THEMES, 3.5)).toBe(false)
  })

  it("finds the nearest theme of the other polarity for the toggle", () => {
    expect(nearestTheme(THEMES, 0, false)).toBe(3)
    expect(nearestTheme(THEMES, 2.2, false)).toBe(3)
    expect(nearestTheme(THEMES, 4, true)).toBe(5) // Void, after Paper
    expect(nearestTheme(THEMES, 3.4, true)).toBe(2)
    expect(nearestTheme(THEMES, 1, true)).toBe(1)
  })

  it("keeps text readable at every resting position", () => {
    let wasDark: boolean | undefined
    const sweep = (from: number, to: number, step: number) => {
      for (let x = from; step > 0 ? x <= to : x >= to; x += step) {
        const dark = darkAt(THEMES, x, wasDark)
        wasDark = dark
        const look = lookAt(THEMES, x, dark ? 0 : 1)
        const c = look.colors
        const page = c.page!
        const panel = over(c.kBg!, page)
        expect(contrast(c.text!, page), `text at ${x.toFixed(2)}`).toBeGreaterThan(4)
        expect(contrast(c.label!, page), `label at ${x.toFixed(2)}`).toBeGreaterThan(3)
        expect(contrast(c.dim!, page), `dim at ${x.toFixed(2)}`).toBeGreaterThan(2)
        expect(contrast(c.kText!, panel), `panel text at ${x.toFixed(2)}`).toBeGreaterThan(4)
        expect(contrast(c.kLabel!, panel), `panel label at ${x.toFixed(2)}`).toBeGreaterThan(3)
      }
    }
    sweep(0, THEMES.length - 1, 0.005)
    sweep(THEMES.length - 1, 0, -0.005)
  })
})

describe("springs", () => {
  it("settle without overshoot and keep velocity when retargeted", () => {
    const s = { x: 0, v: 0 }
    let max = 0
    for (let i = 0; i < 120; i++) {
      stepSpring(s, 1, 0.6, 1 / 60)
      max = Math.max(max, s.x)
    }
    expect(max).toBeLessThanOrEqual(1 + 1e-9)
    expect(s.x).toBeCloseTo(1, 3)
    const t = { x: 0, v: 3 }
    stepSpring(t, 0, 0.6, 1 / 240)
    expect(t.v).toBeGreaterThan(2)
  })

  it("rounds corners continuously from square to capsule", () => {
    expect(roundPx(0)).toBe(0)
    expect(roundPx(0.5)).toBeCloseTo(24, 6)
    expect(roundPx(1)).toBe(999)
    expect(roundPx(0.99)).toBeGreaterThan(999 - 1)
  })
})
