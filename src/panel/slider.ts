import { createRollingNumber } from "@kitlangton/rolling-number"
import type { Knob as KnobField } from "../core/schema.js"
import { springMotion } from "../core/spring.js"
import {
  type DetentKind,
  detentScale,
  detentsOf,
  Notches,
  offRow,
  precisionRate,
  roundValues,
  rulerAlpha,
  rulerDepth,
  rulerLevels,
  unwarp,
} from "./feel.js"
import { tick } from "./haptics.js"
import { keyPrefs } from "./prefs.js"
import {
  clamp,
  FILL,
  POP_MS,
  popScale,
  type Roll,
  settleScale,
  Spring,
  VelocityTracker,
} from "./motion.js"
import { syncPlaces } from "./reel.js"
import { band, STRETCH, STRETCH_HOME_S, textGive, type Band } from "./give.js"
import { cue } from "./sound.js"
import { onPan } from "./swipe.js"

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
  /**
   * Spring driving the fill's edge [0..1]: the value, or while a stepped slider is in hand, the
   * value pulled part way toward the pointer (--k-step-resist).
   */
  fillSpring: Spring
  /** Spring driving handle visibility/scale [0..1] (the GPU renderer sets its target). */
  handleSpring: Spring
  /** Per-character springs for GPU rolling number digits. */
  /** Readout characters keyed by place from the right, so 99 → 100 keeps the 9s in place. */
  digitPlaces: DigitPlace[]
  /** Velocity tracker on normalized fill ratio for drag motion blur. */
  velocity: VelocityTracker
  /** Number of tick marks along the track. */
  readonly tickCount: number
  /** Where the default value sits along the track [0..1]. */
  readonly notchRatio: number
  /** Whether a drag is currently held on the default by the notch's magnet. */
  isMagnetized(): boolean
  /** The detent holding a drag right now, if any. */
  heldDetent(): DetentKind | undefined
  /** Where the active preset's value sits [0..1], when it differs from the default. */
  readonly baseRatio: number | undefined
  /** When the handle last caught a detent (see `settleScale`). */
  readonly settledAt: number
  /**
   * How many halvings the drag in hand moves at, for its ruler (0 at 1:1 or at rest, up to 3; each
   * level halves the tenths again). Each level shows `rulerAlpha(depth, level)` of the way.
   */
  rulerDepth(): number
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
  /**
   * `delay` (ms) holds this row's motion for its turn in a preset cascade; `instant` places the
   * value without springing or rolling (a different item arrived).
   */
  update(value: number, delay?: number, instant?: boolean): void
  /**
   * Reads its design tokens now. A batch (a preset) primes every row it will move before writing
   * any, so no row's read lands after another's writes and forces a style pass.
   */
  prime(): void
  /** Takes a new range, step, label or unit in place, keeping the DOM (see `RemoteControls.update`). */
  retune(field: KnobField): void
  /** The field it currently draws. */
  readonly field: KnobField
  /** Open the inline editor, with `initial` in place of the value (a digit typed on the track). */
  edit(initial?: string): void
  /** Puts a row accessory just after the label; the ticks and handle keep clear of it too. */
  slot(node: HTMLElement): void
  dispose(): void
}

export const decimals = (step: number) => {
  const text = String(step)
  const i = text.indexOf(".")
  return i < 0 ? 0 : text.length - i - 1
}

/**
 * `steps` grid steps from `value` (negative goes down), on the slider's grid counted from `min`.
 * From a value between grid points (a declared default like 0.4 on a 0.02 grid from 0.15) the
 * first step lands on the next grid point that way, not past it.
 */
export function stepValue(
  field: { min: number; max: number; step: number },
  value: number,
  steps: number,
) {
  const at = (value - field.min) / field.step
  const on = Math.abs(at - Math.round(at)) < 1e-6
  const target = on
    ? Math.round(at) + steps
    : steps > 0
      ? Math.ceil(at) + steps - 1
      : Math.floor(at) + steps + 1
  const v = field.min + target * field.step
  return Number(Math.min(field.max, Math.max(field.min, v)).toPrecision(14))
}

