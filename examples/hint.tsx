/** In the site's production build chips wait for knobs mode, so the page says how to turn it on. */
export function KnobsHint() {
  if (import.meta.env.MODE !== "site") return null
  return (
    <p className="knobs-mode-hint">
      Press <kbd>⌥⇧D</kbd> for knobs
    </p>
  )
}
