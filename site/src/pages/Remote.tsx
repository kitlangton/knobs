import {
  createRemoteControls,
  knob,
  springCss,
  type ControlDescriptor,
  type Controls,
  type Schema,
  type SpringValue,
  type Point,
  type Value,
} from "knobs"
import { KnobsPanel, useControls } from "knobs/react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { C, Code } from "../Code"
import { copy, registerStore } from "../site"
import { Section, sectionControls } from "../section"

const descriptors: ControlDescriptor[] = [
  {
    key: "drawer.spring",
    label: "Drawer",
    kind: "spring",
    default: { duration: 0.4, bounce: 0.25 },
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
    choices: ["glass", "solid"],
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
]
const defaults: Record<string, Value> = Object.fromEntries(
  descriptors.map((d) => [d.key, d.default]),
)

// The section's own illustration knob: how long the pretend socket takes each way.
const tryIt = sectionControls("Try it", {
  latency: knob(120, { min: 0, max: 800, step: 10, unit: "ms", label: "Latency", group: "Socket" }),
})

// A pretend phone on the other end of a pretend socket. It applies `set` messages after the
// latency and answers with its full state, the way a real paired device would.
type PhoneValues = Record<string, Value>
let phone: PhoneValues = { ...defaults, "drawer.edge.fade": 24 }
const phoneListeners = new Set<() => void>()
const latency = () => tryIt.get().latency
let echo: ReturnType<typeof setTimeout> | undefined
function phoneUpdate(next: PhoneValues) {
  phone = next
  for (const cb of phoneListeners) cb()
  // The phone reports its state once a burst of messages (a drag) has gone quiet.
  clearTimeout(echo)
  echo = setTimeout(() => remote.sync(phone, { replace: true }), latency())
}
const socket = {
  send(msg: { type: "set"; key: string; value: Value | null } | { type: "resetAll" }) {
    setTimeout(() => {
      if (msg.type === "resetAll") phoneUpdate({ ...defaults })
      else phoneUpdate({ ...phone, [msg.key]: msg.value ?? defaults[msg.key] })
    }, latency())
  },
}

const remote = createRemoteControls("iphone", descriptors, {
  theme: "auto",
  values: phone as never,
  onSet: (key, value) => socket.send({ type: "set", key, value }),
  onReset: ({ key }) => {
    if (!key) socket.send({ type: "resetAll" })
  },
  actions: [
    {
      label: "Copy as Swift",
      run: () => copy(remote.swift() || "// All values at default", "Copied Swift."),
    },
  ],
})
registerStore(remote as unknown as Controls<Schema>)

function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      phoneListeners.add(cb)
      return () => phoneListeners.delete(cb)
    },
    () => phone,
  )
}

function Phone() {
  const values = usePhone()
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setOpen((o) => !o), 2200)
    return () => clearInterval(id)
  }, [])
  const spring = springCss(values["drawer.spring"] as SpringValue)
  const anchor = values["composer.anchor"] as Point
  const tint = values["composer.tint"] as string
  const fade = values["drawer.edge.fade"] as number
  return (
    <div className="phone" aria-label="Simulated phone">
      <div className="phone-screen">
        <div className="phone-island" />
        <div
          className="phone-sheet"
          data-chrome={values["composer.chrome"] as string}
          style={{
            transform: open ? "translateY(0)" : "translateY(78%)",
            transition: `transform ${spring.duration}ms ${spring.easing}`,
            maskImage: `linear-gradient(to bottom, transparent 0, #000 ${fade}px)`,
          }}
        >
          <span className="phone-grabber" />
          {[72, 54, 88, 61].map((w) => (
            <span key={w} className="phone-line" style={{ width: `${w}%` }} />
          ))}
          <span
            className="phone-composer"
            style={{
              background: tint,
              left: `calc(${anchor.x * 100}% - 22px)`,
              top: `calc(${anchor.y * 100}% - 52px)`,
            }}
          />
        </div>
        <button
          type="button"
          className="phone-poke"
          onClick={() =>
            phoneUpdate({ ...phone, "drawer.edge.fade": Math.round(Math.random() * 40) })
          }
        >
          Change on phone
        </button>
      </div>
      <span className="phone-meta">haptics {values["composer.haptics"] ? "on" : "off"}</span>
    </div>
  )
}

function SwiftOut() {
  useControls(remote)
  return (
    <Code lang="swift" title="remote.swift()">
      {remote.swift() || "// Every value is at its default"}
    </Code>
  )
}

