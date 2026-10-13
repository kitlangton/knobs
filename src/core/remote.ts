import { choice, knob, toggle, type Field, type Schema, type State } from "./schema.js"
import type { StoragePort } from "./storage.js"
import {
  defineControls,
  type ChangeMeta,
  type ControlAction,
  type Controls,
  type DensityMode,
  type RendererMode,
  type ThemeMode,
} from "./store.js"

export interface ControlDescriptor {
  readonly key: string
  readonly label?: string
  readonly kind: "knob" | "number" | "choice" | "toggle" | "bool"
  readonly default: number | string | boolean
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly unit?: string
  readonly choices?: readonly string[]
  readonly options?: readonly string[]
  readonly group?: string
  readonly shortcut?: string
  readonly swiftType?: string
}

export interface RemoteControlsOptions {
  readonly enabled?: boolean | (() => boolean)
  readonly values?: State
  readonly presets?: Readonly<Record<string, State>>
  readonly actions?: readonly ControlAction<State>[]
  readonly storage?: StoragePort | null
  readonly theme?: ThemeMode
  readonly density?: DensityMode
  readonly renderer?: RendererMode
  readonly onSet?: (key: string, value: number | string | boolean | null, meta: ChangeMeta) => void
  readonly onReset?: (target: { key?: string; group?: string }) => void
}

export interface RemoteControls extends Controls<Schema> {
  readonly descriptors: readonly ControlDescriptor[]
  swift(group?: string): string
}

export function descriptorToField(d: ControlDescriptor): Field {
  const meta = {
    ...(d.label !== undefined ? { label: d.label } : {}),
    ...(d.group !== undefined ? { group: d.group } : {}),
    ...(d.shortcut !== undefined ? { shortcut: d.shortcut } : {}),
  }
  if (d.kind === "knob" || d.kind === "number") {
    const def = typeof d.default === "number" && Number.isFinite(d.default) ? d.default : 0
    const min = d.min ?? Math.min(0, def * 2)
    const max = d.max ?? Math.max(1, def * 2)
    const step = d.step ?? (d.swiftType === "Int" ? 1 : (max - min) / 100 || 1)
    return knob(def, {
      min,
      max,
      step,
      ...(d.unit !== undefined ? { unit: d.unit } : {}),
      ...meta,
    })
  }
  if (d.kind === "choice") {
    const list = d.options ?? d.choices ?? [String(d.default)]
    if (list.length === 0) throw new Error(`Choice descriptor ${d.key} needs options.`)
    const def = list.includes(String(d.default)) ? String(d.default) : list[0]
    return choice(def, list as readonly [string, ...string[]], meta)
  }
  return toggle(Boolean(d.default), meta)
}

export function fromDescriptors(descriptors: readonly ControlDescriptor[]): Schema {
  return Object.freeze(Object.fromEntries(descriptors.map((d) => [d.key, descriptorToField(d)])))
}

const decimal = (n: number) => String(Math.round(n * 10000) / 10000)
const swiftLiteral = (d: ControlDescriptor, v: number | string | boolean) => {
  if (typeof v === "boolean") return String(v)
  if (typeof v === "string") return `.${v}`
  if (d.swiftType === "Int") return String(Math.round(v))
  return decimal(v)
}

export function formatSwift(
  descriptors: readonly ControlDescriptor[],
  values: State,
  group?: string,
): string {
  const byKey = new Map(descriptors.map((d) => [d.key, d]))
  const done = new Set<string>()
  const lines: string[] = []
  for (const d of descriptors) {
    const changed = d.key in values && values[d.key] !== d.default
    if (!changed || done.has(d.key) || (group && d.group !== group)) continue
    const base = d.key.replace(/\.(duration|bounce)$/, "")
    const duration = byKey.get(`${base}.duration`)
    const bounce = byKey.get(`${base}.bounce`)
    if (base !== d.key && duration && bounce) {
      done.add(duration.key).add(bounce.key)
      const label = (duration.label ?? duration.key).replace(/ duration$/i, "")
      const dv = values[duration.key] ?? duration.default
      const bv = values[bounce.key] ?? bounce.default
      lines.push(
        `TunableSpring(${JSON.stringify(base)}, ${JSON.stringify(label)}, duration: ${swiftLiteral(duration, dv)}, bounce: ${swiftLiteral(bounce, bv)})` +
          `  // was duration: ${swiftLiteral(duration, duration.default)}, bounce: ${swiftLiteral(bounce, bounce.default)}`,
      )
      continue
    }
    done.add(d.key)
    const swiftType = d.swiftType ?? (d.kind === "bool" || d.kind === "toggle" ? "Bool" : "Double")
    let call = `Tunable<${swiftType}>(${JSON.stringify(d.key)}, ${JSON.stringify(d.label ?? d.key)}, default: ${swiftLiteral(d, values[d.key])}`
    if (d.min !== undefined && d.max !== undefined)
      call += `, in: ${decimal(d.min)}...${decimal(d.max)}`
    if (d.step !== undefined) call += `, step: ${decimal(d.step)}`
    lines.push(`${call})  // was ${swiftLiteral(d, d.default)}`)
  }
  return lines.join("\n")
}

export function createRemoteControls(
  id: string,
  descriptors: readonly ControlDescriptor[],
  options: RemoteControlsOptions = {},
): RemoteControls {
  const frozenDescriptors = Object.freeze([...descriptors])
  const schema = fromDescriptors(frozenDescriptors)
  const controls = defineControls(id, schema, {
    enabled: options.enabled ?? true,
    storage: options.storage ?? null,
    presets: options.presets,
    actions: options.actions,
    theme: options.theme,
    density: options.density,
    renderer: options.renderer,
    onChange(patch, _values, meta) {
      if (meta.source === "remote" || meta.source === "reset") return
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined) continue
        const next = val === controls.locked[key] ? null : val
        options.onSet?.(key, next, meta)
      }
    },
    onReset(target) {
      if (target.key) {
        options.onSet?.(target.key, null, { source: "reset", key: target.key })
      }
      options.onReset?.(target)
    },
  })
  if (options.values) {
    controls.sync(options.values, { replace: true })
  }
  return Object.freeze({
    ...controls,
    get enabled() {
      return controls.enabled
    },
    get storage() {
      return controls.storage
    },
    get error() {
      return controls.error
    },
    get canUndo() {
      return controls.canUndo
    },
    get canRedo() {
      return controls.canRedo
    },
    descriptors: frozenDescriptors,
    swift: (group?: string) => formatSwift(frozenDescriptors, controls.modified() as State, group),
  })
}
