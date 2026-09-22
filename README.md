# knobs

Embeddable tuning controls, attached to the thing you're making.

Give a component a few knobs. Hover it to reveal a tiny affordance; click to open
its panel. Explore a seed, a spacing, a texture. Save the good variations. Copy
one back into your source and ship a constant.

Each panel includes **Randomize · Reset · Save variant · Switch variants · Copy**.
These are the baseline, not plugins. Shipped presets and locally saved variants
live together, with JSON export/import for moving a collection between machines.

Zero runtime dependencies in core. Pure DOM panels. A thin React adapter.

## 30 seconds

This repository is local-only and not yet published. For local development, run
`bun install && bun run build`, then use a `file:` dependency pointing here.

```ts
import { defineControls, knob, choice, toggle } from "knobs"

const splat = defineControls("splat", {
  seed: knob(22, { min: 1, max: 99, step: 1, shortcut: "s" }),
  count: knob(98, { min: 0, max: 300, step: 1 }),
  size: knob(7, { min: 1, max: 30, step: 0.5, unit: "px" }),
  flavor: choice("inked", ["inked", "clean"]),
  grain: toggle(true),
}, {
  enabled: import.meta.env.DEV,
  presets: { subtle: { count: 40, size: 4 } },
})

const detach = splat.attach(document.querySelector<HTMLElement>("#splat")!)
const unsubscribe = splat.subscribe(() => render(splat.get()))
render(splat.get())
// On teardown: detach(); unsubscribe()
```

### React

Define controls at module scope so a render does not recreate the store.

```tsx
import { Knobs, useControls, VariantSwitcher } from "knobs/react"

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
```

`Knobs` adds no wrapper DOM: its single child must be a native HTML element or a
component that forwards its ref to one. Existing refs are composed. For explicit
attachment, use `const ref = useKnobs(splat)` and put `ref` on your element.

`VariantSwitcher` compares a choice field in place. Omit `field` to compare
shipped presets and saved variants. Hover or focus, then use **1–9**, **←/→**;
Enter/Space cycles when focused. Nested switchers share a single hover owner.
Text entry and other interactive elements keep their own keyboard events.

## Attached, not a dashboard

- Each controls instance has its own attachment and panel. Open several at once.
- The chip appears on hover or focus-within. Plain containers become tabbable
  while attached; their original tabindex is restored on detach.
- Panels anchor beside their element, clamp to the viewport, and can be dragged
  by the header. Drag positions are remembered per controls id.
- **↑/↓** moves between rows. **←/→** adjusts; Shift multiplies numeric steps by
  ten. A knob's optional letter shortcut focuses its range. Typing a digit while
  on a range starts number entry; Enter commits. Escape closes and returns focus.
- Field and saved-variant rows retain their DOM identity during updates.
- A single scoped stylesheet supplies a small, square, dark monospace panel.

Use a unique, stable id for each independent store. Multiple definitions with the
same id share storage keys but do not share in-memory state. Use one controls
object when multiple components intentionally share a setting.

## Explore in development. Ship constants.

```ts
splat.locked // frozen schema defaults
splat.get()  // live while enabled; the exact locked object otherwise
```

The package has two core exports selected through the standard `development`
condition. Vite selects it automatically in dev. For other bundlers, add
`development` to development-only resolve conditions. Node scripts can use
`node --conditions=development`. The default export is production-safe:
**disabled unconditionally, even if `enabled: true` is passed**. `attach()` is a
no-op, and its panel import is erased from that entry.

In development, `enabled` accepts a boolean or a function. The default heuristic
enables on localhost/loopback only. For an explicit URL gate:

```ts
import { urlFlag } from "knobs"
// In defineControls options:
const options = { enabled: urlFlag("knobs") } // ?knobs
```

Gate functions are checked at operation time, not observed reactively; set the
gate before mounting. `useControls` uses `useSyncExternalStore`; the server
snapshot is always `locked`. Default browser storage is resolved lazily, so
creating controls on a server never accesses `window`.

The development core lazy-imports the attachment module when attached; clicking
the chip lazy-imports the panel. Importing `knobs` alone does not load DOM code.
`knobs/panel` is an explicit escape hatch for custom tooling: it contains DOM
code, so import it only from development code. Production core does not reference
that export. Production builds retain the small core API and React adapter, not
the tuning interface.

### Promote a variation

Keep defaults as a plain object when you want a one-line promotion:

```ts
const defaults = { seed: 22, count: 98, size: 7, flavor: "inked", grain: true }

const splat = defineControls("splat", {
  seed: knob(defaults.seed, { min: 1, max: 99, step: 1 }),
  count: knob(defaults.count, { min: 0, max: 300, step: 1 }),
  size: knob(defaults.size, { min: 1, max: 30, step: 0.5 }),
  // Continue with the other fields.
})
```

1. Tune or load a saved variant.
2. Hit **COPY**. It copies a TypeScript object expression.
3. Replace the `defaults` initializer with that expression.
4. The next production build uses those values. No caller branch, runtime panel,
   or dependency on somebody's localStorage.

