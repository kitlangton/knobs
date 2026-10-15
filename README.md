# knobs

Embeddable, keyboard-first tuning controls for React, Solid, and plain DOM.

Give a component a few knobs. Hover it to reveal a tiny affordance (`⚙ knobs`) and open a floating panel, or mount an inline panel directly into a sidebar or tuning dashboard. Explore a seed, a spring curve, a spacing, or a layout variant. Save the good variations. Copy constants back into your source and ship zero tuning UI in production.

Each panel's header carries **Random · Reset · Copy · Undo/Redo** as icon buttons, above a preset strip and inset-grouped cards of rows. Random is a die that tumbles when it rolls; `⌥`-click it (or press `⌥R`) to **mutate** instead: small changes around the current values, with a quarter turn of the die. Each group has its own quieter die beside its reset icon. **Lock** a row (`⇧L`, or the row's context menu) to keep it out of Random and Mutate; a small lock sits just left of its value. Hold **`\`** to see the values from before your last change, in the panel and your app alike. Shipped presets and your saved variants live together in that strip: `+` (or `⇧S`) saves the current values as a new chip, `⌫` on the strip deletes a saved one, and the `?` popover exports/imports them as JSON.

Beyond sliders, choices and switches there are four richer fields: a SwiftUI-style **spring** (duration and bounce beside its live step-response curve), an **OKLCH colour** (swatch and hex, with hue, chroma and lightness strips that paint their real gradients), a 2D **point** pad, and a cubic-bezier **easing** editor with named curves.

Zero runtime dependencies in core. Pure DOM panels with `@kitlangton/rolling-number` readouts and DialKit-style sliders: a flat accent-tinted fill that stops exactly at its ends, a hairline handle centred on its edge that fades where it would cross the text, a faint notch at the default that pulls drags onto it, stepped sliders (ten steps or fewer) that resist around their stop and snap to the next past halfway, `⌥`-drag for 1/10 speed, and a sideways trackpad pan that moves the value with your fingers like a drag (a `⇧` + wheel notch steps once); the same pan drags the selection pill across the preset strip or a choice, through as many options as you travel, and the momentum after you lift is ignored, so it stops where your fingers did. Switching presets ripples the changed rows top to bottom; selection pills and switch thumbs stretch toward where they're going and settle; the panel is a frosted glass surface over your work. A reload, Vite's included, keeps floating panels open, editors expanded and focus where it was, per tab. Thin adapters for React (`knobs/react`) and Solid (`knobs/solid`), plus a remote/descriptor mode for driving values over a WebSocket.

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
  theme: "auto",
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
- **`color(value, meta?)`**: takes `#rgb`, `#rrggbb`, `oklch(L C H)` or `{ l, c, h }` and stores a canonical `oklch(L C H)` string (L 0–1), so values serialise, compare and drop into CSS directly. Colours always fit sRGB: chroma is trimmed until they do, keeping lightness and hue. The chroma strip spans 0 to the sRGB gamut edge at the current hue and lightness, so scrubbing hue or lightness keeps the thumb's relative vividness while the readout shows the OKLCH chroma. `colorHex(value)` and `parseColor(value)` convert.
- **`point(value, { min, max, step? })`**: `{ x, y }`; bounds and step take a number or `{ x, y }`. y grows downward, as in CSS and UIKit. The pad marks the default with a ring; a drag is one undo step, and `⌥` drags at 1/10 speed.
- **`easing(value, meta?)`**: `[x1, y1, x2, y2]` or a name: `ease`, `ease-in`/`in`, `ease-out`/`out`, `ease-in-out`/`in-out`, `linear`, `smooth`, `snappy` or `back`. x stays within 0–1 and y within −0.6–1.6. The row shows a mini curve; the editor has two handles and the named curves as chips. `bezierCss(value)` writes the CSS.

### Inspector fields: vectors, ranges, angles, seeds, key combinations and toolbars

```ts
import { angle, defineControls, keybind, range, seed, toolbar, vec2, vec3 } from "knobs"

const node = defineControls("node", {
  tools: toolbar([
    { id: "play", label: "Play", icon: "play", shortcut: "Space" },
    { id: "retrigger", label: "Retrigger", icon: "retrigger", shortcut: "R", global: true },
  ]),
  position: vec3({ x: 0, y: 1.2, z: -4 }, { min: -50, max: 50, step: 0.1 }), // { x, y, z }
  scale: vec3({ x: 1, y: 1, z: 1 }, { min: 0.01, max: 10, step: 0.01, linked: true }),
  pivot: vec2({ x: 0.5, y: 0 }, { min: 0, max: 1, step: 0.01 }),             // { x, y }
  visible: range([4, 40], { min: 0, max: 100, step: 0.5, unit: "m" }),       // [low, high]
  yaw: angle(90),                                                             // degrees
  seed: seed(1234),                                                           // a whole number
  fire: keybind("Space"),                                                     // "Meta+Shift+K", "" for none
}, { onAction: (id) => run(id) })
```

