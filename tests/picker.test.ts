import { describe, expect, test } from "vitest"
import { claimsDigit, digitPick, keepPick, pickDigit, stepPick } from "../src/ui/picker-model"

describe("option picker", () => {
  const options = ["A", "B", "C"]
  test("digits pick the nth option; past the last, none", () => {
    expect(digitPick(options, "2")).toBe("B")
    expect(digitPick(options, "4")).toBeUndefined()
    expect(digitPick(options, "0")).toBeUndefined()
    expect(pickDigit(0)).toBe("1")
    expect(pickDigit(9)).toBe("")
  })
  test("↑/↓ step and stop at the ends; Home/End", () => {
    expect(stepPick(options, "A", "ArrowDown")).toBe("B")
    expect(stepPick(options, "C", "ArrowDown")).toBe("C")
    expect(stepPick(options, "A", "ArrowUp")).toBe("A")
    expect(stepPick(options, null, "ArrowDown")).toBe("A")
    expect(stepPick(options, "B", "End")).toBe("C")
    expect(stepPick([], null, "Home")).toBeUndefined()
  })
  test("the selection stays on its option, else goes to the first", () => {
    expect(keepPick(options, "C")).toBe("C")
    expect(keepPick(options, "Z")).toBe("A")
    expect(keepPick([], "A")).toBe(null)
  })
  test("a digit a focused row claimed, or typed into a field, isn't the picker's", () => {
    const key = {
      key: "2",
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      typing: false,
    }
    expect(claimsDigit(key)).toBe(true)
    expect(claimsDigit({ ...key, defaultPrevented: true })).toBe(false)
    expect(claimsDigit({ ...key, typing: true })).toBe(false)
    expect(claimsDigit({ ...key, shiftKey: true })).toBe(false)
    expect(claimsDigit({ ...key, key: "a" })).toBe(false)
  })
})
