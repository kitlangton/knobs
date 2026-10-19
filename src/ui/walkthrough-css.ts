import { springCss } from "../core/spring.js"

// kit-motion: nothing moves on load; state changes ease on springs given as a duration with no
// bounce: picks and note rows on the snappy .25 s, the progress bar on the calm .4 s (the
// contents' pill, the page's scroll and full-window spring in walkthrough.ts). Reduced motion keeps
// short fades and drops the travel.
const snappy = springCss({ duration: 0.25, bounce: 0 })
const calm = springCss({ duration: 0.4, bounce: 0 })

// The walkthrough: a page an agent writes for Kit. A sticky contents rail beside a column of
// sections, under a feed of the agent's updates and with a note bar docked at the bottom; each
// step is one rounded card (.knobs-surface) holding its caption, media and notes, so the media
// inside draw no card of their own. Prose takes a readable measure;
// media take the column's width, two-up where there's room.
export const walkthroughCss = `
:where(.knobs-walkthrough,.knobs-walkthrough *,.knobs-wt-slot,.knobs-wt-slot *){box-sizing:border-box}
.knobs-ui.knobs-walkthrough{--kw-snappy:${snappy.easing};--kw-snappy-ms:${snappy.duration}ms;--kw-calm:${calm.easing};--kw-calm-ms:${calm.duration}ms;
  --kw-text:var(--k-walkthrough-text,14px);--kw-measure:var(--k-walkthrough-measure,68ch);--kw-good:var(--k-walkthrough-good,#30d158);--kw-info:var(--k-walkthrough-info,#64d2ff);
  --kw-card:var(--ku-pane-bg);--kw-card-ring:var(--ku-pane-ring);--kw-pad:16px;--kw-ink:var(--k-walkthrough-ink,#ff375f);
  container:knobs-wt / inline-size;display:block;width:100%;color:var(--ku-text);font:var(--ku-font-weight) var(--kw-text)/1.5 var(--ku-font);text-align:left;
  letter-spacing:normal;-webkit-font-smoothing:antialiased}
.knobs-ui.knobs-walkthrough[data-theme="light"],:where(:root[data-theme="light"]) .knobs-ui.knobs-walkthrough[data-theme="auto"]{--kw-good:var(--k-walkthrough-good,#248a3d);--kw-info:var(--k-walkthrough-info,#0071a4)}
@media(prefers-color-scheme:light){:where(:root:not([data-theme="dark"])) .knobs-ui.knobs-walkthrough[data-theme="auto"]{--kw-good:var(--k-walkthrough-good,#248a3d);--kw-info:var(--k-walkthrough-info,#0071a4)}}
.knobs-walkthrough [hidden]{display:none!important}
.knobs-walkthrough :is(h1,h2,h3,p){margin:0;font:inherit;letter-spacing:inherit}
.knobs-walkthrough a{color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);text-underline-offset:2px;transition:text-decoration-color .15s}
.knobs-walkthrough a:hover{text-decoration-color:currentColor}
.knobs-walkthrough code,.knobs-wt-slot code{font:calc(1em - 1px) var(--ku-mono);padding:1px 5px;border-radius:5px;background:var(--ku-surface)}
:where(.knobs-ui) :is(.knobs-wt-btn,.knobs-wt-pick,.knobs-wt-toc-step){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;
  background:transparent;border:0;border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}

/* ——— layout: the rail beside the column; one column where it's narrow ——— */
.knobs-wt-layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:40px;align-items:start}
.knobs-wt-main{display:flex;flex-direction:column;gap:56px;min-width:0;max-width:1120px;padding-bottom:40vh}
@container knobs-wt (max-width:880px){.knobs-wt-layout{grid-template-columns:minmax(0,1fr);gap:0}.knobs-wt-main{gap:44px}}

/* ——— the page's head ——— */
.knobs-wt-head{display:flex;flex-direction:column;gap:10px}
.knobs-wt-title{font-size:calc(var(--kw-text) + 10px)!important;font-weight:var(--ku-title-weight)!important;line-height:1.2;letter-spacing:-.01em!important}
.knobs-wt-summary{max-width:var(--kw-measure);color:var(--ku-label)}
.knobs-wt-meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--ku-dim);font-size:calc(var(--kw-text) - 2px)}
.knobs-wt-meta>span{display:inline-flex;gap:6px;white-space:nowrap}
.knobs-wt-meta b{font-weight:var(--ku-font-weight);color:var(--ku-label);font-family:var(--ku-mono);font-size:calc(1em - .5px)}

/* ——— a section: a PR or topic ——— */
.knobs-wt-section{display:flex;flex-direction:column;gap:14px;min-width:0}
.knobs-wt-shead{display:flex;flex-direction:column;gap:6px;scroll-margin-top:16px}
.knobs-wt-kicker{display:flex;align-items:center;gap:10px;font-size:calc(var(--kw-text) - 2px);color:var(--ku-dim)}
.knobs-wt-kicker a{font-family:var(--ku-mono);color:var(--ku-label);text-decoration:none}
.knobs-wt-kicker a:hover{color:var(--ku-text)}
.knobs-wt-stitle{font-size:calc(var(--kw-text) + 4px)!important;font-weight:var(--ku-title-weight)!important;line-height:1.3}
.knobs-wt-ssum{max-width:var(--kw-measure);color:var(--ku-label)}
.knobs-wt-chip{display:inline-flex;align-items:center;gap:6px;height:20px;padding:0 8px;border-radius:999px;font-size:calc(var(--kw-text) - 3px);font-weight:var(--ku-label-weight);white-space:nowrap;
  --kw-tone:var(--ku-label);color:var(--kw-tone);background:color-mix(in srgb,var(--kw-tone) 14%,transparent)}
.knobs-wt-chip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="good"]{--kw-tone:var(--kw-good)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="warn"]{--kw-tone:var(--ku-warn)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="bad"]{--kw-tone:var(--ku-critical)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="info"]{--kw-tone:var(--kw-info)}
:is(.knobs-wt-chip,.knobs-wt-toc-glyph)[data-tone="dim"]{--kw-tone:var(--ku-label)}

/* ——— a step: one card ——— */
.knobs-wt-step{position:relative;display:flex;flex-direction:column;gap:12px;padding:var(--kw-pad);border-radius:var(--ku-panel-radius);background:var(--kw-card);box-shadow:var(--kw-card-ring);
  scroll-margin-top:16px;outline:none;container:knobs-wt-step / inline-size}
.knobs-walkthrough[data-frame="flat"] .knobs-wt-step{box-shadow:inset 0 0 0 1px var(--ku-line)}
.knobs-wt-step-head{display:flex;align-items:baseline;gap:10px;min-width:0}
.knobs-wt-num{flex:none;font:var(--ku-font-weight) calc(var(--kw-text) - 2px)/1 var(--ku-mono);color:var(--ku-dim);font-variant-numeric:tabular-nums}
.knobs-wt-stepTitle{flex:1;min-width:0;font-weight:var(--ku-title-weight)!important}
.knobs-wt-caption{max-width:var(--kw-measure);color:var(--ku-label);margin-top:-6px!important}
.knobs-wt-question{font-weight:var(--ku-label-weight)!important}
/* The step Kit is on: its number lights, and its choices show their keys. */
.knobs-wt-step[data-current] .knobs-wt-num{color:var(--ku-text)}
.knobs-wt-media{display:grid;grid-template-columns:repeat(var(--kw-n,1),minmax(0,1fr));gap:12px;min-width:0}
@container knobs-wt-step (max-width:640px){.knobs-wt-media{grid-template-columns:minmax(0,1fr)}}

/* ——— the feed: the agent's updates and answers, newest first, compact ——— */
.knobs-wt-feed{margin-top:-24px}
.knobs-wt-feed-list{list-style:none;margin:0;padding:0;max-height:260px;overflow:auto;scrollbar-width:none;display:flex;flex-direction:column}
.knobs-wt-feed-list::-webkit-scrollbar{display:none}
.knobs-wt-fi{display:grid;grid-template-columns:64px 56px minmax(0,1fr) auto;gap:10px;align-items:baseline;padding:6px 0;font-size:calc(var(--kw-text) - 1px)}
.knobs-wt-fi+.knobs-wt-fi{box-shadow:inset 0 1px 0 var(--ku-line)}
.knobs-wt-fi-when{color:var(--ku-dim);font-size:calc(var(--kw-text) - 2.5px);font-variant-numeric:tabular-nums;white-space:nowrap}
.knobs-wt-fi-kind{color:var(--ku-label);font-size:calc(var(--kw-text) - 2.5px);font-weight:var(--ku-label-weight)}
.knobs-wt-fi[data-kind="qa"] .knobs-wt-fi-kind{color:var(--kw-info)}
.knobs-wt-fi-body{max-width:var(--kw-measure);color:var(--ku-text)}
.knobs-wt-fi-q{color:var(--ku-label)}
.knobs-wt-fi-q::before{content:"You asked: ";color:var(--ku-dim)}
:where(.knobs-ui) .knobs-wt-fi-step{all:revert;box-sizing:border-box;font:var(--ku-font-weight) calc(var(--kw-text) - 2.5px)/1 var(--ku-mono);color:var(--ku-label);background:transparent;border:0;
  padding:3px 6px;margin:0;border-radius:6px;cursor:pointer;outline:none;transition:background .15s,color .15s}
.knobs-ui .knobs-wt-fi-step:is(:hover,:focus-visible){background:var(--ku-wash-hi);color:var(--ku-text)}

/* ——— a step's sent notes ——— */
.knobs-wt-notes{display:flex;flex-direction:column}
.knobs-wt-notes:empty{display:none}
.knobs-wt-n{display:flex;align-items:flex-start;gap:10px;padding:6px 0;overflow:hidden;
  transition:height var(--kw-snappy-ms) var(--kw-snappy),opacity var(--kw-snappy-ms) var(--kw-snappy),filter var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-n[data-entering]{opacity:0;filter:blur(3px)}
.knobs-wt-n[data-leaving]{opacity:0;filter:blur(3px);padding-block:0}
.knobs-wt-n+.knobs-wt-n{box-shadow:inset 0 1px 0 var(--ku-line)}
.knobs-wt-n-meta{flex:none;min-width:44px;padding-top:2px;color:var(--ku-dim);font:var(--ku-font-weight) calc(var(--kw-text) - 2.5px)/1.4 var(--ku-mono);font-variant-numeric:tabular-nums}
.knobs-wt-n-meta[data-seek]{cursor:pointer}
.knobs-wt-n-meta[data-seek]:hover{color:var(--ku-text)}
.knobs-wt-n-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;font-size:calc(var(--kw-text) - 1px)}
.knobs-wt-n-voice{height:30px;max-width:320px}
.knobs-wt-n-ink{display:block;width:120px;max-height:80px;border-radius:6px;background:var(--ku-surface)}
.knobs-wt-n-ink path{fill:none;stroke:var(--kw-ink);stroke-width:2px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}

/* ——— the note bar, docked at the bottom of the column ——— */
.knobs-wt-dock{position:sticky;bottom:12px;z-index:40;margin-top:-24px}
.knobs-wt-notebar{display:flex;flex-direction:column;gap:2px;padding:6px 6px 6px 14px;border-radius:calc(var(--ku-panel-radius) + 2px);background:var(--ku-bg);
  box-shadow:var(--ku-pane-ring),var(--ku-shadow)}
.knobs-wt-on{padding-top:3px;color:var(--ku-dim);font-size:calc(var(--kw-text) - 2.5px);white-space:nowrap;overflow:hidden;
  -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent)}
.knobs-wt-row{display:flex;align-items:flex-end;gap:4px}
:where(.knobs-ui) :is(.knobs-wt-input,.knobs-wt-tool,.knobs-wt-x,.knobs-wt-back){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;
  border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}
.knobs-ui .knobs-wt-input{flex:1;min-width:0;height:32px;max-height:140px;padding:6px 0;resize:none;color:var(--ku-text);caret-color:var(--ku-accent);line-height:20px;font-size:var(--kw-text)}
.knobs-ui .knobs-wt-input::placeholder{color:var(--ku-dim)}
.knobs-wt-attach{display:flex;gap:4px;align-items:center;align-self:center}
.knobs-wt-attach:empty{display:none}
.knobs-wt-chip-a{display:inline-flex;align-items:center;gap:2px;height:24px;padding:0 2px 0 9px;border-radius:999px;background:var(--ku-surface-hi);font-size:calc(var(--kw-text) - 2.5px);white-space:nowrap}
.knobs-ui .knobs-wt-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;color:var(--ku-dim);cursor:pointer;transition:background .15s,color .15s}
.knobs-ui .knobs-wt-x:is(:hover,:focus-visible){background:var(--ku-wash-hi);color:var(--ku-text)}
.knobs-wt-x svg{width:10px;height:10px}
.knobs-ui .knobs-wt-tool{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:32px;height:32px;padding:0 8px;border-radius:calc(var(--ku-radius) + 2px);
  color:var(--ku-label);cursor:pointer;transition:background .15s,color .15s}
.knobs-ui .knobs-wt-tool:is(:hover,:focus-visible){background:var(--ku-wash-hi);color:var(--ku-text)}
.knobs-ui .knobs-wt-tool[aria-pressed="true"]{background:var(--ku-surface-hi);color:var(--ku-text)}
.knobs-wt-tool svg{width:15px;height:15px}
.knobs-wt-rec{font-size:calc(var(--kw-text) - 2.5px);font-variant-numeric:tabular-nums}
.knobs-wt-rec:empty{display:none}
.knobs-ui .knobs-wt-tool[data-send]{color:var(--ku-dim)}
.knobs-ui .knobs-wt-tool[data-send][data-ready]{background:var(--ku-accent);color:var(--ku-bg)}
/* Back: in place over the bar for a few seconds after a note moves the page on. */
.knobs-ui .knobs-wt-back{position:absolute;left:8px;bottom:calc(100% + 8px);height:28px;padding:0 12px;border-radius:999px;background:var(--ku-bg);color:var(--ku-text);
  box-shadow:var(--ku-pane-ring),var(--ku-shadow);font-size:calc(var(--kw-text) - 1.5px);font-weight:var(--ku-label-weight);cursor:pointer;
  opacity:0;scale:.96;filter:blur(3px);pointer-events:none;transition:opacity .11s cubic-bezier(.4,0,1,1),scale .11s cubic-bezier(.4,0,1,1),filter .11s cubic-bezier(.4,0,1,1)}
.knobs-ui .knobs-wt-back[data-on]{opacity:1;scale:1;filter:none;pointer-events:auto;transition:opacity .15s cubic-bezier(.2,.8,.2,1),scale .15s cubic-bezier(.2,.8,.2,1),filter .15s cubic-bezier(.2,.8,.2,1)}
.knobs-ui .knobs-wt-back:hover{background:var(--ku-surface-hi)}

/* ——— ink over a step's media ——— */
.knobs-wt-media,.knobs-wt-options{position:relative}
.knobs-wt-ink{position:absolute;inset:0;z-index:5;width:100%;height:100%;overflow:visible;pointer-events:none;touch-action:none}
.knobs-wt-ink[data-on]{pointer-events:auto;cursor:crosshair}
.knobs-wt-ink path{fill:none;stroke:var(--kw-ink);stroke-width:3px;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}

/* ——— full-window: the step over the page, its media filling it; its place held in the page ——— */
.knobs-wt-scrim{position:fixed;inset:0;z-index:30;background:color-mix(in srgb,var(--ku-page) 82%,transparent);opacity:0;pointer-events:none}
.knobs-wt-scrim[data-on]{pointer-events:auto}
.knobs-wt-hold-card{flex:none}
.knobs-wt-step[data-full]{position:fixed;z-index:35;margin:0;overflow:hidden;overscroll-behavior:contain;padding-bottom:84px;box-shadow:var(--kw-card-ring),var(--ku-shadow);background:var(--ku-bg)}
.knobs-wt-step[data-full]>:not(.knobs-wt-media){flex:none}
.knobs-wt-step[data-full] .knobs-wt-notes{display:none}
.knobs-wt-step[data-full]>.knobs-wt-media{flex:1;min-height:0;grid-auto-rows:minmax(0,1fr)}
.knobs-wt-step[data-full] .knobs-wt-slot{display:flex;flex-direction:column;min-height:0}
.knobs-wt-step[data-full] .knobs-wt-body{flex:1;min-height:0}
.knobs-wt-step[data-full] .knobs-wt-fit{height:100%;transition:none}
.knobs-wt-step[data-full] .knobs-wt-frame{height:100%;aspect-ratio:auto}

/* ——— a taste test: the options side by side, Kit's pick lit and the rest stepping back ——— */
.knobs-wt-options{display:grid;grid-template-columns:repeat(var(--kw-n,2),minmax(0,1fr));gap:10px}
@container knobs-wt-step (max-width:640px){.knobs-wt-options{grid-template-columns:minmax(0,1fr)}}
.knobs-wt-option{position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;padding:8px;border-radius:calc(var(--ku-panel-radius) - 4px);background:var(--ku-wash);
  transition:background var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-option[data-picked]{background:color-mix(in srgb,var(--ku-accent) 12%,var(--ku-wash))}
.knobs-wt-option>:not(.knobs-wt-pick){transition:opacity var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-options[data-has-pick] .knobs-wt-option:not([data-picked])>:not(.knobs-wt-pick){opacity:.55}
.knobs-ui .knobs-wt-pick{display:flex;align-items:center;gap:8px;width:100%;min-height:28px;padding:0 4px;border-radius:calc(var(--ku-radius) - 2px);cursor:pointer;color:var(--ku-label);text-align:left}
.knobs-ui .knobs-wt-pick:is(:hover,:focus-visible){color:var(--ku-text)}
.knobs-wt-letter{flex:none;font:var(--ku-title-weight) calc(var(--kw-text) - 1px)/1 var(--ku-font);color:var(--ku-text)}
.knobs-wt-olabel{flex:1;min-width:0;font-weight:var(--ku-label-weight);color:var(--ku-text)}
.knobs-wt-suggested{flex:none;font-size:calc(var(--kw-text) - 3px);color:var(--ku-dim)}
.knobs-wt-check{flex:none;display:flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;background:var(--ku-surface);color:transparent;
  transition:background var(--kw-snappy-ms) var(--kw-snappy),color var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-check svg{width:12px;height:12px}
.knobs-wt-option[data-picked] .knobs-wt-check{background:var(--ku-accent);color:var(--ku-bg)}
.knobs-wt-key{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 3px;border-radius:4px;background:var(--ku-surface);color:var(--ku-dim);
  font:var(--ku-label-weight) calc(var(--kw-text) - 4px)/1 var(--ku-font);font-variant-numeric:tabular-nums;opacity:.5;transition:opacity .15s}
.knobs-wt-step[data-current] .knobs-wt-key{opacity:1}
.knobs-wt-ocap{color:var(--ku-label);font-size:calc(var(--kw-text) - 1px);padding:0 4px}

/* ——— the rail: progress, contents, export ——— */
.knobs-wt-rail{position:sticky;top:16px;display:flex;flex-direction:column;gap:14px;max-height:calc(100vh - 32px);min-height:0;font-size:calc(var(--kw-text) - 1.5px)}
.knobs-wt-progress{display:flex;flex-direction:column;gap:7px}
.knobs-wt-count{display:flex;align-items:baseline;justify-content:space-between;color:var(--ku-label);font-variant-numeric:tabular-nums}
.knobs-wt-count b{color:var(--ku-text);font-weight:var(--ku-label-weight)}
.knobs-wt-bar{position:relative;height:4px;border-radius:2px;overflow:hidden;background:var(--ku-surface)}
.knobs-wt-fill{position:absolute;inset:0;border-radius:inherit;background:var(--ku-accent);transform-origin:0 50%;transform:scaleX(var(--kw-done,0))}
.knobs-walkthrough[data-settled] .knobs-wt-fill{transition:transform var(--kw-calm-ms) var(--kw-calm)}
/* The contents: no box, one text spine for sections and steps (the steps' dots hang in the
   gutter left of it), and one pill behind the current step that springs between rows. */
.knobs-wt-toc{position:relative;flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none;margin:0 -8px;padding:0 0 8px}
.knobs-wt-toc::-webkit-scrollbar{display:none}
.knobs-wt-toc-section{display:block;padding:12px 8px 4px 26px;color:var(--ku-dim);font-size:calc(var(--kw-text) - 3px);font-weight:var(--ku-label-weight);white-space:nowrap;overflow:hidden;
  -webkit-mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent)}
.knobs-wt-toc-section:first-of-type{padding-top:2px}
.knobs-wt-toc-mark{position:absolute;left:0;right:0;top:0;height:0;border-radius:calc(var(--ku-radius) - 1px);background:var(--ku-wash-hi);pointer-events:none;opacity:0;will-change:transform}
.knobs-wt-toc-mark[data-on]{opacity:1}
.knobs-walkthrough[data-settled] .knobs-wt-toc-mark{transition:opacity .15s}
.knobs-ui .knobs-wt-toc-step{position:relative;display:flex;align-items:center;width:100%;text-align:left;height:26px;padding:0 8px 0 26px;color:var(--ku-label);cursor:pointer;white-space:nowrap}
.knobs-ui .knobs-wt-toc-step:is(:hover,:focus-visible){color:var(--ku-text)}
.knobs-wt-toc-step[aria-current="step"]{color:var(--ku-text)}
.knobs-wt-toc-label{flex:1;min-width:0;overflow:hidden;-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 1.5em),transparent)}
/* A step's state: an open ring, a filled dot once answered, nothing to answer a faint ring. */
.knobs-wt-toc-glyph{--kw-tone:var(--ku-dim);position:absolute;left:11px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;box-shadow:inset 0 0 0 1.5px var(--kw-tone);
  transition:background var(--kw-snappy-ms) var(--kw-snappy),box-shadow var(--kw-snappy-ms) var(--kw-snappy)}
.knobs-wt-toc-glyph[data-tone="accent"]{--kw-tone:var(--ku-accent)}
.knobs-wt-toc-glyph[data-done]{background:var(--kw-tone)}
.knobs-wt-toc-glyph[data-tone="none"]{box-shadow:inset 0 0 0 1px var(--ku-line)}
.knobs-wt-actions{display:flex;flex-wrap:wrap;gap:4px}
.knobs-ui .knobs-wt-btn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:var(--ku-radius);color:var(--ku-label);cursor:pointer;white-space:nowrap;
  transition:background .15s,color .15s}
.knobs-ui .knobs-wt-btn:is(:hover,:focus-visible){background:var(--ku-wash-hi);color:var(--ku-text)}
.knobs-ui .knobs-wt-btn[data-primary]{background:var(--ku-surface-hi);color:var(--ku-text)}
.knobs-ui .knobs-wt-btn[data-primary]:is(:hover,:focus-visible){background:color-mix(in srgb,var(--ku-text) 16%,transparent)}
.knobs-wt-keys{color:var(--ku-dim);font-size:calc(var(--kw-text) - 3px);line-height:1.6}
.knobs-wt-keys kbd{font:inherit;color:var(--ku-label)}
/* Narrow: the rail becomes a bar along the top, with the progress and the export only. */
@container knobs-wt (max-width:880px){
  .knobs-wt-rail{z-index:4;flex-direction:row;align-items:center;gap:12px;max-height:none;margin:0 calc(var(--kw-pad) * -1) 20px;padding:8px var(--kw-pad);top:0;background:var(--ku-page)}
  .knobs-wt-progress{flex:1}.knobs-wt-toc,.knobs-wt-keys{display:none}
  .knobs-wt-step,.knobs-wt-shead{scroll-margin-top:60px}
}

/* ——— media slots ——— */
.knobs-ui.knobs-wt-slot{position:relative;min-width:0;container:knobs-wt-slot / inline-size;color:var(--ku-text);font:var(--ku-font-weight) var(--k-walkthrough-text,14px)/1.5 var(--ku-font)}
.knobs-wt-slot-label{display:block;margin:0 0 6px 2px;font:var(--ku-label-weight) calc(var(--k-walkthrough-text,14px) - 3px)/1.3 var(--ku-font);color:var(--ku-label);letter-spacing:.04em;text-transform:uppercase}
/* A compare is exactly as tall as its pictures at this width, so there's no letterbox: the two
   sides edge to edge (side) or one (overlaid), plus its mode bar, the timeline and their two gaps
   (92 px), and the frame strip with its gap (158 px). */
.knobs-wt-fit{width:100%;height:calc(100cqw / 2 / var(--kw-aspect,1.7778) + var(--kw-chrome,92px))}
.knobs-wt-fit[data-overlay]{height:calc(100cqw / var(--kw-aspect,1.7778) + var(--kw-chrome,92px))}
.knobs-wt-fit[data-strip]{--kw-chrome:158px}
.knobs-wt-fit[data-settled]{transition:height var(--k-wt-calm-ms,${calm.duration}ms) ${calm.easing}}
.knobs-wt-frame{position:relative;width:100%;overflow:hidden;border-radius:calc(var(--ku-panel-radius) - 4px);background:var(--ku-surface);aspect-ratio:var(--kw-aspect,16/9)}
.knobs-wt-frame>:is(video,img){position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;margin:0;border:0}
.knobs-wt-frame[data-natural]{aspect-ratio:auto}
.knobs-wt-frame[data-natural]>img{position:static;height:auto}
.knobs-wt-code{margin:0;padding:12px 14px;max-height:420px;overflow:auto;border-radius:calc(var(--ku-panel-radius) - 4px);background:var(--ku-surface);color:var(--ku-text);
  font:calc(var(--k-walkthrough-text,14px) - 2px)/1.55 var(--ku-mono);white-space:pre;tab-size:2;scrollbar-width:thin}
.knobs-wt-code[data-terminal]{white-space:pre-wrap;overflow-wrap:anywhere}
.knobs-wt-prompt{color:var(--ku-dim);user-select:none;-webkit-user-select:none}
.knobs-wt-cmd{color:var(--ku-text);font-weight:var(--ku-label-weight)}
.knobs-wt-out{color:var(--ku-label)}
.knobs-wt-metric{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:calc(var(--ku-panel-radius) - 4px);background:var(--ku-surface)}
.knobs-wt-mlabel{color:var(--ku-label);font-size:calc(var(--k-walkthrough-text,14px) - 2px)}
.knobs-wt-mvalue{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.knobs-wt-mfrom{color:var(--ku-dim);font-size:calc(var(--k-walkthrough-text,14px) + 2px)}
.knobs-wt-mto{font-size:calc(var(--k-walkthrough-text,14px) + 12px);font-weight:var(--ku-title-weight);line-height:1}
.knobs-wt-mof{color:var(--ku-dim)}
.knobs-wt-mdelta{--kw-tone:var(--ku-label);padding:1px 7px;border-radius:999px;font-size:calc(var(--k-walkthrough-text,14px) - 3px);font-weight:var(--ku-label-weight);color:var(--kw-tone);background:color-mix(in srgb,var(--kw-tone) 14%,transparent)}
.knobs-wt-mdelta[data-tone="good"]{--kw-tone:var(--k-walkthrough-good,#30d158)}
.knobs-wt-mdelta[data-tone="bad"]{--kw-tone:var(--ku-critical)}
.knobs-wt-mtrack{position:relative;height:4px;border-radius:2px;background:color-mix(in srgb,var(--ku-text) 8%,transparent)}
.knobs-wt-mtrack>span{position:absolute;top:0;bottom:0;left:0;border-radius:inherit}
.knobs-wt-mtrack>.knobs-wt-mafter{background:var(--ku-accent)}
.knobs-wt-mtrack>.knobs-wt-mbefore{background:color-mix(in srgb,var(--ku-text) 30%,transparent)}
.knobs-wt-callout{--kw-tone:var(--k-walkthrough-info,#64d2ff);display:flex;gap:10px;padding:10px 14px;border-radius:calc(var(--ku-panel-radius) - 4px);background:color-mix(in srgb,var(--kw-tone) 11%,transparent);color:var(--ku-text)}
.knobs-wt-callout::before{content:"";flex:none;width:6px;height:6px;margin-top:.62em;border-radius:50%;background:var(--kw-tone)}
.knobs-wt-callout[data-tone="good"]{--kw-tone:var(--k-walkthrough-good,#30d158)}
.knobs-wt-callout[data-tone="warn"]{--kw-tone:var(--ku-warn)}
.knobs-wt-callout[data-tone="bad"]{--kw-tone:var(--ku-critical)}
.knobs-wt-text{max-width:var(--k-walkthrough-measure,68ch);color:var(--ku-label)}
.knobs-wt-hold{border-radius:calc(var(--ku-panel-radius) - 4px);background:var(--ku-surface)}
.knobs-wt-failed{display:flex;align-items:center;justify-content:center;min-height:80px;color:var(--ku-dim);font-size:calc(var(--k-walkthrough-text,14px) - 2px)}
@media(prefers-reduced-motion:reduce){:is(.knobs-walkthrough,.knobs-wt-slot) :where(*,::before,::after){transition-duration:.15s!important;transition-property:opacity,background,color!important}}
`
