// Browser fixture for the knobs/ui wrappers: the same outliner-and-viewport split in React
// (StrictMode, children portalled into panes) and in Solid, each with app state reaching into
// a pane and new items flowing into the tree.
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"
import { createSignal } from "solid-js"
import html from "solid-js/html"
import { render } from "solid-js/web"
import { applyMove, type Split as SplitHandle, type TreeMove } from "knobs/ui"
import { Split as ReactSplit, Timeline as ReactTimeline, Tree as ReactTree } from "knobs/ui/react"
import { Split as SolidSplit, Timeline as SolidTimeline, Tree as SolidTree } from "knobs/ui/solid"

interface Item {
  id: string
  label: string
  children?: Item[]
}

const seed = (): Item[] => [
  { id: "lights", label: "Lights", children: [{ id: "sun", label: "Sun" }] },
  { id: "props", label: "Props", children: [] },
]
const panes = [
  { id: "outline", size: 200, min: 140, collapsible: true, title: "Outliner" },
  { id: "view" },
]
const handles: Record<string, SplitHandle> = {}
;(window as unknown as { __splits: typeof handles }).__splits = handles

function ReactApp() {
  const [items, setItems] = useState(seed)
  const [picked, setPicked] = useState("none")
  const [count, setCount] = useState(0)
  const [time, setTime] = useState(0)
  return (
    <ReactSplit
      id="wrap-react"
      storage={null}
      panes={panes}
      onReady={(s) => {
        handles.react = s
      }}
    >
      <ReactTree<Item>
        label="React outliner"
        items={items}
        expanded={["lights"]}
        onSelect={(_, primary) => setPicked(primary ?? "none")}
        onMove={(move: TreeMove) => setItems((now) => applyMove(now, move))}
      />
      <div className="view">
        <output data-picked>{picked}</output>
        <button
          type="button"
          onClick={() => {
            setCount(count + 1)
            setItems((now) =>
              now.map((it) =>
                it.id === "props"
                  ? {
                      ...it,
                      children: [
                        ...(it.children ?? []),
                        { id: `cone-${count}`, label: `Cone ${count}` },
                      ],
                    }
                  : it,
              ),
            )
          }}
        >
          Add cone
        </button>
        <output data-time>{time.toFixed(2)}</output>
        <button type="button" data-jump onClick={() => setTime(2)}>
          Jump
        </button>
        <div style={{ height: 72 }}>
          <ReactTimeline
            duration={4}
            time={time}
            label="React timeline"
            onSeek={(t) => setTime(t)}
          />
        </div>
      </div>
    </ReactSplit>
  )
}

createRoot(document.getElementById("react")!).render(
  <StrictMode>
    <ReactApp />
  </StrictMode>,
)

render(() => {
  const [items, setItems] = createSignal(seed())
  const [picked, setPicked] = createSignal("none")
  const [time, setTime] = createSignal(0)
  let count = 0
  const add = () => {
    const n = count++
    setItems((now) =>
      now.map((it) =>
        it.id === "props"
          ? { ...it, children: [...(it.children ?? []), { id: `cone-${n}`, label: `Cone ${n}` }] }
          : it,
      ),
    )
  }
  return html`<${SolidSplit}
    id="wrap-solid"
    storage=${null}
    panes=${panes}
    onReady=${(s: SplitHandle) => {
      handles.solid = s
    }}
  >
    <${SolidTree}
      label="Solid outliner"
      items=${items}
      expanded=${["lights"]}
      onSelect=${(_: readonly string[], primary: string | null) => setPicked(primary ?? "none")}
      onMove=${(move: TreeMove) => setItems((now) => applyMove(now, move))}
    />
    <div class="view">
      <output data-picked>${picked}</output>
      <button type="button" onClick=${add}>Add cone</button>
      <output data-time>${() => time().toFixed(2)}</output>
      <button type="button" data-jump onClick=${() => setTime(2)}>Jump</button>
      <div style="height:72px">
        <${SolidTimeline}
          duration=${4}
          time=${time}
          label="Solid timeline"
          onSeek=${(t: number) => setTime(t)}
        />
      </div>
    </div>
  <//>`
}, document.getElementById("solid")!)
