import {
  choice,
  defineControls,
  knob,
  spring,
  springCss,
  type ChangeMeta,
  type Controls,
  type Schema,
  type Values,
} from "knobs"
import { Knobs, useControls } from "knobs/react"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react"
import { copy, registerStore } from "./site"

// Every section of every page owns one of these stores. Its values become CSS custom properties
// on the section element, so tuning a section restyles that section and nothing else.
export const sectionSchema = {
  size: knob(1, {
    min: 0.7,
    max: 1.8,
    step: 0.01,
    unit: "×",
    label: "Heading size",
    group: "Type",
  }),
  tracking: knob(-0.02, {
    min: -0.06,
    max: 0.06,
    step: 0.002,
    unit: "em",
    label: "Tracking",
    group: "Type",
  }),
  weight: knob(640, { min: 300, max: 860, step: 20, label: "Weight", group: "Type" }),
  measure: knob(66, {
    min: 44,
    max: 96,
    step: 1,
    unit: "ch",
    label: "Line length",
    group: "Layout",
  }),
  space: knob(1, { min: 0.4, max: 2, step: 0.05, unit: "×", label: "Spacing", group: "Layout" }),
  code: choice("auto", ["auto", "midnight", "paper", "accent"], {
    label: "Code theme",
    group: "Code",
  }),
  entrance: spring({ duration: 0.7, bounce: 0.1 }, { label: "Entrance", group: "Motion" }),
  stagger: knob(60, { min: 0, max: 240, step: 5, unit: "ms", label: "Stagger", group: "Motion" }),
  rise: knob(14, { min: 0, max: 60, step: 1, unit: "px", label: "Rise", group: "Motion" }),
  blur: knob(4, { min: 0, max: 16, step: 0.5, unit: "px", label: "Blur", group: "Motion" }),
} satisfies Schema

type SectionValues = Values<typeof sectionSchema>

const sectionPresets = {
  display: { size: 1.45, tracking: -0.035, weight: 720, space: 1.25 },
  quiet: { size: 0.85, tracking: 0, weight: 520, measure: 60, space: 0.8 },
  lively: { entrance: { duration: 0.6, bounce: 0.45 }, stagger: 110, rise: 34, blur: 0 },
  still: { stagger: 0, rise: 0, blur: 0 },
} satisfies Record<string, Partial<SectionValues>>

