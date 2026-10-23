import { describe, expect, it, vi } from "vitest"
import { choice, defineControls, knob } from "../src/index.js"
import { baseSignature, panelFoldSummary, type SummaryRow } from "../src/panel/summary.js"

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

describe("a folded card's summary after a change of base alone", () => {
  const make = () =>
    defineControls(
      "summary-base",
      {
        style: choice("today", ["today", "glide"], { group: "Hover", folded: true }),
        size: knob(10, { min: 6, max: 14, step: 1, unit: "px", group: "Hover" }),
      },
      { enabled: true, storage: null, presets: { glide: { style: "glide", size: 12 } } },
    )
  /** The default summary, as the panel builds it from the store. */
  const summary = (c: ReturnType<typeof make>) =>
    panelFoldSummary(
      [
        { value: c.get().style, changed: c.isModified("style"), choice: true },
        { value: `${c.get().size} px`, changed: c.isModified("size"), choice: false },
      ],
      null,
    )

  it("choosing a preset the values already match moves the base, not the values", () => {
    const c = make()
    c.set({ style: "glide", size: 12 })
    const values = { ...c.get() }
    const base = baseSignature(c)
    expect(summary(c)).toBe("glide · 2 changed")
    const heard = vi.fn()
    c.subscribe(heard)
    c.preset("glide")
    // No value moved, so no row would; the base did, and the store says so.
    expect(c.get()).toEqual(values)
    expect(heard).toHaveBeenCalled()
    expect(baseSignature(c)).not.toBe(base)
    expect(summary(c)).toBe("glide")
  })

  it("so does loading a variant saved from the current values", () => {
    const c = make()
    c.set({ size: 13 })
    const saved = c.variants.save("Big")
    const base = baseSignature(c)
    expect(summary(c)).toBe("13 px · 1 changed")
    c.variants.load(saved.id)
    expect(c.get().size).toBe(13)
    expect(baseSignature(c)).not.toBe(base)
    expect(summary(c)).toBe("today")
  })
})
