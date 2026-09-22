import { equal, type Schema, type Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"
import { injectStyles } from "./styles.js"
import { positionPanel } from "./position.js"
import { createSlider } from "./slider.js"

export interface Panel {
  element: HTMLElement
  focus(): void
  dispose(): void
}
let layer = 2147480001
export function createPanel<S extends Schema>(
  controls: Controls<S>,
  anchor: HTMLElement,
  close: () => void,
): Panel {
  if (!controls.enabled) throw new Error("Controls are disabled.")
  const doc = anchor.ownerDocument
  injectStyles(doc)
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag)
    if (text) node.textContent = text
    return node
  }
  const root = el("aside")
  root.className = "knobs-panel"
  root.dataset.controls = controls.id
  root.setAttribute("role", "dialog")
  root.setAttribute("aria-label", `${controls.id} controls`)
  const status = el("p")
  status.className = "knobs-status"
  status.setAttribute("role", "status")
  const run = (action: () => void) => {
    try {
      action()
    } catch (cause) {
      status.textContent = cause instanceof Error ? cause.message : String(cause)
    }
  }
  const button = (label: string, action: () => void) => {
    const node = el("button", label)
    node.type = "button"
    node.onclick = () => run(action)
    return node
  }
  const header = el("header")
  const dismiss = button("×", close)
  dismiss.setAttribute("aria-label", `Close ${controls.id}`)
  header.append(el("strong", controls.id), dismiss)
  const picker = el("select")
  picker.className = "knobs-picker"
  picker.name = "preset"
  picker.setAttribute("aria-label", "Preset or variant")
  picker.onchange = () =>
    run(() => {
      if (picker.value.startsWith("p:")) controls.preset(picker.value.slice(2))
      else if (picker.value.startsWith("v:")) controls.variants.load(picker.value.slice(2))
    })
  const body = el("div")
  const rows = Object.entries(controls.schema).map(([key, field]) => {
    const set = (value: unknown, options?: { coalesce?: boolean }) =>
      controls.set({ [key]: value } as Partial<Values<S>>, options)
    if (field.kind === "knob") {
      const slider = createSlider(doc, key, field, set)
      slider.element.dataset.field = key
      if (field.shortcut) slider.track.setAttribute("aria-keyshortcuts", field.shortcut)
      body.append(slider.element)
      return {
        key,
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
    row.append(el("span", key))
    if (field.kind === "choice") {
      const seg = el("div")
      seg.className = "knobs-seg"
      seg.setAttribute("role", "radiogroup")
      seg.setAttribute("aria-label", key)
      const buttons = field.options.map((value) => {
        const b = el("button", value)
        b.type = "button"
        b.dataset.value = value
        b.setAttribute("role", "radio")
        b.onclick = () => run(() => set(value))
        seg.append(b)
        return b
      })
      seg.tabIndex = 0
      row.append(seg)
      body.append(row)
      return { key, field, row, input: seg, number: undefined, buttons, set }
    }
    const toggle = el("button")
    toggle.type = "button"
    toggle.className = "knobs-toggle"
    toggle.setAttribute("role", "switch")
    toggle.setAttribute("aria-label", key)
    toggle.append(el("i"))
    toggle.onclick = () => run(() => set(!controls.get()[key]))
    row.append(toggle)
    body.append(row)
    return { key, field, row, input: toggle, number: undefined, set }
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
  const apply = button("IMPORT JSON", () => {
    controls.variants.import(text.value)
    status.textContent = "Variants imported. Existing IDs kept."
    text.hidden = true
    apply.hidden = true
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
    button("SAVE", () => {
      controls.variants.save(name.value)
      name.value = ""
      status.textContent = "Variant saved."
    }),
    button("COPY", () => {
      void copy(controls.code())
    }),
  )
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
      text.focus()
    }),
  )
  root.append(
    header,
    picker,
    body,
    name,
    actions,
    history,
    saved,
    transfer,
    text,
    apply,
    status,
    el("small", "↑↓/jk rows · ←→/hl adjust · ⇧ ×10 · s jump · r rnd · u undo · ⇧u redo · esc"),
  )
  doc.body.append(root)
  let signature = ""
  function update() {
    if (!controls.enabled) {
      close()
      return
    }
    const values = controls.get()
    for (const row of rows) {
      const value = values[row.key]
      if ("slider" in row && row.slider) row.slider.update(Number(value))
      else if ("buttons" in row && row.buttons)
        for (const b of row.buttons)
          b.setAttribute("aria-checked", String(b.dataset.value === String(value)))
      else row.input.setAttribute("aria-checked", String(Boolean(value)))
    }
    undoButton.disabled = !controls.canUndo
    redoButton.disabled = !controls.canRedo
    if (controls.error) status.textContent = controls.error
    run(() => {
      const variants = controls.variants.list()
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
        const group = el("optgroup")
        group.label = "Saved variants"
        for (const variant of variants) {
          const option = el("option", variant.name ?? variant.id.slice(0, 8))
          option.value = `v:${variant.id}`
          group.append(option)
        }
        picker.replaceChildren(custom, presets, group)
      }
      const match = variants.find((v) => equal(v.values, values))
      const preset = controls.matchingPreset()
      picker.value = match ? `v:${match.id}` : preset === "custom" ? "custom" : `p:${preset}`
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
    })
  }
  // Hint mode (from @kitkit/dial): press `s`, type a label prefix, jump to the matching row.
  let hint: { query: string } | undefined
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
    const matches = rows.filter((r) => r.key.toLowerCase().startsWith(q))
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
      tag.textContent = r.key.slice(0, Math.max(1, q.length + 1))
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
        const first = rows.find((r) => r.key.toLowerCase().startsWith(hint!.query))
        first?.input.focus()
        hintOff()
      } else if (event.key.length === 1) {
        hint.query += event.key.toLowerCase()
        hintPaint()
      }
      return
    }
    if (event.key === "Escape") {
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
      const row = rows.find(
        (r) =>
          r.field.kind === "knob" && r.field.shortcut?.toLowerCase() === event.key.toLowerCase(),
      )
      if (row) {
        event.preventDefault()
        row.input.focus()
      }
    }
  }
  const raise = () => {
    root.style.zIndex = String(++layer)
  }
  root.onpointerdown = raise
  root.addEventListener("focusin", raise)
  const unsubscribe = controls.subscribe(update)
  update()
  const unposition = positionPanel(root, header, anchor, controls.id, () => controls.storage)
  return {
    element: root,
    focus() {
      raise()
      ;(rows[0]?.input ?? dismiss).focus({ preventScroll: true })
    },
    dispose() {
      hintOff()
      unsubscribe()
      unposition()
      root.remove()
    },
  }
}
