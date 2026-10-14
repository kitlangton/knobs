// iPhone Tune: the opencode-ios tune page on knobs. A simulated phone (tune-phone.ts) speaks the
// tune server's wire protocol; this file is what the server's page would ship: it maps the
// phone's descriptors and preset sets onto a page, sends edits back, and follows the phone's
// state without echoing it.
import {
  createRemoteControls,
  type ControlDescriptor,
  type GroupPreset,
  type RemoteControls,
  type Value as KnobValue,
} from "knobs"
import { mountPage, type Page, type PageControl } from "knobs/panel"
import { connectPhone, type Descriptor, type Phone, type Value } from "./tune-phone"

const params = new URLSearchParams(location.search)
const ws = connectPhone()
const send = (message: object) => ws.send(JSON.stringify(message))

// ── Mapping the phone onto the page ──────────────────────────────────────────────────────────
// Sections are the phone's screens; cards are its preset sets (a set's keys share a card) or a
// key's second segment; paired `.duration`/`.bounce` numbers become one spring row.
const SECTIONS: Record<string, string> = {
  drawer: "Session List",
  transcript: "Transcript",
  session: "Transcript",
  composer: "Composer",
}
const CARDS: Record<string, string> = {
  spacing: "Size",
  edge: "Edge",
  search: "Springs",
  open: "Springs",
  card: "Springs",
  motion: "Springs",
  promotion: "Glide",
  jump: "Glide",
  follow: "Glide",
  header: "Header Style",
  level: "Level picker",
  controls: "Controls",
  expand: "Controls",
}
const title = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())

interface Mapping {
  descriptors: ControlDescriptor[]
  groupPresets: Record<string, GroupPreset[]>
  /** Knobs group → the phone preset set behind its numbered chips. */
  setFor: Map<string, string>
  /** Spring rows' phone keys. */
  springs: Map<string, { duration: Descriptor; bounce: Descriptor }>
  fromPhone(values: Record<string, Value>): Record<string, KnobValue>
}

