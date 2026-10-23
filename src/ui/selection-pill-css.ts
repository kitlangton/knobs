// The selection pill (selection-pill.ts): the fill under the rows and the bright copy over them,
// both placed by script; with nothing selected they fade out where they are.
export const selectionPillCss = `
.knobs-pick-pill,.knobs-pick-copy{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;transition:opacity .1s linear}
.knobs-pick-pill{background:var(--_k-fill-selected);will-change:transform}
.knobs-pick-copy{overflow:hidden;will-change:transform}
.knobs-pick-copy-rows{position:absolute;left:0;top:0;width:0;height:0}
:is(.knobs-pick-pill,.knobs-pick-copy)[data-off]{opacity:0}
`
