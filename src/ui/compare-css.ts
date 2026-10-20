// The compare viewer: a soft rounded stage holding the two sides (side by side, a split screen
// down the middle with no margins; fused, one side's size in the middle, never cropped), with
// light chrome: the modes as a segmented control above it (the selection pill on the one picked),
// Before and After as small glass labels in their sides' corners (wiping, either side of the
// seam), the wipe as a hairline with a raised grip in its middle, and, zoomed, a glass pill with
// the zoom and a reset. Its timeline, a slim lane, sits under it.
export const compareCss = `
:where(.knobs-compare,.knobs-compare *,.knobs-cmp-strip,.knobs-cmp-strip *){box-sizing:border-box}
.knobs-ui.knobs-compare{--_ku-cmp-diff:var(--k-compare-diff,var(--_k-ok));--_ku-cmp-line:var(--_k-compare-divider);
  --_ku-cmp-stage:var(--_k-compare-stage);
  display:flex;flex-direction:column;gap:6px;width:100%;height:100%;min-height:160px;outline:none;user-select:none;-webkit-user-select:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left}
:where(.knobs-ui) :is(.knobs-cmp-mode,.knobs-cmp-toggle){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;margin:0;padding:0;outline:none;box-shadow:none}
.knobs-cmp-bar{flex:none;display:flex;align-items:center;gap:var(--_k-gap);height:var(--_k-control-h)}
/* The modes: one fill, the selection pill on the one picked; a mode isn't brighter for being
   picked: the pill's bright copy is. */
.knobs-cmp-modes{position:relative;display:inline-flex;height:var(--_k-control-h);border-radius:var(--_k-radius);background:var(--_k-fill)}
.knobs-cmp-modes[hidden]{display:none}
.knobs-ui .knobs-cmp-mode{display:inline-flex;align-items:center;height:100%;padding:0 8px;border-radius:var(--_k-radius);color:var(--_k-fg-2);cursor:pointer;white-space:nowrap;
  transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-cmp-mode:is(:hover,:focus-visible){color:var(--_k-fg)}
/* Toggles: icon buttons, the accent's wash when on. */
.knobs-ui .knobs-cmp-toggle{display:inline-flex;align-items:center;justify-content:center;width:var(--_k-control-h);height:var(--_k-control-h);border-radius:var(--_k-radius);color:var(--_k-fg-3);cursor:pointer;
  transition:color calc(var(--_k-hover-out) * 1ms),background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-cmp-toggle:is(:hover,:focus-visible){color:var(--_k-fg);background:var(--_ku-wash)}
.knobs-ui .knobs-cmp-toggle[aria-pressed="true"]{color:var(--_k-accent-fg);background:var(--_k-accent-soft)}
.knobs-cmp-toggle svg{display:block}
.knobs-cmp-fill{flex:1}
.knobs-cmp-toggle[hidden]{display:none}
/* One surface: on a card (a walkthrough's step, a split's pane, anything .knobs-surface) or marked
   data-nested, the stage drops its fill and the sides sit on that card. */
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-ui.knobs-compare,.knobs-ui.knobs-compare[data-nested]{--_ku-cmp-stage:var(--k-compare-stage,transparent)}
/* In a page's flow (a container with no height), it takes the height its sides need. */
.knobs-ui.knobs-compare[data-auto]{height:auto}
.knobs-compare[data-auto] .knobs-cmp-stage{flex:none;min-height:0}
.knobs-cmp-stage{position:relative;flex:1;min-height:96px;overflow:hidden;border-radius:var(--_k-radius-panel);background:var(--_ku-cmp-stage);touch-action:pan-y;outline:none}
.knobs-compare[data-frame="flat"] .knobs-cmp-stage{border-radius:0}
.knobs-compare[data-mode="wipe"] .knobs-cmp-stage{cursor:ew-resize}
/* Unzoomed, a finger still scrolls the page up and down; zoomed, the stage takes every gesture. */
.knobs-compare[data-zoomed] .knobs-cmp-stage{cursor:grab;touch-action:none}
.knobs-compare[data-panning],.knobs-compare[data-panning] *{cursor:grabbing!important}
/* Wiping, the grip stands in for the cursor. */
.knobs-compare[data-dragging],.knobs-compare[data-dragging] *{cursor:none!important}
.knobs-cmp-sizer{position:absolute;left:0;right:0;top:0;height:0;visibility:hidden;pointer-events:none}
.knobs-cmp-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.knobs-cmp-media{position:absolute;left:0;top:0;display:block;max-width:none;margin:0;padding:0;border:0;object-fit:fill;transform-origin:0 0;pointer-events:none;will-change:transform}
.knobs-compare[data-renderer="gpu"] .knobs-cmp-media{opacity:0}
/* Glass: what's behind shows through, blurred, on the knobs tokens. */
.knobs-cmp-label,.knobs-cmp-zoom{background:color-mix(in srgb,var(--_k-bg) 52%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.6);backdrop-filter:blur(14px) saturate(1.6);
  box-shadow:inset 0 0 0 .5px var(--_k-border),inset 0 1px 0 var(--_k-rim),0 2px 10px rgba(0,0,0,calc(.18 * var(--_k-shadow-k,1)))}
/* ✗ Before · ✓ After: Before quieter (fg-3), After in full text. Neutral: no colour of its own. */
.knobs-cmp-label{position:absolute;left:0;top:0;display:flex;align-items:center;gap:4px;padding:1px 7px 1px 5px;border-radius:999px;font-size:var(--_k-text-meta);line-height:16px;font-weight:var(--_k-weight-label);
  white-space:nowrap;pointer-events:none;will-change:transform}
.knobs-cmp-label[data-side="before"]{color:var(--_k-fg-3)}
.knobs-cmp-label[data-side="after"]{color:var(--_k-fg)}
/* Fusing, the mark folds away and the label is its name. */
.knobs-cmp-mark{flex:none;display:flex;justify-content:flex-end;overflow:hidden}
.knobs-cmp-mark svg{display:block;flex:none;width:12px;height:12px}
/* The fuse's seam: a blurred strip over where the sides meet, soft at both sides. */
.knobs-cmp-seam{position:absolute;left:0;top:0;width:8px;height:0;opacity:0;pointer-events:none;will-change:transform,opacity;
  -webkit-mask-image:linear-gradient(to right,transparent,#000 35%,#000 65%,transparent);mask-image:linear-gradient(to right,transparent,#000 35%,#000 65%,transparent)}
/* The wipe: a hairline down the line with a raised grip in its middle (at the pointer's height
   while dragged); a wider strip takes the hand and the keys (a slider). It fades in with the
   fuse; wiping, line and grip brighten. */
.knobs-cmp-handle{cursor:ew-resize;position:absolute;left:-12px;top:0;width:24px;height:0;opacity:0;pointer-events:none;outline:none;will-change:transform,opacity}
.knobs-cmp-handle[data-on]{pointer-events:auto}
.knobs-cmp-handle::before{content:"";position:absolute;top:0;bottom:0;left:11.5px;width:1px;background:color-mix(in srgb,var(--_ku-cmp-line) 72%,transparent);box-shadow:0 0 0 .5px rgba(0,0,0,.28),0 0 6px rgba(0,0,0,.25)}
.knobs-compare[data-dragging] .knobs-cmp-handle::before{background:var(--_ku-cmp-line)}
.knobs-cmp-grip{position:absolute;top:0;left:4px;width:16px;height:28px;border-radius:min(8px,calc(var(--_k-radius) * 999));background:var(--_k-bg-overlay);
  box-shadow:var(--_k-shadow-overlay),inset 0 0 0 1px var(--_k-border),inset 0 1px 0 var(--_k-rim);will-change:transform;transition:box-shadow calc(var(--_k-hover-out) * 1ms)}
.knobs-cmp-grip::before,.knobs-cmp-grip::after{content:"";position:absolute;top:10px;width:1px;height:8px;background:var(--_k-fg-3);transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-cmp-grip::before{left:6px}
.knobs-cmp-grip::after{left:9px}
.knobs-compare[data-dragging] .knobs-cmp-grip{box-shadow:var(--_k-shadow-overlay),inset 0 0 0 1px var(--_k-border-strong),inset 0 1px 0 var(--_k-rim)}
.knobs-compare[data-dragging] .knobs-cmp-grip::before,.knobs-compare[data-dragging] .knobs-cmp-grip::after{background:var(--_k-fg)}
.knobs-cmp-handle:focus-visible .knobs-cmp-grip,.knobs-compare[data-keyboard] .knobs-cmp-handle:focus .knobs-cmp-grip{box-shadow:var(--_k-shadow-overlay),0 0 0 2px var(--_k-accent)}
/* The split's hairline, down the middle side by side. */
.knobs-cmp-split{position:absolute;left:0;top:0;width:1px;height:0;margin-left:-.5px;background:color-mix(in srgb,var(--_k-bg) 72%,transparent);pointer-events:none;will-change:transform,opacity}
/* Zoomed: how far, and a way back, in the stage's corner; it fades in and out, nothing shifts. */
.knobs-cmp-zoom{position:absolute;right:8px;bottom:8px;display:flex;align-items:center;gap:4px;height:26px;padding:0 3px 0 10px;border-radius:999px;
  color:var(--_k-fg);font-size:var(--_k-text-meta);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap;
  opacity:0;scale:.96;pointer-events:none;transition:opacity .16s cubic-bezier(.4,0,1,1),scale .16s cubic-bezier(.4,0,1,1)}
.knobs-cmp-zoom[data-on]{opacity:1;scale:1;pointer-events:auto;transition:opacity .2s cubic-bezier(.2,.8,.2,1),scale .2s cubic-bezier(.2,.8,.2,1)}
:where(.knobs-ui) .knobs-cmp-zoom-reset{all:revert;box-sizing:border-box;font:inherit;letter-spacing:inherit;margin:0;border:0;outline:none;box-shadow:none;
  display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:999px;background:transparent;color:var(--_k-fg-2);cursor:pointer;transition:color .15s,background .15s}
:where(.knobs-ui) .knobs-cmp-zoom-reset:is(:hover,:focus-visible){color:var(--_k-fg);background:color-mix(in srgb,var(--_k-fg) 12%,transparent)}
.knobs-cmp-note{position:absolute;left:50%;top:50%;translate:-50% -50%;color:var(--_k-fg-3);font-size:var(--_k-text-meta);pointer-events:none}
.knobs-cmp-note:empty{display:none}
.knobs-cmp-strip-host{flex:none;height:60px;min-height:0}
.knobs-cmp-timeline-host{flex:none;min-height:0}
/* The frame strip: Before over After per column, a difference bar under them, a dot where it peaks. */
.knobs-ui.knobs-cmp-strip{--_ku-cmp-diff:var(--k-compare-diff,var(--_k-ok));position:relative;width:100%;height:100%;min-height:40px;overflow:hidden;cursor:col-resize;touch-action:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg)}
.knobs-cmp-strip>canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
@media(prefers-reduced-motion:reduce){:is(.knobs-compare,.knobs-cmp-strip) :where(*,::before,::after){transition-duration:.12s!important}}
`
