# Migrating OpenCode iOS Tune & Problems to `knobs`

This document covers how the OpenCode iOS Mac tuning page (`scripts/tune-server.ts` in `opencode-ios`), the Problems rewrite's panels (`team-board`) and Arcade's Lab adopt `knobs` as one shared control surface without losing any project-specific workflow.

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

The tune page is a page of groups, not a panel, so it maps onto `mountPage` (from `knobs/panel`): a sticky header (title, presets, Random, Reset, Copy as Swift, undo/redo), sections of group cards (each section a column, a long one spanning several, short ones stacking when the window is narrow), and custom cards for the Playground, Motion Watch and the review player. `examples/tune.html` is this migration running against a simulated phone that speaks the server's protocol (`examples/tune-phone.ts`); `examples/tune.ts` is the page.

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
| Playground & Slow Motion, Motion Watch, review player | `page.card({ title, section, element })` with `choice` (segmented, e.g. speed chips 0.1×–2×), `toggle`, `actions` and `item`; jumps that come and go are a keyed `card.list()`, and per-screen scenario buttons an `actions(...).set`, so both animate; arbitrary DOM goes in `card.body`. |
| `context` (only this screen's groups unless All), `hidden` | Show everything (a page has room) and `page.highlight({ sections })` what's on the phone's screen: the rest dims a little, and the highlight glides as the phone moves (see below). `/` filters rows live. |
| Card titles such as "Transcript · Arrivals" under Transcript | Shown as "Arrivals" automatically; or keep machine ids (`transcript.arrivals`) as groups with `groupLabels` / `groupLabel` for what they show. |
| Numbered preset chips 1, 2, 3 | Names ("Today · Brisk · Gentle") while they fit beside the title, else a compact menu; `1`–`9` still apply them (`groupPresetDisplay: "numbers"` keeps the chips). |
| The pairing card (QR code, Copy Link) | A collapsible custom card: `collapsed: false` while pairing, `card.collapse(true)` once the phone has signed in, with a one-line `summary`. |

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

### What's on screen, pairing, and quieter titles

The phone already reports what it shows (`phone.context = { id, groups, label? }`, sent as `{ type: "context" }`). Its `groups` are the keys' first segments, which are the page's sections, so the page highlights them: those sections keep full strength with a dot by their headings, the rest dims a little (still readable and interactive), and each change glides. `reveal: true` brings the first one into view when it's off screen, unless Kit scrolled, typed or touched the page in the last two seconds, or is dragging.

```ts
let shownContext = ""
function onState(phone: Phone) {
  // …remote.sync(…) as above…
  const key = JSON.stringify(phone.context)
  if (key !== shownContext) {
    const first = shownContext === ""
    shownContext = key
    // The phone's groups → the page's section ids (here the section names themselves).
    const sections = [...new Set(phone.context.groups.map((g) => SECTIONS[g] ?? title(g)))]
    page.highlight(showsAll ? null : { sections }, { reveal: !first })
  }
}
```

The groups can be cards too (`{ groups: ["transcript.arrivals"] }`, group ids or custom card titles), and a card highlighted on its own gets the dot by its title. Call it again after a remount: a new page starts with nothing highlighted.

The pairing card folds away once the phone is in. It remembers being folded per tab, so a reload doesn't bring the QR code back:

```ts
const connection = page.card({
  title: "Connection",
  section: "Connection",
  collapsed: false, // collapsible, open until paired
  summary: "Waiting for iPhone…",
})
connection.body.append(qrImage, pairingHint)
connection.actions([{ label: "Copy Link", run: copyLink }])

let paired: boolean | undefined
function onPairing(phone?: Phone) {
  const now = Boolean(phone)
  if (now === paired) return
  connection.summary(phone ? `iPhone · ${phone.version} · connected` : "Waiting for iPhone…")
  if (now && paired === false) connection.collapse(true) // paired just now: fold the code away
  paired = now
}
```

Clicking its header (or `Enter` on it) opens it again to pair another phone.

Card titles: a title that repeats its section ("Transcript · Arrivals" under Transcript) shows as "Arrivals" on its own. To keep unique ids without the prefix, group by id (the preset set's key for keys a set covers, else the key's first two segments) and label the groups. "Spacing" under Session List and "Spacing" under Composer then stay two cards, and presets, resets (`onReset({ group })`), `swift(group)` and highlights all take the id:

```ts
const setOf = new Map(phone.presets.flatMap((set) => set.keys.map((k) => [k, set] as const)))
const descriptors = phone.schema.map((d) => {
  const set = setOf.get(d.key)
  const id = set?.key ?? d.key.split(".").slice(0, 2).join(".") // "drawer.spacing"
  const label = set ? title(set.label) : title(d.key.split(".")[1] ?? d.group)
  return { ...d, group: id, groupLabel: label, section: d.group, sectionLabel: SECTIONS[d.group] }
})
const groupPresets = Object.fromEntries(phone.presets.map((set) => [set.key, set.presets]))
// onPreset: ({ group, index }) => send({ type: "preset", key: group, index }): the id is the set's key
mountPage(remote, app, { sections: ["Connection", "Playground", "drawer", "transcript", "composer"], defaultLabel: "Native" })
```

`defaultLabel: "Native"` names the header's baseline chip (its id stays `default`). Card presets show their names: "Today · Compact · Roomy" where they fit beside the title, a compact menu where they don't; `1`–`9` apply them as before.

Nothing in `opencode-ios` changes for this: the wire stays as it is. The review player's frame canvas stays your own DOM in a custom card.

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

---

## 3. Arcade's Lab (`packages/kit/lab-knobs.ts`)

Arcade draws every tuning panel with knobs (vendored at `942dff7`) and works around it in
`packages/kit/lab-knobs.ts`. Each workaround now has an option. `examples/lab.html` is a working
model of the Lab's column on these options, in both renderers.

| `lab-knobs.ts` today | Replace with |
| --- | --- |
| The facade (`Object.defineProperties` over the store) whose `randomize` and `mutate` call `roll()` with `seededPatch` | Store options `random: () => draw()` (a generator seeded from `tuning.seed`) and `tunable: (key, values) => isTunable(control(key), values)`; `random: false` on the seed descriptors in `describe()`. In `onSet`, a `meta.source` of `"randomize"` or `"mutate"` records `tuning.last` and moves to the next seed (see `rolled()` in `examples/lab.ts`). |
| The facade's `undo` / `redo`, and `history: !host.history` on the mount | Store option `history: { undo, redo, canUndo, canRedo, subscribe }` over the workbench's stack. The header's Undo and Redo stay, and follow `canUndo` / `canRedo`. Compare (hold `\`) is unchanged. |
| `data-lab-disabled` from `decorate()`, its `opacity:.38;pointer-events:none` rule, and the `enabled() === false` revert in `onSet` and `onAction` | `disabled: () => row.control.enabled?.(nav.settings) === false` on the descriptor. knobs dims the row (`--k-disabled-opacity`, `.38` in `labPreset`), blocks pointer and key edits, keeps focus able to read it, and Random, Mutate and Reset skip it. Function fields don't change a descriptor's shape, so a new closure on each `refreshShape` swaps nothing. |
| `onReset` filtering out what it can't reset | Reset skips disabled and read-only keys itself; when it skips any, `onReset` reports the rest key by key instead of `{}`. |
| `variantStorage()`, a port that lets only `:variants:v1` keys through | `storage: localStorage, persist: "variants"` (or `storage: null` without `variantsId`). |
| `sessionStorage.removeItem("knobs:<id>:session:v1")` before mounting | `session: false` on the mount. |
| `orderRows` putting `folded` groups last | `folded: row.control.folded` on the descriptors (or `groupFolded` from `nav.folded`). Those groups fold in place, start folded, and open from their header; `panel.fold(group, folded?)` follows `nav.fold()`. |
| The pin button appended in `decorate()` (with `stopPropagation` and absolute positioning) and the spawn-time `::after` dot and `title` | `rowAccessory: (key) => node` returning the pin and the dot; call `panel.updateAccessories()` after `pin.toggle`. The slot sits after the label and its clicks never reach the row. Keep the `.lab-knobs-pin` colours; drop its positioning. |
| `ensureLabKnobsStyles()`'s `(0,0,2)` reset and `letter-spacing:normal` on the panel | Nothing: panels reset a host's element rules themselves (`button`, `input`, `span`, `*:focus`). |
| `:is(.knobs-row,.knobs-slider)[data-field="…"]` in `rowElement` | `.knobs-row[data-field="…"]`: every row carries `knobs-row`. |
| `arcadePreset` | `labPreset` from `knobs/themes`, square and flat. Spread it to keep the width rule: `{ ...labPreset, css: "&{--k-width:100%}&[data-lab-floating]{--k-width:300px}" }`. |
| `packages/knobs/scripts/sync.ts` rewriting rolling-number's text import | Nothing: `src/panel/rolling-css.ts` ships the stylesheet as a module. Drop the rewrite from the sync script. |

A few things to watch:

- **Seeds.** knobs draws a field's value its own way, so a seed recorded under `seededPatch` gives
  different values after the switch. Seeds recorded afterwards reproduce: a roll draws only for the
  keys it changes, in schema order.
- **Multi-selection.** When the Lab edits several items at once, pass the keys whose values differ
  as `sync(values, { mixed })` (or `update(…, { mixed })`). Those rows read "—", and the first edit
  of one reaches `onSet` even when the value is unchanged, so it applies to every item.
- **Long choices.** Menus with more than eight options open with a search field, values truncate
  with a tooltip, and labels keep their words up to half the row. The Lab's own label-column sizing
  can go.
- **A group's own Randomize.** A group with its own "Randomize <group>" action no longer needs the
  facade: `groupRandom: (group, mode) => …` on the mount runs for the group's die, `g` and `⌥G`.
  Return `true` when the host rolled the group (the die still tumbles) and knobs leaves its values
  alone; return anything else to let knobs roll it. The Lab's Emitter group in `examples/lab.ts`
  works this way.
- **What stays in Arcade.** The `data-lab-flash` highlight is the Lab's own.

### The workspace: `panels.ts` and `outliner.ts`

The Lab's hand-built panes and outliner can move to `knobs/ui`. `examples/lab-workspace.ts` is a
working model of the Lab's layout on it: an outliner on the left, the viewport over a dock in the
middle, and the inspector column on the right.

| Lab today | Replace with |
| --- | --- |
| The resizable columns and the dock in `panels.ts`, with their own drag handles, min and max clamps and saved sizes | `split()` from `knobs/ui`, one per direction, nested in each other's `pane(id).body`. Give each split an `id` and layouts are saved and restored before the first paint. Mark side columns and the dock `collapsible`; `rail` names a collapsed column and `title` gives a pane a header (a column pane folds to it). |
| Code that re-lays out a canvas or panel when a column moves | Listen for `knobs-pane-resize` on the pane element, or use `onLayout`. GPU panels in panes follow on their own (the `knobs-layout` event). |
| The outliner's rows, expand state, selection and drag reorder in `outliner.ts` | `tree()` over the scene's items (`getId`, `getLabel` and `getChildren` if they aren't `id`, `label` and `children`). `onSelect` drives the inspector; `onMove` returns `{ ids, parent, index }` for the scene graph (`applyMove` for plain items), then `update(items)`. Visibility and lock are `toggles: [{ id: "visible", … }, { id: "locked", … }]`; rename is `onRename`. |
| The outliner's search box filter | Keep the input and call `outline.filter(query)`: matching rows show with their ancestors, the match marked. |
| `arcadePreset` on the workspace chrome | `{ preset: labPreset }` on each `split` and `tree`, as on the panels. |

Mount the inspector panels in the right pane's body as before (`mountPanel(controls, main.pane("right").body)`).
Panes create no stacking contexts, so the panels keep the GPU renderer and their overlays.

### Live readouts and overlays

`examples/lab-live.ts` and `examples/lab-overlays.ts` model the Lab's live dock and its command
surfaces on knobs.

| Lab today | Replace with |
| --- | --- |
| Hand-drawn perf HUDs and stat strips (canvas sparklines, frame-time graphs, text counters updated each frame) | Readout rows in a store of their own: `graph` for CPU/GPU frame time with a `16.7` threshold, `sparkline` and `watch` for counts, `meter` for budgets (`warn`, `critical`), `table` for per-pass timings, `log` for events. Push with `controls.watch(key, value)` from the frame loop; rows redraw at most once a frame, only on screen, and sleep when the feed stops. They draw on the GPU overlay too. |
| `title` attributes on toolbar and pane buttons | `tooltip(el, { text, shortcut })` or `data-tip` with `tooltips(document)`; split panes' buttons have them already. |
| A search box that filters stations or commands by substring | `commandPalette({ commands })` on `⌘K`, with `commandsFrom(controls, { reveal })` for each panel's store and the workbench's own commands beside them. |
| `window.confirm` before deleting from the outliner | `await confirm({ title, body, confirm: "Delete", destructive: true })`. |
| Ad-hoc status text after Copy or Export | `toast(message)`; pages already use it for their status. |

Set the look once with `overlayLook({ preset: labPreset, theme: "dark" })`.

