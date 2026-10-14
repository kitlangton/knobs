import { createRemoteControls, type ControlDescriptor, type State } from "knobs"
import { problemsPreset } from "knobs/themes"
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react"

// An app that owns its values: three items, each with its own parameters, saved to a pretend
// server that echoes a moment later. The panel shows whichever item is selected.
interface Item {
  readonly id: string
  readonly name: string
  readonly descriptors: ControlDescriptor[]
}
const num = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit?: string,
): ControlDescriptor => ({
  key,
  label,
  kind: "number",
  default: value,
  min,
  max,
  step,
  ...(unit ? { unit } : {}),
})
const items: Item[] = [
  {
    id: "toast",
    name: "Toast",
    descriptors: [
      num("width", "Width", 220, 140, 300, 2, "px"),
      num("radius", "Radius", 14, 0, 28, 1, "px"),
      num("duration", "Duration", 0.4, 0.1, 1, 0.05, "s"),
      num("bounce", "Bounce", 0.2, 0, 0.7, 0.05),
      {
        key: "spring",
        kind: "spring",
        label: "Spring",
        group: "Spring",
        bind: { duration: "duration", bounce: "bounce" },
      },
    ],
  },
  {
    id: "badge",
    name: "Badge",
    descriptors: [
      num("width", "Size", 56, 24, 120, 2, "px"),
      num("radius", "Radius", 28, 0, 60, 1, "px"),
    ],
  },
  {
    id: "sheet",
    name: "Sheet",
    descriptors: [
      num("width", "Width", 260, 160, 320, 2, "px"),
      num("radius", "Corner", 22, 0, 40, 1, "px"),
      num("tilt", "Tilt", 0, -12, 12, 1, "°"),
    ],
  },
]
const defaults = (item: Item): State =>
  Object.fromEntries(
    item.descriptors.flatMap((d) => (d.kind === "spring" ? [] : [[d.key, d.default as number]])),
  )

// The app's state, with optimistic writes and a late echo from the "server".
let saved: Record<string, State> = Object.fromEntries(items.map((i) => [i.id, defaults(i)]))
const listeners = new Set<() => void>()
const emit = () => {
  for (const cb of listeners) cb()
}
let current = 0
function write(key: string, value: number) {
  const id = items[current]!.id
  saved = { ...saved, [id]: { ...saved[id], [key]: value } }
  emit()
  setTimeout(() => remote.update(items[current]!.descriptors, saved[items[current]!.id]), 300)
}

const remote = createRemoteControls("embedded", items[0]!.descriptors, {
  ship: () => import("knobs/panel"),
  nullDefaults: false,
  storage: null,
  values: saved[items[0]!.id],
  keys: { random: false, undo: false, vim: false, bigStep: 5 },
  onSet: (key, value) => write(key, value as number),
  onReset: ({ key }) => {
    const item = items[current]!
    const home = defaults(item)
    for (const k of key ? [key] : Object.keys(home)) write(k, home[k] as number)
  },
})

function useSaved() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => saved,
  )
}

export default function EmbedDemo() {
  const [index, setIndex] = useState(0)
  const all = useSaved()
  const host = useRef<HTMLDivElement>(null)
  const item = items[index]!
  const v = all[item.id]! as Record<string, number>

  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    void import("knobs/panel").then(({ mountPanel }) => {
      if (disposed || !host.current) return
      const panel = mountPanel(remote, host.current, {
        header: false,
        variants: false,
        preset: problemsPreset,
        theme: "auto",
      })
      dispose = () => panel.dispose()
    })
    return () => {
      disposed = true
      dispose()
    }
  }, [])

  const choose = (next: number) => {
    current = next
    setIndex(next)
    // Another item arrived: its rows swap in place and its values land without springing.
    remote.update(items[next]!.descriptors, saved[items[next]!.id], { land: true })
  }

  const shape: CSSProperties = {
    width: v.width,
    height: item.id === "badge" ? v.width : item.id === "toast" ? 56 : 150,
    borderRadius: v.radius,
    transform: `rotate(${v.tilt ?? 0}deg)`,
  }
  return (
    <div className="demo embed-demo">
      <div className="demo-stage embed-stage">
        <div className="embed-items" role="tablist" aria-label="Items">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => choose(i)}
            >
              {it.name}
            </button>
          ))}
        </div>
        <div className="stage-center">
          <div className="embed-shape glide" style={shape} />
        </div>
        <span className="demo-caption">The app owns these values; the panel reports edits</span>
      </div>
      <div className="demo-panel embed-panel" ref={host} />
    </div>
  )
}
