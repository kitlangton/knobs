import { choice, color, knob, spring, springCss, toggle } from "knobs"
import { useControls } from "knobs/react"
import { useState } from "react"
import { C, Code } from "../Code"
import { Demo, demoControls } from "../demos/Demo"
import { Section, sectionControls } from "../section"

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

function ButtonDemo() {
  const v = useControls(button)
  const [down, setDown] = useState(false)
  const { easing, duration } = springCss(v.press)
  return (
    <Demo controls={button} variants caption="Press the button; tune it on the right">
      <div className="stage-center">
        <button
          type="button"
          className="tour-button"
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
            transition: `transform ${duration}ms ${easing}`,
          }}
        >
          Continue
        </button>
      </div>
    </Demo>
  )
}

// The keyboard section's own illustration knobs: how its keycaps and table rows are drawn.
const keycaps = {
  flat: {
    "--kbd-bg": "color-mix(in oklch, var(--fg) 8%, transparent)",
    "--kbd-edge": "transparent",
  },
  raised: { "--kbd-bg": "var(--bg)", "--kbd-edge": "var(--line)" },
  outline: {
    "--kbd-bg": "transparent",
    "--kbd-edge": "color-mix(in oklch, var(--fg) 22%, transparent)",
  },
}
const keyboard = sectionControls(
  "Keyboard",
  {
    keycaps: choice("raised", ["flat", "raised", "outline"], { label: "Keycaps", group: "Table" }),
    stripes: toggle(false, { label: "Striped rows", group: "Table" }),
  },
  {
    tokens: (v) => ({
      ...keycaps[v.keycaps],
      "--row-stripe": v.stripes ? "color-mix(in oklch, var(--fg) 3%, transparent)" : "transparent",
    }),
  },
)

const keys: [string, string][] = [
  ["↑ ↓ or j k", "Move between presets, rows and custom actions"],
  ["← → or h l", "Adjust a slider, cycle a choice, flip a switch (⇧ for ×10 steps)"],
  ["Enter or Space", "Open a colour, point or easing editor; ↓ then walks into it"],
  ["Esc", "Fold an open editor, clear a selection, or close the floating panel"],
  ["[ ]", "Cycle presets and saved variants from anywhere in the panel"],
  ["Home End", "Jump a slider to its min or max"],
  ["0–9 . -", "Type a number into the focused slider (Enter commits, Esc cancels)"],
  ["⌫", "Reset the focused row or the selection; delete a saved variant on the strip"],
  ["s", "Jump mode: type a row's badge to go straight to it"],
  ["f", "Focus the first row"],
  ["r  ⇧R", "Random / reset everything"],
  ["⌥R", "Mutate: nudge every unlocked value a little"],
  ["g  ⌥G", "Random / mutate the focused row's group"],
  ["⇧L", "Lock or unlock the focused row from Random and Mutate"],
  ["⇧↑ ⇧↓", "Extend a selection of rows (⇧-click and ⌘-click with the mouse)"],
  ["⇧F10", "Open the row's menu (or right-click)"],
  ["hold \\", "Compare with the values before your last change"],
  ["⇧C", "Copy the values (or the selected ones) as code"],
  ["⇧S", "Save the current values as a variant"],
  ["u  ⇧u", "Undo / redo (z and ⇧z work too)"],
  ["?", "Show the shortcuts"],
]

