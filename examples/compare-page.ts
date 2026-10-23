// A long page of compares, as a walkthrough's steps would hold them: each a self-contained
// `compare(el, { before, after, timeline: true })` in the page's flow (no height: it sizes itself),
// most on a card (.knobs-surface, so the stage drops its fill). Sources load near the view and
// are let go well off it. The first pair is 40 s with a keyframe every 10 s, as raw screen
// recordings have (assets/compare/long-*.mp4, from make.sh), to feel scrubbing on them. Some
// start in the wipe, some carry chapters (faint ticks on the lane, the current one brighter; a
// chapter jumps with a catch-up), and one offers the difference as a third mode.
// ?recordings uses the onboarding review's recordings instead (local only, gitignored);
// ?renderer=dom forces the DOM renderer.
import {
  compare,
  type Compare,
  type CompareMode,
  type CompareSource,
  type Player,
  player,
} from "knobs/ui"

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
  readonly mode?: CompareMode
  readonly modes?: readonly CompareMode[]
  readonly chapters?: readonly { readonly time: number; readonly label: string }[]
}
const pair = (dir: string, name: string, title: string, aspect: number, card = true): Step => ({
  title,
  before: { src: asset(`${dir}/${name}before.mp4`) },
  after: { src: asset(`${dir}/${name}after.mp4`) },
  aspect,
  card,
})
const CHAPTERS = [
  { time: 0, label: "Open" },
  { time: 1.5, label: "The card moves" },
  { time: 2.6, label: "The badge" },
]
const synthetic: Step[] = [
  pair("compare", "long-", "Sparse keyframes (one in 10 s)", 16 / 9, false),
  {
    ...pair("compare", "", "A card moves, a button recolours: wiping, with chapters", 16 / 9),
    mode: "wipe",
    chapters: CHAPTERS,
  },
  {
    ...pair("compare", "", "Three modes: the difference, opted in", 16 / 9),
    modes: ["side", "wipe", "difference"],
  },
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
// ?pair=scrub-1080- shows that one pair alone (scripts/scrub-probe.mjs), with a player of its After
// above it.
const only = params.get("pair")
const STEPS = only
  ? [pair("compare", only, `${only}before / after`, 16 / 9, false)]
  : params.has("recordings")
    ? recordings
    : synthetic
const renderer = params.get("renderer") === "dom" ? "dom" : "gpu"
const main = document.getElementById("main")!
const compares: Compare[] = []
const players: Player[] = []
if (only) {
  const h = document.createElement("h2")
  h.textContent = "Player"
  const host = document.createElement("div")
  main.append(h, host)
  players.push(player(host, { src: asset(`compare/${only}after.mp4`), loop: false }))
}
const rounds = only ? 1 : Math.ceil(12 / STEPS.length)
for (let round = 0; round < rounds; round++)
  for (const step of STEPS) {
    const h = document.createElement("h2")
    h.textContent = step.title
    const p = document.createElement("p")
    p.textContent =
      "Scrub the timeline: the nearest decoded frame shows at once and the exact one replaces it when the seek lands; the time shows under the pointer. Space plays and pauses where it is; pinch or ⌘-wheel zooms both sides, L loops. Wiping, drag the line or press anywhere on the stage."
    const host = document.createElement("div")
    if (step.card !== false) host.className = "card knobs-surface"
    const mount = document.createElement("div")
    host.append(mount)
    main.append(h, p, host)
    const c = compare(mount, {
      before: step.before,
      after: step.after,
      timeline: true,
      aspect: step.aspect,
      renderer,
      label: step.title,
      ...(step.mode ? { mode: step.mode } : {}),
      ...(step.modes ? { modes: step.modes } : {}),
    })
    if (step.chapters) {
      c.timeline?.update({
        markers: step.chapters.map((ch, i) => ({ id: `ch${i}`, time: ch.time, label: ch.label })),
      })
      // Chapters as a row of links under it: a click jumps there, the playhead catching up.
      const row = document.createElement("p")
      row.className = "chapters"
      for (const ch of step.chapters) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = ch.label
        b.addEventListener("click", () => c.seek(ch.time, { glide: true }))
        row.append(b)
      }
      host.append(row)
    }
    compares.push(c)
  }
Object.assign(window, { __compares: compares, __players: players })
