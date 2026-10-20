// The walkthrough on the page tokens: section kickers ("PR 2 of 5"), steps that aren't numbered on
// screen but still answer to "1.2", tables that stack where they're too narrow, the note bar's
// reserve, Markdown titles, folded media and the feed's context.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { rootCss } from "../src/core/root"
import { TOKEN_BY_NAME, TOKENS, type TokenDef } from "../src/tokens/schema"
import {
  fillMedia,
  findStep,
  isPullRequest,
  normalizeWalkthrough,
  noteBarReserve,
  plainMarkdown,
  tableStacks,
  type WalkthroughDoc,
  type WalkthroughSection,
} from "../src/ui/walkthrough-model"

const pr = (n: number) => `https://github.com/anomalyco/opencode/pull/${n}`
const section = (title: string, extra: Partial<WalkthroughSection> = {}): WalkthroughSection => ({
  title,
  steps: [{ title: `${title} step one` }, { title: `${title} step two` }],
  ...extra,
})
const page = (sections: WalkthroughSection[]) =>
  normalizeWalkthrough({ id: "t", title: "T", sections } satisfies WalkthroughDoc)

describe("section kickers", () => {
  test("number the sections that link a pull request, counted among them", () => {
    const p = page([
      section("Intro"),
      section("Models", { link: pr(57148) }),
      section("Everything", { link: "https://github.com/anomalyco/opencode/pulls?q=is%3Apr" }),
      section("Connect", { link: { href: `${pr(57155)}/files`, label: "Go sign-in" } }),
      section("Issue", { link: "https://github.com/anomalyco/opencode/issues/12" }),
    ])
    expect(p.sections.map((s) => s.kicker)).toEqual([
      undefined,
      "PR 1 of 2",
      undefined,
      "PR 2 of 2",
      undefined,
    ])
  })

  test("an explicit kicker wins, and false hides it, without renumbering the rest", () => {
    const p = page([
      section("A", { link: pr(1) }),
      section("B", { link: pr(2), kicker: "Stack 2/4" }),
      section("C", { link: pr(3), kicker: false }),
      section("D", { link: pr(4) }),
      section("Notes", { kicker: "  Part 5  " }),
      section("Blank", { kicker: "  " }),
    ])
    expect(p.sections.map((s) => s.kicker)).toEqual([
      "PR 1 of 4",
      "Stack 2/4",
      undefined,
      "PR 4 of 4",
      "Part 5",
      undefined,
    ])
  })

  test("pull and merge requests are recognised by their path", () => {
    expect(isPullRequest(pr(57148))).toBe(true)
    expect(isPullRequest(`${pr(57148)}#discussion`)).toBe(true)
    expect(isPullRequest("https://gitlab.com/g/p/-/merge_requests/9")).toBe(true)
    expect(isPullRequest("https://github.com/a/b/pulls")).toBe(false)
    expect(isPullRequest("https://github.com/a/b/issues/3")).toBe(false)
  })
})

describe("steps without numbers on screen", () => {
  const p = page([section("One", { link: pr(1) }), section("Two")])

  test("still answer to their number, id and key", () => {
    expect(p.steps.map((s) => s.number)).toEqual(["1.1", "1.2", "2.1", "2.2"])
    expect(findStep(p.steps, "1.2")?.title).toBe("One step two")
    expect(findStep(p.steps, "#2.1")?.title).toBe("Two step one")
    expect(findStep(p.steps, "two-step-two")?.key).toBe("two/two-step-two")
  })

  test("the page draws no step number anywhere", () => {
    for (const file of ["walkthrough.ts", "walkthrough-blocks.ts", "walkthrough-media.ts"]) {
      const src = readFileSync(resolve(import.meta.dirname, "../src/ui", file), "utf8")
      expect(src, file).not.toMatch(/\.number\b/)
    }
  })

  test("titles take inline Markdown, and the contents read them as plain words", () => {
    expect(plainMarkdown("[#57148](https://x.y/pull/57148) · Broadcast `models.dev` **now**")).toBe(
      "#57148 · Broadcast models.dev now",
    )
    expect(plainMarkdown("  a *b*\n c ")).toBe("a b c")
  })
})

describe("step media", () => {
  test("sit one under another unless the step asks for columns; more folds the rest", () => {
    const p = normalizeWalkthrough({
      id: "m",
      title: "M",
      sections: [
        {
          title: "S",
          steps: [
            { title: "Default", media: ["a.mp4", "b.mp4"] },
            { title: "Two up", media: ["a.mp4", "b.mp4"], columns: 2 },
            { title: "Folded", media: ["a.mp4", "b.mp4", "c.png"], more: " More clips " },
            { title: "Nothing to fold", media: "a.mp4", more: "More" },
          ],
        },
      ],
    })
    expect(p.steps.map((s) => s.columns)).toEqual([1, 2, 1, 1])
    expect(p.steps.map((s) => s.more)).toEqual([undefined, undefined, "More clips", undefined])
  })
})

