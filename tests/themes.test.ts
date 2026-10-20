import { describe, expect, it } from "vitest"
import { APCA_BUDGET, defineTheme } from "../src/themes/define.js"
import { gallery } from "../src/themes/gallery.js"
import { knobs } from "../src/themes/knobs.js"
import { voidTheme } from "../src/themes/void.js"
import { apca, TOKENS, type TokenDef } from "../src/tokens/index.js"

const colorTokens = (TOKENS as readonly TokenDef[])
  .filter((t) => t.type === "color")
  .map((t) => t.name)
const slate = defineTheme({
  name: "slate",
  gray: { hue: 265, chroma: 0.008 },
  accent: "oklch(68% .17 278)",
})
const themes = [
  knobs,
  voidTheme,
  slate,
  defineTheme({ name: "soft", extends: knobs, contrast: 0 }),
  defineTheme({ name: "hard", extends: knobs, contrast: 100 }),
]

describe("APCA budget", () => {
  // Gallery's dark text tiers are its own, quieter than the budget by design ("the shipped looks").
  const looks = [
    ...themes.flatMap((theme) => (["dark", "light"] as const).map((a) => [theme, a] as const)),
    [gallery, "light"] as const,
  ]
  for (const [theme, appearance] of looks)
    it(`${theme.name} ${appearance}`, () => {
      const t = theme[appearance]
      for (const [role, floor] of Object.entries(APCA_BUDGET))
        expect(
          apca(t[role as keyof typeof t], t.bg),
          `${role} ${t[role as keyof typeof t]} on ${t.bg}`,
        ).toBeGreaterThanOrEqual(floor)
      expect(apca(t["on-accent"], t.accent)).toBeGreaterThanOrEqual(60)
    })
})

