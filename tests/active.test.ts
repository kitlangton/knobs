import { describe, expect, it } from "vitest"
import type { PanelActive } from "../src/core/store.js"
import { activeReporter } from "../src/panel/active.js"

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
