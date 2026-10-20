import { springCss } from "../core/spring.js"
import { SPRINGS } from "../core/motion.js"

const snappy = springCss(SPRINGS.snappy)

// The code diff, on the void: a quiet header (the path, its counts, ‹ n of m ›, wrap and
// Split | Unified) over the diff, drawn by @pierre/diffs in its own shadow root, with no card, no
// fill and no ring: a hairline under the header and one under the code, as a walkthrough's code
// block has. Its colours come through the renderer's --diffs-* variables, set here from the
// pieces' tokens, so dark, light, presets and restyle() carry into it; only changed lines are
// tinted. --kd-fill, set from what shows behind it, keeps the code's own fill opaque under its
// sticky line numbers (--k-diff-bg gives it a fill of its own).
//
// One inset, --kd-i (8px, the renderer's own gap): the code's separators and blocks sit it in
// from the top and the bottom. --kd-x is the inset across: none on its own or on a surface, so
// the header and the code line up with the column's content (a walkthrough's caption); in a
// split's pane or a diffReview, --kd-i. Inner corners are --kd-inner, the outer corner less the
// distance in (diff.ts measures it), so they're concentric with the surface it's on.
export const diffCss = `
@property --kd-ft{syntax:"<length>";inherits:false;initial-value:0px}
@property --kd-fb{syntax:"<length>";inherits:false;initial-value:0px}
:where(.knobs-ui){--kd-add:var(--_k-diff-add);--kd-del:var(--_k-diff-del);--kd-mod:var(--_k-diff-mod);--kd-move:var(--k-diff-move,var(--_k-info))}
:where(.knobs-diff,.knobs-diff *,.knobs-diff-files,.knobs-diff-files *){box-sizing:border-box}
.knobs-ui.knobs-diff{--kd-bg:var(--k-diff-bg,var(--_kd-bg,transparent));--kd-solid:var(--kd-fill,var(--kd-bg));--kd-line:calc(var(--_k-font-size) * 1.5);
  --kd-i:var(--k-diff-inset,8px);--kd-x:var(--kd-i);--kd-inner:max(3px,calc(var(--_ku-pane-radius) - var(--kd-i)));--kd-ctl:var(--kd-inner);
  --kd-head:calc(var(--_k-control-h) + 2 * var(--kd-i));--kd-fade:var(--k-diff-fade,20px);--kd-stick:0px;position:relative;display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;
  background:var(--kd-bg);border-radius:var(--_ku-pane-radius);font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);text-align:left;
  letter-spacing:normal;word-spacing:normal;text-transform:none;-webkit-font-smoothing:antialiased}
.knobs-ui.knobs-diff[data-height="auto"]{height:auto}
.knobs-ui.knobs-diff:not([data-on="pane"])::after{content:"";position:absolute;inset:0;z-index:3;box-shadow:inset 0 -1px 0 var(--_k-border-subtle);pointer-events:none}
.knobs-diff [hidden],.knobs-diff-files [hidden]{display:none!important}
.knobs-diff svg{display:block;flex:none}
.knobs-ui.knobs-diff:not([data-on="pane"]){--kd-x:0px;--kd-head:calc(var(--_k-control-h) + var(--kd-i));--kd-ctl:var(--_k-radius)}
/* A hairline under the header, firmer once the code has scrolled under it. */
.knobs-diff-head{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:8px;height:var(--kd-head);padding:0 var(--kd-x);
  box-shadow:inset 0 -1px var(--_k-border-subtle);transition:box-shadow .15s;user-select:none;-webkit-user-select:none}
.knobs-diff[data-scrolled]>.knobs-diff-head{box-shadow:inset 0 -1px var(--_k-border)}
.knobs-diff-path{flex:0 1 auto;min-width:0;overflow:hidden;white-space:nowrap}
.knobs-diff-dir,.knobs-diff-from{color:var(--_k-fg-3)}
.knobs-diff-base{color:var(--_k-fg);font-weight:var(--_k-weight-title)}
.knobs-diff-stat,.knobs-diff-counts{flex:none;display:inline-flex;gap:6px;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.knobs-diff-stat{font-size:var(--_k-text-meta);align-items:center}
/* +/− as five squares, GitHub's way. */
.knobs-diff-bar{display:inline-flex;gap:1px;margin-left:1px}
.knobs-diff-bar>i{width:6px;height:6px;border-radius:1.5px;background:color-mix(in srgb,var(--_k-fg) 14%,transparent)}
.knobs-diff-bar>i[data-kind="add"]{background:var(--kd-add)}
.knobs-diff-bar>i[data-kind="del"]{background:var(--kd-del)}
.knobs-diff-add{color:var(--kd-add)}
.knobs-diff-del{color:var(--kd-del)}
.knobs-diff-counts>:empty{display:none}
.knobs-diff-status{font:600 calc(var(--_k-font-size) - 2px)/1 var(--_k-mono);color:var(--_k-fg-3)}
.knobs-diff-status[data-change="change"]{color:var(--kd-mod)}
.knobs-diff-status[data-change="new"]{color:var(--kd-add)}
.knobs-diff-status[data-change="deleted"]{color:var(--kd-del)}
.knobs-diff-status[data-change="rename"]{color:var(--kd-move)}
.knobs-diff-fill{flex:1}
.knobs-diff-nav{flex:none;display:inline-flex;align-items:center;gap:1px;color:var(--_k-fg-3);font-size:var(--_k-text-meta);font-variant-numeric:tabular-nums}
.knobs-diff-nav>span{min-width:3.6em;text-align:center}
:where(.knobs-ui) :is(.knobs-diff-btn,.knobs-diff-choice,.knobs-diff-viewed,.knobs-diff-filter>input,.knobs-diff-filter>button){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;border-radius:0;
  margin:0;padding:0;min-width:0;box-shadow:none;outline:none}
.knobs-ui .knobs-diff-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--_k-control-h);height:var(--_k-control-h);border-radius:calc(var(--_k-radius) * 999);color:var(--_k-fg-3);cursor:pointer;
  transition:background .15s,color .15s,opacity .15s}
.knobs-ui .knobs-diff-btn:is(:hover,:focus-visible){background:var(--_ku-wash-hi);color:var(--_k-fg)}
.knobs-ui .knobs-diff-btn[aria-pressed="true"]{color:var(--_k-fg);background:var(--_ku-wash)}
.knobs-ui .knobs-diff-btn:disabled{opacity:.35;cursor:default;background:transparent}
.knobs-diff-btn svg{width:16px;height:16px}
/* Viewed: a check with its word, as on GitHub; the path dims once it's ticked. */
.knobs-ui .knobs-diff-viewed{flex:none;display:inline-flex;align-items:center;gap:5px;height:var(--_k-control-h);padding:0 8px 0 6px;border-radius:var(--kd-ctl);color:var(--_k-fg-2);
  font-size:var(--_k-text-meta);font-weight:var(--_k-weight-label);white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}
.knobs-ui .knobs-diff-viewed:is(:hover,:focus-visible){background:var(--_ku-wash-hi);color:var(--_k-fg)}
.knobs-ui .knobs-diff-viewed[aria-pressed="true"]{color:var(--_k-fg);background:var(--_ku-wash)}
.knobs-diff-viewed svg{width:16px;height:16px}
.knobs-diff-viewed[aria-pressed="true"] svg{color:var(--kd-add)}
/* Narrow, the header gives up words before anything is cut off at its end: Viewed keeps its
   check, then the counts' bar goes, then the counts; the path fades at its end throughout. */
.knobs-diff-head,.knobs-diff-part-head{container-type:inline-size}
@container (max-width:520px){
  .knobs-diff-viewed-label{display:none}
  .knobs-ui .knobs-diff-viewed{width:var(--_k-control-h);padding:0;justify-content:center}
  .knobs-diff-counts .knobs-diff-bar{display:none}
}
@container (max-width:400px){.knobs-diff-counts{display:none}.knobs-diff-nav>span{min-width:2.6em}}
.knobs-diff-path{transition:opacity .2s}
.knobs-diff[data-viewed]>.knobs-diff-head .knobs-diff-path,.knobs-diff-part[data-viewed] .knobs-diff-path{opacity:.6}
/* Split | Unified: the selection pill on the one picked, its bright copy the picked one's text; a
   choice isn't brighter for being picked. Choices are styled by class, as the copy holds them too. */
.knobs-diff-seg{position:relative;flex:none;display:grid;grid-template-columns:1fr 1fr;height:var(--_k-control-h);padding:2px;border-radius:var(--kd-ctl);background:var(--_k-fill)}
.knobs-ui .knobs-diff-choice{padding:0 9px;border-radius:max(0px,calc(var(--kd-ctl) - 2px));color:var(--_k-fg-2);font-size:var(--_k-text-meta);
  font-weight:var(--_k-weight-label);white-space:nowrap;cursor:pointer;transition:color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-diff-choice:is(:hover,:focus-visible){color:var(--_k-fg)}
/* The diff: one layer per file or layout on show, the old fading under the new. */
.knobs-diff-body{position:relative;flex:1;min-height:0}
.knobs-diff-probe{position:absolute;left:0;top:0;width:0;height:var(--kd-line);visibility:hidden;pointer-events:none}
.knobs-diff[data-height="auto"] .knobs-diff-body{flex:none;height:0;overflow:hidden}
/* Thin bars drawn over the code (overlayScrollbar down, diff-scroll.ts's across): the scrollers'
   own take no room. */
.knobs-diff-slot{position:absolute;inset:0}
/* The scroller fades its content out at an edge with more beyond it: at the top once scrolled
   (below a stuck file header, which stays whole), at the bottom while there's more below. The
   fades' lengths are registered properties, so they ease in and out on the snappy spring. */
.knobs-diff-scroll{--kd-ft:0px;--kd-fb:0px;position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:none;
  -webkit-mask-image:var(--kd-mask);mask-image:var(--kd-mask);transition:--kd-ft ${snappy.duration}ms ${snappy.easing},--kd-fb ${snappy.duration}ms ${snappy.easing};
  --kd-mask:linear-gradient(to bottom,#000 var(--kd-stick),transparent var(--kd-stick),#000 calc(var(--kd-stick) + var(--kd-ft)),#000 calc(100% - var(--kd-fb)),transparent 100%)}
.knobs-diff-scroll[data-fade-top]:not([data-handoff]){--kd-ft:var(--kd-fade)}
.knobs-diff-scroll[data-fade-bottom]{--kd-fb:var(--kd-fade)}
.knobs-diff-scroll::-webkit-scrollbar{display:none;width:0;height:0}
.knobs-diff-layer{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden}
.knobs-diff-hbar{position:absolute;height:5px;pointer-events:none}
.knobs-diff-hbar>i{position:absolute;left:0;top:0;height:5px;border-radius:3px;background:color-mix(in srgb,var(--_k-fg) 30%,transparent);opacity:0;pointer-events:none;
  transition:opacity .3s,background .15s}
.knobs-diff-body:hover .knobs-diff-hbar>i,.knobs-diff-hbar:is([data-active],[data-dragging])>i{opacity:1;pointer-events:auto;transition-duration:.12s,.15s}
.knobs-diff-hbar>i:hover,.knobs-diff-hbar[data-dragging]>i{background:color-mix(in srgb,var(--_k-fg) 48%,transparent)}
/* stack: every file down one scroller, each header sticking until the next pushes it off. It's
   flush (square, no card around its file), opaque in the code's own colour, with a hairline
   under it only while it's stuck; a gap, not a line, parts one file from the next. */
.knobs-diff[data-stack]{--kd-stick:var(--_k-row)}
.knobs-diff-part+.knobs-diff-part{margin-top:var(--kd-i)}
.knobs-diff-part-head{position:sticky;top:0;z-index:2;border-radius:0;display:flex;align-items:center;gap:8px;height:var(--_k-row);padding:0 var(--kd-x);background:var(--kd-solid);
  box-shadow:inset 0 0 transparent;transition:box-shadow .15s;user-select:none;-webkit-user-select:none}
.knobs-diff-part>.knobs-diff-part-head[data-stuck]{box-shadow:inset 0 -1px var(--_k-border)}
.knobs-diff-part-head .knobs-diff-counts{font-size:var(--_k-text-meta);align-items:center}
.knobs-diff-part-head .knobs-diff-status{flex:none;width:10px}
.knobs-diff-part-note{padding:var(--kd-i) var(--kd-x);color:var(--_k-fg-3)}
.knobs-diff[data-height="auto"] .knobs-diff-scroll{overscroll-behavior:auto}
.knobs-diff-slot[data-leaving]{pointer-events:none}
.knobs-diff-note{position:absolute;inset:0;display:grid;place-items:center;padding:12px;color:var(--_k-fg-3);text-align:center;pointer-events:none;transition:opacity .2s}
.knobs-diff[data-height="auto"] .knobs-diff-note{position:static;min-height:calc(var(--_k-row) * 2)}
.knobs-diff diffs-container{
  --diffs-bg:var(--kd-solid);
  --diffs-font-family:var(--_k-mono);
  --diffs-header-font-family:var(--_k-font);
  --diffs-font-size:calc(var(--_k-font-size) - .5px);
  --diffs-line-height:var(--kd-line);
  --diffs-gap-inline:var(--kd-x);
  --diffs-gap-block:var(--kd-i);
  --diffs-scrollbar-gutter-override:0px;
  --diffs-addition-color-override:var(--kd-add);
  --diffs-deletion-color-override:var(--kd-del);
  /* What changed lines mix into the background (a fifth in dark, an eighth in light): the
     colours a little thinned, so a changed line reads as a tint, not a stripe. */
  --diffs-bg-addition-override:color-mix(in srgb,var(--kd-add) 70%,var(--kd-solid));
  --diffs-bg-deletion-override:color-mix(in srgb,var(--kd-del) 70%,var(--kd-solid));
  --diffs-bg-addition-number-override:color-mix(in srgb,var(--kd-add) 55%,var(--kd-solid));
  --diffs-bg-deletion-number-override:color-mix(in srgb,var(--kd-del) 55%,var(--kd-solid));
  --diffs-bg-addition-emphasis-override:color-mix(in srgb,var(--kd-add) 22%,transparent);
  --diffs-bg-deletion-emphasis-override:color-mix(in srgb,var(--kd-del) 22%,transparent);
  /* Unchanged lines and the folds between hunks sit on the void; only a split's missing lines
     are faintly filled. */
  --diffs-bg-separator-override:var(--kd-solid);
  --diffs-bg-context-override:var(--kd-solid);
  --diffs-bg-buffer-override:color-mix(in srgb,var(--_k-fg) 2.5%,var(--kd-solid));
  --diffs-bg-selection-override:var(--_k-accent);
  --diffs-fg-number-override:var(--_k-fg-3);
}
/* diffReview, on the void as the diff is: the file list a drawer at its left (its width springs;
   the list inside is pinned to its right edge, so it slides out from under the diff), parted
   from the diff by a hairline; one hairline runs under both headers and one under it all. */
.knobs-ui.knobs-diff-review{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);text-align:left;letter-spacing:normal;-webkit-font-smoothing:antialiased}
.knobs-diff-review::after{content:"";position:absolute;inset:0;z-index:5;box-shadow:inset 0 -1px 0 var(--_k-border-subtle);pointer-events:none}
:where(.knobs-diff-review,.knobs-diff-review *){box-sizing:border-box}
.knobs-diff-drawer{position:relative;flex:none;width:0;height:100%;overflow:hidden;box-shadow:inset -1px 0 var(--_k-border-subtle)}
.knobs-diff-drawer[data-shut]{visibility:hidden}
.knobs-diff-drawer-in{position:absolute;top:0;bottom:0;right:0;display:flex;flex-direction:column}
.knobs-diff-drawer-head{flex:none;display:flex;align-items:center;gap:6px;height:calc(var(--_k-control-h) + 2 * var(--k-diff-inset,8px));padding:0 var(--k-diff-inset,8px) 0 calc(var(--_ku-row-x) + 8px);
  box-shadow:inset 0 -1px var(--_k-border-subtle);user-select:none;-webkit-user-select:none}
.knobs-diff-drawer-title{font-weight:var(--_k-weight-title)}
.knobs-diff-drawer-count{color:var(--_k-fg-3);font-size:var(--_k-text-meta);font-variant-numeric:tabular-nums}
.knobs-diff-drawer-in>.knobs-diff-files{flex:1;min-height:0;height:auto}
.knobs-diff-main{position:relative;flex:1;min-width:0;height:100%}
/* height: "auto": the card as tall as its diff; the drawer stretches to it. */
.knobs-ui.knobs-diff-review[data-height="auto"],.knobs-diff-review[data-height="auto"]>:is(.knobs-diff-drawer,.knobs-diff-main){height:auto}
.knobs-diff-review .knobs-ui.knobs-diff{--_kd-bg:transparent;--_ku-pane-ring:none;border-radius:0}
.knobs-ui .knobs-diff-toggle{margin-left:-4px}
.knobs-ui .knobs-diff-toggle[aria-pressed]:not(:hover,:focus-visible){background:transparent}
/* diffReview's file list: a filter over a compact tree, a status letter, the counts and their
   bar on each file; one highlight glides to the file on show. Viewed files dim, with a tick. */
.knobs-diff-files{--k-row:var(--k-diff-row,28px);display:flex;flex-direction:column;height:100%;min-height:0;padding-top:4px}
.knobs-diff-filter{position:relative;flex:none;display:flex;align-items:center;gap:6px;height:26px;margin:0 var(--_ku-row-x) 4px;padding:0 4px 0 8px;
  border-radius:max(6px,var(--_ku-row-radius));color:var(--_k-fg-3);box-shadow:inset 0 0 0 1px transparent;transition:box-shadow .15s}
/* The filter is a line of text, no box; focused, a hairline ring. */
.knobs-diff-filter:focus-within{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--_k-accent) 45%,transparent)}
.knobs-diff-filter svg{width:12px;height:12px;flex:none}
.knobs-ui .knobs-diff-filter>input{flex:1;min-width:0;height:100%;font:var(--_k-weight) var(--_k-font-size)/1 var(--_k-font);color:var(--_k-fg);caret-color:var(--_k-accent);background:transparent}
.knobs-ui .knobs-diff-filter>input::placeholder{color:var(--_k-fg-3)}
.knobs-ui .knobs-diff-filter>button{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;color:var(--_k-fg-3);cursor:pointer;transition:background .12s,color .12s,opacity .12s}
.knobs-ui .knobs-diff-filter>button:hover{background:var(--_ku-wash-hi);color:var(--_k-fg)}
.knobs-diff-filter>button svg{width:12px;height:12px}
.knobs-diff-list{position:relative;flex:1;min-height:0}
.knobs-diff-files .knobs-diff-counts{font-size:var(--_k-text-meta);align-items:center}
.knobs-diff-files .knobs-diff-counts{gap:5px}
.knobs-diff-files .knobs-diff-bar{margin-left:0}
.knobs-diff-files .knobs-diff-bar>i{width:4px;height:4px;border-radius:1px}
.knobs-diff-gone{text-decoration:line-through;text-decoration-color:color-mix(in srgb,currentColor 55%,transparent)}
.knobs-diff-files .knobs-tree-row :is(.knobs-tree-label,.knobs-tree-icon,.knobs-tree-detail){transition:opacity .2s}
.knobs-diff-files .knobs-tree-row[data-off~="viewed"] :is(.knobs-tree-label,.knobs-tree-icon,.knobs-tree-detail){opacity:.5}
.knobs-ui .knobs-diff-files .knobs-tree-toggle[aria-pressed="false"]{color:var(--kd-add)}
@media(prefers-reduced-motion:reduce){.knobs-diff :where(*,::before,::after),.knobs-diff-files :where(*,::before,::after){transition-duration:.15s!important}}
`
