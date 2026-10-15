// A stand-in for the opencode-ios tune page, for timing batch changes (scripts/perf-presets.ts):
// about 50 remote keys over 12 cards in four sections, sliders, segments, menus, switches,
// springs and a colour, with page presets (Native, Lively, Compact) and card presets.
// `?renderer=gpu` draws it on the GPU overlay.
import { createRemoteControls, type ControlDescriptor, type GroupPreset, type State } from "knobs"
import { mountPage } from "knobs/panel"

const num = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  group: string,
  section: string,
): ControlDescriptor => ({
  key,
  label,
  kind: "number",
  default: value,
  min,
  max,
  step,
  group,
  section,
})
const pick = (
  key: string,
  label: string,
  value: string,
  choices: string[],
  group: string,
  section: string,
): ControlDescriptor => ({ key, label, kind: "choice", default: value, choices, group, section })
const flag = (
  key: string,
  label: string,
  value: boolean,
  group: string,
  section: string,
): ControlDescriptor => ({ key, label, kind: "toggle", default: value, group, section })
/** A phone spring: two flat number keys drawn as one spring row. */
const pair = (
  key: string,
  label: string,
  duration: number,
  bounce: number,
  group: string,
  section: string,
): ControlDescriptor[] => [
  num(`${key}.duration`, `${label} duration`, duration, 0.1, 1.2, 0.01, group, section),
  num(`${key}.bounce`, `${label} bounce`, bounce, 0, 0.6, 0.01, group, section),
  {
    key,
    label,
    kind: "spring",
    bind: { duration: `${key}.duration`, bounce: `${key}.bounce` },
    group,
    section,
  },
]

const L = "Session List"
const T = "Transcript"
const C = "Composer"
const U = "Catch Up"
export const descriptors: ControlDescriptor[] = [
  num("drawer.row.height", "Row height", 44, 28, 72, 1, "Rows", L),
  num("drawer.row.gap", "Gap between rows", 0, 0, 16, 1, "Rows", L),
  num("drawer.row.edge", "Highlight from the sides", 12, 0, 32, 1, "Rows", L),
  pick("drawer.row.font", "Row text", "body", ["callout", "body", "headline"], "Rows", L),
  num("drawer.section.above", "Room above a header", 8, 0, 40, 1, "Header", L),
  num("drawer.section.height", "Header height", 36, 16, 60, 1, "Header", L),
  num("drawer.section.below", "Room below a header", 4, 0, 24, 1, "Header", L),
  pick(
    "drawer.section.style",
    "Header style",
    "caps",
    ["caps", "title", "quiet", "bold", "none"],
    "Header",
    L,
  ),
  num("drawer.edge.fade", "Fade below the title", 19, 0, 120, 1, "Edge", L),
  num("drawer.edge.blurRadius", "Blur radius", 2.5, 0, 40, 0.5, "Edge", L),
  num("drawer.edge.washOpacity", "Wash at the title", 0.7, 0, 1, 0.01, "Edge", L),
  pick("drawer.edge.blurCurve", "Blur falloff", "smoothstep", ["smoothstep", "linear"], "Edge", L),
  pick("drawer.edge.bottomEdge", "Bottom edge", "soft", ["soft", "hard"], "Edge", L),
  ...pair("drawer.search.morph", "Search morph", 0.3, 0.15, "Drawer Springs", L),
  ...pair("drawer.open", "Drawer open", 0.42, 0.12, "Drawer Springs", L),
  num("drawer.card.omega", "Card spring ω", 28.5, 8, 60, 0.5, "Drawer Springs", L),
  flag("drawer.motion.rubberBand", "Rubber band", true, "Drawer Springs", L),

  num("transcript.arrivals.entrance", "Entrance fade", 0.25, 0.05, 0.8, 0.01, "Arrivals", T),
  num("transcript.arrivals.rise", "Entrance rise (pt)", 6, 0, 24, 1, "Arrivals", T),
  num("transcript.arrivals.textFade", "Streamed text fade", 0.2, 0.05, 0.8, 0.01, "Arrivals", T),
  num("transcript.arrivals.settling", "Model-switch fade", 0.4, 0.1, 1, 0.02, "Arrivals", T),
  num("transcript.arrivals.handoff", "Working → Copy handoff", 0.34, 0.1, 1, 0.02, "Arrivals", T),
  {
    key: "transcript.glide.promotion",
    label: "Promotion",
    kind: "spring",
    default: { duration: 0.35, bounce: 0.1 },
    group: "Glide",
    section: T,
  },
  ...pair("transcript.glide.jump", "Jump", 0.5, 0.05, "Glide", T),
  flag("transcript.glide.follow", "Follow the bottom", true, "Glide", T),
  num("transcript.bubble.radius", "Bubble radius", 18, 0, 32, 1, "Bubbles", T),
  num("transcript.bubble.padding", "Bubble padding", 12, 4, 24, 1, "Bubbles", T),
  {
    key: "transcript.bubble.tint",
    label: "Tint",
    kind: "color",
    default: "#3478f6",
    group: "Bubbles",
    section: T,
  },
  flag("transcript.bubble.compact", "Compact bubbles", false, "Bubbles", T),
  pick(
    "transcript.tools.collapse",
    "Collapse tools",
    "auto",
    ["auto", "always", "never"],
    "Tools",
    T,
  ),
  num("transcript.tools.stagger", "Stagger", 0.04, 0, 0.2, 0.01, "Tools", T),
  flag("transcript.tools.icons", "Tool icons", true, "Tools", T),

  num("composer.controls.size", "Button size", 36, 24, 52, 1, "Controls", C),
  num("composer.controls.spacing", "Spacing", 8, 0, 20, 1, "Controls", C),
  ...pair("composer.expand", "Expand", 0.38, 0.14, "Controls", C),
  pick(
    "composer.level.style",
    "Level style",
    "bars",
    ["bars", "pill", "dots", "ring", "wave"],
    "Level Picker",
    C,
  ),
  num("composer.level.width", "Picker width", 120, 60, 220, 2, "Level Picker", C),
  flag("composer.level.haptics", "Haptics", true, "Level Picker", C),
  num("composer.input.minHeight", "Min height", 40, 28, 64, 1, "Input", C),
  num("composer.input.maxLines", "Max lines", 6, 1, 12, 1, "Input", C),
  {
    key: "composer.input.placeholder",
    label: "Placeholder",
    kind: "color",
    default: "#8e8e93",
    group: "Input",
    section: C,
  },

  num("catchup.summary.lines", "Summary lines", 3, 1, 8, 1, "Catch Up", U),
  num("catchup.summary.fade", "Summary fade", 0.3, 0, 1, 0.01, "Catch Up", U),
  num("catchup.cards.gap", "Card gap", 10, 0, 24, 1, "Catch Up", U),
  num("catchup.cards.radius", "Card radius", 14, 0, 28, 1, "Catch Up", U),
  flag("catchup.cards.shadow", "Shadow", true, "Catch Up", U),
]

