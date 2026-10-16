import { describe, expect, test } from "vitest"
import { follower } from "../src/ui/follow"

describe("a wrapper's prop following its piece", () => {
  test("the first run passes a value only if it changed since the piece was made", () => {
    const made = [] as string[]
    const changed = follower(made)
    expect(changed(made)).toBe(false)
    expect(changed(made)).toBe(true)
  })
  test("a value that changed in the mounting update isn't lost", () => {
    const changed = follower<readonly string[]>([])
    expect(changed(["A", "B"])).toBe(true)
  })
  test("a custom sameness, and undefined as a value", () => {
    const changed = follower<string | undefined>(undefined)
    expect(changed(undefined)).toBe(false)
    expect(changed("x")).toBe(true)
    const ids = follower<string[]>(["a"], (a, b) => a.join() === b.join())
    expect(ids(["a"])).toBe(false)
  })
})
