// A simulated iPhone for the tune page: the same wire shapes as opencode-ios's tune server
// (scripts/tune-shared.ts), served over an in-page fake WebSocket. It applies `set`, `preset`,
// `resetAll`, `playground`, `slowmo` and `playgroundCommand`, answers with `state`, and now and
// then pushes state of its own (a motion jump it noticed, a value tuned on the device).

export type Value = number | boolean | string
export type Descriptor = {
  key: string
  label: string
  kind: "number" | "bool" | "choice"
  swiftType: string
  default: Value
  min?: number
  max?: number
  step?: number
  choices?: string[]
  group: string
}
export type PresetSet = {
  key: string
  label: string
  group: string
  keys: string[]
  presets: { name: string; values: Record<string, Value> }[]
}
export type Jump = {
  id: string
  kind: string
  frame: number
  magnitudePt: number
  rows: string[]
  detail: string
}
export type PlaygroundStatus = {
  active: "transcript" | "sessionList" | "composer" | null
  timeScale: number
  appearance: "system" | "dark" | "light"
  textSize: "standard" | "xxl" | "ax2"
  reduceMotion: boolean
  controlsOnMac: boolean
  frameCount: number
  lastReplay?: string
}
export type Phone = {
  device: string
  app: string
  schema: Descriptor[]
  values: Record<string, Value>
  context: { id: string; groups: string[]; label?: string }
  hidden: string[]
  canUndo: string[]
  presets: PresetSet[]
  playgroundStatus: PlaygroundStatus
  jumps: Jump[]
}

const group = (key: string) => key.slice(0, key.indexOf("."))
const num = (
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  swiftType = "CGFloat",
): Descriptor => ({
  key,
  label,
  kind: "number",
  swiftType,
  default: value,
  min,
  max,
  step,
  group: group(key),
})
const pick = (
  key: string,
  label: string,
  value: string,
  choices: string[],
  swiftType: string,
): Descriptor => ({
  key,
  label,
  kind: "choice",
  swiftType,
  default: value,
  choices,
  group: group(key),
})
const flag = (key: string, label: string, value: boolean): Descriptor => ({
  key,
  label,
  kind: "bool",
  swiftType: "Bool",
  default: value,
  group: group(key),
})
/** A TunableSpring registers as two numbers, `.duration` and `.bounce`. */
const spring = (key: string, label: string, duration: number, bounce: number): Descriptor[] => [
  num(`${key}.duration`, `${label} duration`, duration, 0.1, 1.2, 0.01, "Double"),
  num(`${key}.bounce`, `${label} bounce`, bounce, 0, 0.6, 0.01, "Double"),
]

