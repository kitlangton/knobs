import { equal, type Schema, type Values } from "../core/schema.js"
import type { Controls } from "../core/store.js"
import { Spring } from "./motion.js"

export interface PresetEntry<V = Record<string, unknown>> {
  readonly id: string
  readonly kind: "preset" | "variant"
  readonly rawId: string
  readonly label: string
  readonly values: V
  apply(): void
}

export interface ActivePresetState {
  readonly activeId: string
  readonly activeIndex: number
  readonly isCustom: boolean
}

/**
 * Resolves which preset or variant is currently active.
 * Honors `lastAppliedId` when its values still match `currentValues`, so cycling never gets
 * stuck when a saved variant has the exact same values as a built-in preset.
 */
export function resolveActivePresetEntry<V extends Record<string, any>>(
  entries: readonly PresetEntry<V>[],
  currentValues: V,
  lastAppliedId: string | null,
): ActivePresetState {
  if (lastAppliedId !== null) {
    const pinnedIdx = entries.findIndex((e) => e.id === lastAppliedId)
    if (pinnedIdx >= 0 && equal(entries[pinnedIdx]!.values, currentValues)) {
      return {
        activeId: entries[pinnedIdx]!.id,
        activeIndex: pinnedIdx,
        isCustom: false,
      }
    }
  }
  const matchIdx = entries.findIndex((e) => equal(e.values, currentValues))
  if (matchIdx >= 0) {
    return {
      activeId: entries[matchIdx]!.id,
      activeIndex: matchIdx,
      isCustom: false,
    }
  }
  return {
    activeId: "custom",
    activeIndex: -1,
    isCustom: true,
  }
}

export function nextPresetIndex(count: number, activeIndex: number, direction: number): number {
  if (count <= 0) return -1
  if (activeIndex < 0) return direction > 0 ? 0 : count - 1
  return (((activeIndex + direction) % count) + count) % count
}

export interface PresetStrip {
  readonly element: HTMLElement
  readonly track: HTMLElement
  readonly pill: HTMLElement
  readonly customBadge: HTMLElement
  readonly pillX: Spring
  readonly pillW: Spring
  readonly pillAlpha: Spring
  getEntries(): readonly PresetEntry<any>[]
  getButtons(): readonly HTMLButtonElement[]
  getActiveState(): ActivePresetState
  cycle(direction: -1 | 1): void
  selectById(id: string): void
  update(): void
  measurePill(snap?: boolean): void
}

