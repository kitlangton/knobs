import { choice, color, easing, knob, spring, toggle } from "knobs"
import { useEffect, useRef } from "react"
import { demoControls } from "../demos/Demo"

// A small tuning page: three sections of cards in columns, numbered group presets, and a custom
// card whose preview is drawn from the values.
const deck = demoControls(
  "card-deck",
  {
    columns: knob(3, {
      min: 1,
      max: 5,
      step: 1,
      label: "Columns",
      group: "Grid",
      section: "Layout",
    }),
    gap: knob(10, {
      min: 2,
      max: 24,
      step: 1,
      unit: "px",
      label: "Gap",
      group: "Grid",
      section: "Layout",
    }),
    radius: knob(10, {
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      label: "Radius",
      group: "Cards",
      section: "Layout",
    }),
    height: knob(34, {
      min: 18,
      max: 60,
      step: 1,
      unit: "px",
      label: "Height",
      group: "Cards",
      section: "Layout",
    }),
    enter: spring(
      { duration: 0.5, bounce: 0.25 },
      { label: "Entrance", group: "Entrance", section: "Motion" },
    ),
    stagger: knob(40, {
      min: 0,
      max: 160,
      step: 5,
      unit: "ms",
      label: "Stagger",
      group: "Entrance",
      section: "Motion",
    }),
    curve: easing("snappy", { label: "Curve", group: "Hover", section: "Motion" }),
    lift: knob(3, {
      min: 0,
      max: 12,
      step: 1,
      unit: "px",
      label: "Lift",
      group: "Hover",
      section: "Motion",
    }),
    tint: color("oklch(0.68 0.15 200)", { label: "Tint", group: "Palette", section: "Colour" }),
    fill: choice("soft", ["soft", "solid", "outline"], {
      label: "Fill",
      group: "Palette",
      section: "Colour",
    }),
    stripes: toggle(false, { label: "Stripes", group: "Palette", section: "Colour" }),
  },
  {
    groupPresets: {
      Grid: [
        { name: "Default", values: {} },
        { name: "Dense", values: { columns: 5, gap: 4 } },
        { name: "Roomy", values: { columns: 2, gap: 20 } },
      ],
      Palette: [
        { name: "Default", values: {} },
        { name: "Ember", values: { tint: "oklch(0.7 0.17 45)", fill: "solid" } },
      ],
    },
  },
)

function drawPreview(host: HTMLElement) {
  const v = deck.get()
  host.style.cssText = `display:grid;grid-template-columns:repeat(${v.columns},1fr);gap:${v.gap}px;padding:2px 0 6px`
  while (host.children.length < 10) host.append(document.createElement("span"))
  Array.from(host.children as HTMLCollectionOf<HTMLElement>).forEach((cell, i) => {
    const background =
      v.fill === "solid"
        ? v.tint
        : v.fill === "soft"
          ? `color-mix(in oklch, ${v.tint} ${v.stripes && i % 2 ? 18 : 32}%, transparent)`
          : "transparent"
    cell.style.cssText = `height:${v.height}px;border-radius:${v.radius}px;background:${background};box-shadow:inset 0 0 0 1px ${v.fill === "outline" ? v.tint : "transparent"};transition:all var(--glide-ms) var(--glide-ease)`
  })
}

export default function FullPageDemo() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let disposed = false
    let dispose = () => {}
    void import("knobs/panel").then(({ mountPage }) => {
      if (disposed || !host.current) return
      const page = mountPage(deck, host.current, {
        title: "Card deck",
        sections: ["Layout", "Motion", "Colour"],
        columnWidth: 220,
        theme: "auto",
      })
      const preview = page.card({ title: "Preview", section: "Layout" })
      const grid = document.createElement("div")
      preview.body.append(grid)
      drawPreview(grid)
      const unsubscribe = deck.subscribe(() => drawPreview(grid))
      dispose = () => {
        unsubscribe()
        page.dispose()
      }
    })
    return () => {
      disposed = true
      dispose()
    }
  }, [])
  return <div className="page-demo" ref={host} />
}
