export interface HintCandidate {
  readonly key: string
  readonly display: string
}

export interface HintBadgeState {
  readonly match: boolean
  readonly prefix: string
  readonly typed: string
  readonly rest: string
}

export interface HintResolution {
  readonly badges: readonly HintBadgeState[]
  readonly matchIndices: readonly number[]
  readonly uniqueMatchIndex: number
}

/**
 * Computes the minimal unique prefix for every row in hint mode (`s`).
 * Prefers the visible `display` label when it matches `query`, falling back to `key`
 * (or when two rows share the exact same display label).
 */
export function computeHintPrefixes(
  items: readonly HintCandidate[],
  rawQuery = "",
): HintResolution {
  const q = rawQuery.toLowerCase()
  const displayCounts = new Map<string, number>()
  for (const item of items) {
    const d = item.display.toLowerCase()
    displayCounts.set(d, (displayCounts.get(d) ?? 0) + 1)
  }

  const matched: { index: number; source: string; norm: string }[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    const d = item.display.toLowerCase()
    const k = item.key.toLowerCase()
    const duplicateDisplay = (displayCounts.get(d) ?? 0) > 1 && d !== k
    if (!duplicateDisplay && d.startsWith(q)) {
      matched.push({ index: i, source: item.display, norm: d })
    } else if (k.startsWith(q)) {
      matched.push({ index: i, source: item.key, norm: k })
    } else if (d.startsWith(q)) {
      matched.push({ index: i, source: item.display, norm: d })
    }
  }

  const byIndex = new Map<number, HintBadgeState>()
  for (const m of matched) {
    const maxLen = Math.max(1, m.norm.length)
    const minLen = Math.min(maxLen, Math.max(1, q.length))
    let chosenLen = maxLen
    for (let len = minLen; len <= maxLen; len++) {
      const sub = m.norm.slice(0, len)
      const collision = matched.some((other) => other.index !== m.index && other.norm.slice(0, len) === sub)
      if (!collision) {
        chosenLen = len
        break
      }
    }
    const prefix = m.source.slice(0, chosenLen)
    const typedLen = Math.min(prefix.length, q.length)
    byIndex.set(m.index, {
      match: true,
      prefix,
      typed: prefix.slice(0, typedLen),
      rest: prefix.slice(typedLen),
    })
  }

  const badges: HintBadgeState[] = items.map(
    (_, i) => byIndex.get(i) ?? { match: false, prefix: "", typed: "", rest: "" },
  )
  const matchIndices = matched.map((m) => m.index)
  const uniqueMatchIndex = matchIndices.length === 1 && q.length > 0 ? matchIndices[0]! : -1

  return {
    badges,
    matchIndices,
    uniqueMatchIndex,
  }
}
