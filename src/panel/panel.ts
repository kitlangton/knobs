import { same, type Field, type Schema, type Values } from "../core/schema.js"
import type { ControlAction, Controls, MountPanelOptions } from "../core/store.js"
import {
  getGpuOverlayManager,
  resolveRendererMode,
  type GpuGroupBinding,
  type GpuPanelBinding,
  type GpuRowBinding,
} from "./gpu/renderer.js"
import {
  colorRow,
  easingRow,
  pointRow,
  springRow,
  type EditorRow,
  type SubTrack,
} from "./editors.js"
import { createHintController, type HintTarget } from "./hints.js"
import { createHeaderDie, GROUP_DIE, type HeaderDie } from "./die.js"
import { iconSvg, type IconName } from "./icons.js"
import { Edges } from "./motion.js"
import { morphFromChip, type PanelMorph } from "./morph.js"
import { openMenu, type Menu } from "./menu.js"
import { positionPanel } from "./position.js"
import { reveal } from "./reveal.js"
import { createPresetStrip, type PresetStrip } from "./presets.js"
import { createSlider, type Slider } from "./slider.js"
import { readSession, writeSession } from "./session.js"
import { injectStyles } from "./styles.js"
import { onSwipe } from "./swipe.js"

export interface Panel {
  element: HTMLElement
  presetStrip: PresetStrip
  focus(): void
  /** Collapses the panel into its chip (or fades it out), then disposes it. */
  dismiss(): void
  /** Reverses a collapse still in flight; false once there's none to reverse. */
  reopen(): boolean
  dispose(): void
}
let layer = 2147480001

/** "synth-voice" → "Synth voice", "knobsTokens" → "Knobs tokens"; titles with spaces are kept. */
export function readableTitle(id: string): string {
  if (/\s/.test(id)) return id
  const words = id
    .replace(/([a-z0-9])([A-Z][a-z])/g, "$1-$2")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => (/^[A-Z][a-z0-9]*$/.test(word) ? word.toLowerCase() : word))
  const first = words[0] ?? ""
  if (/^[a-z0-9]+$/.test(first)) words[0] = first.charAt(0).toUpperCase() + first.slice(1)
  return words.join(" ")
}

interface InternalPanelOptions extends MountPanelOptions {
  readonly inline?: boolean
  readonly anchor?: HTMLElement
  readonly close?: () => void
  /** Reopened after a reload: no entrance, and focus returns where it was. */
  readonly restored?: boolean
  /** The chip a floating panel grows out of and collapses back into. */
  readonly chip?: HTMLElement
}

