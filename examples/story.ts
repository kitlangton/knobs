// The onboarding story (~/code/home/artifacts/2026-10-20-onboarding/story) rebuilt from knobs/review
// on a text budget: a one-sentence summary and three numbers up top, a claim and at most one
// sentence per section and step, then media; everything longer sits in `more`, folded away. The
// history is `kind: "history"`, which the walkthrough draws with history().
// The recordings are OpenCode's, so examples/assets/story is gitignored: copy them from the
// artifact's assets/ folder, or the page draws a placeholder where each one goes.
import {
  walkthrough,
  type Walkthrough,
  type WalkthroughDoc,
  type WalkthroughMedia,
  type HistoryData,
  type WalkthroughSection,
} from "knobs/review"

const asset = (name: string) => new URL(`./assets/story/${name}`, import.meta.url).href
const gh = (n: number) => ({
  label: `#${n}`,
  href: `https://github.com/anomalyco/opencode/pull/${n}`,
})
const commit = (sha: string) => ({ label: sha })

// ——— the history: real dates from the story's ledger, counted to Oct 20, 2026 ———

const HISTORY: HistoryData = {
  axis: { today: "2026-10-20" },
  states: {
    v1: { label: "v1, flow works", tone: "dim", tag: "" },
    next: { label: "v2 on @next only", tone: "warn" },
    broken: { label: "v2, flow broken", tone: "bad" },
    redirect: { label: "Redirected to v1", tone: "warn", tag: "v1" },
  },
  bands: [
    { from: "2026-04-01", to: "2026-06-26", label: "Built in v1" },
    { from: "2026-06-26", to: "2026-08-11", label: "Deleted in v2" },
    { from: "2026-08-11", label: "Shipped to users" },
  ],
  lanes: [
    { id: "code", label: "Code" },
    {
      id: "download",
      label: "opencode.ai/download",
      spans: [
        { from: "2026-04-01", to: "2026-09-19", state: "v1", title: "The website served v1" },
        {
          from: "2026-09-19",
          state: "broken",
          title: "The website switched to v2",
          detail:
            "The main website's downloads moved to v2 Desktop, which has no free-limit dialog and no Go sign-in.",
          provenance: "verified",
          source: "git",
          evidence: [gh(49874), gh(49984)],
          step: "fix-57466",
        },
      ],
    },
    {
      id: "v2-install",
      label: "opencode.ai/v2/install",
      spans: [
        {
          from: "2026-08-11",
          state: "broken",
          title: "The v2 installer and Desktop Beta went live",
          detail:
            "The v2 curl script and Desktop Beta shipped without the limit flow. On a fresh Mac the script also can't put `opencode` on PATH because there's no `~/.zshrc`.",
          provenance: "verified",
          source: "git",
          evidence: [gh(41626), commit("51512862a5")],
          step: "fix-57348",
        },
      ],
    },
    {
      id: "npm",
      label: "npm @opencode-ai/cli",
      spans: [
        { from: "2026-04-01", to: "2026-06-26", state: "v1", title: "npm served v1" },
        {
          from: "2026-06-26",
          to: "2026-09-11",
          state: "next",
          title: "v2 went out on @next",
          detail:
            "The v2 TUI rewrite shipped on the `@next` tag without the limit handling; `@latest` stayed on v1.",
          provenance: "verified",
          source: "git",
          evidence: [commit("e6f660fecf")],
          step: "fix-57467",
        },
        {
          from: "2026-09-11",
          state: "broken",
          title: "v2.0.0 became @latest",
          detail:
            "Publishing v2.0.0 as stable moved `@latest` and auto-update to v2 for every npm user.",
          provenance: "verified",
          source: "git",
          evidence: [gh(48546), commit("654f411a5b")],
          step: "fix-57467",
        },
      ],
    },
    {
      id: "brew",
      label: "brew opencode-v2",
      spans: [
        {
          from: "2026-09-19",
          state: "broken",
          title: "Homebrew serves v2",
          detail: "The `anomalyco/tap/opencode-v2` formula installs v2.0.35.",
          step: "fix-57471",
        },
      ],
    },
    {
      id: "install",
      label: "opencode.ai/install",
      spans: [
        { from: "2026-04-01", to: "2026-09-19", state: "v1", title: "/install served v1" },
        {
          from: "2026-09-19",
          state: "redirect",
          title: "/install still redirects to v1",
          detail:
            "A Cloudflare rule sends `/install` to the v1 script (1.14.19). The rule isn't in git, so its start is unknown; the bar starts when the website moved to v2.",
          provenance: "inferred",
          source: "edge",
          evidence: [gh(57158)],
          step: "fix-57158",
        },
      ],
    },
  ],
  events: [
    {
      date: "2026-04-09",
      type: "commit",
      tone: "good",
      title: "TUI Go upsell and free-limit check shipped",
      detail: "Added `dialog-go-upsell.tsx` and parsed `FreeUsageLimitError` in `retry.ts`.",
      provenance: "verified",
      source: "git",
      evidence: [gh(21583), commit("489f57974d")],
      step: "fix-57146",
    },
    {
      date: "2026-04-16",
      type: "commit",
      tone: "good",
      title: "Animated GO logo added to the TUI modal",
      detail: "Added the animated GO header and the radial background pulse.",
      provenance: "verified",
      source: "git",
      evidence: [gh(22976), commit("cccb907a9b")],
      step: "fix-57471",
    },
    {
      date: "2026-05-18",
      type: "commit",
      tone: "good",
      title: "Desktop free-limit dialog shipped",
      detail: "Added `dialog-usage-exceeded.tsx` with a Subscribe to Go button.",
      provenance: "verified",
      source: "git",
      evidence: [gh(27677), commit("f80f3e33ec")],
      step: "fix-57466",
    },
    {
      date: "2026-06-26",
      type: "deletion",
      title: "The v2 TUI rewrite dropped the limit handling",
      detail:
        "The new `session/index.tsx` had no `free_tier_limit` handling, so `DialogRetryAction` and its status listener went.",
      provenance: "verified",
      source: "git",
      evidence: [commit("e6f660fecf")],
      step: "fix-57467",
    },
    {
      date: "2026-07-20",
      type: "deletion",
      title: "retry.ts and its 440-line test deleted",
      detail:
        "Deleting `packages/opencode` removed `retry.ts` and `retry.test.ts`. Nothing in the repo sent `free_tier_limit` after this.",
      provenance: "verified",
      source: "git",
      evidence: [commit("44b6938b2a")],
      step: "fix-57146",
    },
    {
      date: "2026-07-30",
      type: "deletion",
      title: "A dead-code sweep deleted the TUI modal",
      detail: "Removed `dialog-retry-action.tsx` and `bg-pulse.tsx` as unused after Jun 26.",
      provenance: "verified",
      source: "git",
      evidence: [gh(39699), commit("0ffec67ca3")],
      step: "fix-57471",
    },
    {
      date: "2026-08-11",
      type: "release",
      tone: "warn",
      title: "Desktop Beta and the v2 installer went live",
      provenance: "verified",
      source: "git",
      evidence: [gh(41626), commit("51512862a5")],
    },
    {
      date: "2026-08-21",
      type: "commit",
      tone: "warn",
      title: "Desktop dialog copied into v2, listening for a dead string",
      detail: "It compiled because `status.reason` was typed as `string | undefined`.",
      provenance: "verified",
      source: "git",
      evidence: [gh(43637), commit("384cff3768")],
      step: "blind-spot-warm",
    },
    {
      date: "2026-09-11",
      type: "release",
      tone: "bad",
      title: "v2.0.0 published as stable",
      detail: "`@latest` and auto-update moved to v2.",
      provenance: "verified",
      source: "git",
      evidence: [gh(48546), commit("654f411a5b")],
    },
    {
      date: "2026-10-14",
      to: "2026-10-16",
      type: "audit",
      tone: "bad",
      title: "Cold start picked a retired free model",
      detail:
        "v2.0.25 to v2.0.29 picked the deprecated `opencode/exo-free` after the models-snapshot workflow was dropped on Oct 10. Fixed in v2.0.31.",
      provenance: "verified",
      source: "git",
      evidence: [gh(55783)],
      step: "fix-57148",
    },
  ],
}

