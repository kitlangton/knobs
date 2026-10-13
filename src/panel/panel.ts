import { equal, type Schema, type Values } from "../core/schema.js"
import type { ControlAction, Controls, MountPanelOptions } from "../core/store.js"
import { injectStyles } from "./styles.js"
import { positionPanel } from "./position.js"
import { createSlider } from "./slider.js"

export interface Panel {
  element: HTMLElement
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
          })
          .catch((cause) => {
            status.textContent = cause instanceof Error ? cause.message : String(cause)
          })
    } catch (cause) {
      status.textContent = cause instanceof Error ? cause.message : String(cause)
    }
  }
  const button = (label: string, action: () => unknown) => {
    const node = el("button", label)
    node.type = "button"
    node.onclick = () => run(action)
    return node
  }
  const header = el("header")
  let dismiss: HTMLButtonElement | undefined
  if (titleText !== false) {
    header.append(el("strong", titleText))
    if (close) {
      dismiss = button("×", close)
      dismiss.setAttribute("aria-label", `Close ${controls.id}`)
      header.append(dismiss)
    }
  }
  const showVariants = options.variants !== false
  const showHistory = options.history !== false
  const showFooter = options.footer !== false

  const picker = el("select")
  picker.className = "knobs-picker"
  picker.name = "preset"
  picker.setAttribute("aria-label", "Preset or variant")
  picker.onchange = () =>
    run(() => {
      if (picker.value.startsWith("p:")) controls.preset(picker.value.slice(2))
      else if (picker.value.startsWith("v:")) controls.variants.load(picker.value.slice(2))
    })

  const allActions: readonly ControlAction<Values<S>>[] = [
    ...(controls.actions ?? []),
    ...((options.actions as readonly ControlAction<Values<S>>[]) ?? []),
  ]
  const body = el("div")
  let currentGroup: string | undefined
  const groupResetButtons = new Map<string, HTMLButtonElement>()
  const rows = Object.entries(controls.schema).map(([key, field]) => {
    if (field.group && field.group !== currentGroup) {
      currentGroup = field.group
      const groupName = currentGroup
      const gHead = el("div")
      gHead.className = "knobs-group-head"
      gHead.dataset.group = groupName
      gHead.append(el("span", groupName))
      const gRight = el("span")
      for (const act of allActions.filter((a) => a.group === groupName)) {
        gRight.append(button(act.label, () => act.run(controls.get(), controls)))
      }
      const gReset = button("RESET", () => controls.resetGroup(groupName))
      gReset.setAttribute("aria-label", `Reset ${groupName}`)
      groupResetButtons.set(groupName, gReset)
      gRight.append(gReset)
      gHead.append(gRight)
      body.append(gHead)
    }
    const display = field.label ?? key
    const set = (value: unknown, setOpts?: { coalesce?: boolean }) =>
      controls.set({ [key]: value } as Partial<Values<S>>, setOpts)
    if (field.kind === "knob") {
      const slider = createSlider(doc, key, field, set)
      slider.element.dataset.field = key
      if (field.shortcut) slider.track.setAttribute("aria-keyshortcuts", field.shortcut)
      slider.element.ondblclick = (event) => {
        if ((event.target as HTMLElement).closest(".knobs-value,.knobs-number")) return
        run(() => controls.resetKey(key))
      }
      body.append(slider.element)
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
    const rowLabel = el("span", field.shortcut ? `${display} · ${field.shortcut}` : display)
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
    return { key, display, field, row, input: toggle, number: undefined, set }
  })

  const name = el("input")
  name.className = "knobs-name"
  name.name = "variant-name"
  name.placeholder = "Variant name (optional)"
  name.maxLength = 100
  name.setAttribute("aria-label", "Variant name")
  const text = el("textarea")
  text.hidden = true
  text.name = "variant-json"
  text.spellcheck = false
  text.setAttribute("aria-label", "Import or copy text")
  let positioned: { constrain(): void; dispose(): void } | undefined
  const apply = button("IMPORT JSON", () => {
    controls.variants.import(text.value)
    status.textContent = "Variants imported. Existing IDs kept."
    text.hidden = true
    apply.hidden = true
    positioned?.constrain()
  })
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
  }
  const actions = el("div")
  actions.className = "knobs-actions"
  const undoButton = button("UNDO", controls.undo)
  const redoButton = button("REDO", controls.redo)
  undoButton.setAttribute("aria-keyshortcuts", "u")
  redoButton.setAttribute("aria-keyshortcuts", "Shift+u")
  const history = el("div")
  history.className = "knobs-actions"
  history.append(undoButton, redoButton)
  actions.append(
    button("RND", controls.randomize),
    button("RESET", controls.reset),
    ...(showVariants
      ? [
          button("SAVE", () => {
            controls.variants.save(name.value)
            name.value = ""
            status.textContent = "Variant saved."
          }),
        ]
      : []),
    button("COPY", () => {
      void copy(controls.code())
    }),
  )
  const panelActions = allActions.filter((a) => !a.group)
  const customActions = el("div")
  customActions.className = "knobs-custom-actions"
  for (const act of panelActions) {
    const b = button(act.label, () => act.run(controls.get(), controls))
    if (act.shortcut) b.setAttribute("aria-keyshortcuts", act.shortcut)
    customActions.append(b)
  }

  const saved = el("div")
  const savedRows = new Map<string, HTMLElement>()
  const transfer = el("div")
  transfer.className = "knobs-actions"
  transfer.append(
    button("EXPORT", () => {
      void copy(controls.variants.export())
    }),
    button("IMPORT", () => {
      text.hidden = false
      apply.hidden = false
      text.value = ""
      positioned?.constrain()
      text.focus()
    }),
  )
  if (titleText !== false) root.append(header)
  if (showVariants || Object.keys(controls.presets).length > 1) root.append(picker)
  root.append(body)
  if (showVariants) root.append(name)
  root.append(actions)
  if (panelActions.length > 0) root.append(customActions)
  if (showHistory) root.append(history)
  if (showVariants) root.append(saved, transfer)
  root.append(text, apply, status)
  if (showFooter) {
    root.append(
      el(
        "small",
        `↑↓/jk rows · ←→/hl adjust · ⇧ ×10 · s jump · r rnd · u undo · ⇧u redo${close ? " · esc" : ""}`,
      ),
    )
  }

  let signature = ""
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
    run(() => {
      const variants = showVariants ? controls.variants.list() : []
      const nextSignature = JSON.stringify(variants.map((v) => [v.id, v.name]))
      if (signature !== nextSignature || !picker.options.length) {
        signature = nextSignature
        const custom = el("option", "custom")
        custom.value = "custom"
        custom.disabled = true
        const presets = el("optgroup")
        presets.label = "Presets"
        for (const id of Object.keys(controls.presets)) {
          const option = el("option", id)
          option.value = `p:${id}`
          presets.append(option)
        }
        if (showVariants) {
          const group = el("optgroup")
          group.label = "Saved variants"
          for (const variant of variants) {
            const option = el("option", variant.name ?? variant.id.slice(0, 8))
            option.value = `v:${variant.id}`
            group.append(option)
          }
          picker.replaceChildren(custom, presets, group)
        } else {
          picker.replaceChildren(custom, presets)
        }
      }
      const match = variants.find((v) => equal(v.values, values))
      const preset = controls.matchingPreset()
      picker.value = match ? `v:${match.id}` : preset === "custom" ? "custom" : `p:${preset}`
      if (showVariants) {
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
            button("LOAD", () => controls.variants.load(variant.id)),
            button("COPY", () => {
              void copy(controls.code("ts", variant.values))
            }),
            button("DELETE", () => {
              controls.variants.remove(variant.id)
              name.focus()
            }),
          )
          savedRows.set(variant.id, row)
          saved.append(row)
        }
      }
    })
  }
  // Hint mode (from @kitkit/dial): press `s`, type a label prefix, jump to the matching row.
  let hint: { query: string } | undefined
  const matchesHint = (r: (typeof rows)[number], q: string) =>
    r.key.toLowerCase().startsWith(q) || r.display.toLowerCase().startsWith(q)
  const hintOff = () => {
    hint = undefined
    root.classList.remove("knobs-hinting")
    for (const r of rows) {
      r.row.classList.remove("knobs-hint-match", "knobs-hint-miss")
      r.row.querySelector(".knobs-hint")?.remove()
    }
  }
  const hintPaint = () => {
    if (!hint) return
    const q = hint.query
    const matches = rows.filter((r) => matchesHint(r, q))
    for (const r of rows) {
      const match = matches.includes(r)
      r.row.classList.toggle("knobs-hint-match", match)
      r.row.classList.toggle("knobs-hint-miss", !match)
      let tag = r.row.querySelector<HTMLElement>(".knobs-hint")
      if (!tag) {
        tag = el("kbd", "")
        tag.className = "knobs-hint"
        r.row.append(tag)
      }
      const source = r.display.toLowerCase().startsWith(q) ? r.display : r.key
      tag.textContent = source.slice(0, Math.max(1, q.length + 1))
      tag.hidden = !match
    }
    if (matches.length === 1 && q.length > 0) {
      matches[0].input.focus()
      hintOff()
    }
  }
  root.onkeydown = (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement
    const typing =
      target === name ||
      target === text ||
      target === picker ||
      (target instanceof HTMLInputElement && target.type === "number")
    if (hint) {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") hintOff()
      else if (event.key === "Backspace") {
        hint.query = hint.query.slice(0, -1)
        hintPaint()
      } else if (event.key === "Enter") {
        const first = rows.find((r) => matchesHint(r, hint!.query))
        first?.input.focus()
        hintOff()
      } else if (event.key.length === 1) {
        hint.query += event.key.toLowerCase()
        hintPaint()
      }
      return
    }
    if (event.key === "Escape" && close) {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (typing) return
    const key = event.key
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
    if (up || down) {
      event.preventDefault()
      event.stopPropagation()
      rows[(index + (down ? 1 : rows.length - 1)) % rows.length]?.input.focus()
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
    } else if (!(target instanceof HTMLInputElement && target.type === "number")) {
      const row = rows.find((r) => r.field.shortcut?.toLowerCase() === event.key.toLowerCase())
      if (row) {
        event.preventDefault()
        row.input.focus()
      }
    }
  }
  const raise = () => {
    if (!inline) root.style.zIndex = String(++layer)
  }
  root.onpointerdown = raise
  root.addEventListener("focusin", raise)
  const unsubscribe = controls.subscribe(update)
  update()
  positioned =
    !inline && options.anchor
      ? positionPanel(root, header, options.anchor, controls.id, () => controls.storage)
      : undefined
  return {
    element: root,
    focus() {
      raise()
      ;(rows[0]?.input ?? dismiss ?? root).focus({ preventScroll: true })
    },
    dispose() {
      hintOff()
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
