import { createRollingNumber } from "@kitlangton/rolling-number"
import type { Knob as KnobField } from "../core/schema.js"
import { Roll, rollTarget, Spring, VelocityTracker } from "./motion.js"

export interface DigitPlace {
  ch: string
  /** Unbounded wheel position for digits (… 9, 10, 11 …); face = position mod 10. */
  readonly wheel: Roll
  /** 1 while shown, 0 once gone: new places fade in and rise, leaving places fade out. */
  readonly presence: Roll
  /** When this place started entering, and how long the entrance lasts (ms). */
  enterAt: number
  enterMs: number
  exiting: boolean
}

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
  /** Readout characters keyed by place from the right, so 99 → 100 keeps the 9s in place. */
  digitPlaces: DigitPlace[]
  /** Velocity tracker on normalized fill ratio for drag motion blur. */
  velocity: VelocityTracker
  /** Number of tick marks along the track. */
  tickCount: number
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
    motionBlur: true,
  })
  // Roll durations are design tokens (ms) so the meta page can tune them; 0 while dragging snaps.
  const rollMs = (drag: boolean) => {
    const raw = parseFloat(
      getComputedStyle(root).getPropertyValue(drag ? "--k-drag-roll" : "--k-roll"),
    )
    return Number.isFinite(raw) ? Math.max(0, raw) : drag ? 0 : 420
  }
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
  const digitPlaces: DigitPlace[] = []
  const velocity = new VelocityTracker()
  let initialized = false

  // Mirrors @kitlangton/rolling-number: each place is a wheel that rolls through every face in
  // the value's direction (98 → 108 rolls the tens 9 → 0 forwards), new places rise in after a
  // short hold, cascading outward, and leaving places fade over ~65% of the duration.
  function syncDigits(text: string, trend: number, ms: number) {
    const now = performance.now()
    const live = digitPlaces.filter((p) => !p.exiting).length
    const step = Math.min(ms * 0.045, (ms * 0.3) / Math.max(1, text.length - live))
    for (let j = 0; j < Math.max(text.length, digitPlaces.length); j++) {
      const ch = j < text.length ? text[text.length - 1 - j]! : undefined
      const place = digitPlaces[j]
      if (ch === undefined) {
        if (place && !place.exiting) {
          place.exiting = true
          place.presence.set(0, ms * 0.65, now)
        }
        continue
      }
      const digit = ch >= "0" && ch <= "9" ? Number(ch) : Number.NaN
      if (!place) {
        const delay = ms > 0 ? Math.max(0, j - live) * step : 0
        const presence = new Roll(ms > 0 && initialized ? 0 : 1)
        if (ms > 0 && initialized) presence.set(1, ms, now, delay)
        digitPlaces[j] = {
          ch,
          wheel: new Roll(Number.isNaN(digit) ? 0 : digit),
          presence,
          enterAt: now + delay,
          enterMs: ms > 0 && initialized ? ms : 0,
          exiting: false,
        }
        continue
      }
      if (place.exiting) {
        place.exiting = false
        place.presence.set(1, ms, now)
      }
      const wasDigit = place.ch >= "0" && place.ch <= "9"
      if (!Number.isNaN(digit)) {
        if (!wasDigit || ms <= 0) place.wheel.snap(digit)
        else {
          const at = place.wheel.sample(now).position
          if (((Math.round(at) % 10) + 10) % 10 !== digit || !place.wheel.resting(now))
            place.wheel.set(rollTarget(at, digit, trend), ms, now)
        }
      }
      place.ch = ch
    }
    while (
      digitPlaces.length > text.length &&
      digitPlaces.at(-1)!.exiting &&
      digitPlaces.at(-1)!.presence.resting(now)
    )
      digitPlaces.pop()
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
    const previous = current
    current = v
    const r = ratioOf(v)
    velocity.add(r, 0)
    const ms = !initialized ? 0 : rollMs(dragging)
    if (!initialized || dragging) fillSpring.snap(r)
    else fillSpring.set(r)
    syncDigits(fmtDigits(v), Math.sign(v - previous), ms)
    initialized = true
    // Random, presets and keys roll at --k-roll; drags snap unless --k-drag-roll is set.
    // Never take rolling-number's unanimated path: its finish() resets the reels, so the next
    // change would jump instead of rolling. A 1 ms roll is a snap that keeps it warm.
    // In GPU mode the canvas draws the readout, so the hidden DOM reel just snaps.
    const gpu = root.closest('[data-gpu-active="true"]') !== null
    roller.update({ value: v, animated: true, duration: ms > 0 && !gpu ? ms : 1 })
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
    const focused = track.matches(":focus-visible")
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
    digitPlaces,
    velocity,
    tickCount: count,
    getDigitsText: () => fmtDigits(current),
    getUnitText: () => field.unit ?? "",
    isDragging: () => dragging,
    isEditing: () => !number.hidden,
    update,
    edit,
  }
}
