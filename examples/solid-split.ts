// Solid's Split with a reactive pane child (tests/browser/ui.spec.ts): toggling the <Show> in one
// pane mustn't make the other pane's child again.
import { createSignal } from "solid-js"
import html from "solid-js/html"
import { render, Show } from "solid-js/web"
import { Split } from "knobs/ui/solid"

const [on, setOn] = createSignal(false)
let made = 0
const Counted = () => {
  made++
  const el = document.createElement("div")
  el.className = "counted"
  return el
}
render(
  () => html`<${Split} storage=${null} panes=${[{ id: "a" }, { id: "b" }]}>
    <${Counted} />
    <${Show} when=${on}><div class="shown">on</div><//>
  <//>`,
  document.body.appendChild(document.createElement("div")),
)
;(window as unknown as { __check: () => Promise<unknown> }).__check = async () => {
  setOn(true)
  await new Promise((r) => setTimeout(r, 50))
  const shown = document.querySelectorAll('[data-pane="b"] .shown').length
  setOn(false)
  await new Promise((r) => setTimeout(r, 50))
  return {
    made,
    shown,
    after: document.querySelectorAll('[data-pane="b"] .shown').length,
    counted: document.querySelectorAll('[data-pane="a"] .counted').length,
  }
}
