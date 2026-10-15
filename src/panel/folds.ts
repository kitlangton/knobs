import { storageKey, type StoragePort } from "../core/storage.js"

/** What a page remembers folded or open: its sections, its group cards and its custom cards. */
export type FoldKind = "sections" | "groups" | "cards"

export interface FoldMemory {
  /** What the user last chose for it, if anything. */
  get(kind: FoldKind, id: string): boolean | undefined
  set(kind: FoldKind, id: string, folded: boolean): void
}

/**
 * A page's folds, kept in the store's storage by its id, so they come back after a reload and in
 * a new tab. `null` storage remembers nothing.
 */
export function foldMemory(id: string, storage: () => StoragePort | null): FoldMemory {
  const key = storageKey(id, "folds")
  const read = (): Partial<Record<FoldKind, Record<string, boolean>>> => {
    try {
      const data = JSON.parse(storage()?.getItem(key) ?? "{}")
      return data && typeof data === "object" ? data : {}
    } catch {
      return {}
    }
  }
  return {
    get(kind, at) {
      const value = read()[kind]?.[at]
      return typeof value === "boolean" ? value : undefined
    },
    set(kind, at, folded) {
      const port = storage()
      if (!port) return
      const data = read()
      if (data[kind]?.[at] === folded) return
      data[kind] = { ...data[kind], [at]: folded }
      try {
        port.setItem(key, JSON.stringify(data))
      } catch {
        /* Storage that's full or refused just forgets. */
      }
    },
  }
}
