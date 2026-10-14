import { choice, knob, toggle } from "knobs"
import { sectionControls } from "./section"

// Sections whose chips carry illustration knobs of their own. They're created here, before the
// lazy examples load, so the section and its example share one store.

const keycaps = {
  flat: {
    "--kbd-bg": "color-mix(in oklch, var(--fg) 8%, transparent)",
    "--kbd-edge": "transparent",
  },
  raised: { "--kbd-bg": "var(--bg)", "--kbd-edge": "var(--line)" },
  outline: {
    "--kbd-bg": "transparent",
    "--kbd-edge": "color-mix(in oklch, var(--fg) 22%, transparent)",
  },
}
export const keysSection = sectionControls(
  "Keys and gestures",
  {
    keycaps: choice("raised", ["flat", "raised", "outline"], { label: "Keycaps", group: "Keys" }),
    stripes: toggle(false, { label: "Striped rows", group: "Keys" }),
  },
  {
    tokens: (v) => ({
      ...keycaps[v.keycaps],
      "--row-stripe": v.stripes
        ? "color-mix(in oklch, var(--fg) 3.5%, transparent)"
        : "transparent",
    }),
  },
)

const backdrops = {
  aurora: `radial-gradient(circle at 25% 20%, oklch(0.7 0.16 var(--stage-hue) / var(--stage-glow)), transparent 55%), radial-gradient(circle at 80% 85%, oklch(0.7 0.15 calc(var(--stage-hue) + 80) / var(--stage-glow)), transparent 50%)`,
  grid: `linear-gradient(oklch(0.6 0.12 var(--stage-hue) / calc(var(--stage-glow) * 0.5)) 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(90deg, oklch(0.6 0.12 var(--stage-hue) / calc(var(--stage-glow) * 0.5)) 1px, transparent 1px) 0 0 / 22px 22px`,
  plain: "none",
}
export const themingSection = sectionControls(
  "Theming",
  {
    backdrop: choice("aurora", ["aurora", "grid", "plain"], { label: "Backdrop", group: "Stage" }),
    hue: knob(250, { min: 0, max: 360, step: 1, unit: "°", label: "Hue", group: "Stage" }),
    glow: knob(0.4, { min: 0, max: 1, step: 0.05, label: "Glow", group: "Stage" }),
  },
  {
    tokens: (v) => ({
      "--stage-pattern": backdrops[v.backdrop],
      "--stage-hue": String(v.hue),
      "--stage-glow": String(v.glow),
    }),
  },
)

export const remoteSection = sectionControls("Remote and Swift", {
  latency: knob(120, { min: 0, max: 800, step: 10, unit: "ms", label: "Latency", group: "Socket" }),
})
