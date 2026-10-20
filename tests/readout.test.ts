import { describe, expect, it } from "vitest"
import {
  createRemoteControls,
  defineControls,
  graph,
  hasValue,
  isReadout,
  knob,
  log,
  meter,
  sparkline,
  table,
  watch,
} from "../src"
import { EntryLog, READOUT, type ReadoutPort, Ring } from "../src/core/readout"
import {
  EasedRange,
  fitRange,
  formatNumber,
  graphScene,
  historyRuns,
  levelOf,
  meterScene,
  niceStep,
  type Palette,
  sampleAt,
  sparkScene,
} from "../src/ui/readout-model"

const palette: Palette = {
  accent: [0.3, 0.55, 1, 1],
  text: [1, 1, 1, 0.92],
  label: [1, 1, 1, 0.64],
  dim: [1, 1, 1, 0.42],
  line: [1, 1, 1, 0.1],
  surfaceHi: [1, 1, 1, 0.11],
  warn: [1, 0.62, 0.04, 1],
  critical: [1, 0.27, 0.23, 1],
  series: [[0.35, 0.78, 0.98, 1]],
  radius: 0,
}

describe("readout fields", () => {
  it("hold no value, and Random, Reset and code leave them out", () => {
    const c = defineControls(
      "rd",
      {
        gain: knob(1, { min: 0, max: 2 }),
        fps: watch({ label: "FPS", decimals: 0 }),
        frame: sparkline({ unit: "ms", min: 0 }),
        perf: graph({ series: ["cpu", { id: "gpu", area: true }], thresholds: [16.7] }),
        mem: meter({ max: 512, warn: 384, critical: 480 }),
        passes: table({ columns: ["Pass", "ms"] }),
        events: log({ lines: 6 }),
      },
      { storage: null, enabled: true },
    )
    expect(Object.keys(c.get())).toEqual(["gain"])
    for (const k of ["fps", "frame", "perf", "mem", "passes", "events"] as const) {
      expect(isReadout(c.schema[k])).toBe(true)
      expect(hasValue(c.schema[k])).toBe(false)
    }
    c.randomize()
    c.reset()
    expect(c.code("json")).not.toContain("fps")
    expect(c.schema.perf.series.map((s) => s.id)).toEqual(["cpu", "gpu"])
    expect(c.schema.perf.thresholds).toEqual([{ value: 16.7 }])
  })
  it("check their options", () => {
    expect(() => watch({ decimals: 1.5 })).toThrow()
    expect(() => sparkline({ history: 0 })).toThrow()
    expect(() => graph({ series: ["a", "a"] })).toThrow()
    expect(() => meter({ min: 1, max: 1 })).toThrow()
    expect(() => table({ columns: [] })).toThrow()
  })
})

describe("controls.watch", () => {
  const make = () =>
    defineControls(
      "watching",
      {
        fps: watch(),
        frame: sparkline({ history: 4 }),
        perf: graph({ series: ["cpu", "gpu"], history: 3 }),
        events: log({ max: 3 }),
        passes: table(),
      },
      { storage: null, enabled: true },
    )
  it("keeps the latest value and each history, and tells listeners", () => {
    const c = make()
    const port = (c as unknown as { [READOUT]: ReadoutPort })[READOUT]
    const heard: string[] = []
    const off = port.listen((k) => heard.push(k))
    expect(c.watched("fps")).toBeUndefined()
    c.watch("fps", 59.8)
    c.watch("fps", "paused")
    expect(c.watched("fps")).toBe("paused")
    for (const v of [1, 2, 3, 4, 5]) c.watch("frame", v)
    expect(port.state("frame")!.series!.get("")!.toArray()).toEqual([2, 3, 4, 5])
    c.watch("frame", [9, 8])
    expect(port.state("frame")!.series!.get("")!.toArray()).toEqual([9, 8])
    c.watch("perf", { cpu: 4, gpu: 9 })
    c.watch("perf", { gpu: 10 })
    const perf = port.state("perf")!.series!
    expect(perf.get("cpu")!.toArray()).toEqual([4, Number.NaN])
    expect(perf.get("gpu")!.toArray()).toEqual([9, 10])
    c.watch("events", "one")
    c.watch("events", [{ text: "two", level: "warn" }, "three", { text: "four", level: "error" }])
    const entries = port.state("events")!.log!
    expect(entries.entries.map((e) => [e.text, e.level])).toEqual([
      ["two", "warn"],
      ["three", "info"],
      ["four", "error"],
    ])
    expect(entries.total).toBe(4)
    c.watch("passes", [["Shadow", 0.4]])
    expect(c.watched("passes")).toEqual([["Shadow", 0.4]])
    c.watch("events", null)
    expect(entries.entries).toEqual([])
    off()
    c.watch("fps", 1)
    expect(heard).toHaveLength(14)
  })
  it("ignores keys that aren't readouts", () => {
    const c = make()
    expect(() => (c.watch as (k: string, v: unknown) => void)("nope", 1)).not.toThrow()
  })
  it("starts a readout's history over when its shape changes", () => {
    const r = createRemoteControls("remote-rd", [{ key: "f", kind: "sparkline", history: 3 }])
    const port = (r as unknown as { [READOUT]: ReadoutPort })[READOUT]
    r.watch("f", 1)
    r.watch("f", 2)
    r.update([{ key: "f", kind: "sparkline", history: 3, label: "Frame" }])
    expect(port.state("f")!.series!.get("")!.toArray()).toEqual([1, 2])
    r.update([{ key: "f", kind: "sparkline", history: 5 }])
    expect(port.state("f")!.series!.get("")!.length).toBe(0)
    expect(r.schema.f!.kind).toBe("sparkline")
    expect(r.swift()).toBe("")
  })
})

