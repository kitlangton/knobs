// The tracks view: one lane per track under a timeline's track, each with its clip. The clip is a
// soft bar (a faint staircase inside for a stagger, a hairline trailing off its end where a
// spring settles); its edges trim, its body moves. No transitions: hover is immediate, and the
// clips' glides are springs in script.
export const tracksCss = `
:where(.knobs-tracks,.knobs-tracks *){box-sizing:border-box}
.knobs-ui.knobs-tracks{position:relative;display:block;width:100%;padding:4px 0 6px;outline:none;user-select:none;-webkit-user-select:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left;-webkit-font-smoothing:antialiased;
  --ktk-row:var(--_k-control-h);--ktk-clip:color-mix(in srgb,var(--_k-fg) 9%,transparent);
  --ktk-ring:color-mix(in srgb,var(--_k-fg) 16%,transparent);--ktk-radius:max(0px,calc(var(--_k-radius) - 2px))}
.knobs-tk-lanes{position:relative;display:flex;flex-direction:column;gap:2px;touch-action:none;cursor:col-resize}
.knobs-tk-row{position:relative;height:var(--ktk-row);box-shadow:inset 0 -1px 0 var(--_k-border-subtle)}
.knobs-tk-row:last-of-type{box-shadow:none}
.knobs-tk-clip{position:absolute;left:0;top:3px;bottom:3px;min-width:2px;border-radius:var(--ktk-radius);background:var(--ktk-clip);box-shadow:inset 0 0 0 1px var(--ktk-ring);cursor:default;will-change:transform}
.knobs-tk-clip:hover{--ktk-clip:color-mix(in srgb,var(--_k-fg) 13%,transparent);--ktk-ring:color-mix(in srgb,var(--_k-fg) 24%,transparent)}
.knobs-tk-clip:is([data-active],[data-dragging]){--ktk-clip:color-mix(in srgb,var(--_k-accent) 20%,transparent);--ktk-ring:color-mix(in srgb,var(--_k-accent) 55%,transparent)}
.knobs-tk-steps{position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none}
.knobs-tk-step{position:absolute;left:0;top:0;border-radius:1px;box-shadow:inset 1px 0 0 color-mix(in srgb,var(--_k-fg) 26%,transparent);background:color-mix(in srgb,var(--_k-fg) 7%,transparent)}
.knobs-tk-clip:is([data-active],[data-dragging]) .knobs-tk-step{box-shadow:inset 1px 0 0 color-mix(in srgb,var(--_k-accent) 60%,transparent);background:color-mix(in srgb,var(--_k-accent) 10%,transparent)}
.knobs-tk-tail{position:absolute;left:100%;top:50%;height:1px;margin-top:-.5px;background:linear-gradient(to right,var(--ktk-ring),transparent);pointer-events:none}
.knobs-tk-label{position:absolute;left:7px;right:7px;top:0;bottom:0;overflow:hidden;white-space:nowrap;font-size:var(--_k-text-meta);line-height:calc(var(--ktk-row) - 6px);color:var(--_k-fg-2);pointer-events:none}
.knobs-tk-clip:is(:hover,[data-active],[data-dragging]) .knobs-tk-label{color:var(--_k-fg)}
.knobs-tk-edge{position:absolute;top:0;bottom:0;width:9px;cursor:ew-resize}
.knobs-tk-edge[data-edge="start"]{left:-4px}
.knobs-tk-edge[data-edge="end"]{right:-5px}
.knobs-tk-edge::after{content:"";position:absolute;top:2px;bottom:2px;left:3.5px;width:2px;border-radius:1px;background:transparent}
.knobs-tk-clip:hover .knobs-tk-edge::after{background:color-mix(in srgb,var(--_k-fg) 30%,transparent)}
.knobs-tk-edge:hover::after,.knobs-tracks[data-grip="start"] [data-dragging] [data-edge="start"]::after,.knobs-tracks[data-grip="end"] [data-dragging] [data-edge="end"]::after{background:var(--_k-accent)!important}
.knobs-tracks[data-grip="start"],.knobs-tracks[data-grip="end"],.knobs-tracks[data-grip="start"] *,.knobs-tracks[data-grip="end"] *{cursor:ew-resize}
.knobs-tk-head{position:absolute;left:0;top:-4px;bottom:-6px;width:0;will-change:transform;pointer-events:none}
.knobs-tk-head::before{content:"";position:absolute;top:0;bottom:0;left:-.75px;width:1.5px;background:var(--_k-accent)}
.knobs-tk-guide{position:absolute;left:0;top:-4px;bottom:-6px;width:0;will-change:transform;pointer-events:none;visibility:hidden}
.knobs-tk-guide::before{content:"";position:absolute;top:0;bottom:0;left:-.5px;width:1px;background:repeating-linear-gradient(to bottom,var(--_k-fg-2) 0 3px,transparent 3px 6px)}
.knobs-tk-guide[data-on]{visibility:visible}
.knobs-tk-tag{position:absolute;left:0;top:0;height:var(--ktk-row);padding:0 5px;border-radius:var(--ktk-radius);background:var(--_k-fill-selected);color:var(--_k-fg);
  font-size:var(--_k-text-meta);line-height:var(--ktk-row);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap;pointer-events:none;visibility:hidden;will-change:transform}
.knobs-tk-tag[data-on]{visibility:visible}
`
