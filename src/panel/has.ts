/**
 * What the panel's rules would ask `:has()` for, kept as attributes on the panel's elements
 * instead (styles.ts rewrites the rules to match them). Chrome re-checks a `:has()` subject on
 * DOM changes below it, and a rolling readout adds and drops digit nodes every frame it rolls: with
 * forty readouts rolling at once (a preset), most of each frame's style work was that.
 *
 * - `data-k-fv` on each ancestor of the focused element while it's `:focus-visible`
 *   (`:has(:focus-visible)`); `"track"` when that's a slider track, `"head"` an editor's header.
 * - `data-k-active` on each ancestor of a `.knobs-active` element (`:has(.knobs-active)`).
 */
export function trackHas(root: HTMLElement): () => void {
  const doc = root.ownerDocument
  const win = doc.defaultView
  const marked = { fv: [] as HTMLElement[], active: [] as HTMLElement[] }
  /** Sets `name` on `node`'s ancestors up to `root` (not `node` itself), clearing the last set. */
  const mark = (list: HTMLElement[], name: string, nodes: readonly Element[], value = "") => {
    const next: HTMLElement[] = []
    for (const node of nodes)
      for (let at = node.parentElement; at; at = at === root ? null : at.parentElement) {
        next.push(at)
        if (at.getAttribute(name) !== value) at.setAttribute(name, value)
      }
    for (const old of list) if (!next.includes(old)) old.removeAttribute(name)
    list.length = 0
    list.push(...next)
  }
  const focusKind = (node: Element) =>
    node.classList.contains("knobs-track")
      ? "track"
      : node.classList.contains("knobs-x-head")
        ? "head"
        : ""
  const syncFocus = () => {
    const active = doc.activeElement
    const shown =
      active && active !== root && root.contains(active) && active.matches(":focus-visible")
    mark(marked.fv, "data-k-fv", shown ? [active] : [], shown ? focusKind(active) : "")
  }
  let queued = false
  // After the event: focus moves, and :focus-visible settles, once it has been handled.
  const later = () => {
    if (queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      syncFocus()
    })
  }
  const syncActive = () =>
    mark(marked.active, "data-k-active", [...root.querySelectorAll(".knobs-active")])
  const classes = new MutationObserver((records) => {
    for (const r of records) {
      const was = r.oldValue?.split(/\s+/).includes("knobs-active") ?? false
      if (was !== (r.target as Element).classList.contains("knobs-active")) return syncActive()
    }
  })
  classes.observe(root, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
    attributeOldValue: true,
  })
  root.addEventListener("focusin", later)
  root.addEventListener("focusout", later)
  for (const type of ["keydown", "pointerdown"]) doc.addEventListener(type, later, true)
  win?.addEventListener("focus", later)
  win?.addEventListener("blur", later)
  syncFocus()
  syncActive()
  return () => {
    classes.disconnect()
    root.removeEventListener("focusin", later)
    root.removeEventListener("focusout", later)
    for (const type of ["keydown", "pointerdown"]) doc.removeEventListener(type, later, true)
    win?.removeEventListener("focus", later)
    win?.removeEventListener("blur", later)
  }
}
