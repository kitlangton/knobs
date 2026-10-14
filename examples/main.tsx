import { StrictMode, useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  bezierCss,
  color,
  createRemoteControls,
  defineControls,
  easing,
  knob,
  choice,
  point,
  spring,
  springCss,
  springMotion,
  toggle,
  urlFlag,
  type SpringValue,
  type DensityMode,
  type RendererMode,
  type ThemeMode,
} from "knobs"
import { Knobs, KnobsPanel, useControls, VariantSwitcher } from "knobs/react"
import "./style.css"
import { KnobsHint } from "./hint"

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
    enabled: import.meta.env.DEV || import.meta.env.MODE === "site",
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
    enabled: import.meta.env.DEV || import.meta.env.MODE === "site",
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
    enabled: import.meta.env.DEV || import.meta.env.MODE === "site",
    presets: { editorial: { size: 64, tracking: -2, weight: 400, flavor: "italic" } },
  },
)

const motion = defineControls(
  "motion",
  {
    travel: spring({ duration: 0.55, bounce: 0.3 }, { label: "Travel" }),
    curve: easing("snappy", { label: "Curve" }),
    target: point({ x: 0.55, y: -0.35 }, { min: -1, max: 1, step: 0.01, label: "Target" }),
    tint: color("oklch(0.7 0.16 40)", { label: "Tint" }),
  },
  {
    enabled: import.meta.env.DEV || import.meta.env.MODE === "site",
    presets: {
      lazy: {
        travel: { duration: 1.1, bounce: 0 },
        curve: [0.42, 0, 0.58, 1],
        target: { x: 0.2, y: 0.6 },
        tint: "oklch(0.74 0.11 200)",
      },
      jelly: {
        travel: { duration: 0.45, bounce: 0.6 },
        curve: [0.34, 1.56, 0.64, 1],
        target: { x: -0.5, y: 0.35 },
        tint: "oklch(0.72 0.17 340)",
      },
    },
  },
)

function Motion() {
  const v = useControls(motion)
  const [away, setAway] = useState(false)
  // Both dots shuttle between home and the target: one on the spring, one on the curve.
  useEffect(() => {
    const id = setInterval(() => setAway((a) => !a), 1600)
    return () => clearInterval(id)
  }, [])
  const spring = springCss(v.travel)
  const at = (on: boolean) =>
    on ? `translate(${v.target.x * 38}cqw, ${v.target.y * 34}cqh)` : "translate(0, 0)"
  return (
    <Knobs controls={motion}>
      <article className="study" data-study="motion">
        <div className="art motion" style={{ ["--tint" as string]: v.tint }}>
          <div className="motion-field" data-render={JSON.stringify(v)}>
            <span className="motion-target" style={{ transform: at(true) }} />
            <span
              className="motion-dot motion-spring"
              style={{
                transform: at(away),
                transition: `transform ${spring.duration}ms ${spring.easing}`,
              }}
            />
            <span
              className="motion-dot motion-curve"
              style={{
                transform: at(away),
                transition: `transform 700ms ${bezierCss(v.curve)}`,
              }}
            />
          </div>
          <span className="art-mark">04</span>
        </div>
        <div className="caption">
          <h2>Motion / feel</h2>
          <p>
            Spring {v.travel.duration}s · bounce {v.travel.bounce}
          </p>
        </div>
      </article>
    </Knobs>
  )
}
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
const remoteTune = createRemoteControls(
  "remote-tune",
  [
    {
      key: "drawer.spring",
      label: "Drawer",
      kind: "spring",
      default: { duration: 0.4, bounce: 0.25 },
      group: "Motion",
      shortcut: "d",
    },
    {
      key: "drawer.fade",
      label: "Fade curve",
      kind: "easing",
      default: [0.25, 0.1, 0.25, 1],
      group: "Motion",
    },
    {
      key: "drawer.edge.fade",
      label: "Edge fade",
      kind: "number",
      swiftType: "Double",
      default: 16,
      min: 0,
      max: 40,
      step: 1,
      unit: "pt",
      group: "Surface",
    },
    { key: "composer.tint", label: "Tint", kind: "color", default: "#0a84ff", group: "Surface" },
    {
      key: "composer.anchor",
      label: "Anchor",
      kind: "point",
      default: { x: 0.5, y: 1 },
      min: 0,
      max: 1,
      step: 0.01,
      group: "Surface",
    },
    {
      key: "composer.chrome",
      label: "Chrome",
      kind: "choice",
      swiftType: "ChromeStyle",
      default: "glass",
      choices: ["glass", "solid", "matte"],
      group: "Surface",
    },
    {
      key: "composer.haptics",
      label: "Haptics",
      kind: "bool",
      swiftType: "Bool",
      default: true,
      group: "Surface",
    },
  ],
  {
    enabled: import.meta.env.DEV || import.meta.env.MODE === "site",
    values: { "drawer.spring": { duration: 0.45, bounce: 0.25 }, "drawer.edge.fade": 24 },
    presets: {
      snappy: { "drawer.spring": { duration: 0.25, bounce: 0.35 } },
      gentle: { "drawer.spring": { duration: 0.65, bounce: 0.1 } },
    },
    actions: [
      {
        label: "Copy as Swift",
        run: async () => {
          const code = remoteTune.swift() || "// All values at default"
          try {
            await navigator.clipboard.writeText(code)
            return "Copied Swift."
          } catch {
            return "Updated Swift preview."
          }
        },
      },
    ],
  },
)

