/** A pause this long (ms) between wheel events ends a gesture, for sliders and swipes alike. */
export const GESTURE_GAP = 250
/** Sideways travel (px) a swipe needs before it steps. */
export const SWIPE_STEP = 36

/**
 * The sideways part of a wheel event in px: a horizontal two-finger swipe, or ⇧ + wheel.
 * Zero when the event is mostly vertical, so page and panel scrolling pass through.
 */
export function sideways(event: {
  deltaX: number
  deltaY: number
  deltaMode: number
  shiftKey: boolean
}): number {
  let d = event.deltaX
  if (event.shiftKey && d === 0) d = event.deltaY
  else if (Math.abs(d) <= Math.abs(event.deltaY)) return 0
  return d * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1)
}

export interface WheelSample {
  readonly deltaX: number
  readonly deltaY: number
  readonly deltaMode: number
  readonly shiftKey: boolean
  /** ms */
  readonly timeStamp: number
}

/**
 * Turns wheel events into discrete steps: one per gesture. A trackpad flick keeps sending
 * fading momentum after the fingers lift; those events are swallowed until the wheel goes quiet
 * or a new swipe pushes harder than the momentum it interrupts. A mouse wheel notch under ⇧ is a
 * gesture of its own.
 *
 * `feed` returns the step (-1, 0 or 1) and whether the event belongs to the gesture, in which
 * case the caller should `preventDefault()` it (so the browser doesn't swipe back a page).
 */
export function createSwipe() {
  let at = Number.NEGATIVE_INFINITY
  let travel = 0
  let spent = false
  let low = Number.POSITIVE_INFINITY
  return {
    feed(event: WheelSample): { step: -1 | 0 | 1; claimed: boolean } {
      const d = sideways(event)
      if (!d) return { step: 0, claimed: false }
      const size = Math.abs(d)
      if (event.timeStamp - at > GESTURE_GAP) {
        travel = 0
        spent = false
      }
      at = event.timeStamp
      const notch = event.shiftKey && event.deltaX === 0 && size >= 50
      if (spent && !notch) {
        low = Math.min(low, size)
        if (size < Math.max(8, low * 3)) return { step: 0, claimed: true }
        spent = false
        travel = 0
      }
      if (travel && Math.sign(d) !== Math.sign(travel)) travel = 0
      travel += d
      if (!notch && Math.abs(travel) < SWIPE_STEP) return { step: 0, claimed: true }
      const step = travel > 0 ? 1 : -1
      spent = true
      low = size
      travel = 0
      return { step, claimed: true }
    },
  }
}

/** Calls `step` once per sideways swipe over `el`; vertical scrolling is left alone. */
export function onSwipe(el: HTMLElement, step: (direction: -1 | 1) => void) {
  const swipe = createSwipe()
  el.addEventListener(
    "wheel",
    (event) => {
      const { step: s, claimed } = swipe.feed(event)
      if (claimed) event.preventDefault()
      if (s) step(s)
    },
    { passive: false },
  )
}
