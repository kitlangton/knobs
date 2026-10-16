// The site's settings: one panel in the header runs the whole page. Its lead row sweeps the
// themes (Night, Ocean, Synth, Brutal, Paper; site-look-themes.ts), blended by site-look-math.ts;
// the rest dress that look (site-dress.ts): accent, contrast, grain and speed; the title's face,
// size and weight, the body's size and tracking; corners and surface; density and width. One rAF
// loop springs every setting toward the store's value and writes the result to the root as custom
// properties, which the page (site-look.css), every knobs panel in both renderers and the title's
// faces read; it sleeps at rest. Under the hand a row follows 1:1; presets, keys, Random, undo and
// the top bar's light/dark toggle glide on a duration spring with no bounce (Speed scales it), and
// with reduced motion fade straight there instead. The values persist with the store; the look
// they resolve to is kept too, so the next load paints it before any script (controls.html).
import { type ChangeMeta, choice, color, defineControls, knob, type MountPanelOptions } from "knobs"
import { mountPanel } from "knobs/panel"
import { dress, labOf, type Settings } from "./site-dress"
import {
  css,
  darkAt,
  type FontKey,
  faceWipe,
  type Look,
  lerp,
  lookAt,
  mixLooks,
  nearestTheme,
  type Rgba,
  roundPx,
  segment,
  stepSpring,
} from "./site-look-math"
import { THEMES } from "./site-look-themes"

/** Where the resolved look is kept for the next first paint (read by controls.html). */
const KEY = "knobs-site-look"
/** Glides (presets, keys, Random, the toggle), s at Speed 1, bounce 0. */
const GLIDE = 0.6
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
type Face = (typeof FACE_OPTIONS)[number]

const last = THEMES.length - 1
const schema = {
  theme: knob(0, { min: 0, max: last, step: 0.01, decimals: 2, label: "Theme" }),
  accent: color("#ffffff", { label: "Accent", tab: "look" }),
  contrast: knob(0, { min: -0.5, max: 1, step: 0.01, decimals: 2, label: "Contrast", tab: "look" }),
  grain: knob(0, { min: 0, max: 1, step: 0.01, decimals: 2, label: "Grain", tab: "look" }),
  speed: knob(1, {
    min: 0.5,
    max: 2,
    step: 0.05,
    decimals: 2,
    unit: "×",
    label: "Speed",
    tab: "look",
  }),
  face: choice("theme", FACE_OPTIONS, {
    label: "Face",
    tab: "type",
    display: "segmented",
    labels: { theme: "Theme", sans: "Sans", serif: "Serif", mono: "Mono", wide: "Wide" },
  }),
  size: knob(100, { min: 70, max: 130, step: 1, unit: "%", label: "Size", tab: "type" }),
  weight: knob(0, { min: -300, max: 300, step: 10, label: "Weight", tab: "type" }),
  body: knob(13, {
    min: 12,
    max: 16,
    step: 0.5,
    decimals: 1,
    unit: "px",
    label: "Body",
    tab: "type",
  }),
  tracking: knob(0, { min: -1, max: 1, step: 0.01, decimals: 2, label: "Tracking", tab: "type" }),
  corners: knob(0, { min: -1, max: 1, step: 0.01, decimals: 2, label: "Corners", tab: "shape" }),
  surface: knob(1, { min: 0, max: 2, step: 0.01, decimals: 2, label: "Surface", tab: "shape" }),
  density: knob(100, { min: 80, max: 130, step: 1, unit: "%", label: "Density", tab: "space" }),
  width: knob(1180, { min: 960, max: 1440, step: 10, unit: "px", label: "Width", tab: "space" }),
}
type Values = { [K in keyof typeof schema]: (typeof schema)[K]["value"] }