- **`vec2(value, { min, max, step?, unit?, decimals? })` / `vec3(…)`**: inline x, y (and z) number
  cells. Each cell is a ↑↓ stop: drag it sideways or press ←/→ to scrub (`⇧` ×10, `⌥` finest),
  Enter or a digit to type. `link: true` adds a link button; while linked (`linked: true` starts
  that way) changing one axis scales the others with it.
- **`range([low, high], { min, max, step?, unit?, decimals? })`**: one slider with two thumbs that
  can't cross. The nearer thumb follows the pointer; a press well inside the band moves the whole
  band. Each thumb is a stop: ←/→ move it, Enter types it.
- **`angle(value, { min?, max?, step?, wrap? })`**: degrees on a small dial, 0° up and clockwise.
  0–360 by default, where `wrap` (on for a full turn) carries 359° on to 0°. Drag the hand round
  (`⇧` snaps to 15°) or scrub the readout; ←/→ turn it, Enter types it.
- **`seed(value, { min?, max? })`**: a whole number with a die. Clicking the die or pressing Space
  rolls a new one; ←/→ step it and Enter types it. Random and Mutate leave seeds alone unless the
  field says `random: true`.
- **`keybind(value?)`**: a key combination such as `"Meta+Shift+K"` (stored canonically, `""` for
  none), drawn as key caps. Enter or a click starts listening; the next combination is the value,
  Esc cancels and ⌫ clears. Not rolled by Random or Mutate.
- **`toolbar(items)`**: a wrapping row of buttons with an icon (`play`, `pause`, `frame`,
  `retrigger`, `clear`, `target`, `camera`, `sparkle`, … or SVG path data on a 256 grid), a label
  and a shortcut chip. A press calls the item's `run` and `onAction(id)`; `controls.action(key, id)`
  does it from code. Shortcuts work while the panel has focus, and anywhere on the page with
  `global: true` (not while typing). A panel's shortcuts win over its own single-key commands. The
  row holds no value; ←/→ move along it and Enter or Space presses.

Remote descriptors use the same names: `kind: "vec2" | "vec3" | "range" | "angle" | "seed" |
"keybind"` with `default`, `min`, `max`, `step`, `unit`, `decimals`, `link`, `linked` and `wrap`, and
`{ kind: "toolbar", items: [{ key, label, icon?, shortcut?, global?, disabled? }] }`. Each kind takes
`disabled`, `readOnly` and mixed values like the rest ("—" in place of the value).

Spring, point and easing values compare by their numbers everywhere (`isModified`, presets, undo, variants), and unchanged ones keep their identity across updates so memoized React children skip them. Random values stay in range people use (springs 0.2–0.9 s with bounce up to 0.45, mid-light colours of moderate chroma, any point, a named curve).

## Keyboard

