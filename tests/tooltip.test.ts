import { describe, expect, it } from "vitest"
import { descriptionIds } from "../src/panel/description-ids"
import { HANDOFF_MS, TIP_DELAY_MS, tipSchedule } from "../src/ui/tooltip-model"

interface Tip {
  readonly el: { readonly name: string }
}

/** A schedule on a fake clock, logging what the page is asked to do. */
function harness() {
  let now = 0
  let next = 1
  const timers = new Map<number, { at: number; run: () => void }>()
  const log: string[] = []
  const schedule = tipSchedule<Tip>(
    {
      set: (run, ms) => {
        timers.set(next, { at: now + ms, run })
        return next++
      },
      clear: (handle) => timers.delete(handle as number),
      now: () => now,
    },
    {
      show: (tip, snap) => log.push(`show ${tip.el.name}${snap ? " snap" : ""}`),
      hide: (instant) => log.push(`hide${instant ? " now" : ""}`),
      connected: () => true,
    },
  )
  const advance = (ms: number) => {
    now += ms
    for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at))
      if (t.at <= now) {
        timers.delete(id)
        t.run()
      }
  }
  return { schedule, log, advance, timers }
}

const tip = (name: string): Tip => ({ el: { name } })

describe("tooltip schedule", () => {
  it("shows after the pause over a target", () => {
    const { schedule, log, advance } = harness()
    schedule.want(tip("speed"))
    advance(TIP_DELAY_MS - 1)
    expect(log).toEqual([])
    advance(1)
    expect(log).toEqual(["show speed"])
  })

  it("shows at once on keyboard focus", () => {
    const { schedule, log, timers } = harness()
    schedule.want(tip("speed"), { now: true })
    expect(log).toEqual(["show speed"])
    expect(timers.size).toBe(0)
  })

  it("never shows a waiting tip once focus has left its target", () => {
    const { schedule, log, advance, timers } = harness()
    const speed = tip("speed")
    schedule.want(speed)
    advance(200)
    schedule.leave((t) => t.el === speed.el)
    expect(schedule.pending).toBeNull()
    expect(timers.size).toBe(0)
    advance(TIP_DELAY_MS)
    expect(log).toEqual([])
  })

  it("leaving one target keeps another's tip", () => {
    const { schedule, log, advance } = harness()
    const speed = tip("speed")
    schedule.want(tip("size"))
    schedule.leave((t) => t.el === speed.el)
    advance(TIP_DELAY_MS)
    expect(log).toEqual(["show size"])
  })

  it("focus moving on hands the tip to the next row at once", () => {
    const { schedule, log, advance } = harness()
    const speed = tip("speed")
    schedule.want(speed, { now: true })
    schedule.leave((t) => t.el === speed.el)
    advance(HANDOFF_MS - 1)
    schedule.want(tip("size"), { now: true })
    expect(log).toEqual(["show speed", "hide", "show size snap"])
  })
})

describe("description ids", () => {
  it("differ between two panels on one store, and fit an id list", () => {
    const first = descriptionIds("my game")
    const second = descriptionIds("my game")
    const ids = [first(), first(), second(), second()]
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/)
  })
})
