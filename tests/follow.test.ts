import { describe, expect, test } from "vitest"
import { anyChanged, propChanges, timelineChanges } from "../src/ui/follow"

describe("a wrapper's props following its piece", () => {
  test("the first run passes only props that changed since the piece was made", () => {
    const made = [] as string[]
    const changes = propChanges({ options: made, selected: "A" as string | undefined })
    expect(changes({ options: made, selected: "A" })).toEqual({})
    expect(anyChanged(changes({ options: made, selected: "A" }))).toBe(false)
  })
  test("a value that changed in the mounting update isn't lost", () => {
    const changes = propChanges({ options: [] as readonly string[] })
    const next = ["A", "B"]
    expect(changes({ options: next })).toEqual({ options: next })
  })
  test("props that changed together come together, whatever order they changed in", () => {
    const changes = propChanges({ options: [] as readonly string[], selected: "A", chosen: null })
    // The page's selection moved before the round's options reached the picker: one diff, so
    // the wrapper applies the options first and the selection after.
    const options = ["A", "B"]
    const c = changes({ options, selected: "B", chosen: null })
    expect(c).toEqual({ options, selected: "B" })
    expect(Object.keys(c)).toContain("options")
    // After that, only what changes again.
    expect(changes({ options, selected: "A", chosen: null })).toEqual({ selected: "A" })
  })
  test("undefined is a value like any other", () => {
    const changes = propChanges<{ selected?: string }>({ selected: undefined })
    expect(changes({ selected: undefined })).toEqual({})
    expect(changes({ selected: "x" })).toEqual({ selected: "x" })
    expect(changes({ selected: undefined })).toEqual({ selected: undefined })
  })
})

describe("a timeline's changes as one update", () => {
  const now = { time: 2, playing: false, markers: [], ranges: [] }
  test("unset values and what the timeline already has are dropped", () => {
    expect(
      timelineChanges(now, { time: 2, playing: false, markers: now.markers, duration: undefined }),
    ).toEqual({})
  })
  test("the rest go together, so a new duration lands with the time past the old one", () => {
    expect(timelineChanges(now, { duration: 20, time: 12 })).toEqual({ duration: 20, time: 12 })
  })
})