export default function Panel() {
  return (
    <>
      <Section
        title="The panel"
        level={1}
        lede="Every panel works the same way, whether it floats out of a chip or sits inline. Everything the mouse can do, the keyboard can do too."
      >
        <p>
          The header holds Random, Reset, Copy, Undo and Redo. Below it, the preset strip holds your
          presets and saved variants, then come the rows, grouped into cards. The panel below has
          three groups and three presets; try it with the keyboard after clicking a row.
        </p>
        <ButtonDemo />
      </Section>

      <Section title="Keyboard" controls={keyboard} className="keyboard">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Action</th>
              </tr>
            </thead>
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
        <p>
          <kbd>Tab</kbd> moves between controls and wraps inside a floating panel. Text inputs on
          your page keep their own keys; the panel only listens while it has focus.
        </p>
      </Section>

      <Section title="Jump to anything">
        <p>
          Press <kbd>s</kbd> and every row, preset and button gets a short badge, the shortest
          prefix that's unique in that panel. Type a badge to jump there; a preset's badge applies
          it.
        </p>
      </Section>

      <Section title="Gestures">
        <ul>
          <li>
            Drag a slider anywhere along its row. <kbd>⌥</kbd>-drag moves at a tenth of the speed,
            and a drag is one undo step however long it lasts.
          </li>
          <li>
            Scroll sideways over a slider (or hold <kbd>⇧</kbd> and use the wheel) to nudge it by
            steps. The same swipe over the preset strip or a choice moves one preset or option per
            gesture.
          </li>
          <li>Double-click a row or its label to reset it.</li>
          <li>Drag a floating panel by its header. It remembers where you left it.</li>
        </ul>
      </Section>

      <Section title="Presets and variants">
        <p>
          Presets ship with your code; variants are values you saved while tuning. Both live in the
          same strip. Click <kbd>+</kbd> or press <kbd>⇧S</kbd> to save the current values as a
          variant, and <kbd>⌫</kbd> on the strip deletes one. The <kbd>?</kbd> popover exports and
          imports them as JSON.
        </p>
        <Code>{`
          const button = defineControls("button", schema, {
            presets: {
              pill: { radius: 28, padding: 26, weight: "bold" },
              flat: { depth: 0, radius: 6 },
            },
          })

          button.preset("pill")
          button.matchingPreset() // "pill", or "custom" once anything differs
          button.variants.save("Launch day")
        `}</Code>
        <p>
          A preset only lists the fields it changes; the rest come from the defaults. Switching
          presets ripples the changed rows from top to bottom.
        </p>
      </Section>

      <Section title="Random, Mutate and locks">
        <p>
          Random is a die in the header that tumbles when it rolls. It picks new values within the
          ranges people use: springs between 0.2 and 0.9 seconds with bounce up to 0.45, mid-light
          colours of moderate chroma and a named easing curve. <kbd>⌥</kbd>-click it or press{" "}
          <kbd>⌥R</kbd> to mutate instead, which moves numbers and points by 8–12% of their range,
          turns colours a few degrees and changes a choice or switch about 15% of the time.
        </p>
        <p>
          Each group has a smaller die of its own beside its reset icon. Lock a row with{" "}
          <kbd>⇧L</kbd> or its context menu to keep it out of Random and Mutate; a small lock
          follows its label. Reset still resets locked rows.
        </p>
        <Code>{`
          button.randomize()           // every unlocked field, one undo step
          button.mutate(["fill"])      // small changes to some fields
          button.lock("radius")
          button.isLocked("radius")    // true
        `}</Code>
      </Section>

      <Section title="Compare">
        <p>
          Hold <kbd>\</kbd> to see the values from before your last change, in the panel and in your
          component alike, and let go to come back. The title dims while you hold it. Nothing is
          recorded, so you can flick back and forth as often as you like.
        </p>
      </Section>

      <Section title="Selections and the row menu">
        <p>
          <kbd>⇧</kbd>-click a second row to select a range, or <kbd>⌘</kbd>-click to add or remove
          one. With a selection, <kbd>r</kbd>, <kbd>⌥R</kbd>, <kbd>⌫</kbd>, <kbd>⇧L</kbd> and{" "}
          <kbd>⇧C</kbd> act on just those rows. Right-click, <kbd>⇧F10</kbd> or the context menu key
          opens a menu with Lock, Randomize, Reset and Copy for the row or the selection.
        </p>
      </Section>

      <Section title="Undo and history">
        <p>
          <kbd>u</kbd> undoes and <kbd>⇧u</kbd> redoes, up to 100 steps. A slider drag, a pad drag
          or a scroll gesture is one entry. Values persist to <C>localStorage</C> under the
          controls' id, and a reload keeps floating panels open with focus where it was.
        </p>
      </Section>
    </>
  )
}
