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
import { OVERSHOOT, onPan } from "./swipe.js"

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
 * are many steps) with a short spring-like ease. A sideways trackpad pan moves it like a drag.
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
  const ratioOf = (v: number) =>
    field.max === field.min
      ? 0
      : Math.min(1, Math.max(0, (v - field.min) / (field.max - field.min)))
  const notchRatio = ratioOf(field.value)
  const marks = el("div", "knobs-marks")
  const steps = (field.max - field.min) / field.step
  const count = steps <= 10 ? Math.round(steps) + 1 : 11
  for (let i = 0; i < count; i++) {
    const r = i / (count - 1)
    if (Math.abs(r - notchRatio) < 0.025) continue
    const mark = el("i")
    mark.style.left = `${r * 100}%`
    marks.append(mark)
  }
  const notch = el("i", "knobs-notch")
  notch.style.left = `clamp(1px, ${notchRatio * 100}%, calc(100% - 1px))`
  marks.append(notch)
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
  track.append(fill, marks, handle, label, value, number)
  root.append(track)
  // Hover ticks and the default notch stay clear of both the readout and the label.
  let trackWidth = 0
  const ro = new ResizeObserver(() => {
    trackWidth = track.offsetWidth
    if (value.offsetWidth) track.style.setProperty("--k-readout", `${value.offsetWidth}px`)
    track.style.setProperty("--k-label-end", `${label.offsetLeft + label.offsetWidth}px`)
  })
  ro.observe(value)
  ro.observe(track)
  ro.observe(label)

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
  const pct = (v: number) => ratioOf(v) * 100
  const quantize = (v: number) =>
    Math.min(
      field.max,
      Math.max(field.min, field.min + Math.round((v - field.min) / field.step) * field.step),
    )

  const fillSpring = new Spring(notchRatio, FILL.omega, FILL.zeta)
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
  let rollerDirty = false
  // Entering or leaving the notch's magnet eases the last few px instead of jumping.
  let settleUntil = 0
  const settling = () => inHand() && performance.now() < settleUntil
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
  const slotX = (slot: HTMLElement) =>
    parseFloat(/translateX\(([-\d.]+)px\)/.exec(slot.style.transform)?.[1] ?? "0")
  const fastPatchDigits = (text: string): boolean => {
    // Slots are placed by transform, not DOM order: a place added mid-drag (99 → 100) is last.
    const slots = [...digits.querySelectorAll<HTMLElement>(".rn-slot")].sort(
      (a, b) => slotX(a) - slotX(b),
    )
    if (slots.length !== text.length) return false
    for (let i = 0; i < slots.length; i++) {
      const faces = slots[i]!.querySelectorAll<HTMLElement>(".rn-face")
      if (faces.length !== 1) return false
      faces[0]!.textContent = text[i]!
    }
    const sem = digits.querySelector<HTMLElement>(".rn-value")
    if (sem) sem.textContent = text
    return true
  }
  const update = (v: number, delay = 0) => {
    const previous = current
    current = v
    const r = ratioOf(v)
    velocity.add(r, 0)
    const ms = !initialized ? 0 : rollMs(inHand())
    if (!initialized || (inHand() && !settling())) fillSpring.snap(r)
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
      rollerDirty = false
      lastRollerLen = digitsStr.length
      roller.update({
        value: v,
        animated: true,
        duration: animateDom ? ms : 1,
        motionBlur: animateDom,
      })
    }
    clearTimeout(rollTimer)
    if (gpu && digitsStr.length === lastRollerLen) {
      rollerDirty = true
    } else if (
      inHand() &&
      !animateDom &&
      digitsStr.length === lastRollerLen &&
      fastPatchDigits(digitsStr)
    ) {
      rollerDirty = true
    } else if (delay > 0 && animateDom) {
      rollTimer = setTimeout(roll, delay)
    } else {
      roll()
    }
    track.setAttribute("aria-valuenow", String(v))
    track.setAttribute("aria-valuetext", fmt(v))
    if (number.hidden) paint(v, !inHand())
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
    inHand() ? clamp((Math.abs(velocity.velocity[0]) * getTrackWidth() - 150) / 1350, 0, 1) : 0
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
  // A trackpad pan holds the slider like a drag does.
  let panning = false
  const inHand = () => dragging || panning
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
    set(magnetize(raw, factor) ? field.value : quantize(raw), { coalesce: !first })
    glow(speed())
    stretch(over)
  }
  /** Whether `raw` is close enough to the default for its magnet to hold it there. */
  const magnetize = (raw: number, factor = 1) => {
    const held = nearDefault(raw, factor)
    if (held !== magnet) {
      magnet = held
      settleUntil = held ? performance.now() + 80 : 0
      root.classList.toggle("knobs-magnet", held)
      if (held) pop()
    }
    return held
  }
  /** The end of a drag or pan: the rubber band springs back. */
  const letGo = () => {
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
  }
  const settleDigits = () => {
    if (rollerDirty && root.closest('[data-gpu-active="true"]') === null) {
      rollerDirty = false
      roller.update({ value: current, animated: true, duration: 1, motionBlur: false })
    }
  }
  const release = (event: PointerEvent) => {
    if (!dragging) return
    const rect = dragRect
    dragging = false
    dragRect = undefined
    letGo()
    if (!moved) {
      if (fromValue) edit()
      else set(snap(valueAt(event.clientX, rect)))
    } else settleDigits()
    onMotionWake?.()
  }
  track.onpointerup = release
  track.onpointercancel = release

  // A sideways trackpad pan is a drag by other means: the value follows the fingers 1:1 at the
  // fill's scale from the first event, stretches at the ends, and lands as one undo step; the
  // momentum after the fingers lift is ignored. A wheel notch (or ⇧ + wheel) steps once.
  // Vertical scrolling is left alone so the page and panel still scroll.
  let panRaw = 0
  let panValue = 0
  let panCommitted = false
  /** Between a pan's first move and its end (`panning` lets go a little sooner, at the lift). */
  let panGesture = false
  const panLift = () => {
    if (!panning) return
    panning = false
    letGo()
    settleDigits()
    onMotionWake?.()
  }
  onPan(track, {
    accept: () => !dragging && number.hidden,
    move(dx) {
      const width = getTrackWidth()
      if (!width || span <= 0) return
      if (!panning) {
        panning = true
        velocity.reset()
        root.classList.add("knobs-active")
      }
      // A new gesture, or any other change (an undo, a key), anchors the pan as a new undo step.
      if (!panGesture || current !== panValue) {
        panGesture = true
        panRaw = panValue = current
        panCommitted = false
      }
      const reach = (OVERSHOOT / width) * span
      panRaw = clamp(panRaw + (dx / width) * span, field.min - reach, field.max + reach)
      const next = magnetize(panRaw) ? field.value : quantize(panRaw)
      if (next !== current) {
        set(next, { coalesce: panCommitted })
        panCommitted = true
      }
      panValue = current
      glow(speed())
      stretch(((panRaw - clamp(panRaw, field.min, field.max)) / span) * width)
    },
    lift: panLift,
    end() {
      panLift()
      panGesture = false
    },
    step(direction) {
      const next = quantize(current + direction * field.step)
      if (next !== current) set(next)
    },
  })

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
    isDragging: inHand,
    isEditing: () => !number.hidden,
    update,
    edit,
  }
}
