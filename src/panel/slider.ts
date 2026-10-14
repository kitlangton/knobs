import { createRollingNumber } from "@kitlangton/rolling-number"
import type { Knob as KnobField } from "../core/schema.js"
import {
  clamp,
  FILL,
  POP_MS,
  popScale,
  RELEASE,
  Roll,
  rollTarget,
  Spring,
  VelocityTracker,
} from "./motion.js"

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
  /** Spring driving handle visibility/scale [0..1] (the GPU renderer sets its target). */
  handleSpring: Spring
  /** Per-character springs for GPU rolling number digits. */
  /** Readout characters keyed by place from the right, so 99 → 100 keeps the 9s in place. */
  digitPlaces: DigitPlace[]
  /** Velocity tracker on normalized fill ratio for drag motion blur. */
  velocity: VelocityTracker
  /** Number of tick marks along the track. */
  tickCount: number
  /** Where the default value sits along the track [0..1]. */
  notchRatio: number
  /** Whether a drag is currently held on the default by the notch's magnet. */
  isMagnetized(): boolean
  /** Drag speed mapped to 0..1 for the fill's leading-edge glow (0 once the pointer rests). */
  speed(): number
  /** When the readout last popped (a click landing on a decile, or the default's magnet). */
  poppedAt: number
  /** Formatted numeric string without unit (e.g. "0.45" or "98"). */
  getDigitsText(): string
  /** Optional unit string (e.g. "px", "s"). */
  getUnitText(): string
  /** Whether pointer drag is currently active. */
  isDragging(): boolean
  /** Whether the inline number input is open. */
  isEditing(): boolean
  /** `delay` (ms) holds this row's motion for its turn in a preset cascade. */
  update(value: number, delay?: number): void
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
 * track itself. Dragging follows the pointer exactly (⌥ for 1/10 speed) and the default's notch
 * pulls it in from a few px away; a click snaps to the nearest step (or nearest 10% when there
 * are many steps) with a short spring-like ease. Horizontal scrolling nudges the value.
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
  const notch = el("i", "knobs-notch")
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
  track.append(marks, fill, notch, handle, label, value, number)
  root.append(track)
  // The fill fades under the readout (the zone follows its width as digits come and go), and
  // hover ticks stay clear of both the readout and the label.
  let trackWidth = 0
  const ro = new ResizeObserver(() => {
    trackWidth = track.offsetWidth
    if (value.offsetWidth) track.style.setProperty("--k-readout", `${value.offsetWidth}px`)
    track.style.setProperty("--k-label-end", `${label.offsetLeft + label.offsetWidth}px`)
  })
  ro.observe(value)
  ro.observe(track)

  const places = decimals(field.step)
  const fmtDigits = (v: number) => v.toFixed(places)
  const fmt = (v: number) => `${fmtDigits(v)}${field.unit ? ` ${field.unit}` : ""}`
  const roller = createRollingNumber(digits, {
    value: field.value,
    format: { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false },
    duration: 320,
    motionBlur: true,
  })
  // Roll durations are design tokens (ms) so the meta page can tune them; 0 while dragging snaps.
  let cachedRollAt = -Infinity
  let cachedStepRoll = 320
  let cachedDragRoll = 0
  const rollMs = (drag: boolean) => {
    const now = performance.now()
    if (now - cachedRollAt > 16) {
      cachedRollAt = now
      const cs = getComputedStyle(root)
      const sRaw = parseFloat(cs.getPropertyValue("--k-roll"))
      const dRaw = parseFloat(cs.getPropertyValue("--k-drag-roll"))
      cachedStepRoll = Number.isFinite(sRaw) ? Math.max(0, sRaw) : 320
      cachedDragRoll = Number.isFinite(dRaw) ? Math.max(0, dRaw) : 0
    }
    return drag ? cachedDragRoll : cachedStepRoll
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

  const notchRatio = ratioOf(field.value)
  notch.style.left = `clamp(1px, ${notchRatio * 100}%, calc(100% - 1px))`
  const fillSpring = new Spring(ratioOf(field.value), FILL.omega, FILL.zeta)
  const stretchSpring = new Spring(0, RELEASE.omega, RELEASE.zeta)
  const handleSpring = new Spring(0, 28, 0.88)
  const digitPlaces: DigitPlace[] = []
  const velocity = new VelocityTracker()
  let initialized = false

  // Mirrors @kitlangton/rolling-number: each place is a wheel that rolls through every face in
  // the value's direction (98 → 108 rolls the tens 9 → 0 forwards), new places rise in after a
  // short hold, cascading outward, and leaving places fade over ~65% of the duration.
  function syncDigits(text: string, trend: number, ms: number, delay: number) {
    const now = performance.now()
    const live = digitPlaces.filter((p) => !p.exiting).length
    const step = Math.min(ms * 0.045, (ms * 0.3) / Math.max(1, text.length - live))
    for (let j = 0; j < Math.max(text.length, digitPlaces.length); j++) {
      const ch = j < text.length ? text[text.length - 1 - j]! : undefined
      const place = digitPlaces[j]
      if (ch === undefined) {
        if (place && !place.exiting) {
          place.exiting = true
          place.presence.set(0, ms * 0.65, now, delay)
        }
        continue
      }
      const digit = ch >= "0" && ch <= "9" ? Number(ch) : Number.NaN
      if (!place) {
        const hold = ms > 0 ? delay + Math.max(0, j - live) * step : 0
        const presence = new Roll(ms > 0 && initialized ? 0 : 1)
        if (ms > 0 && initialized) presence.set(1, ms, now, hold)
        digitPlaces[j] = {
          ch,
          wheel: new Roll(Number.isNaN(digit) ? 0 : digit),
          presence,
          enterAt: now + hold,
          enterMs: ms > 0 && initialized ? ms : 0,
          exiting: false,
        }
        continue
      }
      if (place.exiting) {
        place.exiting = false
        place.presence.set(1, ms, now, delay)
      }
      const wasDigit = place.ch >= "0" && place.ch <= "9"
      if (!Number.isNaN(digit)) {
        if (!wasDigit || ms <= 0) place.wheel.snap(digit)
        else {
          const at = place.wheel.sample(now).position
          if (((Math.round(at) % 10) + 10) % 10 !== digit || !place.wheel.resting(now))
            place.wheel.set(rollTarget(at, digit, trend), ms, now, delay)
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
  let lastRollerLen = fmtDigits(field.value).length
  // Entering or leaving the notch's magnet eases the last few px instead of jumping.
  let settleUntil = 0
  const settling = () => dragging && performance.now() < settleUntil
  const paint = (v: number, animate: boolean) => {
    root.classList.toggle("knobs-animate", animate)
    root.classList.toggle("knobs-settle", settling())
    const p = pct(v)
    fill.style.setProperty("--k-fill", `${p}%`)
    handle.style.left = `${p}%`
    // Dodge the text when the handle would sit on top of it.
    handle.classList.toggle("knobs-dodge", p < 22 || p > 78)
  }
  let rollTimer: ReturnType<typeof setTimeout> | undefined
  const update = (v: number, delay = 0) => {
    const previous = current
    current = v
    const r = ratioOf(v)
    velocity.add(r, 0)
    const ms = !initialized ? 0 : rollMs(dragging)
    if (!initialized || (dragging && !settling())) fillSpring.snap(r)
    else fillSpring.set(r, delay)
    const digitsStr = fmtDigits(v)
    syncDigits(digitsStr, Math.sign(v - previous), ms, ms > 0 ? delay : 0)
    initialized = true
    // Random, presets and keys roll at --k-roll; drags snap unless --k-drag-roll is set.
    // Never take rolling-number's unanimated path: its finish() resets the reels, so the next
    // change would jump instead of rolling. A 1 ms roll is a snap that keeps it warm.
    // In GPU mode the canvas draws the readout, so the hidden DOM reel only needs immediate updates
    // when the character count changes (for readout width).
    const gpu = root.closest('[data-gpu-active="true"]') !== null
    const animateDom = ms > 0 && !gpu
    const roll = () => {
      lastRollerLen = digitsStr.length
      roller.update({
        value: v,
        animated: true,
        duration: animateDom ? ms : 1,
        motionBlur: animateDom,
      })
    }
    clearTimeout(rollTimer)
    if (!gpu || digitsStr.length !== lastRollerLen) {
      if (delay > 0 && animateDom) rollTimer = setTimeout(roll, delay)
      else roll()
    }
    track.setAttribute("aria-valuenow", String(v))
    track.setAttribute("aria-valuetext", fmt(v))
    if (number.hidden) paint(v, !dragging)
    onMotionWake?.()
  }

  const getTrackWidth = () => trackWidth || (trackWidth = track.offsetWidth)
  const span = field.max - field.min
  const valueAt = (clientX: number, rect = track.getBoundingClientRect()) => {
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return field.min + t * span
  }
  // Drag speed for the leading-edge glow: nothing below a slow drag, full bloom by a quick flick.
  // The DOM eases --k-speed with a transition; the GPU renderer eases speed() itself.
  let speedTimer: ReturnType<typeof setTimeout> | undefined
  const speed = () =>
    dragging ? clamp((Math.abs(velocity.velocity[0]) * getTrackWidth() - 150) / 1350, 0, 1) : 0
  const glow = (value: number) => {
    root.style.setProperty("--k-speed", value.toFixed(3))
    clearTimeout(speedTimer)
    if (value > 0) speedTimer = setTimeout(() => glow(0), 80)
  }
  // A click's pop waits for the rolling digits to land (about a third of the roll); the
  // magnet's pops at once, since drags don't roll.
  let poppedAt = -Infinity
  const pop = (delay = 0) => {
    if (doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    poppedAt = performance.now() + delay
    const frames = Array.from({ length: 13 }, (_, i) => ({ scale: popScale((i / 12) * POP_MS) }))
    value.animate(frames, { duration: POP_MS, delay })
    onMotionWake?.()
  }

  // Within MAGNET px of the default (at the pointer's current speed), the value sits on it.
  const MAGNET = 4
  const nearDefault = (v: number, factor = 1) => {
    const w = getTrackWidth()
    return w > 0 && Math.abs(v - field.value) <= (MAGNET / w) * span * factor
  }
  // Clicks snap: to the step when steps are few, otherwise magnetically to deciles. Landing on
  // the default or a decile pops the readout.
  const snap = (v: number) => {
    if (nearDefault(v)) {
      pop(rollMs(false) * 0.35)
      return field.value
    }
    if (steps <= 10) return quantize(v)
    const decile = Math.round(((v - field.min) / span) * 10) / 10
    const near = Math.abs((v - field.min) / span - decile) < 0.03125
    if (near) pop(rollMs(false) * 0.35)
    return quantize(near ? field.min + decile * span : v)
  }

  let dragging = false
  let dragRect: DOMRect | undefined
  let startX = 0
  let moved = false
  let fromValue = false
  let magnet = false
  // ⌥ switches to relative 1/10-speed dragging, re-anchored whenever ⌥ changes so nothing jumps.
  let relative = false
  let fine = false
  let anchorX = 0
  let anchorValue = 0
  let raw = 0

  track.onpointerdown = (event) => {
    const target = event.target as Node | null
    if (event.button !== 0 || (target && number.contains(target))) return
    event.preventDefault()
    fromValue = Boolean(target && value.contains(target))
    track.setPointerCapture(event.pointerId)
    dragRect = track.getBoundingClientRect()
    trackWidth = dragRect.width
    dragging = true
    moved = false
    startX = event.clientX
    fine = relative = event.altKey
    anchorX = startX
    anchorValue = raw = current
    velocity.reset()
    root.classList.add("knobs-active")
    track.focus({ preventScroll: true })
    onMotionWake?.()
  }
  const MAX_STRETCH = 8
  // `over` is how far (px) the pointer has pulled past an end: negative left, positive right.
  let prevStretch = 0
  const stretch = (over: number) => {
    const width = getTrackWidth()
    const dead = Math.max(0, Math.abs(over) - 24)
    const amount = MAX_STRETCH * Math.sqrt(Math.min(dead / 200, 1))
    const signed = over < 0 ? -amount : amount
    stretchSpring.snap(signed)
    if (signed === 0 && prevStretch === 0) return
    prevStretch = signed
    root.style.transform = amount
      ? `translateX(${over < 0 ? -amount : 0}px) scaleX(${1 + amount / width})`
      : ""
    root.style.transformOrigin = over < 0 ? "right" : "left"
    onMotionWake?.()
  }
  track.onpointermove = (event) => {
    if (!dragging) return
    if (!moved && !relative && Math.abs(event.clientX - startX) < 3) return
    if (event.altKey !== fine) {
      fine = event.altKey
      relative = true
      anchorX = event.clientX
      anchorValue = raw
    }
    const first = !moved
    moved = true
    const rect = dragRect ?? (dragRect = track.getBoundingClientRect())
    const factor = fine ? 0.1 : 1
    let over: number
    if (relative) {
      raw = anchorValue + ((event.clientX - anchorX) / rect.width) * span * factor
      const bound = Math.min(field.max, Math.max(field.min, raw))
      over = span > 0 ? ((raw - bound) / span) * (rect.width / factor) : 0
    } else {
      raw = valueAt(event.clientX, rect)
      over =
        event.clientX < rect.left
          ? event.clientX - rect.left
          : event.clientX > rect.right
            ? event.clientX - rect.right
            : 0
    }
    const held = nearDefault(raw, factor)
    if (held !== magnet) {
      magnet = held
      settleUntil = held ? performance.now() + 80 : 0
      root.classList.toggle("knobs-magnet", held)
      if (held) pop()
    }
    set(held ? field.value : quantize(raw), { coalesce: !first })
    glow(speed())
    stretch(over)
  }
  const release = (event: PointerEvent) => {
    if (!dragging) return
    const rect = dragRect
    dragging = false
    dragRect = undefined
    magnet = false
    prevStretch = 0
    glow(0)
    root.classList.remove("knobs-magnet", "knobs-settle")
    stretchSpring.set(0)
    root.classList.remove("knobs-active")
    root.classList.add("knobs-release")
    root.style.transform = ""
    root.addEventListener("transitionend", () => root.classList.remove("knobs-release"), {
      once: true,
    })
    if (!moved) {
      if (fromValue) edit()
      else set(snap(valueAt(event.clientX, rect)))
    }
    onMotionWake?.()
  }
  track.onpointerup = release
  track.onpointercancel = release

  // Horizontal scrolling (or ⇧ + wheel) nudges by steps; one gesture is one undo step.
  // Vertical scrolling is left alone so the page and panel still scroll.
  let wheelAt = 0
  let wheelRaw = 0
  let wheelValue = 0
  let wheelCommitted = false
  track.addEventListener(
    "wheel",
    (event) => {
      let dx = event.deltaX
      if (event.shiftKey && dx === 0) dx = event.deltaY
      else if (Math.abs(dx) <= Math.abs(event.deltaY)) return
      if (!dx || dragging || !number.hidden) return
      event.preventDefault()
      const now = performance.now()
      // A pause, or any other change (an undo, a key), starts a new gesture.
      if (now - wheelAt > 250 || current !== wheelValue) {
        wheelRaw = wheelValue = current
        wheelCommitted = false
      }
      wheelAt = now
      const px = dx * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1)
      wheelRaw = Math.min(
        field.max,
        Math.max(field.min, wheelRaw + (px / track.offsetWidth) * span * 0.5),
      )
      const next = quantize(wheelRaw)
      if (next === current) return
      set(next, { coalesce: wheelCommitted })
      wheelValue = next
      wheelCommitted = true
    },
    { passive: false },
  )

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
    notchRatio,
    isMagnetized: () => magnet,
    speed,
    get poppedAt() {
      return poppedAt
    },
    getDigitsText: () => fmtDigits(current),
    getUnitText: () => field.unit ?? "",
    isDragging: () => dragging,
    isEditing: () => !number.hidden,
    update,
    edit,
  }
}
