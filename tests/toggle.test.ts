import { describe, expect, it } from "vitest"
import { isTypingTarget } from "../src/core/keys.js"
import { memoryStorage, type StoragePort } from "../src/core/storage.js"
import { presenceLook } from "../src/panel/presence.js"
import { isToggleKey, toggleLayer } from "../src/panel/toggle.js"

const key = (k: string, extra: Record<string, unknown> = {}) =>
  ({
    key: k,
    code: k === "`" ? "Backquote" : "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: { tagName: "BODY" },
    ...extra,
  }) as unknown as KeyboardEvent

describe("isToggleKey", () => {
  it("takes a plain backtick", () => {
    expect(isToggleKey(key("`"), "`")).toBe(true)
  })

  it("ignores it while typing in a text field", () => {
    for (const target of [
      { tagName: "INPUT", type: "text" },
      { tagName: "INPUT", type: "search" },
      { tagName: "TEXTAREA" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ])
      expect(isToggleKey(key("`", { target }), "`")).toBe(false)
  })

  it("still takes it on a switch, a slider or a button", () => {
    for (const type of ["checkbox", "range", "button"])
      expect(isToggleKey(key("`", { target: { tagName: "INPUT", type } }), "`")).toBe(true)
  })

  it("ignores it with a modifier held, repeated, composing or claimed", () => {
    for (const extra of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { repeat: true },
      { isComposing: true },
      { defaultPrevented: true },
    ])
      expect(isToggleKey(key("`", extra), "`")).toBe(false)
  })

  it("takes the backtick's key on a layout that types something else, but not with ⇧", () => {
    expect(isToggleKey(key("Dead", { code: "Backquote" }), "`")).toBe(true)
    expect(isToggleKey(key("~", { code: "Backquote", shiftKey: true }), "`")).toBe(false)
  })

  it("matches another key exactly", () => {
    expect(isToggleKey(key("F8"), "F8")).toBe(true)
    expect(isToggleKey(key("`"), "F8")).toBe(false)
    expect(isToggleKey(key("F8"), "")).toBe(false)
  })
})

describe("toggleLayer", () => {
  const page = () => {
    const keys: ((e: KeyboardEvent) => void)[] = []
    const win = {
      addEventListener: (_: string, f: (e: KeyboardEvent) => void) => keys.push(f),
      removeEventListener: (_: string, f: (e: KeyboardEvent) => void) =>
        keys.splice(keys.indexOf(f), 1),
    }
    const doc = { defaultView: win, activeElement: null, body: {} } as unknown as Document
    const press = (k: string) => {
      for (const f of [...keys]) f(key(k))
    }
    return { doc, press, listening: () => keys.length }
  }
  const surface = (id: string, storage: StoragePort | null, k = "`") => {
    const seen: [boolean, boolean][] = []
    return {
      seen,
      surface: {
        id,
        key: k,
        storage: () => storage,
        root: { contains: () => false } as unknown as HTMLElement,
        show: (shown: boolean, animate: boolean) => void seen.push([shown, animate]),
      },
    }
  }

  it("hides every panel on the key and shows them all again, animating", () => {
    const { doc, press } = page()
    const a = surface("a", null)
    const b = surface("b", null)
    toggleLayer(doc).register(a.surface)
    toggleLayer(doc).register(b.surface)
    press("`")
    press("`")
    expect(a.seen).toEqual([
      [false, true],
      [true, true],
    ])
    expect(b.seen).toEqual(a.seen)
  })

  it("shows them all when any is hidden, rather than flipping each", () => {
    const { doc, press } = page()
    const store = memoryStorage()
    store.setItem("knobs:a:shown:v1", "0")
    const a = surface("a", store)
    const b = surface("b", null)
    expect(toggleLayer(doc).register(a.surface).shown).toBe(false)
    expect(toggleLayer(doc).register(b.surface).shown).toBe(true)
    press("`")
    expect(a.seen).toEqual([[false, true]])
    press("`")
    expect(a.seen.at(-1)).toEqual([true, true])
    expect(b.seen.at(-1)).toEqual([true, true])
  })

  it("remembers per store, and a panel mounted later follows the last press", () => {
    const { doc, press } = page()
    const store = memoryStorage()
    toggleLayer(doc).register(surface("a", store).surface)
    press("`")
    expect(store.getItem("knobs:a:shown:v1")).toBe("0")
    expect(toggleLayer(doc).register(surface("later", null).surface).shown).toBe(false)
    expect(toggleLayer(page().doc).register(surface("a", store).surface).shown).toBe(false)
  })

  it("leaves panels on another key alone, and stops listening once none is left", () => {
    const { doc, press, listening } = page()
    const a = surface("a", null)
    const f8 = surface("f8", null, "F8")
    const offA = toggleLayer(doc).register(a.surface)
    const offF8 = toggleLayer(doc).register(f8.surface)
    press("`")
    expect(a.seen).toHaveLength(1)
    expect(f8.seen).toHaveLength(0)
    offA.dispose()
    offF8.dispose()
    expect(listening()).toBe(0)
  })
})

describe("isTypingTarget", () => {
  it("knows fields from the rest", () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget({ tagName: "INPUT", type: "email" } as never)).toBe(true)
    expect(isTypingTarget({ tagName: "INPUT", type: "color" } as never)).toBe(false)
    expect(isTypingTarget({ tagName: "BUTTON" } as never)).toBe(false)
  })
})

describe("presenceLook", () => {
  it("leaves softly: blur at most 4 px, scale at least .96, faded out", () => {
    for (const inline of [false, true])
      for (let x = 0; x <= 1; x += 0.05) {
        const look = presenceLook(x, inline, false)
        expect(look.blur).toBeLessThanOrEqual(4)
        expect(look.scale).toBeGreaterThanOrEqual(0.96)
      }
    expect(presenceLook(0, false, false)).toMatchObject({ opacity: 0, blur: 4, scale: 0.96 })
    expect(presenceLook(1, true, false)).toEqual({ opacity: 1, blur: 0, scale: 1, fold: 1 })
  })

  it("folds an inline panel's space, its content gone before the last of the height", () => {
    const look = presenceLook(0.35, true, false)
    expect(look.opacity).toBe(0)
    expect(look.fold).toBeCloseTo(0.35)
    expect(presenceLook(0.5, false, false).fold).toBe(1)
  })

  it("only fades with reduced motion", () => {
    expect(presenceLook(0.5, true, true)).toEqual({ opacity: 0.5, blur: 0, scale: 1, fold: 1 })
  })
})
