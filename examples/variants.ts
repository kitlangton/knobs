// Versions of one design, switched from the preset strip: the shape of the desktop Go upsell
// page (nine hero animations and a layout that shows one or a set of them).
import { action, choice, defineControls, knob, toggle } from "knobs"

const NEW = ["Stand up", "Anamorphic", "Roll", "Unpack", "Trace"] as const
const EARLIER = ["Assemble", "Drain", "Ripple", "Lightspeed"] as const
const VARIANTS = [...NEW, ...EARLIER] as const
const LAYOUTS = { "New five": NEW, "Earlier four": EARLIER } as const
const ACCENTS = { Peach: "#fab283", Blue: "#7698fd", Green: "#6bd586", Mono: "#ffffff" }

const controls = defineControls(
  "variants-example",
  {
    // Each option is a preset in the strip at the top of the panel, and the strip is the one place
    // to switch them (1–9 pick one, [ and ] step).
    variant: choice("Stand up", VARIANTS, { variants: true }),
    layout: choice("Single", ["Single", "New five", "Earlier four"] as const, {
      group: "Hero",
      random: false,
    }),
    speed: knob(1, { min: 0.25, max: 2, step: 0.05, unit: "×", group: "Motion" }),
    intensity: knob(1, { min: 0, max: 1.6, step: 0.05, group: "Motion", label: "Intro intensity" }),
    loop: knob(1, { min: 0, max: 1.6, step: 0.05, group: "Motion", label: "Loop intensity" }),
    counter: knob(0.15, { min: 0, max: 1, step: 0.05, group: "Look", label: "Counter light" }),
    accent: choice("Peach", ["Peach", "Blue", "Green", "Mono"] as const, { group: "Look" }),
    theme: choice("Dark", ["Dark", "Light"] as const, { group: "Look", random: false }),
    reduced: toggle(false, { group: "Look", label: "Reduced motion" }),
    replay: action("Replay", { group: "Hero", run: () => render() }),
  },
  { enabled: true, storage: null },
)

const dialogs = document.querySelector<HTMLElement>(".dialogs")!
controls.mount(document.querySelector<HTMLElement>("aside")!, { theme: "auto" })

function render() {
  const v = controls.get()
  const list = v.layout === "Single" ? [v.variant] : LAYOUTS[v.layout]
  document.body.dataset.theme = v.theme
  dialogs.innerHTML = list
    .map(
      (name, i) => `
      <div class="dialog" style="--accent:${ACCENTS[v.accent]};--glow:${0.35 + v.intensity * 0.4}">
        <div class="hero"><span>${list.length > 1 ? `${i + 1} ` : ""}${name}</span></div>
        <div class="copy"><h2>Free limit reached</h2><p>Keep going now with OpenCode Go.</p></div>
      </div>`,
    )
    .join("")
}
controls.subscribe(render)
render()