// Names, labels, defaults and ranges from the app's Tunable declarations.
const schema: Descriptor[] = [
  num("drawer.row.height", "Row height", 44, 28, 72, 1),
  num("drawer.row.gap", "Gap between rows", 0, 0, 16, 1),
  num("drawer.row.edge", "Highlight from the sides", 12, 0, 32, 1),
  num("drawer.row.cornerRadius", "Highlight corner radius", 12, 0, 24, 1),
  pick("drawer.row.font", "Row text", "body", ["callout", "body", "headline"], "DrawerTextStyle"),
  num("drawer.section.above", "Room above a header", 8, 0, 40, 1),
  num("drawer.section.height", "Header height", 36, 16, 60, 1),
  num("drawer.section.below", "Room below a header", 4, 0, 24, 1),
  num("drawer.edge.fade", "Fade below the title", 19, 0, 120, 1),
  num("drawer.edge.blurRadius", "Blur radius", 2.5, 0, 40, 0.5),
  num("drawer.edge.washOpacity", "Wash at the title", 0.7, 0, 1, 0.01, "Double"),
  pick(
    "drawer.edge.blurCurve",
    "Blur falloff",
    "smoothstep",
    ["smoothstep", "linear"],
    "DrawerEdgeCurve",
  ),
  pick("drawer.edge.bottomEdge", "Bottom edge", "soft", ["soft", "hard"], "DrawerEdgeStyle"),
  ...spring("drawer.search.morph", "Search morph", 0.3, 0.15),
  ...spring("drawer.open", "Drawer open", 0.42, 0.12),
  num("drawer.card.omega", "Card spring ω", 28.5, 8, 60, 0.5),
  flag("drawer.motion.rubberBand", "Rubber band", true),

  num("transcript.arrivals.entranceDuration", "Entrance fade", 0.25, 0.05, 0.8, 0.01, "Double"),
  num("transcript.arrivals.entranceRise", "Entrance rise (pt)", 6, 0, 24, 1),
  num("transcript.arrivals.textFadeDuration", "Streamed text fade", 0.2, 0.05, 0.8, 0.01, "Double"),
  num("transcript.arrivals.settlingDuration", "Model-switch fade", 0.4, 0.1, 1, 0.02, "Double"),
  num("transcript.arrivals.workingHandoff", "Working → Copy handoff", 0.34, 0.1, 1, 0.02, "Double"),
  flag("transcript.arrivals.staggerTools", "Stagger tool rows", true),
  num("transcript.row.flowHalf", "Reply row half-gap", 8, 2, 20, 1),
  num("transcript.row.turnHalf", "Turn half-gap", 12, 4, 28, 1),
  num("transcript.row.sectionHalf", "Section rule half-gap", 16, 6, 36, 1),
  num("transcript.row.contentGutter", "Horizontal gutter", 16, 8, 32, 1),
  num("transcript.bubble.verticalPadding", "Bubble vertical padding", 10, 6, 20, 1),
  num("transcript.bubble.cornerRadius", "Bubble corner radius", 18, 8, 28, 1),
  num("transcript.card.cornerRadius", "Card corner radius", 14, 6, 24, 1),
  ...spring("transcript.promotion", "Steer promote", 0.4, 0.1),
  ...spring("transcript.jump", "Jump glide", 0.5, 0),
  num("transcript.follow.arrivalOmega", "Arrival spring ω", 20, 10, 60, 1, "Double"),
  num("transcript.follow.maxFrameStep", "Max step (pt/frame)", 18, 4, 24, 1, "Double"),

  pick(
    "session.header.mode",
    "Blur mode",
    "systemEdge",
    ["systemEdge", "customBlur", "off"],
    "HeaderBlurMode",
  ),
  num("session.header.fadeStart", "Full-strength depth", -20, -20, 80, 1),
  num("session.header.fadeEnd", "Fade-out end", 64, 0, 120, 1),
  num("session.header.washOpacity", "Wash opacity", 0, 0, 1, 0.02),
  num("session.header.pocketExtension", "Pocket extension", 0, -20, 64, 1),
  num("session.header.blurRadius", "Blur radius", 4.5, 0, 24, 0.5),

  num("composer.size.barHeight", "Bar height", 56, 40, 72, 1),
  num("composer.size.cornerRadius", "Corner radius", 28, 16, 36, 1),
  pick(
    "composer.size.textStyle",
    "Text size",
    "body",
    ["callout", "body", "title3"],
    "ComposerTextStyle",
  ),
  num("composer.spacing.horizontalMargin", "Side margin", 20, 8, 48, 1),
  num("composer.spacing.keyboardGap", "Keyboard gap", 8, 0, 24, 1),
  pick(
    "composer.level.style",
    "Level picker",
    "barPanel",
    ["barPanel", "scrubber"],
    "LevelScrubberStyle",
  ),
  pick(
    "composer.level.icon",
    "Level icon",
    "risingBars",
    ["risingBars", "dotMatrix"],
    "LevelIconStyle",
  ),
  pick(
    "composer.level.placement",
    "Placement",
    "besideModel",
    ["besideModel", "besideMic"],
    "LevelPlacement",
  ),
  num("composer.level.blurRadius", "Backdrop blur", 22, 0, 40, 0.5),
  num("composer.level.washOpacity", "Backdrop darkness", 0.62, 0, 1, 0.01),
  flag("composer.level.haptics", "Haptic detents", true),
  num("composer.controls.buttonDiameter", "Send/Call circle size", 34, 26, 44, 1),
  num("composer.controls.micScale", "Mic glyph size", 17, 13, 22, 0.5),
  num("composer.controls.trailingGap", "Send/Call trailing gap", 11, 4, 20, 1),
  ...spring("composer.expand", "Expand", 0.35, 0.18),
]

