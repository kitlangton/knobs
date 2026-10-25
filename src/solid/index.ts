import {
  children as resolveChildren,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  type Accessor,
  type JSX,
} from "solid-js"
import {
  mountPanelAdapter,
  syncPanelLook,
  syncPanelValues,
  type ChoiceKey,
  type KnobsPanelProps,
} from "../core/adapter.js"
import { same, type Schema, type Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"

export type { KnobsPanelProps }

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
 * One key's value as an accessor that changes only when that key does, so a component reading
 * it re-runs for its own row and no other.
 */
export function useValue<S extends Schema, K extends keyof Values<S> & string>(
  controls: Controls<S>,
  key: K,
): Accessor<Values<S>[K]> {
  const [value, setValue] = createSignal(controls.get()[key], { equals: same })
  onCleanup(controls.subscribe(() => setValue(() => controls.get()[key])))
  return value
}

/**
 * Whether a key (or, without one, anything) differs from its default, as an accessor that
 * changes only when the answer does: a "modified" dot beside a heading.
 */
export function useModified<S extends Schema>(
  controls: Controls<S>,
  key?: keyof S & string,
): Accessor<boolean> {
  const [modified, setModified] = createSignal(controls.isModified(key))
  onCleanup(controls.subscribe(() => setModified(controls.isModified(key))))
  return modified
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
 * Mounts an inline `knobs` panel inside a Solid component tree. The panel mounts once per
 * `controls`; `descriptors` and `values` flow into it as updates, so a change touches only the rows
 * it changes and the panel never re-renders as a whole.
 */
export function KnobsPanel<S extends Schema>(props: KnobsPanelProps<S>): JSX.Element {
  if (typeof document === "undefined") return null as unknown as JSX.Element
  const host = document.createElement("div")
  createEffect(() => {
    const c = props.controls
    // Embedding or showing other groups builds the panel afresh.
    void props.embed
    void props.groups?.join("\n")
    host.dataset.knobsMount = c.id
    if (!c.enabled) {
      host.replaceChildren()
      return
    }
    const dispose = untrack(() => mountPanelAdapter(host, c, () => props))
    onCleanup(dispose)
  })
  createEffect(() => {
    syncPanelValues(props.controls, props.descriptors, props.values, Boolean(props.land))
  })
  createEffect(() => {
    syncPanelLook(
      host,
      props.controls,
      { theme: props.theme, appearance: props.appearance, preset: props.preset },
      props.density,
    )
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
