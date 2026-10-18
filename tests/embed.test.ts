import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  action,
  choice,
  createRemoteControls,
  defineControls,
  flatSpring,
  fromDescriptors,
  knob,
  toggle,
  type ControlDescriptor,
} from "../src/index.js"

const params = (max = 10): ControlDescriptor[] => [
  { key: "size", label: "Size", kind: "number", default: 4, min: 0, max, step: 1 },
  {
    key: "duration",
    label: "Duration",
    kind: "number",
    default: 0.45,
    min: 0.1,
    max: 1,
    step: 0.05,
    unit: "s",
  },
  { key: "bounce", label: "Bounce", kind: "number", default: 0.3, min: 0, max: 0.7, step: 0.05 },
  {
    key: "spring",
    label: "Spring",
    kind: "spring",
    group: "Spring",
    bind: { duration: "duration", bounce: "bounce" },
  },
]

describe("holds: the row in hand is never clobbered", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("defers incoming values for a held key and lands the newest on release", () => {
    const c = defineControls(
      "hold",
      { a: knob(1, { min: 0, max: 10, step: 1 }), b: knob(1, { min: 0, max: 10, step: 1 }) },
      { enabled: true, storage: null },
    )
    c.hold("a")
    c.set({ a: 5 }, { coalesce: true })
    c.sync({ a: 2, b: 3 })
    expect(c.get()).toEqual({ a: 5, b: 3 })
    c.sync({ a: 7 })
    expect(c.get().a).toBe(5)
    expect(c.isHeld("a")).toBe(true)
    c.hold("a", false)
    // No echo window on a local store: the newest incoming value lands at once.
    expect(c.get().a).toBe(7)
    expect(c.isHeld("a")).toBe(false)
  })

  it("drops an incoming value that a later local change supersedes", () => {
    const c = defineControls(
      "hold2",
      { a: knob(1, { min: 0, max: 10, step: 1 }) },
      { enabled: true, storage: null },
    )
    c.hold("a")
    c.sync({ a: 2 })
    c.set({ a: 6 })
    c.hold("a", false)
    expect(c.get().a).toBe(6)
  })

  it("remote: one rule for drags and echoes (held in hand, then 600 ms after the last change)", () => {
    const sent: [string, unknown][] = []
    const r = createRemoteControls("echo", params(), { onSet: (k, v) => sent.push([k, v]) })
    r.hold("size")
    r.set({ size: 6 })
    r.update(params(), { size: 3, duration: 0.5 })
    expect(r.get()).toMatchObject({ size: 6, duration: 0.5 })
    r.hold("size", false)
    // Released, but changed 0 ms ago: the echo window still holds it.
    expect(r.get().size).toBe(6)
    vi.advanceTimersByTime(650)
    expect(r.get().size).toBe(3)
    expect(sent).toEqual([["size", 6]])
  })

  it("an acknowledgement ends a key's echo hold early, so the peer's next change lands at once", () => {
    // A slow peer (the phone renders each acknowledgement): a long window, released by the ack.
    const r = createRemoteControls("ack", params(), { echo: 5000 })
    r.set({ size: 6, duration: 0.4 })
    // A stale snapshot from before the change: held.
    r.sync({ size: 3, duration: 0.45 }, { replace: true })
    expect(r.get()).toMatchObject({ size: 6, duration: 0.4 })
    // The peer acknowledges size (and reports duration on its own grid, within half a step).
    r.sync({ size: 6, duration: 0.42 }, { replace: true })
    expect(r.isHeld("size")).toBe(false)
    expect(r.isHeld("duration")).toBe(false)
    // Its next change applies immediately, long before the 5 s window would have ended.
    r.sync({ size: 8, duration: 0.42 }, { replace: true })
    expect(r.get()).toMatchObject({ size: 8, duration: 0.42 })
  })

  it("undo and redo also hold against stale echoes for the echo window", () => {
    const sent: [string, unknown][] = []
    const r = createRemoteControls("undo-echo", params(), {
      nullDefaults: false,
      onSet: (k, v) => sent.push([k, v]),
    })
    r.set({ size: 8 })
    // A stale echo from before undo arrives while the undo is in flight.
    r.sync({ size: 7 })
    expect(r.get().size).toBe(8)
    vi.advanceTimersByTime(100)
    r.undo()
    expect(r.get().size).toBe(4)
    expect(sent).toEqual([
      ["size", 8],
      ["size", 4],
    ])
    // A late echo of 8 arriving right after undo is held back; after 600 ms the peer's latest lands.
    r.sync({ size: 8 })
    expect(r.get().size).toBe(4)
    r.sync({ size: 4 })
    vi.advanceTimersByTime(650)
    expect(r.get().size).toBe(4)
  })
})

