# knobs

Embeddable, keyboard-first tuning controls for React, Solid, and plain DOM.

Give a component a few knobs. Hover it to reveal a tiny cog and open a floating panel, or mount an inline panel directly into a sidebar or tuning dashboard. Explore a seed, a spring curve, a spacing, or a layout variant. Save the good variations. Copy constants back into your source and ship zero tuning UI in production.

Each panel's header carries **Undo · Redo · Reset · Copy · Random** as icon buttons, quiet until the pointer or keyboard is in the panel. Random holds the corner with Copy beside it; they're always there. Undo shows while there's history, Redo while there's something to redo and Reset while it has somewhere to go (back to the active preset, else the defaults), each in a slot of its own that waits empty meanwhile, so they bloom in and out in place and nothing else in the header ever moves. Copy turns into a check for a moment once it has copied, and Reset's ↺ turns once each time it resets before it leaves (a press mid-turn adds another; with reduced motion it blinks instead). Hover washes come in at once and fade out. A button flashes when its command runs, from a click or its key alike (`u`, `⇧U`, `⇧R`, `⇧C`, `R`, `⌥R`, and a group card's `R` / `⇧R` on that group's die and reset); a click presses a header button without leaving focus on it. The header has no `?` button: `?` opens the shortcuts, as the title's tooltip says (`header: { buttons: [..., "help"] }` brings the button back, past Random with the close X). It sits above a preset strip and inset-grouped cards of rows. Random is a die that tumbles when it rolls; `⌥`-click it (or press `⌥R`) to **mutate** instead: small changes around the current values, with a quarter turn of the die. Each group has its own quieter die in its header's corner, with a reset icon beside it that shows (in its own slot, as the header's does) while the group differs from its preset or defaults. **Lock** a row (`L`, or the row's context menu) to keep it out of Random and Mutate; a small lock sits just left of its value. Hold **`\`** to see the values from before your last change, in the panel and your app alike. Shipped presets and your saved variants live together in that strip: `+` (or `⇧S`) saves the current values as a new chip and lets you type its name, `F2`, `Enter` or a double-click renames a saved one, `⌫` on the strip deletes one, and the `?` popover exports/imports them as JSON. The preset you applied last is the **base**: Reset goes back to it, and Random explores around it (see [Presets](#presets-names-and-the-base)).

Beyond sliders, choices and switches there are four richer fields: a SwiftUI-style **spring** (duration and bounce beside its live step-response curve), an **OKLCH colour** (swatch and hex, with hue, chroma and lightness strips that paint their real gradients), a 2D **point** pad, and a cubic-bezier **easing** editor with named curves.

Zero runtime dependencies in core. Pure DOM panels with `@kitlangton/rolling-number` readouts and DialKit-style sliders: a flat accent-tinted fill that stops exactly at its ends, a hairline handle centred on its edge that fades where it would cross the text, detents that hold a drag for a few px at the default (a faint notch rising from the bottom edge), the active preset's value (one hanging from the top) and the middle (and zero), letting go once you push through, stepped sliders (ten steps or fewer) that resist around their stop and snap to the next past halfway, precision by distance (move the pointer up or down off the row while dragging and it slows to ½, ¼ and ⅛ in smooth steps, a fine ruler showing near the handle; come back and it speeds up without the value jumping), `⌥`-drag for 1/10 speed on top of that, a row that stretches like rubber past either end (its far end anchored, a little thinner as it lengthens, its text still) and springs back on release, and a sideways trackpad pan that moves the value with your fingers like a drag (a `⇧` + wheel notch steps once); the same pan drags the selection pill across the preset strip or a choice, through as many options as you travel, flips a switch from anywhere on its row, scrubs a seed and steps a ramp's presets, and the momentum after you lift is ignored, so it stops where your fingers did. At an end, a drag or a pan gives a little like a rubber band instead of stopping dead. Switching presets ripples the changed rows top to bottom; selection pills and switch thumbs stretch toward where they're going and settle; the panel is a frosted glass surface over your work. A reload, Vite's included, keeps floating panels open, editors expanded and focus where it was, per tab. Thin adapters for React (`knobs/react`) and Solid (`knobs/solid`), plus a remote/descriptor mode for driving values over a WebSocket.

## Install

```sh
bun add knobs@npm:@kitlangton/knobs
```

The package is published as `@kitlangton/knobs`; installing it under the alias `knobs` keeps
every import in this README (`knobs`, `knobs/react`, `knobs/panel`, `knobs/ui`…) as written.
React and Solid are optional peers, needed only for `knobs/react`, `knobs/ui/react`,
`knobs/solid` and `knobs/ui/solid`.

## 30 seconds

```sh
bun install
bun run build
```

### Plain DOM

```ts
import { defineControls, knob, choice, toggle } from "knobs"

const splat = defineControls("splat", {
  seed: knob(22, { min: 1, max: 99, step: 1, shortcut: "s" }),
  count: knob(98, { min: 0, max: 300, step: 1, shortcut: "c" }),
  size: knob(7, { min: 1, max: 30, step: 0.5, unit: "px" }),
  flavor: choice("inked", ["inked", "clean"]),
  grain: toggle(true),
}, {
  enabled: import.meta.env.DEV,
  presets: { subtle: { count: 40, size: 4 } },
})

// Floating hover chip + anchored panel (it grows out of the chip and collapses back into it):
const detach = splat.attach(document.querySelector<HTMLElement>("#splat")!)

// Or mount an inline panel inside a container:
const unmount = splat.mount(document.querySelector<HTMLElement>("#sidebar")!, {
  appearance: "system",
  density: "compact",
})

const unsubscribe = splat.subscribe(() => render(splat.get()))
render(splat.get())
// On teardown: detach(); unmount(); unsubscribe()
```

### React (`knobs/react`)

Define controls at module scope so renders do not recreate the store.

```tsx
import { Knobs, KnobsPanel, useControls, VariantSwitcher } from "knobs/react"

function Splatter() {
  const values = useControls(splat)
  // values.count: number; values.flavor: "inked" | "clean"
  return (
    <Knobs controls={splat}>
      <section>
        <MySplatter {...values} />
        <VariantSwitcher controls={splat} field="flavor">
          <span>{values.flavor}</span>
        </VariantSwitcher>
      </section>
    </Knobs>
  )
}

// Or mount an inline panel anywhere in the tree:
function Sidebar() {
  return <KnobsPanel controls={splat} theme="light" density="compact" variants={false} />
}
```

`Knobs` adds no wrapper DOM: its single child must be a native HTML element or a component that forwards its ref to one. Existing refs are composed. For explicit attachment, use `const ref = useKnobs(splat)` and put `ref` on your element.

### Solid (`knobs/solid`)

```tsx
import { Knobs, KnobsPanel, useControls, useKnobs, VariantSwitcher } from "knobs/solid"

function Splatter() {
  const values = useControls(splat)
  // values() is a reactive Accessor<Values<typeof splat.schema>>
  return (
    <Knobs controls={splat}>
      <section>
        <MySplatter count={values().count} flavor={values().flavor} />
        <VariantSwitcher controls={splat} field="flavor">
          <span>{values().flavor}</span>
        </VariantSwitcher>
      </section>
    </Knobs>
  )
}
```

`useKnobs(splat)` works as a Solid `ref={useKnobs(splat)}` callback, and `knobs` works as a `use:knobs={splat}` directive.

### Springs, colours, points and easings

```ts
import { color, defineControls, easing, point, spring, springCss, bezierCss } from "knobs"

const motion = defineControls("motion", {
  travel: spring({ duration: 0.55, bounce: 0.3 }),            // { duration, bounce }
  curve: easing("ease-out"),                                  // [x1, y1, x2, y2]
  target: point({ x: 0.5, y: 0 }, { min: -1, max: 1, step: 0.01 }), // { x, y }
  tint: color("#ef774b"),                                     // "oklch(0.7 0.16 40)"
})

const v = motion.get()
const { easing: spring, duration } = springCss(v.travel)    // a CSS linear() twin of the spring
el.style.transition = `transform ${duration}ms ${spring}, opacity 300ms ${bezierCss(v.curve)}`
el.style.background = v.tint                                // OKLCH strings work as-is in CSS
```

- **`spring(value?, meta?)`**: `{ duration, bounce }` like SwiftUI's `.spring(duration:bounce:)` (ω = 2π / duration; ζ = 1 − bounce, or 1 / (1 + bounce) below zero). Duration runs 0.05–2 s and bounce −0.5–1, both in 0.01 steps. The row is two slider stops beside the step response over a fixed 1.2 s window, drawn with the panel's own spring integrator; a dot runs the curve in real time after each change. `springCss(value)` gives the same motion as a CSS `linear()` easing and duration; `springMotion(value)` gives ω and ζ.
- **`color(value, meta?)`**: takes `#rgb`, `#rrggbb`, `oklch(L C H)` or `{ l, c, h }` and stores a canonical `oklch(L C H)` string (L 0–1), so values serialise, compare and drop into CSS directly. Colours always fit sRGB: chroma is trimmed until they do, keeping lightness and hue. Every hex comes back exactly: `colorHex(color("#0000ff").value)` is `"#0000ff"`. The chroma strip spans 0 to the sRGB gamut edge at the current hue and lightness, so scrubbing hue or lightness keeps the thumb's relative vividness while the readout shows the OKLCH chroma. `colorHex(value)` and `parseColor(value)` convert.
- **`point(value, { min, max, step? })`**: `{ x, y }`; bounds and step take a number or `{ x, y }`. y grows downward, as in CSS and UIKit. The pad marks the default with a ring; a drag is one undo step, and `⌥` drags at 1/10 speed.
- **`easing(value, meta?)`**: `[x1, y1, x2, y2]` or a name: `ease`, `ease-in`/`in`, `ease-out`/`out`, `ease-in-out`/`in-out`, `linear`, `smooth`, `snappy` or `back`. x stays within 0–1 and y within −0.6–1.6. The row shows a mini curve; the editor has two handles and the named curves as chips. `bezierCss(value)` writes the CSS.

### Gradients and curves

```ts
import { curve, defineControls, gradient, sampleCurve, sampleGradient } from "knobs"

const schema = {
  smoke: gradient(
    [
      { at: 0, color: "#fff2c4" },
      { at: 0.3, color: "#7a2e14" },
      { at: 1, color: "#2a2a2c" },
    ],
    {
      label: "Smoke over life",
      presets: { Steam: [{ at: 0, color: "#fff" }, { at: 1, color: "#6b7480" }] },
    },
  ),                                                     // [{ at, color: "oklch(…)" }]
  falloff: curve("inverse²", { label: "Light falloff" }), // [{ x, y }]
  gain: curve([{ x: 0, y: 0 }, { x: 1, y: 2 }], { range: [0, 2], interp: "linear" }),
}
const fx = defineControls("fx", schema)

const v = fx.get()
puff.style.background = sampleGradient(v.smoke, age)                  // an oklch() string
const [r, g, b] = sampleGradient(v.smoke, age, { as: "linear" })       // for a shader
const alpha = sampleCurve(v.falloff, distance / radius, schema.falloff) // the field's interp
```

- **`gradient(stops, { space?, presets?, ...meta })`**: a colour ramp, `[{ at, color }]`. `at` runs
  0–1; colours take what `color()` does and are stored as `oklch()` strings. Stops stay sorted
  (2–32 of them). `space: "oklab"` (the default) blends perceptually; `"srgb"` blends the gamma
  channels as CSS does. The row shows the ramp with a tick per stop. Open, it's a wide strip with
  a pin per stop: drag a pin (it may pass its neighbours), pull it off the strip to delete it
  (never below two), or click the strip to add a stop in the colour already there. The selected
  stop's colour is edited in the hue, chroma and lightness strips below, and `presets` show as
  chips.
- **`curve(points | shape, { range?, interp?, shapes?, presets?, ...meta })`**: a 1D curve,
  `[{ x, y }]`, with x across 0–1 and y within `range` (0–1 by default). The first and last points
  stay at x 0 and 1; a curve holds 2–64 points. `interp` is `"smooth"` (a monotone cubic, so it
  never overshoots between points), `"linear"` or `"step"`. The row shows the shape's name, if it
  is one, and a mini curve. Open, it's a graph with a grid: drag points (`⇧` snaps to the grid),
  press on the curve or double-click empty space to add one, drag one out of the graph (or press
  Delete) to remove it. A crosshair follows the pointer and reads out `x → y`. The built-in
  shapes `linear`, `ease-out`, `inverse²`, `smoothstep` and `bell` (`CURVE_SHAPES`, mapped onto
  the range) show as chips beside any `presets`; `shapes: false` hides them. `curve("bell")`
  starts from one.
- **`sampleGradient(stops, t, { space?, as? })`** returns the colour at `t` as an `oklch()` string,
  or `as: "hex"`, `"rgb"` (gamma sRGB 0–1) or `"linear"` (linear-light, for shaders).
  `gradientCss(stops, { space?, direction? })` writes a CSS `linear-gradient()`.
  **`sampleCurve(points, x, { interp? })`** returns y at `x`. Pass the field as the options, as
  above, so the blend or interpolation matches the editor's.

Keys, with the strip or graph focused: `←`/`→` move the selected stop or point (`⇧` ×10, `⌥`
finest on a curve), and `↑`/`↓` move a point's y. `Tab` / `⇧Tab` step through the stops or points,
then move on past the ends, and `[` / `]` cycle through them. `n` adds one halfway to the next,
and `Delete` removes the selected one. On a gradient, `Enter` edits the stop's colour and `Esc`
comes back. `←`/`→` on a closed row or on the chips cycle the presets. A drag is one undo step.

Presets change smoothly, on one .3 s spring per row that both renderers read. Stops and points
keep their identity: the ends travel, inner ones pair up in order with the nearest, one left over
shrinks into its neighbour and a new one buds out of the line in place. The line is resampled
(129 curve points, 64 colours) and blended between the two, and anything moving fast smears along
its path by its speed (`--k-curve-blur`, 0 at rest). Changing preset mid-flight keeps the speed.
An easing row morphs the same way. Random
keeps a gradient's stop count and walks its hue along a lightness ramp. On a curve, Random picks
a built-in shape and jitters it. Mutate nudges colours as it does a `color` and moves stops and
points without letting them pass each other.

### Inspector fields: vectors, ranges, angles, seeds, key combinations, text and toolbars

```ts
import { action, angle, defineControls, keybind, range, seed, text, toolbar, vec2, vec3 } from "knobs"

const node = defineControls("node", {
  replay: action("Replay", { run: replay, shortcut: "Shift+K", global: true, rebind: true }),
  tools: toolbar([
    { id: "play", label: "Play", icon: "play", shortcut: "Space" },
    { id: "retrigger", label: "Retrigger", icon: "retrigger", shortcut: "R", global: true },
    { id: "frame", label: "Frame", icon: "frame", shortcut: { key: "F", scope: "none" } }, // a chip only
  ]),
  position: vec3({ x: 0, y: 1.2, z: -4 }, { min: -50, max: 50, step: 0.1 }), // { x, y, z }
  ground: vec2({ x: 0, y: 0 }, { min: -50, max: 50, axes: ["x", "z"] }),     // { x, y }, shown as X and Z
  scale: vec3({ x: 1, y: 1, z: 1 }, { min: 0.01, max: 10, step: 0.01, linked: true }),
  pivot: vec2({ x: 0.5, y: 0 }, { min: 0, max: 1, step: 0.01 }),             // { x, y }
  visible: range([4, 40], { min: 0, max: 100, step: 0.5, unit: "m" }),       // [low, high]
  yaw: angle(90),                                                             // degrees
  seed: seed(1234),                                                           // a whole number
  fire: keybind("Space"),                                                     // "Meta+Shift+K", "" for none
  name: text("Lamp", { placeholder: "Untitled" }),                            // one line
  notes: text("", { multiline: true }),                                       // lines in a box
}, { onAction: (id) => run(id) })
```

- **`vec2(value, { min, max, step?, unit?, decimals? })` / `vec3(…)`**: inline x, y (and z) number
  cells. Each cell is a ↑↓ stop: drag it sideways or press ←/→ to scrub (`⇧` ×10, `⌥` finest),
  Enter or a digit to type. `link: true` adds a link button; while linked (`linked: true` starts
  that way) changing one axis scales the others with it. `axes: ["x", "z"]` names the cells (their
  letters and accessible names, "Ground z") for a ground-plane pair; the value keeps its `x` and `y`.
- **`range([low, high], { min, max, step?, unit?, decimals? })`**: one slider with two thumbs that
  can't cross. The nearer thumb follows the pointer; a press well inside the band moves the whole
  band. Each thumb is a stop: ←/→ move it, Enter types it. A thumb that shows never sits on the
  label or readout: their text fades for a few pixels either side of it.
- **`angle(value, { min?, max?, step?, wrap? })`**: degrees on a small dial, 0° up and clockwise.
  0–360 by default, where `wrap` (on for a full turn) carries 359° on to 0°. Drag the hand round
  (`⇧` snaps to 15°) or scrub the readout; ←/→ turn it, Enter types it.
- **`seed(value, { min?, max? })`**: a whole number with a die. Clicking the die or pressing Space
  rolls a new one; ←/→ step it and Enter types it. Its digits roll to a new value; a rolled seed's
  spin upward for as long as the die tumbles. Random and Mutate leave seeds alone unless the field
  says `random: true`.
- **`keybind(value?)`**: a key combination such as `"Meta+Shift+K"` (stored canonically, `""` for
  none), drawn as key caps. Enter or a click starts listening; the next combination is the value,
  Esc cancels and ⌫ clears. Not rolled by Random or Mutate. Letters follow the user's layout
  (Dvorak's K records and matches as K), with ⌥ combinations read through the browser's layout
  map; `comboFromEvent`, `matchesCombo` and `letterOf` do the same for a host's own keys.
- **`text(value?, { multiline?, placeholder? })`**: words typed into a field beside the label, or
  with `multiline` a box under it that grows with its lines (up to eight, then it scrolls). Each
  keystroke sets the value and one focus's typing is one undo step; Enter (`⌘Enter` in a box) or
  Esc lets go. A one-line field turns a line break into a space. Presets, copy and remote
  descriptors carry it like any string; Random and Mutate leave it alone.
- **`toolbar(items, { labels? })`**: a row of buttons with an icon (`play`, `pause`, `frame`,
  `retrigger`, `clear`, `target`, `camera`, `sparkle`, … or SVG path data on a 256 grid), a label
  and a shortcut chip. The buttons share equal columns, as many as fit, balanced across the rows
  (four that don't fit in one row wrap as two and two), each chip at its button's end. A press calls the item's `run` and `onAction(id)`; `controls.action(key, id)`
  does it from code. Shortcuts work while the panel has focus, and anywhere on the page with
  `global: true` (not while typing). A panel's shortcuts win over its own single-key commands.
  `shortcut: { key, scope }` says where one works: `"panel"` (the default), `"page"` (as `global`)
  or `"none"`, a chip that only shows a key the host binds itself (a canvas's `F`), so the panel's
  own `f` and `g` still work beside it. The row holds no value; ←/→ move along it and Enter or
  Space presses. When every button has an icon and the labels don't fit on one row, it's one row
  of icons, each label and shortcut in its tooltip; `labels: false` always shows icons only.
- **`action(label, { run, shortcut?, global?, rebind? })`**: a button row, whose `shortcut` (a
  combination such as `"Shift+K"`, or `{ key, scope }`) presses it under the same rules as a
  toolbar button's: while the panel has focus, or anywhere on the page with `global: true` (not
  while typing). It shows as a key cap at the row's end. With `rebind: true` the user can change
  it there: a click or Enter on the cap listens, the next combination is the new shortcut, Esc
  cancels and ⌫ clears; →/← go between the button and the cap. A rebinding isn't a value: it
  stays out of presets, undo and Random, and is saved with the values, as locks are.
  `controls.shortcut(key, item?)` reads the shortcut in force and `controls.rebind(key, combo,
  item?)` changes it from code (`""` for none, `undefined` for the declared one), a toolbar
  button's too (by its id), which has no cap of its own to rebind it from.

Remote descriptors use the same names: `kind: "vec2" | "vec3" | "range" | "angle" | "seed" |
"keybind" | "text"` with `default`, `min`, `max`, `step`, `unit`, `decimals`, `link`, `linked` and `wrap`, and
`{ kind: "toolbar", items: [{ key, label, icon?, shortcut?, global?, disabled? }], labels? }`; vectors take
`axes`, text `multiline` and `placeholder`. Each kind takes
`disabled`, `readOnly` and mixed values like the rest ("—" in place of the value).

Spring, point, easing, gradient and curve values compare by their contents everywhere (`isModified`, presets, undo, variants), and unchanged ones keep their identity across updates so memoized React children skip them. Random values stay in range people use (springs 0.2–0.9 s with bounce up to 0.45, mid-light colours of moderate chroma, any point, a named curve). Switches sit out of Random and Mutate unless a field says `random: true`: they usually show or hide things (a view, a scene's part), and a roll that hides the page isn't a new take on it.

### Readouts: live values, sparklines, graphs, meters, tables and logs

Readout rows show what a running tool is doing, beside the controls that change it. They hold no value: nothing goes into the store's values, undo, presets or storage. Push to them with `controls.watch(key, value)`, as often as every frame.

```ts
import { defineControls, graph, log, meter, sparkline, table, watch } from "knobs"

const live = defineControls("live", {
  frame: graph({
    label: "Frame time",
    series: [{ id: "cpu", label: "CPU", area: true }, { id: "gpu", label: "GPU" }],
    unit: "ms",
    min: 0,
    thresholds: [{ value: 16.7, label: "60 fps" }],
  }),
  fps: watch({ label: "FPS", decimals: 0 }),
  drops: sparkline({ label: "Drops", min: 0 }),
  memory: meter({ label: "GPU memory", max: 512, unit: "MB", warn: 384, critical: 470 }),
  passes: table({ label: "Passes", columns: ["Pass", "ms", "Draws"] }),
  events: log({ label: "Events", lines: 8 }),
})

// Each frame:
live.watch("frame", { cpu: 5.2, gpu: 9.1 })
live.watch("fps", 60)
live.watch("drops", 1428)
live.watch("memory", 383) // null: indeterminate
live.watch("passes", [["Shadow", 0.42, 12], ["Rain", 1.1, 16]])
live.watch("events", { level: "warn", text: "Gutter drip over budget" })
```

- **`watch`**: a number or text, with `unit`, `decimals` or `format(n)`.
- **`sparkline`**: a number per sample, or an array that replaces the history (`history`, 60 by default). Hovered or focused, it reads the history's min–max.
- **`graph`**: a taller row with several series (`{ [id]: number }` per sample; a series left out breaks its line), `area` fills, `thresholds` with labels, and a crosshair that follows the pointer or `←`/`→` (`⇧` by ten). The legend reads the sample under it. The title keeps its words: in a narrow column the legend drops its units, then wraps under the title.
- **`meter`**: a slim bar out of `max`, or `segments` cells. From `warn` it takes `--k-warn`, from `critical` `--k-critical`, and it doesn't flicker between them when the value hovers at a threshold. `null` sweeps it as indeterminate (`aria-busy`).
- **`table`**: rows of cells, or a key-value record. Numbers sit right in tabular figures.
- **`log`**: a string, `{ text, level?, time? }` or an array of them. Level chips (All, Warn, Error, with counts), a filter that marks its match (`f` or `Enter` from the log), follow-tail that lets go when you scroll up and offers a "3 new ↓" pill, and Copy (`⌘C`) of the lines shown. Only the lines in view are in the DOM. Narrow, the filter shrinks and then the tools wrap under the title.

`controls.watched(key)` returns the latest value; `null` clears a readout. A readout can also poll: `get: () => value` is read each frame while its row is on screen (pushing is the usual way, and lets the page sleep).

Readouts cost nothing at rest. They draw on one shared clock, only while on screen and only when something arrived, so a paused feed lets the page, and the GPU overlay, sleep. Graphics are canvases redrawn from a list of drawing ops (the GPU overlay draws the same ops). Text changes at most `hz` times a second (4 by default), in boxes that only grow, so nothing reflows as numbers change. Scales snap to round steps (1, 2 or 5 × 10ⁿ) and ease there on a spring, in log space, so a spike rescales smoothly. The store keeps each readout's history, so a panel mounted later starts with it. On their own, outside a panel: `readout(sparkline({ unit: "ms" }), { preset })` from `knobs/ui` returns `{ element, push(value), value, dispose() }`.

## Versions of a design: variants in the strip

When a page has several versions of one design (nine hero animations, three card layouts), the
preset strip at the top of the panel is where you switch them. Each version is a preset. Don't
add a `variant` choice beside it: two ways to switch the same thing is one too many.

When the page's code branches on which version is on, give that choice `variants: true`:

```ts
const controls = defineControls("upsell", {
  variant: choice("Stand up", ["Stand up", "Anamorphic", "Roll", "Trace"], { variants: true }),
  speed: knob(1, { min: 0.25, max: 2, step: 0.05 }),
}, {
  presets: { Roll: { speed: 0.8 } }, // optional: values a variant changes beside itself
})

render(controls.get().variant) // "Stand up", until another chip is picked
```

- **Each option is a chip in the strip.** The default option is the `default` preset, named after
  it; the others follow in order, then any other `presets`. Their ids are the options, and
  `labels` name the chips.
- **The choice has no row.** The strip is the one place to switch, with a click, a sideways pan,
  `[` / `]`, or `1`–`9` from anywhere in the panel but a number row.
- **Random leaves it be** (`random: false` unless you say otherwise). Random explores around the
  active variant, and Reset goes back to it, as with any preset.
- **`presets` keyed by an option add to that variant.** The default variant's values are the
  schema's defaults, so it takes none there.

Versions that differ only in their values need no choice at all: they're plain `presets`, with
`defaultLabel` naming the first.

## Presets: names and the base

The strip holds the schema's `presets` (and `default`) beside the variants you save. Saving (`+` or `⇧S`) puts a field where the new chip goes, its name ("Variant 3") selected so typing replaces it; `Enter` keeps what you typed, `Esc` keeps "Variant 3", and the field opens out to the chip's width without moving anything else. `F2` or `Enter` on the strip, or a double-click, renames a saved one the same way (`controls.variants.rename(id, name)`); names are kept with the variants in the store's storage. The schema's presets keep their names.

The preset you apply last (a chip, `[` / `]`, a pan, `controls.preset(id)`, `variants.load(id)`, or a page card's preset for its group) becomes the **active preset**, the base for its scope:

- **Reset climbs a ladder.** `⇧R`, the header's ↺, a group's ↺ and a row's reset go back to the active preset's values while anything differs from them; from there, the next reset goes to the defaults. Reaching the defaults with everything forgets the preset (so does applying Default); a group's reset forgets the group's own preset. With no active preset, Reset goes to the defaults, as always. Each reset icon shows while its reset has somewhere to go.
- **Modified means off the base.** Rows' dots, the readout marks, the "Modified" filter and fold summaries compare with the active preset. Its chip stays selected; once the values drift from it the pill softens and a small dot in the chip's corner marks it modified. Clicking the chip again brings its values back.
- **Random explores around it.** With an active preset, Random (`r`, the dice, `g`) draws near its values instead of anywhere: a number lands in a window 35% of its range wide, centred on the preset's value and slid inward at an end so it keeps that width. That's far enough to be a new take and near enough to stay recognisably that preset (Mutate moves 8–12% from the current values; a free roll covers all of it). Choices (and switches that opt in) keep the preset's pick 70% of the time; colours keep their family (hue within ±20°, lightness ±.06, chroma ±15% of what the hue can hold); springs, points, vectors, ranges, angles, easings, gradients and curves stay as near; seeds roll freely. A group preset is the base for its own keys; the others roll freely. Mutate still nudges the current values. `AROUND` (exported from `knobs`) holds the numbers.
- **The `?` popover says so:** "Random around Storm / Back to Storm", then "Reset all to defaults" once you're there.
- **Undo covers it:** applying a preset, each reset and each roll is one undo step, and undoing restores the active preset with the values. The active preset is kept with the values in storage.

`controls.activePreset(scope?)` returns `{ kind: "preset" | "variant", id }` or null (a tab's or group's with `scope`, see `scopedPresets` under [Tabs](#tabs-sub-headings-and-search)), `controls.activeGroupPreset(group)` the group's index or -1, `controls.baseValues()` what Reset returns to first, and `controls.canReset(keys?)` whether a reset would change anything. A reset back to a preset reaches `onChange` with `source: "reset"` and `base: true`; remote controls send its values with `onSet` (nulls only for a reset to the defaults), or call `onPreset` again for a group whose peer applies its own presets.

## Keyboard

Panels and switchers are keyboard-first:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move between presets, rows and custom actions (`←`/`→` move along the custom actions); a spring's two sliders are two stops |
| `←` / `→` | Adjust slider, cycle choice, or flip toggle (`⇧` multiplies numeric step by `×10`); on a colour row turn the hue, on a point row move x, on an easing row cycle the named curves |
| `Enter` / `Space` | Open a colour, point, easing, gradient or curve row's editor; `↓` then walks into it (strips, chips, handles, pad) |
| `Esc` | Climb one level: fold an open editor back to its row, then from a row to its card, from a card to the panel, then out (a floating panel closes). The focus lens grows out to each level as you go, and the header's `esc ↑ Shape` says where the next press goes (see [Where keys go](#where-keys-go)). Inline edits, the search field and the tree's type-ahead take `Esc` first |
| Arrows on a pad or curve handle | Move the puck or handle (`⇧` ×10, `⌥` finest); `j` / `k` or `Tab` move on |
| On a gradient strip or curve graph | Arrows move the selected stop or point; `Tab` / `⇧Tab` and `[` / `]` pick another; `n` adds one, `Delete` removes it; `Enter` edits a stop's colour (`Esc` returns) |
| `[` / `]` | Cycle presets and saved variants from anywhere in the panel; with no preset strip, cycle tabs |
| `1`–`9` | Pick the focused row's Nth option: a choice (segmented or menu) or a curve's, easing's or gradient's presets. Anywhere else in the panel, pick the preset strip's Nth chip (a design's variants). While you use keys, tiny digit hints show on the options once focus settles, and on the strip's chips while focus is on the strip or the panel (`hints: { digits: "always" }` on the mount keeps them on the chips all the time, small and dim before each name). A number row keeps its digits for inline edits, and a page's card for its group presets |
| `⌥1`–`⌥9` | Show tab 1–9 |
| `/` | Focus the search field (`Esc` clears it, then hands focus back; `↓` or `Enter` go to the first row left) |
| `Home` / `End` | Jump slider to `min` or `max` |
| `0`–`9`, `.`, `-` or `Enter` | Edit numeric value inline: the readout's own digits, in place, with the unit after them. `↑` `↓` step the text (`⇧` by the big step), `Enter` commits (the readout rolls from what was typed to the nearest step in range), `Esc` cancels |
| `Backspace` / `Delete` | Reset focused row (or the selection) to its default (or double-click row/label) |
| Drag a slider | Follows the pointer. Off the row it slows in smooth steps (×1 within 24 px, ×½ around 60, ×¼ around 110, ×⅛ beyond 146; ranges, dials, vector cells and colour strips too), a fine ruler fading in near the handle a level per halving; the value never jumps as the rate changes. It sticks for a few px at the default, the active preset's value and the middle (and zero), with a tick (a sound with `sound: true`) and a small settle of the handle, and lets go once pushed through; slowed, the detents weaken so a fine move can sit beside one. `detents: false` on a knob or the mount turns them off. Past `min` or `max` the row stretches like rubber from the end it's anchored at (14 px at most, never past the panel's glass, with one tick) while the value stays at the limit, and springs back on release; range ends, colour strips and pads stretch at their limits too |
| `⌥` + drag | Fine-tune at 1/10 speed, on top of the slowing off the row |
| Pan sideways (two fingers) | Every control that holds a value answers it, in the active state a drag gives it. Sliders, colour strips, pads, easing handles, vector cells, ranges and dials move 1:1 with the fingers; over the preset strip or a choice, the pill slides through the options, and a choice menu steps them. Anywhere on a switch's row, its thumb follows the fingers and the switch flips past the middle (a flick goes its way). A seed scrubs a step every 12 px, its die rolling along, and a flick carries on a few steps. Over a gradient strip or a curve graph it moves the stop or point under the pointer; on a gradient, curve or easing row's head it steps through the presets (a mouse dragged sideways on the folded head does too, a step every 24 px; under 4 px it's still a click that opens the row), and on a colour row's head it turns the hue. At a limit everything gives a little, as under a drag (a slider's fill 14 px at most, other controls 6, with one tick), and springs back when you let go; a slider's pan sticks at the same detents as its drag. One undo entry per gesture; momentum is otherwise ignored; vertical scrolling passes through. A `⇧` + wheel notch steps once |
| `s` | Jump: badges every row (one code per row, compound ones included), preset and button with its shortest unique prefix; type it to jump (presets apply). With other panels or `knobs/ui` pieces on the page, it labels all of them (see [Hint mode across the page](#hint-mode-across-the-page)) |
| `Tab` / `⇧Tab` | Next/previous control, wrapping inside floating panels |
| `f` | Focus first row |
| `r` / `⇧R` | Randomize / reset, scoped to focus: the selection, else the focused row, else the focused card (its group), else every field. With an active preset, Random lands near it and Reset goes back to it, then to the defaults (see [Presets](#presets-names-and-the-base)). Locked fields, switches and `random: false` keep their values on Random, not on Reset. The header's die and reset icon always act on everything. A reset icon shows while its reset has somewhere to go (the header's: anything; a group's: that group), and ⇧R on a group's card turns that group's ↺ as a click would |
| `⌥R` | Mutate, scoped the same way: nudge every unlocked value a little (numbers and points 8–12% of their range, colours a few degrees of hue and a touch of chroma and lightness, springs and curves slightly; choices and switches change about 15% of the time) |
| `g` / `⌥G` | Randomize / mutate the focused row's whole group from any row in it (also the die beside each group's reset icon; `⌥`-click mutates) |
| `L` | Lock or unlock the focused row, the selection, or a focused group heading's whole group, from Random and Mutate (right-click a group heading for its Lock, Randomize and Reset) |
| `⇧`-click / `⇧↑` `⇧↓` | Select a range of rows (`⌘`-click adds or removes one); `r`, `⌥R`, `⌫`, `L` and `⇧C` then act on the selection; `Esc` or a plain click clears it |
| Right-click / `⇧F10` / `ContextMenu` | Menu for the row or selection: Lock from Random, Randomize, Reset, Copy; `↑↓`, a letter, `Enter`, `Esc` |
| Hold `\` | Compare: show the values from before the last change while held (the title dims); nothing is recorded |
| `⇧C` | Copy the current values (or the selected fields) as code |
| `⇧S` | Save the current values as a new preset chip and type its name (`Enter` keeps it, `Esc` keeps "Variant N") |
| `F2` / `Enter` on the strip, double-click a chip | Rename a saved preset |
| `u` / `z` | Undo (`⇧u` / `⇧z` redo); slider drags coalesce into a single history entry |
| `?` | Toggle keyboard shortcuts popover (the title's tooltip mentions it) |
| `` ` `` | Show or hide every panel and chip on the page, from anywhere outside a text field (see [Show, hide and unlock](#show-hide-and-unlock)) |
| `Esc` | Close the shortcuts popover; on a focused floating panel (nothing deeper focused), close it and restore focus to its chip |
| Click a card's empty area or heading | Focus the card (the lens wraps it); `↑` / `↓` go to its first or last row, and `r`, `⌥R` and `⇧R` act on its group |

### Where keys go

Keys act on the level focus is at: an open editor's part, a row, its card, or the whole panel.
Three things show which, in both renderers, on floating and inline panels and on a page:

- **The focus lens.** One shape, a soft wash with a hairline edge, marks that level and morphs
  straight from where it is to the next (position, size and corners on a quick spring with no
  bounce), never through another level. At rest it fits its target exactly: a row's own shape in
  its card (square, but for the card's corners it reaches), a card's rounded rect. Going in, it
  shrinks onto the row; `Esc` grows it out to the card, then to the panel; `Esc` or `Tab` out of
  the panel grows it to the panel's edge as it fades (a click elsewhere just fades it). A row to
  the next glides. It replaces the per-row and per-card washes. A row's lens shows while you use
  keys (as the old focus wash did); a card's also after a click on it. A press waits for its click
  to finish, so a click on a heading goes straight to the card. With reduced motion it fades out
  where it was and in where it lands.
- **The armed panel.** While a panel holds the keys (focus is inside it; hovering isn't enough),
  its hairline edge brightens a touch toward the accent and its title is at full strength. At rest
  the title is a little quieter, so on a page with several panels the one listening is plain.
  Focus leaving (or `Esc` out of the panel, or the window going to the background) disarms it.
- **The scope line** (opt-in: `crumbs: true` on the mount). Beside the title, a quiet trail says
  where keys go: `Swarm › Shape › Cohesion`, the deepest crumb bright and its parents dim. Crumbs
  glide to their places as focus moves, and one that changes fades out as the new one fades in. For a moment after a key below
  the panel's level, a faint `esc ↑ Shape` follows it, then fades. Clicking a crumb takes focus to
  its level; clicking the title takes it to the panel. The line lives in the room between the
  title and the header's buttons: when it doesn't fit, the first crumbs drop off, and without room
  for the deepest it stays empty, so it never runs under the buttons and the title never moves.
  Without it the header is the title and its buttons; the lens and the armed frame show either way.

Tune them with tokens on the panel or any ancestor:

| Token | Default | What it does |
| --- | --- | --- |
| `--k-lens-ms` | `180` | The lens's morph (ms), a spring with no bounce |
| `--k-lens-lead` | `1` | How much quicker its size settles than its position (`1`: together) |
| `--k-lens-wash`, `--k-lens-line` | `.9`, `.65` | Its wash (a share of `--k-surface-hi`) and hairline edge (of `--k-line-hi`) |
| `--k-lens-panel-wash` | `.35` | The wash at the panel's level, where it covers everything (a share of the wash) |
| `--k-lens-inset`, `--k-lens-panel-inset` | `0px`, `0px` | How far inside a row, and inside the panel's edge, it sits |
| `--k-armed-edge` | `.1` | How much accent an armed panel's hairline edge takes |
| `--k-armed-glow`, `--k-armed-glow-a` | `0`, `0` | An optional glow around it: blur (px) and the accent's strength |
| `--k-title-rest` | `.6` | A resting panel's title, between `--k-label` (0) and `--k-text` (1) |
| `--k-esc-hint-ms` | `1800` | How long `esc ↑ …` stays after the last key |

### Hint mode across the page

With more than one thing on the page to label (two panels, a panel beside a `knobs/ui` tree,
timeline or split, or the host's own `data-hint` buttons), `s` reaches all of them: pressed in a
panel or a piece, every visible control in every panel (rows, tabs, toolbar
buttons, header buttons), each tree row on screen, a timeline's Play, markers and playhead, the
splits' header actions, collapse buttons and rails, and the host's elements gets a code. Typing one
focuses its control (a row) or presses it (a button, a marker, a tree row); `Backspace` takes a
letter back, `Enter` takes the first match, `Esc`, a click or a scroll cancels. Only what shows is
labelled: rows on other tabs, in folded groups or scrolled out of their pane aren't.

Codes are one or two letters, grouped: each panel or piece takes a letter of its own (panels first,
then the pieces, then the host's; down each column, left to right; home row first) and its controls
a second letter, home row first, so `a` then `s` is the first panel's second control. A group of
one is just its letter; spare letters split a big group so its second letters stay on the home row.
With only one panel on the page, nothing changes: `s` works while focus is in it, with codes from
its labels. On the page itself (focus on its body, a game's canvas, your content in a split's
pane) `s` stays the page's, so a game's WASD keeps its S. It starts hint mode there only when the
host asks: it registers targets of its own (`hints.register`) or marks elements `data-hint`.

```ts
import { hints } from "knobs/panel" // or "knobs/ui"

// The host's own targets: elements, or { el, label?, labelEl?, activate? }.
const off = hints.register(toolbar, () => toolbar.querySelectorAll("button"))
```

```html
<!-- Or no code: a data-hint (its value labels it; empty uses the aria-label or text). -->
<nav data-hint-group>
  <button data-hint>Edit</button>
  <button data-hint="Play">▶ Play</button>
</nav>
```

A `data-hint` element is pressed (a click) unless it's a field or focusable without being a button,
which takes focus. `data-hint-group` keeps a container's elements under one letter. Panels opt out
with `keys: { hint: false }`, or keep `s` to themselves with `hints: "panel"` on the mount (the
default is `"page"`); `tree`, `timeline` and `split` take `hints: false`. A tree leaves `s` to hint
mode while the page has it (type-ahead keeps every other letter). `hints.start()` and `hints.stop()`
drive it from a host's own key.

In `VariantSwitcher` (React, Solid, or `attachVariantSwitcher` from `knobs/panel`): hover or focus, then press **`1`–`9`** or **`←`/`→`**; `Enter`/`Space` cycles when focused. Nested switchers share a single hover owner, and text inputs keep their own keys.

## Groups, Labels, Actions & Remote Mode

Fields accept optional `label`, `group`, and `shortcut` metadata:

```ts
const motion = defineControls("motion", {
  duration: knob(0.4, { min: 0.1, max: 1, step: 0.05, unit: "s", label: "Duration", group: "Spring", shortcut: "d" }),
  bounce: knob(0.25, { min: 0, max: 0.7, step: 0.05, label: "Bounce", group: "Spring", shortcut: "b" }),
  chrome: choice("glass", ["glass", "solid"], { label: "Chrome", group: "Surface" }),
}, {
  actions: [
    { label: "Copy JSON", run: (v, ctl) => navigator.clipboard.writeText(ctl.code("json")).then(() => "Copied JSON.") },
  ],
})
```

When fields specify `group`, each group's rows share one rounded card under a section header.

**Labels apart from ids.** A group's string is its identity (group presets, `resetGroup`, `onReset({ group })`, `page.highlight({ groups })`, `swift(group)`), and by default also its title. When the ids are machine-shaped (`drawer.spacing`, `composer.spacing`) give them labels; same-labelled groups stay separate cards:

```ts
defineControls("tune", schema, {
  groupLabels: { "drawer.spacing": "Spacing", "composer.spacing": "Spacing" }, // by group id, verbatim
  sectionLabels: { drawer: "Session List" }, // by section id (pages)
  presetLabels: { snappy: "Snappy" }, // by preset id
  defaultLabel: "Native", // shorthand for presetLabels.default: the baseline's chip
})
// or per field / descriptor (the first one that gives a label wins):
knob(44, { min: 28, max: 72, group: "drawer.spacing", groupLabel: "Spacing", section: "drawer", sectionLabel: "Session List" })
```

`createRemoteControls` takes the same options (and `groupLabel` / `sectionLabel` on descriptors), and `mountPanel` / `mountPage` take them too, over the store's. Everything that shows a name uses the label: card headers in both renderers, aria names, hint codes, the preset strip, its hint badges. The filter matches labels and ids alike. The preset id stays `default` for `[` / `]`, storage and `matchingPreset()`; there's no second "default" chip. Stores answer `groupLabel(id)`, `sectionLabel(id)` and `presetLabel(id)`. Group presets already have names, so `presetLabels` doesn't apply to them. A small reset icon appears beside the header while anything in that group differs from its defaults, next to a die that randomizes just that group (`⌥`-click mutates it). A slider's default is a short notch rising from its bottom edge while the row is hovered, focused or dragged, brighter once the value moves off it; with an active preset whose value differs, a second notch hangs from the top edge at that value, and either brightens while a drag is held on it; changed choices and switches show a small dot.

### Remote / Socket-Driven Controls (`createRemoteControls`)

When values live on another device or process (such as the OpenCode iOS app paired with a Mac over WebSocket), build controls from runtime descriptors with `createRemoteControls`:

```ts
import { createRemoteControls, type ControlDescriptor } from "knobs"
import { mountPanel } from "knobs/panel"

const descriptors: ControlDescriptor[] = [
  { key: "drawer.spring.duration", label: "Duration", kind: "number", swiftType: "Double", default: 0.35, min: 0.1, max: 1, step: 0.05, unit: "s", group: "Spring" },
  { key: "drawer.spring.bounce", label: "Bounce", kind: "number", swiftType: "Double", default: 0.15, min: 0, max: 0.6, step: 0.05, group: "Spring" },
]

const remote = createRemoteControls("iphone", descriptors, {
  values: phone.values,
  onSet: (key, value) => ws.send(JSON.stringify({ type: "set", key, value })),
  onReset: ({ key, group }) =>
    ws.send(JSON.stringify(key ? { type: "set", key, value: null } : { type: "resetAll", group: group ?? null })),
  actions: [
    {
      label: "Copy as Swift",
      run: () => navigator.clipboard.writeText(remote.swift()).then(() => "Copied Swift."),
    },
  ],
})

// Apply incoming socket updates without echoing them back to onSet or polluting undo history:
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.type === "state") remote.sync(msg.state.phones[0].values, { replace: true })
}

mountPanel(remote, document.querySelector("#groups")!, { variants: false })
```

A change of several keys at once (a page or card preset, Native, Random, Mutate, resetting a selection, or undoing and redoing any of them) can go out as one message: give `onSetBatch` and it gets the change's entries in one call instead of an `onSet` per key. Each entry is what `onSet` would have received, with `null` again meaning back to the default. A one-key change still calls `onSet`, or `onSetBatch` with one entry when there's no `onSet`. Resetting everything or a card still reaches only `onReset`, and a card preset only `onPreset` when given. Echo holds stay per key: each key in a batch holds against stale state until the peer reports the value sent for it.

```ts
onSetBatch: (changes) => ws.send(JSON.stringify({ type: "setMany", changes })),
```

Descriptors also take `kind: "spring"` (default `{ duration, bounce }`), `"color"` (any string `color()` accepts), `"point"` (default `{ x, y }`, with `min`/`max`/`step` applying to both axes), `"easing"` (default `[x1, y1, x2, y2]`), `"gradient"` (default `[{ at, color }]`, with `space` and `presets`) and `"curve"` (default `[{ x, y }]`, with `range`, `interp`, `shapes` and `presets`). `onSet` then sends those values as they are (objects, strings and arrays), or `null` when a key returns to its default. `remote.swift()` emits matching Swift:

```swift
TunableSpring("drawer.spring", "Drawer", duration: 0.45, bounce: 0.25)  // was duration: 0.4, bounce: 0.25
Tunable<Color>("composer.tint", "Tint", default: Color(red: 0.2393, green: 0.5451, blue: 0.9999))  // #3d8bff · was Color(red: 0.0392, green: 0.5176, blue: 1)
Tunable<CGPoint>("composer.anchor", "Anchor", default: CGPoint(x: 0.5, y: 0.75))  // was CGPoint(x: 0.5, y: 1)
Tunable<UnitCurve>("drawer.fade", "Fade curve", default: .bezier(startControlPoint: UnitPoint(x: 0.32, y: 0.72), endControlPoint: UnitPoint(x: 0, y: 1)))  // was .bezier(...)
```

Colours leave as sRGB components (the OKLCH value is already inside sRGB). Points are `CGPoint`s and easings SwiftUI `UnitCurve.bezier` values. Gradients become `Gradient(stops: [.init(color: Color(…), location: …)])` and curves `[CGPoint]`. Paired `*.duration` / `*.bounce` number descriptors still fold into one `TunableSpring`.

**Migrating an app's Tune page:** the Swift side needs `Tunable` to support `Color`, `CGPoint` and `UnitCurve` (decoding the socket's `"oklch(L C H)"`/hex string, `{ x, y }` and `[x1, y1, x2, y2]`), and a `TunableSpring` that reads `{ duration, bounce }` from one key rather than two. Until then, keep sending a spring as paired `.duration`/`.bounce` number descriptors; the panel and codegen handle both. Nothing in other repositories changes until you opt in.

See [`docs/migration.md`](./docs/migration.md) for the OpenCode iOS Tune Page and the Problems rewrite, and [Embedding in an app](#embedding-in-an-app) below.

## Embedding in an app

Panels can be part of a product, not just a dev tool: an app's parameter column, a prototype's
settings, a settings sheet. The app owns the values; the panel shows them and reports intents.

```tsx
import { createRemoteControls, type ControlDescriptor } from "knobs"
import { KnobsPanel, useModified } from "knobs/solid"
import { problemsPreset } from "knobs/themes"

const params = createRemoteControls("parameters", [], {
  ship: () => import("knobs/panel"), // live in production builds too (see Shipping)
  nullDefaults: false,               // onSet sends values as they are
  onSet: (key, value) => save(key, value),
  onReset: ({ key, group }) => clear(key ?? group), // {} resets everything
  onAction: (key) => run(key),
})
const modified = useModified(params) // a "modified" dot beside your own heading

<KnobsPanel
  controls={params}
  descriptors={descriptors()}   // a new array swaps rows in place; the same array only syncs values
  values={values()}             // your state, optimistic edits and server echoes included
  land={switchingItem()}        // another item arrived: values land without springing
  header={false}
  preset={problemsPreset}
  keys={{ random: false, undo: false, vim: false, edit: false, bigStep: 5, wrap: false }}
  onReady={(panel) => (focusPanel = () => panel.focus())}
/>
```

Without Solid: `remote.update(descriptors, values, { land })` and `mountPanel(remote, el, options)`.

- **Descriptor swaps.** `remote.update(descriptors, values, { land? })` keeps the panel. Rows whose
  key persists keep their DOM and spring to the new value (a new range retunes in place); new rows
  reveal and missing ones fold, in the cascade's turn. Undo history belongs to one descriptor set:
  it starts over when the descriptors change shape or `land` is set.
- **One rule for incoming values.** A key is *held* while it's in hand (dragged, or open in the
  inline editor) and, on remote controls, for 600 ms after it last changed here (`echo`). `sync`
  and `update` leave held keys alone; when the hold ends, the newest value that arrived lands.
  `controls.hold(key, on)` holds keys for controls of your own.
- **Flat springs.** `{ key: "spring", kind: "spring", bind: { duration: "d", bounce: "b" } }`
  draws two flat number keys as one spring card. Their own number descriptors, if present, give
  ranges and labels. `onSet` reports `"d"` and `"b"` separately; values stay flat. Locally:
  `defineControls("m", { ...flatSpring({ duration: 0.45, bounce: 0.3 }, { label: "Spring" }) })`.
- **Actions and settings.** `{ kind: "action" }` (or `action("Replay")` locally) is a button row
  that calls `onAction(key)`; `shortcut` (a combination), `global` and `rebind` work as `action`'s. Choices take `{ id, label }` options. `fromSettings(groups, home)` maps
  a hosted prototype's settings sections (choices, switches, buttons, titled sections becoming
  groups) to descriptors and values, with what the prototype first reported as each default.
- **Choices** are segmented while their labels fit with room to spare and there are at most four,
  and a drop-down menu otherwise. The row's label keeps its words and the control gives way: a
  menu's value truncates (its whole text shows on hover) down to a few letters, and segments that
  would squeeze the label become a menu. Only then does the label give way, and never below half
  the row. They switch both ways as the width changes; `display: "menu" | "segmented"` fixes one.
  On a menu row, ←/→ step through the options, and Enter or Space opens the menu (↑↓, a letter,
  Enter, Esc).
- **Keys stay scoped.** A panel, inline or floating, hears keys only while focus is inside it. Keys
  it handles are claimed (`preventDefault`) and stopped there, and everything else reaches the page.
  A press on the page outside it hands focus back to the page and leaves the panel open, even where
  the page cancels its presses so focus can't move (a game's canvas): play with the panel open, and
  click back into it to tune. A floating panel opens with focus at its own level, so one Esc closes
  it and ↓ goes in to the rows. Esc hands focus back (a floating panel's Esc at its own level closes
  it), and the page's toggle key (`` ` ``) shows and hides it from anywhere. `keys` remaps (`{ hint: "f" }`) or turns off (`{ random: false }`) any command; a
  command that's off loses its header button too, and the `?` popover and row menu list only what's
  on (see **Header** for picking buttons). `vim: false` drops j/k, `edit: false` leaves digits
  and Enter to the page, `bigStep` sets ⇧'s multiplier and `wrap: false` stops ↑/↓ at the ends.
- **Marks.** `marks: false` (on the store or the mount) hides modified dots, readout marks, group
  resets and Reset, for values that belong to someone else. A command that's off takes its marks
  too: with `reset: false` rows show nothing to reset, and group resets follow `resetAll`.
- **Haptics.** On phones, a stepped slider crossing a stop, a detent catching a drag, a
  choice, preset or seed changing mid-pan, a pan meeting a limit and a switch flipping each give a
  light tick: `navigator.vibrate` on
  Android; on iPhone, Safari's switch tick (iOS 17.4–26.4 for every tick; from iOS 26.5, which only
  plays it for a tap, switches alone). `haptics: false` on the mount turns them off, and so does
  reduced motion.
- **Sound.** `sound: true` on the mount gives the panel quiet, short sound effects, synthesized
  live with Web Audio (no files): a slider's detents pitched by where the value sits (a slow drag
  ratchets evenly, a fast scrub ticks lighter, the default's notch is firmer), a soft bump where a
  pan or an arrow meets an end, a switch's two-part throw (off sits lower), a choice's detent that
  rises going forwards and falls going back, a glass fifth for a preset, a die tumbling for Random
  (two clicks for Mutate), a breath drawn backwards for Reset, two rising glass notes for Copy, air
  sliding back or forward for undo and redo, a latch for a group folding or opening, a ting and
  key ticks for hint mode, a firm click for an action and a key going down and up for a captured
  combination. They're off by default and follow the same moments as haptics. `{ volume, theme }`
  sets the panel's level (0–1) and its material: `"glass"` (the default, with a faint ring) or
  `"mech"` (drier). Nothing is made before the page's first click or key, so browsers don't warn.

  ```ts
  import { sound } from "knobs/panel"

  mountPanel(controls, host, { sound: true })
  sound.enable(false) // the page's switch: mutes every panel (and your own cues); on by default
  sound.setVolume(0.6)
  sound.play("copy") // a cue of knobs' palette from your own UI
  sound.subscribe(() => speaker.ariaPressed = String(sound.enabled))
  ```

  With `sound` on, the `?` popover offers **Sounds on/off** for the user, kept in the store's
  `storage`. `sound.output()` hands you the shared context and the bus to connect your own nodes
  to, so volume and mute reach them too (the catalog's lamp hums through it). The approach (struck
  modes, a sine knocked sharp, cadence that lightens repeats, one lazy context) follows
  [Cuelume](https://cuelume.dev) (MIT); the palette is knobs' own.
- **Reading values.** `useValue(controls, key)` and `useModified(controls, key?)` change only when
  their answer does; a panel update touches only the rows that changed.

### Embedding options

An editor that already has its own state, undo stack and chrome (the Arcade Lab is the model:
`examples/lab.html`) hands the panel those instead of working around it:

```ts
const station = createRemoteControls("lab-station", descriptors, {
  values: settings,
  nullDefaults: false,
  echo: 0,                                 // local state: no late echoes to wait out
  random: seeded(tuning.seed),             // Random and Mutate draw from this, not Math.random
  tunable: (key) => !key.endsWith("Seed"), // beside locks and each field's `random: false`
  history: editorHistory,                  // { undo, redo, canUndo, canRedo, subscribe? }
  persist: "variants",                     // keep saved variants, never the values
  onSet: (key, value, meta) => write(key, value, meta),
  onGesture: ({ key, phase }) => (phase === "start" ? editor.begin(key) : editor.end(key)),
})
mountPanel(station, column, {
  preset: labPreset,
  header: { title: false, buttons: ["random", "reset", "undo", "redo", "help"] },
  session: false,
  groupFolded: { fireball: true },
  rowAccessory: (key) => pinButton(key),
})
```

- **Seeded Random.** `random` is the `[0, 1)` source Random and Mutate draw from. A roll draws
  only for the keys it may change, in schema order, so the same seed and the same rows give the same
  values. `tunable(key, values)` and a field's `random: false` keep keys out as a lock does (seeds,
  structural pickers); `controls.canRoll(key)` says whether a key is in.
- **Host history.** With `history`, the panel's Undo and Redo buttons and keys call the host's
  stack, and the buttons follow its `canUndo()` and `canRedo()` (re-read when `subscribe` fires).
  knobs' own entries are then only for compare (hold `\`), which previews the last of them. The
  preview and its release reach `onSet` / `onChange` with `source: "compare"`: apply them, but
  don't record them as steps of the host's own history.
- **Gestures.** `onGesture({ key, phase })` (on `defineControls` and `createRemoteControls`) says
  when a key goes into the hand (`"start"`) and comes out (`"end"`): a press or drag on its row,
  wherever the pointer is let go; an inline edit; a run of `←`/`→` (or Page Up/Down), until the
  keys have been up for 300 ms. Every change between them is one gesture, so a host opens an undo
  entry at `start` and closes it at `end` (`examples/lab.ts` does). `controls.hold(key, on)`
  reports the same.
- **Disabled, read-only and mixed.** A field's `disabled` dims its row and `readOnly` keeps it at
  full strength; either takes no edits from the pointer or keys, and Random, Mutate and Reset skip
  it. Each takes a boolean or `(values) => boolean`, re-checked on every change, so a row follows
  the value it depends on. A function that reads state elsewhere (another store, the host's
  settings) is read again when you call `controls.refresh()`, which re-checks the flags and asks
  `rowAccessory` again without new values. Focus still reaches a gated row (to read it). Mixed keys (a
  multi-selection whose items differ) read "—" until edited: `sync(values, { mixed })`,
  `update(descriptors, values, { mixed })` or `controls.setMixed(keys, on?)`. The first edit of a
  mixed key reaches `onSet` even when the value doesn't change, so it applies to every selected item.
- **Persistence.** `persist: "all"` (the default) keeps values, locks, saved variants and a floating
  panel's position; `"variants"` keeps only saved variants, for values the host owns; `"none"`
  keeps nothing. `session: false` on the mount stops the per-tab session too, so a rebuilt panel
  doesn't take focus back to its last row or reopen editors and groups (on while there's storage).
- **Header.** `header: false` drops it; `{ title?: false, buttons?: [...] }` keeps it and picks what
  shows (`"random" | "reset" | "copy" | "undo" | "redo" | "help" | "close"`). A hidden button keeps
  its key; a command that's off (`keys`) loses both. **Without a `buttons` list, every button shows
  except `help`** (the `?` button): `?` still opens the shortcuts, and the title's tooltip says so.
  This is a change of default: before, `?` had a header button unless `buttons` left it out. List
  `"help"` to keep it (`buttons: ["random", "reset", "copy", "undo", "redo", "help", "close"]`); a
  `buttons` list that already names `"help"`, as the Lab's does, behaves as before.
  The buttons sit in fixed slots, left to right Undo · Redo, Reset, Copy, Random (then `?` and
  the close X): a list picks which show, not their order. A die (the header's, or a group's) shows
  only where Random could change something; a store or group of switches, actions and
  `random: false` fields has none, and locks only disable it. Copy falls back to the browser's copy
  command where the clipboard API isn't there (a page served over plain http). A button left out takes no slot; Undo,
  Redo and Reset keep theirs while they're away (`data-shown="false"`, `disabled`, out of the
  tab order and the accessibility tree).
- **On a surface.** An inline panel in a split's pane (or inside anything with the class
  `knobs-surface`) is one surface with it: no card, padding or background of its own, its groups
  plain sections on hairlines, its rows and preset chips keeping their inset so their text lines
  up with the pane's. Without a title, its header buttons join the pane's header (left of the
  collapse button) and it draws no header band; elsewhere an untitled header shows only while one
  of its buttons does.
- **Presets as a list.** `presetDisplay: "auto"` (the default) shows the preset strip's chips
  while they fit on two lines and a list once they'd take more (many presets, or long names):
  left-aligned rows, like a menu's, with the selection gliding between them. `"list"` and
  `"chips"` pick one.
- **Empty.** `empty: "This story has no controls"` shows that line, quietly, while the panel has
  no rows. Without it an empty panel shows nothing.
- **Height-bounded panels.** The header (title and buttons) stays pinned while the rows scroll
  under it; the preset strip, tabs and search scroll with the rows. Once rows are under it, and
  only then, it frosts and softens its foot with a short fade, scroll-driven with no script, in
  both renderers. It pins inside the nearest scroller: an inline panel is one itself
  (`overflow: auto`), so bound the panel (`height`, `max-height`, or `flex: 1; min-height: 0` in a
  flex column) and it scrolls under its header. To scroll an ancestor instead (a card that holds
  more than the panel), add the class `knobs-pin-ancestor` to the panel (`panel.element`; it makes
  the panel `overflow: visible`) and give the ancestor `overflow: auto`; the header then pins to the
  ancestor's top while the panel passes through it. A panel that nothing scrolls under looks as it
  always did. Where scroll-driven animations aren't supported, the header doesn't pin.
- **Folding groups.** A field's `folded: true` (or `groupFolded` on the mount) makes its group
  foldable, starting folded. Its header folds and opens it with a click, Enter or Space; it's a ↑↓
  stop of its own, ← folds and → opens. `panel.fold(group, folded?)` does it from code. Group
  and sub-heading folds the user chose come back on the next visit, in the store's storage (with
  `session: false` or `persist: "none"`, they don't), over `folded`, `groupFolded` and
  `subsectionFolded`. `foldStorage` on the mount keeps them somewhere else instead, folds only
  (under `knobs:<id>:folds:v1`), whatever `session` says; `null` keeps them to the tab.
  `panel.unfold(key)` opens the folded group and sub-heading a field sits in (pinned groups too)
  and shows its tab, without changing what's remembered. A group's or sub-heading's header carries
  the rows' modified dot, after its title, while a row inside differs from its base (the active
  preset or its scope's, else the defaults), so a folded card still says so. On a
  [full page](#full-page) the group's tile folds to its header, the cards below follow, and the
  filter opens it while it runs. Folded, the header sums the card up on its right, quietly and
  live: a one-row card's value ("CSS orb"), otherwise its matching group preset (or "Custom"),
  else its first changed value, else its first choice, then "· 2 changed". The title keeps its
  room; the summary truncates first. `groupSummary(group, info)` on the mount replaces it, as on a
  page (`info` is `{ preset, changed, keys }`; `null` shows nothing).
- **Card descriptions.** A group's `groupDescription` (on any of its fields; the first wins) or the
  store's `groupDescriptions` puts one muted line under its card's title, wrapping under the whole
  header. Search matches it.
- **Row descriptions.** A field's `description` (`knob(260, { description: "How fast the square
  moves" })`, or on a descriptor) is a tooltip over its row: it shows after the tooltips' usual
  pause over the row, or at once on keyboard focus, and goes with a press. Screen readers hear it
  as the control's description (`aria-describedby`), and search matches it.
- **What's active.** `onActive: (at) => …` hears which card or row the pointer or keyboard focus is
  on: `{ group }` for a card's header or body, `{ group, key }` for a row, `null` for nothing
  (pinned cards and group preset strips count). Whichever moved last wins; it's called at most once
  a frame, never twice with the same value, and once more with `null` when the panel goes. Use it
  to outline the part of your app a card changes. `mountPage` takes it too.
- **Group Random by the host.** `groupRandom: (group, mode) => …` runs first for a group's die, `g`
  and `⌥G` (`mode` is `"random"` or `"mutate"`). Return `true` when the host rolled the group (its
  own seeded "Randomize <group>"): the die tumbles and knobs leaves the values alone. Return
  anything else and knobs rolls it. With `groupRandom` set, group dice stay enabled.
- **Row accessories.** `rowAccessory(key)` puts the host's node just after each row's label (a pin,
  a spawn-time marker); slider ticks and the label make room for it. On a choice row it takes its
  room from the value, never from the label: where none is left (a label too long for the
  column) it lies over the label's end, which fades from under it while the row is hovered or
  focused. The node stays the host's (style it, listen on it, its clicks never reach the row);
  `panel.updateAccessories()` (or `controls.refresh()`, for every panel of the store) asks again.
  With the WebGPU renderer it stays in the DOM, above the overlay.
- **Long menus.** A menu of more than eight options (not numbered presets) opens with a search
  field: typing filters, ↑↓ and Enter choose, Esc closes. The row's value truncates with its whole
  text as a tooltip, and the label keeps its words.

### Tabs, sub-headings and search

A tool's inspector usually has more than fits in one column. Fields name a `tab` and a
`subsection`; the mount adds a tab strip and a search field:

```ts
const node = defineControls("node", {
  position: vec3({ x: 0, y: 0, z: 0 }, { min: -50, max: 50, group: "xform", tab: "transform" }),
  pivot: vec2({ x: 0.5, y: 0 }, { min: 0, max: 1, group: "xform", subsection: "Pivot & bounds" }),
  seed: seed(1234, { group: "emitter", tab: "emitter" }),
  drag: knob(0.2, { min: 0, max: 1, group: "emitter", subsection: "Forces" }),
})
const panel = mountPanel(node, column, {
  tabs: [{ id: "transform", label: "Transform" }, "emitter"], // order and labels
  tab: "transform",                 // first shown (else the last one shown, else the first)
  onTab: (id) => save(id),
  subsectionFolded: true,           // every sub-heading starts folded ({ Forces: true }: by name)
  foldStorage: localStorage,        // folds kept here (default: the store's storage)
  search: { placeholder: "Search", chips: ["modified"] },
})
panel.tab("emitter") // shows a tab; panel.tab() answers the one showing
panel.unfold("drag") // shows the emitter tab and opens "Forces", so the Drag row shows
```

- **Tabs.** A row shows on its field's `tab`, or else the first `tab` its group names; rows with
  none show on every tab. The strip's underline slides to the chosen tab and the rows cross: what
  leaves folds away as what arrives unfolds, a moment behind. `⌥1`–`⌥9` pick a tab, and `[` / `]`
  cycle tabs when there's no preset strip. The tab last shown is remembered for these controls (and
  in the session). The preset strip sits under the tabs and crosses a tab change with the rows; a
  tab that no preset or saved variant moves shows no strip at all (not even its `+`).
- **Pinned groups.** Groups that apply to every tab (a global speed, a slow-motion switch) sit at
  the top of the panel, under its one header and above the tab strip, and a tab change never moves
  them. Name them on the store, `pinned: ["Global"]`, or say `pinned: true` on a field (the first
  field of a group that says wins; a field without a group pins itself). A pinned field's `tab` is
  ignored. Pinned groups keep their own die and reset. Presets and saved variants leave them out:
  applying one keeps their values, saving one doesn't record them, a preset's chip doesn't drift
  when they change, and their modified marks are against their defaults. Random rolls them freely
  even under an active preset. The header's Random and Reset still cover everything, pinned
  groups included, as they cover every tab; give a field `random: false` to keep it out of
  Random. Keyboard order and search follow the panel top to bottom: pinned rows, the tabs, the
  preset strip, then the tab's rows. `controls.isPinned(key)` says whether a key is pinned.
  A pinned `variants: true` choice is an ordinary choice with a row: pinned wins, and its options
  make no presets. A tab whose rows no preset moves shows no preset strip; a variants choice moves
  its own tab (or every tab, if it has none).
- **Keys presets leave alone, in place.** `inPresets: false` on a field, or `inPresets: { Motion:
  false }` on the store for a whole group, keeps presets, scoped presets and saved variants off
  those keys exactly as they stay off pinned ones (and a preset's chip stays lit when they move),
  but the rows stay where they are. A pinned key is one of these, moved to the top. The rule, for
  `inPresets: false` and `pinned` groups alike: presets and variants from *other* scopes (the
  panel-wide presets, tab scopes, other groups') leave the group alone, but a scope keyed by the
  group's own name still moves it. So `inPresets: { Motion: false }` with
  `scopedPresets: { Motion: { Snappy } }` gives Motion its own strip that state presets never
  touch; its chips apply, save, match and mark only Motion. A field's own `inPresets: false` stays
  out of every scope. `controls.inPresets(key)` says whether presets from other scopes move a key.
- **Presets of a tab's own.** `scopedPresets` gives a tab (or a group) presets that belong to it:
  `{ Sidebars: { snappy, smooth, calm } }`. Its strip shows only on that tab, and a tab without any
  shows none. A scoped preset moves only its tab's (or group's) keys, never pinned ones or another
  tab's, so each tab is its own experiment: it has its own active preset (Reset's base and
  Random's centre for its keys), its own modified mark on the chip and its own saved variants
  (`controls.scopes.Sidebars.variants`, kept apart in storage). A preset switch is one undo step.
  A `variants: true` choice on a tab adds its options to that tab's presets. Keys belong to their
  tab's scope first, then their group's. Plain `presets` then cover only the keys no scope holds;
  leave them out and only the scoped strips show. One strip shows per tab: the tab's own, else the
  first group scope on it. In a panel, any other group's presets show at the top of its own card,
  in the strip's look without its tray, so a story's states can lead the panel while its Motion
  group keeps Shipped, Snappy and Calm beside its knobs. Every strip's default chip reads `defaultLabel`; by scope,
  `defaultLabel: { "": "Empty", Motion: "Shipped" }` names each on its own. In code, `controls.preset(id, { scope })`, `activePreset(scope)` and
  `matchingPreset(scope)` take the tab or group, and `controls.scopeOf(key)` says whose presets
  move a key (`""` for plain `presets`, the group's id for a pinned or `inPresets: false`
  group with a scope of its own, else undefined when pinned). An active preset saved while the
  presets were panel-wide comes back on the scope that now has one by that id, and variants saved
  then start out in each scope they move.

  ```ts
  const motion = defineControls(
    "motion",
    {
      speed: knob(1, { min: 0.25, max: 4, step: 0.05, unit: "×", group: "Global" }),
      slow: toggle(false, { label: "Slow motion (0.25×)", group: "Global" }),
      sidebars: spring({ duration: 0.3, bounce: 0 }, { group: "Sidebars", tab: "Sidebars" }),
      hover: spring({ duration: 0.14, bounce: 0 }, { group: "Experiments", tab: "Experiments" }),
    },
    {
      pinned: ["Global"],
      defaultLabel: "Shipped",
      // Only the Sidebars tab has a strip, and its presets set only its springs.
      scopedPresets: { Sidebars: { snappy, smooth, calm } },
    },
  )
  motion.mount(el, { title: "Knobs", tabs: ["Sidebars", "Experiments"] })
  ```
- **Sub-headings.** Fields with the same `subsection` in a group sit under a flat heading inside the
  group's card, split off by a hairline (never a card inside a card). They're gathered: a group's
  rows without a sub-heading come first, then each sub-heading's rows together, in the order the
  sub-headings first appear, wherever their fields sit in the schema. The heading is a ↑↓ stop: a
  click, Enter or Space folds it, ← folds and → opens. `subsectionFolded` starts some folded, by
  name (`{ Forces: true }`), or every one with `true`; what the user folds or opens is remembered
  as a group's folds are, and wins.
- **Search.** `search: true` (or `{ placeholder, chips }`) puts a field under the header. Typing
  filters rows by label, key, group or sub-heading across every tab, opening folded groups and
  sub-headings while it runs; matches show in the accent colour. Chips narrow it further:
  `"modified"` keeps rows off their defaults and counts them, and a chip of your own is
  `{ id, label, count?, test(key, controls) }`. `/` focuses the field. `panel.search(query?, chips?)`
  searches from code, as typing and clicking would (`chips` lists exactly which are on), and
  returns `{ query, chips }`; `panel.search()` only reads it.

### Shipping

Stores are dev tools by default: a production build (the package's default export condition)
locks them to their defaults, mounts nothing and leaves the panel out of the bundle. `ship` makes a
store product UI:

```ts
createRemoteControls("parameters", descriptors, { ship: () => import("knobs/panel") })
defineControls("settings", schema, { ship: () => import("knobs/panel") })
```

A shipped store stays live in production (`enabled` defaults to true) and mounts from the module you
name, which your bundler splits into its own chunk. The core never imports the panel itself.
Stores without `ship` are unchanged. To tune dev-only stores on a deployed page without shipping
them to visitors, see [`unlock`](#show-hide-and-unlock).

In production its chips stay hidden until someone presses **⌥⇧D**, which turns knobs mode on and off
for the tab (remembered in `sessionStorage`, with a brief "knobs on" / "knobs off"); then they show on
hover as in development. The key works anywhere on the page except while typing in a field. `chip`
sets when chips show, the key and a label beside the cog, per store or per `attach`:

```ts
defineControls("hero", schema, {
  ship: () => import("knobs/panel"),
  // reveal: "hover" (dev default) | "shortcut" (production default) | "always"
  chip: { reveal: "shortcut", shortcut: "Alt+Shift+K", label: "knobs" },
})
hero.attach(element, { reveal: "always" })
```

### Styling and tokens

Theme with `--k-*` tokens on the panel or any ancestor, or ship a set as a preset:
`mountPanel(c, el, { preset })` with a `TokenPreset` (`{ name, dark, light?, css? }`), or
`presetCss(preset)` in your own stylesheet with `data-preset` on the panel. `problemsPreset` (from
`knobs/themes`) is the Problems viewer's parameter column. Every token it sets works on its own:

| Token | Default | What it does |
| --- | --- | --- |
| `--k-row-gap` | `0px` | Above 0, each row is its own bar, this far apart; a spring stacks its curve over its sliders |
| `--k-hover-in` / `--k-hover-out` | `0` / `120` | Hover washes in and out (ms): at once under the pointer, fading as it leaves |
| `--k-chrome` | `1` | `0` drops an inline panel's card: background, border and rim |
| `--k-fill-base`, `--k-fill-rest-mix`, `--k-fill-hover-mix`, `--k-fill-active-mix` | surface-hi, 20%, rest, 30% | The fill: accent mixed into the base at rest, hovered and dragged |
| `--k-handle`, `--k-handle-rest`, `--k-handle-inset` | accent, `0`, `0px` | The handle's colour, its opacity at rest, and how far inside the fill's edge it sits; it fades where it passes under the label or readout |
| `--k-step-resist` | `0.25` | How far a stepped slider's fill follows the pointer off its stop while dragged: `0` snaps, `1` follows freely |
| `--k-motion-blur` | `0` | Up to `1`: moving fill edges and selection pills smear by their speed |
| `--k-range-blur` | `.5` | Up to `1`: a range band's gliding ends each smear by their own speed (`0` is off) |
| `--k-curve-blur` | `.5` | Up to `1`: a curve's, easing's or gradient's line, points and stops smear by their speed while they morph between presets (`0` is off) |
| `--k-value-font`, `--k-unit-gap`, `--k-unit-color` | font, `.28em`, dim | The readout's face, and the unit's spacing and colour (`currentColor` matches the value) |
| `--k-readout-mark` | `0` | `1`: a modified value takes `--k-modified` behind a small dot |
| `--k-group-transform`, `--k-group-size`, `--k-group-color`, `--k-group-tracking`, `--k-group-inset` | uppercase, text-cap, dim, `.04em`, inset | Group headings |
| `--k-group-divider`, `--k-group-divider-gap` | transparent, `0px` | A hairline above every group but the first, and the room under it |
| `--k-curve-inset`, `--k-curve-guide`, `--k-curve-dot` | `6px`, `solid`, `1` | The spring curve's side inset; `dashed` draws one dashed line at rest instead of two; `0` hides the running dot |

Stable class hooks: `.knobs-panel` (with `data-preset`, `data-theme`, `data-density`,
`data-rows`, `data-landing`, `data-frame`), `.knobs-card`, `.knobs-group-head`, `.knobs-row`
and `[data-field="<key>"]` on every row (sliders, springs and editors too), `.knobs-slider`,
`.knobs-spring`, `.knobs-seg`, `.knobs-select`, `.knobs-action`, `.knobs-modified`,
`.knobs-mixed`, `[data-disabled]` and `[data-readonly]`. Both renderers draw every token above.

### Matching your app

A panel inside an app should look like the app's own controls. Four things get it there.

**Tokens.** Beside colours and sizes, these carry a host's type and shapes:

| Token | Default | What it does |
| --- | --- | --- |
| `--k-font`, `--k-mono`, `--k-font-size` | system, mono, `12px` by density | Faces and size; `--k-value-font: var(--k-mono)` puts readouts in mono |
| `--k-font-weight`, `--k-label-weight`, `--k-title-weight` | `400`, `500`, `600` | Body, row labels, and titles, group headings and the chosen chip |
| `--k-radius`, `--k-panel-radius` | `8px` by density, radius + `4px` | Corners. `0` squares everything, the pill shapes (switches, handles, dots) included |
| `--k-radius-frame` | radius + padding + border | A panel's own outer corners, concentric with the cards, preset strip and lens inside it |
| `--k-thumb` | `#fff` | Switch thumbs and strip handles |
| `--k-lift` | `1` | `0` drops the small shadows under pills, thumbs and handles |
| `--k-shadow-strength` | `.48` (light: `.16`) | How dark the WebGPU renderer draws the panel's drop shadow. Set it beside `--k-shadow` when you change that, so both renderers match (a host blending a dark look into a light one moves both together) |
| `--k-frame` | `card` | `flat`: no card inside the host's own card (see below) |
| `--k-disabled-opacity` | `.32` | How far a disabled row dims |
| `--k-warn`, `--k-critical` | unset; knobs/ui falls back to `#ff9f0a`, `#ff453a` (light: `#c56a00`, `#e0352b`) | Readouts' warning and critical colours (meters past `warn` / `critical`, log levels), and a destructive confirm. Only knobs/ui pieces read them |
| `--k-control-h` | row − 2 × unit | Height of the controls inside a row: segments, menus, switches, number cells, key caps, toolbar buttons |
| `--k-value-size` | font size − `.5px` | Size of every readout (sliders, cells, ranges, dials, seeds, editor summaries) |
| `--k-button-bg`, `--k-button-line`, `--k-button-hover-bg`, `--k-button-hover-line` | each button's own | Fill and outline of custom actions, Export/Import, toolbar buttons, action rows and preset chips, at rest and hovered. With a fill or outline set, an action row is a sized button in its row and the presets strip a row of buttons (`data-buttons` on the panel) |
| `--k-button-h`, `--k-button-font-size`, `--k-button-radius` | each button's own | Their height, label size and corners |
| `--k-button-color` | each button's own | Their label colour at rest (toolbar labels at full strength, say); hovered they take `--k-text` |

**Frame.** `--k-frame: flat` is for a panel set into the host's own column or card. Group cards
lose their surface and corners, rows are split by hairlines, and groups by `--k-group-divider` over
their heading. An inline flat panel also drops its own card (`--k-chrome: 0`), its border and its
padding, so nothing draws a box inside the host's box and its rows meet the column's edges exactly,
in both renderers. `examples/rows.html` shows a column in knobs' look, the Lab's and the Lab's with
button tokens, by the DOM and the GPU. The panel reports it as `data-frame="flat"`.

**Presets.** `labPreset` (from `knobs/themes`) is the Arcade Lab's column: its greys and blue
accent, 11.5px type at 26px rows, square corners, the flat frame, mono readouts, and no glass, glow
or lift. Start from it, or spread it and change a few tokens:

```ts
import { labPreset } from "knobs/themes"
mountPanel(controls, column, { preset: { ...labPreset, dark: { ...labPreset.dark, accent: "#e0a030" } } })
```

**Reset.** A host's element rules (`button { padding }`, `span { letter-spacing }`,
`*:focus { outline }`) don't reach panels or their menus. A scoped reset sits above element rules
and below every knobs rule, so there's nothing to undo in your stylesheet, and focus never draws an
outline. Your `rowAccessory` nodes are exempt and keep your styles. `examples/host.html` mounts
panels under a deliberately hostile stylesheet; the browser suite checks that nothing moves when it
turns off.

## Full page

When there are more controls than a panel holds (a tuning page with a dozen groups), `mountPage` lays them out as a page: a sticky glass header with the title, the presets strip and the same **Undo · Redo · Reset · Copy · Random** tools, then **sections** of cards: every group is a card, and each section is a column of them under its heading. As many columns fit as `columnWidth` allows. A long section takes two or more adjacent columns (its cards read down one and on to the next, and the extra columns line up under its heading); when the sections outnumber the columns, short ones stack, in order, with their headings. The split keeps the tallest column as short as it can be. Columns are independent stacks: a card that changes height moves only the cards below it in its own column, never another column.

Everything moves rather than jumps. A card whose content changes (an editor opening, rows the filter hides, rows added or removed, a custom card swapping its content) eases to its new height and the cards below it glide. The columns re-balance only when the window gains or loses a column (after a brief pause while it's being resized), when cards come or go, when a section folds or opens, and when the filter changes, and then every card glides from where it was to its new place, interruptibly. With reduced motion, layout changes snap.

```ts
import { createRemoteControls } from "knobs"
import { mountPage } from "knobs/panel"

const tune = createRemoteControls("iphone-tune", descriptors, {
  values: phone.values,
  // Numbered presets per group: 1, 2, 3… in the card's header. Keys a preset leaves out are at
  // their defaults, so { name: "Today", values: {} } is the shipped look.
  groupPresets: {
    Rhythm: [
      { name: "Today", values: {} },
      { name: "Compact", values: { "transcript.row.flowHalf": 6, "transcript.row.turnHalf": 9 } },
    ],
  },
  onSet: (key, value) => send({ type: "set", key, value }),
  // The peer applies its own preset (and sends back its state) instead of getting a set per key.
  onPreset: ({ group, index }) => send({ type: "preset", key: presetSetKey[group], index }),
})

const page = mountPage(tune, document.querySelector("#app")!, {
  title: "iPhone Tune",
  sections: ["Playground", "Session List", "Transcript"], // order; others follow as they appear
  columnWidth: 300, // the narrowest a column gets (px)
  copy: () => tune.swift(), // what Copy and ⇧C put on the clipboard
})
```

Fields and descriptors take a `section` beside their `group` (`knob(44, { min: 28, max: 72, group: "Spacing", section: "Session List" })`); panels ignore it. `defineControls` takes `groupPresets` and `onPreset` too, and every store has `groupPresets`, `groupPreset(group, index, { coalesce? })` (one undo step, `source: "preset"` with its `group`) and `matchingGroupPreset(group)`.

**Card presets by name.** A card's presets sit in its header by name ("Native · Tight · Airy") as segments, with the same gliding pill as the preset strip (pans drag it, one undo step per gesture). When the names don't fit beside the title, they become a compact menu showing the selected name (a quiet "Custom" when nothing matches), its items numbered. The title wins the room: the presets give way first. `1`–`9` apply the focused card's presets either way, and hint mode (`s`) offers the focused card's presets as "1 Native", "2 Tight"…. `groupPresetDisplay` chooses (on the store, remote options or `mountPage`): `"auto"` (names while they fit, else the menu; the default), `"names"`, `"menu"`, or `"numbers"` for the compact 1, 2, 3 chips, where hovering a number shows its preset's name in place of the title and applying one by key shows it briefly.

**Card titles.** A card's title drops its section's name when it repeats it ahead of a separator (· • : / | › » or a dash): "Transcript · Arrivals" under the Transcript section reads "Arrivals". A `groupLabels` entry (or `groupLabel`) is used verbatim instead; custom cards' titles are shortened the same way. Card headers are compact: as tall as their 20 px controls, a gap and a half above the rows (`--k-head-gap`), tighter still in the compact density.

**Custom cards** sit in the same grid, in the same material, for anything that isn't a field: a playground switcher, a list of motion jumps, a video player. Small primitives come with them, each built from the panel's own rows; `set` shows a value that arrived from elsewhere without calling `onChange`:

```ts
const playground = page.card({ title: "Playground & Slow Motion", section: "Playground" })
const screen = playground.choice({
  options: [{ value: "transcript", label: "Transcript" }, { value: "composer", label: "Composer" }],
  value: "transcript",
  onChange: (v) => send({ type: "playground", playground: v }),
}) // no label: the segments span the card
const speed = playground.choice({
  label: "Speed",
  options: ["0.1", "0.25", "0.5", "1", "2"].map((v) => ({ value: v, label: `${v}×` })),
  value: "1",
  onChange: (v) => send({ type: "slowmo", scale: Number(v) }),
})
playground.actions([{ label: "Live arrival", run: () => replay("liveArrival") }])
playground.toggle({ label: "Reduce motion", value: false, onChange: (on) => setReduceMotion(on) })

const watch = page.card({ title: "Motion Watch", section: "Playground" })
watch.item({ label: "Layout jump · toolRow", detail: "14.2 pt · f212", onSelect: () => inspect(jump) })
watch.body.append(myPlayerElement) // or pass `element`; `clear()` empties it, `remove()` drops the card
speed.set("0.25") // the phone changed it
```

**Collapsible cards.** Pass `collapsed` (`true` folded, `false` open) and a card's header toggles it, by a click or `Enter` where it's focused (`j` / `k` reach the header): the body fades as the card's height springs down to its header and the cards below in its column glide, interruptibly; other columns stay put. While folded the header shows `summary` on its right. `card.collapse(bool)` folds or opens it from code, `card.collapsed` says which, and `card.summary(text)` updates the line. `description` puts one muted line under the title. What the user last chose comes back after a reload in the same tab (sessionStorage, with the panel's other per-tab state), over `collapsed`.

```ts
const connection = page.card({ title: "Connection", section: "Connection", collapsed: false, summary: "Waiting for iPhone…" })
connection.body.append(qrCode)
// Once the phone has paired and signed in:
connection.summary(`iPhone · ${phone.version} · connected`)
connection.collapse(true)
```

Content that changes over time animates if you update it in place. `card.list()` keeps rows by key: `set` updates the rows that stay, folds new ones open and removed ones shut (rows replaced by others cross-fade while the card eases to its new height). `actions(...).set` swaps buttons the same way, keyed by label, and the row folds away while it's empty. `card.show(element, visible)` folds anything in the card open or shut.

```ts
const jumps = watch.list()
jumps.set(phone.jumps.map((j) => ({ key: j.id, label: j.title, detail: j.detail, onSelect: () => replay(j.id) })))
const scenarios = playground.actions([])
scenarios.set(screen === "composer" ? [{ label: "Call", run: call }, { label: "Dictation", run: dictate }] : [])
```

**What's on screen.** `page.highlight({ groups?, sections? })` marks what's showing elsewhere, such as the phone's current screen. Highlighted cards and sections keep full strength. A section highlighted as a whole gets a small dot by its heading, and a card highlighted on its own gets one by its title. Everything else dims a little under a veil of the page's colour (`--k-page-dim`, 0.4). Dimmed cards stay readable and fully interactive, and one you focus comes back up while you work in it. Changes glide on the panel spring (`--k-spring`) and can be interrupted midway. `null` clears it. `groups` takes group ids or custom card titles, and `sections` takes section ids. With `{ reveal: true }`, the first highlighted card (or its section's heading) glides into view when it's off screen. It won't do that while you're dragging, or if you scrolled, pressed a key or touched the page in the last two seconds. `Tab` from the header lands on the first highlighted card. Both renderers draw the veil and the dot the same way.

```ts
// The tune server's Context { id, groups, label? }: the phone's groups are the page's sections.
page.highlight({ sections: phone.context.groups.map((g) => SECTIONS[g] ?? title(g)) }, { reveal: true, expand: true })
```

With `{ expand: true }`, the highlight also opens the folded sections and cards it names. What it opened folds again once a later highlight (any, `null` included) moves away from it, unless you worked in it meanwhile (a click or a key inside, or folding it yourself makes it yours). Opening and refolding this way isn't remembered.

#### Folding sections, summaries and the jump strip

A page with many sections reads better folded. `sectionFolded` starts sections folded to their headings: `true` for all of them, or by section id (`{ Transcript: true }`). It's taken from the mount, then the store or remote options, then a field's `sectionFolded: true` (the first field of a section that says wins). A section that says either way can fold, and its heading toggles it by a click, or `Enter` / `Space` where it's focused. Its cards fold away where they are and the columns re-balance with a folded section counted as its heading alone; everything glides and can be interrupted. `page.foldSection(section, folded?, { remember?, reveal? })` and `page.fold(group, folded?, { remember?, reveal? })` do it from code (they toggle without `folded`), and `page.sectionFolded(section)` says which. While the filter (`/`) runs, it opens the folded sections and cards it matches without touching their folds; when it clears, everything is back as it was folded.

Folded things say what's in them. A folded group card trades its presets, reset and die for "Compact · 7 changed" (the matching group preset, or "Custom", then its changed rows; each part only when it applies). A folded section's heading reads "2 changed · 3 cards". `groupSummary(group, info)` and `sectionSummary(section, info)` on the mount replace either (`info` is a `FoldSummaryInfo`: `{ preset, changed, keys }`; return `null` for nothing). Group cards fold as in a panel, by a field's or descriptor's `folded`, or `groupFolded` on the mount, `defineControls` or `createRemoteControls` (both take `sectionFolded` too).

Descriptions add one muted line under a title: `groupDescriptions` and `sectionDescriptions` by id (on the store, remote options or the mount), or `groupDescription` / `sectionDescription` on any field or descriptor (the first that gives one wins). `page.card({ description })` does the same for a custom card. The filter matches descriptions too. Group descriptions show in panels as well, wrapping under the card's header.

What the user folds and opens (sections and group cards) is remembered under `knobs:<id>:folds:v1` (`storageKey(id, "folds")`) as `{ sections: Record<string, boolean>, groups: Record<string, boolean> }`, and wins over `sectionFolded` and `groupFolded`. Only the user's folds and those made with `remember` are written; folds for context (`remember: false`, a highlight's `expand`) and the filter's never are. By default they go to the store's own storage, or nowhere with `persist: "none"`. `foldStorage` on the mount always wins and keeps folds only, never values, locks or variants, so a remote store on `storage: null` (the phone's values always win) can still remember them; `null` keeps none.

```ts
const tune = createRemoteControls("iphone-tune", descriptors, { storage: null, /* … */ })
mountPage(tune, app, { foldStorage: localStorage })
```

Code chooses what counts as the user's:

| Call | Remembered |
| --- | --- |
| `page.fold(group, folded?)`, `page.foldSection(section, folded?)` | Yes: they act for the user (a button of yours). Pass `{ remember: false }` for context. |
| `page.reveal({ section } \| { group })` | No: it's for context (what's on the phone's screen). It opens the section (and the group's card), glides it under the header, and `activeSection()` reports it until the user scrolls. Pass `{ remember: true }` for a jump the user asked for, such as a click in your own navigation. |
| `page.highlight(target, { expand: true })` | No, and it folds again once the context moves on (see above). |
| A click or key on a heading or card header, a jump-strip chip, `⌥↑` / `⌥↓` | Yes. |

`{ reveal: true }` on `fold` and `foldSection` glides the card or heading into view as well.

**Your own navigation.** A sidebar of your own reads the page instead of drawing a strip in its header:

```ts
page.sections()
// [{ id: "Transcript", label: "Transcript", description?: "…", folded: true, changed: 8,
//    groups: [{ id: "transcript.arrivals", label: "Arrivals", folded: false, changed: 1, preset: "Custom" }, …] }, …]
const stop = page.onSections((sections) => renderSidebar(sections)) // now, then after each change
page.onActiveSection((id) => markActive(id)) // as the page scrolls
page.activeSection() // "Transcript"
sidebarLink.onclick = () => page.reveal({ section: "Transcript" }, { remember: true })
```

`sections()` lists the sections showing, in reading order (a running filter leaves out those with nothing matching), each with its group cards; custom cards aren't listed. `folded` is the section's or card's own state, which the filter's opening doesn't change. `changed` counts rows that differ from their defaults, and `preset` is the matching group preset's name, "Custom" when none matches, or `null` without presets. `onSections` calls its listener once with the current list, then after anything it reports changes (a fold, a value, a label), at most once per microtask, and returns an unsubscribe. Its second argument says what a fold came from: `"user"` (a click or key on a heading or header), `"code"` (`fold`, `foldSection`, `reveal`, a highlight's `expand`), `"search"` (the filter showing its matches; `folded` keeps the saved state) or `"restore"` (the filter cleared); it's `null` for the first call and for changes that aren't folds. `activeSection()` is the section filling most of the window below the header (after a `reveal` or a jump, that section until the user scrolls); `onActiveSection` calls its listener when it changes.

`nav: true` adds a strip of section chips to the sticky header. The chip for the section that fills most of the screen is underlined as you scroll, and each chip counts its section's changed rows. A chip glides the page to its section and opens it if it's folded (that's remembered); `⌥↑` / `⌥↓` do the same for the section before or after. Hint mode reaches the chips and the folding headings.

```ts
const page = mountPage(tune, app, {
  sectionFolded: { "Session List": true, Transcript: true, Composer: true },
  foldStorage: localStorage, // folds outlive the tab
  nav: true,
  sectionDescriptions: { Playground: "What the phone shows, how fast it moves" },
  groupSummary: (group, { preset, changed }) => (changed ? `${changed} changed` : preset),
})
page.foldSection("Composer", false)
page.highlight({ sections: ["Transcript"] }, { expand: true }) // opens Transcript until the phone moves on
```

On a page, the keyboard spans every card:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Every row and custom control, down each column and on to the next |
| `Tab` / `⇧Tab` | Next / previous group (the whole card glides into view where it fits); from the header, the first highlighted card |
| `⌥↑` / `⌥↓` | Glide to the previous / next section, opening it if it's folded; focus goes with it |
| `1`–`9` | On a row with options (a choice, a curve's, easing's or gradient's presets), pick its Nth; elsewhere apply the focused group's preset, by its number (in groups without them, digits still edit numbers; `Enter` always does) |
| `Enter` / `Space` on a section heading or a foldable card's header | Fold or open it (on a section heading or group card, `←` folds and `→` opens too) |
| `/` | Filter rows by label, group or section, live; rows fold shut, cards with nothing left fold away and the rest glide into re-balanced columns; `Esc` clears |
| `s` | Hints for what's on screen, custom cards included |

Focus that lands off screen (or under the header) glides into view, retargeting from where the last glide was headed so held keys don't fall behind. The rest (`[` `]`, `r` and `⇧R` scoped to focus, `g`, `Esc` climbing from row to card to page, focusing a card by its empty area or heading, `L`, selection, the row menu, hold `\`) works as in a panel.

Both renderers draw the page. With `?gpu`, the overlay draws the header's contents, section headings, cards and rows, clipped to below the sticky header, and follows every frame of a glide or fold; the page's background, the header's glass (a real `backdrop-filter`) and custom cards stay in the DOM under the transparent canvas, so they look the same in both. Scrolling and layout motion wake the overlay and it sleeps once the page is still. The demo is `examples/tune.html`: the OpenCode iOS tune page on a simulated iPhone that speaks the tune server's protocol.

## Workspaces (`knobs/ui`)

`knobs/ui` has the pieces a tool's workspace is built from: resizable split panes and docks, and an outliner tree. They are plain DOM and framework-neutral, use the same tokens as panels (`--k-*`, and a `theme` and `appearance`, as panels take), and work on their own or next to panels. A panel can mount inside a pane.

```ts
import { themes } from "knobs/themes"
import { applyMove, split, tree } from "knobs/ui"
import { mountPanel } from "knobs/panel"

const look = { theme: themes.void, appearance: "dark" as const }
const main = split(workspace, {
  ...look,
  id: "workspace", // saves sizes and collapsed panes
  panes: [
    { id: "outliner", size: 240, min: 180, max: 460, collapsible: true, rail: "Scene" },
    { id: "view", min: 360 },
    { id: "inspector", size: 300, min: 248, collapsible: true, title: "Inspector" },
  ],
})
// Splits nest: a viewport over a dock that folds to its header.
const center = split(main.pane("view").body, {
  ...look,
  id: "center",
  direction: "column",
  panes: [{ id: "stage" }, { id: "dock", size: 300, collapsible: true, title: "Dock" }],
})
mountPanel(controls, main.pane("inspector").body)

let scene = [{ id: "lights", label: "Lights", children: [{ id: "sun", label: "Sun" }] }]
const outline = tree(main.pane("outliner").body, {
  ...look,
  items: scene,
  label: "Scene",
  onSelect: (ids) => pick(ids),
  onMove: (move) => outline.update((scene = applyMove(scene, move))),
  onRename: (id, label) => rename(id, label),
})
```

**`split(container, options)`** lays panes along a `"row"` (default) or a `"column"`, divided by hairlines with a wider grip (`--k-ui-hit`, 9px). Panes with a `size` keep it in pixels; the rest share what's left. Dragging a divider resizes, and each pane slows softly into its `min` and `max` rather than stopping dead. Drag a collapsible pane 40px past its min and it collapses. Double-click a divider to reset it. A focused divider takes `←`/`→` (or `↑`/`↓`; `⇧` for bigger steps), `Home`/`End`, and `Enter` or `Space` to collapse. Collapsing springs the pane down to a slim rail (`--k-ui-rail`), or in a column to its header. The card folds as one shape: the content keeps its open size and slides out by the divider, with no reflow, fading early, and a click on the rail opens it again. A collapse can be turned back halfway. `fold` sets how: `chevron: "flip"` (default) closes the collapse chevron to a flat line and opens it the other way in about 0.2 s, or `"turn"` spins it with the fold; `title: "travel"` (default) turns the header's title and slides it into the rail's label, or `"fade"` crossfades them; `duration` is the fold's spring in seconds (0.3, no bounce). With an `id`, the layout is saved (localStorage unless you pass `storage`; `null` saves nothing) and restored before the first paint. Panes take `title`, `count`, `actions` (icon buttons in the header), `rail` (the rail's label), `scroll` and `element` (content to move into the body). The handle has `pane(id)` (`body`, `header`, `size`, `collapsed`, `collapse()`, `resize()`, `title()`), `layout()`, `collapse(id, collapsed?)`, `resize(id, px)`, `reset(id?)` and `dispose()`.

Every change of layout, drag frames and springs included, calls `onLayout(layout)`, fires `knobs-pane-resize` on each pane element and fires `knobs-layout` on the document. The WebGPU renderer listens for `knobs-layout`, so panels in panes stay drawn in place through a drag or a collapse. A panel that a collapse clips away entirely isn't drawn at all. Panes don't create stacking contexts, so a panel's search and editors still sit above the overlay.

Scrolling pane bodies, trees and the command palette's list fade their content out over 20px at an edge with more beyond it, coming in over the first 24px of scroll so an end never pops. Put the class `knobs-scroll-fade` on a scroller of your own for the same thing, or `knobs-scroll-fade-x` on a single line (`overflow: hidden; white-space: nowrap`) to fade it at its end instead of an ellipsis, as a tree's labels do. `--knobs-fade` sets the fade, `--knobs-fade-travel` the scroll it comes in over, and `--knobs-fade-inset` starts the top one below a sticky header. The fades are CSS scroll-driven animations, so no script runs; where those aren't supported there's no fade (a cut-off line takes an ellipsis). Around a panel the WebGPU renderer draws, the mask is left off.

**`tree(container, options)`** is an outliner. Rows are virtualised, so 10,000 of them scroll at full speed with about 35 in the DOM. When a branch opens, its children slide out from under it as one block with the rows below, like a drawer, and closing folds them back. The tree takes items with `id`, `label` and `children` (or `getId`, `getLabel` and `getChildren` for your own shape; an array, even empty, makes a parent that takes drops). Options:

- `icon` and `detail` for a glyph and dimmed text (or nodes of your own), or `render` for your own row content
- `glide: true` to show the selected row as the selection pill (`selectionPill`): one highlight that slides to the next row picked on the state spring (.3 s, no bounce), the row's text bright under it, instead of each row lighting in place; several selected rows light in place
- `toggles` for row accessories such as `visible` and `locked`, which show at rest only in their unusual state
- `filter` for a query or a test; matching rows show with their ancestors, the match marked
- `selection`, `expanded` and `rowHeight` (`--k-row` by default)
- `typeahead`: letters jump to a matching label (on by default). `false` leaves every letter to the page, and `(key) => boolean` decides which ones start a jump, so a host's single-key shortcuts (`F` to frame, `G` for the grid) reach the window while the outliner has focus; letters typed right after a jump carry on its run

| Key | Action |
| --- | --- |
| `↑` / `↓`, `Home` / `End` | Move; type letters to jump to a label (see `typeahead`) |
| `←` / `→` | Close or go up / open or go down (swapped when the tree is `dir="rtl"`) |
| `⇧` click or `⇧↑↓`, `⌘` click, `⌘A` | Extend, toggle, select all |
| `Space` | Select the active row (`⌘Space` toggles it) |
| `Enter` / `F2` | Rename in place (with `onRename`); otherwise `Enter` calls `onActivate` |
| `⌥↑` / `⌥↓` | Move the selection past its neighbour |

Dragging rows shows a line where they'll land, or a wash on the row they'll go into, and scrolls near the edges. Drags and `⌥↑↓` report `onMove({ ids, parent, index })`, where `index` is counted after the moved rows are taken out. Apply the move to your items (`applyMove(items, move)` does it for plain `{ id, children }` items, or `applyMove(items, access, move)` for your own shape) and call `update(items)`. Rows that stay glide to their new places. `canDrop(move)` can refuse a drop. The handle also has `select`, `expand`, `filter`, `reveal`, `focus`, `rename`, `rows()` and `refresh()`.

**Two frames.** By default the pieces wear knobs' own look, in dark and light: every leaf pane is a rounded card on the page (`--k-panel-radius`, the panel's surface and hairline rim) half a gap inside its slot, so panes sit `--k-ui-gap` (6px) apart with a small capsule grip in each gap that shows on hover and lengthens in the accent while dragged; the outliner's rows are inset washes with concentric corners; overlays are glass at the panel's radius. A preset or host with `--k-frame: flat` (`labPreset`) puts panes edge to edge on hairlines instead, square, as a dense editor's columns. A pane that holds another split is only its slot, so cards never nest. `--k-ui-gap`, `--k-ui-pane` (a card's fill), `--k-ui-row-x` (the rows' inset) and `--k-ui-divider` tune either frame.

**`restyle(target, { preset?, theme?, density? })`** changes the look of what's already on screen: every piece and panel inside `target` (the document by default) takes the preset (none for knobs' own), theme and, for panels, density. Panels' tokens glide to the new values, splits and trees measure again, readouts redraw in the new colours, and on a document, overlays opened afterwards take it too. The Lab's top bar switches between knobs' look and the Lab's this way (`?look=lab` opens on the Lab's, `?theme=light` on knobs' light).

The active row and the selection show as soft washes in the accent, with no outlines. You can tune them with `--k-ui-select`, `--k-ui-select-focus`, `--k-ui-wash`, `--k-ui-wash-hi`, `--k-ui-indent` (14px) and `--k-ui-divider` (the hairline's colour, `--k-line` by default). The model behind both pieces is exported too (`solveSplit`, `dragDivider`, `softClamp`, `parseLayout`, `flatten`, `navigate`, `select`, `typeahead`, `dropTarget`, `validMove`, `stepMove`, `virtualWindow`), for hosts that draw their own.

React and Solid wrappers come from `knobs/ui/react` and `knobs/ui/solid`:

```tsx
import { Split, Tree } from "knobs/ui/react" // or "knobs/ui/solid"

<Split id="workspace" panes={panes} onReady={(split) => (handle = split)}>
  <Tree items={items} onSelect={(ids) => setPicked(ids)} onMove={(m) => setItems(applyMove(items, m))} />
  <Viewport />
</Split>
```

`Split` puts each child in its pane, in order; the React one portals them, so context and state carry through. `Tree` updates in place when `items`, `selection` or `filter` change, and always calls the latest callbacks. Each wrapper hands its props to the piece in one effect: whichever changed go together, the items or options before the selection, so neither a prop that changes in the same update that mounts the wrapper nor the order Solid runs effects in can lose one. The Lab demo (`examples/lab.html`, `?rows=10000` for a big scene) is a full workspace: an outliner, a viewport over a dock with a Live tab of readouts fed by a fake viewport (`?paused` stops the feed, `?sparks=20` adds sparklines), the inspector column, a `⌘K` palette, tooltips, and a confirm before deleting from the outliner.

### Overlays: popovers, tooltips, the command palette, confirms and toasts

`knobs/ui` also has the floating layers a workspace needs. They sit in one fixed layer above the page and the GPU overlay, come in on a spring (scale and blur from where they open, interruptible both ways; opacity only under reduced motion), and use the same tokens. `overlayLook({ theme, appearance })` sets the look they all take; each also takes its own `look`.

```ts
import { commandPalette, commandsFrom, confirm, overlayLook, popover, toast, tooltip, tooltips } from "knobs/ui"

overlayLook({ theme: themes.void, appearance: "dark" })

const menu = popover(button, list, { placement: "bottom-end", role: "menu", label: "Games" })
tooltip(pause, { text: "Pause the live feed", shortcut: "Alt+P" })
tooltips(document) // and any element with data-tip="…" (data-tip-shortcut, data-tip-placement)

commandPalette({
  commands: () => [
    { label: "Pause live feed", section: "Live", shortcut: "Alt+P", run: () => feed.pause() },
    ...commandsFrom(controls, { title: "Weather", reveal: (key) => focusRow(key) }),
  ],
})

if (await confirm({ title: "Delete “Barrier”?", confirm: "Delete", destructive: true })) remove()
toast("Deleted Barrier", { action: { label: "Undo", run: undo } })
```

- **`popover(anchor, content, options?)`** places `content` beside an element, a rect or a point. `placement` is `top`, `bottom`, `left` or `right`, each with `-start` or `-end`; it flips when its side is short and the other has more room, then shifts to stay 8px inside the view, and follows its anchor through scrolls and resizes. It grows from the anchor's edge. It takes focus (`focus: "first" | "layer" | "none"`) and gives it back when it closes; Esc, a click outside or focus leaving closes it (`closeOnOutside: false` keeps it), and `trap: true` keeps Tab inside. The handle has `element`, `open`, `reposition()` and `close()` (a promise that resolves once it's gone).
- **`tooltip(el, content, options?)`** shows after a 500ms pause over the element, or on keyboard focus (not a click's). While one is up, or just after, moving to a neighbour shows its tip at once, with no entrance. A press hides it until the pointer leaves; Esc hides it. `shortcut` shows as key chips (`⌘K` on Apple platforms, `Ctrl+K` elsewhere) and sets `aria-keyshortcuts`; the target gets `aria-describedby` while it shows. Content can be a function, read each time it shows. Split panes use these for their buttons and rails.
- **`commandPalette({ commands, onRun?, hotkey?, recents?, placeholder?, presence? })`** opens on `⌘K` (`hotkey`, `"Mod+K"` by default; `false` for none). A key summons it, so it fades in and out in about 80ms (`presence: "fade"`); `presence: "none"` (or `false`) shows and hides it at once, and `{ duration?, scale?, blur?, dy? }` gives it the full entrance (from .96, 8px blur and 8px above, over .34s), with any of those changed. With no query it shows recent commands (remembered in localStorage under `recents`; `false` for none), then each `section`. Typing ranks commands by a fuzzy match: letters in order, best at the start, at word starts and in runs. The matched letters light up in the accent while the rest of the label dims, and letters strewn thinly across words don't count. A command answers to its `keywords` and section too. `↑`/`↓` move a highlight that glides (`PgUp`/`PgDn`, `⌘↑`/`⌘↓`), disabled commands are passed over, `Enter` runs, `Esc` or a click outside closes. A `run` that returns a string (or a promise of one) shows it as a toast; a throw shows as an error toast. The handle has `open(query?)`, `close()`, `toggle()`, `isOpen` and `dispose()`.
- **`commandsFrom(controls, { title?, fields?, reveal? })`** lists a store as commands: its actions and toolbar buttons (with their shortcuts), presets and group presets (the current one marked), toggles ("Turn on …"), one command per choice option, "Reset …" for modified fields, and, with `reveal(key)`, every other field (its current value as the hint) to go to.
- **`confirm({ title, body?, confirm?, cancel?, destructive? })`** returns `Promise<boolean>`. It's modal over a scrim, keeps Tab inside, and Esc or a click outside cancels. `destructive` puts the button in `--k-critical` and focus on Cancel; otherwise focus starts on the confirming button.
- **`toast(message, { tone?, linger?, action?, within? })`** shows a pill at the bottom centre for 3.2s (6s for `tone: "error"`). A new message replaces the one showing, and hovering keeps it. Pages show their status (Copied, errors) this way.
- **`menu(anchor, items, options?)`** opens a menu beside a button, a rect or a point. Items take `label`, `icon`, `shortcut` (chips only; it binds nothing), `hint`, `disabled`, `checked` (with `radio`, a dot), `destructive` (in `--k-critical`) and `items` for a submenu (or a function read when it opens); `"-"` is a separator and `null` or `false` leaves an item out. It grows from where it was asked for on a snappy spring and softens out shorter, and either can be turned back halfway. A submenu opens on a short hover and stays open while the pointer heads for it (a safe triangle). Keys: `↑`/`↓`, `Home`/`End`, a letter, `Enter` or `Space`, `→` and `←` for submenus, `Esc`. Each item's `run` and `onSelect(item)` are called; `onClose(reason)` says why it went. The handle has `element`, `open` and `close()`.
- **`contextMenu(target, items, options?)`** opens one at the pointer on a right-click, or at the focused element on the menu key or `⇧F10`. `items` may be a function of the event, read each time (`null` leaves the browser's own menu). A right-click while one is open moves it. The handle has `open(at?)`, `current` and `dispose()`.

The pure parts are exported for hosts that draw their own: `place({ anchor, size, view, placement })`, `fuzzy(query, text)` (score and matched indices), `rank(items, query)` and `marks(text, indices)`.

### Timeline

```ts
import { timeline } from "knobs/ui"

const clock = timeline(dock, {
  ...look,
  duration: 12, // seconds
  fps: 30,
  markers: [{ id: "boom", time: 4, label: "Boom" }],
  onSeek: (time, source) => scene.seek(time),
  onCross: (marker) => marker.id === "boom" && retrigger(),
})
```

**`timeline(container, options)`** is a scrubber for time-based work. The ruler counts in seconds or frames (`units`) with ticks that thin out as it zooms (`⌘` wheel, a pinch, `+`/`-`, `0` fits) and pans with the wheel or a trackpad. The playhead follows the hand 1:1, pulls softly toward markers and lands on frames (`snap`). Markers can be added (`M`), dragged, renamed (`Enter`) and removed, and `[`/`]` jump between them; `I` and `O` set a loop range. `Space` plays on one rAF clock that sleeps when nothing moves, and `←`/`→` step a frame (`⇧` ten; `arrows: { step: 0.5, shift: 2 }` makes them seconds, the playhead gliding there) and `,`/`.` always do. A jump the hand didn't make catches up: a marker's click, a loop's wrap, a press on the track away from the playhead, play from elsewhere and `seek(t, { glide: true })` all carry the playhead from where it is on a quick spring (.15 s, no bounce) while the time lands at once; a drag stays 1:1, and moves during a catch-up follow the hand while the rest settles. There's no clock beside play: the time shows under the pointer on the track, in seconds, while hovering or scrubbing. `variant: "lane"` makes it one slim lane (a compare's own): ticks without labels, markers as faint chapter ticks with the current one (the last at or before the playhead) in text colour, nothing to edit; a pinch, `⌘`/ctrl-wheel or `=`/`-` zoom it around the pointer and a sideways scroll pans it, both 1:1, a double-click or `0` fits it again, and an up-and-down wheel is left to the page. A right-click on the ruler, a marker or a range opens a context menu. It reports `onSeek(time, source)` (`"scrub" | "key" | "marker" | "play" | "code"`), `onPlay`, `onMarkers`, `onRanges` and `onCross(marker)`. The handle has `time`, `playing`, `duration`, `fps`, `markers`, `ranges`, `view`, `seek`, `play`, `pause`, `toggle`, `update`, `fit`, `zoom`, `focus` and `dispose`. Pieces bound to a timeline hear it with `listen({ onSeek, onPlay, onView, onScrub, onRanges })` (it returns a stop), and `drive(clock)` makes playback follow another clock, such as a video's `currentTime`, so the two never drift. `Timeline` in `knobs/ui/react` and `knobs/ui/solid` follows its props. The Lab's scene clock and Boom retrigger run from one under the viewport.

### Compare

```ts
import { compare, compareStrip, timeline } from "knobs/ui"

// All in one: the viewer and a timeline of its own.
const review = compare(el, {
  before: { src: "/runs/41.mp4" },
  after: { src: "/runs/42.mp4" },
  mode: "side", // the default, or "wipe"
  timeline: true, // a slim lane of its own; its markers are chapter ticks
  onView: ({ zoom, loop }) => log(zoom, loop), // { u, v, w, h }, { start, end } | null
})
review.seekBy(0.5)
review.setLoop(true) // around the playhead; drag its ends on the timeline

// A long page of them: each loads near the view and lets go well off it.
for (const step of steps) compare(step.el, { before: step.before, after: step.after, timeline: true })

// The difference, opted in as a third mode; a chapter's click jumps with a catch-up.
const diff = compare(el, { before, after, modes: ["side", "wipe", "difference"], timeline: true })
diff.timeline?.update({ markers: [{ id: "a", time: 1.5, label: "The card moves" }] })
diff.seek(1.5, { glide: true })

// Or composed: the app places the pieces and binds them to one timeline.
const clock = timeline(dock, { duration: 6, fps: 30 })
compare(viewer, { before, after, timeline: clock })
compareStrip(strip, { before, after, timeline: clock })
```

**`compare(container, options)`** is a before/after viewer for videos and images (by extension, or `kind`). It offers two modes, side by side (the default `mode`: a split screen down the middle, each side filling its half) and a wipe; `modes: ["side", "wipe", "difference"]` adds a difference (changes above `threshold` in one accent, `--k-compare-diff`), and one mode hides the bar. The modes sit in a segmented control above the stage, the selection pill sliding to the one picked. It draws in one WebGPU pass that copies a frame in only when one arrives, and draws only when something changed; where there's no WebGPU, two `<video>`s with a clip-path wipe stand in. Pinch, `⌘`/ctrl-wheel or double-click zooms into either side and both zoom to the same part (the wheel and a drag pan it, both 1:1); a small pill on a dark scrim in the corner shows how far, with a reset (`0`, a double-click, `Escape`), which glides back. Side ↔ Wipe is Kit Motion's Comparison fuse: the two sides glide together on one spring (.3 s) and fuse at one side's size in the middle, so the stage never changes size; Before is cut only where they overlap, with a feather that swells mid-transition and a blurred strip over the seam, the wipe's handle fades in with it, and the labels fold to their names and ride either side of the seam (Wipe → Side runs it back, and either way it can be turned around midway). Overlaid, the sides are letterboxed, never cropped. Both videos run from one clock: paused, scrubbed or stepped, each seeks to the frame's midpoint, coalesced while a seek is in flight; playing, After leads, Before's rate leans by up to 25% to stay on it (it seeks past 90 ms), and a bound timeline follows After's time, so only one clock ever moves it (`Space` resumes from the frame showing). Scrubbing shows the frame under the hand even on raw screen recordings with a keyframe every 8–18 s: frames decoded in the background (WebCodecs where the file is a plain MP4, else a hidden `<video>`) sit in a cache shared by every viewer of the same source: a grid of small frames first, then every frame as a small JPEG proxy (960 px, at most 48 MB a source, every 2nd or 4th frame past that), and mid-drag the proxy of the frame under the pointer decodes in a few ms, with the one the hand is heading for; the videos wait and seek exactly when it lets go. `player()` does the same over its video once the pointer is over it. Encoding with a keyframe every 15 frames makes every seek exact and near instant: `COMPARE_FFMPEG` holds the command (`ffmpeg -i in.mov -vf fps=30 -fps_mode cfr -c:v libx264 -crf 18 -g 15 … out.mp4`). Sources load only near the view and are let go 3 s after leaving it (`lazy: false` keeps them), every viewer shares one GPU device, and in a container with no height of its own it takes the height its sides need, half its width in their shape, so the split has no margins (`aspect` before they load); with a height of its own (a card going full-window, say), the pair fits as a whole and refits as it resizes, keeping the zoom. On a card (`.knobs-surface`, a split's pane) or marked `data-nested`, its stage drops its fill, so one surface shows. Bind an existing `timeline()` (`timeline: clock`), or pass `timeline: true` for one of its own: a player's thin progress line under the stage (`variant: "line"`, the same as `player()`'s), its markers (a walkthrough's chapters) segments with a small gap between; there's no clock or frame readout anywhere, only the chapter and time under the pointer over the line. Its row starts with a minimal play/pause button; a click on the pictures (not a wipe, pan or pinch) and `Space` play and pause too, with no glyph flashing over them. Two stills get no button and no line. `seek(t, { glide: true })` is a chapter's jump: the videos land at once and the playhead catches up. Loop (`L`, the loop icon) sets a loop range around the playhead on the timeline, whose ends drag, and playback stays inside it. The wipe's line carries a 16×28 grip on the same scrim in its middle that follows the pointer's height only while dragged and settles back when let go; dragging is 1:1, the cursor hides and the line and the grip's marks brighten, and a press elsewhere on the stage brings the line there on a quick catch-up (.15 s). Before and After ride either side of the seam while wiping, each fading as its side runs out of room. The wipe is a slider too (`←`/`→`, `⇧` 10%); a mode change glides. Keys when focused: `Space` plays, `←`/`→` seek half a second (`⇧` two), the playhead gliding there while the videos land at once, `,`/`.` step a frame, `1`–`3` pick the offered modes in order and `S` `W` (`D`, when offered) by name, `Z` held shows the loupe (or `loupe: true`), `L` loops, `=`/`-`/`0` zoom. It reports `onMode`, `onWipe` and `onView({ zoom, loop })`; the handle has `mode`, `modes`, `wipe`, `zoom`, `loop`, `time`, `playing`, `duration`, `renderer`, `timeline`, `update`, `seek`, `seekBy`, `play`, `pause`, `toggle`, `step`, `setZoom`, `setLoop`, `focus` and `dispose`. **`compareStrip(container, { before, after, timeline })`** is a frame strip on its own: it draws Before over After along the timeline's view from the same frame cache, decoded only while it's on screen, with a bar for how much each column differs; a press scrubs. `Compare` and `CompareStrip` are in `knobs/ui/react` and `knobs/ui/solid`.

**`player(container, { src, chapters? })`** is a plain video in the same look: the picture in the compare's frame, then a row under it: a minimal play/pause button (the filled pair, a 28px target, a quiet fill on hover) and one thin progress line (2px, the tertiary text colour filled in text colour, a segment per chapter `{ label, start }`, thicker under the pointer). The button, a click on the picture, or `Space` once it's focused (a click focuses it) plays and pauses, with nothing flashing over the picture; click or drag the line to seek, 1:1, and a click away from where it is glides there while the video lands at once. The chapter and time under the pointer float over the line; `←`/`→` seek 5 s (`⇧` 10 s), and a pinch, `⌘`/ctrl-wheel or `=`/`-` zoom the line as a lane's. The picture comes in with its first frame (a 4px blur and a fade). It takes `poster`, `captions` (WebVTT), `loop` (true), `muted` (true), `aspect` and `fps`, reports `onPlay(playing, time)` and `onSeek(time)` (a seek that landed, paused), and the handle has `video`, `timeline`, `time`, `playing`, `duration`, `play`, `pause`, `toggle`, `seek(t, { glide })`, `seekBy`, `focus` and `dispose`. Under it is `timeline(…, { variant: "line" })`, which you can bind to anything else with a clock.

### Activity

```ts
import { activity } from "knobs/ui"

const rail = activity(container, {
  ...look,
  events: [
    { id: "asked", kind: "you", actor: "You", title: "Make this a knobs component", time: "48m" },
    {
      id: "work",
      kind: "agent",
      actor: "Agent", // a group: "Agent · 3 updates", opening in place
      children: [{ id: "read", title: "Read the task" }, { id: "sketch", title: "Sketched the API" }],
    },
    { id: "review", kind: "review", actor: "Review", title: "Walkthrough", duration: 32, current: true },
  ],
  selected: "review",
  onSelect: (id, event, source) => stage.show(id), // keys and clicks
  onActivate: (id) => open(id), // Enter
})
rail.add({ id: "pr", kind: "pr", actor: "GitHub", title: "#412 Activity rail", time: "now" })
```

**`activity(container, options)`** is a vertical rail of what happened: one row per event, each with its kind's icon on one continuous line, who did it, a one-line title that fades at its end when cut off (`knobs-scroll-fade-x`), and optional trailing thumbnails (`thumbs`, four at most), a duration chip (`duration`, seconds or text, "▶ 0:32") and a `time`. The built-in kinds are `you`, `agent`, `proposal`, `review`, `pr`, `build`, `blocked` and `shipped`; any other `kind` takes `icons` and `tints` from the options, and an event can bring its own `icon` (SVG markup, a glyph or a node) and `tint`. `current` puts a quiet ring on the node (the live or latest step), `dimmed` quiets a row, and the selected row's node takes a soft disc in its tint.

An event with `children` is a group ("Agent · 3 updates" when it has no `title`) that opens in place. Its children sit on the same line as smaller dots, not indented into it, and slide out from under their group with the rows below like a drawer (.22 s open, .18 s close, no bounce). The line is one path drawn between the nodes, stopping clear of each, from the first node to the last, so nothing breaks it and it ends at the last dot; its ends glide as rows come and go, so it grows with the content.

`set(events)` takes new events: ids keep their identity, so rows that stay glide to their places (.4 s), new ones bloom in from the newest side (a slide of 8px, scale .97 and a 3px blur, .3 s) and gone ones soften out where they are. `newest: "top"` puts the newest first (`add(event)` puts it there), and `update({ events, newest })` changes both at once, so a rail reversed in place glides there. With `follow` (on by default) the rail stays pinned to its newest end when new events arrive while that end is in view. A group opening or closing at the scroll's end keeps the rows above it still, or lets them glide down with the drawer as far as the content shrinks; the scroll never clamps in one frame. Nothing animates on the first paint, times and durations roll when they change, and under reduced motion rows only fade.

| Key | Action |
| --- | --- |
| `↑` / `↓`, `Home` / `End` | Move the selection (`onSelect(id, event, "key")`) |
| `→` / `←` | Open a group, then step into it / close it, or step out of a child; when they'd do nothing they're left to the page |
| `Enter` | `onActivate(id, event)`; on a group with no `onActivate`, open or close it |

The selection shows as a tint gliding between rows only once keys move it (by distance, .3 s or .42 s); a click selects with no ring, and the tint fades out over 100 ms where it is. Hover washes come in at once and fade out over 100 ms. Keys come from the rail while it has focus, or with `keys: "page"` from anywhere a focused field or widget doesn't take them. The handle has `set`, `add`, `update`, `select(id)` (opens its group; doesn't call `onSelect`), `selected`, `expand`, `isExpanded`, `focus` and `destroy`; `Activity` in `knobs/ui/react` and `knobs/ui/solid` follows `events`, `selected` and `newest`. `--k-activity-line`, `--k-activity-select`, `--k-activity-row`, `--k-activity-gutter` and one `--k-activity-<kind>` per kind tune it, in dark and light. The pure parts are exported: `flattenActivity`, `navigateActivity`, `railSegments`, `stackRows`, `diffActivity`, `showsSelection`, `formatDuration`.

### Option picker

```tsx
import { OptionPicker } from "knobs/ui/solid"
import { KnobsPanel } from "knobs/solid"

<OptionPicker
  options={variations().map((v) => ({ id: v.id, label: v.name, suggested: v.id === suggested() }))}
  selected={variation()}
  chosen={chosen()}
  onSelect={(id) => setVariation(id)}
  onChoose={(id) => choose(id)}
  digits="page"
>
  {(option) => <KnobsPanel controls={paramsOf(option.id)} header={false} variants={false} />}
</OptionPicker>
```

**`optionPicker(container, options)`** lists a proposal's options (1–n), each with its number, its name, a "Suggested" mark (`suggested`, worded by `suggestedLabel`) and a check on the `chosen` one, which blooms in. An option's `thumb` (an image URL) shows small between the number and the name, cover-fit with a hairline: it loads lazily and fades in once loaded, and nothing is drawn while it loads or if it fails (`--k-picker-thumb` sizes it, 24 px in a 34 px row). Every row is numbered, 10, 11 and on in the same two-digit column, though only `1`–`9` pick. The selected option sits on a card that glides between options in one move (.3 s), aimed at where the option will be once the last one's parameters have closed (the first time an option opens, its parameters mount shut a frame ahead and the change starts once their height has settled, so the card aims at their real height), and its parameters open under it in place while the last option's close (.22 s open, .18 s close, the content fading and drifting with the edge). `↑`/`↓` and `Home`/`End` move between options, `1`–`9` pick one, `Enter` calls `onChoose(id)` and `Tab` goes into the parameters. Digits come from the picker and its parameters while focus is inside (`digits: "page"` takes them from anywhere; `false` for none); a focused row that picks its own options with digits, and text fields, keep theirs.

The parameters are inset by the picker (`--k-picker-pad`, `0 8px 8px`), whatever a panel's own pad. They are real knobs panels: `body(option, element)` mounts whatever an option needs into `element` the first time it opens and returns a cleanup, and it stays mounted while closed, so a panel keeps its state. The picker is plain DOM chrome in `knobs/ui` and the panels come from `knobs/panel`, so `knobs/ui` stays free of the panel, and the parameters draw with the DOM or the WebGPU renderer as any panel does (nothing around them makes a stacking context at rest). `OptionPicker` in `knobs/ui/solid` and `knobs/ui/react` renders `children(option)` there instead, in the component's context. The handle has `set(options)`, `select(id)`, `selected`, `choose(id)`, `chosen`, `focus()` and `destroy()`. A `select(id)` (or a `selected` or `chosen`) for an option that isn't there yet is kept, and the `set()` that brings it picks it; a later `select` replaces it.

### Code diff

```ts
import { codeDiff, diffReview } from "knobs/ui"

// A patch's files in a tree beside the diff, in a split.
const review = diffReview(container, { ...look, id: "review", patch: gitShowOutput })

// Or the diff alone: one file or many, from a patch or before and after text.
const diff = codeDiff(el, {
  ...look,
  files: [{ name: "src/spring.ts", before, after }],
  layout: "unified", // "split" by default
  height: "auto", // as tall as the file's diff, up to maxHeight; "fill" by default
  onFile: (name) => setFile(name),
})

// Many down a long page (a walkthrough): each holds its height, draws when near the viewport.
for (const step of steps) codeDiff(step.el, { ...look, patch: step.patch, height: "auto" })
```

**`codeDiff(container, options)`** shows a code diff on the void, with no card, fill or ring (a hairline under its header and one under the code, as a walkthrough's code block has, and only changed lines tinted): a quiet header with the file's path, its `+12 −3`, ‹ 2 of 5 › when there are several files (`nav: false` hides it), a wrap toggle and Split | Unified (a segmented control, the selection pill sliding to the one picked), over the diff. Its buttons are Phosphor icons. The diff itself is drawn by [`@pierre/diffs`](https://diffs.com) (Shiki highlighting, word-level changes, hunks that expand when whole files are known), an optional peer dependency: install it to use diffs (`npm i @pierre/diffs`). It loads on first use, so `knobs/ui` doesn't carry it. Its colours come from the pieces' tokens, so dark, light, presets and `restyle()` carry into it. `--k-diff-add`, `--k-diff-del` and `--k-diff-bg` tune it, and `syntax: { dark, light }` picks Shiki themes for the code. It takes `patch` (`git diff` or `git show` output, one file or many) or `files: [{ name, before, after, lang? }]`, plus `file`, `layout`, `wrap`, `onFile`, `onLayout`, `onWrap` and `onLines(lines, file)` (dragging over line numbers selects lines). Changing the file, the layout or the wrap fades the new view in over the old in place (.3 s in, .24 s out, a 3px blur while it fades; a .16 s fade under reduced motion). With `height: "fill"` the card fills its container and each file keeps its scroll. With `height: "auto"` it's a self-contained piece for a long page: it's as tall as the file's diff up to `maxHeight` (640, or 70% of the window when that's less) and scrolls inside past that, springing to each file's height (.4 s, no bounce). It holds the height the diff will take from the first frame, counted from the patch's rows before the renderer has loaded, so nothing below it jumps. It also draws only within a screen of the viewport (of the scroller it sits in) and lets go of its views four screens away, keeping its height; `lazy: false` draws it at once, and `lazy: true` does this with `height: "fill"`. Pass `viewed` (names) or `onViewed(viewed, file)` for a Viewed tick in the header. `stack: true` puts every file down one scroller, as GitHub's Files changed does: each under its own header (status, path, counts and their bar, Viewed) that sticks to the top until the next file's pushes it off: flush (square, no card around each file, a gap between files), opaque in the code's colour, with a hairline under it only while it's stuck. The card's header then sums the change, ‹ › and `show()` glide to a file (.4 s), the file on show follows the scroll, and each file draws only near the view.

Its scrollers fade their content out at an edge with more beyond it (a mask: at the top once scrolled, below a stuck header, and at the bottom while there's more below, `--k-diff-fade`, 20px), easing in and out on the .25 s spring. Its scrollbars are thin ones drawn over the code that take no room and stay hidden until the pointer is over the diff, or while you scroll or drag: `overlayScrollbar` up and down, and a bar per code column across, kept at the bottom of what shows of the column however far down a long file you are (the renderer's own, inside its shadow root, are hidden). On its own or on a surface the header and the code line up with the column's content (no inset across); in a split's pane or a `diffReview`, one inset runs all round, `--k-diff-inset` (8px, the renderer's own gap): the header's controls sit it in from the top and right, the path, the separators and the line numbers it in from the left, and the code ends it above the bottom. Inner corners (separators, the header's controls) are the outer corner less that distance, so they're concentric with the card. On another surface the diff takes no inset across, so its header and code line up with the surface's own content (a walkthrough's caption), and its corners are measured from the surface's. The header's hairline shows only once the code has scrolled under it. The handle has `files`, `file`, `layout`, `wrap`, `viewed`, `show(name)`, `step(±1)`, `update({ patch?, files?, file?, layout?, wrap?, viewed?, height?, maxHeight? })`, `ready` (once drawn) and `dispose()`. `update({ height: "fill" | "auto" })` switches in place, keeping the views, their scroll and the sticky headers; the new height isn't sprung, so a container whose size is moving (a walkthrough card going full window) is followed, not fought.

**One surface.** Cards never nest. Whatever draws a card carries `.knobs-surface` (a walkthrough's step; put it on your own cards too), and a split's pane counts as one; a piece inside a surface draws no card of its own, so a diff in a step, a pane or your card shows no second fill or ring, and a `diffReview` inside one parts its panes on a hairline instead of drawing them as cards. The diff's code keeps an opaque fill under its sticky line numbers, the colour showing behind it, so it still matches.

**`diffReview(container, options)`** pairs it with a file list, on the void as the diff is: a hairline parts the list from the diff, one runs under both headers and one under it all, and the filter is a line of text with no box. The list is a drawer at the review's left that springs open and shut between 0 and 256px (`listSize`; .4 s, no bounce), from a button at the start of the diff's header or `⌘B` / `Ctrl+B` while you're working in the review; the diff reflows as it moves, the list slides out from under it, and with an `id` it stays as you left it (`listOpen: false` starts it shut). The list is built on `tree()` and laid out as GitHub's, Graphite's and VS Code's are: a filter field on top (every word must be in the path: `ui diff`; `Esc` clears it, `↓` or `Enter` goes to the list), then a compact tree (28px rows, `--k-diff-row`) with folders folded into paths (`src/ui` is one row when `src` holds nothing else). Each file shows its change as a coloured letter (M amber, A green, D red and struck through, R blue; `--k-diff-mod` and `--k-diff-move` tune the two new ones), its `+12 −3` and a five-square bar of the share added and removed, and a tick to mark it viewed (on a folder, everything in it). Viewed files dim, the list's title counts them (`2/5`), and with an `id` they're remembered until their change moves on (each is saved with a fingerprint of its diff). The file on show has the selection pill: one highlight that slides to the next on the state spring (.3 s, no bounce), its row's text sharp and bright under it while other rows stay as they are (the tree's `glide` option). Picking a file shows it. The handle has the pieces, `tree` and `diff`, plus `listOpen`, `toggleList(open?)`, `viewed`, `setViewed(names, on)`, `filter(query)` and `update()`; `viewed` and `onViewed(viewed, file)` seed and report the marks, and `search: false` drops the field. To place the tree and the diff yourself, `diffFiles({ patch })` lists the files with their counts in tree order, `diffTree(files)` makes the tree's items, and `diffCounts(file, doc, { bar })` and `diffStatus(file)` give a row's counts and letter (a tree's `detail` and `icon`). `CodeDiff` and `DiffReview` in `knobs/ui/react` and `knobs/ui/solid` follow `patch`, `files`, `file`, `layout`, `wrap`, `viewed`, `height` and `maxHeight`. The demo is `examples/lab-diff.html`.

### Ideas grid (bento)

```ts
import { bento } from "knobs/ui"

const ideas = bento(container, {
  items: [
    { id: "a", src: "a.jpg", srcset: "a-640.jpg 640w, a.jpg 1600w", label: "Light table" },
    { id: "b", aspect: 4 / 3, render: (el) => mountPrototype(el), label: "Chip → panel" },
  ],
  onPick: (ids) => save(ids),
})
```

**`bento(container, options)`** lays out ideas (images, live canvases, prototypes) for someone to look at and pick from. There's no chrome: tiles sit on the page with hairline gutters (`gap`, 2px), no cards, borders or shadows, and a label shows as type on hover. Items take `id`, `src` (with `srcset` and `alt`) or `render(el)` (return a cleanup), `aspect` (width / height; images without one take their natural size, read from the smallest `srcset` candidate before the first paint), `label`, `group` and `hero`.

The layout shows as much as it can without cropping. Up to 24 items lay out on one screen when every tile stays at least a sixth of the view tall: as justified rows, at the row count that covers the most, or with a hero (one tile large beside or above the rest) when an item asks for it or the first item as a hero shows 4% more. Larger sets, groups and narrow views scroll in justified rows near a third of the view tall (`rowHeight`). A row only looks at the items from its own start, so adding or removing an item never moves the rows before it. Tiles keep their own shape, except that the last row (or a block a little narrower than the view) may crop by up to `tolerance` (8%) to fill the width. Tiles that change place glide there on the calm spring (.4 s, no bounce), new ones come in, and removed ones soften out (scale .96, 3px blur) while the rest close the gap. Only the tiles near the view are in the page (about 30 of 500), and the frame loop sleeps when nothing moves.

Click or `Enter` zooms a tile to fill the view, aspect-fit and centred: one continuous spring (.45 s, no bounce; .38 s back) from its place in the grid, while the grid fades under it. The tile blurs with its speed, up to `blur` (2.5px), and is sharp at rest. `Esc`, a click, `Enter` or a pinch out returns it to its exact place, scrolling the grid under it first if you moved on. While zoomed, `←`/`→` or a two-finger swipe slide to the neighbour (.3 s) and a zoomed prototype takes the pointer. `⌘`-scroll or a pinch zooms by hand: the tile follows the fingers 1:1 and settles in or out by where and how fast you let go. Under reduced motion, everything fades instead of travelling.

| Key | Action |
| --- | --- |
| `←` `→` `↑` `↓` | Move the focus wash by geometry (zoomed: `←`/`→` go to the neighbour) |
| `Enter` / `Esc` | Zoom in / out |
| `Space`, `⇧`/`⌘` click | Pick or unpick (a dot in the accent); `onPick(ids)` |
| `1`–`9`, `Home` / `End` | Jump to an item |

The handle has `update(items)`, `zoom(id | null)`, `zoomed`, `active`, `focus(id?)`, `picks`, `pick(ids)`, `plan`, `moving`, `stats()` (the frame loop's script time) and `dispose()`; `onZoom` and `onActive` report changes. It takes the pieces' tokens and `restyle`, in dark and light; tiles round at `--k-ui-bento-radius` (3px), square under `--k-frame: flat`; `--k-ui-bento-bg` and `--k-ui-scrim` set the page under the tiles and the zoom. `planBento(aspects, { width, height, … })` is the layout on its own, with `bentoNeighbour`, `bentoWindow` and `fitRect`. `Bento` in `knobs/ui/react` and `knobs/ui/solid` follows `items` and `picks`. The demo is `examples/ideas.html` (`?n=500` for a big set, `?groups`, `?hero=3`, `?perf` for a frame-time readout, `?bench` to scroll and zoom on its own and report).

### Infinite canvas

```ts
import { canvas } from "knobs/ui"

const board = canvas(container, {
  items: stories.map((s) => ({ id: s.id, title: s.name, render: (el) => s.mount(el) })),
})
board.focus("button-primary")
```

**`canvas(container, options)`** puts items on a dotted page that pans and zooms freely, as a components lab's grid. Items take `id`, `render(el)` (return a cleanup), `title` (shown above the card), `w`/`h` (the card's size; without them it takes its content's) and `x`/`y` (a place; items without one pack into rows under the placed ones, in order, the rows as wide as makes the set about the canvas's shape, or `width`). Each item is one hairline card; the dots scale with the zoom and fade out at the extremes; the edges fade over 16px (`--k-ui-canvas-fade`).

Dragging the page, two-finger scrolling, or holding Space or the middle button and dragging anywhere pans; a pinch or `⌘`/`Ctrl`-scroll zooms around the pointer. Both follow the hand 1:1 and a fling coasts. What the hand didn't do springs (no bounce): `0` fits, `1` is 100%, `=`/`-` step 1.5×, and a double-click on an item focuses it (again, or on the page, fits). A mouse wheel's notch under `⌘` zooms directly too, at most 1.25× an event. Each jump zooms around the one point both views share, so everything on screen travels in a straight line. Items stay live: clicks and keys reach them, and a dragged Space still presses a focused button if nothing moved. Nothing moves on load: the first fit is instant, and until someone touches the view a change in size or content fits again. The world is one transformed layer; at rest its translate snaps to device pixels and, after a zoom, it's drawn again at the new scale so text is crisp.

The handle has `fit()`, `focus(id)` (at most 200%), `zoomTo(scale, at?)`, `update(items)` (items that stay keep their content and glide to new places; new ones come in, gone ones soften out), `view`, `rects`, `moving`, `stats()` and `dispose()`; `onView` reports the view, `minZoom`/`maxZoom` (.05–8) bound it, `gap` (48) parts packed items, `padding` (48) frames a fit and `readout: false` drops the zoom pill. `layoutCanvas`, `packRows`, `fitView`, `zoomAround`, `viewPath` and `dotGrid` are the math on its own. `Canvas` in `knobs/ui/react` and `knobs/ui/solid` follows `items`. The demo is `examples/canvas.html` (`?n=200`, `?perf`).

### Review pieces (`knobs/review`)

The walkthrough and what it shows (compare, player, code diff, history, facts, decision, taste test, `mediaSlot`) are their own subsystem: `knobs/review` (and `knobs/review/react`, `knobs/review/solid`). They have their own quiet look, `themes.review` (true black, flat, hairlines held to an APCA target, the platform's own face), one type scale and a short set of rules: [docs/review-design.md](docs/review-design.md), with every piece alone in `examples/review.html`. `knobs/ui` still exports them. `reviewFont(document, { href, sans: "Inter" })` gives the review look in a webfont.

A walkthrough, `mediaSlot()`, `tasteTest()`, `facts()` and `decision()` take `themes.review` unless you pass a theme or they sit inside a themed knobs element; pass `theme: themes.review` to a standalone `compare()` or `player()` for the same look. Every piece sets its type on the page scale (20, 16, 13, 12 and 11 px, at 400 and 500), fixed rather than following `--k-font-size` or density, so a compare or a diff reads the same in a panel as on a page. Under the hand they all behave alike: the arrow cursor, a hover that's one quiet fill landing at once, buttons 8 px in on their text side and 6 px by an icon. A label over a picture (compare's Before and After, its zoom pill and grip, the video line's time, an annotation's label) sits on a quiet dark scrim with no ring, in either appearance.

### Walkthrough

```ts
import { walkthrough, type WalkthroughDoc } from "knobs/review"

const doc: WalkthroughDoc = {
  id: "2026-10-19-onboarding-prs",
  title: "Onboarding audit: before / after",
  sections: [
    {
      title: "Refresh models globally",
      link: "https://github.com/anomalyco/opencode/pull/57148",
      status: "ready",
      steps: [{ title: "Desktop model picker", media: { kind: "compare", before: "a.mp4", after: "b.mp4" } }],
    },
  ],
}
const w = walkthrough(container, { doc, onFeedback: (fb) => send(fb) })
```

**`walkthrough(container, { doc })`** is the page an agent writes to show its work: a plain document (JSON) of sections and steps, each step a title, a caption, its media and what it asks (a note, or a pick between options). The contents rail sits sticky at the page's left edge (`rail: "right"` mirrors it, `false` drops it; under 960px it hides, or with review on folds to a bar on top with the progress and the export). Its rows share one text edge and one colour, the selection pill marks the step you're on, and a click goes to a row, and the column is centred in the room beside it, up to `--k-walkthrough-width` (960px): media take the column's width, prose stops at the measure. It's laid out on the page tokens: the intro, the updates and each section a section's room apart (`--k-space-section`, 96px, a hairline in the middle), the groups and steps inside a section a group's room apart (`--k-space-group`, 48px), prose at 68ch. Steps aren't boxes: they sit on the page with a hairline between them, and the spacing roles do the grouping; `cards: true` puts each on a card of its own, the one surface its media sit on (nothing inside draws a fill and a ring of its own). Titles take inline Markdown (`` `code` ``, `[links](…)`); the contents read them as plain words.

A section's meta line leads with its **kicker** in text colour: `"PR 2 of 5"` by default where its `link` is a pull request (counted among the sections that link one). The doc's `kickers` counts with another noun, `{ noun: "Part" }` giving every section "Part 2 of 6", or none with `false`. A section's own `kicker: "Epilogue"` wins over its count and `kicker: false` hides it, without renumbering the rest. The contents rail isn't numbered. Its PR link follows in faint, joined by `·` (its `status` only with review on). One type scale: the page's title 20/28, a section's 16/24, a step's 13/20 at 500, prose 13/20 in the second ink, meta 11/16 in the third. Steps aren't numbered on screen, but a ref still names one by its key, id or number (`"1.2"`): `step` on an update, a history event, a stack item or a table cell, and clicking goes there as `j` / `k` do.

By default the page only shows: no progress, notes or Copy feedback, no key hints, no statuses (a section's or an update's) and no counts, and a step's `options` sit side by side under their labels. `review: true` brings Kit's review tools back: the progress in the rail and its state dots, statuses, Copy feedback, picking between options (`1`–`9`) and the note bar. With review on, notes come from a launcher in the column's corner (`noteBar: "collapsed"`, the default) that opens into the bar on a click, `n`, a recording or ink, and folds back when it's empty; `"docked"` keeps the bar there, `"hidden"` drops it (`w.send()` still works). Typed, spoken or inked, each note carries what was on show (a video's time and chapter, a compare's loop and zoom, a diff's file) and a short log of what led up to it; `onFeedback`, `w.feedback` and `w.markdown()` hand it back. The page keeps the bar's height clear at its end and as its scroller's `scroll-padding-bottom`, so `j` / `k`, `go()` and the last step never land under it, and full window stops above it. `j` / `k` move between steps (`Home` / `End` to the first and last), `←` / `→` seek, `f` goes full window, `n` writes a note, `1`–`9` pick.

Media is a bare URL (a video or picture), or `compare`, `video`, `image`, `diff`, `code`, `terminal`, `metric`, `callout`, `text`, `facts`, `decision`, `history`, `stack`, `table`, or `mount` (your own, `(el) => cleanup`; the one that isn't JSON). A step's media sit one under another (a group's room apart); `columns: 2` sets them side by side where there's room. Every picture, video, compare stage, code block and terminal (and a slot still loading) takes the same frame: the panel radius and a quiet fill, no ring. A diff sits in one plain well, drawn by its hairline alone (no fill), the panel radius and room inside: a box is a fill or a ring, never both. Nothing in a walkthrough is glass. A metric, a callout, facts, a decision, a table, a stack and a history sit on the page. Any slot's `label` (a metric's name, facts' `title`) is one line above it, the same for every kind: as written (sentence case), small and faint, with no rule between it and the media; a history's `label` is only its accessible name.

**Keep it scannable.** A step's title is its claim, in about ten words; its caption is one sentence; everything else goes in `more` (Markdown, blank lines between paragraphs), folded under the caption behind a small **More** toggle whose height springs open on the state spring while the words come into focus (a fade with a small blur, from the top). Sections take `more` under their summary, and the page under its own. Media that mounts after the first paint (near the view, or a picture still loading) comes in the same way; nothing moves on load.

```json
{ "title": "Retired models get a way out", "caption": "After: **Pick another model**, and the prompt back.",
  "more": "A mock provider answers 410 Gone.\n\n**Pick another model** opens the picker." }
```

**Pull requests and issues** read as capsules: their state's icon (merge, pull request, draft, closed; a circle-dot for an issue) and number in a quiet tint of the state (open green, merged violet, draft and closed faint, unknown neutral), a faint check where its checks pass, the title and state on hover. Every ref becomes one: a section's PR `link` on the meta line ("PR 3 of 9 · ⟨#57158⟩"), and in titles, captions, summaries, `more` and table cells, a link to a pull request or issue whose words are its number, inline code that's just a ref, and a bare `#57148` (`issue:#123` for an issue). The state comes from the doc's `prs` by number (`{ "57148": { state: "merged", title: "…" } }`, `kind: "issue"` for an issue), else a `stack` on the page (an item's title and the first word of its `status`), else the section whose `link` is that PR. A ref needs no `repo` to be a chip; `repo: "owner/name"` only links the ones whose text has no URL. So a caption needn't spell out "#57158 (Draft · Green)".

**The feed** (`updates` and `qa`, newest first) is a calm list a group's room apart, a hairline between items and no boxes: a meta line (when · the step's PR, and `status` with review on), the question in text colour (or the update), its answer in dim prose, and its `trail` (what Kit did before asking, `"0:04 · Played the compare"`) folded under a small faint **Context** toggle whose height springs open on the state spring (.3 s) while the lines fade in place under a soft bottom edge. `status: "shipped"` reads Shipped, `"changes"` reads Changes queued.

```json
{ "qa": [{ "at": "2026-10-19T12:10:00-07:00", "q": "Why is there no video for #57158?",
           "a": "It's the installer redirect: nothing to watch.", "step": "4.1", "status": "shipped",
           "trail": ["0:03 · Viewed TUI /connect", "0:11 · Played the compare at 0:04"] }] }
```

The demo is `examples/walkthrough.html`.

**`history`**: drawn by **`history(container, { data })`** (also exported on its own): a shared date axis (month ticks, today's line) over lanes, one per channel or track, each carrying spans whose tone says their state, marks for releases and deletions, faint bands for phases; hovering shows a date line and a tooltip, and a click or `←` / `→` opens one detail area under the chart. Write the lanes shape (`lanes: [{ id, label, spans: [{ from, to?, state, label?, detail?, provenance?, evidence?, step? }] }]`, `events: [{ date, lane?, title, type?, tone?, provenance?, step? }]`, `bands`, `states`, `axis`), or the older groups of dated events below, which it lays on one code lane under a band per heading. `provenance: "inferred"` hatches a span and hollows a mark; a `step` gets "Go to step" in the detail; `label` names it, and `marks` picks which event types are marked from the start (releases and deletions, or `"all"`).

```json
{ "kind": "history", "groups": [{ "heading": "v2 dropped it", "summary": "Jun 26 – Jul 30", "events": [
  { "date": "Jun 26, 2026", "age": "116d ago", "title": "The v2 TUI rewrite leaves out DialogRetryAction",
    "detail": "`session/index.tsx` replaced without the listener.", "tone": "bad",
    "provenance": "verified", "source": "git", "evidence": [{ "label": "e6f660fecf" }] },
  { "date": "Oct 20, 2026", "title": "/install still 307s to v1", "tone": "warn",
    "provenance": "inferred", "source": "edge", "step": "4.8" } ] }] }
```

**`facts`**: a short list of term → value pairs, for what the user sees, what happens and the evidence: terms small and faint in a gutter on the value's baseline, values in prose. `facts` is `{ term: value }` or `[{ term, value, code? }]`; a value can be a list (one under another), `` `code` `` in it reads as a small mono chip, and `code: true` makes each value (a string splits at commas) a chip, for file:line evidence. `groups: [{ title, facts }]` sets several runs under headings with a hairline between. Where it's narrow (under 400 px), each term sits over its value. **`facts(container, { facts })`** draws one on its own.

```json
{ "kind": "facts", "groups": [
  { "title": "v2 TUI (origin/dev)", "facts": [
    { "term": "What the user sees", "value": "Two rows, `OpenCode Go` first" },
    { "term": "Evidence", "value": "dialog-integration.tsx:49-56, opencode.ts:271-288", "code": true } ] } ] }
```

**`decision`**: N ways to go, one recommended. The options sit side by side only in whole rows (four go 4, 2 or 1 across; three go 3 or 1), as many columns as fit at 280 px, with hairlines between columns and rows and no cards. Each is a kicker (`Option 1 · Recommended`, the mark a quiet word in text colour; `noun` changes the word), its title, a `summary` sentence, optional `media`, and what changes as facts (`facts`, then `pros` and `cons` as For and Against). A taste test (`options` on a step, Kit's pick) looks the same, its head the radio and a check at the kicker's end. **`decision(container, { options })`** draws one on its own.

```json
{ "kind": "decision", "options": [
  { "title": "One OpenCode row in /connect", "summary": "Signing in already unlocks Go models.",
    "recommended": true, "facts": { "Size": "~30 lines" } },
  { "title": "Keep Go as a shortcut", "summary": "Both rows stay.", "cons": ["Two rows that do one job"] } ] }
```

**`stack`**: PRs in merge order as a branch graph. `branch` is `"head → base"` (or `head` and `base`); an item whose base is another's head hangs under it, joined by a drawn rail, and the rest sit on the trunk (`base`, else the branch most items merge into), named at the top. An item on a branch that's neither shows it. `delta` is `"+164 / -18"` or `{ add, del }`, drawn green and red; its PR's state shows the GitHub way, from the doc's `prs` or the first word of `status` (`merged`, `open`, `draft`, `closed`, any case), never from `tone`: the merge or pull-request glyph and word, open and merged quietly tinted, draft and closed faint, and a small check after it where `status` says the checks pass (`green`, `passing`, `CI`). Any other `status` is a chip in its `tone`. `step` (or `stepId`) makes the whole row go to that step, the row filling under the pointer, with nothing trailing it; the PR number links out (`href`, else the doc's `prs` or `repo`).

```json
{ "kind": "stack", "base": "dev", "items": [
  { "order": "01", "pr": "#57146", "href": "https://github.com/anomalyco/opencode/pull/57146", "title": "Typed free-limit error",
    "branch": "free-limit-card → dev", "delta": "+193 / -8", "status": "Stack base", "tone": "good", "step": "4.1" },
  { "pr": "#57466", "title": "Restore the Desktop dialog", "branch": "free-limit-desktop → free-limit-card",
    "delta": { "add": 446, "del": 47 }, "status": "Stacked on #57146", "tone": "good", "summary": "Modal, notice and prompt recall." } ] }
```

**`table`**: a real `<table>` for audits and matrices. Rows are cells by column key, bare or under `cells`; a cell is text, a number, or `{ text, href?, code?, badge?, tone?, step? }` (a `badge` is a tone chip). A row with a `step` on any cell goes there: the whole row, a wash under the pointer, Enter when it has focus, and nothing trailing it, so every row lines up. Columns take `mono` and `align` (number columns go right by themselves). Figures are tabular; a tall table keeps its head stuck, and its bars show thin on hover. `caption` goes under it. Where the step is narrower than the columns' natural width (long text keeping a measure, code on one line), each row becomes a block: its `primary` cell (the first column by default) as its title with its badges at the end of the line, the rest as term and value under it, the blocks parted by hairlines. `stack: "always"` always stacks; `stack: "never"` scrolls across instead, edges fading where there's more.

```json
{ "kind": "table", "caption": "From a clean HOME, Oct 20", "columns": [
    { "key": "channel", "label": "Entry point", "mono": true }, { "key": "days", "label": "Days on v2" },
    { "key": "state", "label": "State", "align": "right" } ],
  "rows": [ { "cells": { "channel": { "text": "npm i -g @opencode-ai/cli", "code": true }, "days": 39,
                         "state": { "text": "Broken", "badge": "bad" } } },
            { "channel": "brew install …/opencode-v2", "days": 31, "state": { "text": "Pending", "badge": "info", "step": "4.6" } } ] }
```

**`annotations`** on an `image`, a `video` or a `compare` draw the eye to what matters: `[{ x, y, w?, h?, label?, at?: [start, end], shape?: "box" | "dot" | "arrow" }]`, in 0–1 of the picture (a box's top-left, or the point). A box takes a calm ring, a point a dot (or an arrow pointing at it), each with a small label on a dark scrim; on a video or compare one shows only between its `at` seconds, fading in and out with a small blur. On a compare they're drawn on both sides and stay on their spot through a zoom. They're on by default; the eye button on the picture, or `a`, hides or shows every one on the page.

A **`video`** plays in **`player()`**, the same look as a compare: the picture, then one thin line under it to seek on, its chapters as segments.

**`chapters`** on a `video` (or a `compare`): a readout list under it, a row each (number · label · start). A click selects the chapter at once while the media seeks there and plays, and goes in the note's log; the selection pill slides to the chapter playing (the last that started at or before the playhead) and fades out in place outside them, and a note's `media` names it (`chapter`). A chapter ends at `end`, else `start + duration`, else the next one's start. On a compare they're also its timeline's markers. A video's `captions` (or `captionsSrc`) is a WebVTT URL, shown by default.

```json
{ "kind": "video", "src": "journey.mp4", "poster": "journey.png", "captions": "captions.vtt", "chapters": [
  { "id": "scorecard", "label": "Scorecard", "start": 0, "duration": 9.57 },
  { "label": "Today (broken)", "start": 9.57 }, { "label": "After", "start": 35.38 } ] }
```

## Theming, Density & WebGPU Renderer

Panels take a `theme`, an `appearance`, `density: "compact" | "default" | "comfortable"` and `renderer: "gpu" | "dom" | "auto"` (or `?gpu` in the URL), on `defineControls`, `mountPanel` or `<KnobsPanel />`; every `knobs/ui` piece takes the same `theme` and `appearance`, and `restyle(target, look)` changes them on what's already on screen. The header title defaults to the controls id, written as words (`"synth-voice"` reads "Synth voice"); pass `title` to override it or `title: false` to hide it.

### Themes and appearance

Three themes ship in `knobs/themes`: **Knobs** (the default: a near-black glass panel, a white accent, alpha hairlines), **Void** (true black and flat, solid hairlines, text capped at `#ededed`, a black stage behind compared media; for OLED screens and video review) and **Review** (`themes.review`: Void with hairlines you can see, their alphas set by APCA against the page at Lc 9, 12 and 17, fills at 6, 10 and 14%, white in light, and the platform's own face; the review pieces' default). Each has a dark and a light appearance. `--k-before` and `--k-after` name a comparison's two sides, neutral by default (`fg-3` and `fg`).

```ts
import { defineTheme, themes } from "knobs/themes"

mountPanel(controls, column, { theme: themes.void })
split(workspace, { theme: themes.void, appearance: "dark", panes })

// A theme of your own from a few dials, both appearances generated (checked against APCA).
const ocean = defineTheme({
  name: "ocean",
  extends: themes.knobs, // optional
  gray: { hue: 240, chroma: 0.008 },
  accent: "#4f8cff", // or { dark, light }
  contrast: 60, // 0–100
  radius: 6,
  density: "compact",
  material: "solid", // "glass" | "solid" | "flat"
  tokens: { dark: { "bg-page": "#05070a" } }, // any token, per appearance
})
```

`appearance` is `"dark"`, `"light"`, `"system"` (the OS setting) or `"inherit"`, the default: the page decides, through a `color-scheme`, a `.dark`/`.light` class, `[data-theme]` or `[data-appearance]` on an ancestor, or an outer knobs element, else the OS. A theme is a value: `theme.dark` and `theme.light` hold every token resolved, `theme.gpu` the colours as floats for WebGPU, and `theme.css()` its stylesheet. The old `theme: "dark" | "light" | "auto"` still works as an appearance, and `preset` (`labPreset`, `problemsPreset`) still lays its tokens over the theme; both are deprecated. `examples/themes.html` shows every piece in both themes and appearances, with a builder for `defineTheme`'s dials that copies the call as code.

### Overriding tokens

Set any token on `:root`, `.knobs-panel` or any ancestor; a host's value wins at whatever level it's set. Tokens derived from others (hover and selected fills from the surfaces, the slider handle from the accent, sizes from `--k-density`) are derived on each panel and knobs/ui piece, so an override anywhere above them carries through. The full list, with each theme's values, is under [Tokens](#tokens); the old names (`--k-surface`, `--k-text`, `--ku-*`) still work for now.

```css
:root {
  --k-bg: #1c1c1e;
  --k-accent: #4f8cff;
  --k-radius: 6px;
  --k-density: 0.875;
}
```

The panel's motion dials are tokens too: `--k-blur` (readout blur and pill stretch), `--k-motion-blur`, `--k-range-blur`, `--k-curve-blur`, `--k-step-resist`, `--k-roll` and `--k-drag-roll` (readout roll, ms), `--k-cascade` (preset ripple, ms), `--k-glass-tone`, `--k-reveal-ease`, and the spring values settle on, `--k-spring` (GPU) with `--k-fill-ease` and `--k-fill-ms` (`springCss(value)`, for CSS).

Changing a token glides: colours, lengths, weights, glass and glow move on the panel spring (`--k-fill-ease` over `--k-fill-ms`), so a theme switch or a preset of tokens animates in both renderers. While a control is dragged they follow it step for step.

A floating panel opens out of its chip like liquid glass. The press squeezes the cog (to 0.94, easing in over 60 ms); then each edge of the glass rides its own spring from the chip to the panel. The edges facing the way it travels lead on a stiff spring (as stiff as their axis carries the travel) and the others trail on a softer one, so the glass stretches toward the panel, overshoots a little and settles in under 300 ms, its corners going from the cog's circle to the panel's radius. The content follows a beat behind: blurred 8 px, faded and at 97%, revealed top first, landing exactly crisp. Closing runs it backwards and faster: the content blurs out first, then the glass pulls into the cog with its far edges trailing (about 200 ms). Esc, the close button or the chip itself folds it back; toggling mid-way reverses from wherever the shape is, keeping its velocity. The WebGPU overlay blurs, fades and scales the content in its shader, so both renderers match. A reload brings an open panel back in place, with no morph.

**Moving it.** Drag a floating panel by its header (the title or the empty space beside the buttons): it follows the pointer 1:1, shows the closed hand only while it's carried, and stays where it's let go. The spot is kept with the store's values (`persist: "all"`), by the nearer side: a panel left on the right half keeps its distance from the right edge as the window changes width. It always shows inside the window, and on a phone (420px wide or less) it takes the width less an 8px gutter and scrolls inside the height. An inline panel (`mount`, `mountPanel`) belongs to its host's layout and doesn't move: lifting it out would leave its container's clipping, stacking and token overrides behind. For a panel you can move, open a floating one: `controls.attach(el)` puts a chip on `el`, and `createPanel(controls, anchor, close)` from `knobs/panel` opens one beside `anchor` from your own button (a debug bar's, say), with the same drag and kept spot.

Reduced motion (`prefers-reduced-motion`) turns off token glides, the cascade, the pop, edge blur, haptics, the spring dot, the editors' height reveals and the chip's squeeze, and panels simply fade in and out, with no stretch or blur.

### Reacting to Random, Reset and presets

`onChange` says where each change came from, so a page can answer the panel's own commands, such as replaying an animation when Random rolls:

```ts
const die = defineControls("die", schema, {
  onChange(patch, values, { source }) {
    // source: "local" | "randomize" | "mutate" | "reset" | "preset" | "variant" | "undo" | "redo"
    //       | "remote" | "compare" (holding \ previews earlier values, and their return)
    if (source === "randomize") rollDice()
  },
})
```

A reset that went back to the active preset rather than the defaults carries `base: true` in the third argument.

`patch` holds only the fields that changed. The die page (`examples/die.ts`) rolls its demo dice this way.

## Tokens

Generated from the token schema (`bun run scripts/tokens-table.ts`), with the Knobs theme's values. Inputs are the dials a theme turns, semantic tokens are what pieces read, hooks style one component.

The page roles (**Space**: `--k-space-inside` 4 · `sibling` 8 · `title` 12 · `group` 48 · `section` 96 · `column` 24, `--k-pad-page` 24 (16 under 640px) and `--k-pad-card` 12; **Type**: `--k-type-heading` 20/28 · `title` 16/24 · `body` 13/20 · `label` 12/16 · `small` 11/16, with `--k-leading-*`) are what a page built from knobs/ui (a walkthrough) is laid out on. They don't scale with density: density sizes a panel's controls, and the panel doesn't read them. Two weights (400, 500), mono one size down from what's around it, tabular figures.

<!-- tokens:start -->

### Accent

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-accent` | input | `#ffffff` | `#1c1c1e` | The one accent: primary actions, handles, focus. Hover, soft and selection derive from it in CSS. |
| `--k-accent-hover` | semantic | `#e5e5e5` | `#2e2e30` | Hovered accent. Derived: `color-mix(in oklch,var(--k-accent) 90%,var(--k-bg))`. |
| `--k-accent-soft` | semantic | `#ffffff26` | `#1c1c1e26` | Accent tint behind accent content. Derived: `color-mix(in oklch,var(--k-accent) 15%,transparent)`. |
| `--k-accent-fg` | semantic | `#ffffff` | `#1c1c1e` | Accent as text on bg (≥ Lc 60). |
| `--k-on-accent` | semantic | `#111111` | `#ffffff` | Content placed on a solid accent. |

### Inputs

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-contrast` | input | `1` | `1` | Contrast multiplier for fills and alpha borders (1 = default; the theme's 0–100 dial maps 50 → 1). |

### Shape

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-radius` | input | `8px` | `8px` | Control corner radius. 0 squares everything, including capsules. Scales with density. |
| `--k-radius-panel` | semantic | `calc(var(--k-radius) + var(--k-unit))` | `calc(var(--k-radius) + var(--k-unit))` | Panel and card radius, concentric with controls. Derived: `calc(var(--k-radius) + var(--k-unit))`. |
| `--k-radius-frame` | semantic | `calc(var(--k-radius) + min(var(--k-radius) * 999, var(--_k-pad) + 1px))` | `calc(var(--k-radius) + min(var(--k-radius) * 999, var(--_k-pad) + 1px))` | A tuning panel's outer corners: its cards' radius plus its padding and border, so the cards, the preset strip and the focus lens inside run concentric. Squares when --k-radius is 0. Derived: `calc(var(--k-radius) + min(var(--k-radius) * 999, var(--_k-pad) + 1px))`. |
| `--k-round` | semantic | `calc(var(--k-radius) * 999)` | `calc(var(--k-radius) * 999)` | Capsule radius that squares when --k-radius is 0. Use instead of 999px. Derived: `calc(var(--k-radius) * 999)`. |

### Size

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-density` | input | `1` | `1` | Size multiplier: compact .875, default 1, comfortable 1.1875. |
| `--k-unit` | semantic | `4px` | `4px` | The spacing unit. |
| `--k-row` | semantic | `round(calc(32px * var(--k-density)),2px)` | `round(calc(32px * var(--k-density)),2px)` | Row height. Derived: `round(calc(32px * var(--k-density)),2px)`. |
| `--k-width` | semantic | `288px` | `288px` | Panel width. |

### Type

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-font` | input | `system-ui,-apple-system,"SF Pro Text",sans-serif` | `system-ui,-apple-system,"SF Pro Text",sans-serif` | UI font stack. |
| `--k-mono` | input | `"SF Mono",SFMono-Regular,ui-monospace,Menlo,monospace` | `"SF Mono",SFMono-Regular,ui-monospace,Menlo,monospace` | Monospace font stack. |
| `--k-type-heading` | semantic | `20px` | `20px` | A page's title, weight 500. |
| `--k-leading-heading` | semantic | `28px` | `28px` | Line height for type-heading. |
| `--k-type-title` | semantic | `16px` | `16px` | Section titles (under their kicker), weight 500. |
| `--k-leading-title` | semantic | `24px` | `24px` | Line height for type-title. |
| `--k-type-body` | semantic | `13px` | `13px` | Prose, questions, list rows, step titles; 400, or 500 for emphasis. |
| `--k-leading-body` | semantic | `20px` | `20px` | Line height for type-body. |
| `--k-type-label` | semantic | `12px` | `12px` | Mono inside body text: code and paths. |
| `--k-leading-label` | semantic | `16px` | `16px` | Line height for type-label. |
| `--k-type-small` | semantic | `11px` | `11px` | Meta, controls, keys, timestamps; mono inside labels. |
| `--k-leading-small` | semantic | `16px` | `16px` | Line height for type-small. |
| `--k-font-size` | semantic | `round(calc(12px * (1 + (var(--k-density) - 1) * .5)),1px)` | `round(calc(12px * (1 + (var(--k-density) - 1) * .5)),1px)` | Body size; a 5-step scale derives privately. Derived: `round(calc(12px * (1 + (var(--k-density) - 1) * .5)),1px)`. |
| `--k-value-font` | semantic | `var(--k-font)` | `var(--k-font)` | Font for readouts and values (labPreset: mono). Derived: `var(--k-font)`. |

### Surfaces

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-bg-page` | semantic | `#0a0a0b` | `#e6e6e8` | The page behind panels; workspace backdrops. |
| `--k-bg-inset` | semantic | `#151516` | `#ededef` | Wells sunk into a panel: tracks, inputs, segmented backgrounds. |
| `--k-bg` | semantic | `#1c1c1d` | `#f5f5f7` | The panel surface. |
| `--k-bg-raised` | semantic | `#232324` | `#ffffff` | Raised within a panel: the active segment, cards on a panel. |
| `--k-bg-overlay` | semantic | `#29292a` | `#ffffff` | Floating surfaces: menus, popovers, tooltips. |

### Fills

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-fill` | semantic | `#f4f5f90e` | `#1a1a1d0e` | Resting fill for controls. Derived: `color-mix(in oklch,var(--k-fg) calc(5.5% * var(--k-contrast)),transparent)`. |
| `--k-fill-hover` | semantic | `#f4f5f914` | `#1a1a1d14` | Hovered fill. Derived: `color-mix(in oklch,var(--k-fg) calc(8% * var(--k-contrast)),transparent)`. |
| `--k-fill-selected` | semantic | `#f4f5f91c` | `#1a1a1d1c` | Pressed or selected fill. Derived: `color-mix(in oklch,var(--k-fg) calc(11% * var(--k-contrast)),transparent)`. |

### Foreground

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-fg` | semantic | `#f4f5f9` | `#1a1a1d` | Primary text and icons (≥ Lc 90 on bg). |
| `--k-fg-2` | semantic | `#d0d0d5` | `#59595d` | Secondary text: labels (≥ Lc 75). |
| `--k-fg-3` | semantic | `#9e9ea3` | `#96969b` | Tertiary text: metadata, units, captions (≥ Lc 45). |
| `--k-fg-4` | semantic | `#7d7e81` | `#b4b5b9` | Placeholder and disabled text (≥ Lc 30). |

### Borders

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-border-subtle` | semantic | `#f4f5f90f` | `#1a1a1d0f` | Hairline edges and dividers (below Lc 15 by design). Derived: `color-mix(in oklch,var(--k-fg) calc(6% * var(--k-contrast)),transparent)`. |
| `--k-border` | semantic | `#f4f5f91a` | `#1a1a1d1a` | Default borders. Derived: `color-mix(in oklch,var(--k-fg) calc(10% * var(--k-contrast)),transparent)`. |
| `--k-border-strong` | semantic | `#58585c` | `#d3d3d7` | Interactive edges (≥ Lc 15; solid). |

### Status

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-ok` | semantic | `#59d38c` | `#0a7e3a` | Success. |
| `--k-warn` | semantic | `#f7bc50` | `#b66c00` | Warning. |
| `--k-danger` | semantic | `#fa6863` | `#cc2827` | Error, destructive. Put text on danger-soft rather than bare bg. |
| `--k-info` | semantic | `#55b8f8` | `#0071b3` | Informational. |
| `--k-ok-soft` | semantic | `#59d38c26` | `#0a7e3a26` | Success tint. Derived: `color-mix(in oklch,var(--k-ok) 15%,transparent)`. |
| `--k-warn-soft` | semantic | `#f7bc5026` | `#b66c0026` | Warning tint. Derived: `color-mix(in oklch,var(--k-warn) 15%,transparent)`. |
| `--k-danger-soft` | semantic | `#fa686326` | `#cc282726` | Danger tint. Derived: `color-mix(in oklch,var(--k-danger) 15%,transparent)`. |
| `--k-info-soft` | semantic | `#55b8f826` | `#0071b326` | Info tint. Derived: `color-mix(in oklch,var(--k-info) 15%,transparent)`. |

### Interaction

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-focus` | semantic | `#ffffff` | `#1c1c1e` | Focus ring colour (drawn as a 2px bg gap, then 2px of focus). Derived: `var(--k-accent)`. |
| `--k-selection` | semantic | `#ffffff3d` | `#1c1c1e3d` | Selected rows and ranges. Derived: `color-mix(in oklch,var(--k-accent) 24%,transparent)`. |
| `--k-scrim` | semantic | `#00000099` | `#00000040` | Dimming behind modal layers. |

### Data

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-diff-add` | semantic | `#59d38c` | `#0a7e3a` | Added lines; line and word tints derive privately (12% / 38%). Derived: `var(--k-ok)`. |
| `--k-diff-del` | semantic | `#fa6863` | `#cc2827` | Deleted lines. Derived: `var(--k-danger)`. |
| `--k-diff-mod` | semantic | `#f7bc50` | `#b66c00` | Modified lines. Derived: `var(--k-warn)`. |
| `--k-before` | semantic | `#9e9ea3` | `#96969b` | Before in a comparison, and only Before: its label and side of the seam. Neutral unless a theme gives it a colour. Derived: `var(--k-fg-3)`. |
| `--k-after` | semantic | `#f4f5f9` | `#1a1a1d` | After in a comparison, and only After. Derived: `var(--k-fg)`. |
| `--k-series-1` | semantic | `#6db0f4` | `#2378c2` | Chart series 1. |
| `--k-series-2` | semantic | `#66c189` | `#008b4f` | Chart series 2. |
| `--k-series-3` | semantic | `#d79f4c` | `#9c6900` | Chart series 3. |
| `--k-series-4` | semantic | `#ed8c84` | `#b84d49` | Chart series 4. |
| `--k-series-5` | semantic | `#bc97e8` | `#885cb5` | Chart series 5. |
| `--k-series-6` | semantic | `#25c2c2` | `#008686` | Chart series 6. |

### Space

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-space-inside` | semantic | `var(--k-unit)` | `var(--k-unit)` | Parts of one thing: an icon and its label, a meta line and its title. Derived: `var(--k-unit)`. |
| `--k-space-sibling` | semantic | `calc(var(--k-unit) * 2)` | `calc(var(--k-unit) * 2)` | Siblings in a group: buttons in a row, a list item's lines. Derived: `calc(var(--k-unit) * 2)`. |
| `--k-space-title` | semantic | `calc(var(--k-unit) * 3)` | `calc(var(--k-unit) * 3)` | A heading and what it heads. Derived: `calc(var(--k-unit) * 3)`. |
| `--k-space-group` | semantic | `calc(var(--k-unit) * 12)` | `calc(var(--k-unit) * 12)` | Groups inside a section (prose, video, diff), stacked media, feed items (a hairline in the middle). Derived: `calc(var(--k-unit) * 12)`. |
| `--k-space-section` | semantic | `calc(var(--k-unit) * 24)` | `calc(var(--k-unit) * 24)` | Sections of a page (the intro, the updates, each PR), a hairline in the middle. Derived: `calc(var(--k-unit) * 24)`. |
| `--k-space-column` | semantic | `calc(var(--k-unit) * 6)` | `calc(var(--k-unit) * 6)` | Columns: a contents rail and the page, media side by side. Derived: `calc(var(--k-unit) * 6)`. |
| `--k-pad-page` | semantic | `calc(var(--k-unit) * 6)` | `calc(var(--k-unit) * 6)` | A page's edge; 16px under 640px wide. Derived: `calc(var(--k-unit) * 6)`. |
| `--k-pad-card` | semantic | `calc(var(--k-unit) * 3)` | `calc(var(--k-unit) * 3)` | Inside a card or popover. Derived: `calc(var(--k-unit) * 3)`. |

### Material

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-shadow-raised` | semantic | `0 1px 2px light-dark(#0000001f,#00000029)` | `0 1px 2px light-dark(#0000001f,#00000029)` | Small lift for raised controls. |
| `--k-shadow-overlay` | semantic | `0 12px 36px light-dark(#00000024,#00000085),0 1px 2px light-dark(#00000014,#0000004d)` | `0 12px 36px light-dark(#00000024,#00000085),0 1px 2px light-dark(#00000014,#0000004d)` | Floating panels, menus, popovers. |
| `--k-glass` | semantic | `0.6` | `0.6` | Backdrop glass amount (0 = opaque). |
| `--k-glow` | semantic | `0.5` | `0.5` | Specular glow amount. |
| `--k-rim` | semantic | `#ffffff1a` | `#ffffff99` | Top-edge highlight hairline. |

### Motion

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-spring` | semantic | `0.3 0` | `0.3 0` | Default spring as `duration bounce` (the motion module's `default`). |
| `--k-hover-in` | semantic | `0` | `0` | Hover wash fade-in, unitless milliseconds. |
| `--k-hover-out` | semantic | `120` | `120` | Hover wash fade-out, unitless milliseconds. |
| `--k-z` | semantic | `2147480000` | `2147480000` | Base of knobs' stacking ladder; layers add small offsets. |

### Hooks

| Token | Tier | Dark | Light | |
|---|---|---|---|---|
| `--k-slider-track` | hook | `#f4f5f90e` | `#1a1a1d0e` | Slider track. Derived: `var(--k-fill)`. |
| `--k-slider-fill` | hook | `#fcfcfd49` | `#1b1b1e49` | Slider value fill. Derived: `color-mix(in oklch,var(--k-accent) 20%,var(--k-fill-selected))`. |
| `--k-slider-handle` | hook | `#ffffff` | `#1c1c1e` | Slider handle and range thumbs. Derived: `var(--k-accent)`. |
| `--k-toggle-thumb-off` | hook | `#ffffff` | `#ffffff` | A switch's thumb while off, and the ring around colour and gradient thumbs. Derived: `#ffffff`. |
| `--k-toggle-track` | hook | `#f4f5f91c` | `#1a1a1d1c` | Toggle track, off. Derived: `var(--k-fill-selected)`. |
| `--k-toggle-track-on` | hook | `#ffffff` | `#1c1c1e` | Toggle track, on. Derived: `var(--k-accent)`. |
| `--k-toggle-thumb` | hook | `#111111` | `#ffffff` | Toggle thumb. Derived: `var(--k-on-accent)`. |
| `--k-segmented-track` | hook | `#151516` | `#ededef` | Segmented control background. Derived: `var(--k-bg-inset)`. |
| `--k-segmented-active` | hook | `#232324` | `#ffffff` | Active segment. Derived: `var(--k-bg-raised)`. |
| `--k-timeline-playhead` | hook | `#ffffff` | `#1c1c1e` | Timeline playhead. Derived: `var(--k-accent)`. |
| `--k-split-gutter` | hook | `#f4f5f90f` | `#1a1a1d0f` | Split pane divider. Derived: `var(--k-border-subtle)`. |
| `--k-compare-divider` | hook | `#f4f5f9` | `#1a1a1d` | Before/after divider line. Derived: `var(--k-fg)`. |
| `--k-compare-stage` | hook | `#f4f5f90e` | `#1a1a1d0e` | Compare stage background. Derived: `var(--k-fill)`. |
| `--k-activity-rail` | hook | `#58585c` | `#d3d3d7` | Activity rail line. Derived: `var(--k-border-strong)`. |
| `--k-picker-card` | hook | `#f4f5f90e` | `#1a1a1d0e` | Picker card. Derived: `var(--k-fill)`. |
| `--k-pane-bg` | hook | `#1c1c1d` | `#f5f5f7` | knobs/ui pane card. Derived: `var(--k-bg)`. |
| `--k-button-bg` | hook | `#f4f5f90e` | `#1a1a1d0e` | Button fill. Derived: `var(--k-fill)`. |
| `--k-button-border` | hook | `#00000000` | `#00000000` | Button border. Derived: `transparent`. |
| `--k-button-fg` | hook | `#f4f5f9` | `#1a1a1d` | Button text. Derived: `var(--k-fg)`. |
| `--k-row-hover` | hook | `#f4f5f907` | `#1a1a1d07` | Row hover wash. Derived: `color-mix(in oklch,var(--k-fill) 50%,transparent)`. |
| `--k-group-label` | hook | `#9e9ea3` | `#96969b` | Folder and group headings. Derived: `var(--k-fg-3)`. |
| `--k-modified` | hook | `#9e9ea3` | `#96969b` | Marker for values changed from their default. Derived: `var(--k-fg-3)`. |

### Renamed

| Old | New |
|---|---|
| `--ku-accent` | `--k-accent` |
| `--ku-radius` | `--k-radius` |
| `--ku-font` | `--k-font` |
| `--ku-mono` | `--k-mono` |
| `--k-page` | `--k-bg-page` |
| `--ku-page` | `--k-bg-page` |
| `--ku-bg` | `--k-bg` |
| `--k-surface` | `--k-fill` |
| `--ku-surface` | `--k-fill` |
| `--k-surface-hi` | `--k-fill-selected` |
| `--ku-surface-hi` | `--k-fill-selected` |
| `--k-text` | `--k-fg` |
| `--ku-text` | `--k-fg` |
| `--k-label` | `--k-fg-2` |
| `--ku-label` | `--k-fg-2` |
| `--k-dim` | `--k-fg-3` |
| `--ku-dim` | `--k-fg-3` |
| `--k-edge` | `--k-border-subtle` |
| `--k-line` | `--k-border` |
| `--ku-line` | `--k-border` |
| `--k-line-hi` | `--k-border-strong` |
| `--ku-line-hi` | `--k-border-strong` |
| `--ku-warn` | `--k-warn` |
| `--k-critical` | `--k-danger` |
| `--ku-critical` | `--k-danger` |
| `--k-ui-select` | `--k-selection` |
| `--ku-select` | `--k-selection` |
| `--k-panel-radius` | `--k-radius-panel` |
| `--ku-panel-radius` | `--k-radius-panel` |
| `--ku-row` | `--k-row` |
| `--ku-font-size` | `--k-font-size` |
| `--ku-value-font` | `--k-value-font` |
| `--k-lift-shadow` | `--k-shadow-raised` |
| `--k-shadow` | `--k-shadow-overlay` |
| `--ku-shadow` | `--k-shadow-overlay` |
| `--ku-rim` | `--k-rim` |
| `--ku-hover-in` | `--k-hover-in` |
| `--ku-hover-out` | `--k-hover-out` |
| `--k-fill-rest` | `--k-slider-fill` |
| `--k-handle` | `--k-slider-handle` |
| `--k-thumb` | `--k-toggle-thumb-off` |
| `--k-seg-bg` | `--k-segmented-track` |
| `--ku-seg-bg` | `--k-segmented-track` |
| `--k-seg-active` | `--k-segmented-active` |
| `--k-ui-divider` | `--k-split-gutter` |
| `--ku-divider` | `--k-split-gutter` |
| `--k-compare-line` | `--k-compare-divider` |
| `--k-activity-line` | `--k-activity-rail` |
| `--k-ui-pane` | `--k-pane-bg` |
| `--ku-pane-bg` | `--k-pane-bg` |
| `--k-button-line` | `--k-button-border` |
| `--k-button-color` | `--k-button-fg` |
| `--k-group-ink` | `--k-group-label` |
| `--k-group-color` | `--k-group-label` |
| `--k-tray-pad` | `--_k-tray-pad` |
| `--k-pad` | `--_k-pad` |
| `--k-inset` | `--_k-inset` |
| `--ku-inset` | `--_k-inset` |
| `--k-gap` | `--_k-gap` |
| `--k-radius-md` | `--_k-radius-md` |
| `--k-radius-sm` | `--_k-radius-sm` |
| `--k-control-h` | `--_k-control-h` |
| `--ku-control-h` | `--_k-control-h` |
| `--k-value-size` | `--_k-value-size` |
| `--ku-value-size` | `--_k-value-size` |
| `--k-text-title` | `--_k-text-title` |
| `--k-text-body` | `--_k-text-body` |
| `--k-text-control` | `--_k-text-control` |
| `--k-text-meta` | `--_k-text-meta` |
| `--ku-text-meta` | `--_k-text-meta` |
| `--k-text-cap` | `--_k-text-cap` |
| `--k-font-weight` | `--_k-weight` |
| `--ku-font-weight` | `--_k-weight` |
| `--k-label-weight` | `--_k-weight-label` |
| `--ku-label-weight` | `--_k-weight-label` |
| `--k-title-weight` | `--_k-weight-title` |
| `--ku-title-weight` | `--_k-weight-title` |

<!-- tokens:end -->

## Show, hide and unlock

**Backtick.** `` ` `` shows and hides every panel and chip on the page at once, the way a page's
dev tools come and go together. It works anywhere outside a text field, and never with ⌘, ⌃ or ⌥
held. One key for the whole page, not just the focused panel: you hide them to see the page, and a
panel you can't see can't have focus to aim at. If any panel is showing the key hides them all;
otherwise it shows them all. Panels mounted later (scrolled into view) follow the last press.

```ts
hero.mount(column)                        // ` hides and shows it with the page's other panels
hero.mount(column, { toggleKey: false })  // always shown
defineControls("hero", schema, { toggleKey: "F8" }) // its panels and chips listen for F8
```

- **Remembered per store**, in its `storage`, so a reload puts the page back as you left it, with
  no animation. Stores with `storage: null` start shown.
- **Hidden is hidden.** The panel takes no space and is `hidden` and `inert`: no Tab stop, no hint
  code, no click, and the WebGPU overlay stops drawing it. Chips hide too, hint mode stops, and
  focus that was in a panel goes back there when it shows again.
- **Motion.** Leaving, a panel fades with a little blur (4 px at most) and scale (.96 at least) on a
  .25 s spring with no bounce; arriving is the same in reverse on .32 s. An inline panel also folds
  its space shut, its content gone before the last of the height, so the page below glides up.
  Pressing again mid-way turns it around from where it is. Both renderers draw the same; reduced
  motion only fades.
- **Off by default** for shipped stores (`ship`, product UI) and full pages (`mountPage`, the whole
  tool); give them a `toggleKey` to opt in. The `?` popover lists the key.
- Your own dev tools can join with ``toggleLayer(document).register({ id, key: "`", storage,
  root, show })`` from `knobs/panel`, or keep their own handler: knobs doesn't claim the key, so a
  page's backtick listener still runs and both come and go together.

**A secret unlock for a live site.** A production build locks every store to its constants and
leaves the panel out (see below). To tune a deployed page anyway, let the deploy be unlocked:

```ts
import { defineControls, knob, unlock } from "knobs"

const hero = defineControls("hero", { radius: knob(12, { min: 0, max: 40, step: 1 }) })
hero.mount(column) // nothing for visitors: hero.get() is the shipped constants

unlock({ panel: () => import("knobs/panel") })
```

Visitors download no panel code and see the constants. You unlock it by typing **knobs** anywhere
outside a text field, opening the page with **`?knobs`**, or tapping the **top-right corner three
times** quickly (on a phone). Then the panel chunk loads, panels and chips appear, values come from
this browser's storage, and a brief "knobs unlocked" confirms it. It's remembered in localStorage
until you lock it again: the same secret again, `?knobs=off`, or the handle's `lock()`. Locking takes
the panels down and puts the constants back, which is also how to check what visitors see.

```ts
import { KONAMI, unlock } from "knobs"

const gate = unlock({
  panel: () => import("knobs/panel"),
  sequence: KONAMI,     // a word ("knobs"), key names (↑↑↓↓←→←→BA), or false
  query: "tune",        // ?tune unlocks, ?tune=off locks; false for none
  corner: "top-left",   // three taps there; false for none
  persist: false,       // this page view only
})
gate.unlocked // also gate.unlock(), gate.lock(), gate.dispose()
```

It's a secret, not access control: anyone who finds it can tune the page in their own browser, and
nothing they change reaches anyone else. In development `unlock` changes nothing, since stores are
live there already. Once unlocked, the backtick hides and shows panels as usual.

How others do it: Leva and Tweakpane have a `hidden` prop; dat.gui hides every GUI on `H` (lil-gui
dropped it); Theatre.js toggles its studio with ⌥\\; Stripe's Workbench opens with `~`; Vercel's
toolbar hides with ⌘. and only shows to signed-in team members. A typed word, a query flag kept in
localStorage and a corner gesture for phones cover a keyboard, a link and a touch screen without an
account.

## Explore in development. Ship constants.

```ts
splat.locked // frozen schema defaults
splat.get()  // live while enabled; the exact locked object otherwise
```

The package has two core exports selected through the standard `development` condition. Vite selects it automatically in dev. The default export is production-safe: **disabled unconditionally, even if `enabled: true` is passed**. `attach()` and `mount()` are no-ops, and their panel imports are erased from that entry. The one way back is a page that calls [`unlock`](#show-hide-and-unlock) and someone who knows its secret; the panel then loads from the module `unlock` names.

## API Summary

### Fields & Descriptors

| Function | Behavior |
| --- | --- |
| `knob(value, { min, max, step?, unit?, decimals?, detents?, shortcut?, label?, group?, groupLabel?, section?, sectionLabel? })` | Numeric slider control with rolling readout and inline editor. `detents: false` lets drags glide through the default, the base and the middle. |
| `choice(value, ["a", "b"], { label?, group?, shortcut?, labels?, display?, variants? }?)` | Nonempty string choices with literal union inference. `variants: true` makes the options the preset strip's chips, with no row (see [Versions of a design](#versions-of-a-design-variants-in-the-strip)). |
| `toggle(value, { label?, group?, shortcut?, random? }?)` | Boolean switch control. Out of Random and Mutate unless `random: true`. |
| `spring({ duration?, bounce? }?, meta?)` | SwiftUI-style spring: two sliders beside its live curve. |
| `color("#hex" \| "oklch(L C H)" \| { l, c, h }, meta?)` | OKLCH colour kept inside sRGB, as an `oklch()` string; swatch, hex and hue/chroma/lightness strips. |
| `point({ x, y }, { min, max, step?, ...meta })` | 2D pad; bounds and step take a number or `{ x, y }`. |
| `easing([x1, y1, x2, y2] \| name, meta?)` | Cubic bezier with a mini curve, a handle editor and named curves. |
| `gradient([{ at, color }], { space?, presets?, ...meta })` | A colour ramp of 2–32 stops, blended in `oklab` (default) or `srgb`; a strip of draggable stops with the colour editor for the selected one. |
| `curve([{ x, y }] \| shape, { range?, interp?, shapes?, presets?, ...meta })` | A 1D curve of 2–64 points (ends pinned to x 0 and 1), `smooth` (monotone cubic), `linear` or `step`; a graph of draggable points with shape chips. |
| `sampleGradient(stops, t, { space?, as? })` / `gradientCss(stops, { space?, direction? })` | A gradient's colour at `t` (`oklch()`, or `as: "hex" \| "rgb" \| "linear"`); a CSS `linear-gradient()`. |
| `sampleCurve(points, x, { interp? })` / `CURVE_SHAPES` | A curve's y at `x`; the built-in shapes (`linear`, `ease-out`, `inverse²`, `smoothstep`, `bell`) over 0–1. |
| `vec2({ x, y }, { min, max, step?, link?, linked?, axes? })` / `vec3({ x, y, z }, …)` | Inline number cells, optionally linked for uniform scaling; `axes: ["x", "z"]` names them. |
| `range([low, high], { min, max, step?, unit? })` | One slider with two thumbs. |
| `angle(degrees, { min?, max?, step?, wrap? })` | A dial, 0° up and clockwise; 0–360 wrapping by default. |
| `seed(value, { min?, max? })` / `keybind(combo?)` | A whole number with a die; a captured key combination. Both stay out of Random and Mutate by default. |
| `text(value?, { multiline?, placeholder? })` | Words in a field, or lines in a box that grows with them. Out of Random and Mutate. |
| `toolbar([{ id?, label, icon?, shortcut?, global?, disabled?, run? }], { labels? })` | A row of buttons with shortcut chips; presses call `onAction(id)`. `shortcut` is a key, or `{ key, scope: "page" \| "panel" \| "none" }`; `toolbarShortcut(item)` reads either. |
| `watch` / `sparkline` / `graph` / `meter` / `table` / `log` (`{ label?, unit?, decimals?, format?, hz?, get?, … }`) | Readout rows that hold no value; push with `controls.watch(key, value)`. See [Readouts](#readouts-live-values-sparklines-graphs-meters-tables-and-logs). |
| `springCss(spring)` / `springMotion(spring)` / `bezierCss(curve)` / `colorHex(color)` | Turn values into CSS, ω/ζ, or hex. |
| `fromDescriptors(descriptors)` | Converts runtime `ControlDescriptor[]` into a `Schema`. |
| `createRemoteControls(id, descriptors, options)` | Creates a remote-synced `Controls` store with `.swift(group?)` codegen and `.update(descriptors, values, { land })`; incoming values skip keys in hand or changed here in the last 600 ms, and the newest lands when the hold ends. |
| `fromSettings(groups, home?)` | A hosted prototype's settings sections as descriptors and values. |
| `unlock({ panel, sequence?, query?, corner?, persist? })` / `KONAMI` | Lets a production deploy be unlocked by a typed secret, `?knobs` or three corner taps; returns `{ unlocked, unlock(), lock(), dispose() }`. See [Show, hide and unlock](#show-hide-and-unlock). |
| `action(label, { run, shortcut?, global?, rebind? })` / `flatSpring({ duration, bounce }, meta)` | A button row, with a shortcut its key cap can rebind; two flat number fields drawn as one spring card. `actionShortcut(field)` reads an action's shortcut as `{ key, scope }`. |
| Field meta `random?`, `disabled?`, `readOnly?`, `folded?`, `tab?`, `subsection?` | On any field or descriptor: `random: false` stays out of Random and Mutate (switches, seeds and key combinations start out; `random: true` brings them in); `disabled` / `readOnly` (boolean or `(values) => boolean`) gate the row; `folded` makes its group foldable, starting folded; `tab` puts the row on a tab; `subsection` puts it under a sub-heading in its group. |
| Field meta `groupDescription?: string`, `sectionDescription?: string`, `sectionFolded?: boolean` | On any field or descriptor (the first field of a group or section that gives one wins): a muted line under the card's title (in a panel or a page) or a page section's heading; `sectionFolded` makes a page section foldable, starting folded. |
| `mountPanel(controls, container, options?)` (`knobs/panel`) | An inline panel. Beside theme, density, renderer and keys: `preset`, `header` (`false` or `{ title?, buttons? }`), `crumbs` (`true` adds the scope line), `session`, `groupFolded`, `groupSummary`, `onActive`, `subsectionFolded`, `foldStorage`, `tabs`, `tab`, `onTab`, `search`, `groupRandom(group, mode)`, `rowAccessory(key)`, `marks`, `haptics`, `detents`, `sound`. The handle adds `panel.fold(group, folded?)`, `panel.unfold(key)`, `panel.tab(id?)`, `panel.search(query?, chips?)` (returns `{ query, chips }`) and `panel.updateAccessories()`. |
| `sound` (`knobs/panel`) | The page's sound effects (see **Sound**): `enabled`, `enable(on?)`, `volume`, `setVolume(v)`, `theme`, `setTheme("glass" \| "mech")`, `play(cue \| layers, detail?)`, `output()`, `subscribe(listener)`. Panels play only with `sound` on their mount. |
| `mountPage(controls, container, options?)` (`knobs/panel`) | A full page of group cards in sections under a sticky header; `page.card({ title?, section?, element?, collapsed?, summary?, description? })` adds custom cards (`card.collapse(collapsed?)`, `card.collapsed`, `card.summary(content \| null)`), and `page.highlight({ groups?, sections? } \| null, { reveal?, expand? })` marks what's on screen. Options take `groupLabels`, `sectionLabels`, `groupDescriptions`, `sectionDescriptions`, `presetLabels`, `defaultLabel`, `groupPresetDisplay` and `groupFolded` over the store's. |
| `MountPageOptions` folds | `sectionFolded?: SectionFolded` (`boolean \| Record<string, boolean>`), `foldStorage?: StoragePort \| null`, `nav?: boolean`, `groupSummary?(group, info: FoldSummaryInfo): string \| Node \| null` (a panel's option too), `sectionSummary?(section, info: FoldSummaryInfo): string \| Node \| null`; `FoldSummaryInfo` is `{ preset: string \| null, changed: number, keys: readonly string[] }`. |
| `MountPanelOptions.onActive?: (at: PanelActive \| null) => void` | The card (`{ group }`) or row (`{ group, key }`) under the pointer or focus, `null` for nothing; on `mountPanel`, `controls.mount` and `mountPage`. At most once a frame, never the same value twice, and a last `null` when the panel goes. `PanelActive` is `{ group: string, key?: string }`. |
| `page.fold(group: string, folded?: boolean, options?: PageFoldOptions): void` / `page.foldSection(section: string, folded?: boolean, options?: PageFoldOptions): void` / `page.sectionFolded(section: string): boolean` | Fold a group's card or a section or open it (toggles without `folded`), and ask which a section is. `PageFoldOptions` is `{ remember?: boolean, reveal?: boolean }`; `remember` defaults to `true`. |
| `page.reveal(target: { section: string } \| { group: string }, options?: { remember?: boolean }): void` | Open a section (or a group's card and its section) and glide it into view; `remember` defaults to `false`. |
| `page.sections(): readonly PageSectionInfo[]` / `page.onSections(listener: (sections: readonly PageSectionInfo[]) => void): () => void` | `PageSectionInfo` is `{ id, label, description?, folded, changed, groups: PageGroupInfo[] }`; `PageGroupInfo` is `{ id, label, folded, changed, preset: string \| null }`. |
| `page.activeSection(): string \| undefined` / `page.onActiveSection(listener: (section: string \| undefined) => void): () => void` | The section in view as the page scrolls. |

### Store (`Controls<S>`)

- `controls.get()` / `controls.getServerSnapshot()` / `controls.locked`
- `controls.set(patch, { coalesce? })`
- `controls.sync(values, { replace?, land?, mixed? })` — apply external state without recording undo or emitting a local change; held keys keep theirs
- Options `random`, `tunable(key, values)`, `history` (a `HostHistory`), `persist` (`"all" | "variants" | "none"`) and `onGesture({ key, phase: "start" | "end" })`; see [Embedding options](#embedding-options)
- `controls.refresh()` — re-check function `disabled` / `readOnly` flags and row accessories without new values
- `controls.canRoll(key)` / `controls.isDisabled(key)` / `controls.isReadOnly(key)` / `controls.persist`
- `controls.setMixed(keys, on?)` / `controls.isMixed(key)`
- `controls.hold(key, on?)` / `controls.isHeld(key)` / `controls.landing`
- `controls.action(key, item?)` — press an action row, or a toolbar's item
- `controls.shortcut(key, item?)` / `controls.rebind(key, combo, item?)` — an action's (or toolbar button's) shortcut in force, and a rebinding saved with the values (`""` none, `undefined` back to the declared one)
- `controls.watch(key, value)` / `controls.watched(key)` — push to a readout row (`null` clears it); the latest value
- `controls.reset(keys?)` / `controls.resetKey(key)` / `controls.resetGroup(group)`: back to the active preset, else the defaults
- `controls.isModified(key?)` (off the active preset, else the defaults) / `controls.canReset(keys?)` / `controls.modified()` (off the defaults)
- `controls.undo()` / `controls.redo()` / `controls.canUndo` / `controls.canRedo`
- `controls.randomize(keys?)` / `controls.mutate(keys?)`: skip locked fields; one undo step each
- `controls.lock(keys, locked = true)` / `controls.isLocked(key)`: locks are saved with the values (remote controls keep them in memory)
- `controls.compare(hold)` / `controls.comparing`: while held, `get()` returns the previous undo entry; no history, no storage
- `controls.preset(id, { coalesce?, scope? })` / `controls.matchingPreset(scope?)`
- `controls.activePreset(scope?)` / `controls.activeGroupPreset(group)` / `controls.baseValues()`: the base Reset returns to and Random explores around
- `controls.scopes` / `controls.scopeOf(key)`: the tabs and groups with presets of their own (`scopedPresets`), each `{ id, keys, presets, variants }`, and whose presets move a key
- `controls.groupPresets` / `controls.groupPreset(group, index, { coalesce? })` / `controls.matchingGroupPreset(group)` / `controls.groupPresetDisplay`
- `controls.groupLabel(id)` / `controls.sectionLabel(id)` / `controls.presetLabel(id, scope?)`: display labels (`groupLabels`, `sectionLabels`, `presetLabels`, `defaultLabel`, or the fields' `groupLabel` / `sectionLabel`)
- `controls.groupDescription(group): string | undefined` / `controls.sectionDescription(section): string | undefined`: `groupDescriptions` / `sectionDescriptions`, else the fields' `groupDescription` / `sectionDescription`
- `controls.groupFolded` / `controls.sectionFolded`: how groups and a page's sections start, as given to `defineControls` or `createRemoteControls` (`groupFolded?: Record<string, boolean>`, `sectionFolded?: SectionFolded`); mounts read them under their own
- `controls.code("ts" | "json" | "jsx", values?)`
- `controls.variants.list()` / `.save(name?)` / `.load(id, { coalesce? })` / `.rename(id, name)` / `.remove(id)` / `.export()` / `.import(json)`
- `controls.attach(element, chip?)` — floating chip + anchored panel; `chip` (`{ label?, reveal?, shortcut? }`) overrides the store's `chip` option
- `controls.mount(container, options?)` — inline panel
- `controls.toggleKey` — the key that shows and hides its panels and chips (`` "`" `` by default, `false` for shipped stores); `toggleKey` on the mount overrides it

### Workspace pieces (`knobs/ui`)

| Function | Behavior |
| --- | --- |
| `split(container, { panes, direction?, id?, storage?, onLayout?, preset?, theme? })` | Resizable panes and docks that collapse to rails or headers; layouts saved by `id`. |
| `tree(container, { items, onSelect?, onMove?, onRename?, toggles?, filter?, typeahead?, … })` | A virtualised outliner with keyboard moves, drag reorder and rename; `typeahead: false \| (key) => boolean` leaves letters to the page. |
| `codeDiff(container, { patch? \| files?, file?, layout?, wrap?, height?, onFile?, onLines?, … })` | A code diff, no card (needs `@pierre/diffs`); files and layouts fade in place. |
| `diffReview(container, { patch? \| files?, id?, … })` | The changed files (a filter, viewed ticks) in a tree beside the diff, in a split. |
| `readout(field, { preset?, theme?, label? })` | A readout on its own: `{ element, push(value), value, dispose() }`. |
| `popover(anchor, content, { placement?, offset?, role?, label?, focus?, trap?, closeOnOutside?, onClose? })` | A floating layer that flips and shifts; `{ element, open, reposition(), close() }`. |
| `tooltip(el, text \| { text, shortcut?, placement?, delay? })` / `tooltips(doc)` | Delayed tooltips with instant hand-off and shortcut chips; `data-tip` attributes. |
| `commandPalette({ commands, onRun?, hotkey?, recents?, placeholder?, presence? })` / `commandsFrom(controls, options?)` | `⌘K` fuzzy command search; a store's actions, presets and fields as commands. |
| `confirm({ title, body?, confirm?, cancel?, destructive? })` | `Promise<boolean>`, modal, focus kept inside. |
| `toast(message, { tone?, linger?, action?, within? })` | A status pill at the bottom centre. |
| `menu(anchor, items, { placement?, label?, onSelect?, onClose? })` / `contextMenu(target, items, options?)` | Menus with icons, shortcut chips, checks, radios and submenus; a right-click or menu-key menu. |
| `timeline(container, { duration, time?, fps?, units?, markers?, ranges?, snap?, onSeek?, … })` | A zoomable ruler and playhead with markers, loop ranges and playback. |
| `compare(container, { before, after, mode?, modes?, wipe?, timeline?, onMode?, onWipe?, onView?, … })` / `compareStrip(container, { before, after, timeline })` | A before/after viewer for videos and images (a split screen zoomed together, or a wipe; a difference opted in) on one clock, with a loop; a frame strip with difference bars, on its own. |
| `selectionPill(container, { selected, rows?, radius?, copy?, color?, spring? })` | The one highlight that travels between rows: a fill on the state spring (or `spring`; the walkthrough's chapters and rail use `SPRINGS.snappy`) taking each row's box and radius, with a bright copy of the rows clipped to it; `update({ snap? })`, `dispose()`. |
| `icon(name, { small? })` / `ICON_NAMES` | Phosphor regular glyphs as SVG markup in `currentColor`, 16 px (12 px `small`). |
| `activity(container, { events, selected?, onSelect?, onActivate?, onToggle?, onPlay?, newest?, follow?, keys?, icons?, tints? })` | A rail of events on one continuous line, with groups that open in place; `{ set, add, select, expand, focus, destroy }`. |
| `optionPicker(container, { options, selected?, chosen?, onSelect?, onChoose?, body?, digits? })` | Options 1–n on a gliding card, the selected one's parameters (a panel) open under it. |
| `bento(container, { items, gap?, tolerance?, rowHeight?, fit?, blur?, picks?, onPick?, onZoom?, onActive? })` | An ideas grid: a bento of images and live content that zooms an item to fill the view; picks with Space. |
| `planBento(aspects, { width, height, gap?, tolerance?, rowHeight?, groups?, hero? })` | The bento's layout on its own: rects, mode, coverage and crop. |
| `canvas(container, { items, gap?, padding?, width?, minZoom?, maxZoom?, readout?, onView? })` | An infinite canvas: items as cards on a dotted page that pans and zooms freely; `fit`, `focus(id)`, `zoomTo`. |
| `walkthrough(container, { doc, onFeedback?, storage?, keys?, rail?, advance? })` / `mediaSlot(container, { media, steps? })` | The review page an agent writes (sections, steps, media from compares to histories, stacks and tables, notes and picks handed back); one step's media on its own. |
| `overlayLook({ preset?, theme? })` | The look every overlay takes. |
| `hints.register(root, () => targets, { listen?, rank? })` / `data-hint` | Joins the page's hint mode (`s`); `hints.start()`, `hints.stop()`. |
| `restyle(target, { preset?, theme?, density? })` | Re-themes the pieces and panels already on screen, live; on a document, later overlays too. |
| `place` / `fuzzy` / `rank` / `marks` | The overlays' pure model. |

## Develop

```sh
bun install
bun run build
bun run typecheck
bun run test                  # Vitest unit suite
bun run example               # Vite dev server with live HMR against src/
bun run test:browser          # Production leak check + Playwright browser suite
bun run format
```

MIT © 2026 Kit Langton.
