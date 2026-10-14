import { C, Code } from "../Code"
import { Install } from "../Install"
import { Link } from "../router"
import { Section } from "../section"

const page = "Getting started"

export default function GettingStarted() {
  return (
    <>
      <Section
        page={page}
        title="Getting started"
        level={1}
        lede="A set of controls is a typed store with a schema. You read values from it, and a panel edits them."
      >
        <p>
          This page builds one set of controls for a splatter illustration, attaches a panel to the
          element that draws it, and shows what happens to those controls in a production build.
        </p>
      </Section>
      <Section page={page} title="Install">
        <Install />
      </Section>
      <Section page={page} title="Define the controls">
        <p>
          <C>defineControls</C> takes a stable id, a schema of fields and options. The id names the
          panel and keys its saved values, so keep it the same across reloads. Define controls at
          module scope so React renders don't recreate the store.
        </p>
        <Code title="splat.ts">{`
          import { choice, defineControls, knob, toggle } from "knobs"

          export const splat = defineControls("splat", {
            seed: knob(22, { min: 1, max: 99, step: 1, shortcut: "s" }),
            count: knob(98, { min: 0, max: 300, step: 1 }),
            size: knob(7, { min: 1, max: 30, step: 0.5, unit: "px" }),
            flavor: choice("inked", ["inked", "clean"]),
            grain: toggle(true),
          }, {
            presets: { subtle: { count: 40, size: 4 } },
          })
        `}</Code>
        <p>
          The schema's types flow into the values. <C>splat.get().flavor</C> is{" "}
          <C>{'"inked" | "clean"'}</C>, and <C>splat.locked</C> holds the defaults, frozen.
        </p>
      </Section>
      <Section page={page} title="Attach a panel">
        <p>
          In React, wrap the element in <C>{"<Knobs>"}</C>. It adds no wrapper DOM: its child must
          be a native element, or a component that forwards its ref to one. Hovering or focusing
          that element shows the chip, and the chip opens the floating panel.
        </p>
        <Code lang="tsx" title="Splatter.tsx">{`
          import { Knobs, useControls } from "knobs/react"
          import { splat } from "./splat"

          export function Splatter() {
            const values = useControls(splat)
            return (
              <Knobs controls={splat}>
                <section>
                  <MySplatter {...values} />
                </section>
              </Knobs>
            )
          }
        `}</Code>
        <p>Without a framework, attach to an element and subscribe to changes:</p>
        <Code title="main.ts">{`
          const detach = splat.attach(document.querySelector<HTMLElement>("#splat")!)
          const unsubscribe = splat.subscribe(() => render(splat.get()))
          render(splat.get())
        `}</Code>
        <p>
          To keep a panel open in a sidebar instead, mount it inline with{" "}
          <C>{"<KnobsPanel controls={splat} />"}</C> or <C>splat.mount(container)</C>. Every live
          example on this site is an inline panel.
        </p>
      </Section>
      <Section page={page} title="Tune, then keep what works">
        <p>
          Drag a slider, or focus a row and use the arrow keys. Random rolls new values, and{" "}
          <kbd>⌥</kbd>-clicking it mutates the current ones a little. When something looks right,
          click <kbd>+</kbd> at the end of the preset strip (or press <kbd>⇧S</kbd>) to save it as a
          variant, or click Copy for the values as code:
        </p>
        <Code>{`{ seed: 61, count: 140, size: 9.5, flavor: "clean", grain: true }`}</Code>
        <p>
          Paste that over the defaults in your schema. Values are saved to <C>localStorage</C> as
          you go, so a reload or a hot update keeps them, along with which panels were open and
          where focus was.
        </p>
      </Section>
      <Section page={page} title="Ship constants">
        <p>
          The package has two builds of its core, picked by the standard <C>development</C> export
          condition. Vite's dev server uses the development build. Every production bundler uses the
          other one, where controls are always disabled: <C>get()</C> returns <C>locked</C>, and{" "}
          <C>attach()</C> and <C>mount()</C> do nothing and import no panel code.
        </p>
        <p>
          In development, panels show on <C>localhost</C> by default. Pass{" "}
          <C>enabled: import.meta.env.DEV</C> or a function to decide for yourself.{" "}
          <Link href="/production">Production builds</Link> has the details.
        </p>
      </Section>
    </>
  )
}