describe("remote.update: descriptor swaps without teardown", () => {
  it("adds and removes keys, keeps persisting ones, and notifies once", () => {
    const r = createRemoteControls("swap", params(), { nullDefaults: false })
    let notified = 0
    r.subscribe(() => notified++)
    r.update(
      [
        { key: "size", kind: "number", default: 4, min: 0, max: 20, step: 1 },
        { key: "tint", kind: "toggle", default: true },
      ],
      { size: 12 },
    )
    expect(Object.keys(r.schema)).toEqual(["size", "tint"])
    expect(r.get()).toEqual({ size: 12, tint: true })
    expect(notified).toBe(1)
    expect(r.descriptors.map((d) => d.key)).toEqual(["size", "tint"])
    // The same shape and values: nothing to tell anyone.
    r.update(r.descriptors, { size: 12 })
    expect(notified).toBe(1)
  })

  it("scopes undo to a descriptor set: a new shape or a landing starts history over", () => {
    const r = createRemoteControls("undo", params())
    r.set({ size: 5 })
    expect(r.canUndo).toBe(true)
    // Same descriptors, values from the server: history stays.
    r.update(params(), { size: 5 })
    expect(r.canUndo).toBe(true)
    // Another variation (a different range): history belonged to the last one.
    r.update(params(20), { size: 5 })
    expect(r.canUndo).toBe(false)
    r.set({ size: 7 })
    expect(r.canUndo).toBe(true)
    r.update(params(20), { size: 2 }, { land: true })
    expect(r.canUndo).toBe(false)
    expect(r.get().size).toBe(2)
  })

  it("flags a landing while it notifies, so panels place values instead of springing", () => {
    const r = createRemoteControls("land", params())
    const seen: boolean[] = []
    r.subscribe(() => seen.push(r.landing))
    r.update(params(), { size: 9 }, { land: true })
    r.update(params(), { size: 1 })
    r.sync({ size: 3 }, { land: true })
    expect(seen).toEqual([true, false, true])
    expect(r.landing).toBe(false)
  })
})

describe("flat springs", () => {
  it("binds two flat number keys: values, onSet and sync stay flat", () => {
    vi.useFakeTimers()
    const sent: [string, unknown][] = []
    const r = createRemoteControls("flat", params(), {
      nullDefaults: false,
      onSet: (k, v) => sent.push([k, v]),
    })
    expect(Object.keys(r.schema)).toEqual(["size", "duration", "bounce"])
    expect(r.get()).toEqual({ size: 4, duration: 0.45, bounce: 0.3 })
    const d = r.schema.duration
    expect(d.kind === "knob" && d.spring).toEqual({
      id: "spring",
      part: "duration",
      label: "Spring",
    })
    expect(d.group).toBe("Spring")
    expect(d.kind === "knob" && [d.min, d.max, d.unit]).toEqual([0.1, 1, "s"])
    r.set({ duration: 0.6, bounce: 0.1 })
    expect(sent).toEqual([
      ["duration", 0.6],
      ["bounce", 0.1],
    ])
    r.sync({ duration: 0.2 })
    expect(r.get()).toMatchObject({ duration: 0.6, bounce: 0.1 })
    vi.advanceTimersByTime(650)
    expect(r.get()).toMatchObject({ duration: 0.2, bounce: 0.1 })
    vi.useRealTimers()
  })

  it("makes its own halves when the keys have no descriptors", () => {
    const schema = fromDescriptors([
      {
        key: "travel",
        kind: "spring",
        label: "Travel",
        bind: { duration: "d", bounce: "b" },
        default: { duration: 0.3, bounce: 0.2 },
      },
    ])
    expect(Object.keys(schema)).toEqual(["d", "b"])
    expect(schema.d).toMatchObject({
      kind: "knob",
      value: 0.3,
      spring: { id: "travel", part: "duration" },
    })
    expect(schema.b).toMatchObject({ kind: "knob", value: 0.2, label: "Bounce" })
  })

  it("works for local controls too", () => {
    const c = defineControls(
      "local-flat",
      { ...flatSpring({ duration: 0.4, bounce: 0.2 }, { label: "Spring" }) },
      { enabled: true, storage: null },
    )
    expect(c.get()).toEqual({ duration: 0.4, bounce: 0.2 })
    expect(c.schema.bounce.spring).toMatchObject({ part: "bounce", id: "Spring" })
  })
})

