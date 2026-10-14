// A dev-only store in a production build: locked to its defaults, its panel never loaded.
import { defineControls, knob } from "knobs"

const dock = defineControls(
  "dock",
  { size: knob(4, { min: 0, max: 10, step: 1 }) },
  { enabled: true },
)
dock.set({ size: 9 })
dock.mount(document.getElementById("tune")!)
Object.assign(window, { result: { enabled: dock.enabled, size: dock.get().size } })
