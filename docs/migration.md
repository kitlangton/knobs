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
   - Incoming `{ type: "state" }` messages from the server call `remote.sync(phone.values, { replace: true })`. Because `knobs` sliders maintain their own pointer-capture drag state (`dragging`), calling `remote.sync(...)` updates non-dragged rows and never recreates DOM nodes!
3. **Built-in Swift codegen & local preset saving**:
   - `remote.swift(group?)` formats modified values into `Tunable<...>` and paired `TunableSpring(...)` declarations (identical to `scripts/tune-shared.ts`).
   - Passing `storage: window.localStorage` (optional) gives the Mac tune page named local variants, undo/redo (`u` / `⇧u`), hint-mode jumping (`s`), and `Randomize` for free.

### Drop-in sketch for `scripts/tune-server.ts`

```ts
import { createRemoteControls, type ControlDescriptor, type RemoteControls } from "knobs"
import { mountPanel, type Panel } from "knobs/panel"

let remote: RemoteControls | undefined
let panel: Panel | undefined
let schemaKey = ""

function onStateMessage(phone: {
  device: string
  app: string
  schema: ControlDescriptor[]
  values: Record<string, number | string | boolean>
}) {
  const nextKey = JSON.stringify(phone.schema.map((d) => d.key))
  if (!remote || nextKey !== schemaKey) {
    schemaKey = nextKey
    panel?.dispose()
    remote = createRemoteControls("iphone-tune", phone.schema, {
      theme: "auto",
      values: phone.values,
      storage: window.localStorage, // enables local saved variants on the Mac
      onSet: (key, value) => send({ type: "set", key, value }),
      onReset: ({ key, group }) => {
        if (key) send({ type: "set", key, value: null })
        else send({ type: "resetAll", group: group ?? null })
      },
      actions: [
        {
          label: "Copy as Swift",
          run: async () => {
            const text = remote!.swift()
            if (!text) return "Nothing changed."
            await navigator.clipboard.writeText(text)
            return "Copied Swift declarations."
          },
        },
        {
          label: "Show on Phone",
          run: () => {
            send({ type: "panel", shown: true })
            return "Opened panel on iPhone."
          },
        },
      ],
    })
    panel = mountPanel(remote, document.getElementById("groups")!, {
      title: `${phone.device} · ${phone.app}`,
      theme: "auto",
    })
  } else {
    // Patch values in place; active slider drags and DOM focus are preserved.
    remote.sync(phone.values, { replace: true })
  }
  document.getElementById("swift")!.textContent = remote.swift() || "Nothing changed"
}
```

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
