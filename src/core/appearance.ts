import type { Theme } from "../themes/define.js"
import { presetCss, type TokenPreset } from "./theme.js"

/**
 * Light or dark: `dark` and `light` fix it, `system` follows the OS, and `inherit` (the default)
 * follows the page: a `color-scheme`, a `.dark`/`.light` class, `[data-theme]` or
 * `[data-appearance]` on an ancestor, or an outer knobs element, else the OS.
 */
export type Appearance = "dark" | "light" | "system" | "inherit"
/** @deprecated The old name for an appearance: `auto` is `system`. Use `appearance`. */
export type ThemeMode = "dark" | "light" | "auto"

/** How a panel, chip or knobs/ui piece looks: its theme, its appearance (and an old preset). */
export interface LookOptions {
  /**
   * A theme from `defineTheme` (or `themes.knobs`, `themes.void`). Knobs' own when unset.
   * `"dark" | "light" | "auto"` is the old spelling of `appearance` and still works.
   */
  readonly theme?: Theme | ThemeMode
  readonly appearance?: Appearance
  /** @deprecated A `TokenPreset` (`labPreset`): its tokens over the theme's. */
  readonly preset?: TokenPreset
}

/** A look with every part decided. */
export interface Look {
  readonly theme?: Theme
  readonly appearance: Appearance
  readonly preset?: TokenPreset
}

const MODES: Readonly<Record<ThemeMode, Appearance>> = {
  dark: "dark",
  light: "light",
  auto: "system",
}

/** `options` over `base`: a theme object, an appearance (or an old mode), a preset. */
export function resolveLook(options: LookOptions = {}, base?: Partial<Look>): Look {
  const t = options.theme
  const mode = typeof t === "string" ? MODES[t] : undefined
  const theme = typeof t === "object" ? t : base?.theme
  const preset = options.preset ?? base?.preset
  return {
    ...(theme ? { theme } : {}),
    appearance: options.appearance ?? mode ?? base?.appearance ?? "inherit",
    ...(preset ? { preset } : {}),
  }
}

const themes = new Map<string, Theme>()

/** The theme an element shows: the nearest themed knobs element's, else knobs' own (undefined). */
export function themeOf(el: Element): Theme | undefined {
  const name = el.closest<HTMLElement>("[data-knobs-theme]")?.dataset.knobsTheme
  return name ? themes.get(name) : undefined
}

/** The selector a theme's tokens sit under: any knobs element marked with its name. */
export const themeSelector = (name: string) => `:where(.knobs-root)[data-knobs-theme="${name}"]`

function upsertStyle(doc: Document, key: string, value: string, content: string) {
  const existing = doc.querySelector<HTMLStyleElement>(`style[${key}="${value}"]`)
  if (existing) {
    if (existing.textContent !== content) existing.textContent = content
    return
  }
  const style = doc.createElement("style")
  style.setAttribute(key, value)
  style.textContent = content
  doc.head.append(style)
}

/** Adds a theme's tokens once per document, under `[data-knobs-theme="<name>"]`. */
export function injectTheme(doc: Document, theme: Theme) {
  themes.set(theme.name, theme)
  upsertStyle(
    doc,
    "data-knobs-theme-css",
    theme.name,
    theme.css({ selector: themeSelector(theme.name) }),
  )
}

const presets = new Map<string, TokenPreset>()

/** Adds a preset's tokens once per document, for any knobs element marked `data-preset`. */
export function injectPreset(doc: Document, preset: TokenPreset) {
  presets.set(preset.name, preset)
  upsertStyle(doc, "data-knobs-preset", preset.name, presetCss(preset))
}

const setAttr = (el: HTMLElement, name: string, value: string | undefined) => {
  if (value === undefined) el.removeAttribute(name)
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/** Marks `el` (a knobs root) with `look`: its theme's tokens, its appearance and its preset. */
export function applyLook(el: HTMLElement, look: Look) {
  const doc = el.ownerDocument
  if (look.theme) injectTheme(doc, look.theme)
  if (look.preset) injectPreset(doc, look.preset)
  setAttr(el, "data-knobs-theme", look.theme?.name)
  setAttr(el, "data-preset", look.preset?.name)
  setAttr(el, "data-appearance", look.appearance === "inherit" ? undefined : look.appearance)
  if (look.appearance === "inherit") followPage(el)
  else clearInherited(el)
}

const clearInherited = (el: HTMLElement) => {
  el.style.removeProperty("color-scheme")
  el.style.removeProperty("--_k-light")
}

/**
 * `inherit` where CSS can't see it: a host that sets only `color-scheme` (on `:root`, say). A
 * top-level knobs element takes its parent's scheme then, and `--_k-light` to match.
 */
function resolveInherited(el: HTMLElement) {
  const parent = el.parentElement
  const win = el.ownerDocument.defaultView
  if (!parent || !win || el.hasAttribute("data-appearance")) return
  if (parent.closest(".knobs-root")) return clearInherited(el)
  const scheme = win.getComputedStyle(parent).colorScheme.trim()
  const dark = /\bdark\b/.test(scheme)
  const light = /\blight\b/.test(scheme)
  if (!dark && !light) return clearInherited(el)
  const isLight =
    dark && light ? (win.matchMedia?.("(prefers-color-scheme: light)").matches ?? false) : light
  el.style.setProperty("color-scheme", "inherit")
  el.style.setProperty("--_k-light", isLight ? "1" : "0")
}

const watched = new WeakSet<Document>()
/** Resolves `inherit` once `el` is on the page, and again when the page's scheme changes. */
function followPage(el: HTMLElement) {
  const doc = el.ownerDocument
  const win = doc.defaultView
  if (!win) return
  const run = () => resolveInherited(el)
  if (el.isConnected) run()
  queueMicrotask(run)
  win.requestAnimationFrame?.(run)
  if (watched.has(doc)) return
  watched.add(doc)
  const all = () => {
    for (const root of doc.querySelectorAll<HTMLElement>(".knobs-root:not([data-appearance])"))
      resolveInherited(root)
  }
  const observer = new MutationObserver(all)
  const attributeFilter = ["class", "data-theme", "data-appearance"]
  observer.observe(doc.documentElement, { attributes: true, attributeFilter })
  if (doc.body) observer.observe(doc.body, { attributes: true, attributeFilter })
  win.matchMedia?.("(prefers-color-scheme: light)").addEventListener?.("change", all)
}

/**
 * The look `el` shows, fixed: its theme and preset, and the appearance it shows now. For something
 * floated out of it (a drag ghost, a menu) to match it wherever it lands.
 */
export function lookAt(el: Element): Look {
  const win = el.ownerDocument.defaultView
  const light = win?.getComputedStyle(el).getPropertyValue("--_k-light").trim() === "1"
  const theme = themeOf(el)
  const name = el.closest<HTMLElement>("[data-preset]")?.dataset.preset
  const preset = name ? presets.get(name) : undefined
  return {
    ...(theme ? { theme } : {}),
    appearance: light ? "light" : "dark",
    ...(preset ? { preset } : {}),
  }
}
