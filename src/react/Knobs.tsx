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
import type { Schema } from "../core/schema.js"
import type { Controls, MountPanelOptions } from "../core/store.js"

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
export function KnobsPanel<S extends Schema>({
  controls,
  title,
  theme,
  density,
  renderer,
  variants,
  history,
  footer,
  actions,
  onClose,
}: MountPanelOptions & {
  controls: Controls<S>
}) {
  const enabled = useSyncExternalStore(
    controls.subscribe,
    () => controls.enabled,
    () => false,
  )
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!enabled || !ref.current) return
    return controls.mount(ref.current, {
      title,
      theme,
      density,
      renderer,
      variants,
      history,
      footer,
      actions,
      onClose,
    })
  }, [
    enabled,
    controls,
    title,
    theme,
    density,
    renderer,
    variants,
    history,
    footer,
    actions,
    onClose,
  ])
  if (!enabled) return null
  return <div ref={ref} data-knobs-mount={controls.id} />
}
