import { useControls } from "knobs/react"
import { useEffect, useLayoutEffect, useState } from "react"
import { C, Code } from "./Code"
import { Demo } from "./demos/Demo"
import { Field, field } from "./demos/Field"
import { Install } from "./Install"
import { lazyExample } from "./Lazy"
import { QuickStart } from "./QuickStart"
import { Section } from "./section"
import { keysSection, remoteSection, themingSection } from "./sections"
import { applySite, resolvedTheme, site } from "./site"
import { TuneButton } from "./SitePanel"

const fields = () => import("./live/Fields")
const panel = () => import("./live/Panel")
const KnobDemo = lazyExample(() => fields().then((m) => ({ default: m.KnobDemo })), 240)
const ChoiceDemo = lazyExample(() => fields().then((m) => ({ default: m.ChoiceDemo })), 240)
const ToggleDemo = lazyExample(() => fields().then((m) => ({ default: m.ToggleDemo })), 240)
const SpringDemo = lazyExample(() => fields().then((m) => ({ default: m.SpringDemo })), 240)
const ColorDemo = lazyExample(() => fields().then((m) => ({ default: m.ColorDemo })), 240)
const PointDemo = lazyExample(() => fields().then((m) => ({ default: m.PointDemo })), 240)
const EasingDemo = lazyExample(() => fields().then((m) => ({ default: m.EasingDemo })), 240)
const KeysDemo = lazyExample(() => panel().then((m) => ({ default: m.KeysDemo })), 420)
const PresetsDemo = lazyExample(() => panel().then((m) => ({ default: m.PresetsDemo })), 600)
const RandomDemo = lazyExample(() => panel().then((m) => ({ default: m.RandomDemo })), 470)
const ReactingDemo = lazyExample(() => import("./live/Reacting"), 300)
const ThemingDemo = lazyExample(() => import("./live/Theming"), 560)
const RemoteDemo = lazyExample(() => import("./live/Remote"), 560)
const FullPageDemo = lazyExample(() => import("./live/FullPage"), 820)
const EmbedDemo = lazyExample(() => import("./live/Embed"), 480)
const AdaptersDemo = lazyExample(() => import("./live/Adapters"), 480)
const ProductionDemo = lazyExample(() => import("./live/Production"), 240)

/**
 * Scrolls to a section and keeps it there while lazy examples above it mount and change height,
 * until they settle or the reader scrolls.
 */
function settleOn(hash: string, glide = false) {
  const target = document.getElementById(decodeURIComponent(hash.slice(1)))
  const main = document.getElementById("content")
  if (!target || !main) return
  const behavior = glide && document.documentElement.dataset.motion === "on" ? "smooth" : "instant"
  const pin = () => target.scrollIntoView({ block: "start", behavior })
  pin()
  let first = true
  // The observer reports once on observe; only later changes of height need a re-pin.
  const observer = new ResizeObserver(() => {
    if (first) first = false
    else pin()
  })
  observer.observe(main)
  const stop = () => {
    observer.disconnect()
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"])
      removeEventListener(type, stop)
  }
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"])
    addEventListener(type, stop, { passive: true })
  setTimeout(stop, 2500)
}

interface Heading {
  id: string
  text: string
}

/** A slim index of the page's sections, marking the one being read. Wide screens only. */
function Index() {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [active, setActive] = useState("")
  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("main section[data-toc] > h2[id]")]
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? "" })))
    const visible = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = nodes.find((n) => visible.get(n.id))
        if (first) setActive(first.id)
      },
      { rootMargin: "-64px 0px -60% 0px" },
    )
    for (const n of nodes) io.observe(n)
    return () => io.disconnect()
  }, [])
  return (
    <nav className="index" aria-label="Sections">
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} aria-current={h.id === active ? "true" : undefined}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ThemeToggle() {
  const v = useControls(site)
  const dark = resolvedTheme(v) === "dark"
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={dark ? "Use the light theme" : "Use the dark theme"}
      onClick={() => site.set({ theme: dark ? "light" : "dark" })}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
          </>
        ) : (
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
        )}
      </svg>
    </button>
  )
}

