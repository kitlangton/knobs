import {
  bezierCss,
  choice,
  color,
  colorHex,
  easing,
  knob,
  point,
  spring,
  springCss,
  toggle,
} from "knobs"
import { useControls } from "knobs/react"
import { useEffect, useState } from "react"
import { C, Code } from "../Code"
import { Demo, demoControls } from "../demos/Demo"
import { reducedMotion } from "../site"
import { Section } from "../section"

const page = "Fields"

/** Flips between two states on an interval, for demos that move on their own. */
function useShuttle(ms: number) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), ms)
    return () => clearInterval(id)
  }, [ms])
  return on
}

const knobs = demoControls("knob-example", {
  size: knob(120, { min: 60, max: 180, step: 2, unit: "px" }),
  radius: knob(28, { min: 0, max: 90, step: 1, unit: "px" }),
  turn: knob(0, { min: -45, max: 45, step: 1, unit: "°" }),
})
function KnobDemo() {
  const v = useControls(knobs)
  return (
    <Demo controls={knobs} caption={`${v.size}px · radius ${v.radius}px`}>
      <div className="stage-center">
        <div
          className="fx-square"
          style={{
            width: v.size,
            height: v.size,
            borderRadius: Math.min(v.radius, v.size / 2),
            transform: `rotate(${v.turn}deg)`,
          }}
        />
      </div>
    </Demo>
  )
}

const choices = demoControls("choice-example", {
  align: choice("center", ["start", "center", "end"]),
  shape: choice("circle", ["circle", "pill", "square"]),
})
function ChoiceDemo() {
  const v = useControls(choices)
  return (
    <Demo controls={choices} caption={`align: "${v.align}"`}>
      <div className="fx-row" style={{ justifyContent: v.align }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="fx-chip" data-shape={v.shape} />
        ))}
      </div>
    </Demo>
  )
}

const toggles = demoControls("toggle-example", {
  grid: toggle(true),
  labels: toggle(false),
})
function ToggleDemo() {
  const v = useControls(toggles)
  return (
    <Demo controls={toggles} caption={`grid: ${v.grid}`}>
      <div className="fx-board" data-grid={v.grid}>
        {[
          [1, 1],
          [3, 2],
          [5, 1],
          [2, 3],
        ].map(([x, y]) => (
          <span key={`${x}-${y}`} style={{ gridColumn: x, gridRow: y }}>
            {v.labels && `${x},${y}`}
          </span>
        ))}
      </div>
    </Demo>
  )
}

const springs = demoControls("spring-example", {
  travel: spring({ duration: 0.55, bounce: 0.3 }),
})
function SpringDemo() {
  const v = useControls(springs)
  const away = useShuttle(1500)
  const { easing, duration } = springCss(v.travel)
  return (
    <Demo controls={springs} caption={`springCss → ${duration}ms linear(…)`}>
      <div className="fx-track">
        <span
          className="fx-ball"
          style={{
            left: away ? "calc(100% - 44px)" : "0px",
            transition: reducedMotion() ? "none" : `left ${duration}ms ${easing}`,
          }}
        />
      </div>
    </Demo>
  )
}

const colors = demoControls("color-example", {
  tint: color("oklch(0.7 0.16 40)"),
})
function ColorDemo() {
  const v = useControls(colors)
  return (
    <Demo controls={colors} caption={`${v.tint} · ${colorHex(v.tint)}`}>
      <div className="fx-swatches" style={{ ["--tint" as string]: v.tint }}>
        {[0.35, 0.5, 0.65, 0.8, 0.92].map((l) => (
          <span key={l} style={{ background: `oklch(from var(--tint) ${l} c h)` }} />
        ))}
      </div>
    </Demo>
  )
}

