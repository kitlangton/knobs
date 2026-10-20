// The review pieces' catalog: every piece alone and in its states, with a line on when to use it,
// after the foundations they're built from. The page is itself a walkthrough, so its rail, heads
// and steps are the pieces too. docs/review-design.md has the reasons.
import {
  facts,
  HAIRLINES,
  type HistoryData,
  MOTION,
  RADII,
  reviewTheme,
  SPACE,
  TYPE,
  tasteTest,
  trackingAt,
  type WalkthroughDoc,
  type WalkthroughMedia,
  type WalkthroughSection,
  walkthrough,
} from "knobs/review"
import { apca } from "../src/tokens/index"

const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url).href
const pr = (n: number) => `https://github.com/anomalyco/opencode/pull/${n}`

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}
const mount = (fn: (host: HTMLElement) => void): WalkthroughMedia => ({ kind: "mount", mount: fn })

// ——— foundations, drawn from src/review/foundations.ts ———

const SAMPLES: Record<string, string> = {
  heading: "How OpenCode's onboarding broke, and how we're fixing it",
  title: "Nine PRs bring the flow back",
  body: "Someone with no API keys on a fresh Mac runs into four failures in their first ten minutes, and none of them shows on a team machine.",
  label: "dialog-integration.tsx:49-56",
  small: "PR 2 of 5 · #57148 · 2 hours ago",
}

const typeSpecimen = mount((host) => {
  const rows = h("div", "rc-rows")
  for (const t of TYPE) {
    const track = trackingAt(t.size)
    rows.append(
      h(
        "span",
        "rc-term",
        `${t.size}/${t.leading} · ${t.weight} · ${track > 0 ? "+" : track < 0 ? "−" : ""}${Math.abs(track)} px`,
      ),
    )
    const sample = h("span", "rc-sample", SAMPLES[t.role])
    sample.dataset.role = t.role
    rows.append(sample)
  }
  const figures = h("div", "rc-rows")
  figures.append(h("span", "rc-term", "Figures, ss01"))
  const fig = h("span", "rc-sample", "31 days · 5 of 6 · 0:06 · 1,394 lines · 69")
  fig.dataset.role = "data"
  figures.append(fig)
  host.append(rows, figures)
})

const spaceScale = mount((host) => {
  const rows = h("div", "rc-rows")
  for (const s of SPACE) {
    rows.append(h("span", "rc-term", s.role))
    const line = h("span", "rc-space")
    const bar = h("span", "rc-bar")
    bar.style.width = `${s.px}px`
    line.append(bar, h("span", "rc-px", String(s.px)), h("span", "rc-use", s.use))
    rows.append(line)
  }
  host.append(rows)
})

const LADDER = [
  "fg",
  "fg-2",
  "fg-3",
  "fg-4",
  "border-strong",
  "border",
  "border-subtle",
  "fill-selected",
  "fill-hover",
  "fill",
] as const

const colourLadder = mount((host) => {
  const box = h("div", "rc-schemes")
  for (const appearance of ["dark", "light"] as const) {
    const t = reviewTheme[appearance]
    const scheme = h("div", "knobs-root rc-scheme")
    scheme.dataset.appearance = appearance
    scheme.dataset.knobsTheme = reviewTheme.name
    const head = h("div", "rc-swatches")
    head.append(
      h("span"),
      h("span", "rc-token", appearance === "dark" ? "Dark" : "Light"),
      h("span", "rc-hex", t["bg-page"]),
      h("span", "rc-lc", "Lc"),
    )
    const list = h("div", "rc-swatches")
    for (const token of LADDER) {
      const sw = h("span", "rc-swatch")
      sw.style.background = t[token]
      if (token.startsWith("border")) sw.dataset.line = ""
      const lc = Math.abs(apca(t[token], t["bg-page"]))
      list.append(
        sw,
        h("span", "rc-token", token),
        h("span", "rc-hex", t[token]),
        h("span", "rc-lc", token.startsWith("fill") ? "" : lc.toFixed(0)),
      )
    }
    scheme.append(head, list)
    box.append(scheme)
  }
  host.append(box)
})

