import rollingCss from "../panel/rolling-css.js"
import {
  type Appearance,
  applyLook as markLook,
  injectPreset,
  injectTheme,
  type Look,
  type LookOptions,
  resolveLook,
  type ThemeMode,
} from "../core/appearance.js"
import { activityCss } from "./activity-css.js"
import { bentoCss } from "./bento-css.js"
import { compareCss } from "./compare-css.js"
import { playerCss } from "./player-css.js"
import { overlayCss } from "./overlay-css.js"
import { pickerCss } from "./picker-css.js"
import { readoutCss } from "./readout-css.js"
import { selectionPillCss } from "./selection-pill-css.js"
import { tracksCss } from "./tracks-css.js"
import { injectTokens } from "../core/root.js"
import { aliased } from "../core/glide.js"

/** @deprecated The old appearance option: use `appearance` (`auto` is `system`). */
export type UiTheme = ThemeMode
export type { Appearance }

/**
 * What every piece takes to match the panels beside it: a theme (`themes.void`, or your own from
 * `defineTheme`) and an appearance (dark | light | system | inherit, the default). The old
 * `theme: "dark" | "light" | "auto"` and `preset` still work.
 */
export type UiLook = LookOptions

// The pieces read what the knobs root resolves (--_k-*, the same tokens a panel reads, gliding
// as a panel's do), so a piece and a panel beside it match by construction. These are the
// pieces' own derivations: a host may set the --k-ui-* hooks anywhere.
const css = `
:where(.knobs-ui){
  --_ku-hit:var(--k-ui-hit,9px);
  --_ku-rail:var(--k-ui-rail,var(--_k-row));
  --_ku-indent:var(--k-ui-indent,14px);
  --_ku-select:var(--k-ui-select,var(--k-selection,color-mix(in srgb,var(--_k-accent) 13%,transparent)));
  --_ku-select-focus:var(--k-ui-select-focus,color-mix(in srgb,var(--_k-accent) 19%,transparent));
  --_ku-wash:var(--k-ui-wash,color-mix(in srgb,var(--_k-fill) 70%,transparent));
  --_ku-wash-hi:var(--k-ui-wash-hi,var(--_k-fill-selected));
  --_ku-ease:var(--_k-motion-snappy);--_ku-ease-ms:calc(var(--_k-motion-snappy-ms) * 1ms);
  /* Over a picture: a quiet dark scrim in either appearance (a picture is no lighter in light
     mode), light type on it, no ring. */
  --_ku-media-scrim:rgb(0 0 0/.5);--_ku-on-media:#fff;--_ku-on-media-2:color-mix(in srgb,var(--_ku-on-media) 64%,transparent);
  /* The card frame (knobs' own look): every leaf pane a rounded card on the page, half a gap
     inside its slot, so panes sit a gap apart with the dividers' grips between them; tree rows
     inset as soft rounded washes. --k-frame: flat (labPreset) puts panes edge to edge on
     hairlines, square, as a dense editor's columns. */
  --_ku-gap:var(--k-ui-gap,6px);
  --_ku-pane-m:calc(var(--_ku-gap) / 2);
  --_ku-pane-bg:var(--_k-pane-bg);
  --_ku-pane-radius:var(--_k-radius-panel);
  --_ku-pane-ring:inset 0 0 0 1px var(--_k-border),inset 0 1px 0 var(--_k-rim);
  --_ku-divider:var(--k-ui-divider,var(--k-split-gutter,transparent));
  --_ku-row-x:var(--k-ui-row-x,6px);
  --_ku-row-radius:max(0px,calc(var(--_ku-pane-radius) - var(--_ku-row-x)));
}
:where(.knobs-ui)[data-frame="flat"]{--_ku-gap:var(--k-ui-gap,0px);--_ku-pane-bg:var(--k-ui-pane,var(--k-pane-bg,transparent));--_ku-pane-radius:0px;--_ku-pane-ring:none;
  --_ku-divider:var(--_k-split-gutter);--_ku-row-x:var(--k-ui-row-x,0px);--_ku-row-radius:0px;
  --_ku-select:var(--_k-selection);--_ku-select-focus:var(--k-ui-select-focus,color-mix(in srgb,var(--_k-accent) 34%,transparent))}
/* One surface per thing: a piece on another surface draws no card of its own. Whatever draws a
   card (a walkthrough's step, a host's own) carries .knobs-surface, and a split's pane that's a
   card (not only a slot for another split) counts as one; any piece inside it, or one
   marked data-nested, loses its fill and ring and parts its own panes on hairlines as the flat
   frame does, so cards never stack two or three borders deep. Pieces draw their card from
   --_ku-pane-bg and --_ku-pane-ring so this reaches them. */
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-ui:not(.knobs-surface),.knobs-ui[data-nested]{--_ku-gap:var(--k-ui-gap,0px);--_ku-pane-bg:transparent;--_ku-pane-ring:none;
  --_ku-divider:var(--_k-split-gutter);--_kd-bg:transparent}
/* What draws its box without those: a picker's card keeps its fill as the highlight but drops its
   ring; a timeline's track drops its well for a hairline under the lane; an inline panel sheds its
   card (--k-chrome 0). A full-window step is the one raised exception (it is the surface). */
:is(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-picker-card,.knobs-ui[data-nested] .knobs-picker-card{box-shadow:none}
:is(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-tl-track,.knobs-ui[data-nested] .knobs-tl-track{background:transparent;border-radius:0;box-shadow:inset 0 -1px 0 var(--_k-border-subtle)}
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-panel.knobs-inline:not(.knobs-page){--k-chrome:0}
/* Only the pieces' own elements take their type and resets: what you put in a pane is yours. */
.knobs-ui{box-sizing:border-box}
:where(.knobs-split>*,.knobs-pane-clip,.knobs-pane-inner,.knobs-pane-body,.knobs-pane-head,.knobs-pane-head *,.knobs-pane-rail,.knobs-pane-rail *,.knobs-tree,.knobs-tree *,.knobs-tree-ghost){box-sizing:border-box}
:is(.knobs-tree,.knobs-pane-head,.knobs-pane-rail,.knobs-tree-ghost){font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);text-align:left;
  letter-spacing:normal;word-spacing:normal;text-transform:none;text-indent:0;text-shadow:none;font-style:normal;-webkit-font-smoothing:antialiased}
/* A host's element rules (button{padding}, header{margin}, mark{background}) stop at these, as
   they do at panels; (0,1,0), so the pieces' own rules after it win. */
:where(.knobs-ui) :is(.knobs-pane-head,.knobs-pane-btn,.knobs-pane-rail,.knobs-tree-toggle,.knobs-tree-edit,.knobs-tree-mark){all:revert;box-sizing:border-box;
  font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}
:is(.knobs-divider,.knobs-tree,.knobs-pane-btn,.knobs-pane-rail,.knobs-tree-toggle,.knobs-tree-edit):is(:focus,:focus-visible){outline:none}
:is(.knobs-tree,.knobs-split>.knobs-pane>.knobs-pane-clip>.knobs-pane-inner>.knobs-pane-head) [hidden]{display:none!important}
:is(.knobs-pane-head,.knobs-pane-rail,.knobs-tree) svg{display:block;flex:none}

/* Scroll fades: a scroller's content fades out over --knobs-fade at an edge with more beyond it,
   coming in over the first --knobs-fade-travel of scroll, so reaching an end never pops. They're
   scroll-driven (no script), so where those aren't supported there's no fade. --knobs-fade-inset
   starts the top one below a sticky header; .knobs-scroll-fade-x fades across instead (a single
   line that's cut off, like a tree's labels: no ellipsis). Pane bodies, trees and the palette's
   list carry the class; around a panel the GPU draws, the mask goes (it would trap the panel's
   overlays under it). */
@property --knobs-fade-a{syntax:"<number>";inherits:false;initial-value:1}
@property --knobs-fade-b{syntax:"<number>";inherits:false;initial-value:1}
@keyframes knobs-fade-a{from{--knobs-fade-a:1}to{--knobs-fade-a:0}}
@keyframes knobs-fade-b{from{--knobs-fade-b:0}to{--knobs-fade-b:1}}
@supports (animation-timeline:scroll()){
  :is(.knobs-scroll-fade,.knobs-scroll-fade-x){--knobs-fade:20px;--knobs-fade-travel:24px;animation:knobs-fade-a linear both,knobs-fade-b linear both;animation-duration:auto;
    animation-timeline:scroll(self block),scroll(self block);animation-range:0 var(--knobs-fade-travel),calc(100% - var(--knobs-fade-travel)) 100%}
  .knobs-scroll-fade{--knobs-fade-mask:linear-gradient(to bottom,#000 var(--knobs-fade-inset,0px),rgb(0 0 0/var(--knobs-fade-a)) var(--knobs-fade-inset,0px),#000 calc(var(--knobs-fade-inset,0px) + var(--knobs-fade)),#000 calc(100% - var(--knobs-fade)),rgb(0 0 0/var(--knobs-fade-b)));-webkit-mask-image:var(--knobs-fade-mask);mask-image:var(--knobs-fade-mask)}
  .knobs-scroll-fade-x{--knobs-fade:16px;--knobs-fade-travel:4px;animation-timeline:scroll(self inline),scroll(self inline);
    --knobs-fade-mask:linear-gradient(to right,rgb(0 0 0/var(--knobs-fade-a)),#000 var(--knobs-fade),#000 calc(100% - var(--knobs-fade)),rgb(0 0 0/var(--knobs-fade-b)));-webkit-mask-image:var(--knobs-fade-mask);mask-image:var(--knobs-fade-mask)}
  .knobs-scroll-fade:has(.knobs-panel[data-gpu-active="true"]){-webkit-mask-image:none;mask-image:none}
  .knobs-tree-row[data-editing] .knobs-tree-label{-webkit-mask-image:none;mask-image:none}
}
@supports not (animation-timeline:scroll()){.knobs-scroll-fade-x{text-overflow:ellipsis}}

/* Overlay scrollbars (trees, activity rails): a thin thumb over the content, so the rows never
   give up width to a scrollbar as they start or stop overflowing. It shows while the content
   scrolls or the pointer is over it. */
:is(.knobs-tree,.knobs-activity)::-webkit-scrollbar{display:none}
.knobs-scrollbar{position:sticky;top:0;z-index:3;height:0;pointer-events:none}
.knobs-scrollbar[hidden]{display:none}
.knobs-scrollbar-thumb{position:absolute;top:0;right:2px;width:5px;border-radius:3px;background:color-mix(in srgb,var(--_k-fg) 30%,transparent);opacity:0;
  transition:opacity .3s ease-out,background .15s}
:hover>.knobs-scrollbar>.knobs-scrollbar-thumb,.knobs-scrollbar:is([data-active],[data-dragging])>.knobs-scrollbar-thumb{opacity:1;pointer-events:auto;transition-duration:.12s,.15s}
.knobs-scrollbar-thumb:hover,.knobs-scrollbar[data-dragging]>.knobs-scrollbar-thumb{background:color-mix(in srgb,var(--_k-fg) 48%,transparent)}

/* Split: panes along a row or column, hairline dividers with a wider grip. */
.knobs-split{position:relative;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
.knobs-split[data-direction="column"]{flex-direction:column}
.knobs-pane{position:relative;flex:none;min-width:0;min-height:0;overflow:hidden}
.knobs-pane-clip{position:absolute;inset:0;margin:var(--_ku-pane-m);overflow:hidden;border-radius:var(--_ku-pane-radius);background:var(--_ku-pane-bg)}
.knobs-pane-clip::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:var(--_ku-pane-ring);pointer-events:none}
/* A pane holding another split is only its slot: the split's own panes are the cards. */
.knobs-pane[data-nested]>.knobs-pane-clip{margin:0;background:transparent}
.knobs-pane[data-nested]>.knobs-pane-clip::after{content:none}
.knobs-pane-inner{position:absolute;inset:0;display:flex;flex-direction:column;min-width:0;min-height:0}
.knobs-pane-body{position:relative;flex:1;min-width:0;min-height:0;overflow:hidden}
.knobs-pane[data-scroll] .knobs-pane-body{overflow:auto;scrollbar-width:thin}
.knobs-pane[data-rail][data-collapsed][data-settled]>.knobs-pane-clip>.knobs-pane-inner,.knobs-pane:not([data-rail])[data-collapsed][data-settled]>.knobs-pane-clip>.knobs-pane-inner>.knobs-pane-body{visibility:hidden}
.knobs-ui .knobs-pane-head{display:flex;align-items:center;gap:6px;flex:none;height:var(--_k-row);padding:0 calc(var(--_k-inset) - 4px) 0 var(--_k-inset);user-select:none;-webkit-user-select:none}
.knobs-pane-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--_k-weight-title);color:var(--_k-fg)}
.knobs-pane-count{flex:none;color:var(--_k-fg-3);font-variant-numeric:tabular-nums}
.knobs-pane-fill{flex:1}
.knobs-ui .knobs-pane-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:calc(var(--_k-radius) * 999);color:var(--_k-fg-3);cursor:pointer;
  transition:background var(--hover-t,.15s),color .15s}
.knobs-ui .knobs-pane-btn:is(:hover,:focus-visible){background:var(--_ku-wash-hi);color:var(--_k-fg)}
.knobs-ui .knobs-pane-btn[aria-pressed="true"]{color:var(--_k-accent)}
.knobs-pane-btn svg{width:13px;height:13px}
.knobs-pane-head[data-toggles]{cursor:pointer}
/* A collapsed pane's rail: its title along the edge; a click opens it. It holds on to the edge the
   pane folds toward, as wide as the rail, over the card (which folds to its size): only its label
   and chevron draw, and a nested split's slot, which has no card, gives it one of its own. */
.knobs-ui .knobs-pane-rail{position:absolute;margin:var(--_ku-pane-m);border-radius:var(--_ku-pane-radius);background-color:transparent;display:flex;align-items:center;gap:8px;color:var(--_k-fg-2);cursor:pointer;opacity:0;pointer-events:none;
  font-weight:var(--_k-weight-title);transition:background .15s,color .15s}
.knobs-ui .knobs-pane[data-nested]>.knobs-pane-rail{background-color:var(--_ku-pane-bg);box-shadow:var(--_ku-pane-ring)}
.knobs-split[data-direction="row"]>.knobs-pane>.knobs-pane-rail{top:0;bottom:0;width:var(--_ku-rail);writing-mode:vertical-rl;padding:10px 0}
.knobs-split[data-direction="row"]>.knobs-pane[data-edge="start"]>.knobs-pane-rail{right:0}
.knobs-split[data-direction="row"]>.knobs-pane[data-edge="end"]>.knobs-pane-rail{left:0}
.knobs-split[data-direction="column"]>.knobs-pane>.knobs-pane-rail{left:0;right:0;height:var(--_ku-rail);padding:0 var(--_k-inset)}
.knobs-split[data-direction="column"]>.knobs-pane[data-edge="start"]>.knobs-pane-rail{bottom:0}
.knobs-split[data-direction="column"]>.knobs-pane[data-edge="end"]>.knobs-pane-rail{top:0}
.knobs-pane[data-collapsed]>.knobs-pane-rail{pointer-events:auto}
/* Its hover wash fades, rather than going in one frame as a click opens the pane. */
.knobs-ui .knobs-pane-rail::before{content:"";position:absolute;inset:0;border-radius:inherit;background:var(--_ku-wash);opacity:0;transition:opacity .15s;pointer-events:none}
.knobs-pane-rail>*{position:relative}
.knobs-ui .knobs-pane[data-collapsed]>.knobs-pane-rail:is(:hover,:focus-visible){color:var(--_k-fg)}
.knobs-ui .knobs-pane[data-collapsed]>.knobs-pane-rail:is(:hover,:focus-visible)::before{opacity:1}
.knobs-pane-rail-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.knobs-pane-chevron{display:flex;flex:none;width:11px;height:11px;writing-mode:horizontal-tb;color:var(--_k-fg-3)}
.knobs-pane-turn{display:flex;width:100%;height:100%;transform-origin:50% 50%}
.knobs-pane-rail svg{width:11px;height:11px}
/* The rail's chevron stands in for the header's collapse icon (it turns into the rail's), so the
   icon itself isn't drawn; hovering its button lights the chevron instead. */
.knobs-pane[data-morph]>.knobs-pane-clip>.knobs-pane-inner>.knobs-pane-head>.knobs-pane-collapse>svg{visibility:hidden}
/* So does the rail's label for the title, when it travels (split's fold: { title: "travel" }). */
.knobs-pane[data-travel]>.knobs-pane-clip>.knobs-pane-inner>.knobs-pane-head>.knobs-pane-title{visibility:hidden}
.knobs-pane[data-morph]:not([data-collapsed]):has(>.knobs-pane-clip>.knobs-pane-inner>.knobs-pane-head>.knobs-pane-collapse:is(:hover,:focus-visible))>.knobs-pane-rail .knobs-pane-chevron{color:var(--_k-fg)}
.knobs-pane[data-morph]:not([data-collapsed])>.knobs-pane-rail .knobs-pane-chevron{transition:color .15s}

.knobs-divider{position:relative;z-index:2;flex:none;width:1px;background:var(--_ku-divider);touch-action:none;outline:none}
.knobs-split[data-direction="column"]>.knobs-divider{width:auto;height:1px}
.knobs-divider::before{content:"";position:absolute;top:0;bottom:0;left:calc(50% - var(--_ku-hit) / 2);width:var(--_ku-hit);cursor:col-resize}
.knobs-split[data-direction="column"]>.knobs-divider::before{left:0;right:0;top:calc(50% - var(--_ku-hit) / 2);bottom:auto;width:auto;height:var(--_ku-hit);cursor:row-resize}
/* Hover, focus and drags draw the hairline in the accent, with a soft wash beside it. */
.knobs-divider::after{content:"";position:absolute;inset:0 -1px;background:var(--_k-accent);opacity:0;pointer-events:none;
  box-shadow:0 0 0 2px color-mix(in srgb,var(--_k-accent) 18%,transparent);transition:opacity .16s}
.knobs-split[data-direction="column"]>.knobs-divider::after{inset:-1px 0}
.knobs-divider:hover::after{opacity:.7;transition-delay:.12s}
.knobs-divider:focus-visible::after,.knobs-divider[data-active]::after{opacity:1;transition-delay:0s}
/* Between cards, the hairline gives way to a grip: a small capsule in the gap that shows on
   hover, and lengthens and takes the accent while dragged or focused. */
.knobs-split:not([data-frame="flat"])>.knobs-divider::after{inset:auto;left:50%;top:50%;width:4px;height:28px;margin:-14px 0 0 -2px;border-radius:2px;background:var(--_k-border-strong);box-shadow:none;
  transition:opacity .16s,background .16s,scale var(--_ku-ease-ms) var(--_ku-ease)}
.knobs-split[data-direction="column"]:not([data-frame="flat"])>.knobs-divider::after{inset:auto;left:50%;top:50%;width:28px;height:4px;margin:-2px 0 0 -14px}
.knobs-split:not([data-frame="flat"])>.knobs-divider:hover::after{opacity:1}
.knobs-split:not([data-frame="flat"])>.knobs-divider:is(:focus-visible,[data-active])::after{background:var(--_k-accent);opacity:.9;scale:1 1.45}
.knobs-split[data-direction="column"]:not([data-frame="flat"])>.knobs-divider:is(:focus-visible,[data-active])::after{scale:1.45 1}
:root[data-knobs-resizing],:root[data-knobs-resizing] *{user-select:none!important;-webkit-user-select:none!important}
:root[data-knobs-resizing="row"] *{cursor:col-resize!important}
:root[data-knobs-resizing="column"] *{cursor:row-resize!important}
:root[data-knobs-resizing] :is(iframe,canvas:not(.knobs-gpu-canvas)){pointer-events:none}

/* Tree: one scroller, rows placed by transform, only those near the view in the DOM. */
.knobs-tree{position:relative;overflow:auto;height:100%;outline:none;scrollbar-width:none;overscroll-behavior:contain;user-select:none;-webkit-user-select:none}
.knobs-tree-space{position:relative;width:100%;pointer-events:none}
.knobs-tree-row{position:absolute;left:var(--_ku-row-x);right:var(--_ku-row-x);top:0;display:flex;align-items:center;height:var(--_k-row);padding-right:calc(var(--_k-inset) - 4px);
  color:var(--_k-fg);white-space:nowrap;cursor:default;will-change:transform;contain:layout style}
.knobs-tree-row::before{content:"";position:absolute;inset:0;border-radius:var(--_ku-row-radius);background:var(--_ku-wash);opacity:0;transition:opacity calc(var(--_k-hover-out) * 1ms),background .12s;pointer-events:none}
.knobs-tree:not([data-keyboard]):not([data-dragging]) .knobs-tree-row:hover::before{opacity:1;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-tree-row[aria-selected="true"]::before{opacity:1;background:var(--_ku-select)}
.knobs-tree:focus-visible .knobs-tree-row[data-active]::before,.knobs-tree[data-keyboard]:focus .knobs-tree-row[data-active]::before{opacity:1;background:var(--_ku-wash-hi)}
.knobs-tree:focus .knobs-tree-row[data-active][aria-selected="true"]::before{background:var(--_ku-select-focus)}
.knobs-tree-row[data-drop="into"]::before{opacity:1;background:color-mix(in srgb,var(--_k-accent) 30%,transparent)}
.knobs-tree-row[data-dragged]{opacity:.38}
/* glide: the selection pill on the selected row, in the selection's colour (the row's own stays off). */
.knobs-tree>.knobs-pick-pill{background:var(--_ku-select)}
.knobs-tree:focus>.knobs-pick-pill{background:var(--_ku-select-focus)}
.knobs-tree[data-glide] .knobs-tree-row[aria-selected="true"]::before{opacity:0!important}
.knobs-tree-row>*{position:relative}
.knobs-tree-caret{flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:100%;color:var(--_k-fg-3);transition:transform var(--_ku-ease-ms) var(--_ku-ease)}
.knobs-tree-caret svg{width:9px;height:9px}
.knobs-tree-row[aria-expanded="true"]>.knobs-tree-caret{transform:rotate(90deg)}
.knobs-tree-row:not([aria-expanded])>.knobs-tree-caret{visibility:hidden}
.knobs-tree-icon{flex:none;display:flex;align-items:center;justify-content:center;width:14px;margin-right:6px;color:var(--_k-fg-3);font-size:calc(var(--_k-font-size) - 1px)}
/* The label wins the room: it keeps its width while the detail (which only takes what's left)
   fades out at its end, and gives way only once the detail is gone. Each fades where it's cut. */
.knobs-tree-label{position:relative;flex:0 1 auto;min-width:0;overflow:hidden;font-weight:var(--_k-weight)}
.knobs-tree-row[data-editing]>.knobs-tree-label{flex-grow:1}
.knobs-tree-row[data-ancestor] .knobs-tree-label{color:var(--_k-fg-2)}
.knobs-tree-label .knobs-tree-mark{color:var(--_k-accent)}
.knobs-tree-row[data-off~="visible"] :is(.knobs-tree-label,.knobs-tree-icon){opacity:.45}
.knobs-tree-row[data-off~="locked"] .knobs-tree-label{color:var(--_k-fg-2)}
.knobs-tree-detail{flex:1 1 0;min-width:0;overflow:hidden;padding-left:6px;text-align:right;color:var(--_k-fg-3);font-variant-numeric:tabular-nums}
.knobs-tree-row[data-editing]>.knobs-tree-detail{flex-grow:0;visibility:hidden}
.knobs-tree-tools{flex:none;display:flex;align-items:center;gap:1px;margin-left:auto;padding-left:4px}
.knobs-ui .knobs-tree-toggle{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:calc(var(--_k-radius) * 999);color:var(--_k-fg-3);cursor:pointer;opacity:0;transition:opacity .12s,color .12s,background .12s}
.knobs-ui .knobs-tree-toggle svg{width:12px;height:12px}
.knobs-tree-row:is(:hover,[data-active],[aria-selected="true"]) .knobs-tree-toggle,.knobs-ui .knobs-tree-toggle[aria-pressed="false"]{opacity:1}
.knobs-ui .knobs-tree-toggle:hover{background:var(--_ku-wash-hi);color:var(--_k-fg)}
.knobs-ui .knobs-tree-toggle[aria-pressed="false"]{color:var(--_k-fg-2)}
/* Renaming in place, as a number is edited in a panel: no box, just the text and an underline. */
.knobs-ui .knobs-tree-edit{position:absolute;inset:auto 0 auto 0;top:50%;transform:translateY(-50%);width:100%;height:calc(var(--_k-font-size) * 1.5);padding:0;
  background:transparent;color:var(--_k-fg);caret-color:var(--_k-accent);font:inherit;font-weight:var(--_k-weight);border-bottom:1px solid var(--_k-fg)}
.knobs-tree-edit::selection{background:color-mix(in srgb,var(--_k-accent) 40%,transparent)}
.knobs-tree-row[data-editing] .knobs-tree-text{visibility:hidden}
.knobs-tree-line{position:absolute;left:0;right:6px;top:0;height:2px;margin-top:-1px;border-radius:1px;background:var(--_k-accent);pointer-events:none;opacity:0;transition:opacity .1s}
.knobs-tree-line::before{content:"";position:absolute;left:-3px;top:-2px;width:6px;height:6px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--_k-accent)}
.knobs-tree[data-dragging] .knobs-tree-line[data-shown]{opacity:1}
.knobs-tree-ghost{position:fixed;left:0;top:0;z-index:2147480004;padding:2px 8px;background:var(--_k-bg);color:var(--_k-fg);border-radius:var(--_k-radius);
  box-shadow:0 0 0 1px var(--_k-border-strong),0 6px 18px rgba(0,0,0,calc(.35 * var(--_k-shadow-k,1)));pointer-events:none;white-space:nowrap;font:var(--_k-weight) var(--_k-font-size)/1.6 var(--_k-font)}
.knobs-tree-empty{padding:10px var(--_k-inset);color:var(--_k-fg-3)}

/* Timeline: play beside a track: the ruler's canvas over a lane of markers, ranges as soft bands,
   and the playhead, a hairline in the accent with a cap. No clock: the time shows under the
   pointer on the track (the tag), in seconds, while hovering or scrubbing. */
:where(.knobs-timeline,.knobs-timeline *){box-sizing:border-box}
.knobs-ui.knobs-timeline{display:flex;align-items:stretch;gap:10px;width:100%;height:100%;min-height:52px;padding:6px var(--_k-inset) 8px 8px;outline:none;user-select:none;-webkit-user-select:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left}
:where(.knobs-ui) :is(.knobs-tl-play,.knobs-tl-edit){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;background:transparent;border:0;margin:0;padding:0;outline:none;box-shadow:none}
.knobs-tl-transport{flex:none;display:flex;align-items:center}
.knobs-ui .knobs-tl-play{flex:none;display:inline-flex;align-items:center;justify-content:center;width:var(--_k-control-h);height:var(--_k-control-h);min-width:22px;min-height:22px;border-radius:calc(var(--_k-radius) * 999);
  background:var(--_k-fill-selected);color:var(--_k-fg);cursor:pointer;transition:background .15s,transform .15s var(--_ku-ease)}
.knobs-ui .knobs-tl-play:hover{background:color-mix(in srgb,var(--_k-fg) 16%,transparent)}
.knobs-ui .knobs-tl-play:active{transform:scale(.94)}
.knobs-tl-play svg{width:12px;height:12px}
.knobs-timeline[data-playing] .knobs-tl-play{background:var(--_k-accent);color:var(--_k-bg)}
.knobs-tl-track{position:relative;flex:1;min-width:0;overflow:hidden;border-radius:var(--_k-radius);background:var(--_k-fill);cursor:col-resize;touch-action:none;
  transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-timeline:focus-visible .knobs-tl-track,.knobs-timeline[data-keyboard]:focus .knobs-tl-track{background:color-mix(in srgb,var(--_k-fill-selected) 80%,transparent)}
.knobs-tl-ruler{position:absolute;left:0;top:0;height:22px;pointer-events:none}
.knobs-tl-lane{position:absolute;left:0;right:0;top:22px;bottom:0;pointer-events:none}
/* Ranges: a soft band through the lane, its edges handles; the loop range in the accent. */
.knobs-tl-range{position:absolute;left:0;top:0;bottom:0;width:0;background:color-mix(in srgb,var(--_k-fg) 6%,transparent);will-change:transform}
.knobs-tl-range[data-loop]{background:color-mix(in srgb,var(--_k-accent) 11%,transparent)}
.knobs-tl-range[data-selected]{background:color-mix(in srgb,var(--_k-accent) 18%,transparent)}
.knobs-tl-edge{position:absolute;top:0;bottom:0;width:9px;cursor:ew-resize}
.knobs-tl-edge[data-edge="start"]{left:-4px}
.knobs-tl-edge[data-edge="end"]{right:-5px}
.knobs-tl-edge::after{content:"";position:absolute;top:0;bottom:0;left:4px;width:1px;background:color-mix(in srgb,var(--_k-accent) 55%,transparent);transition:background .15s,box-shadow .15s}
.knobs-tl-edge:hover::after,.knobs-tl-range[data-selected] .knobs-tl-edge::after{background:var(--_k-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--_k-accent) 22%,transparent)}
.knobs-tl-rlabel{position:absolute;left:5px;bottom:3px;padding:0 5px;border-radius:max(0px,calc(var(--_k-radius) - 3px));font-size:var(--_k-text-meta);line-height:16px;color:var(--_k-fg-2);cursor:grab;white-space:nowrap}
.knobs-tl-rlabel:empty{display:none}
.knobs-tl-rlabel:hover{background:var(--_ku-wash-hi);color:var(--_k-fg)}
/* Markers: a diamond on the ruler's edge and a label chip below it. */
.knobs-tl-marker{position:absolute;left:0;top:-22px;bottom:0;width:0;will-change:transform;pointer-events:none;--knobs-tl-c:var(--knobs-tl-color,var(--_k-fg-2))}
.knobs-tl-marker::before{content:"";position:absolute;top:22px;bottom:0;left:-.5px;width:1px;background:color-mix(in srgb,var(--knobs-tl-c) 40%,transparent)}
.knobs-tl-pin{position:absolute;top:13px;left:-5px;width:10px;height:10px;pointer-events:auto;cursor:grab}
.knobs-tl-pin::after{content:"";position:absolute;inset:1.5px;border-radius:min(2px,var(--_k-radius));background:var(--knobs-tl-c);rotate:45deg;transition:background .15s,scale .2s var(--_ku-ease)}
.knobs-tl-mlabel{position:absolute;top:26px;left:3px;max-width:140px;padding:0 6px;border-radius:max(0px,calc(var(--_k-radius) - 3px));background:var(--_k-fill-selected);color:var(--_k-fg);
  font-size:var(--_k-text-meta);line-height:17px;white-space:nowrap;pointer-events:auto;cursor:grab;transition:background .15s,color .15s}
.knobs-tl-mtext{display:block;overflow:hidden;white-space:nowrap}
.knobs-tl-marker[data-selected]{--knobs-tl-c:var(--_k-accent)}
.knobs-tl-marker[data-selected] .knobs-tl-mlabel{background:color-mix(in srgb,var(--_k-accent) 24%,var(--_k-fill-selected))}
.knobs-tl-marker[data-selected] .knobs-tl-pin::after{scale:1.2}
.knobs-timeline[data-dragging] .knobs-tl-marker[data-selected] :is(.knobs-tl-pin,.knobs-tl-mlabel){cursor:grabbing}
.knobs-tl-marker[data-editing] .knobs-tl-mlabel{visibility:hidden}
.knobs-ui .knobs-tl-edit{position:absolute;top:26px;left:3px;width:120px;height:17px;padding:0 6px;font-size:var(--_k-text-meta);color:var(--_k-fg);caret-color:var(--_k-accent);
  background:var(--_k-bg);border-radius:max(0px,calc(var(--_k-radius) - 3px));box-shadow:inset 0 -1px 0 var(--_k-fg);pointer-events:auto}
/* The playhead: an accent hairline with a rounded cap in the ruler; it glows a little while held
   on a marker. */
.knobs-tl-head{position:absolute;left:0;top:0;bottom:0;width:0;will-change:transform;pointer-events:none}
.knobs-tl-head::before{content:"";position:absolute;top:4px;bottom:0;left:-.75px;width:1.5px;background:var(--_k-accent)}
.knobs-tl-head::after{content:"";position:absolute;top:3px;left:-4.5px;width:9px;height:13px;border-radius:min(4.5px,var(--_k-radius)) min(4.5px,var(--_k-radius)) min(4.5px,var(--_k-radius)) min(4.5px,var(--_k-radius));
  background:var(--_k-accent);box-shadow:0 1px 3px rgba(0,0,0,calc(.3 * var(--k-lift,1)));transition:box-shadow .15s,scale .18s var(--_ku-ease)}
.knobs-timeline[data-scrubbing] .knobs-tl-head::after{scale:1.12}
.knobs-timeline[data-stuck] .knobs-tl-head::after{box-shadow:0 0 0 3px color-mix(in srgb,var(--_k-accent) 26%,transparent)}
.knobs-tl-hover{position:absolute;left:0;top:0;bottom:0;width:1px;margin-left:-.5px;background:var(--_k-border-strong);transform:translateX(-100px);pointer-events:none;opacity:0;transition:opacity .15s}
.knobs-tl-track:hover .knobs-tl-hover{opacity:1}
.knobs-timeline[data-scrubbing] .knobs-tl-hover{opacity:0}
.knobs-tl-tag{position:absolute;left:0;bottom:2px;font-size:var(--_k-text-meta);line-height:16px;color:var(--_k-fg);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap;pointer-events:none;opacity:0}
.knobs-tl-tag[data-on]{opacity:1}
/* The lane (variant: "lane"): one slim track of ticks under a compare or a video; markers are
   faint chapter ticks, the current one in text colour; nothing to edit. */
.knobs-ui.knobs-timeline[data-variant="lane"]{height:auto;min-height:0;padding:0;gap:var(--_k-gap)}
.knobs-timeline[data-variant="lane"] .knobs-tl-track{height:var(--_k-control-h)}
.knobs-timeline[data-variant="lane"] .knobs-tl-ruler{height:100%}
.knobs-timeline[data-variant="lane"] .knobs-tl-lane{top:0}
.knobs-timeline[data-variant="lane"] .knobs-tl-marker{top:0}
.knobs-timeline[data-variant="lane"] .knobs-tl-marker::before{top:0;bottom:50%;left:-.75px;width:1.5px;background:var(--_k-fg-3)}
.knobs-timeline[data-variant="lane"] .knobs-tl-marker[data-current]::before{background:var(--_k-fg)}
.knobs-timeline[data-variant="lane"] :is(.knobs-tl-pin,.knobs-tl-mlabel,.knobs-tl-rlabel){display:none}
.knobs-timeline[data-variant="lane"] .knobs-tl-head::before{top:0}
.knobs-timeline[data-variant="lane"] .knobs-tl-head::after{content:none}
.knobs-timeline[data-variant="lane"] .knobs-tl-tag{top:2px;bottom:auto}
/* The line (variant: "line"): a player's progress under its media. One 2px line, fg-3 with fg
   filling it, a segment per chapter; it thickens under the pointer and while scrubbing. The
   chapter and time under the pointer float over it; nothing else shows. */
.knobs-ui.knobs-timeline[data-variant="line"]{height:auto;min-height:0;padding:0;gap:0}
.knobs-timeline[data-variant="line"] .knobs-tl-transport{display:none}
.knobs-ui.knobs-timeline[data-variant="line"] .knobs-tl-track{height:16px;overflow:visible;border-radius:var(--_k-radius);background:transparent;box-shadow:none;cursor:pointer}
.knobs-timeline[data-variant="line"] :is(.knobs-tl-ruler,.knobs-tl-lane,.knobs-tl-hover,.knobs-tl-head,.knobs-tl-rlabel){display:none}
.knobs-tl-segs{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;pointer-events:none;transition:scale calc(var(--_k-hover-out) * 1ms) var(--_ku-ease)}
.knobs-tl-seg{position:absolute;left:0;top:0;height:100%;overflow:hidden;border-radius:1px;background:var(--_k-fg-3);will-change:transform}
.knobs-tl-seg-fill{position:absolute;inset:0;background:var(--_k-fg);transform-origin:0 0;will-change:transform}
.knobs-timeline[data-variant="line"] .knobs-tl-track:hover .knobs-tl-segs,.knobs-timeline[data-variant="line"][data-scrubbing] .knobs-tl-segs{scale:1 2}
.knobs-timeline[data-variant="line"] .knobs-tl-range{top:3px;bottom:3px;border-radius:3px}
.knobs-timeline[data-variant="line"]:focus-visible .knobs-tl-track,.knobs-timeline[data-variant="line"][data-keyboard]:focus .knobs-tl-track{background:transparent;box-shadow:0 0 0 2px color-mix(in srgb,var(--_k-accent) 60%,transparent)}
.knobs-timeline[data-variant="line"] .knobs-tl-tag{top:auto;bottom:calc(100% + 2px);display:flex;gap:6px;padding:0 6px;border-radius:calc(var(--_k-radius) * 999);background:var(--_ku-media-scrim);color:var(--_ku-on-media);
  font-size:var(--_k-type-small);line-height:var(--_k-leading-small);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
.knobs-tl-tag-label{color:var(--_k-fg-2)}
.knobs-timeline[data-variant="line"] .knobs-tl-tag-label{color:var(--_ku-on-media-2)}
.knobs-tl-tag-label:empty{display:none}
@media(prefers-reduced-motion:reduce){.knobs-timeline :where(*,::before,::after){transition:none!important}}
@media(prefers-reduced-motion:reduce){:is(.knobs-tree,.knobs-split>.knobs-divider,.knobs-pane-head,.knobs-pane-rail) :where(*,::before,::after){transition:none!important}}
`

