// A code review from knobs/ui: diffReview() puts the changed files in a tree (folders folded into
// paths, +/− per file; the file on show under the selection pill, which slides as you pick, as
// Split | Unified's does) beside the diff, in a split; under it, codeDiff() on its own as a card
// that grows to each file (height: "auto"), from before and after text. Both follow the top
// bar's look (knobs or Lab, dark or light) through restyle(). Last, a walkthrough's column: step
// cards (.knobs-surface) holding diffs, so each shows one surface, and many diffs down a long page
// that hold their height from the start and draw only near the viewport (the corner counts them).
// The card alone stacks its files in one scroller, each header sticking as you scroll past.
// ?layout=unified starts unified; ?wrap wraps long lines; ?stack stacks the review's files too.
import { codeDiff, diffReview, type CodeDiff, type DiffLayout } from "knobs/ui"
import { bindLookSwitch, uiLook } from "./lab-look"
import patch from "./lab-diff.patch?raw"

const params = new URLSearchParams(location.search)
const layout: DiffLayout = params.get("layout") === "unified" ? "unified" : "split"
const wrap = params.has("wrap")
const stack = params.has("stack")
const status = document.getElementById("status")!

const say = (text: string) => (status.textContent = text)

// One commit from this repo's history, as `git show` prints it.
const review = diffReview(document.getElementById("review")!, {
  ...uiLook(),
  id: "lab-diff",
  patch,
  layout,
  wrap,
  stack,
  onFile: (name) => say(`Showing ${name}`),
  onLayout: (next) => say(`Layout: ${next}`),
  onLines: (lines, file) =>
    say(lines ? `${file}: lines ${lines.start}–${lines.end} (${lines.side ?? "both"})` : ""),
})

const before = {
  spring: `/** SwiftUI's mapping: ω = 2π / duration; ζ = 1 − bounce. */
export function springMotion({ duration, bounce }: SpringValue) {
  return { omega: (2 * Math.PI) / duration, zeta: 1 - bounce }
}
`,
  look: `export const uiLook = () => {
  const { preset, theme } = look()
  return { preset, theme }
}
`,
}
const after = {
  spring: `/** SwiftUI's mapping: ω = 2π / duration; ζ = 1 − bounce, or 1 / (1 + bounce) below zero. */
export function springMotion({ duration, bounce }: SpringValue): { omega: number; zeta: number } {
  return {
    omega: (2 * Math.PI) / Math.max(0.01, duration),
    zeta: bounce >= 0 ? 1 - bounce : 1 / (1 + bounce),
  }
}

/** The step response (0 → 1) sampled every \`dt\` seconds for \`seconds\`. */
export function springResponse(omega: number, zeta: number, seconds: number, dt = 1 / 60) {
  const s = new Spring(0, omega, zeta).set(1)
  const out = [0]
  for (let t = dt; t < seconds + dt / 2; t += dt) out.push(s.step(dt))
  return out
}
`,
  look: `/** The look as a knobs/ui piece's options. */
export const uiLook = () => {
  const { preset, theme } = look()
  return { ...(preset ? { preset } : {}), theme }
}
`,
  notes: `# Springs

Every spring is a duration and a bounce, with no bounce unless asked.

| Name | Spring | Use |
| --- | --- | --- |
| snappy | .25 / 0 | small controls, menus, exits |
| default | .3 / 0 | most state changes |
| calm | .4 / 0 | layout moves, list reflow |
`,
}

// The same piece alone: a card as tall as its files' diffs (up to 420px), all of them down one
// scroller, each under a header that sticks.
const card = codeDiff(document.getElementById("card")!, {
  ...uiLook(),
  height: "auto",
  maxHeight: 420,
  layout: "unified",
  stack: true,
  viewed: [],
  files: [
    { name: "src/core/spring.ts", before: before.spring, after: after.spring },
    { name: "examples/lab-look.ts", before: before.look, after: after.look },
    { name: "docs/springs.md", before: "", after: after.notes },
  ],
  onFile: (name) => say(`Card: ${name}`),
})

// The walkthrough: each file of the commit as its own step, a few times over for length, and
// one step that holds a whole review.
const walk = document.getElementById("walk")!
const steps: CodeDiff[] = []
const step = (text: string) => {
  const el = document.createElement("div")
  el.className = "step knobs-surface"
  const p = document.createElement("p")
  p.textContent = text
  el.append(p)
  walk.append(el)
  return el
}
for (let round = 1; round <= 4; round++)
  for (const f of review.diff.files) {
    const at = step(`Step ${steps.length + 1}: ${f.name} (+${f.additions} −${f.deletions}).`)
    steps.push(
      codeDiff(at, {
        ...uiLook(),
        patch: f.patch,
        height: "auto",
        layout: round % 2 ? "unified" : "split",
      }),
    )
    if (round === 2 && steps.length === review.diff.files.length + 1) {
      const tall = document.createElement("div")
      tall.className = "tall"
      step(
        "A whole review in a step: the split's panes meet on a hairline, no cards inside the card.",
      ).append(tall)
      diffReview(tall, { ...uiLook(), id: "lab-diff-walk", patch, layout: "unified" })
    }
  }
const drawn = document.getElementById("drawn")!
const countDrawn = () => {
  const n = steps.filter((d) => d.element.querySelector(".knobs-diff-slot:not([hidden])")).length
  drawn.textContent = `${n} of ${steps.length} walkthrough diffs drawn`
}
setInterval(countDrawn, 500)

bindLookSwitch()
Object.assign(window, { __diff: { review, card, steps } })
