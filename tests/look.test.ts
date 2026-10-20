import { describe, expect, it } from "vitest"
import { injectUiStyles } from "../src/ui/look.js"

/** The knobs/ui stylesheet, as injectUiStyles writes it. */
function stylesheet() {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text = style.textContent) },
  }
  injectUiStyles(doc as unknown as Document)
  return text
}

describe("knobs/ui stylesheet", () => {
  const css = stylesheet()

  // The panel registers --kc-value-size (initial 11.5px), so a fallback on it never applies.
  it("sizes readouts from --k-value-size or the piece's font size", () => {
    expect(css).not.toContain("var(--kc-value-size")
    expect(css).toContain("--ku-value-size:var(--k-value-size,calc(var(--ku-font-size) - .5px))")
  })

  it("derives on the knobs root, standing alone", () => {
    expect(css).toContain(":where(.knobs-root){")
    expect(css).toContain("--ku-row:var(--_k-row)")
  })
})
