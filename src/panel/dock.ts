/**
 * The header of the knobs/ui split pane `host` sits in, when the pane has one (a title) and no
 * panel's buttons have joined it yet. A panel there with no title of its own puts its buttons in
 * it (after the pane's actions, before its collapse button) rather than drawing a header row
 * that would hold only them: one header per surface.
 */
export function paneHeadOf(host: HTMLElement): HTMLElement | undefined {
  const head = host
    .closest(".knobs-pane-body")
    ?.parentElement?.querySelector<HTMLElement>(":scope > .knobs-pane-head")
  return head && !head.querySelector(":scope > [data-docked]") ? head : undefined
}

/** Moves `actions` into the pane header `head`; the returned function takes them back out. */
export function dock(actions: HTMLElement, head: HTMLElement): () => void {
  actions.dataset.docked = ""
  head.insertBefore(actions, head.querySelector(":scope > .knobs-pane-collapse"))
  return () => {
    actions.remove()
    delete actions.dataset.docked
  }
}
