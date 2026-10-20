/**
 * Every knobs design token, in one typed list: the source the CSS, the README table, the
 * TypeScript name unions and the theme generator are all produced from.
 *
 * Tiers:
 * - `input`: a theme dial that is also a live CSS variable (set it anywhere; derivations follow).
 * - `semantic`: the public contract (`--k-{role}-{variant}`).
 * - `hook`: a documented per-component override, defaulting to a semantic token.
 * - `private`: an implementation detail (`--_k-*`); not part of the public API.
 *
 * Sources:
 * - `{ from: "theme" }`: the theme generator supplies it (per appearance for colours); declared
 *   on `:where(:root,:host)`.
 * - `{ value }`: a fixed literal default; declared on `:where(:root,:host)`.
 * - `{ css }`: derived from other tokens; declared on `:where(.knobs-root)`, so an override on any
 *   ancestor of a knobs element (or on the element) flows through.
 */

export type Tier = "input" | "semantic" | "hook" | "private"
export type TokenType = "color" | "length" | "number" | "font" | "shadow" | "spring" | "integer"
export type TokenSource =
  | { readonly from: "theme" }
  | { readonly value: string }
  | { readonly css: string }

export interface TokenDef {
  /** The name without its prefix: `bg-page` is `--k-bg-page`, private `tray-pad` is `--_k-tray-pad`. */
  readonly name: string
  readonly tier: Tier
  readonly type: TokenType
  readonly group: string
  readonly source: TokenSource
  readonly doc: string
  /** Today's names (`--k-*`, `--ku-*`) that now read this token. Removed after one release. */
  readonly deprecated?: readonly string[]
  /**
   * How the knobs root resolves the token from its value (`$`), when that isn't the value itself:
   * the control radius scales with density.
   */
  readonly resolve?: string
}

const theme = { from: "theme" } as const
const css = <const S extends string>(s: S) => ({ css: s }) as const
const value = <const S extends string>(s: S) => ({ value: s }) as const

const alpha = (pct: number, of = "var(--k-fg)") =>
  `color-mix(in oklch,${of} calc(${pct}% * var(--k-contrast)),transparent)` as const

