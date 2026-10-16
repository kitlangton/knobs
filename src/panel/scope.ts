// Where keyboard commands land. Focus sits at one of three levels: a row, its card (a group's, or
// a run of ungrouped rows), or the panel itself. R (Random) and ⇧R (Reset) act on the level
// focused, Esc climbs one level a press, and digits pick the focused row's options.

/** How deep focus sits in the panel. */
export type FocusLevel = "row" | "card" | "panel" | "none"

/** Where Esc takes focus from `level`: up one, past a card when the row isn't in one. */
export function escapeTo(level: FocusLevel, inCard = true): FocusLevel {
  if (level === "row") return inCard ? "card" : "panel"
  if (level === "card") return "panel"
  return "none"
}

/** What R and ⇧R act on: a selection always wins, then the level focused. */
export type CommandScope = "selection" | "row" | "group" | "all"

export function commandScope(level: FocusLevel, selection = false): CommandScope {
  if (selection) return "selection"
  if (level === "row") return "row"
  if (level === "card") return "group"
  return "all"
}

/** How a command reads from where it would land: "Random this", "Reset group", "Random all". */
export function scopeLabel(verb: string, scope: CommandScope): string {
  const what =
    scope === "selection"
      ? "selected"
      : scope === "row"
        ? "this"
        : scope === "group"
          ? "group"
          : "all"
  return `${verb} ${what}`
}

/**
 * What a scoped command acts on, as the focus lens flashes it: the selected rows, the focused
 * row, its card, or the whole panel.
 */
export function scopeTargets<T>(
  scope: CommandScope,
  at: { readonly selection?: readonly T[]; readonly row?: T; readonly card?: T; readonly panel: T },
): T[] {
  if (scope === "selection") return at.selection?.length ? [...at.selection] : [at.panel]
  if (scope === "row") return at.row !== undefined ? [at.row] : [at.panel]
  if (scope === "group") return at.card !== undefined ? [at.card] : [at.panel]
  return [at.panel]
}

/** A level below the panel that the header's crumbs name: a card, a row, an open editor's part. */
export type CrumbLevel = "card" | "row" | "editor"

export interface Crumb {
  readonly level: CrumbLevel
  readonly label: string
}

/**
 * Where keys go, as the header reads after the panel's title: `Shape › Cohesion`. A level that
 * isn't focused (or has no name) is left out; the last crumb is the deepest, the one focused.
 */
export function crumbTrail(path: {
  readonly card?: string
  readonly row?: string
  readonly editor?: string
}): Crumb[] {
  const out: Crumb[] = []
  for (const level of ["card", "row", "editor"] as const) {
    const label = path[level]?.trim()
    if (label) out.push({ level, label })
  }
  return out
}

/**
 * Where Esc goes from the deepest crumb: the crumb before it, else the panel (`title`). Nothing
 * at the panel itself (no crumbs), where Esc leaves.
 */
export function escTarget(trail: readonly Crumb[], title: string): string | undefined {
  if (!trail.length) return undefined
  return trail.at(-2)?.label ?? (title.trim() || "panel")
}

/**
 * How much of a trail fits `room` px: crumbs from `from` on show (the ones before it fold into
 * one "…"), and the Esc hint shows only when it fits too. The deepest crumb always shows.
 * `widths` are the crumbs' own; `sep` a separator's (with its gaps), `more` the "…"'s.
 */
export function fitCrumbs(
  widths: readonly number[],
  room: number,
  sep: number,
  more: number,
  hint = 0,
): { from: number; hint: boolean } {
  const n = widths.length
  if (!n) return { from: 0, hint: false }
  const span = (from: number) => {
    let w = 0
    for (let i = from; i < n; i++) w += widths[i]! + (i > from ? sep : 0)
    return from > 0 ? w + more + sep : w
  }
  let from = 0
  while (from < n - 1 && span(from) > room) from++
  const used = span(from)
  return { from, hint: hint > 0 && used + sep + hint <= room }
}

/**
 * The option a digit picks among `count` (0-based), or undefined when it names none: 1–9 pick
 * the first nine, as they read.
 */
export function digitOption(key: string, count: number): number | undefined {
  if (!/^[1-9]$/.test(key)) return undefined
  const i = Number(key) - 1
  return i < count ? i : undefined
}

/**
 * The digit hints for a row's options: one per option that shows (up to nine), or, while they
 * don't (a menu, a folded editor), one standing for them all ("1–5").
 */
export function digitHints(count: number, showing: boolean): string[] {
  const n = Math.min(9, count)
  if (n <= 0) return []
  if (showing) return Array.from({ length: n }, (_, i) => String(i + 1))
  return [n === 1 ? "1" : `1–${n}`]
}