/** Complete looks: a theme and everything over it. Night is the defaults, the page as it was. */
const PRESETS: Record<string, Partial<Values>> = {
  Editorial: {
    theme: 1,
    accent: "#e9b75c",
    contrast: 0.2,
    grain: 0.35,
    speed: 0.8,
    face: "serif",
    size: 112,
    weight: -100,
    body: 14,
    tracking: -0.3,
    corners: -0.7,
    surface: 0,
    density: 118,
    width: 1080,
  },
  Synth: {
    theme: 2,
    accent: "#ff4fc4",
    contrast: 0.1,
    grain: 0.2,
    speed: 1.25,
    face: "theme",
    size: 100,
    weight: 40,
    tracking: 0.2,
    corners: -0.2,
    surface: 1.3,
    density: 96,
    width: 1280,
  },
  Brutal: {
    theme: 3,
    accent: "#ff3b00",
    contrast: 0.6,
    speed: 1.6,
    face: "mono",
    size: 110,
    weight: 100,
    tracking: -0.4,
    corners: -1,
    surface: 0,
    density: 86,
    width: 1440,
  },
  Paper: {
    theme: 4,
    accent: "#a8331f",
    grain: 0.55,
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
  "theme",
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
  theme: 0.012,
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
  /** The title's faces (`[data-font]` layers), crossfaded. */
  readonly title?: HTMLElement | null
  readonly panel: MountPanelOptions
  /** Light or dark changed (the page's own `data-theme`, restyles, scenes). */
  readonly onPolarity: (dark: boolean) => void
}

export interface SiteLook {
  /** Glides the theme to the nearest one of the other polarity. */
  toggle(): void
  /** Puts the theme at `x` at once, outside the undo history (for scripts). */
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
  let booting = true
  const store = defineControls("site", schema, {
    enabled: true,
    defaultLabel: THEMES[0]!.name,
    presets: PRESETS,
    onChange(patch, values, meta) {
      if (!booting) drive(patch as Partial<Values>, values as Values, meta)
    },
  })

  // ── State: each number a spring toward the store, the inks' polarity, the face, a fade ──
  const values0 = store.get()
  // A first visit asking for light (?theme=light) starts at the nearest light theme.
  if (values0.theme === 0 && root.dataset.theme === "light" && !localStorage.getItem(KEY))
    store.sync({ theme: nearestTheme(THEMES, 0, false) })
  let targets = targetsOf(store.get())
  const springs = Object.fromEntries(
    Object.entries(targets).map(([k, x]) => [k, { x, v: 0 }]),
  ) as Record<Num, { x: number; v: number }>
  /** Rows under the hand, and those it has caught up with. */
  const hand = new Set<Num>()
  const caught = new Set<Num>()
  let dark = darkAt(THEMES, targets.theme)
  const ink = { x: dark ? 0 : 1, v: 0 }
  /** The title's face: from one to the other on a spring (k, 0–1). */
  let face = { from: store.get().face as Face, to: store.get().face as Face, k: { x: 1, v: 0 } }
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
    for (const k of keysOf(patch)) {
      if (byHand) {
        if (!hand.has(k)) caught.delete(k)
        hand.add(k)
      } else hand.delete(k)
    }
    if ("face" in patch && values.face !== face.to) {
      if (values.face === face.from) {
        // Back where it came from: the same seam, reversed.
        face = { from: face.to, to: face.from, k: { x: 1 - face.k.x, v: -face.k.v } }
      } else {
        face = {
          from: face.k.x < 0.5 ? face.from : face.to,
          to: values.face as Face,
          k: { x: 0, v: 0 },
        }
      }
    }
    if (!byHand && reducedQuery.matches) {
      fade = { from: current, k: 0 }
      for (const k of Object.keys(springs) as Num[]) {
        springs[k].x = targets[k]
        springs[k].v = 0
      }
      face.k = { x: 1, v: 0 }
    }
    // Random lands on a theme, not between two: every roll is a look someone would pick.
    if (meta.source === "randomize") {
      const t = Math.round(values.theme)
      if (t !== values.theme) queueMicrotask(() => store.sync({ theme: t }))
    }
    wake()
  }

  // ── Resolving the look: the theme at its point, the face, then the settings ──
  const onehot = (f: FontKey): Record<string, number> => ({ [f]: 1 })
  const facesOf = (spec: Face, base: Look) => (spec === "theme" ? base.fonts : onehot(spec))
  const dominant = (w: Readonly<Record<string, number>>) =>
    Object.entries(w).reduce((a, b) => (b[1] > a[1] ? b : a), ["sans", -1] as [
      string,
      number,
    ])[0] as FontKey
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
  const resolve = (light: number): Look => {
    const base = lookAt(THEMES, springs.theme.x, light)
    const a = facesOf(face.from, base)
    const b = facesOf(face.to, base)
    const k = Math.min(1, Math.max(0, face.k.x))
    const fonts: Record<string, number> = {}
    for (const f of FACES) {
      const w = lerp(a[f] ?? 0, b[f] ?? 0, k)
      if (w > 0) fonts[f] = w
    }
    return dress({ ...base, fonts }, settings(), light)
  }
  let current = resolve(ink.x)

  // ── Writing a look: custom properties on the root, only those that changed ──
  const written = new Map<string, string>()
  const vars = (look: Look) => {
    const c = look.colors
    const n = look.num
    const col = (k: string) => css(c[k] as Rgba)
    const px = (x: number) => `${x.toFixed(2)}px`
    const s = n.shadow!
    const K = n.shadowK!
    const a = (x: number) => Math.min(1, x * K).toFixed(3)
    const out: Record<string, string> = {
      "color-scheme": dark ? "dark" : "light",
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
      "--k-page": col("kPage"),
      "--k-surface": col("kSurface"),
      "--k-surface-hi": col("kSurfaceHi"),
      "--k-line": col("kLine"),
      "--k-line-hi": col("kLineHi"),
      "--k-text": col("kText"),
      "--k-label": col("kLabel"),
      "--k-dim": col("kDim"),
      "--k-accent": col("kAccent"),
      "--k-modified": col("kModified"),
      "--k-seg-bg": col("kSegBg"),
      "--k-seg-active": col("kSegActive"),
      "--k-toggle-track": col("kToggleTrack"),
      "--k-toggle-thumb": col("kToggleThumb"),
      "--k-rim": col("kRim"),
      "--k-edge": col("kEdge"),
      "--k-thumb": col("kThumb"),
      "--k-group-ink": col("kGroupInk"),
      "--k-radius": px(n.kRadius!),
      "--k-panel-radius": px(n.kPanelRadius!),
      "--k-round": px(roundPx(n.kRound!)),
      "--k-glass": n.kGlass!.toFixed(3),
      "--k-glow": n.kGlow!.toFixed(3),
      "--k-glass-tone": n.kGlassTone!.toFixed(3),
      "--k-lift": n.lift!.toFixed(3),
      // The DOM's shadow and the GPU's strength, dark (0) to light (1), × the surface's.
      "--k-shadow": `0 ${lerp(12, 10, s).toFixed(2)}px ${lerp(36, 32, s).toFixed(2)}px rgba(0,0,0,${a(lerp(0.52, 0.14, s))}),0 1px ${lerp(2, 3, s).toFixed(2)}px rgba(0,0,0,${a(lerp(0.3, 0.08, s))})`,
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
    for (const f of FACES) out[`--f-${f}`] = (look.fonts[f] ?? 0).toFixed(4)
    return out
  }
  const faces = options.title
    ? FACES.map((f) => options.title!.querySelector<HTMLElement>(`[data-font="${f}"]`))
    : []
  let frameNo = 0
  const write = (out: Record<string, string>) => {
    for (const [k, v] of Object.entries(out)) {
      if (written.get(k) === v) continue
      written.set(k, v)
      root.style.setProperty(k, v)
    }
  }
  const apply = (look: Look) => {
    write(vars(look))
    // The faces' seam is measured on the faces as the look just set them.
    write({ ...wipeVars(), "--look-name": JSON.stringify(caption()) })
    // Scenes that colour their stage from the page follow along.
    const c = look.colors
    document.dispatchEvent(
      new CustomEvent("site-look", { detail: { page: c.page, surface: c.surface, text: c.text } }),
    )
    // Readouts drawn on canvases take the new colours, every few frames while it moves.
    if (frameNo++ % 6 === 0) restyleReadouts()
  }
  /** The theme's name, or the two it's between and how far. */
  const caption = () => {
    const { i, u } = segment(THEMES.length, springs.theme.x)
    const a = THEMES[i]!.name
    const b = THEMES[i + 1]!.name
    if (u < 0.005) return a
    if (u > 0.995) return b
    return `${a} ${Math.round((1 - u) * 100)} · ${b} ${Math.round(u * 100)}`
  }
  /** Which two faces meet on the title, and where: a face being picked, else the theme's sweep. */
  const seam = (): { from: FontKey; to: FontKey; at: number } | null => {
    if (fade) return null
    if (face.k.x < 1 && face.from !== face.to) {
      const base = lookAt(THEMES, springs.theme.x, ink.x)
      const from = dominant(facesOf(face.from, base))
      const to = dominant(facesOf(face.to, base))
      const at = Math.min(1, Math.max(0, face.k.x))
      return from === to || at <= 0 || at >= 1 ? null : { from, to, at }
    }
    return face.to === "theme" ? faceWipe(THEMES, springs.theme.x) : null
  }
  /**
   * Two faces meet as a soft line sweeping across the title, left to right as the setting moves:
   * both whole, each masked to its side, so any position reads as a deliberate split. Their masks
   * are complementary and they add (plus-lighter), so the seam is as solid as either face. With a
   * fade (reduced motion) they just crossfade. Kept as root properties, like the rest, so the next
   * first paint has them.
   */
  const wipeVars = () => {
    const out: Record<string, string> = {}
    for (const f of FACES) out[`--m-${f}`] = "none"
    const wipe = seam()
    const from = wipe && faces[FACES.indexOf(wipe.from)]
    const to = wipe && faces[FACES.indexOf(wipe.to)]
    if (!wipe || !from || !to) return out
    const a = from.getBoundingClientRect()
    const b = to.getBoundingClientRect()
    const left = Math.min(a.left, b.left)
    const right = Math.max(a.right, b.right)
    const soft = (right - left) * 0.06
    const at = left - soft + (right - left + 2 * soft) * wipe.at
    const mask = (r: DOMRect, near: string, far: string) =>
      `linear-gradient(90deg,${near} ${(at - r.left - soft).toFixed(1)}px,${far} ${(at - r.left + soft).toFixed(1)}px)`
    out[`--m-${wipe.to}`] = mask(b, "#000", "transparent")
    out[`--m-${wipe.from}`] = mask(a, "transparent", "#000")
    for (const f of FACES) out[`--f-${f}`] = f === wipe.from || f === wipe.to ? "1" : "0"
    return out
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
    if (face.k.x < 1) {
      stepSpring(face.k, 1, glide, dt)
      if (1 - face.k.x < 1e-3 && Math.abs(face.k.v) < 1e-2) face.k = { x: 1, v: 0 }
      else settled = false
    }
    const nextDark = darkAt(THEMES, springs.theme.x, dark)
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
    apply(look)
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
      localStorage.setItem(KEY, JSON.stringify({ css: text, dark }))
    } catch {}
  }

  // ── First paint: the resting look, at once ──
  root.dataset.siteLook = ""
  if ((root.dataset.theme === "light") === dark) options.onPolarity(dark)
  apply(current)
  keep()
  // The seam is measured: a new width, or a face arriving, places it again.
  const remeasure = () => {
    if (!raf) write(wipeVars())
  }
  addEventListener("resize", remeasure)
  document.fonts?.addEventListener("loadingdone", remeasure)

  mountPanel(store, options.slot, {
    ...options.panel,
    title: "This page",
    tabs: [
      { id: "look", label: "Look" },
      { id: "type", label: "Type" },
      { id: "shape", label: "Shape" },
      { id: "space", label: "Space" },
    ],
    header: { buttons: ["undo", "redo", "reset", "random"] },
  })
  booting = false

  return {
    toggle() {
      const i = nearestTheme(THEMES, springs.theme.x, !dark)
      if (i >= 0) store.set({ theme: i })
    },
    jump(x) {
      booting = true
      store.sync({ theme: x })
      booting = false
      targets = targetsOf(store.get())
      springs.theme.x = targets.theme
      springs.theme.v = 0
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
