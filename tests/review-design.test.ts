// The review pieces' design system, held to its own rules: one type scale on a 4 px baseline, two
// weights, space roles that double, and stylesheets that read only those.
import { describe, expect, test } from "vitest"
import { MEASURE, SPACE, TYPE, trackingAt } from "../src/review/foundations"
import { TOKEN_BY_NAME, type TokenName } from "../src/tokens/schema"
import { walkthroughCss } from "../src/ui/walkthrough-css"

const px = (name: string) => {
  const t = TOKEN_BY_NAME.get(name as TokenName)!
  const src = t.source
  if ("value" in src) return Number.parseFloat(src.value)
  if (!("css" in src)) return Number.NaN
  const m = /calc\(var\(--k-unit\) \* (\d+)\)/.exec(src.css)
  return m ? 4 * Number(m[1]) : src.css === "var(--k-unit)" ? 4 : Number.NaN
}

/** `property: value` pairs in a sheet, comments dropped. */
const declarations = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(?:^|[;{])\s*([\w-]+)\s*:\s*([^;}]+)/g)].map(
    (m) => ({ property: m[1]!, value: m[2]!.trim() }),
  )

const SHEETS = { walkthrough: walkthroughCss }
const SIZE = /var\(--_k-type-(heading|title|body|label|small)\)/

describe("type", () => {
  test("the scale is the page tokens, every line on the 4 px grid", () => {
    for (const t of TYPE) {
      expect(px(`type-${t.role}`), t.role).toBe(t.size)
      expect(px(`leading-${t.role}`), t.role).toBe(t.leading)
      expect(t.leading % 4).toBe(0)
      expect([400, 500]).toContain(t.weight)
    }
  })

  test("tracking closes up as type grows and opens a little at 11", () => {
    expect(trackingAt(20)).toBeLessThan(trackingAt(16))
    expect(trackingAt(16)).toBeLessThan(0)
    expect(trackingAt(13)).toBe(0)
    expect(trackingAt(11)).toBeGreaterThan(0)
  })

  test("prose stops at 64–68 characters", () => {
    expect(Number.parseFloat(MEASURE)).toBeGreaterThanOrEqual(64)
    expect(Number.parseFloat(MEASURE)).toBeLessThanOrEqual(68)
  })

  for (const [name, css] of Object.entries(SHEETS))
    test(`${name}: every size and weight is on the scale`, () => {
      const off: string[] = []
      for (const { property, value } of declarations(css)) {
        const v = value.replace(/!important$/, "")
        if (property === "font-size" && !SIZE.test(v) && v !== "inherit")
          off.push(`${property}:${v}`)
        if (property === "font" && v !== "inherit" && !SIZE.test(v)) off.push(`${property}:${v}`)
        if (
          property === "font-weight" &&
          !/^(var\(--(_k-weight(-label)?|kw-strong)\)|inherit)$/.test(v)
        )
          off.push(`${property}:${v}`)
      }
      expect(off).toEqual([])
    })
})

describe("space", () => {
  test("the roles are the page tokens, and from title up each doubles the last", () => {
    const tokens: Record<string, string> = {
      inside: "space-inside",
      sibling: "space-sibling",
      title: "space-title",
      group: "space-group",
      section: "space-section",
    }
    for (const s of SPACE) if (tokens[s.role]) expect(px(tokens[s.role]!), s.role).toBe(s.px)
    const from = SPACE.findIndex((s) => s.role === "title")
    for (let i = from + 1; i < SPACE.length; i++)
      expect(SPACE[i]!.px).toBeGreaterThanOrEqual(SPACE[i - 1]!.px * 2)
  })
})
