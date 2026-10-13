import rolling from "@kitlangton/rolling-number/styles.css" with { type: "text" }

const css = `
:where(:root,:host){
  --k-bg:#1c1c1e;--k-surface:rgba(255,255,255,.05);--k-surface-hi:rgba(255,255,255,.11);--k-line:rgba(255,255,255,.1);--k-line-hi:rgba(255,255,255,.18);
  --k-text:rgba(255,255,255,.92);--k-label:rgba(255,255,255,.62);--k-dim:rgba(255,255,255,.4);--k-accent:#fff;--k-modified:#ff9f0a;
  --k-seg-bg:rgba(0,0,0,.25);--k-seg-active:var(--k-surface-hi);--k-toggle-track:rgba(255,255,255,.14);--k-shadow:0 8px 32px rgba(0,0,0,.5);
  --k-radius:8px;--k-row:34px;--k-gap:5px;--k-width:280px;
  --k-font:system-ui,-apple-system,"SF Pro Text",sans-serif;
  --k-mono:ui-monospace,"Geist Mono",SFMono-Regular,Menlo,monospace;
  --k-ease:cubic-bezier(.2,.8,.2,1);
}
:where(.knobs-panel,.knobs-chip)[data-theme="light"],
:where([data-knobs-theme="light"]) :where(.knobs-panel,.knobs-chip):not([data-theme="dark"]),
:where(:root[data-theme="light"]) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{
  --k-bg:#f5f5f7;--k-surface:rgba(0,0,0,.05);--k-surface-hi:rgba(0,0,0,.095);--k-line:rgba(0,0,0,.1);--k-line-hi:rgba(0,0,0,.2);
  --k-text:rgba(0,0,0,.88);--k-label:rgba(60,60,67,.66);--k-dim:rgba(60,60,67,.42);--k-accent:#1c1c1e;--k-modified:#d97706;
  --k-seg-bg:rgba(0,0,0,.065);--k-seg-active:#fff;--k-toggle-track:rgba(0,0,0,.14);--k-shadow:0 8px 30px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
  color-scheme:light;
}
@media(prefers-color-scheme:light){
  :where(:root:not([data-theme="dark"])) :where(.knobs-panel,.knobs-chip)[data-theme="auto"]{
    --k-bg:#f5f5f7;--k-surface:rgba(0,0,0,.05);--k-surface-hi:rgba(0,0,0,.095);--k-line:rgba(0,0,0,.1);--k-line-hi:rgba(0,0,0,.2);
    --k-text:rgba(0,0,0,.88);--k-label:rgba(60,60,67,.66);--k-dim:rgba(60,60,67,.42);--k-accent:#1c1c1e;--k-modified:#d97706;
    --k-seg-bg:rgba(0,0,0,.065);--k-seg-active:#fff;--k-toggle-track:rgba(0,0,0,.14);--k-shadow:0 8px 30px rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08);
    color-scheme:light;
  }
}
:where(.knobs-panel)[data-density="compact"]{--k-row:28px;--k-gap:4px;--k-radius:6px;font-size:11.5px}
:where(.knobs-panel)[data-density="comfortable"]{--k-row:40px;--k-gap:6px;--k-radius:10px;font-size:13.5px}

.knobs-panel,.knobs-chip{
  box-sizing:border-box;font:12.5px/1.4 var(--k-font);color:var(--k-text);text-align:left;color-scheme:dark;
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

.knobs-panel{position:fixed;z-index:2147480001;width:var(--k-width);max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:10px 12px 12px;
  background:var(--k-bg);border:1px solid var(--k-line);border-radius:14px;box-shadow:var(--k-shadow);scrollbar-width:thin;
  animation:knobs-in .22s var(--k-ease);}
.knobs-panel.knobs-inline{position:relative;z-index:auto;left:auto!important;top:auto!important;max-width:100%;max-height:none;box-shadow:none;animation:none}
@keyframes knobs-in{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.knobs-panel{animation:none}.knobs-panel *{transition:none!important}}

.knobs-panel button,.knobs-panel input,.knobs-panel select,.knobs-panel textarea{font:inherit;color:inherit;background:var(--k-surface);border:0;border-radius:var(--k-radius);min-width:0}
.knobs-panel :focus-visible{outline:2px solid var(--k-accent);outline-offset:-2px}
.knobs-panel header button:focus-visible,.knobs-toggle:focus-visible{outline-offset:2px}

.knobs-panel header{display:flex;align-items:center;gap:8px;cursor:grab;touch-action:none;padding:2px 0 8px}
.knobs-panel.knobs-inline header{cursor:default}
.knobs-panel header:active{cursor:grabbing}
.knobs-panel.knobs-inline header:active{cursor:default}
.knobs-panel header strong{flex:1;font-weight:600;font-size:14px;overflow-wrap:anywhere}
.knobs-panel header button{width:26px;height:26px;padding:0;color:var(--k-label);background:transparent;border-radius:999px;cursor:pointer;transition:background .15s,color .15s}
.knobs-panel header button:hover{background:var(--k-surface-hi);color:var(--k-text)}

.knobs-panel select{width:100%;height:var(--k-row);padding:0 28px 0 10px;cursor:pointer;appearance:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23999' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 11px center;transition:background-color .15s}
.knobs-panel select:hover{background-color:var(--k-surface-hi)}
.knobs-panel .knobs-picker{margin:0 0 var(--k-gap)}

/* Group headers */
.knobs-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 2px 4px;color:var(--k-dim);font-size:10.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.knobs-group-head:first-child{margin-top:2px}
.knobs-group-head button{height:20px;padding:0 6px;font-size:10px;font-weight:500;letter-spacing:.02em;text-transform:none;color:var(--k-label);background:transparent;border-radius:4px;cursor:pointer}
.knobs-group-head button:hover{background:var(--k-surface-hi);color:var(--k-text)}

/* Rows */
.knobs-panel .knobs-row,.knobs-panel .knobs-slider{position:relative;min-height:var(--k-row);margin-bottom:var(--k-gap);border-radius:var(--k-radius);background:var(--k-surface);transition:background .15s}
.knobs-panel .knobs-slider{height:var(--k-row)}
.knobs-panel .knobs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 10px}
.knobs-panel .knobs-row:has(:focus-visible){background:var(--k-surface-hi)}
.knobs-panel .knobs-row>span:first-child{color:var(--k-label);font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.knobs-modified .knobs-label::after,.knobs-modified.knobs-row>span:first-child::after{content:"";display:inline-block;width:4px;height:4px;margin-left:5px;border-radius:50%;background:var(--k-modified);vertical-align:middle;opacity:.9}

/* Slider: the row is the track */
.knobs-track{position:absolute;inset:0;border-radius:var(--k-radius);overflow:hidden;cursor:ew-resize;user-select:none;touch-action:none}
.knobs-marks{position:absolute;inset:0;pointer-events:none}
.knobs-marks i{position:absolute;top:50%;width:1px;height:8px;border-radius:999px;transform:translate(-50%,-50%);background:rgba(255,255,255,0);transition:background .2s}
.knobs-fill{position:absolute;top:0;bottom:0;left:0;background:var(--k-surface-hi);pointer-events:none;transition:background .15s}
.knobs-animate .knobs-fill,.knobs-animate .knobs-handle{transition:width .32s var(--k-ease),left .32s var(--k-ease),background .15s,opacity .15s,transform .25s var(--k-ease)}
.knobs-handle{position:absolute;top:50%;width:3px;height:calc(var(--k-row) - 14px);margin-left:-1.5px;border-radius:999px;background:var(--k-accent);pointer-events:none;
  opacity:0;transform:translateY(-50%) scaleX(.25);transition:opacity .15s,transform .25s var(--k-ease)}
.knobs-slider:hover .knobs-handle,.knobs-track:focus-visible~.knobs-handle,.knobs-track:focus-visible .knobs-handle{opacity:.5;transform:translateY(-50%) scaleX(1)}
.knobs-active .knobs-handle{opacity:.9;transform:translateY(-50%) scaleX(1)}
.knobs-slider:hover .knobs-handle.knobs-dodge,.knobs-active .knobs-handle.knobs-dodge{opacity:.12;transform:translateY(-50%) scaleX(1) scaleY(.75)}
.knobs-slider:hover .knobs-marks i,.knobs-active .knobs-marks i{background:var(--k-line-hi)}
.knobs-active .knobs-fill{background:var(--k-line-hi)}
.knobs-slider:hover,.knobs-active{background:var(--k-surface)}
.knobs-release{transition:transform .35s cubic-bezier(.2,1.4,.4,1)}
.knobs-digits{display:inline-block;line-height:1.35;--rn-edge-fade:0px}
.knobs-unit{color:var(--k-dim)}
.knobs-label{position:absolute;left:10px;top:50%;transform:translateY(-50%);max-width:calc(100% - 92px);overflow:hidden;text-overflow:ellipsis;color:var(--k-label);font-weight:500;pointer-events:none;white-space:nowrap}
.knobs-value{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:baseline;justify-content:flex-end;gap:.3em;padding:4px 2px 4px 8px;background:transparent!important;border-radius:0!important;line-height:1.35;overflow:visible;white-space:nowrap;
  color:var(--k-label);font-family:var(--k-mono);font-variant-numeric:tabular-nums;font-size:12px;
  border-bottom:1px solid transparent;cursor:text;transition:color .15s,border-color .15s .5s}
.knobs-value:hover{border-bottom-color:var(--k-label)}
.knobs-active .knobs-value,.knobs-track:focus-visible .knobs-value{color:var(--k-text)}
.knobs-number{position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:2;width:6.5ch;padding:1px 4px;text-align:right;background:var(--k-bg)!important;
  border-radius:4px!important;border-bottom:1px solid var(--k-text)!important;color:var(--k-text);font-family:var(--k-mono);font-size:12px;appearance:textfield}
.knobs-number::-webkit-inner-spin-button,.knobs-number::-webkit-outer-spin-button{appearance:none}
.knobs-number:focus-visible{outline:none}

/* Segmented choice */
.knobs-seg{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px;padding:2px;max-width:72%;background:var(--k-seg-bg);border-radius:calc(var(--k-radius) - 2px)}
.knobs-seg button{padding:3px 9px;font-size:11.5px;white-space:nowrap;color:var(--k-label);background:transparent;cursor:pointer;border-radius:calc(var(--k-radius) - 3px);transition:background .15s,color .15s}
.knobs-seg button:hover{color:var(--k-text)}
.knobs-seg button[aria-checked=true]{background:var(--k-seg-active);color:var(--k-text);box-shadow:0 1px 2px rgba(0,0,0,.12)}

/* Switch */
.knobs-toggle{position:relative;flex:none;width:34px;height:20px;padding:0;background:var(--k-toggle-track);border-radius:999px;cursor:pointer;transition:background .2s}
.knobs-toggle[aria-checked=true]{background:var(--k-accent)}
.knobs-toggle i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .22s var(--k-ease),background .2s}
.knobs-toggle[aria-checked=true] i{transform:translateX(14px);background:var(--k-bg)}

/* Hint mode */
.knobs-hinting .knobs-hint-miss{opacity:.35}
.knobs-hint{position:absolute;left:8px;top:50%;transform:translateY(-50%);padding:1px 5px;border-radius:4px;background:var(--k-accent);color:var(--k-bg);
  font:600 10.5px/1.4 var(--k-mono);letter-spacing:.04em;text-transform:uppercase;pointer-events:none;z-index:1;animation:knobs-in .12s var(--k-ease)}
.knobs-hinting .knobs-label,.knobs-hinting .knobs-row>span:first-child{padding-left:2.6em;transition:padding .12s var(--k-ease)}
.knobs-panel .knobs-actions button[disabled]{opacity:.35;cursor:default}

/* Actions */
.knobs-panel .knobs-actions,.knobs-panel .knobs-custom-actions{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:var(--k-gap);margin-top:8px}
.knobs-panel .knobs-custom-actions{grid-auto-flow:row;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))}
.knobs-panel .knobs-actions button,.knobs-panel .knobs-custom-actions button{height:30px;padding:0 8px;font-size:11.5px;font-weight:500;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--k-label);cursor:pointer;transition:background .15s,color .15s,transform .12s}
.knobs-panel .knobs-actions button:hover,.knobs-panel .knobs-custom-actions button:hover{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel .knobs-actions button:active,.knobs-panel .knobs-custom-actions button:active{transform:scale(.97)}
.knobs-panel .knobs-name{display:block;width:100%;height:var(--k-row);padding:0 10px;margin-top:10px;transition:background .15s}
.knobs-panel .knobs-name::placeholder{color:var(--k-dim)}
.knobs-panel .knobs-name:hover{background:var(--k-surface-hi)}
.knobs-panel .knobs-saved{display:grid;grid-template-columns:1fr auto auto auto;gap:4px;align-items:center;margin-top:var(--k-gap);padding:4px 4px 4px 10px;background:var(--k-surface);border-radius:var(--k-radius)}
.knobs-panel .knobs-saved span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--k-label);font-size:12px}
.knobs-panel .knobs-saved button{height:24px;padding:0 7px;font-size:10.5px;color:var(--k-label);background:transparent;cursor:pointer;transition:background .15s,color .15s}
.knobs-panel .knobs-saved button:hover{background:var(--k-surface-hi);color:var(--k-text)}
.knobs-panel .knobs-status{margin:8px 0 0;min-height:16px;color:var(--k-label);font-size:11.5px;overflow-wrap:anywhere}
.knobs-panel textarea{width:100%;min-height:100px;margin-top:8px;padding:8px 10px;resize:vertical;font-size:11.5px}
.knobs-panel small{display:block;margin-top:8px;color:var(--k-dim);font-size:10.5px}
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
