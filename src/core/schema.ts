export interface FieldMeta {
  readonly label?: string
  readonly group?: string
  readonly shortcut?: string
}
export interface Knob extends FieldMeta {
  readonly kind: "knob"
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit?: string
}
export interface Choice<T extends string = string> extends FieldMeta {
  readonly kind: "choice"
  readonly value: T
  readonly options: readonly T[]
}
export interface Toggle extends FieldMeta {
  readonly kind: "toggle"
  readonly value: boolean
}
export type Field = Knob | Choice | Toggle
export type Schema = Readonly<Record<string, Field>>
export type FieldValue<F extends Field> = F extends Knob
  ? number
  : F extends Choice<infer T>
    ? T
    : F extends Toggle
      ? boolean
      : never
export type Values<S extends Schema> = {
  readonly [K in keyof S]: FieldValue<S[K]>
}
export type State = Readonly<Record<string, number | string | boolean>>

function checkShortcut(shortcut?: string) {
  if (shortcut !== undefined && !/^[a-z]$/i.test(shortcut))
    throw new Error("Shortcut must be a letter.")
}
function withMeta<T extends object>(base: T, meta?: FieldMeta): T {
  checkShortcut(meta?.shortcut)
  return Object.freeze({
    ...base,
    ...(meta?.label !== undefined ? { label: meta.label } : {}),
    ...(meta?.group !== undefined ? { group: meta.group } : {}),
    ...(meta?.shortcut !== undefined ? { shortcut: meta.shortcut } : {}),
  })
}

export function knob(
  value: number,
  options: Omit<Knob, "kind" | "value" | "step"> & { step?: number },
): Knob {
  const step = options.step ?? ((options.max - options.min) / 100 || 1)
  if (
    ![value, options.min, options.max, step].every(Number.isFinite) ||
    options.max < options.min ||
    step <= 0
  )
    throw new Error("A knob needs finite bounds and a positive step.")
  checkShortcut(options.shortcut)
  const field: Knob = { ...options, kind: "knob", value, step }
  return Object.freeze({ ...field, value: normalizeField(field, value) as number })
}
export function choice<const T extends readonly [string, ...string[]]>(
  value: T[number],
  options: T,
  meta?: FieldMeta,
): Choice<T[number]> {
  if (!options.includes(value) || new Set(options).size !== options.length)
    throw new Error("Invalid choice options/default.")
  return withMeta({ kind: "choice" as const, value, options: Object.freeze([...options]) }, meta)
}
export function toggle(value: boolean, meta?: FieldMeta): Toggle {
  return withMeta({ kind: "toggle" as const, value }, meta)
}
export function normalizeField(field: Field, input: unknown): number | string | boolean {
  if (field.kind === "knob") {
    if (typeof input !== "number" || !Number.isFinite(input)) return field.value
    const bounded = Math.max(field.min, Math.min(field.max, input))
    const steps = Math.min(
      Math.floor((field.max - field.min) / field.step + 1e-9),
      Math.round((bounded - field.min) / field.step),
    )
    return Number((field.min + steps * field.step).toPrecision(14))
  }
  if (field.kind === "choice")
    return typeof input === "string" && field.options.includes(input) ? input : field.value
  return typeof input === "boolean" ? input : field.value
}
export function normalize<S extends Schema>(schema: S, input: unknown): Values<S> {
  const record = isRecord(input) ? input : {}
  return Object.freeze(
    Object.fromEntries(
      Object.entries(schema).map(([key, field]) => [key, normalizeField(field, record[key])]),
    ),
  ) as Values<S>
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
export function equal(a: State, b: State): boolean {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => a[key] === b[key])
  )
}
