// Records raw trackpad wheel streams for tuning the pan model's lift detection (src/panel/swipe.ts).
// Each gesture is saved by the dev server to tests/fixtures/kit-traces/ (see vite.config.ts).
const steps = [
  ["slow-pan", "Pan slowly right, then left, then lift your fingers slowly"],
  ["flick-right", "Flick right quickly and lift (a throw)"],
  ["flick-left", "Flick left quickly and lift (a throw)"],
  ["pan-stop-lift", "Pan right, stop dead with fingers resting for a second, then lift"],
  ["pan-throw", "Pan right steadily, then speed up and lift mid-motion (a throw)"],
  ["pan-pause-pan", "Pan right, pause with fingers down, pan right again, lift"],
  ["reverse", "Pan right, reverse to the left without lifting, lift"],
  ["flick-right-2", "Another quick flick right and lift"],
  ["flick-left-2", "Another quick flick left and lift"],
  ["gentle-throw", "A gentle, slow throw right and lift"],
] as const

const list = document.getElementById("steps")!
const pad = document.getElementById("pad")!
const statusEl = document.getElementById("status")!
let at = 0
let events: (number | string)[][] = []
let t0 = 0
let quiet: ReturnType<typeof setTimeout> | undefined
let armed = false

const render = () => {
  list.replaceChildren(
    ...steps.map(([, text], i) => {
      const li = document.createElement("li")
      li.textContent = text
      li.className = i < at ? "done" : i === at ? "now" : ""
      return li
    }),
  )
  if (at >= steps.length) {
    pad.textContent = "All done, thank you"
    pad.classList.remove("armed")
  }
}

const save = async () => {
  armed = false
  pad.classList.remove("armed")
  const [label] = steps[at]!
  const body = {
    label,
    userAgent: navigator.userAgent,
    devicePixelRatio: devicePixelRatio,
    events,
  }
  statusEl.textContent = `Saving ${label} (${events.length} events)…`
  const res = await fetch("/__wheel-traces", { method: "POST", body: JSON.stringify(body) })
  statusEl.textContent = res.ok
    ? `Saved ${label}: ${events.length} events over ${events.at(-1)?.[0] ?? 0} ms`
    : `Save failed (${res.status})`
  if (res.ok) at++
  events = []
  render()
  if (at < steps.length) arm()
}

const arm = () => {
  armed = true
  events = []
  pad.classList.add("armed")
  pad.textContent = "Ready: do the highlighted gesture here"
}

pad.addEventListener("click", () => {
  if (at < steps.length && !armed) arm()
})
pad.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault()
    if (!armed) return
    if (!events.length) t0 = e.timeStamp
    // [ms, deltaX, deltaY, deltaMode, momentum]; "-0" keeps Chrome-on-Windows' lift marker, and
    // momentum is Chromium's WheelEvent.momentum (absent elsewhere).
    const dx = Object.is(e.deltaX, -0) ? "-0" : e.deltaX
    const momentum = (e as WheelEvent & { momentum?: boolean }).momentum
    events.push([
      +(e.timeStamp - t0).toFixed(1),
      dx,
      e.deltaY,
      e.deltaMode,
      momentum === undefined ? "" : momentum ? 1 : 0,
    ])
    pad.textContent = `Recording… ${events.length}`
    clearTimeout(quiet)
    quiet = setTimeout(save, 1200)
  },
  { passive: false },
)
document.getElementById("redo")!.onclick = () => {
  clearTimeout(quiet)
  arm()
}
document.getElementById("skip")!.onclick = () => {
  clearTimeout(quiet)
  at++
  render()
  if (at < steps.length) arm()
}
render()
