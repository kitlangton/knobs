import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  bezierCss,
  choice,
  color,
  defineControls,
  easing,
  knob,
  parseColor,
  spring,
  springCss,
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
  accent: color("oklch(0.7 0.13 250)", { label: "Accent", group: "Appearance" }),
  contrast: knob(1, {
    min: 0.6,
    max: 1.6,
    step: 0.05,
    label: "Contrast",
    group: "Appearance",
  }),
  glass: knob(0.6, {
    min: 0,
    max: 1,
    step: 0.05,
    label: "Glass",
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
    label: "Spacing",
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
    step: 50,
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
  roll: knob(420, {
    min: 0,
    max: 1000,
    step: 20,
    unit: "ms",
    label: "Roll speed",
    group: "Typography & Motion",
  }),
  cascade: knob(12, {
    min: 0,
    max: 40,
    step: 1,
    unit: "ms",
    label: "Preset cascade",
    group: "Typography & Motion",
  }),
  motion: spring(
    { duration: 0.24, bounce: 0.16 },
    { label: "Panel spring", group: "Typography & Motion" },
  ),
  reveal: easing([0.2, 0.8, 0.2, 1], { label: "Reveal curve", group: "Typography & Motion" }),
  dragRoll: toggle(false, { label: "Roll while dragging", group: "Typography & Motion" }),
  dragRollSpeed: knob(100, {
    min: 40,
    max: 400,
    step: 10,
    unit: "ms",
    label: "Drag roll speed",
    group: "Typography & Motion",
  }),
}

type MetaValues = Values<typeof metaSchema>

function resolveThemeIsLight(theme: MetaValues["theme"]): boolean {
  if (theme === "light") return true
  if (theme === "dark") return false
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches
}

/** Every token the meta panel controls, computed once for both live application and Copy CSS. */
function tokensFor(v: MetaValues): [string, string][] {
  const isLight = resolveThemeIsLight(v.theme)
  const c = v.contrast
  const rgb = isLight ? "0, 0, 0" : "255, 255, 255"
  const alpha = (light: number, dark: number) => ((isLight ? light : dark) * c).toFixed(3)
  // Light panels darken the accent so it keeps its contrast.
  const { l, c: chroma, h } = parseColor(v.accent)!
  const accent = isLight && l > 0.55 ? `oklch(0.55 ${chroma} ${h})` : v.accent
  const fill = springCss(v.motion)
  return [
    ["--k-bg", isLight ? "#f5f5f7" : "#1c1c1e"],
    ["--k-surface", `rgba(${rgb}, ${alpha(0.05, 0.055)})`],
    ["--k-surface-hi", `rgba(${rgb}, ${alpha(0.095, 0.11)})`],
    ["--k-line", `rgba(${rgb}, ${alpha(0.1, 0.1)})`],
    ["--k-line-hi", `rgba(${rgb}, ${alpha(0.2, 0.18)})`],
    ["--k-text", isLight ? "rgba(0, 0, 0, 0.88)" : "rgba(255, 255, 255, 0.92)"],
    ["--k-label", isLight ? "rgba(60, 60, 67, 0.68)" : "rgba(255, 255, 255, 0.64)"],
    ["--k-dim", isLight ? "rgba(60, 60, 67, 0.44)" : "rgba(255, 255, 255, 0.42)"],
    ["--k-modified", isLight ? "rgba(0, 0, 0, 0.42)" : "rgba(255, 255, 255, 0.5)"],
    ["--k-seg-bg", isLight ? "rgba(0, 0, 0, 0.065)" : "rgba(0, 0, 0, 0.26)"],
    ["--k-seg-active", isLight ? "#ffffff" : `rgba(255, 255, 255, ${(0.11 * c).toFixed(3)})`],
    ["--k-toggle-track", `rgba(${rgb}, 0.14)`],
    ["--k-accent", accent],
    ["--k-width", `${v.width}px`],
    ["--k-pad", `${v.pad}px`],
    ["--k-inset", `${v.inset}px`],
    ["--k-row", `${v.rowHeight}px`],
    ["--k-gap", `${v.rowGap}px`],
    ["--k-radius", `${v.radius}px`],
    ["--k-panel-radius", `${v.panelRadius}px`],
    ["--k-font-size", `${v.fontSize}px`],
    ["--k-label-weight", String(v.labelWeight)],
    ["--k-blur", String(v.motionBlur)],
    ["--k-glow", String(v.glow)],
    ["--k-roll", String(v.roll)],
    ["--k-drag-roll", String(v.dragRoll ? v.dragRollSpeed : 0)],
    ["--k-cascade", String(v.cascade)],
    ["--k-glass", String(v.glass)],
    ["--k-reveal-ease", bezierCss(v.reveal)],
    // Values settle on this spring: the GPU reads --k-spring, CSS transitions its linear() twin.
    ["--k-spring", `${v.motion.duration} ${v.motion.bounce}`],
    ["--k-fill-ease", fill.easing],
    ["--k-fill-ms", String(fill.duration)],
  ]
}

export function formatTokensCss(v: MetaValues): string {
  return [":root {", ...tokensFor(v).map(([k, val]) => `  ${k}: ${val};`), "}"].join("\n")
}

// Tokens go on the panels too, so they win over the built-in light theme's own values.
function applyTokensToDocument(v: MetaValues) {
  const root = document.documentElement
  root.dataset.knobsTheme = resolveThemeIsLight(v.theme) ? "light" : "dark"
  let style = document.querySelector<HTMLStyleElement>("style[data-meta-tokens]")
  if (!style) {
    style = document.createElement("style")
    style.dataset.metaTokens = ""
    document.head.append(style)
  }
  const body = tokensFor(v)
    .map(([k, val]) => `${k}:${val};`)
    .join("")
  style.textContent = `:root,:root .knobs-panel,:root .knobs-chip{${body}}`
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
      accent: "oklch(0.56 0.15 45)",
      contrast: 1.05,
      radius: 8,
      panelRadius: 12,
    },
    terminal: {
      theme: "dark",
      accent: "oklch(0.82 0.19 148)",
      contrast: 1.35,
      radius: 2,
      panelRadius: 4,
      rowHeight: 28,
      rowGap: 3,
      fontSize: 11.5,
    },
    cobalt: {
      theme: "dark",
      accent: "oklch(0.66 0.18 262)",
      contrast: 1.15,
      glow: 1.1,
      motionBlur: 1.5,
    },
    solid: { glass: 0 },
    frost: { glass: 1, contrast: 1.1 },
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
