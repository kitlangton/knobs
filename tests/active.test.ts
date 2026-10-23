import { describe, expect, it } from "vitest"
import type { PanelActive } from "../src/core/store.js"
import { activeEvents, activeReporter, type ActiveWhere } from "../src/panel/active.js"

// Targets stand for elements: "g" a card of group g, "g/k" its row k, "-" nothing of a card's.
const resolve = (t: string | null): PanelActive | null => {
  if (t === null || t === "-") return null
  const [group, key] = t.split("/")
  return key ? { group: group!, key } : { group: group! }
}
const make = () => {
  const heard: (PanelActive | null)[] = []
  let pending: (() => void) | undefined
  const r = activeReporter(
    resolve,
    (at) => heard.push(at),
    (flush) => {
      pending = flush
      return () => (pending = undefined)
    },
  )
  const frame = () => {
    const f = pending
    pending = undefined
    f?.()
  }
  return { r, heard, frame, scheduled: () => pending !== undefined }
}

describe("onActive's reporter", () => {
  it("coalesces to one report a frame, with the last value", () => {
    const { r, heard, frame } = make()
    r.pointer("a")
    r.pointer("a/x")
    r.pointer("b/y")
    expect(heard).toEqual([])
    frame()
    expect(heard).toEqual([{ group: "b", key: "y" }])
  })

  it("never reports the same value twice", () => {
    const { r, heard, frame } = make()
    r.pointer("a/x")
    frame()
    r.pointer("b")
    r.pointer("a/x")
    frame()
    r.focus("a/x")
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }])
  })

  it("reports null when the pointer leaves and nothing has focus", () => {
    const { r, heard, frame } = make()
    r.pointer("a")
    frame()
    r.pointer("-")
    frame()
    r.pointer(null)
    frame()
    expect(heard).toEqual([{ group: "a" }, null])
  })

  it("whichever moved last leads; the other stands in while it's on nothing", () => {
    const { r, heard, frame } = make()
    r.focus("a/x")
    frame()
    r.pointer("b")
    frame()
    // A key moves focus under a still pointer: focus leads.
    r.focus("a/y")
    frame()
    // The pointer leaves the panel: focus stays.
    r.pointer(null)
    frame()
    r.focus(null)
    frame()
    expect(heard).toEqual([
      { group: "a", key: "x" },
      { group: "b" },
      { group: "a", key: "y" },
      null,
    ])
  })

  it("on dispose, cancels a pending report and says null once", () => {
    const { r, heard, frame, scheduled } = make()
    r.pointer("a")
    frame()
    r.pointer("b")
    expect(scheduled()).toBe(true)
    r.dispose()
    expect(scheduled()).toBe(false)
    expect(heard).toEqual([{ group: "a" }, null])
    r.dispose()
    expect(heard).toEqual([{ group: "a" }, null])
  })
})

describe("onActive's events", () => {
  // Nodes: "a/x" a row in the panel, "menu" one of its menus on the body, "page" elsewhere.
  const where = (n: string | null): ActiveWhere =>
    n === null || n === "page" ? "outside" : n === "menu" ? "menu" : "inside"
  const withEvents = () => {
    const { r, heard, frame } = make()
    return { e: activeEvents(r, where), heard, frame }
  }

  it("focus in a menu keeps its row until it leaves the menu for nowhere", () => {
    const { e, heard, frame } = withEvents()
    e.focusIn({ target: "a/x" })
    frame()
    e.focusOut({ target: "a/x", relatedTarget: "menu" })
    e.focusIn({ target: "menu" })
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }])
    // The menu blurs, or closes without handing focus back.
    e.focusOut({ target: "menu", relatedTarget: null })
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }, null])
  })

  it("focus leaving a menu for somewhere is left to where it lands", () => {
    const { e, heard, frame } = withEvents()
    e.focusIn({ target: "a/x" })
    e.focusIn({ target: "menu" })
    frame()
    e.focusOut({ target: "menu", relatedTarget: "a/x" })
    e.focusIn({ target: "a/x" })
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }])
    // Back in the panel, a menu that blurs later (not ours any more) changes nothing.
    e.focusOut({ target: "menu", relatedTarget: null })
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }])
    e.focusIn({ target: "menu" })
    e.focusOut({ target: "menu", relatedTarget: "page" })
    e.focusIn({ target: "page" })
    frame()
    expect(heard).toEqual([{ group: "a", key: "x" }, null])
  })

  it("a pointer that moves takes the lead back from focus, within the same element too", () => {
    const { e, heard, frame } = withEvents()
    e.over({ target: "b/y" })
    frame()
    e.focusIn({ target: "a/x" })
    frame()
    // Content scrolled under a still pointer: no movement, focus keeps the lead.
    e.move({ target: "b/y", movementX: 0, movementY: 0 })
    frame()
    expect(heard).toEqual([
      { group: "b", key: "y" },
      { group: "a", key: "x" },
    ])
    e.move({ target: "b/y", movementX: 1, movementY: 0 })
    e.move({ target: "b/y", movementX: 2, movementY: 1 })
    frame()
    expect(heard).toEqual([
      { group: "b", key: "y" },
      { group: "a", key: "x" },
      { group: "b", key: "y" },
    ])
  })
})