const points = demoControls("point-example", {
  light: point({ x: -0.4, y: -0.6 }, { min: -1, max: 1, step: 0.01 }),
})
function PointDemo() {
  const v = useControls(points)
  const { x, y } = v.light
  return (
    <Demo controls={points} caption={`light: { x: ${x}, y: ${y} }`}>
      <div className="stage-center">
        <div
          className="fx-card"
          style={{
            boxShadow: `${-x * 22}px ${-y * 22}px 36px -8px rgb(0 0 0 / 0.35)`,
            backgroundImage: `radial-gradient(circle at ${50 + x * 50}% ${50 + y * 50}%, rgb(255 255 255 / 0.55), transparent 60%)`,
          }}
        />
      </div>
    </Demo>
  )
}

const easings = demoControls("easing-example", {
  curve: easing("snappy"),
  duration: knob(900, { min: 200, max: 2000, step: 50, unit: "ms" }),
})
function EasingDemo() {
  const v = useControls(easings)
  const full = useShuttle(v.duration + 700)
  return (
    <Demo controls={easings} caption={bezierCss(v.curve)}>
      <div className="fx-progress">
        <span
          style={{
            transform: `scaleX(${full ? 1 : 0.04})`,
            transition: reducedMotion()
              ? "none"
              : `transform ${v.duration}ms ${bezierCss(v.curve)}`,
          }}
        />
      </div>
    </Demo>
  )
}

