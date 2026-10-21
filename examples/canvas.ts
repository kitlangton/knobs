// A components lab as an infinite canvas (knobs/ui canvas): about forty small, live stories of
// mixed sizes, packed into rows by their measured size.
//   ?n=200        more tiles (the stories again) for perf
//   ?theme=light  ?perf (a frame-rate readout)
import { canvas, restyle, type CanvasItem } from "knobs/ui"

const params = new URLSearchParams(location.search)
const h = (html: string) => (el: HTMLElement) => {
  el.innerHTML = html
}
const hue = (i: number) => `oklch(.72 .13 ${(i * 47) % 360})`

const stories: Omit<CanvasItem, "id">[] = [
  {
    title: "Button / variants",
    render: h(`<div class="s-row"><button class="s-btn" data-kind="primary">Primary</button><button class="s-btn">Secondary</button><button class="s-btn" data-kind="ghost">Ghost</button><button class="s-btn" data-kind="danger">Delete</button></div>`),
  },
  {
    title: "Button / counter",
    render: (el) => {
      let n = 0
      el.innerHTML = `<button class="s-btn" data-kind="primary">Clicked 0 times</button>`
      const b = el.querySelector("button")!
      b.addEventListener("click", () => (b.textContent = `Clicked ${++n} time${n === 1 ? "" : "s"}`))
    },
  },
  {
    title: "Input / text",
    render: h(`<div class="s-col"><input class="s-input" placeholder="Search sessions…" /><span class="s-dim">Type here: keys reach the field.</span></div>`),
  },
  {
    title: "Toggle",
    render: (el) => {
      el.innerHTML = `<div class="s-row"><button class="s-toggle" role="switch" aria-checked="true"></button><span class="s-dim">Auto-accept edits</span></div>`
      const t = el.querySelector("button")!
      t.addEventListener("click", () =>
        t.setAttribute("aria-checked", String(t.getAttribute("aria-checked") !== "true")),
      )
    },
  },
  { title: "Chip / status", render: h(`<div class="s-row"><span class="s-chip">idle</span><span class="s-chip">running</span><span class="s-chip">done</span><span class="s-chip">3 files</span></div>`) },
  {
    title: "Swatches / accent",
    render: h(`<div class="s-row">${Array.from({ length: 8 }, (_, i) => `<div class="s-sw" style="background:${hue(i)}"></div>`).join("")}</div>`),
  },
  {
    title: "Heading / paragraph",
    render: h(`<div class="s-col"><div class="s-h">Review the session</div><p class="s-p">Every tool call, diff and message from the run, in order. Pick one to see what it touched and why.</p></div>`),
  },
  {
    title: "List / sessions",
    render: h(`<div class="s-list">${["Fix the drawer drag", "Canvas for knobs", "Release notes", "Perf: launch", "Voice turns"].map((t, i) => `<div class="s-li"><span class="s-avatar" style="background:${hue(i + 3)}"></span>${t}<span class="fill" style="flex:1"></span><span class="s-dim">${i + 2}m</span></div>`).join("")}</div>`),
  },
  {
    title: "Chart / bars",
    w: 360,
    h: 200,
    render: h(`<div class="s-bar">${[40, 62, 35, 80, 54, 92, 70, 48, 66, 85, 58, 73].map((v) => `<i style="height:${v}%"></i>`).join("")}</div>`),
  },
  {
    title: "Code / snippet",
    render: h(`<pre class="s-code">const c = canvas(el, {
  items: stories.map(toItem),
  gap: 48,
})
c.focus("button-variants")</pre>`),
  },
  { title: "Keyboard / shortcuts", render: h(`<div class="s-col"><div class="s-row"><span class="s-kbd">⌘</span><span class="s-kbd">K</span><span class="s-dim">Command palette</span></div><div class="s-row"><span class="s-kbd">0</span><span class="s-dim">Fit</span></div><div class="s-row"><span class="s-kbd">␣</span><span class="s-dim">Hold to pan</span></div></div>`) },
  { title: "Toast", render: h(`<div class="s-toast"><span class="s-avatar" style="background:${hue(1)}"></span><span>Pushed <b>canvas</b> to origin</span><span style="flex:1"></span><button class="s-btn" data-kind="ghost">Undo</button></div>`) },
  { title: "Progress", render: h(`<div class="s-col"><div class="s-progress"><i style="width:64%"></i></div><span class="s-dim">Indexing · 64%</span></div>`) },
  {
    title: "Tabs",
    render: (el) => {
      el.innerHTML = `<div class="s-tabs" role="tablist">${["Chat", "Diff", "Files", "Logs"].map((t, i) => `<button class="s-tab" role="tab" aria-selected="${i === 0}">${t}</button>`).join("")}</div>`
      el.addEventListener("click", (e) => {
        const tab = (e.target as Element).closest(".s-tab")
        if (!tab) return
        for (const t of el.querySelectorAll(".s-tab")) t.setAttribute("aria-selected", String(t === tab))
      })
    },
  },
  {
    title: "Slider",
    render: (el) => {
      el.innerHTML = `<div class="s-col"><input class="s-range" type="range" min="0" max="100" value="40" /><span class="s-dim">Temperature · <span>40</span></span></div>`
      const r = el.querySelector("input")!
      r.addEventListener("input", () => (el.querySelector(".s-dim span")!.textContent = r.value))
    },
  },
  { title: "Icon grid", render: h(`<div class="s-grid">${Array.from({ length: 24 }, (_, i) => `<i style="background:${hue(i)};opacity:${0.35 + (i % 4) * 0.2}"></i>`).join("")}</div>`) },
  { title: "Empty state", w: 320, h: 180, render: h(`<div class="s-fill"><div class="s-col" style="align-items:center"><div class="s-h">No sessions yet</div><span class="s-dim">Start one from the composer.</span><button class="s-btn" data-kind="primary">New session</button></div></div>`) },
  { title: "Avatar stack", render: h(`<div class="s-row">${Array.from({ length: 5 }, (_, i) => `<span class="s-avatar" style="background:${hue(i * 2)};width:28px;height:28px;margin-left:${i ? -10 : 0}px;box-shadow:0 0 0 2px var(--_k-bg)"></span>`).join("")}<span class="s-dim">+4</span></div>`) },
  { title: "Hero / wide", w: 640, h: 220, render: h(`<div class="s-fill" style="background:linear-gradient(135deg,${hue(2)},${hue(6)});border-radius:8px"><div class="s-h" style="color:#111">A canvas for every component</div></div>`) },
  { title: "Tall / sidebar", w: 220, h: 420, render: h(`<div class="s-col">${["Sessions", "Files", "Search", "Changes", "Agents", "Settings"].map((t) => `<div class="s-li">${t}</div>`).join("")}</div>`) },
]

