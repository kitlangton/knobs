import type { ControlDescriptor, RemoteControls } from "./remote.js"
import type { Choice, Schema, State, Values } from "./schema.js"
import type { Controls, DensityMode, MountPanelOptions } from "./store.js"
import { applyLook, type LookOptions, resolveLook } from "./appearance.js"

export type ChoiceKey<S extends Schema> = {
  [K in keyof S]: S[K] extends Choice ? K : never
}[keyof S] &
  string

export type KnobsPanelProps<S extends Schema = Schema> = MountPanelOptions & {
  controls: Controls<S>
  /**
   * Remote controls only: the descriptors to show. A new array swaps rows in place
   * (`remote.update`); the same array with new `values` just syncs them.
   */
  descriptors?: readonly ControlDescriptor[]
  /** The values to show, from your own state. Keys in hand keep theirs until let go. */
  values?: State
  /** While true, a different item is arriving: values land without springing or rolling. */
  land?: boolean
}

/** The look a panel takes: its props' over its store's. */
export const panelLook = <S extends Schema>(controls: Controls<S>, look: LookOptions = {}) =>
  resolveLook(look, resolveLook({ theme: controls.theme, appearance: controls.appearance }))

/** Restyles the mounted panel in place (theme, appearance, preset, density), so its tokens glide. */
export function syncPanelLook<S extends Schema>(
  host: HTMLElement | null | undefined,
  controls: Controls<S>,
  look: LookOptions = {},
  density?: DensityMode,
): void {
  const panel = host?.firstElementChild as HTMLElement | null | undefined
  if (!panel) return
  applyLook(panel, panelLook(controls, look))
  panel.dataset.density =
    density ?? (panel.hasAttribute("data-embed") ? "compact" : controls.density)
}

export function syncPanelValues<S extends Schema>(
  controls: Controls<S>,
  descriptors?: readonly ControlDescriptor[],
  values?: State,
  land = false,
): void {
  if (!controls.enabled || (!descriptors && !values)) return
  if (descriptors && "update" in controls)
    (controls as unknown as RemoteControls).update(descriptors, values, { land })
  else if (values) controls.sync(values as Partial<Values<S>>, { replace: true, land })
}

export function mountPanelAdapter<S extends Schema>(
  host: HTMLElement,
  controls: Controls<S>,
  getProps: () => KnobsPanelProps<S>,
): () => void {
  // Every mount option passes through as given; theme, appearance and density restyle the mounted
  // panel in place (`syncPanelLook`), so its tokens glide.
  const { controls: _, descriptors: __, values: ___, land: ____, ...p } = getProps()
  return controls.mount(host, {
    ...p,
    copy: p.copy ? () => getProps().copy?.() ?? controls.code() : undefined,
    onClose: p.onClose ? () => getProps().onClose?.() : undefined,
    groupActions: p.groupActions ? (group) => getProps().groupActions?.(group) ?? [] : undefined,
    onReady(panel) {
      const cur = getProps()
      syncPanelLook(host, controls, cur, cur.density)
      cur.onReady?.(panel)
    },
  })
}
