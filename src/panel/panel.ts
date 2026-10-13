import type { Schema, Values } from "../core/schema.js"
import type { ControlAction, Controls, MountPanelOptions } from "../core/store.js"
import {
  getGpuOverlayManager,
  resolveRendererMode,
  type GpuGroupBinding,
  type GpuPanelBinding,
  type GpuRowBinding,
} from "./gpu/renderer.js"
import { computeHintPrefixes } from "./hints.js"
import { iconSvg, type IconName } from "./icons.js"
import { Spring } from "./motion.js"
import { positionPanel } from "./position.js"
import { createPresetStrip, type PresetStrip } from "./presets.js"
import { createSlider } from "./slider.js"
import { injectStyles } from "./styles.js"

export interface Panel {
  element: HTMLElement
  presetStrip: PresetStrip
  focus(): void
  dispose(): void
}
let layer = 2147480001

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
  // Append to host before building sliders so rolling numbers measure in-DOM immediately.
  host.append(root)

  let wakeGpu = () => {}

  const status = el("p")
  status.className = "knobs-status"
  status.setAttribute("role", "status")
  const run = (action: () => unknown) => {
    try {
      const result = action()
      if (typeof result === "string") status.textContent = result
      else if (result instanceof Promise)
        void result
          .then((msg) => {
            if (typeof msg === "string") status.textContent = msg
            wakeGpu()
          })
          .catch((cause) => {
            status.textContent = cause instanceof Error ? cause.message : String(cause)
            wakeGpu()
          })
    } catch (cause) {
      status.textContent = cause instanceof Error ? cause.message : String(cause)
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
  let titleEl: HTMLElement | null = null
  const headerButtons: { button: HTMLButtonElement; icon: IconName }[] = []
  const iconButton = (icon: IconName, label: string, action: () => unknown) => {
    const node = button("", action)
    node.append(iconSvg(doc, icon))
    node.setAttribute("aria-label", label)
    return node
  }

  const undoButton = iconButton("undo", "Undo", controls.undo)
  undoButton.setAttribute("aria-keyshortcuts", "u")
  undoButton.title = "Undo (u)"

  const redoButton = iconButton("redo", "Redo", controls.redo)
  redoButton.setAttribute("aria-keyshortcuts", "Shift+u")
  redoButton.title = "Redo (⇧u)"

  const popover = el("div")
  popover.className = "knobs-popover"
  popover.hidden = true
  popover.setAttribute("role", "note")
  popover.setAttribute("aria-label", "Keyboard shortcuts")
  const popGrid = el("div")
  popGrid.className = "knobs-popover-grid"
  const shortcuts: [string, string][] = [
    ["↑↓ / j k", "Move between rows"],
    ["Tab", "Next control"],
    ["←→ / h l", "Adjust value (⇧ ×10)"],
    ["[ / ]", "Cycle preset or variant"],
    ["s", "Jump to anything by name"],
    ["0–9 / Enter", "Edit number inline"],
    ["⌫", "Reset focused row (or double-click)"],
    ["r", "Randomize all"],
    ["u / ⇧u", "Undo / Redo"],
    ...(close ? ([["Esc", "Close panel"]] as [string, string][]) : []),
  ]
  for (const [k, desc] of shortcuts) {
    popGrid.append(el("kbd", k), el("span", desc))
  }
  popover.append(popGrid)

  let positioned: { constrain(): void; dispose(): void } | undefined
  let helpButton: HTMLButtonElement | undefined
  const togglePopover = (open?: boolean) => {
    const next = open ?? popover.hidden
    popover.hidden = !next
    helpButton?.setAttribute("aria-expanded", String(next))
    positioned?.constrain()
    wakeGpu()
  }

  let dismiss: HTMLButtonElement | undefined
  if (titleText !== false) {
    titleEl = el("strong", titleText)
    const headActions = el("div")
    headActions.className = "knobs-head-actions"
    if (showHistory) {
      headActions.append(undoButton, redoButton)
      headerButtons.push({ button: undoButton, icon: "undo" }, { button: redoButton, icon: "redo" })
    }
    if (showFooter) {
      helpButton = iconButton("help", "Keyboard shortcuts", () => togglePopover())
      helpButton.setAttribute("aria-keyshortcuts", "?")
      helpButton.setAttribute("aria-expanded", "false")
      helpButton.title = "Keyboard shortcuts (?)"
      headActions.append(helpButton)
      headerButtons.push({ button: helpButton, icon: "help" })
    }
    if (close) {
      dismiss = iconButton("close", `Close ${controls.id}`, close)
      dismiss.title = "Close (Esc)"
      headActions.append(dismiss)
      headerButtons.push({ button: dismiss, icon: "close" })
    }
    header.append(titleEl, headActions)
  }

  const presetStrip = createPresetStrip(doc, controls, showVariants, run, () => wakeGpu())

  const allActions: readonly ControlAction<Values<S>>[] = [
    ...(controls.actions ?? []),
    ...((options.actions as readonly ControlAction<Values<S>>[]) ?? []),
  ]
  const body = el("div")
  let currentGroup: string | undefined
  const groupResetButtons = new Map<string, HTMLButtonElement>()
  const gpuGroups: GpuGroupBinding[] = []
  const gpuRows: GpuRowBinding[] = []

  const rows = Object.entries(controls.schema).map(([key, field]) => {
    if (field.group && field.group !== currentGroup) {
      currentGroup = field.group
      const groupName = currentGroup
      const gHead = el("div")
      gHead.className = "knobs-group-head"
      gHead.dataset.group = groupName
      const gLabel = el("span", groupName)
      gHead.append(gLabel)
      const gRight = el("span")
      const gBtns: HTMLButtonElement[] = []
      for (const act of allActions.filter((a) => a.group === groupName)) {
        const b = button(act.label, () => act.run(controls.get(), controls))
        gBtns.push(b)
        gRight.append(b)
      }
      const gReset = button("Reset", () => controls.resetGroup(groupName))
      gReset.setAttribute("aria-label", `Reset ${groupName}`)
      gReset.dataset.hint = `${groupName} reset`
      groupResetButtons.set(groupName, gReset)
      gBtns.push(gReset)
      gRight.append(gReset)
      gHead.append(gRight)
      body.append(gHead)
      gpuGroups.push({ element: gHead, labelEl: gLabel, buttons: gBtns })
    }
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
      body.append(slider.element)
      gpuRows.push({
        kind: "knob",
        key,
        display,
        row: slider.element,
        slider,
        isModified,
      })
      return {
        key,
        display,
        field,
        row: slider.element,
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
            seg.focus({ preventScroll: true })
          })
        seg.append(b)
        return b
      })
      seg.tabIndex = 0
      row.append(seg)
      body.append(row)
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
      return { key, display, field, row, input: seg, number: undefined, buttons, set }
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
    body.append(row)
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
    return { key, display, field, row, input: toggle, number: undefined, set }
  })

  const name = el("input")
  name.className = "knobs-name"
  name.name = "variant-name"
  name.placeholder = "Variant name"
  name.maxLength = 100
  name.setAttribute("aria-label", "Variant name")

  const text = el("textarea")
  text.hidden = true
  text.name = "variant-json"
  text.spellcheck = false
  text.setAttribute("aria-label", "Import or copy text")

  const apply = button("Apply import", () => {
    controls.variants.import(text.value)
    status.textContent = "Variants imported."
    text.hidden = true
    apply.hidden = true
    positioned?.constrain()
  })
  apply.className = "knobs-apply-btn"
  apply.setAttribute("aria-label", "Import JSON")
  apply.hidden = true

  const copy = async (value: string) => {
    try {
      await doc.defaultView!.navigator.clipboard.writeText(value)
      status.textContent = "Copied."
    } catch {
      text.value = value
      text.hidden = false
      apply.hidden = true
      positioned?.constrain()
      text.focus()
      text.select()
      status.textContent = "Clipboard unavailable. Copy the selected text."
    }
    wakeGpu()
  }

  const saveVariant = () => {
    controls.variants.save(name.value)
    name.value = ""
    status.textContent = "Variant saved."
  }
  name.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      run(saveVariant)
    }
  }

  const variantsDrawer = el("div")
  variantsDrawer.className = "knobs-variants-drawer"
  variantsDrawer.hidden = true

  let variantsOpen = false
  let variantsToggle: HTMLButtonElement | undefined
  const setVariantsOpen = (open: boolean, focusInput = false) => {
    variantsOpen = open
    variantsDrawer.hidden = !open
    variantsToggle?.setAttribute("aria-expanded", String(open))
    positioned?.constrain()
    if (open && focusInput) name.focus({ preventScroll: true })
    wakeGpu()
  }

  const actions = el("div")
  actions.className = "knobs-actions"
  const randomBtn = button("Random", controls.randomize)
  const resetBtn = button("Reset", controls.reset)
  const copyBtn = button("Copy", () => {
    void copy(controls.code())
  })
  const gpuActionButtons: HTMLButtonElement[] = [randomBtn, resetBtn, copyBtn]

  if (showVariants) {
    variantsToggle = button("Variants", () => setVariantsOpen(!variantsOpen, !variantsOpen))
    variantsToggle.className = "knobs-variants-toggle"
    variantsToggle.setAttribute("aria-label", "Variants")
    variantsToggle.setAttribute("aria-expanded", "false")
    gpuActionButtons.push(variantsToggle)
    actions.append(randomBtn, resetBtn, copyBtn, variantsToggle)
  } else {
    actions.append(randomBtn, resetBtn, copyBtn)
  }

  const panelActions = allActions.filter((a) => !a.group)
  const customActions = el("div")
  customActions.className = "knobs-custom-actions"
  for (const act of panelActions) {
    const b = button(act.label, () => act.run(controls.get(), controls))
    if (act.shortcut) b.setAttribute("aria-keyshortcuts", act.shortcut)
    customActions.append(b)
    gpuActionButtons.push(b)
  }

  const variantForm = el("div")
  variantForm.className = "knobs-variant-form"
  const saveBtn = button("Save", saveVariant)
  variantForm.append(name, saveBtn)

  const saved = el("div")
  saved.className = "knobs-saved-list"
  const savedRows = new Map<string, HTMLElement>()
  const transfer = el("div")
  transfer.className = "knobs-transfer"
  transfer.append(
    button("Export", () => {
      void copy(controls.variants.export())
    }),
    button("Import", () => {
      text.hidden = false
      apply.hidden = false
      text.value = ""
      positioned?.constrain()
      text.focus()
    }),
  )
  variantsDrawer.append(variantForm, saved, transfer)

  if (titleText !== false) root.append(header)
  if (showFooter) root.append(popover)
  root.append(presetStrip.element)
  root.append(body)
  root.append(actions)
  if (panelActions.length > 0) root.append(customActions)
  if (showVariants) root.append(variantsDrawer)
  root.append(text, apply, status)

  function update() {
    if (!controls.enabled) {
      close?.()
      return
    }
    const values = controls.get()
    for (const row of rows) {
      const value = values[row.key]
      const modified = value !== controls.locked[row.key]
      row.row.classList.toggle("knobs-modified", modified)
      if ("slider" in row && row.slider) row.slider.update(Number(value))
      else if ("buttons" in row && row.buttons)
        for (const b of row.buttons)
          b.setAttribute("aria-checked", String(b.dataset.value === String(value)))
      else row.input.setAttribute("aria-checked", String(Boolean(value)))
    }
    for (const [groupName, gReset] of groupResetButtons) {
      const hasModified = rows.some(
        (r) => r.field.group === groupName && values[r.key] !== controls.locked[r.key],
      )
      gReset.disabled = !hasModified
    }
    undoButton.disabled = !controls.canUndo
    redoButton.disabled = !controls.canRedo
    if (controls.error) status.textContent = controls.error

    presetStrip.update()

    if (showVariants) {
      run(() => {
        const variants = controls.variants.list()
        if (variantsToggle) {
          variantsToggle.dataset.count = String(variants.length)
        }
        for (const [id, node] of savedRows)
          if (!variants.some((v) => v.id === id)) {
            node.remove()
            savedRows.delete(id)
          }
        for (const variant of variants) {
          if (savedRows.has(variant.id)) continue
          const row = el("div")
          row.className = "knobs-saved"
          row.dataset.variant = variant.id
          row.append(
            el("span", variant.name ?? `Variant ${variant.id.slice(0, 8)}`),
            button("Load", () => controls.variants.load(variant.id)),
            button("Copy", () => {
              void copy(controls.code("ts", variant.values))
            }),
            button("Delete", () => {
              controls.variants.remove(variant.id)
              name.focus()
            }),
          )
          savedRows.set(variant.id, row)
          saved.append(row)
        }
      })
    }
    wakeGpu()
  }

  // Hint mode: press `s`, type the start of any control's name, jump straight to it.
  type HintTarget = { key: string; display: string; el: HTMLElement; activate(): void }
  const hintLayer = el("div")
  hintLayer.className = "knobs-hint-layer"
  hintLayer.setAttribute("aria-hidden", "true")
  const visible = (node: HTMLElement) =>
    node.isConnected && !node.closest("[hidden]") && node.getClientRects().length > 0
  const hintTargets = (): HintTarget[] => {
    const targets: HintTarget[] = []
    const add = (el: HTMLElement, label: string, activate: () => void) => {
      if (!label || !visible(el) || (el as HTMLButtonElement).disabled) return
      targets.push({ key: label, display: label, el, activate })
    }
    for (const r of rows) add(r.row, r.display, () => r.input.focus())
    presetStrip.getEntries().forEach((entry, i) => {
      const chip = presetStrip.getButtons()[i]
      if (chip)
        add(chip, entry.label, () => {
          presetStrip.selectById(entry.id)
          presetStrip.element.focus({ preventScroll: true })
        })
    })
    // Header icons have their own keys (u, ⇧u, ?, Esc), so they stay out of the way here.
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      ".knobs-group-head button, .knobs-actions button, .knobs-custom-actions button, .knobs-variants-drawer button",
    )
    for (const b of buttons)
      add(b, b.dataset.hint ?? b.getAttribute("aria-label") ?? b.textContent ?? "", () => b.focus())
    if (visible(name)) add(name, "Variant name", () => name.focus())
    return targets
  }
  let hintItems: HintTarget[] = []
  const hintOff = () => {
    hint = undefined
    root.classList.remove("knobs-hinting")
    for (const t of hintItems) t.el.classList.remove("knobs-hint-match", "knobs-hint-miss")
    hintItems = []
    hintLayer.replaceChildren()
    hintLayer.remove()
    wakeGpu()
  }
  let hint: { query: string } | undefined
  const hintPaint = () => {
    if (!hint) return
    const resolution = computeHintPrefixes(hintItems, hint.query)
    if (resolution.uniqueMatchIndex >= 0) {
      const target = hintItems[resolution.uniqueMatchIndex]!
      hintOff()
      target.activate()
      return
    }
    if (!hintLayer.isConnected) root.append(hintLayer)
    const rootRect = root.getBoundingClientRect()
    const badges: HTMLElement[] = []
    hintItems.forEach((t, i) => {
      const badge = resolution.badges[i]!
      t.el.classList.toggle("knobs-hint-match", badge.match)
      t.el.classList.toggle("knobs-hint-miss", !badge.match)
      if (!badge.match) return
      const rect = t.el.getBoundingClientRect()
      const tag = el("kbd")
      tag.className = "knobs-hint"
      const typedSpan = el("span", badge.typed)
      typedSpan.className = "knobs-hint-typed"
      const restSpan = el("span", badge.rest)
      restSpan.className = "knobs-hint-rest"
      tag.append(typedSpan, restSpan)
      // Rows: inline in the label gutter. Buttons and chips: tucked on the top-left corner so
      // their own text stays readable.
      const isRow = t.el.classList.contains("knobs-row") || t.el.classList.contains("knobs-slider")
      const inset = isRow
        ? parseFloat(getComputedStyle(root).getPropertyValue("--k-inset")) || 10
        : -3
      const y = isRow ? rect.height / 2 : 3
      tag.style.left = `${rect.left - rootRect.left - root.clientLeft + root.scrollLeft + inset}px`
      tag.style.top = `${rect.top - rootRect.top - root.clientTop + root.scrollTop + y}px`
      badges.push(tag)
    })
    hintLayer.replaceChildren(...badges)
    wakeGpu()
  }

  // Vertical navigation stops: preset strip → rows → action bar.
  const actionBarButtons = () =>
    [
      ...root.querySelectorAll<HTMLButtonElement>(
        ".knobs-actions button, .knobs-custom-actions button",
      ),
    ].filter((b) => visible(b) && !b.disabled)
  let lastActionButton: HTMLButtonElement | undefined
  const stops = (): { contains(node: Node): boolean; focus(): void }[] => {
    const list: { contains(node: Node): boolean; focus(): void }[] = []
    if (visible(presetStrip.element))
      list.push({
        contains: (n) => presetStrip.element.contains(n),
        focus: () => presetStrip.element.focus(),
      })
    for (const r of rows)
      list.push({ contains: (n) => r.row.contains(n), focus: () => r.input.focus() })
    list.push({
      contains: (n) => actionBarButtons().some((b) => b === n),
      focus: () => {
        const bar = actionBarButtons()
        ;(lastActionButton && bar.includes(lastActionButton) ? lastActionButton : bar[0])?.focus()
      },
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
    const target = event.target as HTMLElement
    const typing =
      target === name ||
      target === text ||
      (target instanceof HTMLInputElement && target.type === "number")
    if (hint) {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") hintOff()
      else if (event.key === "Backspace") {
        hint.query = hint.query.slice(0, -1)
        hintPaint()
      } else if (event.key === "Enter") {
        const resolution = computeHintPrefixes(hintItems, hint.query)
        const first = hintItems[resolution.matchIndices[0] ?? -1]
        hintOff()
        first?.activate()
      } else if (event.key.length === 1) {
        hint.query += event.key.toLowerCase()
        hintPaint()
      }
      return
    }
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
      hint = { query: "" }
      hintItems = hintTargets()
      root.classList.add("knobs-hinting")
      hintPaint()
      return
    }
    if (key === "r" || key === "R") {
      event.preventDefault()
      run(controls.randomize)
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

  // WebGPU overlay binding & live mode switching
  const gpuBinding: GpuPanelBinding = {
    id: controls.id,
    root,
    body,
    inline,
    header: titleText !== false ? header : null,
    titleEl,
    headerButtons,
    presetStrip,
    groups: gpuGroups,
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
    dispose() {
      hintOff()
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
