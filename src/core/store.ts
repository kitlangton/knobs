import { formatCode, type CodeFormat } from "./code.js"
import { mutateValues } from "./mutate.js"
import { randomValues } from "./random.js"
import {
  equal,
  normalize,
  normalizeField,
  same,
  type Schema,
  type State,
  type Values,
} from "./schema.js"
import { browserStorage, storageKey, type StoragePort } from "./storage.js"
import { createVariants, type Variants } from "./variants.js"

declare const __KNOBS_DEV__: boolean
export type ThemeMode = "dark" | "light" | "auto"
export type DensityMode = "compact" | "default" | "comfortable"
export type RendererMode = "gpu" | "dom" | "auto"
export type ChangeSource =
  | "local"
  | "remote"
  | "reset"
  | "preset"
  | "variant"
  | "undo"
  | "redo"
  | "randomize"
  | "mutate"
  | "compare"
export interface ChangeMeta {
  readonly source: ChangeSource
  readonly coalesce?: boolean
  readonly key?: string
  readonly group?: string
}
export interface ControlAction<V = State> {
  readonly id?: string
  readonly label: string
  readonly group?: string
  readonly shortcut?: string
  run(values: V, controls: Controls<any>): void | string | Promise<void | string>
}
export interface MountPanelOptions {
  readonly title?: string | false
  readonly theme?: ThemeMode
  readonly density?: DensityMode
  readonly renderer?: RendererMode
  readonly variants?: boolean
  readonly history?: boolean
  readonly footer?: boolean
  readonly actions?: readonly ControlAction<any>[]
  readonly onClose?: () => void
}
export interface ControlsOptions<S extends Schema> {
  enabled?: boolean | (() => boolean)
  storage?: StoragePort | null
  presets?: Readonly<Record<string, Partial<Values<S>>>>
  actions?: readonly ControlAction<Values<S>>[]
  theme?: ThemeMode
  density?: DensityMode
  renderer?: RendererMode
  onChange?: (patch: Partial<Values<S>>, values: Values<S>, meta: ChangeMeta) => void
  onReset?: (target: { key?: keyof S & string; group?: string }) => void
}
export interface Controls<S extends Schema = Schema> {
  readonly id: string
  readonly schema: S
  readonly locked: Values<S>
  readonly enabled: boolean
  readonly storage: StoragePort | null
  readonly presets: Readonly<Record<string, Values<S>>>
  readonly variants: Variants<Values<S>>
  readonly actions: readonly ControlAction<Values<S>>[]
  readonly theme: ThemeMode
  readonly density: DensityMode
  readonly renderer: RendererMode
  readonly error: string | null
  get(): Values<S>
  getServerSnapshot(): Values<S>
  /** Apply a change. `coalesce` folds it into the previous history entry (used while dragging). */
  set(
    patch: Partial<Values<S>>,
    options?: { coalesce?: boolean; source?: ChangeSource; key?: string; group?: string },
  ): void
  /** Apply external/remote state without recording local undo history or emitting a local change. */
  sync(values: Partial<Values<S>>, options?: { replace?: boolean }): void
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  subscribe(cb: () => void): () => void
  /** Back to the defaults: every field, or only `keys`. Locks don't apply. */
  reset(keys?: readonly (keyof S & string)[]): void
  resetKey(key: keyof S & string): void
  resetGroup(group: string): void
  isModified(key?: keyof S & string): boolean
  modified(): Partial<Values<S>>
  /** Random values for every unlocked field, or the unlocked ones among `keys`. One undo step. */
  randomize(keys?: readonly (keyof S & string)[]): void
  /** Small changes around the current values instead of a re-roll; skips locked fields. */
  mutate(keys?: readonly (keyof S & string)[]): void
  /** Keeps fields out of Random and Mutate (or lets them back in). Saved with the values. */
  lock(keys: (keyof S & string) | readonly (keyof S & string)[], locked?: boolean): void
  isLocked(key: keyof S & string): boolean
  /**
   * While held, `get()` shows the values from before the last change (the previous undo entry);
   * releasing restores the current ones. Nothing is recorded or stored; `onChange` reports
   * `source: "compare"` both ways.
   */
  compare(hold: boolean): void
  readonly comparing: boolean
  preset(id: string): void
  matchingPreset(): string
  code(format?: CodeFormat, values?: Values<S>): string
  attach(element: HTMLElement): () => void
  mount(container: HTMLElement, options?: MountPanelOptions): () => void
}
export function defineControls<const S extends Schema>(
  id: string,
  input: S,
  options: ControlsOptions<S> = {},
): Controls<S> {
  if (!id.trim()) throw new Error("Controls need a stable, nonempty id.")
  const schema = Object.freeze({ ...input }) as S
  const locked = normalize(schema, {})
  const actions = Object.freeze([...(options.actions ?? [])])
  const theme: ThemeMode = options.theme ?? "dark"
  const density: DensityMode = options.density ?? "default"
  const renderer: RendererMode = options.renderer ?? "auto"
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
  let locks = new Set<string>()
  /** The earlier values shown while compare is held. */
  let comparing: Values<S> | null = null
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
  /** The committed values, read from storage on first use. */
  function load() {
    if (!read) {
      read = true
      try {
        const raw = storage()?.getItem(stateKey)
        if (raw) {
          const data = JSON.parse(raw)
          if (data?.version === 1) {
            current = normalize(schema, data.values)
            if (Array.isArray(data.locks))
              locks = new Set(
                data.locks.filter(
                  (k: unknown) => typeof k === "string" && Object.hasOwn(schema, k),
                ),
              )
          }
        }
      } catch (cause) {
        error = String(cause)
      }
    }
    return current
  }
  function get() {
    if (!enabled()) return locked
    return comparing ?? load()
  }
  function persist() {
    try {
      storage()?.setItem(
        stateKey,
        JSON.stringify({
          version: 1,
          values: current,
          ...(locks.size ? { locks: [...locks] } : {}),
        }),
      )
      error = null
    } catch (cause) {
      error = String(cause)
    }
  }
  function commit(next: Values<S>) {
    current = next
    persist()
    notify()
  }
  function changes(from: Values<S>, to: Values<S>) {
    const diff: Record<string, unknown> = {}
    for (const k of Object.keys(schema)) if (!same(from[k], to[k])) diff[k] = to[k]
    return diff as Partial<Values<S>>
  }
  /** Lets go of a held compare, so any real change starts from the current values. */
  function release() {
    if (!comparing) return
    const shown = comparing
    comparing = null
    options.onChange?.(changes(shown, current), current, { source: "compare" })
    notify()
  }
  const unlocked = (keys?: readonly string[]) => {
    load()
    return (keys ?? Object.keys(schema)).filter((k) => Object.hasOwn(schema, k) && !locks.has(k))
  }
  function applyPatch(base: Values<S>, previous: Values<S>, patch: Partial<Values<S>>) {
    const out: Record<string, unknown> = { ...base }
    const diff: Record<string, unknown> = {}
    let changed = false
    if (base === previous) {
      for (const k of Object.keys(patch)) {
        if (!Object.hasOwn(schema, k)) continue
        const raw = (patch as Record<string, unknown>)[k]
        const val = raw === undefined ? previous[k] : normalizeField(schema[k]!, raw)
        if (!same(previous[k], val)) {
          out[k] = val
          diff[k] = val
          changed = true
        }
      }
      return changed ? { next: Object.freeze(out) as Values<S>, diff } : null
    }
    for (const k of Object.keys(patch)) {
      if (!Object.hasOwn(schema, k)) continue
      const raw = (patch as Record<string, unknown>)[k]
      const val = raw === undefined ? base[k] : normalizeField(schema[k]!, raw)
      out[k] = same(previous[k], val) ? previous[k] : val
    }
    for (const k of Object.keys(schema)) {
      if (!same(previous[k], out[k])) {
        diff[k] = out[k]
        changed = true
      } else {
        out[k] = previous[k]
      }
    }
    return changed ? { next: Object.freeze(out) as Values<S>, diff } : null
  }
  function set(
    patch: Partial<Values<S>>,
    setOpts?: { coalesce?: boolean; source?: ChangeSource; key?: string; group?: string },
  ) {
    if (!enabled()) return
    release()
    const previous = load()
    const applied = applyPatch(previous, previous, patch)
    if (!applied) return
    const { next, diff } = applied
    if (!setOpts?.coalesce || past.length === 0) {
      past.push(previous)
      if (past.length > HISTORY) past.shift()
    }
    future.length = 0
    commit(next)
    options.onChange?.(diff as Partial<Values<S>>, next, {
      source: setOpts?.source ?? "local",
      ...(setOpts?.coalesce ? { coalesce: true } : {}),
      ...(setOpts?.key ? { key: setOpts.key } : {}),
      ...(setOpts?.group ? { group: setOpts.group } : {}),
    })
  }
  function sync(values: Partial<Values<S>>, syncOpts?: { replace?: boolean }) {
    if (!enabled()) return
    release()
    const previous = load()
    const base = syncOpts?.replace ? locked : previous
    const applied = applyPatch(base, previous, values)
    if (!applied) return
    commit(applied.next)
    options.onChange?.(values, applied.next, { source: "remote" })
  }
  const controls: Controls<S> = {
    id,
    schema,
    locked,
    presets,
    actions,
    theme,
    density,
    renderer,
    get,
    set,
    sync,
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
    get comparing() {
      return comparing !== null
    },
    undo() {
      release()
      const previous = past.pop()
      if (!previous) return
      const before = load()
      future.push(before)
      commit(previous)
      options.onChange?.(changes(before, previous), previous, { source: "undo" })
    },
    redo() {
      release()
      const next = future.pop()
      if (!next) return
      const before = load()
      past.push(before)
      commit(next)
      options.onChange?.(changes(before, next), next, { source: "redo" })
    },
    getServerSnapshot: () => locked,
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    reset(keys) {
      if (!enabled()) return
      if (!keys) {
        set(locked, { source: "reset" })
        options.onReset?.({})
        return
      }
      const patch: Record<string, unknown> = {}
      for (const k of keys) if (Object.hasOwn(schema, k)) patch[k] = locked[k]
      set(patch as Partial<Values<S>>, { source: "reset" })
      for (const key of Object.keys(patch)) options.onReset?.({ key })
    },
    resetKey(key) {
      if (!enabled()) return
      if (!Object.hasOwn(schema, key)) throw new Error(`Unknown control key: ${key}`)
      set({ [key]: locked[key] } as Partial<Values<S>>, { source: "reset", key })
      options.onReset?.({ key })
    },
    resetGroup(group) {
      if (!enabled()) return
      const patch: Record<string, unknown> = {}
      for (const [k, field] of Object.entries(schema)) {
        if (field.group === group) patch[k] = locked[k]
      }
      set(patch as Partial<Values<S>>, { source: "reset", group })
      options.onReset?.({ group })
    },
    isModified(key) {
      const cur = get()
      if (key !== undefined) return !same(cur[key], locked[key])
      return !equal(cur, locked)
    },
    modified() {
      const cur = get()
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(schema)) {
        if (!same(cur[k], locked[k])) out[k] = cur[k]
      }
      return Object.freeze(out) as Partial<Values<S>>
    },
    randomize(keys) {
      if (!enabled()) return
      const pool = unlocked(keys)
      if (pool.length === 0) return
      const all = randomValues(schema) as Record<string, unknown>
      const patch = Object.fromEntries(pool.map((k) => [k, all[k]]))
      set(patch as Partial<Values<S>>, { source: "randomize" })
    },
    mutate(keys) {
      if (!enabled()) return
      release()
      const pool = unlocked(keys)
      if (pool.length === 0) return
      set(mutateValues(schema, load(), pool) as Partial<Values<S>>, { source: "mutate" })
    },
    lock(keys, on = true) {
      if (!enabled()) return
      load()
      let changed = false
      for (const key of typeof keys === "string" ? [keys] : keys) {
        if (!Object.hasOwn(schema, key)) throw new Error(`Unknown control key: ${key}`)
        if (locks.has(key) === on) continue
        if (on) locks.add(key)
        else locks.delete(key)
        changed = true
      }
      if (!changed) return
      persist()
      notify()
    },
    isLocked(key) {
      if (!enabled()) return false
      load()
      return locks.has(key)
    },
    compare(hold) {
      if (!enabled()) return
      if (!hold) return release()
      const before = past.at(-1)
      const now = load()
      if (comparing || !before || equal(before, now)) return
      comparing = before
      options.onChange?.(changes(now, before), before, { source: "compare" })
      notify()
    },
    preset(id) {
      if (!Object.hasOwn(presets, id)) throw new Error(`Unknown preset: ${id}`)
      set(presets[id], { source: "preset" })
    },
    matchingPreset: () => Object.keys(presets).find((id) => equal(get(), presets[id])) ?? "custom",
    code: (format, values) => formatCode(values ?? get(), format),
    variants: createVariants(
      schema,
      id,
      storageKey(id, "variants"),
      storage,
      get,
      (v) => set(v, { source: "variant" }),
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
    mount(container, mountOptions) {
      if (typeof __KNOBS_DEV__ === "undefined" || __KNOBS_DEV__) {
        if (!enabled()) return () => {}
        let disposed = false
        let panel: { dispose(): void } | undefined
        void import("../panel/panel.js")
          .then((module) => {
            if (!disposed && enabled()) panel = module.mountPanel(controls, container, mountOptions)
          })
          .catch((cause) => {
            error = String(cause)
            notify()
          })
        return () => {
          disposed = true
          panel?.dispose()
        }
      }
      return () => {}
    },
  }
  return Object.freeze(controls)
}
