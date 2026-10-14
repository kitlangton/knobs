import { choice, color, knob, toggle, type Values } from "knobs"
import { KnobsPanel, useControls } from "knobs/react"
import { useLayoutEffect, useRef } from "react"
import { C, Code } from "../Code"
import { demoControls } from "../demos/Demo"
import { Link } from "../router"
import { copy } from "../site"
import { Section } from "../section"

const lookSchema = {
  theme: choice("auto", ["auto", "dark", "light"], { label: "Theme", group: "Mode" }),
  density: choice("default", ["compact", "default", "comfortable"], {
    label: "Density",
    group: "Mode",
  }),
  renderer: choice("dom", ["dom", "gpu"], { label: "Renderer", group: "Mode" }),
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
  tokens: toggle(true, { label: "Apply tokens", group: "Tokens" }),
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

function Specimen() {
  const v = useControls(look)
  const host = useRef<HTMLDivElement>(null)
  // Tokens go on the panel element itself, so they win over its theme's own values.
  useLayoutEffect(() => {
    const node = host.current
    if (!node) return
    const apply = () => {
      const panel = node.querySelector<HTMLElement>(".knobs-panel")
      if (!panel) return
      for (const [k, val] of lookTokens(v)) {
        if (v.tokens) panel.style.setProperty(k, val)
        else panel.style.removeProperty(k)
      }
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

const tokenRows: [string, string][] = [
  ["--k-bg, --k-surface, --k-line", "Panel, row and divider colours"],
  ["--k-text, --k-label, --k-accent", "Text, labels and the accent used by fills and pills"],
  ["--k-width, --k-pad, --k-row, --k-gap", "Panel width, padding, row height and spacing"],
  ["--k-radius, --k-panel-radius", "Control and panel corners"],
  ["--k-font-size, --k-label-weight", "Type size and label weight"],
  ["--k-glass, --k-glass-tone", "How much the panel thins over a blurred backdrop"],
  ["--k-blur, --k-glow", "Motion strength (blur, rubber band, pill stretch) and focus glow"],
  ["--k-roll, --k-drag-roll", "Readout roll time, and while dragging"],
  ["--k-cascade", "Delay between rows when a preset ripples through"],
  ["--k-spring, --k-fill-ease, --k-fill-ms", "The spring values settle on, and its CSS twin"],
]

export default function Theming() {
  return (
    <>
      <Section
        title="Theming and tokens"
        level={1}
        lede="Panels take a theme, a density and a renderer, and every measurement and colour in them is a CSS custom property you can override."
      >
        <p>
          The panel on the left tunes the panel on the right: its theme, density and renderer props,
          and a handful of its tokens written onto the panel element.
        </p>
        <Specimen />
      </Section>

      <Section title="Theme and density">
        <p>
          <C>theme</C> is <C>"dark"</C>, <C>"light"</C> or <C>"auto"</C>, which follows a{" "}
          <C>data-theme</C> attribute on the root element and then the system setting. Density is{" "}
          <C>"compact"</C>, <C>"default"</C> or <C>"comfortable"</C>. Set either on{" "}
          <C>defineControls</C>, <C>mount</C> or <C>{"<KnobsPanel>"}</C>. When the props of a
          mounted <C>{"<KnobsPanel>"}</C> change, it restyles in place and the tokens glide.
        </p>
        <Code>{`
          defineControls("splat", schema, { theme: "auto", density: "compact" })
          splat.mount(sidebar, { theme: "light", title: "Splatter" })
        `}</Code>
        <p>
          The title defaults to the id written as words, so <C>"synth-voice"</C> reads "Synth
          voice". Pass <C>title</C> to change it or <C>title: false</C> to hide it.
        </p>
      </Section>

      <Section title="Design tokens">
        <p>
          Override tokens on <C>:root</C> or on <C>.knobs-panel</C>. Changing a token glides:
          colours, lengths, weights, glass and glow move on the panel's spring, so switching themes
          or applying a preset of tokens animates. While a control is being dragged they follow it
          exactly.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tokens</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {tokenRows.map(([k, what]) => (
                <tr key={k}>
                  <td>
                    <C>{k}</C>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Code lang="css">{`
          :root {
            --k-accent: oklch(0.72 0.15 250);
            --k-width: 300px;
            --k-radius: 6px;
            --k-glass: 0;      /* opaque */
            --k-cascade: 0;    /* presets move every row at once */
          }
        `}</Code>
        <p>
          With <C>prefers-reduced-motion</C>, token glides, the preset cascade, the pill stretch,
          the spring dot and editor reveals are off, and panels fade in and out.
        </p>
      </Section>

      <Section title="The WebGPU renderer">
        <p>
          With <C>renderer: "gpu"</C>, or <C>?gpu</C> in the URL, every panel on the page draws into
          one shared WebGPU canvas. It runs the panel springs at 480 Hz with velocity-driven motion
          blur, rasterizes glyphs into an atlas, and smears rolling digits per column. An invisible
          DOM copy of each panel stays in place for keyboard navigation and screen readers.
        </p>
        <p>
          The DOM renderer runs the same springs, sampled into CSS <C>linear()</C> easings, so both
          move alike. Without WebGPU, panels fall back to the DOM renderer. Switch the specimen
          above to <C>gpu</C>, or open <a href="?gpu">this page with ?gpu</a>.
        </p>
      </Section>

      <Section title="This site's tokens">
        <p>
          The <strong>Tune</strong> button opens the site's own tokens: theme, an OKLCH accent, type
          scale, spacing, radius and the motion spring. They are CSS custom properties on{" "}
          <C>:root</C>, registered with <C>@property</C> so they interpolate, and they glide on the
          spring from the same panel. Each section's chip sets <C>--s-*</C> properties on that
          section only. Copy CSS on either panel gives you the result; Copy link on the site panel
          puts every change you've made into a URL.
        </p>
        <p>
          The <Link href="/examples">meta example</Link> goes further and tunes every panel token
          live.
        </p>
      </Section>
    </>
  )
}