describe("table stacking", () => {
  const table = fillMedia({
    kind: "table",
    columns: [
      { key: "channel", label: "Entry point", mono: true },
      { key: "state", label: "State" },
    ],
    rows: [{ channel: "npm i -g x", state: { text: "Broken", badge: "bad" } }],
  })

  test("defaults to auto, titled by the first column, and fills idempotently", () => {
    if (table.kind !== "table") throw new Error("not a table")
    expect(table.stack).toBe("auto")
    expect(table.primary).toBe("channel")
    expect(fillMedia(table)).toEqual(table)
    const named = fillMedia({ ...table, primary: "state", stack: "never" })
    expect(named.kind === "table" && [named.primary, named.stack]).toEqual(["state", "never"])
    const unknown = fillMedia({ ...table, primary: "nope" })
    expect(unknown.kind === "table" && unknown.primary).toBe("channel")
  })

  test("stacks where the room is less than the columns' natural width", () => {
    expect(tableStacks("auto", 600, 880)).toBe(true)
    expect(tableStacks("auto", 1100, 880)).toBe(false)
    expect(tableStacks("auto", 880, 880.5)).toBe(false)
    // Not laid out yet: draw the table.
    expect(tableStacks("auto", 0, 880)).toBe(false)
    expect(tableStacks("always", 2000, 100)).toBe(true)
    expect(tableStacks("never", 100, 2000)).toBe(false)
  })
})

describe("the note bar's reserve", () => {
  test("is its height and the gaps around it, whole pixels", () => {
    expect(noteBarReserve(52, 12, 12)).toBe(76)
    expect(noteBarReserve(51.2, 12, 12)).toBe(76)
    expect(noteBarReserve(32, 12, 12)).toBe(56)
    expect(noteBarReserve(-4, 12, 12)).toBe(24)
  })
})

describe("the feed", () => {
  test("keeps an item's status and its context trail", () => {
    const p = normalizeWalkthrough({
      id: "f",
      title: "F",
      updates: [{ at: "2026-10-20T10:00:00Z", text: "Did a thing", status: " shipped " }],
      qa: [
        {
          at: "2026-10-20T11:00:00Z",
          q: "Why?",
          a: "Because.",
          trail: ["0:04 · Played the compare", "", "0:09 · Paused"],
        },
      ],
      sections: [section("S")],
    })
    expect(p.feed.map((f) => [f.kind, f.status, f.trail])).toEqual([
      ["qa", undefined, ["0:04 · Played the compare", "0:09 · Paused"]],
      ["update", "shipped", []],
    ])
  })
})

describe("page tokens", () => {
  const len = (name: string) => {
    const t = TOKEN_BY_NAME.get(name as never) as TokenDef | undefined
    if (!t) throw new Error(`no ${name}`)
    return t
  }

  test("space roles on the 4px unit, each doubling the last from title up", () => {
    const units = {
      "space-inside": 1,
      "space-sibling": 2,
      "space-title": 3,
      "space-group": 12,
      "space-section": 24,
      "space-column": 6,
      "pad-page": 6,
      "pad-card": 3,
    }
    for (const [name, n] of Object.entries(units)) {
      const t = len(name)
      expect(t.tier).toBe("semantic")
      const css = "css" in t.source ? t.source.css : ""
      expect(css === "var(--k-unit)" ? 1 : Number(/\* (\d+)\)$/.exec(css)?.[1])).toBe(n)
    }
    expect(rootCss).toContain(
      "@media(max-width:639.98px){:where(.knobs-root){--_k-pad-page:var(--k-pad-page,calc(var(--_k-unit) * 4))}}",
    )
  })

  test("five type sizes with their line heights", () => {
    const pairs = [
      ["heading", "20px", "28px"],
      ["title", "16px", "24px"],
      ["body", "13px", "20px"],
      ["label", "12px", "16px"],
      ["small", "11px", "16px"],
    ] as const
    for (const [role, size, line] of pairs) {
      expect(len(`type-${role}`).source).toEqual({ value: size })
      expect(len(`leading-${role}`).source).toEqual({ value: line })
    }
  })

  test("don't scale with density (it sizes a panel's controls, not a page's rhythm)", () => {
    for (const t of TOKENS as readonly TokenDef[]) {
      if (!/^(space-|pad-page|pad-card|type-|leading-)/.test(t.name)) continue
      const src = "css" in t.source ? t.source.css : "value" in t.source ? t.source.value : ""
      expect(src, t.name).not.toContain("density")
    }
  })
})
