import { knob, toggle, type ChangeSource } from "knobs"
import { useControls } from "knobs/react"
import { useSyncExternalStore } from "react"

import { Demo, demoControls } from "../demos/Demo"

interface Entry {
  readonly n: number
  readonly source: ChangeSource
  readonly keys: string
}
let log: readonly Entry[] = []
let count = 0
const listeners = new Set<() => void>()
const push = (entry: Omit<Entry, "n">) => {
  log = [{ ...entry, n: ++count }, ...log].slice(0, 7)
  for (const cb of listeners) cb()
}

const watched = demoControls(
  "watched",
  {
    speed: knob(40, { min: 0, max: 100, step: 1, unit: "%" }),
    spread: knob(12, { min: 0, max: 40, step: 1, unit: "px" }),
    loop: toggle(true),
  },
  {
    presets: { fast: { speed: 90, spread: 30 }, calm: { speed: 15, spread: 4, loop: false } },
    onChange(patch, _values, meta) {
      if (meta.coalesce) return
      push({ source: meta.source, keys: Object.keys(patch).join(", ") || "nothing" })
    },
  },
)

function useLog() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => log,
  )
}

export default function LogDemo() {
  useControls(watched)
  const entries = useLog()
  return (
    <Demo controls={watched} variants>
      <ol className="event-log" aria-live="polite">
        {entries.length === 0 && (
          <li className="event-empty">
            Change something in the panel: drag, Random, a preset, undo, or hold \.
          </li>
        )}
        {entries.map((e) => (
          <li key={e.n}>
            <span className="event-source" data-source={e.source}>
              {e.source}
            </span>
            <span className="event-keys">{e.keys}</span>
          </li>
        ))}
      </ol>
    </Demo>
  )
}