// ——— media, with a placeholder for any recording that isn't here ———

const present = async (url: string) => {
  try {
    const r = await fetch(url, { method: "HEAD" })
    return r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")
  } catch {
    return false
  }
}

const placeholder = (names: readonly string[], aspect: string): WalkthroughMedia => ({
  kind: "mount",
  mount: (host) => {
    const box = document.createElement("div")
    box.className = "story-missing"
    box.style.setProperty("--aspect", aspect.replace("/", " / "))
    box.append("Recording not in this checkout")
    for (const n of names) {
      const code = document.createElement("code")
      code.textContent = `assets/story/${n}`
      box.append(code)
    }
    host.append(box)
  },
})

interface Pair {
  readonly before: string
  readonly after: string
  readonly beforeLabel: string
  readonly afterLabel: string
  readonly aspect: string
}

async function compare(p: Pair): Promise<WalkthroughMedia> {
  const [a, b] = await Promise.all([present(asset(p.before)), present(asset(p.after))])
  if (!a || !b) return placeholder([...(a ? [] : [p.before]), ...(b ? [] : [p.after])], p.aspect)
  return {
    kind: "compare",
    before: { src: asset(p.before), label: p.beforeLabel },
    after: { src: asset(p.after), label: p.afterLabel },
    aspect: p.aspect,
  }
}

