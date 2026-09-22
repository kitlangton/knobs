"use client"
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react"
import { equal, type Choice, type Schema, type Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"
import type { Variant } from "../core/variants.js"
import { useControls } from "./useControls.js"

type ChoiceKey<S extends Schema> = { [K in keyof S]: S[K] extends Choice ? K : never }[keyof S] &
  string
let hoveredPreview: { element: HTMLElement; target: Element } | null = null
const empty: readonly Variant<never>[] = Object.freeze([])
const interactive = "a[href],button,input,select,textarea,[contenteditable=true]"

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
  const variants = useSyncExternalStore(
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
  const definition = field ? controls.schema[field] : undefined
  const options: { id: string; name: string; values?: Values<S>; choose(): void }[] =
    definition?.kind === "choice"
      ? definition.options.map((value) => ({
          id: value,
          name: value,
          choose: () => controls.set({ [field!]: value } as Partial<typeof values>),
        }))
      : [
          ...Object.entries(controls.presets).map(([id, preset]) => ({
            id: `p:${id}`,
            name: id,
            values: preset,
            choose: () => controls.preset(id),
          })),
          ...variants.map((v) => ({
            id: `v:${v.id}`,
            name: v.name ?? v.id.slice(0, 8),
            values: v.values,
            choose: () => controls.variants.load(v.id),
          })),
        ]
  const index = field
    ? options.findIndex((o) => o.id === values[field])
    : options.findIndex((o) => o.values !== undefined && equal(o.values, values))
  const cycle = (direction: number) =>
    options[(index + direction + options.length) % options.length]?.choose()
  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const focused = document.activeElement?.closest("[data-knobs-switcher]")
      const active = hoveredPreview?.element ?? focused
      if (
        active !== node ||
        (event.target instanceof Element && event.target.closest(interactive)) ||
        hoveredPreview?.target.closest(interactive)
      )
        return
      if (window.getSelection()?.isCollapsed === false) return
      const selection = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1
      if (selection >= 0 && options[selection]) {
        event.preventDefault()
        options[selection].choose()
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        cycle(event.key === "ArrowLeft" ? -1 : 1)
      }
    }
    window.addEventListener("keydown", keydown)
    return () => {
      window.removeEventListener("keydown", keydown)
    }
  })
  useEffect(() => {
    const node = ref.current
    return () => {
      if (hoveredPreview?.element === node) hoveredPreview = null
    }
  }, [enabled])
  if (!enabled) return <>{children ?? (field ? String(values[field]) : "default")}</>
  return (
    <div
      ref={ref}
      data-knobs-switcher={controls.id}
      role="group"
      tabIndex={0}
      aria-label={
        label ??
        `${controls.id} ${field ?? "variant"}: ${options[index]?.name ?? "custom"}. Use 1–9 or left/right arrows.`
      }
      onPointerOver={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-knobs-switcher]") === event.currentTarget
        )
          hoveredPreview = { element: event.currentTarget, target: event.target }
      }}
      onPointerLeave={(event) => {
        if (hoveredPreview?.element !== event.currentTarget) return
        const target = event.relatedTarget instanceof Element ? event.relatedTarget : null
        const parent = target?.closest<HTMLElement>("[data-knobs-switcher]")
        hoveredPreview = parent && target ? { element: parent, target } : null
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          cycle(1)
        }
      }}
    >
      {children ?? options[index]?.name ?? "custom"}
    </div>
  )
}