/** The pieces' stylesheet, as `injectUiStyles` writes it (after the token sheet). */
export const uiCss = () =>
  aliased(
    css +
      readoutCss +
      overlayCss +
      bentoCss +
      activityCss +
      pickerCss +
      compareCss +
      playerCss +
      selectionPillCss +
      tracksCss,
  ) + rollingCss

/** Adds the pieces' stylesheet once per document. */
export function injectUiStyles(doc: Document) {
  injectTokens(doc)
  if (doc.querySelector("style[data-knobs-ui]")) return
  const style = doc.createElement("style")
  style.dataset.knobsUi = ""
  style.textContent = uiCss()
  doc.head.append(style)
}

/** Styles, theme, appearance and preset for a piece's root. */
export function applyLook(root: HTMLElement, look: UiLook) {
  injectUiStyles(root.ownerDocument)
  root.classList.add("knobs-root", "knobs-ui")
  markLook(root, resolveLook(look))
  syncFrame(root)
}

/**
 * `--k-frame: flat` (a preset's, or a host's on any ancestor) marks the piece `data-frame`. Read
 * again once the piece is in the page.
 */
export function syncFrame(root: HTMLElement) {
  if (!root.isConnected) return
  const view = root.ownerDocument.defaultView
  const flat = view?.getComputedStyle(root).getPropertyValue("--k-frame").trim() === "flat"
  if (flat) root.dataset.frame = "flat"
  else delete root.dataset.frame
}

