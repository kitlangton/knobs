// The canvas: quiet dots on the page, and each item one hairline card with its name above it.
// The world is one transformed layer; the readout is a small pill in the corner.
export const canvasCss = `
.knobs-ui.knobs-canvas{--_kc-radius:var(--k-ui-canvas-radius,var(--_k-radius-panel));--_kc-fade:var(--k-ui-canvas-fade,16px);
  position:relative;width:100%;height:100%;overflow:hidden;outline:none;background:var(--k-ui-canvas-bg,var(--_k-bg-page));contain:strict;
  touch-action:none;overscroll-behavior:none;user-select:none;-webkit-user-select:none;cursor:default;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left}
:where(.knobs-canvas-stage,.knobs-canvas-stage *,.knobs-canvas-zoom,.knobs-canvas-zoom *){box-sizing:border-box}
/* No hard edges: what slides out of view fades over the last few px. */
.knobs-canvas-stage{position:absolute;inset:0;overflow:hidden;
  -webkit-mask-image:linear-gradient(to right,transparent,#000 var(--_kc-fade),#000 calc(100% - var(--_kc-fade)),transparent),linear-gradient(to bottom,transparent,#000 var(--_kc-fade),#000 calc(100% - var(--_kc-fade)),transparent);
  -webkit-mask-composite:source-in;mask-image:linear-gradient(to right,transparent,#000 var(--_kc-fade),#000 calc(100% - var(--_kc-fade)),transparent),linear-gradient(to bottom,transparent,#000 var(--_kc-fade),#000 calc(100% - var(--_kc-fade)),transparent);mask-composite:intersect}
.knobs-canvas-dots{position:absolute;left:-128px;top:-128px;right:-128px;bottom:-128px;pointer-events:none;will-change:transform;
  background-image:radial-gradient(circle,var(--k-ui-canvas-dot,color-mix(in srgb,var(--_k-fg) 22%,transparent)) 1px,transparent 1.25px)}
.knobs-canvas-world{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0}
.knobs-canvas[data-moving] .knobs-canvas-world{will-change:transform}
.knobs-canvas:is([data-panning],[data-space]) .knobs-canvas-world{pointer-events:none}
.knobs-canvas[data-space]{cursor:grab}
.knobs-canvas[data-grabbing]{cursor:grabbing}
.knobs-canvas-tile{position:absolute;left:0;top:0;display:flex;flex-direction:column;width:max-content;transform-origin:50% 50%}
.knobs-canvas-title{flex:none;contain:inline-size;height:24px;padding:0 2px 8px;overflow:hidden;white-space:nowrap;color:var(--_k-fg-2);
  font-size:var(--_k-type-small,12px);line-height:16px;-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 16px),transparent)}
.knobs-canvas-card{position:relative;flex:none;padding:var(--k-ui-canvas-pad,16px);border-radius:var(--_kc-radius);background:var(--k-ui-canvas-card,var(--_k-bg));
  overflow:hidden;user-select:text;-webkit-user-select:text}
.knobs-canvas-card::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px var(--_k-border);pointer-events:none}
/* The readout: how far, and the way back to the whole set or 100%. */
.knobs-canvas-zoom{position:absolute;right:10px;bottom:10px;z-index:1;display:flex;align-items:center;gap:2px;height:28px;padding:0 4px;border-radius:999px;
  background:var(--_k-bg);box-shadow:inset 0 0 0 1px var(--_k-border);color:var(--_k-fg-2);font-size:var(--_k-type-small,12px);
  font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap}
:where(.knobs-ui) .knobs-canvas-btn{all:revert;box-sizing:border-box;font:inherit;letter-spacing:inherit;margin:0;border:0;outline:none;box-shadow:none;
  display:inline-flex;align-items:center;justify-content:center;height:20px;min-width:20px;padding:0 6px;border-radius:999px;background:transparent;color:inherit;cursor:default;
  transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
:where(.knobs-ui) .knobs-canvas-btn:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:0ms}
:where(.knobs-ui) .knobs-canvas-btn:focus-visible{box-shadow:0 0 0 1.5px var(--_k-accent)}
.knobs-canvas-pct{min-width:46px}
.knobs-canvas-btn svg{width:13px;height:13px}
`
