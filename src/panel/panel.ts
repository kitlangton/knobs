import { equal, type Schema, type Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"
import { injectStyles } from "./styles.js"
import { positionPanel } from "./position.js"

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
    const row = el("div")
    row.className = "knobs-row"
    row.dataset.field = key
    row.append(
      el("span", field.kind === "knob" && field.shortcut ? `${key} [${field.shortcut}]` : key),
    )
    const set = (value: unknown) => controls.set({ [key]: value } as Partial<Values<S>>)
    const input = field.kind === "choice" ? el("select") : el("input")
    input.setAttribute("aria-label", key)
    input.name = key
    let number: HTMLInputElement | undefined
    if (field.kind === "knob" && input instanceof HTMLInputElement) {
      number = el("input")
      number.type = "number"
      number.name = `${key}-value`
      number.setAttribute("aria-label", `${key} value`)
      input.type = "range"
      for (const node of [input, number]) {
        node.min = String(field.min)
        node.max = String(field.max)
        node.step = String(field.step)
      }
      input.oninput = () => set(input.valueAsNumber)
      number.onchange = () => {
        set(number!.valueAsNumber)
        number!.value = String(controls.get()[key])
      }
      number.onkeydown = (event) => {
        if (event.key === "Enter") {
          set(number!.valueAsNumber)
          input.focus()
          event.preventDefault()
        }
      }
      if (field.shortcut) input.setAttribute("aria-keyshortcuts", field.shortcut)
      row.append(number, el("span", field.unit ?? ""))
    } else if (field.kind === "choice" && input instanceof HTMLSelectElement) {
      for (const value of field.options) {
        const option = el("option", value)
        option.value = value
        input.append(option)
      }
      input.onchange = () => set(input.value)
    } else if (input instanceof HTMLInputElement) {
      input.type = "checkbox"
      input.onchange = () => set(input.checked)
    }
    row.append(input)
    body.append(row)
    return { key, field, row, input, number, set }
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
    saved,
    transfer,
    text,
    apply,
    status,
    el("small", "↑↓ rows · ←→ adjust · Shift ×10 · Esc close"),
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
      if (row.input instanceof HTMLInputElement && row.field.kind === "toggle")
        row.input.checked = Boolean(values[row.key])
      else row.input.value = String(values[row.key])
      if (row.number && doc.activeElement !== row.number) row.number.value = String(values[row.key])
    }
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
  root.onkeydown = (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    const target = event.target as HTMLElement
    if (target === name || target === text || target === picker) return
    const index = rows.findIndex((r) => r.row.contains(target))
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      event.stopPropagation()
      rows[(index + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length]?.input.focus()
    } else if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      index >= 0 &&
      target !== rows[index].number
    ) {
      event.preventDefault()
      event.stopPropagation()
      const row = rows[index],
        field = row.field,
        value = controls.get()[row.key]
      const direction = event.key === "ArrowRight" ? 1 : -1
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
      rows[index].number &&
      /^[0-9.\-]$/.test(event.key)
    ) {
      event.preventDefault()
      const number = rows[index].number!
      number.focus()
      number.value = event.key
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
      unsubscribe()
      unposition()
      root.remove()
    },
  }
}