function buildPanel<S extends Schema>(
  controls: Controls<S>,
  host: HTMLElement,
  options: InternalPanelOptions,
): Panel {
  if (!controls.enabled) throw new Error("Controls are disabled.")
  const doc = host.ownerDocument
  injectStyles(doc)
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag)
    if (text) node.textContent = text
    return node
  }
  const inline = Boolean(options.inline)
  const close = options.close ?? options.onClose
  const root = el("aside")
  root.className = inline ? "knobs-panel knobs-inline" : "knobs-panel"
  root.dataset.controls = controls.id
  root.dataset.theme = options.theme ?? controls.theme
  root.dataset.density = options.density ?? controls.density
  const titleText = options.title === undefined ? controls.id : options.title
  if (options.restored) root.dataset.restored = ""
  root.setAttribute("role", inline ? "region" : "dialog")
  root.setAttribute("aria-label", `${titleText || controls.id} controls`)
  host.append(root)

  let wakeGpu = () => {}

  const status = el("p")
  status.className = "knobs-status"
  status.setAttribute("role", "status")
  status.hidden = true
  // Messages glide in, linger, then fold away so the panel returns to its resting height.
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  const say = (message: string, linger = 3200) => {
    clearTimeout(statusTimer)
    status.textContent = message
    reveal(status, true)
    statusTimer = setTimeout(() => reveal(status, false), linger)
  }
  const run = (action: () => unknown) => {
    try {
      const result = action()
      if (typeof result === "string") say(result)
      else if (result instanceof Promise)
        void result
          .then((msg) => {
            if (typeof msg === "string") say(msg)
            wakeGpu()
          })
          .catch((cause) => {
            say(cause instanceof Error ? cause.message : String(cause), 6000)
            wakeGpu()
          })
    } catch (cause) {
      say(cause instanceof Error ? cause.message : String(cause), 6000)
    }
    wakeGpu()
  }
  const button = (label: string, action: () => unknown) => {
    const node = el("button", label)
    node.type = "button"
    node.onclick = () => run(action)
    return node
  }

  const showVariants = options.variants !== false
  const showHistory = options.history !== false
  const showFooter = options.footer !== false

  const header = el("header")
  const headerButtons: { button: HTMLButtonElement; icon: IconName }[] = []
  const headActions = el("div")
  headActions.className = "knobs-head-actions"
  const iconButton = (icon: IconName, label: string, shortcut: string, action: () => unknown) => {
    const node = button("", action)
    node.append(iconSvg(doc, icon))
    node.setAttribute("aria-label", label)
    if (shortcut) node.setAttribute("aria-keyshortcuts", shortcut)
    return node
  }
  const place = (node: HTMLButtonElement, icon: IconName) => {
    headActions.append(node)
    headerButtons.push({ button: node, icon })
    return node
  }
  const headButton = (icon: IconName, label: string, shortcut: string, action: () => unknown) =>
    place(iconButton(icon, label, shortcut, action), icon)

  const popover = el("div")
  popover.className = "knobs-popover"
  popover.hidden = true
  popover.setAttribute("role", "note")
  popover.setAttribute("aria-label", "Keyboard shortcuts")
  const popGrid = el("div")
  popGrid.className = "knobs-popover-grid"
  for (const [k, desc] of [
    ["↑↓ / j k", "Move between rows"],
    ["Tab", "Next control"],
    ["←→ / h l", "Adjust value (⇧ ×10)"],
    ["⌥ drag", "Fine adjust"],
    ["[ / ]", "Cycle presets"],
    ["s", "Jump to anything by code"],
    ["0–9 / Enter", "Edit number inline"],
    ["⌫", "Reset row · delete saved preset"],
    ["r / ⇧R", "Random / Reset all"],
    ["⌥R", "Mutate: small changes"],
    ["g / ⌥G", "Random / Mutate group"],
    ["⇧L", "Lock from Random"],
    ["⇧ click / ⇧↑↓", "Select rows (⌘ adds)"],
    ["⇧F10", "Row menu"],
    ["hold \\", "Compare with before"],
    ["⇧C", "Copy values"],
    ...(showVariants ? ([["⇧S", "Save as preset"]] as [string, string][]) : []),
    ["u / ⇧u", "Undo / Redo"],
    ...(close ? ([["Esc", "Close panel"]] as [string, string][]) : []),
  ]) {
    popGrid.append(el("kbd", k), el("span", desc))
  }
  popover.append(popGrid)

  let positioned: { constrain(): void; dispose(): void } | undefined
  let helpButton: HTMLButtonElement | undefined
  const togglePopover = (open?: boolean) => {
    const next = open ?? (popover.hidden || popover.dataset.leaving === "true")
    reveal(popover, next)
    helpButton?.setAttribute("aria-expanded", String(next))
    positioned?.constrain()
    wakeGpu()
  }

  const copyValues = () => void copy(controls.code())
  // Random, Reset and Copy are reachable from hint mode; history, help and close have keys.
  const command = (icon: IconName, label: string, shortcut: string, action: () => unknown) => {
    const node = headButton(icon, label, shortcut, action)
    node.classList.add("knobs-head-cmd")
    return node
  }
  // Random rolls a die in place of the dice icon (see die.ts).
  const die = createHeaderDie(doc, () => wakeGpu())
  // Random re-rolls, Mutate (⌥) nudges; both skip locked fields and roll `roller` only when
  // something can change. A selection narrows `r` and ⌥R to its rows.
  const reroll = (keys: readonly string[] | undefined, nudge: boolean, roller: HeaderDie = die) => {
    const pool = (keys ?? rows.map((r) => r.key)).filter(
      (k) => !controls.isLocked(k as keyof S & string),
    ) as (keyof S & string)[]
    if (pool.length === 0) return
    roller.roll(nudge)
    if (nudge) controls.mutate(keys ? pool : undefined)
    else controls.randomize(keys ? pool : undefined)
  }
  const randomButton = command("random", "Random", "r", () => {})
  randomButton.setAttribute("aria-keyshortcuts", "r Alt+r")
  randomButton.onclick = (event) => run(() => reroll(undefined, event.altKey))
  randomButton.querySelector(".knobs-icon")?.replaceWith(die.node)
  const resetBtn = command("reset", "Reset", "Shift+R", controls.reset)
  command("copy", "Copy", "Shift+C", copyValues)
  const undoButton = iconButton("undo", "Undo", "u", controls.undo)
  const redoButton = iconButton("redo", "Redo", "Shift+u", controls.redo)
  if (showHistory) {
    place(undoButton, "undo").classList.add("knobs-head-split")
    place(redoButton, "redo")
  }
  if (showFooter) {
    helpButton = headButton("help", "Keyboard shortcuts", "?", () => togglePopover())
    helpButton.setAttribute("aria-expanded", "false")
    if (!showHistory) helpButton.classList.add("knobs-head-split")
  }
  const dismiss = close ? headButton("close", `Close ${controls.id}`, "", close) : undefined
  const titleEl = el("strong", titleText ? readableTitle(titleText) : "")
  header.append(titleEl, headActions)

  const presetStrip = createPresetStrip(doc, controls, showVariants, run, () => wakeGpu())
  const allActions: readonly ControlAction<Values<S>>[] = [
    ...(controls.actions ?? []),
    ...((options.actions as readonly ControlAction<Values<S>>[]) ?? []),
  ]
  const body = el("div")
  // Rows share one inset-grouped card per group (and per run of ungrouped rows).
  let card: HTMLElement | undefined
  let currentGroup: string | undefined
  const cards: HTMLElement[] = []
  const groupResetButtons = new Map<string, HTMLButtonElement>()
  const groupDice = new Map<string, { button: HTMLButtonElement; die: HeaderDie }>()
  const gpuGroups: GpuGroupBinding[] = []
  const gpuRows: GpuRowBinding[] = []
  const cardFor = (group: string | undefined) => {
    if (card && group === currentGroup) return card
    currentGroup = group
    if (group) body.append(groupHead(group))
    card = el("div")
    card.className = "knobs-card"
    body.append(card)
    cards.push(card)
    return card
  }

  function groupHead(groupName: string) {
    const gHead = el("div")
    gHead.className = "knobs-group-head"
    gHead.dataset.group = groupName
    const gLabel = el("span", groupName)
    const gRight = el("span")
    const gBtns: HTMLButtonElement[] = []
    for (const act of allActions.filter((a) => a.group === groupName)) {
      const b = button(act.label, () => act.run(controls.get(), controls))
      gBtns.push(b)
      gRight.append(b)
    }
    // Shown only while something in the group differs from its defaults.
    const gReset = iconButton("reset", `Reset ${groupName}`, "", () => {
      controls.resetGroup(groupName)
      if (doc.activeElement === gReset)
        rows.find((r) => r.field.group === groupName)?.input.focus({ preventScroll: true })
    })
    gReset.className = "knobs-group-reset"
    gReset.dataset.hint = `${groupName} reset`
    groupResetButtons.set(groupName, gReset)
    // The group's own die: Random for just these rows (⌥ mutates them).
    const gDie = createHeaderDie(doc, () => wakeGpu(), GROUP_DIE)
    const gRandom = iconButton("random", `Randomize ${groupName}`, "g Alt+g", () => {})
    gRandom.className = "knobs-group-die"
    gRandom.dataset.hint = `${groupName} random`
    gRandom.querySelector(".knobs-icon")?.replaceWith(gDie.node)
    gRandom.onclick = (event) => run(() => rerollGroup(groupName, event.altKey))
    groupDice.set(groupName, { button: gRandom, die: gDie })
    gRight.append(gReset, gRandom)
    gHead.append(gLabel, gRight)
    gpuGroups.push({
      element: gHead,
      labelEl: gLabel,
      buttons: gBtns,
      reset: gReset,
      die: { button: gRandom, die: gDie },
    })
    return gHead
  }

  // A reload (Vite's included) brings back open editors and the focused stop, per tab.
  const remember = controls.storage !== null
  const session = remember ? readSession(controls.id) : {}

  // Every slider's track (knob rows and the parts of compound rows), for arrows and typed digits.
  const tracks = new Map<HTMLElement, SubTrack>()
  interface Row {
    key: string
    display: string
    field: Field
    wave: { at: number; until: number }
    row: HTMLElement
    labelEl: HTMLElement
    input: HTMLElement
    number?: HTMLInputElement
    slider?: Slider
    buttons?: HTMLButtonElement[]
    editor?: EditorRow
    set(value: unknown, options?: { coalesce?: boolean }): void
  }
  const rows = Object.entries(controls.schema as Record<string, Field>).map(([key, field]): Row => {
    const host = cardFor(field.group)
    // When this row's current motion starts and roughly ends, for the preset cascade.
    const wave = { at: 0, until: 0 }
    const display = field.label ?? key
    const set = (value: unknown, setOpts?: { coalesce?: boolean }) =>
      controls.set({ [key]: value } as Partial<Values<S>>, setOpts)
    const isModified = () => !same(controls.get()[key], controls.locked[key])
    if (field.kind === "knob") {
      const slider = createSlider(doc, key, field, set, () => wakeGpu())
      slider.element.dataset.field = key
      if (field.shortcut) slider.track.setAttribute("aria-keyshortcuts", field.shortcut)
      slider.element.ondblclick = (event) => {
        if ((event.target as HTMLElement).closest(".knobs-value,.knobs-number")) return
        run(() => controls.resetKey(key))
      }
      host.append(slider.element)
      tracks.set(slider.track, {
        slider,
        field,
        get: () => controls.get()[key] as number,
        set: (v) => set(v),
      })
      gpuRows.push({ kind: "knob", key, display, row: slider.element, slider, wave, isModified })
      return {
        key,
        display,
        field,
        wave,
        row: slider.element,
        labelEl: slider.label,
        input: slider.track,
        number: slider.number,
        slider,
        set,
      }
    }
    if (field.kind !== "choice" && field.kind !== "toggle") {
      const context = {
        doc,
        key,
        display,
        wave,
        get: () => controls.get()[key],
        set: (value: unknown, setOpts?: { coalesce?: boolean }) => run(() => set(value, setOpts)),
        isModified,
        wake: () => wakeGpu(),
        expanded: session.expanded?.includes(key),
        onExpand: (open: boolean) => {
          if (!remember) return
          const others = (readSession(controls.id).expanded ?? []).filter((k) => k !== key)
          writeSession(controls.id, { expanded: open ? [...others, key] : others })
        },
      }
      const editor =
        field.kind === "spring"
          ? springRow({ ...context, field })
          : field.kind === "color"
            ? colorRow({ ...context, field })
            : field.kind === "point"
              ? pointRow({ ...context, field })
              : easingRow({ ...context, field })
      if (field.shortcut) editor.input.setAttribute("aria-keyshortcuts", field.shortcut)
      editor.labelEl.ondblclick = () => run(() => controls.resetKey(key))
      for (const t of editor.tracks) tracks.set(t.slider.track, t)
      host.append(editor.row)
      gpuRows.push(...editor.gpu)
      return {
        key,
        display,
        field,
        wave,
        row: editor.row,
        labelEl: editor.labelEl,
        input: editor.input,
        editor,
        set,
      }
    }
    const row = el("div")
    row.className = "knobs-row"
    row.dataset.field = key
    const rowLabel = el("span", display)
    rowLabel.ondblclick = () => run(() => controls.resetKey(key))
    row.append(rowLabel)
    if (field.kind === "choice") {
      const seg = el("div")
      seg.className = "knobs-seg"
      const segPill = el("span")
      segPill.className = "knobs-seg-pill"
      segPill.setAttribute("aria-hidden", "true")
      seg.append(segPill)
      seg.setAttribute("role", "radiogroup")
      seg.setAttribute("aria-label", display)
      if (field.shortcut) seg.setAttribute("aria-keyshortcuts", field.shortcut)
      const buttons = field.options.map((value) => {
        const b = el("button", value)
        b.type = "button"
        b.tabIndex = -1
        b.dataset.value = value
        b.setAttribute("role", "radio")
        b.onclick = () =>
          run(() => {
            set(value)
            seg.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
          })
        seg.append(b)
        return b
      })
      seg.tabIndex = 0
      // A sideways swipe moves one option per gesture, stopping at the ends.
      onSwipe(seg, (direction) => {
        const at = field.options.indexOf(String(controls.get()[key]))
        const next = field.options[Math.max(0, Math.min(field.options.length - 1, at + direction))]
        if (next !== undefined && next !== controls.get()[key]) run(() => set(next))
      })
      new ResizeObserver(() =>
        placeSegPill(seg, buttons, String(controls.get()[key]), true),
      ).observe(seg)
      row.append(seg)
      host.append(row)
      gpuRows.push({
        kind: "choice",
        key,
        display,
        row,
        labelEl: rowLabel,
        segEl: seg,
        buttons,
        pill: new Edges(),
        wave,
        isModified,
      })
      return {
        key,
        display,
        field,
        wave,
        row,
        labelEl: rowLabel,
        input: seg,
        number: undefined,
        buttons,
        set,
      }
    }
    const toggle = el("button")
    toggle.type = "button"
    toggle.className = "knobs-toggle"
    toggle.setAttribute("role", "switch")
    toggle.setAttribute("aria-label", display)
    if (field.shortcut) toggle.setAttribute("aria-keyshortcuts", field.shortcut)
    toggle.append(el("i"))
    toggle.onclick = () => run(() => set(!controls.get()[key]))
    row.append(toggle)
    host.append(row)
    gpuRows.push({
      kind: "toggle",
      key,
      display,
      row,
      labelEl: rowLabel,
      toggleEl: toggle,
      thumb: new Edges(),
      wave,
      isModified,
    })
    return {
      key,
      display,
      field,
      wave,
      row,
      labelEl: rowLabel,
      input: toggle,
      number: undefined,
      set,
    }
  })

  // A locked row carries a small lock after its label (see .knobs-lock), added the first time it's
  // locked; the GPU finds it by label.
  const lockIcons = new Map<HTMLElement, HTMLElement>()
  const lockIcon = (label: HTMLElement, animate: boolean) => {
    let lock = lockIcons.get(label)
    if (!lock) {
      lock = el("span")
      lock.className = "knobs-lock"
      lock.setAttribute("aria-hidden", "true")
      lock.append(iconSvg(doc, "lock"))
      label.append(lock)
      lockIcons.set(label, lock)
      // Styled unlocked first, so it scales in (data-enter tells the GPU to do the same).
      if (animate) {
        lock.dataset.enter = ""
        lock.getBoundingClientRect()
      }
    }
    return lock
  }
  const keyOf = (i: number) => rows[i]!.key as keyof S & string
  const groupKeys = (group: string) => rows.filter((r) => r.field.group === group).map((r) => r.key)
  const rerollGroup = (group: string, nudge: boolean) => {
    const roller = groupDice.get(group)?.die
    if (roller) reroll(groupKeys(group), nudge, roller)
  }

  // Selection: ⇧-click selects a range, ⌘-click toggles a row, ⇧↑↓ extends from the focused row.
  // Commands (r, ⌥R, ⌫, ⇧L, ⇧C and the menu) act on the selection when there is one.
  const selected = new Set<number>()
  let anchor = -1
  let head = -1
  const rowAt = (node: Node | null) => (node ? rows.findIndex((r) => r.row.contains(node)) : -1)
  const paintSelection = () => {
    rows.forEach((r, i) => {
      const on = selected.has(i)
      if (r.row.classList.contains("knobs-selected") !== on)
        r.row.classList.toggle("knobs-selected", on)
    })
    wakeGpu()
  }
  const selectRange = (from: number, to: number) => {
    selected.clear()
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) selected.add(i)
    paintSelection()
  }
  const clearSelection = () => {
    anchor = head = -1
    if (selected.size === 0) return
    selected.clear()
    paintSelection()
  }
  /** What a command acts on: the selection, else the focused row. */
  const targets = () => {
    if (selected.size) return [...selected].sort((a, b) => a - b)
    const at = rowAt(doc.activeElement)
    return at >= 0 ? [at] : []
  }
  const selectionKeys = () =>
    selected.size ? [...selected].sort((a, b) => a - b).map(keyOf) : undefined
  const toggleLock = (indices = targets()) => {
    const keys = indices.map(keyOf)
    if (keys.length)
      controls.lock(
        keys,
        keys.some((k) => !controls.isLocked(k)),
      )
  }
  const copyKeys = (keys: readonly string[]) => {
    const values = controls.get() as Record<string, unknown>
    void copy(controls.code("ts", Object.fromEntries(keys.map((k) => [k, values[k]])) as Values<S>))
  }
  const focusRow = (i: number) =>
    rows[i]?.input.focus({ preventScroll: false, focusVisible: false } as FocusOptions)

  let menu: Menu | undefined
  const showMenu = (at: { x: number; y: number }, keyboard: boolean, from?: number) => {
    const indices = targets()
    if (!indices.length) return
    // The menu's rows stay selected, so its shortcuts mean the same thing after it closes.
    if (!selected.size) {
      anchor = head = indices[0]!
      selectRange(anchor, head)
    }
    const keys = indices.map(keyOf)
    const locked = keys.every((k) => controls.isLocked(k))
    const active = doc.activeElement as HTMLElement | null
    const returnTo = active && root.contains(active) ? active : rows[from ?? indices[0]!]!.input
    menu?.close(false)
    menu = openMenu(
      doc,
      root,
      [
        {
          label: locked ? "Unlock" : "Lock from Random",
          shortcut: "⇧L",
          run: () => toggleLock(indices),
        },
        {
          label: "Randomize",
          shortcut: "r",
          disabled: locked,
          run: () => run(() => reroll(keys, false)),
        },
        {
          label: "Reset",
          shortcut: "⌫",
          disabled: !keys.some((k) => controls.isModified(k)),
          run: () => run(() => controls.reset(keys)),
        },
        { label: "Copy", shortcut: "⇧C", separated: true, run: () => copyKeys(keys) },
      ],
      at,
      { keyboard, returnTo, onClose: () => (menu = undefined) },
    )
  }
  const menuFromKeyboard = () => {
    const at = targets()[0]
    const row = at === undefined ? undefined : rows[at]
    if (!row) return
    const r = row.labelEl.getBoundingClientRect()
    showMenu({ x: r.left, y: r.bottom + 4 }, true)
  }

  const text = el("textarea")
  text.hidden = true
  text.name = "variant-json"
  text.spellcheck = false
  text.setAttribute("aria-label", "Import or copy text")

  const apply = button("Apply import", () => {
    controls.variants.import(text.value)
    say("Presets imported.")
    reveal(text, false)
    reveal(apply, false)
    positioned?.constrain()
  })
  apply.className = "knobs-apply-btn"
  apply.setAttribute("aria-label", "Import JSON")
  apply.hidden = true

  const copy = async (value: string) => {
    try {
      await doc.defaultView!.navigator.clipboard.writeText(value)
      say("Copied.")
    } catch {
      text.value = value
      reveal(text, true)
      apply.hidden = true
      positioned?.constrain()
      text.focus()
      text.select()
      say("Clipboard unavailable. Copy the selected text.", 6000)
    }
    wakeGpu()
  }

  const gpuActionButtons: HTMLButtonElement[] = []
  const panelActions = allActions.filter((a) => !a.group)
  const customActions = el("div")
  customActions.className = "knobs-custom-actions"
  for (const act of panelActions) {
    const b = button(act.label, () => act.run(controls.get(), controls))
    if (act.shortcut) b.setAttribute("aria-keyshortcuts", act.shortcut)
    customActions.append(b)
    gpuActionButtons.push(b)
  }

  // Saved presets live in the strip; moving them between machines lives with the shortcuts.
  if (showVariants && showFooter) {
    const transfer = el("div")
    transfer.className = "knobs-transfer"
    transfer.append(
      button("Export presets", () => void copy(controls.variants.export())),
      button("Import presets", () => {
        reveal(text, true)
        reveal(apply, true)
        text.value = ""
        positioned?.constrain()
        text.focus()
      }),
    )
    popover.append(transfer)
  }

  root.append(header)
  if (showFooter) root.append(popover)
  root.append(presetStrip.element, body)
  if (panelActions.length > 0) root.append(customActions)
  root.append(text, apply, status)

  // The selected choice's background is one pill that slides between options (the GPU renderer
  // springs its own copy). The first placement doesn't animate.
  function placeSegPill(
    seg: HTMLElement,
    buttons: readonly HTMLButtonElement[],
    value: string,
    resized = false,
  ) {
    let active: HTMLButtonElement | undefined
    for (const b of buttons) {
      const on = b.dataset.value === value
      b.setAttribute("aria-checked", String(on))
      if (on) active = b
    }
    const pill = seg.querySelector<HTMLElement>(".knobs-seg-pill")
    if (!pill || !active) return
    // Placed by its edges, so the edge facing the move can lead (see .knobs-seg-pill). A resize
    // (a token gliding) carries the pill with its option instead of animating it.
    const now = performance.now()
    const sliding = now < Number(pill.dataset.slideUntil ?? 0)
    const first = !pill.dataset.placed || (resized && pill.dataset.value === value && !sliding)
    pill.dataset.value = value
    const left = active.offsetLeft
    const at = parseFloat(pill.style.left)
    if (first) pill.style.transition = "none"
    else if (left !== at && !resized) {
      pill.dataset.dir = left > at ? "right" : "left"
      pill.dataset.slideUntil = String(now + 400)
    }
    pill.style.left = `${left}px`
    pill.style.right = `${seg.clientWidth - left - active.offsetWidth}px`
    if (first) {
      pill.dataset.placed = "true"
      // Restored a frame later rather than by forcing layout, which a gliding token would do
      // on every frame.
      doc.defaultView?.requestAnimationFrame(() => (pill.style.transition = ""))
    }
  }

  // Changes that move several rows at once (presets, reset, random, undo) ripple down the panel:
  // each changed row starts --k-cascade ms after the one above. A row already in motion retargets
  // at once instead of pausing, so switching again mid-wave stays smooth.
  let shown = controls.get()
  let initialized = false
  const cascade = (changedCount: number) => {
    if (changedCount < 2) return 0
    const win = doc.defaultView
    if (!win || win.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0
    const raw =
      root.style.getPropertyValue("--k-cascade") ||
      getComputedStyle(root).getPropertyValue("--k-cascade")
    const ms = parseFloat(raw)
    const base = Number.isFinite(ms) ? Math.max(0, ms) : 12
    return changedCount > 8 ? Math.min(base, Math.floor(96 / (changedCount - 1))) : base
  }
  function update() {
    if (!controls.enabled) {
      close?.()
      return
    }
    const values = controls.get()
    let changedCount = 0
    if (initialized) {
      for (const r of rows) if (!same(values[r.key], shown[r.key])) changedCount++
    }
    const stagger = initialized ? cascade(changedCount) : 0
    const now = performance.now()
    let turn = 0
    for (const row of rows) {
      const value = values[row.key]
      const rowChanged = !initialized || !same(value, shown[row.key])
      if (!rowChanged) continue
      let delay = 0
      if (initialized) {
        const moving = row.wave.at <= now && now < row.wave.until
        delay = moving ? 0 : turn * stagger
        turn++
        row.wave.at = now + delay
        row.wave.until = row.wave.at + 280
        row.row.style.setProperty("--k-delay", `${delay}ms`)
      }
      row.row.classList.toggle("knobs-modified", !same(value, controls.locked[row.key]))
      if (row.slider) row.slider.update(Number(value), delay)
      else if (row.buttons) placeSegPill(row.input, row.buttons, String(value))
      else if (row.editor) row.editor.update(value, delay)
      else row.input.setAttribute("aria-checked", String(Boolean(value)))
    }
    if (!initialized || changedCount > 0) {
      let anyMod = false
      for (const [groupName, gReset] of groupResetButtons) {
        const groupMod = rows.some(
          (r) => r.field.group === groupName && !same(values[r.key], controls.locked[r.key]),
        )
        if (groupMod) anyMod = true
        if (gReset.disabled !== !groupMod) gReset.disabled = !groupMod
        const s = String(groupMod)
        if (gReset.dataset.shown !== s) gReset.dataset.shown = s
      }
      const totalMod =
        anyMod || rows.some((r) => !r.field.group && !same(values[r.key], controls.locked[r.key]))
      if (resetBtn.disabled !== !totalMod) resetBtn.disabled = !totalMod
    }
    let unlocked = 0
    for (const row of rows) {
      const locked = controls.isLocked(row.key as keyof S & string)
      if (!locked) unlocked++
      if (row.row.classList.contains("knobs-locked") === locked) continue
      lockIcon(row.labelEl, initialized).dataset.on = String(locked)
      row.row.classList.toggle("knobs-locked", locked)
    }
    if (randomButton.disabled !== (unlocked === 0)) randomButton.disabled = unlocked === 0
    for (const [group, { button }] of groupDice) {
      const off = groupKeys(group).every((k) => controls.isLocked(k as keyof S & string))
      if (button.disabled !== off) button.disabled = off
    }
    if (root.hasAttribute("data-comparing") !== controls.comparing)
      root.toggleAttribute("data-comparing", controls.comparing)
    if (undoButton.disabled !== !controls.canUndo) undoButton.disabled = !controls.canUndo
    if (redoButton.disabled !== !controls.canRedo) redoButton.disabled = !controls.canRedo
    if (controls.error && status.textContent !== controls.error) say(controls.error, 8000)
    presetStrip.update()
    shown = values
    initialized = true

    wakeGpu()
  }

  const visible = (node: HTMLElement) =>
    node.isConnected && !node.closest("[hidden]") && node.getClientRects().length > 0
  const hintCtrl = createHintController(doc, root, () => wakeGpu())

  const collectHintTargets = (): HintTarget[] => {
    const targets: HintTarget[] = []
    const add = (node: HTMLElement, label: string, activate: () => void, labelEl?: HTMLElement) => {
      if (!label || !visible(node) || (node as HTMLButtonElement).disabled) return
      targets.push({ key: label, display: label, el: node, labelEl, activate })
    }
    for (const r of rows) add(r.row, r.display, () => r.input.focus(), r.labelEl)
    presetStrip.getEntries().forEach((entry, i) => {
      const chip = presetStrip.getButtons()[i]
      if (chip)
        add(chip, entry.label, () => {
          presetStrip.selectById(entry.id)
          presetStrip.element.focus({ preventScroll: true })
        })
    })
    for (const b of root.querySelectorAll<HTMLButtonElement>(
      ".knobs-head-cmd, .knobs-group-head button, .knobs-custom-actions button, .knobs-preset-save, .knobs-popover button",
    )) {
      add(b, b.dataset.hint ?? b.getAttribute("aria-label") ?? b.textContent ?? "", () => b.focus())
    }
    return targets
  }

  const actionBarButtons = () =>
    [...customActions.querySelectorAll("button")].filter((b) => visible(b) && !b.disabled)
  let lastActionButton: HTMLButtonElement | undefined
  const stops = () => {
    const list: { contains(node: Node): boolean; focus(options?: FocusOptions): void }[] = []
    if (visible(presetStrip.element))
      list.push({
        contains: (n) => presetStrip.element.contains(n),
        focus: (o) => presetStrip.element.focus(o),
      })
    for (const r of rows)
      for (const stop of r.editor?.stops() ?? [r.input])
        list.push({ contains: (n) => stop.contains(n), focus: (o) => stop.focus(o) })
    const bar = actionBarButtons()
    if (bar.length)
      list.push({
        contains: (n) => bar.some((b) => b === n),
        focus: (o) =>
          (lastActionButton && bar.includes(lastActionButton) ? lastActionButton : bar[0])?.focus(
            o,
          ),
      })
    return list
  }
  const focusables = () =>
    [
      ...root.querySelectorAll<HTMLElement>(
        "button,input:not([type=hidden]),textarea,select,[tabindex]:not([tabindex='-1'])",
      ),
    ].filter((n) => n.tabIndex >= 0 && visible(n) && !(n as HTMLButtonElement).disabled)

  /** The group of the focused row or group header. */
  const focusedGroup = (target: HTMLElement) =>
    rows[rowAt(target)]?.field.group ??
    target.closest<HTMLElement>(".knobs-group-head")?.dataset.group
  root.onkeydown = (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey) return
    const target = event.target as HTMLElement
    const typing =
      target === text || (target instanceof HTMLInputElement && target.type === "number")
    if (event.altKey) {
      // ⌥R and ⌥G mutate (by code: ⌥ changes the character on macOS).
      if (typing || hintCtrl.isActive || (event.code !== "KeyR" && event.code !== "KeyG")) return
      event.preventDefault()
      const group = event.code === "KeyG" ? focusedGroup(target) : undefined
      if (event.code === "KeyR") run(() => reroll(selectionKeys(), true))
      else if (group) run(() => rerollGroup(group, true))
      return
    }
    if (hintCtrl.handleKey(event)) return
    if (event.key === "Escape") {
      if (!popover.hidden) {
        event.preventDefault()
        event.stopPropagation()
        togglePopover(false)
        helpButton?.focus({ preventScroll: true })
        return
      }
      if (selected.size && !typing) {
        event.preventDefault()
        event.stopPropagation()
        clearSelection()
        return
      }
      if (close) {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
    }
    if (event.key === "Tab" && !inline) {
      const list = focusables()
      const at = list.indexOf(target)
      if (list.length && (at < 0 || at === (event.shiftKey ? 0 : list.length - 1))) {
        event.preventDefault()
        list[event.shiftKey ? list.length - 1 : 0]!.focus()
      }
      return
    }
    if (typing) return
    const key = event.key
    if (key === "ContextMenu" || (key === "F10" && event.shiftKey)) {
      event.preventDefault()
      event.stopPropagation()
      menuFromKeyboard()
      return
    }
    if (key === "\\") {
      // Held: the values from before the last change; released on keyup or blur.
      event.preventDefault()
      if (!event.repeat) controls.compare(true)
      return
    }
    if (key === "?" && showFooter) {
      event.preventDefault()
      event.stopPropagation()
      togglePopover()
      return
    }
    if (key === "[" || key === "]") {
      event.preventDefault()
      event.stopPropagation()
      presetStrip.cycle(key === "[" ? -1 : 1)
      return
    }
    if (key === "u" || key === "U" || key === "z" || key === "Z") {
      event.preventDefault()
      if (event.shiftKey) controls.redo()
      else controls.undo()
      return
    }
    if (key === "f") {
      event.preventDefault()
      rows[0]?.input.focus()
      return
    }
    if (key === "s") {
      event.preventDefault()
      hintCtrl.start(collectHintTargets())
      return
    }
    if (key === "r" || key === "R") {
      event.preventDefault()
      run(key === "R" ? controls.reset : () => reroll(selectionKeys(), false))
      return
    }
    if (key === "g") {
      const group = focusedGroup(target)
      if (group) {
        event.preventDefault()
        run(() => rerollGroup(group, false))
      }
      return
    }
    if (key === "L") {
      event.preventDefault()
      toggleLock()
      return
    }
    if (key === "C") {
      event.preventDefault()
      const keys = selectionKeys()
      if (keys) copyKeys(keys)
      else copyValues()
      return
    }
    if (key === "S" && showVariants) {
      event.preventDefault()
      presetStrip.save()
      return
    }
    const index = rowAt(target)
    if ((key === "Backspace" || key === "Delete") && !(target instanceof HTMLInputElement)) {
      const keys = selectionKeys()
      if (keys || index >= 0) event.preventDefault()
      if (keys) run(() => controls.reset(keys))
      else if (index >= 0) run(() => controls.resetKey(rows[index].key))
      return
    }
    if ((key === "ArrowDown" || key === "ArrowUp") && event.shiftKey && index >= 0) {
      event.preventDefault()
      event.stopPropagation()
      if (!selected.size || anchor < 0) anchor = head = index
      head = Math.max(0, Math.min(rows.length - 1, head + (key === "ArrowDown" ? 1 : -1)))
      selectRange(anchor, head)
      focusRow(head)
      return
    }
    const down = key === "ArrowDown" || key === "j"
    const up = key === "ArrowUp" || key === "k"
    const right = key === "ArrowRight" || key === "l"
    const left = key === "ArrowLeft" || key === "h"
    const bar = actionBarButtons()
    const barIndex = bar.indexOf(target as HTMLButtonElement)
    if (barIndex >= 0) lastActionButton = bar[barIndex]
    if (up || down) {
      event.preventDefault()
      event.stopPropagation()
      const list = stops()
      const at = list.findIndex((stop) => stop.contains(target))
      const next =
        at < 0 ? (down ? 0 : list.length - 1) : (at + (down ? 1 : -1) + list.length) % list.length
      list[next]?.focus()
    } else if ((left || right) && barIndex >= 0) {
      event.preventDefault()
      event.stopPropagation()
      bar[(barIndex + (right ? 1 : -1) + bar.length) % bar.length]?.focus()
    } else if ((left || right) && tracks.has(target)) {
      event.preventDefault()
      event.stopPropagation()
      const t = tracks.get(target)!
      t.set(t.get() + (right ? 1 : -1) * t.field.step * (event.shiftKey ? 10 : 1))
    } else if ((left || right) && index >= 0 && target === rows[index].input) {
      event.preventDefault()
      event.stopPropagation()
      const row = rows[index],
        field = row.field,
        value = controls.get()[row.key]
      const direction = right ? 1 : -1
      if (field.kind === "choice")
        row.set(
          field.options[
            (field.options.indexOf(String(value)) + direction + field.options.length) %
              field.options.length
          ],
        )
      else if (field.kind === "toggle") row.set(!value)
    } else if (tracks.has(target) && /^[0-9.\-]$/.test(event.key)) {
      event.preventDefault()
      const { slider } = tracks.get(target)!
      slider.edit()
      slider.number.value = event.key
    }
  }

  const raise = () => {
    if (!inline) {
      root.style.zIndex = String(++layer)
      wakeGpu()
    }
  }
  root.onpointerdown = raise
  // ⇧ and ⌘ clicks select instead of reaching the control, so a slider never jumps; a plain
  // click anywhere clears the selection.
  let swallowClick = false
  root.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return
      const at = rowAt(event.target as Node)
      if (at < 0 || !(event.shiftKey || event.metaKey)) {
        if (!event.shiftKey && !event.metaKey) clearSelection()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      swallowClick = true
      if (event.metaKey) {
        if (selected.has(at)) selected.delete(at)
        else {
          // ⌘ on a lone focused row keeps it and adds this one.
          const focused = rowAt(doc.activeElement)
          if (!selected.size && focused >= 0 && focused !== at) selected.add(focused)
          selected.add(at)
        }
        anchor = head = at
        paintSelection()
      } else {
        if (anchor < 0 || !selected.size) {
          const focused = rowAt(doc.activeElement)
          anchor = focused >= 0 ? focused : at
        }
        head = at
        selectRange(anchor, head)
      }
      focusRow(at)
    },
    true,
  )
  root.addEventListener(
    "click",
    (event) => {
      if (!swallowClick) return
      swallowClick = false
      event.preventDefault()
      event.stopPropagation()
    },
    true,
  )
  root.addEventListener("contextmenu", (event) => {
    const at = rowAt(event.target as Node)
    if (at < 0) return
    event.preventDefault()
    if (!selected.has(at)) {
      anchor = head = at
      selectRange(at, at)
    }
    showMenu({ x: event.clientX, y: event.clientY }, false, at)
  })
  const endCompare = (event: Event) => {
    if (event.type === "blur" || (event as KeyboardEvent).key === "\\") controls.compare(false)
  }
  doc.addEventListener("keyup", endCompare, true)
  doc.defaultView?.addEventListener("blur", endCompare)
  if (remember) {
    root.addEventListener("focusin", (event) => {
      const stop = stops().findIndex((s) => s.contains(event.target as Node))
      if (stop >= 0) writeSession(controls.id, { focus: { inline, stop } })
    })
    // Focus leaving for somewhere else on the page is forgotten; the window losing it isn't.
    root.addEventListener("focusout", () =>
      setTimeout(() => {
        if (!doc.hasFocus() || root.contains(doc.activeElement)) return
        if (readSession(controls.id).focus?.inline === inline)
          writeSession(controls.id, { focus: undefined })
      }),
    )
  }
  // While a control is dragged, token transitions shorten (see --k-token-t) so a slider that
  // tunes the panel itself still tracks the pointer. Releasing restores the spring first.
  const html = doc.documentElement
  let pressAt: [number, number] | undefined
  const endScrub = () => {
    pressAt = undefined
    if (html.hasAttribute("data-knobs-scrub")) html.removeAttribute("data-knobs-scrub")
  }
  root.addEventListener("pointerdown", (e) => (pressAt = [e.clientX, e.clientY]), true)
  root.addEventListener(
    "pointermove",
    (e) => {
      if (!pressAt || !(e.buttons & 1) || html.hasAttribute("data-knobs-scrub")) return
      if (Math.abs(e.clientX - pressAt[0]) + Math.abs(e.clientY - pressAt[1]) < 3) return
      html.setAttribute("data-knobs-scrub", "")
    },
    true,
  )
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    root.addEventListener(type, endScrub, true)
  root.addEventListener("focusin", raise)
  const unsubscribe = controls.subscribe(update)
  update()
  positioned =
    !inline && options.anchor
      ? positionPanel(root, header, options.anchor, controls.id, () => controls.storage)
      : undefined
  const restoreFocus = () => {
    const at = session.focus
    if (at && at.inline === inline) stops()[at.stop]?.focus({ preventScroll: true })
  }
  if (inline || options.restored) restoreFocus()

  const reducedMotion = () =>
    doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false
  let morph: PanelMorph | undefined
  if (!inline && options.chip) {
    const reduced = reducedMotion()
    morph = morphFromChip(options.chip, root, () => wakeGpu(), Boolean(options.restored || reduced))
    if (!options.restored) {
      if (reduced)
        root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "ease-out" })
      else morph.open()
    }
  }

  const gpuBinding: GpuPanelBinding = {
    id: controls.id,
    root,
    body,
    inline,
    header,
    titleEl,
    headerButtons,
    headerDie: { button: randomButton, die },
    locks: lockIcons,
    presetStrip,
    groups: gpuGroups,
    cards,
    rows: gpuRows,
    actionButtons: gpuActionButtons,
    isPopoverOpen: () => !popover.hidden,
    morph: morph?.frame,
  }
  let unregisterGpu: (() => void) | undefined
  const requestedMode = options.renderer ?? controls.renderer ?? "auto"
  const syncRendererMode = () => {
    const mode = resolveRendererMode(requestedMode, doc)
    if (mode === "gpu") {
      if (!unregisterGpu) {
        const manager = getGpuOverlayManager(doc)
        wakeGpu = manager.wake
        unregisterGpu = manager.register(gpuBinding)
      }
    } else if (unregisterGpu) {
      unregisterGpu()
      unregisterGpu = undefined
      wakeGpu = () => {}
      root.dataset.renderer = "dom"
      const cur = controls.get()
      for (const r of rows) {
        if (r.slider) r.slider.update(Number(cur[r.key]), 0)
        else if (r.editor) r.editor.update(cur[r.key], 0)
      }
    } else {
      root.dataset.renderer = "dom"
    }
  }
  syncRendererMode()

  const modeObserver = new MutationObserver(syncRendererMode)
  modeObserver.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["data-knobs-renderer", "data-theme", "style"],
  })

  const panel: Panel = {
    element: root,
    presetStrip,
    focus() {
      raise()
      ;(rows[0]?.input ?? dismiss ?? root).focus({ preventScroll: true })
    },
    dismiss() {
      if (root.dataset.leaving || morph?.closing) return
      root.style.pointerEvents = "none"
      const reduced = reducedMotion()
      if (morph && !reduced) {
        menu?.close(false)
        morph.close(() => panel.dispose())
        return
      }
      root.dataset.leaving = "true"
      root
        .animate(
          reduced
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [
                { opacity: 1, transform: "none" },
                { opacity: 0, transform: "translateY(3px) scale(.985)" },
              ],
          { duration: 120, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
        )
        .finished.then(
          () => panel.dispose(),
          () => panel.dispose(),
        )
    },
    reopen() {
      if (!morph?.closing || !root.isConnected) return false
      root.style.pointerEvents = ""
      morph.open()
      return true
    },
    dispose() {
      clearTimeout(statusTimer)
      endScrub()
      hintCtrl.stop()
      modeObserver.disconnect()
      unregisterGpu?.()
      unsubscribe()
      positioned?.dispose()
      die.dispose()
      for (const g of groupDice.values()) g.die.dispose()
      menu?.close(false)
      doc.removeEventListener("keyup", endCompare, true)
      doc.defaultView?.removeEventListener("blur", endCompare)
      controls.compare(false)
      morph?.dispose()
      root.remove()
    },
  }
  return panel
}

export function createPanel<S extends Schema>(
  controls: Controls<S>,
  anchor: HTMLElement,
  close: () => void,
  options?: MountPanelOptions & { readonly restored?: boolean; readonly chip?: HTMLElement },
): Panel {
  return buildPanel(controls, anchor.ownerDocument.body, {
    ...options,
    inline: false,
    anchor,
    close,
  })
}

export function mountPanel<S extends Schema>(
  controls: Controls<S>,
  container: HTMLElement,
  options?: MountPanelOptions,
): Panel {
  return buildPanel(controls, container, {
    ...options,
    inline: true,
  })
}
