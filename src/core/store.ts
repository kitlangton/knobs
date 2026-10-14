import { formatCode, type CodeFormat } from "./code.js"
import { randomValues } from "./random.js"
import { equal, normalize, same, type Schema, type State, type Values } from "./schema.js"
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
  reset(): void
  resetKey(key: keyof S & string): void
  resetGroup(group: string): void
  isModified(key?: keyof S & string): boolean
  modified(): Partial<Values<S>>
  randomize(): void
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
  // Unchanged springs, points and curves keep their identity, so memoized consumers skip them.
  const keep = (previous: Values<S>, next: Values<S>) =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, same(previous[k], v) ? previous[k] : v]),
      ),
    ) as Values<S>
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
  function set(
    patch: Partial<Values<S>>,
    setOpts?: { coalesce?: boolean; source?: ChangeSource; key?: string; group?: string },
  ) {
    if (!enabled()) return
    const previous = get()
    const next = keep(previous, normalize(schema, { ...previous, ...patch }))
    if (equal(current, next)) return
    if (!setOpts?.coalesce || past.length === 0) {
      past.push(previous)
      if (past.length > HISTORY) past.shift()
    }
    future.length = 0
    commit(next)
    const diff: Record<string, unknown> = {}
    for (const k of Object.keys(schema)) {
      if (!same(previous[k], next[k])) diff[k] = next[k]
    }
    options.onChange?.(diff as Partial<Values<S>>, next, {
      source: setOpts?.source ?? "local",
      ...(setOpts?.coalesce ? { coalesce: true } : {}),
      ...(setOpts?.key ? { key: setOpts.key } : {}),
      ...(setOpts?.group ? { group: setOpts.group } : {}),
    })
  }
  function sync(values: Partial<Values<S>>, syncOpts?: { replace?: boolean }) {
    if (!enabled()) return
    const previous = get()
    const base = syncOpts?.replace ? locked : previous
    const next = keep(previous, normalize(schema, { ...base, ...values }))
    if (equal(current, next)) return
    commit(next)
    options.onChange?.(values, next, { source: "remote" })
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
    undo() {
      const previous = past.pop()
      if (!previous) return
      const before = get()
      future.push(before)
      commit(previous)
      const diff: Record<string, unknown> = {}
      for (const k of Object.keys(schema)) {
        if (!same(before[k], previous[k])) diff[k] = previous[k]
      }
      options.onChange?.(diff as Partial<Values<S>>, previous, { source: "undo" })
    },
    redo() {
      const next = future.pop()
      if (!next) return
      const before = get()
      past.push(before)
      commit(next)
      const diff: Record<string, unknown> = {}
      for (const k of Object.keys(schema)) {
        if (!same(before[k], next[k])) diff[k] = next[k]
      }
      options.onChange?.(diff as Partial<Values<S>>, next, { source: "redo" })
    },
    getServerSnapshot: () => locked,
    subscribe(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    reset() {
      if (!enabled()) return
      set(locked, { source: "reset" })
      options.onReset?.({})
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
    randomize: () => set(randomValues(schema), { source: "randomize" }),
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
