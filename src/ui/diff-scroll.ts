// What the code diff adds to @pierre/diffs' own drawing: thin bars for its sideways scroll in
// place of the native ones inside its shadow root, its separators' corners taken from the card
// (concentric) and its line numbers on the card's inset, through the renderer's `unsafeCSS`.

let overrides: string | undefined

/**
 * The CSS to hand the renderer: its code columns' native scrollbars hidden (`codeBars` draws
 * thin ones), and every corner its stylesheet rounds by 6px rounded by `--kd-inner` instead, so
 * a hunk separator inset in the card is concentric with it. Read once from its stylesheet.
 */
export function rendererCss(coreCss: () => string): string {
  if (overrides !== undefined) return overrides
  let corners = ""
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(coreCss())
    corners = roundedBy6(sheet.cssRules)
  } catch {
    // No constructable sheets (or no CSS nesting): the separators keep their 6px.
  }
  // Line numbers start at the card's inset, under the header's path (past the change bars, 4px).
  const numbers = "[data-column-number]{padding-inline-start:max(8px,var(--kd-x,0px))}"
  overrides = `[data-code]{scrollbar-width:none}[data-code]::-webkit-scrollbar{display:none;width:0;height:0}${numbers}${corners}`
  return overrides
}

/** The rules (nesting, @media and @supports kept) that set a 6px corner, set to --kd-inner. */
function roundedBy6(list: CSSRuleList): string {
  let out = ""
  for (const rule of Array.from(list)) {
    const r = rule as CSSRule & {
      style?: CSSStyleDeclaration
      selectorText?: string
      cssRules?: CSSRuleList
      conditionText?: string
    }
    let decls = ""
    if (r.style)
      for (const p of Array.from(r.style))
        if (p.includes("radius") && r.style.getPropertyValue(p).trim() === "6px")
          decls += `${p}:var(--kd-inner,6px);`
    const kids = r.cssRules ? roundedBy6(r.cssRules) : ""
    if (!decls && !kids) continue
    if (r.selectorText !== undefined) out += `${r.selectorText}{${decls}${kids}}`
    else if (r.style) out += decls
    else if (typeof CSSMediaRule !== "undefined" && r instanceof CSSMediaRule)
      out += `@media ${r.conditionText}{${kids}}`
    else if (typeof CSSSupportsRule !== "undefined" && r instanceof CSSSupportsRule)
      out += `@supports ${r.conditionText}{${kids}}`
    else out += kids
  }
  return out
}

export interface CodeBars {
  /** Looks for the code columns again (after a render) and places their bars. */
  rescan(): void
  place(): void
  dispose(): void
}

/**
 * Thin bars for the code columns' sideways scroll (one per column; two when split), drawn in
 * `layer` (a positioned element inside the scroller) at the bottom of what shows of each
 * column, so the bar is in view however far down a long file you are. Hidden until the pointer
 * is over the diff, or while you scroll the code sideways or drag a bar, as `overlayScrollbar`'s.
 */
