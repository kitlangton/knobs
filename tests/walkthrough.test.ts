import { describe, expect, test } from "vitest"
import {
  addNote,
  adjacentStep,
  ago,
  collectFeedback,
  type ContextEvent,
  describeMedia,
  digitChoice,
  EMPTY_STATE,
  feedbackMarkdown,
  formatTime,
  inkPath,
  inlineMarkdown,
  linkLabel,
  normalizeWalkthrough,
  parseAspect,
  pushContext,
  readState,
  recentContext,
  removeNote,
  resolveSrc,
  setFeedback,
  setNote,
  slug,
  statusLook,
  walkthroughProgress,
  type WalkNote,
  type WalkthroughDoc,
} from "../src/ui/walkthrough-model"

const doc: WalkthroughDoc = {
  id: "onboarding",
  title: "Onboarding audit",
  base: "media",
  meta: { branch: "dev" },
  updates: [
    { at: "2026-10-19T10:00:00Z", text: "Recorded the picker" },
    { at: "2026-10-19T12:00:00Z", text: "Re-encoded the videos", step: "1.2" },
    { at: "whenever", text: "No time" },
  ],
  qa: [
    { at: "2026-10-19T11:00:00Z", q: "Why 410?", a: "It's what the API sends", step: "context" },
  ],
  sections: [
    {
      title: "Refresh models globally",
      link: "https://github.com/anomalyco/opencode/pull/57148",
      status: "ready",
      steps: [
        {
          title: "Desktop model picker",
          media: { kind: "compare", before: "picker-before.mp4", after: "picker-after.mp4" },
        },
        { title: "Desktop model picker", media: "https://x.dev/shot.png" },
        { title: "Context", ask: "none", media: { kind: "text", text: "Just so you know" } },
        { title: "Old verdict step", ask: "verdict" },
      ],
    },
    {
      id: "copy",
      title: "Card copy",
      steps: [
        {
          title: "Which reads better?",
          options: [{ label: "Terse" }, { label: "Direct", suggested: true }],
        },
      ],
    },
  ],
}

describe("walkthrough document", () => {
  const w = normalizeWalkthrough(doc)
  test("ids come from titles, unique; keys, numbers and asks fill in", () => {
    expect(w.sections.map((s) => s.id)).toEqual(["refresh-models-globally", "copy"])
    expect(w.steps.map((s) => s.key)).toEqual([
      "refresh-models-globally/desktop-model-picker",
      "refresh-models-globally/desktop-model-picker-2",
      "refresh-models-globally/context",
      "refresh-models-globally/old-verdict-step",
      "copy/which-reads-better",
    ])
    expect(w.steps.map((s) => s.number)).toEqual(["1.1", "1.2", "1.3", "1.4", "2.1"])
    expect(w.steps.map((s) => s.ask)).toEqual(["note", "note", "none", "note", "pick"])
  })
  test("the feed: updates and answers newest first, steps resolved by key, id or number", () => {
    expect(w.feed.map((f) => [f.kind, f.text, f.step])).toEqual([
      ["update", "Re-encoded the videos", "refresh-models-globally/desktop-model-picker-2"],
      ["qa", "It's what the API sends", "refresh-models-globally/context"],
      ["update", "Recorded the picker", null],
      ["update", "No time", null],
    ])
    expect(w.feed[1]!.q).toBe("Why 410?")
    const now = Date.parse("2026-10-19T12:30:00Z")
    expect(ago(Date.parse("2026-10-19T12:00:00Z"), now)).toBe("30m ago")
    expect(ago(now - 10_000, now)).toBe("just now")
    expect(ago(now - 3 * 3600_000, now)).toBe("3h ago")
  })
  test("options are lettered; media resolve against base; bare URLs pick their kind", () => {
    expect(w.steps[4]!.options.map((o) => [o.id, o.letter, o.suggested])).toEqual([
      ["a", "A", false],
      ["b", "B", true],
    ])
    const cmp = w.steps[0]!.media[0]!
    expect(cmp.kind === "compare" && cmp.before.src).toBe("media/picker-before.mp4")
    expect(w.steps[1]!.media[0]).toEqual({ kind: "image", src: "https://x.dev/shot.png" })
    expect(normalizeWalkthrough({ ...doc, base: undefined }).steps[0]!.media[0]).toMatchObject({
      before: { src: "picker-before.mp4" },
    })
  })
  test("long titles cut at a word", () => {
    expect(
      slug("Refresh models globally, hide retired models, actionable retired-model card"),
    ).toBe("refresh-models-globally-hide-retired-models")
    expect(slug("Ünïcode & symbols!")).toBe("unicode-symbols")
  })
  test("links, meta, verdicts and statuses", () => {
    expect(w.sections[0]!.link).toEqual({
      href: "https://github.com/anomalyco/opencode/pull/57148",
      label: "#57148",
    })
    expect(linkLabel("https://example.com/docs/thing/")).toBe("thing")
    expect(w.meta).toEqual([{ label: "branch", value: "dev" }])
    expect(w.verdicts.map((v) => v.label)).toEqual(["Ship", "Change", "Unsure"])
    expect(statusLook("needs-taste")).toEqual({ label: "Needs taste", tone: "warn" })
    expect(statusLook("ready").tone).toBe("good")
  })
  test("sources and aspects", () => {
    expect(resolveSrc("a.mp4", "https://h/x")).toBe("https://h/x/a.mp4")
    expect(resolveSrc("./a.mp4", "dir/")).toBe("dir/a.mp4")
    expect(resolveSrc("/a.mp4", "dir")).toBe("/a.mp4")
    expect(resolveSrc("data:image/png;base64,x", "dir")).toBe("data:image/png;base64,x")
    expect(parseAspect("1100/900")).toBeCloseTo(1100 / 900)
    expect(parseAspect("16x9")).toBeCloseTo(16 / 9)
    expect(parseAspect(1.5)).toBe(1.5)
    expect(parseAspect("wide")).toBeUndefined()
  })
})

