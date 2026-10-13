import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  choice,
  defineControls,
  knob,
  toggle,
  urlFlag,
  type RendererMode,
  type Values,
} from "knobs"
import { Knobs, KnobsPanel, useControls } from "knobs/react"
import "./style.css"

const metaSchema = {
  theme: choice("dark", ["dark", "light", "auto"], {
    label: "Theme",
    group: "Appearance",
  }),
  accentHue: knob(210, {
    min: 0,
    max: 360,
    step: 1,
    unit: "°",
    label: "Accent hue",
    group: "Appearance",
  }),
  accentChroma: knob(0, {
    min: 0,
    max: 100,
    step: 2,
    unit: "%",
    label: "Accent chroma",
    group: "Appearance",
  }),
  contrast: knob(1, {
    min: 0.6,
    max: 1.6,
    step: 0.05,
    label: "Contrast",
    group: "Appearance",
  }),
  width: knob(288, {
    min: 232,
    max: 384,
    step: 4,
    unit: "px",
    label: "Panel width",
    group: "Geometry",
  }),
  pad: knob(10, {
    min: 6,
    max: 20,
    step: 1,
    unit: "px",
    label: "Panel padding",
    group: "Geometry",
  }),
  inset: knob(10, {
    min: 6,
    max: 18,
    step: 1,
    unit: "px",
    label: "Row inset",
    group: "Geometry",
  }),
  rowHeight: knob(32, {
    min: 24,
    max: 44,
    step: 2,
    unit: "px",
    label: "Row height",
    group: "Geometry",
  }),
  rowGap: knob(4, {
    min: 2,
    max: 12,
    step: 1,
    unit: "px",
    label: "Row gap",
    group: "Geometry",
  }),
  radius: knob(8, {
    min: 0,
    max: 18,
    step: 1,
    unit: "px",
    label: "Control radius",
    group: "Geometry",
  }),
  panelRadius: knob(12, {
    min: 0,
    max: 24,
    step: 1,
    unit: "px",
    label: "Panel radius",
    group: "Geometry",
  }),
  fontSize: knob(12, {
    min: 10.5,
    max: 15,
    step: 0.5,
    unit: "px",
    label: "Font size",
    group: "Typography & Motion",
  }),
  labelWeight: knob(500, {
    min: 400,
    max: 700,
    step: 100,
    label: "Label weight",
    group: "Typography & Motion",
  }),
  motionBlur: knob(1, {
    min: 0,
    max: 2,
    step: 0.1,
    label: "Motion & blur",
    group: "Typography & Motion",
  }),
  glow: knob(0.5, {
    min: 0,
    max: 1.5,
    step: 0.1,
    label: "Focus glow",
    group: "Typography & Motion",
  }),
}

type MetaValues = Values<typeof metaSchema>

function resolveThemeIsLight(theme: MetaValues["theme"]): boolean {
  if (theme === "light") return true
  if (theme === "dark") return false
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches
}

export function formatTokensCss(v: MetaValues): string {
  const isLight = resolveThemeIsLight(v.theme)
  const c = v.contrast
  const bg = isLight ? "#f5f5f7" : "#1c1c1e"
  const surfAlpha = Number(((isLight ? 0.05 : 0.055) * c).toFixed(3))
  const surfHiAlpha = Number(((isLight ? 0.095 : 0.11) * c).toFixed(3))
  const lineAlpha = Number((0.1 * c).toFixed(3))
  const lineHiAlpha = Number(((isLight ? 0.2 : 0.18) * c).toFixed(3))
  const baseRgb = isLight ? "0, 0, 0" : "255, 255, 255"
  const accent =
    v.accentChroma === 0
      ? isLight
        ? "#1c1c1e"
        : "#ffffff"
      : `hsl(${v.accentHue} ${Math.min(95, Math.round(v.accentChroma * 0.9))}% ${isLight ? 44 : 64}%)`

  return [
    ":root {",
    `  --k-bg: ${bg};`,
    `  --k-surface: rgba(${baseRgb}, ${surfAlpha});`,
    `  --k-surface-hi: rgba(${baseRgb}, ${surfHiAlpha});`,
    `  --k-line: rgba(${baseRgb}, ${lineAlpha});`,
    `  --k-line-hi: rgba(${baseRgb}, ${lineHiAlpha});`,
    `  --k-accent: ${accent};`,
    `  --k-width: ${v.width}px;`,
    `  --k-pad: ${v.pad}px;`,
    `  --k-inset: ${v.inset}px;`,
    `  --k-row: ${v.rowHeight}px;`,
    `  --k-gap: ${v.rowGap}px;`,
    `  --k-radius: ${v.radius}px;`,
    `  --k-panel-radius: ${v.panelRadius}px;`,
    `  --k-font-size: ${v.fontSize}px;`,
    `  --k-label-weight: ${v.labelWeight};`,
    `  --k-blur: ${v.motionBlur};`,
    `  --k-glow: ${v.glow};`,
    "}",
  ].join("\n")
}

