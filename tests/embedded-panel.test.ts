// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ControlDescriptor } from "../src/core/remote.js"
import { createRemoteControls, defineControls, knob, spring } from "../src/index.js"
import { mountPanel } from "../src/panel/panel.js"

// OpenCode Desktop's Stack: features keyed `Area · Feature`, each with its own presets.
const descriptors = (): ControlDescriptor[] => [
  {
    key: "peek.width",
    label: "Width",
    kind: "number",
    default: 240,
    min: 160,
    max: 400,
    step: 8,
    group: "Sidebars · Peek",
  },
  {
    key: "peek.delay",
    label: "Delay",
    kind: "number",
    default: 0.2,
    min: 0,
    max: 1,
    step: 0.05,
    group: "Sidebars · Peek",
  },
  {
    key: "dock.lift",
    label: "Lift",
    kind: "number",
    default: 6,
    min: 0,
    max: 20,
    step: 1,
    group: "Composer · Dock",
  },
  {
    key: "dock.fade",
    label: "Fade",
    kind: "number",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
    group: "Composer · Dock",
  },
  {
    key: "global.speed",
    label: "Speed",
    kind: "number",
    default: 1,
    min: 0.25,
    max: 4,
    step: 0.25,
    group: "Global",
  },
]
const scopedPresets = {
  "Sidebars · Peek": {
    snappy: { "peek.width": 200, "peek.delay": 0.1 },
    calm: { "peek.width": 320, "peek.delay": 0.4 },
  },
}

// happy-dom draws no canvas; the group die paints its faces into one.
HTMLCanvasElement.prototype.getContext = (() => ({
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
})) as never

let hosts: HTMLElement[] = []
const host = () => {
  const node = document.createElement("div")
  document.body.append(node)
  hosts.push(node)
  return node
}
afterEach(() => {
  for (const node of hosts) node.remove()
  hosts = []
})
const rowLabels = (root: Element) =>
  [...root.querySelectorAll(".knobs-row .knobs-label")].map((n) => n.textContent)
const key = (target: Element, init: KeyboardEventInit) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))

describe("embed", () => {
  it("shows the named groups alone, in order, with no header, footer or toggle", () => {
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), {
      embed: true,
      groups: ["Composer · Dock", "Sidebars · Peek"],
    })
    const root = panel.element
    expect(root.hasAttribute("data-embed")).toBe(true)
    expect(root.dataset.density).toBe("compact")
    expect(root.querySelector("header")?.hidden).toBe(true)
    expect(root.querySelector(".knobs-popover")).toBeNull()
    expect(rowLabels(root)).toEqual(["Lift", "Fade", "Width", "Delay"])
    // Two groups keep their titles.
    expect(root.hasAttribute("data-solo")).toBe(false)
    panel.dispose()
  })

  it("leads one group with its action row and its own presets", () => {
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), { embed: true, groups: ["Sidebars · Peek"] })
    const root = panel.element
    expect(root.hasAttribute("data-solo")).toBe(true)
    expect(rowLabels(root)).toEqual(["Width", "Delay"])
    const head = root.querySelector<HTMLElement>(".knobs-group-head")!
    expect(head.dataset.group).toBe("Sidebars · Peek")
    // Not a fold: the host shows or hides the feature.
    expect(head.hasAttribute("data-foldable")).toBe(false)
    expect(head.querySelector(".knobs-group-reset")).not.toBeNull()
    expect(head.querySelector(".knobs-group-die")).not.toBeNull()
    // The group's presets lead its card, and the panel's own strip stays out of the way.
    const card = head.nextElementSibling as HTMLElement
    const strip = card.firstElementChild as HTMLElement
    expect(strip.classList.contains("knobs-presets")).toBe(true)
    expect(strip.hidden).toBe(false)
    expect(strip.getAttribute("aria-label")).toBe("Sidebars · Peek presets")
    const top = root.querySelector<HTMLElement>(".knobs-presets:not(.knobs-card *)")
    expect(top?.hidden).toBe(true)
    // Picking one sets the feature's keys.
    const calm = [...strip.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      /calm/i.test(b.textContent ?? ""),
    )!
    calm.click()
    expect(remote.get()).toMatchObject({ "peek.width": 320, "peek.delay": 0.4 })
    // …and the group's Reset blooms, and puts them back.
    const reset = head.querySelector<HTMLButtonElement>(".knobs-group-reset")!
    expect(reset.dataset.shown).toBe("true")
    reset.click()
    expect(remote.get()).toMatchObject({ "peek.width": 240, "peek.delay": 0.2 })
    panel.dispose()
  })
})

