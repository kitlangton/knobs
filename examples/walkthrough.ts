// A walkthrough from knobs/ui: the onboarding PRs' before/after page (2026-10-19), written as the
// plain document an agent would emit, with a feed of updates and an answer at the top, plus the
// rest of the kit: a taste test, a code diff, metrics, a merge stack, a history, a table, a
// chaptered video with captions and a terminal block. Kit's notes (typed,
// spoken or inked, each with what he was looking at) and picks are kept per document id; "Copy
// feedback" hands them back as Markdown. The videos are 540p re-encodes (every 15th frame a
// keyframe, so scrubbing is instant) of ~/code/home/artifacts/2026-10-19-onboarding-prs.
import { walkthrough, type WalkthroughDoc } from "knobs/ui"
import { bindLookSwitch, uiLook } from "./lab-look"

const asset = (name: string) => new URL(`./assets/walkthrough/${name}`, import.meta.url).href
const pair = (stem: string, pr: string, aspect: string) => ({
  kind: "compare" as const,
  before: { src: asset(`${stem}-before.mp4`), label: "Before (dev)" },
  after: { src: asset(`${stem}-after.mp4`), label: `After (${pr})` },
  aspect,
})

const DESKTOP_PICKER = "1100/900"
const PICKER_CHAPTERS = [
  { label: "Stale snapshot", start: 0, duration: 4 },
  { label: "Picker opened", start: 4, duration: 5 },
  { label: "models.dev refresh", start: 9, duration: 4 },
  { label: "Picker again", start: 13 },
]
const DESKTOP = "1100/760"
const TUI = "2052/1224"

const cardBefore = `export function ErrorCard(props: { error: SessionError }) {
  return (
    <Card tone="critical">
      <Title>Request failed</Title>
      <Body>{props.error.message}</Body>
    </Card>
  )
}
`
const cardAfter = `export function ErrorCard(props: { error: SessionError }) {
  if (props.error.status === 410)
    return (
      <Card tone="warn">
        <Title>{props.error.model} has been retired</Title>
        <Body>Your prompt is back in the composer.</Body>
        <Button onClick={openModelPicker}>Pick another model</Button>
      </Card>
    )
  return (
    <Card tone="critical">
      <Title>Request failed</Title>
      <Body>{props.error.message}</Body>
    </Card>
  )
}
`

