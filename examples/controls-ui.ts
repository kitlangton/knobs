// The catalog's knobs/ui sections: a split with collapsing panes, an outliner,
// menus and a context menu, a popover and tooltips, the command palette, confirms
// and toasts.
import { choice, type Knob, knob, type MountPanelOptions } from "knobs"
import { mountPanel } from "knobs/panel"
import {
  activity,
  type ActivityEvent,
  applyMove,
  confirm,
  contextMenu,
  type MenuEntry,
  menu,
  optionPicker,
  popover,
  type Split,
  type SplitFold,
  split,
  toast,
  tooltip,
  tree,
} from "knobs/ui"
import type { SceneKit } from "./controls"
import { blurFor, clamp01, ColorVal, DirBlur, reduced, rolling, Stage } from "./controls-motion"

function findById<T extends { id: string; children?: T[] }>(
  list: readonly T[],
  id: string,
): T | undefined {
  for (const item of list) {
    if (item.id === id) return item
    const child = item.children && findById(item.children, id)
    if (child) return child
  }
}

export function uiSections({
  section,
  h,
  theme,
  define,
  mount,
  panelOptions,
}: Pick<SceneKit, "section" | "h" | "theme" | "define" | "mount"> & {
  panelOptions: () => MountPanelOptions
}) {
  const chip = (row: HTMLElement, label: string, run?: (e: MouseEvent) => void, cls = "quiet") => {
    const b = h("button", cls ? `chip ${cls}` : "chip")
    b.textContent = label
    if (run) b.addEventListener("click", run)
    row.append(b)
    return b
  }

  // ── split ──
  {
    const s = section({
      id: "split",
      title: "Split",
      sub: "Resizable panes that collapse to a rail.",
      shows: ["split()", "fold"],
      wide: true,
    })
    const box = h("div", "ui-box")
    // Concentric with the cards inside it, half a gap in.
    box.style.cssText += ";height:220px;border-radius:calc(var(--k-panel-radius,12px) + 3px)"
    s.slot.append(box)
    const note = (text: string) => {
      const p = h("div")
      p.style.cssText = "padding:4px 12px 10px;color:var(--label);font-size:12px;line-height:1.55"
      p.textContent = text
      return p
    }
    const canvas = h("div")
    canvas.style.cssText =
      "position:absolute;inset:0;display:grid;place-items:center;color:var(--dim);font-size:12px"
    canvas.textContent = "Canvas"
    // How the panes fold, to compare live: each change makes the split again, as it was.
    let sp: Split | undefined
    const build = (fold: SplitFold) => {
      const shut = sp?.layout().collapsed ?? {}
      sp?.dispose()
      sp = split(box, {
        theme: theme(),
        storage: null,
        fold,
        panes: [
          {
            id: "files",
            size: 170,
            min: 120,
            max: 260,
            collapsible: true,
            collapsed: shut.files,
            title: "Files",
            count: 3,
            element: files,
          },
          { id: "canvas", min: 160, element: canvas },
          {
            id: "inspector",
            size: 190,
            min: 140,
            max: 300,
            collapsible: true,
            collapsed: shut.inspector,
            title: "Inspector",
            element: inspector,
          },
        ],
      })
    }
    // The files are an outliner of their own, in the pane.
    const files = h("div")
    files.style.cssText = "position:absolute;inset:0"
    const fileIcon =
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 2h5.2L12 4.8V14H4Z"/><path d="M9 2v3h3"/></svg>'
    tree(files, {
      theme: theme(),
      label: "Files",
      items: ["index.ts", "scene.ts", "look.ts"].map((id) => ({ id, label: id })),
      icon: () => fileIcon,
      onSelect: (ids) => (canvas.textContent = ids[0] ?? "Canvas"),
    })
    const inspector = note("Panels mount in panes, and stay drawn through a drag or a collapse.")
    const { store, on } = define("split-fold", "Split fold", {
      chevron: choice("flip", ["flip", "turn"], {
        label: "Chevron",
        labels: { flip: "Flip", turn: "Turn" },
      }),
      title: choice("travel", ["travel", "fade"], {
        label: "Title",
        labels: { travel: "Travel", fade: "Fade" },
      }),
      duration: knob(0.25, { min: 0.15, max: 0.6, step: 0.01, unit: "s", label: "Fold" }),
    })
    on((v) => build(v))
    const row = h("div", "chips")
    chip(row, "Toggle files", () => sp?.collapse("files"))
    chip(row, "Toggle inspector", () => sp?.collapse("inspector"))
    chip(row, "Reset", () => sp?.reset())
    s.side.prepend(row)
    const panel = h("div")
    s.side.append(panel)
    mount(store, panel, { title: "Fold" })
  }

  // ── tree ──
  {
    const s = section({
      id: "tree",
      title: "Tree",
      sub: "An outliner whose rows glide when they move.",
      shows: ["tree()"],
    })
    interface Node {
      id: string
      label: string
      icon?: string
      children?: Node[]
    }
    let items: Node[] = [
      {
        id: "lights",
        label: "Lights",
        icon: "☀︎",
        children: [
          { id: "sun", label: "Sun", icon: "○" },
          { id: "fill", label: "Fill", icon: "○" },
        ],
      },
      {
        id: "props",
        label: "Props",
        icon: "▢",
        children: [
          { id: "crate", label: "Crate", icon: "▫︎" },
          { id: "barrel", label: "Barrel", icon: "▫︎" },
          { id: "lamp", label: "Street lamp", icon: "▫︎" },
        ],
      },
      { id: "camera", label: "Camera", icon: "◎" },
      { id: "fog", label: "Fog volume", icon: "◌" },
    ]
    const hidden = new Set<string>(["fill"])
    // A panel's shape, its rows inset as far from the top and bottom as from the sides, so their
    // corners sit concentric with its own.
    const box = h("div", "ui-box")
    box.style.cssText +=
      ";height:236px;padding:var(--k-ui-row-x,6px) 0;border-radius:var(--k-panel-radius,12px)"
    s.slot.append(box)
    const picked = h("p", "note", "Nothing selected")
    s.side.prepend(picked)
    const outline = tree<Node>(box, {
      theme: theme(),
      items,
      label: "Scene",
      expanded: ["lights", "props"],
      icon: (n) => n.icon,
      detail: (n) => (n.children ? String(n.children.length) : undefined),
      toggles: [
        {
          id: "visible",
          label: "Visible",
          get: (n) => !hidden.has(n.id),
          set: (ids, on) => {
            for (const id of ids) on ? hidden.delete(id) : hidden.add(id)
            outline.refresh()
          },
        },
      ],
      onSelect: (ids) => {
        picked.textContent = ids.length
          ? `Selected: ${ids.map((id) => findById(items, id)?.label ?? id).join(", ")}`
          : "Nothing selected"
      },
      onMove: (move) => {
        items = applyMove(items, move)
        outline.update(items)
      },
      onRename: (id, label) => {
        const n = findById(items, id)
        if (n) n.label = label
        outline.update(items)
      },
    })
  }

  // ── activity ──
  {
    const s = section({
      id: "activity",
      title: "Activity",
      sub: "A rail of what happened, on one continuous line.",
      tip: "Click it, then ↑↓ to move, ←→ to fold a group, Enter.",
      shows: ["activity()"],
    })
    const thumb = (a: string, b: string) =>
      `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="36" height="36" fill="url(#g)"/></svg>`)}`
    type Ev = Omit<ActivityEvent, "children" | "time"> & { ago: number; children?: Ev[] }
    let story: Ev[] = [
      {
        id: "asked",
        kind: "you",
        actor: "You",
        title: "This can just be a knobs component, some kind of action timeline",
        ago: 48,
      },
      { id: "picked", kind: "agent", actor: "Agent", title: "Picked it up", ago: 46, dimmed: true },
      {
        id: "work",
        kind: "agent",
        actor: "Agent",
        ago: 40,
        children: [
          { id: "w1", kind: "agent", title: "Read the task page and its rail", ago: 44 },
          { id: "w2", kind: "agent", title: "Sketched the API from the call site", ago: 42 },
          { id: "w3", kind: "agent", title: "Drew the line as one path", ago: 40 },
        ],
      },
      {
        id: "proposal",
        kind: "proposal",
        actor: "Proposal",
        title: "Three rails: hairline, beads, branch",
        ago: 31,
        thumbs: [
          thumb("#5e5ce6", "#bf5af2"),
          thumb("#64d2ff", "#0a84ff"),
          thumb("#ffd60a", "#ff9f0a"),
        ],
      },
      {
        id: "review",
        kind: "review",
        actor: "Review",
        title: "Walkthrough of the beads rail",
        duration: 32,
        ago: 28,
      },
      {
        id: "reply",
        kind: "you",
        actor: "You",
        title: "Beads. Children on the same rail, smaller.",
        duration: 12,
        ago: 20,
      },
      { id: "build", kind: "build", actor: "Build", title: "typecheck · tests · build", ago: 12 },
      {
        id: "pr",
        kind: "pr",
        actor: "GitHub",
        title: "#412 Activity rail and option picker",
        ago: 6,
      },
    ]
    const age = (m: number) => (m < 1 ? "now" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`)
    const live = (list: Ev[], last: string | undefined): ActivityEvent[] =>
      list.map(({ ago, children, ...e }) => ({
        ...e,
        time: age(ago),
        current: e.id === last,
        ...(children ? { children: live(children, undefined) } : {}),
      }))
    let top = false
    const view = () => live(story, (top ? story[0] : story[story.length - 1])?.id)
    // The rail insets its rows by the same amount all round (concentric with a panel's corners).
    const box = h("div", "ui-box")
    box.style.cssText += ";height:340px;border-radius:var(--k-panel-radius,12px)"
    s.slot.append(box)
    const status = h("p", "note", "Nothing selected")
    status.style.minHeight = "18px"
    const describe = (id: string) => {
      const e = findById(story, id)
      return e
        ? [e.actor, e.title ?? `${e.children?.length ?? 0} updates`].filter(Boolean).join(" · ")
        : id
    }
    const rail = activity(box, {
      theme: theme(),
      events: view(),
      label: "Activity",
      expanded: [],
      onSelect: (id) => (status.textContent = describe(id)),
      onActivate: (id) => toast(`Opened ${describe(id)}`),
      onPlay: (id) => toast(`Playing ${describe(id)}`),
    })
    const update = () => rail.set(view())
    // A minute passes every few seconds: the times roll, and nothing else moves.
    setInterval(() => {
      const tick = (list: Ev[]) =>
        list.forEach((e) => {
          e.ago++
          if (e.children) tick(e.children)
        })
      tick(story)
      update()
    }, 4000)
    const next = [
      { kind: "agent", actor: "Agent", title: "Answered the review: the line grows with the rows" },
      { kind: "you", actor: "You", title: "Ship it", duration: 4 },
      { kind: "build", actor: "Build", title: "Deploy preview · 41s" },
      { kind: "blocked", actor: "Agent", title: "Waiting on a token for the preview" },
      { kind: "shipped", actor: "Shipped", title: "Activity rail and option picker" },
    ] as const
    let n = 0
    const row = h("div", "chips")
    chip(row, "Add event", () => {
      const e = next[n++ % next.length]!
      const added = { ...e, id: `new-${n}`, ago: 0 }
      story = top ? [added, ...story] : [...story, added]
      update()
    })
    chip(row, "Add to group", () => {
      story = story.map((e) =>
        e.id === "work"
          ? {
              ...e,
              ago: 0,
              children: [
                ...(e.children ?? []),
                { id: `w-${++n}`, kind: "agent", title: `Update ${n}`, ago: 0 },
              ],
            }
          : e,
      )
      update()
    })
    chip(row, "Remove last", () => {
      story = top ? story.slice(1) : story.slice(0, -1)
      update()
    })
    // The same rail, reversed in place: every row glides to its new place.
    chip(row, "Newest on top", () => {
      top = !top
      story = [...story].reverse()
      rail.update({ events: view(), newest: top ? "top" : "bottom" })
    })
    s.side.prepend(row, status)
  }

  // ── option picker ──
  {
    const s = section({
      id: "picker",
      title: "Option picker",
      sub: "A proposal's options, each tuned by its own panel.",
      tip: "Focus it: ↑↓ or 1–5 pick, Enter chooses, Tab tunes.",
      shows: ["optionPicker()", "mountPanel()"],
      stage: true,
    })
    const sizeK = (v: number) => knob(v, { min: 24, max: 120, step: 1, unit: "px", label: "Size" })
    const radiusK = (v: number) =>
      knob(v, { min: 0, max: 60, step: 1, unit: "px", label: "Radius" })
    const tiltK = (v: number) => knob(v, { min: -30, max: 30, step: 1, unit: "°", label: "Tilt" })
    const glowK = (v: number) => knob(v, { min: 0, max: 100, step: 5, unit: "%", label: "Glow" })
    const variants: {
      id: string
      label: string
      suggested?: boolean
      schema: Record<string, Knob>
    }[] = [
      {
        id: "bars",
        label: "Rising Bars",
        suggested: true,
        schema: { size: sizeK(72), radius: radiusK(10), tilt: tiltK(0) },
      },
      {
        id: "dial",
        label: "Arc Dial",
        schema: { size: sizeK(88), radius: radiusK(44), tilt: tiltK(-12), glow: glowK(60) },
      },
      {
        id: "iris",
        label: "Concentric Iris",
        schema: { size: sizeK(96), radius: radiusK(48), glow: glowK(80) },
      },
      {
        id: "orb",
        label: "Dot-Matrix Orb",
        schema: { size: sizeK(64), radius: radiusK(22), tilt: tiltK(8), glow: glowK(40) },
      },
      { id: "planes", label: "Stacked Planes", schema: {} },
    ]
    const stores = new Map(variants.map((v) => [v.id, define(`picker-${v.id}`, v.label, v.schema)]))
    // A small picture per option (inline SVG gradients here; any image URL in a real app).
    const thumb = (hue: number) =>
      `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue} 80% 62%)"/><stop offset="1" stop-color="hsl(${hue + 50} 70% 38%)"/></linearGradient></defs><rect width="48" height="48" fill="url(#g)"/><circle cx="30" cy="20" r="9" fill="#fff" fill-opacity=".35"/></svg>`,
      )}`
    const base = variants.map(({ id, label, suggested }, i) => ({
      id,
      label,
      suggested,
      thumb: thumb(200 + i * 37),
    }))
    // Past nine every row still shows its number (digits pick 1–9).
    const extra = Array.from({ length: 7 }, (_, i) => ({
      id: `more-${i}`,
      label: `Variant ${i + 6}`,
      thumb: thumb(20 + i * 29),
    }))
    let many = false
    const stage = s.stage
    const tile = h("div")
    tile.style.cssText =
      "width:72px;height:72px;border-radius:10px;background:linear-gradient(135deg,var(--cool),#5e5ce6);transition:all .45s cubic-bezier(.2,.8,.2,1)"
    const caption = h("div", "caption")
    stage.append(tile, caption)
    let current = "bars"
    let chosen: string | null = null
    const paint = () => {
      const v = (stores.get(current)?.store.get() ?? {}) as Record<string, number>
      const size = v.size ?? 56
      tile.style.width = tile.style.height = `${size}px`
      tile.style.borderRadius = `${v.radius ?? 4}px`
      tile.style.transform = `rotate(${v.tilt ?? 0}deg)`
      tile.style.opacity = String(0.45 + (v.glow ?? 100) / 180)
      const label = variants.find((x) => x.id === current)?.label ?? ""
      caption.textContent = `${label}${chosen === current ? " · chosen" : ""}`
    }
    for (const [id, { on }] of stores) on(() => id === current && paint())
    const picker = optionPicker(s.slot, {
      theme: theme(),
      label: "Options",
      options: base,
      selected: current,
      onSelect: (id) => {
        current = id
        paint()
      },
      onChoose: (id) => {
        chosen = id
        picker.choose(id)
        paint()
        toast(`Chose ${variants.find((x) => x.id === id)?.label}`)
      },
      body: (option, el) => {
        const store = stores.get(option.id)?.store
        if (!store || !Object.keys(variants.find((x) => x.id === option.id)!.schema).length) return
        const panel = mountPanel(store, el, { ...panelOptions(), header: false, title: false })
        return () => panel.dispose()
      },
    })
    paint()
    const row = h("div", "chips")
    chip(
      row,
      "Choose",
      () => {
        chosen = picker.selected
        picker.choose(chosen)
        paint()
      },
      "",
    )
    chip(
      row,
      "12 options",
      () => {
        many = !many
        picker.set(many ? [...base, ...extra] : base)
      },
      "",
    )
    s.side.prepend(row)
  }

  // ── menu & contextMenu ──
  {
    const s = section({
      id: "menus",
      title: "Menus",
      sub: "Menus and a context menu, with submenus.",
      tip: "Right-click the card.",
      shows: ["menu()", "contextMenu()"],
    })
    const card = h("div", "stage")
    card.tabIndex = 0
    card.style.cssText += ";outline:none;cursor:context-menu"
    const shape = h("div")
    shape.style.cssText = "position:relative;width:72px;height:72px;border-radius:18px"
    // The outline is its own ring that blooms out from the shape and gathers back into it.
    const ring = h("div")
    ring.style.cssText =
      "position:absolute;inset:-6px;border-radius:24px;box-shadow:inset 0 0 0 1.5px currentColor;opacity:0;pointer-events:none"
    shape.append(ring)
    const label = h("div", "caption")
    const setLabel = rolling(label, [{ id: "text", text: true }])
    card.append(shape, label)
    s.slot.append(card)
    const state = { size: "M", outline: false, color: "#3a8dff", name: "Azure" }
    const SIZES: Record<string, number> = { S: 0.72, M: 1, L: 1.3 }
    const COLORS: [string, string][] = [
      ["Azure", "#3a8dff"],
      ["Mint", "#3eb489"],
      ["Tangerine", "#ff9150"],
      ["Rose", "#f2668b"],
    ]
    const shapeBlur = new DirBlur(shape)
    const stage = new Stage(card, () => {
      shape.style.transform = `scale(${size.x.toFixed(4)})`
      const c = tint.css()
      shape.style.backgroundColor = c
      ring.style.color = c
      const cSpeed = Math.hypot(tint.l.v, tint.a.v * 2.2, tint.b.v * 2.2) * 180
      const sb = blurFor(Math.abs(size.v) * 95 + cSpeed * 0.4, 2.6) / Math.max(0.2, size.x)
      shapeBlur.set(sb, sb)
      const o = clamp01(outline.x)
      ring.style.opacity = o.toFixed(3)
      ring.style.transform = `scale(${(0.9 + 0.1 * o).toFixed(4)})`
      const soft = !reduced() && o > 0.001 && (o < 0.999 || !outline.spring.resting)
      const rb = (1 - o) * 2.5 + blurFor(Math.abs(outline.v) * 75, 2)
      ring.style.filter = soft && rb >= 0.05 ? `blur(${rb.toFixed(2)}px)` : ""
    })
    const size = stage.val(1, 0.0005)
    const outline = stage.val(0, 0.002, true)
    const tint = new ColorVal(stage, state.color)
    let first = true
    const paint = () => {
      const how = first ? "init" : "other"
      first = false
      tint.go(state.color, how)
      outline.go(state.outline ? 1 : 0, how, state.outline ? "default" : "snappy")
      setLabel({ text: `${state.name} · ${state.size}${state.outline ? " · outline" : ""}` })
    }
    paint()
    const items = (): MenuEntry[] => [
      ...(["S", "M", "L"] as const).map((k) => ({
        label: { S: "Small", M: "Medium", L: "Large" }[k],
        radio: true,
        checked: state.size === k,
        shortcut: k,
        run: () => {
          state.size = k
          size.to(SIZES[k]!, "default")
          paint()
        },
      })),
      "-",
      {
        label: "Outline",
        checked: state.outline,
        shortcut: "Mod+O",
        run: () => {
          state.outline = !state.outline
          paint()
        },
      },
      {
        label: "Colour",
        items: () =>
          COLORS.map(([name, c]) => ({
            label: name,
            radio: true,
            checked: state.name === name,
            icon: `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="${c}"/></svg>`,
            run: () => {
              state.name = name
              state.color = c
              paint()
            },
          })),
      },
      { label: "Duplicate", hint: "soon", disabled: true },
      "-",
      {
        label: "Reset",
        destructive: true,
        run: () => {
          Object.assign(state, { size: "M", outline: false, color: "#3a8dff", name: "Azure" })
          size.to(1, "default")
          paint()
        },
      },
    ]
    contextMenu(card, () => items(), { label: "Card" })
    const row = h("div", "chips")
    let m: ReturnType<typeof menu> | null = null
    const open = chip(
      row,
      "Options ▾",
      (e) => {
        if (m?.open) return void m.close()
        m = menu(open, items(), { label: "Options", keyboard: e.detail === 0 })
      },
      "",
    )
    open.setAttribute("aria-haspopup", "menu")
    s.side.prepend(row)
  }

  // ── popover & tooltip ──
  {
    const s = section({
      id: "popover",
      title: "Popover",
      sub: "A popover that stays in view, and tooltips.",
      shows: ["popover()", "tooltip()"],
      wide: true,
    })
    const wrap = h("div")
    wrap.style.cssText = "display:flex;flex-direction:column;gap:14px;padding:4px 0"
    const tips = h("div", "chips")
    for (const [label, tip, key] of [
      ["Bold", "Bold", "Mod+B"],
      ["Italic", "Italic", "Mod+I"],
      ["Link", "Add a link", "Mod+K"],
      ["Code", "Inline code", "Mod+E"],
      ["Clear", "Clear formatting", "Mod+\\"],
    ] as const) {
      const b = chip(tips, label)
      b.dataset.tip = tip
      b.dataset.tipShortcut = key
    }
    const shareRow = h("div", "chips")
    let pop: ReturnType<typeof popover> | null = null
    const share = chip(
      shareRow,
      "Share…",
      () => {
        if (pop?.open) return void pop.close()
        const content = h("div")
        content.style.cssText =
          "display:flex;flex-direction:column;gap:10px;padding:12px;width:220px;font:12.5px/1.45 var(--k-font,system-ui)"
        content.innerHTML = `<div style="font-weight:600">Share this panel</div>
        <div style="opacity:.7">Anyone with the link sees the same values.</div>`
        chip(
          content,
          "Copy link",
          () => {
            void pop?.close()
            toast("Copied the link")
          },
          "",
        )
        pop = popover(share, content, { placement: "bottom-start", label: "Share", role: "dialog" })
      },
      "",
    )
    share.setAttribute("aria-haspopup", "dialog")
    tooltip(share, { text: () => (pop?.open ? "Close" : "Share this panel"), placement: "top" })
    wrap.append(tips, shareRow)
    s.slot.append(wrap)
  }

  // ── command palette ──
  {
    const s = section({
      id: "palette-section",
      title: "Command palette",
      sub: "Every section and control on this page.",
      tip: "Press ⌘K anywhere.",
      shows: ["commandPalette()", "commandsFrom()"],
      wide: true,
    })
    const row = h("div", "chips")
    const open = chip(row, "", () => document.getElementById("palette")?.click(), "")
    open.innerHTML = "Open the palette <kbd>⌘K</kbd>"
    s.slot.append(row)
  }

  // ── confirm & toast ──
  {
    const s = section({
      id: "confirm",
      title: "Confirm & toast",
      sub: "A modal question and a status pill.",
      shows: ["confirm()", "toast()"],
      wide: true,
    })
    const row = h("div", "chips")
    chip(
      row,
      "Delete “Barrier”…",
      async () => {
        const ok = await confirm({
          title: "Delete “Barrier”?",
          body: "It leaves the scene, with anything inside it.",
          confirm: "Delete",
          destructive: true,
        })
        if (ok)
          toast("Deleted Barrier", {
            action: { label: "Undo", run: () => toast("Barrier is back") },
          })
      },
      "danger",
    )
    chip(
      row,
      "Publish…",
      async () => {
        if (
          await confirm({
            title: "Publish these values?",
            body: "The shipped constants change for everyone.",
            confirm: "Publish",
          })
        )
          toast("Published")
      },
      "",
    )
    chip(row, "Saved", () => toast("Saved"))
    chip(row, "Warning", () => toast("Frame over budget", { tone: "warn" }))
    chip(row, "Error", () => toast("Couldn't reach the device", { tone: "error" }))
    s.slot.append(row)
  }
}
