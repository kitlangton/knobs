// The catalog's knobs/ui sections: a split with collapsing panes, an outliner,
// menus and a context menu, a popover and tooltips, the command palette, confirms
// and toasts.
import {
  applyMove,
  confirm,
  contextMenu,
  type MenuEntry,
  menu,
  popover,
  split,
  toast,
  tooltip,
  tree,
} from "knobs/ui"
import type { SectionSpec } from "./controls"
import { blurFor, ColorVal, DirBlur, reduced, rolling, Stage } from "./controls-motion"

interface Kit {
  section(spec: SectionSpec): {
    el: HTMLElement
    slot: HTMLElement
    side: HTMLElement
    stage: HTMLElement
  }
  h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    html?: string,
  ): HTMLElementTagNameMap[K]
  theme(): "dark" | "light"
}

export function uiSections({ section, h, theme }: Kit) {
  // ── split ──
  {
    const s = section({
      id: "split",
      title: "Split",
      code: "split()",
      what: "Resizable panes that collapse to a rail. Each slows softly into its min and max instead of stopping dead.",
      wide: true,
      tries: [
        "Drag a gap between panes; double-click it to reset",
        "Drag Files 40px past its minimum and it collapses; click the rail to open it",
        "Focus a divider: <kbd>←</kbd> <kbd>→</kbd> resize, <kbd>Enter</kbd> collapses",
      ],
    })
    const box = h("div", "ui-box")
    box.style.height = "220px"
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
    const sp = split(box, {
      theme: theme(),
      storage: null,
      panes: [
        {
          id: "files",
          size: 170,
          min: 120,
          max: 260,
          collapsible: true,
          title: "Files",
          count: 3,
          element: note("index.ts · scene.ts · look.ts"),
        },
        { id: "canvas", min: 160, element: canvas },
        {
          id: "inspector",
          size: 190,
          min: 140,
          max: 300,
          collapsible: true,
          title: "Inspector",
          element: note("Panels mount in panes, and stay drawn through a drag or a collapse."),
        },
      ],
    })
    const row = h("div", "chips")
    const btn = (label: string, run: () => void) => {
      const b = h("button", "chip quiet")
      b.textContent = label
      b.addEventListener("click", run)
      row.append(b)
    }
    btn("Toggle files", () => sp.collapse("files"))
    btn("Toggle inspector", () => sp.collapse("inspector"))
    btn("Reset", () => sp.reset())
    s.side.prepend(row)
  }

  // ── tree ──
  {
    const s = section({
      id: "tree",
      title: "Tree",
      code: "tree()",
      what: "A virtualised outliner. Branches slide open like a drawer; rows that move glide to their new places.",
      tries: [
        "Drag a row onto Props, or between rows",
        "<kbd>⌥↑</kbd> <kbd>⌥↓</kbd> move the selection; <kbd>Enter</kbd> renames",
        "Hover a row for its eye; hidden rows dim",
      ],
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
    const box = h("div", "ui-box")
    box.style.cssText += ";height:236px;padding:4px 0"
    s.slot.append(box)
    const picked = h("p")
    picked.style.cssText = "margin:0;color:var(--label);font-size:12px"
    picked.textContent = "Nothing selected"
    s.side.prepend(picked)
    const find = (id: string, list: Node[] = items): Node | undefined => {
      for (const n of list) {
        if (n.id === id) return n
        const c = n.children && find(id, n.children)
        if (c) return c
      }
    }
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
          ? `Selected: ${ids.map((id) => find(id)?.label ?? id).join(", ")}`
          : "Nothing selected"
      },
      onMove: (move) => {
        items = applyMove(items, move)
        outline.update(items)
      },
      onRename: (id, label) => {
        const n = find(id)
        if (n) n.label = label
        outline.update(items)
      },
    })
  }

  // ── menu & contextMenu ──
  {
    const s = section({
      id: "menus",
      title: "Menu & context menu",
      code: "menu() · contextMenu()",
      what: "Menus with icons, shortcut chips, checks, radios and submenus. They grow from where they're asked for and can be turned back halfway.",
      tries: [
        "Right-click the card, or focus it and press <kbd>⇧F10</kbd>",
        "Hover Colour: the submenu stays open while you head for it",
        "Letters jump to an item; <kbd>Esc</kbd> closes",
      ],
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
      const o = Math.min(1, Math.max(0, outline.x))
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
    const open = h("button", "chip")
    open.textContent = "Options ▾"
    open.setAttribute("aria-haspopup", "menu")
    let m: ReturnType<typeof menu> | null = null
    open.addEventListener("click", (e) => {
      if (m?.open) return void m.close()
      m = menu(open, items(), { label: "Options", keyboard: e.detail === 0 })
    })
    const row = h("div", "chips")
    row.append(open)
    s.side.prepend(row)
  }

  // ── popover & tooltip ──
  {
    const s = section({
      id: "popover",
      title: "Popover & tooltip",
      code: "popover() · tooltip()",
      what: "A popover flips and shifts to stay in view and follows its anchor. Tooltips wait half a second, then hand off at once to a neighbour.",
      tries: [
        "Rest on a chip, then slide along the row: the next tip shows with no wait",
        "Open Share and press <kbd>Esc</kbd>: focus comes back to the button",
      ],
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
      const b = h("button", "chip quiet")
      b.textContent = label
      b.dataset.tip = tip
      b.dataset.tipShortcut = key
      tips.append(b)
    }
    const share = h("button", "chip")
    share.textContent = "Share…"
    share.setAttribute("aria-haspopup", "dialog")
    tooltip(share, { text: () => (pop?.open ? "Close" : "Share this panel"), placement: "top" })
    let pop: ReturnType<typeof popover> | null = null
    share.addEventListener("click", () => {
      if (pop?.open) return void pop.close()
      const content = h("div")
      content.style.cssText =
        "display:flex;flex-direction:column;gap:10px;padding:12px;width:220px;font:12.5px/1.45 var(--k-font,system-ui)"
      content.innerHTML = `<div style="font-weight:600">Share this panel</div>
        <div style="opacity:.7">Anyone with the link sees the same values.</div>`
      const copy = h("button", "chip")
      copy.textContent = "Copy link"
      copy.addEventListener("click", () => {
        void pop?.close()
        toast("Copied the link")
      })
      content.append(copy)
      pop = popover(share, content, { placement: "bottom-start", label: "Share", role: "dialog" })
    })
    const shareRow = h("div", "chips")
    shareRow.append(share)
    wrap.append(tips, shareRow)
    s.slot.append(wrap)
  }

  // ── command palette ──
  {
    const s = section({
      id: "palette-section",
      title: "Command palette",
      code: "commandPalette() · commandsFrom()",
      what: "⌘K on this page lists its sections, then every store's actions, presets and fields through commandsFrom. Matches light up as you type.",
      tries: [
        "Type “spr” to jump to the Spring card",
        "Type “tidy” to apply a preset from here",
        "Recent commands come first next time",
      ],
    })
    const open = h("button", "chip")
    open.innerHTML = "Open the palette <kbd>⌘K</kbd>"
    open.addEventListener("click", () => document.getElementById("palette")?.click())
    const row = h("div", "chips")
    row.append(open)
    s.slot.append(row)
  }

  // ── confirm & toast ──
  {
    const s = section({
      id: "confirm",
      title: "Confirm & toast",
      code: "confirm() · toast()",
      what: "A modal question that keeps focus inside, and a status pill at the bottom. A new toast replaces the one showing.",
      tries: [
        "Delete asks first, with focus on Cancel; then Undo from the toast",
        "Hover a toast to keep it",
      ],
    })
    const row = h("div", "chips")
    const btn = (label: string, cls: string, run: () => void) => {
      const b = h("button", `chip ${cls}`)
      b.textContent = label
      b.addEventListener("click", run)
      row.append(b)
    }
    btn("Delete “Barrier”…", "danger", async () => {
      const ok = await confirm({
        title: "Delete “Barrier”?",
        body: "It leaves the scene, with anything inside it.",
        confirm: "Delete",
        destructive: true,
      })
      if (ok)
        toast("Deleted Barrier", { action: { label: "Undo", run: () => toast("Barrier is back") } })
    })
    btn("Publish…", "", async () => {
      if (
        await confirm({
          title: "Publish these values?",
          body: "The shipped constants change for everyone.",
          confirm: "Publish",
        })
      )
        toast("Published")
    })
    btn("Saved", "quiet", () => toast("Saved"))
    btn("Warning", "quiet", () => toast("Frame over budget", { tone: "warn" }))
    btn("Error", "quiet", () => toast("Couldn't reach the device", { tone: "error" }))
    s.slot.append(row)
  }
}
