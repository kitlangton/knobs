import { describe, expect, it } from "vitest"
import { resolveLook, themeSelector } from "../src/core/appearance.js"
import { panelLook } from "../src/core/adapter.js"
import { defineControls } from "../src/core/store.js"
import { themes } from "../src/themes/index.js"

describe("looks", () => {
  it("follows the page by default", () => {
    expect(resolveLook()).toEqual({ appearance: "inherit" })
  })

  it("takes a theme and an appearance, and the old modes as appearances", () => {
    expect(resolveLook({ theme: themes.void, appearance: "light" })).toEqual({
      theme: themes.void,
      appearance: "light",
    })
    expect(resolveLook({ theme: "auto" }).appearance).toBe("system")
    expect(resolveLook({ theme: "light" })).toEqual({ appearance: "light" })
    // An explicit appearance wins over an old mode.
    expect(resolveLook({ theme: "light", appearance: "dark" }).appearance).toBe("dark")
  })

  it("lays a panel's options over its store's", () => {
    const c = defineControls("look", {}, { theme: themes.void, appearance: "dark", storage: null })
    expect(panelLook(c)).toEqual({ theme: themes.void, appearance: "dark" })
    expect(panelLook(c, { theme: "light" })).toEqual({ theme: themes.void, appearance: "light" })
    expect(panelLook(c, { theme: themes.knobs }).theme).toBe(themes.knobs)
  })

  it("scopes a theme's tokens to the elements marked with it", () => {
    const css = themes.void.css({ selector: themeSelector("void") })
    expect(css).toContain(':where(.knobs-root)[data-knobs-theme="void"]{')
    expect(css).toContain("--k-bg:light-dark(")
  })
})
