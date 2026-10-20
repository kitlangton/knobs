// The player: the picture in the compare's frame (the same radius and stage), then its progress
// line. The picture comes in with its first frame (opacity and a 4px blur, on the default
// spring). Playing or pausing flashes the glyph for it in the middle, blurring in and out; a
// compare's stage flashes the same one.
export const playerCss = `
:where(.knobs-player,.knobs-player *){box-sizing:border-box}
.knobs-ui.knobs-player{--_kp-stage:var(--_k-compare-stage);display:flex;flex-direction:column;gap:6px;width:100%;outline:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left}
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-ui.knobs-player,.knobs-ui.knobs-player[data-nested]{--_kp-stage:var(--k-compare-stage,transparent)}
.knobs-player-frame{position:relative;width:100%;aspect-ratio:var(--kp-aspect,16/9);overflow:hidden;border-radius:var(--_k-radius-panel);background:var(--_kp-stage);cursor:pointer}
.knobs-player[data-frame="flat"] .knobs-player-frame{border-radius:0}
.knobs-player-media{position:absolute;inset:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0;object-fit:contain;
  opacity:0;filter:blur(4px);transition:opacity calc(var(--_k-motion-default-ms) * 1ms) var(--_k-motion-default),filter calc(var(--_k-motion-default-ms) * 1ms) var(--_k-motion-default)}
.knobs-player[data-ready] .knobs-player-media{opacity:1;filter:none}
.knobs-player-glyph{position:absolute;left:50%;top:50%;display:grid;place-items:center;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;color:var(--_k-fg);pointer-events:none;
  opacity:0;filter:blur(4px);scale:.96;
  background:color-mix(in srgb,var(--_k-bg) 52%,transparent);-webkit-backdrop-filter:blur(14px) saturate(1.6);backdrop-filter:blur(14px) saturate(1.6);
  box-shadow:inset 0 0 0 .5px var(--_k-border),inset 0 1px 0 var(--_k-rim);
  transition:opacity calc(var(--_k-motion-snappy-ms) * 1ms) var(--_k-motion-snappy),filter calc(var(--_k-motion-snappy-ms) * 1ms) var(--_k-motion-snappy),scale calc(var(--_k-motion-snappy-ms) * 1ms) var(--_k-motion-snappy)}
.knobs-player-glyph svg{width:16px;height:16px}
.knobs-player-glyph[data-flash]{opacity:1;filter:none;scale:1}
.knobs-player-line{flex:none;min-height:0}
`