Panels and switchers are keyboard-first:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move between presets, rows and custom actions (`←`/`→` move along the custom actions); a spring's two sliders are two stops |
| `←` / `→` or `h` / `l` | Adjust slider, cycle choice, or flip toggle (`⇧` multiplies numeric step by `×10`); on a colour row turn the hue, on a point row move x, on an easing row cycle the named curves |
| `Enter` / `Space` | Open a colour, point or easing row's editor; `↓` then walks into it (strips, chips, handles, pad) |
| `Esc` | Fold an open editor and return to its row (before closing the panel) |
| Arrows on a pad or curve handle | Move the puck or handle (`⇧` ×10, `⌥` finest); `j` / `k` or `Tab` move on |
| `[` / `]` | Cycle presets and saved variants from anywhere in the panel; with no preset strip, cycle tabs |
| `⌥1`–`⌥9` | Show tab 1–9 |
| `/` | Focus the search field (`Esc` clears it, then hands focus back; `↓` or `Enter` go to the first row left) |
| `Home` / `End` | Jump slider to `min` or `max` |
| `0`–`9`, `.`, `-` or `Enter` | Edit numeric value inline (`Enter` commits, `Esc` cancels) |
| `Backspace` / `Delete` | Reset focused row (or the selection) to its default (or double-click row/label) |
| `⌥` + drag | Fine-tune a slider at 1/10 speed |
| Pan sideways (two fingers) | Moves a slider, colour strip, pad or easing handle 1:1 with the fingers; over the preset strip or a choice, drags the pill through the options. One undo entry per gesture; momentum is ignored; vertical scrolling passes through. A `⇧` + wheel notch steps once |
| `s` | Jump: badges every row (one code per row, compound ones included), preset and button with its shortest unique prefix; type it to jump (presets apply) |
| `Tab` / `⇧Tab` | Next/previous control, wrapping inside floating panels |
| `f` | Focus first row |
| `r` / `⇧R` | Randomize all fields / reset all fields to defaults (locked fields keep their values on Random, not on Reset) |
| `⌥R` | Mutate: nudge every unlocked value a little (numbers and points 8–12% of their range, colours a few degrees of hue and a touch of chroma and lightness, springs and curves slightly; choices and switches change about 15% of the time) |
| `g` / `⌥G` | Randomize / mutate the focused row's group (also the die beside each group's reset icon; `⌥`-click mutates) |
| `⇧L` | Lock or unlock the focused row (or the selection) from Random and Mutate |
| `⇧`-click / `⇧↑` `⇧↓` | Select a range of rows (`⌘`-click adds or removes one); `r`, `⌥R`, `⌫`, `⇧L` and `⇧C` then act on the selection; `Esc` or a plain click clears it |
| Right-click / `⇧F10` / `ContextMenu` | Menu for the row or selection: Lock from Random, Randomize, Reset, Copy; `↑↓`, a letter, `Enter`, `Esc` |
| Hold `\` | Compare: show the values from before the last change while held (the title dims); nothing is recorded |
| `⇧C` | Copy the current values (or the selected fields) as code |
| `⇧S` | Save the current values as a new preset chip |
| `u` / `z` | Undo (`⇧u` / `⇧z` redo); slider drags coalesce into a single history entry |
| `?` | Toggle keyboard shortcuts popover |
| `Esc` | Close shortcuts popover or floating panel and restore focus to its chip |

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

`createRemoteControls` takes the same options (and `groupLabel` / `sectionLabel` on descriptors), and `mountPanel` / `mountPage` take them too, over the store's. Everything that shows a name uses the label: card headers in both renderers, aria names, hint codes, the preset strip, its hint badges. The filter matches labels and ids alike. The preset id stays `default` for `[` / `]`, storage and `matchingPreset()`; there's no second "default" chip. Stores answer `groupLabel(id)`, `sectionLabel(id)` and `presetLabel(id)`. Group presets already have names, so `presetLabels` doesn't apply to them. A small reset icon appears beside the header while anything in that group differs from its defaults, next to a die that randomizes just that group (`⌥`-click mutates it). A slider's notch brightens once it moves off its default; changed choices and switches show a small dot.

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

Descriptors also take `kind: "spring"` (default `{ duration, bounce }`), `"color"` (any string `color()` accepts), `"point"` (default `{ x, y }`, with `min`/`max`/`step` applying to both axes) and `"easing"` (default `[x1, y1, x2, y2]`). `onSet` then sends those values as they are (objects, strings and arrays), or `null` when a key returns to its default. `remote.swift()` emits matching Swift:

```swift
TunableSpring("drawer.spring", "Drawer", duration: 0.45, bounce: 0.25)  // was duration: 0.4, bounce: 0.25
Tunable<Color>("composer.tint", "Tint", default: Color(red: 0.2393, green: 0.5451, blue: 0.9999))  // #3d8bff · was Color(red: 0.0392, green: 0.5176, blue: 1)
Tunable<CGPoint>("composer.anchor", "Anchor", default: CGPoint(x: 0.5, y: 0.75))  // was CGPoint(x: 0.5, y: 1)
Tunable<UnitCurve>("drawer.fade", "Fade curve", default: .bezier(startControlPoint: UnitPoint(x: 0.32, y: 0.72), endControlPoint: UnitPoint(x: 0, y: 1)))  // was .bezier(...)
```

Colours leave as sRGB components (the OKLCH value is already inside sRGB). Points are `CGPoint`s and easings SwiftUI `UnitCurve.bezier` values. Paired `*.duration` / `*.bounce` number descriptors still fold into one `TunableSpring`.

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
  that calls `onAction(key)`. Choices take `{ id, label }` options. `fromSettings(groups, home)` maps
  a hosted prototype's settings sections (choices, switches, buttons, titled sections becoming
  groups) to descriptors and values, with what the prototype first reported as each default.
- **Choices** are segmented while their labels fit with room to spare and there are at most four,
  and a drop-down menu otherwise. They switch both ways as the width changes; `display: "menu" |
  "segmented"` fixes one. On a menu row, ←/→ step through the options, and Enter or Space opens
  the menu (↑↓, a letter, Enter, Esc).
- **Keys stay scoped.** An inline panel hears keys only while focus is inside it. Keys it handles
  are claimed (`preventDefault`) and stopped there, and everything else reaches the page. Esc hands
  focus back. `keys` remaps (`{ hint: "f" }`) or turns off (`{ random: false }`) any command; a
  command that's off loses its header button too, and the `?` popover and row menu list only what's
  on. `vim: false` drops j/k/h/l, `edit: false` leaves digits and Enter to the page, `bigStep` sets
  ⇧'s multiplier and `wrap: false` stops ↑/↓ at the ends.
- **Marks.** `marks: false` (on the store or the mount) hides modified dots, readout marks, group
  resets and Reset, for values that belong to someone else. A command that's off takes its marks
  too: with `reset: false` rows show nothing to reset, and group resets follow `resetAll`.
- **Haptics.** On phones, a stepped slider crossing a stop, the default's notch catching a drag, a
  choice changing mid-pan and a switch flipping each give a light tick: `navigator.vibrate` on
  Android; on iPhone, Safari's switch tick (iOS 17.4–26.4 for every tick; from iOS 26.5, which only
  plays it for a tap, switches alone). `haptics: false` on the mount turns them off, and so does
  reduced motion.
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
  knobs' own entries are then only for compare (hold `\`), which previews the last of them.
- **Disabled, read-only and mixed.** A field's `disabled` dims its row and `readOnly` keeps it at
  full strength; either takes no edits from the pointer or keys, and Random, Mutate and Reset skip
  it. Each takes a boolean or `(values) => boolean`, re-checked on every change, so a row follows
  the value it depends on. Focus still reaches a gated row (to read it). Mixed keys (a
  multi-selection whose items differ) read "—" until edited: `sync(values, { mixed })`,
  `update(descriptors, values, { mixed })` or `controls.setMixed(keys, on?)`. The first edit of a
  mixed key reaches `onSet` even when the value doesn't change, so it applies to every selected item.
- **Persistence.** `persist: "all"` (the default) keeps values, locks, saved variants and a floating
  panel's position; `"variants"` keeps only saved variants, for values the host owns; `"none"`
  keeps nothing. `session: false` on the mount stops the per-tab session too, so a rebuilt panel
  doesn't take focus back to its last row or reopen editors and groups (on while there's storage).
- **Header.** `header: false` drops it; `{ title?: false, buttons?: [...] }` keeps it and picks what
  shows. A hidden button keeps its key; a command that's off (`keys`) loses both.
- **Folding groups.** A field's `folded: true` (or `groupFolded` on the mount) makes its group
  foldable, starting folded. Its header folds and opens it with a click, Enter or Space; it's a ↑↓
  stop of its own, ← folds and → opens. `panel.fold(group, folded?)` does it from code. On a
  [full page](#full-page) the group's tile folds to its header, the cards below follow, and the
  filter opens it while it runs.
- **Group Random by the host.** `groupRandom: (group, mode) => …` runs first for a group's die, `g`
  and `⌥G` (`mode` is `"random"` or `"mutate"`). Return `true` when the host rolled the group (its
  own seeded "Randomize <group>"): the die tumbles and knobs leaves the values alone. Return
  anything else and knobs rolls it. With `groupRandom` set, group dice stay enabled.
- **Row accessories.** `rowAccessory(key)` puts the host's node just after each row's label (a pin,
  a spawn-time marker); slider ticks and the label make room for it. The node stays the host's
  (style it, listen on it, its clicks never reach the row); `panel.updateAccessories()` asks again.
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
  subsectionFolded: { Forces: true },
  search: { placeholder: "Search", chips: ["modified"] },
})
panel.tab("emitter") // shows a tab; panel.tab() answers the one showing
```

