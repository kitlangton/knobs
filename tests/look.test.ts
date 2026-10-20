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
    head: { append: (style: { textContent: string }) => (text += style.textContent) },
  }
  inject(doc as unknown as Document)
  return text
}

describe("knobs/ui stylesheet", () => {
  const css = stylesheet()

  // A registered --kc-value-size (initial 11.5px) would beat every fallback on it.
  it("sizes readouts from --k-value-size or the piece's font size", () => {
    expect(css).not.toContain("--kc-value-size")
    expect(css).toContain(
      "--_k-value-size:var(--k-value-size,var(--ku-value-size,calc(var(--_k-font-size) - .5px)))",
    )
  })

  it("resolves on the knobs root, standing alone, from the same sheet as panels", () => {
    expect(css).toContain(":where(.knobs-root){")
    expect(css).toContain("--_k-row:var(--ku-row,var(--k-row,")
    expect(css).toContain("height:var(--kv-row)")
  })

  // The pieces kept a second copy of the defaults; now there's one token sheet.
  it("declares no defaults of its own", () => {
    const own = css.slice(css.indexOf(":where(.knobs-ui){"))
    expect(own).not.toMatch(/--k-(bg|text|surface|accent):/)
    expect(own).not.toContain("rgba(255,255,255,.92)")
  })

  it("takes the light appearance from a host's [data-knobs-theme] or [data-theme] ancestor", () => {
    expect(css).toContain(
      '[data-theme="light"],[data-appearance="light"],[data-knobs-theme="light"]) :where(.knobs-root){color-scheme:light',
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
    // Light colours follow the element's appearance as light-dark() pairs.
    expect(css).toContain('.knobs-root[data-preset="lab"]{')
    expect(css).toContain("--k-bg:light-dark(#f5f5f7,#191a1e)")
    expect(css).toContain("--k-row:26px")
    expect(labPreset.light).not.toHaveProperty("row")
  })

  it("walkthrough metrics and callouts take the tone tokens", () => {
    expect(walkthroughCss).not.toMatch(/--kw-tone:var\(--k-walkthrough-(good|info)/)
    expect(walkthroughCss).toContain(
      '.knobs-wt-callout[data-tone="good"]{--kw-tone:var(--kw-good)}',
    )
  })
})
