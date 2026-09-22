import { StrictMode, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { defineControls, knob, choice, toggle } from "knobs"
import { Knobs, useControls, VariantSwitcher } from "knobs/react"
import "./style.css"

const splat = defineControls(
  "splat",
  {
    seed: knob(22, { min: 1, max: 99, step: 1, shortcut: "s" }),
    count: knob(98, { min: 0, max: 300, step: 1, shortcut: "c" }),
    size: knob(7, { min: 1, max: 30, step: 0.5, unit: "px" }),
    flavor: choice("inked", ["inked", "clean"]),
    grain: toggle(true),
  },
  {
    enabled: import.meta.env.DEV,
    presets: { subtle: { count: 40, size: 4 }, heavy: { count: 210, size: 12 } },
  },
)
const dots = defineControls(
  "halftone",
  {
    cells: knob(22, { min: 8, max: 44, step: 1, shortcut: "c" }),
    radius: knob(4, { min: 1, max: 8, step: 0.5, unit: "px" }),
    phase: knob(1.2, { min: 0, max: 6, step: 0.1, shortcut: "p" }),
    invert: toggle(false),
  },
  {
    enabled: import.meta.env.DEV,
    presets: { dense: { cells: 38, radius: 3 }, sparse: { cells: 12, radius: 5 } },
  },
)
const type = defineControls(
  "typography",
  {
    size: knob(76, { min: 36, max: 100, step: 1, unit: "px", shortcut: "s" }),
    tracking: knob(-5, { min: -8, max: 8, step: 0.5, unit: "px" }),
    weight: knob(800, { min: 100, max: 900, step: 100 }),
    flavor: choice("tight", ["tight", "open", "italic"]),
  },
  {
    enabled: import.meta.env.DEV,
    presets: { editorial: { size: 64, tracking: -2, weight: 400, flavor: "italic" } },
  },
)

function Splatter() {
  const v = useControls(splat)
  let seed = v.seed
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const drops = Array.from({ length: v.count }, (_, i) => {
    const angle = random() * Math.PI * 2,
      distance = random() ** 0.6 * 138
    return (
      <ellipse
        key={i}
        cx={180 + Math.cos(angle) * distance}
        cy={155 + Math.sin(angle) * distance * 0.86}
        rx={v.size * (0.15 + random())}
        ry={v.size * (0.2 + random())}
        opacity={v.grain ? 0.5 + random() * 0.5 : 1}
      />
    )
  })
  return (
    <Knobs controls={splat}>
      <article className="study" data-study="splat">
        <div className="art splat">
          <svg
            viewBox="0 0 360 310"
            role="img"
            aria-label="Seeded ink splatter"
            data-render={JSON.stringify(v)}
          >
            <g
              fill={v.flavor === "inked" ? "var(--ink-panel-fg)" : "var(--accent)"}
              opacity={v.flavor === "inked" ? 0.85 : 1}
            >
              {drops}
            </g>
          </svg>
          <span className="art-mark">01</span>
        </div>
        <div className="caption">
          <h2>Ink / chance</h2>
          <p>Seeded splatter · {v.count} impressions</p>
        </div>
      </article>
    </Knobs>
  )
}
function Halftone() {
  const v = useControls(dots)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, 720, 620)
    const css = getComputedStyle(document.documentElement)
    const paper = css.getPropertyValue("--bg").trim() || "#dcd5bf"
    const ink = css.getPropertyValue("--fg").trim() || "#272821"
    ctx.fillStyle = v.invert ? ink : paper
    ctx.fillRect(0, 0, 720, 620)
    ctx.fillStyle = v.invert ? paper : ink
    const step = 720 / v.cells
    for (let x = step / 2; x < 720; x += step)
      for (let y = step / 2; y < 620; y += step) {
        const wave = (Math.sin(Math.hypot(x - 340, y - 270) / 60 + v.phase) + 1.2) / 2.2
        ctx.beginPath()
        ctx.arc(x, y, v.radius * 2 * wave + 0.5, 0, Math.PI * 2)
        ctx.fill()
      }
  }, [v])
  return (
    <Knobs controls={dots}>
      <article className="study" data-study="halftone">
        <div className="art halftone">
          <canvas
            width={720}
            height={620}
            ref={canvas}
            aria-label="Radial halftone pattern"
            data-render={JSON.stringify(v)}
          />
          <span className="art-mark">02</span>
        </div>
        <div className="caption">
          <h2>Signal / surface</h2>
          <p>Halftone field · {v.cells} columns</p>
        </div>
      </article>
    </Knobs>
  )
}
function Typography() {
  const v = useControls(type)
  return (
    <Knobs controls={type}>
      <article className="study" data-study="typography">
        <div className="art type">
          <VariantSwitcher controls={type} field="flavor">
            <div
              className="type-specimen"
              data-render={JSON.stringify(v)}
              style={{
                fontSize: v.size,
                letterSpacing: v.tracking,
                fontWeight: v.weight,
                fontStyle: v.flavor === "italic" ? "italic" : "normal",
                lineHeight: v.flavor === "open" ? 1.2 : 0.9,
              }}
            >
              Make
              <br />
              room
              <br />
              for play.
            </div>
          </VariantSwitcher>
          <span className="art-mark">03</span>
        </div>
        <div className="caption">
          <h2>Type / temperament</h2>
          <p>{v.flavor} · Hover text, then press 1–3</p>
        </div>
      </article>
    </Knobs>
  )
}
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("knobs-example-theme")
    if (saved === "light" || saved === "dark") return saved
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem("knobs-example-theme", theme)
  }, [theme])
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))] as const
}
function App() {
  const [theme, toggleTheme] = useTheme()
  return (
    <main>
      <header className="masthead">
        <a href="#">
          knobs<span> / an instrument for the web</span>
        </a>
        <span>
          Kit Langton · 2026
          <button type="button" className="theme" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☾ dark" : "☼ light"}
          </button>
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">COMPONENT STUDIES / 001—003</p>
        <h1>
          A little room
          <br />
          to <em>tune.</em>
        </h1>
        <p className="lede">
          Hover a study. Open its knobs.
          <br />
          Find something worth keeping.
        </p>
      </section>
      <div className="studies">
        <Splatter />
        <Halftone />
        <Typography />
      </div>
      <footer>
        <span>RANDOMIZE · RESET · SAVE · SWITCH · COPY</span>
        <span>Explore in development. Ship constants.</span>
      </footer>
    </main>
  )
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