const RESTYLED = ".knobs-ui,.knobs-panel,.knobs-chip,.knobs-notice"

/** A look for `restyle`: what the pieces take, and a panel's density. */
export interface RestyleLook extends UiLook {
  readonly density?: "compact" | "default" | "comfortable"
}

/**
 * Changes the look of what's already on screen: every knobs/ui piece and panel inside `target`
 * (the whole document by default) takes `look`'s theme and preset (knobs' own where it gives
 * none) and, where it gives them, its appearance and a panel's density. Tokens glide to the new
 * values; splits and trees measure again. On a document, overlays opened afterwards take it too
 * (`overlayLook`).
 */
export function restyle(target: Document | Element, look: RestyleLook) {
  const doc = target instanceof Element ? target.ownerDocument : target
  injectUiStyles(doc)
  const t = look.theme
  const theme = typeof t === "object" ? t : undefined
  const mode = typeof t === "string" ? t : undefined
  if (theme) injectTheme(doc, theme)
  if (look.preset) injectPreset(doc, look.preset)
  const roots = [
    ...(target instanceof Element && target.matches(RESTYLED) ? [target] : []),
    ...target.querySelectorAll<HTMLElement>(RESTYLED),
  ] as HTMLElement[]
  for (const el of roots) {
    const current = el.getAttribute("data-appearance") as Appearance | null
    const next: Look = resolveLook(
      {
        ...(theme ? { theme } : {}),
        ...(mode ? { theme: mode } : {}),
        appearance: look.appearance,
        preset: look.preset,
      },
      { appearance: current ?? "inherit" },
    )
    markLook(el, next)
    if (el.classList.contains("knobs-panel") && look.density)
      el.setAttribute("data-density", look.density)
  }
  for (const el of roots) {
    if (!el.classList.contains("knobs-ui")) continue
    syncFrame(el)
    el.dispatchEvent(new Event("knobs-restyle"))
  }
  if (!(target instanceof Element)) {
    const appearance =
      look.appearance ?? (mode ? resolveLook({ theme: mode }).appearance : undefined)
    lookDefaults.current = {
      ...(theme ? { theme } : {}),
      ...(look.preset ? { preset: look.preset } : {}),
      ...(appearance ? { appearance } : {}),
    }
  }
  notifyLayout(doc)
}

