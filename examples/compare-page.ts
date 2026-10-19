// A long page of compares, as a walkthrough's steps would hold them: each a self-contained
// `compare(el, { before, after, timeline: true })` in the page's flow (no height: it sizes itself),
// most on a card (.knobs-surface, so the stage drops its fill). Sources load near the view and
// are let go well off it. The first pair is 40 s with a keyframe every 10 s, as raw screen
// recordings have (assets/compare/long-*.mp4, from make.sh), to feel scrubbing on them.
// ?recordings uses the onboarding review's recordings instead (local only, gitignored);
// ?renderer=dom forces the DOM renderer.
import { compare, type Compare, type CompareSource } from "knobs/ui"

// From the page's own address: Vite rewrites `new URL(\`./…${x}\`, import.meta.url)` into a glob
// of one folder, which misses these subfolders.
const asset = (path: string) => new URL(`assets/${path}`, location.href).href
const params = new URLSearchParams(location.search)
interface Step {
  readonly title: string
  readonly before: CompareSource
  readonly after: CompareSource
  readonly aspect: number
  readonly card?: boolean
}
const pair = (dir: string, name: string, title: string, aspect: number, card = true): Step => ({
  title,
  before: { src: asset(`${dir}/${name}before.mp4`) },
  after: { src: asset(`${dir}/${name}after.mp4`) },
  aspect,
  card,
})
const synthetic: Step[] = [
  pair("compare", "long-", "Sparse keyframes (one in 10 s)", 16 / 9, false),
  pair("compare", "", "A card moves, a button recolours", 16 / 9),
  {
    title: "Stills",
    before: { src: asset("compare/before.png") },
    after: { src: asset("compare/after.png") },
    aspect: 16 / 9,
  },
  pair("compare", "long-", "The long pair again, on a card", 16 / 9),
]
const walk = (name: string, title: string) => pair("walkthrough", `${name}-`, title, 906 / 540)
const recordings: Step[] = [
  pair("compare", "sparse-", "Sparse keyframes (one in 10 s)", 906 / 540, false),
  walk("57148-picker", "Picker"),
  walk("57148-retired-desktop", "Retired desktop"),
  walk("57148-retired-tui", "Retired TUI"),
  walk("57151-models", "Models"),
  walk("57155-connect", "Connect"),
]
const STEPS = params.has("recordings") ? recordings : synthetic
const renderer = params.get("renderer") === "dom" ? "dom" : "gpu"
const main = document.getElementById("main")!
const compares: Compare[] = []
const rounds = Math.ceil(12 / STEPS.length)
for (let round = 0; round < rounds; round++)
  for (const step of STEPS) {
    const h = document.createElement("h2")
    h.textContent = step.title
    const p = document.createElement("p")
    p.textContent =
      "Scrub the timeline: the nearest decoded frame shows at once and the exact one replaces it when the seek lands. Space plays and pauses where it is; pinch or ⌘-wheel zooms both sides, L loops."
    const host = document.createElement("div")
    if (step.card !== false) host.className = "card knobs-surface"
    const mount = document.createElement("div")
    host.append(mount)
    main.append(h, p, host)
    compares.push(
      compare(mount, {
        before: step.before,
        after: step.after,
        timeline: true,
        aspect: step.aspect,
        renderer,
        label: step.title,
      }),
    )
  }
Object.assign(window, { __compares: compares })
