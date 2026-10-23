// The site's settings: one panel in the header runs the whole page. Theme buttons choose
// Night, Ocean, Synth, Brutal, Paper or Void (site-look-themes.ts), blended by site-look-math.ts;
// the rest dress that look (site-dress.ts): accent, contrast, grain and speed; the title's face,
// size and weight, the body's size and tracking; corners and surface; density and width. One rAF
// loop springs every setting toward the store's value and writes the result to the root as custom
// properties, which the page (site-look.css), every knobs panel in both renderers and the title's
// faces read; it sleeps at rest. Under the hand a row follows 1:1; presets, keys, Random, undo and
// appearance changes glide on a duration spring with no bounce (Speed scales it), and
// with reduced motion fade straight there instead. The values persist with the store; the look
// they resolve to is kept too, so the next load paints it before any script (controls.html).
import { type ChangeMeta, choice, color, defineControls, knob, type MountPanelOptions } from "knobs"
import { mountPanel } from "knobs/panel"
import { dress, labOf, type Settings } from "./site-dress"
import {
  APPEARANCE_KEY,
  APPEARANCES,
  type Appearance,
  appearanceAfterChange,
  appearanceDark,
  appearanceLook,
  appearanceOf,
  nextAppearance,
  readAppearance,
} from "./site-appearance"
import {
  css,
  type FontKey,
  type Look,
  lerp,
  mixLooks,
  type Rgba,
  roundPx,
  stepSpring,
} from "./site-look-math"
import { THEMES } from "./site-look-themes"
import { mountTitle } from "./site-title"

/** Where the resolved look is kept for the next first paint (read by controls.html). */
const KEY = "knobs-site-look"
/** Glides (presets, keys, Random, the toggle), s at Speed 1, bounce 0. */
const GLIDE = 0.4
/** The hand catching a row up when it takes over mid-glide: Kit's "instant". */
const CATCH = 0.1
/**
 * The inks crossing from light to dark: nearly a swap. They change sides at the grey where white
 * and black text both read, so any time spent between them is time spent grey on grey.
 */
const FLIP = 0.12
/** Reduced motion: every change a short fade. */
const FADE = 0.18
const FACES = ["sans", "serif", "mono", "wide"] as const
const FACE_OPTIONS = ["theme", ...FACES] as const

const THEME_IDS = ["night", "ocean", "synth", "brutal", "paper", "void"] as const
type ThemeId = (typeof THEME_IDS)[number]
const themeAt = (x: number): ThemeId =>
  THEME_IDS[Math.min(THEME_IDS.length - 1, Math.max(0, Math.round(x)))]!
const schema = {
  theme: choice("night", THEME_IDS, {
    label: "Theme",
    display: "segmented",
    labels: Object.fromEntries(THEMES.map((t) => [t.id, t.name])),
  }),
  appearance: choice("system", APPEARANCES, {
    label: "Appearance",
    display: "segmented",
    labels: { system: "System", light: "Light", dark: "Dark" },
    random: false,
  }),
  accent: color("#ffffff", { label: "Accent", group: "look" }),
  contrast: knob(0, {
    min: -0.5,
    max: 1,
    step: 0.01,
    decimals: 2,
    label: "Contrast",
    group: "look",
  }),
  grain: knob(0, { min: 0, max: 1, step: 0.01, decimals: 2, label: "Grain", group: "look" }),
  speed: knob(1, {
    min: 0.5,
    max: 2,
    step: 0.05,
    decimals: 2,
    unit: "×",
    label: "Speed",
    group: "look",
  }),
  face: choice("theme", FACE_OPTIONS, {
    label: "Face",
    group: "type",
    display: "segmented",
    labels: { theme: "Theme", sans: "Sans", serif: "Serif", mono: "Mono", wide: "Wide" },
  }),
  size: knob(100, { min: 70, max: 130, step: 1, unit: "%", label: "Size", group: "type" }),
  weight: knob(0, { min: -300, max: 300, step: 10, label: "Weight", group: "type" }),
  body: knob(13, {
    min: 12,
    max: 16,
    step: 0.5,
    decimals: 1,
    unit: "px",
    label: "Body",
    group: "type",
  }),
  tracking: knob(0, { min: -1, max: 1, step: 0.01, decimals: 2, label: "Tracking", group: "type" }),
  corners: knob(0, { min: -1, max: 1, step: 0.01, decimals: 2, label: "Corners", group: "shape" }),
  surface: knob(1, { min: 0, max: 2, step: 0.01, decimals: 2, label: "Surface", group: "shape" }),
  density: knob(100, { min: 80, max: 130, step: 1, unit: "%", label: "Density", group: "space" }),
  width: knob(1180, { min: 960, max: 1440, step: 10, unit: "px", label: "Width", group: "space" }),
}
type Values = { [K in keyof typeof schema]: (typeof schema)[K]["value"] }