- **Tabs.** A row shows on its field's `tab`, or else the first `tab` its group names; rows with
  none show on every tab. The strip's underline slides to the chosen tab and the rows cross: what
  leaves folds away as what arrives unfolds, a moment behind. `⌥1`–`⌥9` pick a tab, and `[` / `]`
  cycle tabs when there's no preset strip. The tab last shown is remembered for these controls (and
  in the session).
- **Sub-headings.** Fields with the same `subsection` in a group sit under a flat heading inside the
  group's card, split off by a hairline (never a card inside a card). The heading is a ↑↓ stop: a
  click, Enter or Space folds it, ← folds and → opens. `subsectionFolded` starts some folded; the
  session remembers the rest.
- **Search.** `search: true` (or `{ placeholder, chips }`) puts a field under the header. Typing
  filters rows by label, key, group or sub-heading across every tab, opening folded groups and
  sub-headings while it runs; matches show in the accent colour. Chips narrow it further:
  `"modified"` keeps rows off their defaults and counts them, and a chip of your own is
  `{ id, label, count?, test(key, controls) }`. `/` focuses the field.

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
Stores without `ship` are unchanged.

### Styling and tokens

Theme with `--k-*` tokens on the panel or any ancestor, or ship a set as a preset:
`mountPanel(c, el, { preset })` with a `TokenPreset` (`{ name, dark, light?, css? }`), or
`presetCss(preset)` in your own stylesheet with `data-preset` on the panel. `problemsPreset` (from
`knobs/themes`) is the Problems viewer's parameter column. Every token it sets works on its own:

