// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { defineControls, knob, spring } from "../src/index.js"
import { mountPanel } from "../src/panel/panel.js"

let hosts: HTMLElement[] = []
const host = () => {
  const node = document.createElement("div")
  document.body.append(node)
  hosts.push(node)
  return node
}
afterEach(() => {
  for (const node of hosts) node.remove()
  hosts = []
})

describe("surface", () => {
  const make = () =>
    defineControls(
      "surface",
      {
        a: knob(1, { min: 0, max: 2, step: 1, group: "A" }),
        b: spring({ duration: 0.3, bounce: 0 }, { group: "B" }),
      },
      { enabled: true, storage: null },
    )

  it("marks flat and indented panels; cards stay the default", () => {
    const flat = mountPanel(make(), host(), { surface: "flat" })
    expect(flat.element.dataset.surface).toBe("flat")
    const cards = mountPanel(make(), host(), { surface: "cards" })
    expect(cards.element.hasAttribute("data-surface")).toBe(false)
    flat.dispose()
    cards.dispose()
  })

  it("makes indented groups folds that start open", () => {
    const panel = mountPanel(make(), host(), { surface: "indent" })
    const heads = [...panel.element.querySelectorAll<HTMLElement>(".knobs-group-head")]
    expect(heads).toHaveLength(2)
    for (const head of heads) {
      expect(head.hasAttribute("data-foldable")).toBe(true)
      expect(head.getAttribute("aria-expanded")).toBe("true")
    }
    panel.dispose()
  })
})