describe("prototype settings: actions, string choices and toggles", () => {
  it("maps viewer.js settings 1:1, with titles as groups", () => {
    const actions: string[] = []
    const r = createRemoteControls(
      "settings",
      [
        {
          key: "0.0",
          kind: "choice",
          label: "Theme",
          group: "Scenario",
          default: "dark",
          choices: [
            { id: "dark", label: "Dark" },
            { id: "light", label: "Light" },
          ],
        },
        { key: "0.1", kind: "toggle", label: "Reduce Motion", group: "Scenario", default: false },
        { key: "1.0", kind: "action", label: "Replay", group: "Actions" },
      ],
      { onAction: (k) => actions.push(k) },
    )
    expect(r.get()).toEqual({ "0.0": "dark", "0.1": false })
    expect(r.schema["0.0"]).toMatchObject({
      options: ["dark", "light"],
      labels: { dark: "Dark", light: "Light" },
    })
    r.action("1.0")
    expect(actions).toEqual(["1.0"])
    expect(() => r.action("0.1")).toThrow()
    r.randomize()
    r.mutate()
    expect(Object.keys(r.get())).toEqual(["0.0", "0.1"])
    expect(r.isModified()).toBeTypeOf("boolean")
  })

  it("local action fields run, reach onAction, and hold no value", () => {
    const ran: string[] = []
    const c = defineControls(
      "local-actions",
      {
        replay: action("Replay", { run: () => ran.push("run") }),
        mode: choice("a", ["a", "b"], { labels: { a: "Alpha" } }),
        on: toggle(false),
      },
      { enabled: true, storage: null, onAction: (k) => ran.push(k) },
    )
    c.action("replay")
    expect(ran).toEqual(["run", "replay"])
    expect(c.get()).toEqual({ mode: "a", on: false })
    expect(c.schema.mode.labels).toEqual({ a: "Alpha" })
    c.reset()
    expect(c.modified()).toEqual({})
  })
})

describe("intents: onSet and onReset", () => {
  it("nullDefaults: false sends values as they are and resets only as onReset", () => {
    const events: unknown[] = []
    const r = createRemoteControls("intents", params(), {
      nullDefaults: false,
      onSet: (k, v) => events.push(["set", k, v]),
      onReset: (t) => events.push(["reset", t]),
    })
    r.set({ size: 5 })
    r.set({ size: 4 })
    r.resetKey("size")
    r.set({ duration: 0.5 })
    r.resetGroup("Spring")
    r.reset()
    expect(events).toEqual([
      ["set", "size", 5],
      ["set", "size", 4],
      ["reset", { key: "size" }],
      ["set", "duration", 0.5],
      ["reset", { group: "Spring" }],
      ["reset", {}],
    ])
  })

  it("isModified answers for a key or the whole set, and changes notify subscribers", () => {
    const r = createRemoteControls("mod", params())
    const seen: boolean[] = []
    r.subscribe(() => seen.push(r.isModified("size")))
    expect(r.isModified()).toBe(false)
    r.sync({ size: 6 })
    expect(r.isModified("size")).toBe(true)
    expect(r.isModified("bounce")).toBe(false)
    expect(r.isModified()).toBe(true)
    expect(seen).toEqual([true])
  })
})

