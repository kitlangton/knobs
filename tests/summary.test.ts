import { describe, expect, it } from "vitest"
import { panelFoldSummary, type SummaryRow } from "../src/panel/summary.js"

const row = (value: string, changed = false, choice = false): SummaryRow => ({
  value,
  changed,
  choice,
})

describe("a folded panel card's default summary", () => {
  it("a one-row card reads its value, changed or not", () => {
    expect(panelFoldSummary([row("Today", false, true)], null)).toBe("Today")
    expect(panelFoldSummary([row("CSS orb", true, true)], null)).toBe("CSS orb")
    expect(panelFoldSummary([row("CSS orb", true, true)], "Custom")).toBe("CSS orb")
  })

  it("a bigger card leads with its preset, else its first changed value, else its first choice", () => {
    const rows = [row("0.3 s"), row("Glide", false, true), row("10 px")]
    expect(panelFoldSummary(rows, null)).toBe("Glide")
    expect(panelFoldSummary(rows, "Snappy")).toBe("Snappy")
    const changed = [row("0.3 s"), row("Glide", false, true), row("12 px", true)]
    expect(panelFoldSummary(changed, null)).toBe("12 px · 1 changed")
    expect(panelFoldSummary(changed, "Custom")).toBe("Custom · 1 changed")
  })

  it("leaves out what doesn't apply", () => {
    expect(panelFoldSummary([row("0.3 s"), row("10 px")], null)).toBe("")
    expect(panelFoldSummary([row(""), row("", true)], null)).toBe("1 changed")
    expect(panelFoldSummary([], null)).toBe("")
  })
})
