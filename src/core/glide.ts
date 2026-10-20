// Every token animates when it changes (a theme, a preset, the meta page tuning itself). Each
// token the knobs root resolves (--_k-pad) drives a typed, non-inherited twin on the root
// (--kt-pad) that the browser can interpolate and transitions on the panel spring; an untyped
// alias (--kv-pad) hands the in-between value down, so the subtree inherits plain values, which
// restyle far more cheaply than typed ones. Panels, chips and knobs/ui pieces read the aliases;
// the GPU overlay reads them each frame.
const COLOR_TOKENS = [
  "bg",
  "fill",
  "fill-selected",
  "border",
  "border-strong",
  "fg",
  "fg-2",
  "fg-3",
  "accent",
  "modified",
  "segmented-track",
  "segmented-active",
  "toggle-track",
  "toggle-thumb",
  "toggle-thumb-off",
  "slider-handle",
  "rim",
  "border-subtle",
  "bg-page",
]
const LENGTH_TOKENS = ["pad", "inset", "row", "gap", "radius", "radius-panel", "font-size"]
const NUMBER_TOKENS = ["weight-label", "blur", "glow", "glass", "glass-tone"]
const ANIMATED = [...COLOR_TOKENS, ...LENGTH_TOKENS, ...NUMBER_TOKENS, "width"]
/** The transitions that glide every driver, for a root that also transitions its own properties. */
export const TOKEN_TRANSITIONS = ANIMATED.map((t) => `--kt-${t} var(--k-token-t)`).join(",")
/** A driver follows what the knobs root resolved (--_k-*); --k-blur isn't a token. */
const source = (t: string) => (t === "blur" ? "--k-blur" : `--_k-${t}`)
const register = (names: readonly string[], syntax: string, initial: string) =>
  names
    .map((n) => `@property --kt-${n}{syntax:"${syntax}";inherits:false;initial-value:${initial}}`)
    .join("\n")
/** Elements whose tokens glide: each declares the drivers. */
export const GLIDING = ".knobs-panel,.knobs-chip,.knobs-notice,.knobs-ui"
export const DRIVERS = `${register(COLOR_TOKENS, "<color>", "transparent")}
${register(LENGTH_TOKENS, "<length>", "0px")}
${register(NUMBER_TOKENS, "<number>", "0")}
${register(["width"], "<length-percentage>", "288px")}
:where(${GLIDING}){${ANIMATED.map((t) => `--kt-${t}:var(${source(t)});--kv-${t}:var(--kt-${t})`).join(";")};--k-token-t:calc(var(--k-fill-ms) * 1ms) var(--k-fill-ease)}
:where(.knobs-ui){transition:${TOKEN_TRANSITIONS}}
:root[data-knobs-scrub] :where(.knobs-chip,.knobs-ui){--k-token-t:0s}
@media(prefers-reduced-motion:reduce){:where(.knobs-chip,.knobs-ui){--k-token-t:0s}}`
/** Rules read the gliding aliases of what glides, and what the knobs root resolved otherwise. */
export const aliased = (css: string) =>
  css
    .replace(new RegExp(`var\\(--_k-(${ANIMATED.join("|")})\\)`, "g"), "var(--kv-$1)")
    .replace(/var\(--k-blur\)/g, "var(--kv-blur)")
