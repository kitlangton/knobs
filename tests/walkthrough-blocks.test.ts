// The walkthrough's history, stack, table and chaptered video, filled in from the shapes an agent
// (or a page that built them as mounts first) writes.
import { describe, expect, test } from "vitest"
import {
  chapterAt,
  clock,
  collectFeedback,
  describeMedia,
  feedbackMarkdown,
  fillMedia,
  findStep,
  normalizeWalkthrough,
  parseBranch,
  parseDelta,
  stackLayout,
  type WalkMedia,
  type WalkthroughDoc,
  type WalkthroughMedia,
  type WalkthroughStackItem,
} from "../src/ui/walkthrough-model"

const filled = <K extends WalkMedia["kind"]>(m: WalkthroughMedia, kind: K) => {
  const f = fillMedia(m, "media")
  if (f.kind !== kind) throw new Error(`expected ${kind}, got ${f.kind}`)
  // Filling again changes nothing.
  expect(fillMedia(f)).toEqual(f)
  return f as Extract<WalkMedia, { kind: K }>
}

describe("history", () => {
  test("groups take rows as events; bare events come first as a group of their own", () => {
    const h = filled(
      {
        kind: "history",
        events: [{ date: "Oct 20", title: "Audit #3" }],
        groups: [
          {
            heading: "Phase 1",
            summary: "Apr 9 – Jun 2",
            rows: [
              {
                date: "Apr 9, 2026",
                title: "Shipped",
                tone: "good",
                provenance: "verified",
                source: "git",
                evidence: [{ label: "#21583", href: "https://github.com/x/pull/21583" }],
              },
            ],
          },
          { heading: "Empty" },
        ],
      },
      "history",
    )
    const groups = h.data.groups!
    expect(groups.map((g) => [g.heading, g.events?.length])).toEqual([
      [undefined, 1],
      ["Phase 1", 1],
      ["Empty", 0],
    ])
    expect(groups[1]!.events![0]).toMatchObject({ provenance: "verified", source: "git" })
  })

  test("the lanes shape passes through to history() as written", () => {
    const h = filled(
      {
        kind: "history",
        label: "Install paths",
        lanes: [{ id: "web", label: "Website", spans: [{ from: "2026-09-19", state: "broken" }] }],
        events: [{ date: "2026-07-20", title: "retry.ts deleted", lane: "web", type: "deletion" }],
        states: { broken: { tone: "bad" } },
      },
      "history",
    )
    expect(h.label).toBe("Install paths")
    expect(h.data.groups).toBeUndefined()
    expect(h.data.lanes?.[0]?.id).toBe("web")
    expect(h.data.events?.[0]?.lane).toBe("web")
  })
})

describe("stack", () => {
  const item = (pr: string, branch: string, over: Partial<WalkthroughStackItem> = {}) => ({
    pr,
    title: pr,
    branch,
    ...over,
  })

  test("branches, deltas, PR numbers and stepId fill in", () => {
    expect(parseBranch("models-dev-refresh → dev")).toEqual({
      head: "models-dev-refresh",
      base: "dev",
    })
    expect(parseBranch("a->b")).toEqual({ head: "a", base: "b" })
    expect(parseBranch("just-head")).toEqual({ head: "just-head" })
    expect(parseDelta("+164 / -18")).toEqual({ add: 164, del: 18 })
    expect(parseDelta("+1,204 −3")).toEqual({ add: 1204, del: 3 })
    expect(parseDelta({ add: 2, del: 1 })).toEqual({ add: 2, del: 1 })
    expect(parseDelta("huge")).toBe("huge")
    const s = filled(
      {
        kind: "stack",
        items: [
          item("57148", "models-dev-refresh → dev", { stepId: "fix-57148", delta: "+164 / -18" }),
          { pr: 57151, title: "b", head: "free-first", base: "dev", order: 2 },
        ],
      },
      "stack",
    )
    expect(s.items[0]).toEqual({
      pr: "#57148",
      title: "57148",
      head: "models-dev-refresh",
      base: "dev",
      delta: { add: 164, del: 18 },
      step: "fix-57148",
    })
    expect(s.items[1]).toMatchObject({ pr: "#57151", head: "free-first", order: "2" })
  })

  test("topology: a 3-deep stack hangs under its base, rails pass beside it", () => {
    // The onboarding page's fixes: five on dev, then a stack of four.
    const s = filled(
      {
        kind: "stack",
        items: [
          item("#1", "a → dev"),
          item("#2", "b → dev"),
          item("#6", "card → dev"),
          item("#7", "desktop → card"),
          item("#8", "notice → card"),
          item("#9", "modal → notice"),
        ],
      },
      "stack",
    )
    const l = stackLayout(s)
    expect(l.trunk).toBe("dev")
    expect(l.flat).toBe(false)
    expect(l.rows.map((r) => [r.item.pr, r.depth, r.parent, r.last, r.rails, r.children])).toEqual([
      ["#1", 0, null, false, [], 0],
      ["#2", 0, null, false, [], 0],
      ["#6", 0, null, true, [], 2],
      ["#7", 1, 2, false, [false], 0],
      ["#8", 1, 2, true, [false], 1],
      ["#9", 2, 4, true, [false, false], 0],
    ])
  })

  test("an item written before its base still hangs under it; an unknown base sits on the trunk", () => {
    const l = stackLayout(
      filled(
        {
          kind: "stack",
          base: "dev",
          items: [
            item("#2", "child → parent"),
            item("#1", "parent → dev"),
            item("#3", "other → release-1.4"),
            item("#4", "loose"),
          ],
        },
        "stack",
      ),
    )
    expect(l.rows.map((r) => [r.item.pr, r.depth, r.rails, r.offBase])).toEqual([
      ["#1", 0, [], undefined],
      ["#2", 1, [true], undefined],
      ["#3", 0, [], "release-1.4"],
      ["#4", 0, [], undefined],
    ])
  })

  test("the trunk is the base most items merge into; no branches at all is a flat list", () => {
    const l = stackLayout(
      filled(
        {
          kind: "stack",
          items: [item("#1", "a → main"), item("#2", "b → main"), item("#3", "c → x")],
        },
        "stack",
      ),
    )
    expect(l.trunk).toBe("main")
    expect(l.rows[2]!.offBase).toBe("x")
    const flat = stackLayout(filled({ kind: "stack", items: [{ pr: 1, title: "a" }] }, "stack"))
    expect(flat).toMatchObject({ trunk: null, flat: true })
  })

  test("a loop of items stacked on each other breaks at the first written", () => {
    const l = stackLayout(
      filled({ kind: "stack", items: [item("#1", "a → b"), item("#2", "b → a")] }, "stack"),
    )
    expect(l.rows.map((r) => [r.item.pr, r.depth])).toEqual([
      ["#1", 0],
      ["#2", 1],
    ])
  })
})

