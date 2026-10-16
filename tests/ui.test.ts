import { describe, expect, it } from "vitest"
import {
  applyMove,
  dropTarget,
  flatten,
  navigate,
  select,
  stepMove,
  topmost,
  typeahead,
  validMove,
  virtualWindow,
  type TreeAccess,
} from "../src/ui/tree-model"
import { Spring, springMotion } from "../src/core/spring"
import {
  chevronFlip,
  chevronTurn,
  collapsibleSide,
  drag,
  edgeOf,
  FACE_IN,
  FACE_OUT,
  foldFaces,
  foldProgress,
  foldStyle,
  nudge,
  parseLayout,
  serializeLayout,
  softClamp,
  solve,
  titleTravel,
  type FoldFaces,
  type PaneSpec,
} from "../src/ui/split-model"

const panes: PaneSpec[] = [
  { id: "left", size: 232, min: 168, max: 560, collapsible: true },
  { id: "center", min: 360 },
  { id: "right", size: 292, min: 232, max: 680, collapsible: true },
]

describe("split model", () => {
  it("keeps sized panes and gives the rest to the flexible one", () => {
    const s = solve({ panes, sizes: {}, collapsed: {}, total: 1442 })
    expect(s).toEqual({ left: 232, center: 1442 - 2 - 232 - 292, right: 292 })
  })
  it("clamps saved sizes to each pane's bounds", () => {
    const s = solve({ panes, sizes: { left: 10, right: 5000 }, collapsed: {}, total: 2000 })
    expect(s.left).toBe(168)
    expect(s.right).toBe(680)
  })
  it("gives sized panes up (largest first) before the flexible pane goes under its minimum", () => {
    const s = solve({ panes, sizes: {}, collapsed: {}, total: 802 })
    expect(s.center).toBe(360)
    expect(s.left + s.right).toBe(800 - 360)
    // Right (the larger) gives what it can down to its minimum, then left gives the rest.
    expect([s.left, s.right]).toEqual([208, 232])
    // Not below their own minimums.
    const tiny = solve({ panes, sizes: {}, collapsed: {}, total: 500 })
    expect([tiny.left, tiny.right]).toEqual([168, 232])
  })
  it("shares space among flexible panes by their last sizes, within min and max", () => {
    const flex: PaneSpec[] = [{ id: "a" }, { id: "b", max: 100 }, { id: "c" }]
    const s = solve({ panes: flex, sizes: { a: 300, b: 300, c: 100 }, collapsed: {}, total: 702 })
    expect(s.b).toBe(100)
    expect(s.a).toBeCloseTo(450)
    expect(s.c).toBeCloseTo(150)
  })
  it("collapsed panes take their rail and the flexible pane takes the rest", () => {
    const s = solve({ panes, sizes: {}, collapsed: { left: true }, total: 1442, rail: () => 26 })
    expect(s.left).toBe(26)
    expect(s.center).toBe(1440 - 26 - 292)
  })
  it("holds fixed sizes exactly (a pane mid-spring)", () => {
    const s = solve({ panes, sizes: {}, collapsed: {}, total: 1442, fixed: { left: 100.5 } })
    expect(s.left).toBe(100.5)
    expect(s.center).toBe(1440 - 100.5 - 292)
  })
  it("soft-clamps: 1:1 in range, easing into a bound, never past it", () => {
    expect(softClamp(300, 100, 500)).toBe(300)
    expect(softClamp(495, 100, 500)).toBeLessThan(495)
    expect(softClamp(495, 100, 500)).toBeGreaterThan(488)
    expect(softClamp(5000, 100, 500)).toBeLessThanOrEqual(500)
    expect(softClamp(5000, 100, 500)).toBeGreaterThan(499.9)
    expect(softClamp(-50, 100, 500)).toBeGreaterThanOrEqual(100)
    // Monotonic.
    let last = -Infinity
    for (let x = 0; x < 700; x += 3) {
      const y = softClamp(x, 100, 500)
      expect(y).toBeGreaterThanOrEqual(last)
      last = y
    }
  })
  it("drags trade between the two panes beside the divider within both bounds", () => {
    const start = { left: 232, center: 916, right: 292 }
    const r = drag(panes, start, 0, 40)
    expect(r.sizes).toEqual({ left: 272, center: 876 })
    const far = drag(panes, start, 0, 2000)
    expect(far.sizes.left).toBeLessThanOrEqual(560)
    expect(far.sizes.left! + far.sizes.center!).toBe(232 + 916)
    const right = drag(panes, start, 1, -100)
    expect(right.sizes).toEqual({ center: 816, right: 392 })
  })
  it("a collapsible pane dragged well past its minimum collapses, and back out opens", () => {
    const start = { left: 232, center: 916, right: 292 }
    expect(drag(panes, start, 0, -60).collapse).toBeUndefined()
    expect(drag(panes, start, 0, -140).collapse).toEqual({ id: "left", collapsed: true })
    const shut = { left: 26, center: 1122, right: 292 }
    expect(drag(panes, shut, 0, 20, { left: true }).collapse).toBeUndefined()
    expect(drag(panes, shut, 0, 120, { left: true }).collapse).toEqual({
      id: "left",
      collapsed: false,
    })
  })
  it("nudges by keys within bounds", () => {
    const s = { left: 232, center: 916, right: 292 }
    expect(nudge(panes, s, 0, 16)).toEqual({ left: 248, center: 900 })
    expect(nudge(panes, s, 0, -1e6).left).toBe(168)
    expect(nudge(panes, s, 1, 1e6).right).toBe(232)
  })
  it("knows which side a divider collapses and toward which edge", () => {
    expect(collapsibleSide(panes, 0)).toBe("left")
    expect(collapsibleSide(panes, 1)).toBe("right")
    expect(edgeOf(panes, "left")).toBe("start")
    expect(edgeOf(panes, "right")).toBe("end")
  })
  it("saves and restores layouts, dropping what it doesn't know", () => {
    const text = serializeLayout({
      sizes: { left: 250.123, right: 300 },
      collapsed: { right: true, left: false },
    })
    expect(JSON.parse(text)).toEqual({
      sizes: { left: 250.1, right: 300 },
      collapsed: { right: true },
    })
    expect(parseLayout(JSON.parse(text), panes)).toEqual({
      sizes: { left: 250.1, right: 300 },
      collapsed: { right: true },
    })
    expect(
      parseLayout(
        { sizes: { left: "x", gone: 3, right: Number.NaN }, collapsed: { left: 1 } },
        panes,
      ),
    ).toEqual({ sizes: {}, collapsed: {} })
    expect(parseLayout(null, panes)).toBeUndefined()
  })
})

