// How a component wrapper hands its props to the piece it made. The piece starts from the props'
// values at creation; after that, the props that changed go to it together, in the order the
// wrapper applies them (options before the selection among them). So neither a value that
// changed in the same update that mounted the component, nor the order a framework runs its
// effects in, can lose one.

/**
 * A diff for each set of prop values, given the values the piece was made with: the props that
 * differ from the last values seen (at first, those at creation).
 */
export function propChanges<P extends object>(
  initial: P,
  same: (a: unknown, b: unknown) => boolean = Object.is,
): (next: P) => Partial<P> {
  let last = { ...initial }
  return (next) => {
    const changed: Partial<P> = {}
    for (const key of Object.keys(next) as (keyof P)[])
      if (!same(next[key], last[key])) changed[key] = next[key]
    last = { ...next }
    return changed
  }
}

/** Whether a diff from `propChanges` has anything in it. */
export const anyChanged = (changed: object): boolean => Object.keys(changed).length > 0

/**
 * A timeline's changed props as one `update()`: unset ones dropped, and so are values it already
 * has (a `time` or `playing` it reported itself, markers it handed out).
 */
export function timelineChanges<C extends Record<string, unknown>>(
  now: {
    readonly time: number
    readonly playing: boolean
    readonly markers: unknown
    readonly ranges: unknown
  },
  changed: C,
): Partial<C> {
  const next: Partial<C> = {}
  for (const key of Object.keys(changed) as (keyof C & string)[]) {
    const value = changed[key]
    if (value === undefined) continue
    if (key === "time" && Math.abs((value as number) - now.time) < 1e-6) continue
    if (key === "playing" && value === now.playing) continue
    if ((key === "markers" || key === "ranges") && value === now[key as "markers" | "ranges"])
      continue
    next[key] = value
  }
  return next
}