describe("the shipped looks", () => {
  it("Knobs matches the plan's starting values", () => {
    expect(knobs.dark).toMatchObject({
      "bg-page": "#0a0a0b",
      "bg-inset": "#151516",
      "bg-raised": "#232324",
      "bg-overlay": "#29292a",
      fg: "#f4f5f9",
      accent: "#ffffff",
      "on-accent": "#111111",
    })
    expect(knobs.light).toMatchObject({ bg: "#f5f5f7", accent: "#1c1c1e", "on-accent": "#ffffff" })
    expect(knobs.declared.dark.glass).toBe("0.6")
  })

  it("Gallery is one ink at fixed opacities on near-black, coral Before and white After", () => {
    expect(gallery.dark).toMatchObject({
      "bg-page": "#0b0b0c",
      "bg-inset": "#0a0a0b",
      bg: "#0f0f11",
      "bg-raised": "#161618",
      "bg-overlay": "#161618",
      fg: "#ececee",
      "fg-2": "#8b8b8d",
      "fg-3": "#5a5a5c",
      fill: "#ececee0f",
      "fill-selected": "#ececee1c",
      "border-subtle": "#ececee14",
      "compare-stage": "#0a0a0b",
      before: "#ed756a",
      after: "#f0f2f5",
      accent: "#ececee",
    })
    // The dark text tiers are the Gallery's: quieter than the budget, still in order.
    const lc = (role: "fg" | "fg-2" | "fg-3") => apca(gallery.dark[role], gallery.dark.bg)
    expect(lc("fg")).toBeGreaterThanOrEqual(APCA_BUDGET.fg)
    expect(lc("fg-2")).toBeGreaterThan(lc("fg-3"))
    // Knobs and Void keep Before and After neutral.
    expect(knobs.dark.before).toBe(knobs.dark["fg-3"])
    expect(voidTheme.dark.after).toBe(voidTheme.dark.fg)
  })

  it("Void is true black, capped text, flat with solid hairlines", () => {
    expect(voidTheme.dark).toMatchObject({
      "bg-page": "#000000",
      bg: "#000000",
      "bg-raised": "#1c1c1e",
      "bg-overlay": "#2c2c2e",
      fg: "#ededed",
      accent: "#ffffff",
    })
    expect(voidTheme.dark.border).toMatch(/^#[0-9a-f]{6}$/)
    expect(voidTheme.dark.rim).toBe("#00000000")
    expect(voidTheme.dark["shadow-raised"]).toBe("none")
    expect(voidTheme.dark["compare-stage"]).toBe("#000000")
    // Neutral in light too: no tint in the accent.
    expect(voidTheme.light.accent).toBe("#1c1c1c")
  })
})

describe("defineTheme", () => {
  it("deep-merges extends", () => {
    const child = defineTheme({
      name: "child",
      extends: voidTheme,
      gray: { hue: 70 },
      font: { mono: "Berkeley Mono" },
      tokens: { dark: { fg: "#eeeeee" } },
    })
    expect(child.inputs.gray).toEqual({ hue: 70, chroma: 0 })
    expect(child.inputs.material).toBe("flat")
    expect(child.inputs.font.sans).toBe(knobs.inputs.font.sans)
    expect(child.inputs.font.mono).toMatch(/^"Berkeley Mono",/)
    expect(child.inputs.tokens.dark).toMatchObject({ bg: "#000000", fg: "#eeeeee" })
    expect(child.dark.fg).toBe("#eeeeee")
    expect(child.dark["bg-raised"]).toBe("#1c1c1e")
  })

  it("derives a light accent and a readable accent text", () => {
    expect(slate.dark.accent).toBe("#828afe")
    expect(apca(slate.light.accent, slate.light.bg)).toBeGreaterThan(60)
    expect(slate.dark["accent-soft"]).toBe("#828afe26")
  })

  it("follows host overrides of derived tokens through the resolver", () => {
    const t = defineTheme({ name: "o", extends: knobs, tokens: { dark: { accent: "#ff0000" } } })
    expect(t.dark["slider-handle"]).toBe("#ff0000")
    expect(t.dark.focus).toBe("#ff0000")
    expect(t.light.focus).toBe("#1c1c1e")
  })

  it("rejects unknown tokens and non-colour values that differ by appearance", () => {
    expect(() => defineTheme({ name: "x", tokens: { dark: { nope: "1" } as never } })).toThrow(
      /Unknown token/,
    )
    expect(() =>
      defineTheme({ name: "x", tokens: { dark: { width: "300px" }, light: { width: "320px" } } }),
    ).toThrow(/only colours/)
    expect(() => defineTheme({ name: "bad name" })).toThrow()
  })

  it("contrast spreads the inks", () => {
    const [soft, hard] = themes.slice(3)
    expect(apca(hard!.dark["fg-3"], hard!.dark.bg)).toBeGreaterThan(
      apca(knobs.dark["fg-3"], knobs.dark.bg),
    )
    expect(hard!.declared.dark.contrast).toBe("1.5")
    expect(soft!.declared.dark.contrast).toBe("0.5")
  })

  it("gives the GPU every colour as linear floats", () => {
    for (const theme of themes)
      for (const appearance of ["dark", "light"] as const) {
        const gpu = theme.gpu[appearance]
        expect(Object.keys(gpu).sort()).toEqual([...colorTokens].sort())
        for (const v of Object.values(gpu)) {
          expect(v).toHaveLength(4)
          for (const x of v) expect(x >= 0 && x <= 1).toBe(true)
        }
      }
    expect(knobs.gpu.dark.accent).toEqual([1, 1, 1, 1])
  })

  it("scopes a theme under a selector", () => {
    const css = voidTheme.css({ selector: '.knobs-root[data-knobs-theme="void"]' })
    expect(css).toMatch(/^@layer knobs\.tokens\{\.knobs-root\[data-knobs-theme="void"\]\{/)
    expect(css).toContain("--k-bg:light-dark(#f5f5f5,#000000)")
    expect(css).toContain("--k-border:light-dark(")
    expect(voidTheme.css()).toContain(":where(.knobs-root){")
  })

  it("writes a colour declared for one appearance with the other side's resolved value", () => {
    const css = voidTheme.css({ selector: ".x" })
    expect(css).toContain(
      `--k-compare-stage:light-dark(${voidTheme.light["compare-stage"]},#000000)`,
    )
  })
})
