import { formatCode, type CodeFormat } from "./code.js"
import { randomValues } from "./random.js"
import { equal, normalize, type Schema, type Values } from "./schema.js"
import { browserStorage, storageKey, type StoragePort } from "./storage.js"
import { createVariants, type Variants } from "./variants.js"

declare const __KNOBS_DEV__: boolean
export interface ControlsOptions<S extends Schema> {
  enabled?: boolean | (() => boolean)
  storage?: StoragePort | null
  presets?: Readonly<Record<string, Partial<Values<S>>>>
}
export interface Controls<S extends Schema = Schema> {
  readonly id: string
  readonly schema: S
  readonly locked: Values<S>
  readonly enabled: boolean
  readonly storage: StoragePort | null
  readonly presets: Readonly<Record<string, Values<S>>>
  readonly variants: Variants<Values<S>>
  readonly error: string | null
  get(): Values<S>
  getServerSnapshot(): Values<S>
  /** Apply a change. `coalesce` folds it into the previous history entry (used while dragging). */
  set(patch: Partial<Values<S>>, options?: { coalesce?: boolean }): void
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  subscribe(cb: () => void): () => void
  reset(): void
  randomize(): void
  preset(id: string): void
  matchingPreset(): string
  code(format?: CodeFormat, values?: Values<S>): string
  attach(element: HTMLElement): () => void
}
export function defineControls<const S extends Schema>(
  id: string,
  input: S,
  options: ControlsOptions<S> = {},
): Controls<S> {
  if (!id.trim()) throw new Error("Controls need a stable, nonempty id.")
  const schema = Object.freeze({ ...input }) as S
  const locked = normalize(schema, {})
  const enabled = () =>
    (typeof __KNOBS_DEV__ === "undefined" || __KNOBS_DEV__) &&
    (typeof options.enabled === "function"
      ? options.enabled()
      : (options.enabled ??
        (typeof location !== "undefined" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))))
  const storage = () => (options.storage === undefined ? browserStorage() : options.storage)
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const cb of [...listeners]) cb()
  }
  let current = locked
  let read = false
  let error: string | null = null
  const past: Values<S>[] = []
  const future: Values<S>[] = []
  const HISTORY = 100
  const stateKey = storageKey(id, "state")
  const presets = Object.freeze(
    Object.fromEntries([
      ["default", locked],
      ...Object.entries(options.presets ?? {}).map(([id, patch]) => {
        if (id === "default" || id === "custom") throw new Error(`Reserved preset id: ${id}`)
        return [id, normalize(schema, { ...locked, ...patch })]
      }),
    ]),
  ) as Readonly<Record<string, Values<S>>>
  function get() {
    if (!enabled()) return locked
    if (!read) {
      read = true
      try {
        const raw = storage()?.getItem(stateKey)
        if (raw) {
          const data = JSON.parse(raw)
          if (data?.version === 1) current = normalize(schema, data.values)
        }
      } catch (cause) {
        error = String(cause)
      }
    }
    return current
  }
  function commit(next: Values<S>) {
    current = next
    try {
      storage()?.setItem(stateKey, JSON.stringify({ version: 1, values: next }))
      error = null
    } catch (cause) {
      error = String(cause)
    }
    notify()
  }
  function set(patch: Partial<Values<S>>, options?: { coalesce?: boolean }) {
    if (!enabled()) return
    const previous = get()
    const next = normalize(schema, { ...previous, ...patch })
    if (equal(current, next)) return
    if (!options?.coalesce || past.length === 0) {
      past.push(previous)
      if (past.length > HISTORY) past.shift()
    }
    future.length = 0
    commit(next)
  }
  const controls: Controls<S> = {
    id,
    schema,
    locked,
    presets,
    get,
    set,
    get enabled() {
      return enabled()
    },
    get storage() {
      return storage()
    },
    get error() {
      return error
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    undo() {
      const previous = past.pop()
      if (!previous) return
      future.push(get())
      commit(previous)
    },
    redo() {
      const next = future.pop()
      if (!next) return
      past.push(get())
      commit(next)
    },
    getServerSnapshot: () => locked,
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    reset: () => set(locked),
    randomize: () => set(randomValues(schema)),
    preset(id) {
      if (!Object.hasOwn(presets, id)) throw new Error(`Unknown preset: ${id}`)
      set(presets[id])
    },
    matchingPreset: () => Object.keys(presets).find((id) => equal(get(), presets[id])) ?? "custom",
    code: (format, values) => formatCode(values ?? get(), format),
    variants: createVariants(
      schema,
      id,
      storageKey(id, "variants"),
      storage,
      get,
      set,
      notify,
      enabled,
    ),
    attach(element) {
      if (typeof __KNOBS_DEV__ === "undefined" || __KNOBS_DEV__) {
        if (!enabled()) return () => {}
        let disposed = false
        let detach: (() => void) | undefined
        void import("../panel/attach.js")
          .then((module) => {
            if (!disposed && enabled()) detach = module.attach(controls, element)
          })
          .catch((cause) => {
            error = String(cause)
            notify()
          })
        return () => {
          disposed = true
          detach?.()
        }
      }
      return () => {}
    },
  }
  return Object.freeze(controls)
}
