// When a tooltip shows, waits or goes, apart from the DOM: one tip at a time, after a pause over a
// target, at once on keyboard focus or as a hand-off from a tip that's up or just went.

/** Timers and the clock (the window's, or a test's). */
export interface TipClock {
  set(run: () => void, ms: number): unknown
  clear(handle: unknown): void
  now(): number
}

/** What the schedule asks of the page. */
export interface TipView<T> {
  /** Shows `tip`; `snap` skips the entrance (a hand-off). */
  show(tip: T, snap: boolean): void
  /** Hides the one showing; `now` skips the exit. */
  hide(now: boolean): void
  /** Whether `tip`'s target is still in the page when its pause ends. */
  connected(tip: T): boolean
}

/** A neighbour within this long of a tip going shows at once. */
export const HANDOFF_MS = 400
export const TIP_DELAY_MS = 500

export interface TipSchedule<T extends { readonly el: object }> {
  readonly shown: T | null
  readonly pending: T | null
  /** `tip` wants to show: after its pause, or at once (`now`, or a hand-off). */
  want(tip: T, options?: { readonly now?: boolean; readonly delay?: number }): void
  hide(now?: boolean): void
  /** Focus left: a tip shown or waiting for a target `within` matches goes, or never shows. */
  leave(within: (tip: T) => boolean): void
}

export function tipSchedule<T extends { readonly el: object }>(
  clock: TipClock,
  view: TipView<T>,
): TipSchedule<T> {
  let shown: T | null = null
  let pending: T | null = null
  let timer: unknown
  let hiddenAt = -Infinity
  const cancel = () => {
    if (pending) clock.clear(timer)
    pending = null
  }
  const hide = (now = false) => {
    cancel()
    if (!shown) return
    shown = null
    hiddenAt = clock.now()
    view.hide(now)
  }
  return {
    get shown() {
      return shown
    },
    get pending() {
      return pending
    },
    want(tip, options = {}) {
      if (tip.el === shown?.el || tip.el === pending?.el) return
      cancel()
      const handoff = shown !== null || clock.now() - hiddenAt < HANDOFF_MS
      if (handoff || options.now) {
        shown = tip
        view.show(tip, handoff)
        return
      }
      pending = tip
      timer = clock.set(() => {
        pending = null
        if (!view.connected(tip)) return
        shown = tip
        view.show(tip, false)
      }, options.delay ?? TIP_DELAY_MS)
    },
    hide,
    leave(within) {
      if (pending && within(pending)) cancel()
      if (shown && within(shown)) hide()
    },
  }
}