export default function Remote() {
  return (
    <>
      <Section
        title="Remote and Swift"
        level={1}
        lede="When the values live on another device or process, build the controls from descriptors and send changes over your own transport."
      >
        <p>
          <C>createRemoteControls</C> takes a list of descriptors instead of a schema. It is a
          normal set of controls with undo, presets, Random and the rest, plus an <C>onSet</C>{" "}
          callback for local edits and <C>swift()</C>, which prints the changed values as Swift
          declarations.
        </p>
      </Section>

      <Section title="Try it" controls={tryIt}>
        <p>
          The panel drives a pretend phone over a pretend socket with a delay. Each edit goes out as
          a <C>set</C> message; the phone applies it and answers with its full state, which the
          panel applies with <C>sync()</C>. The phone's own button changes a value on the device,
          and the panel follows without adding an undo step. This section's chip has a Latency knob
          for the socket.
        </p>
        <div className="demo remote-demo">
          <div className="demo-stage">
            <Phone />
          </div>
          <div className="demo-panel">
            <KnobsPanel controls={remote} theme="auto" variants={false} title="Paired iPhone" />
          </div>
        </div>
        <SwiftOut />
      </Section>

      <Section title="Descriptors">
        <p>
          A descriptor has a <C>key</C>, a <C>kind</C>, a <C>default</C> and the same metadata as a
          field. Kinds are <C>number</C> (or <C>knob</C>), <C>bool</C> (or <C>toggle</C>),{" "}
          <C>choice</C>, <C>spring</C>, <C>color</C>, <C>point</C> and <C>easing</C>. Numbers
          without bounds get a range from their default. <C>swiftType</C> names the Swift type for
          codegen.
        </p>
        <Code>{`
          const descriptors: ControlDescriptor[] = [
            { key: "drawer.spring", label: "Drawer", kind: "spring",
              default: { duration: 0.4, bounce: 0.25 }, group: "Motion" },
            { key: "drawer.edge.fade", label: "Edge fade", kind: "number", swiftType: "Double",
              default: 16, min: 0, max: 40, step: 1, unit: "pt", group: "Surface" },
            { key: "composer.tint", label: "Tint", kind: "color", default: "#0a84ff" },
          ]
        `}</Code>
      </Section>

      <Section title="Wire up the socket">
        <Code>{`
          import { createRemoteControls } from "knobs"
          import { mountPanel } from "knobs/panel"

          const remote = createRemoteControls("iphone", descriptors, {
            values: phone.values,
            onSet: (key, value) => ws.send(JSON.stringify({ type: "set", key, value })),
            onReset: ({ key, group }) =>
              ws.send(JSON.stringify(key ? { type: "set", key, value: null }
                                         : { type: "resetAll", group: group ?? null })),
          })

          // Incoming state: no echo to onSet, no undo entry, and active drags keep going.
          ws.onmessage = (e) => {
            const msg = JSON.parse(e.data)
            if (msg.type === "state") remote.sync(msg.values, { replace: true })
          }

          mountPanel(remote, document.querySelector("#groups")!, { variants: false })
        `}</Code>
        <p>
          <C>onSet</C> sends values as they are: numbers, strings, <C>{"{ duration, bounce }"}</C>{" "}
          objects, <C>{"{ x, y }"}</C> points and bezier arrays. A key that returns to its default
          sends <C>null</C>. Remote controls don't save values or variants unless you pass{" "}
          <C>storage</C>.
        </p>
      </Section>

      <Section title="Swift codegen">
        <p>
          <C>remote.swift(group?)</C> prints a declaration for every changed value, with the old
          value in a comment. Colours leave as sRGB components, points as <C>CGPoint</C> and easings
          as SwiftUI <C>UnitCurve.bezier</C> values. Paired <C>.duration</C> and <C>.bounce</C>{" "}
          number descriptors fold into one <C>TunableSpring</C>.
        </p>
        <Code lang="swift">{`
          TunableSpring("drawer.spring", "Drawer", duration: 0.45, bounce: 0.25)  // was duration: 0.4, bounce: 0.25
          Tunable<Color>("composer.tint", "Tint", default: Color(red: 0.2393, green: 0.5451, blue: 0.9999))  // #3d8bff · was Color(red: 0.0392, green: 0.5176, blue: 1)
          Tunable<CGPoint>("composer.anchor", "Anchor", default: CGPoint(x: 0.5, y: 0.75))  // was CGPoint(x: 0.5, y: 1)
        `}</Code>
        <p>
          The Swift side needs a <C>Tunable</C> that decodes these types. Until it has one, keep
          sending a spring as paired <C>.duration</C> and <C>.bounce</C> numbers; the panel and the
          codegen handle both.
        </p>
      </Section>
    </>
  )
}
