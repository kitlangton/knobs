import { normalize, type Schema, type Values } from "./schema.js"
export function randomValues<S extends Schema>(schema: S, random = Math.random): Values<S> {
  return normalize(
    schema,
    Object.fromEntries(
      Object.entries(schema).map(([key, field]) => {
        const r = Math.max(0, Math.min(1 - Number.EPSILON, random()))
        return [
          key,
          field.kind === "knob"
            ? field.min +
              Math.floor(r * (Math.floor((field.max - field.min) / field.step + 1e-9) + 1)) *
                field.step
            : field.kind === "choice"
              ? field.options[Math.floor(r * field.options.length)]
              : r >= 0.5,
        ]
      }),
    ),
  )
}