export const doc: WalkthroughDoc = {
  id: "2026-10-19-onboarding-prs",
  title: "Onboarding audit #2: before / after",
  // Short words on show, the rest under More: the title the claim, the caption one sentence.
  summary: "Before is `dev`, after is the PR branch.",
  more: "#57158 (the installer redirect) has no video: its curl output is in the PR body and in the last step here.",
  meta: { before: "dev", date: "2026-10-19", PRs: "4" },
  // From the clips' timestamps on 2026-10-19; the answer restates the page's own summary.
  updates: [
    {
      at: "2026-10-19T11:14:00-07:00",
      text: "Recorded #57151 (/models) and #57155 (/connect) before and after.",
    },
    {
      at: "2026-10-19T11:30:00-07:00",
      text: "Recorded the desktop model picker with a stale snapshot and a refresh ~9s in.",
      step: "1.1",
    },
    {
      at: "2026-10-19T11:52:00-07:00",
      text: "Recorded the retired-model (410) clips, desktop and TUI, against a mock provider.",
      step: "1.2",
    },
    {
      at: "2026-10-19T12:07:00-07:00",
      text: "Re-encoded every clip at 540p with a keyframe every 15 frames, so scrubbing is instant.",
    },
  ],
  // An answer carries what Kit did before asking, folded away under it.
  qa: [
    {
      at: "2026-10-19T12:10:00-07:00",
      q: "Why is there no video for #57158?",
      a: "It's the installer redirect: nothing to watch. The curl output is in its PR body, and in the last step here.",
      step: "installer-redirect",
      trail: [
        "0:03 · Viewed TUI /connect → OpenCode Go",
        "0:11 · Played the compare at 0:04",
        "0:19 · Scrolled to the rest of the kit",
      ],
    },
    {
      at: "2026-10-19T12:40:00-07:00",
      q: "Ship #57151?",
      a: "Merged into `dev` at 12:38.",
      step: "2.1",
      status: "shipped",
    },
  ],
  sections: [
    {
      title: "Refresh models globally, hide retired models, actionable retired-model card",
      link: "https://github.com/anomalyco/opencode/pull/57148",
      status: "ready",
      steps: [
        {
          title: "Desktop model picker",
          caption: "A stale snapshot, then models.dev refreshes about 9 s in.",
          more: "Real dev server and desktop app. The bundled snapshot is made stale (3 models not yet marked deprecated). Reopen the picker after the refresh.",
          media: { ...pair("57148-picker", "#57148", DESKTOP_PICKER), chapters: PICKER_CHAPTERS },
        },
        {
          title: "Retired model (HTTP 410), desktop",
          caption: "After: **Pick another model**, and the prompt back in the composer.",
          more: "Real dev server and desktop app, with a mock provider that answers 410 Gone. **Pick another model** opens the model picker.",
          media: pair("57148-retired-desktop", "#57148", DESKTOP),
        },
        {
          title: "Retired model (HTTP 410), TUI",
          caption:
            "Same mock provider. After: the message with `/models` on its own line, no duplicate error toast, and the prompt restored.",
          media: pair("57148-retired-tui", "#57148", TUI),
        },
      ],
    },
    {
      title: "TUI /models: preferred free models first, current model focused",
      link: "https://github.com/anomalyco/opencode/pull/57151",
      status: "ready",
      steps: [
        {
          title: "TUI /models opening",
          media: pair("57151-models", "#57151", TUI),
        },
      ],
    },
    {
      title: "TUI /connect → OpenCode Go: Console sign-in",
      link: "https://github.com/anomalyco/opencode/pull/57155",
      status: "ready",
      steps: [
        {
          title: "TUI /connect → OpenCode Go",
          caption: "After: sign-in offered, through the first screen of the device flow.",
          media: pair("57155-connect", "#57155", TUI),
        },
      ],
    },
    {
      id: "kit",
      title: "The rest of the kit (demo data)",
      kicker: "Demo",
      status: "needs-taste",
      summary: "Made-up steps that show the other pieces.",
      more: "Not from the audit. A taste test, a code diff, metrics, a merge stack, a history, a table, a chaptered video and a terminal block.",
      steps: [
        {
          title: "Retired-model card copy",
          caption: "Two ways to word the 410 card. Pick the one that should ship.",
          question: "Which reads better?",
          options: [
            {
              label: "Plain",
              media: {
                kind: "callout",
                tone: "warn",
                text: "**This model was retired.** Pick another model to continue.",
              },
            },
            {
              label: "Specific",
              suggested: true,
              media: {
                kind: "callout",
                tone: "warn",
                text: "**Claude 3 Opus has been retired.** Your prompt is back in the composer; pick another model to send it.",
              },
              caption: "Names the model and says where the prompt went.",
            },
          ],
        },
        {
          title: "The card's code",
          caption: "Illustrative: the 410 branch as it might read. The diff grows to its file.",
          media: {
            kind: "diff",
            layout: "unified",
            files: [
              {
                name: "packages/app/src/session/error-card.tsx",
                before: cardBefore,
                after: cardAfter,
              },
            ],
          },
        },
        {
          title: "Onboarding checks",
          caption: "Two numbers side by side: what passed before, and after.",
          columns: 2,
          media: [
            { kind: "metric", label: "Checks passing", before: 315, after: 345, of: 345 },
            {
              kind: "metric",
              label: "Time to first message",
              before: 41,
              after: 14,
              unit: "s",
              better: "down",
            },
          ],
        },
        {
          title: "Merge order",
          caption:
            "A stack: each PR on the branch it merges into, `dev` at the top. Click a title to go to its step.",
          ask: "none",
          media: {
            kind: "stack",
            base: "dev",
            items: [
              {
                order: "01",
                pr: "#57148",
                href: "https://github.com/anomalyco/opencode/pull/57148",
                step: "1.1",
                title: "fix(core): refresh models.dev on cold boot and recover from retired models",
                branch: "models-dev-refresh → dev",
                delta: "+164 / -18",
                status: "Ready · CI green",
                tone: "good",
                summary:
                  "Reloads the catalog as soon as the cold-boot models.dev fetch lands, and moves off 404/410 retired free models.",
              },
              {
                order: "02",
                pr: "#57151",
                href: "https://github.com/anomalyco/opencode/pull/57151",
                step: "2.1",
                title: "fix(cli): show Zen Free models first when no providers are connected",
                branch: "models-free-first → dev",
                delta: "+58 / -9",
                status: "Ready · CI green",
                tone: "good",
              },
              {
                order: "03",
                pr: "#57158",
                href: "https://github.com/anomalyco/opencode/pull/57158",
                step: "4.8",
                title: "fix(console,ci): serve the v2 installer at /install",
                branch: "install-v2-url → dev",
                delta: "+14 / -14",
                status: "Needs an edge rule",
                tone: "warn",
              },
              {
                order: "04",
                pr: "#57155",
                href: "https://github.com/anomalyco/opencode/pull/57155",
                step: "3.1",
                title: "feat(core,app,tui): sign in to OpenCode Go with browser OAuth",
                branch: "opencode-go-oauth → dev",
                delta: { add: 362, del: 65 },
                status: "Mocked Console",
                tone: "info",
              },
              {
                order: "05 · 1/4",
                pr: "#57146",
                href: "https://github.com/anomalyco/opencode/pull/57146",
                title: "feat(core): typed free-limit error with reset time",
                branch: "free-limit-card → dev",
                delta: "+193 / -8",
                status: "Stack base",
                tone: "good",
              },
              {
                order: "06 · 2/4",
                pr: "#57466",
                href: "https://github.com/anomalyco/opencode/pull/57466",
                title: "fix(app): restore the free-tier limit dialog and prompt recall",
                branch: "free-limit-desktop → free-limit-card",
                delta: "+446 / -47",
                status: "Stacked on #57146",
                tone: "good",
              },
              {
                order: "07 · 3/4",
                pr: "#57467",
                href: "https://github.com/anomalyco/opencode/pull/57467",
                title: "feat(tui): free-limit notice, prompt recall, no failure toast",
                branch: "free-limit-tui-notice → free-limit-card",
                delta: "+283 / -5",
                status: "Stacked on #57146",
                tone: "good",
              },
              {
                order: "08 · 4/4",
                pr: "#57471",
                href: "https://github.com/anomalyco/opencode/pull/57471",
                title: "feat(tui): restore the animated Go upsell modal",
                branch: "free-limit-tui-modal → free-limit-tui-notice",
                delta: "+926 / -21",
                status: "Stacked on #57467",
                tone: "good",
              },
            ],
          },
        },
        {
          title: "How it broke",
          caption:
            "A history: every date from git and release tags, except the edge redirect, which lives outside git and is inferred from how the edge behaves.",
          ask: "none",
          media: {
            kind: "history",
            groups: [
              {
                heading: "v1 built it",
                summary: "Apr 9 – May 18",
                events: [
                  {
                    date: "Apr 9, 2026",
                    title: "TUI Go upsell dialog and the free_tier_limit classifier ship",
                    detail:
                      "`dialog-go-upsell.tsx` added, and `retry.ts` parses FreeUsageLimitError into `free_tier_limit`.",
                    evidence: [
                      { label: "#21583", href: "https://github.com/anomalyco/opencode/pull/21583" },
                      { label: "489f57974d" },
                    ],
                    tone: "good",
                    provenance: "verified",
                    source: "git",
                    type: "commit",
                  },
                  {
                    date: "May 18, 2026",
                    title: "Desktop usage-exceeded modal ships in v1.12",
                    evidence: [{ label: "v1.12.0" }],
                    tone: "good",
                    provenance: "verified",
                    source: "tag",
                    type: "release",
                  },
                ],
              },
              {
                heading: "v2 dropped it",
                summary: "Jun 26 – Jul 30",
                events: [
                  {
                    date: "Jun 26, 2026",
                    age: "116d ago",
                    title: "The v2 TUI rewrite leaves out DialogRetryAction",
                    detail: "`session/index.tsx` replaced without the free-limit listener.",
                    evidence: [{ label: "e6f660fecf" }],
                    tone: "bad",
                    provenance: "verified",
                    source: "git",
                  },
                  {
                    date: "Jul 20, 2026",
                    age: "92d ago",
                    title: "Deleting packages/opencode takes retry.ts and its 440 lines of tests",
                    evidence: [{ label: "44b6938b2a" }],
                    tone: "bad",
                    provenance: "verified",
                    source: "git",
                  },
                ],
              },
              {
                heading: "Users got it",
                summary: "Sep 19 – today",
                events: [
                  {
                    date: "Sep 19, 2026",
                    age: "31d ago",
                    title: "opencode.ai/download switches to v2",
                    evidence: [
                      { label: "#49874", href: "https://github.com/anomalyco/opencode/pull/49874" },
                    ],
                    tone: "warn",
                    provenance: "verified",
                    source: "git",
                    type: "channel",
                  },
                  {
                    date: "Oct 20, 2026",
                    age: "today",
                    title: "opencode.ai/install still 307s to the v1 installer",
                    detail:
                      "Git points `/install` at dev; a Cloudflare redirect answers first. Seen with `curl -sI`.",
                    tone: "warn",
                    provenance: "inferred",
                    source: "edge",
                    type: "audit",
                    step: "4.8",
                  },
                ],
              },
            ],
          },
        },
        {
          title: "Where a new user lands",
          caption:
            "A table: a channel matrix. Too wide for the column, each row stacks: the entry point over the rest, its state at the end of the line.",
          ask: "none",
          media: {
            kind: "table",
            primary: "channel",
            caption: "Checked from a clean HOME on 2026-10-20.",
            columns: [
              { key: "channel", label: "Entry point", mono: true },
              { key: "serves", label: "Serves", mono: true },
              { key: "days", label: "Days on v2" },
              { key: "first", label: "What a cold user hits" },
              { key: "state", label: "State", align: "right" },
            ],
            rows: [
              {
                cells: {
                  channel: { text: "opencode.ai/download", href: "https://opencode.ai/download" },
                  serves: "v2.0.35",
                  days: 31,
                  first:
                    "Two of four free models hidden on cold boot; the daily free limit wipes the prompt.",
                  state: { text: "Broken", badge: "bad" },
                },
              },
              {
                cells: {
                  channel: { text: "curl …/v2/install | bash", code: true },
                  serves: "v2.0.35",
                  days: 43,
                  first: "Skips PATH setup when ~/.zshrc is missing.",
                  state: { text: "Broken", badge: "bad", step: "4.8" },
                },
              },
              {
                cells: {
                  channel: { text: "npm i -g @opencode-ai/cli", code: true },
                  serves: "v2.0.35",
                  days: 39,
                  first: "Same cold-boot gap and free-limit toast.",
                  state: { text: "Broken", badge: "bad" },
                },
              },
              {
                cells: {
                  channel: { text: "curl …/install | bash", code: true },
                  serves: "v1.14.19",
                  days: { text: "—", tone: "dim" },
                  first: "The edge 307s to the v1 installer.",
                  state: { text: "Wrong version", badge: "warn" },
                },
              },
              {
                cells: {
                  channel: { text: "brew install …/opencode-v2", code: true },
                  serves: "v2.0.35",
                  days: 31,
                  first: "Fine once the free-limit fixes land.",
                  state: { text: "Pending", badge: "info" },
                },
              },
            ],
          },
        },
        {
          title: "The picker, narrated",
          caption:
            "A video with chapters and captions: click a chapter to jump there; the lit one follows playback.",
          media: {
            kind: "video",
            src: asset("57148-picker-after.mp4"),
            aspect: DESKTOP_PICKER,
            captions: asset("57148-picker.vtt"),
            chapters: PICKER_CHAPTERS,
          },
        },
        {
          id: "installer-redirect",
          title: "Installer redirect",
          caption: "A terminal block for evidence that isn't a video.",
          media: [
            {
              kind: "terminal",
              code: "$ curl -sI https://example.com/install\nHTTP/2 302\nlocation: https://example.com/install.sh",
            },
            {
              kind: "code",
              label: "The edge rule",
              code: 'if (url.pathname === "/install") return Response.redirect(V1_INSTALLER, 302)',
            },
          ],
          more: "The redirect lives in a Cloudflare rule, outside git, so its date is inferred from when `/install` first answered 302.\n\nIt goes when #57158 merges: the v2 installer then serves `/install` itself.",
          ask: "none",
        },
      ],
    },
  ],
}

const status = (text: string) => console.info(`[walkthrough] ${text}`)

// ?review brings Kit's review tools (progress, notes, picks, Copy feedback); ?cards puts each
// step on a card; ?bar=docked keeps the note bar open.
const params = new URLSearchParams(location.search)
const w = walkthrough(document.getElementById("page")!, {
  ...uiLook(),
  doc,
  review: params.has("review"),
  cards: params.has("cards"),
  noteBar: params.get("bar") === "docked" ? "docked" : "collapsed",
  onFeedback: (fb) => status(`${fb.reviewed} of ${fb.total} reviewed`),
})

bindLookSwitch()
Object.assign(window, { __walkthrough: w })
