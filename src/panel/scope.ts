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
 * How much of a trail fits `room` px: crumbs from `from` on show, the ones before it dropped, and
 * the Esc hint shows only when it fits too. Without room for the deepest crumb, none show
 * (`from` is the trail's length): the line never runs past the title's room into the buttons.
 * `widths` are the crumbs' own; `sep` a separator's (with its gaps).
 */
export function fitCrumbs(
  widths: readonly number[],
  room: number,
  sep: number,
  hint = 0,
): { from: number; hint: boolean } {
  const n = widths.length
  let from = n
  let used = 0
  // Deepest first, each parent while it fits before the ones after it.
  for (let i = n - 1; i >= 0; i--) {
    const w = used + widths[i]! + (i < n - 1 ? sep : 0)
    if (w > room) break
    used = w
    from = i
  }
  return { from, hint: from < n && hint > 0 && used + sep + hint <= room }
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
 * Where a digit goes in a panel: a focused row's options take 1–9 (even past the last), a number
 * row and a page card's numbered presets keep theirs, and anywhere else 1–9 pick the preset
 * strip's chips (the design's variants) while the strip has that many. Undefined leaves the key.
 */
export function digitRoute(
  key: string,
  at: { options: boolean; keeps: boolean; presets: number },
): "options" | "presets" | undefined {
  if (!/^[1-9]$/.test(key)) return undefined
  if (at.options) return "options"
  if (at.keeps) return undefined
  return digitOption(key, at.presets) === undefined ? undefined : "presets"
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
