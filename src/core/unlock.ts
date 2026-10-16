import { isTypingTarget } from "./keys.js"
import type { PanelModule } from "./store.js"

/** The Konami code: ↑ ↑ ↓ ↓ ← → ← → B A, as key names for `unlock({ sequence })`. */
export const KONAMI: readonly string[] = Object.freeze([
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
])

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

export interface UnlockOptions {
  /**
   * The panel code, loaded only once someone unlocks: `() => import("knobs/panel")`. Your bundler
   * splits it into its own chunk, so visitors who never unlock download none of it.
   */
  readonly panel: () => Promise<PanelModule>
  /**
   * Typed anywhere outside a text field: a word (`"knobs"` by default) or a list of key names
   * (`KONAMI`). Typing it again locks. `false`: none.
   */
  readonly sequence?: string | readonly string[] | false
  /** `?knobs` in the URL unlocks and `?knobs=off` locks (`"knobs"` by default). `false`: none. */
  readonly query?: string | false
  /**
   * Three quick taps or clicks in this corner of the window (`"top-right"` by default), for
   * phones. Three more lock. `false`: none.
   */
  readonly corner?: Corner | false
  /** Remember being unlocked in localStorage until it's locked again (default true). */
  readonly persist?: boolean
}

/** A page's secret unlock (see `unlock`). */
export interface Unlock {
  readonly unlocked: boolean
  unlock(): void
  lock(): void
  /** Stops listening for the sequence and the corner; the state stays as it is. */
  dispose(): void
}

/** The page's gate, shared by every copy of the core loaded on it. */
interface Gate {
  unlocked: boolean
  panel?: () => Promise<PanelModule>
  module?: PanelModule
  readonly listeners: Set<() => void>
}
const GATE = Symbol.for("knobs.unlock.v1")
const gate = (): Gate => {
  const holder = globalThis as unknown as Record<symbol, Gate | undefined>
  return (holder[GATE] ??= { unlocked: false, listeners: new Set() })
}

/** Whether this page has been unlocked (see `unlock`). */
export const isUnlocked = (): boolean =>
  (globalThis as unknown as Record<symbol, Gate | undefined>)[GATE]?.unlocked ?? false
/** The panel module an unlocked page mounts from, if `unlock` named one. */
export const unlockedPanel = (): (() => Promise<PanelModule>) | undefined =>
  isUnlocked() ? gate().panel : undefined
/** Calls `listener` whenever the page locks or unlocks. */
export function onUnlock(listener: () => void): () => void {
  const listeners = gate().listeners
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const UNLOCK_KEY = "knobs:unlocked"

/** The keys a sequence is typed with: a word's letters, or key names as given. */
export function sequenceKeys(sequence: string | readonly string[]): string[] {
  return typeof sequence === "string" ? [...sequence] : [...sequence]
}

const fold = (key: string) => (key.length === 1 ? key.toLowerCase() : key)

/**
 * Watches keys go by for `sequence`: true on the key that completes it. Letters match in either
 * case, a wrong key starts over (keeping what it could begin), and a pause longer than `gap` ms
 * forgets what was typed.
 */
export function sequenceMatcher(
  sequence: string | readonly string[],
  gap = 1500,
): (key: string, at: number) => boolean {
  const want = sequenceKeys(sequence).map(fold)
  let typed: string[] = []
  let last = -Infinity
  return (key, at) => {
    if (!want.length) return false
    if (at - last > gap) typed = []
    last = at
    typed.push(fold(key))
    if (typed.length > want.length) typed.shift()
    if (typed.length === want.length && typed.every((k, i) => k === want[i])) {
      typed = []
      return true
    }
    return false
  }
}

/**
 * What the URL says: `?knobs` (or `=1`, `=on`, `=true`) unlocks, `?knobs=off` (or `=0`, `=false`,
 * `=lock`) locks, and without it, undefined.
 */
export function queryUnlock(search: string, name: string): boolean | undefined {
  const params = new URLSearchParams(search)
  if (!params.has(name)) return undefined
  return !["off", "0", "false", "lock", "no"].includes((params.get(name) ?? "").toLowerCase())
}

/**
 * Whether a page view starts unlocked: the URL decides when it says, else what was remembered
 * (only when `persist`). `remember` is what to keep afterwards (undefined: leave it).
 */
export function resolveUnlock(input: {
  readonly query: boolean | undefined
  readonly stored: boolean
  readonly persist: boolean
}): { readonly unlocked: boolean; readonly remember: boolean | undefined } {
  const unlocked = input.query ?? (input.persist && input.stored)
  return { unlocked, remember: input.persist && input.query !== undefined ? unlocked : undefined }
}

/** Whether a point is in `corner` of a `width` × `height` window, within `size` px. */
export function inCorner(
  x: number,
  y: number,
  width: number,
  height: number,
  corner: Corner,
  size = 48,
): boolean {
  const left = corner.endsWith("left") ? x <= size : x >= width - size
  const top = corner.startsWith("top") ? y <= size : y >= height - size
  return left && top
}

/** Counts quick taps: true on the `count`th, each within `within` ms of the last. */
export function tapCounter(count = 3, within = 500): (at: number) => boolean {
  let taps = 0
  let last = -Infinity
  return (at) => {
    taps = at - last <= within ? taps + 1 : 1
    last = at
    if (taps < count) return false
    taps = 0
    return true
  }
}

const readStored = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(UNLOCK_KEY) === "1"
  } catch {
    return false
  }
}
const writeStored = (on: boolean) => {
  try {
    if (on) globalThis.localStorage?.setItem(UNLOCK_KEY, "1")
    else globalThis.localStorage?.removeItem(UNLOCK_KEY)
  } catch {
    /* Still unlocked for this page view. */
  }
}

