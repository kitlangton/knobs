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
import { Code } from "../Code"
import { remoteSection } from "../sections"
import { copy, registerStore } from "../site"

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

// A pretend phone on the other end of a pretend socket. It applies `set` messages after the
// latency and answers with its full state, the way a real paired device would.
type PhoneValues = Record<string, Value>
let phone: PhoneValues = { ...defaults, "drawer.edge.fade": 24 }
const phoneListeners = new Set<() => void>()
const latency = () => remoteSection.get().latency
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

export default function RemoteDemo() {
  return (
    <>
      <div className="demo remote-demo">
        <div className="demo-stage">
          <Phone />
        </div>
        <div className="demo-panel">
          <KnobsPanel controls={remote} theme="auto" variants={false} title="Paired iPhone" />
        </div>
      </div>
      <SwiftOut />
    </>
  )
}