export function createPresetStrip<S extends Schema>(
  doc: Document,
  controls: Controls<S>,
  showVariants: boolean,
  run: (action: () => unknown) => void,
  onAfterChange?: () => void,
): PresetStrip {
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const node = doc.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }

  const root = el("div", "knobs-presets")
  root.tabIndex = 0
  root.setAttribute("role", "radiogroup")
  root.setAttribute("aria-label", "Preset or variant")

  const track = el("div", "knobs-presets-track")
  const pill = el("div", "knobs-presets-pill")
  pill.setAttribute("aria-hidden", "true")
  const customBadge = el("span", "knobs-preset-custom", "custom")
  customBadge.hidden = true
  track.append(pill)
  root.append(track, customBadge)

  const pillX = new Spring(0, 28, 0.82)
  const pillW = new Spring(48, 28, 0.86)
  const pillAlpha = new Spring(1, 26, 0.9)

  let entries: PresetEntry<Values<S>>[] = []
  let buttons: HTMLButtonElement[] = []
  let signature = ""
  let lastAppliedId: string | null = null
  let activeState: ActivePresetState = { activeId: "p:default", activeIndex: 0, isCustom: false }
  let initializedPill = false

  function buildEntries(): PresetEntry<Values<S>>[] {
    const presetEntries: PresetEntry<Values<S>>[] = Object.entries(controls.presets).map(
      ([id, presetValues]) => ({
        id: `p:${id}`,
        kind: "preset",
        rawId: id,
        label: id,
        values: presetValues,
        apply: () => controls.preset(id),
      }),
    )
    if (!showVariants) return presetEntries
    const variants = controls.variants.list()
    const variantEntries: PresetEntry<Values<S>>[] = variants.map((v) => ({
      id: `v:${v.id}`,
      kind: "variant",
      rawId: v.id,
      label: v.name ?? v.id.slice(0, 8),
      values: v.values,
      apply: () => controls.variants.load(v.id),
    }))
    return [...presetEntries, ...variantEntries]
  }

  function scrollChipIntoView(btn: HTMLButtonElement) {
    const trackWidth = track.clientWidth
    if (trackWidth <= 0 || track.scrollWidth <= trackWidth) return
    const left = btn.offsetLeft
    const right = left + btn.offsetWidth
    const pad = 12
    if (left - pad < track.scrollLeft) {
      track.scrollLeft = Math.max(0, left - pad)
    } else if (right + pad > track.scrollLeft + trackWidth) {
      track.scrollLeft = Math.min(track.scrollWidth - trackWidth, right - trackWidth + pad)
    }
  }

  function measurePill(snap = false) {
    const idx = activeState.activeIndex
    const btn = idx >= 0 ? buttons[idx] : undefined
    if (!btn || activeState.isCustom) {
      pillAlpha.set(0)
      if (snap) pillAlpha.snap(0)
      pill.style.opacity = "0"
      pill.style.transform = `translate3d(${pillX.x}px, 0, 0) scale(0.92)`
      return
    }
    const targetX = btn.offsetLeft
    const targetW = Math.max(20, btn.offsetWidth)
    if (snap || !initializedPill) {
      pillX.snap(targetX)
      pillW.snap(targetW)
      pillAlpha.snap(1)
      initializedPill = true
    } else {
      pillX.set(targetX)
      pillW.set(targetW)
      pillAlpha.set(1)
    }
    pill.style.width = `${targetW}px`
    pill.style.opacity = "1"
    pill.style.transform = `translate3d(${targetX}px, 0, 0) scale(1)`
  }

  function syncSelection(snap = false) {
    const values = controls.get()
    activeState = resolveActivePresetEntry(entries, values, lastAppliedId)
    if (lastAppliedId !== null && activeState.activeId !== lastAppliedId) {
      lastAppliedId = null
    }
    root.dataset.activePreset = activeState.activeId
    root.dataset.value = activeState.activeId
    customBadge.hidden = !activeState.isCustom
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i]!
      const checked = i === activeState.activeIndex
      b.setAttribute("aria-checked", String(checked))
      b.classList.toggle("knobs-preset-active", checked)
    }
    if (activeState.activeIndex >= 0 && buttons[activeState.activeIndex]) {
      scrollChipIntoView(buttons[activeState.activeIndex]!)
    }
    root.classList.toggle("knobs-presets-overflow", track.scrollWidth > track.clientWidth + 2)
    measurePill(snap)
  }

  function selectAt(index: number) {
    const entry = entries[index]
    if (!entry) return
    lastAppliedId = entry.id
    run(() => {
      entry.apply()
    })
    syncSelection(false)
    onAfterChange?.()
  }

  function selectById(id: string) {
    const idx = entries.findIndex((e) => e.id === id || e.rawId === id || e.label === id)
    if (idx >= 0) selectAt(idx)
  }

  function cycle(direction: -1 | 1) {
    if (entries.length === 0) return
    const current = resolveActivePresetEntry(entries, controls.get(), lastAppliedId)
    const nextIdx = nextPresetIndex(entries.length, current.activeIndex, direction)
    if (nextIdx >= 0) selectAt(nextIdx)
  }

  function update() {
    run(() => {
      const nextEntries = buildEntries()
      const nextSig = JSON.stringify(nextEntries.map((e) => [e.id, e.label]))
      const shouldShow = nextEntries.length > 1
      root.hidden = !shouldShow
      if (nextSig !== signature) {
        signature = nextSig
        entries = nextEntries
        buttons = entries.map((entry, idx) => {
          const b = el("button", "knobs-preset-chip", entry.label)
          b.type = "button"
          b.tabIndex = -1
          b.dataset.presetId = entry.id
          b.dataset.presetKind = entry.kind
          b.dataset.presetName = entry.label
          b.setAttribute("role", "radio")
          b.setAttribute("aria-label", entry.label)
          b.onclick = (e) => {
            e.preventDefault()
            selectAt(idx)
            root.focus({ preventScroll: true })
          }
          return b
        })
        track.replaceChildren(pill, ...buttons)
        syncSelection(true)
      } else {
        entries = nextEntries
        syncSelection(false)
      }
    })
  }

  // Pointer scrubbing across chips
  let scrubbing = false
  const chipIndexAt = (clientX: number): number => {
    for (let i = 0; i < buttons.length; i++) {
      const rect = buttons[i]!.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) return i
    }
    return -1
  }
  track.onpointerdown = (event) => {
    if (event.button !== 0 || buttons.length === 0) return
    scrubbing = true
    track.setPointerCapture(event.pointerId)
    const idx = chipIndexAt(event.clientX)
    if (idx >= 0) selectAt(idx)
    root.focus({ preventScroll: true })
  }
  track.onpointermove = (event) => {
    if (!scrubbing) return
    const idx = chipIndexAt(event.clientX)
    if (idx >= 0 && idx !== activeState.activeIndex) {
      selectAt(idx)
    }
  }
  const endScrub = () => {
    scrubbing = false
  }
  track.onpointerup = endScrub
  track.onpointercancel = endScrub

  root.onkeydown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === "ArrowLeft" || event.key === "h") {
      event.preventDefault()
      event.stopPropagation()
      cycle(-1)
    } else if (event.key === "ArrowRight" || event.key === "l") {
      event.preventDefault()
      event.stopPropagation()
      cycle(1)
    } else if (event.key === "Home" && entries.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      selectAt(0)
    } else if (event.key === "End" && entries.length > 0) {
      event.preventDefault()
      event.stopPropagation()
      selectAt(entries.length - 1)
    } else if (/^[1-9]$/.test(event.key)) {
      const idx = Number(event.key) - 1
      if (idx < entries.length) {
        event.preventDefault()
        event.stopPropagation()
        selectAt(idx)
      }
    }
  }

  return {
    element: root,
    track,
    pill,
    customBadge,
    pillX,
    pillW,
    pillAlpha,
    getEntries: () => entries,
    getButtons: () => buttons,
    getActiveState: () => activeState,
    cycle,
    selectById,
    update,
    measurePill,
  }
}