/**
 * A DialKit-style slider: the whole row is the track, the fill is a full-height block,
 * the handle is a hairline that only shows on hover, and the label + value sit on the
 * track itself. Dragging follows the pointer exactly, slower the further the pointer strays off
 * the row (and ⌥ for 1/10 speed); detents at the default, the active preset's value and round
 * values hold it for a few px, and past an end the fill gives like a rubber band. A click snaps
 * to the nearest step (or nearest 10% when there are many steps) with a short spring-like ease.
 * A sideways trackpad pan moves it like a drag.
 */
export function createSlider(
  doc: Document,
  key: string,
  initialField: KnobField,
  set: (value: number, options?: { coalesce?: boolean }) => void,
  onMotionWake?: () => void,
  options: {
    /** The active preset's value for this key (what Reset goes back to first). */
    readonly base?: () => number | undefined
  } = {},
): Slider {
  let field = initialField
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) => {
    const node = doc.createElement(tag)
    if (cls) node.className = cls
    return node
  }
  const root = el("div", "knobs-slider")
  const track = el("div", "knobs-track")
  track.tabIndex = 0
  track.setAttribute("role", "slider")
  const ratioOf = (v: number) =>
    field.max === field.min
      ? 0
      : Math.min(1, Math.max(0, (v - field.min) / (field.max - field.min)))
  let notchRatio = 0
  let steps = 0
  let count = 0
  let span = 0
  const marks = el("div", "knobs-marks")
  const notch = el("i", "knobs-notch")
  // The active preset's value: a notch hanging from the top edge, as the default's rises.
  const baseNotch = el("i", "knobs-notch knobs-base")
  baseNotch.style.display = "none"
  // A fine ruler near the handle while the drag slows (precision by distance), a level per halving.
  const ruler = el("b", "knobs-ruler")
  const rulerRows = [el("i"), el("i"), el("i")]
  ruler.append(...rulerRows)
  const fill = el("div", "knobs-fill")
  const handle = el("div", "knobs-handle")
  const label = el("span", "knobs-label")
  const value = el("button", "knobs-value")
  value.type = "button"
  value.tabIndex = -1
  // A pointer shortcut into the inline editor; the slider itself carries the value for assistive
  // tech (aria-valuetext), and typing a digit opens the same editor.
  value.setAttribute("aria-hidden", "true")
  const digits = el("span", "knobs-digits")
  value.append(digits)
  const unit = el("span", "knobs-unit")
  // The readout's own text, editable in place: same type, same right edge, the unit after it.
  const number = el("input", "knobs-number")
  number.type = "text"
  number.inputMode = "decimal"
  number.autocomplete = "off"
  number.spellcheck = false
  number.enterKeyHint = "done"
  number.name = `${key}-value`
  number.hidden = true
  /** Measures the typed text, so the field is as wide as it (and never narrower than the digits). */
  const fitter = el("span", "knobs-number-fit")
  fitter.setAttribute("aria-hidden", "true")
  let baseRatio: number | undefined
  /** Places the active preset's notch, or hides it while there's none (or it's the default). */
  const rebase = () => {
    const b = options.base?.()
    const next =
      b === undefined || !Number.isFinite(b) || b === field.value ? undefined : ratioOf(b)
    if (next === baseRatio) return
    baseRatio = next
    baseNotch.style.display = next === undefined ? "none" : ""
    if (next !== undefined) baseNotch.style.left = `clamp(1px, ${next * 100}%, calc(100% - 1px))`
    onMotionWake?.()
  }
  /** Lays out everything that follows from the field: marks, notch, labels and limits. */
  const shape = () => {
    const display = field.label ?? key
    track.setAttribute("aria-label", display)
    track.setAttribute("aria-valuemin", String(field.min))
    track.setAttribute("aria-valuemax", String(field.max))
    notchRatio = ratioOf(field.value)
    baseRatio = Number.NaN
    rebase()
    span = field.max - field.min
    steps = span / field.step
    count = steps <= 10 ? Math.round(steps) + 1 : 11
    const ticks: HTMLElement[] = []
    for (let i = 0; i < count; i++) {
      const r = i / (count - 1)
      const mark = el("i")
      mark.style.left = `${r * 100}%`
      ticks.push(mark)
    }
    notch.style.left = `clamp(1px, ${notchRatio * 100}%, calc(100% - 1px))`
    marks.replaceChildren(ruler, ...ticks, notch, baseNotch)
    if (label.textContent !== display) label.textContent = display
    unit.textContent = field.unit ?? ""
    if (field.unit) {
      if (!unit.isConnected) value.append(unit)
    } else unit.remove()
    number.setAttribute("aria-label", `${display} value`)
  }
  shape()
  // The handle rides a full-width layer translated by the fill (a transform, so it lands on the
  // fill's exact sub-pixel edge), inside a still layer that fades it where the text sits.
  const handleZone = el("div", "knobs-handle-zone")
  handleZone.append(handle)
  track.append(fill, marks, handleZone, label, value, number, fitter)
  root.append(track)
  // Hover ticks and the default notch stay clear of both the readout and the label.
  let trackWidth = 0
  let accessory: HTMLElement | undefined
  const ro = new ResizeObserver(() => {
    trackWidth = track.offsetWidth
    if (value.offsetWidth) track.style.setProperty("--k-readout", `${value.offsetWidth}px`)
    const right = label.offsetLeft + label.offsetWidth
    const extra = accessory?.offsetWidth ? accessory.offsetWidth + 4 : 0
    track.style.setProperty("--k-label-end", `${right + extra}px`)
    if (accessory) {
      track.style.setProperty("--k-label-right", `${right}px`)
      track.style.setProperty("--k-accessory-w", `${extra}px`)
    }
  })
  ro.observe(value)
  ro.observe(track)
  ro.observe(label)

  let places = field.decimals ?? decimals(field.step)
  const fmtDigits = (v: number) => v.toFixed(places)
  const fmt = (v: number) => `${fmtDigits(v)}${field.unit ? ` ${field.unit}` : ""}`
  const makeRoller = (at: number) =>
    createRollingNumber(digits, {
      value: at,
      format: { minimumFractionDigits: places, maximumFractionDigits: places, useGrouping: false },
      duration: 320,
      motionBlur: true,
    })
  let roller = makeRoller(field.value)
  // Roll durations (ms), the stepped drag's resistance, the edge blur and the spring are design
  // tokens, so the meta page can tune them. Read once per press while dragging: a style read per
  // pointer move would force a restyle.
  const tokens = {
    stepRoll: 320,
    dragRoll: 0,
    resist: 0.25,
    blur: 0,
    omega: FILL.omega,
    zeta: FILL.zeta,
  }
  let tokensAt = Number.NEGATIVE_INFINITY
  const readTokens = () => {
    const now = performance.now()
    if (now - tokensAt <= 16 || dragging) return tokens
    tokensAt = now
    const cs = getComputedStyle(root)
    const num = (name: string, fallback: number) => {
      const n = parseFloat(cs.getPropertyValue(name))
      return Number.isFinite(n) ? n : fallback
    }
    tokens.stepRoll = Math.max(0, num("--k-roll", 320))
    tokens.dragRoll = Math.max(0, num("--k-drag-roll", 0))
    tokens.resist = clamp(num("--k-step-resist", 0.25), 0, 1)
    tokens.blur = clamp(num("--k-motion-blur", 0), 0, 1)
    const [duration, bounce] = cs.getPropertyValue("--k-spring").trim().split(/\s+/).map(Number)
    if (Number.isFinite(duration) && Number.isFinite(bounce)) {
      const m = springMotion({ duration: duration!, bounce: bounce! })
      tokens.omega = m.omega
      tokens.zeta = m.zeta
    }
    return tokens
  }
  const rollMs = (drag: boolean) => (drag ? readTokens().dragRoll : readTokens().stepRoll)
  /** Few enough stops that a drag glides from one to the next instead of tracking the pointer. */
  const stepped = () => steps <= 10
  const quantize = (v: number) =>
    Math.min(
      field.max,
      Math.max(field.min, field.min + Math.round((v - field.min) / field.step) * field.step),
    )

  const fillSpring = new Spring(notchRatio, FILL.omega, FILL.zeta)
  const handleSpring = new Spring(0, 28, 0.88)
  const digitPlaces: DigitPlace[] = []
  const velocity = new VelocityTracker()
  let initialized = false

  // Mirrors @kitlangton/rolling-number (see syncPlaces).
  const syncDigits = (text: string, trend: number, ms: number, delay: number) =>
    syncPlaces(digitPlaces, text, trend, ms, delay, initialized)

  let current = field.value
  let lastRollerLen = fmtDigits(field.value).length
  let rollerDirty = false
  /** The reel was just made (showTyped), so its first roll waits a frame or two. */
  let freshRoller = false
  /** Where the fill's edge belongs: the value, pulled toward the pointer while a stepped drag holds it. */
  const aim = () => {
    const r = ratioOf(current)
    if (pulled === undefined || !stepped() || held) return r
    return r + (ratioOf(pulled) - r) * tokens.resist
  }
  const gpuActive = () => root.closest('[data-gpu-active="true"]') !== null
  const reduced = doc.defaultView?.matchMedia("(prefers-reduced-motion: reduce)")
  const writeFill = (ratio: number) => {
    const p = `${ratio * 100}%`
    fill.style.setProperty("--k-fill", p)
    handle.style.setProperty("--k-fill", p)
    ruler.style.setProperty("--k-fill", p)
  }
  // The DOM moves the fill on CSS transitions, except where it needs the spring itself: a stepped
  // drag's resistance and snap, and edge blur (--k-motion-blur), which needs the edge's speed. Then
  // it steps `fillSpring` each frame, as the GPU renderer does, and stops once it rests.
  let frame = 0
  let frameAt = 0
  let smear = 0
  /** Whether `fillSpring` holds the edge on screen (not a CSS transition's). */
  let synced = true
  const springDriven = () => frame !== 0 || (inHand() && stepped()) || readTokens().blur > 0
  const setSmear = (px: number) => {
    const next = px < 0.25 ? 0 : px
    if (next === smear) return
    smear = next
    root.classList.toggle("knobs-smear", next > 0)
    root.style.setProperty("--k-smear", next.toFixed(2))
  }
  const run = (now: number) => {
    fillSpring.omega = tokens.omega
    fillSpring.zeta = tokens.zeta
    if (reduced?.matches) fillSpring.snap(fillSpring.target)
    else fillSpring.step((now - frameAt) / 1000)
    frameAt = now
    writeFill(fillSpring.x)
    // Edge blur: the same smear as the GPU's, from the edge's speed (px/s).
    const speed = Math.max(Math.abs(fillSpring.v), Math.abs(velocity.velocity[0])) * getTrackWidth()
    setSmear(reduced?.matches ? 0 : Math.min(28, speed * 0.022 * tokens.blur))
    const busy = !fillSpring.resting || smear > 0 || (inHand() && tokens.blur > 0)
    frame = busy ? requestAnimationFrame(run) : 0
    onMotionWake?.()
  }
  const drive = () => {
    if (frame) return
    // Pick up the edge where any CSS transition has it now (a style read, so only then).
    if (!synced) {
      const shown = parseFloat(getComputedStyle(fill).getPropertyValue("--k-fill"))
      if (Number.isFinite(shown)) {
        fillSpring.x = shown / 100
        fillSpring.v = 0
      }
      synced = true
    }
    root.classList.remove("knobs-animate")
    frameAt = performance.now()
    frame = requestAnimationFrame(run)
  }
  const halt = () => {
    cancelAnimationFrame(frame)
    frame = 0
    setSmear(0)
  }
  const paint = (v: number, animate: boolean) => {
    if (!gpuActive() && springDriven()) return drive()
    halt()
    synced = gpuActive()
    root.classList.toggle("knobs-animate", animate)
    writeFill(ratioOf(v))
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
  const update = (v: number, delay = 0, instant = false) => {
    const previous = current
    current = v
    if (!inHand()) rebase()
    const r = ratioOf(v)
    velocity.add(r, 0)
    const ms = !initialized || instant ? 0 : rollMs(inHand())
    if (!initialized || instant || (inHand() && !stepped())) {
      fillSpring.snap(r)
      synced = true
    } else fillSpring.set(aim(), delay)
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
    if (instant) delay = 0
    const roll = () => {
      rollerDirty = false
      freshRoller = false
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
    } else if ((delay > 0 || freshRoller) && animateDom) {
      // A reel made just now (showTyped) is measured on its first frame: it rolls after that.
      rollTimer = setTimeout(roll, Math.max(delay, freshRoller ? 40 : 0))
    } else {
      roll()
    }
    track.setAttribute("aria-valuenow", String(v))
    track.setAttribute("aria-valuetext", fmt(v))
    if (number.hidden) paint(v, !instant && (!inHand() || stepped()))
    onMotionWake?.()
  }
  const retune = (next: KnobField) => {
    if (next === field) return
    const placesBefore = places
    field = next
    shape()
    places = field.decimals ?? decimals(field.step)
    if (places !== placesBefore) {
      roller.destroy()
      digits.replaceChildren()
      roller = makeRoller(current)
      lastRollerLen = fmtDigits(current).length
    }
    onMotionWake?.()
  }

  const getTrackWidth = () => trackWidth || (trackWidth = track.offsetWidth)
  const valueAt = (clientX: number, rect = track.getBoundingClientRect()) => {
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return field.min + t * span
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
  /** Where the pointer or fingers have the value (clamped to the range) while it's in hand. */
  let pulled: number | undefined
  /** Whether the drag or pan in hand has changed the value yet (its undo step exists). */
  let committed = false
  let dragRect: DOMRect | undefined
  let startX = 0
  let lastX = 0
  let moved = false
  let fromValue = false
  /** A press with ⌥ starts where the value is, rather than under the pointer. */
  let relative = false
  /**
   * The hand along the track (px) and its give past an end. A drag adds each move at its rate
   * (slower off the row, a tenth with ⌥), so a change of rate never moves the value; the give is
   * the fill's rubber band, and the value stays clamped.
   */
  let hand: Band = { at: 0, give: 0 }
  /** The detents of the gesture in hand, the strength they're at, and where they show the value. */
  let notches: Notches | undefined
  let strength = 1
  let shownAt = 0
  let held: DetentKind | undefined
  let depth = 0
  let settledAt = Number.NEGATIVE_INFINITY
  /** Whether a gesture holds the slider (`grip` until `letGo`). */
  let gripped = false
  const give = textGive(root, () => onMotionWake?.(), {
    home: STRETCH_HOME_S,
    draw: (px) => root.style.setProperty("--k-give", `${px.toFixed(2)}px`),
  })

  /** A gesture takes hold: its detents (none on a stepped slider, or with `detents: false`). */
  const grip = (at: number) => {
    const width = getTrackWidth()
    rebase()
    gripped = true
    hand = { at, give: 0 }
    strength = 1
    const off = field.detents === false || root.closest('[data-detents="off"]') !== null
    const base = options.base?.()
    notches =
      stepped() || off
        ? undefined
        : new Notches(
            detentsOf(width, field.min, field.max, {
              value: field.value,
              ...(base !== undefined && base !== field.value ? { base } : {}),
              round: roundValues(field.min, field.max),
            }),
            at,
          )
    shownAt = at
  }
  const setHeld = (kind: DetentKind | undefined) => {
    if (kind === held) return
    held = kind
    root.classList.toggle("knobs-magnet", kind === "default")
    root.classList.toggle("knobs-held-base", kind === "base")
    onMotionWake?.()
  }
  /** The handle settles into a detent: a small swell of its height, as the readout pops. */
  const settle = () => {
    if (reduced?.matches) return
    settledAt = performance.now()
    const frames = Array.from({ length: 13 }, (_, i) => ({
      scale: `1 ${settleScale((i / 12) * POP_MS).toFixed(4)}`,
    }))
    if (!gpuActive()) handle.animate(frames, { duration: POP_MS, pseudoElement: "::before" })
  }
  const setDepth = (next: number) => {
    if (Math.abs(next - depth) < 0.01 && (next === 0) === (depth === 0)) return
    depth = next
    for (let i = 0; i < 3; i++) {
      const a = rulerAlpha(depth, i + 1)
      rulerRows[i]!.style.opacity = a > 0 ? a.toFixed(3) : ""
    }
    onMotionWake?.()
  }
  /**
   * Moves the hand `dx` px along the track with detents at strength `k`: past an end the fill
   * gives (a tick as it starts), on a detent the value holds (a tick and a settle as it catches).
   */
  const travel = (dx: number, k: number) => {
    const width = getTrackWidth()
    if (!width || span <= 0) return
    if (notches && k !== strength) {
      hand = { at: unwarp(shownAt, hand.at, notches.list, k), give: hand.give }
      strength = k
    }
    hand = band(hand, dx, 0, width, STRETCH)
    const { shown, caught } = notches ? notches.move(hand.at, strength) : { shown: hand.at }
    shownAt = shown
    const on = notches && notches.held >= 0 ? notches.list[notches.held] : undefined
    setHeld(on?.kind)
    pull(on ? on.value : field.min + (shown / width) * span)
    if (hand.give !== give.give) give.hold(hand.give)
    if (caught) {
      tick(track)
      // The default's catch sounds firmer on its own (a step landing on the default).
      if (caught.kind !== "default")
        cue(track, "step", { position: ratioOf(caught.value), strong: caught.kind === "base" })
      if (caught.kind !== "round") pop()
      settle()
    }
  }

  track.onpointerdown = (event) => {
    const target = event.target as Node | null
    if (event.button !== 0 || (target && (number.contains(target) || accessory?.contains(target))))
      return
    event.preventDefault()
    fromValue = Boolean(target && value.contains(target))
    tokensAt = Number.NEGATIVE_INFINITY
    readTokens()
    track.setPointerCapture(event.pointerId)
    dragRect = track.getBoundingClientRect()
    trackWidth = dragRect.width
    dragging = true
    moved = false
    startX = lastX = event.clientX
    relative = event.altKey
    committed = false
    velocity.reset()
    root.classList.add("knobs-active")
    // A pointer focus isn't a keyboard one: no focus wash (Chromium would draw one, since the
    // pointerdown's default, which tells it a pointer did this, is prevented).
    track.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    onMotionWake?.()
  }
  /**
   * The pointer or fingers have the value at `at` (clamped to the range): it takes the nearest
   * step, and the fill follows: exactly for a continuous slider, pulled part way from its stop
   * for a stepped one, which snaps to the next stop past halfway. Each new stop ticks on a phone.
   */
  const pull = (at: number) => {
    pulled = at
    const before = current
    // The gesture's first change is a new undo step; the rest fold into it.
    set(held ? at : quantize(at), { coalesce: committed })
    if (current !== before) {
      committed = true
      if (stepped()) tick(track)
    }
    if (stepped()) {
      fillSpring.set(aim())
      if (!gpuActive()) drive()
    } else if (frame === 0 && readTokens().blur > 0 && !gpuActive()) drive()
    onMotionWake?.()
  }
  track.onpointermove = (event) => {
    if (!dragging) return
    if (!moved && !relative && Math.abs(event.clientX - startX) < 3) return
    const rect = dragRect ?? (dragRect = track.getBoundingClientRect())
    if (!moved) {
      moved = true
      // The value jumps under the pointer (unless ⌥ held it where it was), then follows it.
      grip(relative ? ratioOf(current) * rect.width : clamp(startX - rect.left, 0, rect.width))
    }
    // Precision by distance: further off the row, slower (continuous sliders only).
    const rate =
      (stepped() ? 1 : precisionRate(offRow(event.clientY, rect.top, rect.bottom))) *
      (event.altKey ? 0.1 : 1)
    const dx = (event.clientX - lastX) * rate
    lastX = event.clientX
    setDepth(stepped() ? 0 : rulerDepth(rate, rulerLevels(steps)))
    travel(dx, detentScale(rate))
  }
  /** The end of a drag or pan: a stepped fill springs home onto its stop, the give springs back. */
  const letGo = () => {
    pulled = undefined
    notches = undefined
    gripped = false
    setHeld(undefined)
    setDepth(0)
    give.release()
    root.classList.remove("knobs-active")
    fillSpring.set(ratioOf(current))
    if (!gpuActive() && (frame !== 0 || stepped() || tokens.blur > 0)) drive()
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
  // fill's scale from the first event, with the same detents and the same give at the ends, and
  // lands as one undo step; the momentum after the fingers lift is ignored. A wheel notch (or
  // ⇧ + wheel) steps once. Vertical scrolling is left alone so the page and panel still scroll.
  let panValue = 0
  /** Between a pan's first move and its end (`panning` lets go a little sooner, at the lift). */
  let panGesture = false
  const panLift = () => {
    give.release()
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
        readTokens()
      }
      // A new gesture, or any other change (an undo, a key), anchors the pan as a new undo step.
      if (!panGesture || current !== panValue || !gripped) {
        panGesture = true
        panValue = current
        grip(ratioOf(current) * width)
        committed = false
      }
      travel(dx, 1)
      panValue = current
    },
    lift: panLift,
    end() {
      panLift()
      panGesture = false
    },
    step(direction) {
      const next = stepValue(field, current, direction)
      if (next !== current) set(next)
    },
  })

  const parse = (text: string) => {
    const n = parseFloat(text.trim().replace(",", "."))
    return Number.isFinite(n) ? n : undefined
  }
  const fit = () => {
    fitter.textContent = number.value
    number.style.width = `${Math.max(fitter.offsetWidth + 1, parseFloat(number.style.minWidth) || 0)}px`
  }
  /**
   * The digits become editable where they stand: the field takes their right edge and width, so
   * nothing moves, and the unit stays after it. `initial` (a typed digit) replaces the text.
   */
  const edit = (initial?: string) => {
    if (number.hidden) {
      const t = track.getBoundingClientRect()
      const d = digits.getBoundingClientRect()
      // Its 1px of right padding keeps the caret in view, just past the last digit.
      number.style.right = `${t.right - d.right - 1}px`
      number.style.minWidth = `${d.width + 1}px`
      number.hidden = false
      root.classList.add("knobs-editing")
    }
    number.value = initial ?? fmtDigits(current)
    fit()
    number.focus()
    if (initial === undefined) number.select()
    else number.setSelectionRange(initial.length, initial.length)
    onMotionWake?.()
  }
  /** The readout shows `typed` at once, to roll from it to the value it lands on. */
  const showTyped = (typed: number) => {
    const text = fmtDigits(typed)
    syncDigits(text, 0, 0, 0)
    if (!gpuActive()) {
      roller.destroy()
      digits.replaceChildren()
      roller = makeRoller(typed)
      freshRoller = true
      lastRollerLen = text.length
    }
  }
  /**
   * Enter commits: the value takes the nearest step in range, its digits rolling there from what
   * was typed and the fill gliding after. Esc puts the text back as it was.
   */
  const done = (commit: boolean, refocus = true) => {
    if (number.hidden) return
    const typed = commit ? parse(number.value) : undefined
    number.hidden = true
    root.classList.remove("knobs-editing")
    const result = typed === undefined ? current : quantize(typed)
    const rolled = typed !== undefined && fmtDigits(typed) !== fmtDigits(result)
    if (rolled) showTyped(typed)
    if (result !== current) set(result)
    else if (rolled) update(current)
    else paint(current, true)
    if (refocus) track.focus({ preventScroll: true })
    onMotionWake?.()
  }
  value.onclick = (event) => {
    // Pointer clicks are handled on release; this covers keyboard/AT activation.
    if (event.detail === 0) edit()
  }
  number.oninput = fit
  number.onblur = () => done(true, false)
  number.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      done(true)
    } else if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      done(false)
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // ↑↓ step the text (⇧ by the big step); Enter still commits it.
      event.preventDefault()
      event.stopPropagation()
      const by = (event.shiftKey ? keyPrefs(track).bigStep : 1) * (event.key === "ArrowUp" ? 1 : -1)
      number.value = fmtDigits(stepValue(field, parse(number.value) ?? current, by))
      fit()
      number.select()
    }
  }
  track.onkeydown = (event) => {
    if (event.target !== track) return
    if (event.key === "Enter" && number.hidden && keyPrefs(track).edit) {
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
    handleSpring,
    digitPlaces,
    velocity,
    get tickCount() {
      return count
    },
    get notchRatio() {
      return notchRatio
    },
    get field() {
      return field
    },
    retune,
    isMagnetized: () => held === "default",
    heldDetent: () => held,
    get baseRatio() {
      return baseRatio
    },
    get settledAt() {
      return settledAt
    },
    rulerDepth: () => depth,
    get poppedAt() {
      return poppedAt
    },
    getDigitsText: () => fmtDigits(current),
    getUnitText: () => field.unit ?? "",
    isDragging: inHand,
    isEditing: () => !number.hidden,
    update,
    prime: () => void readTokens(),
    edit,
    slot(node) {
      accessory = node
      track.insertBefore(node, value)
      ro.observe(node)
    },
    dispose() {
      ro.disconnect()
      clearTimeout(rollTimer)
      halt()
    },
  }
}
