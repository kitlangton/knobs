// The catalog waits for WebGPU's device (a few milliseconds) before it builds, so each preview
// chooses its GPU or DOM drawing once, with nothing to swap later.
import { initGpu } from "./controls-gpu"

initGpu().finally(() => import("./controls"))
