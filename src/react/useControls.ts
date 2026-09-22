"use client"
import { useSyncExternalStore } from "react"
import type { Schema, Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"

export function useControls<S extends Schema>(controls: Controls<S>): Values<S> {
  return useSyncExternalStore(controls.subscribe, controls.get, controls.getServerSnapshot)
}
