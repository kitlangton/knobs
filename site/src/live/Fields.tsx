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
import { useEffect, useState, type CSSProperties } from "react"
import { Demo, demoControls } from "../demos/Demo"
import { reducedMotion } from "../site"

/** Flips between two states on an interval, for examples that move on their own. */
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
export function KnobDemo() {
  const v = useControls(knobs)
  return (
    <Demo controls={knobs} caption={`${v.size}px · radius ${v.radius}px`}>
      <div className="stage-center">
        <div
          className="fx-square glide"
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
// Spacers on either side grow and shrink, so a change of alignment glides instead of jumping.
const grow = { start: [0, 1], center: [1, 1], end: [1, 0] } as const
export function ChoiceDemo() {
  const v = useControls(choices)
  const [before, after] = grow[v.align]
  return (
    <Demo controls={choices} caption={`align: "${v.align}"`}>
      <div className="fx-row">
        <span className="fx-spacer glide" style={{ flexGrow: before }} />
        {[0, 1, 2].map((i) => (
          <span key={i} className="fx-chip glide" data-shape={v.shape} />
        ))}
        <span className="fx-spacer glide" style={{ flexGrow: after }} />
      </div>
    </Demo>
  )
}

const toggles = demoControls("toggle-example", {
  grid: toggle(true),
  labels: toggle(false),
})
export function ToggleDemo() {
  const v = useControls(toggles)
  return (
    <Demo controls={toggles} caption={`grid: ${v.grid}`}>
      <div className="fx-board" data-grid={v.grid} data-labels={v.labels}>
        {[
          [1, 1],
          [3, 2],
          [5, 1],
          [2, 3],
        ].map(([x, y]) => (
          <span key={`${x}-${y}`} style={{ gridColumn: x, gridRow: y }}>
            <em className="glide">
              {x},{y}
            </em>
          </span>
        ))}
      </div>
    </Demo>
  )
}

const springs = demoControls("spring-example", {
  travel: spring({ duration: 0.55, bounce: 0.3 }),
})
export function SpringDemo() {
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
export function ColorDemo() {
  const v = useControls(colors)
  return (
    <Demo controls={colors} caption={`${v.tint} · ${colorHex(v.tint)}`}>
      <div className="fx-swatches" style={{ "--tint": v.tint } as CSSProperties}>
        {[0, 0.35, 0.5, 0.65, 0.8, 0.92].map((l) => (
          <span
            key={l}
            className="glide"
            style={{ background: l ? `oklch(from var(--tint) ${l} c h)` : "var(--tint)" }}
          />
        ))}
      </div>
    </Demo>
  )
}

const points = demoControls("point-example", {
  light: point({ x: -0.4, y: -0.6 }, { min: -1, max: 1, step: 0.01 }),
})
export function PointDemo() {
  const v = useControls(points)
  const { x, y } = v.light
  return (
    <Demo controls={points} caption={`light: { x: ${x}, y: ${y} }`}>
      <div className="stage-center">
        <div
          className="fx-card glide"
          style={
            {
              "--lx": `${50 + x * 50}%`,
              "--ly": `${50 + y * 50}%`,
              boxShadow: `${-x * 22}px ${-y * 22}px 36px -8px rgb(0 0 0 / 0.35)`,
            } as CSSProperties
          }
        />
      </div>
    </Demo>
  )
}

const easings = demoControls("easing-example", {
  curve: easing("snappy"),
  duration: knob(900, { min: 200, max: 2000, step: 50, unit: "ms" }),
})
export function EasingDemo() {
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
