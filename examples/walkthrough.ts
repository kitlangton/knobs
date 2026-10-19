// A walkthrough from knobs/ui: the onboarding PRs' before/after page (2026-10-19), written as the
// plain document an agent would emit, with a feed of updates and an answer at the top, plus the
// rest of the kit: a taste test, a code diff, metrics, a terminal block. Kit's notes (typed,
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
  summary:
    "Before = `dev`, after = the PR branch. #57158 (installer redirect) has no video: curl output is in its PR body.",
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
  qa: [
    {
      at: "2026-10-19T12:10:00-07:00",
      q: "Why is there no video for #57158?",
      a: "It's the installer redirect: nothing to watch. The curl output is in its PR body.",
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
          caption:
            "Real dev server + desktop app. The bundled snapshot is made stale (3 models not yet marked deprecated), then models.dev refreshes ~9s in. Reopen the picker after the refresh.",
          media: pair("57148-picker", "#57148", DESKTOP_PICKER),
        },
        {
          title: "Retired model (HTTP 410), desktop",
          caption:
            "Real dev server + desktop app, with a mock provider that answers 410 Gone. After: a card with **Pick another model** (opens the model picker) and the prompt back in the composer.",
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
      status: "needs-taste",
      summary:
        "Not from the audit: made-up steps that show the other pieces. A taste test, a code diff, a metric and a terminal block.",
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
          title: "Installer redirect",
          caption: "A terminal block for evidence that isn't a video.",
          media: {
            kind: "terminal",
            code: "$ curl -sI https://example.com/install\nHTTP/2 302\nlocation: https://example.com/install.sh",
          },
          ask: "none",
        },
      ],
    },
  ],
}

const status = (text: string) => console.info(`[walkthrough] ${text}`)

const w = walkthrough(document.getElementById("page")!, {
  ...uiLook(),
  doc,
  onFeedback: (fb) => status(`${fb.reviewed} of ${fb.total} reviewed`),
})

bindLookSwitch()
Object.assign(window, { __walkthrough: w })