function applyTokensToDocument(v: MetaValues) {
  const root = document.documentElement
  const isLight = resolveThemeIsLight(v.theme)
  const c = v.contrast
  const baseRgb = isLight ? "0, 0, 0" : "255, 255, 255"
  const accent =
    v.accentChroma === 0
      ? isLight
        ? "#1c1c1e"
        : "#ffffff"
      : `hsl(${v.accentHue} ${Math.min(95, Math.round(v.accentChroma * 0.9))}% ${isLight ? 44 : 64}%)`

  root.dataset.knobsTheme = isLight ? "light" : "dark"
  root.style.setProperty("--k-bg", isLight ? "#f5f5f7" : "#1c1c1e")
  root.style.setProperty(
    "--k-surface",
    `rgba(${baseRgb}, ${((isLight ? 0.05 : 0.055) * c).toFixed(3)})`,
  )
  root.style.setProperty(
    "--k-surface-hi",
    `rgba(${baseRgb}, ${((isLight ? 0.095 : 0.11) * c).toFixed(3)})`,
  )
  root.style.setProperty("--k-line", `rgba(${baseRgb}, ${(0.1 * c).toFixed(3)})`)
  root.style.setProperty(
    "--k-line-hi",
    `rgba(${baseRgb}, ${((isLight ? 0.2 : 0.18) * c).toFixed(3)})`,
  )
  root.style.setProperty("--k-text", isLight ? "rgba(0, 0, 0, 0.88)" : "rgba(255, 255, 255, 0.92)")
  root.style.setProperty(
    "--k-label",
    isLight ? "rgba(60, 60, 67, 0.68)" : "rgba(255, 255, 255, 0.64)",
  )
  root.style.setProperty(
    "--k-dim",
    isLight ? "rgba(60, 60, 67, 0.44)" : "rgba(255, 255, 255, 0.42)",
  )
  root.style.setProperty("--k-seg-bg", isLight ? "rgba(0, 0, 0, 0.065)" : "rgba(0, 0, 0, 0.26)")
  root.style.setProperty(
    "--k-seg-active",
    isLight ? "#ffffff" : `rgba(255, 255, 255, ${(0.11 * c).toFixed(3)})`,
  )
  root.style.setProperty("--k-toggle-track", `rgba(${baseRgb}, 0.14)`)
  root.style.setProperty("--k-accent", accent)
  root.style.setProperty("--k-width", `${v.width}px`)
  root.style.setProperty("--k-pad", `${v.pad}px`)
  root.style.setProperty("--k-inset", `${v.inset}px`)
  root.style.setProperty("--k-row", `${v.rowHeight}px`)
  root.style.setProperty("--k-gap", `${v.rowGap}px`)
  root.style.setProperty("--k-radius", `${v.radius}px`)
  root.style.setProperty("--k-panel-radius", `${v.panelRadius}px`)
  root.style.setProperty("--k-font-size", `${v.fontSize}px`)
  root.style.setProperty("--k-label-weight", String(v.labelWeight))
  root.style.setProperty("--k-blur", String(v.motionBlur))
  root.style.setProperty("--k-glow", String(v.glow))
}

const knobsMeta = defineControls("knobs-tokens", metaSchema, {
  enabled: true,
  presets: {
    compact: {
      width: 260,
      pad: 8,
      inset: 8,
      rowHeight: 26,
      rowGap: 3,
      radius: 6,
      panelRadius: 10,
      fontSize: 11,
    },
    airy: {
      width: 320,
      pad: 14,
      inset: 12,
      rowHeight: 38,
      rowGap: 7,
      radius: 10,
      panelRadius: 16,
      fontSize: 13,
    },
    paper: {
      theme: "light",
      accentHue: 24,
      accentChroma: 76,
      contrast: 1.05,
      radius: 8,
      panelRadius: 12,
    },
    terminal: {
      theme: "dark",
      accentHue: 145,
      accentChroma: 84,
      contrast: 1.35,
      radius: 2,
      panelRadius: 4,
      rowHeight: 28,
      rowGap: 3,
      fontSize: 11.5,
    },
    cobalt: {
      theme: "dark",
      accentHue: 222,
      accentChroma: 90,
      contrast: 1.15,
      glow: 1.1,
      motionBlur: 1.5,
    },
  },
  actions: [
    {
      label: "Copy CSS",
      run: async (values) => {
        const cssText = formatTokensCss(values)
        try {
          await navigator.clipboard.writeText(cssText)
          return "Copied CSS tokens."
        } catch {
          return "Updated CSS tokens."
        }
      },
    },
  ],
})

