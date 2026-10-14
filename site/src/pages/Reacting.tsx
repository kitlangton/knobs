import { knob, toggle, type ChangeSource } from "knobs"
import { useControls } from "knobs/react"
import { useSyncExternalStore } from "react"
import { C, Code } from "../Code"
import { Demo, demoControls } from "../demos/Demo"
import { Section } from "../section"

const page = "Reacting to changes"

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

function LogDemo() {
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

const sources: [ChangeSource, string][] = [
  ["local", "A row was edited: a drag, a key, a typed number"],
  ["randomize", "Random rolled"],
  ["mutate", "Mutate nudged"],
  ["reset", "A row, group or everything went back to defaults"],
  ["preset", "A shipped preset was applied"],
  ["variant", "A saved variant was loaded"],
  ["undo", "Undo"],
  ["redo", "Redo"],
  ["remote", "sync() applied state from elsewhere, such as a socket"],
  ["compare", "Holding \\ showed earlier values, or letting go restored them"],
]

export default function Reacting() {
  return (
    <>
      <Section
        page={page}
        title="Reacting to changes"
        level={1}
        lede="onChange tells you what changed and where the change came from, so a page can answer the panel's own commands."
      >
        <Code>{`
          const die = defineControls("die", schema, {
            onChange(patch, values, { source }) {
              if (source === "randomize") rollDice()
            },
          })
        `}</Code>
        <p>
          <C>patch</C> holds only the fields that changed, and <C>values</C> is the full set after
          the change. The die example rolls its dice this way when the panel's Random rolls.
        </p>
      </Section>

      <Section page={page} title="Watch the sources">
        <p>
          The log below prints every change to this panel with its source. Drags report{" "}
          <C>coalesce: true</C> on every step after the first; the log skips those.
        </p>
        <LogDemo />
      </Section>

      <Section page={page} title="Sources">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>source</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(([s, when]) => (
                <tr key={s}>
                  <td>
                    <C>{`"${s}"`}</C>
                  </td>
                  <td>{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          The third argument also carries <C>key</C> or <C>group</C> when a single row or group was
          reset. Every section on this site uses this: when a section's motion knobs change, or
          Random rolls, it replays its entrance animation.
        </p>
      </Section>

      <Section page={page} title="Subscribing">
        <p>
          For rendering, subscribe instead. <C>subscribe</C> fires after every change, including
          undo, presets and compare, and <C>get()</C> returns the current values. Unchanged spring,
          point and easing values keep their identity, so equality checks stay cheap.
        </p>
        <Code>{`
          const stop = watched.subscribe(() => draw(watched.get()))
          watched.set({ speed: 60 })                 // source: "local"
          watched.set({ speed: 61 }, { coalesce: true }) // folds into the last undo entry
        `}</Code>
        <p>
          In React, <C>useControls</C> does this with <C>useSyncExternalStore</C>; in Solid it
          returns an accessor.
        </p>
      </Section>
    </>
  )
}
