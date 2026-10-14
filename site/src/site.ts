import {
  choice,
  color,
  defineControls,
  knob,
  parseColor,
  spring,
  springCss,
  toggle,
  type Controls,
  type Schema,
  type Values,
} from "knobs"

// Site-wide tokens. Every page reads them through CSS custom properties on :root, and the
// registered ones glide on the motion spring when they change.
const siteSchema = {
  theme: choice("auto", ["auto", "light", "dark"], { label: "Theme", group: "Appearance" }),
  accent: color("oklch(0.62 0.19 256)", { label: "Accent", group: "Appearance" }),
  tint: knob(0, { min: 0, max: 1, step: 0.05, label: "Background tint", group: "Appearance" }),
  panels: toggle(true, { label: "Tint panels", group: "Appearance" }),
  font: choice("sans", ["sans", "serif", "rounded", "mono"], { label: "Font", group: "Type" }),
  size: knob(16, { min: 14, max: 20, step: 0.5, unit: "px", label: "Base size", group: "Type" }),
  ratio: knob(1.25, { min: 1.1, max: 1.5, step: 0.01, label: "Scale ratio", group: "Type" }),
  leading: knob(1.6, { min: 1.3, max: 1.9, step: 0.05, label: "Line height", group: "Type" }),
  space: knob(1, { min: 0.6, max: 1.6, step: 0.05, label: "Spacing", group: "Layout" }),
  radius: knob(12, { min: 0, max: 24, step: 1, unit: "px", label: "Radius", group: "Layout" }),
  motion: toggle(true, { label: "Motion", group: "Motion" }),
  spring: spring({ duration: 0.5, bounce: 0.12 }, { label: "Spring", group: "Motion" }),
} satisfies Schema

export type SiteValues = Values<typeof siteSchema>

export const site = defineControls("site", siteSchema, {
  enabled: true,
  theme: "auto",
  presets: {
    editorial: {
      font: "serif",
      accent: "oklch(0.58 0.15 32)",
      size: 17,
      ratio: 1.36,
      leading: 1.7,
      tint: 0.35,
    },
    compact: { size: 15, ratio: 1.18, leading: 1.5, space: 0.75, radius: 8 },
    playful: {
      font: "rounded",
      accent: "oklch(0.66 0.21 340)",
      radius: 20,
      ratio: 1.3,
      spring: { duration: 0.55, bounce: 0.42 },
    },
    terminal: {
      theme: "dark",
      font: "mono",
      accent: "oklch(0.82 0.19 148)",
      size: 15,
      ratio: 1.15,
      radius: 2,
      tint: 0.4,
    },
  },
  actions: [
    { label: "Copy CSS", run: (v) => copy(siteCss(v), "Copied the site tokens as CSS.") },
    { label: "Copy link", run: () => copy(shareUrl(), "Copied a link to this tuning.") },
  ],
})

// Random and Mutate would otherwise switch Motion off half the time, and with it the glide of
// every later change. A fresh visitor starts with the row locked; ⇧L on it unlocks it.
if (typeof localStorage !== "undefined" && !localStorage.getItem("knobs:site:state:v1"))
  site.lock("motion")

export async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text)
    return done
  } catch {
    return "Clipboard unavailable."
  }
}

const fonts: Record<SiteValues["font"], string> = {
  sans: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif`,
  serif: `"New York", "Iowan Old Style", "Charter", Georgia, serif`,
  rounded: `ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif`,
  mono: `ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace`,
}

const prefersDark = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches
export const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

export const resolvedTheme = (v: SiteValues) =>
  v.theme === "auto" ? (prefersDark() ? "dark" : "light") : v.theme

const round = (n: number, digits = 3) => String(Math.round(n * 10 ** digits) / 10 ** digits)

type Glide = { easing: string; duration: number }
const still: Glide = { easing: "linear", duration: 0 }
const motionOn = (v: SiteValues) => v.motion && !reducedMotion()
const glideOf = (v: SiteValues): Glide => (motionOn(v) ? springCss(v.spring) : still)

/** Every token the site panel controls, as [name, value] pairs. */
export function siteTokens(v: SiteValues, glide = glideOf(v)): [string, string][] {
  const dark = resolvedTheme(v) === "dark"
  const { l, c, h } = parseColor(v.accent) ?? { l: 0.62, c: 0.19, h: 256 }
  // Dark pages lift a dark accent so links keep their contrast; light pages deepen a pale one.
  const textL = dark ? Math.max(l, 0.72) : Math.min(l, 0.56)
  const tint = v.tint * (dark ? 0.03 : 0.02)
  return [
    ["--accent", v.accent],
    ["--accent-text", `oklch(${round(textL)} ${round(c)} ${round(h, 1)})`],
    ["--bg", `oklch(${dark ? 0.145 : 0.995} ${round(tint)} ${round(h, 1)})`],
    ["--bg-raised", `oklch(${dark ? 0.19 : 0.97} ${round(tint * 1.4)} ${round(h, 1)})`],
    ["--font", fonts[v.font]],
    ["--fs", `${v.size}px`],
    ["--ratio", String(v.ratio)],
    ["--leading", String(v.leading)],
    ["--space", String(v.space)],
    ["--radius", `${v.radius}px`],
    ["--glide-ease", glide.easing],
    ["--glide-ms", `${glide.duration}ms`],
  ]
}

export function siteCss(v: SiteValues) {
  return [":root {", ...siteTokens(v).map(([k, val]) => `  ${k}: ${val};`), "}"].join("\n")
}

// The change that turns Motion off (Random often does) still glides on the spring it had, so
// the jump only starts with the next change.
let applied: { on: boolean; glide: Glide } | undefined
export function applySite(v: SiteValues) {
  const root = document.documentElement
  const on = motionOn(v)
  const glide = on ? glideOf(v) : applied?.on ? applied.glide : still
  applied = { on, glide: on ? glide : still }
  root.dataset.theme = resolvedTheme(v)
  root.dataset.motion = on ? "on" : "off"
  root.dataset.panels = v.panels ? "tinted" : "plain"
  for (const [k, val] of siteTokens(v, glide)) root.style.setProperty(k, val)
}

// Sharing: "Copy link" writes every modified store into the hash as `#tune=<base64url json>`.
// Plain `#anchor` hashes keep working, and a shared hash is applied once and then removed.
const stores = new Map<string, Controls<Schema>>()
export function registerStore(controls: Controls<Schema>) {
  stores.set(controls.id, controls)
  const pending = pendingTune?.[controls.id]
  if (pending) {
    controls.set(pending as never, { source: "remote" })
    delete pendingTune![controls.id]
  }
}

const encode = (data: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
const decode = (text: string) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)),
    ),
  ) as Record<string, Record<string, unknown>>

export function shareUrl() {
  const tune: Record<string, unknown> = {}
  for (const [id, controls] of stores)
    if (controls.isModified()) tune[id] = controls.modified() as Record<string, unknown>
  const url = new URL(location.href)
  url.hash = Object.keys(tune).length ? `tune=${encode(tune)}` : ""
  return url.toString()
}

let pendingTune: Record<string, Record<string, unknown>> | undefined
export function readSharedTuning() {
  const match = location.hash.match(/^#tune=([\w-]+)/)
  if (!match) return
  try {
    pendingTune = decode(match[1]!)
  } catch {
    return
  }
  history.replaceState(null, "", location.pathname + location.search)
}