describe("walkthrough feedback", () => {
  const w = normalizeWalkthrough(doc)
  const [picker, shot, , old, copy] = w.steps.map((s) => s.key)
  const t0 = Date.parse("2026-10-19T12:00:00Z")
  const note = (over: Partial<WalkNote> = {}): WalkNote => ({
    id: "n1",
    step: picker!,
    at: t0,
    text: "make the\nbutton primary",
    context: {
      step: picker!,
      media: { kind: "compare", time: 4.2, loop: { start: 2, end: 6 }, mode: "side" },
      log: [
        { at: t0 - 12_000, what: "step", step: picker! },
        { at: t0 - 3_000, what: "seek", step: picker!, time: 4.2 },
      ],
    },
    ...over,
  })
  test("picks set and clear; empty steps drop", () => {
    let s = setFeedback(EMPTY_STATE, copy!, { pick: "a" })
    expect(s.steps[copy!]).toEqual({ pick: "a" })
    s = setFeedback(s, copy!, { pick: null })
    expect(s.steps[copy!]).toBeUndefined()
    expect(setNote(setNote(s, "hi"), "").note).toBeUndefined()
  })
  test("notes add only with something in them, and remove by id", () => {
    expect(addNote(EMPTY_STATE, note({ text: "  " }))).toBe(EMPTY_STATE)
    const s = addNote(EMPTY_STATE, note())
    expect(s.notes).toHaveLength(1)
    expect(
      addNote(EMPTY_STATE, note({ text: undefined, ink: { paths: ["M0 0L1 1"], aspect: 2 } }))
        .notes,
    ).toHaveLength(1)
    expect(removeNote(s, "n1").notes).toEqual([])
  })
  test("progress: a note, a pick or an older verdict answers a step", () => {
    let s = addNote(EMPTY_STATE, note())
    expect(walkthroughProgress(w, s)).toEqual({ done: 1, total: 4, next: shot })
    s = setFeedback(s, old!, { verdict: "ship" })
    s = setFeedback(s, copy!, { pick: "a" })
    s = addNote(s, note({ id: "n2", step: shot! }))
    expect(walkthroughProgress(w, s)).toEqual({ done: 4, total: 4, next: null })
  })
  test("digits pick in a taste test only; again clears", () => {
    const step = w.steps[4]!
    expect(digitChoice(step, undefined, "2")).toBe("b")
    expect(digitChoice(step, { pick: "b" }, "2")).toBeNull()
    expect(digitChoice(step, undefined, "3")).toBeUndefined()
    expect(digitChoice(w.steps[0]!, undefined, "1")).toBeUndefined()
  })
  test("j/k move between steps and stop at the ends", () => {
    const keys = ["a", "b", "c"]
    expect(adjacentStep(keys, null, 1)).toBe("a")
    expect(adjacentStep(keys, "b", 1)).toBe("c")
    expect(adjacentStep(keys, "c", 1)).toBe("c")
    expect(adjacentStep(keys, "a", -1)).toBe("a")
  })
  test("the context log: a scrub is one entry, it keeps the last few, a note takes the recent", () => {
    let log: ContextEvent[] = []
    log = pushContext(log, { at: 0, what: "step", step: "a" })
    log = pushContext(log, { at: 100, what: "seek", step: "a", time: 1 })
    log = pushContext(log, { at: 400, what: "seek", step: "a", time: 2 })
    expect(log.map((e) => e.time ?? e.what)).toEqual(["step", 2])
    log = pushContext(log, { at: 5000, what: "seek", step: "a", time: 3 })
    expect(log).toHaveLength(3)
    for (let i = 0; i < 50; i++) log = pushContext(log, { at: 6000 + i, what: "play", time: i })
    expect(log).toHaveLength(40)
    const many = [0, 10_000, 200_000, 205_000].map((at): ContextEvent => ({ at, what: "play" }))
    expect(recentContext(many, 210_000, 90_000, 1).map((e) => e.at)).toEqual([200_000, 205_000])
    expect(recentContext(many, 210_000, 90_000, 3)).toHaveLength(3)
  })
  test("times, ink paths and media in words", () => {
    expect(formatTime(4.24)).toBe("0:04.2")
    expect(formatTime(75)).toBe("1:15.0")
    expect(
      inkPath(
        [
          { x: 0, y: 0 },
          { x: 0.2, y: 0.2 },
          { x: 50, y: 25 },
          { x: 100, y: 50 },
        ],
        100,
        50,
      ),
    ).toBe("M0 0L0.5 0.5L1 1")
    expect(inkPath([], 10, 10)).toBe("")
    expect(
      describeMedia({
        kind: "compare",
        time: 4.2,
        loop: { start: 2, end: 6 },
        mode: "wipe",
        full: true,
      }),
    ).toBe("compare at 0:04.2, loop 0:02.0–0:06.0, wipe, full window")
    expect(describeMedia({ kind: "diff", file: "src/a.ts" })).toBe("diff src/a.ts")
    expect(
      describeMedia({ kind: "compare", time: 1, zoom: { u: 0.25, v: 0.1, w: 0.5, h: 0.5 } }),
    ).toBe("compare at 0:01.0, zoomed 2× at 25%, 10%")
  })
  test("collected for the agent, and as Markdown", () => {
    let s = addNote(EMPTY_STATE, note())
    s = addNote(s, note({ id: "n2", text: undefined, voice: { url: "blob:x", duration: 7 } }))
    s = addNote(
      s,
      note({ id: "n3", step: null, text: "Good batch", context: { step: null, log: [] } }),
    )
    s = setFeedback(s, copy!, { pick: "a" })
    s = setFeedback(s, old!, { verdict: "change" })
    const fb = collectFeedback(w, s)
    expect(fb).toMatchObject({ id: "onboarding", reviewed: 3, total: 4 })
    expect(fb.steps.map((x) => x.key)).toEqual([picker, shot, old, copy])
    expect(fb.steps[0]!.section).toBe("#57148 Refresh models globally")
    expect(fb.steps[0]!.notes[0]).toMatchObject({
      at: "2026-10-19T12:00:00.000Z",
      text: "make the\nbutton primary",
      media: { kind: "compare", time: 4.2 },
      log: [
        { what: "step", ago: 12 },
        { what: "seek", ago: 3, time: 4.2 },
      ],
    })
    expect(fb.steps[3]).toMatchObject({ pick: "a", pickLabel: "A: Terse", suggested: "B: Direct" })
    expect(fb.general.map((n) => n.text)).toEqual(["Good batch"])
    const md = feedbackMarkdown(fb, w.verdicts)
    expect(md).toContain("3 of 4 reviewed")
    expect(md).toContain("### General\n- “Good batch”")
    expect(md).toContain("- 1.1 Desktop model picker: 2 notes")
    expect(md).toContain(
      "  - “make the button primary” · compare at 0:04.2, loop 0:02.0–0:06.0, side",
    )
    expect(md).toContain("  - voice note 0:07.0 (blob:x) · compare at 0:04.2")
    expect(md).toContain("- 1.2 Desktop model picker: _open_")
    expect(md).toContain("- 1.4 Old verdict step: **Change**")
    expect(md).toContain("**Picked A: Terse** (suggested B: Direct)")
  })
  test("saved state reads back defensively", () => {
    expect(readState(null)).toEqual(EMPTY_STATE)
    expect(readState("{not json")).toEqual(EMPTY_STATE)
    expect(
      readState(
        JSON.stringify({
          steps: { a: { verdict: "ship", pick: 3 }, b: "x", c: {} },
          note: 1,
          notes: [note(), { id: "bad" }, note({ id: "empty", text: "" })],
        }),
      ),
    ).toEqual({ steps: { a: { verdict: "ship" } }, notes: [note()] })
  })
})

describe("walkthrough prose", () => {
  test("inline Markdown, escaped", () => {
    expect(inlineMarkdown("Before = `dev` <b>x</b>")).toBe(
      "Before = <code>dev</code> &lt;b&gt;x&lt;/b&gt;",
    )
    expect(inlineMarkdown("a **Pick another model** b")).toBe("a <b>Pick another model</b> b")
    expect(inlineMarkdown("[PR](https://github.com/x?a=1&b=2)")).toBe(
      '<a href="https://github.com/x?a=1&amp;b=2" target="_blank" rel="noreferrer">PR</a>',
    )
    expect(inlineMarkdown("[bad](javascript:alert(1))")).not.toContain("<a")
    expect(inlineMarkdown("`<script>`")).toBe("<code>&lt;script&gt;</code>")
  })
})