/**
 * Lets this deploy be unlocked: stores stay locked to their shipped values and mount nothing
 * until someone types the sequence, opens the page with `?knobs`, or taps the corner three
 * times. Then they come alive (values from this browser's storage) and the panel code loads.
 * The same again locks, back to the shipped values. In development it changes nothing: stores
 * are live there anyway.
 */
export function unlock(options: UnlockOptions): Unlock {
  const g = gate()
  g.panel = options.panel
  const persist = options.persist !== false
  const query = options.query === undefined ? "knobs" : options.query
  const sequence = options.sequence === undefined ? "knobs" : options.sequence
  const corner = options.corner === undefined ? "top-right" : options.corner
  const win = typeof window === "undefined" ? undefined : window

  /** Tells the page in a brief status once the panel code is here. */
  const announce = (text: string) => {
    const load = g.module ? Promise.resolve(g.module) : g.panel?.()
    void load
      ?.then((m) => {
        g.module = m
        if (g.unlocked === (text === "knobs unlocked")) m.status?.(text)
      })
      .catch(() => {})
  }
  const set = (on: boolean, say: boolean) => {
    if (persist) writeStored(on)
    if (g.unlocked === on) return
    g.unlocked = on
    for (const listener of [...g.listeners]) listener()
    if (say) announce(on ? "knobs unlocked" : "knobs locked")
  }

  const start = resolveUnlock({
    query: query && win ? queryUnlock(win.location.search, query) : undefined,
    stored: persist && readStored(),
    persist,
  })
  if (start.remember !== undefined) writeStored(start.remember)
  set(start.unlocked || g.unlocked, false)

  const offs: (() => void)[] = []
  if (win && sequence !== false && sequenceKeys(sequence).length) {
    const typed = sequenceMatcher(sequence)
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat)
        return
      if (event.key === "Shift" || event.key === "CapsLock" || isTypingTarget(event.target)) return
      if (typed(event.key, event.timeStamp || performance.now())) set(!g.unlocked, true)
    }
    win.addEventListener("keydown", onKey, true)
    offs.push(() => win.removeEventListener("keydown", onKey, true))
  }
  if (win && corner) {
    let tapped = tapCounter()
    const onTap = (event: PointerEvent) => {
      if (!event.isPrimary) return
      // A tap anywhere else starts the count over.
      if (!inCorner(event.clientX, event.clientY, win.innerWidth, win.innerHeight, corner))
        return void (tapped = tapCounter())
      if (tapped(event.timeStamp || performance.now())) set(!g.unlocked, true)
    }
    win.addEventListener("pointerdown", onTap, { capture: true, passive: true })
    offs.push(() => win.removeEventListener("pointerdown", onTap, true))
  }
  return {
    get unlocked() {
      return g.unlocked
    },
    unlock: () => set(true, true),
    lock: () => set(false, true),
    dispose() {
      for (const off of offs.splice(0)) off()
    },
  }
}