const n = Number(params.get("n")) || 40
const items: CanvasItem[] = Array.from({ length: n }, (_, i) => {
  const s = stories[i % stories.length]!
  const round = Math.floor(i / stories.length)
  return { ...s, id: `story-${i}`, title: round ? `${s.title} · ${round + 1}` : s.title }
})

const appearance = params.get("theme") === "light" ? "light" : "dark"
restyle(document, { appearance })
const themeBtn = document.querySelector<HTMLButtonElement>("#theme")!
let mode: "dark" | "light" = appearance
themeBtn.textContent = mode
themeBtn.onclick = () => {
  mode = mode === "dark" ? "light" : "dark"
  themeBtn.textContent = mode
  restyle(document, { appearance: mode })
}
document.querySelector("#count")!.textContent = `${n} stories`

const board = canvas(document.querySelector<HTMLElement>("#board")!, { items, label: "Components" })
Object.assign(window, { board })

// A frame-rate readout: frames the browser drew per second, and the worst gap between two.
if (params.has("perf")) {
  const hud = document.createElement("div")
  hud.className = "hud"
  document.body.append(hud)
  let last = performance.now()
  let count = 0
  let worst = 0
  let since = last
  const tick = (now: number) => {
    worst = Math.max(worst, now - last)
    last = now
    count++
    if (now - since > 500) {
      const s = board.stats()
      hud.textContent = `${Math.round((count * 1000) / (now - since))} fps · worst ${worst.toFixed(1)} ms\nscript p95 ${s.p95} ms · ${n} items · ${Math.round(board.view.scale * 100)}%`
      count = 0
      worst = 0
      since = now
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
