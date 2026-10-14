// Problems in production: a shipped remote panel (Solid) beside a dev-only dock store.
import { createRemoteControls, defineControls, knob } from "knobs"
import { KnobsPanel } from "knobs/solid"
import { problemsPreset } from "knobs/themes"
import html from "solid-js/html"
import { render } from "solid-js/web"

const sets: [string, unknown][] = []
const params = createRemoteControls(
  "parameters",
  [
    { key: "stops", label: "Stops", kind: "number", default: 4, min: 2, max: 5, step: 1 },
    {
      key: "duration",
      label: "Duration",
      kind: "number",
      default: 0.45,
      min: 0.1,
      max: 1,
      step: 0.05,
    },
    { key: "bounce", label: "Bounce", kind: "number", default: 0.3, min: 0, max: 0.7, step: 0.05 },
    {
      key: "spring",
      label: "Spring",
      kind: "spring",
      bind: { duration: "duration", bounce: "bounce" },
    },
  ],
  { ship: () => import("knobs/panel"), nullDefaults: false, onSet: (k, v) => sets.push([k, v]) },
)
const dock = defineControls(
  "dock",
  { size: knob(4, { min: 0, max: 10, step: 1 }) },
  { enabled: true },
)
dock.set({ size: 9 })
render(
  () =>
    html`<${KnobsPanel} controls=${params} header=${false} variants=${false} preset=${problemsPreset} keys=${{ vim: false, edit: false }} />`,
  document.getElementById("app")!,
)
Object.assign(window, {
  result: { sets, dock: { enabled: dock.enabled, size: dock.get().size }, params },
})
