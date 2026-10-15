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
| `[` / `]` | Cycle presets and saved variants from anywhere in the panel |
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
`data-rows`, `data-landing`), `.knobs-card`, `.knobs-group-head`, `.knobs-row`, `.knobs-slider`,
`.knobs-spring`, `.knobs-seg`, `.knobs-select`, `.knobs-action`, `.knobs-modified`, and
`[data-field="<key>"]` on every row. Both renderers draw every token above.

## Full page

When there are more controls than a panel holds (a tuning page with a dozen groups), `mountPage` lays them out as a page: a sticky glass header with the title, the presets strip and **Random · Reset · Copy · Undo/Redo · ?**, then **sections** of cards: every group is a card, and each section is a column of them under its heading. As many columns fit as `columnWidth` allows. A long section takes two or more adjacent columns (its cards read down one and on to the next, and the extra columns line up under its heading); when the sections outnumber the columns, short ones stack, in order, with their headings. The split keeps the tallest column as short as it can be. Columns are independent stacks: a card that changes height moves only the cards below it in its own column, never another column.

Everything moves rather than jumps. A card whose content changes (an editor opening, rows the filter hides, rows added or removed, a custom card swapping its content) eases to its new height and the cards below it glide. The columns re-balance only when the window gains or loses a column (after a brief pause while it's being resized), when cards come or go, and when the filter changes, and then every card glides from where it was to its new place, interruptibly. With reduced motion, layout changes snap.

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

**Collapsible cards.** Pass `collapsed` (`true` folded, `false` open) and a card's header toggles it, by a click or `Enter` where it's focused (`j` / `k` reach the header): the body fades as the card's height springs down to its header and the cards below in its column glide, interruptibly; other columns stay put. While folded the header shows `summary` on its right. `card.collapse(bool)` folds or opens it from code, `card.collapsed` says which, and `card.summary(text)` updates the line. A reload brings back what each card was last in this tab (sessionStorage, with the panel's other per-tab state), over `collapsed`.

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
page.highlight({ sections: phone.context.groups.map((g) => SECTIONS[g] ?? title(g)) }, { reveal: true })
```

On a page, the keyboard spans every card:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Every row and custom control, down each column and on to the next |
| `Tab` / `⇧Tab` | Next / previous group (the whole card glides into view where it fits); from the header, the first highlighted card |
| `1`–`9` | Apply the focused group's preset, by its number (in groups without them, digits still edit numbers; `Enter` always does) |
| `Enter` on a collapsible card's header | Fold or open it |
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
| `springCss(spring)` / `springMotion(spring)` / `bezierCss(curve)` / `colorHex(color)` | Turn values into CSS, ω/ζ, or hex. |
| `fromDescriptors(descriptors)` | Converts runtime `ControlDescriptor[]` into a `Schema`. |
| `createRemoteControls(id, descriptors, options)` | Creates a remote-synced `Controls` store with `.swift(group?)` codegen and `.update(descriptors, values, { land })`; incoming values skip keys in hand or changed here in the last 600 ms, and the newest lands when the hold ends. |
| `fromSettings(groups, home?)` | A hosted prototype's settings sections as descriptors and values. |
| `action(label, { run })` / `flatSpring({ duration, bounce }, meta)` | A button row; two flat number fields drawn as one spring card. |
| `mountPage(controls, container, options?)` (`knobs/panel`) | A full page of group cards in sections under a sticky header; `page.card({ title, section, element, collapsed?, summary? })` adds custom cards (`card.collapse(bool)`, `card.collapsed`, `card.summary(text)`), and `page.highlight({ groups?, sections? } \| null, { reveal? })` marks what's on screen. Options take `groupLabels`, `sectionLabels`, `presetLabels`, `defaultLabel` and `groupPresetDisplay` over the store's. |

### Store (`Controls<S>`)

- `controls.get()` / `controls.getServerSnapshot()` / `controls.locked`
- `controls.set(patch, { coalesce? })`
- `controls.sync(values, { replace?, land? })` — apply external state without recording undo or emitting a local change; held keys keep theirs
- `controls.hold(key, on?)` / `controls.isHeld(key)` / `controls.landing`
- `controls.action(key)` — press an action row
- `controls.reset(keys?)` / `controls.resetKey(key)` / `controls.resetGroup(group)`
- `controls.isModified(key?)` / `controls.modified()`
- `controls.undo()` / `controls.redo()` / `controls.canUndo` / `controls.canRedo`
- `controls.randomize(keys?)` / `controls.mutate(keys?)`: skip locked fields; one undo step each
- `controls.lock(keys, locked = true)` / `controls.isLocked(key)`: locks are saved with the values (remote controls keep them in memory)
- `controls.compare(hold)` / `controls.comparing`: while held, `get()` returns the previous undo entry; no history, no storage
- `controls.preset(id)` / `controls.matchingPreset()`
- `controls.groupPresets` / `controls.groupPreset(group, index, { coalesce? })` / `controls.matchingGroupPreset(group)` / `controls.groupPresetDisplay`
- `controls.groupLabel(id)` / `controls.sectionLabel(id)` / `controls.presetLabel(id)`: display labels (`groupLabels`, `sectionLabels`, `presetLabels`, `defaultLabel`, or the fields' `groupLabel` / `sectionLabel`)
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
