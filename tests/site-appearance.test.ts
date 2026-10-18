import type { ChangeMeta } from "knobs"
import { describe, expect, it } from "vitest"
import {
  appearanceAfterChange,
  appearanceDark,
  appearanceLook,
  appearanceOf,
  DARK_THEMES,
  LIGHT_THEMES,
  nextAppearance,
} from "../examples/site-appearance"
import { dress, NEUTRAL } from "../examples/site-dress"
import { blendThemes, contrast, luminance, over } from "../examples/site-look-math"
import { type SiteTheme, THEMES } from "../examples/site-look-themes"

describe("independent appearance preference", () => {
  it("defaults to System and follows both OS states", () => {
    for (const value of [null, undefined, "invalid", 1]) expect(appearanceOf(value)).toBe("system")
    expect(appearanceDark("system", false)).toBe(false)
    expect(appearanceDark("system", true)).toBe(true)
  })

  it("keeps explicit Light and Dark fixed when the OS changes", () => {
    for (const systemDark of [false, true]) {
      expect(appearanceDark("light", systemDark)).toBe(false)
      expect(appearanceDark("dark", systemDark)).toBe(true)
    }
  })

  it("never lets a look operation change the preference", () => {
    const sources: ChangeMeta["source"][] = [
      "preset",
      "variant",
      "randomize",
      "mutate",
      "reset",
      "undo",
      "redo",
      "compare",
    ]
    for (const current of ["system", "light", "dark"] as const) {
      for (const source of sources)
        expect(appearanceAfterChange(current, "system", source)).toBe(current)
    }
    expect(appearanceAfterChange("system", "light", "local")).toBe("light")
    expect(appearanceAfterChange("light", "dark", "remote")).toBe("dark")
    expect(nextAppearance(nextAppearance(nextAppearance("system")))).toBe("system")
  })
})

describe("paired theme palettes", () => {
  it("moves directly between selected themes, ignoring palettes between them in the list", () => {
    for (const palettes of [DARK_THEMES, LIGHT_THEMES]) {
      const shares = [0.35, 0, 0, 0, 0.65]
      const direct = blendThemes(palettes, shares)
      // An unrelated theme's colours, type and geometry must not leak into this transition.
      const changed = palettes.map((theme, i) =>
        i > 0 && i < 4
          ? {
              ...theme,
              ground: Object.fromEntries(Object.keys(theme.ground).map((k) => [k, "#ff00ff"])),
              num: Object.fromEntries(Object.keys(theme.num).map((k) => [k, 999])),
            }
          : theme,
      )
      expect(blendThemes(changed, shares)).toEqual(direct)
      for (const key of Object.keys(direct.num) as (keyof SiteTheme["num"])[])
        expect(direct.num[key]).toBeCloseTo(
          palettes[0]!.num[key] * 0.35 + palettes[4]!.num[key] * 0.65,
          8,
        )
      const mode = palettes === DARK_THEMES ? 0 : 1
      expect(appearanceLook(shares, mode)).toEqual(direct)
    }
  })

  it("gives every theme both appearances without changing its typography or geometry", () => {
    THEMES.forEach((theme, i) => {
      expect(DARK_THEMES[i]!.id).toBe(theme.id)
      expect(LIGHT_THEMES[i]!.id).toBe(theme.id)
      const dark = appearanceLook(i, 0)
      const light = appearanceLook(i, 1)
      expect(luminance(dark.colors.page!)).toBeLessThan(0.05)
      expect(luminance(light.colors.page!)).toBeGreaterThan(0.7)
      expect(dark.fonts).toEqual(light.fonts)
      for (const key of ["tSize", "tWeight", "tTrack", "tAlign", "kRadius", "density"])
        expect(dark.num[key]).toBe(light.num[key])
    })
  })

  it("keeps page and panel text readable throughout every theme sweep in either mode", () => {
    for (const light of [0, 1]) {
      for (const contrastSetting of [-0.5, 0, 1]) {
        for (let x = 0; x <= THEMES.length - 1; x += 0.02) {
          const look = dress(
            appearanceLook(x, light),
            { ...NEUTRAL, contrast: contrastSetting },
            light,
          )
          const page = look.colors.page!
          const panel = over(look.colors.kBg!, page)
          expect(contrast(look.colors.text!, page)).toBeGreaterThan(4)
          expect(contrast(look.colors.label!, page)).toBeGreaterThan(2.8)
          expect(contrast(look.colors.kText!, panel)).toBeGreaterThan(4)
        }
      }
    }
  })
})
