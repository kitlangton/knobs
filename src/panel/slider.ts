import { createRollingNumber } from "@kitlangton/rolling-number"
import type { Knob as KnobField } from "../core/schema.js"
import { Spring, VelocityTracker } from "./motion.js"

export interface Slider {
  element: HTMLElement
  /** The focusable, keyboard-driven surface. */
  track: HTMLElement
  /** The visible label element. */
  label: HTMLElement
  /** The value button element. */
  valueButton: HTMLButtonElement
  /** The inline number editor (hidden until the value is clicked). */
  number: HTMLInputElement
  /** Spring driving normalized fill ratio [0..1]. */
  fillSpring: Spring
  /** Spring driving rubber-band stretch in px (-MAX..+MAX). */
  stretchSpring: Spring
  /** Spring driving handle visibility/scale [0..1]. */
  handleSpring: Spring
  /** Per-character springs for GPU rolling number digits. */
  digitSprings: Spring[]
  /** Velocity tracker on normalized fill ratio for drag motion blur. */
  velocity: VelocityTracker
  /** Number of tick marks along the track. */
  tickCount: number
  /** Current numeric value. */
  getValue(): number
  /** Formatted numeric string without unit (e.g. "0.45" or "98"). */
  getDigitsText(): string
  /** Optional unit string (e.g. "px", "s"). */
  getUnitText(): string
  /** Whether pointer drag is currently active. */
  isDragging(): boolean
  /** Whether the inline number input is open. */
  isEditing(): boolean
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
  onMotionWake?: () => void,
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
  label.textContent = display
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
  const fmtDigits = (v: number) => v.toFixed(places)
  const fmt = (v: number) => `${fmtDigits(v)}${field.unit ? ` ${field.unit}` : ""}`
  const roller = createRollingNumber(digits, {
    value: field.value,
    format: { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false },
    duration: 420,
  })
  const ratioOf = (v: number) =>
    field.max === field.min
      ? 0
      : Math.min(1, Math.max(0, (v - field.min) / (field.max - field.min)))
  const pct = (v: number) => ratioOf(v) * 100
  const quantize = (v: number) =>
    Math.min(
      field.max,
      Math.max(field.min, field.min + Math.round((v - field.min) / field.step) * field.step),
    )

  const fillSpring = new Spring(ratioOf(field.value), 26, 0.84)
  const stretchSpring = new Spring(0, 32, 0.78)
  const handleSpring = new Spring(0, 28, 0.88)
  const digitSprings: Spring[] = []
  const velocity = new VelocityTracker()
  let initialized = false

  function syncDigitSprings(text: string, snap: boolean) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!
      const num = ch >= "0" && ch <= "9" ? Number(ch) : ch === "-" ? -1 : -2
      let sp = digitSprings[i]
      if (!sp) {
        sp = new Spring(num, 24, 0.86)
        digitSprings[i] = sp
      } else if (snap || num < 0 || sp.target < 0) {
        sp.snap(num)
      } else {
        sp.set(num)
      }
    }
    digitSprings.length = text.length
  }

  let current = field.value
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
    const r = ratioOf(v)
    velocity.add(r, 0)
    if (!initialized) {
      fillSpring.snap(r)
      syncDigitSprings(fmtDigits(v), true)
      initialized = true
    } else if (dragging) {
      fillSpring.snap(r)
      syncDigitSprings(fmtDigits(v), true)
    } else {
      fillSpring.set(r)
      syncDigitSprings(fmtDigits(v), false)
    }
    // Dragging tracks the pointer; everything else (Random, presets, keys) rolls.
    roller.update({ value: v, animated: !dragging })
    track.setAttribute("aria-valuenow", String(v))
    track.setAttribute("aria-valuetext", fmt(v))
    if (number.hidden) paint(v, !dragging)
    onMotionWake?.()
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
  let hovered = false
  let startX = 0
  let moved = false
  let fromValue = false

  const syncHandleTarget = () => {
    const focused = track.ownerDocument.activeElement === track
    handleSpring.set(dragging ? 1 : hovered || focused ? 0.65 : 0)
    onMotionWake?.()
  }
  root.addEventListener("pointerenter", () => {
    hovered = true
    syncHandleTarget()
  })
  root.addEventListener("pointerleave", () => {
    hovered = false
    syncHandleTarget()
  })
  track.addEventListener("focus", syncHandleTarget)
  track.addEventListener("blur", syncHandleTarget)

  track.onpointerdown = (event) => {
    const target = event.target as Node | null
    if (event.button !== 0 || (target && number.contains(target))) return
    event.preventDefault()
    fromValue = Boolean(target && value.contains(target))
    track.setPointerCapture(event.pointerId)
    dragging = true
    moved = false
    startX = event.clientX
    velocity.reset()
    root.classList.add("knobs-active")
    track.focus({ preventScroll: true })
    syncHandleTarget()
  }
  const MAX_STRETCH = 8
  const stretch = (clientX: number) => {
    const rect = track.getBoundingClientRect()
    const over =
      clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
    const dead = Math.max(0, over - 24)
    const amount = MAX_STRETCH * Math.sqrt(Math.min(dead / 200, 1))
    const signed = clientX < rect.left ? -amount : amount
    stretchSpring.snap(signed)
    root.style.transform = amount
      ? `translateX(${clientX < rect.left ? -amount : 0}px) scaleX(${1 + amount / rect.width})`
      : ""
    root.style.transformOrigin = clientX < rect.left ? "right" : "left"
    onMotionWake?.()
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
    stretchSpring.set(0)
    root.classList.remove("knobs-active")
    root.classList.add("knobs-release")
    root.style.transform = ""
    root.addEventListener("transitionend", () => root.classList.remove("knobs-release"), {
      once: true,
    })
    if (!moved) {
      if (fromValue) edit()
      else set(snap(valueAt(event.clientX)))
    }
    syncHandleTarget()
  }
  track.onpointerup = release
  track.onpointercancel = release

  const edit = () => {
    number.value = String(current)
    number.hidden = false
    value.hidden = true
    number.focus()
    number.select()
    onMotionWake?.()
  }
  const done = (commit: boolean) => {
    if (number.hidden) return
    const next = number.valueAsNumber
    number.hidden = true
    value.hidden = false
    if (commit && Number.isFinite(next)) set(quantize(next))
    paint(current, false)
    track.focus({ preventScroll: true })
    onMotionWake?.()
  }
  value.onclick = (event) => {
    // Pointer clicks are handled on release; this covers keyboard/AT activation.
    if (event.detail === 0) edit()
  }
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
    label,
    valueButton: value,
    number,
    fillSpring,
    stretchSpring,
    handleSpring,
    digitSprings,
    velocity,
    tickCount: count,
    getValue: () => current,
    getDigitsText: () => fmtDigits(current),
    getUnitText: () => field.unit ?? "",
    isDragging: () => dragging,
    isEditing: () => !number.hidden,
    update,
    edit,
  }
}
