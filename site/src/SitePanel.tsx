import { useEffect, useRef, useState } from "react"
import { site } from "./site"

type Panel = { dismiss(): void; dispose(): void; focus(): void; reopen(): boolean }

/**
 * The site-wide token panel. It grows out of the "Tune" button the way a section's panel grows out
 * of its chip, using the panel module's own chip morph. `t` toggles it from anywhere on the page.
 */
export function TuneButton() {
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<Panel | null>(null)
  const closing = useRef<Panel | null>(null)
  const [open, setOpen] = useState(false)

  const close = () => {
    const current = panel.current
    if (!current) return
    panel.current = null
    closing.current = current
    current.dismiss()
    setOpen(false)
    button.current?.focus({ preventScroll: true })
  }

  const show = async () => {
    const chip = button.current
    if (!chip) return
    if (panel.current) return panel.current.focus()
    if (closing.current?.reopen()) {
      panel.current = closing.current
      closing.current = null
      setOpen(true)
      panel.current.focus()
      return
    }
    // The morph starts from the chip's left/top, which a static button doesn't otherwise carry.
    const box = chip.getBoundingClientRect()
    chip.style.left = `${box.left}px`
    chip.style.top = `${box.top}px`
    const { createPanel } = await import("knobs/panel")
    const anchor = document.getElementById("site-panel-anchor")!
    panel.current = createPanel(site, anchor, close, { chip, title: "Site tokens" })
    setOpen(true)
    panel.current.focus()
  }

  const toggle = () => (panel.current ? close() : void show())
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "t" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as Element | null
      if (target?.closest("input, textarea, select, [contenteditable], .knobs-panel")) return
      event.preventDefault()
      toggleRef.current()
    }
    addEventListener("keydown", key)
    return () => {
      removeEventListener("keydown", key)
      panel.current?.dispose()
      closing.current?.dispose()
    }
  }, [])

  return (
    <button
      ref={button}
      type="button"
      className="tune-button"
      data-open={open}
      aria-expanded={open}
      aria-keyshortcuts="t"
      aria-label="Tune site tokens"
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 4.5h7M13 4.5h1M2 11.5h1M7 11.5h7" />
        <circle cx="11" cy="4.5" r="1.9" />
        <circle cx="5" cy="11.5" r="1.9" />
      </svg>
      <span>Tune</span>
      <kbd>T</kbd>
    </button>
  )
}
