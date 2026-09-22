"use client"
import { cloneElement, useCallback, useEffect, useState, type ReactElement, type Ref } from "react"
import type { Schema } from "../core/schema.js"
import type { Controls } from "../core/store.js"

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
