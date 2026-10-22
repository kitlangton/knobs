import { describe, expect, it } from "vitest"
import { memoryStorage } from "../src/core/storage.js"
import { foldMemory } from "../src/panel/folds.js"

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

  it("remembers nothing without storage", () => {
    const folds = foldMemory("motion", () => null)
    folds.set("groups", "Sidebars", true)
    expect(folds.get("groups", "Sidebars")).toBeUndefined()
  })
})
