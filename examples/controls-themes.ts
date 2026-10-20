// The catalog's themes: one panel and a couple of knobs/ui pieces in Knobs, in Void and in a theme
// of your own, side by side in the page's appearance. The third column's panel is the builder:
// defineTheme's dials, drawn in the theme they make. Each column sets its theme on its pieces, so
// the page's own look (site-look.ts) doesn't reach them; every piece in both themes is on
// themes.html.
import { action, choice, color, knob, toggle } from "knobs"
import { defineTheme, type Density, type Material, type Theme, themes } from "knobs/themes"
import { type MenuEntry, menu, restyle, toast, tree, type UiLook } from "knobs/ui"
import type { SceneKit } from "./controls"

type Key = "knobs" | "void" | "custom"
const NAMES: Record<Key, string> = { knobs: "Knobs", void: "Void", custom: "Yours" }

const fileIcon =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M4 2h5.2L12 4.8V14H4Z"/><path d="M9 2v3h3"/></svg>'

export function themesSection({
  section,
  h,
  theme,
  define,
  mount,
  whenNear,
}: Pick<SceneKit, "section" | "h" | "theme" | "define" | "mount"> & {
  whenNear: (el: HTMLElement, fn: () => void) => void
}) {
  const s = section({
    id: "themes",
    title: "Themes",
    sub: "Knobs, Void and one of your own, side by side.",
    tip: "The third panel is defineTheme's dials, drawn in the theme they make.",
    shows: ["themes.knobs", "themes.void", "defineTheme()"],
    wide: true,
  })

  const { store: specimen } = define("theme-specimen", "Theme specimen", {
    size: knob(42, { min: 0, max: 100, step: 1, unit: "px", label: "Size" }),
    opacity: knob(0.8, { min: 0, max: 1, step: 0.01, label: "Opacity" }),
    fit: choice("fill", ["fill", "fit", "crop"], {
      label: "Fit",
      labels: { fill: "Fill", fit: "Fit", crop: "Crop" },
    }),
    visible: toggle(true, { label: "Visible" }),
    tint: color("#3a8dff", { label: "Tint" }),
  })

  const { store: builder } = define("theme-builder", "Theme builder", {
    hue: knob(285, { min: 0, max: 360, step: 1, unit: "°", label: "Gray hue" }),
    chroma: knob(0.004, { min: 0, max: 0.02, step: 0.001, decimals: 3, label: "Gray chroma" }),
    accent: color("#ffffff", { label: "Accent" }),
    contrast: knob(50, { min: 0, max: 100, step: 1, label: "Contrast" }),
    radius: knob(8, { min: 0, max: 16, step: 1, unit: "px", label: "Radius" }),
    density: choice("default", ["compact", "default", "comfortable"], {
      label: "Density",
      labels: { compact: "Compact", default: "Default", comfortable: "Comfy" },
    }),
    material: choice("glass", ["glass", "solid", "flat"], {
      label: "Material",
      labels: { glass: "Glass", solid: "Solid", flat: "Flat" },
    }),
    copy: action("Copy as code", { run: () => void copyCode() }),
  })
  const dials = () => {
    const v = builder.get()
    return { ...v, density: v.density as Density, material: v.material as Material }
  }
  const make = (d = dials()) =>
    defineTheme({
      name: "custom",
      gray: { hue: d.hue, chroma: d.chroma },
      accent: d.accent,
      contrast: d.contrast,
      radius: d.radius,
      density: d.density,
      material: d.material,
    })
  let custom = make()
  const copyCode = async () => {
    const d = dials()
    const code = `import { defineTheme } from "knobs/themes"

export const custom = defineTheme({
  name: "custom",
  gray: { hue: ${d.hue}, chroma: ${d.chroma} },
  accent: "${d.accent}",
  contrast: ${d.contrast},
  radius: ${d.radius},
  density: "${d.density}",
  material: "${d.material}",
})
`
    try {
      await navigator.clipboard.writeText(code)
      toast("Copied the defineTheme call", { look: look("custom") })
    } catch {
      toast("Couldn't reach the clipboard", { tone: "warn", look: look("custom") })
    }
  }

  const themeOf = (key: Key): Theme =>
    key === "custom" ? custom : key === "void" ? themes.void : themes.knobs
  const look = (key: Key): UiLook => ({ theme: themeOf(key), appearance: theme() })

  // The columns hold their own looks: the page's light/dark switch leaves them to relook().
  const grid = h("div", "theme-cols")
  grid.dataset.ownLook = ""
  s.slot.append(grid)
  const more = h("p", "note", '<a href="themes.html">Every piece in both themes →</a>')
  s.side.append(more)

  const columns = (["knobs", "void", "custom"] as const).map((key) => {
    const col = h("div", "theme-col")
    col.append(Object.assign(h("h3"), { textContent: NAMES[key] }))
    const slot = h("div")
    col.append(slot)
    grid.append(col)
    return { key, col, slot }
  })
  const paint = (key: Key, col: HTMLElement) => {
    const t = themeOf(key)[theme()]
    col.style.setProperty("--col-page", t["bg-page"])
    col.style.setProperty("--col-text", t.fg)
    col.style.setProperty("--col-dim", t["fg-3"])
  }
  const relook = (key: Key, col: HTMLElement) => {
    paint(key, col)
    restyle(col, look(key))
  }
  for (const { key, col, slot } of columns) {
    paint(key, col)
    mount(key === "custom" ? builder : specimen, slot, {
      ...look(key),
      title: key === "custom" ? "Theme builder" : "Specimen",
    })
  }

  whenNear(s.el, () => {
    for (const { key, col } of columns) {
      const box = h("div", "tree-box")
      col.append(box)
      tree(box, {
        ...look(key),
        label: "Files",
        items: ["index.ts", "scene.ts", "look.ts"].map((id) => ({ id, label: id })),
        selection: ["scene.ts"],
        icon: () => fileIcon,
      })
      const acts = h("div", "acts")
      const button = (label: string, run: (b: HTMLButtonElement, e: MouseEvent) => void) => {
        const b = h("button", "act")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", (e) => run(b, e))
        acts.append(b)
        return b
      }
      const entries = (): MenuEntry[] => [
        { label: "Small", radio: true, checked: false, shortcut: "S" },
        { label: "Medium", radio: true, checked: true, shortcut: "M" },
        "-",
        { label: "Outline", checked: true, shortcut: "Mod+O" },
        { label: "Duplicate", hint: "soon", disabled: true },
        "-",
        { label: "Delete", destructive: true },
      ]
      const opener = button("Menu ▾", (b, e) =>
        menu(b, entries(), { label: "Options", look: look(key), keyboard: e.detail === 0 }),
      )
      opener.setAttribute("aria-haspopup", "menu")
      button("Toast", () => toast(`Saved in ${NAMES[key]}`, { look: look(key) }))
      col.append(acts)
      // The panels mounted just before, with the look the page had when it was built.
      relook(key, col)
    }
  })

  // The page went light or dark: every column follows.
  new MutationObserver(() => {
    for (const { key, col } of columns) relook(key, col)
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
  builder.subscribe(() => {
    custom = make()
    const yours = columns.find((c) => c.key === "custom")!
    relook(yours.key, yours.col)
  })
}