/** The look overlays take unless given their own (`overlayLook`, `restyle(document)`). */
export const lookDefaults: { current: UiLook } = { current: {} }

export { reducedMotion } from "../core/motion.js"

export const tune = <T extends { omega: number; zeta: number }>(
  s: T,
  m: { readonly omega: number; readonly zeta: number },
): T => {
  s.omega = m.omega
  s.zeta = m.zeta
  return s
}

/** Whether `target` is an editable field or select that takes typed keys. */
export { isTypingTarget } from "../core/keys.js"

/**
 * Tells the page's GPU overlay that layout moved (a pane resizing, collapsing or sliding): it
 * reads rects afresh on its next frame, so a panel inside a pane keeps up.
 */
export function notifyLayout(doc: Document) {
  doc.dispatchEvent(new Event("knobs-layout"))
}

/** One rAF loop: `step(dt)` runs each frame while it returns true. */
export function frameLoop(win: Window, step: (dt: number) => boolean) {
  let raf = 0
  let last = 0
  const tick = (now: number) => {
    const dt = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60
    last = now
    raf = step(dt) ? win.requestAnimationFrame(tick) : 0
    if (!raf) last = 0
  }
  return {
    wake() {
      if (!raf) raf = win.requestAnimationFrame(tick)
    },
    get running() {
      return raf !== 0
    },
    stop() {
      if (raf) win.cancelAnimationFrame(raf)
      raf = 0
      last = 0
    },
  }
}

export const svg = (body: string, box = 16) =>
  `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

export const ICONS = {
  caret: svg('<path d="M6 3.5 10.5 8 6 12.5"/>'),
  chevronDown: svg('<path d="M3.5 6 8 10.5 12.5 6"/>'),
  eye: svg(
    '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>',
  ),
  eyeOff: svg(
    '<path d="M2.5 2.5l11 11M6.6 4.2A6.6 6.6 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.7 2.2M10.2 11.9A6 6 0 0 1 8 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 0 1 2.4-2.9"/>',
  ),
  lock: svg(
    '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  ),
  unlock: svg(
    '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
  ),
}
