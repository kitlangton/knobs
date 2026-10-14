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
          { id: "0.0", label: "Theme", kind: "choice", choices: [{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }], value: "light" },
          { id: "0.1", label: "Reduce Motion", kind: "toggle", value: true },
        ],
      },
      { title: "", items: [{ id: "1.0", label: "Replay", kind: "action" }] },
    ])
    expect(descriptors).toEqual([
      { key: "0.0", label: "Theme", group: "Scenario", kind: "choice", default: "dark", choices: [{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }] },
      { key: "0.1", label: "Reduce Motion", group: "Scenario", kind: "toggle", default: false },
      { key: "1.0", label: "Replay", kind: "action" },
    ])
    expect(values).toEqual({ "0.0": "light", "0.1": true })
    const r = createRemoteControls("pv", descriptors, { values })
    expect(r.get()).toEqual(values)
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