const defaults = Object.fromEntries(
  descriptors.flatMap((d) => (d.kind === "action" || d.bind ? [] : [[d.key, d.default]])),
) as State
const springKeys = descriptors.flatMap((d) => (d.bind ? [d.key] : []))
/** Every number nudged by `scale` of its range (clamped, on its step), choices and flags turned. */
const shift = (scale: number, flip: boolean): State => {
  const out: Record<string, unknown> = {}
  for (const d of descriptors) {
    if (d.kind === "action" || d.bind) continue
    if (d.kind === "number" && d.min !== undefined && d.max !== undefined && d.step) {
      const v = (d.default as number) + (d.max - d.min) * scale
      const stepped = Math.round((v - d.min) / d.step) * d.step + d.min
      out[d.key] = Math.min(d.max, Math.max(d.min, Number(stepped.toFixed(6))))
    } else if (d.kind === "choice" && d.choices) {
      const list = d.choices as string[]
      out[d.key] =
        list[(list.indexOf(String(d.default)) + (flip ? 1 : list.length - 1)) % list.length]
    } else if (d.kind === "toggle" && flip) out[d.key] = !d.default
    else if (d.kind === "spring") {
      const s = d.default as { duration: number; bounce: number }
      out[d.key] = {
        duration: s.duration * (1 - scale),
        bounce: Math.min(0.6, s.bounce + scale / 2),
      }
    } else if (d.kind === "color") out[d.key] = flip ? "#ff9f0a" : "#30d158"
  }
  return out as State
}
const presets = { lively: shift(-0.12, true), compact: shift(0.18, false) }
const cardPreset = (group: string, scale: number, name: string): GroupPreset => ({
  name,
  values: Object.fromEntries(
    Object.entries(shift(scale, scale > 0)).filter(([k]) =>
      descriptors.some((d) => d.key === k && d.group === group),
    ),
  ),
})
const groupPresets: Record<string, GroupPreset[]> = {}
for (const group of ["Rows", "Drawer Springs", "Arrivals", "Glide", "Controls", "Catch Up"])
  groupPresets[group] = [
    { name: "Native", values: {} },
    cardPreset(group, -0.15, "Snappy"),
    cardPreset(group, 0.2, "Gentle"),
  ]

/** What the remote would have sent, as messages. */
const sent: { type: string; keys: string[] }[] = []
const params = new URLSearchParams(location.search)
const remote = createRemoteControls("preset-bench", descriptors, {
  echo: 5000,
  storage: null,
  presets,
  groupPresets,
  defaultLabel: "Native",
  presetLabels: { lively: "Lively", compact: "Compact" },
  groupPresetDisplay: "auto",
  onSet: (key) => sent.push({ type: "set", keys: [key] }),
  onSetBatch: (changes) => sent.push({ type: "batch", keys: changes.map((c) => c.key) }),
  onReset: ({ key, group }) => {
    if (!key) sent.push({ type: "reset", keys: group ? [group] : [] })
  },
  ...(params.has("perKeyPresets")
    ? {}
    : { onPreset: ({ group }) => sent.push({ type: "preset", keys: [group] }) }),
})
const page = mountPage(remote, document.querySelector<HTMLElement>("#app")!, {
  title: "Preset Bench",
  theme: "dark",
  columnWidth: 332,
  haptics: false,
  sections: [L, T, C, U],
})
;(window as any).__bench = { remote, page, sent, defaults, presets, groupPresets, springKeys }
