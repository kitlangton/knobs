// The Lab's two looks: knobs' own (rounded cards, soft washes, glass; dark or light) by default,
// and Arcade's square, flat Lab (labPreset) with ?look=lab. The top bar's switch re-themes
// everything live through restyle(document, …): panels glide to the new tokens, the splits and
// the outliner measure again, and overlays opened afterwards take it.
import { labPreset } from "knobs/themes"
import { restyle, type RestyleLook } from "knobs/ui"

export type LookName = "knobs" | "lab"
export type ThemeName = "dark" | "light"

const params = new URLSearchParams(location.search)
const state = {
  name: (params.get("look") === "lab" ? "lab" : "knobs") as LookName,
  theme: (params.get("theme") === "light" ? "light" : "dark") as ThemeName,
}

/** What panels, splits, trees and overlays take for the current look. */
export const look = (): RestyleLook & { theme: ThemeName } =>
  state.name === "lab"
    ? { preset: labPreset, theme: "dark", density: "compact" }
    : { theme: state.theme, density: "default" }

/** The look as mount options: a panel or piece takes `...lookOptions()`. */
export const lookOptions = () => {
  const { preset, theme, density } = look()
  return { ...(preset ? { preset } : {}), theme, density: density ?? "default" }
}

/** The look as a knobs/ui piece's options. */
export const uiLook = () => {
  const { preset, theme } = look()
  return { ...(preset ? { preset } : {}), theme }
}

export const lookName = () => state.name
export const themeName = () => state.theme

const listeners = new Set<() => void>()
export const onLook = (f: () => void) => listeners.add(f)

const mark = () => {
  const html = document.documentElement
  html.dataset.look = state.name
  // The Lab look is dark only.
  html.dataset.theme = state.name === "lab" ? "dark" : state.theme
  html.style.colorScheme = html.dataset.theme
}
mark()

export function setLook(name: LookName = state.name, theme: ThemeName = state.theme) {
  if (name === state.name && theme === state.theme) return
  state.name = name
  state.theme = theme
  mark()
  restyle(document, look())
  const url = new URL(location.href)
  if (name === "lab") url.searchParams.set("look", "lab")
  else url.searchParams.delete("look")
  if (theme === "light") url.searchParams.set("theme", "light")
  else url.searchParams.delete("theme")
  history.replaceState(null, "", url)
  for (const f of listeners) f()
}

/** The top bar's knobs / Lab switch and the light-or-dark button. */
export function bindLookSwitch() {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".look-switch [data-look]")]
  const theme = document.getElementById("theme") as HTMLButtonElement | null
  const sync = () => {
    for (const b of buttons) {
      const on = b.dataset.look === state.name
      b.classList.toggle("on", on)
      b.setAttribute("aria-checked", String(on))
    }
    if (theme) theme.textContent = state.theme === "dark" ? "☾" : "☀"
  }
  for (const b of buttons) b.addEventListener("click", () => setLook(b.dataset.look as LookName))
  theme?.addEventListener("click", () =>
    setLook(state.name, state.theme === "dark" ? "light" : "dark"),
  )
  onLook(sync)
  sync()
}
