import { springCss } from "../core/spring.js"
import { FADE, SPRINGS } from "../core/motion.js"
import { foundationCss } from "../review/foundations.js"

// kit-motion: nothing moves on load; state changes ease on springs given as a duration with no
// bounce: picks and note rows on the snappy .25 s, the progress bar on the calm .4 s, a
// disclosure's caret on the state spring .3 s (the contents' and chapters' selection pill, the
// page's scroll and full-window spring in script). Reduced motion keeps short fades and drops the
// travel.
const snappy = springCss(SPRINGS.snappy)
const calm = springCss(SPRINGS.calm)
const state = springCss(SPRINGS.default)
const quick = springCss(FADE)

// The walkthrough: a page an agent writes for Kit. A sticky contents rail at the left edge and a
// column centred beside it of blocks (the intro, the updates, each section) a section's room
// apart with a hairline in the middle, and a note launcher in the corner. Steps aren't boxes:
// space and hairlines group them, and only media frames and code wells are bounded (with cards,
// each step is one .knobs-surface and nothing inside draws a fill and a ring of its own). Rhythm
// and type come from the page tokens (--k-space-*, --k-pad-*, --k-type-*, --k-leading-*);
// spacing lives on parents.
const fade = "-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent)"
export const walkthroughCss = `${foundationCss}
:where(.knobs-walkthrough,.knobs-walkthrough *,.knobs-wt-slot,.knobs-wt-slot *){box-sizing:border-box}
.knobs-ui:is(.knobs-walkthrough,.knobs-wt-slot){--k-glass:0;--k-glow:0;--kw-quick:${quick.easing};--kw-quick-ms:${quick.duration}ms}
.knobs-ui.knobs-walkthrough{--kw-snappy:${snappy.easing};--kw-snappy-ms:${snappy.duration}ms;--kw-calm:${calm.easing};--kw-calm-ms:${calm.duration}ms;--kw-state:${state.easing};--kw-state-ms:${state.duration}ms;--kw-quick:${quick.easing};--kw-quick-ms:${quick.duration}ms;
  --kw-measure:var(--_kr-measure);--kw-width:var(--k-walkthrough-width,960px);--kw-rail-w:220px;--kw-rail-gap:calc(var(--_k-space-group) + var(--_k-space-column) / 1.5);--kw-good:var(--k-walkthrough-good,var(--_k-ok));--kw-info:var(--k-walkthrough-info,var(--_k-info));
  --kw-card:var(--_ku-pane-bg);--kw-card-ring:var(--_ku-pane-ring);--kw-under:var(--_k-bg-page);--kw-ink:var(--k-walkthrough-ink,#ff375f);--kw-strong:var(--_k-weight-label);
  container:knobs-wt / inline-size;display:block;width:100%;color:var(--_k-fg);font:var(--_k-weight) var(--_k-type-body)/var(--_k-leading-body) var(--_k-font);font-variant-numeric:tabular-nums;text-align:left;
  letter-spacing:var(--_kr-track);-webkit-font-smoothing:antialiased}
.knobs-walkthrough [hidden]{display:none!important}
/* Prose: wrapped to look set by hand, quotes hung in the margin (Safari). Data: figures that line
   up and can't be misread. */
:where(.knobs-wt-summary,.knobs-wt-ssum,.knobs-wt-caption,.knobs-wt-more-text,.knobs-wt-fi-text,.knobs-wt-fi-answer,.knobs-wt-ocap,.knobs-wt-text,.knobs-wt-callout,.knobs-wt-ssummary,.knobs-wt-osum){text-wrap:pretty;hanging-punctuation:first allow-end last}
:where(.knobs-wt-table table,.knobs-wt-tterms,.knobs-wt-facts,.knobs-wt-smeta,.knobs-wt-metaline,.knobs-wt-meta,.knobs-wt-pr,.knobs-wt-prstate,.knobs-wt-sord){font-feature-settings:var(--_kr-data)}
/* (0,0,1): a host's element rules stop here, and every class rule below wins over it. */
:where(.knobs-walkthrough) :is(h1,h2,h3,p,ol,ul,dl,dd){margin:0;font:inherit;letter-spacing:var(--_kr-track)}
.knobs-walkthrough a{cursor:default;color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:2px;transition:text-decoration-color calc(var(--_k-hover-out) * 1ms)}
.knobs-walkthrough a:hover{text-decoration-color:currentColor;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-walkthrough code,.knobs-wt-slot code{font:var(--_k-type-label) var(--_k-mono);padding:1px 5px;border-radius:calc(var(--_k-radius) / 2);background:var(--_k-fill)}
:where(.knobs-ui) :is(.knobs-wt-btn,.knobs-wt-pick,.knobs-wt-toc-row,button.knobs-wt-stitle,.knobs-wt-chapter,.knobs-wt-disc-toggle){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:var(--_kr-track);
  background:transparent;border:0;border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}

/* ——— layout: the contents rail sticky at the left edge (right if asked), and the column centred
   in the room beside it, up to --kw-width: media take the column, prose stops at the measure.
   One column where it's narrow ——— */
.knobs-wt-layout{display:grid;grid-template-columns:var(--kw-rail-w) minmax(0,1fr);gap:var(--kw-rail-gap);align-items:start}
.knobs-walkthrough[data-rail="right"] .knobs-wt-layout{grid-template-columns:minmax(0,1fr) var(--kw-rail-w)}
.knobs-walkthrough[data-rail="right"] .knobs-wt-main{grid-column:1;grid-row:1}
.knobs-walkthrough[data-rail="right"] .knobs-wt-rail{grid-column:2;grid-row:1}
.knobs-walkthrough[data-rail="none"] .knobs-wt-layout{grid-template-columns:minmax(0,1fr)}
.knobs-wt-main{justify-self:center;width:100%;max-width:var(--kw-width);display:flex;flex-direction:column;gap:var(--_k-space-group);min-width:0;padding-bottom:12px}
/* The intro, the updates and each section: a section's room apart, the hairline in the middle. */
.knobs-wt-flow{display:flex;flex-direction:column;gap:calc(var(--_k-space-section) / 2);min-width:0}
.knobs-wt-flow>*+*{padding-top:calc(var(--_k-space-section) / 2);box-shadow:inset 0 1px 0 var(--_k-border-subtle)}
@container knobs-wt (max-width:960px){.knobs-walkthrough[data-rail] .knobs-wt-layout{grid-template-columns:minmax(0,1fr);gap:var(--_k-space-title)}
  .knobs-walkthrough[data-rail] .knobs-wt-layout>*{grid-column:auto;grid-row:auto}}

/* ——— one line of facts: small, faint, joined by ·, its trailing edge fading ——— */
.knobs-wt-metaline{display:flex;align-items:baseline;gap:var(--_k-space-inside);min-width:0;overflow:hidden;white-space:nowrap;font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3);${fade}}
.knobs-wt-metaline>*{flex:none}
.knobs-wt-metaline>*+*::before{content:"·";margin-right:var(--_k-space-inside);color:var(--_k-fg-3)}
.knobs-walkthrough .knobs-wt-metaline a:not(.knobs-wt-pr){display:inline-flex;align-items:baseline;color:inherit;text-decoration:none;transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-walkthrough .knobs-wt-metaline a:not(.knobs-wt-pr):hover{color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-metaline svg{align-self:center;width:12px;height:12px;margin-left:2px}
/* A pull request or issue: a capsule, its state's icon and number in a quiet tint of the state
   (open the success hue, merged the violet series, draft and closed faint, unknown neutral; a
   closed issue is done, so violet), a faint check where its checks pass, its title on hover. */
.knobs-ui .knobs-wt-pr{--kw-pr:var(--_k-fg-2);display:inline-flex;align-items:center;gap:3px;height:18px;padding:0 6px 0 5px;margin:0 1px;border-radius:9px;vertical-align:1px;
  background:color-mix(in oklch,var(--kw-pr) 12%,transparent);color:var(--kw-pr);font:var(--_k-weight-label) var(--_k-type-small)/1 var(--_k-font);font-variant-numeric:tabular-nums;white-space:nowrap;text-decoration:none;
  transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-pr[data-state="open"]{--kw-pr:color-mix(in oklch,var(--_k-ok) 60%,var(--_k-fg-2))}
.knobs-ui .knobs-wt-pr[data-state="merged"]{--kw-pr:color-mix(in oklch,var(--_k-series-5) 60%,var(--_k-fg-2))}
.knobs-ui .knobs-wt-pr:is([data-state="draft"],[data-state="closed"]){--kw-pr:var(--_k-fg-3)}
.knobs-ui .knobs-wt-pr[data-kind="issue"][data-state="closed"]{--kw-pr:color-mix(in oklch,var(--_k-series-5) 60%,var(--_k-fg-2))}
.knobs-ui .knobs-wt-pr .knobs-wt-prchecks{margin-left:0}
.knobs-ui a.knobs-wt-pr:is(:hover,:focus-visible){background:color-mix(in oklch,var(--kw-pr) 22%,transparent);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-pr svg{flex:none}
.knobs-wt-metaline .knobs-wt-pr{align-self:center;margin:0}
.knobs-wt-kicker-lead{color:var(--_k-fg);font-weight:var(--kw-strong)}
.knobs-wt-metaline [data-status="on"]{color:var(--_k-fg)}
.knobs-wt-metaline [data-status="warn"]{color:var(--_k-warn)}

/* ——— the page's head ——— */
.knobs-wt-head{display:flex;flex-direction:column;gap:var(--_k-space-title)}
.knobs-wt-title{font-size:var(--_k-type-heading)!important;line-height:var(--_k-leading-heading);font-weight:var(--kw-strong)!important;text-wrap:balance}
.knobs-wt-summary{max-width:var(--kw-measure);color:var(--_k-fg-2);text-wrap:pretty}
.knobs-wt-meta{display:flex;flex-wrap:wrap;gap:var(--_k-space-inside) var(--_k-space-title);color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small)}
.knobs-wt-meta>span{display:inline-flex;gap:var(--_k-space-inside);white-space:nowrap}
.knobs-wt-meta b{font-weight:var(--_k-weight);color:var(--_k-fg-2);font-family:var(--_k-mono)}

/* ——— a section: a PR or topic. Its kicker leads the meta line, its title under it (16/24, under
   the page's 20/28), both on the column's edge ——— */
.knobs-wt-section{display:flex;flex-direction:column;gap:var(--_k-space-group);min-width:0}
.knobs-wt-sintro{display:flex;flex-direction:column;gap:var(--_k-space-title);min-width:0}
.knobs-wt-shead{display:flex;flex-direction:column;gap:var(--_k-space-inside);min-width:0;scroll-margin-top:16px}
.knobs-wt-heading{font-size:var(--_k-type-title)!important;line-height:var(--_k-leading-title);font-weight:var(--kw-strong)!important;text-wrap:balance}
.knobs-wt-ssum{max-width:var(--kw-measure);color:var(--_k-fg-2);text-wrap:pretty}
.knobs-wt-chip{display:inline-flex;align-items:center;gap:6px;height:20px;padding:0 6px 0 5px;border-radius:var(--_k-round);font-size:var(--_k-type-small);font-weight:var(--kw-strong);white-space:nowrap;
  --kw-tone:var(--_k-fg-2);color:var(--kw-tone);background:color-mix(in srgb,var(--kw-tone) 14%,transparent)}
.knobs-wt-chip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="good"]{--kw-tone:var(--kw-good)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="warn"]{--kw-tone:var(--_k-warn)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="bad"]{--kw-tone:var(--_k-danger)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="info"]{--kw-tone:var(--kw-info)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="dim"]{--kw-tone:var(--_k-fg-2)}

/* ——— a step: on the page by default, a group's room between steps with a hairline in the middle;
   or (cards) one card each, the one surface its pieces sit on ——— */
.knobs-walkthrough:not([data-cards]) .knobs-wt-step:not([data-full]){padding:0;border-radius:0;background:transparent;box-shadow:none}
.knobs-walkthrough:not([data-cards]) .knobs-wt-step+.knobs-wt-step::before{content:"";position:absolute;left:0;right:0;top:calc(var(--_k-space-group) / -2);height:1px;background:var(--_k-border-subtle);pointer-events:none}
.knobs-wt-step{position:relative;display:flex;flex-direction:column;gap:var(--_k-space-title);padding:var(--_k-pad-card);border-radius:var(--_k-radius-panel);background:var(--kw-card);box-shadow:var(--kw-card-ring);
  scroll-margin-top:16px;outline:none;container:knobs-wt-step / inline-size}
.knobs-walkthrough[data-cards]{--kw-under:var(--kw-card)}
.knobs-walkthrough[data-cards][data-frame="flat"] .knobs-wt-step{box-shadow:inset 0 0 0 1px var(--_k-border)}
.knobs-wt-step-head{display:flex;flex-direction:column;gap:var(--_k-space-inside);min-width:0}
.knobs-wt-stepTitle{min-width:0;font-weight:var(--kw-strong)!important;text-wrap:balance}
.knobs-wt-caption{max-width:var(--kw-measure);color:var(--_k-fg-2);text-wrap:pretty}
.knobs-wt-question{font-weight:var(--kw-strong)!important;max-width:var(--kw-measure)}
.knobs-wt-media{display:grid;grid-template-columns:repeat(var(--kw-n,1),minmax(0,1fr));gap:var(--_k-space-group) var(--_k-space-column);min-width:0}
@container knobs-wt-step (max-width:640px){.knobs-wt-media{grid-template-columns:minmax(0,1fr)}}

/* ——— the feed: updates and answers, newest first. Tight inside an item (4 / 8 / 4), a group's
   room between items with the hairline in the middle; no boxes ——— */
.knobs-wt-feed{display:flex;flex-direction:column;gap:var(--_k-space-title);min-width:0;scroll-margin-top:16px}
.knobs-wt-feed-head{display:flex;align-items:baseline;gap:var(--_k-space-sibling)}
.knobs-wt-feed-title{font-weight:var(--kw-strong)!important}
.knobs-wt-feed-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--_k-space-group);min-width:0}
.knobs-wt-fi{position:relative;display:flex;flex-direction:column;gap:var(--_k-space-sibling);min-width:0}
.knobs-wt-fi+.knobs-wt-fi::before{content:"";position:absolute;left:0;right:0;top:calc(var(--_k-space-group) / -2);height:1px;background:var(--_k-border-subtle)}
.knobs-wt-fi-q,.knobs-wt-fi-a{display:flex;flex-direction:column;gap:var(--_k-space-inside);min-width:0}
.knobs-wt-fi-ask{max-width:var(--kw-measure);color:var(--_k-fg);font-weight:var(--kw-strong);text-wrap:pretty}
.knobs-wt-fi-text{max-width:var(--kw-measure);color:var(--_k-fg);text-wrap:pretty}
.knobs-wt-fi-answer{max-width:var(--kw-measure);color:var(--_k-fg-2);text-wrap:pretty}
:where(.knobs-ui) .knobs-wt-fi-step{all:revert;box-sizing:border-box;font:inherit;color:inherit;background:transparent;border:0;margin:0;padding:0;cursor:default;outline:none;
  transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-fi-step:is(:hover,:focus-visible){color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}

/* ——— a disclosure: a small faint toggle with a caret, no fill. The body's height springs (in
   script) and its content fades in place, top-anchored, under a soft bottom mask ——— */
.knobs-wt-disc{display:flex;flex-direction:column;min-width:0}
.knobs-ui .knobs-wt-disc-toggle{display:inline-flex;align-items:center;gap:var(--_k-space-inside);width:max-content;height:20px;color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);cursor:default;
  border-radius:calc(var(--_k-radius) / 2);transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-disc-toggle:is(:hover,:focus-visible),.knobs-wt-disc[data-open]>.knobs-wt-disc-toggle{color:var(--_k-fg-2);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-disc-toggle:focus-visible{box-shadow:0 0 0 2px var(--_k-focus)}
.knobs-wt-disc-toggle svg{flex:none;width:12px;height:12px;transition:rotate var(--kw-state-ms) var(--kw-state)}
.knobs-wt-disc[data-open]>.knobs-wt-disc-toggle svg{rotate:90deg}
.knobs-wt-disc-body{overflow:hidden}
.knobs-wt-disc[data-open]>.knobs-wt-disc-body:not([data-moving]){overflow:visible}
.knobs-wt-disc-body[data-moving]{-webkit-mask-image:linear-gradient(#000 calc(100% - 16px),transparent);mask-image:linear-gradient(#000 calc(100% - 16px),transparent)}
.knobs-wt-disc-content{padding-top:var(--_k-space-inside)}
/* "More" under a caption or summary: the rest of its words, in the same voice. */
.knobs-wt-more-text{display:flex;flex-direction:column;gap:var(--_k-space-sibling);max-width:var(--kw-measure);color:var(--_k-fg-2);text-wrap:pretty}
/* A trail sits on the toggle's label edge: faint lines, the time trailing. */
.knobs-wt-trail{display:flex;flex-direction:column;list-style:none;padding:0 0 0 calc(12px + var(--_k-space-inside));font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3);min-width:0}
.knobs-wt-trail li{display:flex;align-items:baseline;gap:var(--_k-space-sibling);min-width:0;white-space:nowrap}
.knobs-wt-trail-text{flex:0 1 auto;min-width:0;overflow:hidden;${fade}}
.knobs-wt-trail-at{flex:none}

/* ——— a step's sent notes ——— */
.knobs-wt-notes{display:flex;flex-direction:column}
.knobs-wt-notes:empty{display:none}
.knobs-wt-n{display:flex;align-items:flex-start;gap:var(--_k-space-sibling);padding:6px 0;overflow:hidden;
  transition:height var(--kw-snappy-ms) var(--kw-snappy),opacity var(--kw-snappy-ms) var(--kw-snappy),filter var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-n[data-entering]{opacity:0;filter:blur(3px)}
.knobs-wt-n[data-leaving]{opacity:0;filter:blur(3px);padding-block:0}
.knobs-wt-n+.knobs-wt-n{box-shadow:inset 0 1px 0 var(--_k-border-subtle)}
.knobs-wt-n-meta{flex:none;min-width:44px;color:var(--_k-fg-3);font:var(--_k-weight) var(--_k-type-small)/var(--_k-leading-body) var(--_k-mono)}
.knobs-wt-n-meta[data-seek]{cursor:default;transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-wt-n-meta[data-seek]:hover{color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-n-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--_k-space-sibling)}
.knobs-wt-n-voice{height:30px;max-width:320px}
.knobs-wt-n-ink{display:block;width:120px;max-height:80px;border-radius:calc(var(--_k-radius) / 2);background:var(--_k-fill)}
.knobs-wt-n-ink path{fill:none;stroke:var(--kw-ink);stroke-width:2px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}

/* ——— the note bar, docked at the bottom of the column. It holds its own place at the page's end
   (so the last step stays clear of it), and script keeps its height as the scroller's
   scroll-padding-bottom ——— */
.knobs-wt-dock{position:sticky;bottom:12px;z-index:40;display:grid;pointer-events:none}
.knobs-wt-dock>*{pointer-events:auto}
.knobs-wt-dock>:is(.knobs-wt-notebar,.knobs-wt-launch){grid-area:1/1}
.knobs-wt-dock[data-mode="docked"]>.knobs-wt-launch{display:none}
/* Collapsed: the launcher and the bar swap in place, a quick fade with a little scale and blur
   from the launcher's corner; the exit is the shorter. */
:where(.knobs-ui) .knobs-wt-launch{all:revert;box-sizing:border-box;justify-self:end;align-self:end;display:inline-flex;align-items:center;gap:6px;height:32px;margin:0;padding:0 10px 0 9px;border:0;border-radius:var(--_k-round);
  background:var(--_k-bg);color:var(--_k-fg-2);box-shadow:var(--_ku-pane-ring),var(--_k-shadow-overlay);font:var(--kw-strong) var(--_k-type-small)/1 var(--_k-font);cursor:default;outline:none;transform-origin:100% 100%;
  transition:color calc(var(--_k-hover-out) * 1ms),opacity var(--kw-quick-ms) var(--kw-quick),scale var(--kw-quick-ms) var(--kw-quick),filter var(--kw-quick-ms) var(--kw-quick)}
.knobs-ui .knobs-wt-launch:is(:hover,:focus-visible){color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-launch:focus-visible{box-shadow:var(--_k-focus-ring)}
.knobs-wt-launch svg{width:16px;height:16px}
.knobs-wt-launch kbd{font:inherit;font-weight:var(--_k-weight);color:var(--_k-fg-3)}
.knobs-wt-dock[data-mode="collapsed"] .knobs-wt-notebar{transform-origin:100% 100%;transition:opacity var(--kw-quick-ms) var(--kw-quick),scale var(--kw-quick-ms) var(--kw-quick),filter var(--kw-quick-ms) var(--kw-quick)}
.knobs-wt-dock[data-mode="collapsed"]:not([data-open])>.knobs-wt-notebar,.knobs-wt-dock[data-mode="collapsed"][data-open]>.knobs-wt-launch{opacity:0;scale:.98;filter:blur(3px);pointer-events:none;
  transition-duration:calc(var(--kw-quick-ms) * .8)}
.knobs-wt-notebar{display:flex;flex-direction:column;gap:2px;padding:6px 6px 6px 14px;border-radius:calc(var(--_k-radius-panel) + 2px);background:var(--_k-bg);
  box-shadow:var(--_ku-pane-ring),var(--_k-shadow-overlay)}
.knobs-wt-on{padding-top:3px;color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);white-space:nowrap;overflow:hidden;${fade}}
.knobs-wt-row{display:flex;align-items:flex-end;gap:4px}
:where(.knobs-ui) :is(.knobs-wt-input,.knobs-wt-tool,.knobs-wt-x,.knobs-wt-back){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:var(--_kr-track);background:transparent;border:0;
  border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}
.knobs-ui .knobs-wt-input{flex:1;min-width:0;height:32px;max-height:140px;padding:6px 0;resize:none;color:var(--_k-fg);caret-color:var(--_k-accent);line-height:var(--_k-leading-body);font-size:var(--_k-type-body)}
.knobs-ui .knobs-wt-input::placeholder{color:var(--_k-fg-3)}
.knobs-wt-attach{display:flex;gap:4px;align-items:center;align-self:center}
.knobs-wt-attach:empty{display:none}
.knobs-wt-chip-a{display:inline-flex;align-items:center;gap:2px;height:24px;padding:0 2px 0 9px;border-radius:var(--_k-round);background:var(--_k-fill-selected);font-size:var(--_k-type-small);white-space:nowrap}
.knobs-ui .knobs-wt-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;color:var(--_k-fg-3);cursor:default;transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-x:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-x svg{width:12px;height:12px}
.knobs-ui .knobs-wt-tool{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:32px;height:32px;padding:0 8px;border-radius:calc(var(--_k-radius) + 2px);
  color:var(--_k-fg-2);cursor:default;transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-tool:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-tool[aria-pressed="true"]{background:var(--_k-fill-selected);color:var(--_k-fg)}
.knobs-wt-tool svg{width:16px;height:16px}
.knobs-wt-rec{font-size:var(--_k-type-small)}
.knobs-wt-rec:empty{display:none}
.knobs-ui .knobs-wt-tool[data-send]{color:var(--_k-fg-3)}
.knobs-ui .knobs-wt-tool[data-send][data-ready]{background:var(--_k-accent);color:var(--_k-bg)}
/* Back: in place over the bar for a few seconds after a note moves the page on. */
.knobs-ui .knobs-wt-back{position:absolute;left:8px;bottom:calc(100% + 8px);display:inline-flex;align-items:center;gap:var(--_k-space-inside);max-width:min(360px,calc(100% - 16px));height:28px;padding:0 12px 0 9px;
  border-radius:var(--_k-round);background:var(--_k-bg);color:var(--_k-fg);box-shadow:var(--_ku-pane-ring),var(--_k-shadow-overlay);font-size:var(--_k-type-small);font-weight:var(--kw-strong);cursor:default;
  opacity:0;scale:.96;filter:blur(3px);pointer-events:none;transition:opacity .11s cubic-bezier(.4,0,1,1),scale .11s cubic-bezier(.4,0,1,1),filter .11s cubic-bezier(.4,0,1,1)}
.knobs-ui .knobs-wt-back[data-on]{opacity:1;scale:1;filter:none;pointer-events:auto;transition:opacity .15s cubic-bezier(.2,.8,.2,1),scale .15s cubic-bezier(.2,.8,.2,1),filter .15s cubic-bezier(.2,.8,.2,1)}
.knobs-ui .knobs-wt-back:hover{background-image:linear-gradient(var(--_k-fill-hover),var(--_k-fill-hover));transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-back svg{flex:none;width:12px;height:12px}
.knobs-wt-back-label{min-width:0;overflow:hidden;white-space:nowrap;${fade}}

/* ——— ink over a step's media ——— */
.knobs-wt-media,.knobs-wt-options{position:relative}
.knobs-wt-ink{position:absolute;inset:0;z-index:5;width:100%;height:100%;overflow:visible;pointer-events:none;touch-action:none}
.knobs-wt-ink[data-on]{pointer-events:auto;cursor:crosshair}
.knobs-wt-ink path{fill:none;stroke:var(--kw-ink);stroke-width:3px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}

/* ——— full-window: the step over the page above the note bar, its media filling it; its place held
   in the page. The one raised surface ——— */
.knobs-wt-scrim{position:fixed;inset:0;z-index:30;background:color-mix(in srgb,var(--_k-bg-page) 82%,transparent);opacity:0;pointer-events:none}
.knobs-wt-scrim[data-on]{pointer-events:auto}
.knobs-wt-hold-card{flex:none}
.knobs-wt-step[data-full]{position:fixed;z-index:35;margin:0;overflow:hidden;overscroll-behavior:contain;padding:var(--_k-pad-card);border-radius:var(--_k-radius-panel);box-shadow:var(--_ku-pane-ring),var(--_k-shadow-overlay);background:var(--_k-bg)}
.knobs-wt-step[data-full]::before{content:none}
.knobs-wt-step[data-full]>:not(.knobs-wt-media){flex:none}
.knobs-wt-step[data-full] .knobs-wt-notes{display:none}
.knobs-wt-step[data-full]>.knobs-wt-media{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)}
.knobs-wt-step[data-full] .knobs-wt-slot{display:flex;flex-direction:column;min-height:0}
.knobs-wt-step[data-full] .knobs-wt-body{flex:1;min-height:0}
.knobs-wt-step[data-full] .knobs-wt-fit{height:100%;transition:none}
.knobs-wt-step[data-full] .knobs-wt-frame{height:100%;aspect-ratio:auto}
.knobs-wt-step[data-full] .knobs-wt-slot[data-kind="video"]>.knobs-wt-body{display:flex;flex-direction:column}
.knobs-wt-step[data-full] .knobs-wt-slot[data-kind="video"] .knobs-player{flex:1;min-height:0}
.knobs-wt-step[data-full] .knobs-wt-slot[data-kind="video"] .knobs-player-frame{flex:1;min-height:0;aspect-ratio:auto}

/* ——— options: a decision, or a taste test when Kit picks. Columns that fill whole rows (4 → 4, 2
   or 1 across; 3 → 3 or 1), a hairline between neighbours and between rows, no card of their own.
   Each: a kicker ("Option 1 · Recommended", the mark a quiet word in text colour), its title, a
   sentence, its media and what changes as facts. A pick dims the rest ——— */
.knobs-wt-options{--kw-ogap:var(--_k-space-group);display:grid;grid-template-columns:repeat(var(--kw-cols,1),minmax(0,1fr));gap:var(--kw-ogap);min-width:0}
.knobs-wt-option{position:relative;display:flex;flex-direction:column;gap:var(--_k-space-title);min-width:0}
.knobs-wt-option[data-col]:not([data-col="0"])::before{content:"";position:absolute;top:0;bottom:0;left:calc(var(--kw-ogap) / -2);width:1px;background:var(--_k-border-subtle);pointer-events:none}
.knobs-wt-option[data-col]:not([data-row="0"])::before{top:calc(var(--kw-ogap) / -2)}
.knobs-wt-option[data-col]:not([data-last-row])::before{bottom:calc(var(--kw-ogap) / -2)}
.knobs-wt-option[data-col]:not([data-row="0"])::after{content:"";position:absolute;top:calc(var(--kw-ogap) / -2);left:calc(var(--kw-ogap) / -2);right:calc(var(--kw-ogap) / -2);height:1px;background:var(--_k-border-subtle);pointer-events:none}
.knobs-wt-option[data-col="0"]::after{left:0}
.knobs-wt-option[data-end]::after{right:0}
.knobs-wt-option>:not(.knobs-wt-ohead){transition:opacity var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-options[data-has-pick] .knobs-wt-option:not([data-picked])>:not(.knobs-wt-ohead){opacity:.55}
.knobs-wt-ohead{display:flex;flex-direction:column;gap:var(--_k-space-inside);min-width:0;text-align:left}
.knobs-wt-okicker{display:flex;align-items:center;gap:var(--_k-space-inside);min-width:0;height:var(--_k-leading-small);color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);white-space:nowrap}
.knobs-wt-orec{color:var(--_k-fg);font-weight:var(--kw-strong)}
.knobs-wt-orec::before{content:"·";margin-right:var(--_k-space-inside);color:var(--_k-fg-3);font-weight:var(--_k-weight)}
.knobs-wt-otitle{color:var(--_k-fg);font-weight:var(--kw-strong);text-wrap:balance}
.knobs-wt-osum{max-width:var(--kw-measure);color:var(--_k-fg-2)}
/* Picking: the head is the radio, bled out so its words keep the column's edge; a fill under the
   pointer at once; a check at the kicker's end that fills when picked. */
.knobs-ui .knobs-wt-pick{margin:-6px -8px;padding:6px 8px;border-radius:var(--_k-radius);cursor:default;transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-pick:is(:hover,:focus-visible){background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-pick:focus-visible{box-shadow:inset 0 0 0 1px var(--_k-focus)}
.knobs-wt-check{flex:none;display:flex;width:16px;height:16px;margin-left:auto;align-items:center;justify-content:center;border-radius:50%;box-shadow:inset 0 0 0 1px var(--_k-border-strong);color:transparent;
  transition:background var(--kw-snappy-ms) var(--kw-snappy),color var(--kw-snappy-ms) var(--kw-snappy),box-shadow var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-check svg{width:12px;height:12px}
.knobs-wt-option[data-picked] .knobs-wt-check{background:var(--_k-accent);box-shadow:none;color:var(--_k-on-accent)}

/* ——— facts: terms in a fixed gutter beside their values, sharing a baseline; groups under a
   heading, a hairline between them. Code and evidence are small mono chips. Too narrow for the
   gutter, each term sits over its value ——— */
.knobs-wt-facts{--kw-term:144px;display:flex;flex-direction:column;gap:var(--_kr-block);min-width:0}
.knobs-wt-fgroup{position:relative;display:flex;flex-direction:column;gap:var(--_k-space-title);min-width:0}
.knobs-wt-fgroup+.knobs-wt-fgroup::before{content:"";position:absolute;left:0;right:0;top:calc(var(--_kr-block) / -2);height:1px;background:var(--_k-border-subtle);pointer-events:none}
.knobs-wt-fhead{margin:0;color:var(--_k-fg);font-weight:var(--kw-strong);text-wrap:balance}
.knobs-wt-fterms{display:grid;grid-template-columns:var(--kw-term) minmax(0,1fr);gap:var(--_k-space-sibling) var(--_kr-block);align-items:baseline;margin:0;min-width:0}
.knobs-wt-fact{display:contents}
.knobs-wt-fterms dt{margin:0;color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);text-wrap:balance}
.knobs-wt-fterms dd{display:flex;flex-direction:column;gap:var(--_k-space-inside);min-width:0;margin:0;color:var(--_k-fg-2);overflow-wrap:anywhere;text-wrap:pretty}
.knobs-wt-fterms dd[data-code]{flex-flow:row wrap}
.knobs-wt-fterms dd[data-code]>code{padding:2px 6px;line-height:var(--_k-leading-label);color:var(--_k-fg)}
@container knobs-wt-slot (max-width:400px){
  .knobs-wt-fterms{display:flex;flex-direction:column;gap:var(--_k-space-sibling)}
  .knobs-wt-fact{display:flex;flex-direction:column;gap:var(--_k-space-inside)}
}

/* ——— the rail: progress, contents, export ——— */
.knobs-wt-rail{position:sticky;top:var(--_k-pad-page);display:flex;flex-direction:column;gap:var(--_k-space-title);max-height:calc(100vh - var(--_k-pad-page) * 2);min-height:0;font-size:var(--_k-type-small);line-height:var(--_k-leading-small)}
.knobs-wt-progress{display:flex;flex-direction:column;gap:var(--_k-space-sibling)}
.knobs-wt-count{display:flex;align-items:baseline;justify-content:space-between;color:var(--_k-fg-2)}
.knobs-wt-count b{color:var(--_k-fg);font-weight:var(--kw-strong)}
.knobs-wt-bar{position:relative;height:4px;border-radius:2px;overflow:hidden;background:var(--_k-fill)}
.knobs-wt-fill{position:absolute;inset:0;border-radius:inherit;background:var(--_k-accent);transform-origin:0 50%;transform:scaleX(var(--kw-done,0))}
.knobs-walkthrough[data-settled] .knobs-wt-fill{transition:transform var(--kw-calm-ms) var(--kw-calm)}
/* The contents: every row on one text edge and in one colour, title rows (28 high, the control
   radius) and the steps under them (20 high, half of it), bled 8 px out, as every list row is, so their text sits on the
   rail's edge and the first title's words on the column's top line; a narrow fade where a title
   runs out of room; the selection pill slides to the current step, and base rows never brighten. */
.knobs-wt-toc{position:relative;flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:var(--_k-space-sibling);margin:-4px -8px 0;padding:0 0 8px}
.knobs-wt-toc::-webkit-scrollbar{display:none}
.knobs-wt-toc-group{display:flex;flex-direction:column;min-width:0}
.knobs-ui .knobs-wt-toc-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:var(--_k-space-sibling);align-items:center;flex:none;width:100%;height:28px;
  padding:0 8px;border-radius:var(--_k-radius);color:var(--_k-fg-2);font-size:var(--_k-type-body);line-height:var(--_k-leading-body);font-weight:var(--_k-weight);text-align:left;white-space:nowrap;cursor:default;
  transition:color calc(var(--_k-hover-out) * 1ms),background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-toc-sub{height:20px;border-radius:calc(var(--_k-radius) / 2);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);font-weight:var(--_k-weight)}
.knobs-ui .knobs-wt-toc-row:is(:hover,:focus-visible){color:var(--_k-fg);background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-toc-row:focus-visible{box-shadow:inset 0 0 0 1px var(--_k-focus)}
.knobs-wt-toc-end{display:flex;align-items:center;font-size:var(--_k-type-small);line-height:var(--_k-leading-small);font-weight:var(--_k-weight);color:var(--_k-fg-3)}
.knobs-wt-toc-label{min-width:0;overflow:hidden;${fade}}
.knobs-pick-copy .knobs-wt-toc-end{color:var(--_k-fg-2)}
/* A step's state: an open ring, a filled dot once answered, nothing to answer a faint ring. */
.knobs-wt-toc-glyph{--kw-tone:var(--_k-fg-3);display:block;width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--kw-tone);
  transition:background var(--kw-snappy-ms) var(--kw-snappy),box-shadow var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-toc-glyph[data-tone="accent"]{--kw-tone:var(--_k-accent)}
.knobs-wt-toc-glyph[data-done]{background:var(--kw-tone)}
.knobs-wt-toc-glyph[data-tone="none"]{box-shadow:inset 0 0 0 1px var(--_k-border)}
.knobs-wt-actions{display:flex;flex-wrap:wrap;gap:4px}
.knobs-ui .knobs-wt-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px;border-radius:var(--_k-radius);color:var(--_k-fg-2);cursor:default;white-space:nowrap;
  transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-btn:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-btn[data-primary]{background:var(--_k-fill-selected);color:var(--_k-fg)}
.knobs-ui .knobs-wt-btn[data-primary]:is(:hover,:focus-visible){background:color-mix(in srgb,var(--_k-fg) 16%,transparent);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-keys{color:var(--_k-fg-3);font-size:var(--_k-type-small);line-height:var(--_k-leading-small)}
.knobs-wt-keys kbd{font:inherit;color:var(--_k-fg-2)}
/* Narrow: the contents go; with review on, the rail becomes a bar along the top with the
   progress and the export. */
@container knobs-wt (max-width:960px){
  .knobs-wt-rail{z-index:4;flex-direction:row;align-items:center;gap:var(--_k-space-title);max-height:none;margin:0 calc(var(--_k-pad-page) * -1);padding:8px var(--_k-pad-page);top:0;background:var(--_k-bg-page)}
  .knobs-wt-progress{flex:1}.knobs-wt-toc,.knobs-wt-keys{display:none}
  .knobs-walkthrough:not([data-review]) .knobs-wt-rail{display:none}
  .knobs-wt-step,.knobs-wt-shead,.knobs-wt-feed{scroll-margin-top:60px}
}

/* ——— media slots. Only a picture's frame (a quiet fill while it loads or letterboxes) and a code
   block (a well) are bounded; a metric, a callout, a table, a stack and a history sit on the page,
   set apart by space, hairlines and their own colours. On a card (.knobs-surface) code drops its
   well for hairlines, so nothing draws a fill and a ring of its own there ——— */
.knobs-ui.knobs-wt-slot{position:relative;display:flex;flex-direction:column;gap:var(--_k-space-sibling);min-width:0;container:knobs-wt-slot / inline-size;color:var(--_k-fg);
  font:var(--_k-weight) var(--_k-type-body)/var(--_k-leading-body) var(--_k-font);font-variant-numeric:tabular-nums;--kw-measure:var(--_kr-measure);
  --kw-good:var(--k-walkthrough-good,var(--_k-ok));--kw-info:var(--k-walkthrough-info,var(--_k-info));--kw-frame-r:var(--_k-radius-panel)}
.knobs-surface .knobs-wt-slot{--kw-frame-r:calc(var(--_k-radius-panel) - 4px)}
/* A slot's label: sentence case as written, small and faint, never a heading. */
.knobs-wt-slot-label{display:block;min-width:0;overflow:hidden;white-space:nowrap;font:var(--_k-weight) var(--_k-type-small)/var(--_k-leading-small) var(--_k-font);text-transform:none;color:var(--_k-fg-3);${fade}}
.knobs-wt-body{min-width:0}
/* Media mounting after the first paint, and a picture still decoding, come into focus: a fade with
   a small blur on the quick spring, from the top; at rest, nothing. */
.knobs-wt-body,.knobs-wt-frame>img{transition:opacity var(--kw-quick-ms) var(--kw-quick),filter var(--kw-quick-ms) var(--kw-quick)}
.knobs-wt-body[data-entering],.knobs-wt-frame[data-loading]>img{opacity:0;filter:blur(3px);transition:none}
/* One frame for every slot that has one (a picture, a video, a code block, a compare's stage, a
   slot still loading): the panel radius and a quiet fill, no ring; concentric on a card. */
.knobs-wt-slot .knobs-cmp-stage{border-radius:var(--kw-frame-r)}
/* A compare is as tall as its two pictures side by side at this width, in every mode (Wipe fuses
   them at one side's size, so nothing grows or re-measures), plus its mode bar, the line and gaps
   (92 px). */
.knobs-wt-fit{width:100%;height:calc(100cqw / 2 / var(--kw-aspect,1.7778) + var(--kw-chrome,92px))}
.knobs-wt-fit[data-settled]{transition:height var(--k-wt-calm-ms,${calm.duration}ms) ${calm.easing}}
.knobs-wt-frame{position:relative;width:100%;overflow:hidden;border-radius:var(--kw-frame-r);background:var(--_k-fill);aspect-ratio:var(--kw-aspect,16/9)}
.knobs-wt-frame>:is(video,img){position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;margin:0;border:0}
.knobs-wt-frame[data-natural]{aspect-ratio:auto;background:transparent}
.knobs-wt-frame[data-natural]>img{position:static;height:auto}
/* Diff, code and terminal: one plain well, drawn by its hairline alone (a fill and a ring would be
   two edges for one box), the panel radius and room inside, so a diff's buttons and the code under
   them can breathe. */
.knobs-wt-slot[data-kind="diff"]>.knobs-wt-body{padding:var(--_k-pad-card);border-radius:var(--_k-radius-panel);box-shadow:inset 0 0 0 1px var(--_k-border-subtle)}
/* The diff inside it: its header row 28 high on the container's padding, a hairline under it, and
   no line of its own under the code (the container's ring closes it). */
.knobs-wt-slot[data-kind="diff"] .knobs-ui.knobs-diff:not([data-on="pane"]){--kd-head:28px;--kd-x:0px}
.knobs-wt-slot[data-kind="diff"] .knobs-ui.knobs-diff:not([data-on="pane"])::after{display:none}
.knobs-wt-code{margin:0;padding:var(--_k-pad-card);max-height:420px;overflow:auto;border-radius:var(--kw-frame-r);background:var(--_k-fill);color:var(--_k-fg);
  font:var(--_k-type-label)/var(--_k-leading-body) var(--_k-mono);white-space:pre;tab-size:2;scrollbar-width:thin}
.knobs-surface .knobs-wt-slot[data-kind="diff"]>.knobs-wt-body{padding:0;border-radius:0;background:transparent;box-shadow:inset 0 -1px 0 var(--_k-border-subtle)}
.knobs-wt-code[data-terminal]{white-space:pre-wrap;overflow-wrap:anywhere}
.knobs-wt-prompt{color:var(--_k-fg-3);user-select:none;-webkit-user-select:none}
.knobs-wt-cmd{color:var(--_k-fg);font-weight:var(--_k-weight-label)}
.knobs-wt-out{color:var(--_k-fg-2)}
.knobs-wt-metric{display:flex;flex-direction:column;gap:var(--_k-space-sibling)}
.knobs-wt-mvalue{display:flex;align-items:baseline;flex-wrap:wrap;gap:var(--_k-space-sibling);font-feature-settings:var(--_kr-data)}
.knobs-wt-mfrom{color:var(--_k-fg-3)}
.knobs-wt-mto{font-size:var(--_k-type-title);line-height:var(--_k-leading-title);font-weight:var(--_k-weight-label)}
.knobs-wt-mof{color:var(--_k-fg-3)}
.knobs-wt-mdelta{--kw-tone:var(--_k-fg-2);font-size:var(--_k-type-small);font-weight:var(--_k-weight-label);color:var(--kw-tone)}
.knobs-wt-mdelta[data-tone="good"]{--kw-tone:var(--kw-good)}
.knobs-wt-mdelta[data-tone="bad"]{--kw-tone:var(--_k-danger)}
.knobs-wt-mtrack{position:relative;height:4px;border-radius:2px;background:var(--_k-fill-selected)}
.knobs-wt-mtrack>span{position:absolute;top:0;bottom:0;left:0;border-radius:inherit}
.knobs-wt-mtrack>.knobs-wt-mafter{background:var(--_k-accent)}
.knobs-wt-mtrack>.knobs-wt-mbefore{background:var(--_k-fg-4)}
.knobs-wt-callout{--kw-tone:var(--kw-info);display:flex;gap:var(--_k-space-sibling);max-width:var(--kw-measure);color:var(--_k-fg)}
.knobs-wt-callout::before{content:"";flex:none;width:6px;height:6px;margin-top:7px;border-radius:50%;background:var(--kw-tone)}
.knobs-wt-callout[data-tone="good"]{--kw-tone:var(--kw-good)}
.knobs-wt-callout[data-tone="warn"]{--kw-tone:var(--_k-warn)}
.knobs-wt-callout[data-tone="bad"]{--kw-tone:var(--_k-danger)}
.knobs-wt-text{max-width:var(--kw-measure);color:var(--_k-fg-2)}
.knobs-wt-hold{border-radius:var(--kw-frame-r);background:var(--_k-fill)}
.knobs-wt-failed{display:flex;align-items:center;justify-content:center;min-height:80px;color:var(--_k-fg-3);font-size:var(--_k-type-small)}

/* Annotations: a calm ring round a box, a dot or an arrow at a point, a small label beside it;
   each fades in and out with a small blur on the quick spring as its time comes and goes, and a
   page's switch (the eye, or a) hides them all. Placed in px by script, 1:1 with the picture;
   last in their box, so they sit over the picture (and under a compare's grip and labels). */
.knobs-wt-anno{position:absolute;inset:0;pointer-events:none;overflow:hidden;transition:opacity var(--kw-quick-ms) var(--kw-quick),filter var(--kw-quick-ms) var(--kw-quick)}
.knobs-wt-anno:not([data-settled]),.knobs-wt-anno:not([data-settled]) *{transition:none!important}
[data-annotations="off"] .knobs-wt-anno,.knobs-wt-anno[data-moving]{opacity:0;filter:blur(3px)}
.knobs-wt-mark{--kw-mark:var(--_k-accent);position:absolute;left:0;top:0;color:var(--kw-mark);transition:opacity var(--kw-quick-ms) var(--kw-quick),filter var(--kw-quick-ms) var(--kw-quick)}
.knobs-wt-mark[data-hidden]{opacity:0;filter:blur(3px)}
.knobs-wt-mark[data-shape="box"]{border-radius:6px;box-shadow:0 0 0 1.5px var(--kw-mark),0 0 0 4px color-mix(in srgb,var(--_k-bg) 45%,transparent)}
.knobs-wt-mark[data-shape="dot"]::before{content:"";position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:var(--kw-mark);box-shadow:0 0 0 3px color-mix(in srgb,var(--kw-mark) 30%,transparent)}
.knobs-wt-anno-arrow{position:absolute;right:0;bottom:0;filter:drop-shadow(0 0 2px var(--_k-bg))}
.knobs-wt-mark-label{position:absolute;left:0;bottom:calc(100% + 6px);max-width:240px;padding:2px 6px;border-radius:calc(var(--_k-radius) / 2);background:var(--_ku-media-scrim);color:var(--_ku-on-media);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);
  font:var(--_k-weight-label) var(--_k-type-small)/var(--_k-leading-small) var(--_k-font);white-space:nowrap;overflow:hidden;${fade}}
.knobs-wt-mark:is([data-shape="dot"],[data-shape="arrow"]) .knobs-wt-mark-label{left:12px;bottom:auto;top:10px}
.knobs-wt-mark[data-shape="arrow"] .knobs-wt-mark-label{left:auto;right:30px;top:auto;bottom:30px}
.knobs-ui .knobs-wt-anno-toggle{all:revert;box-sizing:border-box;position:absolute;top:8px;right:8px;display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;margin:0;
  border-radius:var(--_k-radius);background:var(--_ku-media-scrim);color:var(--_ku-on-media-2);cursor:default;opacity:.6;outline:none;
  transition:opacity calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-anno-toggle:is(:hover,:focus-visible){opacity:1;color:var(--_ku-on-media);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-anno-toggle:focus-visible{box-shadow:inset 0 0 0 1px var(--_k-focus)}
.knobs-cmp-stage>.knobs-wt-anno-toggle{top:auto;bottom:8px}

/* ——— data blocks: history, stack, table, chapters. On the step's card, so no card of their own:
   hairlines and fills only. Tones read the status tokens; hover fades are the panel's own. ——— */
:where(.knobs-wt-stack,.knobs-wt-tablebox,.knobs-wt-chapters){--kw-line:var(--_k-leading-body);--kw-rail:var(--_k-border-strong)}
:where(.knobs-wt-slot) [data-tone="good"]{--kw-tone:var(--kw-good)}
:where(.knobs-wt-slot) [data-tone="warn"]{--kw-tone:var(--_k-warn)}
:where(.knobs-wt-slot) [data-tone="bad"]{--kw-tone:var(--_k-danger)}
:where(.knobs-wt-slot) [data-tone="info"]{--kw-tone:var(--kw-info)}
:where(.knobs-wt-slot) [data-tone="dim"]{--kw-tone:var(--_k-fg-3)}

/* A stack: the trunk at the top, each PR hanging off the branch it merges into, rails drawn as a
   git graph (solid, so where two meet they don't darken). A PR with a step goes there on a click. */
.knobs-wt-stack{--kw-spt:7px;--kw-spb:7px;--kw-sy:calc(var(--kw-spt) + var(--kw-line) / 2);display:flex;flex-direction:column;font-size:var(--_k-type-body);line-height:var(--kw-line);color:var(--_k-fg)}
.knobs-wt-srow{display:grid;grid-template-columns:auto minmax(0,1fr) auto;column-gap:10px;align-items:start;margin:0 -8px;padding:var(--kw-spt) 8px var(--kw-spb);
  border-radius:max(0px,calc(var(--_k-radius-panel) - 8px));transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-wt-srow[data-trunk]{--kw-spb:0px;grid-template-columns:auto minmax(0,1fr)}
.knobs-wt-srow[data-go]{cursor:default}
.knobs-wt-srow[data-go]:hover{background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-lanes{display:flex;align-self:stretch;margin-block:calc(var(--kw-spt) * -1) calc(var(--kw-spb) * -1)}
.knobs-wt-lane{position:relative;flex:none;width:16px}
.knobs-wt-lane:is([data-rail="pass"],[data-rail="tee"],[data-down])::before{content:"";position:absolute;left:7.5px;top:0;bottom:0;width:1px;background:var(--kw-rail)}
.knobs-wt-lane[data-down]::before{top:calc(var(--kw-sy) + 3.5px)}
.knobs-wt-lane:is([data-rail="tee"],[data-rail="end"])::after{content:"";position:absolute;left:7.5px;top:0;width:13px;height:calc(var(--kw-sy) + .5px);border:solid var(--kw-rail);border-width:0 0 1px 1px;border-bottom-left-radius:6px}
.knobs-wt-lane[data-rail="node"]::after{content:"";position:absolute;left:4.5px;top:calc(var(--kw-sy) - 3.5px);width:7px;height:7px;border-radius:50%;background:var(--_k-fg-3)}
.knobs-wt-srow[data-trunk] .knobs-wt-lane[data-rail="node"]::after{background:var(--_k-fg-2)}
.knobs-wt-trunk{font:var(--_k-weight-label) var(--_k-type-label)/var(--kw-line) var(--_k-mono);color:var(--_k-fg-2)}
.knobs-wt-smain{display:flex;flex-direction:column;gap:1px;min-width:0}
.knobs-wt-sline{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px}
.knobs-wt-sord{font:var(--_k-weight) var(--_k-type-label)/var(--kw-line) var(--_k-mono);font-variant-numeric:tabular-nums;color:var(--_k-fg-3);white-space:nowrap}
.knobs-ui .knobs-wt-spr{font:var(--_k-weight-label) var(--_k-type-label)/var(--kw-line) var(--_k-mono);color:var(--_k-fg-2);text-decoration:none;white-space:nowrap}
.knobs-ui a.knobs-wt-spr:is(:hover,:focus-visible){color:var(--_k-fg);text-decoration:underline;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-stitle{font-weight:var(--_k-weight-label);line-height:var(--kw-line);color:var(--_k-fg);text-align:left}
.knobs-ui button.knobs-wt-stitle{cursor:default;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:3px;transition:text-decoration-color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui button.knobs-wt-stitle:focus-visible{text-decoration-color:color-mix(in oklch,currentColor 45%,transparent);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-ssummary{margin:0;max-width:var(--kw-measure);color:var(--_k-fg-2)}
.knobs-wt-smeta{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px;font:var(--_k-weight) var(--_k-type-small)/var(--kw-line) var(--_k-mono);font-variant-numeric:tabular-nums;color:var(--_k-fg-3)}
.knobs-wt-delta{display:inline-flex;gap:6px}
.knobs-wt-add{color:var(--_k-diff-add)}
.knobs-wt-del{color:var(--_k-diff-del)}
.knobs-wt-sstatus{margin-top:calc((var(--kw-line) - 20px) / 2)}
/* A PR's state the GitHub way: its glyph and word, open and merged quietly tinted (as PR chips),
   draft and closed faint; no fill, no dot. A check after it where the checks pass, faint too. One
   width for every row, so the glyphs and words line up. */
.knobs-ui .knobs-wt-prstate{--kw-pr:var(--_k-fg-3);display:inline-flex;align-items:center;gap:4px;min-width:calc(7ch + 32px);height:var(--kw-line);color:var(--kw-pr);
  font:var(--_k-weight) var(--_k-type-small)/var(--_k-leading-small) var(--_k-font);white-space:nowrap}
.knobs-ui .knobs-wt-prstate[data-state="open"]{--kw-pr:color-mix(in oklch,var(--_k-ok) 60%,var(--_k-fg-2))}
.knobs-ui .knobs-wt-prstate[data-state="merged"]{--kw-pr:color-mix(in oklch,var(--_k-series-5) 60%,var(--_k-fg-2))}
.knobs-wt-prstate svg{flex:none}
.knobs-ui .knobs-wt-prchecks{display:inline-flex;margin-left:2px;color:var(--_k-fg-3)}
.knobs-wt-stack[data-flat] .knobs-wt-srow{grid-template-columns:minmax(0,1fr) auto}
.knobs-wt-stack[data-flat] .knobs-wt-srow+.knobs-wt-srow{box-shadow:inset 0 1px 0 var(--_k-border-subtle)}
@container knobs-wt-slot (max-width:520px){
  .knobs-wt-srow:not([data-trunk]){grid-template-columns:auto minmax(0,1fr)}
  .knobs-wt-stack[data-flat] .knobs-wt-srow{grid-template-columns:minmax(0,1fr)}
  :is(.knobs-wt-sstatus,.knobs-wt-prstate){grid-column:-2;justify-self:start;margin-top:4px}
}

/* A table: a real one, its head stuck while it scrolls, both ways; edges fade where there's more
   (the top one under the head), and thin bars show on hover. */
/* Too narrow for its columns, each row becomes a block: its primary cell titling the rest as term
   and value, the blocks parted by hairlines. Scrolling sideways is the last resort (stack: never). */
.knobs-wt-tablebox{min-width:0}
/* A row with a step goes there: the whole row, a wash under the pointer, no arrow, so rows with and
   without one line up. */
.knobs-wt-tablebox [data-go]{cursor:default;outline:none}
.knobs-wt-tablebox tr[data-go]>td,.knobs-wt-trow[data-go]{transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-wt-tablebox tr[data-go]:is(:hover,:focus-visible)>td,.knobs-wt-trow[data-go]:is(:hover,:focus-visible){background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-tablebox [data-go]:focus-visible{box-shadow:inset 0 0 0 1px var(--_k-focus)}
.knobs-wt-tablebox[data-measure] table{width:min-content}
.knobs-wt-tstack{display:none;flex-direction:column;min-width:0}
.knobs-wt-tablebox[data-stacked]>.knobs-wt-table{display:none}
.knobs-wt-tablebox[data-stacked]>.knobs-wt-tstack{display:flex}
.knobs-wt-trow{display:flex;flex-direction:column;gap:var(--_k-space-sibling);min-width:0;padding-block:var(--_k-space-title);box-shadow:inset 0 -1px 0 var(--_k-border-subtle)}
.knobs-wt-trow:first-child{padding-top:0}
.knobs-wt-trow:last-of-type{padding-bottom:0;box-shadow:none}
.knobs-wt-tline{display:flex;align-items:baseline;justify-content:space-between;gap:var(--_k-space-title);min-width:0}
.knobs-wt-tbadges{flex:none;display:flex;align-items:center;gap:var(--_k-space-inside)}
.knobs-wt-ttitle{flex:1 1 auto;min-width:0;color:var(--_k-fg);font-weight:var(--_k-weight-label);overflow-wrap:anywhere}
.knobs-wt-ttitle[data-mono]{font-family:var(--_k-mono);font-size:var(--_k-type-label)}
.knobs-wt-tterms{display:grid;grid-template-columns:minmax(6ch,max-content) minmax(0,1fr);gap:var(--_k-space-inside) var(--_k-space-title);min-width:0}
.knobs-wt-tterms dt{color:var(--_k-fg-3);font-size:var(--_k-type-small)}
.knobs-wt-tterms dd{min-width:0;color:var(--_k-fg-2);overflow-wrap:anywhere}
.knobs-wt-tterms dd[data-mono]{font-family:var(--_k-mono);font-size:var(--_k-type-label);color:var(--_k-fg)}
.knobs-wt-tcaption{padding-top:var(--_k-space-sibling);color:var(--_k-fg-3);font-size:var(--_k-type-small)}
@property --kw-fade-l{syntax:"<number>";inherits:false;initial-value:1}
@property --kw-fade-r{syntax:"<number>";inherits:false;initial-value:1}
@keyframes kw-fade-l{from{--kw-fade-l:1}to{--kw-fade-l:0}}
@keyframes kw-fade-r{from{--kw-fade-r:0}to{--kw-fade-r:1}}
.knobs-wt-table{max-height:520px;overflow:auto;overscroll-behavior-x:contain;outline:none;scrollbar-width:thin;scrollbar-color:transparent transparent;
  transition:scrollbar-color calc(var(--_k-hover-out) * 1ms)}
.knobs-wt-table:is(:hover,:focus-visible){scrollbar-color:color-mix(in oklch,var(--_k-fg) 28%,transparent) transparent;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-wt-table:focus-visible{box-shadow:inset 0 0 0 2px var(--_k-focus);border-radius:var(--kw-frame-r)}
@supports (animation-timeline:scroll()){
  .knobs-wt-table{animation:knobs-fade-a linear both,knobs-fade-b linear both,kw-fade-l linear both,kw-fade-r linear both;animation-duration:auto;
    animation-timeline:scroll(self block),scroll(self block),scroll(self inline),scroll(self inline);animation-range:0 24px,calc(100% - 24px) 100%,0 8px,calc(100% - 8px) 100%;
    --kw-table-mask-y:linear-gradient(to bottom,#000 var(--kw-thead,0px),rgb(0 0 0/var(--knobs-fade-a)) var(--kw-thead,0px),#000 calc(var(--kw-thead,0px) + 20px),#000 calc(100% - 20px),rgb(0 0 0/var(--knobs-fade-b)));
    --kw-table-mask-x:linear-gradient(to right,rgb(0 0 0/var(--kw-fade-l)),#000 24px,#000 calc(100% - 24px),rgb(0 0 0/var(--kw-fade-r)));
    -webkit-mask-image:var(--kw-table-mask-y),var(--kw-table-mask-x);mask-image:var(--kw-table-mask-y),var(--kw-table-mask-x);-webkit-mask-composite:source-in;mask-composite:intersect}
}
.knobs-wt-table table{width:100%;margin:0;border-collapse:separate;border-spacing:0;font-size:var(--_k-type-body);line-height:var(--_k-leading-body);font-variant-numeric:tabular-nums;color:var(--_k-fg-2)}
.knobs-wt-table caption{caption-side:bottom;padding-top:8px;text-align:left;color:var(--_k-fg-3);font-size:var(--_k-type-small)}
.knobs-wt-table th{position:sticky;top:0;padding:0 12px 8px;text-align:left;vertical-align:bottom;font-weight:var(--_k-weight-label);font-size:var(--_k-type-small);color:var(--_k-fg-3);white-space:nowrap;
  background:var(--kw-under,var(--_k-pane-bg));box-shadow:inset 0 -1px 0 var(--_k-border)}
.knobs-wt-table td{padding:8px 12px;vertical-align:baseline;box-shadow:inset 0 -1px 0 var(--_k-border-subtle)}
.knobs-wt-table tr:last-child td{box-shadow:none}
.knobs-wt-table :is(th,td):first-child{padding-left:0}
.knobs-wt-table :is(th,td):last-child{padding-right:0}
.knobs-wt-table td:first-child{color:var(--_k-fg)}
.knobs-wt-table [data-align="right"]{text-align:right}
.knobs-wt-table [data-align="center"]{text-align:center}
.knobs-wt-table td[data-mono]{font-family:var(--_k-mono);font-size:var(--_k-type-label);color:var(--_k-fg);white-space:nowrap}
.knobs-wt-table td[data-long]{min-width:24ch}
.knobs-ui :is(.knobs-wt-table,.knobs-wt-tstack) a.knobs-wt-chip{text-decoration:none}
.knobs-wt-ctone{color:var(--kw-tone)}

/* Chapters: a readout list under a video or compare: number, label, start; the selection pill
   on the one playing, its rows bled out so their text sits on the media's edge. */
.knobs-wt-body:has(>.knobs-wt-chapters){display:flex;flex-direction:column;gap:var(--_k-space-title)}
.knobs-wt-chapters{position:relative;display:flex;flex-direction:column;margin:0 calc(var(--_k-space-sibling) * -1)}
.knobs-ui .knobs-wt-chapter{position:relative;display:grid;grid-template-columns:2ch minmax(0,1fr) auto;column-gap:var(--_k-space-sibling);align-items:center;height:32px;padding:0 var(--_k-space-sibling);
  border-radius:var(--_k-radius);color:var(--_k-fg-2);text-align:left;white-space:nowrap;cursor:default;transition:color calc(var(--_k-hover-out) * 1ms),background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-wt-chapter:is(:hover,:focus-visible){color:var(--_k-fg);background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-wt-chapter:focus-visible{box-shadow:inset 0 0 0 1px var(--_k-focus)}
.knobs-wt-chapter-n{font-size:var(--_k-type-small);color:var(--_k-fg-3)}
.knobs-wt-chapter-label{min-width:0;overflow:hidden;${fade}}
.knobs-wt-chapter-time{font:var(--_k-weight) var(--_k-type-small)/1 var(--_k-mono);color:var(--_k-fg-3)}
.knobs-pick-copy :is(.knobs-wt-chapter-n,.knobs-wt-chapter-time){color:var(--_k-fg-2)}
/* Every hover in the walkthrough lands at once (hover-in, 0 ms) and eases out (hover-out): links,
   buttons, chips, rail, chapter, table and stack rows (its own; the pieces inside keep theirs). */
:is(.knobs-walkthrough,.knobs-wt-slot) :is(a,button,[data-go])[class*="knobs-wt-"]:is(:hover,:focus-visible),
.knobs-walkthrough a:not([class]):hover,
:is(.knobs-walkthrough,.knobs-wt-slot) :is(.knobs-wt-srow,tr)[data-go]:is(:hover,:focus-visible) :is(td,.knobs-wt-stitle){transition-duration:calc(var(--_k-hover-in) * 1ms)}
@media(prefers-reduced-motion:reduce){:is(.knobs-walkthrough,.knobs-wt-slot) :where(*,::before,::after){transition-duration:.15s!important;transition-property:opacity,background,color!important}}
@media(prefers-reduced-motion:reduce){.knobs-wt-disc-content{transition:opacity .15s}}
`
