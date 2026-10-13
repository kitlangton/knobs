import rolling from "@kitlangton/rolling-number/styles.css" with { type: "text" }

const css = `
:where(:root,:host){
  --k-bg:#1c1c1e;--k-surface:rgba(255,255,255,.055);--k-surface-hi:rgba(255,255,255,.11);--k-line:rgba(255,255,255,.1);--k-line-hi:rgba(255,255,255,.18);
  --k-text:rgba(255,255,255,.92);--k-label:rgba(255,255,255,.64);--k-dim:rgba(255,255,255,.42);--k-accent:#fff;--k-modified:#ff9f0a;
  --k-seg-bg:rgba(0,0,0,.26);--k-seg-active:var(--k-surface-hi);--k-toggle-track:rgba(255,255,255,.14);--k-shadow:0 12px 36px rgba(0,0,0,.52),0 1px 2px rgba(0,0,0,.3);
  --k-width:288px;--k-pad:10px;--k-inset:10px;--k-row:32px;--k-gap:4px;--k-radius:8px;--k-panel-radius:12px;
  --k-font-size:12px;--k-label-weight:500;--k-blur:1;--k-glow:0.5;
  --k-font:system-ui,-apple-system,"SF Pro Text",sans-serif;
  --k-mono:ui-monospace,"Geist Mono",SFMono-Regular,Menlo,monospace;
  --k-ease:cubic-bezier(.2,.8,.2,1);
}
:where(.knobs-panel,.knobs-chip)[data-theme="light"],
:where([data-knobs-theme="light"]) :where(.knobs-panel,.knobs-chip):not([data-theme="dark"]),
:where(:root[data-theme="light"]) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{
  --k-bg:#f5f5f7;--k-surface:rgba(0,0,0,.05);--k-surface-hi:rgba(0,0,0,.095);--k-line:rgba(0,0,0,.1);--k-line-hi:rgba(0,0,0,.2);
  --k-text:rgba(0,0,0,.88);--k-label:rgba(60,60,67,.68);--k-dim:rgba(60,60,67,.44);--k-accent:#1c1c1e;--k-modified:#d97706;
  --k-seg-bg:rgba(0,0,0,.065);--k-seg-active:#fff;--k-toggle-track:rgba(0,0,0,.14);--k-shadow:0 10px 32px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
  color-scheme:light;
}
@media(prefers-color-scheme:light){
  :where(:root:not([data-theme="dark"])) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{
    --k-bg:#f5f5f7;--k-surface:rgba(0,0,0,.05);--k-surface-hi:rgba(0,0,0,.095);--k-line:rgba(0,0,0,.1);--k-line-hi:rgba(0,0,0,.2);
    --k-text:rgba(0,0,0,.88);--k-label:rgba(60,60,67,.68);--k-dim:rgba(60,60,67,.44);--k-accent:#1c1c1e;--k-modified:#d97706;
    --k-seg-bg:rgba(0,0,0,.065);--k-seg-active:#fff;--k-toggle-track:rgba(0,0,0,.14);--k-shadow:0 10px 32px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
    color-scheme:light;
  }
}
:where(.knobs-panel)[data-density="compact"]{--k-row:28px;--k-gap:3px;--k-radius:6px;--k-panel-radius:10px;--k-pad:8px;--k-inset:8px;--k-font-size:11px}
:where(.knobs-panel)[data-density="comfortable"]{--k-row:38px;--k-gap:6px;--k-radius:10px;--k-panel-radius:14px;--k-pad:12px;--k-inset:12px;--k-font-size:13px}

.knobs-panel,.knobs-chip{
  box-sizing:border-box;font:var(--k-font-size)/1.35 var(--k-font);color:var(--k-text);text-align:left;color-scheme:dark;
  -webkit-font-smoothing:antialiased;
}
:where(.knobs-panel,.knobs-chip) :where(*,*::before,*::after){box-sizing:border-box}
.knobs-panel .rn-slot{box-sizing:content-box}
.knobs-panel [hidden],.knobs-chip[hidden]{display:none!important}
.knobs-mono{font-family:var(--k-mono);font-variant-numeric:tabular-nums}

.knobs-chip{position:fixed;z-index:2147480000;padding:4px 9px;border-radius:999px;cursor:pointer;background:var(--k-bg);border:1px solid var(--k-line);
  color:var(--k-label);font-size:11.5px;letter-spacing:.01em;box-shadow:0 4px 16px rgba(0,0,0,.35);transition:color .15s,border-color .15s,transform .2s var(--k-ease),opacity .2s;}
.knobs-chip:hover{color:var(--k-text);border-color:var(--k-line-hi)}
.knobs-chip:focus-visible{outline:2px solid var(--k-accent);outline-offset:2px}

.knobs-panel{position:fixed;z-index:2147480001;width:var(--k-width);max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:var(--k-pad);
  background:var(--k-bg);border:1px solid var(--k-line);border-radius:var(--k-panel-radius);box-shadow:var(--k-shadow);scrollbar-width:thin;
  animation:knobs-in .2s var(--k-ease);}
.knobs-panel.knobs-inline{position:relative;z-index:auto;left:auto!important;top:auto!important;max-width:100%;max-height:none;box-shadow:none;animation:none}
@keyframes knobs-in{from{opacity:0;transform:translateY(4px) scale(.985)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.knobs-panel{animation:none}.knobs-panel *{transition:none!important}}

.knobs-panel button,.knobs-panel input,.knobs-panel select,.knobs-panel textarea{font:inherit;color:inherit;background:var(--k-surface);border:0;border-radius:var(--k-radius);min-width:0}
.knobs-panel :focus-visible{outline:1.5px solid var(--k-accent);outline-offset:-1.5px}
.knobs-panel header button:focus-visible,.knobs-toggle:focus-visible{outline-offset:2px}

/* Header */
.knobs-panel header{display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:grab;touch-action:none;padding:0 2px 8px;min-height:24px}
.knobs-panel.knobs-inline header{cursor:default}
.knobs-panel header:active{cursor:grabbing}
.knobs-panel.knobs-inline header:active{cursor:default}
.knobs-panel header strong{flex:1;font-weight:600;font-size:calc(var(--k-font-size) + 1px);letter-spacing:-.01em;overflow-wrap:anywhere}
.knobs-head-actions{display:flex;align-items:center;gap:2px}
.knobs-panel header button{width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--k-label);background:transparent;border-radius:999px;cursor:pointer;font-size:12px;line-height:1;transition:background .15s,color .15s,opacity .15s}
.knobs-panel header button:hover:not([disabled]){background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel header button[aria-expanded="true"]{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel header button[disabled]{opacity:.32;cursor:default}

/* Shortcuts Popover */
.knobs-popover{margin:0 0 8px;padding:8px var(--k-inset);background:var(--k-surface-hi);border:1px solid var(--k-line);border-radius:var(--k-radius);font-size:calc(var(--k-font-size) - 1px);animation:knobs-in .14s var(--k-ease)}
.knobs-popover-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:baseline}
.knobs-popover-grid kbd{font-family:var(--k-mono);font-size:calc(var(--k-font-size) - 1.5px);color:var(--k-text);background:var(--k-seg-bg);padding:1px 5px;border-radius:4px;justify-self:start;white-space:nowrap}
.knobs-popover-grid span{color:var(--k-label)}

/* Custom Preset Strip */
.knobs-presets{position:relative;display:flex;align-items:center;gap:4px;height:calc(var(--k-row) - 4px);min-height:24px;margin:0 0 var(--k-gap);padding:2px;background:var(--k-seg-bg);border-radius:var(--k-radius);user-select:none;touch-action:pan-x}
.knobs-presets-track{position:relative;flex:1;display:flex;align-items:center;gap:2px;height:100%;overflow-x:auto;scrollbar-width:none}
.knobs-presets-track::-webkit-scrollbar{display:none}
.knobs-presets-pill{position:absolute;top:0;bottom:0;left:0;background:var(--k-seg-active);border-radius:calc(var(--k-radius) - 2px);box-shadow:0 1px 2px rgba(0,0,0,.16);pointer-events:none;transition:transform .24s cubic-bezier(.22,1.15,.36,1),width .24s cubic-bezier(.22,1.15,.36,1),opacity .15s}
.knobs-preset-chip{position:relative;z-index:1;flex:1 0 auto;height:100%;padding:0 9px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:var(--k-label-weight);color:var(--k-label);background:transparent!important;border-radius:calc(var(--k-radius) - 2px);cursor:pointer;white-space:nowrap;transition:color .15s}
.knobs-preset-chip:hover{color:var(--k-text)}
.knobs-preset-chip[aria-checked="true"]{color:var(--k-text);font-weight:600}
.knobs-preset-custom{flex:none;display:inline-flex;align-items:center;gap:4px;padding:0 7px 0 5px;height:calc(100% - 2px);font:500 calc(var(--k-font-size) - 1.5px)/1 var(--k-mono);color:var(--k-label);border-left:1px solid var(--k-line);white-space:nowrap}
.knobs-preset-custom::before{content:"";width:4px;height:4px;border-radius:50%;background:var(--k-modified)}

/* Group headers */
.knobs-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 4px;padding:0 2px;color:var(--k-dim);font-size:calc(var(--k-font-size) - 2px);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.knobs-group-head:first-child{margin-top:2px}
.knobs-group-head>span:last-child{display:flex;align-items:center;gap:4px}
.knobs-group-head button{height:20px;padding:0 6px;font-size:calc(var(--k-font-size) - 1.5px);font-weight:500;letter-spacing:0;text-transform:none;color:var(--k-label);background:transparent;border-radius:4px;cursor:pointer}
.knobs-group-head button:hover:not([disabled]){background:var(--k-surface-hi);color:var(--k-text)}
.knobs-group-head button[disabled]{opacity:.32;cursor:default}

/* Rows: strict 8px/4px grid & unified --k-inset alignment */
.knobs-panel .knobs-row,.knobs-panel .knobs-slider{position:relative;min-height:var(--k-row);margin-bottom:var(--k-gap);border-radius:var(--k-radius);background:var(--k-surface);transition:background .15s}
.knobs-panel .knobs-slider{height:var(--k-row)}
.knobs-panel .knobs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px var(--k-inset)}
.knobs-panel .knobs-row:has(:focus-visible){background:var(--k-surface-hi)}
.knobs-panel .knobs-row>span:first-child{color:var(--k-label);font-weight:var(--k-label-weight);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.knobs-modified .knobs-label::after,.knobs-modified.knobs-row>span:first-child::after{content:"";display:inline-block;width:4px;height:4px;margin-left:5px;border-radius:50%;background:var(--k-modified);vertical-align:middle;opacity:.95}

/* Slider: the row is the track */
.knobs-track{position:absolute;inset:0;border-radius:var(--k-radius);overflow:hidden;cursor:ew-resize;user-select:none;touch-action:none}
.knobs-marks{position:absolute;inset:0;pointer-events:none}
.knobs-marks i{position:absolute;top:50%;width:1px;height:7px;border-radius:999px;transform:translate(-50%,-50%);background:rgba(255,255,255,0);transition:background .2s}
.knobs-fill{position:absolute;top:0;bottom:0;left:0;background:var(--k-surface-hi);pointer-events:none;transition:background .15s}
.knobs-animate .knobs-fill,.knobs-animate .knobs-handle{transition:width .3s var(--k-ease),left .3s var(--k-ease),background .15s,opacity .15s,transform .24s var(--k-ease)}
.knobs-handle{position:absolute;top:50%;width:3px;height:calc(var(--k-row) - 12px);margin-left:-1.5px;border-radius:999px;background:var(--k-accent);pointer-events:none;
  opacity:0;transform:translateY(-50%) scaleX(.25);transition:opacity .15s,transform .24s var(--k-ease)}
.knobs-slider:hover .knobs-handle,.knobs-track:focus-visible~.knobs-handle,.knobs-track:focus-visible .knobs-handle{opacity:.55;transform:translateY(-50%) scaleX(1)}
.knobs-active .knobs-handle{opacity:.92;transform:translateY(-50%) scaleX(1)}
.knobs-slider:hover .knobs-handle.knobs-dodge,.knobs-active .knobs-handle.knobs-dodge{opacity:.14;transform:translateY(-50%) scaleX(1) scaleY(.75)}
.knobs-slider:hover .knobs-marks i,.knobs-active .knobs-marks i{background:var(--k-line-hi)}
.knobs-active .knobs-fill{background:var(--k-line-hi)}
.knobs-slider:hover,.knobs-active{background:var(--k-surface)}
.knobs-release{transition:transform .35s cubic-bezier(.2,1.4,.4,1)}
.knobs-digits{display:inline-block;line-height:1.35;--rn-edge-fade:0px}
.knobs-unit{color:var(--k-dim)}
.knobs-label{position:absolute;left:var(--k-inset);top:50%;transform:translateY(-50%);max-width:calc(100% - 92px);overflow:hidden;text-overflow:ellipsis;color:var(--k-label);font-weight:var(--k-label-weight);pointer-events:none;white-space:nowrap}
.knobs-value{position:absolute;right:var(--k-inset);top:50%;transform:translateY(-50%);display:inline-flex;align-items:baseline;justify-content:flex-end;gap:.28em;padding:4px 0 4px 8px;background:transparent!important;border-radius:0!important;line-height:1.35;overflow:visible;white-space:nowrap;
  color:var(--k-label);font-family:var(--k-mono);font-variant-numeric:tabular-nums;font-size:calc(var(--k-font-size) - 0.5px);
  border-bottom:1px solid transparent;cursor:text;transition:color .15s,border-color .15s .4s}
.knobs-value:hover{border-bottom-color:var(--k-label)}
.knobs-active .knobs-value,.knobs-track:focus-visible .knobs-value{color:var(--k-text)}
.knobs-number{position:absolute;right:var(--k-inset);top:50%;transform:translateY(-50%);z-index:2;width:6.5ch;padding:1px 4px;text-align:right;background:var(--k-bg)!important;
  border-radius:4px!important;border-bottom:1px solid var(--k-text)!important;color:var(--k-text);font-family:var(--k-mono);font-size:calc(var(--k-font-size) - 0.5px);appearance:textfield}
.knobs-number::-webkit-inner-spin-button,.knobs-number::-webkit-outer-spin-button{appearance:none}
.knobs-number:focus-visible{outline:none}

/* Segmented choice */
.knobs-seg{position:relative;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px;padding:2px;max-width:72%;background:var(--k-seg-bg);border-radius:calc(var(--k-radius) - 2px)}
.knobs-seg button{padding:3px 8px;font-size:calc(var(--k-font-size) - 0.5px);white-space:nowrap;color:var(--k-label);background:transparent;cursor:pointer;border-radius:calc(var(--k-radius) - 3px);transition:background .15s,color .15s}
.knobs-seg button:hover{color:var(--k-text)}
.knobs-seg button[aria-checked=true]{background:var(--k-seg-active);color:var(--k-text);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.12)}

/* Switch */
.knobs-toggle{position:relative;flex:none;width:32px;height:18px;padding:0;background:var(--k-toggle-track);border-radius:999px;cursor:pointer;transition:background .2s}
.knobs-toggle[aria-checked=true]{background:var(--k-accent)}
.knobs-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .22s var(--k-ease),background .2s}
.knobs-toggle[aria-checked=true] i{transform:translateX(14px);background:var(--k-bg)}

/* Hint mode: minimal unique prefix badges with dimmed typed prefix */
.knobs-hinting .knobs-hint-miss{opacity:.32}
.knobs-hint{position:absolute;left:var(--k-inset);top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;padding:1px 5px;border-radius:4px;background:var(--k-accent);color:var(--k-bg);
  font:700 calc(var(--k-font-size) - 1.5px)/1.35 var(--k-mono);letter-spacing:.04em;text-transform:uppercase;pointer-events:none;z-index:2;animation:knobs-in .12s var(--k-ease)}
.knobs-hint-typed{opacity:.42}
.knobs-hint-rest{opacity:1}
.knobs-hinting .knobs-label,.knobs-hinting .knobs-row>span:first-child{padding-left:2.6em;transition:padding .12s var(--k-ease)}

/* Primary Actions & Custom Actions */
.knobs-panel .knobs-actions,.knobs-panel .knobs-custom-actions{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:var(--k-gap);margin-top:6px}
.knobs-panel .knobs-custom-actions{grid-auto-flow:row;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));margin-top:var(--k-gap)}
.knobs-panel .knobs-actions button,.knobs-panel .knobs-custom-actions button{height:calc(var(--k-row) - 4px);min-height:24px;padding:0 8px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--k-label);cursor:pointer;transition:background .15s,color .15s,transform .12s}
.knobs-panel .knobs-actions button:hover:not([disabled]),.knobs-panel .knobs-custom-actions button:hover:not([disabled]){background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel .knobs-actions button[aria-expanded="true"]{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel .knobs-actions button:active:not([disabled]),.knobs-panel .knobs-custom-actions button:active:not([disabled]){transform:scale(.97)}
.knobs-panel .knobs-actions button[disabled]{opacity:.35;cursor:default}

/* Variants Disclosure Drawer */
.knobs-variants-drawer{margin-top:6px;padding-top:6px;border-top:1px solid var(--k-line);display:grid;gap:var(--k-gap)}
.knobs-variant-form{display:grid;grid-template-columns:1fr auto;gap:var(--k-gap)}
.knobs-panel .knobs-name{display:block;width:100%;height:calc(var(--k-row) - 4px);min-height:24px;padding:0 var(--k-inset);font-size:calc(var(--k-font-size) - 0.5px);transition:background .15s}
.knobs-panel .knobs-name::placeholder{color:var(--k-dim)}
.knobs-panel .knobs-name:hover{background:var(--k-surface-hi)}
.knobs-variant-form button{height:calc(var(--k-row) - 4px);min-height:24px;padding:0 10px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:500;color:var(--k-label);cursor:pointer;transition:background .15s,color .15s}
.knobs-variant-form button:hover{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-saved-list{display:grid;gap:var(--k-gap)}
.knobs-saved-list:empty{display:none}
.knobs-panel .knobs-saved{display:grid;grid-template-columns:1fr auto auto auto;gap:2px;align-items:center;min-height:calc(var(--k-row) - 4px);padding:2px 4px 2px var(--k-inset);background:var(--k-surface);border-radius:var(--k-radius)}
.knobs-panel .knobs-saved span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--k-label);font-size:calc(var(--k-font-size) - 0.5px)}
.knobs-panel .knobs-saved button{height:22px;padding:0 6px;font-size:calc(var(--k-font-size) - 1.5px);color:var(--k-label);background:transparent;cursor:pointer;border-radius:4px;transition:background .15s,color .15s}
.knobs-panel .knobs-saved button:hover{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-transfer{display:grid;grid-template-columns:1fr 1fr;gap:var(--k-gap)}
.knobs-transfer button{height:24px;padding:0 8px;font-size:calc(var(--k-font-size) - 1px);color:var(--k-label);cursor:pointer;transition:background .15s,color .15s}
.knobs-transfer button:hover{background:var(--k-surface-hi);color:var(--k-text)}

/* Status & Transfer Textarea */
.knobs-panel .knobs-status{margin:6px 0 0;padding:0 2px;color:var(--k-label);font-size:calc(var(--k-font-size) - 1px);overflow-wrap:anywhere}
.knobs-panel .knobs-status:empty{display:none;margin:0}
.knobs-panel textarea{width:100%;min-height:84px;margin-top:6px;padding:6px var(--k-inset);resize:vertical;font:calc(var(--k-font-size) - 1px)/1.4 var(--k-mono)}
.knobs-panel .knobs-apply-btn{width:100%;height:26px;margin-top:var(--k-gap);font-size:calc(var(--k-font-size) - 0.5px);font-weight:500;color:var(--k-text);background:var(--k-surface-hi);cursor:pointer}

/* WebGPU Overlay Active Mirror State:
   Semantic DOM stays interactive and measurable in place while GPU canvas paints visuals */
.knobs-panel[data-gpu-active="true"]{
  background:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
}
.knobs-panel[data-gpu-active="true"] :where(header strong,header button,.knobs-presets,.knobs-preset-chip,.knobs-preset-custom,.knobs-group-head,.knobs-group-head button,.knobs-row,.knobs-row>span:first-child,.knobs-slider,.knobs-label,.knobs-value,.knobs-unit,.knobs-seg,.knobs-seg button,.knobs-actions button,.knobs-custom-actions button){
  background:transparent!important;
  color:transparent!important;
  border-color:transparent!important;
  box-shadow:none!important;
  outline-color:transparent!important;
}
.knobs-panel[data-gpu-active="true"] :where(.knobs-presets-pill,.knobs-fill,.knobs-handle,.knobs-marks i,.knobs-toggle,.knobs-toggle i,.knobs-hint,.knobs-modified .knobs-label::after,.knobs-modified.knobs-row>span:first-child::after){
  opacity:0!important;
}
`
export function injectStyles(doc: Document) {
  const content = rolling + css
  const existing = doc.querySelector<HTMLStyleElement>("style[data-knobs-style]")
  if (existing) {
    if (existing.textContent !== content) existing.textContent = content
    return
  }
  const style = doc.createElement("style")
  style.dataset.knobsStyle = ""
  style.textContent = content
  doc.head.append(style)
}
