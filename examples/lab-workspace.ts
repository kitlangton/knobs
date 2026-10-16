// The Lab as a workspace from knobs/ui: an outliner on the left, the viewport in the middle with a
// dock under it, and the inspector column on the right, in resizable splits that collapse to rails
// and headers. Loaded by lab.ts before its panels mount into the right column.
// ?rows=10000 fills the outliner with a big scene (the virtual-scroll check).
import { applyMove, split, toast, tree, type TreeAccess, type TreeMove } from "knobs/ui"
import { startLive } from "./lab-live"
import { uiLook } from "./lab-look"
import { startTimeline } from "./lab-timeline"

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
// The viewport's scene follows the outliner: what's there, hidden, locked or selected.
const watchers = new Set<() => void>()
const changed = () => {
  for (const f of watchers) f()
}
const count = (items: readonly SceneItem[]): number =>
  items.reduce((n, i) => n + (i.children ? count(i.children) : 1), 0)

const workspaceEl = document.getElementById("workspace")!
const side = document.getElementById("side")!
const viewport = document.getElementById("viewport")!
const dock = document.getElementById("dock")!
const column = document.getElementById("details-column")!
workspaceEl.replaceChildren()

const look = uiLook()
const main = split(workspaceEl, {
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
    { id: "timeline", size: 78, min: 64, max: 140 },
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

// A station is picked by a click (or its hint code): it's marked and the pane's count follows.
const stations = [...side.querySelectorAll<HTMLElement>(".station")]
stations.forEach((station, i) =>
  station.addEventListener("click", () => {
    for (const s of stations) s.classList.toggle("on", s === station)
    left.pane("stations").title("Stations", i + 1)
  }),
)

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
/** The workbench's single-key commands, which the outliner leaves to the window. */
const WORKBENCH: Record<string, string> = { f: "Frame selection", g: "Toggle grid", p: "Place" }
const workbench: string[] = []
window.addEventListener("keydown", (e) => {
  const command = WORKBENCH[e.key.toLowerCase()]
  if (!command || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  if ((e.target as Element | null)?.closest?.("input,textarea,[contenteditable],.knobs-panel"))
    return
  workbench.push(command)
  toast(command)
})
const selected = (ids: readonly string[]) => {
  if (picked) picked.textContent = ids.length ? names(ids).join(", ") : "Nothing selected"
  changed()
}
/** Selects as a click on a row does (the viewport's picking): the status line and watchers follow. */
const select = (ids: readonly string[]) => {
  outline.select(ids)
  selected(ids)
}
const outline = tree(rows, {
  ...look,
  items: scene,
  label: "Scene objects",
  // F, G and P are the workbench's; other letters jump to a label.
  typeahead: (key) => !(key.toLowerCase() in WORKBENCH),
  expanded: ["lights", "props", "cones"],
  icon: (n) => n.icon,
  detail: (n) =>
    n.children && n.children.length > 1 && n.icon ? `×${n.children.length}` : undefined,
  onSelect: (ids) => selected(ids),
  onMove: (move) => {
    moves.push(move)
    scene = applyMove(scene, access, move)
    outline.update(scene)
    changed()
  },
  onRename: (id, label) => {
    const rename = (items: SceneItem[]): SceneItem[] =>
      items.map((i) =>
        i.id === id ? { ...i, label } : i.children ? { ...i, children: rename(i.children) } : i,
      )
    scene = rename(scene)
    outline.update(scene)
    changed()
  },
  toggles: [
    {
      id: "visible",
      label: "Show or hide",
      get: (n) => !hidden.has(n.id),
      set: (ids, on) => {
        ids.forEach((id) => (on ? hidden.delete(id) : hidden.add(id)))
        changed()
      },
    },
    {
      id: "locked",
      label: "Lock or unlock",
      get: (n) => !locked.has(n.id),
      set: (ids, on) => {
        ids.forEach((id) => (on ? locked.delete(id) : locked.add(id)))
        changed()
      },
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

// ⌫ in the outliner deletes the selection, after asking (see lab-overlays.ts).
let onDelete: (ids: readonly string[]) => void = () => {}
rows.addEventListener("keydown", (e) => {
  if ((e.key === "Backspace" || e.key === "Delete") && !e.metaKey && outline.selection.length) {
    if ((e.target as HTMLElement).closest(".knobs-tree-edit")) return
    e.preventDefault()
    onDelete(outline.selection)
  }
})
const remove = (ids: readonly string[]) => {
  const gone = new Set(ids)
  const prune = (items: SceneItem[]): SceneItem[] =>
    items
      .filter((i) => !gone.has(i.id))
      .map((i) => (i.children ? { ...i, children: prune(i.children) } : i))
  scene = prune(scene)
  outline.update(scene)
  outline.select([])
  if (picked) picked.textContent = "Nothing selected"
  left.pane("outliner").title("Outliner", count(scene))
  changed()
}

/** Copies of the items, each just after its original, with " copy" on its label. */
const duplicate = (ids: readonly string[]) => {
  const want = new Set(ids)
  const copies: string[] = []
  const clone = (i: SceneItem): SceneItem => ({
    ...i,
    id: `o${++uid}`,
    ...(i.children ? { children: i.children.map(clone) } : {}),
  })
  const walk = (items: SceneItem[]): SceneItem[] =>
    items.flatMap((i) => {
      const self = i.children ? { ...i, children: walk(i.children) } : i
      if (!want.has(i.id)) return [self]
      const copy = { ...clone(i), label: `${i.label} copy` }
      copies.push(copy.id)
      return [self, copy]
    })
  scene = walk(scene)
  outline.update(scene)
  outline.select(copies, copies[copies.length - 1])
  left.pane("outliner").title("Outliner", count(scene))
  changed()
  return copies
}
/** Hides (or shows) the items, as their eye toggle does. */
const setHidden = (ids: readonly string[], on: boolean) => {
  for (const id of ids) on ? hidden.add(id) : hidden.delete(id)
  outline.refresh()
  changed()
}
/** The top-level groups, to move items into. */
const groupsOf = () => scene.filter((i) => i.children).map((i) => ({ id: i.id, label: i.label }))
const parentOf = (id: string): string | null => {
  const walk = (items: readonly SceneItem[], parent: string | null): string | null | undefined => {
    for (const i of items) {
      if (i.id === id) return parent
      const found = i.children && walk(i.children, i.id)
      if (found !== undefined) return found
    }
    return undefined
  }
  return walk(scene, null) ?? null
}
const moveTo = (ids: readonly string[], parent: string) => {
  const move = { ids, parent, index: Number.MAX_SAFE_INTEGER }
  const target = scene.find((i) => i.id === parent)
  move.index = target?.children?.filter((c) => !ids.includes(c.id)).length ?? 0
  moves.push(move)
  scene = applyMove(scene, access, move)
  outline.update(scene)
  outline.expand(parent, true)
  changed()
}

export const sceneTime = startTimeline(center.pane("timeline").body)

export const liveFeed = startLive(
  document.getElementById("sets")!,
  document.getElementById("live")!,
  document.getElementById("diag")!,
)
export const workspace = {
  main,
  left,
  center,
  outline,
  select,
  find,
  names,
  collapseAll,
  expandAll,
  remove,
  duplicate,
  setHidden,
  hidden,
  locked,
  get scene() {
    return scene
  },
  /** Something in the outliner changed: an item, its visibility or lock, or the selection. */
  onChange(f: () => void) {
    watchers.add(f)
    return () => watchers.delete(f)
  },
  groupsOf,
  parentOf,
  moveTo,
  rows,
  set onDelete(f: (ids: readonly string[]) => void) {
    onDelete = f
  },
}

Object.assign(window, {
  __live: liveFeed,
  __timeline: sceneTime,
  __workspace: {
    main,
    left,
    center,
    outline,
    remove,
    moves,
    hidden,
    locked,
    workbench,
    get scene() {
      return scene
    },
  },
})