const synthSpecimen = defineControls(
  "synth-voice",
  {
    cutoff: knob(2400, {
      min: 80,
      max: 12000,
      step: 20,
      unit: "Hz",
      label: "Filter cutoff",
      group: "Filter",
    }),
    resonance: knob(0.42, { min: 0, max: 1, step: 0.02, label: "Resonance", group: "Filter" }),
    drive: knob(18, { min: 0, max: 100, step: 1, unit: "%", label: "Drive", group: "Filter" }),
    waveform: choice("saw", ["sine", "tri", "saw", "pulse"], {
      label: "Waveform",
      group: "Oscillator",
    }),
    detune: knob(12, {
      min: -50,
      max: 50,
      step: 1,
      unit: "ct",
      label: "Detune",
      group: "Oscillator",
    }),
    chorus: toggle(true, { label: "Stereo chorus", group: "Oscillator" }),
  },
  {
    enabled: true,
    presets: {
      warm: { cutoff: 960, resonance: 0.28, drive: 32, waveform: "saw", chorus: true },
      acid: { cutoff: 4200, resonance: 0.86, drive: 64, waveform: "pulse", chorus: false },
      glass: { cutoff: 6800, resonance: 0.18, drive: 6, waveform: "tri", chorus: true },
    },
  },
)

function SynthVisualizer() {
  const s = useControls(synthSpecimen)
  const points: string[] = []
  const w = 480
  const h = 150
  for (let i = 0; i <= 120; i++) {
    const u = i / 120
    const freq = 2 + (s.cutoff / 12000) * 8
    const phase = u * Math.PI * 2 * freq
    let y = Math.sin(phase)
    if (s.waveform === "saw") y = 2 * (u * freq - Math.floor(0.5 + u * freq))
    else if (s.waveform === "pulse") y = Math.sin(phase) >= 0 ? 0.85 : -0.85
    else if (s.waveform === "tri") y = (2 / Math.PI) * Math.asin(Math.sin(phase))
    const resPeak = Math.exp(-Math.pow((u - 0.35) / 0.14, 2)) * s.resonance * 0.65
    const shaped = Math.tanh((y + resPeak * Math.sin(phase * 2.5)) * (1 + s.drive / 45))
    const px = u * w
    const py = h * 0.5 - shaped * (h * 0.34)
    points.push(`${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return (
    <Knobs controls={synthSpecimen}>
      <div className="meta-specimen-card" data-specimen="synth">
        <div className="meta-specimen-head">
          <span>synth-voice</span>
          <span>
            {s.waveform} · {s.cutoff} Hz · hover for floating chip
          </span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="meta-wave" aria-label="Synth waveform">
          <path d={points.join(" ")} fill="none" stroke="var(--k-accent)" strokeWidth="2.2" />
        </svg>
      </div>
    </Knobs>
  )
}

function MetaApp() {
  const v = useControls(knobsMeta)
  const [rendererMode, setRendererMode] = useState<RendererMode>(() =>
    urlFlag("gpu")() ? "gpu" : "auto",
  )

  useEffect(() => {
    applyTokensToDocument(v)
  }, [v])

  useEffect(() => {
    if (rendererMode === "gpu") {
      document.documentElement.dataset.knobsRenderer = "gpu"
    } else if (rendererMode === "dom") {
      document.documentElement.dataset.knobsRenderer = "dom"
    } else {
      delete document.documentElement.dataset.knobsRenderer
    }
  }, [rendererMode])

  const cssText = formatTokensCss(v)
  const resolvedTheme = v.theme === "auto" ? "auto" : v.theme

  return (
    <main className="meta-main">
      <header className="masthead">
        <a href="/">
          knobs<span> / meta</span>
        </a>
        <span className="masthead-links">
          <a href="/">studies</a>
          <span className="sep">·</span>
          <span className="workbench-pills" role="group" aria-label="Renderer mode">
            {(["dom", "gpu"] as const).map((m) => {
              const active =
                rendererMode === m ||
                (rendererMode === "auto" && (urlFlag("gpu")() ? "gpu" : "dom") === m)
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setRendererMode(m)}
                >
                  {m}
                </button>
              )
            })}
          </span>
        </span>
      </header>

      <section className="meta-grid">
        <div className="meta-col">
          <KnobsPanel
            controls={knobsMeta}
            title="knobs-tokens"
            theme={resolvedTheme}
            renderer={rendererMode}
          />
        </div>
        <div className="meta-col meta-stage">
          <div className="meta-preview-row">
            <KnobsPanel
              controls={synthSpecimen}
              title="synth-voice"
              theme={resolvedTheme}
              renderer={rendererMode}
            />
            <div className="meta-output-col">
              <SynthVisualizer />
              <pre className="swift-out" data-css-output>
                {cssText}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MetaApp />
  </StrictMode>,
)