describe("split folds", () => {
  const OPEN: FoldFaces = { content: 1, rail: 0 }
  const SHUT: FoldFaces = { content: 0, rail: 1 }
  /** The faces along a run of fold progress values, from `start`. */
  const run = (ps: number[], start: FoldFaces) => {
    let f = start
    return ps.map((p) => (f = foldFaces(f, p)))
  }
  const ramp = (from: number, to: number, n = 100) =>
    Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n)

  it("measures progress from the open size (0) to the rail (1)", () => {
    expect(foldProgress(200, 200, 32)).toBe(0)
    expect(foldProgress(32, 200, 32)).toBe(1)
    expect(foldProgress(116, 200, 32)).toBeCloseTo(0.5)
    // Past either end it holds there.
    expect(foldProgress(240, 200, 32)).toBe(0)
    expect(foldProgress(20, 200, 32)).toBe(1)
  })

  it("folding, the content leaves early and the rail arrives late, never both at once", () => {
    const ps = ramp(0, 1)
    const faces = run(ps, OPEN)
    faces.forEach((f, i) => {
      const p = ps[i]!
      if (p >= FACE_OUT) expect(f.content).toBe(0)
      if (p <= 1 - FACE_IN) expect(f.rail).toBe(0)
      expect(f.content > 0 && f.rail > 0).toBe(false)
      if (i) expect(f.content).toBeLessThanOrEqual(faces[i - 1]!.content)
      if (i) expect(f.rail).toBeGreaterThanOrEqual(faces[i - 1]!.rail)
    })
    expect(faces.at(-1)).toEqual(SHUT)
  })

  it("opening mirrors it: the rail leaves early and the content arrives late", () => {
    const ps = ramp(1, 0)
    const faces = run(ps, SHUT)
    faces.forEach((f, i) => {
      const p = ps[i]!
      if (p <= 1 - FACE_OUT) expect(f.rail).toBe(0)
      if (p >= FACE_IN) expect(f.content).toBe(0)
      expect(f.content > 0 && f.rail > 0).toBe(false)
    })
    expect(faces.at(-1)).toEqual(OPEN)
  })

  it("turning back mid-flight, every face carries on from where it is", () => {
    // Fold to 20%, open again, fold to 85%, open all the way: in small steps, nothing jumps.
    const ps = [
      ...ramp(0, 0.2, 20),
      ...ramp(0.2, 0.1, 10),
      ...ramp(0.1, 0.85, 75),
      ...ramp(0.85, 0, 85),
    ]
    const faces = run(ps, OPEN)
    for (let i = 1; i < faces.length; i++) {
      const step = Math.abs(ps[i]! - ps[i - 1]!)
      expect(Math.abs(faces[i]!.content - faces[i - 1]!.content)).toBeLessThanOrEqual(
        step / FACE_IN + 1e-9,
      )
      expect(Math.abs(faces[i]!.rail - faces[i - 1]!.rail)).toBeLessThanOrEqual(
        step / FACE_IN + 1e-9,
      )
      expect(faces[i]!.content > 0 && faces[i]!.rail > 0).toBe(false)
    }
    // Turned back at 20%, the half-faded content holds until the opening curve reaches it.
    const at = faces[20]!.content
    expect(at).toBeCloseTo(0.5)
    expect(faces[25]!.content).toBeCloseTo(at)
    expect(faces.at(-1)).toEqual(OPEN)
  })

  it("on the pane's spring, the content is gone in ~0.1 s and the rail lands as it settles", () => {
    const { omega, zeta } = springMotion({ duration: 0.45, bounce: 0 })
    const open = 170
    const rail = 32
    const s = new Spring(open, omega, zeta, 0.2).set(rail)
    let f = OPEN
    let gone = 0
    let railFrom = 0
    for (let t = 1; t <= 60; t++) {
      s.step(1 / 60)
      f = foldFaces(f, foldProgress(s.x, open, rail))
      if (!gone && f.content === 0) gone = t / 60
      if (!railFrom && f.rail > 0) railFrom = t / 60
    }
    expect(gone).toBeLessThan(0.13)
    expect(railFrom).toBeGreaterThan(0.15)
    expect(f).toEqual(SHUT)
  })

  it("reversed on its spring, the size turns back without a jump and ends open", () => {
    const { omega, zeta } = springMotion({ duration: 0.45, bounce: 0 })
    const open = 170
    const rail = 32
    const s = new Spring(open, omega, zeta, 0.2).set(rail)
    const sizes: number[] = []
    let f = OPEN
    for (let t = 1; t <= 90; t++) {
      if (t === 8) s.set(open)
      s.step(1 / 60)
      sizes.push(s.x)
      f = foldFaces(f, foldProgress(s.x, open, rail))
    }
    for (let i = 1; i < sizes.length; i++)
      expect(Math.abs(sizes[i]! - sizes[i - 1]!)).toBeLessThan(25)
    // It keeps going a little, then turns: no snap back to where it started.
    expect(Math.min(...sizes)).toBeLessThan(sizes[6]!)
    expect(sizes.at(-1)).toBeCloseTo(open, 0)
    expect(f).toEqual(OPEN)
  })

  it("flips the chevron flat halfway and out the other way", () => {
    expect(chevronFlip(0)).toBe(-1)
    expect(chevronFlip(0.5)).toBe(0)
    expect(chevronFlip(1)).toBe(1)
    expect(chevronFlip(1.2)).toBe(1)
  })

  it("flips on a spring quick enough to finish in about 0.2 s, and turns back mid-flip", () => {
    const { omega, zeta } = springMotion({ duration: 0.18, bounce: 0 })
    const s = new Spring(0, omega, zeta, 0.002).set(1)
    let flat = 0
    for (let t = 1; t <= 30 && !flat; t++) {
      s.step(1 / 60)
      if (chevronFlip(s.x) >= 0) flat = t / 60
    }
    // Flat by ~0.07 s, and nearly all the way by 0.2 s.
    expect(flat).toBeLessThan(0.09)
    for (let t = 0; t < 8; t++) s.step(1 / 60)
    expect(s.x).toBeGreaterThan(0.95)
    // Toggled back halfway through a flip, it carries on from where it is.
    const r = new Spring(0, omega, zeta, 0.002).set(1)
    for (let t = 0; t < 3; t++) r.step(1 / 60)
    const at = r.x
    r.set(0)
    r.step(1 / 60)
    expect(Math.abs(r.x - at)).toBeLessThan(0.15)
  })

  it("defaults to a flip, a travelling title and a 0.3 s fold", () => {
    expect(foldStyle()).toEqual({ chevron: "flip", title: "travel", duration: 0.3 })
    expect(foldStyle({ chevron: "turn", title: "fade", duration: 0.45 })).toEqual({
      chevron: "turn",
      title: "fade",
      duration: 0.45,
    })
    expect(foldStyle({ duration: -1 }).duration).toBe(0.3)
  })

  it("travels the title from the header to the rail, whichever edge the pane folds to", () => {
    // A pane 170 px open folding to a 32 px rail, its card inset 3 px. The header's title sits
    // 30 px into the inner and 14 px down; the rail's label 16 px into the rail, 60 px down.
    const open = 170
    const rail = 32
    const m = 3
    const places = { title: 30, label: 16, dy: 14 - 60 }
    for (const edge of ["start", "end"] as const) {
      for (const p of [0, 0.3, 1]) {
        const size = open - (open - rail) * p
        // The pane's own left edge in the page: a start pane keeps it, an end pane moves it.
        const left = edge === "start" ? 0 : open - size
        // The rail holds on to the moving edge; the inner keeps its open width against it.
        const railLeft = edge === "start" ? left + size - m - (rail - 2 * m) : left + m
        const innerLeft = edge === "start" ? left + size - m - (open - 2 * m) : left + m
        const t = titleTravel(places, open, rail, edge, p)
        const x = railLeft + places.label + t.x
        if (p === 0) expect(x).toBeCloseTo(innerLeft + places.title)
        if (p === 1) expect(x).toBeCloseTo(railLeft + places.label)
        expect(t.turn).toBeCloseTo(-90 * (1 - p))
      }
    }
    expect(titleTravel(places, open, rail, "start", 0).y).toBe(-46)
  })

  it("turns the chevron half a turn, the way the edge travels", () => {
    expect(chevronTurn(0, "start")).toBe(180)
    expect(chevronTurn(1, "start")).toBe(0)
    expect(chevronTurn(0.5, "end")).toBe(-90)
    expect(chevronTurn(2, "end")).toBeCloseTo(0)
  })
})

