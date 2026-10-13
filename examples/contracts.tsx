import { useEffect, useRef, useState } from "react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { createEffect, createRoot as createSolidRoot } from "solid-js"
import { choice, createRemoteControls, defineControls, knob } from "knobs"
import { Knobs, KnobsPanel, useControls, VariantSwitcher } from "knobs/react"
import { useControls as useSolidControls } from "knobs/solid"

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

const remoteEvents: string[] = []
const remote = createRemoteControls(
  "phone-tune",
  [
    {
      key: "drawer.spring.duration",
      label: "Duration",
      kind: "number",
      swiftType: "Double",
      default: 0.35,
      min: 0.1,
      max: 1,
      step: 0.05,
      unit: "s",
      group: "Spring",
    },
    {
      key: "drawer.spring.bounce",
      label: "Bounce",
      kind: "number",
      swiftType: "Double",
      default: 0.15,
      min: 0,
      max: 0.6,
      step: 0.05,
      group: "Spring",
    },
    {
      key: "composer.chrome",
      label: "Chrome",
      kind: "choice",
      swiftType: "ChromeStyle",
      default: "glass",
      choices: ["glass", "solid"],
      group: "Composer",
    },
  ],
  {
    theme: "light",
    density: "compact",
    values: { "drawer.spring.duration": 0.5 },
    actions: [
      {
        label: "Copy as Swift",
        run: (_values, ctl) => {
          const code = remote.swift()
          remoteEvents.push(`swift:${code}`)
          return code ? "Copied Swift." : "Nothing changed."
        },
      },
    ],
    onSet: (key, value) => remoteEvents.push(`set:${key}=${String(value)}`),
    onReset: (target) => remoteEvents.push(`reset:${target.group ?? target.key ?? "all"}`),
  },
)

function SolidMirror() {
  const host = useRef<HTMLOutputElement>(null)
  useEffect(() => {
    if (!host.current) return
    return createSolidRoot((dispose) => {
      const vals = useSolidControls(remote)
      createEffect(() => {
        if (host.current) {
          host.current.textContent = `${vals()["drawer.spring.duration"]}:${vals()["composer.chrome"]}`
        }
      })
      return dispose
    })
  }, [])
  return <output data-solid-remote ref={host} />
}

function App() {
  const a = useControls(outer),
    b = useControls(inner)
  const [shown, setShown] = useState(true)
  const [showRemote, setShowRemote] = useState(false)
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
      <button type="button" onClick={() => setShowRemote((v) => !v)}>
        Toggle remote panel
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
      {showRemote && (
        <div>
          <SolidMirror />
          <KnobsPanel controls={remote} variants={false} />
        </div>
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
