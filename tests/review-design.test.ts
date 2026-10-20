// The review pieces' design system, held to its own rules: one type scale on a 4 px baseline, two
// weights, space roles that double, and stylesheets that read only those.
import { describe, expect, test } from "vitest"
import { MEASURE, SPACE, TYPE, trackingAt } from "../src/review/foundations"
import { TOKEN_BY_NAME, type TokenName } from "../src/tokens/schema"
import { compareCss } from "../src/ui/compare-css"
import { diffCss } from "../src/ui/diff-css"
import { historyCss } from "../src/ui/history-css"
import { playerCss } from "../src/ui/player-css"
import { walkthroughCss } from "../src/ui/walkthrough-css"
import { fillFacts, fillMedia, optionColumns } from "../src/ui/walkthrough-model"

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

const SHEETS = {
  walkthrough: walkthroughCss,
  compare: compareCss,
  player: playerCss,
  diff: diffCss,
  history: historyCss,
}
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

/** Each rule's selector and body, comments dropped. */
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.trim(),
    body: m[2]!,
  }))

describe("the hand", () => {
  for (const [name, css] of Object.entries(SHEETS)) {
    test(`${name}: the arrow, never a hand`, () => {
      expect(
        declarations(css).filter((d) => d.property === "cursor" && /pointer|grab/.test(d.value)),
      ).toEqual([])
    })

    test(`${name}: a hover's background or colour lands at once and eases out`, () => {
      const off: string[] = []
      for (const { selector, body } of rules(css)) {
        const hover = /:hover|\[data-hover\]/.test(selector.replace(/:not\([^)]*\)/g, ""))
        const paints =
          /(?:^|;)\s*(background(?:-color|-image)?|color|text-decoration-color)\s*:/.test(body)
        if (
          hover &&
          paints &&
          !/transition-duration:calc\(var\(--_k-hover-in\) \* 1ms\)/.test(body)
        )
          off.push(selector)
        for (const m of body.matchAll(/transition:([^;]+)/g))
          for (const part of m[1]!.split(/,(?![^(]*\))/))
            if (
              /^\s*(background|color)\b/.test(part) &&
              /(?<!\*\s*)(?<![\w.-])(?:\d+\.?\d*|\.\d+)m?s\b/.test(part)
            )
              off.push(`${selector} → ${part.trim()}`)
      }
      expect(off).toEqual([])
    })
  }
})

describe("edges", () => {
  // A box is a fill or a hairline, never both: only the card itself (cards mode) and what floats
  // over the page (the notes bar, its launcher, the back button, a step opened full) are surfaces.
  const SURFACES = [
    ".knobs-wt-step",
    ":where(.knobs-ui) .knobs-wt-launch",
    ".knobs-wt-notebar",
    ".knobs-ui .knobs-wt-back",
    ".knobs-wt-step[data-full]",
  ]
  test("walkthrough: nothing on the page has both a fill and a ring", () => {
    const both: string[] = []
    for (const m of walkthroughCss
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const fill = /(?:^|;)\s*background(?:-color)?:\s*([^;]+)/.exec(m[2]!)?.[1]?.trim()
      const ring = /box-shadow:[^;]*(inset 0 0 0 1px|--_ku-pane-ring|--kw-card-ring)/.test(m[2]!)
      const selector = m[1]!.trim()
      if (fill && fill !== "transparent" && fill !== "none" && ring && !SURFACES.includes(selector))
        both.push(selector)
    }
    expect(both).toEqual([])
  })
})

describe("facts", () => {
  test("a record or a list, code split into chips, values always a list", () => {
    expect(fillFacts({ Sees: "Two rows", Steps: ["One", "Two"] })).toEqual([
      { term: "Sees", value: ["Two rows"], code: false },
      { term: "Steps", value: ["One", "Two"], code: false },
    ])
    expect(fillFacts([{ term: "Evidence", value: "a.tsx:8-11, b.ts:742", code: true }])).toEqual([
      { term: "Evidence", value: ["a.tsx:8-11", "b.ts:742"], code: true },
    ])
  })

  test("the media kind: its run first, then its groups; filling again changes nothing", () => {
    const m = fillMedia({
      kind: "facts",
      title: "Compared",
      facts: { A: "1" },
      groups: [{ title: "v2 TUI", facts: [{ term: "Evidence", value: "x.ts, y.ts", code: true }] }],
    })
    expect(m).toEqual({
      kind: "facts",
      title: "Compared",
      groups: [
        { facts: [{ term: "A", value: ["1"], code: false }] },
        { title: "v2 TUI", facts: [{ term: "Evidence", value: ["x.ts", "y.ts"], code: true }] },
      ],
    })
    expect(fillMedia(m)).toEqual(m)
  })
})

describe("decision", () => {
  test("numbers its options, keeps their ids unique, and puts pros and cons last as facts", () => {
    const m = fillMedia({
      kind: "decision",
      options: [
        { title: "One row", recommended: true, facts: { Size: "~30 lines" }, pros: ["Simple"] },
        { title: "One row", cons: ["Two rows", "Drift"], media: "a.png" },
      ],
    })
    if (m.kind !== "decision") throw new Error("not a decision")
    expect(m.options.map((o) => [o.id, o.number, o.recommended])).toEqual([
      ["one-row", "Option 1", true],
      ["one-row-2", "Option 2", false],
    ])
    expect(m.options[0]!.facts.map((f) => f.term)).toEqual(["Size", "For"])
    expect(m.options[1]!.facts).toEqual([
      { term: "Against", value: ["Two rows", "Drift"], code: false },
    ])
    expect(m.options[1]!.media).toEqual({ kind: "image", src: "a.png" })
    expect(fillMedia(m)).toEqual(m)
  })

  test("sits side by side only in whole rows, as many as fit at 280 px", () => {
    expect(optionColumns(4, 1400)).toBe(4)
    expect(optionColumns(4, 960)).toBe(2)
    expect(optionColumns(4, 500)).toBe(1)
    expect(optionColumns(3, 960)).toBe(3)
    expect(optionColumns(3, 700)).toBe(1)
    expect(optionColumns(2, 700)).toBe(2)
    expect(optionColumns(5, 2000)).toBe(1)
    expect(optionColumns(6, 960)).toBe(3)
  })
})
