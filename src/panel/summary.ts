import type { Controls } from "../core/store.js"

/** A row of a folded panel card, as its summary reads it. */
export interface SummaryRow {
  /** Its value as text ("CSS orb", "12 px"), or "" where it has no short form. */
  readonly value: string
  /** Whether it differs from its default. */
  readonly changed: boolean
  /** Whether it's a choice (the likeliest to say what the card is set to). */
  readonly choice: boolean
}

/**
 * A folded panel card's summary, by default: a one-row card's value; otherwise the most telling
 * value (its matching group preset, else its first changed value, else its first choice) and
 * "N changed", each only where it applies. `preset` is null for a card without group presets.
 */
export function panelFoldSummary(rows: readonly SummaryRow[], preset: string | null): string {
  if (rows.length === 1 && rows[0]!.value) return rows[0]!.value
  const lead =
    preset ??
    rows.find((r) => r.changed && r.value)?.value ??
    rows.find((r) => r.choice && r.value)?.value
  const changed = rows.filter((r) => r.changed).length
  return [lead, changed ? `${changed} changed` : ""].filter(Boolean).join(" · ")
}

/**
 * Which presets the values are measured against (the panel's, each scope's and each group's).
 * It changes when one is chosen or saved even if no value moves, which still changes what counts
 * as changed: marks, resets and folded summaries follow it.
 */
export const baseSignature = (
  controls: Pick<Controls<any>, "activePreset" | "activeGroupPreset" | "scopes" | "groupPresets">,
) =>
  JSON.stringify([
    controls.activePreset(),
    Object.keys(controls.scopes).map((s) => controls.activePreset(s)),
    Object.keys(controls.groupPresets).map((g) => controls.activeGroupPreset(g)),
  ])
