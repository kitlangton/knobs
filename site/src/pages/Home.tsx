import { color, defineControls, knob, spring, springCss } from "knobs"
import { Knobs, useControls } from "knobs/react"
import { useState } from "react"
import { C, Code } from "../Code"
import { Demo } from "../demos/Demo"
import { Field, field } from "../demos/Field"
import { Install } from "../Install"
import { Link } from "../router"
import { Section } from "../section"

// The quick start's card, live: the same 20 lines as the snippet beside it.
const card = defineControls(
  "card",
  {
    radius: knob(18, { min: 0, max: 40, step: 1, unit: "px" }),
    tint: color("oklch(0.7 0.15 250)"),
    pop: spring({ duration: 0.4, bounce: 0.3 }),
  },
  { enabled: true, theme: "auto" },
)

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
            transition: `transform ${duration}ms ${easing}, border-radius 200ms, background 200ms`,
          }}
        >
          Press me
        </button>
        <span className="demo-caption">Hover this box for its ⚙ knobs chip</span>
      </div>
    </Knobs>
  )
}

export default function Home() {
  return (
    <>
      <Section
        title="knobs"
        level={1}
        className="hero"
        lede="Embeddable, keyboard-first tuning controls for React, Solid and plain DOM."
      >
        <p>
          Give a component a few knobs. Hover it to reveal a small <C>⚙ knobs</C> chip that opens a
          floating panel, or mount the panel inline. Try values, save the good ones as presets, copy
          them back into your source and ship constants. In production the panels are gone.
        </p>
        <p>
          Everything on this site is tunable. Each section has its own chip, and the{" "}
          <strong>Tune</strong> button at the top (or <kbd>T</kbd>) opens the site-wide tokens. Drag
          on the dots below to move their origin.
        </p>
        <Demo controls={field} className="hero-demo" density="compact">
          <Field />
        </Demo>
      </Section>
      <Section title="Install">
        <Install />
      </Section>
      <Section title="Quick start">
        <p>
          Define controls once at module scope, read them with <C>useControls</C>, and wrap the
          element that should carry the chip in <C>{"<Knobs>"}</C>.
        </p>
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
        <p>
          <C>useControls</C> returns typed values: <C>v.radius</C> is a number and <C>v.pop</C> is{" "}
          <C>{"{ duration, bounce }"}</C>. By default panels show on <C>localhost</C> only, and the
          production build of knobs leaves them out entirely.{" "}
          <Link href="/production">Production builds</Link> explains how.
        </p>
      </Section>
      <Section title="Where to go next">
        <ul className="next-list">
          <li>
            <Link href="/getting-started">Getting started</Link> walks through a first set of
            controls in plain DOM, React and Solid.
          </li>
          <li>
            <Link href="/fields">Fields</Link> covers the seven field types, each with a live
            example.
          </li>
          <li>
            <Link href="/panel">The panel</Link> lists the keyboard, gestures, presets, Random,
            Mutate, locks and compare.
          </li>
          <li>
            <Link href="/theming">Theming and tokens</Link> covers the design tokens, density and
            the WebGPU renderer.
          </li>
          <li>
            <Link href="/examples">Examples</Link> has the original studies, the self-tuning meta
            page and the die.
          </li>
        </ul>
      </Section>
    </>
  )
}
