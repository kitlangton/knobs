"use client"
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import type { ChoiceKey } from "../core/adapter.js"
import type { Schema } from "../core/schema.js"
import type { Controls } from "../core/store.js"
import type { Variant } from "../core/variants.js"
import { attachVariantSwitcher, getSwitcherOptions } from "../panel/switcher.js"
import { useControls } from "./useControls.js"

const empty: readonly Variant<never>[] = Object.freeze([])

export function VariantSwitcher<S extends Schema>({
  controls,
  field,
  children,
  label,
}: {
  controls: Controls<S>
  field?: ChoiceKey<S>
  children?: ReactNode
  label?: string
}) {
  const values = useControls(controls)
  const enabled = useSyncExternalStore(
    controls.subscribe,
    () => controls.enabled,
    () => false,
  )
  useSyncExternalStore(
    controls.subscribe,
    () => {
      if (field || !controls.enabled) return empty
      try {
        return controls.variants.list()
      } catch {
        return empty
      }
    },
    () => empty,
  )
  const ref = useRef<HTMLDivElement>(null)
  const { activeName } = getSwitcherOptions(controls, field)
  useEffect(() => {
    if (!ref.current || !enabled) return
    return attachVariantSwitcher(ref.current, controls, { field, label })
  }, [controls, enabled, field, label])
  if (!enabled) return <>{children ?? (field ? String(values[field]) : "default")}</>
  return (
    <div
      ref={ref}
      data-knobs-switcher={controls.id}
      role="group"
      tabIndex={0}
      aria-label={
        label ??
        `${controls.id} ${field ?? "variant"}: ${activeName}. Use 1–9 or left/right arrows.`
      }
    >
      {children ?? activeName}
    </div>
  )
}
