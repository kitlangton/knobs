import { describe, expect, it } from "vitest"
import { assignHintCodes } from "../src/panel/hints.js"
import {
  assignPageCodes,
  claimsHintKey,
  HINT_LETTERS,
  type HintPainter,
  orderHintGroups,
  pageHints,
} from "../src/panel/page-hints.js"

const prefixFree = (codes: readonly string[]) =>
  codes.every((a, i) => codes.every((b, j) => i === j || !b.startsWith(a)))

describe("assignPageCodes", () => {
  it("gives each group a letter, home row first, and its targets a second letter", () => {
    expect(assignPageCodes([3, 5])).toEqual([
      ["aa", "as", "ad"],
      ["sa", "ss", "sd", "sf", "sg"],
    ])
  })

  it("gives a group of one its letter alone", () => {
    expect(assignPageCodes([1, 2, 1])).toEqual([["a"], ["sa", "ss"], ["d"]])
  })

  it("splits a big group over spare letters so its second letters stay on the home row", () => {
    const [codes] = assignPageCodes([20])
    expect(codes).toHaveLength(20)
    expect(new Set(codes!.map((c) => c[0])).size).toBe(3)
    expect(codes!.every((c) => "asdfghjkl".includes(c[1]!))).toBe(true)
    expect(codes!.slice(0, 3)).toEqual(["aa", "as", "ad"])
  })

  it("is unique, prefix-free and at most two letters for any mix", () => {
    for (const counts of [
      [40, 12, 1, 7, 30],
      [1, 1, 1],
      [26, 26, 26],
      [9, 10, 100],
      [300, 300],
    ]) {
      const all = assignPageCodes(counts).flat()
      expect(all.filter(Boolean)).toHaveLength(
        Math.min(
          676,
          counts.reduce((a, b) => a + b),
        ),
      )
      expect(new Set(all).size).toBe(all.length)
      expect(prefixFree(all)).toBe(true)
      expect(all.every((c) => /^[a-z]{1,2}$/.test(c))).toBe(true)
    }
  })

  it("packs groups into shared letters when there are more groups than letters", () => {
    const groups = assignPageCodes(Array.from({ length: 30 }, () => 1))
    expect(groups.flat().slice(0, 3)).toEqual(["aa", "as", "ad"])
    expect(prefixFree(groups.flat())).toBe(true)
  })

  it("leaves targets past 676 without a code", () => {
    const [codes] = assignPageCodes([700])
    expect(codes!.filter(Boolean)).toHaveLength(676)
    expect(codes![699]).toBe("")
  })

  it("uses every letter once", () => {
    expect(new Set(HINT_LETTERS).size).toBe(26)
  })
})

describe("orderHintGroups", () => {
  it("orders by rank, then down each column, left to right", () => {
    expect(
      orderHintGroups([
        { rank: 1, left: 0, top: 0 },
        { rank: 0, left: 900, top: 300 },
        { rank: 0, left: 900, top: 10 },
        { rank: 0, left: 300, top: 500 },
      ]),
    ).toEqual([3, 2, 1, 0])
  })
})

// A document just big enough for the registry: listeners, a window, elements with boxes.
function fakePage() {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const on = (type: string, f: (e: unknown) => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type)!.add(f)
  }
  const off = (type: string, f: (e: unknown) => void) => listeners.get(type)?.delete(f)
  const win = {
    innerWidth: 1000,
    innerHeight: 800,
    scrollX: 0,
    scrollY: 0,
    addEventListener: on,
    removeEventListener: off,
    getComputedStyle: () => ({ overflowX: "visible", overflowY: "visible" }),
  }
  const doc = {
    defaultView: win,
    body: {},
    addEventListener: on,
    removeEventListener: off,
    querySelectorAll: () => [],
  } as unknown as Document
  const press = (key: string, target: unknown = {}) => {
    const event = {
      key,
      target,
      defaultPrevented: false,
      repeat: false,
      isComposing: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      stopPropagation() {},
      stopImmediatePropagation() {},
    }
    for (const f of [...(listeners.get("keydown") ?? [])]) f(event)
    return event
  }
  const pressed: string[] = []
  const el = (name: string, top = 0, left = 0) =>
    ({
      nodeType: 1,
      tagName: "DIV",
      isConnected: true,
      tabIndex: -1,
      textContent: name,
      dataset: {},
      parentElement: null,
      closest: () => null,
      matches: () => false,
      getAttribute: () => null,
      getClientRects: () => [{}],
      getBoundingClientRect: () => ({
        top,
        left,
        right: left + 100,
        bottom: top + 20,
        width: 100,
        height: 20,
      }),
      focus() {},
      click: () => pressed.push(name),
    }) as unknown as HTMLElement
  return { doc, press, el, pressed, listeners }
}