interface Node {
  id: string
  label: string
  children?: Node[]
}
const access: TreeAccess<Node> = {
  id: (n) => n.id,
  children: (n) => n.children,
  label: (n) => n.label,
}
const sample = (): Node[] => [
  {
    id: "lights",
    label: "Lights",
    children: [
      { id: "sodium", label: "Sodium streetlamp" },
      { id: "porch", label: "Porch lantern" },
    ],
  },
  {
    id: "props",
    label: "Props",
    children: [
      {
        id: "cones",
        label: "Cones",
        children: [
          { id: "c1", label: "Cone #91" },
          { id: "c2", label: "Cone #92" },
        ],
      },
      { id: "tank", label: "Propane tank" },
    ],
  },
  { id: "empty", label: "Empty group", children: [] },
]
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe("tree model", () => {
  it("flattens what's open", () => {
    expect(ids(flatten(sample(), access, new Set()))).toEqual(["lights", "props", "empty"])
    const rows = flatten(sample(), access, new Set(["props", "cones"]))
    expect(ids(rows)).toEqual(["lights", "props", "cones", "c1", "c2", "tank", "empty"])
    const c1 = rows.find((r) => r.id === "c1")!
    expect([c1.depth, c1.parent, c1.index]).toEqual([2, "cones", 0])
    const empty = rows.find((r) => r.id === "empty")!
    expect([empty.hasChildren, empty.container]).toEqual([false, true])
    expect(rows.find((r) => r.id === "tank")!.container).toBe(false)
  })
  it("filters to matches and keeps their ancestors open", () => {
    const rows = flatten(sample(), access, new Set(), "cone #92")
    expect(ids(rows)).toEqual(["props", "cones", "c2"])
    expect(rows[0]!.ancestor).toBe(true)
    expect(rows[2]!.match).toEqual([0, 8])
    expect(ids(flatten(sample(), access, new Set(), (n) => n.id === "porch"))).toEqual([
      "lights",
      "porch",
    ])
    expect(flatten(sample(), access, new Set(), "nothing")).toEqual([])
  })
  it("navigates by keys: ↑↓, ← closes or goes up, → opens or goes down, Home/End", () => {
    const rows = flatten(sample(), access, new Set(["props"]))
    expect(navigate(rows, "lights", "ArrowDown").active).toBe("props")
    expect(navigate(rows, "lights", "ArrowUp").active).toBe("lights")
    expect(navigate(rows, "lights", "ArrowRight")).toEqual({
      active: "lights",
      toggle: { id: "lights", expanded: true },
    })
    expect(navigate(rows, "props", "ArrowRight").active).toBe("cones")
    expect(navigate(rows, "props", "ArrowLeft").toggle).toEqual({ id: "props", expanded: false })
    expect(navigate(rows, "tank", "ArrowLeft").active).toBe("props")
    expect(navigate(rows, "cones", "End").active).toBe("empty")
    expect(navigate(rows, "cones", "Home").active).toBe("lights")
    expect(navigate(rows, null, "ArrowDown").active).toBe("lights")
  })
  it("type-ahead finds the next label starting with what's typed", () => {
    const rows = flatten(sample(), access, new Set(["lights", "props"]))
    const label = (n: Node) => n.label
    expect(typeahead(rows, "lights", "p", label)).toBe("porch")
    expect(typeahead(rows, "porch", "p", label)).toBe("props")
    expect(typeahead(rows, "porch", "pp", label)).toBe("props")
    expect(typeahead(rows, "lights", "pro", label)).toBe("props")
    expect(typeahead(rows, "lights", "zz", label)).toBe("lights")
  })
  it("selects with plain clicks, ⌘ toggles and ⇧ ranges", () => {
    const rows = flatten(sample(), access, new Set(["lights", "props"]))
    let s = select(rows, { ids: [], anchor: null }, "sodium")
    expect(s).toEqual({ ids: ["sodium"], anchor: "sodium" })
    s = select(rows, s, "cones", { shift: true })
    expect(s.ids).toEqual(["sodium", "porch", "props", "cones"])
    s = select(rows, s, "porch", { toggle: true })
    expect(s.ids).toEqual(["sodium", "props", "cones"])
    s = select(rows, { ids: ["tank"], anchor: "tank" }, "lights", { shift: true, toggle: true })
    expect(s.ids).toEqual(["tank", "lights", "sodium", "porch", "props", "cones"])
  })
  it("moves items, with subtrees, and refuses moving one inside itself", () => {
    const moved = applyMove(sample(), access, { ids: ["cones"], parent: "lights", index: 1 })
    expect(ids(moved[0]!.children!)).toEqual(["sodium", "cones", "porch"])
    expect(ids(moved[0]!.children![1]!.children!)).toEqual(["c1", "c2"])
    expect(ids(moved[1]!.children!)).toEqual(["tank"])
    const top = applyMove(sample(), access, { ids: ["tank", "porch"], parent: null, index: 0 })
    expect(ids(top)).toEqual(["tank", "porch", "lights", "props", "empty"])
    expect(validMove(sample(), access, { ids: ["props"], parent: "c1", index: 0 })).toBe(false)
    expect(validMove(sample(), access, { ids: ["props"], parent: "props", index: 0 })).toBe(false)
    expect(validMove(sample(), access, { ids: ["c1"], parent: "empty", index: 0 })).toBe(true)
    // Untouched branches keep their identity.
    const original = sample()
    const next = applyMove(original, access, { ids: ["c1"], parent: "cones", index: 1 })
    expect(next[0]).toBe(original[0])
    expect(next[2]).toBe(original[2])
    // Plain { id, children } items need no access.
    expect(applyMove(sample(), { ids: ["cones"], parent: "lights", index: 1 })).toEqual(moved)
  })
  it("keeps only the topmost of a selection", () => {
    expect(topmost(sample(), access, ["c1", "cones", "porch"])).toEqual(["porch", "cones"])
  })
  it("⌥↑↓ steps rows past their neighbour among their siblings", () => {
    expect(stepMove(sample(), access, ["tank"], -1)).toEqual({
      ids: ["tank"],
      parent: "props",
      index: 0,
    })
    expect(stepMove(sample(), access, ["cones"], 1)).toEqual({
      ids: ["cones"],
      parent: "props",
      index: 1,
    })
    expect(stepMove(sample(), access, ["cones"], -1)).toBeUndefined()
    expect(stepMove(sample(), access, ["lights", "props"], 1)).toEqual({
      ids: ["lights", "props"],
      parent: null,
      index: 1,
    })
    const after = applyMove(sample(), access, stepMove(sample(), access, ["lights"], 1)!)
    expect(ids(after)).toEqual(["props", "lights", "empty"])
  })
  it("finds drop targets: before, after, into, first inside an open parent, and out by depth", () => {
    const rows = flatten(sample(), access, new Set(["props", "cones"]))
    // rows: lights props cones c1 c2 tank empty
    expect(dropTarget(rows, access, 5, "before", ["c1"])).toEqual({
      move: { ids: ["c1"], parent: "props", index: 1 },
      line: { after: 4, depth: 1 },
    })
    expect(dropTarget(rows, access, 0, "into", ["tank"])).toEqual({
      move: { ids: ["tank"], parent: "lights", index: 2 },
      into: "lights",
    })
    expect(dropTarget(rows, access, 2, "after", ["tank"])).toEqual({
      move: { ids: ["tank"], parent: "cones", index: 0 },
      line: { after: 2, depth: 2 },
    })
    // After c2 (last in cones): at depth 2 stays in cones; at depth 1 goes after cones in props.
    expect(dropTarget(rows, access, 4, "after", ["lights"], 2)!.move).toEqual({
      ids: ["lights"],
      parent: "cones",
      index: 2,
    })
    expect(dropTarget(rows, access, 4, "after", ["lights"], 1)!.move).toEqual({
      ids: ["lights"],
      parent: "props",
      index: 1,
    })
    // Moving an item down among its own siblings counts it out.
    expect(dropTarget(rows, access, 5, "after", ["cones"])!.move).toEqual({
      ids: ["cones"],
      parent: "props",
      index: 1,
    })
    // A leaf takes no "into".
    expect(dropTarget(rows, access, 5, "into", ["c1"])!.into).toBeUndefined()
  })
  it("windows rows for virtual scrolling", () => {
    expect(virtualWindow(0, 260, 26, 10000, 4)).toEqual([0, 14])
    expect(virtualWindow(26 * 5000 + 13, 260, 26, 10000, 4)).toEqual([4996, 5015])
    expect(virtualWindow(26 * 9999, 260, 26, 10000, 4)).toEqual([9995, 10000])
    expect(virtualWindow(0, 260, 26, 0)).toEqual([0, 0])
  })
  it("flattens 10k rows quickly", () => {
    const big: Node[] = Array.from({ length: 100 }, (_, g) => ({
      id: `g${g}`,
      label: `Group ${g}`,
      children: Array.from({ length: 100 }, (_, i) => ({ id: `g${g}-${i}`, label: `Item ${i}` })),
    }))
    const open = new Set(big.map((g) => g.id))
    const t = performance.now()
    const rows = flatten(big, access, open)
    expect(rows.length).toBe(10100)
    expect(performance.now() - t).toBeLessThan(100)
  })
})
