// The option picker's logic apart from the DOM: which option a key picks, where the selection
// goes when the options change, and which options a change opens and closes.

/** The option a digit names: 1–9 pick the first nine, as they read; past the last, none. */
export function digitPick(ids: readonly string[], key: string): string | undefined {
  if (!/^[1-9]$/.test(key)) return undefined
  return ids[Number(key) - 1]
}

/** ↑/↓ (and Home/End) from `current`, stopping at the ends. */
export function stepPick(
  ids: readonly string[],
  current: string | null,
  key: "ArrowUp" | "ArrowDown" | "Home" | "End",
): string | undefined {
  if (!ids.length) return undefined
  if (key === "Home") return ids[0]
  if (key === "End") return ids[ids.length - 1]
  const i = current === null ? -1 : ids.indexOf(current)
  if (i < 0) return key === "ArrowDown" ? ids[0] : ids[ids.length - 1]
  return ids[Math.max(0, Math.min(ids.length - 1, i + (key === "ArrowDown" ? 1 : -1)))]
}

/**
 * The selection after the options change: the option a host asked for before it was there
 * (`wanted`) once it comes, else the selection while its option stays, else the first.
 */
export function keepPick(
  ids: readonly string[],
  selected: string | null,
  wanted: string | null = null,
): string | null {
  if (wanted !== null && ids.includes(wanted)) return wanted
  if (selected !== null && ids.includes(selected)) return selected
  return ids[0] ?? null
}

/**
 * A host's `select(id)`: picked now if its option is there; if not, remembered (`wanted`) for
 * the `set()` that brings it, so the order a host's updates land in can't lose it. A later
 * select replaces what was wanted.
 */
export function askPick(
  ids: readonly string[],
  id: string,
): { pick: string | undefined; wanted: string | null } {
  return ids.includes(id) ? { pick: id, wanted: null } : { pick: undefined, wanted: id }
}

/** What's still wanted after the options change: nothing once its option has come. */
export const stillWanted = (ids: readonly string[], wanted: string | null): string | null =>
  wanted !== null && ids.includes(wanted) ? null : wanted

/** The number an option shows: its place, 1, 2, … 12 (only 1–9 are keys that pick). */
export const pickDigit = (index: number): string => String(index + 1)

/**
 * Whether a key event goes to the picker's digits: a bare 1–9 that nothing focused claimed (a
 * panel row picking its own options, a text field) and that isn't typed into a field.
 */
export function claimsDigit(
  event: {
    readonly key: string
    readonly defaultPrevented: boolean
    readonly metaKey: boolean
    readonly ctrlKey: boolean
    readonly altKey: boolean
    readonly shiftKey: boolean
    readonly repeat: boolean
    readonly typing?: boolean
  },
  typing = false,
): boolean {
  return (
    /^[1-9]$/.test(event.key) &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !event.typing &&
    !typing
  )
}

/**
 * Where the card comes to rest on the option at `index`: below the options before it with their
 * bodies shut (once a change settles only the selected option's is open), as tall as its head
 * and its body. The card aims here from the start, rather than chasing the option's top while
 * the last option's body closes above it. With the body not yet measured (a panel mounting for
 * the first time) there's no target yet, and the card holds where it is.
 */
export function cardTarget(
  heads: readonly number[],
  index: number,
  body: number | undefined,
  gap = 0,
  top = 0,
): { y: number; h: number } | null {
  if (body === undefined) return null
  let y = top
  for (let i = 0; i < index; i++) y += heads[i]! + gap
  return { y, h: (heads[index] ?? 0) + body }
}

/**
 * A first-mounted body's height once it has settled: the same reading two frames running, or
 * whatever it reads after `limit` frames (content that never settles doesn't hold the change
 * up). Until then undefined: it's still laying out.
 */
export function settleHeight(
  previous: number | undefined,
  now: number,
  frames: number,
  limit = 6,
): number | undefined {
  if (previous !== undefined && Math.abs(now - previous) < 0.5) return now
  return frames >= limit ? now : undefined
}