When defaults are inline, paste the copied values into the corresponding
`knob(...)`, `choice(...)`, and `toggle(...)` defaults. A schema-aware promotion
codemod is on the roadmap.

## API

### Fields

| Function | Behavior |
| --- | --- |
| `knob(value, { min, max, step?, unit?, shortcut? })` | Numeric control. Step defaults to range / 100 (1 for a zero-width range). |
| `choice(value, ["a", "b"])` | Nonempty string choices with literal union inference. |
| `toggle(value)` | Boolean control. |
| `Values<typeof schema>` | Inferred readonly value object. |

Values are normalized on schema creation, persisted-state reads, and writes.
Numbers are clamped and snapped to a lattice relative to `min`; when `max` is
off-lattice, the last valid step below it is used. Invalid types and non-finite
numbers fall back to defaults. Unknown state keys are discarded. Randomize
samples the valid numeric steps, choice options, and both boolean values.

### Store

```ts
const controls = defineControls(id, schema, {
  enabled: true,                 // development condition only
  storage: null,                 // memory only; omit for lazy localStorage
  presets: { quiet: { count: 40 } },
})

controls.id
controls.schema
controls.locked
controls.enabled
controls.error                   // current-state read/write or attachment error
controls.get()                   // cached, frozen snapshot
controls.getServerSnapshot()     // locked
controls.set({ count: 80 })
const unsubscribe = controls.subscribe(() => {})
controls.reset()
controls.randomize()
controls.presets                 // includes "default" = locked
controls.preset("quiet")
controls.matchingPreset()        // id, or "custom"
controls.code()                  // TypeScript object expression
controls.code("json")            // formatted JSON object
controls.code("jsx")             // seed={22} flavor={"inked"} ...
controls.code("ts", variant.values)
const detach = controls.attach(element)
```

Preset patches merge with locked defaults, not the current state. `default` and
`custom` are reserved preset names. Unknown preset/variant ids throw. Subscribe
notifies on value changes and variant collection changes; no-op value updates
do not notify. `get()` keeps its identity until values change.

`StoragePort` needs only `getItem(key)` and `setItem(key, value)`.
`memoryStorage()` provides an injectable in-memory implementation. Current state
uses `knobs:<encoded-id>:state:v1`, variants use `:variants:v1`, and panel
coordinates use `:position:v1`. Changes to current values still work if storage
fails; `controls.error` and the panel status explain the failure. Variant writes
throw and leave the collection unchanged on persistence failure.

### Variants

```ts
controls.variants.list()          // reads storage; throws if unreadable/invalid
controls.variants.ready           // successful initial read
const variant = controls.variants.save("Optional name")
controls.variants.load(variant.id)
controls.variants.remove(variant.id)
const json = controls.variants.export()
controls.variants.import(json)    // call list() successfully BEFORE import
```

Variants are frozen `{ id, name?, values }` objects. Save captures the current
snapshot. Unnamed variants get a generated id. The panel offers LOAD/COPY/DELETE
for every saved variant; the select includes shipped presets and saved variants,
with `custom` shown when neither matches. To copy a preset, select it and COPY.

Exports are `{ version: 1, controls: id, variants: [...] }`. Imports validate the
version, controls id, every field, bounds, step, names, and unique ids before any
write. They merge new ids and preserve existing ids. Imports refuse to proceed
until storage has been successfully read; a corrupt collection is never silently
replaced. Back it up and repair/remove its key, then call `list()` again.
Schema changes that invalidate saved variants require an explicit migration or
a new controls id. Cross-tab live synchronization is not implemented.

Clipboard uses `navigator.clipboard.writeText`; if unavailable, the panel opens
and selects the code in a text area for manual copying. EXPORT uses the same
fallback. IMPORT accepts JSON in the panel, without blocking browser prompts.

## Develop

```sh
bun install
bun run build
bun run typecheck
bun run test                  # Vitest, not Bun's test runner
bun run example               # http://127.0.0.1:5178
bun run example:build         # production demo; all controls locked
bunx playwright install chromium   # once, if Chromium is not installed
bun run test:browser
bun run format
```

The example consumes the built package through its real export conditions.
After library edits, run `bun run build` again. The three independent studies are
a seeded SVG splatter, a canvas halftone field, and a typographic block with an
in-place choice switcher. Each demonstrates the full panel baseline. Browser
checks write a screenshot to `test-results/example-panel.png`.

```text
src/core/   schema · store · variants · code · storage · random
src/panel/  lazy attach · DOM panel · position · scoped styles
src/react/  useControls · useKnobs/Knobs · VariantSwitcher
examples/   Vite + React, three independent studies
tests/      core contracts + Chromium workflows
scripts/    split development/production builds + panel-leak assertion
```

## Roadmap

- Solid adapter (same `get` / `subscribe` / `attach` contract)
- Color, vector, and text fields
- URL-shareable variants
- “Promote to locked” codemod

MIT © 2026 Kit Langton.
