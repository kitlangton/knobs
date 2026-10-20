import { defineTheme } from "./define.js"
import { knobs } from "./knobs.js"

/**
 * The PROBLEMS Gallery palette: one neutral ink (`rgb(236 236 238)`) at fixed opacities on a
 * near-black page. `#0b0b0c` page, `#0f0f11` cards, `#161618` for what floats (popovers, the
 * note dock), `#0a0a0b` media wells; fills at .06 / .11, hairlines at .08 and rings at .12 of the
 * ink; text at 1 / .56 / .34 (composited on the card), coral Before and near-white After.
 *
 * Its dark text tiers are the Gallery's, quieter than knobs' APCA budget (`fg-2` reads Lc 40,
 * `fg-3` Lc 18): a reading page's prose and meta, not a dense panel's labels. The light pair is
 * generated from the same dials and meets the budget.
 */
export const gallery = defineTheme({
  name: "gallery",
  extends: knobs,
  gray: { hue: 270, chroma: 0.004 },
  accent: { dark: "#ececee", light: "#1c1c1e" },
  material: "solid",
  font: { mono: "Geist Mono" },
  tokens: {
    dark: {
      "bg-page": "#0b0b0c",
      "bg-inset": "#0a0a0b",
      bg: "#0f0f11",
      "bg-raised": "#161618",
      "bg-overlay": "#161618",
      fg: "#ececee",
      "fg-2": "#8b8b8d",
      "fg-3": "#5a5a5c",
      "fg-4": "#404042",
      fill: "#ececee0f",
      "fill-hover": "#ececee1c",
      "fill-selected": "#ececee1c",
      "border-subtle": "#ececee14",
      border: "#ececee1f",
      focus: "#8b8b8d",
      scrim: "#000000b8",
      "compare-stage": "#0a0a0b",
      before: "#ed756a",
      after: "#f0f2f5",
      "shadow-overlay":
        "0 2px 6px light-dark(#0000001a,#0000004d),0 12px 32px light-dark(#00000024,#00000080),0 0 0 1px light-dark(#1a1a1c14,#ececee14)",
    },
    light: {
      before: "#c13c36",
      "shadow-overlay":
        "0 2px 6px light-dark(#0000001a,#0000004d),0 12px 32px light-dark(#00000024,#00000080),0 0 0 1px light-dark(#1a1a1c14,#ececee14)",
    },
  },
})