let page: Walkthrough | null = null

const historyMedia: WalkthroughMedia = {
  kind: "history",
  label: "How long onboarding has been broken",
  ...HISTORY,
}

// `more` (folded Markdown under a summary or caption) is landing on sections in the walkthrough;
// the intersection keeps this compiling against a walkthrough without it.
type Section = WalkthroughSection & { readonly more?: string }

async function buildDoc(): Promise<WalkthroughDoc> {
  const [limitToday, picker, desktop, tui, connect] = await Promise.all([
    compare({
      before: "tui-today.mp4",
      after: "tui-upsell.mp4",
      beforeLabel: "v2 today",
      afterLabel: "v1, restored in #57471",
      aspect: "1872/1152",
    }),
    compare({
      before: "57148-picker-before.mp4",
      after: "57148-picker-after.mp4",
      beforeLabel: "Before",
      afterLabel: "After #57148",
      aspect: "1100/900",
    }),
    compare({
      before: "04-desktop-free-limit.png",
      after: "57146-desktop-dialog.png",
      beforeLabel: "Before",
      afterLabel: "After #57466",
      aspect: "16/10",
    }),
    compare({
      before: "04-tui-free-limit.png",
      after: "57146-tui-line.png",
      beforeLabel: "Before",
      afterLabel: "After #57467",
      aspect: "16/10",
    }),
    compare({
      before: "57155-connect-before.mp4",
      after: "57155-connect-after.mp4",
      beforeLabel: "Before",
      afterLabel: "After #57155",
      aspect: "2052/1224",
    }),
  ])

  const sections: Section[] = [
    {
      id: "problem",
      title: "New users hit the broken flow today",
      summary:
        "Someone with no API keys on a fresh Mac runs into four failures in their first ten minutes.",
      more: "Half the free models are missing until a restart. The free limit wipes the prompt and shows raw error text. Connecting OpenCode Go asks for a pasted API key. On a fresh Mac the installer can't put `opencode` on PATH because there's no `~/.zshrc`.",
      steps: [
        {
          id: "problem-channels",
          title: "Five of six install paths ship the broken v2",
          caption: "Only `/install` still serves v1, through a Cloudflare redirect.",
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
                state: { text: "Broken", badge: "bad", step: "fix-57466" },
              },
              {
                path: "opencode.ai/v2/install",
                serves: "v2 CLI",
                since: "Aug 11",
                state: { text: "Broken", badge: "bad", step: "fix-57348" },
              },
              {
                path: "npm",
                serves: "v2 CLI",
                since: "Sep 11",
                state: { text: "Broken", badge: "bad", step: "fix-57467" },
              },
              {
                path: "brew",
                serves: "v2 CLI",
                since: "Sep 19",
                state: { text: "Broken", badge: "bad", step: "fix-57471" },
              },
              {
                path: "opencode.ai/install",
                serves: "v1 CLI",
                since: "",
                state: { text: "Wrong major", badge: "warn", step: "fix-57158" },
              },
              {
                path: "GitHub latest",
                serves: "v1.19.3",
                since: "",
                state: { text: "Split", badge: "warn" },
              },
            ],
          },
          more: "GitHub still marks v1.19.3 as the latest release because v2 is flagged as a prerelease. The original table lists Sep 7 for `/v2/install`; Aug 11 is the commit that put the v2 curl script live (#41626). Every v2 path serves v2.0.35.",
        },
        {
          id: "problem-limit",
          title: "Hitting the free limit wipes the prompt",
          caption: "v2 today on the left, v1's flow on the right.",
          ask: "none",
          media: limitToday,
          more: "v2 treats Zen's `429 FreeUsageLimitError` as a generic API error. The composer clears the prompt, the TUI shows a red `Session failed` toast with raw URLs, Desktop shows a grey error box, and the `Retry-After` reset time is dropped.",
        },
      ],
    },
    {
      id: "timeline",
      title: "It's been broken since August",
      summary:
        "v1 built the flow in April and May, v2 deleted it from June, and users started getting v2 on August 11.",
      steps: [
        {
          id: "timeline-chart",
          title: "Built in April, deleted in June, shipped from August",
          caption: "Each bar is an install path; click one, or a mark, for its evidence.",
          ask: "none",
          media: historyMedia,
          more: "Every date comes from git history and GitHub releases except the Cloudflare `/install` redirect, which lives outside git and is drawn as inferred. Days are counted to Oct 20, 2026.",
        },
      ],
    },
    {
      id: "blind-spot",
      title: "Team machines never hit it",
      summary: "Each failure needs a machine with no saved state, and every team machine has some.",
      steps: [
        {
          id: "blind-spot-warm",
          title: "A fresh Mac has none of what team machines have",
          ask: "none",
          media: {
            kind: "table",
            columns: [
              { key: "what", label: "" },
              { key: "team", label: "Team machine" },
              { key: "fresh", label: "Fresh Mac" },
            ],
            rows: [
              { what: "Provider keys", team: "Saved", fresh: "None, so Zen Free and its limit" },
              { what: "Model catalog", team: "Cached", fresh: "Stale bundled snapshot" },
              { what: "Shell profile", team: "~/.zshrc exists", fresh: "No ~/.zshrc, so no PATH" },
              { what: "OpenCode Go", team: "Signed in", fresh: "Asked for an API key" },
            ],
          },
          more: 'Desktop\'s limit dialog was copied into v2 on Aug 21 and listened for `status.reason === "free_tier_limit"`. Nothing in v2 had sent that string since Jul 20, when deleting `packages/opencode` removed `retry.ts` and its 440-line test. The check compiled because `reason` was typed as `string | undefined`.',
        },
      ],
    },
    {
      id: "fixes",
      title: "Nine PRs bring the flow back",
      summary: "Two are merged and seven are drafts with green CI.",
      steps: [
        {
          id: "fixes-order",
          title: "Merge in this order",
          caption: "The last four stack on `#57146`.",
          ask: "none",
          media: {
            kind: "stack",
            base: "dev",
            items: [
              {
                pr: 57148,
                stepId: "fix-57148",
                title: "Send catalog refreshes to every session",
                branch: "models-dev-refresh → dev",
                delta: { add: 47, del: 1 },
                status: "Merged",
                tone: "good",
              },
              {
                pr: 57151,
                stepId: "fix-57148",
                title: "Open /models on the current model",
                branch: "tui-models-order → dev",
                delta: { add: 49, del: 35 },
                status: "Merged",
                tone: "good",
              },
              {
                pr: 57158,
                title: "Serve v2 at /install",
                branch: "install-v2-url → dev",
                delta: { add: 17, del: 7 },
                status: "Draft",
                tone: "warn",
              },
              {
                pr: 57348,
                title: "Create ~/.zshrc when it's missing",
                branch: "install-create-zshrc → dev",
                delta: { add: 12, del: 0 },
                status: "Draft",
                tone: "good",
              },
              {
                pr: 57155,
                stepId: "fix-57155",
                title: "Sign in to OpenCode Go with your account",
                branch: "opencode-go-oauth → dev",
                delta: { add: 1394, del: 44 },
                status: "Draft",
                tone: "good",
              },
              {
                pr: 57146,
                title: "Typed free-limit error with a reset time",
                branch: "free-limit-card → dev",
                delta: { add: 193, del: 8 },
                status: "Draft",
                tone: "good",
              },
              {
                pr: 57466,
                stepId: "fix-57466",
                title: "Restore the Desktop limit dialog",
                branch: "free-limit-desktop → free-limit-card",
                delta: { add: 446, del: 47 },
                status: "Draft",
                tone: "good",
              },
              {
                pr: 57467,
                stepId: "fix-57467",
                title: "Calm TUI notice, prompt kept",
                branch: "free-limit-tui-notice → free-limit-card",
                delta: { add: 283, del: 5 },
                status: "Draft",
                tone: "good",
              },
              {
                pr: 57471,
                stepId: "fix-57467",
                title: "Restore the animated Go modal",
                branch: "free-limit-tui-modal → free-limit-tui-notice",
                delta: { add: 926, del: 21 },
                status: "Draft",
                tone: "good",
              },
            ],
          },
          more: "`#57158` needs the Cloudflare `/install` redirect removed when it merges. `#57348` creates `~/.zshrc` on a fresh Mac before the installer appends to PATH. `#57146` turns Zen's free-usage 429 into a typed `provider.free-limit` error with a reset time capped at 7 days, which the next three build on.",
        },
        {
          id: "fix-57148",
          title: "All four free models show on first launch",
          caption: "`#57148` sends the refreshed catalog to every open session.",
          ask: "none",
          media: picker,
          more: "Without a cached `models.json`, OpenCode booted from the bundled snapshot and showed two of the four Zen Free models until the next launch. `#57151` also opens `/models` on the current model and keeps the server's order.",
        },
        {
          id: "fix-57466",
          title: "Desktop keeps the prompt and offers Go",
          caption: "`#57466` restores the limit dialog and puts the prompt back.",
          ask: "none",
          media: desktop,
          more: "The dialog opens once a day. Later hits show a quiet notice with the reset time, and signing in to Go keeps you in the same session.",
        },
        {
          id: "fix-57467",
          title: "The TUI shows a calm notice instead of a red toast",
          caption: "`#57467` keeps the prompt, and `#57471` brings back the Go modal.",
          ask: "none",
          media: tui,
          more: "The notice reads `Free usage limit reached · resets at 5:00 PM`. `#57471` restores v1's animated GO modal, shown once a day when the composer is empty and account sign-in is available.",
        },
        {
          id: "fix-57155",
          title: "OpenCode Go signs in with your OpenCode account",
          caption: "`#57155` replaces the pasted API key with sign-in.",
          ask: "none",
          media: connect,
          more: "OpenCode Console and OpenCode Go share one account credential, and the Go row says whether it's using your account or a Go API key.",
        },
      ],
    },
    {
      id: "guardrails",
      title: "Four checks so it doesn't happen again",
      steps: [
        {
          id: "guardrail-checks",
          title: "Each gap gets a check",
          ask: "none",
          media: {
            kind: "table",
            columns: [
              { key: "gap", label: "What slipped" },
              { key: "check", label: "Check" },
              { key: "where", label: "Where", align: "right" },
            ],
            rows: [
              {
                gap: "Nobody ran it as a new user",
                check: "Fresh-user test with an empty HOME",
                where: { text: "Every PR", badge: "good" },
              },
              {
                gap: "A string check with no sender",
                check: "Typed SDK errors and a contract test",
                where: { text: "CI", badge: "good" },
              },
              {
                gap: "A test deleted with its package",
                check: "Port tests before deleting a package",
                where: { text: "Checklist", badge: "info" },
              },
              {
                gap: "/install drifted from git",
                check: "Curl each public install URL",
                where: { text: "Release", badge: "good" },
              },
            ],
          },
          more: "The fresh-user test runs in under 15 seconds. It starts OpenCode with no `auth.json`, `models.json` or `~/.zshrc` against a mock Zen server, retires a model with a 410, fails the next request with a free-limit 429, and checks that the prompt comes back and the limit dialog opens.",
        },
      ],
    },
  ]

  return {
    id: "2026-10-20-onboarding-story-knobs",
    title: "How OpenCode's onboarding broke, and how we're fixing it",
    summary:
      "The v2 rewrite dropped v1's free-limit and OpenCode Go flow, five of six install paths now ship v2, and nine PRs bring the flow back.",
    meta: {
      "Broken on opencode.ai": "31 days",
      "Install paths broken": "5 of 6",
      "Fix PRs": "9, 2 merged",
    },
    sections,
  }
}

void buildDoc().then((doc) => {
  page = walkthrough(document.getElementById("page")!, { doc, appearance: "dark" })
  Object.assign(window, { __story: page })
})