| Token | Default | What it does |
| --- | --- | --- |
| `--k-row-gap` | `0px` | Above 0, each row is its own bar, this far apart; a spring stacks its curve over its sliders |
| `--k-hover-in` / `--k-hover-out` | `150` / `150` | Hover washes in and out (ms) |
| `--k-chrome` | `1` | `0` drops an inline panel's card: background, border and rim |
| `--k-fill-base`, `--k-fill-rest-mix`, `--k-fill-hover-mix`, `--k-fill-active-mix` | surface-hi, 20%, rest, 30% | The fill: accent mixed into the base at rest, hovered and dragged |
| `--k-handle`, `--k-handle-rest`, `--k-handle-inset` | accent, `0`, `0px` | The handle's colour, its opacity at rest, and how far inside the fill's edge it sits; it fades where it passes under the label or readout |
| `--k-step-resist` | `0.25` | How far a stepped slider's fill follows the pointer off its stop while dragged: `0` snaps, `1` follows freely |
| `--k-motion-blur` | `0` | Up to `1`: moving fill edges and selection pills smear by their speed |
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
| `--k-thumb` | `#fff` | Switch thumbs and strip handles |
| `--k-lift` | `1` | `0` drops the small shadows under pills, thumbs and handles |
| `--k-frame` | `card` | `flat`: no card inside the host's own card (see below) |
| `--k-disabled-opacity` | `.32` | How far a disabled row dims |
| `--k-control-h` | row − 2 × unit | Height of the controls inside a row: segments, menus, switches, number cells, key caps, toolbar buttons |
| `--k-value-size` | font size − `.5px` | Size of every readout (sliders, cells, ranges, dials, seeds, editor summaries) |
| `--k-button-bg`, `--k-button-line`, `--k-button-hover-bg`, `--k-button-hover-line` | each button's own | Fill and outline of custom actions, Export/Import and toolbar buttons, at rest and hovered |
| `--k-button-h`, `--k-button-font-size`, `--k-button-radius` | each button's own | Their height, label size and corners |

**Frame.** `--k-frame: flat` is for a panel set into the host's own column or card. Group cards
lose their surface and corners, rows are split by hairlines, and groups by `--k-group-divider` over
their heading. An inline flat panel also drops its own card (`--k-chrome: 0`) and padding, so
nothing draws a box inside the host's box. The panel reports it as `data-frame="flat"`.

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

When there are more controls than a panel holds (a tuning page with a dozen groups), `mountPage` lays them out as a page: a sticky glass header with the title, the presets strip and **Random · Reset · Copy · Undo/Redo · ?**, then **sections** of cards: every group is a card, and each section is a column of them under its heading. As many columns fit as `columnWidth` allows. A long section takes two or more adjacent columns (its cards read down one and on to the next, and the extra columns line up under its heading); when the sections outnumber the columns, short ones stack, in order, with their headings. The split keeps the tallest column as short as it can be. Columns are independent stacks: a card that changes height moves only the cards below it in its own column, never another column.

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

**Collapsible cards.** Pass `collapsed` (`true` folded, `false` open) and a card's header toggles it, by a click or `Enter` where it's focused (`j` / `k` reach the header): the body fades as the card's height springs down to its header and the cards below in its column glide, interruptibly; other columns stay put. While folded the header shows `summary` on its right. `card.collapse(bool)` folds or opens it from code, `card.collapsed` says which, and `card.summary(text)` updates the line. `description` puts one muted line under the title. What the user last chose comes back after a reload (per tab by default; see `foldStorage` under [Folding sections](#folding-sections-summaries-and-the-jump-strip)), over `collapsed`.

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

Descriptions add one muted line under a title: `groupDescriptions` and `sectionDescriptions` by id (on the store, remote options or the mount), or `groupDescription` / `sectionDescription` on any field or descriptor (the first that gives one wins). `page.card({ description })` does the same for a custom card. The filter matches descriptions too.

