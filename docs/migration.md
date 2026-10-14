# Migrating OpenCode iOS Tune & Problems Config Panels to `knobs`

This document sketches how the OpenCode iOS Mac tuning page (`scripts/tune-server.ts` in `opencode-ios`) and the Problems board prototype/config panels (`team-board`) can adopt `knobs` as a single shared control surface without losing any project-specific workflow.

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

## 2. Problems Board Config Panels (`~/code/open-source/team-board`)

### Current config surfaces in `team-board`

`team-board` currently maintains four separate configuration/tuning implementations:

1. **Per-variation parameter sliders in `public/design.js` (`#uvParams`)**:
   - Hand-rolled `.dialkit-slider` rows (`createParamRow`, `paintParamRow`, `patchParams`) for `stops`, `level`, `sweep`, `glow`, and `spring` (`duration`, `bounce`) with `.dk-dot` modified indicators and `Reset`.
2. **List layout panel in `public/design.js` (`renderLayoutPanel`)**:
   - Segmented choices for `titles`, `summaries`, `metadata`, `status`, `chromeColor`, and `stickers`, with `original` / `suggested` / `minimal` presets persisted to `localStorage['problems-design-layout-v3']`.
3. **Prototype dock in `public/design.js` (`renderProtoDock`)**:
   - Contextual segmented chips (`VIEWER_OPTIONS`, `BUILT_OPTIONS`, `ICON_STYLES`).
4. **Shared viewer settings in `public/hosted/viewer.js` (`settingsHTML`)**:
   - Grouped `choices`, `toggle`, and `action` rows rendered in `.pv-panel` (desktop right sidebar) and `.pv-sheet` (mobile bottom sheet), plus `prototypes/full-page/controls.js` comparison strip.

### How `knobs` unifies them

#### A. List Layout & Prototype Config (`public/design.js`)

Define the layout controls once with `defineControls` and presets:

```ts
import { defineControls, choice } from "knobs"
import { mountPanel } from "knobs/panel"

export const layoutControls = defineControls(
  "problems-design-layout",
  {
    titles: choice("short", ["original", "short", "question"], { label: "Titles" }),
    summaries: choice("useful", ["original", "useful", "off"], { label: "Summary" }),
    metadata: choice("type-id", ["type", "type-id", "inline"], { label: "Classification" }),
    status: choice("dots", ["dots", "followup", "clean"], { label: "Stage & pass" }),
    chromeColor: choice("subtle", ["subtle", "colored", "neutral"], { label: "Badge color" }),
    stickers: choice("optical", ["equal", "optical", "small"], { label: "Stickers" }),
  },
  {
    enabled: true,
    theme: "auto",
    density: "compact",
    presets: {
      original: { titles: "original", summaries: "original", metadata: "type-id", status: "dots", chromeColor: "colored", stickers: "equal" },
      suggested: { titles: "short", summaries: "useful", metadata: "type-id", status: "dots", chromeColor: "subtle", stickers: "optical" },
      minimal: { titles: "short", summaries: "off", metadata: "inline", status: "clean", chromeColor: "subtle", stickers: "small" },
    },
  },
)

// Mount inline into the layout disclosure or prototype dock:
mountPanel(layoutControls, document.querySelector("#layoutPanelHost")!, {
  title: "List layout",
  variants: false,
  history: false,
  footer: false,
})
layoutControls.subscribe(() => render())
```

#### B. Per-Variation Proposal Parameters (`#uvParams` in `public/design.js`)

Each proposal option's `params` array (`{ key, label, min, max, step, unit, value, group }`) maps directly to `ControlDescriptor[]`:

```ts
import { createRemoteControls } from "knobs"
import { mountPanel } from "knobs/panel"

function mountVariationParams(host: HTMLElement, item: any, stage: any, opt: any) {
  const key = `${item.id}:${stage.id}:${opt.id}`
  const controls = createRemoteControls(
    key,
    opt.params.map((p: any) => ({
      key: p.key,
      label: p.label,
      kind: "knob" as const,
      default: p.value,
      min: p.min,
      max: p.max,
      step: p.step,
      unit: p.unit,
      group: p.group === "spring" ? "Spring" : undefined,
    })),
    {
      values: state.paramValues.get(key) ?? {},
      density: "compact",
      onSet: () => {
        state.paramValues.set(key, controls.modified())
        patchStageProposal(item, stage, false)
      },
      onReset: () => {
        state.paramValues.set(key, controls.modified())
        patchStageProposal(item, stage, false)
      },
    },
  )

  return mountPanel(controls, host, {
    title: "Parameters",
    variants: false,
    history: false,
    footer: false,
  })
}
```

This replaces ~150 lines of custom slider/hashmark/reset DOM wiring in `public/design.js` with `knobs`'s rolling-number sliders, rubber-band overshoot, inline number editing, `Backspace`/double-click per-parameter reset, and `.knobs-modified` dots.

#### C. Full-Page Comparison Strip (`prototypes/full-page/controls.js`)

Replace the ad-hoc `#preview-controls` script with `defineControls` + `attachVariantSwitcher` (or an inline compact panel), gaining `1`–`9` and `←`/`→` keyboard switching plus URL/storage sync.
