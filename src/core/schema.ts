import { fitColor, formatColor, parseColor, type Oklch } from "./color.js"
import { EASING_Y, namedEasing, type Bezier, type EasingName } from "./easing.js"
import type { SpringValue } from "./spring.js"

export interface FieldMeta {
  readonly label?: string
  readonly group?: string
  /** A page region the field's group sits in (see `mountPage`); panels ignore it. */
  readonly section?: string
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
export interface SpringField extends FieldMeta {
  readonly kind: "spring"
  readonly value: SpringValue
}
/** The value is an `oklch(L C H)` string, usable as-is in CSS and always inside sRGB. */
export interface ColorField extends FieldMeta {
  readonly kind: "color"
  readonly value: string
}
export interface Point {
  readonly x: number
  readonly y: number
}
export interface PointField extends FieldMeta {
  readonly kind: "point"
  readonly value: Point
  readonly min: Point
  readonly max: Point
  readonly step: Point
}
export interface EasingField extends FieldMeta {
  readonly kind: "easing"
  readonly value: Bezier
}
export type Field = Knob | Choice | Toggle | SpringField | ColorField | PointField | EasingField
export type Schema = Readonly<Record<string, Field>>
export type FieldValue<F extends Field> = F extends Knob
  ? number
  : F extends Choice<infer T>
    ? T
    : F extends Toggle
      ? boolean
      : F extends SpringField
        ? SpringValue
        : F extends ColorField
          ? string
          : F extends PointField
            ? Point
            : F extends EasingField
              ? Bezier
              : never
export type Values<S extends Schema> = {
  readonly [K in keyof S]: FieldValue<S[K]>
}
export type Value = number | string | boolean | SpringValue | Point | Bezier
export type State = Readonly<Record<string, Value>>

/** Ranges for spring fields: duration in seconds, and SwiftUI's bounce (below 0 is overdamped). */
export const SPRING = {
  duration: { min: 0.05, max: 2, step: 0.01 },
  bounce: { min: -0.5, max: 1, step: 0.01 },
} as const

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
    ...(meta?.section !== undefined ? { section: meta.section } : {}),
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
/** `spring({ duration: 0.4, bounce: 0.2 })`, like SwiftUI's `.spring(duration:bounce:)`. */
export function spring(value: Partial<SpringValue> = {}, meta?: FieldMeta): SpringField {
  const field = { kind: "spring" as const, value: { duration: 0.5, bounce: 0 } }
  return withMeta({ ...field, value: normalizeField(field, value) as SpringValue }, meta)
}
/** `color("#4f8cff")`, `color("oklch(0.7 0.15 250)")` or `color({ l, c, h })`. */
export function color(value: string | Oklch, meta?: FieldMeta): ColorField {
  const parsed = parseColor(value)
  if (!parsed) throw new Error("A color needs #rgb, #rrggbb, oklch(L C H) or { l, c, h }.")
  return withMeta({ kind: "color" as const, value: formatColor(fitColor(parsed)) }, meta)
}
type Axis = number | Point
const axes = (v: Axis): Point => (typeof v === "number" ? { x: v, y: v } : v)
/** A 2D pad: `point({ x: 0, y: 0 }, { min: -1, max: 1 })`; bounds and step take a number or `{ x, y }`. */
export function point(
  value: Point,
  options: FieldMeta & { min: Axis; max: Axis; step?: Axis },
): PointField {
  const min = axes(options.min)
  const max = axes(options.max)
  const step = options.step === undefined ? undefined : axes(options.step)
  const field = {
    kind: "point" as const,
    value,
    min: Object.freeze({ ...min }),
    max: Object.freeze({ ...max }),
    step: Object.freeze({
      x: step?.x ?? ((max.x - min.x) / 100 || 1),
      y: step?.y ?? ((max.y - min.y) / 100 || 1),
    }),
  }
  const numbers = [value.x, value.y, min.x, min.y, max.x, max.y, field.step.x, field.step.y]
  if (
    !numbers.every(Number.isFinite) ||
    max.x < min.x ||
    max.y < min.y ||
    field.step.x <= 0 ||
    field.step.y <= 0
  )
    throw new Error("A point needs finite bounds and positive steps.")
  return withMeta({ ...field, value: normalizeField(field as PointField, value) as Point }, options)
}
/** A cubic bezier `[x1, y1, x2, y2]` or a name: ease, ease-in, ease-out, ease-in-out, linear, smooth, snappy, back. */
export function easing(value: Bezier | EasingName, meta?: FieldMeta): EasingField {
  const curve = typeof value === "string" ? namedEasing(value) : value
  if (!curve || curve.length !== 4 || !curve.every(Number.isFinite))
    throw new Error("An easing needs four finite numbers or a known name.")
  const field = { kind: "easing" as const, value: curve }
  return withMeta({ ...field, value: normalizeField(field, curve) as Bezier }, meta)
}

const snap = (v: number, min: number, max: number, step: number) => {
  const bounded = Math.max(min, Math.min(max, v))
  const steps = Math.min(Math.floor((max - min) / step + 1e-9), Math.round((bounded - min) / step))
  return Number((min + steps * step).toPrecision(14))
}
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback

export function normalizeField(field: Field, input: unknown): Value {
  switch (field.kind) {
    case "knob":
      if (typeof input !== "number" || !Number.isFinite(input)) return field.value
      return snap(input, field.min, field.max, field.step)
    case "choice":
      return typeof input === "string" && field.options.includes(input) ? input : field.value
    case "toggle":
      return typeof input === "boolean" ? input : field.value
    case "spring": {
      const v = isRecord(input) ? input : {}
      const { duration: d, bounce: b } = SPRING
      return Object.freeze({
        duration: snap(num(v.duration, field.value.duration), d.min, d.max, d.step),
        bounce: snap(num(v.bounce, field.value.bounce), b.min, b.max, b.step),
      })
    }
    case "color": {
      const parsed = parseColor(input)
      return parsed ? formatColor(fitColor(parsed)) : field.value
    }
    case "point": {
      const v = isRecord(input) ? input : {}
      return Object.freeze({
        x: snap(num(v.x, field.value.x), field.min.x, field.max.x, field.step.x),
        y: snap(num(v.y, field.value.y), field.min.y, field.max.y, field.step.y),
      })
    }
    case "easing": {
      const v = Array.isArray(input) && input.length === 4 ? input : field.value
      return Object.freeze(
        [0, 1, 2, 3].map((i) =>
          i % 2 === 0
            ? snap(num(v[i], field.value[i]!), 0, 1, 0.01)
            : snap(num(v[i], field.value[i]!), EASING_Y[0], EASING_Y[1], 0.01),
        ),
      ) as unknown as Bezier
    }
  }
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
/** Value equality: springs, points and curves compare by their numbers. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  const ka = Object.keys(a)
  return (
    ka.length === Object.keys(b).length &&
    ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])
  )
}
export function equal(a: State, b: State): boolean {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => same(a[key], b[key]))
  )
}
