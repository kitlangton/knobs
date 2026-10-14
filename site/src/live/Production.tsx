import { color, defineControls, knob, type Controls, type Schema } from "knobs"
import { KnobsPanel, useControls } from "knobs/react"
import { useState } from "react"
import { C } from "../Code"
import { registerStore } from "../site"

// `enabled` is a function, so the page can show what the same store does once it's switched off.
let production = false
const badge = defineControls(
  "badge",
  {
    radius: knob(10, { min: 0, max: 24, step: 1, unit: "px" }),
    tint: color("oklch(0.72 0.16 150)"),
  },
  { enabled: () => !production, theme: "auto" },
)
registerStore(badge as unknown as Controls<Schema>)

export default function ProductionDemo() {
  const [prod, setProd] = useState(false)
  production = prod
  const v = useControls(badge)
  return (
    <div className="demo">
      <div className="demo-stage">
        <div className="stage-center">
          <span className="prod-badge glide" style={{ borderRadius: v.radius, background: v.tint }}>
            radius {v.radius} · {prod ? "locked" : "live"}
          </span>
        </div>
        <button
          type="button"
          className="prod-switch"
          role="switch"
          aria-checked={prod}
          onClick={() => setProd((p) => !p)}
        >
          <span />
          Production
        </button>
        <span className="demo-caption">
          {prod ? "get() returns locked; no panel" : "Change the values, then switch"}
        </span>
      </div>
      <div className="demo-panel" key={String(prod)}>
        {prod ? (
          <p className="prod-empty">
            <C>{"<KnobsPanel>"}</C> renders nothing when the controls are disabled.
          </p>
        ) : (
          <KnobsPanel controls={badge} theme="auto" variants={false} />
        )}
      </div>
    </div>
  )
}
