import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import type { Controls, Schema } from "knobs"
import { App } from "./App"
import { applySite, readSharedTuning, registerStore, site } from "./site"
import "./styles.css"

// The site used to have a page per topic; those addresses now land on the matching section.
const moved: Record<string, string> = {
  "/getting-started": "install",
  "/fields": "knob",
  "/panel": "keys-and-gestures",
  "/reacting": "reacting-to-changes",
  "/theming": "theming",
  "/production": "production-builds",
  "/adapters": "adapters",
  "/remote": "remote-and-swift",
  "/full-page": "examples",
  "/examples": "examples",
}
const target = moved[location.pathname.replace(/\/+$/, "")]
if (target) history.replaceState(null, "", `/${location.search}#${target}`)

readSharedTuning()
registerStore(site as unknown as Controls<Schema>)
applySite(site.get())

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