What the user folds and opens is remembered under `knobs:<id>:folds:v1` and wins over `sectionFolded`, `groupFolded` and `collapsed`. By default it's kept per tab (sessionStorage, with the rest of the panel's session), so a reload brings it back; nothing is kept with `session: false`, or for a store without storage (remote controls, unless you pass one). `foldStorage` on the mount chooses: `localStorage` (or any `StoragePort`) keeps folds across tabs too, `null` keeps none.

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
| `1`–`9` | Apply the focused group's preset, by its number (in groups without them, digits still edit numbers; `Enter` always does) |
| `Enter` / `Space` on a section heading or a foldable card's header | Fold or open it (on a section heading or group card, `←` folds and `→` opens too) |
| `/` | Filter rows by label, group or section, live; rows fold shut, cards with nothing left fold away and the rest glide into re-balanced columns; `Esc` clears |
| `s` | Hints for what's on screen, custom cards included |

Focus that lands off screen (or under the header) glides into view, retargeting from where the last glide was headed so held keys don't fall behind. The rest (`[` `]`, `r`, `g`, `⇧L`, selection, the row menu, hold `\`) works as in a panel.

Both renderers draw the page. With `?gpu`, the overlay draws the header's contents, section headings, cards and rows, clipped to below the sticky header, and follows every frame of a glide or fold; the page's background, the header's glass (a real `backdrop-filter`) and custom cards stay in the DOM under the transparent canvas, so they look the same in both. Scrolling and layout motion wake the overlay and it sleeps once the page is still. The demo is `examples/tune.html`: the OpenCode iOS tune page on a simulated iPhone that speaks the tune server's protocol.

## Theming, Density & WebGPU Renderer

Panels support `theme: "dark" | "light" | "auto"`, `density: "compact" | "default" | "comfortable"`, and `renderer: "gpu" | "dom" | "auto"` (or `?gpu` in the URL), configured on `defineControls`, `mountPanel`, or `<KnobsPanel />`. The header title defaults to the controls id, written as words (`"synth-voice"` reads "Synth voice"); pass `title` to override it or `title: false` to hide it.

When `renderer: "gpu"` (or `?gpu`) is active, all floating and inline panels share a single page-level WebGPU overlay canvas and `GPUDevice` with 480 Hz spring physics, velocity-driven directional motion blur, native-rasterized glyph atlas text, and per-column rolling digit smear, while keeping an invisible semantic DOM mirror for keyboard navigation and screen readers. The DOM renderer's transitions run on the same springs (sampled into CSS `linear()` easings), so both renderers move alike. The canvas can't sample the page, so each glass panel gets a `backdrop-filter` element just under the canvas; a panel lying over another panel firms up instead. When WebGPU is unavailable, panels fall back to the DOM/CSS renderer automatically.

Override CSS variables on `:root` or `.knobs-panel`:

```css
:root {
  --k-bg: #1c1c1e;
  --k-surface: rgba(255, 255, 255, 0.055);
  --k-surface-hi: rgba(255, 255, 255, 0.11);
  --k-line: rgba(255, 255, 255, 0.1);
  --k-text: rgba(255, 255, 255, 0.92);
  --k-label: rgba(255, 255, 255, 0.64);
  --k-accent: #fff;
  --k-modified: #ff9f0a;
  --k-width: 288px;
  --k-pad: 10px;
  --k-inset: 10px;
  --k-row: 32px;
  --k-gap: 4px;
  --k-radius: 8px;
  --k-panel-radius: 12px;
  --k-font-size: 12px;
  --k-label-weight: 500;
  --k-blur: 1;          /* motion strength: readout blur and pill stretch */
  --k-motion-blur: 0;   /* up to 1: moving fill edges and pills smear by their speed */
  --k-step-resist: 0.25; /* a stepped slider's pull off its stop (0 snaps, 1 follows) */
  --k-glow: 0.5;
  --k-roll: 420;        /* readout roll (ms) */
  --k-drag-roll: 0;     /* roll while dragging (ms; 0 snaps) */
  --k-cascade: 12;      /* preset ripple between rows (ms; 0 moves them together) */
  --k-glass: 0.6;       /* 0 is opaque; up to 1 thins the panel over a blurred backdrop */
  --k-glass-tone: 0.5;  /* backdrop brightness under full glass (light theme: 1.08) */
  --k-spring: 0.24 0.16; /* duration and bounce values settle on (GPU); pair with: */
  --k-fill-ease: linear(...); /* springCss(value).easing, for CSS transitions */
  --k-fill-ms: 300;     /* springCss(value).duration */
  --k-reveal-ease: cubic-bezier(.2, .8, .2, 1); /* how editors and messages open */
  --k-rim: rgba(255, 255, 255, 0.09);
}
```

Changing a token glides: colours, lengths, weights, glass and glow move on the panel spring (`--k-fill-ease` over `--k-fill-ms`), so a theme switch or a preset of tokens animates in both renderers. While a control is dragged they follow it step for step.

A floating panel opens out of its chip like the Dynamic Island: one shape springs from the chip's pill to the panel's card (position, size and corners), the chip's label fades as it goes and the content, laid out at full size, is revealed top first. Esc, the close button or the chip itself folds it back; toggling mid-way reverses from wherever the shape is. A reload brings an open panel back in place, with no morph.

