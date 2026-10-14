import type { Schema, Values } from "../core/schema.js"
import type { ControlAction, Controls, MountPanelOptions } from "../core/store.js"
import {
  getGpuOverlayManager,
  resolveRendererMode,
  type GpuGroupBinding,
  type GpuPanelBinding,
  type GpuRowBinding,
} from "./gpu/renderer.js"
import { createHintController, type HintTarget } from "./hints.js"
import { iconSvg, type IconName } from "./icons.js"
import { Spring } from "./motion.js"
import { positionPanel } from "./position.js"
import { reveal } from "./reveal.js"
import { createPresetStrip, type PresetStrip } from "./presets.js"
import { createSlider } from "./slider.js"
import { injectStyles } from "./styles.js"

export interface Panel {
  element: HTMLElement
  presetStrip: PresetStrip
  focus(): void
  /** Fades the panel out, then disposes it. */
  dismiss(): void
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
  const commands = [
    headButton("random", "Random", "r", controls.randomize),
    headButton("reset", "Reset", "Shift+R", controls.reset),
    headButton("copy", "Copy", "Shift+C", copyValues),
  ]
  for (const b of commands) b.classList.add("knobs-head-cmd")
  const resetBtn = commands[1]!
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
    gRight.append(gReset)
    gHead.append(gLabel, gRight)
    gpuGroups.push({ element: gHead, labelEl: gLabel, buttons: gBtns, reset: gReset })
    return gHead
  }

  const rows = Object.entries(controls.schema).map(([key, field]) => {
    const host = cardFor(field.group)
    const display = field.label ?? key
    const set = (value: unknown, setOpts?: { coalesce?: boolean }) =>
      controls.set({ [key]: value } as Partial<Values<S>>, setOpts)
    const isModified = () => controls.get()[key] !== controls.locked[key]
    if (field.kind === "knob") {
      const slider = createSlider(doc, key, field, set, () => wakeGpu())
      slider.element.dataset.field = key
      if (field.shortcut) slider.track.setAttribute("aria-keyshortcuts", field.shortcut)
      slider.element.ondblclick = (event) => {
        if ((event.target as HTMLElement).closest(".knobs-value,.knobs-number")) return
        run(() => controls.resetKey(key))
      }
      host.append(slider.element)
      gpuRows.push({ kind: "knob", key, display, row: slider.element, slider, isModified })
      return {
        key,
        display,
        field,
        row: slider.element,
        labelEl: slider.label,
        input: slider.track,
        number: slider.number,
        slider,
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
      new ResizeObserver(() => placeSegPill(seg, buttons, String(controls.get()[key]))).observe(seg)
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
        pillX: new Spring(0, 28, 0.84),
        pillW: new Spring(0, 28, 0.86),
        isModified,
      })
      return {
        key,
        display,
        field,
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
      toggleSpring: new Spring(controls.get()[key] ? 1 : 0, 28, 0.82),
      isModified,
    })
    return { key, display, field, row, labelEl: rowLabel, input: toggle, number: undefined, set }
  })

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
  function placeSegPill(seg: HTMLElement, buttons: readonly HTMLButtonElement[], value: string) {
    let active: HTMLButtonElement | undefined
    for (const b of buttons) {
      const on = b.dataset.value === value
      b.setAttribute("aria-checked", String(on))
      if (on) active = b
    }
    const pill = seg.querySelector<HTMLElement>(".knobs-seg-pill")
    if (!pill || !active) return
    const first = !pill.dataset.placed
    if (first) pill.style.transition = "none"
    pill.style.width = `${active.offsetWidth}px`
    pill.style.transform = `translateX(${active.offsetLeft}px)`
    if (first) {
      pill.dataset.placed = "true"
      void pill.offsetWidth
      pill.style.transition = ""
    }
  }

  function update() {
    if (!controls.enabled) {
      close?.()
      return
    }
    const values = controls.get()
    for (const row of rows) {
      const value = values[row.key]
      row.row.classList.toggle("knobs-modified", value !== controls.locked[row.key])
      if ("slider" in row && row.slider) row.slider.update(Number(value))
      else if ("buttons" in row && row.buttons) placeSegPill(row.input, row.buttons, String(value))
      else row.input.setAttribute("aria-checked", String(Boolean(value)))
    }
    for (const [groupName, gReset] of groupResetButtons) {
      const shown = rows.some(
        (r) => r.field.group === groupName && values[r.key] !== controls.locked[r.key],
      )
      gReset.disabled = !shown
      gReset.dataset.shown = String(shown)
    }
    resetBtn.disabled = !rows.some((r) => values[r.key] !== controls.locked[r.key])
    undoButton.disabled = !controls.canUndo
    redoButton.disabled = !controls.canRedo
    if (controls.error && status.textContent !== controls.error) say(controls.error, 8000)
    presetStrip.update()

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
    const list: { contains(node: Node): boolean; focus(): void }[] = []
    if (visible(presetStrip.element))
      list.push({
        contains: (n) => presetStrip.element.contains(n),
        focus: () => presetStrip.element.focus(),
      })
    for (const r of rows)
      list.push({ contains: (n) => r.row.contains(n), focus: () => r.input.focus() })
    const bar = actionBarButtons()
    if (bar.length)
      list.push({
        contains: (n) => bar.some((b) => b === n),
        focus: () =>
          (lastActionButton && bar.includes(lastActionButton) ? lastActionButton : bar[0])?.focus(),
      })
    return list
  }
  const focusables = () =>
    [
      ...root.querySelectorAll<HTMLElement>(
        "button,input:not([type=hidden]),textarea,select,[tabindex]:not([tabindex='-1'])",
      ),
    ].filter((n) => n.tabIndex >= 0 && visible(n) && !(n as HTMLButtonElement).disabled)

  root.onkeydown = (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    if (hintCtrl.handleKey(event)) return
    const target = event.target as HTMLElement
    const typing =
      target === text || (target instanceof HTMLInputElement && target.type === "number")
    if (event.key === "Escape") {
      if (!popover.hidden) {
        event.preventDefault()
        event.stopPropagation()
        togglePopover(false)
        helpButton?.focus({ preventScroll: true })
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
      run(key === "R" ? controls.reset : controls.randomize)
      return
    }
    if (key === "C") {
      event.preventDefault()
      copyValues()
      return
    }
    if (key === "S" && showVariants) {
      event.preventDefault()
      presetStrip.save()
      return
    }
    const index = rows.findIndex((r) => r.row.contains(target))
    if ((key === "Backspace" || key === "Delete") && index >= 0 && target !== rows[index].number) {
      event.preventDefault()
      run(() => controls.resetKey(rows[index].key))
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
    } else if ((left || right) && index >= 0 && target !== rows[index].number) {
      event.preventDefault()
      event.stopPropagation()
      const row = rows[index],
        field = row.field,
        value = controls.get()[row.key]
      const direction = right ? 1 : -1
      if (field.kind === "knob")
        row.set(Number(value) + direction * field.step * (event.shiftKey ? 10 : 1))
      else if (field.kind === "choice")
        row.set(
          field.options[
            (field.options.indexOf(String(value)) + direction + field.options.length) %
              field.options.length
          ],
        )
      else row.set(!value)
    } else if (
      index >= 0 &&
      target === rows[index].input &&
      "slider" in rows[index] &&
      /^[0-9.\-]$/.test(event.key)
    ) {
      event.preventDefault()
      const row = rows[index] as { slider: { edit(): void }; number: HTMLInputElement }
      row.slider.edit()
      row.number.value = event.key
    }
  }

  const raise = () => {
    if (!inline) {
      root.style.zIndex = String(++layer)
      wakeGpu()
    }
  }
  root.onpointerdown = raise
  root.addEventListener("focusin", raise)
  const unsubscribe = controls.subscribe(update)
  update()
  positioned =
    !inline && options.anchor
      ? positionPanel(root, header, options.anchor, controls.id, () => controls.storage)
      : undefined

  const gpuBinding: GpuPanelBinding = {
    id: controls.id,
    root,
    body,
    inline,
    header,
    titleEl,
    headerButtons,
    presetStrip,
    groups: gpuGroups,
    cards,
    rows: gpuRows,
    actionButtons: gpuActionButtons,
    isPopoverOpen: () => !popover.hidden,
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

  return {
    element: root,
    presetStrip,
    focus() {
      raise()
      ;(rows[0]?.input ?? dismiss ?? root).focus({ preventScroll: true })
    },
    dismiss() {
      if (root.dataset.leaving) return
      root.dataset.leaving = "true"
      root.style.pointerEvents = "none"
      const reduced = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (reduced) return this.dispose()
      root
        .animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "translateY(3px) scale(.985)" },
          ],
          { duration: 150, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
        )
        .finished.then(
          () => this.dispose(),
          () => this.dispose(),
        )
    },
    dispose() {
      clearTimeout(statusTimer)
      hintCtrl.stop()
      modeObserver.disconnect()
      unregisterGpu?.()
      unsubscribe()
      positioned?.dispose()
      root.remove()
    },
  }
}

export function createPanel<S extends Schema>(
  controls: Controls<S>,
  anchor: HTMLElement,
  close: () => void,
  options?: MountPanelOptions,
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
