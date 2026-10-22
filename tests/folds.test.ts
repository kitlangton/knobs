import { describe, expect, it } from "vitest"
import { memoryStorage, type StoragePort } from "../src/core/storage.js"
import { foldMemory } from "../src/panel/folds.js"

const memory = (): StoragePort & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe("fold memory", () => {
  it("keeps a panel's group and sub-heading folds beside a page's", () => {
    const storage = memoryStorage()
    const folds = foldMemory("motion", () => storage)
    folds.set("groups", "Sidebars", true)
    folds.set("subsections", "Sidebars\u0000Open", true)
    folds.set("sections", "Layout", false)
    // A second panel of the same store (a reload) reads them back.
    const again = foldMemory("motion", () => storage)
    expect(again.get("groups", "Sidebars")).toBe(true)
    expect(again.get("subsections", "Sidebars\u0000Open")).toBe(true)
    expect(again.get("sections", "Layout")).toBe(false)
    expect(again.get("groups", "Global")).toBeUndefined()
    again.set("groups", "Sidebars", false)
    expect(folds.get("groups", "Sidebars")).toBe(false)
    expect(folds.get("subsections", "Sidebars\u0000Open")).toBe(true)
  })

  it("keeps groups, sections and sub-headings side by side under one key", () => {
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
    const folds = foldMemory("motion", () => null)
    folds.set("groups", "Sidebars", true)
    expect(folds.get("groups", "Sidebars")).toBeUndefined()
  })
})
