import { describe, expect, it } from "vitest"
import {
  commandScope,
  crumbTrail,
  digitHints,
  digitOption,
  escapeTo,
  escTarget,
  fitCrumbs,
  scopeLabel,
  scopeTargets,
} from "../src/panel/scope.js"

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

describe("what a scoped command lights", () => {
  const at = { selection: ["a", "b"], row: "row", card: "card", panel: "panel" }
  it("lights the selection, the row, the card or the panel", () => {
    expect(scopeTargets("selection", at)).toEqual(["a", "b"])
    expect(scopeTargets("row", at)).toEqual(["row"])
    expect(scopeTargets("group", at)).toEqual(["card"])
    expect(scopeTargets("all", at)).toEqual(["panel"])
  })
  it("falls back to the panel when the level isn't there", () => {
    expect(scopeTargets("row", { panel: "p" })).toEqual(["p"])
    expect(scopeTargets("group", { panel: "p" })).toEqual(["p"])
    expect(scopeTargets("selection", { selection: [], panel: "p" })).toEqual(["p"])
  })
})

describe("the scope line", () => {
  it("names each focused level in order, the deepest last", () => {
    expect(crumbTrail({ card: "Shape", row: "Cohesion" })).toEqual([
      { level: "card", label: "Shape" },
      { level: "row", label: "Cohesion" },
    ])
    expect(crumbTrail({ card: "Shape", row: "Tint", editor: "Hue" }).map((c) => c.label)).toEqual([
      "Shape",
      "Tint",
      "Hue",
    ])
    expect(crumbTrail({})).toEqual([])
    expect(crumbTrail({ card: " ", row: "Cohesion" })).toEqual([
      { level: "row", label: "Cohesion" },
    ])
  })
  it("says where Esc goes: the crumb above, else the panel, nothing at the panel", () => {
    expect(escTarget(crumbTrail({ card: "Shape", row: "Cohesion" }), "Swarm")).toBe("Shape")
    expect(escTarget(crumbTrail({ card: "Shape" }), "Swarm")).toBe("Swarm")
    expect(escTarget(crumbTrail({ card: "Shape" }), "")).toBe("panel")
    expect(escTarget([], "Swarm")).toBeUndefined()
  })
  it("folds the first crumbs into … when the trail doesn't fit, keeping the deepest", () => {
    expect(fitCrumbs([40, 50], 200, 10, 8)).toEqual({ from: 0, hint: false })
    expect(fitCrumbs([40, 50, 30], 110, 10, 8)).toEqual({ from: 1, hint: false })
    expect(fitCrumbs([40, 50, 30], 20, 10, 8)).toEqual({ from: 2, hint: false })
    expect(fitCrumbs([], 100, 10, 8)).toEqual({ from: 0, hint: false })
  })
  it("shows the Esc hint only when it fits too", () => {
    expect(fitCrumbs([40], 100, 10, 8, 50)).toEqual({ from: 0, hint: true })
    expect(fitCrumbs([40], 90, 10, 8, 50)).toEqual({ from: 0, hint: false })
  })
})
