/**
 * The class every knobs top-level element carries: panels, chips, menus, the status toast, and
 * every knobs/ui piece's root.
 */
export const ROOT_CLASS = "knobs-root"

// :root holds only input tokens. Anything derived from another token is derived here, on each
// knobs root, so an override on a panel, a preset or any ancestor (--k-accent on a light panel,
// --k-density on a subtree, --k-contrast on one panel) reaches what's derived from it. Derived
// values take private names (--_k-*), and each still honours its public token where a host sets
// that (on :root, an ancestor or the element). Every input has a fallback, so a knobs/ui piece
// without the panel's :root defaults derives the same values.
//
// Density scales sizes from their defaults at 1: .875 is compact (28px rows, 8px padding, 3px
// gaps, 6px corners, 11px type) and 1.1875 comfortable (38, 12, 6, 10 and 13).
const DENSITY = "var(--k-density,1)"
const CONTRAST = "var(--k-contrast,1)"
const derived: Record<string, string> = {
  surface: `rgba(255,255,255,calc(.055 * ${CONTRAST}))`,
  "surface-hi": `rgba(255,255,255,calc(.11 * ${CONTRAST}))`,
  line: `rgba(255,255,255,calc(.1 * ${CONTRAST}))`,
  "line-hi": `rgba(255,255,255,calc(.18 * ${CONTRAST}))`,
  edge: `rgba(255,255,255,calc(.07 * ${CONTRAST}))`,
  "seg-active": "var(--_k-surface-hi)",
  "toggle-thumb": "var(--k-bg,#1c1c1e)",
  row: `round(calc(32px * ${DENSITY}),2px)`,
  pad: `round(calc(10px * ${DENSITY}),2px)`,
  gap: `round(calc(var(--k-unit,4px) * (1 + (${DENSITY} - 1) * 2.5)),1px)`,
  radius: `round(calc(8px * (1 + (${DENSITY} - 1) * 1.5)),2px)`,
  "font-size": `round(calc(12px * (1 + (${DENSITY} - 1) * .5)),1px)`,
  inset: "var(--_k-pad)",
  "panel-radius": "calc(var(--_k-radius) + var(--k-unit,4px))",
  "fill-base": "var(--_k-surface-hi)",
  "fill-hover-mix": "var(--k-fill-rest-mix,20%)",
  handle: "var(--k-accent,#fff)",
  "value-font": 'var(--k-font,system-ui,-apple-system,"SF Pro Text",sans-serif)',
  "reveal-ease": "var(--k-ease,cubic-bezier(.2,.8,.2,1))",
}

/** Tokens derived on each knobs root: read them as `--_k-<name>`. */
export const DERIVED_TOKENS: readonly string[] = Object.keys(derived)

// Fixed shadows (a chip's, a tooltip's, a toast's) scale with --k-shadow-strength, the panel
// shadow's (.48 on dark panels, .16 on light): as dark as they were on dark, lighter on light.
export const rootCss = `:where(.${ROOT_CLASS}){${Object.entries(derived)
  .map(([k, v]) => `--_k-${k}:var(--k-${k},${v})`)
  .join(";")};--_k-shadow-k:calc(var(--k-shadow-strength,.48) / .48)}`
