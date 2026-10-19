/**
 * A thin scrollbar drawn over a scroller's content, in place of the native one beside it. A native
 * scrollbar that's always shown (as a system may be set) takes its width from the rows the moment
 * the content overflows, so every row jumps sideways, and gives it back when it stops; this one
 * takes no room. It shows while the pointer is over the scroller, while you scroll it and while
 * you drag it; a scroll from code (a reveal, a restored position) doesn't flash it. `content` is the element whose height makes the scroll: it's watched for changes.
 * The scroller hides its own (`scrollbar-width: none`) and is positioned.
 */
export function overlayScrollbar(scroller: HTMLElement, content: Element) {
  const doc = scroller.ownerDocument
  const win = doc.defaultView!
  // A sticky strip of no height at the top, so the thumb inside it stays in view as it scrolls.
  const track = doc.createElement("div")
  track.className = "knobs-scrollbar"
  track.setAttribute("aria-hidden", "true")
  const thumb = doc.createElement("div")
  thumb.className = "knobs-scrollbar-thumb"
  track.append(thumb)
  scroller.prepend(track)

  let size = 0
  const update = () => {
    const view = scroller.clientHeight
    const over = scroller.scrollHeight - view
    const shown = over > 1 && view > 0
    track.hidden = !shown
    if (!shown) return
    size = Math.max(20, (view * view) / (view + over))
    const y = (Math.min(over, Math.max(0, scroller.scrollTop)) / over) * (view - size)
    thumb.style.height = `${size.toFixed(1)}px`
    thumb.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`
  }

  let idle = 0
  // When you last wheeled, touched or keyed in it: a scroll soon after is yours.
  let input = Number.NEGATIVE_INFINITY
  const touched = () => {
    input = win.performance.now()
  }
  for (const type of ["wheel", "touchmove", "keydown"])
    scroller.addEventListener(type, touched, { passive: true })
  const onScroll = () => {
    update()
    if (win.performance.now() - input > 600 && !("dragging" in track.dataset)) return
    track.dataset.active = ""
    win.clearTimeout(idle)
    idle = win.setTimeout(() => delete track.dataset.active, 800)
  }
  scroller.addEventListener("scroll", onScroll, { passive: true })

  let drag: { y: number; top: number; pointer: number } | undefined
  thumb.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    drag = { y: e.clientY, top: scroller.scrollTop, pointer: e.pointerId }
    thumb.setPointerCapture(e.pointerId)
    track.dataset.dragging = ""
  })
  thumb.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointer) return
    const view = scroller.clientHeight
    const over = scroller.scrollHeight - view
    scroller.scrollTop = drag.top + ((e.clientY - drag.y) * over) / Math.max(1, view - size)
  })
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return
    drag = undefined
    delete track.dataset.dragging
  }
  thumb.addEventListener("pointerup", end)
  thumb.addEventListener("pointercancel", end)
  thumb.addEventListener("lostpointercapture", end)

  const ro = new ResizeObserver(update)
  ro.observe(scroller)
  ro.observe(content)
  update()

  return {
    update,
    dispose() {
      ro.disconnect()
      win.clearTimeout(idle)
      scroller.removeEventListener("scroll", onScroll)
      for (const type of ["wheel", "touchmove", "keydown"])
        scroller.removeEventListener(type, touched)
      track.remove()
    },
  }
}
