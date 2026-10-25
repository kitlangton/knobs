import { formatCode, type CodeFormat } from "./code.js"
import { normalizeCombo } from "./keys.js"
import { mutateValues } from "./mutate.js"
import { around, pick, randomValues } from "./random.js"
import { REFRESHES, RESET_KEYS, RESHAPE, type Reshape, type ResetKeys } from "./internal.js"
import {
  pushReadout,
  READOUT,
  type ReadoutPort,
  readoutState,
  type ReadoutState,
} from "./readout.js"
import type { TokenPreset } from "./theme.js"
import type { Appearance, ThemeMode } from "./appearance.js"
import type { Theme } from "../themes/define.js"
import {
  equal,
  normalize,
  normalizeField,
  pinnedKeys,
  presetFreeKeys,
  same,
  hasValue,
  toolbarShortcut,
  type Field,
  isReadout,
  type ReadoutInput,
  type ReadoutKeys,
  type Schema,
  type State,
  type ValueField,
  type Values,
  valueKeys,
  variantsOf,
} from "./schema.js"
import { browserStorage, storageKey, type StoragePort } from "./storage.js"
import { isUnlocked, onUnlock, unlockedPanel } from "./unlock.js"
import { createVariants, type Variant, type Variants } from "./variants.js"

declare const __KNOBS_DEV__: boolean
/** knobs' development build, or its source under a dev server (Vite's `import.meta.env.DEV`). */
const devBuild = (): boolean =>
  typeof __KNOBS_DEV__ !== "undefined"
    ? __KNOBS_DEV__
    : ((import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? true)
export type { Appearance, ThemeMode } from "./appearance.js"
export type DensityMode = "compact" | "default" | "comfortable"
export type RendererMode = "gpu" | "dom" | "auto"
/** When a store's chip shows; see `ChipOptions.reveal`. */
export type RevealMode = "hover" | "shortcut" | "always"
/** The floating chip `attach` puts on an element, which grows into its panel. */
export interface ChipOptions {
  /** Text beside the cog, e.g. `"knobs"`. Just the cog by default. */
  readonly label?: string
  /**
   * When the chip shows. `"hover"`: while the element is hovered or focused. `"shortcut"`: hidden
   * until `shortcut` turns on knobs mode (remembered for the tab), then on hover. `"always"`:
   * whenever its panel is closed. `"hover"` in development (and on a page someone unlocked),
   * `"shortcut"` for a shipped store in production builds.
   */
  readonly reveal?: RevealMode
  /** The key that toggles knobs mode for `"shortcut"` chips: `"Alt+Shift+D"` (⌥⇧D) by default. */
  readonly shortcut?: string
}
export type ChangeSource =
  | "local"
  | "remote"
  | "reset"
  | "preset"
  | "variant"
  | "undo"
  | "redo"
  | "randomize"
  | "mutate"
  | "compare"
/**
 * A key going into the hand and out of it: a drag or a press on its row, an inline edit, or a
 * burst of arrow keys. Changes between a key's `start` and `end` are one gesture, so a host can
 * open one undo entry at `start` and close it at `end`.
 */
export interface GestureEvent {
  readonly key: string
  readonly phase: "start" | "end"
}
export interface ChangeMeta {
  readonly source: ChangeSource
  readonly coalesce?: boolean
  readonly key?: string
  readonly group?: string
  /** A reset that went back to the active preset (see `Controls.activePreset`), not the defaults. */
  readonly base?: boolean
}
/**
 * The preset last applied from the strip: a schema preset (by id) or a saved variant. It's the
 * base Reset returns to and Random explores around.
 */
export interface PresetRef {
  readonly kind: "preset" | "variant"
  readonly id: string
}
/**
 * A preset strip that belongs to one tab or group (see `ControlsOptions.scopedPresets`): its
 * presets and saved variants move only its own keys, and it keeps its own active preset.
 */
export interface PresetScope<V = State> {
  /** The tab or group it's named for. */
  readonly id: string
  /** The keys it moves: the tab's or group's, pinned ones aside. */
  readonly keys: readonly string[]
  /** By id, `default` first; keys outside the scope sit at their defaults. */
  readonly presets: Readonly<Record<string, V>>
  readonly variants: Variants<V>
}
export interface ControlAction<V = State> {
  readonly id?: string
  readonly label: string
  readonly group?: string
  readonly shortcut?: string
  run(values: V, controls: Controls<any>): void | string | Promise<void | string>
}
/** One of a group's numbered presets; keys it leaves out sit at their defaults (see `groupPresets`). */
export interface GroupPreset<V = State> {
  readonly name: string
  readonly values: Partial<V>
}
/**
 * How a page card shows its group presets: `names` as segments ("Native · Tight · Airy"), `menu`
 * as a compact drop-down showing the selected one's name, `numbers` as 1, 2, 3…; `auto` (the
 * default) shows names while they fit beside the title, else the menu.
 */
export type GroupPresetDisplay = "auto" | "names" | "numbers" | "menu"
/** The default chip's label for `scope` (see `LabelOptions.defaultLabel`). */
const defaultLabelOf = (
  label: string | Readonly<Record<string, string>> | undefined,
  scope: string,
): string | undefined => (typeof label === "object" ? label[scope] : label)
/** Display labels, kept apart from the ids that identify groups, sections and presets. */
export interface LabelOptions {
  /** By group id: what its header shows (verbatim). Ids stay identity everywhere else. */
  readonly groupLabels?: Readonly<Record<string, string>>
  /** By section id: what its heading shows. */
  readonly sectionLabels?: Readonly<Record<string, string>>
  /** By preset id: what the preset strip shows, e.g. `{ default: "Native" }`. */
  readonly presetLabels?: Readonly<Record<string, string>>
  /**
   * Shorthand for `presetLabels.default`; by scope, `{ "": "Empty", Motion: "Shipped" }` names each
   * strip's default chip on its own (`""` is the panel's, a tab or group's id one of `scopedPresets`).
   */
  readonly defaultLabel?: string | Readonly<Record<string, string>>
  /** How a page card shows its group presets (see `GroupPresetDisplay`). */
  readonly groupPresetDisplay?: GroupPresetDisplay
  /** By group id: one muted line under its card's title, over fields' `groupDescription`. */
  readonly groupDescriptions?: Readonly<Record<string, string>>
  /** By section id: one muted line under its heading on a page, over fields' `sectionDescription`. */
  readonly sectionDescriptions?: Readonly<Record<string, string>>
}
/**
 * How a page's sections start: `true` folds every section to its heading, or by section id. A
 * section neither names keeps its fields' `sectionFolded`, else starts open.
 */
export type SectionFolded = boolean | Readonly<Record<string, boolean>>
/** Panel commands with a key binding; see `MountPanelOptions.keys`. */
export type PanelCommand =
  | "random"
  | "mutate"
  | "reset"
  | "resetAll"
  | "compare"
  | "hint"
  | "undo"
  | "redo"
  | "copy"
  | "save"
  | "lock"
  | "presets"
  | "group"
  | "first"
  | "help"
  | "menu"
  | "leave"
/**
 * Remaps (a single character, or a key name such as `"F2"`) or turns off (`false`) a panel's key
 * bindings. Unlisted commands keep their default key. `true` keeps the default.
 */
export type PanelKeys = { readonly [C in PanelCommand]?: string | boolean } & {
  /** `false` drops the j/k aliases: only the arrows move; the letters reach the page. */
  readonly vim?: boolean
  /**
   * `false` stops digits, `.`, `-` and Enter from opening a slider's inline number editor (they
   * reach the page); clicking the readout still edits.
   */
  readonly edit?: boolean
  /** What ⇧ multiplies an arrow's step by; 10 by default. */
  readonly bigStep?: number
  /** `false` stops ↑/↓ at the first and last rows instead of wrapping around. */
  readonly wrap?: boolean
}
/** `glass` (the default): ticks with a faint ring. `mech`: drier, the rings all but gone. */
export type SoundTheme = "glass" | "mech"
/** A mount's `sound`, beyond `true`. */
export interface SoundOptions {
  /** This panel's level, 0–1 (times `sound.volume`). */
  readonly volume?: number
  readonly theme?: SoundTheme
}
/** A header button (see `MountPanelOptions.header`). */
export type HeaderButton = "random" | "reset" | "copy" | "undo" | "redo" | "help" | "close"
export interface HeaderOptions {
  /** `false` hides the title; the buttons stay at the right. */
  readonly title?: boolean
  /**
   * Which buttons show (of those that are on). All but `help` by default: its `?` key opens the
   * shortcuts either way, and the title's tooltip says so. List `"help"` to bring the button back.
   */
  readonly buttons?: readonly HeaderButton[]
}
/** What's active in a panel (see `MountPanelOptions.onActive`): a card, or one of its rows. */
export interface PanelActive {
  readonly group: string
  readonly key?: string
}
/** What a folded card's or section's summary is made of (see `MountPanelOptions.groupSummary`). */
export interface FoldSummaryInfo {
  /** The group preset its values match (its name), "Custom" when none does; null without any. */
  readonly preset: string | null
  /** How many of its rows differ from their defaults (a spring's two keys count once). */
  readonly changed: number
  /** Its value keys. */
  readonly keys: readonly string[]
}
export interface MountPanelOptions extends LabelOptions {
  readonly title?: string | false
  /**
   * Key bindings. An inline panel only ever hears keys while focus is inside it; pass this to remap
   * or turn off commands so they don't shadow the host's own keys, e.g.
   * `{ random: false, mutate: false, compare: false, hint: false, undo: false }` or `{ hint: "f" }`.
   * The `?` popover and hint badges list only what's enabled.
   */
  readonly keys?: PanelKeys
  /**
   * Hint mode's reach. `"page"` (the default): `s` labels every visible control in every panel
   * and knobs/ui piece on the page (and the host's `data-hint` elements), so pressed here or
   * anywhere outside a text field it jumps across all of them; with nothing else on the page it's
   * this panel's alone, as always. `"panel"`: `s` here labels only this panel's controls, and they
   * don't join the page's. `keys: { hint: false }` turns hint mode off here either way. As an
   * object, `reach` is that choice and `digits: "always"` keeps the preset strips' digits on their
   * chips all the time, quietly, rather than only while you use keys.
   */
  readonly hints?:
    | "page"
    | "panel"
    | { readonly reach?: "page" | "panel"; readonly digits?: "keys" | "always" }
  /**
   * The key that shows and hides every panel and chip on the page that listens for it, outside
   * text fields and without modifiers; remembered per store. The store's `toggleKey` by default
   * (a backtick), `false` on a full page (`mountPage`). `false`: this panel always shows.
   */
  readonly toggleKey?: string | false
  /**
   * `false` hides what says a value differs from its default: modified dots and readout marks,
   * group reset icons and the header's Reset. For panels whose values belong to someone else
   * (a prototype's settings), where "default" means nothing. The store's `marks` by default.
   */
  readonly marks?: boolean
  /** @deprecated Token values to style the panel with (see `TokenPreset`); use `theme`. */
  readonly preset?: TokenPreset
  /**
   * `false` drops the header (title and buttons) for a host that draws its own. An object keeps
   * it and chooses what shows: `{ title: false, buttons: ["random", "undo", "redo"] }`. A button
   * left out keeps its key; a command that's off (`keys`) loses its button either way. Without a
   * list, every button but `help` shows (see `HeaderOptions`).
   */
  readonly header?: boolean | HeaderOptions
  /**
   * How groups draw. `"cards"` (the default): a card per group. `"flat"`: one surface; a group's
   * title is a small heading over a hairline, its rows on hairlines. `"indent"`: one surface; a
   * titled group is a fold, its rows indented under its title.
   */
  readonly surface?: "cards" | "flat" | "indent"
  /**
   * `true` shows a scope line beside the title (`Shape › Cohesion`, where keys go, and a faint
   * `esc ↑ Shape` for where Esc goes). Off by default; the focus lens and the armed frame show
   * either way.
   */
  readonly crumbs?: boolean
  /**
   * `false`: no per-tab session, so a rebuilt panel doesn't take focus back to the row it last
   * had or reopen editors and folded groups. On while the store has storage.
   */
  readonly session?: boolean
  /** Groups folded (`true`) or open (`false`) at first, over their fields' `folded`. */
  readonly groupFolded?: Readonly<Record<string, boolean>>
  /** Sub-headings (fields' `subsection`) that start folded (`true`), by name; `true` folds them all. */
  readonly subsectionFolded?: boolean | Readonly<Record<string, boolean>>
  /**
   * Where a panel remembers its folded groups and sub-headings across reloads (folds only, under
   * `knobs:<id>:folds:v1`), whatever `session` says. Without it they're kept in the store's own
   * storage (off with `session: false` or `persist: "none"`); `null` keeps them to the tab's
   * session. What the user last chose wins over `groupFolded`, fields' `folded` and
   * `subsectionFolded`. Pages have their own `foldStorage`.
   */
  readonly foldStorage?: StoragePort | null
  /**
   * The tab strip's order and labels: tab ids, or `{ id, label }`. Tabs the fields name that
   * aren't listed follow in the order they first appear.
   */
  readonly tabs?: readonly (string | { readonly id: string; readonly label?: string })[]
  /** The tab shown first; otherwise the one last shown for these controls, else the first. */
  readonly tab?: string
  /** Called when the shown tab changes (by a click, a key or `panel.tab()`). */
  readonly onTab?: (tab: string) => void
  /**
   * A search field under the header that filters rows by label, key or group as you type, with
   * filter chips (`"modified"`, with its count, by default). `/` focuses it.
   */
  readonly search?: boolean | SearchOptions
  /**
   * A group's Random (its die, `g`, ⌥ for Mutate) asks the host first: returning `true` means the
   * host rolled the group itself (its own seeded "Randomize <group>"), and the panel only tumbles
   * the die.
   */
  readonly groupRandom?: (group: string, mode: "random" | "mutate") => boolean | void
  /**
   * A node for a row's accessory slot, just after its label (a pin, a marker), or null. Called
   * with the row's key when the row is built; `panel.updateAccessories()` asks again. The node
   * stays the host's: style it, listen on it. With the WebGPU renderer it stays DOM (see README).
   */
  readonly rowAccessory?: (key: string) => Node | null
  /**
   * Light haptic ticks on phones (a stepped slider crossing a stop, the default's magnet, a
   * choice changing mid-pan, a switch flipping); on by default, `false` turns them off.
   * Reduced motion turns them off too.
   */
  readonly haptics?: boolean
  /**
   * Magnetic detents on slider drags and pans (the default, the active preset's value, the middle
   * and zero); on by default, `false` turns them off for the whole panel.
   */
  readonly detents?: boolean
  /**
   * Sound effects: quiet, short ticks and clicks synthesized live for the panel's moments (a
   * slider's detents, a switch, Random, Copy…). Off by default; `true` turns them on, or
   * `{ volume, theme }`. The page's switch (`sound.enable(false)` from `knobs/panel`) mutes every
   * panel, and the `?` popover offers it as Sounds, kept in the store's storage.
   */
  readonly sound?: boolean | SoundOptions
  /** Called once the panel is mounted, with a handle to focus it (a host's "Tune" key). */
  readonly onReady?: (panel: PanelHandle) => void
  /**
   * Called when the card or row under the pointer or focus changes: `{ group }` for a card's
   * header or body, `{ group, key }` for one of its rows, `null` for nothing (and once more when
   * the panel goes). Whichever of pointer and focus moved last wins; at most once a frame, never
   * the same value twice. For outlining the part of the app a card changes.
   */
  readonly onActive?: (at: PanelActive | null) => void
  /**
   * What a folded group card's header says on its right. In a panel, by default, a one-row card's
   * value ("CSS orb"); otherwise its matching group preset, else its first changed value, else
   * its first choice, then "· N changed". On a page, "<matching preset, or Custom> · N changed".
   * Each part shows only where it applies; `null` shows nothing.
   */
  readonly groupSummary?: (group: string, info: FoldSummaryInfo) => string | Node | null
  /** What Copy (and ⇧C) puts on the clipboard; `controls.code()` by default. */
  readonly copy?: () => string
  /**
   * Format for every Copy action (header, rows and groups). Swift and Rust require remote
   * controls. A callback receives selected keys (undefined for all), then the group id when
   * copying a group. Takes precedence over `copy`; TypeScript is the default.
   */
  readonly copyAs?: "ts" | "swift" | "rust" | ((keys?: readonly string[], group?: string) => string)
  /**
   * A theme from `defineTheme` (`themes.knobs`, `themes.void`); the store's by default. The old
   * `"dark" | "light" | "auto"` still sets the appearance.
   */
  readonly theme?: Theme | ThemeMode
  /** dark | light | system | inherit (the default: follow the page, else the OS). */
  readonly appearance?: Appearance
  readonly density?: DensityMode
  readonly renderer?: RendererMode
  readonly variants?: boolean
  /**
   * The presets as chips in a tray (`"chips"`) or as rows like a menu's (`"list"`). `"auto"` (the
   * default) shows chips while they fit on two lines and the list once they'd take more.
   */
  readonly presetDisplay?: "auto" | "list" | "chips"
  /** Shown in the panel's quiet style while it has no rows (`"This story has no controls"`). */
  readonly empty?: string
  readonly history?: boolean
  readonly footer?: boolean
  readonly actions?: readonly ControlAction<any>[]
  /**
   * Buttons for each group's own action row: its header in a panel (icons alone, their labels as
   * tooltips), the row above its presets when embedded (icon and label). Called once per group
   * as its header is built; return `[]` for none.
   */
  readonly groupActions?: (group: string) => readonly GroupAction[]
  /**
   * `true` renders the panel into its host as part of the host's page: no frame, header, title,
   * footer or toggle key, and compact rows unless `density` says otherwise. Each group leads with
   * its action row (`groupActions`, its Reset and die) and its own presets (`scopedPresets`).
   * Inline only (`mountPanel`, `KnobsPanel`); keys still work while focus is inside.
   */
  readonly embed?: boolean
  /**
   * Show only these groups' rows, in this order (`["Sidebars · Peek"]`), e.g. one feature's
   * page of a host's settings. Rows outside every group never show while it's set.
   */
  readonly groups?: readonly string[]
  readonly onClose?: () => void
}
/** A button in a group's action row (`MountPanelOptions.groupActions`). */
export interface GroupAction {
  readonly label: string
  /** A built-in icon (`retrigger`, `target`, `reset`, `play`, …) or SVG path data on a 256 grid. */
  readonly icon?: string
  /** Its tooltip; the label by default. */
  readonly title?: string
  run(): void | string | Promise<void | string>
}
/** A search field's filter chip: it narrows the rows to those `test` accepts. */
export interface SearchChip {
  readonly id: string
  readonly label: string
  /** Shows how many rows it would keep beside its label. */
  readonly count?: boolean
  test(key: string, controls: Controls<any>): boolean
}
export interface SearchOptions {
  readonly placeholder?: string
  /** `"modified"` (rows off their defaults) or chips of your own; `["modified"]` by default. */
  readonly chips?: readonly ("modified" | SearchChip)[]
}
/**
 * An undo stack the host owns (an editor's ⌘Z that covers more than these values). The panel's
 * undo and redo buttons and keys call it; compare (hold `\`) still previews knobs' own last entry.
 */
export interface HostHistory {
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  /** Called when `canUndo` or `canRedo` may have changed; returns an unsubscribe. */
  subscribe?(cb: () => void): () => void
}
/**
 * What `storage` keeps: `"all"` (values, locks and saved variants; the default), `"variants"`
 * (only saved variants, for values the host owns) or `"none"`.
 */
export type PersistMode = "all" | "variants" | "none"
export interface SyncOptions {
  /** Keys missing from `values` return to their defaults. */
  readonly replace?: boolean
  /**
   * Keys whose values differ across what the host is showing (a multi-selection): they show an
   * indeterminate "—" until edited. Replaces the store's mixed keys (see `Controls.setMixed`).
   */
  readonly mixed?: readonly string[]
  /**
   * A different item arrived: panels place the values without springing or rolling, and undo
   * history starts over (it belonged to the previous item).
   */
  readonly land?: boolean
}
/** A mounted panel: what `mount` hands `onReady`. */
export interface PanelHandle {
  readonly element: HTMLElement
  focus(): void
  dispose(): void
}
/**
 * The panel module a shipped store mounts with: `() => import("knobs/panel")`. Structural, so the
 * core never imports the panel itself.
 */
export interface PanelModule {
  mountPanel(
    controls: Controls<any>,
    container: HTMLElement,
    options?: MountPanelOptions,
  ): PanelHandle
  attach(controls: Controls<any>, element: HTMLElement, chip?: ChipOptions): () => void
  /** A brief status at the bottom of the page ("knobs unlocked"). */
  status?(text: string): void
}
export interface ControlsOptions<S extends Schema> extends LabelOptions {
  enabled?: boolean | (() => boolean)
  /**
   * Ships this store as product UI: it stays live in production builds (where stores are
   * otherwise locked to their defaults) and mounts panels from the module this loads, e.g.
   * `ship: () => import("knobs/panel")`. `enabled` defaults to true. Stores without it stay
   * dev-only and ship constants.
   */
  ship?: () => Promise<PanelModule>
  /** The chip `attach` shows: its label, when it shows and the knobs-mode key (see `ChipOptions`). */
  chip?: ChipOptions
  /**
   * The key that shows and hides this store's panels and chips, with every other panel on the
   * page that listens for it (see `MountPanelOptions.toggleKey`). A backtick by default; `false`
   * for a shipped store (`ship`), whose panels are product UI. `false`: always shown.
   */
  toggleKey?: string | false
  /**
   * The longest (ms) a key changed here outranks incoming values for it (see `sync`), so an echo
   * of an older value still in flight can't pull it back. The hold ends early once the remote
   * reports the value that was sent (for numbers, within half a step). 0 by default; remote
   * controls use 600. Raise it for peers that acknowledge slowly.
   */
  echo?: number
  storage?: StoragePort | null
  /** What `storage` keeps: everything, only saved variants, or nothing (see `PersistMode`). */
  persist?: PersistMode
  /**
   * The source Random and Mutate draw from, `[0, 1)` like `Math.random` (the default). Pass a
   * seeded generator to make a roll reproducible.
   */
  random?: () => number
  /**
   * Whether Random and Mutate may change a key, beside locks and each field's `random: false`
   * (e.g. never seeds or structural pickers).
   */
  tunable?: (key: keyof S & string, values: Values<S>) => boolean
  /** An undo stack the host owns; undo and redo call it (see `HostHistory`). */
  history?: HostHistory
  presets?: Readonly<Record<string, Partial<Values<S>>>>
  /**
   * Presets that belong to one tab or group, keyed by its id: `{ Sidebars: { snappy: {…} } }`.
   * Each shows its own strip on that tab (a tab without any shows none), moves only that tab's
   * or group's keys, and has its own active preset, modified mark and saved variants. A variants
   * choice on a tab adds its options to that tab's. `presets` then covers only the keys no scope
   * holds; leave it out and only the scoped strips show.
   */
  scopedPresets?: Readonly<Record<string, Readonly<Record<string, Partial<Values<S>>>>>>
  /**
   * Groups pinned to the top of a panel, under the header and above the tab strip, on every tab
   * (as fields' `pinned: true` pins theirs). Presets and saved variants leave them alone: applying
   * one keeps their values, saving one keeps them out, and they're modified against their defaults.
   * A scope keyed by the group's own name (`scopedPresets`) still moves it.
   */
  pinned?: readonly string[]
  /**
   * Groups presets leave alone, where they are: `{ Motion: false }`. As with pinned groups,
   * applying a preset or variant keeps their values, saving one leaves them out, and a preset's chip
   * doesn't drift when they change; but their rows stay in place. A scope keyed by the group's own
   * name (`scopedPresets: { Motion: … }`) still moves it: only other scopes' presets leave it
   * alone. A field says it alone with `inPresets: false`, and then no scope moves it.
   */
  inPresets?: Readonly<Record<string, boolean>>
  /**
   * Numbered presets per group, shown as 1, 2, 3… on the group's card in a page. A group's
   * presets cover every key any of them names; keys a preset leaves out are at their defaults,
   * so `{ name: "Today", values: {} }` is the shipped look.
   */
  groupPresets?: Readonly<Record<string, readonly GroupPreset<Values<S>>[]>>
  actions?: readonly ControlAction<Values<S>>[]
  /** Its panels' theme (see `MountPanelOptions.theme`). */
  theme?: Theme | ThemeMode
  /** Its panels' appearance (see `MountPanelOptions.appearance`). */
  appearance?: Appearance
  density?: DensityMode
  renderer?: RendererMode
  /** Default key bindings for this store's panels (see `MountPanelOptions.keys`). */
  keys?: PanelKeys
  /** `false`: its panels show no modified marks or resets (see `MountPanelOptions.marks`). */
  marks?: boolean
  /** How its groups start, folded or open, under the mount's `groupFolded` (see there). */
  groupFolded?: Readonly<Record<string, boolean>>
  /** How a page's sections start, under the mount's `sectionFolded` (see `SectionFolded`). */
  sectionFolded?: SectionFolded
  onChange?: (patch: Partial<Values<S>>, values: Values<S>, meta: ChangeMeta) => void
  /** A key went into the hand or out of it (see `GestureEvent`). */
  onGesture?: (event: GestureEvent) => void
  onReset?: (target: { key?: keyof S & string; group?: string }) => void
  /** An action row was pressed (after its own `run`), or a toolbar button (with its item's id). */
  onAction?: (key: string) => void
  /** A group's numbered preset was applied (after its values are set). */
  onPreset?: (target: { group: string; index: number; name: string }) => void
}
export interface Controls<S extends Schema = Schema> {
  readonly id: string
  readonly schema: S
  readonly locked: Values<S>
  readonly enabled: boolean
  readonly storage: StoragePort | null
  /** What `storage` keeps (see `PersistMode`). */
  readonly persist: PersistMode
  readonly presets: Readonly<Record<string, Values<S>>>
  readonly variants: Variants<Values<S>>
  /** The tabs and groups with presets of their own, by id (see `ControlsOptions.scopedPresets`). */
  readonly scopes: Readonly<Record<string, PresetScope<Values<S>>>>
  /**
   * The scope `key`'s presets come from: a tab or group's id, `""` for `presets`, or undefined
   * when presets leave it alone (pinned, `inPresets: false`, without a scope of its group's own).
   */
  scopeOf(key: string): string | undefined
  readonly actions: readonly ControlAction<Values<S>>[]
  /** Its panels' theme, as given (see `ControlsOptions.theme`). */
  readonly theme: Theme | ThemeMode | undefined
  readonly appearance: Appearance | undefined
  readonly density: DensityMode
  readonly renderer: RendererMode
  readonly keys: PanelKeys | undefined
  readonly marks: boolean
  /** The chip's options, with `reveal` and `shortcut` resolved. */
  readonly chip: ChipOptions & { readonly reveal: RevealMode; readonly shortcut: string }
  /** The key that shows and hides its panels and chips, or `false` (see `ControlsOptions.toggleKey`). */
  readonly toggleKey: string | false
  /** How page cards show group presets (`groupPresetDisplay`, `auto` by default). */
  readonly groupPresetDisplay: GroupPresetDisplay
  /** A group's display label (`groupLabels`, else its fields' `groupLabel`), if it has one. */
  groupLabel(group: string): string | undefined
  /** A section's display label (`sectionLabels`, else its fields' `sectionLabel`), if it has one. */
  sectionLabel(section: string): string | undefined
  /** A group's description (`groupDescriptions`, else its fields' `groupDescription`), if any. */
  groupDescription(group: string): string | undefined
  /** A section's description (`sectionDescriptions`, else its fields' `sectionDescription`), if any. */
  sectionDescription(section: string): string | undefined
  /** How groups start (`groupFolded`), as given; panels read it under their own `groupFolded`. */
  readonly groupFolded: Readonly<Record<string, boolean>> | undefined
  /** How a page's sections start (`sectionFolded`), as given. */
  readonly sectionFolded: SectionFolded | undefined
  /** A preset's display label (`presetLabels`, `defaultLabel`), else its id; `scope` as in `preset`. */
  presetLabel(id: string, scope?: string): string
  /** Whether `key` is pinned (its group is, see `ControlsOptions.pinned`), outside the presets. */
  isPinned(key: string): boolean
  /**
   * Whether presets move `key`: false when it's pinned or says `inPresets: false` (or its group
   * does). Its group's own scope may still move it (see `scopeOf`).
   */
  inPresets(key: string): boolean
  readonly error: string | null
  get(): Values<S>
  getServerSnapshot(): Values<S>
  /** Apply a change. `coalesce` folds it into the previous history entry (used while dragging). */
  set(
    patch: Partial<Values<S>>,
    options?: { coalesce?: boolean; source?: ChangeSource; key?: string; group?: string },
  ): void
  /**
   * Apply external state (props, a server, a peer) without recording undo history or emitting a
   * local change. A key that is held (in hand, or changed here within `echo` ms) keeps its value;
   * the newest incoming value for it lands when the hold ends.
   */
  sync(values: Partial<Values<S>>, options?: SyncOptions): void
  /**
   * Marks a key as in hand (a drag, an inline edit) or lets it go. While held, `sync` doesn't
   * touch it; letting go applies the newest value that arrived meanwhile. Panels call this.
   */
  hold(key: string, held?: boolean): void
  /** Whether incoming values for `key` are held back right now (see `sync`). */
  isHeld(key: string): boolean
  /**
   * Presses an action row: its `run`, then `onAction(key)`. For a toolbar, `item` names the
   * button (its id, else its label) and `onAction` gets the item's id.
   */
  action(key: keyof S & string, item?: string): void
  /**
   * Shows a live value in a readout row (`watch`, `sparkline`, `graph`, `meter`, `table`, `log`):
   * a number or text, a sample for a history, `{ [series]: number }` for a graph, rows for a
   * table, an entry for a log. `null` clears it. Rows redraw at most once a frame and sleep
   * when nothing arrives; nothing is recorded in the values, history or storage.
   */
  watch<K extends ReadoutKeys<S>>(key: K, value: ReadoutInput<S[K]>): void
  /** The latest value pushed to a readout (`undefined` before any). */
  watched(key: ReadoutKeys<S>): unknown
  /** True while the change being notified landed (`sync(…, { land: true })`): place, don't animate. */
  readonly landing: boolean
  undo(): void
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
  subscribe(cb: () => void): () => void
  /**
   * Back to the active preset (see `activePreset`) while anything differs from it, else to the
   * defaults: every field, or only `keys`. Reaching the defaults with every field also forgets
   * the active preset. Locks don't apply; disabled and read-only fields keep their values.
   */
  reset(keys?: readonly (keyof S & string)[]): void
  /** One key, as `reset` does: to the active preset's value, else (already there) its default. */
  resetKey(key: keyof S & string): void
  /**
   * A group, as `reset` does: to its active group preset (or the panel's active preset) while it
   * differs from it, else to its defaults, which forgets the group's preset.
   */
  resetGroup(group: string): void
  /** Whether the key (or anything) differs from the active preset; the defaults without one. */
  isModified(key?: keyof S & string): boolean
  /** Whether `reset` (of every field, or `keys`) would change anything. */
  canReset(keys?: readonly (keyof S & string)[]): boolean
  /** What differs from the defaults (the values `code()` and Swift export care about). */
  modified(): Partial<Values<S>>
  /**
   * Random values for every field that can roll (see `canRoll`), or those among `keys`, drawn
   * from `random`. With an active preset, they land near its values (see `AROUND`) instead of
   * anywhere in range. One undo step.
   */
  randomize(keys?: readonly (keyof S & string)[]): void
  /** Small changes around the current values instead of a re-roll; skips what can't roll. */
  mutate(keys?: readonly (keyof S & string)[]): void
  /** Keeps fields out of Random and Mutate (or lets them back in). Saved with the values. */
  lock(keys: (keyof S & string) | readonly (keyof S & string)[], locked?: boolean): void
  isLocked(key: keyof S & string): boolean
  /**
   * The combination that presses an action row now, or a toolbar's button (`item`, its id or
   * label): the user's rebinding, else the declared `shortcut`; `""` when cleared, undefined
   * when there's none.
   */
  shortcut(key: keyof S & string, item?: string): string | undefined
  /**
   * Rebinds an action row's shortcut (or a toolbar button's): a combination, `""` for none, or
   * undefined to restore the declared one. Not undoable; saved with the values, as locks are.
   */
  rebind(key: keyof S & string, combo: string | undefined, item?: string): void
  /**
   * Whether Random and Mutate may change `key`: it holds a value and isn't locked, `random:
   * false`, refused by `tunable`, disabled or read-only.
   */
  canRoll(key: keyof S & string): boolean
  /** Whether the field is disabled now (`disabled`, static or from the values). */
  isDisabled(key: keyof S & string): boolean
  /** Whether the field is read-only now (`readOnly`, static or from the values). */
  isReadOnly(key: keyof S & string): boolean
  /**
   * Asks panels to read again what they derive without new values: function `disabled` and
   * `readOnly` flags (which may read state elsewhere, another store's say) and row accessories.
   */
  refresh(): void
  /**
   * Marks keys as mixed (a multi-selection whose items differ): panels show "—" until the key is
   * edited, and the first edit reaches `onChange` even when it picks the value shown.
   */
  setMixed(keys: (keyof S & string) | readonly (keyof S & string)[], mixed?: boolean): void
  isMixed(key: keyof S & string): boolean
  /**
   * While held, `get()` shows the values from before the last change (the previous undo entry);
   * releasing restores the current ones. Nothing is recorded or stored; `onChange` reports
   * `source: "compare"` both ways.
   */
  compare(hold: boolean): void
  readonly comparing: boolean
  /**
   * Applies a preset and makes it the active one (`"default"` clears it); one undo step, or
   * folded into the last with `coalesce` (a pan across the strip). With `scope`, one of that tab
   * or group's presets, which moves only its keys.
   */
  preset(id: string, options?: { coalesce?: boolean; scope?: string }): void
  /** The preset the current values match (in `scope`, over its keys), else `"custom"`. */
  matchingPreset(scope?: string): string
  /**
   * The preset (or saved variant) last applied, which Reset returns to and Random explores
   * around, or null. Kept with the values; forgotten by a reset to the defaults. With `scope`,
   * that tab or group's.
   */
  activePreset(scope?: string): PresetRef | null
  /** The group preset last applied to `group` (0-based), or -1. */
  activeGroupPreset(group: string): number
  /** The values Reset returns to first: the active presets over the defaults. */
  baseValues(): Values<S>
  /** Each group's numbered presets, complete over the keys they cover. */
  readonly groupPresets: Readonly<Record<string, readonly GroupPreset<Values<S>>[]>>
  /**
   * Applies a group's preset (0-based) and makes it the group's active one, one undo step;
   * `coalesce` folds it into the previous one (a pan across a card's presets).
   */
  groupPreset(group: string, index: number, options?: { coalesce?: boolean }): void
  /** The group preset the current values match, or -1. */
  matchingGroupPreset(group: string): number
  code(format?: CodeFormat, values?: Values<S>): string
  /** Shows the floating chip on `element`; `chip` overrides the store's chip options. */
  attach(element: HTMLElement, chip?: ChipOptions): () => void
  mount(container: HTMLElement, options?: MountPanelOptions): () => void
}
/** Whether two fields draw and behave the same (a reshape keeps such a key's value). */
export function sameField(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  const ka = Object.keys(a).filter((k) => k !== "run")
  const kb = Object.keys(b).filter((k) => k !== "run")
  if (ka.length !== kb.length) return false
  return ka.every((k) => {
    const x = (a as Record<string, unknown>)[k]
    const y = (b as Record<string, unknown>)[k]
    // Predicates (`disabled`, `readOnly`) are new closures on every rebuild; they don't reshape.
    if (typeof x === "function" && typeof y === "function") return true
    return Array.isArray(x) && Array.isArray(y)
      ? x.length === y.length && x.every((v, i) => same(v, y[i]) || sameField(v, y[i]))
      : same(x, y) || (typeof x === "object" && sameField(x, y))
  })
}
export function defineControls<const S extends Schema>(
  id: string,
  input: S,
  options: ControlsOptions<S> = {},
): Controls<S> {
  if (!id.trim()) throw new Error("Controls need a stable, nonempty id.")
  let schema = Object.freeze({ ...input }) as S
  let locked = normalize(schema, {})
  const actions = Object.freeze([...(options.actions ?? [])])
  const theme = options.theme
  const appearance = options.appearance
  const density: DensityMode = options.density ?? "default"
  const renderer: RendererMode = options.renderer ?? "auto"
  // Development builds, a store shipped as product UI (`ship`), which stays live in production,
  // or a page someone unlocked (see `unlock`).
  const enabled = () =>
    (typeof __KNOBS_DEV__ === "undefined" ||
      __KNOBS_DEV__ ||
      Boolean(options.ship) ||
      isUnlocked()) &&
    (typeof options.enabled === "function"
      ? options.enabled()
      : (options.enabled ??
        (Boolean(options.ship) ||
          isUnlocked() ||
          (typeof location !== "undefined" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)))))
  const storage = () => (options.storage === undefined ? browserStorage() : options.storage)
  const persistMode: PersistMode = options.persist ?? "all"
  /** Where values and locks are kept: nowhere unless everything persists. */
  const valueStorage = () => (persistMode === "all" ? storage() : null)
  const variantStorage = () => (persistMode === "none" ? null : storage())
  const draw = options.random ?? Math.random
  const hostHistory = options.history
  let unsubscribeHistory: (() => void) | undefined
  /** Heard while anyone listens: unlocking or locking the page changes what `get()` returns. */
  let unsubscribeUnlock: (() => void) | undefined
  const listeners = new Set<() => void>()
  let refreshes = 0
  const notify = () => {
    for (const cb of [...listeners]) cb()
  }
  /** Keys showing "—" until edited (a multi-selection whose items differ). */
  const mixed = new Set<string>()
  let current = locked
  let read = false
  let error: string | null = null
  let locks = new Set<string>()
  /** Rebound shortcuts, by action key or `key/item` for a toolbar's button (`""` cleared). */
  let bindings = new Map<string, string>()
  /** The earlier values shown while compare is held. */
  let comparing: Values<S> | null = null
  let landing = false
  const echo = Math.max(0, options.echo ?? 0)
  /** Keys in hand, and when each key last changed here (for the echo window). */
  const grabbed = new Set<string>()
  const changedAt = new Map<string, number>()
  /** The value each held key was last set to here: its acknowledgement ends the hold. */
  const sent = new Map<string, unknown>()
  /** The newest incoming value for each held key, applied when the hold ends. */
  const pending = new Map<string, unknown>()
  let echoTimer: ReturnType<typeof setTimeout> | undefined
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
  const isHeld = (key: string) =>
    grabbed.has(key) || (echo > 0 && now() - (changedAt.get(key) ?? -Infinity) < echo)
  /**
   * The active presets: the panel's (a preset or saved variant), each scope's (see
   * `scopedPresets`) and each group's numbered one.
   */
  interface Base {
    readonly preset: PresetRef | null
    readonly groups: Readonly<Record<string, number>>
    readonly scopes: Readonly<Record<string, PresetRef>>
  }
  const NO_BASE: Base = Object.freeze({
    preset: null,
    groups: Object.freeze({}),
    scopes: Object.freeze({}),
  })
  let base: Base = NO_BASE
  /** An undo step: the values and the active presets with them. */
  interface Entry {
    readonly values: Values<S>
    readonly base: Base
  }
  const past: Entry[] = []
  const future: Entry[] = []
  const HISTORY = 100
  const stateKey = storageKey(id, "state")
  let pinnedOf: { schema: S; keys: ReadonlySet<string> } | undefined
  const pinned = () => {
    if (pinnedOf?.schema !== schema) pinnedOf = { schema, keys: pinnedKeys(schema, options.pinned) }
    return pinnedOf.keys
  }
  let freeOf: { schema: S; keys: ReadonlySet<string> } | undefined
  /** The keys presets leave alone: pinned ones and those `inPresets` keeps out. */
  const presetFree = () => {
    if (freeOf?.schema !== schema)
      freeOf = { schema, keys: presetFreeKeys(schema, pinned(), options.inPresets) }
    return freeOf.keys
  }
  /** The variants choice; one presets leave alone is an ordinary choice (see `variantsOf`). */
  const variantsChoice = () => variantsOf(schema, (key) => presetFree().has(key))
  /**
   * Which scope's presets move each value key: a tab or group named in `scopedPresets` (or
   * holding the variants choice), else `""`, the panel's own `presets`. Keys presets leave alone
   * (pinned ones, `inPresets: false`) have none, unless their group has a scope of its own.
   * A key goes to its tab's scope before its group's.
   */
  let scopingOf:
    | { schema: S; of: ReadonlyMap<string, string>; named: readonly string[]; variants?: string }
    | undefined
  const scoping = () => {
    if (scopingOf?.schema === schema) return scopingOf
    const fields = schema as Record<string, Field>
    const groupTab = new Map<string, string>()
    for (const f of Object.values(fields))
      if (f.group !== undefined && f.tab !== undefined && !groupTab.has(f.group))
        groupTab.set(f.group, f.tab)
    const tabOf = (f: Field) => f.tab ?? (f.group !== undefined ? groupTab.get(f.group) : undefined)
    const named = new Set(Object.keys(options.scopedPresets ?? {}))
    if (named.has("")) throw new Error("A scope needs a nonempty tab or group id.")
    // A variants choice on a tab (or in a named group) is that scope's; elsewhere, the panel's.
    const v = variantsChoice()
    const group = v?.field.group
    const variants = v
      ? (tabOf(v.field) ?? (group !== undefined && named.has(group) ? group : ""))
      : undefined
    if (variants) named.add(variants)
    const of = new Map<string, string>()
    for (const k of valueKeys(schema)) {
      const f = fields[k]!
      if (presetFree().has(k)) {
        // A group that presets leave alone (pinned, `inPresets: false`) still answers to its own
        // scope; only a field that says `inPresets: false` itself stays out of every one.
        if (f.inPresets !== false && f.group !== undefined && named.has(f.group)) of.set(k, f.group)
        continue
      }
      const tab = tabOf(f)
      of.set(
        k,
        tab !== undefined && named.has(tab)
          ? tab
          : f.group !== undefined && named.has(f.group)
            ? f.group
            : "",
      )
    }
    scopingOf = { schema, of, named: [...named], variants }
    return scopingOf
  }
  /** `values` with every key outside `scope` at its default: what its presets and variants hold. */
  const within = (values: Values<S>, scope: string): Values<S> => {
    const of = scoping().of
    let out: Record<string, unknown> | undefined
    for (const k of Object.keys(locked))
      if (of.get(k) !== scope && !same(values[k], locked[k])) {
        out ??= { ...values }
        out[k] = locked[k]
      }
    return out ? (Object.freeze(out) as Values<S>) : values
  }
  /** `values` with the keys presets leave alone (and those of other scopes) at their defaults. */
  const unpinned = (values: Values<S>): Values<S> => within(values, "")
  /** Only `scope`'s keys of `values`: what applying one of its presets or variants writes. */
  const patchIn = (values: Values<S>, scope: string): Partial<Values<S>> => {
    const of = scoping().of
    return Object.fromEntries(
      Object.entries(values).filter(([k]) => of.get(k) === scope),
    ) as Partial<Values<S>>
  }
  const buildPresets = (scope: string) => {
    const own = (scope === "" ? options.presets : options.scopedPresets?.[scope]) ?? {}
    const v = scoping().variants === scope ? variantsChoice() : undefined
    if (v && Object.hasOwn(own, v.field.value))
      throw new Error(
        `The default variant (${v.field.value}) is the schema's defaults; set its values there.`,
      )
    // A variants choice's options come first, each a preset (the default one is `default`).
    const ids = [
      ...(v ? v.field.options.filter((o) => o !== v.field.value) : []),
      ...Object.keys(own).filter((id) => !v?.field.options.includes(id)),
    ]
    return Object.freeze(
      Object.fromEntries([
        ["default", locked],
        ...ids.map((id) => {
          if (id === "default" || id === "custom") throw new Error(`Reserved preset id: ${id}`)
          const variant = v?.field.options.includes(id) ? { [v.key]: id } : {}
          return [id, within(normalize(schema, { ...locked, ...variant, ...own[id] }), scope)]
        }),
      ]),
    ) as Readonly<Record<string, Values<S>>>
  }
  const buildScopePresets = () =>
    new Map(scoping().named.map((scope) => [scope, buildPresets(scope)] as const))
  let presets = buildPresets("")
  let scopePresets = buildScopePresets()
  /** A scope's presets (`""`, the panel's own); throws on a scope that has none. */
  const presetsIn = (scope: string) => {
    if (scope === "") return presets
    const found = scopePresets.get(scope)
    if (!found) throw new Error(`Unknown preset scope: ${scope}`)
    return found
  }
  const buildGroupPresets = () =>
    Object.freeze(
      Object.fromEntries(
        Object.entries(options.groupPresets ?? {}).map(([group, list]) => {
          const named = list.flatMap((p) =>
            Object.keys(p.values).filter((k) => Object.hasOwn(schema, k)),
          )
          const covered = new Set(
            (named.length
              ? named
              : Object.keys(schema).filter((k) => schema[k]!.group === group)
            ).filter((k) => hasValue(schema[k]!)),
          )
          return [
            group,
            Object.freeze(
              list.map((p) =>
                Object.freeze({
                  name: p.name,
                  values: Object.freeze(
                    Object.fromEntries(
                      [...covered].map((k) => [
                        k,
                        normalizeField(
                          schema[k] as ValueField,
                          (p.values as Record<string, unknown>)[k] ?? locked[k],
                        ),
                      ]),
                    ),
                  ) as Partial<Values<S>>,
                }),
              ),
            ),
          ]
        }),
      ),
    ) as Readonly<Record<string, readonly GroupPreset<Values<S>>[]>>
  let groupPresets = buildGroupPresets()
  /** Labels and descriptions the fields give their groups and sections (the first one wins). */
  let labelsOf:
    | {
        schema: S
        group: Map<string, string>
        section: Map<string, string>
        groupText: Map<string, string>
        sectionText: Map<string, string>
      }
    | undefined
  const fieldLabels = () => {
    if (labelsOf?.schema === schema) return labelsOf
    const group = new Map<string, string>()
    const section = new Map<string, string>()
    const groupText = new Map<string, string>()
    const sectionText = new Map<string, string>()
    const first = (map: Map<string, string>, id: string | undefined, text: string | undefined) => {
      if (id !== undefined && text !== undefined && !map.has(id)) map.set(id, text)
    }
    for (const f of Object.values(schema) as Field[]) {
      first(group, f.group, f.groupLabel)
      first(section, f.section, f.sectionLabel)
      first(groupText, f.group, f.groupDescription)
      first(sectionText, f.section, f.sectionDescription)
    }
    labelsOf = { schema, group, section, groupText, sectionText }
    return labelsOf
  }
  /** The committed values, read from storage on first use. */
  function load() {
    if (!read) {
      read = true
      try {
        const raw = valueStorage()?.getItem(stateKey)
        if (raw) {
          const data = JSON.parse(raw)
          if (data?.version === 1) {
            current = normalize(schema, data.values)
            if (Array.isArray(data.locks))
              locks = new Set(
                data.locks.filter(
                  (k: unknown) => typeof k === "string" && Object.hasOwn(schema, k),
                ),
              )
            if (data.bindings && typeof data.bindings === "object")
              bindings = new Map(
                Object.entries(data.bindings as Record<string, unknown>).flatMap(([id, combo]) =>
                  typeof combo === "string" && bindable(id) ? [[id, normalizeCombo(combo)]] : [],
                ),
              )
            base = readBase(data.base)
          }
        }
      } catch (cause) {
        error = String(cause)
      }
    }
    return current
  }
  function get() {
    if (!enabled()) return locked
    return comparing ?? load()
  }
  function persist() {
    try {
      valueStorage()?.setItem(
        stateKey,
        JSON.stringify({
          version: 1,
          values: current,
          ...(locks.size ? { locks: [...locks] } : {}),
          ...(bindings.size ? { bindings: Object.fromEntries(bindings) } : {}),
          ...(base !== NO_BASE ? { base } : {}),
        }),
      )
      error = null
    } catch (cause) {
      error = String(cause)
    }
  }
  function commit(next: Values<S>) {
    current = next
    persist()
    notify()
  }
  const makeBase = (
    preset: PresetRef | null,
    groups: Readonly<Record<string, number>>,
    scopes: Readonly<Record<string, PresetRef>> = {},
  ): Base =>
    preset === null && Object.keys(groups).length === 0 && Object.keys(scopes).length === 0
      ? NO_BASE
      : Object.freeze({
          preset,
          groups: Object.freeze({ ...groups }),
          scopes: Object.freeze({ ...scopes }),
        })
  /** `scopes` with `scope`'s active preset set to `ref` (or forgotten). */
  const withScope = (
    scopes: Readonly<Record<string, PresetRef>>,
    scope: string,
    ref: PresetRef | undefined,
  ) => {
    const { [scope]: _, ...others } = scopes
    return ref ? { ...others, [scope]: ref } : others
  }
  const sameRef = (a: PresetRef | null | undefined, b: PresetRef | null | undefined) =>
    a?.kind === b?.kind && a?.id === b?.id
  const sameBase = (a: Base, b: Base) =>
    a === b ||
    (sameRef(a.preset, b.preset) &&
      Object.keys(a.groups).length === Object.keys(b.groups).length &&
      Object.entries(a.groups).every(([g, i]) => b.groups[g] === i) &&
      Object.keys(a.scopes).length === Object.keys(b.scopes).length &&
      Object.entries(a.scopes).every(([s, ref]) => sameRef(ref, b.scopes[s])))
  /**
   * Whether the panel's own presets moved to scopes (there are scopes and no plain `presets`), so
   * its earlier saved variants start out in them.
   */
  const seedsScopes = () => scopePresets.size > 0 && Object.keys(options.presets ?? {}).length === 0
  /**
   * `groups` without those whose numbered presets set a key of `scope`: applying one of its
   * presets or variants takes those keys over, so it stays their only base.
   */
  const groupsOutside = (groups: Readonly<Record<string, number>>, scope: string) => {
    const of = scoping().of
    return Object.fromEntries(
      Object.entries(groups).filter(
        ([g]) =>
          !(groupPresets[g] ?? []).some((p) =>
            Object.keys(p.values).some((k) => of.get(k) === scope),
          ),
      ),
    )
  }
  /** Whether a preset ref still names something in `scope` (a saved variant is checked later). */
  const known = (ref: PresetRef, scope: string) =>
    ref.kind === "variant" ||
    (ref.id !== "default" && Object.hasOwn(scopePresets.get(scope) ?? {}, ref.id))
  /** Drops what no longer exists: a preset the schema lost, a group preset out of range. */
  function validBase(b: Base): Base {
    const preset =
      b.preset?.kind === "preset" &&
      !(b.preset.id !== "default" && Object.hasOwn(presets, b.preset.id))
        ? null
        : b.preset
    const groups = Object.fromEntries(
      Object.entries(b.groups).filter(([g, i]) => groupPresets[g]?.[i] !== undefined),
    )
    const scopes = Object.fromEntries(
      Object.entries(b.scopes).filter(([s, ref]) => scopePresets.has(s) && known(ref, s)),
    )
    const next = makeBase(preset, groups, scopes)
    return sameBase(next, b) ? b : next
  }
  const readRef = (raw: unknown): PresetRef | null =>
    raw &&
    typeof raw === "object" &&
    ((raw as PresetRef).kind === "preset" || (raw as PresetRef).kind === "variant") &&
    typeof (raw as PresetRef).id === "string"
      ? Object.freeze({ kind: (raw as PresetRef).kind, id: (raw as PresetRef).id })
      : null
  function readBase(raw: unknown): Base {
    if (!raw || typeof raw !== "object") return NO_BASE
    const { preset, groups, scopes } = raw as {
      preset?: unknown
      groups?: unknown
      scopes?: unknown
    }
    let ref = readRef(preset)
    const byGroup =
      groups && typeof groups === "object"
        ? Object.fromEntries(
            Object.entries(groups as Record<string, unknown>).filter((e): e is [string, number] =>
              Number.isInteger(e[1]),
            ),
          )
        : {}
    const byScope: Record<string, PresetRef> = {}
    if (scopes && typeof scopes === "object")
      for (const [s, r] of Object.entries(scopes as Record<string, unknown>)) {
        const found = readRef(r)
        if (found) byScope[s] = found
      }
    // Saved before its presets moved to scopes: the panel's preset becomes each scope's that
    // has one by that id, and its saved variant each scope's it started out in (see
    // `scopeVariants`).
    if (ref?.kind === "preset" && !Object.hasOwn(presets, ref.id)) {
      for (const [s, list] of scopePresets)
        if (!byScope[s] && ref.id !== "default" && Object.hasOwn(list, ref.id)) byScope[s] = ref
      ref = null
    } else if (ref?.kind === "variant" && seedsScopes()) {
      const id = ref.id
      for (const s of scopePresets.keys())
        if (
          !byScope[s] &&
          scopeVariants(s)
            .list()
            .some((v) => v.id === id)
        )
          byScope[s] = ref
      ref = null
    }
    return validBase(makeBase(ref, byGroup, byScope))
  }
  /** The active presets, after letting go of saved variants that have since been deleted. */
  function activeBase(): Base {
    load()
    const gone = (ref: PresetRef | null | undefined, list: () => readonly { id: string }[]) =>
      ref?.kind === "variant" && !list().some((v) => v.id === ref.id)
    const preset = gone(base.preset, () => variants.list()) ? null : base.preset
    let scopes = base.scopes
    for (const [s, ref] of Object.entries(base.scopes))
      if (gone(ref, () => scopeVariants(s).list())) scopes = withScope(scopes, s, undefined)
    if (preset !== base.preset || scopes !== base.scopes)
      base = makeBase(preset, base.groups, scopes)
    return base
  }
  const hasBase = () => activeBase() !== NO_BASE
  let baseCache:
    | {
        base: Base
        schema: S
        presets: unknown
        scopePresets: unknown
        groupPresets: unknown
        variants: readonly unknown[]
        values: Values<S>
      }
    | undefined
  function baseValues(): Values<S> {
    if (!enabled()) return locked
    const b = activeBase()
    if (b === NO_BASE) return locked
    const lists = [
      b.preset?.kind === "variant" ? variants.list() : null,
      ...Object.entries(b.scopes).map(([s, ref]) =>
        ref.kind === "variant" ? scopeVariants(s).list() : null,
      ),
    ]
    const c = baseCache
    if (
      c &&
      c.base === b &&
      c.schema === schema &&
      c.presets === presets &&
      c.scopePresets === scopePresets &&
      c.groupPresets === groupPresets &&
      c.variants.length === lists.length &&
      c.variants.every((l, i) => l === lists[i])
    )
      return c.values
    /** The values a preset ref gives its scope's keys (the defaults elsewhere), if it still exists. */
    const valuesOf = (
      ref: PresetRef,
      scope: string,
      list: readonly Variant<Values<S>>[] | null,
    ) => {
      if (ref.kind === "preset") return presetsIn(scope)[ref.id]
      const found = list?.find((v) => v.id === ref.id)
      return found ? within(normalize(schema, found.values), scope) : undefined
    }
    let out: Record<string, unknown> = locked
    if (b.preset) out = valuesOf(b.preset, "", lists[0]!) ?? locked
    const scoped = Object.entries(b.scopes)
    if (scoped.length) {
      out = { ...out }
      scoped.forEach(([s, ref], i) =>
        Object.assign(out, patchIn(valuesOf(ref, s, lists[i + 1]!) ?? locked, s)),
      )
    }
    const groups = Object.entries(b.groups)
    if (groups.length) {
      out = { ...out }
      for (const [g, i] of groups) Object.assign(out, groupPresets[g]?.[i]?.values)
    }
    const values = Object.freeze(out) as Values<S>
    baseCache = { base: b, schema, presets, scopePresets, groupPresets, variants: lists, values }
    return values
  }
  /** Whether the active presets give `key` its base (else Random rolls it freely). */
  const covered = (key: string) => {
    const b = activeBase()
    const group = (schema[key] as Field | undefined)?.group
    if (group !== undefined && Object.hasOwn(b.groups, group)) return true
    // Presets leave pinned keys (and `inPresets: false` ones) out.
    const scope = scoping().of.get(key)
    if (scope === undefined) return false
    return scope === "" ? b.preset !== null : Object.hasOwn(b.scopes, scope)
  }
  /** The declared shortcut of an action (`key`) or a toolbar's button (`key/item`), if it has one. */
  function declaredShortcut(id: string): { found: boolean; combo?: string } {
    const slash = id.indexOf("/")
    const key = slash < 0 ? id : id.slice(0, slash)
    const field = Object.hasOwn(schema, key) ? (schema[key] as Field) : undefined
    if (field?.kind === "action" && slash < 0)
      return { found: true, ...(field.shortcut ? { combo: field.shortcut } : {}) }
    if (field?.kind === "toolbar" && slash >= 0) {
      const item = field.items.find((i) => (i.id ?? i.label) === id.slice(slash + 1))
      if (!item) return { found: false }
      const key = toolbarShortcut(item)?.key
      return { found: true, ...(key ? { combo: normalizeCombo(key) } : {}) }
    }
    return { found: false }
  }
  function bindable(id: string) {
    return declaredShortcut(id).found
  }
  const fieldKeys = () => valueKeys(schema)
  const valueField = (k: string) => {
    const field = Object.hasOwn(schema, k) ? schema[k] : undefined
    return field && hasValue(field) ? field : undefined
  }
  function changes(from: Values<S>, to: Values<S>) {
    const diff: Record<string, unknown> = {}
    for (const k of fieldKeys()) if (!same(from[k], to[k])) diff[k] = to[k]
    return diff as Partial<Values<S>>
  }
  /** Lets go of a held compare, so any real change starts from the current values. */
  function release() {
    if (!comparing) return
    const shown = comparing
    comparing = null
    options.onChange?.(changes(shown, current), current, { source: "compare" })
    notify()
  }
  /** A field's `disabled` or `readOnly`, static or decided from the values. */
  const flag = (k: string, name: "disabled" | "readOnly") => {
    const v = valueField(k)?.[name]
    return typeof v === "function" ? Boolean(v(get())) : Boolean(v)
  }
  /** Fields a coarse edit (Random, Mutate, Reset) leaves alone. */
  const blocked = (k: string) => flag(k, "disabled") || flag(k, "readOnly")
  const rollable = (k: string) => {
    const field = valueField(k)
    return Boolean(
      field &&
        !locks.has(k) &&
        field.random !== false &&
        !blocked(k) &&
        (!options.tunable || options.tunable(k as keyof S & string, get())),
    )
  }
  const pool = (keys?: readonly string[]) => {
    load()
    return (keys ?? fieldKeys()).filter(rollable)
  }
  function applyPatch(base: Values<S>, previous: Values<S>, patch: Partial<Values<S>>) {
    const out: Record<string, unknown> = { ...base }
    const diff: Record<string, unknown> = {}
    let changed = false
    if (base === previous) {
      for (const k of Object.keys(patch)) {
        const field = valueField(k)
        if (!field) continue
        const raw = (patch as Record<string, unknown>)[k]
        const val = raw === undefined ? previous[k] : normalizeField(field, raw)
        if (!same(previous[k], val)) {
          out[k] = val
          diff[k] = val
          changed = true
        }
      }
      return changed ? { next: Object.freeze(out) as Values<S>, diff } : null
    }
    for (const k of Object.keys(patch)) {
      const field = valueField(k)
      if (!field) continue
      const raw = (patch as Record<string, unknown>)[k]
      const val = raw === undefined ? base[k] : normalizeField(field, raw)
      out[k] = same(previous[k], val) ? previous[k] : val
    }
    for (const k of fieldKeys()) {
      if (!same(previous[k], out[k])) {
        diff[k] = out[k]
        changed = true
      } else {
        out[k] = previous[k]
      }
    }
    return changed ? { next: Object.freeze(out) as Values<S>, diff } : null
  }
  const markChanged = (diff: Record<string, unknown>) => {
    if (echo > 0) {
      const at = now()
      for (const k of Object.keys(diff)) {
        changedAt.set(k, at)
        sent.set(k, diff[k])
      }
      scheduleEcho()
    }
    for (const k of Object.keys(diff)) pending.delete(k)
  }
  type WriteOptions = {
    coalesce?: boolean
    source?: ChangeSource
    key?: string
    group?: string
    base?: boolean
  }
  function set(patch: Partial<Values<S>>, setOpts?: WriteOptions) {
    write(patch, setOpts)
  }
  /** `set`, moving the active presets to `nextBase` in the same undo step. */
  function write(patch: Partial<Values<S>>, setOpts?: WriteOptions, nextBase?: Base) {
    if (!enabled()) return
    release()
    const previous = load()
    const was = activeBase()
    const moves = nextBase !== undefined && !sameBase(nextBase, was)
    // A mixed key's first edit is news even when it picks the value shown: it applies to all.
    const forced = mixed.size ? Object.keys(patch).filter((k) => mixed.has(k) && valueField(k)) : []
    for (const k of forced) mixed.delete(k)
    const applied = applyPatch(previous, previous, patch) ?? {
      next: previous,
      diff: {} as Record<string, unknown>,
    }
    const { next, diff } = applied
    for (const k of forced) if (!(k in diff)) diff[k] = next[k]
    const changed = Object.keys(diff).length > 0
    if (!changed && !moves) return
    if (next === previous && !moves) {
      notify()
      options.onChange?.(diff as Partial<Values<S>>, next, {
        source: setOpts?.source ?? "local",
        ...(setOpts?.key ? { key: setOpts.key } : {}),
      })
      return
    }
    if (!setOpts?.coalesce || past.length === 0) {
      past.push({ values: previous, base: was })
      if (past.length > HISTORY) past.shift()
    }
    future.length = 0
    if (moves) base = nextBase
    markChanged(diff)
    commit(next)
    if (!changed) return
    options.onChange?.(diff as Partial<Values<S>>, next, {
      source: setOpts?.source ?? "local",
      ...(setOpts?.coalesce ? { coalesce: true } : {}),
      ...(setOpts?.key ? { key: setOpts.key } : {}),
      ...(setOpts?.group ? { group: setOpts.group } : {}),
      ...(setOpts?.base ? { base: true } : {}),
    })
  }
  /** Moves to a history entry (values and active presets); returns the entry it left. */
  /**
   * Moves to `to`, keeping where it left in `into` first, so the notify already sees the new
   * canUndo and canRedo (a panel's Redo blooms with the undo that made it possible).
   */
  function step(to: Entry, source: "undo" | "redo", into: Entry[]) {
    const before = load()
    into.push({ values: before, base: activeBase() })
    const diff = changes(before, to.values)
    base = validBase(to.base)
    markChanged(diff as Record<string, unknown>)
    commit(to.values)
    if (Object.keys(diff).length) options.onChange?.(diff, to.values, { source })
  }
  /** Applies incoming values as they are (no holds), flagging a landing for the notify. */
  function place(values: Record<string, unknown>, replace: boolean, land: boolean) {
    const previous = load()
    const base = replace ? locked : previous
    const applied = applyPatch(base, previous, values as Partial<Values<S>>)
    if (!applied) return
    landing = land
    try {
      commit(applied.next)
      options.onChange?.(applied.diff as Partial<Values<S>>, applied.next, { source: "remote" })
    } finally {
      landing = false
    }
  }
  /** Whether an incoming value is the one sent for `key` (numbers within half a step). */
  function acknowledges(key: string, value: unknown) {
    if (!sent.has(key)) return false
    const was = sent.get(key)
    const field = schema[key] as { kind?: string; step?: number } | undefined
    if (field?.kind === "knob" && typeof value === "number" && typeof was === "number")
      return Math.abs(value - was) <= (field.step ?? 0) / 2 + 1e-9
    return same(value, was)
  }
  /** Splits incoming values into what lands now and what waits for its key's hold to end. */
  function incoming(values: Record<string, unknown>, replace: boolean) {
    const current = load() as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of replace ? fieldKeys() : Object.keys(values)) {
      if (!valueField(k)) continue
      const target = Object.hasOwn(values, k) ? values[k] : locked[k]
      // The remote reporting what was sent ends the key's echo hold (not a drag still in hand).
      if (!grabbed.has(k) && changedAt.has(k) && acknowledges(k, target)) {
        changedAt.delete(k)
        sent.delete(k)
      }
      if (isHeld(k)) {
        pending.set(k, target)
        out[k] = current[k]
      } else {
        pending.delete(k)
        out[k] = target
      }
    }
    if (pending.size) scheduleEcho()
    return out
  }
  /** Replaces the mixed keys; whether that changed anything. */
  function replaceMixed(keys: readonly string[] | undefined) {
    if (!keys) return false
    const next = new Set(keys.filter((k) => valueField(k)))
    if (next.size === mixed.size && [...next].every((k) => mixed.has(k))) return false
    mixed.clear()
    for (const k of next) mixed.add(k)
    return true
  }
  function sync(values: Partial<Values<S>>, syncOpts?: SyncOptions) {
    if (!enabled()) return
    release()
    const land = Boolean(syncOpts?.land)
    if (land) settle()
    const before = current
    const remixed = replaceMixed(syncOpts?.mixed)
    place(incoming(values as Record<string, unknown>, Boolean(syncOpts?.replace)), false, land)
    if ((land || remixed) && current === before) announce(land)
  }
  /** A different item arrived: history and echo windows belonged to the last one. */
  function settle() {
    past.length = 0
    future.length = 0
    changedAt.clear()
    sent.clear()
    for (const k of [...pending.keys()]) if (!grabbed.has(k)) pending.delete(k)
    scheduleEcho()
  }
  function announce(land: boolean) {
    landing = land
    try {
      notify()
    } finally {
      landing = false
    }
  }
  /** Lands the newest incoming value of every key whose hold has ended. */
  function flush() {
    const ready: Record<string, unknown> = {}
    for (const [k, v] of pending)
      if (!isHeld(k)) {
        ready[k] = v
        pending.delete(k)
      }
    if (Object.keys(ready).length) place(ready, false, false)
    scheduleEcho()
  }
  function scheduleEcho() {
    clearTimeout(echoTimer)
    echoTimer = undefined
    if (echo <= 0 || pending.size === 0) return
    let soonest = Infinity
    const t = now()
    for (const k of pending.keys()) {
      if (grabbed.has(k)) continue
      soonest = Math.min(soonest, (changedAt.get(k) ?? -Infinity) + echo - t)
    }
    if (soonest === Infinity) return
    echoTimer = setTimeout(flush, Math.max(0, soonest) + 1)
  }
  /** See `RemoteControls.update`. */
  const reshape: Reshape = (next, values, reshapeOpts) => {
    if (!enabled()) return
    release()
    const before = schema
    const changed =
      Object.keys(before).length !== Object.keys(next).length ||
      Object.keys(next).some((k) => !sameField(before[k], next[k]))
    const land = Boolean(reshapeOpts?.land)
    // New closures (a `disabled` predicate) on fields that are otherwise the same are taken
    // quietly: values and history stay.
    const fresh =
      !changed &&
      Object.keys(next).some((k) => {
        const a = before[k] as unknown as Record<string, unknown>
        const b = next[k] as unknown as Record<string, unknown>
        return Object.keys(b).some((p) => typeof b[p] === "function" && a[p] !== b[p])
      })
    if (fresh) schema = Object.freeze({ ...next }) as S
    if (changed) {
      const previous = load() as Record<string, unknown>
      schema = Object.freeze({ ...next }) as S
      locked = normalize(schema, {})
      presets = buildPresets("")
      scopePresets = buildScopePresets()
      groupPresets = buildGroupPresets()
      base = validBase(base)
      for (const k of [...locks]) if (!valueField(k)) locks.delete(k)
      for (const k of [...pending.keys()]) if (!valueField(k)) pending.delete(k)
      for (const k of [...mixed]) if (!valueField(k)) mixed.delete(k)
      // Keys that persist keep their value for now (the incoming one follows, held or not);
      // new keys start at their defaults.
      const kept: Record<string, unknown> = {}
      for (const k of fieldKeys()) kept[k] = Object.hasOwn(previous, k) ? previous[k] : locked[k]
      current = normalize(schema, kept)
    }
    if (land) settle()
    else if (changed) {
      past.length = 0
      future.length = 0
    }
    const remixed = replaceMixed(reshapeOpts?.mixed)
    const target = incoming(values as Record<string, unknown>, true)
    const before2 = current
    place(target, false, land)
    // A new shape with no value changes still has to reach the panels.
    if (current === before2 && (changed || fresh || land || remixed)) announce(land)
  }
  /** Each readout's latest value and history, kept while its field keeps its shape. */
  const readouts = new Map<string, { shape: string; state: ReadoutState }>()
  const readoutListeners = new Set<(key: string) => void>()
  const readoutOf = (key: string) => {
    const field = Object.hasOwn(schema, key) ? (schema[key] as Field) : undefined
    if (!field || !isReadout(field)) return undefined
    const shape = `${field.kind}\u0000${"history" in field ? field.history : ""}\u0000${
      field.kind === "graph" ? field.series.map((s) => s.id).join("\u0000") : ""
    }\u0000${field.kind === "log" ? field.max : ""}`
    let entry = readouts.get(key)
    if (!entry || entry.shape !== shape) {
      entry = { shape, state: readoutState(field) }
      readouts.set(key, entry)
    }
    return { field, state: entry.state }
  }
  const readoutPort: ReadoutPort = {
    state: (key) => readoutOf(key)?.state,
    listen(cb) {
      readoutListeners.add(cb)
      return () => readoutListeners.delete(cb)
    },
  }
  const variants = createVariants(
    () => schema,
    id,
    storageKey(id, "variants"),
    variantStorage,
    () => unpinned(get()),
    (v, variant, coalesce) =>
      write(
        patchIn(v, ""),
        { source: "variant", coalesce },
        makeBase(Object.freeze({ kind: "variant", id: variant }), {}, activeBase().scopes),
      ),
    notify,
    enabled,
  )
  /** Each scope's saved variants, kept apart from the panel's (made on first use). */
  const scopeVariantsMade = new Map<string, Variants<Values<S>>>()
  function scopeVariants(scope: string): Variants<Values<S>> {
    let made = scopeVariantsMade.get(scope)
    if (made) return made
    made = createVariants(
      () => schema,
      id,
      storageKey(id, `variants:${scope}`),
      variantStorage,
      () => within(get(), scope),
      (v, variant, coalesce) => {
        const b = activeBase()
        write(
          patchIn(v, scope),
          { source: "variant", coalesce },
          makeBase(
            b.preset,
            groupsOutside(b.groups, scope),
            withScope(b.scopes, scope, Object.freeze({ kind: "variant", id: variant })),
          ),
        )
      },
      notify,
      enabled,
      // Variants saved before the panel's presets moved to scopes start out in each scope they
      // move, until the scope saves its own.
      () =>
        !seedsScopes()
          ? []
          : variants.list().flatMap((v) => {
              const values = within(normalize(schema, v.values), scope)
              return equal(values, locked) ? [] : [{ ...v, values }]
            }),
    )
    scopeVariantsMade.set(scope, made)
    return made
  }
  let scopesOf:
    | { presets: unknown; value: Readonly<Record<string, PresetScope<Values<S>>>> }
    | undefined
  const scopes = () => {
    if (scopesOf?.presets === scopePresets) return scopesOf.value
    const of = scoping().of
    const value = Object.freeze(
      Object.fromEntries(
        [...scopePresets].map(([scope, list]) => [
          scope,
          Object.freeze({
            id: scope,
            keys: Object.freeze([...of].flatMap(([k, s]) => (s === scope ? [k] : []))),
            presets: list,
            variants: scopeVariants(scope),
          }),
        ]),
      ),
    )
    scopesOf = { presets: scopePresets, value }
    return value
  }
  /** The keys a coarse reset may move: those with a value that aren't disabled or read-only. */
  const resettable = (keys?: readonly string[]) =>
    (keys ?? fieldKeys()).filter((k) => valueField(k) && !blocked(k))
  /** Whether any of `keys` stands off the active presets, so a reset goes back to them first. */
  function offBase(keys: readonly string[]) {
    if (!hasBase()) return false
    const cur = load()
    const b = baseValues()
    return keys.some((k) => !same(cur[k], b[k]))
  }
  function toBase(keys: readonly string[], meta: { key?: string; group?: string }) {
    const b = baseValues()
    const patch = Object.fromEntries(keys.map((k) => [k, b[k]])) as Partial<Values<S>>
    write(patch, { source: "reset", base: true, ...meta })
  }
  /**
   * The active presets without those whose every key is in `keys` (a group's, a scope's, the
   * panel's), as a reset of `keys` to the defaults leaves them; undefined when none is.
   */
  function baseWithout(keys: readonly string[]): Base | undefined {
    const b = activeBase()
    if (b === NO_BASE) return undefined
    const hit = new Set(keys)
    const of = scoping().of
    const covered = (inside: (k: string) => boolean) => {
      const own = valueKeys(schema).filter(inside)
      return own.length > 0 && own.every((k) => hit.has(k))
    }
    const fields = schema as Record<string, Field>
    const groups = Object.fromEntries(
      Object.entries(b.groups).filter(([g]) => !covered((k) => fields[k]!.group === g)),
    )
    const kept = Object.fromEntries(
      Object.entries(b.scopes).filter(([s]) => !covered((k) => of.get(k) === s)),
    )
    const preset = b.preset && covered((k) => of.get(k) === "") ? null : b.preset
    const next = makeBase(preset, groups, kept)
    return sameBase(next, b) ? undefined : next
  }
  /** `keys` back to their defaults, reported key by key. */
  function toDefaults(keys: readonly string[], nextBase: Base | undefined) {
    const patch: Record<string, unknown> = {}
    for (const k of keys) patch[k] = locked[k]
    write(patch as Partial<Values<S>>, { source: "reset" }, nextBase)
    const resetKeys = (options as { [RESET_KEYS]?: ResetKeys })[RESET_KEYS]
    if (resetKeys) resetKeys(Object.keys(patch))
    else for (const key of Object.keys(patch)) options.onReset?.({ key })
  }
  /**
   * Keeps a panel (or a chip) up while the store is enabled: loads its module and makes it, takes
   * it down when the page locks again and brings it back on the next unlock (see `unlock`).
   */
  function live<M, H>(
    load: () => Promise<M> | undefined,
    make: (module: M) => H,
    unmake: (handle: H) => void,
  ): () => void {
    let disposed = false
    let loading = false
    let handle: H | undefined
    const sync = () => {
      if (disposed) return
      if (!enabled()) {
        if (handle !== undefined) unmake(handle)
        handle = undefined
        return
      }
      if (handle !== undefined || loading) return
      const pending = load()
      if (!pending) return
      loading = true
      void pending
        .then((module) => {
          loading = false
          if (!disposed && enabled() && handle === undefined) handle = make(module)
        })
        .catch((cause) => {
          loading = false
          error = String(cause)
          notify()
        })
    }
    sync()
    const off = onUnlock(sync)
    return () => {
      disposed = true
      off()
      if (handle !== undefined) unmake(handle)
      handle = undefined
    }
  }
  const controls: Controls<S> & {
    [RESHAPE]: Reshape
    [READOUT]: ReadoutPort
    readonly [REFRESHES]: number
  } = {
    id,
    get schema() {
      return schema
    },
    get locked() {
      return locked
    },
    get presets() {
      return presets
    },
    get scopes() {
      return scopes()
    },
    scopeOf: (key) => scoping().of.get(key),
    actions,
    theme,
    appearance,
    density,
    renderer,
    keys: options.keys,
    marks: options.marks !== false,
    chip: Object.freeze({
      ...options.chip,
      reveal: options.chip?.reveal ?? (devBuild() || !options.ship ? "hover" : "shortcut"),
      shortcut: options.chip?.shortcut ?? "Alt+Shift+D",
    }),
    toggleKey: options.toggleKey ?? (options.ship ? false : "`"),
    groupPresetDisplay: options.groupPresetDisplay ?? "auto",
    groupLabel: (group) => options.groupLabels?.[group] ?? fieldLabels().group.get(group),
    sectionLabel: (section) =>
      options.sectionLabels?.[section] ?? fieldLabels().section.get(section),
    groupDescription: (group) =>
      options.groupDescriptions?.[group] ?? fieldLabels().groupText.get(group),
    sectionDescription: (section) =>
      options.sectionDescriptions?.[section] ?? fieldLabels().sectionText.get(section),
    groupFolded: options.groupFolded,
    sectionFolded: options.sectionFolded,
    presetLabel: (presetId, scope = "") => {
      const v = scoping().variants === scope ? variantsChoice() : undefined
      const option = presetId === "default" ? v?.field.value : presetId
      return (
        options.presetLabels?.[presetId] ??
        (presetId === "default" ? defaultLabelOf(options.defaultLabel, scope) : undefined) ??
        (v && option !== undefined && v.field.options.includes(option)
          ? (v.field.labels?.[option] ?? option)
          : presetId)
      )
    },
    isPinned: (key) => pinned().has(key),
    inPresets: (key) => !presetFree().has(key),
    get,
    set,
    sync,
    get enabled() {
      return enabled()
    },
    get storage() {
      return storage()
    },
    get error() {
      return error
    },
    get canUndo() {
      return hostHistory ? hostHistory.canUndo() : past.length > 0
    },
    get canRedo() {
      return hostHistory ? hostHistory.canRedo() : future.length > 0
    },
    persist: persistMode,
    get comparing() {
      return comparing !== null
    },
    get landing() {
      return landing
    },
    [RESHAPE]: reshape,
    [READOUT]: readoutPort,
    watch(key, value) {
      const found = readoutOf(key)
      if (!found) return
      pushReadout(found.field, found.state, value)
      for (const cb of readoutListeners) cb(key)
    },
    watched(key) {
      const state = readouts.get(key)?.state
      return state && state.seq > 0 ? state.value : undefined
    },
    hold(key, on = true) {
      if (on) {
        if (grabbed.has(key)) return
        grabbed.add(key)
        options.onGesture?.({ key, phase: "start" })
        return
      }
      if (!grabbed.delete(key)) return
      options.onGesture?.({ key, phase: "end" })
      // A drag that changed the key keeps it for the echo window; one that didn't lets go now.
      flush()
    },
    isHeld,
    action(key, item) {
      const field = schema[key]
      if (field?.kind === "toolbar") {
        const found = field.items.find((i) => (i.id ?? i.label) === item)
        if (!found) throw new Error(`Unknown toolbar item: ${key} ${item}`)
        if (found.disabled) return
        found.run?.()
        options.onAction?.(found.id ?? found.label)
        return
      }
      if (!field || field.kind !== "action") throw new Error(`Unknown action: ${key}`)
      field.run?.()
      options.onAction?.(key)
    },
    undo() {
      release()
      if (hostHistory) return hostHistory.undo()
      const previous = past.pop()
      if (!previous) return
      step(previous, "undo", future)
    },
    redo() {
      release()
      if (hostHistory) return hostHistory.redo()
      const next = future.pop()
      if (!next) return
      step(next, "redo", past)
    },
    getServerSnapshot: () => locked,
    subscribe(cb) {
      listeners.add(cb)
      // The host's history is heard while anyone listens, so buttons follow its canUndo.
      if (hostHistory?.subscribe && !unsubscribeHistory)
        unsubscribeHistory = hostHistory.subscribe(notify)
      unsubscribeUnlock ??= onUnlock(notify)
      return () => {
        listeners.delete(cb)
        if (listeners.size) return
        unsubscribeHistory?.()
        unsubscribeHistory = undefined
        unsubscribeUnlock?.()
        unsubscribeUnlock = undefined
      }
    },
    reset(keys) {
      if (!enabled()) return
      const open = resettable(keys)
      if (offBase(open)) return toBase(open, {})
      // Disabled and read-only fields keep their values; a reset that skips some is reported
      // key by key rather than as "everything". Only a reset of everything forgets the preset.
      const skipped = fieldKeys().some(blocked)
      if (!keys && !skipped) {
        write(locked, { source: "reset" }, NO_BASE)
        options.onReset?.({})
        return
      }
      toDefaults(open, keys ? baseWithout(keys) : NO_BASE)
    },
    resetKey(key) {
      if (!enabled()) return
      if (!valueField(key)) throw new Error(`Unknown control key: ${key}`)
      if (blocked(key)) return
      if (offBase([key])) return toBase([key], { key })
      set({ [key]: locked[key] } as Partial<Values<S>>, { source: "reset", key })
      options.onReset?.({ key })
    },
    resetGroup(group) {
      if (!enabled()) return
      const keys = Object.keys(schema).filter(
        (k) => schema[k]!.group === group && hasValue(schema[k]!),
      )
      const open = keys.filter((k) => !blocked(k))
      const b = activeBase()
      const index = b.groups[group]
      if (offBase(open)) {
        toBase(open, { group })
        // The group's own preset again: a peer that applies its presets itself hears it so.
        const preset = index === undefined ? undefined : groupPresets[group]?.[index]
        if (preset && index !== undefined) options.onPreset?.({ group, index, name: preset.name })
        return
      }
      // Back to the defaults lets go of the group's preset and of a scoped one named for it.
      const { [group]: _, ...others } = b.groups
      const forget =
        index === undefined && b.scopes[group] === undefined
          ? undefined
          : makeBase(b.preset, others, withScope(b.scopes, group, undefined))
      if (open.length < keys.length) return toDefaults(open, forget)
      const patch: Record<string, unknown> = {}
      for (const k of keys) patch[k] = locked[k]
      write(patch as Partial<Values<S>>, { source: "reset", group }, forget)
      options.onReset?.({ group })
    },
    isModified(key) {
      const cur = get()
      const b = baseValues()
      if (key !== undefined) return !same(cur[key], b[key])
      return !equal(cur, b)
    },
    canReset(keys) {
      if (!enabled()) return false
      const cur = get()
      const b = baseValues()
      return (
        resettable(keys).some((k) => !same(cur[k], b[k]) || !same(cur[k], locked[k])) ||
        (!keys && hasBase())
      )
    },
    modified() {
      const cur = get()
      const out: Record<string, unknown> = {}
      for (const k of fieldKeys()) {
        if (!same(cur[k], locked[k])) out[k] = cur[k]
      }
      return Object.freeze(out) as Partial<Values<S>>
    },
    randomize(keys) {
      if (!enabled()) return
      const chosen = pool(keys)
      if (chosen.length === 0) return
      // Only the chosen fields draw, in schema order, so a seeded roll reproduces.
      if (!hasBase()) {
        const sub = Object.fromEntries(chosen.map((k) => [k, schema[k]])) as Schema
        set(randomValues(sub, draw) as Partial<Values<S>>, { source: "randomize" })
        return
      }
      // With an active preset, keys it covers land near its values instead.
      const b = baseValues()
      const patch: Record<string, unknown> = {}
      for (const k of chosen) {
        const field = valueField(k)!
        patch[k] = covered(k) ? around(field, b[k], draw) : pick(field, draw)
      }
      set(patch as Partial<Values<S>>, { source: "randomize" })
    },
    mutate(keys) {
      if (!enabled()) return
      release()
      const chosen = pool(keys)
      if (chosen.length === 0) return
      set(mutateValues(schema, load(), chosen, draw) as Partial<Values<S>>, { source: "mutate" })
    },
    lock(keys, on = true) {
      if (!enabled()) return
      load()
      let changed = false
      for (const key of typeof keys === "string" ? [keys] : keys) {
        if (!valueField(key)) throw new Error(`Unknown control key: ${key}`)
        if (locks.has(key) === on) continue
        if (on) locks.add(key)
        else locks.delete(key)
        changed = true
      }
      if (!changed) return
      persist()
      notify()
    },
    isLocked(key) {
      if (!enabled()) return false
      load()
      return locks.has(key)
    },
    shortcut(key, item) {
      const id = item === undefined ? key : `${key}/${item}`
      const declared = declaredShortcut(id)
      if (!declared.found) return undefined
      if (enabled()) load()
      const bound = enabled() ? bindings.get(id) : undefined
      return bound ?? declared.combo
    },
    rebind(key, combo, item) {
      const id = item === undefined ? key : `${key}/${item}`
      const declared = declaredShortcut(id)
      if (!declared.found) throw new Error(`Not an action or toolbar button: ${id}`)
      if (!enabled()) return
      load()
      const next = combo === undefined ? undefined : normalizeCombo(combo)
      if (combo !== undefined && combo.trim() && !next)
        throw new Error(`Not a key combination: ${combo}`)
      const was = bindings.get(id)
      if (next === undefined || next === (declared.combo ?? "")) bindings.delete(id)
      else bindings.set(id, next)
      if (bindings.get(id) === was) return
      persist()
      notify()
    },
    canRoll(key) {
      if (!enabled()) return false
      load()
      return rollable(key)
    },
    isDisabled: (key) => flag(key, "disabled"),
    isReadOnly: (key) => flag(key, "readOnly"),
    refresh() {
      refreshes++
      notify()
    },
    get [REFRESHES]() {
      return refreshes
    },
    setMixed(keys, on = true) {
      let changed = false
      for (const key of typeof keys === "string" ? [keys] : keys) {
        if (!valueField(key) || mixed.has(key) === on) continue
        if (on) mixed.add(key)
        else mixed.delete(key)
        changed = true
      }
      if (changed) notify()
    },
    isMixed: (key) => mixed.has(key),
    compare(hold) {
      if (!enabled()) return
      if (!hold) return release()
      const before = past.at(-1)?.values
      const now = load()
      if (comparing || !before || equal(before, now)) return
      comparing = before
      options.onChange?.(changes(now, before), before, { source: "compare" })
      notify()
    },
    preset(id, presetOptions) {
      const scope = presetOptions?.scope ?? ""
      const list = presetsIn(scope)
      if (!Object.hasOwn(list, id)) throw new Error(`Unknown preset: ${id}`)
      const b = activeBase()
      const ref = id === "default" ? undefined : Object.freeze({ kind: "preset" as const, id })
      write(
        patchIn(list[id]!, scope),
        { source: "preset", coalesce: presetOptions?.coalesce },
        scope === ""
          ? makeBase(ref ?? null, {}, b.scopes)
          : makeBase(b.preset, groupsOutside(b.groups, scope), withScope(b.scopes, scope, ref)),
      )
    },
    matchingPreset: (scope = "") => {
      const list = presetsIn(scope)
      const cur = within(get(), scope)
      return Object.keys(list).find((id) => equal(cur, list[id])) ?? "custom"
    },
    get groupPresets() {
      return groupPresets
    },
    groupPreset(group, index, presetOptions) {
      const preset = groupPresets[group]?.[index]
      if (!preset) throw new Error(`Unknown preset ${index + 1} for group ${group}`)
      if (!enabled()) return
      const b = activeBase()
      write(
        preset.values,
        { source: "preset", group, coalesce: presetOptions?.coalesce },
        makeBase(b.preset, { ...b.groups, [group]: index }, b.scopes),
      )
      options.onPreset?.({ group, index, name: preset.name })
    },
    activePreset(scope) {
      if (!enabled()) return null
      const b = activeBase()
      return scope ? (b.scopes[scope] ?? null) : b.preset
    },
    activeGroupPreset(group) {
      if (!enabled()) return -1
      return activeBase().groups[group] ?? -1
    },
    baseValues,
    matchingGroupPreset(group) {
      const cur = get() as Record<string, unknown>
      return (groupPresets[group] ?? []).findIndex((p) =>
        Object.entries(p.values).every(([k, v]) => same(cur[k], v)),
      )
    },
    code: (format, values) => formatCode(values ?? get(), format),
    variants,
    attach(element, chip) {
      // A shipped store loads the host's panel module; a dev build its own lazy chunk. A
      // production build of an unshipped store has neither, so no panel code is reachable,
      // until the page is unlocked and names the module to load (see `unlock`).
      const load = options.ship
        ? () => options.ship!().then((m) => m.attach)
        : typeof __KNOBS_DEV__ === "undefined" || __KNOBS_DEV__
          ? () => import("../panel/attach.js").then((m) => m.attach)
          : () => unlockedPanel()?.().then((m) => m.attach)
      return live(
        load,
        (attach) => attach(controls, element, chip),
        (detach) => detach(),
      )
    },
    mount(container, mountOptions) {
      const load = options.ship
        ? () => options.ship!().then((m) => m.mountPanel)
        : typeof __KNOBS_DEV__ === "undefined" || __KNOBS_DEV__
          ? () => import("../panel/panel.js").then((m) => m.mountPanel)
          : () => unlockedPanel()?.().then((m) => m.mountPanel)
      return live(
        load,
        (mountPanel) => {
          const panel = mountPanel(controls, container, mountOptions)
          mountOptions?.onReady?.(panel)
          return panel
        },
        (panel) => panel.dispose(),
      )
    },
  }
  return Object.freeze(controls)
}
