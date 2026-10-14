import { color, knob, spring, springCss } from "knobs"
import { Knobs, useControls } from "knobs/react"
import { useState } from "react"
import { Code } from "./Code"
import { demoControls } from "./demos/Demo"

// The quick start's card, live: the same component as the snippet above it.
const card = demoControls("card", {
  radius: knob(18, { min: 0, max: 40, step: 1, unit: "px" }),
  tint: color("oklch(0.7 0.15 250)"),
  pop: spring({ duration: 0.4, bounce: 0.3 }),
})

function Card() {
  const v = useControls(card)
  const [pressed, setPressed] = useState(false)
  const { easing, duration } = springCss(v.pop)
  return (
    <Knobs controls={card}>
      <div className="qs-stage">
        <button
          type="button"
          className="qs-card"
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          style={{
            borderRadius: v.radius,
            background: v.tint,
            transform: pressed ? "scale(0.92)" : "none",
            transitionProperty: "transform, border-radius, background-color",
            transitionDuration: `${duration}ms, var(--glide-ms), var(--glide-ms)`,
            transitionTimingFunction: `${easing}, var(--glide-ease), var(--glide-ease)`,
          }}
        >
          Press me
        </button>
        <span className="demo-caption">Hover this box for its ⚙ knobs chip</span>
      </div>
    </Knobs>
  )
}

export function QuickStart() {
  return (
    <>
      <Code lang="tsx" title="Card.tsx">{`
        import { color, defineControls, knob, spring, springCss } from "knobs"
        import { Knobs, useControls } from "knobs/react"

        const card = defineControls("card", {
          radius: knob(18, { min: 0, max: 40, step: 1, unit: "px" }),
          tint: color("oklch(0.7 0.15 250)"),
          pop: spring({ duration: 0.4, bounce: 0.3 }),
        })

        export function Card() {
          const v = useControls(card)
          const { easing, duration } = springCss(v.pop)
          return (
            <Knobs controls={card}>
              <button style={{ borderRadius: v.radius, background: v.tint,
                transition: \`transform \${duration}ms \${easing}\` }}>Press me</button>
            </Knobs>
          )
        }
      `}</Code>
      <Card />
    </>
  )
}