const codeThemes: Record<Exclude<SectionValues["code"], "auto">, Record<string, string>> = {
  midnight: {
    "--code-bg": "#0d1017",
    "--code-fg": "#d6deeb",
    "--code-line": "rgba(255,255,255,.08)",
    "--tok-comment": "#637777",
    "--tok-string": "#ecc48d",
    "--tok-keyword": "#c792ea",
    "--tok-number": "#f78c6c",
    "--tok-type": "#ffcb8b",
    "--tok-fn": "#82aaff",
    "--tok-prop": "#7fdbca",
    "--tok-tag": "#7fdbca",
    "--tok-punct": "#7f8ea3",
  },
  paper: {
    "--code-bg": "#fbf8f1",
    "--code-fg": "#3b3a36",
    "--code-line": "rgba(0,0,0,.08)",
    "--tok-comment": "#9a968a",
    "--tok-string": "#4f7a28",
    "--tok-keyword": "#a8326e",
    "--tok-number": "#b05a12",
    "--tok-type": "#8a5a00",
    "--tok-fn": "#2c5ea8",
    "--tok-prop": "#1d6f72",
    "--tok-tag": "#1d6f72",
    "--tok-punct": "#8c887c",
  },
  accent: {
    "--code-bg": "color-mix(in oklch, var(--accent) 14%, var(--bg))",
    "--code-fg": "var(--fg)",
    "--code-line": "color-mix(in oklch, var(--accent) 22%, transparent)",
    "--tok-comment": "color-mix(in oklch, var(--fg) 45%, transparent)",
    "--tok-string": "color-mix(in oklch, var(--accent-text) 70%, var(--fg))",
    "--tok-keyword": "var(--accent-text)",
    "--tok-number": "var(--accent-text)",
    "--tok-type": "var(--fg)",
    "--tok-fn": "color-mix(in oklch, var(--accent-text) 55%, var(--fg))",
    "--tok-prop": "var(--fg-2)",
    "--tok-tag": "var(--accent-text)",
    "--tok-punct": "var(--fg-3)",
  },
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

/** The custom properties a section's values produce, shared by the live style and Copy CSS. */
export function sectionTokens(v: SectionValues): Record<string, string> {
  const enter = springCss(v.entrance)
  return {
    "--s-size": fmt(v.size),
    "--s-tracking": `${fmt(v.tracking)}em`,
    "--s-weight": String(v.weight),
    "--s-measure": `${v.measure}ch`,
    "--s-space": fmt(v.space),
    "--s-ease": enter.easing,
    "--s-dur": `${enter.duration}ms`,
    "--s-stagger": `${v.stagger}ms`,
    "--s-rise": `${v.rise}px`,
    "--s-blur": `${v.blur}px`,
    ...(v.code === "auto" ? {} : codeThemes[v.code]),
  }
}

type SectionControls<E extends Schema> = Controls<typeof sectionSchema & E>
const registry = new Map<string, SectionControls<Schema>>()
const replays = new Map<string, () => void>()
const tokenMaps = new Map<string, (v: SectionValues) => Record<string, string>>()
const motionKeys = new Set(["entrance", "stagger", "rise", "blur"])

/**
 * The store for one section, created on first use and kept for the session. `extra` adds the
 * section's own illustration knobs beneath the shared typography, layout, code and motion ones,
 * and `tokens` turns their values into more custom properties on the section.
 */
export function sectionControls<E extends Schema = {}>(
  id: string,
  extra?: E,
  options: {
    presets?: Record<string, Partial<Values<typeof sectionSchema & E>>>
    tokens?: (values: Values<E>) => Record<string, string>
  } = {},
): SectionControls<E> {
  const existing = registry.get(id)
  if (existing) return existing as unknown as SectionControls<E>
  let timer: ReturnType<typeof setTimeout> | undefined
  const allTokens = (v: Values<typeof sectionSchema & E>) => ({
    ...sectionTokens(v as SectionValues),
    ...options.tokens?.(v as Values<E>),
  })
  const controls = defineControls(id, { ...sectionSchema, ...extra } as typeof sectionSchema & E, {
    enabled: true,
    theme: "auto",
    // The site is a showcase: section chips show on hover in its production build too.
    chip: { reveal: "hover" },
    presets: { ...sectionPresets, ...options.presets } as never,
    actions: [
      {
        label: "Copy CSS",
        run: (v) => {
          const body = Object.entries(allTokens(v))
            .map(([k, val]) => `  ${k}: ${val};`)
            .join("\n")
          return copy(`[data-section="${id}"] {\n${body}\n}`, "Copied this section's CSS.")
        },
      },
    ],
    // Motion changes replay the entrance so you can see them; drags replay once they settle.
    onChange(patch: object, _values: unknown, meta: ChangeMeta) {
      if (meta.source === "compare") return
      const moved = Object.keys(patch).some((k) => motionKeys.has(k))
      if (!moved && meta.source !== "randomize") return
      clearTimeout(timer)
      timer = setTimeout(() => replays.get(id)?.(), meta.coalesce ? 260 : 60)
    },
  })
  registry.set(id, controls as unknown as SectionControls<Schema>)
  tokenMaps.set(id, allTokens as (v: SectionValues) => Record<string, string>)
  registerStore(controls as unknown as Controls<Schema>)
  return controls
}

export function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * A titled, tunable section. Hovering or focusing it shows its ⚙ chip. Its direct
 * children enter one after another when it scrolls into view.
 */
export function Section<E extends Schema = {}>({
  title,
  id,
  controls,
  level = 2,
  lede,
  kicker,
  children,
  className,
  style,
}: {
  title: ReactNode
  /** The heading anchor; defaults to the slugged title. */
  id?: string
  /** A store from sectionControls; otherwise one named after the title. */
  controls?: SectionControls<E>
  level?: 1 | 2
  lede?: ReactNode
  /** A small label above the heading that opens a run of related sections. */
  kicker?: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const text = typeof title === "string" ? title : (id ?? "section")
  const anchor = id ?? slug(text)
  const store = controls ?? sectionControls(text)
  const v = useControls(store) as SectionValues
  const ref = useRef<HTMLElement>(null)
  const tokens = (tokenMaps.get(store.id) ?? sectionTokens)(v)
  const Heading: ElementType = level === 1 ? "h1" : "h2"

  useLayoutEffect(() => {
    const body = ref.current?.querySelector(":scope > .sec-body")
    if (!body) return
    let i = 1
    for (const child of body.children) (child as HTMLElement).style.setProperty("--i", String(i++))
  })

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const show = () => node.setAttribute("data-in", "")
    const replay = () => {
      node.removeAttribute("data-in")
      void node.offsetWidth
      requestAnimationFrame(show)
    }
    replays.set(store.id, replay)
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show()
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(node)
    return () => {
      io.disconnect()
      if (replays.get(store.id) === replay) replays.delete(store.id)
    }
  }, [store])

  return (
    <Knobs controls={store}>
      <section
        ref={ref}
        className={`sec${className ? ` ${className}` : ""}`}
        data-section={store.id}
        data-toc={level === 2 ? "" : undefined}
        aria-labelledby={anchor}
        style={{ ...(tokens as CSSProperties), ...style }}
      >
        {kicker && <p className="kicker">{kicker}</p>}
        <Heading id={anchor} className={level === 1 ? "sec-title page-title" : "sec-title"}>
          {title}
        </Heading>
        <div className="sec-body">
          {lede && <p className="lede">{lede}</p>}
          {children}
        </div>
      </section>
    </Knobs>
  )
}
