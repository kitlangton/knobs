import { choice, color, knob, toggle, type Values } from "knobs"
import { KnobsPanel, useControls } from "knobs/react"
import { useLayoutEffect, useRef } from "react"
import { demoControls } from "../demos/Demo"
import { copy } from "../site"

const lookSchema = {
  theme: choice("auto", ["auto", "dark", "light"], { label: "Theme", group: "Mode" }),
  density: choice("default", ["compact", "default", "comfortable"], {
    label: "Density",
    group: "Mode",
  }),
  renderer: choice("auto", ["auto", "dom", "gpu"], { label: "Renderer", group: "Mode" }),
  accent: color("oklch(0.72 0.15 250)", { label: "Accent", group: "Tokens" }),
  glass: knob(0.6, { min: 0, max: 1, step: 0.05, label: "Glass", group: "Tokens" }),
  radius: knob(8, { min: 0, max: 18, step: 1, unit: "px", label: "Radius", group: "Tokens" }),
  width: knob(288, { min: 240, max: 360, step: 4, unit: "px", label: "Width", group: "Tokens" }),
  roll: knob(320, {
    min: 0,
    max: 900,
    step: 20,
    unit: "ms",
    label: "Readout roll",
    group: "Tokens",
  }),
}
type Look = Values<typeof lookSchema>

const lookTokens = (v: Look): [string, string][] => [
  ["--k-accent", v.accent],
  ["--k-glass", String(v.glass)],
  ["--k-radius", `${v.radius}px`],
  ["--k-panel-radius", `${v.radius + 4}px`],
  ["--k-width", `${v.width}px`],
  ["--k-roll", String(v.roll)],
]

const look = demoControls("panel-look", lookSchema, {
  presets: {
    paper: { theme: "light", accent: "oklch(0.56 0.15 45)", radius: 6, glass: 0 },
    terminal: { theme: "dark", accent: "oklch(0.82 0.19 148)", radius: 2, density: "compact" },
    roomy: { density: "comfortable", width: 340, radius: 12 },
  },
  actions: [
    {
      label: "Copy CSS",
      run: (v) =>
        copy(
          [".knobs-panel {", ...lookTokens(v).map(([k, val]) => `  ${k}: ${val};`), "}"].join("\n"),
          "Copied the panel tokens.",
        ),
    },
  ],
})

// A new renderer means a new panel, which can't glide from the old one, so Random and Mutate leave
// the renderer alone until you unlock it (⇧L on the row).
if (typeof localStorage !== "undefined" && !localStorage.getItem("knobs:panel-look:state:v1"))
  look.lock("renderer")

const specimen = demoControls(
  "synth-voice",
  {
    cutoff: knob(2400, {
      min: 80,
      max: 12000,
      step: 20,
      unit: "Hz",
      label: "Cutoff",
      group: "Filter",
    }),
    resonance: knob(0.42, { min: 0, max: 1, step: 0.02, label: "Resonance", group: "Filter" }),
    waveform: choice("saw", ["sine", "tri", "saw"], { label: "Waveform", group: "Oscillator" }),
    chorus: toggle(true, { label: "Chorus", group: "Oscillator" }),
    tone: color("oklch(0.7 0.13 300)", { label: "Tone", group: "Oscillator" }),
  },
  { presets: { warm: { cutoff: 960, resonance: 0.28 }, acid: { cutoff: 4200, resonance: 0.86 } } },
)

export default function Specimen() {
  const v = useControls(look)
  const host = useRef<HTMLDivElement>(null)
  // Tokens go on the panel element itself, so they win over its theme's own values.
  useLayoutEffect(() => {
    const node = host.current
    if (!node) return
    const apply = () => {
      const panel = node.querySelector<HTMLElement>(".knobs-panel")
      if (!panel) return
      for (const [k, val] of lookTokens(v)) panel.style.setProperty(k, val)
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(node, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [v])
  return (
    <div className="demo theming-demo">
      <div className="demo-panel">
        <KnobsPanel controls={look} theme="auto" density="compact" title="Panel look" />
      </div>
      <div className="demo-stage specimen-stage" ref={host}>
        <KnobsPanel
          controls={specimen}
          theme={v.theme}
          density={v.density}
          renderer={v.renderer}
          variants={false}
        />
      </div>
    </div>
  )
}
