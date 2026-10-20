import type { Theme } from "../themes/define.js"
import { cssName, DEPRECATED, TOKENS, type TokenDef, type TokenName } from "./schema.js"

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
 * system by default, a host's own dark/light convention on an ancestor, an outer knobs root, and
 * finally its own `data-appearance` (dark | light | system | inherit). A host that sets only
 * `color-scheme` on `:root` is invisible to CSS; mount code resolves `inherit` for that case.
 */
export const APPEARANCE_CSS = [
  ":where(.knobs-root){color-scheme:light dark}",
  ':where(.dark,.dark-theme,[data-theme="dark"],[data-appearance="dark"]) :where(.knobs-root){color-scheme:dark}',
  ':where(.light,.light-theme,[data-theme="light"],[data-appearance="light"]) :where(.knobs-root){color-scheme:light}',
  ":where(.knobs-root) :where(.knobs-root:not([data-appearance])){color-scheme:inherit}",
  ':where(.knobs-root[data-appearance="dark"]){color-scheme:dark}',
  ':where(.knobs-root[data-appearance="light"]){color-scheme:light}',
  ':where(.knobs-root[data-appearance="system"]){color-scheme:light dark}',
  ':where(.knobs-root[data-appearance="inherit"]){color-scheme:inherit}',
].join("\n")

/**
 * The default token sheet for `theme`, in `@layer knobs.tokens` so any host assignment wins:
 * theme inputs and literals on `:where(:root,:host)`, derivations on `:where(.knobs-root)` (with
 * the theme's overrides of derived tokens in their place), aliases for deprecated names, and the
 * appearance rules.
 */
export function tokensCss(theme: Theme): string {
  const root: string[] = []
  const derived: string[] = []
  for (const def of TOKENS as readonly TokenDef[]) {
    const own = declaredValue(theme, def)
    const source = def.source
    if ("css" in source) derived.push(`${cssName(def)}:${own ?? source.css}`)
    else root.push(`${cssName(def)}:${own ?? ("value" in source ? source.value : "")}`)
  }
  const aliases = [...DEPRECATED].map(([old, next]) => `${old}:var(${next})`)
  return `@layer knobs.tokens{
:where(:root,:host){${root.join(";")}}
:where(.knobs-root){${derived.join(";")};
${aliases.join(";")}}
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
  let group = ""
  for (const def of TOKENS as readonly TokenDef[]) {
    if (def.tier === "private") continue
    if (def.group !== group) {
      group = def.group
      lines.push(
        "",
        `### ${group}`,
        "",
        "| Token | Tier | Dark | Light | |",
        "|---|---|---|---|---|",
      )
    }
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
  lines.push("", "### Renamed", "", "| Old | New |", "|---|---|")
  for (const [old, next] of DEPRECATED) lines.push(`| \`${old}\` | \`${next}\` |`)
  return `${lines.join("\n").trim()}\n`
}
