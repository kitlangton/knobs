import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import type { Controls, Schema } from "knobs"
import { Layout } from "./Layout"
import { applySite, readSharedTuning, registerStore, site } from "./site"
import "./styles.css"

readSharedTuning()
registerStore(site as unknown as Controls<Schema>)
applySite(site.get())

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Layout />
  </StrictMode>,
)