/** Complete looks, except the independent appearance preference. Night is the default look. */
const PRESETS: Record<string, Partial<Values>> = {
  Editorial: {
    theme: "ocean",
    accent: "#c0ad8a",
    contrast: 0.2,
    grain: 0,
    speed: 0.8,
    face: "serif",
    size: 100,
    weight: 0,
    body: 14,
    tracking: -0.3,
    corners: -0.7,
    surface: 0,
    density: 118,
    width: 1080,
  },
  Synth: {
    theme: "synth",
    accent: "#b8a4d4",
    contrast: 0.1,
    grain: 0,
    speed: 1.25,
    face: "theme",
    size: 100,
    weight: 0,
    tracking: 0.2,
    corners: -0.2,
    surface: 1.3,
    density: 96,
    width: 1280,
  },
  Brutal: {
    theme: "brutal",
    accent: "#ff3b00",
    contrast: 0.25,
    speed: 1.6,
    face: "mono",
    size: 100,
    weight: 0,
    tracking: -0.4,
    corners: -1,
    surface: 0,
    density: 86,
    width: 1440,
  },
  Paper: {
    theme: "paper",
    accent: "#a8331f",
    grain: 0.1,
    speed: 0.8,
    face: "serif",
    body: 14,
    surface: 2,
    density: 108,
    width: 1040,
  },
}

/** What springs: every number, the accent as OKLab. */
const NUMS = [
  "contrast",
  "grain",
  "size",
  "weight",
  "body",
  "tracking",
  "corners",
  "surface",
  "density",
  "width",
] as const
type Num = (typeof NUMS)[number] | "aL" | "aA" | "aB"
/** How close a row must be to count as caught up (or settled), in its own units. */
const EPS: Record<Num, number> = {
  contrast: 0.005,
  grain: 0.005,
  size: 0.5,
  weight: 2,
  body: 0.02,
  tracking: 0.005,
  corners: 0.005,
  surface: 0.005,
  density: 0.5,
  width: 2,
  aL: 0.003,
  aA: 0.002,
  aB: 0.002,
}

const targetsOf = (v: Values): Record<Num, number> => {
  const [aL, aA, aB] = labOf(v.accent)
  const out = { aL, aA, aB } as Record<Num, number>
  for (const k of NUMS) out[k] = v[k]
  return out
}

export interface SiteLookOptions {
  /** Where the settings' panel goes. */
  readonly slot: HTMLElement
  readonly title: HTMLElement
  readonly panel: MountPanelOptions
  /** Light or dark changed (the page's own `data-theme`, restyles, scenes). */
  readonly onPolarity: (dark: boolean) => void
  readonly onAppearance?: (appearance: Appearance) => void
}

export interface SiteLook {
  /** Cycles System → Light → Dark without changing the theme. */
  toggle(): void
  setAppearance(appearance: Appearance): void
  readonly appearance: Appearance
  /** Chooses the theme nearest `x` at once, outside the undo history (for scripts). */
  jump(x: number): void
  readonly dark: boolean
  readonly store: {
    get(): Values
    set(patch: Partial<Values>, meta?: { coalesce?: boolean }): void
    preset(id: string): void
  }
}

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")