const motionFacts: WalkthroughMedia = {
  kind: "facts",
  facts: MOTION.map((m) => ({
    term: m.spring ? `${m.name} · ${m.spring.duration} s` : `${m.name} · ${m.ms} ms`,
    value: m.use,
  })),
}

const shapeFacts: WalkthroughMedia = {
  kind: "facts",
  facts: [
    ...RADII.map((r) => ({ term: `${r.token} · ${r.px}`, value: r.use })),
    { term: "Concentric", value: "Inside a frame: the frame's radius less the gap between them" },
  ],
}

const hairlineFacts: WalkthroughMedia = {
  kind: "facts",
  facts: HAIRLINES.map((l) => ({ term: `${l.token} · Lc ${l.lc}`, value: l.use })),
}

// ——— pieces ———

const PRS = {
  "57148": { state: "merged", title: "Send catalog refreshes to every session" },
  "57155": { state: "draft", title: "Sign in to OpenCode Go with your account" },
  "57158": { state: "open", checks: true, title: "Serve v2 at /install" },
  "56990": { state: "closed", title: "Retry the free limit" },
} as const

const heads = mount((host) => {
  walkthrough(host, {
    doc: {
      id: "knobs-review-catalog-heads",
      title: "Should OpenCode Go be its own row in /connect?",
      summary: "Pick one OpenCode row: signing in to OpenCode already unlocks Go models.",
      meta: { Pick: "Option 1", Size: "~30 lines" },
      prs: PRS,
      sections: [
        {
          title: "Fold the Go row into OpenCode",
          link: pr(57155),
          summary: "The section's kicker leads its meta line; its title sits under it.",
          steps: [
            {
              title: "A step's title is its claim",
              caption: "One sentence under it.",
              ask: "none",
            },
          ],
        },
      ],
    },
    rail: false,
    keys: false,
    storage: null,
  })
})

const pickTest = mount((host) => {
  tasteTest(host, {
    options: [
      {
        label: "One OpenCode row",
        caption: "Remove the Go row; signing in to OpenCode unlocks Go models.",
        recommended: true,
        facts: { Size: "~30 lines" },
      },
      {
        label: "Keep Go as a shortcut",
        caption: "Both rows stay; Go opens the OpenCode sign-in.",
        facts: { Size: "~20 lines" },
      },
    ],
    picked: "a",
    onPick: () => {},
  })
})

const narrowFacts = mount((host) => {
  const box = h("div", "rc-narrow")
  host.append(box)
  facts(box, {
    facts: [
      { term: "What the user sees", value: "Two rows: `OpenCode Go` and `OpenCode Console`" },
      { term: "Evidence", value: "dialog-integration.tsx:49-56, opencode.ts:271-288", code: true },
    ],
  })
})

const HISTORY: HistoryData = {
  axis: { today: "2026-10-20" },
  states: {
    v1: { label: "v1, flow works", tone: "dim" },
    broken: { label: "v2, flow broken", tone: "bad" },
  },
  lanes: [
    {
      id: "download",
      label: "opencode.ai/download",
      spans: [
        { from: "2026-06-01", to: "2026-09-19", state: "v1", title: "The website served v1" },
        { from: "2026-09-19", state: "broken", title: "The website switched to v2" },
      ],
    },
    {
      id: "npm",
      label: "npm @opencode-ai/cli",
      spans: [
        { from: "2026-06-01", to: "2026-09-11", state: "v1", title: "npm served v1" },
        { from: "2026-09-11", state: "broken", title: "npm switched to v2" },
      ],
    },
  ],
}

const PATCH = `diff --git a/src/connect.ts b/src/connect.ts
index a1dbf70..a16c034 100644
--- a/src/connect.ts
+++ b/src/connect.ts
@@ -1,6 +1,5 @@
 export const INTEGRATIONS = [
-  { id: "opencode-go", label: "OpenCode Go", auth: "api-key" },
   { id: "opencode", label: "OpenCode", auth: "oauth" },
   { id: "anthropic", label: "Anthropic", auth: "oauth" },
   { id: "openai", label: "OpenAI", auth: "oauth" },
 ]
`

