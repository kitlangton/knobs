import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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
    // 61 for the panel and pieces, 2 for a comparison's Before and After, and 18 for a page's
    // rhythm: eight space roles, five type sizes and their line heights.
    expect(count("input") + count("semantic")).toBeGreaterThanOrEqual(76)
    expect(count("input") + count("semantic")).toBeLessThanOrEqual(84)
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

  // A read with a fallback may name something only a host sets (a deprecated name, a public
  // token); a read without one must be defined.
  it("defines everything it reads without a fallback", () => {
    const defined = new Set([...css.matchAll(/(--_?ku?-[a-z0-9-]+):/g)].map((m) => m[1]))
    for (const [, read] of css.matchAll(/var\((--_?ku?-[a-z0-9-]+)\)/g))
      expect(defined.has(read), `${read} is read but never defined`).toBe(true)
  })

  it("resolves every token once, honouring its deprecated names first", () => {
    for (const t of defs) {
      const matches = css.match(new RegExp(`[{;]--_k-${t.name}:`, "g")) ?? []
      expect(matches.length, t.name).toBe(1)
    }
    for (const [old, next] of DEPRECATED) {
      const name = next.replace(/^--_?k-/, "")
      expect(css).toMatch(new RegExp(`--_k-${name}:[^;]*var\\(${old},`))
    }
    // Knobs never declares a deprecated name, so a host's value at any level reaches the resolver.
    for (const old of DEPRECATED.keys()) expect(css).not.toContain(`${old}:`)
  })

  it("puts the theme on :root, resolutions on .knobs-root, colours as light-dark pairs", () => {
    const [root, derived] = css.split(":where(.knobs-root){")
    expect(root).toContain("--k-bg:light-dark(#f5f5f7,#1c1c1d)")
    expect(root).toContain("--k-radius:8px")
    expect(root).not.toMatch(/var\(/)
    expect(root).not.toContain("--k-fill:")
    expect(derived).toContain(
      "--_k-fill:var(--k-surface,var(--ku-surface,var(--k-fill,color-mix(in oklch,var(--_k-fg) calc(5.5% * var(--_k-contrast)),transparent))))",
    )
    expect(derived).toContain("--_k-bg:var(--ku-bg,var(--k-bg))")
    expect(css).toContain(
      ':where(.knobs-root[data-appearance="dark"]){color-scheme:dark;--_k-light:0}',
    )
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

  it("keeps the README's table generated (bun run scripts/tokens-table.ts)", () => {
    const readme = readFileSync(resolve(import.meta.dirname, "../README.md"), "utf8")
    const block = readme.match(/<!-- tokens:start -->\n([\s\S]*?)<!-- tokens:end -->/)?.[1]
    expect(block?.trim()).toBe(tokensTable(knobs).trim())
  })
})
