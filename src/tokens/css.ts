import type { Theme } from "../themes/define.js"
import {
  cssName,
  DEPRECATED,
  TOKENS,
  type TokenDef,
  type TokenName,
  tokenForProperty,
} from "./schema.js"

/** A declared value for both appearances: one value, or `light-dark(light, dark)` for a colour. */
function pair(
  def: TokenDef,
  dark: string | undefined,
  light: string | undefined,
): string | undefined {
  if (dark === undefined && light === undefined) return undefined
  if (dark === undefined || light === undefined || dark === light || def.type !== "color")
    return dark ?? light
  return `light-dark(${light},${dark})`
}

const declaredValue = (theme: Theme, def: TokenDef) =>
  pair(def, theme.declared.dark[def.name as TokenName], theme.declared.light[def.name as TokenName])

/**
 * Appearance is `color-scheme`: colour tokens are `light-dark()` pairs. A knobs root follows the
 * system by default, a host's own dark/light convention on an ancestor (`.dark`, `.dark-theme`,
 * `[data-theme]`, `[data-appearance]`), an outer knobs root, and finally its own
 * `data-appearance` (dark | light | system | inherit). Each rule also sets `--_k-light` (0 or 1)
 * for the few numbers that differ by appearance, which `light-dark()` can't pick. A host that sets
 * only `color-scheme` on an ancestor is invisible to CSS; mount code resolves `inherit` for that.
 */
const SCHEMES: readonly (readonly [string, "dark" | "light" | "light dark" | "inherit"])[] = [
  [":where(.knobs-root)", "light dark"],
  [
    ':where(.dark,.dark-theme,[data-theme="dark"],[data-appearance="dark"],[data-knobs-theme="dark"]) :where(.knobs-root)',
    "dark",
  ],
  [
    ':where(.light,.light-theme,[data-theme="light"],[data-appearance="light"],[data-knobs-theme="light"]) :where(.knobs-root)',
    "light",
  ],
  [":where(.knobs-root) :where(.knobs-root:not([data-appearance]))", "inherit"],
  [':where(.knobs-root[data-appearance="dark"])', "dark"],
  [':where(.knobs-root[data-appearance="light"])', "light"],
  [':where(.knobs-root[data-appearance="system"])', "light dark"],
  [':where(.knobs-root[data-appearance="inherit"])', "inherit"],
]
export const APPEARANCE_CSS = SCHEMES.map(([selector, scheme]) => {
  const light = scheme === "light" ? "1" : scheme === "inherit" ? "inherit" : "0"
  const rule = `${selector}{color-scheme:${scheme};--_k-light:${light}}`
  return scheme === "light dark"
    ? `${rule}\n@media(prefers-color-scheme:light){${selector}{--_k-light:1}}`
    : rule
}).join("\n")

/** `var(--k-x)` → `var(--_k-x)`: a derivation reads what the knobs root resolved. */
const privately = (css: string) =>
  css.replace(/var\(--k-([a-z0-9-]+)/g, (m, name: string) =>
    tokenForProperty(`--k-${name}`) ? `var(--_k-${name}` : m,
  )

/**
 * How the knobs root resolves a token, as `--_k-<name>`: a deprecated name a host or an old preset
 * sets, else the public token wherever it's set (the theme's value on `:root`, or a host's on any
 * ancestor), else its derivation from the other resolved tokens. Knobs never declares a deprecated
 * name or a derived public one, so a host's value at any level reaches here.
 */
function resolver(def: TokenDef): string {
  const reads = [...(def.deprecated ?? [])]
  if (def.tier !== "private") reads.push(cssName(def))
  const source = def.source
  const fallback =
    "css" in source
      ? privately(source.css)
      : "value" in source && def.tier === "private"
        ? source.value
        : undefined
  let out = fallback ?? ""
  for (let i = reads.length - 1; i >= 0; i--)
    out = out === "" ? `var(${reads[i]})` : `var(${reads[i]},${out})`
  return def.resolve ? privately(def.resolve).replaceAll("$", out) : out
}

/**
 * The default token sheet for `theme`, in `@layer knobs.tokens` so any host assignment wins: the
 * theme's values (inputs, generated colours as `light-dark()` pairs, literals) as public tokens on
 * `:where(:root,:host)`, every token resolved privately (`--_k-*`) on `:where(.knobs-root)`, and
 * the appearance rules. Component styles read only the private names.
 */
export function tokensCss(theme: Theme): string {
  const root: string[] = []
  const resolved: string[] = []
  for (const def of TOKENS as readonly TokenDef[]) {
    const source = def.source
    const own =
      declaredValue(theme, def) ??
      ("from" in source
        ? ""
        : "value" in source && def.tier !== "private"
          ? source.value
          : undefined)
    if (own !== undefined && def.tier !== "private") root.push(`${cssName(def)}:${own}`)
    resolved.push(`--_k-${def.name}:${resolver(def)}`)
  }
  return `@layer knobs.tokens{
:where(:root,:host){${root.join(";")}}
:where(.knobs-root){${resolved.join(";")}}
${APPEARANCE_CSS}
}`
}

/** One block of everything `theme` declares, under `selector`, to theme part of a page. */
export function themeCss(theme: Theme, selector: string): string {
  const decls: string[] = []
  for (const def of TOKENS as readonly TokenDef[]) {
    const own = declaredValue(theme, def)
    if (own !== undefined) decls.push(`${cssName(def)}:${own}`)
  }
  return `@layer knobs.tokens{${selector}{${decls.join(";")}}}`
}

const cell = (s: string) => s.replaceAll("|", "\\|")

/** The README token reference: every public token with its values in `theme`, then the renames. */
export function tokensTable(theme: Theme): string {
  const lines: string[] = []
  const groups = new Map<string, TokenDef[]>()
  for (const def of TOKENS as readonly TokenDef[]) {
    if (def.tier === "private") continue
    groups.set(def.group, [...(groups.get(def.group) ?? []), def])
  }
  const row = (def: TokenDef) => {
    const source = def.source
    const derived = "css" in source && theme.declared.dark[def.name as TokenName] === undefined
    const show = (v: string) =>
      derived && def.type !== "color" ? `\`${cell(source.css)}\`` : `\`${cell(v)}\``
    const dark = theme.dark[def.name as TokenName]
    const light = theme.light[def.name as TokenName]
    const via = derived ? ` Derived: \`${cell(source.css)}\`.` : ""
    lines.push(
      `| \`${cssName(def)}\` | ${def.tier} | ${show(dark)} | ${show(light)} | ${cell(def.doc)}${via} |`,
    )
  }
  for (const [group, defs] of groups) {
    lines.push("", `### ${group}`, "", "| Token | Tier | Dark | Light | |", "|---|---|---|---|---|")
    for (const def of defs) row(def)
  }
  lines.push("", "### Renamed", "", "| Old | New |", "|---|---|")
  for (const [old, next] of DEPRECATED) lines.push(`| \`${old}\` | \`${next}\` |`)
  return `${lines.join("\n").trim()}\n`
}