export default function Fields() {
  return (
    <>
      <Section
        page={page}
        title="Fields"
        level={1}
        lede="A schema is an object of fields. Each field sets a default, a range or options, and the row the panel draws for it."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Value</th>
                <th>Row</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <C>knob</C>
                </td>
                <td>number</td>
                <td>Slider with a rolling readout and an inline number editor</td>
              </tr>
              <tr>
                <td>
                  <C>choice</C>
                </td>
                <td>string literal union</td>
                <td>Segmented control</td>
              </tr>
              <tr>
                <td>
                  <C>toggle</C>
                </td>
                <td>boolean</td>
                <td>Switch</td>
              </tr>
              <tr>
                <td>
                  <C>spring</C>
                </td>
                <td>
                  <C>{"{ duration, bounce }"}</C>
                </td>
                <td>Two sliders beside the live step response</td>
              </tr>
              <tr>
                <td>
                  <C>color</C>
                </td>
                <td>
                  <C>"oklch(L C H)"</C>
                </td>
                <td>Swatch and hex, with hue, chroma and lightness strips</td>
              </tr>
              <tr>
                <td>
                  <C>point</C>
                </td>
                <td>
                  <C>{"{ x, y }"}</C>
                </td>
                <td>2D pad</td>
              </tr>
              <tr>
                <td>
                  <C>easing</C>
                </td>
                <td>
                  <C>[x1, y1, x2, y2]</C>
                </td>
                <td>Mini curve, a handle editor and named curves</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Every field also takes <C>label</C>, <C>group</C> and <C>shortcut</C>. Fields that share a{" "}
          <C>group</C> share one card in the panel, with its own reset and Random buttons.
        </p>
      </Section>

      <Section page={page} title="knob">
        <p>
          A number between <C>min</C> and <C>max</C>, moving in <C>step</C>s, with an optional{" "}
          <C>unit</C> for the readout. Dragging past either end rubber-bands. A faint notch marks
          the default and pulls drags onto it, and <kbd>⌥</kbd>-drag moves at a tenth of the speed.
          Scrolling sideways over a slider nudges it one step at a time.
        </p>
        <Code>{`
          size: knob(120, { min: 60, max: 180, step: 2, unit: "px" }),
          radius: knob(28, { min: 0, max: 90, step: 1, unit: "px" }),
          turn: knob(0, { min: -45, max: 45, step: 1, unit: "°" }),
        `}</Code>
        <KnobDemo />
        <p>
          Focus a slider and type a number to edit it inline; <kbd>Enter</kbd> commits and{" "}
          <kbd>Esc</kbd> cancels. <kbd>Home</kbd> and <kbd>End</kbd> jump to the ends.
        </p>
      </Section>

      <Section page={page} title="choice">
        <p>
          One of a nonempty list of strings. The value's type is the union of the options, so{" "}
          <C>v.align</C> below is <C>{'"start" | "center" | "end"'}</C>.
        </p>
        <Code>{`
          align: choice("center", ["start", "center", "end"]),
          shape: choice("circle", ["circle", "pill", "square"]),
        `}</Code>
        <ChoiceDemo />
        <p>
          A sideways swipe over a choice moves one option per gesture. To switch options from the
          component itself, wrap it in a <C>VariantSwitcher</C>: hover it and press <kbd>1</kbd>–
          <kbd>9</kbd> or the arrow keys.
        </p>
      </Section>

      <Section page={page} title="toggle">
        <p>A boolean switch. Changed switches show a small dot, like changed choices.</p>
        <Code>{`
          grid: toggle(true),
          labels: toggle(false),
        `}</Code>
        <ToggleDemo />
      </Section>

      <Section page={page} title="spring">
        <p>
          A SwiftUI-style spring: <C>{"{ duration, bounce }"}</C>, the same two numbers as{" "}
          <C>.spring(duration:bounce:)</C>. Duration runs from 0.05 to 2 seconds and bounce from
          −0.5 to 1. The row draws the step response with the panel's own spring integrator, and a
          dot runs the curve after each change.
        </p>
        <Code>{`
          const motion = defineControls("motion", {
            travel: spring({ duration: 0.55, bounce: 0.3 }),
          })

          const { easing, duration } = springCss(motion.get().travel)
          el.style.transition = \`left \${duration}ms \${easing}\`
        `}</Code>
        <SpringDemo />
        <p>
          <C>springCss</C> turns the spring into a CSS <C>linear()</C> easing and a duration, so
          plain CSS transitions move the same way. <C>springMotion</C> gives the angular frequency ω
          and damping ratio ζ if you run your own integrator, as the dots on the home page do.
        </p>
      </Section>

      <Section page={page} title="color">
        <p>
          A colour stored as an <C>oklch(L C H)</C> string, which works in CSS as it is. It accepts
          hex, <C>oklch()</C> or <C>{"{ l, c, h }"}</C>. Colours always fit inside sRGB: chroma is
          trimmed until they do, keeping lightness and hue. While you scrub hue or lightness the
          editor remembers the chroma you asked for, so passing through a narrow part of the gamut
          doesn't wear it down.
        </p>
        <Code>{`
          tint: color("oklch(0.7 0.16 40)"),
        `}</Code>
        <ColorDemo />
        <p>
          <C>colorHex</C> and <C>parseColor</C> convert. The swatches above derive lighter and
          darker steps from the value with CSS relative colour syntax.
        </p>
      </Section>

      <Section page={page} title="point">
        <p>
          A 2D value, <C>{"{ x, y }"}</C>, edited on a pad. Bounds and step take a number or{" "}
          <C>{"{ x, y }"}</C>. y grows downward, as in CSS and UIKit. A drag on the pad is one undo
          step.
        </p>
        <Code>{`
          light: point({ x: -0.4, y: -0.6 }, { min: -1, max: 1, step: 0.01 }),
        `}</Code>
        <PointDemo />
      </Section>

      <Section page={page} title="easing">
        <p>
          A cubic bezier, <C>[x1, y1, x2, y2]</C>, or one of the named curves: <C>ease</C>,{" "}
          <C>ease-in</C>, <C>ease-out</C>, <C>ease-in-out</C>, <C>linear</C>, <C>smooth</C>,{" "}
          <C>snappy</C> and <C>back</C>. x stays within 0 to 1 and y within −0.6 to 1.6.{" "}
          <C>bezierCss</C> writes the CSS.
        </p>
        <Code>{`
          curve: easing("snappy"),
          duration: knob(900, { min: 200, max: 2000, step: 50, unit: "ms" }),
        `}</Code>
        <EasingDemo />
        <p>
          Springs, points and easings compare by their numbers everywhere: modified dots, presets,
          undo and variants. An unchanged one keeps its identity across updates, so memoized React
          children skip it.
        </p>
      </Section>
    </>
  )
}