function painter() {
  const log: { shown: string[]; query: string; cleared: number } = {
    shown: [],
    query: "",
    cleared: 0,
  }
  const paint: HintPainter = {
    show: (_spots, codes) => (log.shown = [...codes]),
    narrow: (q) => (log.query = q),
    clear: () => log.cleared++,
  }
  return { log, paint }
}

describe("page hint registry", () => {
  it("keeps a lone panel's own codes", () => {
    const { doc, el } = fakePage()
    const p = painter()
    const labels = ["Drop size", "Fall speed", "Exposure"]
    const off = pageHints(doc).register(
      el("root"),
      () => labels.map((l) => ({ el: el(l), label: l })),
      {
        rank: 0,
        paint: p.paint,
      },
    )
    // `s` outside it stays the page's: a lone panel hears its key only with focus inside.
    expect(pageHints(doc).listening).toBe(false)
    expect(pageHints(doc).start()).toBe(true)
    expect(p.log.shown).toEqual(assignHintCodes(labels.map((l) => ({ key: l, display: l }))))
    pageHints(doc).stop()
    expect(p.log.cleared).toBe(1)
    off()
  })

  it("assigns codes across groups, narrows as letters come, and presses the match", () => {
    const { doc, el, press, pressed } = fakePage()
    const station = painter()
    const details = painter()
    pageHints(doc).register(
      el("station"),
      () => [el("Intensity", 0, 900), el("Density", 30, 900)],
      {
        rank: 0,
        paint: station.paint,
      },
    )
    pageHints(doc).register(el("details"), () => [el("Preset", 0, 0), el("Scene", 30, 0)], {
      rank: 0,
      paint: details.paint,
    })
    expect(pageHints(doc).listening).toBe(true)
    expect(claimsHintKey(doc, "s")).toBe(true)
    expect(claimsHintKey(doc, "f")).toBe(false)

    // `s` anywhere on the page starts it; the left column takes the first letter.
    expect(press("s").defaultPrevented).toBe(true)
    expect(pageHints(doc).active).toBe(true)
    expect(details.log.shown).toEqual(["aa", "as"])
    expect(station.log.shown).toEqual(["sa", "ss"])

    press("s")
    expect(station.log.query).toBe("s")
    expect(details.log.query).toBe("s")
    press("s")
    expect(pressed).toEqual(["Density"])
    expect(pageHints(doc).active).toBe(false)
    expect(station.log.cleared).toBe(1)
    expect(details.log.cleared).toBe(1)
  })

  it("cancels on Escape and ignores `s` typed into a field", () => {
    const { doc, el, press, pressed } = fakePage()
    pageHints(doc).register(el("a"), () => [el("One"), el("Two", 40)], { paint: painter().paint })
    pageHints(doc).register(el("b"), () => [el("Three", 0, 600)], { paint: painter().paint })
    press("s", { tagName: "INPUT", type: "text" })
    expect(pageHints(doc).active).toBe(false)
    press("s")
    expect(pageHints(doc).active).toBe(true)
    press("Escape")
    expect(pageHints(doc).active).toBe(false)
    expect(pressed).toEqual([])
  })

  it("stops listening when only pieces that join are left, and ends hint mode on unregister", () => {
    const { doc, el, press } = fakePage()
    const p = painter()
    const offPanel = pageHints(doc).register(el("panel"), () => [el("Row")], { paint: p.paint })
    const offTree = pageHints(doc).register(el("tree"), () => [el("Item", 0, 600)], {
      listen: false,
      rank: 1,
      paint: painter().paint,
    })
    expect(pageHints(doc).listening).toBe(true)
    press("s")
    expect(pageHints(doc).active).toBe(true)
    offPanel()
    expect(pageHints(doc).active).toBe(false)
    expect(p.log.cleared).toBe(1)
    expect(pageHints(doc).listening).toBe(false)
    expect(claimsHintKey(doc, "s")).toBe(false)
    offTree()
  })
})
