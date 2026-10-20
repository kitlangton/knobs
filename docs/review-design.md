# Review design system

The review pieces (`knobs/review`: walkthrough, compare, player, diff, history, facts, decision,
taste test) are pages an agent writes for a person to read and judge. They aren't the tuning
panel, so they have their own system: quiet, flat, true black, one type scale. The values live in
`src/review/foundations.ts`; the stylesheet, the catalog (`examples/review.html`) and the tests
read them from there.

Sources: Radix Colors' step roles and APCA targets, Vercel Geist's label/copy split, Linear's
2024 refresh (few variables, alpha of one neutral), Apple's HIG (group with space before lines),
Josh Puckett's Interface Craft, and Kit's motion rules.

## Look

- **The review theme is the default** (`themes.review`): Void's true black page and surface, flat,
  neutral. *Why: chrome next to a recording shouldn't tint it, and a page to read isn't glass.*
- **Page and surface are the same colour.** *Why: there's one surface per thing; space and
  hairlines do the grouping.*
- **Pass a theme to change it.** A piece inside a themed knobs element takes that element's theme.

## Type

- **The platform's own face**: `system-ui` first (SF Pro on Apple, Segoe UI Variable on Windows),
  then named fallbacks; mono is `ui-monospace` (SF Mono). *Why: SF Pro switches between its Text
  and Display optical sizes by itself, nothing downloads or swaps in on first paint, and the page
  reads like the native app it's reviewing. Inter and Geist are good, but on Apple screens they'd
  cost a download to look slightly less native.*
- **A webfont, when you want one**: `reviewFont(document, { href, sans })` loads the stylesheet
  and returns a theme with that face first. The features below apply to it too.
- **Five sizes, no others**: 20/28, 16/24, 13/20, 12/16, 11/16. *Why: Puckett's ≤ 5; neighbouring
  sizes that are close read as mistakes.* A test fails on any size or weight off the scale.
- **Two weights**, 400 and 500. *Why: light text on black blooms, so 500 already reads as bold.*
- **Every line height is a multiple of 4.** *Why: a 4 px baseline, so stacked blocks keep rhythm.*
- **Mono one step down** from what's around it (12 in body, 11 in small). *Why: mono glyphs look
  larger at the same size.*
- **Tracking follows size**: (13 − size) × 0.03 px, set once for every element, so 20 closes up,
  13 sits at 0 and 11 opens slightly. Mono never tracks. *Why: large type looks loose and small
  type cramped at the same spacing.*
- **Figures are tabular everywhere**; data adds `ss01` (straight 6 and 9 in SF, open digits in
  Inter). *Why: times and counts don't jitter, and digits in a column can't be misread.*
- **Code has no ligatures.** *Why: `=>` and `!=` should show what was typed.*
- **Titles balance, prose wraps pretty, quotes hang** (`text-wrap`, `hanging-punctuation`).
  *Why: no one-word last lines, and a column's text edge stays straight.*
- **Prose stops at 66ch.** *Why: 45–75 characters a line; media run wider than prose.*

## Space

- **A 4 px unit and six roles**: inside 4, sibling 8, title 12, block 24, group 48, section 96.
  *Why: each gap says how related two things are.*
- **From title up, each role at least doubles the last.** *Why: 12 next to 16 reads as an error.*
- **Within a group < between groups < between sections**, always. *Why: the eye reads gaps before
  lines.*
- **Spacing lives on the parent** (`gap`), never on children. *Why: removing a child never leaves
  a hole.*
- **One inner padding** for frames and wells (`pad-card`, 12). *Why: every bounded thing breathes
  the same.*

## Colour and lines

- **One neutral at fixed opacities**, one accent (white). *Why: one temperature; fills pick up
  what's behind them.*
- **Hairlines are set by contrast, not by feel**: APCA on the page, subtle ≈ Lc 9, default ≈ 12,
  strong ≈ 17, in dark and light. *Why: Void's 6% and 10% read Lc 0 on black, and Kit couldn't see
  them.* A test holds each to its band.
- **Hairlines are box-shadows**, never borders. *Why: they never add layout and stay crisp on any
  fill.*
- **Fills step 6 / 10 / 14%**: rest, hover, selected. *Why: a hover has to be visible without a
  glow.*
- **No box in a box.** A frame or well is the only bounded thing; what's inside uses hairlines and
  space. Nothing inside a card has both a fill and a ring. *Why: nested borders are noise.*
- **Status colour is for state only**, quiet: a tinted word or glyph, never a filled pill.

## Shape

- **Radii**: 8 for controls, 12 for frames, 4 for inline chips and 20 px rows. *Why: one family.*
- **Concentric**: what sits inside a frame takes the frame's radius less the gap between them.
- **A row's radius follows its height.** *Why: a 20 px pill at r 8 reads as a squashed capsule.*

## Interaction

- **The arrow cursor everywhere**, links included. *Why: the hover fill says what's live; the hand
  is noise.*
- **Hover is a background, on at once, off in 120 ms.** *Why: immediate feedback, no flicker when
  the pointer crosses rows.*
- **Clicking a video or a compare plays and pauses it**, as Space does. No glyph flashes over the
  picture. The play button stays.
- **Focus is a 1–2 px ring**, inset on rows. *Why: visible, and never shifts layout.*

## Motion

- **Springs are a duration and no bounce**: snappy .25 (controls), state .3 (selection pill,
  disclosure), calm .4 (layout, scrolling to a step), smooth .45 (full window).
- **Quick .16** for a whole thing replaced in place: fade, scale .98, 3 px blur.
- **Nothing moves on load.** The first frame is the resting state.
- **The hand is 1:1.** A scrub, a wipe or a drag never animates; a jump the hand didn't make catches
  up from where it is.
- **Reduced motion drops the travel** and keeps a short fade.
- **No hard edges**: anything clipped fades out over 16 px.

## Components

Each is in the catalog, alone and in its states, with when to use it.

| Piece | Use it for |
| --- | --- |
| Section header | A part of the page: a kicker (`PR 2 of 5`) over a 16/24 title |
| Step | One claim: a title, a sentence, then one piece of media |
| Compare | The same thing before and after: side by side, wiped or overlaid |
| Video | One recording, with chapters as segments of its line |
| Facts | A short list of term → value pairs: what you see, what happens, the evidence |
| Decision | N options side by side, one recommended, each with what changes |
| Taste test | The same, when Kit picks one |
| Table | Rows that share columns; stacks into facts when it's narrow |
| Stack | Pull requests in merge order, as a git graph |
| History | Dated spans on lanes: what was true when |
| Diff, code, terminal | Code, in one well |
| Metric | One number before and after |
| Callout | One sentence that has to be seen |
| Disclosure | The rest of a caption, folded away |
