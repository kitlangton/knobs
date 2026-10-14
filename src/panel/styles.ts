import rolling from "@kitlangton/rolling-number/styles.css" with { type: "text" }

const lightVars = `
  --k-bg:#f5f5f7;--k-surface:rgba(0,0,0,.05);--k-surface-hi:rgba(0,0,0,.095);--k-line:rgba(0,0,0,.1);--k-line-hi:rgba(0,0,0,.2);
  --k-text:rgba(0,0,0,.88);--k-label:rgba(60,60,67,.68);--k-dim:rgba(60,60,67,.44);--k-accent:#1c1c1e;--k-modified:rgba(0,0,0,.42);
  --k-seg-bg:rgba(0,0,0,.065);--k-seg-active:#fff;--k-toggle-track:rgba(0,0,0,.14);--k-shadow:0 10px 32px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
  color-scheme:light;`

const css = `
@property --k-fill{syntax:"<percentage>";inherits:false;initial-value:0%}
@property --k-fill-mix{syntax:"<percentage>";inherits:false;initial-value:20%}
@property --k-readout{syntax:"<length>";inherits:true;initial-value:0px}
:where(:root,:host){
  --k-bg:#1c1c1e;--k-surface:rgba(255,255,255,.055);--k-surface-hi:rgba(255,255,255,.11);--k-line:rgba(255,255,255,.1);--k-line-hi:rgba(255,255,255,.18);
  --k-text:rgba(255,255,255,.92);--k-label:rgba(255,255,255,.64);--k-dim:rgba(255,255,255,.42);--k-accent:#fff;--k-modified:rgba(255,255,255,.5);
  --k-seg-bg:rgba(0,0,0,.26);--k-seg-active:var(--k-surface-hi);--k-toggle-track:rgba(255,255,255,.14);--k-shadow:0 12px 36px rgba(0,0,0,.52),0 1px 2px rgba(0,0,0,.3);
  --k-width:288px;--k-pad:10px;--k-inset:10px;--k-row:32px;--k-gap:4px;--k-radius:8px;--k-panel-radius:12px;
  --k-font-size:12px;--k-label-weight:500;--k-blur:1;--k-glow:0.5;--k-roll:420;--k-drag-roll:0;
  --k-font:system-ui,-apple-system,"SF Pro Text",sans-serif;
  --k-mono:"SF Mono",SFMono-Regular,ui-monospace,Menlo,monospace;
  --k-ease:cubic-bezier(.2,.8,.2,1);
}
:where(.knobs-panel,.knobs-chip)[data-theme="light"],
:where([data-knobs-theme="light"]) :where(.knobs-panel,.knobs-chip):not([data-theme="dark"]),
:where(:root[data-theme="light"]) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{${lightVars}}
@media(prefers-color-scheme:light){
  :where(:root:not([data-theme="dark"])) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{${lightVars}}
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
.knobs-chip[data-shown="true"]{transition:color .15s,border-color .15s,opacity .16s var(--k-ease),transform .22s var(--k-ease),visibility 0s}
.knobs-chip[data-shown="false"]{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-2px) scale(.94);transition:opacity .12s ease-in,transform .12s ease-in,visibility 0s .12s}
.knobs-chip:focus-visible{outline:2px solid var(--k-accent);outline-offset:2px}

.knobs-panel{transition:background-color .25s,border-color .25s,color .25s;position:fixed;z-index:2147480001;width:var(--k-width);max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:var(--k-pad);
  background:var(--k-bg);border:1px solid var(--k-line);border-radius:var(--k-panel-radius);box-shadow:var(--k-shadow);scrollbar-width:thin;
  animation:knobs-in .2s var(--k-ease);}
.knobs-panel.knobs-inline{position:relative;z-index:auto;left:auto!important;top:auto!important;max-width:100%;max-height:none;box-shadow:none;animation:none}
@keyframes knobs-in{from{opacity:0;transform:translateY(4px) scale(.985)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.knobs-panel{animation:none}.knobs-panel *{transition:none!important}}

:where(.knobs-panel) :where(button,input,select,textarea){font:inherit;color:inherit;background:var(--k-surface);border:0;border-radius:var(--k-radius);min-width:0}
.knobs-panel :focus-visible{outline:1.5px solid var(--k-accent);outline-offset:-1.5px;box-shadow:0 0 calc(var(--k-glow) * 12px) color-mix(in srgb,var(--k-accent) 36%,transparent)}
.knobs-panel header button:focus-visible,.knobs-toggle:focus-visible{outline-offset:2px}

/* Header */
.knobs-panel header{display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:grab;touch-action:none;padding:0 2px 8px;min-height:24px}
.knobs-panel.knobs-inline header,.knobs-panel.knobs-inline header:active{cursor:default}
.knobs-panel header:active{cursor:grabbing}
.knobs-panel header strong{flex:1;min-width:0;font-weight:600;font-size:calc(var(--k-font-size) + 1px);letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.knobs-head-actions{display:flex;align-items:center}
.knobs-head-split{margin-left:6px}
.knobs-icon{width:15px;height:15px;display:block;flex:none}
.knobs-panel header button{width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:var(--k-label);background:transparent;border-radius:999px;cursor:pointer;font-size:12px;line-height:1;transition:background .15s,color .15s,opacity .15s}
.knobs-panel header button:hover:not([disabled]),.knobs-panel header button[aria-expanded="true"]{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel header button[disabled]{opacity:.3;cursor:default}

/* Shortcuts Popover */
.knobs-popover{margin:0 0 8px;padding:8px var(--k-inset);background:var(--k-surface-hi);border:1px solid var(--k-line);border-radius:var(--k-radius);font-size:calc(var(--k-font-size) - 1px)}
.knobs-popover-grid{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:baseline}
.knobs-popover-grid kbd{font-family:var(--k-mono);font-size:calc(var(--k-font-size) - 1.5px);color:var(--k-text);background:var(--k-seg-bg);padding:1px 5px;border-radius:4px;justify-self:start;white-space:nowrap}
.knobs-popover-grid span{color:var(--k-label)}

/* Custom Preset Strip */
.knobs-presets{position:relative;display:flex;align-items:flex-start;gap:2px;margin:0 0 calc(var(--k-gap) * 2);padding:2px;background:var(--k-seg-bg);border-radius:var(--k-radius);user-select:none;touch-action:none}
.knobs-presets-track{position:relative;flex:1;min-width:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--k-preset-min,58px)),1fr));align-items:stretch;gap:2px}
.knobs-presets-pill{position:absolute;top:0;left:0;background:color-mix(in srgb,var(--k-accent) 18%,var(--k-seg-active));border:1px solid color-mix(in srgb,var(--k-accent) 32%,transparent);border-radius:calc(var(--k-radius) - 2px);box-shadow:0 1px 2px rgba(0,0,0,.16),0 0 calc(var(--k-glow) * 10px) color-mix(in srgb,var(--k-accent) 24%,transparent);pointer-events:none;transition:transform calc(.22s * clamp(var(--k-blur),.1,2)) cubic-bezier(.22,1.1,.36,1),width calc(.22s * clamp(var(--k-blur),.1,2)) cubic-bezier(.22,1.1,.36,1),opacity .15s}
.knobs-preset-chip{position:relative;z-index:1;height:calc(var(--k-row) - 8px);min-height:20px;padding:0 6px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:var(--k-label-weight);color:var(--k-label);background:transparent!important;border-radius:calc(var(--k-radius) - 2px);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .15s}
.knobs-preset-chip:hover{color:var(--k-text)}
.knobs-preset-chip[aria-checked="true"]{color:var(--k-text);font-weight:600}
.knobs-preset-save{flex:none;width:calc(var(--k-row) - 8px);padding:0!important;color:var(--k-dim)!important;font-weight:400!important;font-size:calc(var(--k-font-size) + 2px)!important}
.knobs-preset-save:hover{color:var(--k-text)!important}

/* Group headers */
.knobs-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;margin:calc(var(--k-gap) * 2 + 4px) 0 4px;padding:0 2px 0 var(--k-inset);color:var(--k-dim);font-size:calc(var(--k-font-size) - 2px);font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.knobs-group-head:first-child{margin-top:2px}
.knobs-group-head>span:last-child{display:flex;align-items:center;gap:4px}
.knobs-group-head button{height:20px;padding:0 6px;font-size:calc(var(--k-font-size) - 1.5px);font-weight:500;letter-spacing:0;text-transform:none;color:var(--k-label);background:transparent;border-radius:4px;cursor:pointer}
.knobs-group-head button:hover:not([disabled]){background:var(--k-surface-hi);color:var(--k-text)}
.knobs-group-head .knobs-group-reset{width:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;
  transition:opacity .18s var(--k-ease),transform .3s cubic-bezier(.34,1.45,.64,1),background .15s,color .15s,visibility 0s}
.knobs-group-reset .knobs-icon{width:13px;height:13px}
.knobs-group-reset[data-shown="false"]{opacity:0;visibility:hidden;transform:scale(.55);transition:opacity .14s ease-in,transform .14s ease-in,visibility 0s .14s}
.knobs-panel :where(header button,.knobs-group-head button){transition:background .15s,color .15s,opacity .2s,transform .12s}

/* Grouped cards: rows share one surface, split by hairlines */
.knobs-card{position:relative;margin-bottom:calc(var(--k-gap) * 2);border-radius:var(--k-radius);background:var(--k-surface);overflow:hidden}
.knobs-card:last-child{margin-bottom:0}
.knobs-card>*{position:relative;min-height:var(--k-row);transition:background .15s}
.knobs-card>:hover,.knobs-card>.knobs-active{background:color-mix(in srgb,var(--k-surface) 50%,transparent)}
.knobs-card>*+*::before{content:"";position:absolute;z-index:1;left:0;right:0;top:0;height:1px;transform:scaleY(.5);transform-origin:top;background:var(--k-line);pointer-events:none}
.knobs-card>::after{content:"";position:absolute;z-index:2;inset:0;border-radius:var(--k-radius);background:var(--k-surface);opacity:0;pointer-events:none;transition:opacity .15s,box-shadow .15s}
.knobs-card>:has(:focus-visible)::after{opacity:1}
.knobs-slider:has(.knobs-track:focus-visible)::after{box-shadow:inset 0 0 0 1.5px var(--k-accent),0 0 calc(var(--k-glow) * 12px) color-mix(in srgb,var(--k-accent) 36%,transparent)}
.knobs-panel .knobs-slider{height:var(--k-row)}
.knobs-panel .knobs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px var(--k-inset)}
.knobs-panel .knobs-row>span:first-child{color:var(--k-label);font-weight:var(--k-label-weight);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.knobs-row>span:first-child::after{content:"";display:inline-block;width:4px;height:4px;margin-left:5px;border-radius:50%;background:var(--k-modified);vertical-align:middle;opacity:0;transform:scale(.4);transition:opacity .16s ease-out,transform .28s cubic-bezier(.34,1.5,.64,1)}
.knobs-modified.knobs-row>span:first-child::after{opacity:.95;transform:none}

/* Slider: an accent-tinted fill with a brighter leading edge that fades under the readout */
.knobs-track{position:absolute;inset:0;overflow:hidden;cursor:ew-resize;user-select:none;touch-action:none;transition:--k-readout .25s var(--k-ease)}
.knobs-panel .knobs-track:focus-visible{outline:none;box-shadow:none}
.knobs-marks{position:absolute;inset:0;pointer-events:none}
.knobs-marks i{position:absolute;top:50%;width:1px;height:7px;border-radius:999px;transform:translate(-50%,-50%);background:rgba(255,255,255,0);transition:background .2s}
.knobs-fill{position:absolute;inset:0;pointer-events:none;--k-fill-tint:color-mix(in srgb,var(--k-accent) var(--k-fill-mix),var(--k-surface-hi));
  background:linear-gradient(to left,color-mix(in srgb,var(--k-accent) min(calc(var(--k-glow) * 20%),100%),transparent),transparent 24px) 0 0/var(--k-fill) 100% no-repeat,linear-gradient(var(--k-fill-tint),var(--k-fill-tint)) 0 0/var(--k-fill) 100% no-repeat;
  -webkit-mask:linear-gradient(to left,rgb(0 0 0/.4) calc(var(--k-inset) + var(--k-readout)),#000 calc(var(--k-inset) + var(--k-readout) + 16px));
  mask:linear-gradient(to left,rgb(0 0 0/.4) calc(var(--k-inset) + var(--k-readout)),#000 calc(var(--k-inset) + var(--k-readout) + 16px));transition:--k-fill-mix .15s}
.knobs-active .knobs-fill{--k-fill-mix:30%}
.knobs-animate .knobs-fill,.knobs-animate .knobs-handle{transition:--k-fill calc(.28s * clamp(var(--k-blur),.1,2)) var(--k-ease),--k-fill-mix .15s,left calc(.28s * clamp(var(--k-blur),.1,2)) var(--k-ease),opacity .15s,transform .22s var(--k-ease)}
.knobs-settle .knobs-fill,.knobs-settle .knobs-handle{transition:--k-fill .18s cubic-bezier(.3,1.35,.5,1),--k-fill-mix .15s,left .18s cubic-bezier(.3,1.35,.5,1),opacity .15s,transform .22s var(--k-ease)}
.knobs-notch{position:absolute;bottom:0;width:1px;height:5px;margin-left:-.5px;border-radius:1px 1px 0 0;background:var(--k-text);opacity:.2;pointer-events:none;transition:opacity .2s}
.knobs-modified .knobs-notch{opacity:.5}
.knobs-magnet .knobs-notch{opacity:.9}
.knobs-handle{position:absolute;top:50%;width:3px;height:calc(var(--k-row) - 12px);margin-left:-1.5px;border-radius:999px;background:var(--k-accent);box-shadow:0 0 calc(var(--k-glow) * 8px) color-mix(in srgb,var(--k-accent) 60%,transparent);pointer-events:none;
  opacity:0;transform:translateY(-50%) scaleX(.25);transition:opacity .15s,transform .22s var(--k-ease)}
.knobs-slider:hover .knobs-handle,.knobs-track:focus-visible~.knobs-handle,.knobs-track:focus-visible .knobs-handle{opacity:.65;transform:translateY(-50%) scaleX(1)}
.knobs-active .knobs-handle{opacity:.95;transform:translateY(-50%) scaleX(1)}
.knobs-slider:hover .knobs-handle.knobs-dodge,.knobs-active .knobs-handle.knobs-dodge{opacity:.18;transform:translateY(-50%) scaleX(1) scaleY(.75)}
.knobs-slider:hover .knobs-marks i,.knobs-active .knobs-marks i{background:var(--k-line-hi)}
.knobs-release{transition:transform .32s cubic-bezier(.2,1.2,.4,1)}
.knobs-digits{display:inline-block;line-height:2.1;margin-block:-.375em;--rn-edge-fade:.5em}
.knobs-unit{color:var(--k-dim)}
.knobs-label{position:absolute;left:var(--k-inset);top:50%;transform:translateY(-50%);max-width:calc(100% - 92px);overflow:hidden;text-overflow:ellipsis;color:var(--k-label);font-weight:var(--k-label-weight);pointer-events:none;white-space:nowrap}
.knobs-value{position:absolute;right:var(--k-inset);top:50%;transform:translateY(-50%);display:inline-flex;align-items:baseline;justify-content:flex-end;gap:.28em;padding:4px 0 4px 8px;background:transparent!important;border-radius:0!important;line-height:1.35;overflow:visible;white-space:nowrap;
  color:var(--k-label);font-family:var(--k-font);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";font-size:calc(var(--k-font-size) - 0.5px);
  border-bottom:1px solid transparent;cursor:text;transition:color .15s,border-color .15s .4s}
.knobs-value:hover{border-bottom-color:var(--k-label)}
.knobs-active .knobs-value,.knobs-track:focus-visible .knobs-value{color:var(--k-text)}
.knobs-number{position:absolute;right:var(--k-inset);top:50%;transform:translateY(-50%);z-index:2;width:6.5ch;padding:1px 4px;text-align:right;background:var(--k-bg)!important;
  border-radius:4px!important;border-bottom:1px solid var(--k-text)!important;color:var(--k-text);font-family:var(--k-font);font-variant-numeric:tabular-nums;font-size:calc(var(--k-font-size) - 0.5px);appearance:textfield}
.knobs-number::-webkit-inner-spin-button,.knobs-number::-webkit-outer-spin-button{appearance:none}
.knobs-number:focus-visible{outline:none;box-shadow:none}

/* Segmented choice */
.knobs-seg{position:relative;display:flex;flex-wrap:nowrap;justify-content:flex-end;gap:2px;padding:2px;max-width:76%;background:var(--k-seg-bg);border-radius:calc(var(--k-radius) - 2px)}
.knobs-seg-pill{position:absolute;top:2px;bottom:2px;left:0;width:0;border-radius:calc(var(--k-radius) - 3px);background:color-mix(in srgb,var(--k-accent) 18%,var(--k-seg-active));box-shadow:0 1px 2px rgba(0,0,0,.12);pointer-events:none;
  transition:transform calc(.26s * clamp(var(--k-blur),.1,2)) cubic-bezier(.3,1.15,.4,1),width calc(.26s * clamp(var(--k-blur),.1,2)) cubic-bezier(.3,1.15,.4,1)}
.knobs-seg button{position:relative;z-index:1;padding:3px 7px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:var(--k-label-weight);white-space:nowrap;color:var(--k-label);background:transparent;cursor:pointer;border-radius:calc(var(--k-radius) - 3px);transition:background .15s,color .15s}
.knobs-seg button:hover{color:var(--k-text)}
.knobs-seg button[aria-checked=true]{color:var(--k-text)}

/* Switch */
.knobs-toggle{position:relative;flex:none;width:32px;height:18px;padding:0;background:var(--k-toggle-track);border-radius:999px;cursor:pointer;transition:background .2s,box-shadow .2s}
.knobs-toggle[aria-checked=true]{background:var(--k-accent);box-shadow:0 0 calc(var(--k-glow) * 10px) color-mix(in srgb,var(--k-accent) 42%,transparent)}
.knobs-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform calc(.2s * clamp(var(--k-blur),.1,2)) var(--k-ease),background .2s}
.knobs-toggle[aria-checked=true] i{transform:translateX(14px);background:var(--k-bg)}

/* Hint mode: stable short codes, zero layout shift */
.knobs-hinting .knobs-hint-miss{opacity:.32;transition:opacity .1s}
.knobs-hint-layer{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:5;animation:knobs-in .1s var(--k-ease)}
.knobs-hint{position:absolute;transform:translateY(-50%);display:inline-flex;align-items:center;height:15px;padding:0 4px;border-radius:4px;background:var(--k-accent);color:var(--k-bg);box-shadow:0 1px 3px rgba(0,0,0,.35);
  font:700 calc(var(--k-font-size) - 2.5px)/1 var(--k-mono);letter-spacing:.04em;text-transform:uppercase;pointer-events:none}
.knobs-hint-typed{opacity:.42}
.knobs-hint-rest{opacity:1}

/* Custom actions */
.knobs-panel .knobs-custom-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:var(--k-gap);margin-top:calc(var(--k-gap) * 2)}
.knobs-panel .knobs-custom-actions button{height:calc(var(--k-row) - 4px);min-height:24px;padding:0 8px;font-size:calc(var(--k-font-size) - 0.5px);font-weight:var(--k-label-weight);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--k-label);cursor:pointer;transition:background .15s,color .15s,transform .12s}
.knobs-panel .knobs-custom-actions button:hover:not([disabled]){background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel .knobs-custom-actions button:active:not([disabled]){transform:scale(.97)}

/* Variants Disclosure Drawer */
.knobs-transfer{display:grid;grid-template-columns:1fr 1fr;gap:var(--k-gap);margin-top:8px;padding-top:8px;border-top:1px solid var(--k-line)}
.knobs-transfer button{height:24px;padding:0 8px;background:var(--k-surface);font-size:calc(var(--k-font-size) - 1px);color:var(--k-label);cursor:pointer;transition:background .15s,color .15s}
.knobs-transfer button:hover{background:var(--k-surface-hi);color:var(--k-text)}

/* Status & Transfer Textarea */
.knobs-panel .knobs-status{margin:6px 0 0;padding:0 2px;color:var(--k-label);font-size:calc(var(--k-font-size) - 1px);overflow-wrap:anywhere}

.knobs-panel textarea{width:100%;min-height:84px;margin-top:6px;padding:6px var(--k-inset);resize:vertical;font:calc(var(--k-font-size) - 1px)/1.4 var(--k-mono)}
.knobs-panel .knobs-apply-btn{width:100%;height:26px;margin-top:var(--k-gap);font-size:calc(var(--k-font-size) - 0.5px);font-weight:500;color:var(--k-text);background:var(--k-surface-hi);cursor:pointer}

/* WebGPU Overlay Active Mirror State */
.knobs-panel[data-gpu-active="true"]{background:transparent!important;border-color:transparent!important;box-shadow:none!important}
.knobs-panel[data-gpu-active="true"],.knobs-panel[data-gpu-active="true"] :where(*,:focus-visible){outline-color:transparent!important;box-shadow:none!important}
.knobs-panel[data-gpu-active="true"] :where(header strong,header button,.knobs-presets,.knobs-preset-chip,.knobs-group-head,.knobs-group-head button,.knobs-card,.knobs-row,.knobs-row>span:first-child,.knobs-slider,.knobs-track,.knobs-label,.knobs-value,.knobs-digits,.knobs-digits *,.knobs-unit,.knobs-seg,.knobs-seg button,.knobs-custom-actions button){
  background:transparent!important;color:transparent!important;border-color:transparent!important;box-shadow:none!important;
}
.knobs-panel[data-gpu-active="true"] :where(.knobs-seg-pill,.knobs-presets-pill,.knobs-fill,.knobs-notch,.knobs-handle,.knobs-marks i,.knobs-toggle,.knobs-toggle i,.knobs-hint,.knobs-icon),
.knobs-panel[data-gpu-active="true"] .knobs-card>::before,
.knobs-panel[data-gpu-active="true"] .knobs-card>::after,
.knobs-panel[data-gpu-active="true"] .knobs-row>span:first-child::after{opacity:0!important}
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
