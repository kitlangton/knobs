import type { State } from "./schema.js"
export type CodeFormat = "ts" | "json" | "jsx"
export function formatCode(values: State, format: CodeFormat = "ts"): string {
  if (format === "json") return JSON.stringify(values, null, 2)
  if (format === "jsx")
    return Object.entries(values)
      .map(([key, value]) => {
        if (!/^[A-Za-z_$][\w$-]*$/.test(key)) throw new Error(`Cannot serialize JSX prop: ${key}`)
        return `${key}={${JSON.stringify(value)}}`
      })
      .join(" ")
  return `{ ${Object.entries(values)
    .map(
      ([key, value]) =>
        `${/^[A-Za-z_$][\w$]*$/.test(key) && key !== "__proto__" ? key : `[${JSON.stringify(key)}]`}: ${JSON.stringify(value)}`,
    )
    .join(", ")} }`
}
