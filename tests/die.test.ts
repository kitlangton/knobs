import { describe, expect, it } from "vitest"
import { DIE_LOOK, DieMotion, dieTracer, FACES } from "../src/panel/die.js"

const rest = { rx: 0, ry: 0, energy: 0 }
// 256 px die: one px per icon unit, so offsets read straight off Phosphor's grid.
const at = (x: number, y: number, view = rest) => Math.max(0, dieTracer(256, view, DIE_LOOK)(x, y))

describe("die", () => {
  it("faces form a die: opposite faces sum to 7 and every value appears once", () => {
    expect(FACES.map((f) => f.value).sort()).toEqual([1, 2, 3, 4, 5, 6])
    for (const a of FACES) {
      const b = FACES.find((f) => f.n.every((c, i) => c === -a.n[i]))!
      expect(a.value + b.value).toBe(7)
    }
  })

  it("at rest is the dice-five glyph: a 16-unit outline from 80 to 96, pips, empty face", () => {
    expect(at(0, 0)).toBe(1) // centre pip
    expect(at(36, -36)).toBe(1) // corner pip
    expect(at(18, 0)).toBe(0) // face between pips
    expect(at(78, 0)).toBe(0)
    expect(at(84, 0)).toBe(1) // outline
    expect(at(94, 0)).toBe(1)
    expect(at(99, 0)).toBe(0) // outside
  })

  it("rolls to a different face and settles there, retargeting mid-spin", () => {
    const m = new DieMotion()
    const first = m.roll(undefined, () => 0.1)
    expect(first).not.toBe(5)
    for (let i = 0; i < 6; i++) m.step(1 / 60)
    const second = m.roll(undefined, () => 0.9)
    expect(second).not.toBe(first)
    for (let i = 0; i < 300; i++) m.step(1 / 60)
    expect(m.resting).toBe(true)
    const face = FACES.find((f) => f.value === second)!
    expect(((m.rx.x - face.front[0]) % 360) + 0).toBeCloseTo(0)
    expect(((m.ry.x - face.front[1]) % 360) + 0).toBeCloseTo(0)
  })
})