export function codeBars(
  scroller: HTMLElement,
  layer: HTMLElement,
  root: () => ShadowRoot | null | undefined,
): CodeBars {
  const doc = scroller.ownerDocument
  const win = doc.defaultView!
  interface Bar {
    code: HTMLElement
    track: HTMLElement
    thumb: HTMLElement
    size: number
    span: number
  }
  let bars: Bar[] = []
  let drag: { bar: Bar; x: number; left: number; pointer: number } | undefined
  let idle = 0

  const place = () => {
    if (!bars.length) return
    const s = scroller.getBoundingClientRect()
    const l = layer.getBoundingClientRect()
    for (const b of bars) {
      const c = b.code
      const over = c.scrollWidth - c.clientWidth
      const r = c.getBoundingClientRect()
      const gutter = c.querySelector<HTMLElement>("[data-gutter]")?.offsetWidth ?? 0
      const bottom = Math.min(r.bottom, s.bottom)
      const shown = over > 1 && bottom - Math.max(r.top, s.top) > 24
      b.track.hidden = !shown
      if (!shown) continue
      // The part that scrolls: the column less its line numbers, which stay put.
      const width = r.width - gutter
      b.span = width
      b.size = Math.max(
        24,
        (width * (c.clientWidth - gutter)) / Math.max(1, c.scrollWidth - gutter),
      )
      const x = (Math.min(over, Math.max(0, c.scrollLeft)) / over) * (width - b.size)
      b.track.style.left = `${(r.left + gutter - l.left).toFixed(1)}px`
      b.track.style.top = `${(bottom - l.top - 7).toFixed(1)}px`
      b.track.style.width = `${width.toFixed(1)}px`
      b.thumb.style.width = `${b.size.toFixed(1)}px`
      b.thumb.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
    }
  }
  const active = () => {
    for (const b of bars) b.track.dataset.active = ""
    win.clearTimeout(idle)
    idle = win.setTimeout(() => {
      for (const b of bars) delete b.track.dataset.active
    }, 800)
  }
  // A sideways scroll you made (a wheel, a touch, a key just before) shows the bars; one from
  // code doesn't.
  let input = Number.NEGATIVE_INFINITY
  const touched = () => {
    input = win.performance.now()
  }
  for (const type of ["wheel", "touchmove", "keydown"])
    scroller.addEventListener(type, touched, { passive: true })
  const onCode = () => {
    place()
    if (win.performance.now() - input < 600 || drag) active()
  }
  const ro = new ResizeObserver(place)
  const clear = () => {
    for (const b of bars) {
      b.code.removeEventListener("scroll", onCode)
      b.track.remove()
    }
    bars = []
    ro.disconnect()
  }
  const rescan = () => {
    const codes = [...(root()?.querySelectorAll<HTMLElement>("[data-code]") ?? [])]
    if (codes.length === bars.length && codes.every((c, i) => bars[i]!.code === c)) {
      place()
      return
    }
    clear()
    bars = codes.map((code) => {
      const track = doc.createElement("div")
      track.className = "knobs-diff-hbar"
      track.setAttribute("aria-hidden", "true")
      track.hidden = true
      const thumb = doc.createElement("i")
      track.append(thumb)
      layer.append(track)
      code.addEventListener("scroll", onCode, { passive: true })
      ro.observe(code)
      const bar: Bar = { code, track, thumb, size: 0, span: 0 }
      thumb.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        drag = { bar, x: e.clientX, left: code.scrollLeft, pointer: e.pointerId }
        thumb.setPointerCapture(e.pointerId)
        track.dataset.dragging = ""
      })
      thumb.addEventListener("pointermove", (e) => {
        if (!drag || drag.bar !== bar || e.pointerId !== drag.pointer) return
        const over = code.scrollWidth - code.clientWidth
        code.scrollLeft =
          drag.left + ((e.clientX - drag.x) * over) / Math.max(1, bar.span - bar.size)
      })
      const end = (e: PointerEvent) => {
        if (!drag || drag.bar !== bar || e.pointerId !== drag.pointer) return
        drag = undefined
        delete track.dataset.dragging
      }
      thumb.addEventListener("pointerup", end)
      thumb.addEventListener("pointercancel", end)
      thumb.addEventListener("lostpointercapture", end)
      return bar
    })
    // Its own size moves the bars too (a card switching between fill and auto).
    ro.observe(scroller)
    place()
  }
  scroller.addEventListener("scroll", place, { passive: true })
  // The renderer redraws its columns itself (a hunk expanded): look for them again.
  let mo: MutationObserver | undefined
  let watched: ShadowRoot | null | undefined
  let raf = 0
  const watch = () => {
    const r = root()
    if (r === watched) return
    mo?.disconnect()
    watched = r
    if (!r) return
    mo = new MutationObserver(() => {
      if (raf) return
      raf = win.requestAnimationFrame(() => {
        raf = 0
        rescan()
      })
    })
    mo.observe(r, { childList: true, subtree: true })
  }

  return {
    rescan() {
      watch()
      rescan()
    },
    place,
    dispose() {
      clear()
      mo?.disconnect()
      win.cancelAnimationFrame(raf)
      win.clearTimeout(idle)
      scroller.removeEventListener("scroll", place)
      for (const type of ["wheel", "touchmove", "keydown"])
        scroller.removeEventListener(type, touched)
    },
  }
}

export interface EdgeFades {
  update(): void
  dispose(): void
}

/**
 * Marks a scroller `data-fade-top` once it's scrolled and `data-fade-bottom` while there's more
 * below, for the CSS that fades its content out at that edge (a mask, its stops on registered
 * properties so they ease in and out).
 */
export function edgeFades(scroller: HTMLElement, content: Element): EdgeFades {
  const update = () => {
    const over = scroller.scrollHeight - scroller.clientHeight
    scroller.toggleAttribute("data-fade-top", scroller.scrollTop > 1)
    scroller.toggleAttribute("data-fade-bottom", scroller.scrollTop < over - 1)
  }
  scroller.addEventListener("scroll", update, { passive: true })
  const ro = new ResizeObserver(update)
  ro.observe(scroller)
  ro.observe(content)
  update()
  return {
    update,
    dispose() {
      ro.disconnect()
      scroller.removeEventListener("scroll", update)
    },
  }
}
