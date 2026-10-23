import { describe, expect, it, vi } from "vitest"
import { createRemoteControls, defineControls, knob, type ControlDescriptor } from "../src/index.js"
import { copyFormatter } from "../src/panel/copy.js"

const descriptors: ControlDescriptor[] = [
  { key: "size", kind: "number", default: 0, min: 0, max: 10, group: "layout" },
  { key: "gap", kind: "number", default: 1, min: 0, max: 10, group: "layout" },
  { key: "on", kind: "bool", default: false, group: "other" },
]
const remote = () => createRemoteControls("copy", descriptors, { values: { size: 2, on: true } })

describe("page and panel copy formats", () => {
  it("copies Rust for the header, group and selected keys", () => {
    const controls = remote()
    const copy = copyFormatter(controls, { copyAs: "rust" })
    expect(copy()).toBe(controls.rust())
    expect(copy(["size", "gap"], "layout")).toBe(controls.rust("layout"))
    expect(copy(["on"])).toBe('rune::tune!("on", true)  // was false')
    expect(copy(["gap"])).toBe("")
    controls.update([{ key: "label", kind: "text", default: "a" }], { label: "b" }, { land: true })
    expect(copy()).toBe('rune::tune!("label", "b")  // was "a"')
  })

  it("also scopes Swift copy", () => {
    const controls = remote()
    const copy = copyFormatter(controls, { copyAs: "swift" })
    expect(copy()).toBe(controls.swift())
    expect(copy(["size", "gap"], "layout")).toBe(controls.swift("layout"))
    expect(copy(["on"])).toBe(controls.swift("other"))
  })

  it("passes keys and the group to a custom formatter for every copy scope", () => {
    const callback = vi.fn(() => "custom")
    const copy = copyFormatter(remote(), { copyAs: callback, copy: () => "legacy" })
    expect(copy()).toBe("custom")
    copy(["size"])
    copy(["size", "gap"], "layout")
    expect(callback.mock.calls).toEqual([[], [["size"]], [["size", "gap"], "layout"]])
  })

  it("preserves default TypeScript selection copy and the existing header callback", () => {
    const controls = remote()
    const legacy = copyFormatter(controls, { copy: () => "legacy" })
    expect(legacy()).toBe("legacy")
    expect(legacy(["gap"])).toBe("{ gap: 1 }")
    const copy = copyFormatter(controls, { copyAs: "ts", copy: () => "legacy" })
    expect(copy()).toBe(controls.code())
    expect(copy(["size", "gap"], "layout")).toBe("{ size: 2, gap: 1 }")
  })

  it("requires descriptors for built-in remote languages but allows callbacks on local controls", () => {
    const controls = defineControls("local", { size: knob(1, { min: 0, max: 10 }) })
    expect(() => copyFormatter(controls, { copyAs: "rust" })).toThrow("requires remote controls")
    expect(() => copyFormatter(controls, { copyAs: "swift" })).toThrow("requires remote controls")
    expect(copyFormatter(controls, { copyAs: () => "local" })()).toBe("local")
  })
})
