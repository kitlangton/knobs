// The walkthrough on the page tokens: section kickers ("PR 2 of 5"), steps that aren't numbered on
// screen but still answer to "1.2", tables that stack where they're too narrow, the note bar's
// reserve, Markdown titles, folded media and the feed's context.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { rootCss } from "../src/core/root"
import { TOKEN_BY_NAME, TOKENS, type TokenDef } from "../src/tokens/schema"
import { placeMark, showsAt } from "../src/ui/walkthrough-annotations"
import { prStatus } from "../src/ui/walkthrough-blocks"
import {
  fillMedia,
  findStep,
  isPullRequest,
  normalizeWalkthrough,
  noteBarReserve,
  plainMarkdown,
  findPR,
  prNumber,
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

  test("a doc's noun numbers every section; false numbers none", () => {
    const sections = [
      section("Intro"),
      section("Models", { link: pr(57148) }),
      section("Aside", { kicker: "Interlude" }),
      section("Hidden", { kicker: false }),
    ]
    const of = (kickers: WalkthroughDoc["kickers"]) =>
      normalizeWalkthrough({ id: "t", title: "T", kickers, sections }).sections.map((s) => s.kicker)
    expect(of({ noun: "Part" })).toEqual(["Part 1 of 4", "Part 2 of 4", "Interlude", undefined])
    expect(of(false)).toEqual([undefined, undefined, "Interlude", undefined])
    expect(of("pr")).toEqual([undefined, "PR 1 of 1", "Interlude", undefined])
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

describe("step media and more", () => {
  test("media sit one under another unless the step asks for columns", () => {
    const p = normalizeWalkthrough({
      id: "m",
      title: "M",
      sections: [
        {
          title: "S",
          steps: [
            { title: "Default", media: ["a.mp4", "b.mp4"] },
            { title: "Two up", media: ["a.mp4", "b.mp4"], columns: 2 },
          ],
        },
      ],
    })
    expect(p.steps.map((s) => s.columns)).toEqual([1, 2])
  })

  test("more is the rest of the words, on a step, a section and the page", () => {
    const p = normalizeWalkthrough({
      id: "m",
      title: "M",
      summary: "Short.",
      more: " The page's rest. ",
      sections: [
        {
          title: "S",
          summary: "One line.",
          more: "The section's rest.",
          steps: [
            { title: "Claim", caption: "One sentence.", more: "First.\n\nSecond." },
            { title: "Bare", more: "  " },
          ],
        },
      ],
    })
    expect(p.more).toBe("The page's rest.")
    expect(p.sections[0]!.more).toBe("The section's rest.")
    expect(p.steps.map((s) => s.more)).toEqual(["First.\n\nSecond.", undefined])
  })
})

describe("pull requests", () => {
  test("are known from section links, the doc's prs and its repo", () => {
    const p = normalizeWalkthrough({
      id: "p",
      title: "P",
      repo: "https://github.com/anomalyco/opencode/",
      prs: { "#57148": { state: "merged", title: "Catalog refresh" }, "57151": { state: "draft" } },
      sections: [section("Models", { link: `${pr(57148)}/files` })],
    })
    expect(p.repo).toBe("anomalyco/opencode")
    expect(p.prs["57148"]).toEqual({ href: pr(57148), state: "merged", title: "Catalog refresh" })
    expect(p.prs["57151"]).toEqual({ state: "draft", href: pr(57151) })
    expect(findPR(p.prs, "40000", p.repo)).toEqual({ href: pr(40000) })
    expect(findPR(p.prs, "40000")).toBeNull()
    expect(prNumber(`${pr(9)}#x`)).toBe("9")
    expect(prNumber("https://github.com/a/b/issues/9")).toBeNull()
  })

  test("take their state from prs, then the page's stacks, then the section linking them", () => {
    const p = normalizeWalkthrough({
      id: "p",
      title: "P",
      prs: { "57148": { state: "merged" } },
      sections: [
        section("Fix", { link: pr(57151), status: "draft" }),
        section("Stack", {
          steps: [
            {
              title: "The stack",
              media: {
                kind: "stack",
                items: [
                  { pr: 57148, title: "A", branch: "a → dev", status: "Draft" },
                  {
                    pr: 57158,
                    title: "Serve v2",
                    branch: "b → dev",
                    status: "Open · CI green",
                    tone: "warn",
                  },
                  { pr: 57151, title: "Models", branch: "c → dev", status: "Merged" },
                ],
              },
            },
          ],
        }),
      ],
    })
    expect(p.prs["57148"]?.state).toBe("merged")
    expect(p.prs["57158"]).toMatchObject({ state: "open", checks: true, title: "Serve v2" })
    expect(p.prs["57151"]).toMatchObject({ state: "merged", title: "Models", href: pr(57151) })
    // An issue: its own link from the repo, never a pull request's state.
    expect(findPR(p.prs, "57148", "a/b", "issue")).toEqual({
      kind: "issue",
      href: "https://github.com/a/b/issues/57148",
    })
    expect(findPR({}, "12", undefined, "issue")).toEqual({ kind: "issue" })
  })
})

describe("layout", () => {
  test("goes to one column where it's narrow, whatever side the rail is on", () => {
    const css = readFileSync(resolve(import.meta.dirname, "../src/ui/walkthrough-css.ts"), "utf8")
    // As specific as the rail-side rules ([data-rail="right"]) and after them, so it wins.
    expect(css).toMatch(
      /@container knobs-wt \(max-width:960px\)\{\.knobs-walkthrough\[data-rail\] \.knobs-wt-layout\{grid-template-columns:minmax\(0,1fr\)/,
    )
    const src = readFileSync(resolve(import.meta.dirname, "../src/ui/walkthrough.ts"), "utf8")
    expect(src).toMatch(
      /root\.dataset\.rail =\s+options\.rail === false \? "none" : options\.rail === "right" \? "right" : "left"/,
    )
  })
})

describe("annotations", () => {
  const rect = { x: 10, y: 20, w: 200, h: 100 }
  test("sit in 0–1 of the picture, through a zoom, and leave when out of view", () => {
    expect(placeMark({ x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, rect)).toEqual({
      x: 110,
      y: 70,
      w: 50,
      h: 50,
    })
    // Zoomed 2× into the top-left quarter: the point at .25, .25 lands in the middle.
    expect(placeMark({ x: 0.25, y: 0.25 }, rect, { u: 0, v: 0, w: 0.5, h: 0.5 })).toEqual({
      x: 110,
      y: 70,
      w: 0,
      h: 0,
    })
    expect(placeMark({ x: 0.9, y: 0.9 }, rect, { u: 0, v: 0, w: 0.5, h: 0.5 })).toBeNull()
  })
  test("show only within their times, on media that has a time", () => {
    const a = { x: 0, y: 0, at: [2, 4] as const }
    expect([1, 2, 3, 4, 5].map((t) => showsAt(a, t))).toEqual([false, true, true, true, false])
    expect(showsAt(a, undefined)).toBe(true)
    expect(showsAt({ x: 0, y: 0 }, 9)).toBe(true)
  })
})

describe("a stack row's PR state", () => {
  test("comes from the status's first word, never its tone; checks are their own", () => {
    expect(prStatus("Draft · Green")).toEqual({ state: "draft", checks: true })
    expect(prStatus("merged")).toEqual({ state: "merged", checks: false })
    expect(prStatus("OPEN, CI passing")).toEqual({ state: "open", checks: true })
    expect(prStatus("Closed")).toEqual({ state: "closed", checks: false })
    expect(prStatus("Stacked on #57146")).toEqual({ state: null, checks: false })
    expect(prStatus("Ready · CI green").state).toBeNull()
    expect(prStatus(undefined).state).toBeNull()
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
