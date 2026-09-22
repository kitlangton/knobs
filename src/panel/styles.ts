const css = `
.knobs-panel,.knobs-chip{box-sizing:border-box;font:11px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;color:#eee;background:#161616;border:1px solid #555;border-radius:0;box-shadow:none;text-align:left;color-scheme:dark}
.knobs-chip{position:fixed;z-index:2147480000;padding:3px 7px;cursor:pointer}
.knobs-panel{position:fixed;z-index:2147480001;width:310px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:12px}
.knobs-panel *{box-sizing:border-box}
.knobs-panel [hidden],.knobs-chip[hidden]{display:none!important}
.knobs-panel button,.knobs-panel input,.knobs-panel select,.knobs-panel textarea{font:inherit;color:inherit;border:1px solid #555;border-radius:0;box-shadow:none;background:#222;min-width:0}
.knobs-panel button{padding:3px 7px;cursor:pointer}
.knobs-panel button:hover,.knobs-chip:hover{background:#393939}
.knobs-panel :focus-visible,.knobs-chip:focus-visible{outline:2px solid #e2c684;outline-offset:2px}
.knobs-panel header{display:flex;align-items:center;gap:8px;cursor:move;touch-action:none;padding-bottom:10px;border-bottom:1px solid #444}
.knobs-panel header strong{flex:1;overflow-wrap:anywhere;font-weight:500}
.knobs-panel select{max-width:100%;padding:3px}
.knobs-panel .knobs-picker{width:100%;margin:10px 0}
.knobs-panel .knobs-row{display:grid;grid-template-columns:1fr 64px auto;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid #333}
.knobs-panel .knobs-row>span:first-child{grid-column:1;overflow-wrap:anywhere}
.knobs-panel .knobs-row input[type=range]{grid-column:1/-1;width:100%;margin:0;accent-color:#e2c684}
.knobs-panel .knobs-row input[type=number]{width:64px;padding:2px 3px}
.knobs-panel .knobs-row select{grid-column:2/-1}
.knobs-panel .knobs-row input[type=checkbox]{justify-self:end;grid-column:2/-1;accent-color:#e2c684}
.knobs-panel .knobs-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}
.knobs-panel .knobs-name{display:block;width:100%;padding:5px;margin-top:12px}
.knobs-panel .knobs-saved{display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;padding-top:8px;border-top:1px solid #444}
.knobs-panel .knobs-saved span{width:100%;overflow-wrap:anywhere;color:#ccc}
.knobs-panel .knobs-status{margin:10px 0 0;color:#e2c684;overflow-wrap:anywhere;min-height:16px}
.knobs-panel textarea{width:100%;min-height:100px;margin-top:8px;padding:6px;resize:vertical}
.knobs-panel small{display:block;color:#aaa;margin-top:10px;font-size:10px}
`
export function injectStyles(doc: Document) {
  if (doc.querySelector("style[data-knobs-style]")) return
  const style = doc.createElement("style")
  style.dataset.knobsStyle = ""
  style.textContent = css
  doc.head.append(style)
}
