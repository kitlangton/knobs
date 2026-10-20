// The history (history.ts): a date axis over lanes of spans and event marks, faint bands for
// phases behind them, a legend only for what needs one, and one detail area under the chart. It
// sits on whatever surface holds it, so it draws no card of its own: fills and hairlines only.
// kit-motion: nothing moves on load; hover washes fade on the hover tokens; marks grow on the
// snappy spring; the detail's content fades in place while its height springs (history.ts).
// Anything cut short (a lane label, a band's label, a span clipped by the axis) fades out rather
// than ending in an ellipsis or a hard edge.
export const historyCss = `
:where(.knobs-history,.knobs-history *){box-sizing:border-box}
.knobs-ui.knobs-history{--hy-gutter:128px;--hy-lane:24px;--hy-bar:16px;--hy-axis:20px;--hy-bandrow:0px;--hy-c:var(--_k-fg-3);
  --hy-fade:linear-gradient(to right,#000 calc(100% - 1.5em),transparent);
  position:relative;display:flex;flex-direction:column;width:100%;min-width:0;outline:none;color:var(--_k-fg);
  font:var(--_k-weight) var(--_k-type-body)/var(--_k-leading-body) var(--_k-font);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";
  text-align:left;letter-spacing:normal;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.knobs-history[data-bands]{--hy-bandrow:var(--_k-leading-small)}
.knobs-history[data-narrow]{--hy-gutter:0px}
.knobs-history [hidden]{display:none!important}
:where(.knobs-ui) :is(.knobs-hy-ev,.knobs-hy-span,.knobs-hy-jump,.knobs-hy-more){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;
  background:transparent;border:0;border-radius:0;margin:0;padding:0;min-width:0;box-shadow:none;outline:none}
.knobs-history [data-tone="good"]{--hy-c:var(--_k-ok)}
.knobs-history [data-tone="warn"]{--hy-c:var(--_k-warn)}
.knobs-history [data-tone="bad"]{--hy-c:var(--_k-danger)}
.knobs-history [data-tone="info"]{--hy-c:var(--_k-info)}
.knobs-history [data-tone="dim"]{--hy-c:var(--_k-fg-3)}

/* ——— the chart: lane labels beside the plot (above each lane where it's narrow) ——— */
.knobs-hy-chart{position:relative;display:grid;grid-template-columns:var(--hy-gutter) minmax(0,1fr)}
.knobs-hy-axis{position:relative;grid-column:2;grid-row:1;height:calc(var(--hy-bandrow) + var(--hy-axis))}
:is(.knobs-hy-tick,.knobs-hy-now,.knobs-hy-blabel){position:absolute;white-space:nowrap;font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3)}
.knobs-hy-tick{bottom:2px;padding-left:4px}
.knobs-hy-now{bottom:2px;color:var(--_k-accent-fg);font-weight:var(--_k-weight-label)}
.knobs-hy-blabel{top:0;padding-left:4px;overflow:hidden;color:var(--_k-fg-2)}
.knobs-hy-label{grid-column:1;align-self:center;min-width:0;margin-right:var(--_k-space-title);overflow:hidden;white-space:nowrap;
  font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3)}
.knobs-history[data-narrow] .knobs-hy-label{grid-column:2;align-self:end;margin:0}
:is(.knobs-hy-label,.knobs-hy-blabel)[data-overflow]{-webkit-mask-image:var(--hy-fade);mask-image:var(--hy-fade)}
.knobs-hy-track{position:relative;grid-column:2;height:var(--hy-lane)}
.knobs-hy-layer{position:absolute;inset:0;grid-column:2;grid-row:1/-1;pointer-events:none}

/* Bands and month lines behind the lanes; today, the selection and the pointer's line over them. */
.knobs-hy-band{position:absolute;top:0;bottom:0;background:var(--_k-fill);box-shadow:inset 1px 0 0 var(--_k-border-subtle)}
:is(.knobs-hy-grid,.knobs-hy-today,.knobs-hy-hover,.knobs-hy-sel){position:absolute;left:0;top:calc(var(--hy-bandrow) + var(--hy-axis));bottom:0;width:1px;margin-left:-.5px}
.knobs-hy-grid{background:var(--_k-border-subtle)}
.knobs-hy-today{top:calc(var(--hy-bandrow) + var(--hy-axis) - 4px);background:var(--_k-accent)}
.knobs-hy-hover{background:color-mix(in oklch,var(--_k-fg) 32%,transparent);opacity:0;transition:opacity calc(var(--_k-hover-out) * 1ms)}
.knobs-hy-hover[data-on]{opacity:1;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-hy-sel{background:var(--_k-fg-2);opacity:0}
.knobs-hy-sel[data-on]{opacity:.6}

/* Spans: a soft bar in their state's tone, inferred ones hatched; the tag at the end. */
.knobs-hy-span{position:absolute;top:calc((var(--hy-lane) - var(--hy-bar)) / 2);height:var(--hy-bar);border-radius:var(--_k-radius-sm);cursor:default;
  background:color-mix(in oklch,var(--hy-c) 24%,transparent);transition:background calc(var(--_k-hover-out) * 1ms),box-shadow calc(var(--_k-hover-out) * 1ms)}
.knobs-hy-span[data-inferred]{background:repeating-linear-gradient(135deg,color-mix(in oklch,var(--hy-c) 34%,transparent) 0 2px,color-mix(in oklch,var(--hy-c) 9%,transparent) 2px 6px)}
.knobs-hy-span[data-hover]{background-color:color-mix(in oklch,var(--hy-c) 34%,transparent);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-hy-span[data-selected]{box-shadow:inset 0 0 0 1px var(--hy-c)}
.knobs-hy-span[data-clip-start]{border-top-left-radius:0;border-bottom-left-radius:0;-webkit-mask-image:linear-gradient(to right,transparent,#000 16px);mask-image:linear-gradient(to right,transparent,#000 16px)}
.knobs-hy-span[data-clip-end]{border-top-right-radius:0;border-bottom-right-radius:0;-webkit-mask-image:linear-gradient(to left,transparent,#000 16px);mask-image:linear-gradient(to left,transparent,#000 16px)}
.knobs-hy-tag{position:absolute;top:0;right:6px;font-size:var(--_k-type-small);line-height:var(--hy-bar);white-space:nowrap;pointer-events:none;
  color:color-mix(in oklch,var(--hy-c) 55%,var(--_k-fg))}
.knobs-hy-tag[data-place="after"]{right:auto;left:calc(100% + 6px)}
.knobs-hy-tag[data-place="none"]{visibility:hidden}

/* Event marks (their kind named in the tooltip): a dot for a commit, a diamond for a release, a cross for a deletion, a square for a
   channel's switch, a triangle for a finding; inferred ones hollow. */
.knobs-hy-ev{position:absolute;top:0;width:16px;height:var(--hy-lane);margin-left:-8px;cursor:default;--hy-c:var(--_k-fg-2);--hy-s:9px}
.knobs-hy-ev::before{content:"";position:absolute;left:50%;top:50%;width:var(--hy-s);height:var(--hy-s);margin:calc(var(--hy-s) / -2) 0 0 calc(var(--hy-s) / -2);
  border-radius:50%;background:var(--hy-c);transition:scale calc(var(--_k-motion-snappy-ms) * 1ms) var(--_k-motion-snappy)}
.knobs-hy-ev[data-range]{width:calc(var(--hy-w) + 16px)}
.knobs-hy-ev[data-range]::before{left:calc(8px - var(--hy-s) / 2);right:calc(8px - var(--hy-s) / 2);width:auto;margin-left:0;border-radius:var(--_k-round)}
.knobs-hy-ev[data-type="release"]{--hy-s:8px}
.knobs-hy-ev[data-type="release"]::before{border-radius:1.5px;rotate:45deg}
.knobs-hy-ev[data-type="channel"]{--hy-s:8px}
.knobs-hy-ev[data-type="channel"]::before{border-radius:2px}
.knobs-hy-ev[data-type="audit"]{--hy-s:10px}
.knobs-hy-ev[data-type="audit"]::before{border-radius:0;clip-path:polygon(50% 4%,100% 92%,0 92%)}
.knobs-hy-ev[data-type="deletion"]::before{border-radius:0;rotate:45deg;
  background:linear-gradient(var(--hy-c),var(--hy-c)) center/100% 1.75px no-repeat,linear-gradient(var(--hy-c),var(--hy-c)) center/1.75px 100% no-repeat}
.knobs-hy-ev[data-inferred]:not([data-type="audit"],[data-type="deletion"])::before{background:transparent;box-shadow:inset 0 0 0 1.5px var(--hy-c)}
.knobs-hy-ev[data-inferred]:is([data-type="audit"],[data-type="deletion"])::before{opacity:.5}
/* Held-back marks (commits, by default) come up while the pointer is on their lane, and stay with
   "Show commits" or while selected. */
.knobs-hy-ev[data-quiet]{opacity:0;transition:opacity calc(var(--_k-hover-out) * 1ms)}
.knobs-hy-track:hover .knobs-hy-ev[data-quiet]{opacity:.6;transition-duration:calc(var(--_k-hover-in) * 1ms)}
:is(.knobs-history[data-all] .knobs-hy-ev[data-quiet],.knobs-hy-ev[data-quiet]:is([data-selected],[data-hover])){opacity:1}
.knobs-hy-ev[data-hover]::before{scale:1.25}
.knobs-hy-ev[data-selected]::before{scale:1.3}
.knobs-hy-ev[data-selected]::after{content:"";position:absolute;left:50%;top:50%;width:calc(var(--hy-s) + 9px);height:calc(var(--hy-s) + 9px);
  margin:calc((var(--hy-s) + 9px) / -2) 0 0 calc((var(--hy-s) + 9px) / -2);border-radius:50%;box-shadow:0 0 0 1.5px var(--hy-c)}
.knobs-hy-ev[data-range][data-selected]::after{left:3px;right:3px;width:auto;margin-left:0;border-radius:var(--_k-round)}
.knobs-history:focus-visible .knobs-hy-ev[data-selected]::after{box-shadow:0 0 0 2px var(--_k-focus)}
.knobs-history:focus-visible .knobs-hy-span[data-selected]{box-shadow:inset 0 0 0 2px var(--_k-focus)}

/* ——— under the chart: "Show commits", and a legend only when inferred and verified both appear ——— */
.knobs-hy-foot{display:flex;flex-wrap:wrap;align-items:center;gap:var(--_k-space-inside) var(--_k-space-title);margin-top:var(--_k-space-sibling);padding-left:var(--hy-gutter);
  font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3)}
.knobs-hy-legend{display:flex;flex-wrap:wrap;gap:var(--_k-space-inside) var(--_k-space-title)}
.knobs-ui .knobs-hy-more{height:20px;margin-left:-6px;padding:0 6px;border-radius:var(--_k-radius-sm);color:var(--_k-fg-3);cursor:default;
  transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-hy-more:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-hy-key{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.knobs-hy-swatch{flex:none;width:14px;height:8px;border-radius:2px;background:color-mix(in oklch,var(--hy-c) 34%,transparent)}
.knobs-hy-swatch[data-inferred]{background:repeating-linear-gradient(135deg,color-mix(in oklch,var(--hy-c) 60%,transparent) 0 1.5px,transparent 1.5px 4px)}

/* ——— the detail: one area under the chart, its height on a spring ——— */
.knobs-hy-detail{position:relative;overflow:hidden;user-select:text;-webkit-user-select:text}
.knobs-hy-detail[data-moving]{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent)}
.knobs-hy-dc{padding:var(--_k-space-title) 0 0 var(--hy-gutter);transition:opacity calc(var(--_k-motion-snappy-ms) * 1ms) var(--_k-motion-snappy)}
.knobs-hy-dc:is([data-enter],[data-leave]){opacity:0}
.knobs-hy-dc[data-leave]{position:absolute;left:0;right:0;top:0;transition-duration:calc(var(--_k-motion-snappy-ms) * .8ms)}
.knobs-hy-dmeta{display:flex;flex-wrap:wrap;gap:0 var(--_k-space-sibling);font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3)}
.knobs-hy-dmeta>[data-tone]{color:var(--hy-c)}
.knobs-hy-dtitle{margin-top:var(--_k-space-inside);font-size:var(--_k-type-body);line-height:var(--_k-leading-body);font-weight:var(--_k-weight-label);color:var(--_k-fg);text-wrap:balance}
.knobs-hy-dtext{margin:var(--_k-space-inside) 0 0;max-width:68ch;font-size:var(--_k-type-body);line-height:var(--_k-leading-body);color:var(--_k-fg-2);text-wrap:pretty}
.knobs-hy-dtext code{font:var(--_k-type-label) var(--_k-mono);letter-spacing:0;padding:1px 5px;border-radius:calc(var(--_k-radius) / 2);background:var(--_k-fill)}
.knobs-hy-dfoot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:var(--_k-space-sibling)}
.knobs-hy-dfoot:empty{display:none}
.knobs-hy-evidence{display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:var(--_k-radius-sm);background:var(--_k-fill);color:var(--_k-fg-2);
  font:var(--_k-type-small)/1 var(--_k-mono);text-decoration:none;transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
a.knobs-hy-evidence:hover{background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui .knobs-hy-jump{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 5px 0 6px;border-radius:var(--_k-radius-sm);color:var(--_k-fg-2);cursor:default;
  font-size:var(--_k-type-small);transition:background calc(var(--_k-hover-out) * 1ms),color calc(var(--_k-hover-out) * 1ms)}
.knobs-ui .knobs-hy-jump:is(:hover,:focus-visible){background:var(--_k-fill-hover);color:var(--_k-fg);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-hy-jump svg{width:12px;height:12px}

/* ——— the pointer's tooltip: title, date, one line ——— */
.knobs-hy-tip{position:absolute;left:0;top:0;max-width:280px;padding:6px 8px;border-radius:var(--_k-radius-md);background:var(--_k-bg-overlay);
  box-shadow:var(--_k-shadow-overlay),0 0 0 1px var(--_k-border);pointer-events:none;opacity:0;transition:opacity calc(var(--_k-hover-out) * 1ms)}
.knobs-hy-tip[data-on]{opacity:1;transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-hy-tt{font-size:var(--_k-type-small);line-height:var(--_k-leading-small);font-weight:var(--_k-weight-label);color:var(--_k-fg);text-wrap:balance}
:is(.knobs-hy-td,.knobs-hy-tl){font-size:var(--_k-type-small);line-height:var(--_k-leading-small);color:var(--_k-fg-3)}
.knobs-hy-tl{margin-top:2px;color:var(--_k-fg-2);text-wrap:pretty}
.knobs-hy-tl:empty{display:none}

@media(prefers-reduced-motion:reduce){
  .knobs-history :where(*,::before,::after){transition-property:opacity,background,color,box-shadow!important}
  .knobs-hy-dc{transition-duration:calc(var(--_k-hover-out) * 1ms)!important}
}
`
