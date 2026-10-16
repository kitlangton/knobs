import { describe, expect, test } from "vitest"
import {
  askPick,
  cardTarget,
  claimsDigit,
  digitPick,
  keepPick,
  pickDigit,
  settleHeight,
  stepPick,
  stillWanted,
} from "../src/ui/picker-model"

describe("option picker", () => {
  const options = ["A", "B", "C"]
  test("digits pick the nth option; past the last, none", () => {
    expect(digitPick(options, "2")).toBe("B")
    expect(digitPick(options, "4")).toBeUndefined()
    expect(digitPick(options, "0")).toBeUndefined()
    expect(pickDigit(0)).toBe("1")
    // Every row is numbered; past 9 the number shows but no digit picks it.
    expect(pickDigit(9)).toBe("10")
    expect(pickDigit(11)).toBe("12")
    expect(digitPick(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], "1")).toBe("A")
  })
  test("↑/↓ step and stop at the ends; Home/End", () => {
    expect(stepPick(options, "A", "ArrowDown")).toBe("B")
    expect(stepPick(options, "C", "ArrowDown")).toBe("C")
    expect(stepPick(options, "A", "ArrowUp")).toBe("A")
    expect(stepPick(options, null, "ArrowDown")).toBe("A")
    expect(stepPick(options, "B", "End")).toBe("C")
    expect(stepPick([], null, "Home")).toBeUndefined()
  })
  test("the selection stays on its option, else goes to the first", () => {
    expect(keepPick(options, "C")).toBe("C")
    expect(keepPick(options, "Z")).toBe("A")
    expect(keepPick([], "A")).toBe(null)
  })
  test("a digit a focused row claimed, or typed into a field, isn't the picker's", () => {
    const key = {
      key: "2",
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
      typing: false,
    }
    expect(claimsDigit(key)).toBe(true)
    expect(claimsDigit({ ...key, defaultPrevented: true })).toBe(false)
    expect(claimsDigit({ ...key, typing: true })).toBe(false)
    expect(claimsDigit({ ...key, shiftKey: true })).toBe(false)
    expect(claimsDigit({ ...key, key: "a" })).toBe(false)
  })
})

describe("the card's target", () => {
  test("below the earlier options with their bodies shut, as tall as head and body", () => {
    // Clicking 2 from 1: 1's body is still open above, but the card aims past its head alone.
    expect(cardTarget([32, 32, 32], 1, 153, 2)).toEqual({ y: 34, h: 185 })
    expect(cardTarget([32, 32, 32], 0, 120, 2)).toEqual({ y: 0, h: 152 })
    expect(cardTarget([32, 40, 32], 2, 0, 2, 4)).toEqual({ y: 80, h: 32 })
  })
  test("a body not yet measured (a panel's first mount) gives no target: the card holds", () => {
    expect(cardTarget([32, 32, 32], 1, undefined, 2)).toBeNull()
    // Once it has measured, the same target as every later visit: no dip in height.
    expect(cardTarget([32, 32, 32], 1, 123, 2)).toEqual({ y: 34, h: 155 })
  })
  test("a first mount's height settles once two frames agree, or after the limit", () => {
    expect(settleHeight(undefined, 0, 1)).toBeUndefined()
    expect(settleHeight(0, 96, 1)).toBeUndefined()
    expect(settleHeight(96, 123, 2)).toBeUndefined()
    expect(settleHeight(123, 123, 3)).toBe(123)
    expect(settleHeight(0, 0, 1)).toBe(0)
    expect(settleHeight(100, 140, 6)).toBe(140)
  })
})

describe("a host's select for an option that isn't there yet", () => {
  // The picker's handle, as it keeps its selection.
  const picker = () => {
    let ids: readonly string[] = []
    let selected = keepPick(ids, null)
    let wanted: string | null = null
    return {
      set(next: readonly string[]) {
        ids = next
        selected = keepPick(ids, selected, wanted)
        wanted = stillWanted(ids, wanted)
      },
      select(id: string) {
        const ask = askPick(ids, id)
        wanted = ask.wanted
        if (ask.pick) selected = ask.pick
      },
      get selected() {
        return selected
      },
    }
  }
  test("select before set: the set that brings it picks it", () => {
    const p = picker()
    p.select("B")
    expect(p.selected).toBeNull()
    p.set(["A", "B"])
    expect(p.selected).toBe("B")
  })
  test("set before select: picked at once", () => {
    const p = picker()
    p.set(["A", "B"])
    expect(p.selected).toBe("A")
    p.select("B")
    expect(p.selected).toBe("B")
  })
  test("a later select replaces what was wanted", () => {
    const p = picker()
    p.select("B")
    p.select("C")
    p.set(["A", "B", "C"])
    expect(p.selected).toBe("C")
    const q = picker()
    q.set(["A"])
    q.select("B")
    q.select("A")
    q.set(["A", "B"])
    expect(q.selected).toBe("A")
  })
  test("wanted until it comes, and only once", () => {
    const p = picker()
    p.select("C")
    p.set(["A", "B"])
    expect(p.selected).toBe("A")
    p.set(["A", "B", "C"])
    expect(p.selected).toBe("C")
    p.select("A")
    p.set(["A", "B", "C", "D"])
    expect(p.selected).toBe("A")
  })
  test("keepPick prefers what was wanted, then the selection, then the first", () => {
    expect(keepPick(["A", "B"], "A", "B")).toBe("B")
    expect(keepPick(["A", "B"], "A", "C")).toBe("A")
    expect(keepPick(["A", "B"], "X", "C")).toBe("A")
    expect(askPick(["A"], "A")).toEqual({ pick: "A", wanted: null })
    expect(askPick(["A"], "B")).toEqual({ pick: undefined, wanted: "B" })
  })
})
