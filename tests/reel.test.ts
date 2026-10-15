import { describe, expect, it } from "vitest"
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
})
