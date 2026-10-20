// The player: the picture in the compare's frame (the same radius and stage), then its row: a
// minimal play/pause button and the progress line. The picture comes in with its first frame
// (opacity and a 4px blur, on the default spring).
export const playerCss = `
:where(.knobs-player,.knobs-player *){box-sizing:border-box}
.knobs-ui.knobs-player{--_kp-stage:var(--_k-compare-stage);display:flex;flex-direction:column;gap:6px;width:100%;outline:none;
  font:var(--_k-weight) var(--_k-font-size)/1.35 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left}
:where(.knobs-surface,.knobs-pane:not([data-nested])>.knobs-pane-clip) .knobs-ui.knobs-player,.knobs-ui.knobs-player[data-nested]{--_kp-stage:var(--k-compare-stage,transparent)}
.knobs-player-frame{position:relative;width:100%;aspect-ratio:var(--kp-aspect,16/9);overflow:hidden;border-radius:var(--_k-radius-panel);background:var(--_kp-stage)}
.knobs-player[data-frame="flat"] .knobs-player-frame{border-radius:0}
.knobs-player-media{position:absolute;inset:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0;object-fit:contain;
  opacity:0;filter:blur(4px);transition:opacity calc(var(--_k-motion-default-ms) * 1ms) var(--_k-motion-default),filter calc(var(--_k-motion-default-ms) * 1ms) var(--_k-motion-default)}
.knobs-player[data-ready] .knobs-player-media{opacity:1;filter:none}
.knobs-player-line{flex:none;min-height:0}
/* The timeline's own stylesheet is look.ts's; what the player's row and every timeline share
   about the hand is set here, after it. No hand cursor anywhere (the arrow, or a resize where it
   resizes); hover is a quiet fill (fill-hover), in at once (hover-in, 0 ms), out easing. */
.knobs-ui .knobs-tl-play,.knobs-ui.knobs-timeline :is(.knobs-tl-pin,.knobs-tl-rlabel),
.knobs-ui.knobs-timeline[data-dragging] .knobs-tl-marker :is(.knobs-tl-pin,.knobs-tl-mlabel){cursor:default}
.knobs-ui .knobs-tl-play:hover,.knobs-tl-edge:hover::after,.knobs-tl-rlabel:hover,.knobs-tl-track:hover .knobs-tl-hover,
.knobs-timeline[data-variant="line"] .knobs-tl-track:hover .knobs-tl-segs{transition-duration:calc(var(--_k-hover-in) * 1ms)}
/* The line's row: a minimal play/pause (the filled pair, a 28px target, no fill at rest), then
   the line, centred on it. */
.knobs-ui.knobs-timeline[data-variant="line"]{gap:4px;align-items:center}
.knobs-timeline[data-variant="line"] .knobs-tl-transport{display:flex}
.knobs-ui.knobs-timeline[data-variant="line"] .knobs-tl-play{width:28px;height:28px;min-width:28px;min-height:28px;border-radius:var(--_k-radius);background:transparent;color:var(--_k-fg-2);
  transition:background calc(var(--_k-hover-out) * 1ms),transform .15s var(--_ku-ease)}
.knobs-ui.knobs-timeline[data-variant="line"][data-playing] .knobs-tl-play{background:transparent;color:var(--_k-fg-2)}
.knobs-ui.knobs-timeline[data-variant="line"] .knobs-tl-play:hover{background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
.knobs-ui.knobs-timeline[data-variant="line"] .knobs-tl-track{cursor:default;transition:background calc(var(--_k-hover-out) * 1ms)}
.knobs-ui.knobs-timeline[data-variant="line"] .knobs-tl-track:hover{background:var(--_k-fill-hover);transition-duration:calc(var(--_k-hover-in) * 1ms)}
`
