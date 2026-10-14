# knobs

Embeddable, keyboard-first tuning controls for React, Solid, and plain DOM.

Give a component a few knobs. Hover it to reveal a tiny affordance (`⚙ knobs`) and open a floating panel, or mount an inline panel directly into a sidebar or tuning dashboard. Explore a seed, a spring curve, a spacing, or a layout variant. Save the good variations. Copy constants back into your source and ship zero tuning UI in production.

Each panel's header carries **Random · Reset · Copy · Undo/Redo** as icon buttons, above a preset strip and inset-grouped cards of rows. Random is a die that tumbles when it rolls; `⌥`-click it (or press `⌥R`) to **mutate** instead: small changes around the current values, with a quarter turn of the die. Each group has its own quieter die beside its reset icon. **Lock** a row (`⇧L`, or the row's context menu) to keep it out of Random and Mutate; a small lock follows its label. Hold **`\`** to see the values from before your last change, in the panel and your app alike. Shipped presets and your saved variants live together in that strip: `+` (or `⇧S`) saves the current values as a new chip, `⌫` on the strip deletes a saved one, and the `?` popover exports/imports them as JSON.

Beyond sliders, choices and switches there are four richer fields: a SwiftUI-style **spring** (duration and bounce beside its live step-response curve), an **OKLCH colour** (swatch and hex, with hue, chroma and lightness strips that paint their real gradients), a 2D **point** pad, and a cubic-bezier **easing** editor with named curves.

Zero runtime dependencies in core. Pure DOM panels with `@kitlangton/rolling-number` readouts and DialKit-style rubber-band sliders: an accent-tinted fill whose leading edge brightens with drag speed, a faint notch at the default that pulls drags onto it, `⌥`-drag for 1/10 speed, and horizontal scrolling (or `⇧` + wheel) to nudge by steps; the same swipe over the preset strip or a choice moves one preset or option per gesture. Switching presets ripples the changed rows top to bottom; selection pills and switch thumbs stretch toward where they're going and settle; the panel is a frosted glass surface over your work. A reload, Vite's included, keeps floating panels open, editors expanded and focus where it was, per tab. Thin adapters for React (`knobs/react`) and Solid (`knobs/solid`), plus a remote/descriptor mode for driving values over a WebSocket.

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
- **`color(value, meta?)`**: takes `#rgb`, `#rrggbb`, `oklch(L C H)` or `{ l, c, h }` and stores a canonical `oklch(L C H)` string (L 0–1), so values serialise, compare and drop into CSS directly. Colours always fit sRGB: chroma is trimmed until they do, keeping lightness and hue. While you scrub hue or lightness the editor remembers the chroma you asked for, so passing through a narrow part of the gamut doesn't erode it. Past the gamut edge the chroma strip is veiled. `colorHex(value)` and `parseColor(value)` convert.
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
| `⌥` + drag | Fine-tune a slider at 1/10 speed; scrolling sideways over it nudges by steps (one undo entry per gesture) |
| Swipe sideways | Over the preset strip or a choice: the next or previous one, once per gesture (`⇧` + wheel too) |
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

When fields specify `group`, each group's rows share one rounded card under a section header. A small reset icon appears beside the header while anything in that group differs from its defaults, next to a die that randomizes just that group (`⌥`-click mutates it). A slider's notch brightens once it moves off its default; changed choices and switches show a small dot.

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

Descriptors also take `kind: "spring"` (default `{ duration, bounce }`), `"color"` (any string `color()` accepts), `"point"` (default `{ x, y }`, with `min`/`max`/`step` applying to both axes) and `"easing"` (default `[x1, y1, x2, y2]`). `onSet` then sends those values as they are (objects, strings and arrays), or `null` when a key returns to its default. `remote.swift()` emits matching Swift:

```swift
TunableSpring("drawer.spring", "Drawer", duration: 0.45, bounce: 0.25)  // was duration: 0.4, bounce: 0.25
Tunable<Color>("composer.tint", "Tint", default: Color(red: 0.2393, green: 0.5451, blue: 0.9999))  // #3d8bff · was Color(red: 0.0392, green: 0.5176, blue: 1)
Tunable<CGPoint>("composer.anchor", "Anchor", default: CGPoint(x: 0.5, y: 0.75))  // was CGPoint(x: 0.5, y: 1)
Tunable<UnitCurve>("drawer.fade", "Fade curve", default: .bezier(startControlPoint: UnitPoint(x: 0.32, y: 0.72), endControlPoint: UnitPoint(x: 0, y: 1)))  // was .bezier(...)
```

Colours leave as sRGB components (the OKLCH value is already inside sRGB). Points are `CGPoint`s and easings SwiftUI `UnitCurve.bezier` values. Paired `*.duration` / `*.bounce` number descriptors still fold into one `TunableSpring`.

**Migrating an app's Tune page:** the Swift side needs `Tunable` to support `Color`, `CGPoint` and `UnitCurve` (decoding the socket's `"oklch(L C H)"`/hex string, `{ x, y }` and `[x1, y1, x2, y2]`), and a `TunableSpring` that reads `{ duration, bounce }` from one key rather than two. Until then, keep sending a spring as paired `.duration`/`.bounce` number descriptors; the panel and codegen handle both. Nothing in other repositories changes until you opt in.