const presetSet = (key: string, label: string, presets: PresetSet["presets"]): PresetSet => ({
  key,
  label,
  group: group(key),
  keys: [...new Set(presets.flatMap((p) => Object.keys(p.values)))],
  presets,
})
// Numbered presets, as TuningPresets declares them: 1 is what shipped.
const presets: PresetSet[] = [
  presetSet("drawer.spacing", "Spacing", [
    { name: "Today", values: {} },
    {
      name: "Compact",
      values: {
        "drawer.row.height": 38,
        "drawer.row.edge": 8,
        "drawer.row.cornerRadius": 10,
        "drawer.row.font": "callout",
        "drawer.section.above": 4,
        "drawer.section.height": 28,
        "drawer.section.below": 2,
      },
    },
    {
      name: "Comfortable",
      values: {
        "drawer.row.height": 48,
        "drawer.row.gap": 2,
        "drawer.row.cornerRadius": 14,
        "drawer.section.above": 14,
        "drawer.section.below": 6,
      },
    },
    {
      name: "Airy",
      values: {
        "drawer.row.height": 52,
        "drawer.row.gap": 4,
        "drawer.row.edge": 16,
        "drawer.row.cornerRadius": 16,
        "drawer.section.above": 22,
        "drawer.section.height": 40,
        "drawer.section.below": 8,
        "drawer.row.font": "headline",
      },
    },
  ]),
  presetSet("transcript.rhythm", "Rhythm", [
    { name: "Today", values: {} },
    {
      name: "Compact",
      values: {
        "transcript.row.flowHalf": 6,
        "transcript.row.turnHalf": 9,
        "transcript.row.sectionHalf": 12,
        "transcript.row.contentGutter": 12,
        "transcript.bubble.verticalPadding": 8,
        "transcript.bubble.cornerRadius": 15,
        "transcript.card.cornerRadius": 11,
      },
    },
    {
      name: "Comfortable",
      values: {
        "transcript.row.flowHalf": 10,
        "transcript.row.turnHalf": 14,
        "transcript.row.sectionHalf": 20,
        "transcript.row.contentGutter": 18,
        "transcript.bubble.verticalPadding": 11,
        "transcript.bubble.cornerRadius": 20,
        "transcript.card.cornerRadius": 16,
      },
    },
    {
      name: "Airy",
      values: {
        "transcript.row.flowHalf": 12,
        "transcript.row.turnHalf": 18,
        "transcript.row.sectionHalf": 24,
        "transcript.row.contentGutter": 20,
        "transcript.bubble.verticalPadding": 12,
        "transcript.bubble.cornerRadius": 22,
        "transcript.card.cornerRadius": 18,
      },
    },
  ]),
  presetSet("transcript.arrivals", "Arrivals", [
    { name: "Today", values: {} },
    {
      name: "Brisk",
      values: {
        "transcript.arrivals.entranceDuration": 0.16,
        "transcript.arrivals.entranceRise": 4,
        "transcript.arrivals.textFadeDuration": 0.12,
      },
    },
    {
      name: "Gentle",
      values: {
        "transcript.arrivals.entranceDuration": 0.42,
        "transcript.arrivals.entranceRise": 10,
        "transcript.arrivals.textFadeDuration": 0.34,
        "transcript.arrivals.settlingDuration": 0.6,
      },
    },
  ]),
  presetSet("session.headerStyle", "Header Style", [
    { name: "A · Current", values: {} },
    {
      name: "C · Fade Only",
      values: {
        "session.header.mode": "off",
        "session.header.fadeStart": 32,
        "session.header.fadeEnd": 90,
        "session.header.washOpacity": 1,
      },
    },
    {
      name: "D · Heavy",
      values: {
        "session.header.fadeStart": 14,
        "session.header.fadeEnd": 108,
        "session.header.washOpacity": 0.9,
        "session.header.pocketExtension": 62,
      },
    },
    {
      name: "F · Recommended",
      values: {
        "session.header.fadeStart": 31,
        "session.header.fadeEnd": 88,
        "session.header.washOpacity": 0.96,
        "session.header.pocketExtension": 42,
      },
    },
  ]),
  presetSet("composer.size", "Size", [
    { name: "Today", values: {} },
    {
      name: "Compact",
      values: {
        "composer.size.barHeight": 48,
        "composer.size.cornerRadius": 24,
        "composer.size.textStyle": "callout",
      },
    },
    {
      name: "Roomy",
      values: {
        "composer.size.barHeight": 62,
        "composer.size.cornerRadius": 31,
        "composer.spacing.horizontalMargin": 16,
      },
    },
  ]),
]

const JUMP_KINDS = ["layout jump", "opacity pop", "frame snap", "scroll lurch"]
const JUMP_ROWS = ["toolRow", "assistantText", "userBubble", "workingRow", "divider"]

