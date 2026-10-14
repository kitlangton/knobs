"use client"
import { useSyncExternalStore } from "react"
import type { Schema, Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"

export function useControls<S extends Schema>(controls: Controls<S>): Values<S> {
  return useSyncExternalStore(controls.subscribe, controls.get, controls.getServerSnapshot)
}

/**
 * One key's value, re-rendering the component only when that key changes.
 */
export function useValue<S extends Schema, K extends keyof Values<S> & string>(
  controls: Controls<S>,
  key: K,
): Values<S>[K] {
  return useSyncExternalStore(
    controls.subscribe,
    () => controls.get()[key],
    () => controls.getServerSnapshot()[key],
  )
}

/**
 * Whether a key (or, without one, anything) differs from its default: a "modified" dot beside a heading.
 */
export function useModified<S extends Schema>(
  controls: Controls<S>,
  key?: keyof S & string,
): boolean {
  return useSyncExternalStore(
    controls.subscribe,
    () => controls.isModified(key),
    () => false,
  )
}