See [`docs/migration.md`](./docs/migration.md) for full migration sketches for the OpenCode iOS Tune Page and Problems board config panels.

## Full page

When there are more controls than a panel holds (a tuning page with a dozen groups), `mountPage` lays them out as a page: a sticky glass header with the title, the presets strip and **Random · Reset · Copy · Undo/Redo · ?**, then **sections**, each a heading over its groups. Every group is a card, and the cards pack into balanced columns that follow the viewport (as many as fit at `columnWidth`, never more than the fullest section fills), reading down each column and on to the next.

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

Fields and descriptors take a `section` beside their `group` (`knob(44, { min: 28, max: 72, group: "Spacing", section: "Session List" })`); panels ignore it. `defineControls` takes `groupPresets` and `onPreset` too, and every store has `groupPresets`, `groupPreset(group, index)` (one undo step, `source: "preset"` with its `group`) and `matchingGroupPreset(group)`. Hovering a numbered chip shows its preset's name where the card's title is; applying one by key shows it briefly.

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

On a page, the keyboard spans every card:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Every row and custom control, down each column and on to the next |
| `Tab` / `⇧Tab` | Next / previous group (the whole card glides into view where it fits) |
| `1`–`9` | Apply the focused group's numbered preset (in groups without them, digits still edit numbers; `Enter` always does) |
| `/` | Filter rows by label, group or section, live; cards with nothing left fold away and the columns re-balance; `Esc` clears |
| `s` | Hints for what's on screen, custom cards included |

Focus that lands off screen (or under the header) glides into view, retargeting from where the last glide was headed so held keys don't fall behind. The rest (`[` `]`, `r`, `g`, `⇧L`, selection, the row menu, hold `\`) works as in a panel.

Both renderers draw the page. With `?gpu`, the overlay draws the header's contents, section headings, cards and rows, clipped to below the sticky header; the page's background, the header's glass (a real `backdrop-filter`) and custom cards stay in the DOM under the transparent canvas, so they look the same in both. Scrolling wakes the overlay and it sleeps once the page is still. The demo is `examples/tune.html`: the OpenCode iOS tune page on a simulated iPhone that speaks the tune server's protocol.

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
  --k-blur: 1;          /* motion strength: blur, rubber band and pill stretch */
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

Reduced motion (`prefers-reduced-motion`) turns off token glides, the cascade, the pop, the stretch, the spring dot and the editors' height reveals, and panels simply fade in and out.

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
| `knob(value, { min, max, step?, unit?, shortcut?, label?, group?, section? })` | Numeric slider control with rolling readout and inline editor. |
| `choice(value, ["a", "b"], { label?, group?, shortcut? }?)` | Nonempty string choices with literal union inference. |
| `toggle(value, { label?, group?, shortcut? }?)` | Boolean switch control. |
| `spring({ duration?, bounce? }?, meta?)` | SwiftUI-style spring: two sliders beside its live curve. |
| `color("#hex" \| "oklch(L C H)" \| { l, c, h }, meta?)` | OKLCH colour kept inside sRGB, as an `oklch()` string; swatch, hex and hue/chroma/lightness strips. |
| `point({ x, y }, { min, max, step?, ...meta })` | 2D pad; bounds and step take a number or `{ x, y }`. |
| `easing([x1, y1, x2, y2] \| name, meta?)` | Cubic bezier with a mini curve, a handle editor and named curves. |
| `springCss(spring)` / `springMotion(spring)` / `bezierCss(curve)` / `colorHex(color)` | Turn values into CSS, ω/ζ, or hex. |
| `fromDescriptors(descriptors)` | Converts runtime `ControlDescriptor[]` into a `Schema`. |
| `createRemoteControls(id, descriptors, options)` | Creates a remote-synced `Controls` store with `.swift(group?)` codegen; `sync` holds keys changed here for 600 ms against stale echoes, then applies the peer's latest state. |
| `mountPage(controls, container, options?)` (`knobs/panel`) | A full page of group cards in sections under a sticky header; `page.card({ title, section, element })` adds custom cards. |

### Store (`Controls<S>`)

- `controls.get()` / `controls.getServerSnapshot()` / `controls.locked`
- `controls.set(patch, { coalesce? })`
- `controls.sync(values, { replace? })` — apply external state without recording undo or emitting a local change
- `controls.reset(keys?)` / `controls.resetKey(key)` / `controls.resetGroup(group)`
- `controls.isModified(key?)` / `controls.modified()`
- `controls.undo()` / `controls.redo()` / `controls.canUndo` / `controls.canRedo`
- `controls.randomize(keys?)` / `controls.mutate(keys?)`: skip locked fields; one undo step each
- `controls.lock(keys, locked = true)` / `controls.isLocked(key)`: locks are saved with the values (remote controls keep them in memory)
- `controls.compare(hold)` / `controls.comparing`: while held, `get()` returns the previous undo entry; no history, no storage
- `controls.preset(id)` / `controls.matchingPreset()`
- `controls.groupPresets` / `controls.groupPreset(group, index)` / `controls.matchingGroupPreset(group)`
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