export const TOKENS = [
  // Inputs: theme dials that are also live variables.
  {
    name: "accent",
    tier: "input",
    type: "color",
    group: "Accent",
    source: theme,
    doc: "The one accent: primary actions, handles, focus. Hover, soft and selection derive from it in CSS.",
    deprecated: ["--ku-accent"],
  },
  {
    name: "contrast",
    tier: "input",
    type: "number",
    group: "Inputs",
    source: theme,
    doc: "Contrast multiplier for fills and alpha borders (1 = default; the theme's 0–100 dial maps 50 → 1).",
  },
  {
    name: "radius",
    tier: "input",
    type: "length",
    group: "Shape",
    source: theme,
    doc: "Control corner radius. 0 squares everything, including capsules. Scales with density.",
    deprecated: ["--ku-radius"],
    resolve: "round(calc($ * (1 + (var(--_k-density) - 1) * 1.5)),2px)",
  },
  {
    name: "density",
    tier: "input",
    type: "number",
    group: "Size",
    source: theme,
    doc: "Size multiplier: compact .875, default 1, comfortable 1.1875.",
  },
  {
    name: "font",
    tier: "input",
    type: "font",
    group: "Type",
    source: theme,
    doc: "UI font stack.",
    deprecated: ["--ku-font"],
  },
  {
    name: "mono",
    tier: "input",
    type: "font",
    group: "Type",
    source: theme,
    doc: "Monospace font stack.",
    deprecated: ["--ku-mono"],
  },

  // Surfaces: the generated neutral ladder.
  {
    name: "bg-page",
    tier: "semantic",
    type: "color",
    group: "Surfaces",
    source: theme,
    doc: "The page behind panels; workspace backdrops.",
    deprecated: ["--k-page", "--ku-page"],
  },
  {
    name: "bg-inset",
    tier: "semantic",
    type: "color",
    group: "Surfaces",
    source: theme,
    doc: "Wells sunk into a panel: tracks, inputs, segmented backgrounds.",
  },
  {
    name: "bg",
    tier: "semantic",
    type: "color",
    group: "Surfaces",
    source: theme,
    doc: "The panel surface.",
    deprecated: ["--ku-bg"],
  },
  {
    name: "bg-raised",
    tier: "semantic",
    type: "color",
    group: "Surfaces",
    source: theme,
    doc: "Raised within a panel: the active segment, cards on a panel.",
  },
  {
    name: "bg-overlay",
    tier: "semantic",
    type: "color",
    group: "Surfaces",
    source: theme,
    doc: "Floating surfaces: menus, popovers, tooltips.",
  },

  // Fills: alpha of the foreground, so they work on glass and any surface.
  {
    name: "fill",
    tier: "semantic",
    type: "color",
    group: "Fills",
    source: css(alpha(5.5)),
    doc: "Resting fill for controls.",
    deprecated: ["--k-surface", "--ku-surface"],
  },
  {
    name: "fill-hover",
    tier: "semantic",
    type: "color",
    group: "Fills",
    source: css(alpha(8)),
    doc: "Hovered fill.",
  },
  {
    name: "fill-selected",
    tier: "semantic",
    type: "color",
    group: "Fills",
    source: css(alpha(11)),
    doc: "Pressed or selected fill.",
    deprecated: ["--k-surface-hi", "--ku-surface-hi"],
  },

  // Foreground: text and icons, four tiers (APCA-checked by the generator).
  {
    name: "fg",
    tier: "semantic",
    type: "color",
    group: "Foreground",
    source: theme,
    doc: "Primary text and icons (≥ Lc 90 on bg).",
    deprecated: ["--k-text", "--ku-text"],
  },
  {
    name: "fg-2",
    tier: "semantic",
    type: "color",
    group: "Foreground",
    source: theme,
    doc: "Secondary text: labels (≥ Lc 75).",
    deprecated: ["--k-label", "--ku-label"],
  },
  {
    name: "fg-3",
    tier: "semantic",
    type: "color",
    group: "Foreground",
    source: theme,
    doc: "Tertiary text: metadata, units, captions (≥ Lc 45).",
    deprecated: ["--k-dim", "--ku-dim"],
  },
  {
    name: "fg-4",
    tier: "semantic",
    type: "color",
    group: "Foreground",
    source: theme,
    doc: "Placeholder and disabled text (≥ Lc 30).",
  },

  // Borders.
  {
    name: "border-subtle",
    tier: "semantic",
    type: "color",
    group: "Borders",
    source: css(alpha(6)),
    doc: "Hairline edges and dividers (below Lc 15 by design).",
    deprecated: ["--k-edge"],
  },
  {
    name: "border",
    tier: "semantic",
    type: "color",
    group: "Borders",
    source: css(alpha(10)),
    doc: "Default borders.",
    deprecated: ["--k-line", "--ku-line"],
  },
  {
    name: "border-strong",
    tier: "semantic",
    type: "color",
    group: "Borders",
    source: theme,
    doc: "Interactive edges (≥ Lc 15; solid).",
    deprecated: ["--k-line-hi", "--ku-line-hi"],
  },

  // Accent (input above).
  {
    name: "accent-hover",
    tier: "semantic",
    type: "color",
    group: "Accent",
    source: css("color-mix(in oklch,var(--k-accent) 90%,var(--k-bg))"),
    doc: "Hovered accent.",
  },
  {
    name: "accent-soft",
    tier: "semantic",
    type: "color",
    group: "Accent",
    source: css("color-mix(in oklch,var(--k-accent) 15%,transparent)"),
    doc: "Accent tint behind accent content.",
  },
  {
    name: "accent-fg",
    tier: "semantic",
    type: "color",
    group: "Accent",
    source: theme,
    doc: "Accent as text on bg (≥ Lc 60).",
  },
  {
    name: "on-accent",
    tier: "semantic",
    type: "color",
    group: "Accent",
    source: theme,
    doc: "Content placed on a solid accent.",
  },

  // Status.
  { name: "ok", tier: "semantic", type: "color", group: "Status", source: theme, doc: "Success." },
  {
    name: "warn",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: theme,
    doc: "Warning.",
    deprecated: ["--ku-warn"],
  },
  {
    name: "danger",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: theme,
    doc: "Error, destructive. Put text on danger-soft rather than bare bg.",
    deprecated: ["--k-critical", "--ku-critical"],
  },
  {
    name: "info",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: theme,
    doc: "Informational.",
  },
  {
    name: "ok-soft",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: css("color-mix(in oklch,var(--k-ok) 15%,transparent)"),
    doc: "Success tint.",
  },
  {
    name: "warn-soft",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: css("color-mix(in oklch,var(--k-warn) 15%,transparent)"),
    doc: "Warning tint.",
  },
  {
    name: "danger-soft",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: css("color-mix(in oklch,var(--k-danger) 15%,transparent)"),
    doc: "Danger tint.",
  },
  {
    name: "info-soft",
    tier: "semantic",
    type: "color",
    group: "Status",
    source: css("color-mix(in oklch,var(--k-info) 15%,transparent)"),
    doc: "Info tint.",
  },

  // Interaction.
  {
    name: "focus",
    tier: "semantic",
    type: "color",
    group: "Interaction",
    source: css("var(--k-accent)"),
    doc: "Focus ring colour (drawn as a 2px bg gap, then 2px of focus).",
  },
  {
    name: "selection",
    tier: "semantic",
    type: "color",
    group: "Interaction",
    source: css("color-mix(in oklch,var(--k-accent) 24%,transparent)"),
    doc: "Selected rows and ranges.",
    deprecated: ["--k-ui-select", "--ku-select"],
  },
  {
    name: "scrim",
    tier: "semantic",
    type: "color",
    group: "Interaction",
    source: theme,
    doc: "Dimming behind modal layers.",
  },

  // Data.
  {
    name: "diff-add",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: css("var(--k-ok)"),
    doc: "Added lines; line and word tints derive privately (12% / 38%).",
  },
  {
    name: "diff-del",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: css("var(--k-danger)"),
    doc: "Deleted lines.",
  },
  {
    name: "diff-mod",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: css("var(--k-warn)"),
    doc: "Modified lines.",
  },
  {
    name: "series-1",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 1.",
  },
  {
    name: "series-2",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 2.",
  },
  {
    name: "series-3",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 3.",
  },
  {
    name: "series-4",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 4.",
  },
  {
    name: "series-5",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 5.",
  },
  {
    name: "series-6",
    tier: "semantic",
    type: "color",
    group: "Data",
    source: theme,
    doc: "Chart series 6.",
  },

  // Shape (radius is an input).
  {
    name: "radius-panel",
    tier: "semantic",
    type: "length",
    group: "Shape",
    source: css("calc(var(--k-radius) + var(--k-unit))"),
    doc: "Panel and card radius, concentric with controls.",
    deprecated: ["--k-panel-radius", "--ku-panel-radius"],
  },
  {
    name: "round",
    tier: "semantic",
    type: "length",
    group: "Shape",
    source: css("calc(var(--k-radius) * 999)"),
    doc: "Capsule radius that squares when --k-radius is 0. Use instead of 999px.",
  },

  // Size (density is an input).
  {
    name: "unit",
    tier: "semantic",
    type: "length",
    group: "Size",
    source: value("4px"),
    doc: "The spacing unit.",
  },
  {
    name: "row",
    tier: "semantic",
    type: "length",
    group: "Size",
    source: css("round(calc(32px * var(--k-density)),2px)"),
    doc: "Row height.",
    deprecated: ["--ku-row"],
  },
  {
    name: "width",
    tier: "semantic",
    type: "length",
    group: "Size",
    source: value("288px"),
    doc: "Panel width.",
  },

  // Space: the page's rhythm (walkthroughs, pages built from knobs/ui), on the 4px unit. Each
  // role at least doubles the one below it from title up, so neighbouring gaps never read as
  // mistakes. Fixed: density sizes a panel's controls, not a page's rhythm.
  {
    name: "space-inside",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("var(--k-unit)"),
    doc: "Parts of one thing: an icon and its label, a meta line and its title.",
  },
  {
    name: "space-sibling",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 2)"),
    doc: "Siblings in a group: buttons in a row, a list item's lines.",
  },
  {
    name: "space-title",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 3)"),
    doc: "A heading and what it heads.",
  },
  {
    name: "space-group",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 12)"),
    doc: "Groups inside a section (prose, video, diff), stacked media, feed items (a hairline in the middle).",
  },
  {
    name: "space-section",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 24)"),
    doc: "Sections of a page (the intro, the updates, each PR), a hairline in the middle.",
  },
  {
    name: "space-column",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 6)"),
    doc: "Columns: a contents rail and the page, media side by side.",
  },
  {
    name: "pad-page",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 6)"),
    doc: "A page's edge; 16px under 640px wide.",
  },
  {
    name: "pad-card",
    tier: "semantic",
    type: "length",
    group: "Space",
    source: css("calc(var(--k-unit) * 3)"),
    doc: "Inside a card or popover.",
  },

  // Type (font and mono are inputs).
  // The page's five sizes, each with its line height, in two weights (400, and 500 for headings,
  // labels and emphasis). Mono sits one size down from what's around it; figures are tabular.
  // Fixed like the space roles: the panel's own sizes follow --k-font-size and density.
  {
    name: "type-heading",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("20px"),
    doc: "Section headings (a PR's title, under its kicker), weight 500.",
  },
  {
    name: "leading-heading",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("28px"),
    doc: "Line height for type-heading.",
  },
  {
    name: "type-title",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("16px"),
    doc: "A page's title, weight 500.",
  },
  {
    name: "leading-title",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("24px"),
    doc: "Line height for type-title.",
  },
  {
    name: "type-body",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("13px"),
    doc: "Prose, questions, list rows, step titles; 400, or 500 for emphasis.",
  },
  {
    name: "leading-body",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("20px"),
    doc: "Line height for type-body.",
  },
  {
    name: "type-label",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("12px"),
    doc: "Labels over media, weight 500; mono inside body text.",
  },
  {
    name: "leading-label",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("16px"),
    doc: "Line height for type-label.",
  },
  {
    name: "type-small",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("11px"),
    doc: "Meta, controls, keys, timestamps; mono inside labels.",
  },
  {
    name: "leading-small",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: value("16px"),
    doc: "Line height for type-small.",
  },
  {
    name: "font-size",
    tier: "semantic",
    type: "length",
    group: "Type",
    source: css("round(calc(12px * (1 + (var(--k-density) - 1) * .5)),1px)"),
    doc: "Body size; a 5-step scale derives privately.",
    deprecated: ["--ku-font-size"],
  },
  {
    name: "value-font",
    tier: "semantic",
    type: "font",
    group: "Type",
    source: css("var(--k-font)"),
    doc: "Font for readouts and values (labPreset: mono).",
    deprecated: ["--ku-value-font"],
  },

  // Material.
  {
    name: "shadow-raised",
    tier: "semantic",
    type: "shadow",
    group: "Material",
    source: theme,
    doc: "Small lift for raised controls.",
    deprecated: ["--k-lift-shadow"],
  },
  {
    name: "shadow-overlay",
    tier: "semantic",
    type: "shadow",
    group: "Material",
    source: theme,
    doc: "Floating panels, menus, popovers.",
    deprecated: ["--k-shadow", "--ku-shadow"],
  },
  {
    name: "glass",
    tier: "semantic",
    type: "number",
    group: "Material",
    source: theme,
    doc: "Backdrop glass amount (0 = opaque).",
  },
  {
    name: "glow",
    tier: "semantic",
    type: "number",
    group: "Material",
    source: theme,
    doc: "Specular glow amount.",
  },
  {
    name: "rim",
    tier: "semantic",
    type: "color",
    group: "Material",
    source: theme,
    doc: "Top-edge highlight hairline.",
    deprecated: ["--ku-rim"],
  },

  // Motion and stacking.
  {
    name: "spring",
    tier: "semantic",
    type: "spring",
    group: "Motion",
    source: value("0.3 0"),
    doc: "Default spring as `duration bounce` (the motion module's `default`).",
  },
  {
    name: "hover-in",
    tier: "semantic",
    type: "number",
    group: "Motion",
    source: value("0"),
    doc: "Hover wash fade-in, unitless milliseconds.",
    deprecated: ["--ku-hover-in"],
  },
  {
    name: "hover-out",
    tier: "semantic",
    type: "number",
    group: "Motion",
    source: value("120"),
    doc: "Hover wash fade-out, unitless milliseconds.",
    deprecated: ["--ku-hover-out"],
  },
  {
    name: "z",
    tier: "semantic",
    type: "integer",
    group: "Motion",
    source: value("2147480000"),
    doc: "Base of knobs' stacking ladder; layers add small offsets.",
  },

  // Component hooks.
  {
    name: "slider-track",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fill)"),
    doc: "Slider track.",
  },
  {
    name: "slider-fill",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("color-mix(in oklch,var(--k-accent) 20%,var(--k-fill-selected))"),
    doc: "Slider value fill.",
    deprecated: ["--k-fill-rest"],
  },
  {
    name: "slider-handle",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-accent)"),
    doc: "Slider handle and range thumbs.",
    deprecated: ["--k-handle"],
  },
  {
    name: "toggle-thumb-off",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("#ffffff"),
    doc: "A switch's thumb while off, and the ring around colour and gradient thumbs.",
    deprecated: ["--k-thumb"],
  },
  {
    name: "toggle-track",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fill-selected)"),
    doc: "Toggle track, off.",
  },
  {
    name: "toggle-track-on",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-accent)"),
    doc: "Toggle track, on.",
  },
  {
    name: "toggle-thumb",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-on-accent)"),
    doc: "Toggle thumb.",
  },
  {
    name: "segmented-track",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-bg-inset)"),
    doc: "Segmented control background.",
    deprecated: ["--k-seg-bg", "--ku-seg-bg"],
  },
  {
    name: "segmented-active",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-bg-raised)"),
    doc: "Active segment.",
    deprecated: ["--k-seg-active"],
  },
  {
    name: "timeline-playhead",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-accent)"),
    doc: "Timeline playhead.",
  },
  {
    name: "split-gutter",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-border-subtle)"),
    doc: "Split pane divider.",
    deprecated: ["--k-ui-divider", "--ku-divider"],
  },
  {
    name: "compare-divider",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fg)"),
    doc: "Before/after divider line.",
    deprecated: ["--k-compare-line"],
  },
  {
    name: "compare-stage",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fill)"),
    doc: "Compare stage background.",
  },
  {
    name: "activity-rail",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-border-strong)"),
    doc: "Activity rail line.",
    deprecated: ["--k-activity-line"],
  },
  {
    name: "picker-card",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fill)"),
    doc: "Picker card.",
  },
  {
    name: "pane-bg",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-bg)"),
    doc: "knobs/ui pane card.",
    deprecated: ["--k-ui-pane", "--ku-pane-bg"],
  },
  {
    name: "button-bg",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fill)"),
    doc: "Button fill.",
  },
  {
    name: "button-border",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("transparent"),
    doc: "Button border.",
    deprecated: ["--k-button-line"],
  },
  {
    name: "button-fg",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fg)"),
    doc: "Button text.",
    deprecated: ["--k-button-color"],
  },
  {
    name: "row-hover",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("color-mix(in oklch,var(--k-fill) 50%,transparent)"),
    doc: "Row hover wash.",
  },
  {
    name: "group-label",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fg-3)"),
    doc: "Folder and group headings.",
    deprecated: ["--k-group-ink", "--k-group-color"],
  },
  {
    name: "modified",
    tier: "hook",
    type: "color",
    group: "Hooks",
    source: css("var(--k-fg-3)"),
    doc: "Marker for values changed from their default.",
  },

  // Private: implementation details read by components; not public.
  {
    name: "tray-pad",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-unit) * .5)"),
    doc: "Padding inside a tray around its controls.",
    deprecated: ["--k-tray-pad"],
  },
  {
    name: "pad",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("round(calc(10px * var(--k-density)),2px)"),
    doc: "Panel padding.",
    deprecated: ["--k-pad"],
  },
  {
    name: "inset",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("var(--_k-pad)"),
    doc: "Row content inset.",
    deprecated: ["--k-inset", "--ku-inset"],
  },
  {
    name: "gap",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("round(calc(var(--k-unit) * (1 + (var(--k-density) - 1) * 2.5)),1px)"),
    doc: "Gap between rows.",
    deprecated: ["--k-gap"],
  },
  {
    name: "radius-md",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("max(0px,calc(var(--k-radius) - var(--_k-tray-pad)))"),
    doc: "Concentric radius one tray in.",
    deprecated: ["--k-radius-md"],
  },
  {
    name: "radius-sm",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("max(0px,calc(var(--k-radius) - var(--_k-tray-pad) * 2))"),
    doc: "Concentric radius two trays in.",
    deprecated: ["--k-radius-sm"],
  },
  {
    name: "control-h",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-row) - var(--k-unit) * 2)"),
    doc: "Control height inside a row.",
    deprecated: ["--k-control-h", "--ku-control-h"],
  },
  {
    name: "value-size",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-font-size) - .5px)"),
    doc: "Readout size.",
    deprecated: ["--k-value-size", "--ku-value-size"],
  },
  {
    name: "text-title",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-font-size) + 1px)"),
    doc: "Type scale: titles.",
    deprecated: ["--k-text-title"],
  },
  {
    name: "text-body",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("var(--k-font-size)"),
    doc: "Type scale: body.",
    deprecated: ["--k-text-body"],
  },
  {
    name: "text-control",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-font-size) - .5px)"),
    doc: "Type scale: controls.",
    deprecated: ["--k-text-control"],
  },
  {
    name: "text-meta",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-font-size) - 1px)"),
    doc: "Type scale: metadata.",
    deprecated: ["--k-text-meta", "--ku-text-meta"],
  },
  {
    name: "text-cap",
    tier: "private",
    type: "length",
    group: "Private",
    source: css("calc(var(--k-font-size) - 2px)"),
    doc: "Type scale: caps and captions.",
    deprecated: ["--k-text-cap"],
  },
  {
    name: "weight",
    tier: "private",
    type: "number",
    group: "Private",
    source: value("400"),
    doc: "Body weight.",
    deprecated: ["--k-font-weight", "--ku-font-weight"],
  },
  {
    name: "weight-label",
    tier: "private",
    type: "number",
    group: "Private",
    source: value("500"),
    doc: "Label weight.",
    deprecated: ["--k-label-weight", "--ku-label-weight"],
  },
  {
    name: "weight-title",
    tier: "private",
    type: "number",
    group: "Private",
    source: value("600"),
    doc: "Title weight.",
    deprecated: ["--k-title-weight", "--ku-title-weight"],
  },
  {
    name: "focus-ring",
    tier: "private",
    type: "shadow",
    group: "Private",
    source: css("0 0 0 2px var(--k-bg),0 0 0 4px var(--k-focus)"),
    doc: "Two-layer focus ring: a bg gap, then the focus colour.",
  },
  {
    name: "diff-add-line",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-add) 12%,transparent)"),
    doc: "Added line tint.",
  },
  {
    name: "diff-add-word",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-add) 38%,transparent)"),
    doc: "Added word tint.",
  },
  {
    name: "diff-del-line",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-del) 12%,transparent)"),
    doc: "Deleted line tint.",
  },
  {
    name: "diff-del-word",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-del) 38%,transparent)"),
    doc: "Deleted word tint.",
  },
  {
    name: "diff-mod-line",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-mod) 12%,transparent)"),
    doc: "Modified line tint.",
  },
  {
    name: "diff-mod-word",
    tier: "private",
    type: "color",
    group: "Private",
    source: css("color-mix(in oklch,var(--k-diff-mod) 38%,transparent)"),
    doc: "Modified word tint.",
  },
] as const satisfies readonly TokenDef[]

