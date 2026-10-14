# Migrating OpenCode iOS Tune & Problems to `knobs`

This document covers how the OpenCode iOS Mac tuning page (`scripts/tune-server.ts` in `opencode-ios`) and the Problems rewrite's panels (`team-board`) adopt `knobs` as one shared control surface without losing any project-specific workflow.

---

## 1. OpenCode iOS Mac Tune Page (`scripts/tune-server.ts`)

### Current architecture in `opencode-ios`

- `scripts/tune-server.ts` serves an inline HTML page (`GET /`) and a WebSocket (`GET /ui`).
- A paired iPhone sends `{ type: "hello", schema: Descriptor[], values: Record<string, Value> }`, plus incremental `{ type: "registered", descriptor }` and `{ type: "value", key, value }` messages.
- The browser page groups `phone.schema` by `d.group`, renders `<input type="range">`, `<input type="checkbox">`, and `.tabs` buttons by hand, tracks a global `dragging` key so incoming socket broadcasts don't clobber an active drag, and fetches `/api/swift` to display/copy `Tunable<...>` and `TunableSpring(...)` declarations.

### How `knobs` replaces the hand-rolled controls

`knobs` now includes first-class support for socket-driven descriptors (`createRemoteControls`, `formatSwift`, `controls.sync`, `mountPanel`, per-key and per-group reset, and custom actions):

1. **Grouped or per-group remote stores**:
   - Pass each group's `Descriptor[]` (or the full `phone.schema` with `group: d.group`) to `createRemoteControls("tune", phone.schema, ...)`.
   - `createRemoteControls` maps `kind: "number" | "bool" | "choice"` to `knob`, `toggle`, and `choice` (automatically inferring fallback `min`/`max`/`step` for `Int` and `Double` descriptors).
2. **Bidirectional WebSocket sync without drag clobbering**:
   - Local changes call `onSet(key, value, meta)`, which sends `{ type: "set", key, value }` over the `/ui` WebSocket.
   - Per-row reset (`Backspace` or double-click) calls `onSet(key, null)`, and group/full reset calls `onReset({ group })` -> `{ type: "resetAll", group: group ?? null }`.
   - Incoming `{ type: "state" }` messages from the server call `remote.sync(phone.values, { replace: true })`, which records no undo and calls no `onSet`. Keys changed on the Mac in the last 600 ms hold against the phone's stale echoes (a drag in flight), then the phone's latest state is applied as it is. Rows update in place; DOM and focus survive.
3. **Built-in Swift codegen & local preset saving**:
   - `remote.swift(group?)` formats modified values into `Tunable<...>` and paired `TunableSpring(...)` declarations (identical to `scripts/tune-shared.ts`).
   - Passing `storage: window.localStorage` (optional) gives the Mac tune page named local variants, undo/redo (`u` / `⇧u`), hint-mode jumping (`s`), and `Randomize` for free.

### The page as a whole: `mountPage`

The tune page is a page of groups, not a panel, so it maps onto `mountPage` (from `knobs/panel`): a sticky header (title, presets, Random, Reset, Copy as Swift, undo/redo), sections of group cards in balanced columns, and custom cards for the Playground, Motion Watch and the review player. `examples/tune.html` is this migration running against a simulated phone that speaks the server's protocol (`examples/tune-phone.ts`); `examples/tune.ts` is the page.

