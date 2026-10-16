// How a component wrapper hands a prop to the piece it made: the piece starts from the prop's
// value at creation, and every later value goes to it. A value that changed in the same update
// that mounted the component (before its effect first ran) still goes, rather than being lost.

/**
 * A test for each value a prop takes, given the value the piece was made with: on the first
 * run, only a value that differs from that one; after it, every value.
 */
export function follower<V>(
  initial: V,
  same: (a: V, b: V) => boolean = Object.is,
): (value: V) => boolean {
  let first = true
  return (value) => {
    if (!first) return true
    first = false
    return !same(value, initial)
  }
}
