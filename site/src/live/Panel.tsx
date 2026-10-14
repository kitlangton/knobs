import { choice, color, knob, parseColor, spring, springCss, toggle } from "knobs"
import { useControls } from "knobs/react"
import { useState } from "react"
import { Demo, demoControls } from "../demos/Demo"

const keys: [string, string][] = [
  ["↑ ↓", "Move between rows"],
  ["← →", "Adjust (⇧ for ×10)"],
  ["0–9", "Type a value"],
  ["s", "Jump to any row by its badge"],
  ["[ ]", "Previous or next preset"],
  ["⌫", "Reset the row"],
  ["r  ⌥R", "Random or Mutate"],
  ["⇧L", "Lock the row from Random"],
  ["hold \\", "Compare with before"],
  ["u  ⇧u", "Undo or redo"],
  ["⇧C", "Copy the values as code"],
  ["⌥ drag", "Fine adjust"],
  ["pan", "Two fingers move a slider or pill"],
  ["⇧ click", "Select rows"],
]

export function KeysDemo() {
  return (
    <div className="table-wrap keys">
      <table>
        <tbody>
          {keys.map(([k, action]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const button = demoControls(
  "button",
  {
    radius: knob(12, { min: 0, max: 28, step: 1, unit: "px", label: "Radius", group: "Shape" }),
    padding: knob(18, { min: 8, max: 40, step: 1, unit: "px", label: "Padding", group: "Shape" }),
    weight: choice("semibold", ["regular", "semibold", "bold"], {
      label: "Weight",
      group: "Shape",
    }),
    fill: color("oklch(0.62 0.19 256)", { label: "Fill", group: "Colour" }),
    depth: knob(0.4, { min: 0, max: 1, step: 0.05, label: "Depth", group: "Colour" }),
    press: spring({ duration: 0.3, bounce: 0.35 }, { label: "Press", group: "Motion" }),
    squash: knob(0.92, { min: 0.8, max: 1, step: 0.01, label: "Squash", group: "Motion" }),
  },
  {
    presets: {
      pill: { radius: 28, padding: 26, weight: "bold" },
      flat: { depth: 0, radius: 6, press: { duration: 0.2, bounce: 0 } },
      jelly: { press: { duration: 0.45, bounce: 0.7 }, squash: 0.84 },
    },
  },
)
const weights = { regular: 450, semibold: 600, bold: 750 }

export function PresetsDemo() {
  const v = useControls(button)
  const [down, setDown] = useState(false)
  const { easing, duration } = springCss(v.press)
  return (
    <Demo controls={button} variants caption="Press it, then try another preset">
      <div className="stage-center">
        <button
          type="button"
          className="tour-button glide"
          onPointerDown={() => setDown(true)}
          onPointerUp={() => setDown(false)}
          onPointerLeave={() => setDown(false)}
          style={{
            borderRadius: v.radius,
            padding: `12px ${v.padding}px`,
            fontWeight: weights[v.weight],
            background: v.fill,
            boxShadow: `0 ${2 + v.depth * 14}px ${v.depth * 32}px -${v.depth * 10}px oklch(from ${v.fill} 0.35 c h / ${0.2 + v.depth * 0.5}), inset 0 1px 0 rgb(255 255 255 / ${v.depth * 0.35})`,
            transform: down ? `scale(${v.squash})` : "none",
            // The press runs on its own spring; everything else glides on the site's.
            transitionProperty: "transform, border-radius, padding, background-color, box-shadow",
            transitionDuration: `${duration}ms, var(--glide-ms), var(--glide-ms), var(--glide-ms), var(--glide-ms)`,
            transitionTimingFunction: `${easing}, var(--glide-ease), var(--glide-ease), var(--glide-ease), var(--glide-ease)`,
          }}
        >
          Continue
        </button>
      </div>
    </Demo>
  )
}

const harmonies = {
  near: [0, 1, 2, 3, 4, 5, 6],
  opposite: [0, 1, 0, 1, 0, 1, 0],
  triad: [0, 1, 2, 0, 1, 2, 0],
}
const palette = demoControls("palette", {
  base: color("oklch(0.66 0.16 250)", { label: "Base", group: "Hue" }),
  harmony: choice("near", ["near", "opposite", "triad"], { label: "Hues", group: "Hue" }),
  spread: knob(28, { min: 4, max: 60, step: 1, unit: "°", label: "Spread", group: "Hue" }),
  steps: knob(5, { min: 3, max: 7, step: 1, label: "Swatches", group: "Shape" }),
  ramp: knob(0.3, { min: 0, max: 0.6, step: 0.02, label: "Lightness ramp", group: "Shape" }),
  round: toggle(true, { label: "Round", group: "Shape" }),
})

export function RandomDemo() {
  const v = useControls(palette)
  const { l, c, h } = parseColor(v.base) ?? { l: 0.66, c: 0.16, h: 250 }
  const turn = { near: v.spread, opposite: 180, triad: 120 }[v.harmony]
  return (
    <Demo controls={palette} caption="r · ⌥R · ⇧L · hold \">
      <div className="palette" data-round={v.round}>
        {Array.from({ length: v.steps }, (_, i) => {
          const t = v.steps > 1 ? i / (v.steps - 1) - 0.5 : 0
          const hue =
            (h + harmonies[v.harmony][i]! * turn + (v.harmony === "near" ? 0 : t * v.spread)) % 360
          const light = Math.min(0.95, Math.max(0.2, l - t * v.ramp))
          return (
            <span
              key={i}
              className="glide"
              style={{ background: `oklch(${light.toFixed(3)} ${c} ${hue.toFixed(1)})` }}
            />
          )
        })}
      </div>
    </Demo>
  )
}
