# knobs

Embeddable, keyboard-first tuning controls for React, Solid, and plain DOM.

Give a component a few knobs. Hover it to reveal a tiny affordance (`⚙ knobs`) and open a floating panel, or mount an inline panel directly into a sidebar or tuning dashboard. Explore a seed, a spring curve, a spacing, or a layout variant. Save the good variations. Copy constants back into your source and ship zero tuning UI in production.

Each panel includes **Random · Reset · Copy · Undo/Redo** and a preset strip. Shipped presets and your saved variants live together in that strip: `+` (or `⇧S`) saves the current values as a new chip, `⌫` on the strip deletes a saved one, and the `?` popover exports/imports them as JSON.

Zero runtime dependencies in core. Pure DOM panels with `@kitlangton/rolling-number` readouts and DialKit-style rubber-band sliders. Thin adapters for React (`knobs/react`) and Solid (`knobs/solid`), plus a remote/descriptor mode for driving values over a WebSocket.

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

// Floating hover chip + anchored panel:
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

## Keyboard

Panels and switchers are keyboard-first:

| Key | Action |
| --- | --- |
| `↑` / `↓` or `j` / `k` | Move between presets, rows and the action bar (`←`/`→` move along the action bar) |
| `←` / `→` or `h` / `l` | Adjust slider, cycle choice, or flip toggle (`⇧` multiplies numeric step by `×10`) |
| `[` / `]` | Cycle presets and saved variants from anywhere in the panel |
| `Home` / `End` | Jump slider to `min` or `max` |
| `0`–`9`, `.`, `-` or `Enter` | Edit numeric value inline (`Enter` commits, `Esc` cancels) |
| `Backspace` / `Delete` | Reset focused row to its locked default (or double-click row/label) |
| `s` | Jump: badges every row, preset and button with its shortest unique prefix; type it to jump (presets apply) |
| `Tab` / `⇧Tab` | Next/previous control, wrapping inside floating panels |
| `f` | Focus first row |
| `r` / `⇧R` | Randomize all fields / reset all fields to defaults |
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

When fields specify `group`, the panel renders section headers with per-group **RESET** buttons (enabled whenever a field in that group is modified). Rows modified from their locked default show a subtle indicator dot.

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

See [`docs/migration.md`](./docs/migration.md) for full migration sketches for the OpenCode iOS Tune Page and Problems board config panels.

## Theming, Density & WebGPU Renderer

Panels support `theme: "dark" | "light" | "auto"`, `density: "compact" | "default" | "comfortable"`, and `renderer: "gpu" | "dom" | "auto"` (or `?gpu` in the URL), configured on `defineControls`, `mountPanel`, or `<KnobsPanel />`.

When `renderer: "gpu"` (or `?gpu`) is active, all floating and inline panels share a single page-level WebGPU overlay canvas and `GPUDevice` with 480 Hz spring physics, velocity-driven directional motion blur, native-rasterized glyph atlas text, and per-column rolling digit smear, while keeping an invisible semantic DOM mirror for keyboard navigation and screen readers. When WebGPU is unavailable, panels fall back to the DOM/CSS renderer automatically.

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
  --k-blur: 1;
  --k-glow: 0.5;
}
```

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
| `knob(value, { min, max, step?, unit?, shortcut?, label?, group? })` | Numeric slider control with rolling readout and inline editor. |
| `choice(value, ["a", "b"], { label?, group?, shortcut? }?)` | Nonempty string choices with literal union inference. |
| `toggle(value, { label?, group?, shortcut? }?)` | Boolean switch control. |
| `fromDescriptors(descriptors)` | Converts runtime `ControlDescriptor[]` into a `Schema`. |
| `createRemoteControls(id, descriptors, options)` | Creates a remote-synced `Controls` store with `.swift(group?)` codegen. |

### Store (`Controls<S>`)

- `controls.get()` / `controls.getServerSnapshot()` / `controls.locked`
- `controls.set(patch, { coalesce? })`
- `controls.sync(values, { replace? })` — apply external state without recording undo or emitting a local change
- `controls.reset()` / `controls.resetKey(key)` / `controls.resetGroup(group)`
- `controls.isModified(key?)` / `controls.modified()`
- `controls.undo()` / `controls.redo()` / `controls.canUndo` / `controls.canRedo`
- `controls.randomize()` / `controls.preset(id)` / `controls.matchingPreset()`
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
