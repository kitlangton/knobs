// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { defineControls, fitTracks, spring, track } from "../src/index.js"
import { timeline, tracks } from "../src/ui/index.js"

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

describe("tracks view", () => {
  const card = track("card", { ease: spring({ duration: 0.4, bounce: 0 }) })
  const rows = track("rows", {
    start: 0.2,
    ease: { duration: 0.3, bounce: 0.2 },
    stagger: 0.04,
    items: 5,
  })
  const make = () =>
    defineControls(
      `tracks-view-${Math.random()}`,
      { ...card.fields, ...rows.fields },
      { enabled: true, storage: null, constrain: fitTracks([card, rows]) },
    )

  it("draws a clip per track, a step per staggered item and a spring's settle", () => {
    const controls = make()
    const tl = timeline(host(), { duration: 2 })
    const view = tracks(host(), { controls, tracks: [card, rows], timeline: tl })
    const clips = view.element.querySelectorAll<HTMLElement>(".knobs-tk-clip")
    expect([...clips].map((c) => c.dataset.id)).toEqual(["card", "rows"])
    expect(clips[0]!.querySelectorAll(".knobs-tk-step")).toHaveLength(0)
    expect(clips[1]!.querySelectorAll(".knobs-tk-step")).toHaveLength(5)
    expect(clips[1]!.querySelector<HTMLElement>(".knobs-tk-tail")!.hidden).toBe(false)
    expect(clips[1]!.getAttribute("aria-label")).toBe("Rows: 0.20 s to 0.66 s")
    controls.set({ "rows.stagger": 0 })
    expect(clips[1]!.querySelectorAll(".knobs-tk-step")).toHaveLength(0)
    expect(clips[1]!.getAttribute("aria-label")).toBe("Rows: 0.20 s to 0.50 s")
    view.highlight("Rows")
    expect(clips[1]!.hasAttribute("data-active")).toBe(true)
    expect(clips[0]!.hasAttribute("data-active")).toBe(false)
    view.dispose()
    expect(view.element.isConnected).toBe(false)
    tl.dispose()
  })
})
