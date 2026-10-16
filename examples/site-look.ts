// The site look: one knob in the header sweeps the whole page through its themes (Night, Ocean,
// Synth, Brutal, Paper; site-look-themes.ts). Every position is a look of its own, blended by
// site-look-math.ts, and one rAF loop writes it to the root as custom properties, which the page
// (site-look.css), every knobs panel in both renderers, the title's faces and the Swarm read. The
// loop sleeps at rest. Under the hand the look follows 1:1; presets, keys, Random, undo and the
// top bar's light/dark toggle glide on a duration spring with no bounce, and with reduced motion
// fade straight there instead. The knob's value persists with the store; the look it resolved to
// is kept too, so the next load paints it before any script (controls.html).
import { type ChangeMeta, defineControls, knob, type MountPanelOptions } from "knobs"
import { mountPanel } from "knobs/panel"
import { type HeroSwarm, SCHEMES, type Scheme, type SchemeName } from "./hero-swarm"
import {
  css,
  darkAt,
  faceWipe,
  type Look,
  lerp,
  lookAt,
  mixColors,
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
/** Glides (presets, keys, Random, the toggle), s, bounce 0. */
const GLIDE = 0.6
/** The hand catching the look up when it takes over mid-glide: Kit's "instant". */
const CATCH = 0.1
/** The inks crossing from light to dark: Kit's "snappy". */
const FLIP = 0.25
/** Reduced motion: every change a short fade. */
const FADE = 0.18
const FACES = ["sans", "serif", "mono", "wide"] as const

export interface SiteLookOptions {
  /** Where the knob's panel goes. */
  readonly slot: HTMLElement
  /** The title's faces (`[data-font]` layers), crossfaded. */
  readonly title?: HTMLElement | null
  readonly panel: MountPanelOptions
  readonly swarm?: HeroSwarm | null
  /** Light or dark changed (the page's own `data-theme`, restyles, scenes). */
  readonly onPolarity: (dark: boolean) => void
}

export interface SiteLook {
  /** Glides to the nearest theme of the other polarity. */
  toggle(): void
  /** Goes to `x` at once, outside the undo history (for scripts). */
  jump(x: number): void
  readonly dark: boolean
  readonly store: { get(): { look: number } }
}

const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")

export function mountSiteLook(options: SiteLookOptions): SiteLook {
  const root = document.documentElement
  const last = THEMES.length - 1
  const presets: Record<string, { look: number }> = {}
  THEMES.forEach((t, i) => {
    if (i > 0) presets[t.name] = { look: i }
  })
  let booting = true
  const store = defineControls(
    "site-look",
    {
      look: knob(0, { min: 0, max: last, step: 0.01, decimals: 2, label: "Look" }),
    },
    {
      enabled: true,
      defaultLabel: THEMES[0]!.name,
      presets,
      onChange(_patch, values, meta) {
        if (!booting) drive(values.look, meta)
      },
    },
  )

  // ── State: the position (a spring toward the knob), the inks' polarity, a fade ──
  let at = store.get().look
  // A first visit asking for light (?theme=light) starts at the nearest light theme.
  if (at === 0 && root.dataset.theme === "light" && !localStorage.getItem(KEY)) {
    at = nearestTheme(THEMES, 0, false)
    store.sync({ look: at })
  }
  const pos = { x: at, v: 0 }
  let target = at
  let hand = false
  let caught = false
  let dark = darkAt(THEMES, at)
  const ink = { x: dark ? 0 : 1, v: 0 }
  let fade: { from: Look; k: number } | null = null
  let current = lookAt(THEMES, at, ink.x)

  function drive(value: number, meta: ChangeMeta) {
    // A drag or a pan across the slider is the hand: everything follows it 1:1.
    const byHand =
      meta.source === "local" && (root.hasAttribute("data-knobs-scrub") || meta.coalesce === true)
    target = value
    if (byHand) {
      if (!hand) caught = false
      hand = true
    } else {
      hand = false
      if (reducedQuery.matches) {
        fade = { from: current, k: 0 }
        pos.x = value
        pos.v = 0
      }
    }
    wake()
  }

  // ── Writing a look: custom properties on the root, only those that changed ──
  const written = new Map<string, string>()
  const vars = (look: Look) => {
    const c = look.colors
    const n = look.num
    const col = (k: string) => css(c[k] as Rgba)
    const px = (x: number) => `${x.toFixed(2)}px`
    const s = n.shadow!
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
      // The DOM's shadow and the GPU's strength, dark (0) to light (1) together.
      "--k-shadow": `0 ${lerp(12, 10, s).toFixed(2)}px ${lerp(36, 32, s).toFixed(2)}px rgba(0,0,0,${lerp(0.52, 0.14, s).toFixed(3)}),0 1px ${lerp(2, 3, s).toFixed(2)}px rgba(0,0,0,${lerp(0.3, 0.08, s).toFixed(3)})`,
      "--k-shadow-strength": lerp(0.48, 0.16, s).toFixed(3),
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
      "--plate": px(n.plate!),
      "--plate-r": px(n.plateR!),
    }
    for (const f of FACES) out[`--f-${f}`] = (look.fonts[f] ?? 0).toFixed(4)
    return out
  }
  const faces = options.title
    ? FACES.map((f) => options.title!.querySelector<HTMLElement>(`[data-font="${f}"]`))
    : []
  let lastPaint = ""
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
    paintSwarm(look)
    // Scenes that colour their stage from the page follow along.
    const c = look.colors
    document.dispatchEvent(
      new CustomEvent("site-look", { detail: { page: c.page, surface: c.surface, text: c.text } }),
    )
    // Readouts drawn on canvases take the new colours, every few frames while it moves.
    if (frameNo++ % 6 === 0) restyleReadouts()
  }
  /** The look's name, or the two it's between and how far. */
  const caption = () => {
    const { i, u } = segment(THEMES.length, pos.x)
    const a = THEMES[i]!.name
    const b = THEMES[i + 1]!.name
    if (u < 0.005) return a
    if (u > 0.995) return b
    return `${a} ${Math.round((1 - u) * 100)} · ${b} ${Math.round(u * 100)}`
  }
  /**
   * Two faces meet as a soft line sweeping across the title, left to right as the knob turns up:
   * both whole, each masked to its side, so any position reads as a deliberate split. Their masks
   * are complementary and they add (plus-lighter), so the seam is as solid as either face. With a
   * fade (reduced motion) they just crossfade. Kept as root properties, like the rest, so the next
   * first paint has them.
   */
  const wipeVars = () => {
    const out: Record<string, string> = {}
    for (const f of FACES) out[`--m-${f}`] = "none"
    const wipe = fade ? null : faceWipe(THEMES, pos.x)
    const from = wipe && faces[FACES.indexOf(wipe.from)]
    const to = wipe && faces[FACES.indexOf(wipe.to)]
    if (!wipe || !from || !to) return out
    const a = from.getBoundingClientRect()
    const b = to.getBoundingClientRect()
    const left = Math.min(a.left, b.left)
    const right = Math.max(a.right, b.right)
    const soft = (right - left) * 0.06
    const seam = left - soft + (right - left + 2 * soft) * wipe.at
    const mask = (r: DOMRect, near: string, far: string) =>
      `linear-gradient(90deg,${near} ${(seam - r.left - soft).toFixed(1)}px,${far} ${(seam - r.left + soft).toFixed(1)}px)`
    out[`--m-${wipe.to}`] = mask(b, "#000", "transparent")
    out[`--m-${wipe.from}`] = mask(a, "transparent", "#000")
    out[`--f-${wipe.to}`] = out[`--f-${wipe.from}`] = "1"
    return out
  }
  const restyleReadouts = () => {
    for (const el of document.querySelectorAll(".knobs-rd-spark,.knobs-rd-graph,.knobs-rd-meter"))
      el.dispatchEvent(new Event("knobs-restyle"))
  }
  const paintSwarm = (look: Look) => {
    const swarm = options.swarm
    if (!swarm) return
    const names = Object.keys(look.schemes).filter((k) => look.schemes[k]! > 0) as SchemeName[]
    const weights = names.map((k) => look.schemes[k]!)
    const night = look.colors.night as Rgba
    const key = `${names.join()}${weights.map((w) => w.toFixed(4)).join()}${css(night)}`
    if (key === lastPaint) return
    lastPaint = key
    const blend = (pick: (s: Scheme) => readonly number[]) => {
      const c = mixColors(
        names.map((k) => {
          const [r, g, b] = pick(SCHEMES[k])
          return [r!, g!, b!, 1] as Rgba
        }),
        weights,
      )
      return [c[0], c[1], c[2]]
    }
    const num = (pick: (s: Scheme) => number) =>
      names.reduce((sum, k, i) => sum + pick(SCHEMES[k]) * weights[i]!, 0) /
      weights.reduce((a, b) => a + b, 0)
    const scheme: Scheme = {
      frame: blend((s) => s.frame),
      calm: blend((s) => s.calm),
      fast: blend((s) => s.fast),
      alert: blend((s) => s.alert),
      lattice: blend((s) => s.lattice),
      gain: num((s) => s.gain),
      bloom: num((s) => s.bloom),
      heat: num((s) => s.heat ?? 0),
    }
    const lead = names[weights.indexOf(Math.max(...weights))]!
    swarm.paint(scheme, night.slice(0, 3), lead)
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
    if (hand) {
      // 1:1 once caught up; until then (a glide was under way) it catches up on an instant spring.
      if (caught || Math.abs(pos.x - target) < 0.012) {
        caught = true
        pos.x = target
        pos.v = 0
      } else stepSpring(pos, target, CATCH, dt)
    } else if (!fade) stepSpring(pos, target, GLIDE, dt)
    const nextDark = darkAt(THEMES, pos.x, dark)
    if (nextDark !== dark) {
      dark = nextDark
      options.onPolarity(dark)
    }
    stepSpring(ink, dark ? 0 : 1, reducedQuery.matches ? FADE : FLIP, dt)
    let look = lookAt(THEMES, pos.x, Math.min(1, Math.max(0, ink.x)))
    if (fade) {
      fade.k = Math.min(1, fade.k + dt / FADE)
      const k = fade.k
      look = mixLooks(fade.from, look, k * k * (3 - 2 * k))
      if (k >= 1) fade = null
    }
    const inkTarget = dark ? 0 : 1
    const settled =
      !fade &&
      Math.abs(pos.x - target) < 1e-4 &&
      Math.abs(pos.v) < 1e-3 &&
      Math.abs(ink.x - inkTarget) < 1e-3 &&
      Math.abs(ink.v) < 1e-2
    if (settled) {
      pos.x = target
      pos.v = 0
      ink.x = inkTarget
      ink.v = 0
      look = lookAt(THEMES, pos.x, ink.x)
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
    title: "Look",
    header: { buttons: ["undo", "redo", "reset", "random"] },
  })
  booting = false

  return {
    toggle() {
      const i = nearestTheme(THEMES, pos.x, !dark)
      if (i >= 0) store.preset(i === 0 ? "default" : THEMES[i]!.name)
    },
    jump(x) {
      booting = true
      store.sync({ look: x })
      booting = false
      target = pos.x = x
      pos.v = 0
      hand = false
      fade = null
      wake()
    },
    get dark() {
      return dark
    },
    store,
  }
}
