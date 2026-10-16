import { describe, expect, it } from "vitest"
import {
  inCorner,
  KONAMI,
  queryUnlock,
  resolveUnlock,
  sequenceMatcher,
  tapCounter,
} from "../src/core/unlock.js"

describe("sequenceMatcher", () => {
  const type = (match: (k: string, at: number) => boolean, keys: string[], gap = 100) =>
    keys.map((k, i) => match(k, i * gap))

  it("fires on the key that completes a word, in either case", () => {
    expect(type(sequenceMatcher("knobs"), [..."knobs"])).toEqual([false, false, false, false, true])
    expect(type(sequenceMatcher("knobs"), [..."KNObs"]).at(-1)).toBe(true)
  })

  it("finds the word after other keys and after a false start", () => {
    expect(type(sequenceMatcher("knobs"), [..."xxknknobs"]).at(-1)).toBe(true)
  })

  it("forgets what was typed after a pause", () => {
    const match = sequenceMatcher("knobs", 1000)
    expect(match("k", 0)).toBe(false)
    expect(match("n", 100)).toBe(false)
    expect(match("o", 2000)).toBe(false)
    expect(match("b", 2100)).toBe(false)
    expect(match("s", 2200)).toBe(false)
  })

  it("matches the Konami code, with an extra ↑ at the start", () => {
    expect(type(sequenceMatcher(KONAMI), ["ArrowUp", ...KONAMI]).at(-1)).toBe(true)
    expect(type(sequenceMatcher(KONAMI), [...KONAMI.slice(0, -2), "B", "A"]).at(-1)).toBe(true)
  })

  it("starts over once it has fired", () => {
    const match = sequenceMatcher("ab")
    expect(type(match, ["a", "b", "b"])).toEqual([false, true, false])
  })

  it("never fires for an empty sequence", () => {
    expect(type(sequenceMatcher(""), ["a", "b"])).toEqual([false, false])
  })
})

describe("queryUnlock", () => {
  it("unlocks with the bare flag or a yes", () => {
    for (const search of ["?knobs", "?knobs=", "?a=1&knobs=on", "?knobs=1", "?knobs=true"])
      expect(queryUnlock(search, "knobs")).toBe(true)
  })

  it("locks with off", () => {
    for (const search of ["?knobs=off", "?knobs=0", "?knobs=false", "?knobs=lock", "?knobs=OFF"])
      expect(queryUnlock(search, "knobs")).toBe(false)
  })

  it("says nothing without it", () => {
    expect(queryUnlock("", "knobs")).toBeUndefined()
    expect(queryUnlock("?tune", "knobs")).toBeUndefined()
    expect(queryUnlock("?tune", "tune")).toBe(true)
  })
})

describe("resolveUnlock", () => {
  it("goes with the URL when it says, and remembers it when persisting", () => {
    expect(resolveUnlock({ query: true, stored: false, persist: true })).toEqual({
      unlocked: true,
      remember: true,
    })
    expect(resolveUnlock({ query: false, stored: true, persist: true })).toEqual({
      unlocked: false,
      remember: false,
    })
  })

  it("else goes with what was remembered", () => {
    expect(resolveUnlock({ query: undefined, stored: true, persist: true })).toEqual({
      unlocked: true,
      remember: undefined,
    })
    expect(resolveUnlock({ query: undefined, stored: false, persist: true }).unlocked).toBe(false)
  })

  it("without persist, only this page view's URL counts", () => {
    expect(resolveUnlock({ query: undefined, stored: true, persist: false })).toEqual({
      unlocked: false,
      remember: undefined,
    })
    expect(resolveUnlock({ query: true, stored: false, persist: false })).toEqual({
      unlocked: true,
      remember: undefined,
    })
  })
})

describe("the corner gesture", () => {
  it("knows each corner", () => {
    expect(inCorner(390, 10, 400, 800, "top-right")).toBe(true)
    expect(inCorner(10, 10, 400, 800, "top-right")).toBe(false)
    expect(inCorner(10, 10, 400, 800, "top-left")).toBe(true)
    expect(inCorner(10, 790, 400, 800, "bottom-left")).toBe(true)
    expect(inCorner(390, 790, 400, 800, "bottom-right")).toBe(true)
    expect(inCorner(390, 100, 400, 800, "top-right")).toBe(false)
  })

  it("fires on the third quick tap", () => {
    const tap = tapCounter(3, 500)
    expect([tap(0), tap(300), tap(600)]).toEqual([false, false, true])
    expect([tap(700), tap(2000), tap(2300), tap(2600)]).toEqual([false, false, false, true])
  })
})