describe("viewer.js settings", () => {
  it("maps pv:settings groups to descriptors and values, titles as groups", async () => {
    const { fromSettings } = await import("../src/index.js")
    const { descriptors, values } = fromSettings([
      {
        title: "Scenario",
        items: [
          {
            id: "0.0",
            label: "Theme",
            kind: "choice",
            choices: [
              { id: "dark", label: "Dark" },
              { id: "light", label: "Light" },
            ],
            value: "light",
          },
          { id: "0.1", label: "Reduce Motion", kind: "toggle", value: true },
        ],
      },
      { title: "", items: [{ id: "1.0", label: "Replay", kind: "action" }] },
    ])
    expect(descriptors).toEqual([
      {
        key: "0.0",
        label: "Theme",
        group: "Scenario",
        kind: "choice",
        default: "light",
        choices: [
          { id: "dark", label: "Dark" },
          { id: "light", label: "Light" },
        ],
      },
      { key: "0.1", label: "Reduce Motion", group: "Scenario", kind: "toggle", default: true },
      { key: "1.0", label: "Replay", kind: "action" },
    ])
    expect(values).toEqual({ "0.0": "light", "0.1": true })
    const r = createRemoteControls("pv", descriptors, { values })
    expect(r.get()).toEqual(values)
    // What the prototype reported is home: nothing reads as modified.
    expect(r.isModified()).toBe(false)
  })

  it("keeps the first report as home while values move", async () => {
    const { fromSettings } = await import("../src/index.js")
    const report = (theme: string, motion: boolean) => [
      {
        title: "Scenario",
        items: [
          {
            id: "t",
            label: "Theme",
            kind: "choice" as const,
            choices: [{ id: "light" }, { id: "dark" }],
            value: theme,
          },
          { id: "m", label: "Reduce Motion", kind: "toggle" as const, value: motion },
        ],
      },
    ]
    const first = fromSettings(report("dark", false))
    const later = fromSettings(report("light", true), first.values)
    expect(later.descriptors.map((d) => d.default)).toEqual(["dark", false])
    expect(later.values).toEqual({ t: "light", m: true })
    expect(JSON.stringify(later.descriptors)).toBe(JSON.stringify(first.descriptors))
    const r = createRemoteControls("pv-home", first.descriptors, { values: first.values })
    r.update(first.descriptors, later.values)
    expect(r.isModified("t")).toBe(true)
  })

  it("marks: false is the store's default for its panels", () => {
    expect(createRemoteControls("m-on", params()).marks).toBe(true)
    expect(createRemoteControls("m-off", params(), { marks: false }).marks).toBe(false)
    expect(
      defineControls("m-local", { a: knob(1, { min: 0, max: 2 }) }, { marks: false, storage: null })
        .marks,
    ).toBe(false)
  })

  it("update with the same array only syncs values (no reshape, history kept)", () => {
    const list = params()
    const r = createRemoteControls("same", list)
    const schema = r.schema
    r.set({ size: 2 })
    r.update(list, { size: 9 })
    expect(r.schema).toBe(schema)
    expect(r.canUndo).toBe(true)
  })
})

