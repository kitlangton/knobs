// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import type { ControlDescriptor } from "../src/core/remote.js"
import { createRemoteControls, defineControls, knob, spring } from "../src/index.js"
import { mountPanel } from "../src/panel/panel.js"

// OpenCode Desktop's Stack: features keyed `Area · Feature`, each with its own presets.
const descriptors = (): ControlDescriptor[] => [
  {
    key: "peek.width",
    label: "Width",
    kind: "number",
    default: 240,
    min: 160,
    max: 400,
    step: 8,
    group: "Sidebars · Peek",
  },
  {
    key: "peek.delay",
    label: "Delay",
    kind: "number",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
    group: "Sidebars · Peek",
  },
  {
    key: "dock.lift",
    label: "Lift",
    kind: "number",
    default: 6,
    min: 0,
    max: 20,
    step: 1,
    group: "Composer · Dock",
  },
  {
    key: "dock.fade",
    label: "Fade",
    kind: "number",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
    group: "Composer · Dock",
  },
  {
    key: "global.speed",
    label: "Speed",
    kind: "number",
    default: 1,
    min: 0.25,
    max: 4,
    step: 0.25,
    group: "Global",
  },
]
const scopedPresets = {
  "Sidebars · Peek": {
    snappy: { "peek.width": 200, "peek.delay": 0.1 },
    calm: { "peek.width": 320, "peek.delay": 0.4 },
  },
}

// happy-dom draws no canvas; the group die paints its faces into one.
HTMLCanvasElement.prototype.getContext = (() => ({
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
})) as never

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
const rowLabels = (root: Element) =>
  [...root.querySelectorAll(".knobs-row .knobs-label")].map((n) => n.textContent)
const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))

describe("embed", () => {
  it("shows the named groups alone, in order, with no header, footer or toggle", () => {
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), {
      embed: true,
      groups: ["Composer · Dock", "Sidebars · Peek"],
    })
    const root = panel.element
    expect(root.hasAttribute("data-embed")).toBe(true)
    expect(root.dataset.density).toBe("compact")
    expect(root.querySelector("header")?.hidden).toBe(true)
    expect(root.querySelector(".knobs-popover")).toBeNull()
    expect(rowLabels(root)).toEqual(["Lift", "Fade", "Width", "Delay"])
    // Two groups keep their titles.
    expect(root.hasAttribute("data-solo")).toBe(false)
    panel.dispose()
  })

  it("leads one group with its action row and its own presets", () => {
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), { embed: true, groups: ["Sidebars · Peek"] })
    const root = panel.element
    expect(root.hasAttribute("data-solo")).toBe(true)
    expect(rowLabels(root)).toEqual(["Width", "Delay"])
    const head = root.querySelector<HTMLElement>(".knobs-group-head")!
    expect(head.dataset.group).toBe("Sidebars · Peek")
    // Not a fold: the host shows or hides the feature.
    expect(head.hasAttribute("data-foldable")).toBe(false)
    expect(head.querySelector(".knobs-group-reset")).not.toBeNull()
    expect(head.querySelector(".knobs-group-die")).not.toBeNull()
    // The group's presets lead its card, and the panel's own strip stays out of the way.
    const card = head.nextElementSibling as HTMLElement
    const strip = card.firstElementChild as HTMLElement
    expect(strip.classList.contains("knobs-presets")).toBe(true)
    expect(strip.hidden).toBe(false)
    expect(strip.getAttribute("aria-label")).toBe("Sidebars · Peek presets")
    const top = root.querySelector<HTMLElement>(".knobs-presets:not(.knobs-card *)")
    expect(top?.hidden).toBe(true)
    // Picking one sets the feature's keys.
    const calm = [...strip.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      /calm/i.test(b.textContent ?? ""),
    )!
    calm.click()
    expect(remote.get()).toMatchObject({ "peek.width": 320, "peek.delay": 0.4 })
    // …and the group's Reset blooms, and puts them back.
    const reset = head.querySelector<HTMLButtonElement>(".knobs-group-reset")!
    expect(reset.dataset.shown).toBe("true")
    reset.click()
    expect(remote.get()).toMatchObject({ "peek.width": 240, "peek.delay": 0.2 })
    panel.dispose()
  })
})
