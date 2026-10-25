// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
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
  vi.restoreAllMocks()
})

/** Lays every element out 800 px wide from x = 0, so 2 s of timeline is 400 px a second. */
const layOut = () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 20,
    width: 800,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect)
  HTMLElement.prototype.setPointerCapture ??= () => {}
}
const press = (target: Element, type: string, clientX: number, extra: PointerEventInit = {}) =>
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX, ...extra }),
  )

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

  it("keeps a clip's label current as it moves", () => {
    const controls = make()
    const tl = timeline(host(), { duration: 2 })
    const view = tracks(host(), { controls, tracks: [card, rows], timeline: tl })
    controls.set({ "rows.start": 0.5 })
    expect(view.element.querySelector('[data-id="rows"]')!.getAttribute("aria-label")).toBe(
      "Rows: 0.50 s to 0.96 s",
    )
    view.dispose()
    tl.dispose()
  })

  it("a drag that starts against a bound is its own undo step, not part of the one before", () => {
    layOut()
    const controls = make()
    const tl = timeline(host(), { duration: 2 })
    const view = tracks(host(), { controls, tracks: [card, rows], timeline: tl, snap: false })
    controls.set({ "rows.stagger": 0.06 })
    const lanes = view.element.querySelector(".knobs-tk-lanes")!
    const clip = view.element.querySelector('[data-id="card"]')!
    // The card starts at 0: the first moves push it left, against the bound, and change nothing.
    press(clip, "pointerdown", 40)
    press(lanes, "pointermove", 30)
    press(lanes, "pointermove", 20)
    press(lanes, "pointermove", 80)
    press(lanes, "pointerup", 80)
    expect(controls.get()["card.start"]).toBeCloseTo(0.1, 3)
    controls.undo()
    expect(controls.get()["card.start"]).toBe(0)
    expect(controls.get()["rows.stagger"]).toBe(0.06)
    view.dispose()
    tl.dispose()
  })

  it("scrubbing an empty lane is a scrub, and leaves the view where it is", () => {
    layOut()
    const controls = make()
    const sources: string[] = []
    const tl = timeline(host(), { duration: 2, onSeek: (_, source) => sources.push(source) })
    tl.zoom(4, 0)
    const view = tracks(host(), { controls, tracks: [card, rows], timeline: tl })
    const lanes = view.element.querySelector(".knobs-tk-lanes")!
    const row = view.element.querySelector(".knobs-tk-row")!
    press(row, "pointerdown", 700)
    press(lanes, "pointerup", 700)
    expect(sources.at(-1)).toBe("scrub")
    view.dispose()
    tl.dispose()
  })
})