Reduced motion (`prefers-reduced-motion`) turns off token glides, the cascade, the pop, edge blur, haptics, the spring dot and the editors' height reveals, and panels simply fade in and out.

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

`patch` holds only the fields that changed. The die page (`examples/die.ts`) rolls its demo dice this way.

## Explore in development. Ship constants.

```ts
splat.locked // frozen schema defaults
splat.get()  // live while enabled; the exact locked object otherwise
```

The package has two core exports selected through the standard `development` condition. Vite selects it automatically in dev. The default export is production-safe: **disabled unconditionally, even if `enabled: true` is passed**. `attach()` and `mount()` are no-ops, and their panel imports are erased from that entry.

## API Summary

### Fields & Descriptors

| Function | Behavior |
| --- | --- |
| `knob(value, { min, max, step?, unit?, shortcut?, label?, group?, groupLabel?, section?, sectionLabel? })` | Numeric slider control with rolling readout and inline editor. |
| `choice(value, ["a", "b"], { label?, group?, shortcut? }?)` | Nonempty string choices with literal union inference. |
| `toggle(value, { label?, group?, shortcut? }?)` | Boolean switch control. |
| `spring({ duration?, bounce? }?, meta?)` | SwiftUI-style spring: two sliders beside its live curve. |
| `color("#hex" \| "oklch(L C H)" \| { l, c, h }, meta?)` | OKLCH colour kept inside sRGB, as an `oklch()` string; swatch, hex and hue/chroma/lightness strips. |
| `point({ x, y }, { min, max, step?, ...meta })` | 2D pad; bounds and step take a number or `{ x, y }`. |
| `easing([x1, y1, x2, y2] \| name, meta?)` | Cubic bezier with a mini curve, a handle editor and named curves. |
| `vec2({ x, y }, { min, max, step?, link?, linked? })` / `vec3({ x, y, z }, …)` | Inline number cells, optionally linked for uniform scaling. |
| `range([low, high], { min, max, step?, unit? })` | One slider with two thumbs. |
| `angle(degrees, { min?, max?, step?, wrap? })` | A dial, 0° up and clockwise; 0–360 wrapping by default. |
| `seed(value, { min?, max? })` / `keybind(combo?)` | A whole number with a die; a captured key combination. Both stay out of Random and Mutate by default. |
| `toolbar([{ id?, label, icon?, shortcut?, global?, disabled?, run? }])` | A row of buttons with shortcut chips; presses call `onAction(id)`. |
| `springCss(spring)` / `springMotion(spring)` / `bezierCss(curve)` / `colorHex(color)` | Turn values into CSS, ω/ζ, or hex. |
| `fromDescriptors(descriptors)` | Converts runtime `ControlDescriptor[]` into a `Schema`. |
| `createRemoteControls(id, descriptors, options)` | Creates a remote-synced `Controls` store with `.swift(group?)` codegen and `.update(descriptors, values, { land })`; incoming values skip keys in hand or changed here in the last 600 ms, and the newest lands when the hold ends. |
| `fromSettings(groups, home?)` | A hosted prototype's settings sections as descriptors and values. |
| `action(label, { run })` / `flatSpring({ duration, bounce }, meta)` | A button row; two flat number fields drawn as one spring card. |
| Field meta `random?`, `disabled?`, `readOnly?`, `folded?`, `tab?`, `subsection?` | On any field or descriptor: `random: false` stays out of Random and Mutate; `disabled` / `readOnly` (boolean or `(values) => boolean`) gate the row; `folded` makes its group foldable, starting folded; `tab` puts the row on a tab; `subsection` puts it under a sub-heading in its group. |
| Field meta `groupDescription?: string`, `sectionDescription?: string`, `sectionFolded?: boolean` | On any field or descriptor, for pages (the first field of a group or section that gives one wins): a muted line under the card's title or the section's heading; `sectionFolded` makes the section foldable, starting folded. |
| `mountPanel(controls, container, options?)` (`knobs/panel`) | An inline panel. Beside theme, density, renderer and keys: `preset`, `header` (`false` or `{ title?, buttons? }`), `session`, `groupFolded`, `subsectionFolded`, `tabs`, `tab`, `onTab`, `search`, `groupRandom(group, mode)`, `rowAccessory(key)`, `marks`, `haptics`. The handle adds `panel.fold(group, folded?)`, `panel.tab(id?)` and `panel.updateAccessories()`. |
| `mountPage(controls, container, options?)` (`knobs/panel`) | A full page of group cards in sections under a sticky header; `page.card({ title?, section?, element?, collapsed?, summary?, description? })` adds custom cards (`card.collapse(collapsed?)`, `card.collapsed`, `card.summary(content \| null)`), and `page.highlight({ groups?, sections? } \| null, { reveal?, expand? })` marks what's on screen. Options take `groupLabels`, `sectionLabels`, `groupDescriptions`, `sectionDescriptions`, `presetLabels`, `defaultLabel`, `groupPresetDisplay` and `groupFolded` over the store's. |
| `MountPageOptions` folds | `sectionFolded?: SectionFolded` (`boolean \| Record<string, boolean>`), `foldStorage?: StoragePort \| null`, `nav?: boolean`, `groupSummary?(group, info: FoldSummaryInfo): string \| Node \| null`, `sectionSummary?(section, info: FoldSummaryInfo): string \| Node \| null`; `FoldSummaryInfo` is `{ preset: string \| null, changed: number, keys: readonly string[] }`. |
| `page.fold(group: string, folded?: boolean, options?: PageFoldOptions): void` / `page.foldSection(section: string, folded?: boolean, options?: PageFoldOptions): void` / `page.sectionFolded(section: string): boolean` | Fold a group's card or a section or open it (toggles without `folded`), and ask which a section is. `PageFoldOptions` is `{ remember?: boolean, reveal?: boolean }`; `remember` defaults to `true`. |
| `page.reveal(target: { section: string } \| { group: string }, options?: { remember?: boolean }): void` | Open a section (or a group's card and its section) and glide it into view; `remember` defaults to `false`. |
| `page.sections(): readonly PageSectionInfo[]` / `page.onSections(listener: (sections: readonly PageSectionInfo[]) => void): () => void` | `PageSectionInfo` is `{ id, label, description?, folded, changed, groups: PageGroupInfo[] }`; `PageGroupInfo` is `{ id, label, folded, changed, preset: string \| null }`. |
| `page.activeSection(): string \| undefined` / `page.onActiveSection(listener: (section: string \| undefined) => void): () => void` | The section in view as the page scrolls. |

### Store (`Controls<S>`)

- `controls.get()` / `controls.getServerSnapshot()` / `controls.locked`
- `controls.set(patch, { coalesce? })`
- `controls.sync(values, { replace?, land?, mixed? })` — apply external state without recording undo or emitting a local change; held keys keep theirs
- Options `random`, `tunable(key, values)`, `history` (a `HostHistory`) and `persist` (`"all" | "variants" | "none"`); see [Embedding options](#embedding-options)
- `controls.canRoll(key)` / `controls.isDisabled(key)` / `controls.isReadOnly(key)` / `controls.persist`
- `controls.setMixed(keys, on?)` / `controls.isMixed(key)`
- `controls.hold(key, on?)` / `controls.isHeld(key)` / `controls.landing`
- `controls.action(key, item?)` — press an action row, or a toolbar's item
- `controls.reset(keys?)` / `controls.resetKey(key)` / `controls.resetGroup(group)`
- `controls.isModified(key?)` / `controls.modified()`
- `controls.undo()` / `controls.redo()` / `controls.canUndo` / `controls.canRedo`
- `controls.randomize(keys?)` / `controls.mutate(keys?)`: skip locked fields; one undo step each
- `controls.lock(keys, locked = true)` / `controls.isLocked(key)`: locks are saved with the values (remote controls keep them in memory)
- `controls.compare(hold)` / `controls.comparing`: while held, `get()` returns the previous undo entry; no history, no storage
- `controls.preset(id)` / `controls.matchingPreset()`
- `controls.groupPresets` / `controls.groupPreset(group, index, { coalesce? })` / `controls.matchingGroupPreset(group)` / `controls.groupPresetDisplay`
- `controls.groupLabel(id)` / `controls.sectionLabel(id)` / `controls.presetLabel(id)`: display labels (`groupLabels`, `sectionLabels`, `presetLabels`, `defaultLabel`, or the fields' `groupLabel` / `sectionLabel`)
- `controls.groupDescription(group): string | undefined` / `controls.sectionDescription(section): string | undefined`: `groupDescriptions` / `sectionDescriptions`, else the fields' `groupDescription` / `sectionDescription`
- `controls.groupFolded` / `controls.sectionFolded`: how groups and a page's sections start, as given to `defineControls` or `createRemoteControls` (`groupFolded?: Record<string, boolean>`, `sectionFolded?: SectionFolded`); mounts read them under their own
- `controls.code("ts" | "json" | "jsx", values?)`
- `controls.variants.list()` / `.save(name?)` / `.load(id)` / `.remove(id)` / `.export()` / `.import(json)`
- `controls.attach(element)` — floating chip + anchored panel
- `controls.mount(container, options?)` — inline panel

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