| Tune server today | knobs |
| --- | --- |
| `Descriptor { key, label, kind, swiftType, default, min, max, step, choices, group }` | `ControlDescriptor`, field for field. `group` (the key's first segment, a screen) becomes the `section`; the knobs `group` is the card: the preset set that covers the key, else the key's second segment (`drawer.edge.fade` → section "Session List", card "Edge"). |
| `*.duration` / `*.bounce` pairs (`TunableSpring`) | One `kind: "spring"` descriptor with `{ duration, bounce }`; `onSet` sends it back as the two keys, and `swift()` emits `TunableSpring(...)`. (Or keep them as two number rows: both work.) |
| `phone.values` (overrides only; absent means default) | `remote.sync(values, { replace: true })`: absent keys return to their defaults. |
| `PresetSet { key, label, group, keys, presets }` | `groupPresets[card] = set.presets`; a preset's missing keys are at their defaults, as `TuningPresets.changes(applying:)` has it. The chips are numbered 1, 2, 3…; `1`–`9` apply them to the focused card. |
| `{ type: "preset", key, index }` | `onPreset: ({ group, index }) => send({ type: "preset", key: setFor[group], index })`: the phone applies its own set and sends back its state; no per-key `set` goes out. |
| `{ type: "set", key, value }`, `value: null` resets | `onSet(key, value)`, `null` when a key is back at its default. |
| `{ type: "resetAll", group }` | `onReset({})` → `resetAll` for everything; a card's reset (`onReset({ group })`) clears the keys behind that card. |
| Per-group randomize / undo roll | The card's die (`g`, `⌥` mutates) runs locally and sends sets; local undo/redo replaces "undo roll". Keep `{ type: "randomize" }` as a group action if the phone's own dice matter. |
| Copy as Swift / Copy values | `copy: () => remote.swift()` (Copy and ⇧C); a row's menu copies a selection. |
| Playground & Slow Motion, Motion Watch, review player | `page.card({ title, section, element })` with `choice` (segmented, e.g. speed chips 0.1×–2×), `toggle`, `actions` and `item`; arbitrary DOM goes in `card.body`. |
| `context` (only this screen's groups unless All), `hidden` | Build the descriptors from the groups to show and remount when that set changes, or show everything: a page has room. `/` filters rows live. |

```ts
import { createRemoteControls, type ControlDescriptor, type GroupPreset } from "knobs"
import { mountPage, type Page } from "knobs/panel"
import type { Descriptor, Value } from "./tune-shared"

const SECTIONS: Record<string, string> = { drawer: "Session List", transcript: "Transcript", composer: "Composer" }
const title = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())

function mapPhone(phone: Phone) {
  const cardOf = new Map<string, string>() // phone key → card (its preset set's label)
  const setFor = new Map<string, string>() // card → preset set key
  for (const set of phone.presets) {
    setFor.set(title(set.label), set.key)
    for (const k of set.keys) cardOf.set(k, title(set.label))
  }
  const descriptors: ControlDescriptor[] = phone.schema.map((d: Descriptor) => ({
    ...d,
    section: SECTIONS[d.group] ?? title(d.group),
    group: cardOf.get(d.key) ?? title(d.key.split(".")[1] ?? d.group),
  }))
  const groupPresets: Record<string, GroupPreset[]> = {}
  for (const set of phone.presets) groupPresets[title(set.label)] = set.presets
  return { descriptors, groupPresets, setFor }
}

let remote: ReturnType<typeof createRemoteControls> | undefined
let page: Page | undefined
let schemaKey = ""

function onState(phone: Phone) {
  const key = JSON.stringify(phone.schema.map((d) => d.key))
  if (remote && key === schemaKey) {
    // Incoming state: no onSet, no undo entry. Keys changed here in the last 600 ms hold against
    // the phone's stale echoes (a drag in flight), then the phone's latest state lands, so a
    // value it clamped still shows.
    remote.sync(phone.values, { replace: true })
    playground.update(phone.playgroundStatus)
    watch.update(phone.jumps)
    return
  }
  schemaKey = key
  page?.dispose()
  const { descriptors, groupPresets, setFor } = mapPhone(phone)
  remote = createRemoteControls("iphone-tune", descriptors, {
    values: phone.values,
    groupPresets,
    storage: localStorage, // saved variants and locks on the Mac
    onSet: (key, value) => send({ type: "set", key, value }),
    onReset: ({ key, group }) => {
      if (key) return // already sent as set null
      if (!group) return send({ type: "resetAll", group: null })
      for (const d of descriptors.filter((x) => x.group === group))
        send({ type: "set", key: d.key, value: null })
    },
    onPreset: ({ group, index }) => send({ type: "preset", key: setFor.get(group), index }),
  })
  page = mountPage(remote, document.getElementById("app")!, {
    title: `${phone.device} · ${phone.app}`,
    theme: "auto",
    sections: ["Playground", "Session List", "Transcript", "Composer"],
    copy: () => remote!.swift() || "// Nothing changed",
  })
  playground = playgroundCard(page) // page.card({ title: "Playground & Slow Motion", section: "Playground" })
  watch = motionWatchCard(page) //     page.card({ title: "Motion Watch", section: "Playground" })
  playground.update(phone.playgroundStatus)
  watch.update(phone.jumps)
}
```

Nothing in `opencode-ios` changes for this: the wire stays as it is. What knobs doesn't do yet: a choice with many options (`DrawerTextStyle` has eight) is still a segmented row, which outgrows a card; it wants a compact menu. The review player's frame canvas stays your own DOM in a custom card.

---

## 2. The Problems rewrite (`team-board`, branch `rewrite`, `packages/web`)

Problems is a SolidJS app with an Effect server. Three surfaces move to knobs: the viewer's
**Parameters** (`parameters.tsx`), a hosted prototype's **settings** (`pv:settings` from
`public/hosted/viewer.js`), and the dev-only **Prototype** dock (`app.tsx`). The working mirror of
the viewer's right panel is [`examples/problems.html`](../examples/problems.ts).

### What changes

| Today | With knobs |
| --- | --- |
| `Parameters`/`Parameter` components, `springStyle` per row, `springPath` SVG | `<KnobsPanel>` over one `createRemoteControls` store |
| Every `ParamSpec` of the source mounted, inactive rows collapsed to 0 px | `descriptors` per variation; shared keys keep their DOM, others enter and leave |
| `snap()` while another item arrives | `land` |
| `duration`/`bounce` in the `spring` group drawn as a curve + two sliders | one `{ kind: "spring", bind }` descriptor; values stay flat |
| `.dk-dot`, blue value, `Reset` shown while `edits` is non-empty | `useModified(params)` for the heading's Reset and the dot on "Choose N"; `readout-mark` in the preset draws the row's dot |
| `[data-param]` sliders found by the viewer's keyboard | `onReady` hands you `panel.focus()` for Tab; the panel's keys stop at the panel |
| `.dialkit-*` CSS | `problemsPreset` from `knobs/themes` |

### A. Parameters

```tsx
import { createRemoteControls, type ControlDescriptor } from "knobs"
import { KnobsPanel, useModified } from "knobs/solid"
import { problemsPreset } from "knobs/themes"

// ParamSpec → descriptors; one spring card binds the flat duration and bounce keys.
const descriptorsOf = (specs: readonly ParamSpec[]): ControlDescriptor[] => {
  const list: ControlDescriptor[] = specs.map((p) => ({
    key: p.key, label: p.label, kind: "number", default: p.value,
    min: p.min, max: p.max, step: p.step, unit: p.unit, decimals: p.decimals,
    ...(p.group === "spring" ? { group: "Spring" } : {}),
  }))
  if (specs.some((p) => p.key === "duration") && specs.some((p) => p.key === "bounce"))
    list.push({ key: "spring", kind: "spring", label: "Spring", group: "Spring", bind: { duration: "duration", bounce: "bounce" } })
  return list
}

const params = createRemoteControls("parameters", [], {
  ship: () => import("knobs/panel"),        // product UI: live in production builds
  nullDefaults: false,                       // onSet sends numbers; resets come as onReset
  onSet: (key, value) => setValue(key, value as number),
  onReset: ({ key, group }) => reset(key ?? group),  // {} is "everything"
})
const modified = useModified(params)         // the heading's Reset and the dot on "Choose N"

// Keep the array stable per variation (memoise by option): the same array only syncs values.
const descriptors = createMemo(() => descriptorsOf(option()?.params ?? []))

<KnobsPanel
  controls={params}
  descriptors={descriptors()}
  values={values()}                          // your state, after optimistic edits and echoes
  land={switching()}                         // J/K: another item arrived
  header={false}                             // your "Parameters" heading stays
  variants={false}
  theme="auto"
  preset={problemsPreset}
  keys={{
    random: false, mutate: false, compare: false, hint: false, undo: false, redo: false,
    presets: false, save: false, copy: false, resetAll: false,
    vim: false,      // J/K switch items even while tuning
    edit: false,     // 1–9 switch variations, Enter is Choose
    bigStep: 5,      // ⇧ moves five steps
    wrap: false,     // ↑/↓ stop at the ends
  }}
  onReady={(panel) => (focusParameters = () => panel.focus())}   // Tab = Tune
/>
```

The viewer's own key handler should return early on `event.defaultPrevented` (the panel claims
the keys it handles, and stops them) and treat focus inside the panel as the panel's: Tab inside
it is its own tab order, Esc hands focus back to the page.