describe("groups scope the panel's own commands", () => {
  const head = (root: Element, label: string) =>
    root.querySelector<HTMLButtonElement>(`header button[aria-label="${label}"]`)!

  it("Random, Mutate and Reset touch only the shown groups' keys", () => {
    const sent: { key: string; source: string }[] = []
    const remote = createRemoteControls("stack", descriptors(), {
      scopedPresets,
      onSet: (key, _value, meta) => sent.push({ key, source: meta.source }),
    })
    const panel = mountPanel(remote, host(), { groups: ["Sidebars · Peek"] })
    const root = panel.element
    remote.set({ "dock.lift": 12, "global.speed": 2 })
    sent.length = 0
    // Hidden groups' changes don't light the panel's Reset.
    expect(head(root, "Reset").dataset.shown).toBe("false")
    const hidden = () => ({ lift: remote.get()["dock.lift"], speed: remote.get()["global.speed"] })
    for (let i = 0; i < 4; i++) head(root, "Random").click()
    head(root, "Random").dispatchEvent(new MouseEvent("click", { altKey: true }))
    expect(hidden()).toEqual({ lift: 12, speed: 2 })
    const rolled = new Set(sent.filter((s) => s.source !== "reset").map((s) => s.key))
    expect([...rolled].sort()).toEqual(["peek.delay", "peek.width"])
    remote.set({ "peek.width": 320 })
    expect(head(root, "Reset").dataset.shown).toBe("true")
    head(root, "Reset").click()
    expect(remote.get()).toMatchObject({ "peek.width": 240, "peek.delay": 0.2 })
    expect(hidden()).toEqual({ lift: 12, speed: 2 })
    expect(remote.canReset(["peek.width", "peek.delay"])).toBe(false)
    panel.dispose()
  })

  it("Reset forgets a shown group's scoped preset, and ⇧R does the same embedded", () => {
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), { embed: true, groups: ["Sidebars · Peek"] })
    remote.preset("calm", { scope: "Sidebars · Peek" })
    remote.set({ "dock.lift": 12 })
    // From the panel itself (not a row or card), ⇧R resets everything it shows.
    key(panel.element, { key: "R", code: "KeyR", shiftKey: true })
    expect(remote.get()).toMatchObject({ "peek.width": 240, "peek.delay": 0.2, "dock.lift": 12 })
    expect(remote.activePreset("Sidebars · Peek")).toBeNull()
    expect(remote.canReset(["peek.width", "peek.delay"])).toBe(false)
    panel.dispose()
  })
})

describe("groupActions", () => {
  it("draw in each group's action row and run", async () => {
    const replay = vi.fn()
    const focus = vi.fn(() => "Focused")
    const seen: string[] = []
    const remote = createRemoteControls("stack", descriptors(), { scopedPresets })
    const panel = mountPanel(remote, host(), {
      embed: true,
      groups: ["Sidebars · Peek", "Composer · Dock"],
      groupActions: (group) => {
        seen.push(group)
        return group === "Sidebars · Peek"
          ? [
              { label: "Replay", icon: "retrigger", run: replay },
              { label: "Focus", icon: "target", title: "Outline it", run: focus },
            ]
          : []
      },
    })
    expect(seen).toEqual(["Sidebars · Peek", "Composer · Dock"])
    const heads = panel.element.querySelectorAll<HTMLElement>(".knobs-group-head")
    const buttons = [...heads[0]!.querySelectorAll<HTMLButtonElement>(".knobs-group-action")]
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Replay", "Focus"])
    expect(buttons.map((b) => b.textContent)).toEqual(["Replay", "Focus"])
    expect(buttons[0]!.querySelector("svg.knobs-icon")).not.toBeNull()
    // Before the group's Reset and die.
    const order = [...heads[0]!.querySelectorAll("button")].map((b) => b.className)
    expect(order).toEqual([
      "knobs-group-action",
      "knobs-group-action",
      "knobs-group-reset",
      "knobs-group-die",
    ])
    expect(heads[1]!.querySelector(".knobs-group-action")).toBeNull()
    buttons[0]!.click()
    buttons[1]!.click()
    expect(replay).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalledTimes(1)
    // What an action returns is said in the panel's status line.
    expect(panel.element.querySelector(".knobs-status")?.textContent).toBe("Focused")
    panel.dispose()
  })

  it("show in a panel's group headers too", () => {
    const run = vi.fn()
    const c = defineControls(
      "plain",
      { a: knob(1, { min: 0, max: 2, step: 1, group: "A" }) },
      { enabled: true, storage: null },
    )
    const panel = mountPanel(c, host(), {
      groupActions: () => [{ label: "Replay", icon: "retrigger", run }],
    })
    const b = panel.element.querySelector<HTMLButtonElement>(
      ".knobs-group-head .knobs-group-action",
    )!
    expect(b.getAttribute("aria-label")).toBe("Replay")
    b.click()
    expect(run).toHaveBeenCalledTimes(1)
    panel.dispose()
  })

  it("pass through the Solid and React adapters with embed and groups", async () => {
    const { mountPanelAdapter } = await import("../src/core/adapter.js")
    const remote = createRemoteControls("stack", descriptors(), {
      scopedPresets,
      ship: () => import("../src/panel/index.js"),
    })
    const node = host()
    let current = vi.fn()
    let ready = false
    const dispose = mountPanelAdapter(node, remote, () => ({
      controls: remote,
      embed: true,
      groups: ["Sidebars · Peek"],
      surface: "flat",
      groupActions: () => [{ label: "Replay", icon: "retrigger", run: () => current() }],
      onReady: () => (ready = true),
    }))
    await vi.waitFor(() => expect(ready).toBe(true))
    const root = node.firstElementChild as HTMLElement
    expect(root.dataset.surface).toBe("flat")
    expect(root.dataset.density).toBe("compact")
    expect(rowLabels(root)).toEqual(["Width", "Delay"])
    // The latest props' action runs.
    current = vi.fn()
    root.querySelector<HTMLButtonElement>(".knobs-group-action")!.click()
    expect(current).toHaveBeenCalledTimes(1)
    dispose()
  })
})

