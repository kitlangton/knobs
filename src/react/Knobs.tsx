"use client"
import {
  cloneElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type Ref,
} from "react"
import {
  mountPanelAdapter,
  syncPanelLook,
  syncPanelValues,
  type KnobsPanelProps,
} from "../core/adapter.js"
import type { Schema } from "../core/schema.js"
import type { Controls } from "../core/store.js"

export type { KnobsPanelProps }

export function useKnobs<S extends Schema, E extends HTMLElement = HTMLElement>(
  controls: Controls<S>,
) {
  const [node, setNode] = useState<E | null>(null)
  useEffect(() => (node ? controls.attach(node) : undefined), [controls, node])
  return useCallback((element: E | null) => {
    setNode(element)
  }, [])
}
export function Knobs<S extends Schema>({
  controls,
  children,
}: {
  controls: Controls<S>
  children: ReactElement<{ ref?: Ref<HTMLElement> }>
}) {
  const attach = useKnobs(controls)
  const childRef: Ref<HTMLElement> | undefined =
    children.props.ref ?? Object.getOwnPropertyDescriptor(children, "ref")?.value
  const ref = useCallback(
    (node: HTMLElement | null) => {
      attach(node)
      if (typeof childRef === "function") return childRef(node)
      if (childRef) childRef.current = node
    },
    [attach, childRef],
  )
  return cloneElement(children, { ref })
}
export function KnobsPanel<S extends Schema>(props: KnobsPanelProps<S>) {
  const { controls, descriptors, values, land, theme, appearance, preset, density } = props
  const enabled = useSyncExternalStore(
    controls.subscribe,
    () => controls.enabled,
    () => false,
  )
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  latest.current = props
  useEffect(() => {
    if (!enabled || !ref.current) return
    return mountPanelAdapter(ref.current, controls, () => latest.current)
  }, [enabled, controls])
  useEffect(() => {
    if (!enabled) return
    syncPanelValues(controls, descriptors, values, Boolean(land))
  }, [enabled, controls, descriptors, values, land])
  useEffect(() => {
    syncPanelLook(ref.current, controls, { theme, appearance, preset }, density)
  }, [controls, theme, appearance, preset, density])
  if (!enabled) return null
  return <div ref={ref} data-knobs-mount={controls.id} />
}