export function mountSiteLook(options: SiteLookOptions): SiteLook {
  const root = document.documentElement
  const drawTitle = mountTitle(options.title)
  const systemQuery = matchMedia("(prefers-color-scheme: dark)")
  let appearance = readAppearance()
  try {
    localStorage.setItem(APPEARANCE_KEY, appearance)
  } catch {}
  let booting = true
  // Keep the rest of an existing saved look when upgrading the old numeric theme slider.
  try {
    const key = "knobs:site:state:v1"
    const saved = JSON.parse(localStorage.getItem(key) ?? "null")
    if (saved?.version === 1 && Number.isFinite(saved.values?.theme)) {
      saved.values.theme = themeAt(saved.values.theme)
      localStorage.setItem(key, JSON.stringify(saved))
    }
  } catch {}
  const store = defineControls("site", schema, {
    enabled: true,
    defaultLabel: THEMES[0]!.name,
    presets: PRESETS,
    onChange(patch, values, meta) {
      if (booting) return
      if ("appearance" in patch) {
        const next = appearanceAfterChange(appearance, values.appearance, meta.source)
        if (next !== values.appearance) {
          // Presets/reset contain complete values. Restore this independent preference before
          // the next paint, without adding another undo entry.
          queueMicrotask(() => store.sync({ appearance }))
        }
        if (next !== appearance) {
          appearance = next
          try {
            localStorage.setItem(APPEARANCE_KEY, appearance)
          } catch {}
          options.onAppearance?.(appearance)
        }
      }
      drive(patch as Partial<Values>, values as Values, meta)
    },
  })

  // ── State: each number a spring toward the store, the inks' polarity, the face, a fade ──
  store.get()
  store.sync({ appearance })
  store.lock("appearance", true)
  let targets = targetsOf(store.get())
  const springs = Object.fromEntries(
    Object.entries(targets).map(([k, x]) => [k, { x, v: 0 }]),
  ) as Record<Num, { x: number; v: number }>
  // Themes are destinations, not stops along a numeric slider. Each share retains its
  // velocity when a third look is selected, without ever visiting an unrelated palette.
  const themeTargets = (v: Values) => THEME_IDS.map((id) => (id === v.theme ? 1 : 0))
  let wantedThemes = themeTargets(store.get())
  const themes = wantedThemes.map((x) => ({ x, v: 0 }))
  /** Rows under the hand, and those it has caught up with. */
  const hand = new Set<Num>()
  const caught = new Set<Num>()
  let dark = appearanceDark(appearance, systemQuery.matches)
  let modeTarget = dark ? 0 : 1
  const ground = { x: modeTarget, v: 0 }
  const ink = { x: dark ? 0 : 1, v: 0 }
  // The title morphs its letters toward these shares itself (site-title.ts), a letter at a time.
  const faceTargets = (values: Values) => {
    const base = THEMES[THEME_IDS.indexOf(values.theme)]!.font
    const selected = values.face === "theme" ? base : values.face
    return Object.fromEntries(FACES.map((f) => [f, f === selected ? 1 : 0])) as Record<
      FontKey,
      number
    >
  }
  let wantedFaces = faceTargets(store.get())
  let fade: { from: Look; k: number } | null = null

  const keysOf = (patch: Partial<Values>): Num[] =>
    Object.keys(patch).flatMap((k) =>
      k === "accent" ? (["aL", "aA", "aB"] as Num[]) : NUMS.includes(k as never) ? [k as Num] : [],
    )

  function drive(patch: Partial<Values>, values: Values, meta: ChangeMeta) {
    // A drag or a pan across a row is the hand: that row follows it 1:1.
    const byHand =
      meta.source === "local" && (root.hasAttribute("data-knobs-scrub") || meta.coalesce === true)
    targets = targetsOf(values)
    wantedThemes = themeTargets(values)
    modeTarget = appearanceDark(appearance, systemQuery.matches) ? 0 : 1
    for (const k of keysOf(patch)) {
      if (byHand) {
        if (!hand.has(k)) caught.delete(k)
        hand.add(k)
      } else hand.delete(k)
    }
    wantedFaces = faceTargets(values)
    if (!byHand && reducedQuery.matches) {
      fade = { from: current, k: 0 }
      ground.x = modeTarget
      ground.v = 0
      ink.x = modeTarget
      ink.v = 0
      themes.forEach((s, i) => {
        s.x = wantedThemes[i]!
        s.v = 0
      })
      for (const k of Object.keys(springs) as Num[]) {
        springs[k].x = targets[k]
        springs[k].v = 0
      }
    }
    wake()
  }

  // ── Resolving the look: the theme at its point, the face, then the settings ──
  const settings = (): Settings => {
    const n = (k: Num) => springs[k].x
    return {
      accent: [n("aL"), n("aA"), n("aB")],
      contrast: n("contrast"),
      grain: n("grain"),
      titleSize: n("size") / 100,
      weight: n("weight"),
      body: n("body"),
      tracking: n("tracking"),
      corners: n("corners"),
      surface: n("surface"),
      density: n("density") / 100,
      width: n("width"),
    }
  }
  const resolve = (light: number, groundLight = ground.x): Look => {
    const base = appearanceLook(
      themes.map((s) => s.x),
      groundLight,
      light,
    )
    return dress({ ...base, fonts: wantedFaces }, settings(), light)
  }
  let current = resolve(ink.x)

  // ── Writing a look: custom properties on the root, only those that changed ──
  const written = new Map<string, string>()
  const vars = (look: Look, modeDark = dark) => {
    const c = look.colors
    const n = look.num
    const col = (k: string) => css(c[k] as Rgba)
    const px = (x: number) => `${x.toFixed(2)}px`
    const s = n.shadow!
    const K = n.shadowK!
    // A flat theme (Void) trades the drop shadow for a hairline around the panel.
    const hair = n.hair!
    const a = (x: number) => Math.min(1, x * K * (1 - hair)).toFixed(3)
    const out: Record<string, string> = {
      "color-scheme": modeDark ? "dark" : "light",
      "--page": col("page"),
      "--card": col("card"),
      "--night": col("night"),
      "--surface": col("surface"),
      "--surface-hi": col("surfaceHi"),
      "--line": col("line"),
      "--text": col("text"),
      "--label": col("label"),
      "--dim": col("dim"),
      "--faint": col("faint"),
      "--accent": col("accent"),
      "--pill": col("pill"),
      "--warm": col("warm"),
      "--cool": col("cool"),
      "--kicker": col("kicker"),
      "--lift": `0 1px 2px ${col("liftA")},0 0 0 .5px ${col("liftB")}`,
      "--k-bg": col("kBg"),
      "--k-bg-page": col("kPage"),
      "--k-fill": col("kSurface"),
      "--k-fill-selected": col("kSurfaceHi"),
      "--k-border": col("kLine"),
      "--k-border-strong": col("kLineHi"),
      "--k-fg": col("kText"),
      "--k-fg-2": col("kLabel"),
      "--k-fg-3": col("kDim"),
      "--k-accent": col("kAccent"),
      "--k-modified": col("kModified"),
      "--k-segmented-track": col("kSegBg"),
      "--k-segmented-active": col("kSegActive"),
      "--k-toggle-track": col("kToggleTrack"),
      "--k-toggle-thumb": col("kToggleThumb"),
      "--k-rim": col("kRim"),
      "--k-border-subtle": col("kEdge"),
      "--k-toggle-thumb-off": col("kThumb"),
      "--k-group-label": col("kGroupInk"),
      "--k-radius": px(n.kRadius!),
      "--k-radius-panel": px(n.kPanelRadius!),
      "--k-round": px(roundPx(n.kRound!)),
      "--k-glass": n.kGlass!.toFixed(3),
      "--k-glow": n.kGlow!.toFixed(3),
      "--k-glass-tone": n.kGlassTone!.toFixed(3),
      "--k-lift": n.lift!.toFixed(3),
      // The DOM's shadow and the GPU's strength, dark (0) to light (1), × the surface's.
      "--k-shadow-overlay": `0 0 0 ${hair.toFixed(3)}px ${col("kLineHi")},0 ${lerp(12, 10, s).toFixed(2)}px ${lerp(36, 32, s).toFixed(2)}px rgba(0,0,0,${a(lerp(0.52, 0.14, s))}),0 1px ${lerp(2, 3, s).toFixed(2)}px rgba(0,0,0,${a(lerp(0.3, 0.08, s))})`,
      "--k-shadow-strength": a(lerp(0.48, 0.16, s)),
      "--r-stage": px(n.rStage!),
      "--r-ctl": px(n.rCtl!),
      "--density": n.density!.toFixed(4),
      "--rule": px(n.rule!),
      "--h-weight": n.hWeight!.toFixed(1),
      "--h-track": `${n.hTrack!.toFixed(4)}em`,
      "--h-size": n.hSize!.toFixed(4),
      "--cat-track": `${n.catTrack!.toFixed(4)}em`,
      "--t-size": n.tSize!.toFixed(4),
      "--t-weight": n.tWeight!.toFixed(1),
      "--t-track": `${n.tTrack!.toFixed(4)}em`,
      "--t-align": n.tAlign!.toFixed(4),
      "--t-glow": n.tGlow!.toFixed(4),
      "--body": px(n.body!),
      "--bs": n.bodyScale!.toFixed(4),
      "--body-track": `${n.bodyTrack!.toFixed(4)}em`,
      "--page-w": px(n.pageW!),
      "--grain": n.grain!.toFixed(3),
      "--raise": n.raise!.toFixed(3),
      "--flat": n.flat!.toFixed(3),
    }
    return out
  }
  let frameNo = 0
  const write = (out: Record<string, string>) => {
    for (const [k, v] of Object.entries(out)) {
      if (written.get(k) === v) continue
      written.set(k, v)
      root.style.setProperty(k, v)
    }
  }
  const apply = (look: Look, dt = 0, glide = GLIDE) => {
    write(vars(look))
    const titleMoving = drawTitle(look, dt, glide)
    // Scenes that colour their stage from the page follow along.
    const c = look.colors
    document.dispatchEvent(
      new CustomEvent("site-look", { detail: { page: c.page, surface: c.surface, text: c.text } }),
    )
    // Readouts drawn on canvases take the new colours, every few frames while it moves.
    if (frameNo++ % 6 === 0) restyleReadouts()
    return titleMoving
  }
  const restyleReadouts = () => {
    for (const el of document.querySelectorAll(".knobs-rd-spark,.knobs-rd-graph,.knobs-rd-meter"))
      el.dispatchEvent(new Event("knobs-restyle"))
  }

  // ── The loop: one rAF, asleep at rest ──
  let raf = 0
  let then = 0
  const wake = () => {
    if (raf) return
    root.toggleAttribute("data-site-moving", true)
    then = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const frame = (now: number) => {
    const dt = Math.min(1 / 30, Math.max(0, (now - then) / 1000))
    then = now
    const glide = GLIDE / store.get().speed
    let settled = !fade
    for (const k of Object.keys(springs) as Num[]) {
      const s = springs[k]
      const to = targets[k]
      if (hand.has(k)) {
        // 1:1 once caught up; until then (a glide was under way) it catches up on an instant spring.
        if (caught.has(k) || Math.abs(s.x - to) < EPS[k]) {
          caught.add(k)
          s.x = to
          s.v = 0
        } else stepSpring(s, to, CATCH, dt)
      } else if (!fade) stepSpring(s, to, glide, dt)
      if (Math.abs(s.x - to) < EPS[k] * 0.01 && Math.abs(s.v) < EPS[k] * 0.1) {
        s.x = to
        s.v = 0
      } else settled = false
    }
    for (const [i, s] of themes.entries()) {
      const to = wantedThemes[i]!
      stepSpring(s, to, glide, dt)
      if (Math.abs(s.x - to) < 1e-5 && Math.abs(s.v) < 1e-4) {
        s.x = to
        s.v = 0
      } else settled = false
    }
    stepSpring(ground, modeTarget, GLIDE / store.get().speed, dt)
    if (Math.abs(ground.x - modeTarget) < 1e-4 && Math.abs(ground.v) < 1e-3) {
      ground.x = modeTarget
      ground.v = 0
    } else settled = false
    const nextDark = ground.x < (dark ? 0.53 : 0.47)
    if (nextDark !== dark) {
      dark = nextDark
      options.onPolarity(dark)
    }
    const inkTarget = dark ? 0 : 1
    stepSpring(ink, inkTarget, reducedQuery.matches ? FADE : FLIP, dt)
    if (Math.abs(ink.x - inkTarget) < 1e-3 && Math.abs(ink.v) < 1e-2) {
      ink.x = inkTarget
      ink.v = 0
    } else settled = false
    let look = resolve(Math.min(1, Math.max(0, ink.x)))
    if (fade) {
      fade.k = Math.min(1, fade.k + dt / FADE)
      const k = fade.k
      look = mixLooks(fade.from, look, k * k * (3 - 2 * k))
      if (k >= 1) fade = null
      settled = false
    }
    current = look
    if (apply(look, dt, glide)) settled = false
    if (!settled) {
      raf = requestAnimationFrame(frame)
      return
    }
    raf = 0
    root.removeAttribute("data-site-moving")
    restyleReadouts()
    keep()
  }
  const keep = () => {
    const text = [...written].map(([k, v]) => `${k}:${v}`).join(";")
    try {
      const svg = options.title.querySelector<SVGSVGElement>("svg")!
      const title = {
        version: 2,
        advance: Number(svg.style.getPropertyValue("--title-advance")),
        viewBox: svg.getAttribute("viewBox"),
        paths: [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d")),
      }
      const snapshot = (isDark: boolean) => {
        const light = isDark ? 0 : 1
        const tokens = vars(resolve(light, light), isDark)
        return Object.entries(tokens)
          .map(([k, v]) => `${k}:${v}`)
          .join(";")
      }
      localStorage.setItem(
        KEY,
        JSON.stringify({
          css: text,
          dark,
          title,
          modes: { dark: snapshot(true), light: snapshot(false) },
        }),
      )
    } catch {}
  }

  // ── First paint: the resting look, at once ──
  // A look kept under the old token names (before the design system) would shadow the new ones.
  const names = vars(current)
  for (const name of [...root.style])
    if (name.startsWith("--k-") && !(name in names)) root.style.removeProperty(name)
  root.dataset.siteLook = ""
  if ((root.dataset.theme === "light") === dark) options.onPolarity(dark)
  apply(current)
  keep()

  mountPanel(store, options.slot, {
    ...options.panel,
    title: "This page",
    header: { buttons: ["undo", "redo", "reset", "random"] },
  })
  // Mounted, the panel holds its own place; its height is kept for the next first paint.
  options.slot.dataset.mounted = ""
  new ResizeObserver(() => {
    const h = Math.round(options.slot.getBoundingClientRect().height)
    try {
      if (h > 0) localStorage.setItem("knobs-site-knob-h", String(h))
    } catch {}
  }).observe(options.slot)
  booting = false
  options.onAppearance?.(appearance)
  // A fixed Light/Dark preference ignores OS changes. System follows them live.
  systemQuery.addEventListener("change", () => {
    if (appearance === "system") drive({}, store.get(), { source: "remote" })
  })
  window.addEventListener("storage", (event) => {
    if (event.key !== APPEARANCE_KEY) return
    appearance = appearanceOf(event.newValue)
    store.sync({ appearance })
    options.onAppearance?.(appearance)
    drive({}, store.get(), { source: "remote" })
  })

  return {
    toggle() {
      store.set({ appearance: nextAppearance(appearance) })
    },
    setAppearance(value) {
      store.set({ appearance: value })
    },
    get appearance() {
      return appearance
    },
    jump(x) {
      booting = true
      store.sync({ theme: themeAt(x) })
      booting = false
      targets = targetsOf(store.get())
      wantedThemes = themeTargets(store.get())
      themes.forEach((s, i) => {
        s.x = wantedThemes[i]!
        s.v = 0
      })
      wantedFaces = faceTargets(store.get())
      hand.clear()
      fade = null
      wake()
    },
    get dark() {
      return dark
    },
    store,
  }
}
