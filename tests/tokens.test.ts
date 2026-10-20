import { describe, expect, it } from "vitest"
import { knobs } from "../src/themes/knobs.js"
import {
  apca,
  cssName,
  DEPRECATED,
  evaluate,
  formatHex,
  oklchToHex,
  parseColor,
  RETIRED_INTERNAL,
  TOKENS,
  type TokenDef,
  tokenForProperty,
  tokensCss,
  tokensTable,
  toOklch,
} from "../src/tokens/index.js"

const defs = TOKENS as readonly TokenDef[]

describe("colour maths", () => {
  it("reproduces published APCA 0.0.98G values", () => {
    // Radix: slate-11 on slate-2 is Lc 60; the APCA reference pairs.
    expect(apca("#b0b4ba", "#18191b")).toBeCloseTo(60, 0)
    expect(apca("#000000", "#ffffff")).toBeCloseTo(106.04, 1)
    expect(apca("#ffffff", "#000000")).toBeCloseTo(107.88, 1)
    expect(apca("#888888", "#ffffff")).toBeCloseTo(63.06, 1)
    expect(apca("#ffffff", "#888888")).toBeCloseTo(68.54, 1)
    expect(apca("#123456", "#123456")).toBe(0)
  })

  it("round-trips OKLCH and sRGB", () => {
    for (const hex of ["#1c1c1e", "#f5f5f7", "#7170ff", "#59d38c", "#000000", "#ffffff"])
      expect(oklchToHex(toOklch(hex))).toBe(hex)
    const o = toOklch("#0a0a0b")
    expect(o.l * 100).toBeCloseTo(14.5, 1)
    expect(oklchToHex({ l: 0.78, c: 0.15, h: 155 })).toBe("#59d38c")
  })

  it("parses hex with alpha, rgb() and oklch()", () => {
    expect(formatHex(parseColor("#ffffff1a"))).toBe("#ffffff1a")
    expect(formatHex(parseColor("rgba(255, 255, 255, .1)"))).toBe("#ffffff1a")
    expect(formatHex(parseColor("oklch(70% 0.18 25)"))).toBe("#fa6863")
  })

  it("evaluates color-mix in oklch the way browsers do", () => {
    const lookup = (p: string) =>
      ({ "--k-fg": "#f4f5f9", "--k-contrast": "1", "--k-accent": "#ffffff", "--k-bg": "#000000" })[
        p
      ]
    expect(
      evaluate(
        "color-mix(in oklch,var(--k-fg) calc(5.5% * var(--k-contrast)),transparent)",
        lookup,
      ),
    ).toBe("#f4f5f90e")
    expect(evaluate("color-mix(in oklch,var(--k-accent) 15%,transparent)", lookup)).toBe(
      "#ffffff26",
    )
    // Achromatic ends take the other side's hue; halfway in L between white and black.
    expect(
      toOklch(evaluate("color-mix(in oklch,var(--k-accent) 50%,var(--k-bg))", lookup)).l,
    ).toBeCloseTo(0.5, 2)
    expect(() => evaluate("var(--k-missing)", lookup)).toThrow()
  })
})

describe("token schema", () => {
  it("has unique names and properties", () => {
    const names = defs.map(cssName)
    expect(new Set(names).size).toBe(names.length)
  })

  it("keeps the public contract near the plan's size", () => {
    const count = (tier: string) => defs.filter((t) => t.tier === tier).length
    expect(count("input") + count("semantic")).toBeGreaterThanOrEqual(56)
    expect(count("input") + count("semantic")).toBeLessThanOrEqual(64)
    expect(count("hook")).toBeGreaterThanOrEqual(18)
    expect(count("hook")).toBeLessThanOrEqual(24)
  })

  it("resolves every deprecated alias to an existing token", () => {
    expect(DEPRECATED.size).toBeGreaterThan(40)
    for (const [old, next] of DEPRECATED) {
      expect(tokenForProperty(next), `${old} → ${next}`).toBeDefined()
      expect(tokenForProperty(old), `${old} is still a token name`).toBeUndefined()
      expect(old).toMatch(/^--ku?-[a-z0-9-]+$/)
    }
    const olds = defs.flatMap((t) => t.deprecated ?? [])
    expect(new Set(olds).size).toBe(olds.length)
    for (const name of RETIRED_INTERNAL) expect(DEPRECATED.has(name)).toBe(false)
  })

  it("only reads tokens it defines", () => {
    const known = new Set(defs.map(cssName))
    for (const t of defs) {
      const source = t.source
      if (!("css" in source)) continue
      for (const [, read] of source.css.matchAll(/var\((--_?k-[a-z0-9-]+)/g))
        expect(known.has(read!), `${t.name} reads ${read}`).toBe(true)
    }
  })
})

describe("generated CSS", () => {
  const css = tokensCss(knobs)

  it("is balanced and layered", () => {
    const count = (ch: string) => css.split(ch).length - 1
    expect(count("{")).toBe(count("}"))
    expect(count("(")).toBe(count(")"))
    expect(css.startsWith("@layer knobs.tokens{")).toBe(true)
    expect(css).toContain(":where(:root,:host){")
    expect(css).toContain(":where(.knobs-root){")
  })

  it("defines everything it reads", () => {
    const defined = new Set([...css.matchAll(/(--_?ku?-[a-z0-9-]+):/g)].map((m) => m[1]))
    for (const [, read] of css.matchAll(/var\((--_?ku?-[a-z0-9-]+)/g))
      expect(defined.has(read), `${read} is read but never defined`).toBe(true)
  })

  it("declares every token exactly once and every alias", () => {
    for (const t of defs) {
      const matches = css.match(new RegExp(`[{;]${cssName(t)}:`, "g")) ?? []
      expect(matches.length, cssName(t)).toBe(1)
    }
    for (const [old, next] of DEPRECATED) expect(css).toContain(`${old}:var(${next})`)
  })

  it("puts inputs on :root, derivations on .knobs-root, colours as light-dark pairs", () => {
    const [root, derived] = css.split(":where(.knobs-root){")
    expect(root).toContain("--k-bg:light-dark(#f5f5f7,#1c1c1d)")
    expect(root).toContain("--k-radius:8px")
    expect(root).not.toMatch(/var\(/)
    expect(derived).toContain(
      "--k-fill:color-mix(in oklch,var(--k-fg) calc(5.5% * var(--k-contrast)),transparent)",
    )
    expect(css).toContain(':where(.knobs-root[data-appearance="dark"]){color-scheme:dark}')
    expect(css).not.toMatch(/in srgb/)
  })

  it("documents every public token in the README table", () => {
    const table = tokensTable(knobs)
    const [reference] = table.split("### Renamed")
    for (const t of defs) {
      if (t.tier === "private") expect(reference).not.toContain(`| \`${cssName(t)}\` |`)
      else expect(reference).toContain(`| \`${cssName(t)}\` |`)
    }
    expect(table).toContain("| `--k-text` | `--k-fg` |")
  })
})