type Defs = (typeof TOKENS)[number]
/** Every token's short name. */
export type TokenName = Defs["name"]
/** Public tokens: inputs, semantic tokens and hooks. */
export type PublicTokenName = Exclude<Defs, { tier: "private" }>["name"]
export type SemanticTokenName = Extract<Defs, { tier: "semantic" | "input" }>["name"]
export type HookName = Extract<Defs, { tier: "hook" }>["name"]
export type ColorTokenName = Extract<Defs, { type: "color" }>["name"]
/** Tokens a theme generates (per appearance where they're colours). */
export type ThemeTokenName = Extract<Defs, { source: { from: "theme" } }>["name"]
/** Public CSS custom property names. */
export type TokenProperty = `--k-${PublicTokenName}`

export const TOKEN_BY_NAME: ReadonlyMap<TokenName, Defs> = new Map(TOKENS.map((t) => [t.name, t]))

/** The custom property for a token: `--k-bg`, or `--_k-tray-pad` for a private one. */
export const cssName = (t: Pick<TokenDef, "name" | "tier">) =>
  `${t.tier === "private" ? "--_k-" : "--k-"}${t.name}`

const PROPERTY_TO_NAME = new Map<string, TokenName>(TOKENS.map((t) => [cssName(t), t.name]))
/** The token a custom property names, if any. */
export const tokenForProperty = (property: string): TokenName | undefined =>
  PROPERTY_TO_NAME.get(property)

/** Deprecated property → the property it now reads. */
export const DEPRECATED: ReadonlyMap<string, string> = new Map(
  TOKENS.flatMap((t) =>
    ((t as TokenDef).deprecated ?? []).map((old) => [old, cssName(t)] as const),
  ),
)

/**
 * Names knobs used internally that now belong to a public token of a different kind, and so must
 * never be registered or set as anything else: the slider's position was `--k-fill`.
 */
export const RETIRED_INTERNAL = ["--k-fill"] as const

/** The theme dials that are not CSS variables (they shape the generated values). */
export const THEME_DIALS = {
  appearance: "dark | light | system | inherit: sets color-scheme; colours are light-dark() pairs.",
  gray: "{ hue, chroma }: tint of the neutral ladder (chroma 0–0.02).",
  accent: "Accent colour; one value (dark) or { dark, light }.",
  contrast: "0–100; 50 is default. Spreads the ladder and scales fills and borders.",
  radius: "Control radius in px.",
  density: "compact | default | comfortable.",
  material: "glass | solid | flat: shadows, glass, glow, rim; flat makes borders solid.",
  font: "{ sans, mono } stacks.",
} as const
