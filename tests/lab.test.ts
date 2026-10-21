// The pieces OpenCode's components lab leans on: a panel in a split pane, its header buttons in
// the pane's header, presets as a list, a toolbar of icons.
import { describe, expect, expectTypeOf, it } from "vitest"
import { defineControls, knob, text, type Values } from "../src/index.js"
import { descriptorToField, formatSwift } from "../src/core/remote.js"
import { toolbar } from "../src/core/schema.js"
import { injectStyles } from "../src/panel/styles.js"
import { injectUiStyles } from "../src/ui/look.js"
import { presetLines } from "../src/panel/presets.js"

/** The panel stylesheet (or another), as injectStyles writes it. */
function stylesheet(inject: (doc: Document) => void = injectStyles) {
  let text = ""
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: "" }),
    head: { append: (style: { textContent: string }) => (text += style.textContent) },
  }
  inject(doc as unknown as Document)
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

describe("presets as a list", () => {
  it("counts the lines the chips would take", () => {
    // 7 chips at 150 px in a 280 px strip: one column, seven lines.
    expect(presetLines(7, 150, 280, 2)).toBe(7)
    // Two columns of 120 px fit in 250 px: four lines.
    expect(presetLines(7, 120, 250, 2)).toBe(4)
    expect(presetLines(4, 60, 280, 2)).toBe(1)
    // Nothing to measure yet: one line, so the chips show until there is.
    expect(presetLines(7, 0, 280, 2)).toBe(1)
    expect(presetLines(7, 150, 0, 2)).toBe(1)
  })

  it("lays them out as left-aligned rows with a quiet selection", () => {
    expect(rule(css, '.knobs-presets[data-display="list"]>.knobs-presets-track')).toContain(
      "grid-template-columns:minmax(0,1fr)",
    )
    expect(
      rule(css, '.knobs-panel .knobs-presets[data-display="list"] .knobs-preset-chip'),
    ).toContain("text-align:left")
    expect(rule(css, '.knobs-presets[data-display="list"] .knobs-presets-pill')).toContain(
      "box-shadow:none",
    )
  })
})

describe("a toolbar of icons", () => {
  const items = [
    { label: "Previous", icon: "play" },
    { label: "Next", icon: "play" },
  ]

  it("takes labels: false", () => {
    expect(toolbar(items, { labels: false }).labels).toBe(false)
    expect(toolbar(items).labels).toBeUndefined()
    expect(toolbar(items, { label: "Play", labels: true })).toMatchObject({
      labels: true,
      label: "Play",
    })
  })

  it("centres each icon and hides its label and shortcut", () => {
    expect(rule(css, ".knobs-panel .knobs-toolbar[data-icons] .knobs-tool")).toContain(
      "justify-content:center",
    )
    expect(
      rule(css, ".knobs-panel .knobs-toolbar[data-icons] :is(.knobs-tool-label,.knobs-tool-key)"),
    ).toBe("display:none")
  })
})

describe("a tree row's detail", () => {
  const ui = stylesheet(injectUiStyles)

  // The label keeps its width (it gives way only once nothing's left to take); the detail starts
  // from nothing and takes only the room that's left, so it's cut (and fades) first.
  it("gives way before the label", () => {
    expect(rule(ui, ".knobs-tree-label")).toContain("flex:0 1 auto;min-width:0")
    expect(rule(ui, ".knobs-tree-detail")).toContain("flex:1 1 0;min-width:0;overflow:hidden")
  })

  it("keeps the tools at the row's end with or without a detail", () => {
    expect(rule(ui, ".knobs-tree-tools")).toContain("margin-left:auto")
  })
})

describe("a panel with no rows", () => {
  it("shows its empty line quietly, inset like a row", () => {
    const empty = rule(css, ".knobs-panel .knobs-empty")
    expect(empty).toContain("color:var(--kv-fg-3)")
    expect(empty).toContain("var(--kv-inset)")
    expect(empty).not.toContain("display")
  })
})

describe("a text field", () => {
  it("keeps one line unless it's multiline", () => {
    expect(text("a\nb").value).toBe("a b")
    expect(text("a\r\nb", { multiline: true })).toMatchObject({ value: "a\nb", multiline: true })
    expect(text()).toMatchObject({ kind: "text", value: "" })
    expect(text("", { placeholder: "Ask anything" }).placeholder).toBe("Ask anything")
  })

  it("sets and resets as a string, and stays out of Random and Mutate", () => {
    const schema = { size: knob(1, { min: 0, max: 10, step: 1 }), name: text("Ada") }
    const store = defineControls("lab-text", schema, { enabled: true, storage: null })
    expectTypeOf(store.get()).toEqualTypeOf<Values<typeof schema>>()
    const name: string = store.get().name
    expect(name).toBe("Ada")
    store.set({ name: "Grace\nHopper" })
    expect(store.get().name).toBe("Grace Hopper")
    store.randomize()
    store.mutate()
    expect(store.get().name).toBe("Grace Hopper")
    store.reset()
    expect(store.get().name).toBe("Ada")
    // Anything but a string is its default.
    store.set({ name: 42 as unknown as string })
    expect(store.get().name).toBe("Ada")
  })

  it("arrives from a remote descriptor and leaves as a Swift string", () => {
    const field = descriptorToField({
      key: "prompt",
      kind: "text",
      default: "Hi",
      multiline: true,
      placeholder: "Ask anything",
    })
    expect(field).toMatchObject({
      kind: "text",
      value: "Hi",
      multiline: true,
      placeholder: "Ask anything",
    })
    expect(
      formatSwift([{ key: "prompt", kind: "text", default: "Hi" }], { prompt: 'Say "hi"' }),
    ).toContain('"Say \\"hi\\""')
  })
})