describe("readout model", () => {
  it("rings keep the newest samples, oldest first", () => {
    const r = new Ring(3)
    for (const v of [1, 2, 3, 4]) r.push(v)
    expect(r.toArray()).toEqual([2, 3, 4])
    expect(r.extent()).toEqual([2, 4])
    r.push(Number.NaN)
    expect(r.extent()).toEqual([3, 4])
    const l = new EntryLog(2)
    l.push({ text: "a" })
    l.push({ text: "b" })
    l.push({ text: "c" })
    expect(l.entries.map((e) => e.seq)).toEqual([1, 2])
  })
  it("formats numbers with fewer places as they grow", () => {
    expect(formatNumber(3.14159)).toBe("3.14")
    expect(formatNumber(16.66)).toBe("16.7")
    expect(formatNumber(144.4)).toBe("144")
    expect(formatNumber(-0.001, 1)).toBe("0.0")
    expect(formatNumber(Number.NaN)).toBe("—")
  })
  it("snaps a scale out to nice steps, keeping fixed bounds and thresholds", () => {
    expect(niceStep(10)).toBe(5)
    expect(fitRange(3.2, 18.4)).toEqual([0, 20])
    expect(fitRange(3.2, 18.4, { min: 0 })).toEqual([0, 20])
    expect(fitRange(8, 12, {}, [16.7])).toEqual([5, 20])
    expect(fitRange(60, 60)).toEqual([50, 70])
    expect(fitRange(Number.NaN, Number.NaN)).toEqual([0, 1])
  })
  it("eases between ranges on a spring, and settles", () => {
    const e = new EasedRange()
    e.to(0, 10)
    expect(e.value).toEqual([0, 10])
    e.to(0, 20)
    e.step(1 / 60)
    const mid = e.value[1]
    expect(mid).toBeGreaterThan(10)
    expect(mid).toBeLessThan(20)
    let frames = 0
    while (e.step(1 / 60) && frames < 600) frames++
    expect(e.value[1]).toBe(20)
    expect(frames).toBeLessThan(120)
  })
  it("lays a history out newest at the right, breaking at gaps", () => {
    const r = new Ring(5)
    for (const v of [0, 1, Number.NaN, 1, 0]) r.push(v)
    const runs = historyRuns(r, 5, [0, 1], 100, 0, 10)
    expect(runs).toEqual([
      [0, 10, 25, 0],
      [75, 0, 100, 10],
    ])
    expect(sampleAt(100, 100, 5, 5)).toBe(4)
    expect(sampleAt(26, 100, 5, 5)).toBe(1)
    expect(sampleAt(0, 100, 5, 2)).toBe(-1)
  })
  it("draws sparklines, graphs and meters as ops", () => {
    const r = new Ring(4)
    for (const v of [1, 3, 2, 4]) r.push(v)
    const spark = sparkScene({
      ring: r,
      capacity: 4,
      range: [0, 4],
      w: 60,
      h: 16,
      color: palette.accent,
      palette,
      hover: false,
    })
    expect(spark.map((o) => o.t)).toEqual(["area", "line", "dot"])
    const hovered = sparkScene({
      ring: r,
      capacity: 4,
      range: [0, 4],
      w: 60,
      h: 16,
      color: palette.accent,
      palette,
      hover: true,
    })
    expect(hovered.filter((o) => o.t === "dot")).toHaveLength(3)
    const g = graphScene({
      lines: [{ ring: r, color: palette.accent, area: true }],
      capacity: 4,
      range: [0, 4],
      thresholds: [{ value: 2, color: palette.dim }],
      w: 100,
      h: 40,
      palette,
      hover: 2,
    })
    expect(g.filter((o) => o.t === "area")).toHaveLength(1)
    expect(g.filter((o) => o.t === "dot")).toHaveLength(1)
    expect(g.filter((o) => o.t === "rect").length).toBeGreaterThan(10)
    expect(levelOf(300, 384, 480)).toBe(0)
    expect(levelOf(400, 384, 480)).toBe(1)
    expect(levelOf(500, 384, 480)).toBe(2)
    // Hysteresis: a level holds until the value falls a band below its threshold.
    expect(levelOf(380, 384, 480, 1, 10)).toBe(1)
    expect(levelOf(370, 384, 480, 1, 10)).toBe(0)
    expect(levelOf(380, 384, 480, 0, 10)).toBe(0)
    expect(levelOf(475, 384, 480, 2, 10)).toBe(2)
    const m = meterScene({ fraction: 0.5, level: 0, min: 0, max: 1, w: 100, h: 8, palette })
    expect(m).toHaveLength(2)
    expect((m[1] as { w: number }).w).toBe(50)
    const cells = meterScene({
      fraction: 0.55,
      level: 0,
      min: 0,
      max: 10,
      segments: 10,
      warn: 7,
      w: 100,
      h: 8,
      palette,
    })
    expect(cells.filter((o) => o.t === "rect")).toHaveLength(16)
    const sweep = meterScene({
      fraction: 0,
      level: 0,
      min: 0,
      max: 1,
      sweep: 0.5,
      w: 90,
      h: 8,
      palette,
    })
    expect(sweep).toHaveLength(2)
  })
})