The `level` row's maximum follows `stops` in today's demo: put that into the descriptors (a new
array when `stops` changes) and the row retunes in place.

### B. Prototype settings

```tsx
import { fromSettings } from "knobs"

const settings = createRemoteControls("prototype-settings", [], {
  ship: () => import("knobs/panel"),
  nullDefaults: false,
  marks: false,                    // the prototype owns these values: no dots, no resets
  onSet: (id, value) => frame.post({ type: "board:setting", id, value }),
  onAction: (id) => frame.post({ type: "board:setting", id, value: null }),
})
let home: State = {}               // what the prototype first reported is each setting's default
onMessage("pv:settings", (data) => {
  const next = fromSettings(data.groups, home)
  home = { ...next.values, ...home }
  setSettings(next)                // keep `descriptors` the same array while its shape holds
})

<KnobsPanel controls={settings} descriptors={settingsDescriptors()} values={settings().values}
  header={false} variants={false} preset={problemsPreset}
  keys={{ random: false, mutate: false, hint: false, undo: false, redo: false, copy: false, reset: false }} />
```

Choices with more than four options, or whose labels don't fit, drop down a menu; titles become
groups; actions are button rows.

### C. The dev-only Prototype dock

```tsx
const dock = defineControls("prototype-dock", {
  panel: choice("shown", ["shown", "hidden"], { label: "Video panel", labels: { shown: "Shown", hidden: "Hidden" } }),
  submit: choice("arrow", ["arrow", "send"], { label: "Submit button", labels: { arrow: "↑ Arrow", send: "Send" } }),
})
const panel = useValue(dock, "panel")   // re-runs only when this key changes

<KnobsPanel controls={dock} header={false} variants={false} preset={problemsPreset}
  keys={{ random: false, mutate: false, hint: false, menu: false }} />
```

Without `ship`, the dock is dev-only: in a production build it's locked to its defaults, mounts
nothing and none of the panel's code is in the bundle.