function mapPhone(phone: Phone): Mapping {
  const byKey = new Map(phone.schema.map((d) => [d.key, d]))
  const cardOf = new Map<string, string>()
  const setFor = new Map<string, string>()
  for (const set of phone.presets) {
    const card = title(set.label)
    setFor.set(card, set.key)
    for (const k of set.keys) cardOf.set(k, card)
  }
  const springs = new Map<string, { duration: Descriptor; bounce: Descriptor }>()
  const descriptors: ControlDescriptor[] = []
  for (const d of phone.schema) {
    const segment = d.key.split(".")[1] ?? d.group
    const group = cardOf.get(d.key) ?? CARDS[segment] ?? title(segment)
    const section = SECTIONS[d.group] ?? title(d.group)
    const base = d.key.replace(/\.(duration|bounce)$/, "")
    const duration = byKey.get(`${base}.duration`)
    const bounce = byKey.get(`${base}.bounce`)
    if (base !== d.key && duration && bounce) {
      if (springs.has(base)) continue
      springs.set(base, { duration, bounce })
      descriptors.push({
        key: base,
        label: duration.label.replace(/ duration$/, ""),
        kind: "spring",
        default: { duration: Number(duration.default), bounce: Number(bounce.default) },
        group,
        section,
      })
      continue
    }
    descriptors.push({
      key: d.key,
      label: d.label,
      kind: d.kind,
      swiftType: d.swiftType,
      default: d.default,
      min: d.min,
      max: d.max,
      step: d.step,
      choices: d.choices,
      group,
      section,
    })
  }
  const fromPhone = (values: Record<string, Value>) => {
    const out: Record<string, KnobValue> = {}
    for (const [key, v] of Object.entries(values)) {
      const base = key.replace(/\.(duration|bounce)$/, "")
      const pair = springs.get(base)
      if (!pair) {
        out[key] = v
        continue
      }
      const at = (out[base] as { duration: number; bounce: number } | undefined) ?? {
        duration: Number(values[pair.duration.key] ?? pair.duration.default),
        bounce: Number(values[pair.bounce.key] ?? pair.bounce.default),
      }
      out[base] = at
    }
    return out
  }
  const groupPresets: Record<string, GroupPreset[]> = {}
  for (const set of phone.presets)
    groupPresets[title(set.label)] = set.presets.map((p) => ({
      name: p.name,
      values: fromPhone(p.values),
    }))
  return { descriptors, groupPresets, setFor, springs, fromPhone }
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────
let remote: RemoteControls | undefined
let page: Page | undefined
let mapping: Mapping | undefined
let schemaKey = ""
let ui: ReturnType<typeof customCards> | undefined

function mount(phone: Phone) {
  mapping = mapPhone(phone)
  const m = mapping
  page?.dispose()
  remote = createRemoteControls("iphone-tune", m.descriptors, {
    values: m.fromPhone(phone.values),
    groupPresets: m.groupPresets,
    storage: localStorage,
    presets: {
      snappy: Object.fromEntries(
        [...m.springs.keys()].map((k) => [k, { duration: 0.28, bounce: 0.08 }]),
      ),
      gentle: Object.fromEntries(
        [...m.springs.keys()].map((k) => [k, { duration: 0.6, bounce: 0.22 }]),
      ),
    },
    onSet(key, value) {
      const pair = m.springs.get(key)
      if (!pair) return send({ type: "set", key, value })
      const v = value as { duration: number; bounce: number } | null
      send({ type: "set", key: pair.duration.key, value: v?.duration ?? null })
      send({ type: "set", key: pair.bounce.key, value: v?.bounce ?? null })
    },
    onReset({ key, group }) {
      if (key) return
      if (!group) return send({ type: "resetAll", group: null })
      // A card's reset clears the phone's keys behind it.
      for (const d of m.descriptors.filter((x) => x.group === group)) {
        const pair = m.springs.get(d.key)
        for (const k of pair ? [pair.duration.key, pair.bounce.key] : [d.key])
          send({ type: "set", key: k, value: null })
      }
    },
    // The phone applies its own preset sets, so it decides what "Compact" means.
    onPreset: ({ group, index }) => send({ type: "preset", key: m.setFor.get(group), index }),
  })
  page = mountPage(remote, document.querySelector<HTMLElement>("#app")!, {
    title: "iPhone Tune",
    theme: (params.get("theme") as "dark" | "light" | null) ?? "auto",
    sections: ["Playground", "Session List", "Transcript", "Composer"],
    copy: () => remote!.swift() || "// Nothing changed",
  })
  ui = customCards(page)
  ui.update(phone)
  ;(window as any).__tune = { remote, page, send }
}

function customCards(p: Page) {
  // Playground & Slow Motion: what the phone shows and how fast it moves.
  const pg = p.card({ title: "Playground & Slow Motion", section: "Playground" })
  const command = (c: object) => send({ type: "playgroundCommand", command: c })
  const screen = pg.choice({
    options: [
      { value: "transcript", label: "Transcript" },
      { value: "sessionList", label: "Sessions" },
      { value: "composer", label: "Composer" },
      { value: "off", label: "Off" },
    ],
    value: "transcript",
    onChange: (v) => send({ type: "playground", playground: v === "off" ? null : v }),
  })
  const speeds = [0.1, 0.25, 0.5, 1, 2]
  const speed = pg.choice({
    label: "Speed",
    options: speeds.map((s) => ({ value: String(s), label: `${s}×` })),
    value: "1",
    onChange: (v) => send({ type: "slowmo", scale: Number(v) }),
  })
  const SCENARIOS: Record<string, [string, string][]> = {
    transcript: [
      ["liveArrival", "Live arrival"],
      ["toolBurst", "Tool burst"],
      ["steer", "Steer"],
    ],
    sessionList: [
      ["richMix", "Rich mix"],
      ["longTitles", "Long titles"],
      ["empty", "Empty"],
    ],
    composer: [
      ["call", "Call"],
      ["dictation", "Dictation"],
    ],
  }
  const scenarios = pg.actions([])
  let shownScreen = ""
  const appearance = pg.choice({
    label: "Appearance",
    options: [
      { value: "system", label: "Auto" },
      { value: "dark", label: "Dark" },
      { value: "light", label: "Light" },
    ],
    value: "system",
    onChange: (v) => command({ action: "environment", key: "appearance", value: v }),
  })
  const textSize = pg.choice({
    label: "Text size",
    options: [
      { value: "standard", label: "100%" },
      { value: "xxl", label: "XXL" },
      { value: "ax2", label: "AX2" },
    ],
    value: "standard",
    onChange: (v) => command({ action: "environment", key: "textSize", value: v }),
  })
  const reduceMotion = pg.toggle({
    label: "Reduce motion",
    value: false,
    onChange: (v) => command({ action: "environment", key: "reduceMotion", flag: v }),
  })
  const onMac = pg.toggle({
    label: "Controls on Mac",
    value: false,
    onChange: (v) => command({ action: "controlsOnMac", flag: v }),
  })

  // Motion Watch: jumps the phone noticed, newest first; Enter replays one.
  const watch = p.card({ title: "Motion Watch", section: "Playground" })
  const count = document.createElement("span")
  count.className = "tune-count"
  watch.accessory.append(count)
  const jumps = watch.list()
  const clear = watch.actions([])
  let jumpsKey: string | undefined

  const set = <T>(control: PageControl<T>, value: T) => control.set(value)
  return {
    update(phone: Phone) {
      const s = phone.playgroundStatus
      set(screen, s.active ?? "off")
      set(speed, String(s.timeScale))
      set(appearance, s.appearance)
      set(textSize, s.textSize)
      set(reduceMotion, s.reduceMotion)
      set(onMac, s.controlsOnMac)
      const active = s.active ?? ""
      if (active !== shownScreen) {
        shownScreen = active
        scenarios.set(
          (SCENARIOS[active] ?? []).map(([id, label]) => ({
            label,
            run: () => command({ action: "replay", value: id }),
          })),
        )
      }
      const key = phone.jumps.map((j) => j.id).join()
      if (key !== jumpsKey) {
        jumpsKey = key
        count.textContent = phone.jumps.length ? String(phone.jumps.length) : ""
        // Newest first; new jumps fold in at the top and cleared ones fold away.
        jumps.set(
          phone.jumps.length === 0
            ? [{ key: "none", label: "No jumps", detail: `${s.frameCount} frames` }]
            : [...phone.jumps].reverse().map((j) => ({
                key: j.id,
                label: `${title(j.kind)} · ${j.rows[0]}`,
                detail: `${j.magnitudePt.toFixed(1)} pt · f${j.frame}`,
                onSelect: () => command({ action: "replay", value: j.id }),
              })),
        )
        clear.set(
          phone.jumps.length
            ? [{ label: "Clear", run: () => command({ action: "clearJumps" }) }]
            : [],
        )
      }
    },
  }
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type !== "state") return
  const phone: Phone | undefined = message.state.phones[0]
  if (!phone) return
  const key = JSON.stringify(phone.schema.map((d) => d.key))
  if (!remote || key !== schemaKey) {
    schemaKey = key
    mount(phone)
  } else {
    // The phone's state, without echoing it back or recording undo; a value being dragged here
    // holds against stale echoes for a moment.
    remote.sync(mapping!.fromPhone(phone.values), { replace: true })
    ui?.update(phone)
  }
}
