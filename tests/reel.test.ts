import { afterEach, describe, expect, it, vi } from "vitest"
import { entranceOffset, numeral } from "../src/panel/motion.js"
import { syncPlaces } from "../src/panel/reel.js"
import type { DigitPlace } from "../src/panel/slider.js"

const faces = (places: DigitPlace[]) =>
  places
    .map((p) => p.ch)
    .reverse()
    .join("")

describe("rolling readouts' places", () => {
  it("keep a place per character, ones first, and place them at once without a roll", () => {
    const places: DigitPlace[] = []
    syncPlaces(places, "0.85", 0, 0, 0)
    expect(faces(places)).toBe("0.85")
    expect(places.every((p) => p.presence.resting(performance.now()))).toBe(true)
  })
  it("roll each digit the value's way round, and fade a place that leaves", () => {
    const places: DigitPlace[] = []
    syncPlaces(places, "98", 0, 0, 0)
    syncPlaces(places, "108", 1, 320, 0)
    expect(faces(places)).toBe("108")
    // The tens roll 9 → 0 forwards (to 10), not back down through 8…1.
    expect(places[1]!.wheel.target).toBe(10)
    expect(places[2]!.presence.target).toBe(1)
    syncPlaces(places, "7", -1, 320, 0)
    expect(places[0]!.wheel.target).toBe(7)
    expect(places[1]!.exiting).toBe(true)
    syncPlaces(places, "7", 0, 0, 0)
    expect(places).toHaveLength(1)
  })

  describe("settle exactly on their digits", () => {
    let now = 1000
    afterEach(() => vi.restoreAllMocks())
    const clock = () => {
      now = 1000
      vi.spyOn(performance, "now").mockImplementation(() => now)
    }
    /** Every shown place at rest: on a whole face showing its character, fully present, risen. */
    const settled = (places: DigitPlace[], text: string) => {
      const later = now + 10_000
      for (let j = 0; j < text.length; j++) {
        const p = places[j]!
        const ch = text[text.length - 1 - j]!
        expect(p.ch).toBe(ch)
        expect(p.exiting).toBe(false)
        expect(p.presence.sample(later).position).toBe(1)
        expect(entranceOffset(later - p.enterAt, p.enterMs)).toBe(0)
        if (ch < "0" || ch > "9") continue
        const { position, velocity } = p.wheel.sample(later)
        expect(Number.isInteger(position)).toBe(true)
        expect(numeral(position)).toBe(ch)
        expect(velocity).toBe(0)
        expect(p.wheel.span(later)).toEqual([position, position])
      }
    }

    it("when a change lands mid-roll, from wherever the wheel is", () => {
      clock()
      const places: DigitPlace[] = []
      syncPlaces(places, "0.85", 0, 0, 0)
      syncPlaces(places, "0.19", -1, 320, 0)
      now += 130
      // Mid-roll the wheels sit between faces…
      expect(Number.isInteger(places[0]!.wheel.sample(now).position)).toBe(false)
      syncPlaces(places, "0.47", 1, 320, 0)
      settled(places, "0.47")
    })

    it("when undo reverses a roll that is still waiting for its turn", () => {
      clock()
      const places: DigitPlace[] = []
      syncPlaces(places, "35", 0, 0, 0)
      syncPlaces(places, "220", 1, 320, 180)
      now += 60
      syncPlaces(places, "153", -1, 320, 120)
      now += 200
      syncPlaces(places, "35", -1, 320, 0)
      now += 50
      syncPlaces(places, "220", 1, 320, 90)
      settled(places, "220")
    })

    it("across many quick changes, each interrupting the last", () => {
      clock()
      let seed = 7
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      for (let run = 0; run < 300; run++) {
        const places: DigitPlace[] = []
        let value = Math.floor(rand() * 400)
        syncPlaces(places, String(value), 0, 0, 0)
        for (let step = 0; step < 6; step++) {
          const next = Math.floor(rand() * 400)
          const ms = rand() < 0.2 ? 0 : 320
          syncPlaces(
            places,
            String(next),
            Math.sign(next - value),
            ms,
            ms ? Math.floor(rand() * 200) : 0,
          )
          value = next
          now += Math.floor(rand() * 400)
        }
        settled(places, String(value))
      }
    })
  })
})
