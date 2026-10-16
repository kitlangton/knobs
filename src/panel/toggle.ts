import { type StoragePort, storageKey } from "../core/storage.js"
import { isTypingTarget } from "../core/keys.js"
import { pageHints } from "./page-hints.js"

// The page's tools layer: one key (a backtick by default) shows and hides every panel and chip on
// the page that listens for it, together, as dev tools come and go as one. Each store remembers
// whether it was shown, so a reload keeps the page as it was left.

type KeyEventLike = Pick<
  KeyboardEvent,
  | "key"
  | "code"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "shiftKey"
  | "repeat"
  | "isComposing"
  | "defaultPrevented"
  | "target"
>

/** Whether a keydown is `key` for the toggle: outside a text field, with no modifier held. */
export function isToggleKey(event: KeyEventLike, key: string): boolean {
  if (!key || event.defaultPrevented || event.repeat || event.isComposing) return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (isTypingTarget(event.target)) return false
  if (event.key === key) return true
  // A layout whose backtick key types something else (a dead key) still toggles with it.
  return key === "`" && event.code === "Backquote" && !event.shiftKey
}

/** A panel or chip that comes and goes with the toggle key. */
export interface ToggleSurface {
  /** Its store's id: what's remembered. */
  readonly id: string
  readonly key: string
  readonly storage: () => StoragePort | null
  /** Where focus may be when it hides, to give back when it shows. */
  readonly root: HTMLElement
  /** Shows or hides it; `animate: false` puts it there at once. */
  show(shown: boolean, animate: boolean): void
}

export interface ToggleLayer {
  /** Joins the layer; `shown` is how it should start (what its store remembers). */
  register(surface: ToggleSurface): { readonly shown: boolean; dispose(): void }
  /** Shows or hides everything listening for `key`; false when nothing does. */
  toggle(key: string): boolean
}

const KEY = Symbol.for("knobs.toggle.v1")
const memoryKey = (id: string) => storageKey(id, "shown")

/** The page's toggle layer, for `doc`. */
export function toggleLayer(doc: Document): ToggleLayer {
  const holder = doc as unknown as Record<symbol, ToggleLayer | undefined>
  return (holder[KEY] ??= createLayer(doc))
}

function createLayer(doc: Document): ToggleLayer {
  const win = doc.defaultView!
  const surfaces = new Set<ToggleSurface>()
  const state = new Map<string, boolean>()
  /** Where each key last left the page: a panel mounted later (scrolled to) follows it. */
  const pressed = new Map<string, boolean>()
  /** What had focus in a surface when it hid. */
  let lastFocus: HTMLElement | undefined
  const isShown = (s: ToggleSurface) => {
    let on = state.get(s.id) ?? pressed.get(s.key)
    if (on === undefined) {
      try {
        on = s.storage()?.getItem(memoryKey(s.id)) !== "0"
      } catch {
        on = true
      }
    }
    state.set(s.id, on)
    return on
  }
  const toggle = (key: string) => {
    const mine = [...surfaces].filter((s) => s.key === key)
    if (!mine.length) return false
    const next = !mine.some(isShown)
    pressed.set(key, next)
    if (!next) {
      const active = doc.activeElement as HTMLElement | null
      if (active && mine.some((s) => s.root.contains(active))) {
        lastFocus = active
        active.blur()
      }
      pageHints(doc).stop()
    }
    for (const s of mine) {
      state.set(s.id, next)
      try {
        s.storage()?.setItem(memoryKey(s.id), next ? "1" : "0")
      } catch {}
    }
    for (const s of mine) s.show(next, true)
    if (next) {
      const active = doc.activeElement
      if (lastFocus?.isConnected && (!active || active === doc.body))
        lastFocus.focus({ preventScroll: true })
      lastFocus = undefined
    }
    return true
  }
  const onKey = (event: KeyboardEvent) => {
    const keys = new Set([...surfaces].map((s) => s.key))
    // Not claimed: a host's own dev tools on the same key come and go with the panels.
    for (const key of keys) if (isToggleKey(event, key)) return void toggle(key)
  }
  return {
    register(surface) {
      if (!surfaces.size) win.addEventListener("keydown", onKey, true)
      surfaces.add(surface)
      return {
        shown: isShown(surface),
        dispose() {
          surfaces.delete(surface)
          if (!surfaces.size) win.removeEventListener("keydown", onKey, true)
        },
      }
    },
    toggle,
  }
}