const compareVideos = {
  kind: "compare",
  before: { src: asset("compare/before.mp4"), label: "Before" },
  after: { src: asset("compare/after.mp4"), label: "After" },
  aspect: "640/360",
} as const

const idea = (n: string) => asset(`ideas/${n}-wide-640.jpg`)

const piece = (
  title: string,
  summary: string,
  steps: WalkthroughSection["steps"],
): WalkthroughSection => ({ title, kicker: "Piece", summary, steps })
const foundation = (
  title: string,
  summary: string,
  steps: WalkthroughSection["steps"],
): WalkthroughSection => ({ title, kicker: "Foundation", summary, steps })

const doc: WalkthroughDoc = {
  id: "knobs-review-catalog",
  title: "Review pieces",
  summary:
    "What an agent builds a review page from, each piece alone and in its states, on one type scale and one set of rules.",
  meta: {
    Type: "20 · 16 · 13 · 12 · 11",
    Space: "4 · 8 · 12 · 24 · 48 · 96",
    Hairlines: "Lc 9 · 12 · 17",
  },
  prs: PRS,
  sections: [
    foundation("Type", "Five sizes on a 4 px baseline, two weights, tracking that follows size.", [
      {
        title: "The scale",
        caption: "Mono sits one size down from what's around it; figures are tabular everywhere.",
        ask: "none",
        media: typeSpecimen,
      },
    ]),
    foundation("Space", "Six gaps. From a title up, each at least doubles the last.", [
      { title: "The roles", ask: "none", media: spaceScale },
    ]),
    foundation(
      "Colour and lines",
      "One neutral at fixed opacities, one white accent, hairlines set by contrast on the page.",
      [
        {
          title: "The ladder",
          caption:
            "Lc is APCA against the page; fills carry no number because nothing sits on them.",
          ask: "none",
          media: colourLadder,
        },
        { title: "Hairlines", ask: "none", media: hairlineFacts },
      ],
    ),
    foundation("Shape and motion", "One roundness family, concentric; springs with no bounce.", [
      { title: "Radii", ask: "none", media: shapeFacts },
      {
        title: "The motion set",
        caption: "Nothing moves on load, and the hand is always 1:1.",
        ask: "none",
        media: motionFacts,
      },
    ]),
    piece("Page and section heads", "The top of a page, and each part of it.", [
      {
        title: "A page, a section and a step",
        caption: "The kicker counts the part or names its PR; meta is one faint line.",
        ask: "none",
        media: heads,
      },
    ]),
    piece(
      "Facts",
      "A short list of term → value pairs: what you see, what happens, the evidence.",
      [
        {
          title: "One run",
          ask: "none",
          media: {
            kind: "facts",
            facts: {
              "What the user sees":
                "Two rows: `OpenCode Go` (rank 0) and `OpenCode Console` (rank 1)",
              "What happens on click":
                "`OpenCode Go` asks for a raw API key; `OpenCode Console` signs in.",
              Evidence: "dialog-integration.tsx:49-56",
            },
          },
        },
        {
          title: "In groups, with evidence",
          caption: "Each group under its heading, a hairline between; evidence as mono chips.",
          ask: "none",
          media: {
            kind: "facts",
            groups: [
              {
                title: "opencode-console (V2)",
                facts: [
                  {
                    term: "What the user sees",
                    value: "The Connect CLI card shows `opencode auth login opencode`",
                  },
                  {
                    term: "Evidence",
                    value: "opencode-login.tsx:8-11, opencode-config.ts:742-786",
                    code: true,
                  },
                ],
              },
              {
                title: "v2 TUI (origin/dev)",
                facts: [
                  { term: "What the user sees", value: "Two rows, OpenCode Go first" },
                  {
                    term: "What happens on click",
                    value: ["Go prompts for `OPENCODE_API_KEY`.", "Console runs device sign-in."],
                  },
                  { term: "Evidence", value: "dialog-integration.tsx:49-56", code: true },
                ],
              },
            ],
          },
        },
        {
          title: "Narrow",
          caption: "Under 400 px each term sits over its value.",
          ask: "none",
          media: narrowFacts,
        },
      ],
    ),
    piece(
      "Decision",
      "N ways to go, one recommended. Side by side in whole rows; one under another when narrow.",
      [
        {
          title: "Four options",
          caption: "Four go two by two at this width; the recommended one says so in a word.",
          ask: "none",
          media: {
            kind: "decision",
            options: [
              {
                title: "One OpenCode row in /connect",
                summary: "Signing in to OpenCode already unlocks Go models.",
                recommended: true,
                facts: { Size: "~30 lines", Matches: "opencode-console" },
              },
              {
                title: "Keep Go as a shortcut",
                summary: "Both rows stay; Go opens the OpenCode sign-in.",
                facts: { Size: "~20 lines" },
                cons: ["Two rows that do one job"],
              },
              {
                title: "Ship #57155",
                summary: "Two full integrations with delegated sign-in.",
                facts: { Size: "+380 lines across 14 files" },
                cons: ["Four credentials to rank"],
              },
              {
                title: "Keep dev as it is",
                summary: "Go keeps asking for an API key.",
                facts: { Size: "None" },
                cons: ["Subscribers hit a key prompt"],
              },
            ],
          },
        },
        {
          title: "Three, with pictures",
          ask: "none",
          media: {
            kind: "decision",
            noun: "Layout",
            options: [
              {
                title: "Light table",
                media: { kind: "image", src: idea("01-light-table") },
                recommended: true,
              },
              { title: "Exposé", media: { kind: "image", src: idea("02-expose") } },
              {
                title: "Infinite canvas",
                media: { kind: "image", src: idea("03-infinite-canvas") },
              },
            ],
          },
        },
      ],
    ),
    piece("Taste test", "A decision Kit makes: the same look, and the head is the radio.", [
      {
        title: "Picked",
        caption: "The pick takes the check; the rest step back.",
        ask: "none",
        media: pickTest,
      },
    ]),
    piece("Compare", "The same thing before and after.", [
      {
        title: "Side by side",
        caption: "Click the pictures or press Space to play; drag the line to scrub.",
        ask: "none",
        media: compareVideos,
      },
      {
        title: "Wipe",
        caption: "One picture, the seam where you drag it.",
        ask: "none",
        media: { ...compareVideos, mode: "wipe" },
      },
      {
        title: "Two stills",
        caption: "No time to show, so no button and no line.",
        ask: "none",
        media: {
          kind: "compare",
          before: { src: asset("compare/before.png"), label: "Before" },
          after: { src: asset("compare/after.png"), label: "After" },
          aspect: "640/360",
        },
      },
      {
        title: "Chapters and a mark",
        caption: "The badge is ringed while it shows.",
        ask: "none",
        media: {
          ...compareVideos,
          chapters: [
            { label: "Card moves", start: 0 },
            { label: "Badge flashes", start: 1.5 },
            { label: "Settles", start: 2.6 },
          ],
          annotations: [
            { x: 0.297, y: 0.25, w: 0.0875, h: 0.044, label: "New badge", at: [1.5, 2.6] },
          ],
        },
      },
    ]),
    piece("Video", "One recording, its chapters as segments of its line.", [
      {
        title: "With chapters",
        ask: "none",
        media: {
          kind: "video",
          src: asset("compare/long-after.mp4"),
          aspect: "640/360",
          chapters: [
            { label: "Opening", start: 0 },
            { label: "The card", start: 12 },
            { label: "The badge", start: 24 },
          ],
        },
      },
    ]),
    piece("Table", "Rows that share columns. Too narrow, each row becomes facts.", [
      {
        title: "Wide",
        ask: "none",
        media: {
          kind: "table",
          columns: [
            { key: "path", label: "Install path", mono: true },
            { key: "serves", label: "Serves" },
            { key: "since", label: "Since" },
            { key: "state", label: "State", align: "right" },
          ],
          rows: [
            {
              path: "opencode.ai/download",
              serves: "v2 Desktop",
              since: "Sep 19",
              state: { text: "Broken", badge: "bad" },
            },
            {
              path: "npm",
              serves: "v2 CLI",
              since: "Sep 11",
              state: { text: "Broken", badge: "bad" },
            },
            {
              path: "opencode.ai/install",
              serves: "v1 CLI",
              since: "",
              state: { text: "Wrong major", badge: "warn" },
            },
          ],
        },
      },
      {
        title: "Stacked",
        ask: "none",
        media: {
          kind: "table",
          stack: "always",
          columns: [
            { key: "surface", label: "Surface" },
            { key: "sees", label: "What the user sees" },
            { key: "source", label: "Evidence", mono: true },
          ],
          rows: [
            {
              surface: "v2 TUI",
              sees: "Two rows, Go first",
              source: "dialog-integration.tsx:49-56",
            },
            { surface: "v1", sees: "One Go row", source: "dialog-provider.tsx:135-146" },
          ],
        },
      },
    ]),
    piece("Stack", "Pull requests in merge order, as a git graph.", [
      {
        title: "Three PRs on dev",
        ask: "none",
        media: {
          kind: "stack",
          base: "dev",
          items: [
            {
              pr: 57148,
              title: "Send catalog refreshes to every session",
              branch: "models-dev-refresh → dev",
              delta: { add: 47, del: 1 },
              status: "Merged",
            },
            {
              pr: 57146,
              title: "Typed free-limit error with a reset time",
              branch: "free-limit-card → dev",
              delta: { add: 193, del: 8 },
              status: "Draft, checks pass",
            },
            {
              pr: 57466,
              title: "Restore the Desktop limit dialog",
              branch: "free-limit-desktop → free-limit-card",
              delta: { add: 446, del: 47 },
              status: "Draft",
            },
          ],
        },
      },
    ]),
    piece("History", "Dated spans on lanes: what was true when.", [
      {
        title: "Two install paths",
        ask: "none",
        media: { kind: "history", label: "Install paths", ...HISTORY },
      },
    ]),
    piece("Code", "Code, in one well: a diff, a file, a terminal.", [
      { title: "Diff", ask: "none", media: { kind: "diff", patch: PATCH } },
      {
        title: "Code and terminal",
        ask: "none",
        columns: 2,
        media: [
          {
            kind: "code",
            label: "connect.ts",
            code: 'export const ROWS = ["opencode", "anthropic"]\nconst rank = (id: string) => ROWS.indexOf(id)',
          },
          {
            kind: "terminal",
            label: "Terminal",
            code: "$ opencode auth login opencode\nOpening the browser…\nSigned in as kit@anoma.ly",
          },
        ],
      },
    ]),
    piece("Metric and callout", "One number before and after; one sentence that has to be seen.", [
      {
        title: "Metric",
        ask: "none",
        media: { kind: "metric", label: "Free models on first launch", before: 2, after: 4, of: 4 },
      },
      {
        title: "Callouts",
        ask: "none",
        media: [
          {
            kind: "callout",
            text: "Every date comes from git history except the `/install` redirect.",
          },
          {
            kind: "callout",
            tone: "warn",
            text: "`#57158` needs the Cloudflare redirect removed when it merges.",
          },
          { kind: "callout", tone: "good", text: "The fresh-user test runs in under 15 seconds." },
        ],
      },
    ]),
    piece(
      "Disclosure and PR refs",
      "The rest of a caption, folded away; pull requests as capsules.",
      [
        {
          title: "#57148 is merged, #57158 open, #57155 a draft, #56990 closed",
          caption: "A ref's state tints its capsule; its title shows on hover.",
          ask: "none",
          more: "Everything past the first sentence goes here, in the same voice: the reasoning, the caveats and the numbers that didn't fit the claim.",
        },
      ],
    ),
  ],
}

walkthrough(document.getElementById("page")!, { doc, storage: null })
