import { springLinear, SPRINGS } from "../core/motion.js"

const open = springLinear(SPRINGS.snappy)

// The activity rail: rows placed by transform over one scroller, a single line drawn through the
// nodes (an SVG path the frame loop keeps clear of each node), and the selection's tint gliding
// under the rows. Tints come from --k-activity-* hooks over the theme's info, series and status
// colours, which follow the root's appearance.
export const activityCss = `
:where(.knobs-activity,.knobs-activity *){box-sizing:border-box}
.knobs-ui.knobs-activity{position:relative;display:block;height:100%;overflow:auto;overflow-anchor:none;outline:none;scrollbar-width:none;overscroll-behavior:contain;user-select:none;-webkit-user-select:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);text-align:left;letter-spacing:normal;-webkit-font-smoothing:antialiased;
  --ka-gutter:var(--k-activity-gutter,28px);--ka-row:var(--k-activity-row,var(--_k-row));--ka-row-child:var(--k-activity-row-child,calc(var(--ka-row) - 6px));
  --ka-line:var(--_k-activity-rail);--ka-select:var(--k-activity-select,var(--_ku-wash-hi));--ka-hover:var(--k-activity-hover,var(--_ku-wash));
  --ka-you:var(--k-activity-you,var(--_k-info));--ka-agent:var(--k-activity-agent,var(--_k-fg-2));--ka-proposal:var(--k-activity-proposal,var(--_k-fg));
  --ka-review:var(--k-activity-review,var(--_k-fg));--ka-pr:var(--k-activity-pr,var(--_k-series-5));--ka-build:var(--k-activity-build,var(--_k-fg-2));
  --ka-blocked:var(--k-activity-blocked,var(--_k-warn));--ka-shipped:var(--k-activity-shipped,var(--_k-ok));--ka-open-ease:${open.easing};--ka-open-ms:${open.ms}ms}
.knobs-activity [hidden]{display:none!important}
/* Clipped below: the content grows on a spring, so a new last row shows as the rail makes room. */
.knobs-activity-space{position:relative;width:100%;overflow-x:visible;overflow-y:clip;pointer-events:none}
.knobs-activity-line{position:absolute;top:0;left:calc(var(--_ku-row-x) + var(--ka-gutter) / 2 - 1px);width:2px;height:100%;overflow:visible;pointer-events:none;z-index:1}
.knobs-activity-line path{fill:none;stroke:var(--ka-line);stroke-width:1px}
/* The selection's tint: a wash that glides between rows, shown only once keys move it. It leaves
   in 100 ms when the pointer is used, and comes back at once. */
.knobs-activity-hl{position:absolute;left:var(--_ku-row-x);right:var(--_ku-row-x);top:0;height:0;border-radius:var(--_ku-row-radius);background:var(--ka-select);opacity:0;
  transition:opacity 100ms ease-out;pointer-events:none;will-change:transform}
.knobs-activity[data-keys] .knobs-activity-hl{opacity:1;transition:none}
.knobs-activity-row{position:absolute;left:var(--_ku-row-x);right:var(--_ku-row-x);top:0;display:flex;align-items:center;height:var(--ka-row);padding-right:calc(var(--_k-inset) - 4px);
  color:var(--_k-fg);white-space:nowrap;cursor:default;will-change:transform;transform-origin:calc(var(--ka-gutter) / 2) 50%;pointer-events:auto;--ka-tint:var(--ka-agent)}
.knobs-activity-row[data-leaving]{pointer-events:none}
.knobs-activity-row[data-depth="1"]{height:var(--ka-row-child)}
.knobs-activity-row>*{position:relative}
/* Hover: in at once, out over 100 ms; not while keys drive the selection. */
.knobs-activity-row::before{content:"";position:absolute;inset:0;border-radius:var(--_ku-row-radius);background:var(--ka-hover);opacity:0;transition:opacity calc(var(--_k-hover-out,100) * 1ms) ease-out;pointer-events:none}
.knobs-activity:not([data-keys]) .knobs-activity-row:not([data-leaving]):hover::before{opacity:1;transition-duration:calc(var(--_k-hover-in,0) * 1ms)}
.knobs-activity-row[data-kind="you"]{--ka-tint:var(--ka-you)}
.knobs-activity-row[data-kind="agent"]{--ka-tint:var(--ka-agent)}
.knobs-activity-row[data-kind="proposal"]{--ka-tint:var(--ka-proposal)}
.knobs-activity-row[data-kind="review"]{--ka-tint:var(--ka-review)}
.knobs-activity-row[data-kind="pr"]{--ka-tint:var(--ka-pr)}
.knobs-activity-row[data-kind="build"]{--ka-tint:var(--ka-build)}
.knobs-activity-row[data-kind="blocked"]{--ka-tint:var(--ka-blocked)}
.knobs-activity-row[data-kind="shipped"]{--ka-tint:var(--ka-shipped)}
/* The node: the kind's icon on the line (which stops clear of it), or a small dot inside a group. */
.knobs-activity-node{flex:none;display:flex;align-items:center;justify-content:center;width:var(--ka-gutter);height:100%;color:var(--ka-tint)}
.knobs-activity-node svg{display:block;width:14px;height:14px}
.knobs-activity-glyph{display:flex;align-items:center;justify-content:center;width:14px;height:14px;font-size:calc(var(--_k-font-size) - 1px);line-height:1}
.knobs-activity-node::before{content:"";position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:color-mix(in srgb,var(--ka-tint) 15%,transparent);
  opacity:0;scale:.8;transition:opacity .16s ease-out,scale var(--ka-open-ms) var(--ka-open-ease)}
.knobs-activity-row[aria-selected="true"] .knobs-activity-node::before{opacity:1;scale:1}
.knobs-activity-node::after{content:"";position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ka-tint) 55%,transparent);opacity:0;pointer-events:none}
.knobs-activity-row[data-current] .knobs-activity-node::after{opacity:1;animation:knobs-activity-breathe 2.6s ease-in-out infinite}
@keyframes knobs-activity-breathe{0%,100%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ka-tint) 55%,transparent),0 0 0 0 color-mix(in srgb,var(--ka-tint) 0%,transparent)}
  50%{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ka-tint) 70%,transparent),0 0 0 3px color-mix(in srgb,var(--ka-tint) 14%,transparent)}}
.knobs-activity-dot{display:block;width:5px;height:5px;border-radius:50%;background:currentColor}
.knobs-activity-row[data-depth="1"] .knobs-activity-node::before,.knobs-activity-row[data-depth="1"] .knobs-activity-node::after{width:13px;height:13px;margin:-6.5px 0 0 -6.5px}
/* The words: who in the text colour, then the title, one line that fades where it's cut off. */
.knobs-activity-main{flex:1;min-width:0;overflow:hidden;white-space:nowrap}
.knobs-activity-actor{margin-right:6px;font-weight:var(--_k-weight-label);color:var(--_k-fg)}
.knobs-activity-actor:empty{display:none}
.knobs-activity-title{color:var(--_k-fg-2)}
.knobs-activity-row[data-depth="1"] .knobs-activity-main{font-size:var(--_k-text-meta)}
.knobs-activity-row[data-depth="1"] .knobs-activity-actor{font-weight:var(--_k-weight);color:var(--_k-fg-2)}
.knobs-activity-row[data-depth="1"] .knobs-activity-title{color:var(--_k-fg-3)}
.knobs-activity-row[aria-selected="true"] .knobs-activity-title{color:var(--_k-fg)}
.knobs-activity-row[data-dimmed] :is(.knobs-activity-main,.knobs-activity-meta){opacity:.55}
.knobs-activity-row[data-dimmed] .knobs-activity-node{opacity:.6}
/* Trailing: thumbnails, a duration chip, the group's chevron and the time. */
.knobs-activity-meta{flex:none;display:flex;align-items:center;gap:6px;margin-left:8px;color:var(--_k-fg-3);font-size:var(--_k-text-meta);font-variant-numeric:tabular-nums}
.knobs-activity-meta:empty{display:none}
.knobs-activity-thumbs{display:flex;gap:3px}
.knobs-activity-thumbs img{display:block;width:18px;height:18px;border-radius:4px;object-fit:cover;background:var(--_k-fill);box-shadow:inset 0 0 0 .5px var(--_k-border)}
.knobs-activity-row[data-depth="1"] .knobs-activity-thumbs img{width:15px;height:15px}
:where(.knobs-ui) .knobs-activity-chip{all:revert;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px 0 5px;border:0;margin:0;border-radius:9px;
  background:var(--_k-fill);color:var(--_k-fg-2);font:inherit;font-variant-numeric:tabular-nums;letter-spacing:inherit;outline:none;transition:background calc(var(--_k-hover-out,100) * 1ms) ease-out}
.knobs-activity-chip svg{width:8px;height:8px}
button.knobs-activity-chip{cursor:pointer}
button.knobs-activity-chip:hover{background:var(--_k-fill-selected);color:var(--_k-fg);transition-duration:0s}
.knobs-activity-caret{display:flex;width:12px;height:12px;color:var(--_k-fg-3);transition:rotate .18s var(--_ku-ease)}
.knobs-activity-caret svg{width:10px;height:10px;margin:1px}
.knobs-activity-row[aria-expanded="true"] .knobs-activity-caret{rotate:90deg;transition:rotate var(--ka-open-ms) var(--ka-open-ease)}
.knobs-activity-time{min-width:2ch;text-align:right;white-space:nowrap}
.knobs-activity-time:empty{display:none}
.knobs-activity-empty{padding:10px var(--_k-inset);color:var(--_k-fg-3)}
@media(prefers-reduced-motion:reduce){.knobs-activity :where(*,::before,::after){transition:none!important;animation:none!important}}
`
