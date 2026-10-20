import { defineTheme } from "./define.js"
import { knobs } from "./knobs.js"

/**
 * For OLED and video review: true black page and panel with Apple's `#1c1c1e` / `#2c2c2e` raised
 * surfaces, text capped at `#ededed` to limit halation, a white accent, flat with solid
 * hairlines, and a black stage behind compared media. Neutral (no tint) so the chrome doesn't
 * bias colour judgement. The light pair is generated from the same dials.
 */
export const voidTheme = defineTheme({
  name: "void",
  extends: knobs,
  gray: { hue: 0, chroma: 0 },
  material: "flat",
  tokens: {
    dark: {
      "bg-page": "#000000",
      "bg-inset": "#0a0a0a",
      bg: "#000000",
      "bg-raised": "#1c1c1e",
      "bg-overlay": "#2c2c2e",
      fg: "#ededed",
      "fg-2": "#cecece",
      "fg-3": "#989898",
      "fg-4": "#7a7a7a",
      // Behind media the chrome stays neutral black, so it doesn't bias colour judgement.
      "compare-stage": "#000000",
    },
  },
})
