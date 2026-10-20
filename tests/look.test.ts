import { describe, expect, it } from "vitest"
import { injectUiStyles } from "../src/ui/look.js"
import { labPreset, presetCss } from "../src/core/theme.js"
import { walkthroughCss } from "../src/ui/walkthrough-css.js"
import { injectStyles } from "../src/panel/styles.js"

/** The knobs/ui stylesheet, as injectUiStyles writes it. */
function stylesheet(inject: (doc: Document) => void = injectUiStyles) {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text = style.textContent) },
  }
  inject(doc as unknown as Document)
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

  it("takes the light theme from a [data-knobs-theme] ancestor, as panels do", () => {
    expect(css).toContain(
      ':where([data-knobs-theme="light"]) :where(.knobs-ui):not([data-theme="dark"])',
    )
  })

  // A dark shadow on a light theme reads as a smudge: fixed shadows follow --k-shadow-strength.
  // The compare handle is exempt: it sits on the media, where its dark halo keeps it legible.
  it("draws no fixed dark shadow", () => {
    for (const sheet of [css, stylesheet(injectStyles)])
      for (const m of sheet.matchAll(/([^{}]*)\{[^{}]*?box-shadow:([^;}]*)/g))
        if (!m[1]!.includes(".knobs-cmp-handle"))
          expect(m[2], m[1]).not.toMatch(/rgba\(0,0,0,\.\d+\)/)
  })
})

describe("light variants", () => {
  it("labPreset has a light block that keeps its shape", () => {
    const css = presetCss(labPreset)
    expect(labPreset.light).toBeDefined()
    expect(css).toContain('[data-preset="lab"][data-theme="light"]')
    expect(labPreset.light).not.toHaveProperty("row")
    expect(labPreset.light!["color-scheme"]).toBe("light")
  })

  it("walkthrough metrics and callouts take the tone tokens", () => {
    expect(walkthroughCss).not.toMatch(/--kw-tone:var\(--k-walkthrough-(good|info)/)
    expect(walkthroughCss).toContain(
      '.knobs-wt-callout[data-tone="good"]{--kw-tone:var(--kw-good)}',
    )
  })
})
