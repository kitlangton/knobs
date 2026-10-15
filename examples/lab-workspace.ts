// The Lab as a workspace from knobs/ui: an outliner on the left, the viewport in the middle with a
// dock under it, and the inspector column on the right, in resizable splits that collapse to rails
// and headers. Loaded by lab.ts before its panels mount into the right column.
// ?rows=10000 fills the outliner with a big scene (the virtual-scroll check).
import { labPreset } from "knobs/themes"
import { applyMove, split, tree, type TreeAccess, type TreeMove } from "knobs/ui"
import { startLive } from "./lab-live"

interface SceneItem {
  id: string
  label: string
  icon?: string
  children?: SceneItem[]
}

const params = new URLSearchParams(location.search)
const big = Number(params.get("rows")) || 0

const groups: [string, string, string[]][] = [
  ["vehicles", "◧", ["Getaway · Muscle"]],
  ["lights", "✦", ["2100K Sodium streetlamp", "Porch post lantern", "Window glow"]],
  ["fixtures", "◇", ["Grenade smoke in room", "Glass impact at pane", "Car into cones"]],
  ["emitters", "✺", ["Rain sheet", "Gutter drip", "Steam vent"]],
  ["characters", "♟", ["Survivor · Ana", "Survivor · Ben"]],
]
const title = (s: string) => s[0]!.toUpperCase() + s.slice(1)
let uid = 0
const leaf = (label: string, icon: string): SceneItem => ({ id: `o${++uid}`, label, icon })
let scene: SceneItem[] = [
  ...groups.map(([id, icon, labels]) => ({
    id,
    label: title(id),
    children: labels.map((l) => leaf(l, icon)),
  })),
  {
    id: "props",
    label: "Props",
    children: [
      {
        id: "cones",
        label: "Cone",
        icon: "▣",
        children: [91, 92, 93, 94, 95].map((n) => leaf(`Cone #${n}`, "▣")),
      },
      leaf("Propane tank #96", "▣"),
      leaf("Barrier", "▣"),
    ],
  },
]
if (big) {
  const per = 100
  scene.push({
    id: "crowd",
    label: "Crowd",
    children: Array.from({ length: Math.ceil(big / per) }, (_, g) => ({
      id: `crowd-${g}`,
      label: `Wave ${g + 1}`,
      children: Array.from({ length: per }, (_, i) => leaf(`Walker #${g * per + i + 1}`, "♟")),
    })),
  })
}

const access: TreeAccess<SceneItem> = {
  id: (n) => n.id,
  children: (n) => n.children,
  label: (n) => n.label,
}
const hidden = new Set<string>()
const locked = new Set<string>()
const moves: TreeMove[] = []
const count = (items: readonly SceneItem[]): number =>
  items.reduce((n, i) => n + (i.children ? count(i.children) : 1), 0)

const workspace = document.getElementById("workspace")!
const side = document.getElementById("side")!
const viewport = document.getElementById("viewport")!
const dock = document.getElementById("dock")!
const column = document.getElementById("details-column")!
workspace.replaceChildren()

const look = { preset: labPreset, theme: "dark" as const }
const main = split(workspace, {
  ...look,
  id: "lab-workspace",
  direction: "row",
  panes: [
    { id: "left", size: 240, min: 180, max: 460, collapsible: true, rail: "Scene" },
    { id: "center", min: 360 },
    {
      id: "right",
      size: 300,
      min: 248,
      max: 560,
      collapsible: true,
      title: "Inspector",
      count: "Weather",
      element: column,
    },
  ],
})
const left = split(main.pane("left").body, {
  ...look,
  id: "lab-left",
  direction: "column",
  panes: [
    {
      id: "stations",
      size: 250,
      min: 90,
      collapsible: true,
      title: "Stations",
      count: 3,
      element: side,
    },
    {
      id: "outliner",
      min: 120,
      title: "Outliner",
      count: count(scene),
      scroll: false,
      actions: [
        { id: "collapse-all", label: "Collapse all", icon: "−", run: () => collapseAll() },
        { id: "expand-all", label: "Expand all", icon: "+", run: () => expandAll() },
      ],
    },
  ],
})
const center = split(main.pane("center").body, {
  ...look,
  id: "lab-center",
  direction: "column",
  panes: [
    { id: "view", min: 160, element: viewport },
    {
      id: "dock",
      size: 300,
      min: 72,
      max: 560,
      collapsible: true,
      title: "Dock",
      count: "Variants · Compare · Live",
      element: dock,
    },
  ],
})

// The outliner: a search field over the tree.
const outliner = document.createElement("div")
outliner.className = "outliner"
const find = document.createElement("input")
find.className = "find"
find.type = "search"
find.placeholder = "Search scene"
find.setAttribute("aria-label", "Search scene")
const rows = document.createElement("div")
rows.className = "rows"
outliner.append(find, rows)
left.pane("outliner").body.append(outliner)

const picked = document.getElementById("picked")
const names = (ids: readonly string[]) => {
  const index = new Map<string, string>()
  const walk = (items: readonly SceneItem[]) =>
    items.forEach((i) => {
      index.set(i.id, i.label)
      if (i.children) walk(i.children)
    })
  walk(scene)
  return ids.map((id) => index.get(id) ?? id)
}
const outline = tree(rows, {
  ...look,
  items: scene,
  label: "Scene objects",
  expanded: ["lights", "props", "cones"],
  icon: (n) => n.icon,
  detail: (n) =>
    n.children && n.children.length > 1 && n.icon ? `×${n.children.length}` : undefined,
  onSelect: (ids) => {
    if (picked) picked.textContent = ids.length ? names(ids).join(", ") : "Nothing selected"
  },
  onMove: (move) => {
    moves.push(move)
    scene = applyMove(scene, access, move)
    outline.update(scene)
  },
  onRename: (id, label) => {
    const rename = (items: SceneItem[]): SceneItem[] =>
      items.map((i) =>
        i.id === id ? { ...i, label } : i.children ? { ...i, children: rename(i.children) } : i,
      )
    scene = rename(scene)
    outline.update(scene)
  },
  toggles: [
    {
      id: "visible",
      label: "Show or hide",
      get: (n) => !hidden.has(n.id),
      set: (ids, on) => ids.forEach((id) => (on ? hidden.delete(id) : hidden.add(id))),
    },
    {
      id: "locked",
      label: "Lock or unlock",
      get: (n) => !locked.has(n.id),
      set: (ids, on) => ids.forEach((id) => (on ? locked.delete(id) : locked.add(id))),
    },
  ],
})
find.addEventListener("input", () => outline.filter(find.value))
find.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "Enter") {
    e.preventDefault()
    outline.focus(outline.rows()[0])
  } else if (e.key === "Escape") {
    find.value = ""
    outline.filter(null)
  }
})
const parents = (items: readonly SceneItem[]): string[] =>
  items.flatMap((i) => (i.children?.length ? [i.id, ...parents(i.children)] : []))
const collapseAll = () => {
  for (const id of parents(scene).reverse()) outline.expand(id, false)
}
const expandAll = () => {
  for (const id of parents(scene)) outline.expand(id, true)
}

const liveFeed = startLive(document.getElementById("live")!, document.getElementById("diag")!)

Object.assign(window, {
  __live: liveFeed,
  __workspace: {
    main,
    left,
    center,
    outline,
    moves,
    hidden,
    locked,
    get scene() {
      return scene
    },
  },
})