describe("table", () => {
  test("{ cells } rows unwrap, cells become objects, number columns align right", () => {
    const t = filled(
      {
        kind: "table",
        caption: "Channels",
        columns: [
          { key: "channel", label: "Channel", mono: true },
          { key: "days", label: "Days" },
          { key: "state", label: "State", align: "center" },
        ],
        rows: [
          {
            cells: {
              channel: { text: "brew", code: true },
              days: 31,
              state: { text: "Broken", badge: "bad" },
            },
          },
          { channel: "npm", days: { text: 39, step: "1.2" } },
        ],
      },
      "table",
    )
    expect(t.columns.map((c) => c.align)).toEqual(["left", "right", "center"])
    expect(t.rows).toEqual([
      {
        channel: { text: "brew", code: true },
        days: { text: "31" },
        state: { text: "Broken", badge: "bad" },
      },
      { channel: { text: "npm" }, days: { text: "39", step: "1.2" } },
    ])
  })

  test("a column keyed cells is a column, not a wrapper", () => {
    const t = filled(
      { kind: "table", columns: [{ key: "cells", label: "Cells" }], rows: [{ cells: "12 of 14" }] },
      "table",
    )
    expect(t.rows).toEqual([{ cells: { text: "12 of 14" } }])
  })
})

describe("chapters", () => {
  const chapters = [
    { id: "scorecard", label: "Scorecard", start: 0, duration: 9.57 },
    { id: "today", label: "Today (broken)", start: 9.57, duration: 25.81 },
    { label: "After", start: 35.38 },
    { label: "Risk", start: 102.12 },
  ]

  test("captionsSrc reads as captions; chapters get ids and ends", () => {
    const v = filled(
      { kind: "video", src: "journey.mp4", captionsSrc: "captions.vtt", chapters },
      "video",
    )
    expect(v.src).toBe("media/journey.mp4")
    expect(v.captions).toBe("media/captions.vtt")
    expect("captionsSrc" in v).toBe(false)
    expect(v.chapters!.map((c) => [c.id, c.start, c.end])).toEqual([
      ["scorecard", 0, 9.57],
      ["today", 9.57, 35.38],
      ["after", 35.38, 102.12],
      ["risk", 102.12, undefined],
    ])
  })

  test("the chapter at a time", () => {
    const c = filled({ kind: "video", src: "v.mp4", chapters }, "video").chapters!
    expect(chapterAt(c, 0)).toBe(0)
    expect(chapterAt(c, 9.56)).toBe(0)
    expect(chapterAt(c, 9.57)).toBe(1)
    expect(chapterAt(c, 500)).toBe(3)
    expect(chapterAt(c.slice(0, 2), 40)).toBe(-1)
    expect(clock(75.9)).toBe("1:15")
    expect(clock(3725)).toBe("1:02:05")
  })

  test("compares take chapters too", () => {
    const c = filled({ kind: "compare", before: "a.mp4", after: "b.mp4", chapters }, "compare")
    expect(c.chapters).toHaveLength(4)
  })

  test("a note's media context names its chapter", () => {
    const doc: WalkthroughDoc = {
      id: "x",
      title: "X",
      sections: [
        {
          title: "S",
          steps: [{ title: "Journey", media: { kind: "video", src: "v.mp4", chapters } }],
        },
      ],
    }
    const w = normalizeWalkthrough(doc)
    const key = w.steps[0]!.key
    const media = { kind: "video", time: 12, chapter: "Today (broken)" }
    expect(describeMedia(media)).toBe("video at 0:12.0 in “Today (broken)”")
    const fb = collectFeedback(w, {
      steps: {},
      notes: [{ id: "n", step: key, at: 1, text: "hm", context: { step: key, media, log: [] } }],
    })
    expect(fb.steps[0]!.notes[0]!.media).toMatchObject({ chapter: "Today (broken)" })
    expect(feedbackMarkdown(fb)).toContain("in “Today (broken)”")
  })
})

describe("steps named from media", () => {
  const w = normalizeWalkthrough({
    id: "x",
    title: "X",
    sections: [
      { id: "fixes", title: "Fixes", steps: [{ id: "fix-57148", title: "A" }, { title: "B" }] },
    ],
  })
  test("by key, id, number or #id", () => {
    expect(findStep(w.steps, "fixes/fix-57148")?.number).toBe("1.1")
    expect(findStep(w.steps, "fix-57148")?.key).toBe("fixes/fix-57148")
    expect(findStep(w.steps, "#fix-57148")?.key).toBe("fixes/fix-57148")
    expect(findStep(w.steps, "1.2")?.id).toBe("b")
    expect(findStep(w.steps, "nope")).toBeUndefined()
  })
})
