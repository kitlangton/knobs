import { defineTheme } from "./define.js"

/**
 * The main look: a `#1c1c1e`-class panel floating on a near-black page, glass, a white
 * monochrome accent and alpha hairlines. Its light pair keeps `#f5f5f7` / `#1a1a1c` / `#1c1c1e`.
 */
export const knobs = defineTheme({
  name: "knobs",
  gray: { hue: 285, chroma: 0.004 },
  accent: { dark: "#ffffff", light: "#1c1c1e" },
  contrast: 50,
  radius: 8,
  density: "default",
  material: "glass",
})
