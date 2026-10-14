import { knob, toggle } from "knobs"
import { useEffect, useRef } from "react"
import { C, Code } from "../Code"
import { demoControls } from "../demos/Demo"
import { Section } from "../section"

const page = "Adapters"

const meter = demoControls("meter", {
  bars: knob(12, { min: 3, max: 32, step: 1 }),
  level: knob(0.6, { min: 0, max: 1, step: 0.01 }),
  peak: toggle(true),
})

// The plain DOM version, as the snippet beside it shows: no React state involved.
function DomDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = stage.current!
    const render = () => {
      const { bars, level, peak } = meter.get()
      host.replaceChildren(
        ...Array.from({ length: bars }, (_, i) => {
          const bar = document.createElement("span")
          const on = i / bars < level
          bar.dataset.on = String(on)
          if (peak && on && (i + 1) / bars >= level) bar.dataset.peak = ""
          return bar
        }),
      )
    }
    const unmount = meter.mount(sidebar.current!, { theme: "auto", variants: false })
    const unsubscribe = meter.subscribe(render)
    render()
    return () => {
      unmount()
      unsubscribe()
    }
  }, [])
  return (
    <div className="demo">
      <div className="demo-stage">
        <div className="dom-meter" ref={stage} />
        <span className="demo-caption">Rendered with document.createElement</span>
      </div>
      <div className="demo-panel" ref={sidebar} />
    </div>
  )
}

export default function Adapters() {
  return (
    <>
      <Section
        page={page}
        title="Adapters"
        level={1}
        lede="The store is framework-free. The React and Solid adapters are thin layers over subscribe, attach and mount."
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Need</th>
                <th>React</th>
                <th>Solid</th>
                <th>DOM</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Read values</td>
                <td>
                  <C>useControls(c)</C>
                </td>
                <td>
                  <C>useControls(c)()</C>
                </td>
                <td>
                  <C>c.get()</C>, <C>c.subscribe</C>
                </td>
              </tr>
              <tr>
                <td>Chip and floating panel</td>
                <td>
                  <C>{"<Knobs>"}</C>, <C>useKnobs</C>
                </td>
                <td>
                  <C>{"<Knobs>"}</C>, <C>useKnobs</C>, <C>use:knobs</C>
                </td>
                <td>
                  <C>c.attach(el)</C>
                </td>
              </tr>
              <tr>
                <td>Inline panel</td>
                <td>
                  <C>{"<KnobsPanel>"}</C>
                </td>
                <td>
                  <C>{"<KnobsPanel>"}</C>
                </td>
                <td>
                  <C>c.mount(el)</C>
                </td>
              </tr>
              <tr>
                <td>Switch in place</td>
                <td>
                  <C>{"<VariantSwitcher>"}</C>
                </td>
                <td>
                  <C>{"<VariantSwitcher>"}</C>
                </td>
                <td>
                  <C>attachVariantSwitcher</C>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section page={page} title="React">
        <p>
          Import from <C>knobs/react</C>. <C>useControls</C> uses <C>useSyncExternalStore</C>, so
          values are typed, consistent across a render and safe to server-render. <C>{"<Knobs>"}</C>{" "}
          adds no DOM: its one child must be a native element or forward its ref to one, and an
          existing ref on it still works. For explicit attachment, put <C>useKnobs(controls)</C> on
          an element's <C>ref</C>.
        </p>
        <Code lang="tsx">{`
          import { Knobs, KnobsPanel, useControls, VariantSwitcher } from "knobs/react"

          function Splatter() {
            const values = useControls(splat)
            return (
              <Knobs controls={splat}>
                <section>
                  <MySplatter {...values} />
                  <VariantSwitcher controls={splat} field="flavor">
                    <span>{values.flavor}</span>
                  </VariantSwitcher>
                </section>
              </Knobs>
            )
          }

          function Sidebar() {
            return <KnobsPanel controls={splat} theme="light" density="compact" variants={false} />
          }
        `}</Code>
        <p>
          <C>{"<KnobsPanel>"}</C> takes <C>title</C>, <C>theme</C>, <C>density</C>, <C>renderer</C>,{" "}
          <C>variants</C>, <C>history</C>, <C>footer</C>, <C>actions</C> and <C>onClose</C>.
        </p>
      </Section>

      <Section page={page} title="Solid">
        <p>
          Import from <C>knobs/solid</C>. <C>useControls</C> returns an accessor.{" "}
          <C>useKnobs(controls)</C> is a ref callback, and <C>knobs</C> works as a <C>use:knobs</C>{" "}
          directive.
        </p>
        <Code lang="tsx">{`
          import { Knobs, KnobsPanel, useControls, VariantSwitcher } from "knobs/solid"

          function Splatter() {
            const values = useControls(splat)
            return (
              <Knobs controls={splat}>
                <section>
                  <MySplatter count={values().count} flavor={values().flavor} />
                  <VariantSwitcher controls={splat} field="flavor">
                    <span>{values().flavor}</span>
                  </VariantSwitcher>
                </section>
              </Knobs>
            )
          }
        `}</Code>
      </Section>

      <Section page={page} title="Plain DOM">
        <p>
          Without a framework, read with <C>get()</C>, redraw on <C>subscribe</C>, and use{" "}
          <C>attach</C> or <C>mount</C> for panels. Each returns a function that undoes it. The
          meter below is drawn this way.
        </p>
        <Code>{`
          const unmount = meter.mount(sidebar, { theme: "auto", variants: false })
          const unsubscribe = meter.subscribe(render)
          render()

          function render() {
            const { bars, level, peak } = meter.get()
            stage.replaceChildren(...drawBars(bars, level, peak))
          }
        `}</Code>
        <DomDemo />
        <p>
          <C>knobs/panel</C> exports the pieces underneath: <C>mountPanel</C> and <C>createPanel</C>{" "}
          return a panel object with <C>focus()</C> and <C>dispose()</C>, and{" "}
          <C>{"attachVariantSwitcher(element, controls, { field })"}</C> gives any element the{" "}
          <kbd>1</kbd>–<kbd>9</kbd> and arrow-key switching.
        </p>
      </Section>
    </>
  )
}
