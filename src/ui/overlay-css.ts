// Overlays: popovers, tooltips, the command palette, confirms and toasts. They live in one fixed
// layer above the page and the GPU overlay. Selectors are (0,2,0) so a toast inside a page wins
// over the panel's reset.
export const overlayCss = `
.knobs-layers{position:fixed;inset:0;z-index:2147480005;pointer-events:none}
.knobs-layers>.knobs-layer,.knobs-ui.knobs-toast{position:fixed;left:0;top:0;box-sizing:border-box;pointer-events:auto;outline:none;
  font:var(--_k-weight) var(--_k-font-size)/1.4 var(--_k-font);color:var(--_k-fg);letter-spacing:normal;text-align:left;text-transform:none;
  -webkit-font-smoothing:antialiased;will-change:transform,opacity,filter}
/* The overlays' own elements stop a host's element rules; what you put in a popover is yours. */
:where(.knobs-layers,.knobs-toast) :is(.knobs-kbd,.knobs-mitem,.knobs-menu-sep,.knobs-palette-input,.knobs-palette-label>mark,.knobs-confirm-title,.knobs-confirm-body,.knobs-confirm-btn,.knobs-toast-action){all:revert;box-sizing:border-box;font:inherit;color:inherit;letter-spacing:inherit;
  background:transparent;border:0;margin:0;padding:0;outline:none;box-shadow:none}
.knobs-layers .knobs-layer *{box-sizing:border-box}
/* A floating surface: frosted, a hairline rim, a soft shadow. */
.knobs-layers>:is(.knobs-popover-layer,.knobs-palette,.knobs-confirm,.knobs-menu-layer){background:color-mix(in srgb,var(--_k-bg) 88%,transparent);
  -webkit-backdrop-filter:blur(28px) saturate(1.7);backdrop-filter:blur(28px) saturate(1.7);border-radius:var(--_k-radius-panel);
  box-shadow:0 0 0 .5px var(--_k-border-strong),inset 0 1px 0 var(--_k-rim),0 12px 40px rgba(0,0,0,calc(.36 * var(--_k-shadow-k,1))),0 2px 8px rgba(0,0,0,calc(.18 * var(--_k-shadow-k,1)))}
.knobs-layers>.knobs-popover-layer{min-width:120px;max-width:min(420px,calc(100vw - 16px));padding:6px}
.knobs-popover-layer .knobs-popover-text{padding:4px 6px;color:var(--_k-fg-2)}

/* Menus: rows of the panel's control height, a soft wash on the active one (never an outline),
   concentric corners inside the surface. */
.knobs-layers>.knobs-menu-layer{display:flex;flex-direction:column;min-width:184px;max-width:min(340px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:5px;
  scrollbar-width:thin;overscroll-behavior:contain;user-select:none;-webkit-user-select:none}
.knobs-menu-layer .knobs-mitem{position:relative;display:flex;align-items:center;gap:8px;flex:none;height:max(22px,calc(var(--_k-row) - 6px));padding:0 8px;
  border-radius:max(0px,calc(var(--_k-radius-panel) - 5px));color:var(--_k-fg);cursor:default;white-space:nowrap}
.knobs-menu-layer .knobs-mitem[data-active],.knobs-menu-layer .knobs-mitem[data-open]{background:var(--_ku-wash-hi)}
.knobs-menu-layer .knobs-mitem[data-destructive]{color:var(--_k-danger)}
.knobs-menu-layer .knobs-mitem[data-destructive][data-active]{background:color-mix(in srgb,var(--_k-danger) 16%,transparent)}
.knobs-menu-layer .knobs-mitem[aria-disabled="true"]{opacity:.38}
.knobs-menu-layer .knobs-menu-lead{flex:none;display:flex;align-items:center;justify-content:center;width:14px;margin-left:-2px;color:var(--_k-fg-2);font-size:calc(var(--_k-font-size) - 1px)}
.knobs-menu-layer .knobs-mitem[data-destructive] .knobs-menu-lead,.knobs-menu-layer .knobs-mitem[aria-checked="true"] .knobs-menu-lead{color:inherit}
.knobs-menu-layer .knobs-menu-lead svg{width:13px;height:13px}
.knobs-menu-layer .knobs-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.knobs-menu-layer .knobs-menu-hint{flex:none;color:var(--_k-fg-3)}
.knobs-menu-layer .knobs-menu-keys{display:inline-flex;gap:2px;flex:none;margin-left:12px}
.knobs-menu-layer .knobs-mitem[data-active] .knobs-kbd{background:color-mix(in srgb,var(--_k-fg) 14%,transparent);color:var(--_k-fg)}
.knobs-menu-layer .knobs-menu-caret{flex:none;display:flex;margin-left:8px;margin-right:-3px;color:var(--_k-fg-3)}
.knobs-menu-layer .knobs-menu-caret svg{width:10px;height:10px}
.knobs-menu-layer .knobs-menu-sep{flex:none;height:1px;margin:4px 8px;background:var(--_k-border)}

.knobs-layers>.knobs-tooltip{display:inline-flex;align-items:center;gap:7px;max-width:300px;padding:4px 8px;pointer-events:none;white-space:nowrap;
  font-size:calc(var(--_k-font-size) - .5px);background:var(--_k-bg);color:var(--_k-fg);border-radius:min(var(--_k-radius),6px);
  box-shadow:0 0 0 .5px var(--_k-border-strong),0 4px 14px rgba(0,0,0,calc(.3 * var(--_k-shadow-k,1)))}
.knobs-tooltip .knobs-tooltip-text{overflow:hidden;text-overflow:ellipsis}
.knobs-layer :is(.knobs-tooltip-keys,.knobs-palette-keys){display:inline-flex;gap:2px;flex:none}
.knobs-layer .knobs-tooltip-keys[hidden]{display:none}
.knobs-layer .knobs-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;
  border-radius:min(var(--_k-radius),4px);background:var(--_k-fill-selected);color:var(--_k-fg-2);font:500 calc(var(--_k-font-size) - 1.5px)/1 var(--_k-font)}

.knobs-layers>.knobs-palette{left:50%;top:max(48px,15vh);translate:-50% 0;transform-origin:50% 0;display:flex;flex-direction:column;
  width:min(580px,calc(100vw - 32px));max-height:min(460px,72vh);overflow:hidden}
.knobs-palette .knobs-palette-field{display:flex;align-items:center;gap:10px;flex:none;height:46px;padding:0 16px;border-bottom:1px solid var(--_k-border);color:var(--_k-fg-3)}
.knobs-palette .knobs-palette-field svg{width:15px;height:15px;flex:none}
.knobs-palette .knobs-palette-input{flex:1;min-width:0;height:100%;font-size:calc(var(--_k-font-size) + 3px);color:var(--_k-fg);caret-color:var(--_k-accent)}
.knobs-palette .knobs-palette-input::placeholder{color:var(--_k-fg-3)}
.knobs-palette .knobs-palette-list{position:relative;flex:1;min-height:0;overflow:auto;padding:6px;scrollbar-width:thin;overscroll-behavior:contain}
.knobs-palette .knobs-palette-hl{position:absolute;left:6px;right:6px;top:0;border-radius:max(0px,calc(var(--_k-radius-panel) - 6px));background:var(--_ku-wash-hi);opacity:0;pointer-events:none;
  transition:transform var(--_ku-ease-ms) var(--_ku-ease),height var(--_ku-ease-ms) var(--_ku-ease),opacity .12s}
.knobs-palette .knobs-palette-section{padding:10px 10px 4px;color:var(--_k-fg-3);font-size:calc(var(--_k-font-size) - 1px);font-weight:var(--_k-weight-label);user-select:none}
.knobs-palette .knobs-palette-section:first-of-type{padding-top:4px}
.knobs-palette .knobs-palette-item{position:relative;display:flex;align-items:center;gap:8px;height:max(32px,var(--_k-row));padding:0 10px;
  color:var(--_k-fg-2);cursor:default;user-select:none}
.knobs-palette .knobs-palette-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--_k-fg)}
/* Searching, the label dims and its matched letters light up. */
.knobs-palette[data-query] .knobs-palette-label{color:var(--_k-fg-2)}
.knobs-palette .knobs-palette-label mark{color:var(--_k-accent);font-weight:var(--_k-weight-title)}
.knobs-palette[data-query] .knobs-palette-item[data-active] .knobs-palette-label{color:var(--_k-fg)}
.knobs-palette .knobs-palette-hint{flex:none;color:var(--_k-fg-3)}
.knobs-palette .knobs-palette-fill{flex:1}
.knobs-palette .knobs-palette-tag{flex:none;color:var(--_k-fg-3);font-size:calc(var(--_k-font-size) - 1px);white-space:nowrap}
.knobs-palette .knobs-palette-item[aria-disabled="true"]{opacity:.4}
.knobs-palette .knobs-palette-empty{padding:18px 10px;color:var(--_k-fg-3);text-align:center}

.knobs-layers>.knobs-scrim{inset:0;width:100%;height:100%;background:rgba(0,0,0,.3)}
.knobs-layers>.knobs-confirm{left:50%;top:42%;translate:-50% -50%;width:min(340px,calc(100vw - 32px));padding:18px 18px 14px}
.knobs-confirm .knobs-confirm-title{margin:0 0 6px;font-size:calc(var(--_k-font-size) + 1.5px);font-weight:var(--_k-weight-title);color:var(--_k-fg);line-height:1.3}
.knobs-confirm .knobs-confirm-body{margin:0;color:var(--_k-fg-2);line-height:1.45}
.knobs-confirm .knobs-confirm-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.knobs-confirm .knobs-confirm-btn{height:28px;padding:0 14px;border-radius:min(var(--_k-radius),7px);background:var(--_k-fill-selected);color:var(--_k-fg);
  font-weight:var(--_k-weight-label);cursor:pointer;transition:background .15s,filter .15s}
.knobs-confirm .knobs-confirm-cancel:is(:hover,:focus-visible){background:color-mix(in srgb,var(--_k-fg) 18%,transparent)}
.knobs-confirm .knobs-confirm-ok{background:var(--_k-accent);color:var(--_k-bg)}
.knobs-confirm .knobs-confirm-ok[data-destructive]{background:var(--_k-danger);color:#fff}
.knobs-confirm .knobs-confirm-ok:is(:hover,:focus-visible){filter:brightness(1.14)}

.knobs-ui.knobs-toast{left:50%;top:auto;bottom:24px;z-index:2147480005;translate:-50% 0;display:inline-flex;align-items:center;gap:10px;
  max-width:min(480px,80vw);padding:8px 16px;background:var(--_k-bg);color:var(--_k-fg);border-radius:calc(var(--_k-radius) * 999);
  box-shadow:0 0 0 .5px var(--_k-border-strong),0 8px 28px rgba(0,0,0,calc(.32 * var(--_k-shadow-k,1)))}
.knobs-toast .knobs-toast-text{overflow-wrap:anywhere}
.knobs-toast[data-tone="warn"]::before,.knobs-toast[data-tone="error"]::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:var(--_k-warn)}
.knobs-toast[data-tone="error"]::before{background:var(--_k-danger)}
.knobs-toast .knobs-toast-action{flex:none;color:var(--_k-accent);font-weight:var(--_k-weight-title);cursor:pointer}
.knobs-toast .knobs-toast-action[hidden]{display:none}
`
