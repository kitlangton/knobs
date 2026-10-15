import { describe, expect, it } from "vitest"
import { commandScope, digitHints, digitOption, escapeTo, scopeLabel } from "../src/panel/scope.js"

describe("Esc's ladder", () => {
  it("climbs a level a press: row, card, panel, then out", () => {
    expect(escapeTo("row")).toBe("card")
    expect(escapeTo("card")).toBe("panel")
    expect(escapeTo("panel")).toBe("none")
    expect(escapeTo("none")).toBe("none")
  })

  it("skips the card when the row isn't in one", () => {
    expect(escapeTo("row", false)).toBe("panel")
  })
})

describe("what R and ⇧R act on", () => {
  it("follows focus: the row, its group, else everything", () => {
    expect(commandScope("row")).toBe("row")
    expect(commandScope("card")).toBe("group")
    expect(commandScope("panel")).toBe("all")
    expect(commandScope("none")).toBe("all")
  })

  it("acts on a selection wherever focus is", () => {
    expect(commandScope("row", true)).toBe("selection")
    expect(commandScope("panel", true)).toBe("selection")
  })

  it("says what it will do from there", () => {
    expect(scopeLabel("Random", "row")).toBe("Random this")
    expect(scopeLabel("Random", "group")).toBe("Random group")
    expect(scopeLabel("Reset", "all")).toBe("Reset all")
    expect(scopeLabel("Random", "selection")).toBe("Random selected")
  })
})

describe("digits on a row with options", () => {
  it("pick the nth option, 1-based, and nothing past the last", () => {
    expect(digitOption("1", 5)).toBe(0)
    expect(digitOption("5", 5)).toBe(4)
    expect(digitOption("6", 5)).toBeUndefined()
    expect(digitOption("9", 12)).toBe(8)
  })

  it("ignore anything else", () => {
    expect(digitOption("0", 5)).toBeUndefined()
    expect(digitOption("r", 5)).toBeUndefined()
    expect(digitOption("10", 12)).toBeUndefined()
    expect(digitOption("1", 0)).toBeUndefined()
  })

  it("hint each option that shows, or the range while they're hidden", () => {
    expect(digitHints(3, true)).toEqual(["1", "2", "3"])
    expect(digitHints(12, true)).toHaveLength(9)
    expect(digitHints(5, false)).toEqual(["1–5"])
    expect(digitHints(14, false)).toEqual(["1–9"])
    expect(digitHints(1, false)).toEqual(["1"])
    expect(digitHints(0, true)).toEqual([])
  })
})
