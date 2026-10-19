// The compare viewer: a soft rounded stage holding the two sides (side by side, a split screen
// down the middle with no margins; overlaid, letterboxed, never cropped), with light chrome: the
// modes as words above it, Before and After as small glass labels in their sides' corners, the
// wipe as a hairline with a small grip, and, zoomed, a glass pill with the zoom and a Reset. The
// timeline sits under it.
export const compareCss = `
:where(.knobs-compare,.knobs-compare *,.knobs-cmp-strip,.knobs-cmp-strip *){box-sizing:border-box}
.knobs-ui.knobs-compare{--ku-cmp-diff:var(--k-compare-diff,#7dcf9c);--ku-cmp-line:var(--k-compare-line,#fff);
  --ku-cmp-stage:var(--k-compare-stage,var(--ku-surface));
  display:flex;flex-direction:column;gap:6px;width:100%;height:100%;min-height:160px;outline:none;user-select:none;-webkit-user-select:none;
  font:var(--ku-font-weight) var(--ku-font-size)/1.35 var(--ku-font);color:var(--ku-text);letter-spacing:normal;text-align:left}
:where(.knobs-ui) :is(.knobs-cmp-mode,.knobs-cmp-toggle){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;margin:0;padding:0;outline:none;box-shadow:none}
.knobs-cmp-bar{flex:none;display:flex;align-items:center;gap:2px;height:24px;padding:0 2px}
.knobs-cmp-modes{display:flex;align-items:center;gap:2px}
.knobs-ui .knobs-cmp-mode,.knobs-ui .knobs-cmp-toggle{height:22px;padding:0 7px;border-radius:max(0px,calc(var(--ku-radius) - 2px));color:var(--ku-dim);cursor:pointer;white-space:nowrap;
  transition:color .15s,background .15s}
.knobs-ui .knobs-cmp-mode:is(:hover,:focus-visible),.knobs-ui .knobs-cmp-toggle:is(:hover,:focus-visible){color:var(--ku-text);background:var(--ku-wash)}
.knobs-ui .knobs-cmp-mode[aria-checked="true"],.knobs-ui .knobs-cmp-toggle[aria-pressed="true"]{color:var(--ku-text);font-weight:var(--ku-label-weight)}
.knobs-cmp-fill{flex:1}
.knobs-cmp-toggle[hidden]{display:none}
/* One surface: on a card (a walkthrough's step, a split's pane, anything .knobs-surface) or marked
   data-nested, the stage drops its fill and the sides sit on that card. */
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-ui.knobs-compare,.knobs-ui.knobs-compare[data-nested]{--ku-cmp-stage:var(--k-compare-stage,transparent)}
/* In a page's flow (a container with no height), it takes the height its sides need. */
.knobs-ui.knobs-compare[data-auto]{height:auto}
.knobs-compare[data-auto] .knobs-cmp-stage{flex:none;min-height:0}
.knobs-cmp-stage{position:relative;flex:1;min-height:96px;overflow:hidden;border-radius:var(--ku-panel-radius);background:var(--ku-cmp-stage);touch-action:pan-y;outline:none}
.knobs-compare[data-frame="flat"] .knobs-cmp-stage{border-radius:0}
.knobs-compare[data-mode="wipe"] .knobs-cmp-stage{cursor:ew-resize}
/* Unzoomed, a finger still scrolls the page up and down; zoomed, the stage takes every gesture. */
.knobs-compare[data-zoomed] .knobs-cmp-stage{cursor:grab;touch-action:none}
.knobs-compare[data-panning],.knobs-compare[data-panning] *{cursor:grabbing!important}
.knobs-compare[data-dragging],.knobs-compare[data-dragging] *{cursor:ew-resize!important}
.knobs-cmp-sizer{position:absolute;left:0;right:0;top:0;height:0;visibility:hidden;pointer-events:none}
.knobs-cmp-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.knobs-cmp-media{position:absolute;left:0;top:0;display:block;max-width:none;margin:0;padding:0;border:0;object-fit:fill;transform-origin:0 0;pointer-events:none;will-change:transform}
.knobs-compare[data-renderer="gpu"] .knobs-cmp-media{opacity:0}
/* Glass: what's behind shows through, blurred, on the knobs tokens. */
.knobs-cmp-label,.knobs-cmp-zoom{background:color-mix(in srgb,var(--ku-bg) 52%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.6);backdrop-filter:blur(14px) saturate(1.6);
  box-shadow:inset 0 0 0 .5px var(--ku-line),inset 0 1px 0 var(--ku-rim),0 2px 10px rgba(0,0,0,.18)}
.knobs-cmp-label{position:absolute;left:0;top:0;padding:1px 7px;border-radius:999px;font-size:var(--ku-text-meta);line-height:16px;color:var(--ku-label);white-space:nowrap;pointer-events:none;will-change:transform;transition:color .15s}
.knobs-cmp-label[data-lit]{color:var(--ku-text)}
.knobs-cmp-label[data-dim]{color:var(--ku-dim)}
/* The wipe: a hairline down the line with a grip at its middle; a wider strip takes the hand and
   the keys (a slider). It fades with the mode. */
.knobs-cmp-handle{cursor:ew-resize;position:absolute;left:-12px;top:0;width:24px;height:0;opacity:0;pointer-events:none;outline:none;will-change:transform;transition:opacity .18s cubic-bezier(.4,0,1,1)}
.knobs-cmp-handle[data-on]{opacity:1;pointer-events:auto;transition:opacity .22s cubic-bezier(.2,.8,.2,1)}
.knobs-cmp-handle::before{content:"";position:absolute;top:0;bottom:0;left:11.5px;width:1px;background:var(--ku-cmp-line);box-shadow:0 0 0 .5px rgba(0,0,0,.28),0 0 6px rgba(0,0,0,.25)}
.knobs-cmp-handle::after{content:"";position:absolute;top:50%;left:9px;width:6px;height:28px;margin-top:-14px;border-radius:3px;background:var(--ku-cmp-line);
  box-shadow:0 1px 3px rgba(0,0,0,.35),0 0 0 .5px rgba(0,0,0,.2);transition:scale .18s var(--ku-ease),box-shadow .15s}
.knobs-compare[data-dragging] .knobs-cmp-handle::after{scale:1.12}
.knobs-cmp-handle:focus-visible::after,.knobs-compare[data-keyboard] .knobs-cmp-handle:focus::after{box-shadow:0 1px 3px rgba(0,0,0,.35),0 0 0 3px color-mix(in srgb,var(--ku-accent) 40%,transparent)}
/* The split's hairline, down the middle side by side. */
.knobs-cmp-split{position:absolute;left:0;top:0;width:1px;height:0;margin-left:-.5px;background:color-mix(in srgb,var(--ku-bg) 72%,transparent);pointer-events:none;will-change:transform,opacity}
/* Zoomed: how far, and a way back, in the stage's corner; it fades in and out, nothing shifts. */
.knobs-cmp-zoom{position:absolute;right:8px;bottom:8px;display:flex;align-items:center;gap:4px;height:26px;padding:0 3px 0 10px;border-radius:999px;
  color:var(--ku-text);font-size:var(--ku-text-meta);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap;
  opacity:0;scale:.96;pointer-events:none;transition:opacity .16s cubic-bezier(.4,0,1,1),scale .16s cubic-bezier(.4,0,1,1)}
.knobs-cmp-zoom[data-on]{opacity:1;scale:1;pointer-events:auto;transition:opacity .2s cubic-bezier(.2,.8,.2,1),scale .2s cubic-bezier(.2,.8,.2,1)}
:where(.knobs-ui) .knobs-cmp-zoom-reset{all:revert;box-sizing:border-box;font:inherit;letter-spacing:inherit;margin:0;border:0;outline:none;box-shadow:none;
  height:20px;padding:0 8px;border-radius:999px;background:transparent;color:var(--ku-label);cursor:pointer;transition:color .15s,background .15s}
:where(.knobs-ui) .knobs-cmp-zoom-reset:is(:hover,:focus-visible){color:var(--ku-text);background:color-mix(in srgb,var(--ku-text) 12%,transparent)}
.knobs-cmp-note{position:absolute;left:50%;top:50%;translate:-50% -50%;color:var(--ku-dim);font-size:var(--ku-text-meta);pointer-events:none}
.knobs-cmp-note:empty{display:none}
.knobs-cmp-strip-host{flex:none;height:60px;min-height:0}
.knobs-cmp-timeline-host{flex:none;height:56px;min-height:0}
/* The frame strip: Before over After per column, a difference bar under them, a dot where it peaks. */
.knobs-ui.knobs-cmp-strip{--ku-cmp-diff:var(--k-compare-diff,#7dcf9c);position:relative;width:100%;height:100%;min-height:40px;overflow:hidden;cursor:col-resize;touch-action:none;
  font:var(--ku-font-weight) var(--ku-font-size)/1.35 var(--ku-font);color:var(--ku-text)}
.knobs-cmp-strip>canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
@media(prefers-reduced-motion:reduce){:is(.knobs-compare,.knobs-cmp-strip) :where(*,::before,::after){transition-duration:.12s!important}}
`
