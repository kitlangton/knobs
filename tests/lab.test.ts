// The pieces OpenCode's components lab leans on: a panel in a split pane, its header buttons in
// the pane's header, presets as a list, a toolbar of icons.
import { describe, expect, it } from "vitest"
import { toolbar } from "../src/core/schema.js"
import { injectStyles } from "../src/panel/styles.js"

/** The panel stylesheet, as injectStyles writes it. */
function stylesheet() {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text += style.textContent) },
  }
  injectStyles(doc as unknown as Document)
  return text.replace(/\/\*[\s\S]*?\*\//g, "")
}

/** Splits a selector list at commas outside parentheses. */
function selectors(list: string) {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "(") depth++
    else if (list[i] === ")") depth--
    else if (list[i] === "," && depth === 0) {
      out.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  return [...out, list.slice(start).trim()]
}

/** The declarations of the first rule whose selector list includes `selector`. */
function rule(css: string, selector: string) {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (selectors(m[1]!).includes(selector)) return m[2]!
  return undefined
}

const css = stylesheet()
const SURFACE =
  ":where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip,[data-nested])"

describe("a panel on another surface", () => {
  it("sheds its card and padding, keeping its rows' inset", () => {
    expect(rule(css, `${SURFACE} :where(.knobs-panel.knobs-inline:not(.knobs-page))`)).toContain(
      "--k-chrome:0",
    )
    expect(rule(css, `${SURFACE} .knobs-panel.knobs-inline:not(.knobs-page)`)).toBe("padding:0")
    expect(rule(css, `${SURFACE} .knobs-panel.knobs-inline:not(.knobs-page) .knobs-card`)).toBe(
      "background:transparent;border-radius:0",
    )
  })
})

describe("header buttons in a pane's header", () => {
  it("take the pane's button size and wash", () => {
    const own = rule(css, ".knobs-head-actions[data-docked] button")!
    expect(own).toContain("width:var(--k-icon-btn)")
    expect(rule(css, ".knobs-head-actions[data-docked]")).toContain("--k-icon-btn:20px")
    expect(own).toContain("cursor:default")
  })

  it("bloom in and out of slots that take no room while they're away", () => {
    expect(rule(css, '.knobs-head-actions[data-docked] button[data-shown="false"]')).toMatch(
      /^width:0;/,
    )
  })
})
