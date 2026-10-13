import { createRollingNumber } from "@kitlangton/rolling-number"
import type { Knob as KnobField } from "../core/schema.js"

export interface Slider {
  element: HTMLElement
  /** The focusable, keyboard-driven surface. */
  track: HTMLElement
  /** The inline number editor (hidden until the value is clicked). */
  number: HTMLInputElement
  update(value: number): void
  /** Open the inline editor (used when a digit is typed on the track). */
  edit(): void
}

const decimals = (step: number) => {
  const text = String(step)
  const i = text.indexOf(".")
  return i < 0 ? 0 : text.length - i - 1
}

/**
 * A DialKit-style slider: the whole row is the track, the fill is a full-height block,
 * the handle is a hairline that only shows on hover, and the label + value sit on the
 * track itself. Dragging follows the pointer exactly; a click snaps to the nearest step
 * (or nearest 10% when there are many steps) with a short spring-like ease.
 */
export function createSlider(
  doc: Document,
  key: string,
  field: KnobField,
  set: (value: number, options?: { coalesce?: boolean }) => void,
): Slider {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
    const node = doc.createElement(tag)
    if (cls) node.className = cls
    return node
  }
  const display = field.label ?? key
  const root = el("div", "knobs-slider")
  const track = el("div", "knobs-track")
  track.tabIndex = 0
  track.setAttribute("role", "slider")
  track.setAttribute("aria-label", display)
  track.setAttribute("aria-valuemin", String(field.min))
  track.setAttribute("aria-valuemax", String(field.max))
  const marks = el("div", "knobs-marks")
  const steps = (field.max - field.min) / field.step
  const count = steps <= 10 ? Math.round(steps) + 1 : 11
  for (let i = 0; i < count; i++) {
    const mark = el("i")
    mark.style.left = `${(i / (count - 1)) * 100}%`
    marks.append(mark)
  }
  const fill = el("div", "knobs-fill")
  const handle = el("div", "knobs-handle")
  const label = el("span", "knobs-label")
  label.textContent = field.shortcut ? `${display} · ${field.shortcut}` : display
  const value = el("button", "knobs-value")
  value.type = "button"
  value.tabIndex = -1
  value.setAttribute("aria-label", `Edit ${display}`)
  const digits = el("span", "knobs-digits")
  value.append(digits)
  if (field.unit) {
    const unit = el("span", "knobs-unit")
    unit.textContent = field.unit
    value.append(unit)
  }
  const number = el("input", "knobs-number")
  number.type = "number"
  number.name = `${key}-value`
  number.min = String(field.min)
  number.max = String(field.max)
  number.step = String(field.step)
  number.hidden = true
  number.setAttribute("aria-label", `${display} value`)
  track.append(marks, fill, handle, label, value, number)
  root.append(track)

  const places = decimals(field.step)
  const fmt = (v: number) => `${v.toFixed(places)}${field.unit ? ` ${field.unit}` : ""}`
  const roller = createRollingNumber(digits, {
    value: field.value,
    format: { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false },
    duration: 420,
  })
  const pct = (v: number) => ((v - field.min) / (field.max - field.min)) * 100
  const quantize = (v: number) =>
    Math.min(
      field.max,
      Math.max(field.min, field.min + Math.round((v - field.min) / field.step) * field.step),
    )

  let current = field.min
  const paint = (v: number, animate: boolean) => {
    root.classList.toggle("knobs-animate", animate)
    const p = pct(v)
    fill.style.width = `${p}%`
    handle.style.left = `${p}%`
    // Dodge the text when the handle would sit on top of it.
    handle.classList.toggle("knobs-dodge", p < 22 || p > 78)
  }
  const update = (v: number) => {
    current = v
    // Dragging tracks the pointer; everything else (RND, presets, keys) rolls.
    roller.update({ value: v, animated: !dragging })
    track.setAttribute("aria-valuenow", String(v))
    track.setAttribute("aria-valuetext", fmt(v))
    if (number.hidden) paint(v, !dragging)
  }

  const valueAt = (clientX: number) => {
    const rect = track.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return field.min + t * (field.max - field.min)
  }
  // Clicks snap: to the step when steps are few, otherwise magnetically to deciles.
  const snap = (v: number) => {
    if (steps <= 10) return quantize(v)
    const span = field.max - field.min
    const decile = Math.round(((v - field.min) / span) * 10) / 10
    const near = Math.abs((v - field.min) / span - decile) < 0.03125
    return quantize(near ? field.min + decile * span : v)
  }

  let dragging = false
  let startX = 0
  let moved = false
  track.onpointerdown = (event) => {
    const target = event.target as Node | null
    if (event.button !== 0 || (target && (value.contains(target) || number.contains(target))))
      return
    track.setPointerCapture(event.pointerId)
    dragging = true
    moved = false
    startX = event.clientX
    root.classList.add("knobs-active")
    track.focus({ preventScroll: true })
  }
  const MAX_STRETCH = 8
  const stretch = (clientX: number) => {
    const rect = track.getBoundingClientRect()
    const over =
      clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
    const dead = Math.max(0, over - 24)
    const amount = MAX_STRETCH * Math.sqrt(Math.min(dead / 200, 1))
    root.style.transform = amount
      ? `translateX(${clientX < rect.left ? -amount : 0}px) scaleX(${1 + amount / rect.width})`
      : ""
    root.style.transformOrigin = clientX < rect.left ? "right" : "left"
  }
  track.onpointermove = (event) => {
    if (!dragging) return
    if (!moved && Math.abs(event.clientX - startX) < 3) return
    const first = !moved
    moved = true
    set(quantize(valueAt(event.clientX)), { coalesce: !first })
    stretch(event.clientX)
  }
  const release = (event: PointerEvent) => {
    if (!dragging) return
    dragging = false
    root.classList.remove("knobs-active")
    root.classList.add("knobs-release")
    root.style.transform = ""
    root.addEventListener("transitionend", () => root.classList.remove("knobs-release"), {
      once: true,
    })
    if (!moved) set(snap(valueAt(event.clientX)))
  }
  track.onpointerup = release
  track.onpointercancel = release

  const edit = () => {
    number.value = String(current)
    number.hidden = false
    value.hidden = true
    number.focus()
    number.select()
  }
  const done = (commit: boolean) => {
    if (number.hidden) return
    const next = number.valueAsNumber
    number.hidden = true
    value.hidden = false
    if (commit && Number.isFinite(next)) set(quantize(next))
    paint(current, false)
    track.focus({ preventScroll: true })
  }
  value.onclick = edit
  number.onblur = () => done(true)
  number.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      done(true)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      done(false)
    }
  }
  track.onkeydown = (event) => {
    if (event.target !== track) return
    if (event.key === "Enter" && number.hidden) {
      event.preventDefault()
      edit()
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault()
      set(event.key === "Home" ? field.min : field.max)
    }
  }
  return {
    element: root,
    track,
    number,
    update,
    edit,
  }
}
