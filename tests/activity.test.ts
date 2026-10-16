import { describe, expect, test } from "vitest"
import {
  diffActivity,
  flattenActivity,
  formatDuration,
  groupTitle,
  indexActivity,
  keepSelection,
  navigateActivity,
  railSegments,
  showsSelection,
  stackRows,
  type ActivityEvent,
} from "../src/ui/activity-model"

const events: ActivityEvent[] = [
  { id: "a", kind: "you", actor: "You", title: "Asked for a timeline" },
  {
    id: "g",
    kind: "agent",
    actor: "Agent",
    children: [
      { id: "g1", title: "Read the task" },
      { id: "g2", title: "Sketched three options" },
      { id: "g3", title: "Built them" },
    ],
  },
  { id: "p", kind: "proposal", actor: "Proposal", title: "Three options" },
]
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe("flattening groups", () => {
  test("a closed group is one row; its children don't show", () => {
    const rows = flattenActivity(events, new Set())
    expect(ids(rows)).toEqual(["a", "g", "p"])
    expect(rows[1]).toMatchObject({ group: true, expanded: false, depth: 0 })
  })
  test("an open group's children follow it, one level in, on the same rail", () => {
    const rows = flattenActivity(events, new Set(["g"]))
    expect(ids(rows)).toEqual(["a", "g", "g1", "g2", "g3", "p"])
    expect(rows.slice(2, 5).every((r) => r.depth === 1 && r.parent === "g")).toBe(true)
    expect(rows[1]!.expanded).toBe(true)
  })
  test("groups are one level deep: a child's children follow it on that level", () => {
    const nested: ActivityEvent[] = [{ id: "g", children: [{ id: "c", children: [{ id: "cc" }] }] }]
    const rows = flattenActivity(nested, new Set(["g", "c"]))
    expect(ids(rows)).toEqual(["g", "c", "cc"])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1])
    expect(indexActivity(nested).get("cc")?.parent).toBe("g")
  })
  test("an empty children array isn't a group; a group without a title counts its updates", () => {
    expect(flattenActivity([{ id: "x", children: [] }], new Set())[0]!.group).toBe(false)
    expect(groupTitle(1)).toBe("1 update")
    expect(groupTitle(3)).toBe("3 updates")
  })
})

describe("keyboard navigation", () => {
  const closed = flattenActivity(events, new Set())
  const open = flattenActivity(events, new Set(["g"]))
  test("↑/↓ step and stop at the ends; from nothing they start at an end", () => {
    expect(navigateActivity(closed, "a", "ArrowDown")).toEqual({ select: "g" })
    expect(navigateActivity(closed, "p", "ArrowDown")).toEqual({ select: "p" })
    expect(navigateActivity(closed, "a", "ArrowUp")).toEqual({ select: "a" })
    expect(navigateActivity(closed, null, "ArrowDown")).toEqual({ select: "a" })
    expect(navigateActivity(closed, null, "ArrowUp")).toEqual({ select: "p" })
    expect(navigateActivity(open, "g", "ArrowDown")).toEqual({ select: "g1" })
  })
  test("Home and End", () => {
    expect(navigateActivity(open, "g2", "Home")).toEqual({ select: "a" })
    expect(navigateActivity(open, "g2", "End")).toEqual({ select: "p" })
  })
  test("→ opens a closed group, then steps into it; ← closes it, and steps out of a child", () => {
    expect(navigateActivity(closed, "g", "ArrowRight")).toEqual({
      toggle: { id: "g", expanded: true },
    })
    expect(navigateActivity(open, "g", "ArrowRight")).toEqual({ select: "g1" })
    expect(navigateActivity(open, "g", "ArrowLeft")).toEqual({
      toggle: { id: "g", expanded: false },
    })
    expect(navigateActivity(open, "g2", "ArrowLeft")).toEqual({ select: "g" })
    expect(navigateActivity(open, "a", "ArrowLeft")).toEqual({})
    expect(navigateActivity(open, "a", "ArrowRight")).toEqual({})
  })
  test("no rows, nothing to do", () => {
    expect(navigateActivity([], null, "ArrowDown")).toEqual({})
  })
})

describe("selection", () => {
  const index = indexActivity(events)
  const parentOf = (id: string) => index.get(id)?.parent
  test("a group closing over the selection takes it", () => {
    expect(keepSelection(flattenActivity(events, new Set()), "g2", parentOf)).toBe("g")
  })
  test("kept while its row shows; gone with its event", () => {
    expect(keepSelection(flattenActivity(events, new Set(["g"])), "g2", parentOf)).toBe("g2")
    expect(keepSelection(flattenActivity(events, new Set()), "zz", parentOf)).toBe(null)
  })
  test("the tint shows after keys, not after a click; a host's select leaves it as it was", () => {
    expect(showsSelection(false, "key")).toBe(true)
    expect(showsSelection(true, "pointer")).toBe(false)
    expect(showsSelection(true, "code")).toBe(true)
    expect(showsSelection(false, "code")).toBe(false)
    expect(showsSelection(true, "blur")).toBe(false)
    expect(showsSelection(true, "blur", "page")).toBe(true)
  })
})

describe("inserts and removals", () => {
  test("what came, went and stayed", () => {
    expect(diffActivity(["a", "b", "c"], ["a", "c", "d"])).toEqual({
      entered: ["d"],
      left: ["b"],
      kept: ["a", "c"],
    })
    expect(diffActivity([], ["a"])).toEqual({ entered: ["a"], left: [], kept: [] })
  })
  test("rows stack from the top with their own heights", () => {
    expect(stackRows([32, 26, 26, 32], 6)).toEqual({ y: [6, 38, 64, 90], bottom: 122 })
    expect(stackRows([10, 10], 0, 4)).toEqual({ y: [0, 14], bottom: 24 })
    expect(stackRows([], 6)).toEqual({ y: [], bottom: 6 })
  })
})

describe("the line", () => {
  test("one thread between the nodes, clear of each, nothing past the ends", () => {
    const nodes = [
      { y: 22, r: 11 },
      { y: 54, r: 11 },
      { y: 80, r: 5 },
    ]
    expect(railSegments(nodes, 22, 80)).toEqual([
      [33, 43],
      [65, 75],
    ])
  })
  test("clipped to the ends as they glide, in any order given", () => {
    const nodes = [
      { y: 54, r: 11 },
      { y: 22, r: 11 },
    ]
    expect(railSegments(nodes, 22, 40)).toEqual([[33, 40]])
    expect(railSegments(nodes, 22, 30)).toEqual([])
  })
  test("a node blooming in opens its gap as it comes", () => {
    const segs = railSegments(
      [
        { y: 0, r: 0 },
        { y: 20, r: 2 },
        { y: 40, r: 0 },
      ],
      0,
      40,
    )
    expect(segs).toEqual([
      [0, 18],
      [22, 40],
    ])
  })
})

describe("durations", () => {
  test("m:ss, h:mm:ss, and text as it is", () => {
    expect(formatDuration(32)).toBe("0:32")
    expect(formatDuration(245)).toBe("4:05")
    expect(formatDuration(3723)).toBe("1:02:03")
    expect(formatDuration("live")).toBe("live")
    expect(formatDuration(-3)).toBe("0:00")
  })
})
