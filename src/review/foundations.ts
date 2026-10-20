// The review pieces' design system as data: one type scale, the space roles, the hairlines, the
// radii and the motion set. The review stylesheet is built from it, the catalog page prints it,
// and tests hold the CSS to it. docs/review-design.md gives each rule's reason.
import { CLOSE, FADE, SPRINGS } from "../core/motion.js"

/** The five sizes. Two weights: 400, and 500 for titles and emphasis. */
export const TYPE = [
  { role: "heading", size: 20, leading: 28, weight: 500, use: "A page's title" },
  { role: "title", size: 16, leading: 24, weight: 500, use: "A section's title, under its kicker" },
  {
    role: "body",
    size: 13,
    leading: 20,
    weight: 400,
    use: "Prose, step and option titles (500), rows, values",
  },
  {
    role: "label",
    size: 12,
    leading: 16,
    weight: 400,
    use: "Mono inside body text: code, paths, evidence chips",
  },
  {
    role: "small",
    size: 11,
    leading: 16,
    weight: 400,
    use: "Meta, terms, kickers, controls, keys, times",
  },
] as const

export type TypeRole = (typeof TYPE)[number]["role"]

/**
 * Tracking follows size, one rule for every element: (body − size) × 0.03, so 20 px closes up by
 * 0.21 px, 16 px by 0.09, 13 px sits at 0 and 11 px opens by 0.06. Mono never tracks.
 */
export const TRACKING = 0.03
export const trackingAt = (size: number, body = 13) =>
  Math.round((body - size) * TRACKING * 100) / 100

/** Prose stops here: 45–75 characters, centred on 66. */
export const MEASURE = "66ch"

/**
 * The type stack: the platform's own UI face (SF Pro with its optical sizes on Apple, Segoe UI
 * Variable on Windows), so nothing downloads, nothing swaps in, and the pages read like the native
 * apps beside them. A webfont goes in through `reviewFont`.
 */
export const FONT = {
  sans: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  mono: 'ui-monospace,"SF Mono",SFMono-Regular,"Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace',
} as const

/**
 * OpenType: tabular figures everywhere (times and counts never jitter); in data, `ss01` too
 * (straight-sided 6 and 9 in SF, open digits in Inter: figures that can't be misread); code with
 * no ligatures (`=>` stays two characters).
 */
export const FEATURES = {
  figures: "tabular-nums",
  data: '"tnum" 1,"ss01" 1',
  code: "none",
} as const

/** The space roles (px, on the 4 px unit); each from `title` up at least doubles the one below. */
export const SPACE = [
  { role: "inside", px: 4, use: "Parts of one thing: an icon and its label, a term and its value" },
  { role: "sibling", px: 8, use: "Siblings in a group: rows, buttons, a list's lines" },
  { role: "title", px: 12, use: "A heading and what it heads" },
  {
    role: "block",
    px: 24,
    use: "Blocks inside one piece: fact groups, columns, media and its caption",
  },
  { role: "group", px: 48, use: "Steps and options, a hairline in the middle" },
  { role: "section", px: 96, use: "Sections of a page, a hairline in the middle" },
] as const

/** Hairlines and fills: alpha of the text colour, held to an APCA target on the page. */
export const HAIRLINES = [
  { token: "border-subtle", lc: 9, use: "Dividers between rows, steps and sections" },
  { token: "border", lc: 12, use: "Rings round frames and wells" },
  { token: "border-strong", lc: 17, use: "Interactive edges, a focus that isn't the accent" },
] as const

export const FILLS = [
  { token: "fill", use: "A well at rest: code, a chip, a frame loading" },
  { token: "fill-hover", use: "Under the pointer, at once" },
  { token: "fill-selected", use: "The selection pill, a pressed toggle" },
] as const

/** Radii, concentric: what sits inside a frame takes the frame's radius less the gap between. */
export const RADII = [
  { token: "radius", px: 8, use: "Controls and rows 28–32 px high" },
  { token: "radius-panel", px: 12, use: "Frames, wells, cards" },
  { token: "radius / 2", px: 4, use: "Inline code, chips, rows 20 px high" },
] as const

/**
 * The motion set. Springs are a duration and no bounce; nothing moves on load; hovers land at once
 * and ease out; a whole thing replaced in place fades with a 3 px blur.
 */
export const MOTION = [
  {
    name: "hover",
    spring: null,
    ms: "0 in, 120 out",
    use: "A hover's fill: on at once, off softly",
  },
  {
    name: "quick",
    spring: FADE,
    use: "Replacing a whole thing in place: fade, scale .98, blur 3 px",
  },
  { name: "close", spring: CLOSE, use: "A popover closing" },
  { name: "snappy", spring: SPRINGS.snappy, use: "Controls: a toggle, a pick, a chapter row" },
  { name: "state", spring: SPRINGS.default, use: "The selection pill, a disclosure opening" },
  {
    name: "calm",
    spring: SPRINGS.calm,
    use: "Layout: a compare's height, the page scrolling to a step",
  },
  { name: "smooth", spring: SPRINGS.smooth, use: "A step opening to the full window" },
] as const

/**
 * The foundations as private tokens on every review root; the review stylesheet reads them.
 * Tracking is a calc in em, so it resolves on each element at its own size.
 */
export const foundationCss = `
:where(.knobs-walkthrough,.knobs-wt-slot,.knobs-review){
  --_kr-track:calc((var(--_k-type-body) - 1em) * ${TRACKING});
  --_kr-measure:var(--k-walkthrough-measure,${MEASURE});
  --_kr-block:calc(var(--_k-space-title) * 2);
  --_kr-data:${FEATURES.data};
  letter-spacing:var(--_kr-track);font-variant-numeric:${FEATURES.figures};font-optical-sizing:auto;font-kerning:normal}
:where(.knobs-walkthrough,.knobs-wt-slot,.knobs-review) :where(*){letter-spacing:var(--_kr-track)}
:where(.knobs-walkthrough,.knobs-wt-slot,.knobs-review) :where(code,pre,kbd,samp,.knobs-wt-mono){letter-spacing:0;font-variant-ligatures:${FEATURES.code}}
`
