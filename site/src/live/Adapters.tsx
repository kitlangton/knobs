import { choice, knob, toggle } from "knobs"
import { useControls, VariantSwitcher } from "knobs/react"
import { useEffect, useRef } from "react"
import { Code } from "../Code"
import { demoControls } from "../demos/Demo"

const meter = demoControls("meter", {
  adapter: choice("react", ["react", "solid", "dom"], { label: "Adapter" }),
  bars: knob(12, { min: 3, max: 32, step: 1 }),
  level: knob(0.6, { min: 0, max: 1, step: 0.01 }),
  peak: toggle(true),
})

const snippets = {
  react: {
    lang: "tsx",
    code: `
      import { Knobs, useControls } from "knobs/react"

      function Meter() {
        const v = useControls(meter)
        return <Knobs controls={meter}><Bars count={v.bars} level={v.level} /></Knobs>
      }
    `,
  },
  solid: {
    lang: "tsx",
    code: `
      import { Knobs, useControls } from "knobs/solid"

      function Meter() {
        const v = useControls(meter)
        return <Knobs controls={meter}><Bars count={v().bars} level={v().level} /></Knobs>
      }
    `,
  },
  dom: {
    lang: "ts",
    code: `
      meter.attach(element)                 // or meter.mount(sidebar) for an inline panel
      meter.subscribe(() => render(meter.get()))
      render(meter.get())
    `,
  },
} as const

// The meter itself is drawn with plain DOM calls, and its panel is mounted with meter.mount().
export default function AdaptersDemo() {
  const v = useControls(meter)
  const stage = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = stage.current!
    const render = () => {
      const { bars, level, peak } = meter.get()
      // Existing bars are kept, so a change of level glides from bar to bar.
      while (host.children.length < bars) host.append(document.createElement("span"))
      while (host.children.length > bars) host.lastElementChild!.remove()
      Array.from(host.children as HTMLCollectionOf<HTMLElement>).forEach((bar, i) => {
        const on = i / bars < level
        bar.className = "glide"
        bar.dataset.on = String(on)
        bar.toggleAttribute("data-peak", peak && on && (i + 1) / bars >= level)
      })
    }
    const unmount = meter.mount(sidebar.current!, { theme: "auto", variants: false })
    const unsubscribe = meter.subscribe(render)
    render()
    return () => {
      unmount()
      unsubscribe()
    }
  }, [])
  const snippet = snippets[v.adapter]
  return (
    <>
      <div className="demo">
        <div className="demo-stage">
          <div className="dom-meter" ref={stage} />
          <span className="demo-caption">Drawn with document.createElement</span>
        </div>
        <div className="demo-panel" ref={sidebar} />
      </div>
      <VariantSwitcher controls={meter} field="adapter">
        <Code lang={snippet.lang} title={`${v.adapter} · hover and press 1–3`}>
          {snippet.code}
        </Code>
      </VariantSwitcher>
    </>
  )
}
