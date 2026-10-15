// The Lab's overlays from knobs/ui: ⌘K opens a command palette over the stores' actions, presets
// and fields and the workspace's own commands; the top bar's buttons and the panes' actions carry
// tooltips; deleting from the outliner asks first.
import { type Controls, letterOf } from "knobs"
import {
  type Command,
  commandPalette,
  commandsFrom,
  confirm,
  contextMenu,
  menu,
  type MenuEntry,
  overlayLook,
  popover,
  toast,
  tooltip,
  tooltips,
} from "knobs/ui"
import { uiLook } from "./lab-look"
import { liveFeed, workspace } from "./lab-workspace"

overlayLook(uiLook())
tooltips(document)

interface Panelish {
  tab(id?: string): string | undefined
  fold(group: string, folded?: boolean): void
}

let onSpeed: (speed: number) => void = () => {}
/** The timeline follows the top bar's speed. */
export const speedChanged = (f: (speed: number) => void) => {
  onSpeed = f
}

export function startOverlays(stores: {
  // biome-ignore lint/suspicious/noExplicitAny: any store
  station: Controls<any>
  // biome-ignore lint/suspicious/noExplicitAny: any store
  details: Controls<any>
  // biome-ignore lint/suspicious/noExplicitAny: any store
  inspector: Controls<any>
  inspectorPanel(): Panelish
}) {
  const { main, left, center, outline } = workspace
  const pause = document.getElementById("pause") as HTMLButtonElement
  const syncPause = () => {
    pause.textContent = liveFeed.running ? "❚❚" : "▶"
    pause.setAttribute(
      "aria-label",
      liveFeed.running ? "Pause the live feed" : "Resume the live feed",
    )
    pause.classList.toggle("on", !liveFeed.running)
  }
  const togglePause = () => {
    liveFeed.pause()
    syncPause()
  }
  pause.addEventListener("click", togglePause)
  tooltip(pause, {
    text: () => (liveFeed.running ? "Pause the live feed" : "Resume the live feed"),
    shortcut: "Alt+P",
  })
  syncPause()

  /** Shows a field's row in its panel (its tab, its group open) and focuses it. */
  // biome-ignore lint/suspicious/noExplicitAny: any store
  const reveal = (controls: Controls<any>, panel?: () => Panelish) => (key: string) => {
    const field = controls.schema[key] as { tab?: string; group?: string }
    if (field.tab) panel?.().tab(field.tab)
    if (field.group) panel?.().fold(field.group, false)
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-controls="${controls.id}"] [data-field="${key}"]`,
      )
      if (!row) return
      row.scrollIntoView({ block: "nearest" })
      row
        .querySelector<HTMLElement>('[role="slider"],[tabindex="0"],input,button')
        ?.focus({ preventScroll: true })
    })
  }

  const deleteSelection = async (ids: readonly string[] = outline.selection) => {
    if (!ids.length) return
    const names = workspace.names(ids)
    const ok = await confirm({
      title: ids.length === 1 ? `Delete “${names[0]}”?` : `Delete ${ids.length} objects?`,
      body:
        ids.length === 1
          ? "It leaves the scene, with anything inside it."
          : `${names.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""} leave the scene, with anything inside them.`,
      confirm: "Delete",
      destructive: true,
    })
    if (!ok) return
    workspace.remove(ids)
    toast(ids.length === 1 ? `Deleted ${names[0]}` : `Deleted ${ids.length} objects`)
  }
  workspace.onDelete = (ids) => void deleteSelection(ids)

  // The outliner's context menu: a right-click selects the row under it (keeping a selection it's
  // part of), then offers what applies to the selection. The menu key or ⇧F10 opens it at the
  // active row.
  const icon = (d: string) =>
    `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
  const ICON = {
    rename: icon('<path d="M10.5 3.5l2 2L6 12l-2.6.6L4 10z"/>'),
    duplicate: icon(
      '<rect x="5.5" y="5.5" width="7" height="7" rx="1.5"/><path d="M3.5 10V4.8c0-.7.6-1.3 1.3-1.3H10"/>',
    ),
    move: icon(
      '<path d="M2.5 5.5v6c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-5c0-.6-.4-1-1-1H8L6.5 4H3.5c-.6 0-1 .4-1 1z"/>',
    ),
    delete: icon('<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8"/>'),
  }
  const rowItems = (e: MouseEvent | KeyboardEvent | null): MenuEntry[] | null => {
    const row = (e?.target as HTMLElement | null)?.closest<HTMLElement>(".knobs-tree-row")
    const id = row?.dataset.id ?? outline.active
    if (!id) return null
    if (row && !outline.selection.includes(id)) outline.select([id], id)
    const ids = outline.selection.length ? [...outline.selection] : [id]
    const one = ids.length === 1
    const hidden = ids.every((i) => workspace.hidden.has(i))
    const parent = workspace.parentOf(id)
    return [
      {
        id: "rename",
        label: "Rename",
        icon: ICON.rename,
        shortcut: "Enter",
        disabled: !one,
        run: () => outline.rename(id),
      },
      {
        id: "duplicate",
        label: "Duplicate",
        icon: ICON.duplicate,
        shortcut: "Mod+D",
        run: () => workspace.duplicate(ids),
      },
      {
        id: "hide",
        label: "Hidden",
        checked: hidden,
        shortcut: "H",
        run: () => workspace.setHidden(ids, !hidden),
      },
      {
        id: "move",
        label: "Move to",
        icon: ICON.move,
        items: () =>
          workspace.groupsOf().map((g) => ({
            id: `move-${g.id}`,
            label: g.label,
            radio: true,
            checked: one && parent === g.id,
            disabled: ids.includes(g.id),
            run: () => workspace.moveTo(ids, g.id),
          })),
      },
      "-",
      {
        id: "delete",
        label: one ? "Delete…" : `Delete ${ids.length} objects…`,
        icon: ICON.delete,
        shortcut: "Backspace",
        destructive: true,
        run: () => void deleteSelection(ids),
      },
    ]
  }
  const rowMenu = contextMenu(workspace.rows, rowItems, { label: "Scene object" })
  workspace.rows.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest(".knobs-tree-edit") || !outline.selection.length) return
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault()
      workspace.duplicate(outline.selection)
    } else if (e.key.toLowerCase() === "h" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      const ids = outline.selection
      workspace.setHidden(ids, !ids.every((i) => workspace.hidden.has(i)))
    }
  })

  // The top bar's speed: a menu of radio items under its button.
  const speed = document.querySelector<HTMLButtonElement>('[data-tip="Playback speed"]')!
  speed.setAttribute("aria-haspopup", "menu")
  let speedMenu: ReturnType<typeof menu> | null = null
  const openSpeed = (keyboard: boolean) => {
    if (speedMenu?.open) return void speedMenu.close()
    speedMenu = menu(
      speed,
      ["0.25", "0.5", "1", "2", "4"].map((v) => ({
        label: `${v}×`,
        radio: true,
        checked: speed.textContent === `${v}×`,
        run: () => {
          speed.textContent = `${v}×`
          onSpeed(Number(v))
        },
      })),
      { label: "Playback speed", keyboard },
    )
  }
  speed.addEventListener("click", (e) => openSpeed(e.detail === 0))

  const commands = (): Command[] => [
    {
      id: "live/pause",
      label: liveFeed.running ? "Pause live feed" : "Resume live feed",
      section: "Live",
      shortcut: "Alt+P",
      keywords: ["stop", "play", "freeze"],
      run: togglePause,
    },
    {
      id: "live/step",
      label: "Step one frame",
      section: "Live",
      disabled: liveFeed.running,
      run: () => liveFeed.tick(),
    },
    {
      id: "live/clear",
      label: "Clear event log",
      section: "Live",
      run: () => {
        liveFeed.diag.watch("events", null)
        return "Cleared the event log"
      },
    },
    {
      id: "scene/delete",
      label: "Delete selection",
      section: "Outliner",
      shortcut: "Backspace",
      disabled: outline.selection.length === 0,
      ...(outline.selection.length ? { hint: workspace.names(outline.selection).join(", ") } : {}),
      run: () => void deleteSelection(),
    },
    {
      id: "scene/rename",
      label: "Rename",
      section: "Outliner",
      shortcut: "Enter",
      disabled: !outline.active,
      run: () => outline.active && outline.rename(outline.active),
    },
    {
      id: "scene/find",
      label: "Find in scene",
      section: "Outliner",
      run: () => workspace.find.focus(),
    },
    {
      id: "scene/collapse",
      label: "Collapse all",
      section: "Outliner",
      run: workspace.collapseAll,
    },
    { id: "scene/expand", label: "Expand all", section: "Outliner", run: workspace.expandAll },
    {
      id: "layout/scene",
      label: main.pane("left").collapsed ? "Show scene" : "Hide scene",
      section: "Layout",
      keywords: ["sidebar", "outliner", "toggle"],
      run: () => main.collapse("left"),
    },
    {
      id: "layout/inspector",
      label: main.pane("right").collapsed ? "Show inspector" : "Hide inspector",
      section: "Layout",
      keywords: ["details", "toggle"],
      run: () => main.collapse("right"),
    },
    {
      id: "layout/dock",
      label: center.pane("dock").collapsed ? "Show dock" : "Hide dock",
      section: "Layout",
      keywords: ["live", "toggle"],
      run: () => center.collapse("dock"),
    },
    {
      id: "layout/reset",
      label: "Reset layout",
      section: "Layout",
      run: () => {
        main.reset()
        left.reset()
        center.reset()
      },
    },
    ...commandsFrom(stores.inspector, {
      title: "Inspector",
      reveal: reveal(stores.inspector, stores.inspectorPanel),
    }),
    ...commandsFrom(stores.station, { title: "Weather", reveal: reveal(stores.station) }),
    ...commandsFrom(stores.details, { title: "Details", reveal: reveal(stores.details) }),
  ]

  const palette = commandPalette({ commands, recents: "lab" })
  const search = document.getElementById("search") as HTMLInputElement
  search.placeholder = "Search  ⌘K"
  const openFromSearch = (e: Event) => {
    e.preventDefault()
    search.blur()
    palette.open()
  }
  search.addEventListener("mousedown", openFromSearch)
  search.addEventListener("focus", openFromSearch)
  tooltip(search, { text: "Search commands", shortcut: "Mod+K", placement: "bottom-end" })

  // "All games ▾": a menu in a popover, under the button's right edge.
  const games = document.querySelector<HTMLButtonElement>('[data-tip="Switch game"]')!
  games.setAttribute("aria-haspopup", "menu")
  games.setAttribute("aria-expanded", "false")
  let gamesMenu: ReturnType<typeof popover> | null = null
  games.addEventListener("click", () => {
    if (gamesMenu?.open) return void gamesMenu.close()
    const list = document.createElement("div")
    list.className = "lab-menu"
    for (const name of ["All games", "Outbreak", "Getaway", "Blackout", "Survivor"]) {
      const b = document.createElement("button")
      b.type = "button"
      b.setAttribute("role", "menuitemradio")
      b.setAttribute("aria-checked", String(games.textContent === `${name} ▾`))
      b.textContent = name
      b.onclick = () => {
        games.textContent = `${name} ▾`
        void gamesMenu?.close()
      }
      list.append(b)
    }
    list.addEventListener("keydown", (e) => {
      const items = [...list.querySelectorAll<HTMLButtonElement>("button")]
      const i = items.indexOf(document.activeElement as HTMLButtonElement)
      const by = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0
      if (!by) return
      e.preventDefault()
      items[(i + by + items.length) % items.length]!.focus()
    })
    games.setAttribute("aria-expanded", "true")
    gamesMenu = popover(games, list, {
      placement: "bottom-end",
      role: "menu",
      label: "Games",
      onClose: () => games.setAttribute("aria-expanded", "false"),
    })
  })

  document.addEventListener("keydown", (e) => {
    if (e.altKey && letterOf(e) === "P" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      togglePause()
    }
  })
  return { palette, deleteSelection, rowMenu }
}