describe("remote randomize and undo", () => {
  const setup = () => {
    const sent: { key: string; value: unknown; source: string }[] = []
    const remote = createRemoteControls("stack", descriptors(), {
      scopedPresets,
      onSet: (key, value, meta) => sent.push({ key, value, source: meta.source }),
    })
    const panel = mountPanel(remote, host(), { embed: true, groups: ["Sidebars · Peek"] })
    return { remote, panel, sent }
  }
  const peek = (state: Record<string, unknown>) => ({
    width: state["peek.width"],
    delay: state["peek.delay"],
  })

  it("rolls a group with its die and undoes with ⌘Z, each through onSet", () => {
    const { remote, panel, sent } = setup()
    const before = peek(remote.get())
    panel.element.querySelector<HTMLButtonElement>(".knobs-group-die")!.click()
    const rolled = sent.filter((s) => s.source === "randomize")
    expect(rolled.map((s) => s.key).sort()).toEqual(["peek.delay", "peek.width"])
    // Only the group's keys roll.
    expect(sent.some((s) => !s.key.startsWith("peek."))).toBe(false)
    expect(peek(remote.get())).not.toEqual(before)
    sent.length = 0
    const row = panel.element.querySelector<HTMLElement>(".knobs-row [tabindex], .knobs-row input")!
    key(row, { key: "z", code: "KeyZ", metaKey: true })
    expect(peek(remote.get())).toEqual(before)
    const undone = sent.filter((s) => s.source === "undo")
    expect(undone.map((s) => s.key).sort()).toEqual(["peek.delay", "peek.width"])
    // Defaults go back as nulls, as a reset would send them.
    expect(undone.every((s) => s.value === null)).toBe(true)
    sent.length = 0
    key(row, { key: "z", code: "KeyZ", metaKey: true, shiftKey: true })
    expect(peek(remote.get())).not.toEqual(before)
    expect(sent.filter((s) => s.source === "redo")).toHaveLength(2)
    panel.dispose()
  })

  it("rolls the focused row's group with g", () => {
    const { remote, panel, sent } = setup()
    const before = peek(remote.get())
    const row = panel.element.querySelector<HTMLElement>(".knobs-row [tabindex], .knobs-row input")!
    key(row, { key: "g", code: "KeyG" })
    expect(sent.filter((s) => s.source === "randomize").length).toBeGreaterThan(0)
    expect(peek(remote.get())).not.toEqual(before)
    key(row, { key: "z", code: "KeyZ", ctrlKey: true })
    expect(peek(remote.get())).toEqual(before)
    panel.dispose()
  })

  it("leaves ⌘Z to a text field", () => {
    const { remote, panel } = setup()
    remote.set({ "peek.width": 320 })
    const input = document.createElement("input")
    panel.element.append(input)
    expect(key(input, { key: "z", code: "KeyZ", metaKey: true })).toBe(true)
    expect(remote.get()["peek.width"]).toBe(320)
    panel.dispose()
  })
})