/** The fake WebSocket the page talks to; messages cross with a little latency, as JSON. */
export interface FakeSocket {
  send(text: string): void
  onmessage: ((event: { data: string }) => void) | null
}

export function connectPhone(): FakeSocket {
  const phone: Phone = {
    device: "Kit’s iPhone",
    app: "OpenCode",
    schema,
    values: {},
    context: {
      id: "transcriptPlayground",
      groups: ["transcript", "session", "composer"],
      label: "Transcript",
    },
    hidden: [],
    canUndo: [],
    presets,
    playgroundStatus: {
      active: "transcript",
      timeScale: 1,
      appearance: "system",
      textSize: "standard",
      reduceMotion: false,
      controlsOnMac: false,
      frameCount: 0,
    },
    jumps: [],
  }
  const byKey = new Map(schema.map((d) => [d.key, d]))
  const socket: FakeSocket = { send: () => {}, onmessage: null }
  const LATENCY = 24
  let pending: ReturnType<typeof setTimeout> | undefined
  const push = () => {
    // Coalesced like the server's broadcast().
    if (pending) return
    pending = setTimeout(() => {
      pending = undefined
      const state = { phones: [structuredClone(phone)] }
      socket.onmessage?.({ data: JSON.stringify({ type: "state", state }) })
    }, LATENCY)
  }
  const store = (key: string, raw: Value | null) => {
    const d = byKey.get(key)
    if (!d) return
    let v = raw
    if (typeof v === "number") {
      v = Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v))
      if (d.step) v = Math.round(v / d.step) * d.step
      v = Number(v.toFixed(4))
    }
    if (v === null || v === d.default) delete phone.values[key]
    else phone.values[key] = v
  }
  const apply = (message: any) => {
    const pg = phone.playgroundStatus
    switch (message.type) {
      case "set":
        store(message.key, message.value)
        break
      case "preset": {
        const set = phone.presets.find((p) => p.key === message.key)
        const preset = set?.presets[message.index]
        if (set && preset) for (const k of set.keys) store(k, preset.values[k] ?? null)
        break
      }
      case "resetAll":
        for (const d of schema)
          if (!message.group || d.group === message.group) delete phone.values[d.key]
        break
      case "playground":
        pg.active = message.playground
        break
      case "slowmo":
        pg.timeScale = message.scale
        break
      case "playgroundCommand": {
        const c = message.command
        if (c.action === "environment") (pg as any)[c.key] = c.flag ?? c.value
        else if (c.action === "controlsOnMac") pg.controlsOnMac = c.flag
        else if (c.action === "clearJumps") phone.jumps = []
        else if (c.action === "replay") {
          pg.lastReplay = c.value
          setTimeout(() => noticeJump(), 600 / pg.timeScale)
        }
        break
      }
    }
    push()
  }
  socket.send = (text) => setTimeout(() => apply(JSON.parse(text)), LATENCY)

  let frame = 120
  const noticeJump = () => {
    if (!phone.playgroundStatus.active) return
    frame += 30 + Math.floor(Math.random() * 90)
    phone.playgroundStatus.frameCount = frame
    phone.jumps = [
      ...phone.jumps,
      {
        id: `j${frame}`,
        kind: JUMP_KINDS[Math.floor(Math.random() * JUMP_KINDS.length)]!,
        frame,
        magnitudePt: Number((2 + Math.random() * 22).toFixed(1)),
        rows: [JUMP_ROWS[Math.floor(Math.random() * JUMP_ROWS.length)]!],
        detail: "settled after 3 frames",
      },
    ].slice(-5)
    push()
  }
  // Now and then the phone has news of its own.
  setTimeout(noticeJump, 1500)
  setTimeout(noticeJump, 2600)
  setInterval(noticeJump, 9000)
  setInterval(() => {
    // Tuned on the device itself: the page follows without echoing it back.
    if (document.hidden) return
    const numbers = schema.filter((d) => d.kind === "number" && d.key.startsWith("transcript.row"))
    const d = numbers[Math.floor(Math.random() * numbers.length)]!
    const current = Number(phone.values[d.key] ?? d.default)
    store(d.key, current + (Math.random() < 0.5 ? -1 : 1) * (d.step ?? 1) * 2)
    push()
  }, 21000)
  push()
  return socket
}
