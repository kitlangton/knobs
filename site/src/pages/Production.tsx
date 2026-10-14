import { color, defineControls, knob, type Controls, type Schema } from "knobs"
import { KnobsPanel, useControls } from "knobs/react"
import { useState } from "react"
import { C, Code } from "../Code"
import { registerStore } from "../site"
import { Section } from "../section"

const page = "Production builds"

// `enabled` is a function, so the page can show what the same store does once it's switched off.
let production = false
const badge = defineControls(
  "badge",
  {
    radius: knob(10, { min: 0, max: 24, step: 1, unit: "px" }),
    tint: color("oklch(0.72 0.16 150)"),
  },
  { enabled: () => !production, theme: "auto" },
)
registerStore(badge as unknown as Controls<Schema>)

function ProductionDemo() {
  const [prod, setProd] = useState(false)
  production = prod
  const v = useControls(badge)
  return (
    <div className="demo">
      <div className="demo-stage">
        <div className="stage-center">
          <span className="prod-badge" style={{ borderRadius: v.radius, background: v.tint }}>
            radius {v.radius} · {prod ? "locked" : "live"}
          </span>
        </div>
        <button
          type="button"
          className="prod-switch"
          role="switch"
          aria-checked={prod}
          onClick={() => setProd((p) => !p)}
        >
          <span />
          Production
        </button>
        <span className="demo-caption">
          {prod ? "get() returns locked; no panel" : "Change the values, then switch"}
        </span>
      </div>
      <div className="demo-panel" key={String(prod)}>
        {prod ? (
          <p className="prod-empty">
            <C>{"<KnobsPanel>"}</C> renders nothing when the controls are disabled.
          </p>
        ) : (
          <KnobsPanel controls={badge} theme="auto" variants={false} />
        )}
      </div>
    </div>
  )
}

export default function Production() {
  return (
    <>
      <Section
        page={page}
        title="Production builds"
        level={1}
        lede="The production build of knobs is locked: values are your defaults, and no panel code ships."
      >
        <p>
          The package exports two builds of its core through the standard <C>development</C>{" "}
          condition. Vite's dev server picks the development build. Production bundlers pick the
          default one, which is disabled even if you pass <C>enabled: true</C>. There, <C>get()</C>{" "}
          returns <C>locked</C>, the frozen defaults; <C>set</C> and the other commands do nothing;
          and <C>attach()</C> and <C>mount()</C> are no-ops whose panel imports are removed from the
          bundle.
        </p>
        <ProductionDemo />
        <p>
          The switch above flips this page's <C>enabled</C> function to show the same thing at
          runtime: the values fall back to their defaults and the panel is gone.
        </p>
      </Section>

      <Section page={page} title="Ship the values you chose">
        <p>
          Locked values are the schema's defaults, so shipping a tuning means writing it into the
          schema. Copy (or <kbd>⇧C</kbd>) in any panel gives the current values as an object
          literal. <C>controls.code("json")</C> and <C>controls.code("jsx")</C> give other formats.
        </p>
        <Code>{`
          splat.code()      // { seed: 61, count: 140, size: 9.5, flavor: "clean", grain: true }
          splat.code("jsx") // seed={61} count={140} size={9.5} flavor={"clean"} grain={true}
          splat.locked      // the defaults: what production returns
        `}</Code>
      </Section>

      <Section page={page} title="Choosing when panels show">
        <p>
          In the development build, panels show by default when the page is served from{" "}
          <C>localhost</C>, <C>127.0.0.1</C> or <C>[::1]</C>. <C>enabled</C> takes a boolean or a
          function, read each time it's needed.
        </p>
        <Code>{`
          defineControls("splat", schema, { enabled: import.meta.env.DEV })
          defineControls("splat", schema, { enabled: urlFlag("tune") }) // only with ?tune
        `}</Code>
      </Section>

      <Section page={page} title="Server rendering">
        <p>
          The core touches no browser globals at import time. <C>getServerSnapshot()</C> returns the
          locked values, so React renders the defaults on the server and hydrates without a
          mismatch, then picks up saved values on the client. The React adapter is marked{" "}
          <C>"use client"</C>, and <C>{"<KnobsPanel>"}</C> renders nothing on the server.
        </p>
      </Section>

      <Section page={page} title="Size">
        <p>
          In this repository's build, the production core is 35.6 kB, or 10.5 kB gzipped, before
          your bundler minifies it. The build script fails if any panel code appears in it, and
          checks that a store created with <C>enabled: true</C> still stays locked.
        </p>
      </Section>

      <Section page={page} title="Keeping panels on in production">
        <p>
          This site ships its panels on purpose. Its Vite config resolves <C>knobs</C> to the source
          files, which take the development path, and every store passes <C>enabled: true</C>. Do
          the same if you want a public tuning page.
        </p>
        <Code title="site/vite.config.ts">{`
          resolve: {
            alias: [
              { find: /^knobs$/, replacement: resolve(rootDir, "src/index.ts") },
              { find: /^knobs\\/react$/, replacement: resolve(rootDir, "src/react/index.ts") },
              { find: /^knobs\\/panel$/, replacement: resolve(rootDir, "src/panel/index.ts") },
            ],
          },
        `}</Code>
      </Section>
    </>
  )
}
