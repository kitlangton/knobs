// The catalog's review pieces from knobs/ui: compare() on a before/after pair, diffReview() on a
// commit, and a small walkthrough() of the kind an agent writes. Each mounts as its section nears
// the view, and the videos load only then (assets/compare/, made by its make.sh).
import { compare, type Compare, diffReview, walkthrough, type WalkthroughDoc } from "knobs/ui"
import type { SceneKit } from "./controls"
import patch from "./lab-diff.patch?raw"

const clip = {
  before: new URL("./assets/compare/before.mp4", import.meta.url).href,
  after: new URL("./assets/compare/after.mp4", import.meta.url).href,
}
const still = {
  before: new URL("./assets/compare/before.png", import.meta.url).href,
  after: new URL("./assets/compare/after.png", import.meta.url).href,
}

const springBefore = `export function springMotion({ duration, bounce }: SpringValue) {
  return { omega: (2 * Math.PI) / duration, zeta: 1 - bounce }
}
`
const springAfter = `export function springMotion({ duration, bounce }: SpringValue) {
  return {
    omega: (2 * Math.PI) / Math.max(0.01, duration),
    zeta: bounce >= 0 ? 1 - bounce : 1 / (1 + bounce),
  }
}
`

const doc: WalkthroughDoc = {
  id: "catalog-walkthrough",
  title: "Card and badge: before / after",
  summary: "Before = `main`, after = the branch. Two sections, four steps.",
  meta: { before: "main", branch: "card-motion" },
  sections: [
    {
      title: "The card moves and the button recolours",
      status: "ready",
      steps: [
        {
          title: "The page, before and after",
          caption: "From 1.5 s the card slides over, the button turns and a badge flashes.",
          media: { kind: "compare", before: clip.before, after: clip.after, aspect: 16 / 9 },
        },
        {
          title: "Frame time",
          caption: "Measured over the same 3 s, both runs.",
          media: {
            kind: "metric",
            label: "Frame time",
            before: 9.4,
            after: 6.1,
            unit: "ms",
            better: "down",
          },
          ask: "none",
        },
      ],
    },
    {
      title: "The spring behind it",
      status: "needs-taste",
      steps: [
        {
          title: "springMotion takes a negative bounce",
          caption: "Below zero it overdamps instead of failing.",
          media: {
            kind: "diff",
            layout: "unified",
            files: [{ name: "src/core/spring.ts", before: springBefore, after: springAfter }],
          },
        },
        {
          title: "Which frame should the badge land on?",
          question: "Pick one.",
          options: [
            { label: "Before", media: { kind: "image", src: still.before } },
            { label: "After", suggested: true, media: { kind: "image", src: still.after } },
          ],
        },
      ],
    },
  ],
}

export function reviewSections({
  section,
  h,
  theme,
  whenNear,
}: Pick<SceneKit, "section" | "h" | "theme"> & {
  whenNear: (el: HTMLElement, fn: () => void) => void
}) {
  // ── compare ──
  {
    const s = section({
      id: "compare",
      title: "Compare",
      sub: "Before and after side by side, on one timeline.",
      tip: "Space plays, , and . step a frame, pinch or ⌘-wheel zooms both sides, L loops. W wipes, D shows the difference.",
      shows: ["compare()", "timeline: true"],
      wide: true,
    })
    const row = h("div", "chips")
    const host = h("div")
    // Its height until it mounts: the sides at 16:9 and the timeline under them.
    host.style.cssText = "aspect-ratio:16/9;padding-bottom:44px"
    s.slot.append(row, host)
    let cmp: Compare | null = null
    let kind: "video" | "stills" = "video"
    const make = () => {
      cmp?.dispose()
      const pair = kind === "video" ? clip : still
      cmp = compare(host, {
        theme: theme(),
        before: { src: pair.before },
        after: { src: pair.after },
        timeline: kind === "video",
        aspect: 16 / 9,
        label: "Before and after",
      })
    }
    const buttons = (["video", "stills"] as const).map((k) => {
      const b = h("button", k === kind ? "chip" : "chip quiet")
      b.textContent = k === "video" ? "Video" : "Stills"
      b.setAttribute("aria-pressed", String(k === kind))
      b.addEventListener("click", () => {
        if (k === kind) return
        kind = k
        for (const [i, other] of buttons.entries()) {
          const on = (["video", "stills"] as const)[i] === kind
          other.className = on ? "chip" : "chip quiet"
          other.setAttribute("aria-pressed", String(on))
        }
        if (cmp) make()
      })
      row.append(b)
      return b
    })
    row.style.marginBottom = "12px"
    whenNear(s.el, () => {
      host.style.cssText = ""
      make()
    })
  }

  // ── code diff ──
  {
    const s = section({
      id: "code-diff",
      title: "Code diff",
      sub: "A commit's files beside its diff.",
      shows: ["diffReview()", "patch"],
      wide: true,
    })
    const box = h("div")
    box.style.cssText = "position:relative;height:440px"
    s.slot.append(box)
    whenNear(s.el, () => {
      diffReview(box, {
        theme: theme(),
        id: "catalog-diff",
        storage: null,
        patch,
        layout: "split",
      })
    })
  }

  // ── walkthrough ──
  {
    const s = section({
      id: "walkthrough",
      title: "Walkthrough",
      sub: "A review page from a plain document an agent writes.",
      shows: ["walkthrough()", "WalkthroughDoc"],
      wide: true,
    })
    const box = h("div")
    box.style.minHeight = "800px"
    s.slot.append(box)
    const more = h("p", "note", '<a href="walkthrough.html">The full walkthrough →</a>')
    s.side.append(more)
    whenNear(s.el, () => {
      box.style.minHeight = ""
      walkthrough(box, {
        theme: theme(),
        doc,
        keys: false,
        rail: false,
        advance: false,
        storage: null,
      })
    })
  }
}
