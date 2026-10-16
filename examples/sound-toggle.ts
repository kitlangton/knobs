// The top bar's speaker: the page's sound switch (knobs/panel's `sound`), on unless the visitor
// muted it, which localStorage keeps for the catalog and the Lab alike.
import { sound } from "knobs/panel"

const KEY = "knobs-demo:sound"
const BODY = `<path d="M2 6.2h2.3l3.3-2.7v9L4.3 9.8H2z" fill="currentColor" stroke="none"/>`
const ON = `${BODY}<path d="M10.2 5.7a3.1 3.1 0 0 1 0 4.6M12.1 3.9a5.6 5.6 0 0 1 0 8.2"/>`
const OFF = `${BODY}<path d="M10.6 6.2l3.4 3.6M14 6.2l-3.4 3.6"/>`

try {
  sound.enable(localStorage.getItem(KEY) !== "off")
} catch {}

export function speakerToggle(button: HTMLButtonElement) {
  const paint = () => {
    const on = sound.enabled
    button.innerHTML = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${on ? ON : OFF}</svg>`
    button.setAttribute("aria-pressed", String(on))
    button.setAttribute("aria-label", "Sound")
    button.dataset.tip = on ? "Sound on: click to mute" : "Sound off"
  }
  button.addEventListener("click", () => {
    sound.enable(!sound.enabled)
    try {
      localStorage.setItem(KEY, sound.enabled ? "on" : "off")
    } catch {}
    sound.play("toggle", { direction: 1 })
  })
  sound.subscribe(paint)
  paint()
}
