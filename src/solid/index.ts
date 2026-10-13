import {
  children as resolveChildren,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
  type JSX,
} from "solid-js"
import type { Choice, Schema, Values } from "../core/schema.js"
import type { Controls, MountPanelOptions } from "../core/store.js"

type ChoiceKey<S extends Schema> = {
  [K in keyof S]: S[K] extends Choice ? K : never
}[keyof S] &
  string

/**
 * Reactive Solid accessor for a controls store.
 * Returns `controls.getServerSnapshot()` (`locked`) during SSR, and updates reactively on the client.
 */
export function useControls<S extends Schema>(controls: Controls<S>): Accessor<Values<S>> {
  const [values, setValues] = createSignal<Values<S>>(controls.get())
  const unsubscribe = controls.subscribe(() => {
    setValues(() => controls.get())
  })
  onCleanup(unsubscribe)
  return values
}

/**
 * Solid ref callback (`ref={useKnobs(controls)}`) that attaches the floating tuning chip and panel.
 */
export function useKnobs<S extends Schema, E extends HTMLElement = HTMLElement>(
  controls: Controls<S>,
): (element: E) => void {
  return (element: E) => {
    createEffect(() => {
      const detach = controls.attach(element)
      onCleanup(detach)
    })
  }
}

/**
 * Solid `use:knobs={controls}` directive for attaching controls to an element.
 */
export function knobs<S extends Schema>(
  element: HTMLElement,
  accessor: Accessor<Controls<S>>,
): void {
  createEffect(() => {
    const detach = accessor().attach(element)
    onCleanup(detach)
  })
}

/**
 * Attaches `props.controls` directly to its single HTML child element without adding wrapper DOM.
 */
export function Knobs<S extends Schema>(props: {
  controls: Controls<S>
  children: JSX.Element
}): JSX.Element {
  const resolved = resolveChildren(() => props.children)
  createEffect(() => {
    const c = props.controls
    const node = resolved()
    const target = Array.isArray(node) ? node[0] : node
    if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
      const detach = c.attach(target)
      onCleanup(detach)
    }
  })
  return resolved as unknown as JSX.Element
}

/**
 * Mounts an inline `knobs` panel inside a Solid component tree.
 */
export function KnobsPanel<S extends Schema>(
  props: MountPanelOptions & { controls: Controls<S> },
): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  createEffect(() => {
    const c = props.controls
    host.dataset.knobsMount = c.id
    if (!c.enabled) {
      host.replaceChildren()
      return
    }
    const dispose = c.mount(host, {
      title: props.title,
      theme: props.theme,
      density: props.density,
      variants: props.variants,
      history: props.history,
      footer: props.footer,
      actions: props.actions,
      onClose: props.onClose,
    })
    onCleanup(dispose)
  })
  return host as unknown as JSX.Element
}

/**
 * In-place keyboard (`1–9`, `←/→`) and hover switcher for a choice field or presets/variants in Solid.
 */
export function VariantSwitcher<S extends Schema>(props: {
  controls: Controls<S>
  field?: ChoiceKey<S>
  label?: string
  children?: JSX.Element
}): JSX.Element {
  const values = useControls(props.controls)
  const fallbackText = createMemo(() => {
    const v = values()
    return props.field ? String(v[props.field]) : props.controls.matchingPreset()
  })
  if (typeof document === "undefined" || !props.controls.enabled) {
    return (() => props.children ?? fallbackText()) as unknown as JSX.Element
  }
  const wrapper = document.createElement("div")
  const resolved = resolveChildren(() => props.children ?? fallbackText())
  createEffect(() => {
    const nodes = resolved.toArray()
    wrapper.replaceChildren(
      ...nodes.map((n) =>
        typeof Node !== "undefined" && n instanceof Node
          ? n
          : document.createTextNode(String(n ?? "")),
      ),
    )
  })
  createEffect(() => {
    const c = props.controls
    const field = props.field
    const label = props.label
    if (!c.enabled) return
    let disposed = false
    let detach: (() => void) | undefined
    void import("../panel/switcher.js").then((mod) => {
      if (!disposed && c.enabled) {
        detach = mod.attachVariantSwitcher(wrapper, c, { field, label })
      }
    })
    onCleanup(() => {
      disposed = true
      detach?.()
    })
  })
  return wrapper as unknown as JSX.Element
}