export function App() {
  const v = useControls(site)
  useLayoutEffect(() => applySite(v), [v])
  useEffect(() => {
    if (location.hash.length > 1) settleOn(location.hash)
    const onHash = () => settleOn(location.hash, true)
    addEventListener("hashchange", onHash)
    return () => removeEventListener("hashchange", onHash)
  }, [])
  useEffect(() => {
    if (v.theme !== "auto") return
    const media = matchMedia("(prefers-color-scheme: dark)")
    const sync = () => applySite(site.get())
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [v.theme])

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#knobs" className="wordmark">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1" y="1" width="18" height="18" rx="5.5" />
            <path d="M5.5 7.5h9M5.5 12.5h9" />
            <circle cx="12" cy="7.5" r="2" />
            <circle cx="8" cy="12.5" r="2" />
          </svg>
          knobs
        </a>
        <span className="topbar-space" />
        <a className="topbar-link" href="#examples">
          Examples
        </a>
        <a className="topbar-link" href="https://github.com/kitlangton/knobs">
          GitHub
        </a>
        <ThemeToggle />
        <TuneButton />
      </header>
      <span id="site-panel-anchor" aria-hidden="true" />
      <Index />
      <main id="content">
        <Section
          title="knobs"
          level={1}
          className="hero"
          lede="Tuning controls for React, Solid and plain DOM. Give a component a few knobs, tune it in a panel, and ship the values you pick as constants."
        >
          <p>
            Every section on this page has its own <C>⚙ knobs</C> chip; hover one to tune it.{" "}
            <strong>Tune</strong> or <kbd>T</kbd> opens the page's own tokens. Drag on the dots to
            move their origin.
          </p>
          <Demo controls={field} className="hero-demo" density="compact">
            <Field />
          </Demo>
        </Section>

        <Section title="Install">
          <Install />
        </Section>

        <Section title="Quick start">
          <p>
            Define controls once, read them with <C>useControls</C>, and wrap the element that gets
            the chip in <C>{"<Knobs>"}</C>. In production builds the panel is gone and the values
            are your defaults.
          </p>
          <QuickStart />
        </Section>

        <Section title="knob" kicker="Fields">
          <p>
            A number with a range, a step and an optional unit. <kbd>⌥</kbd>-drag for fine steps, or
            type a number into a focused row.
          </p>
          <Code>{`size: knob(120, { min: 60, max: 180, step: 2, unit: "px" })`}</Code>
          <KnobDemo />
        </Section>

        <Section title="choice">
          <p>
            One of a list of strings, typed as their union. Choices are segments while their labels
            fit, and a compact menu when they don't or there are more than four.
          </p>
          <Code>{`align: choice("center", ["start", "center", "end"])`}</Code>
          <ChoiceDemo />
        </Section>

        <Section title="toggle">
          <p>A boolean switch.</p>
          <Code>{`grid: toggle(true)`}</Code>
          <ToggleDemo />
        </Section>

        <Section title="spring">
          <p>
            SwiftUI's duration and bounce. <C>springCss</C> turns it into a CSS <C>linear()</C>{" "}
            easing and a duration.
          </p>
          <Code>{`travel: spring({ duration: 0.55, bounce: 0.3 })`}</Code>
          <SpringDemo />
        </Section>

        <Section title="color">
          <p>An OKLCH colour, kept inside sRGB and stored as a string CSS can use directly.</p>
          <Code>{`tint: color("oklch(0.7 0.16 40)")`}</Code>
          <ColorDemo />
        </Section>

        <Section title="point">
          <p>An x and y pair, edited on a pad.</p>
          <Code>{`light: point({ x: -0.4, y: -0.6 }, { min: -1, max: 1, step: 0.01 })`}</Code>
          <PointDemo />
        </Section>

        <Section title="easing">
          <p>A cubic bezier, or one of the named curves.</p>
          <Code>{`curve: easing("snappy")`}</Code>
          <EasingDemo />
        </Section>

        <Section
          title="Keys and gestures"
          kicker="The panel"
          controls={keysSection}
          className="keys-section"
        >
          <p>
            Everything works from the keyboard. Click a row in any panel on this page and try these.
          </p>
          <KeysDemo />
        </Section>

        <Section title="Presets and variants">
          <p>
            Presets ship with your code. <kbd>+</kbd> or <kbd>⇧S</kbd> saves the current values as a
            variant beside them, and <kbd>[</kbd> <kbd>]</kbd> step through both.
          </p>
          <PresetsDemo />
        </Section>

        <Section title="Random, Mutate, locks and compare">
          <p>
            <kbd>r</kbd> rolls new values and <kbd>⌥R</kbd> nudges the current ones. <kbd>⇧L</kbd>{" "}
            keeps a row out of both, and holding <kbd>\</kbd> shows the values from before your last
            change.
          </p>
          <RandomDemo />
        </Section>

        <Section title="Reacting to changes" kicker="In your app">
          <p>
            <C>onChange</C> says where each change came from, so a page can answer Random, a preset
            or undo.
          </p>
          <Code>{`onChange(patch, values, { source }) { if (source === "randomize") roll() }`}</Code>
          <ReactingDemo />
        </Section>

        <Section title="Theming" controls={themingSection}>
          <p>
            Panels take a theme, a density and CSS tokens, and changes to them glide. Here the Panel
            look panel tunes Synth voice.
          </p>
          <ThemingDemo />
        </Section>

        <Section title="Remote and Swift" controls={remoteSection}>
          <p>
            <C>createRemoteControls</C> drives values on another device over your own socket, and{" "}
            <C>swift()</C> prints what changed as Swift. This one talks to a pretend phone.
          </p>
          <RemoteDemo />
        </Section>

        <Section title="Full page">
          <p>
            <C>mountPage</C> lays a big set of controls out as a page: each section is a column of
            cards, with numbered presets per card (press <kbd>1</kbd>–<kbd>3</kbd> on a focused
            card) and a live filter on <kbd>/</kbd>. The full demo is the{" "}
            <a href="/examples/tune.html">iPhone Tune page</a>.
          </p>
          <Code>{`mountPage(deck, el, { title: "Card deck", sections: ["Layout", "Motion", "Colour"] })`}</Code>
          <FullPageDemo />
        </Section>

        <Section title="Embedding in an app">
          <p>
            A panel can be part of the product. The app owns the values and the panel reports edits:{" "}
            <C>ship</C> keeps it live in production, <C>keys</C> and <C>marks</C> fit it to the
            host, <C>{"remote.update(…, { land: true })"}</C> swaps its rows when the app switches
            items, and token presets like <C>problemsPreset</C> restyle it. See the{" "}
            <a href="/examples/problems.html">Problems viewer demo</a>.
          </p>
          <Code>{`
            const params = createRemoteControls("parameters", descriptors, {
              ship: () => import("knobs/panel"),
              keys: { random: false, undo: false, vim: false, bigStep: 5 },
              onSet: (key, value) => save(key, value),
            })
            params.update(otherDescriptors, otherValues, { land: true })
          `}</Code>
          <EmbedDemo />
        </Section>

        <Section title="Adapters">
          <p>The same store works in React, Solid and plain DOM.</p>
          <AdaptersDemo />
        </Section>

        <Section title="Production builds">
          <p>
            Production bundles get a locked build of knobs: values are your defaults and no panel
            code ships, except for stores you <C>ship</C>. The switch shows a store turned off.
          </p>
          <ProductionDemo />
        </Section>

        <footer className="page-footer" id="examples">
          <h2>Examples</h2>
          <ul className="examples">
            <li>
              <a href="/examples/studies.html">
                <strong>Studies</strong>
                <span>Four illustrations with a chip each, and a remote workbench.</span>
              </a>
            </li>
            <li>
              <a href="/examples/meta.html">
                <strong>Meta</strong>
                <span>A panel that tunes every panel token.</span>
              </a>
            </li>
            <li>
              <a href="/examples/tune.html">
                <strong>iPhone Tune</strong>
                <span>A full page of cards driving a simulated phone.</span>
              </a>
            </li>
            <li>
              <a href="/examples/problems.html">
                <strong>Problems</strong>
                <span>Panels embedded in an app that owns their values.</span>
              </a>
            </li>
            <li>
              <a href="/examples/die.html">
                <strong>Die</strong>
                <span>The Random die in the DOM and WebGPU renderers.</span>
              </a>
            </li>
          </ul>
          <p className="footnote">
            Add <C>?gpu</C> to any page for the WebGPU renderer.{" "}
            <a href="https://github.com/kitlangton/knobs">Source on GitHub</a>.
          </p>
        </footer>
      </main>
    </div>
  )
}
