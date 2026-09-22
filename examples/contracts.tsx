import { useRef, useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { choice, defineControls, knob } from "knobs"
import { Knobs, useControls, VariantSwitcher } from "knobs/react"

// Browser contract fixture: server snapshots, nested ownership, and attachment cleanup.
const outer = defineControls(
  "outer",
  { flavor: choice("a", ["a", "b", "c"]), size: knob(2, { min: 1, max: 9, step: 1 }) },
  { storage: null },
)
const inner = defineControls("inner", { flavor: choice("a", ["a", "b", "c"]) }, { storage: null })
outer.set({ size: 5 })
outer.variants.save("Five")
outer.set({ size: 7 })
outer.variants.save("Seven")
outer.reset()

function App() {
  const a = useControls(outer),
    b = useControls(inner)
  const [shown, setShown] = useState(true)
  const [refAttached, setRefAttached] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  return (
    <>
      <button type="button" onClick={() => setShown((v) => !v)}>
        Toggle attachment
      </button>
      <button type="button" onClick={() => setRefAttached(!!ref.current)}>
        Check child ref
      </button>
      <output data-ref>{String(refAttached)}</output>
      <output data-outer>
        {a.flavor}:{a.size}
      </output>
      <output data-inner>{b.flavor}</output>
      {shown && (
        <Knobs controls={outer}>
          <div ref={ref} style={{ padding: 32, margin: 20, border: "1px solid" }}>
            <VariantSwitcher controls={outer} field="flavor" label="Outer">
              <p data-outer-preview>Outer preview</p>
              <VariantSwitcher controls={inner} field="flavor" label="Inner">
                <p data-inner-preview>Inner preview</p>
                <input aria-label="Keep typing" />
              </VariantSwitcher>
            </VariantSwitcher>
          </div>
        </Knobs>
      )}
      <VariantSwitcher controls={outer} label="Saved">
        <p>Saved variations</p>
      </VariantSwitcher>
    </>
  )
}
const root = document.getElementById("root")!
root.innerHTML = renderToString(<App />)
hydrateRoot(root, <App />)
