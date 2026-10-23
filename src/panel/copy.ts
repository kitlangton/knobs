import { formatRust, formatSwift, type RemoteControls } from "../core/remote.js"
import type { Schema, Values } from "../core/schema.js"
import type { Controls, MountPanelOptions } from "../core/store.js"

/** One formatter for header, selection and group copy, on both pages and panels. */
export function copyFormatter<S extends Schema>(controls: Controls<S>, options: MountPanelOptions) {
  const format = options.copyAs
  if (typeof format === "function") return format
  const remote = controls as Controls<S> & Partial<Pick<RemoteControls, "descriptors">>
  if ((format === "swift" || format === "rust") && !remote.descriptors)
    throw new Error(`copyAs: "${format}" requires remote controls.`)
  return (keys?: readonly string[], group?: string): string => {
    if (format === undefined && !keys && !group && options.copy) return options.copy()
    const selected =
      keys ??
      (group === undefined
        ? undefined
        : Object.keys(controls.schema).filter((key) => controls.schema[key]?.group === group))
    const current = controls.get()
    const values = selected
      ? (Object.fromEntries(selected.map((key) => [key, current[key]])) as Values<S>)
      : (controls.modified() as Values<S>)
    if (format === "rust" || format === "swift") {
      const descriptors = selected
        ? remote.descriptors!.filter((d) => selected.includes(d.key))
        : remote.descriptors!
      return (format === "rust" ? formatRust : formatSwift)(descriptors, values, group)
    }
    return controls.code("ts", selected ? values : undefined)
  }
}