describe("panel key bindings", () => {
  it("remaps, turns off, and lets explicit bindings take a default's key", async () => {
    const { resolveKeys, keyLabel } = await import("../src/panel/prefs.js")
    const keys = resolveKeys({ hint: "f", random: false, presets: ",.", vim: false, bigStep: 5 })
    expect(keys.hint).toEqual(["f"])
    expect(keys.first).toEqual([]) // f went to hint
    expect(keys.random).toEqual([])
    expect(keys.mutate).toEqual(["r"]) // ⌥ commands match by physical key
    expect(keys.presets).toEqual([",", "."])
    expect(keys.undo).toEqual(["u", "z"])
    expect(resolveKeys(undefined, true).leave).toEqual([])
    expect([keyLabel("R"), keyLabel("Backspace"), keyLabel("r", true)]).toEqual(["⇧R", "⌫", "⌥R"])
    // A plain l locks (⇧L still does); a remapped lock gives both up.
    expect(resolveKeys(undefined).lock).toEqual(["l", "L"])
    expect(resolveKeys({ lock: "K" }).lock).toEqual(["K"])
  })
  it("leaves ←/→ to the arrows: l is Lock, not a step right", async () => {
    const { arrowOf } = await import("../src/panel/prefs.js")
    const key = (k: string) => ({ key: k, target: null }) as unknown as KeyboardEvent
    expect([arrowOf(key("ArrowLeft")), arrowOf(key("ArrowRight"))]).toEqual([-1, 1])
    expect([arrowOf(key("h")), arrowOf(key("l"))]).toEqual([0, 0])
  })
  it("reads vim, edit, bigStep and wrap per panel", async () => {
    const { DEFAULT_PREFS, keyPrefs } = await import("../src/panel/prefs.js")
    expect(DEFAULT_PREFS).toEqual({ vim: true, edit: true, bigStep: 10, wrap: true })
    expect(keyPrefs(null)).toBe(DEFAULT_PREFS)
  })
})

describe("shipping", () => {
  it("a shipped store mounts from the module it names; an unshipped one uses its own lazy chunk", async () => {
    const mounted: string[] = []
    const panel = {
      mountPanel: (c: { id: string }) => {
        mounted.push(c.id)
        return { element: {} as HTMLElement, focus() {}, dispose() {} }
      },
      attach: () => () => {},
    }
    const ready: unknown[] = []
    const r = createRemoteControls("shipped", params(), { ship: async () => panel })
    r.mount({} as HTMLElement, { onReady: (p) => ready.push(p) })
    await new Promise((resolve) => setTimeout(resolve))
    expect(mounted).toEqual(["shipped"])
    expect(ready).toHaveLength(1)
    // `enabled` defaults to true for a shipped store, even away from localhost.
    const c = defineControls(
      "shipped-local",
      { a: knob(1, { min: 0, max: 2, step: 1 }) },
      { storage: null, ship: async () => panel },
    )
    expect(c.enabled).toBe(true)
  })

  it("shares mount options, descriptor/value sync, and look sync across React and Solid adapters", async () => {
    const { mountPanelAdapter, syncPanelValues } = await import("../src/core/adapter.js")
    const { problemsPreset } = await import("../src/themes/index.js")
    let receivedOpts: Record<string, unknown> | undefined
    const fakePanel = {
      element: {} as HTMLElement,
      focus: vi.fn(),
      dispose: vi.fn(),
    }
    const r = createRemoteControls("adapter-test", params(), {
      ship: async () => ({
        mountPanel: (_c, _host, opts) => {
          receivedOpts = opts as Record<string, unknown>
          return fakePanel
        },
        attach: () => () => {},
      }),
    })
    let readyHandle: unknown
    let copyText = "first"
    const dispose = mountPanelAdapter({} as HTMLElement, r, () => ({
      controls: r,
      header: false,
      variants: false,
      marks: false,
      preset: problemsPreset,
      keys: { random: false, vim: false, bigStep: 5 },
      copy: () => copyText,
      onReady: (p) => (readyHandle = p),
    }))
    await new Promise((resolve) => setTimeout(resolve))
    expect(readyHandle).toBe(fakePanel)
    expect(receivedOpts).toMatchObject({
      header: false,
      variants: false,
      marks: false,
      preset: problemsPreset,
      keys: { random: false, vim: false, bigStep: 5 },
    })
    copyText = "updated"
    expect((receivedOpts?.copy as () => string)()).toBe("updated")
    syncPanelValues(
      r,
      [{ key: "width", kind: "number", default: 10, min: 0, max: 50, step: 5 }],
      { width: 25 },
      true,
    )
    expect(Object.keys(r.schema)).toEqual(["width"])
    expect(r.get()).toEqual({ width: 25 })
    dispose()
    expect(fakePanel.dispose).toHaveBeenCalledTimes(1)
  })
})
