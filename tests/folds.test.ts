import { describe, expect, it } from "vitest"
import type { StoragePort } from "../src/core/storage.js"
import { foldMemory } from "../src/panel/folds.js"

const memory = (): StoragePort & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe("foldMemory", () => {
  it("keeps groups, sections and a panel's sub-headings side by side", () => {
    const port = memory()
    const folds = foldMemory("lab:woods", () => port)
    folds.set("groups", "Camera", true)
    folds.set("subsections", "Camera\u0000Lens", false)
    folds.set("sections", "Look", true)
    expect(folds.get("groups", "Camera")).toBe(true)
    expect(folds.get("subsections", "Camera\u0000Lens")).toBe(false)
    expect(folds.get("sections", "Look")).toBe(true)
    expect(folds.get("groups", "Mist")).toBeUndefined()
    expect([...port.data.keys()]).toEqual(["knobs:lab%3Awoods:folds:v1"])
  })

  it("remembers nothing without storage", () => {
    const folds = foldMemory("x", () => null)
    folds.set("groups", "A", true)
    expect(folds.get("groups", "A")).toBeUndefined()
  })
})