function springCurvePath(value: SpringValue, w = 320, h = 110): string {
  const { omega, zeta } = springMotion(value)
  const pts: string[] = []
  const steps = 80
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 1.1
    let y = 1
    if (zeta < 1) {
      const wd = omega * Math.sqrt(1 - zeta * zeta)
      y =
        1 -
        Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t))
    } else if (zeta === 1) {
      y = 1 - (1 + omega * t) * Math.exp(-omega * t)
    } else {
      const r = Math.sqrt(zeta * zeta - 1)
      const r1 = -omega * (zeta - r)
      const r2 = -omega * (zeta + r)
      y = 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1)
    }
    const px = (i / steps) * w
    const py = h - 22 - y * (h - 48)
    pts.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return pts.join(" ")
}

function Workbench({ renderer }: { renderer: RendererMode }) {
  const v = useControls(remoteTune)
  const [panelTheme, setPanelTheme] = useState<ThemeMode>("dark")
  const [density, setDensity] = useState<DensityMode>("default")
  const drawer = v["drawer.spring"] as SpringValue
  const swiftOut = remoteTune.swift() || "// Default constants"

  return (
    <section className="workbench">
      <div className="workbench-controls">
        <div className="workbench-pills">
          {(["dark", "light", "auto"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={panelTheme === t}
              onClick={() => setPanelTheme(t)}
            >
              {t}
            </button>
          ))}
          <span className="sep">·</span>
          {(["compact", "default", "comfortable"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={density === d}
              onClick={() => setDensity(d)}
            >
              {d}
            </button>
          ))}
        </div>
        <KnobsPanel
          controls={remoteTune}
          theme={panelTheme}
          density={density}
          renderer={renderer}
          variants={false}
        />
      </div>
      <div className="workbench-stage">
        <svg viewBox="0 0 320 110" className="spring-viz" aria-label="Spring response">
          <line
            x1="0"
            y1="40"
            x2="320"
            y2="40"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeDasharray="3 3"
          />
          <path
            d={springCurvePath(drawer)}
            fill="none"
            stroke={v["composer.tint"] as string}
            strokeWidth="2"
          />
        </svg>
        <pre className="swift-out">{swiftOut}</pre>
      </div>
    </section>
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
  const [renderer, setRenderer] = useState<RendererMode>(() => (urlFlag("gpu")() ? "gpu" : "auto"))
  useEffect(() => {
    if (renderer === "gpu") {
      document.documentElement.dataset.knobsRenderer = "gpu"
    } else if (renderer === "dom") {
      document.documentElement.dataset.knobsRenderer = "dom"
    } else {
      delete document.documentElement.dataset.knobsRenderer
    }
  }, [renderer])
  const isGpu = renderer === "gpu" || (renderer === "auto" && urlFlag("gpu")())
  return (
    <main>
      <header className="masthead">
        <a href="#">
          knobs<span> / an instrument for the web</span>
        </a>
        <span className="masthead-links">
          <a href="/meta.html">meta</a>
          <button
            type="button"
            className="theme"
            aria-pressed={isGpu}
            onClick={() => setRenderer(isGpu ? "dom" : "gpu")}
            aria-label="Toggle GPU renderer"
          >
            {isGpu ? "◆ gpu" : "◇ dom"}
          </button>
          <button type="button" className="theme" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? "☾ dark" : "☼ light"}
          </button>
        </span>
      </header>
      <section className="intro">
        <p className="eyebrow">COMPONENT STUDIES / 001—004</p>
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
        <Motion />
      </div>
      {(import.meta.env.DEV || import.meta.env.MODE === "site") && (
        <Workbench renderer={renderer} />
      )}
      <footer>
        <span>RANDOMIZE · RESET · SAVE · SWITCH · COPY</span>
        <span>Explore in development. Ship constants.</span>
      </footer>
      <KnobsHint />
    </main>
  )
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
