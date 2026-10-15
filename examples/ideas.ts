// An ideas grid (knobs/ui bento): the concept images from the idea-surfaces round, crops of them
// in other shapes, two live canvases and a prototype, then generated sketches up to `?n=`.
//   ?n=500        more items (generated placeholders) for perf
//   ?theme=light  ?look=lab (square, flat)   ?groups   ?hero=3
//   ?perf         a frame-time readout        ?bench   scroll and zoom on their own, then report
import { labPreset } from "knobs/themes"
import { bento, restyle, type BentoItem, type UiTheme } from "knobs/ui"

const params = new URLSearchParams(location.search)
const urls = import.meta.glob("./assets/ideas/*.jpg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>
const url = (name: string) => urls[`./assets/ideas/${name}.jpg`]!

const words = (name: string) =>
  name
    .replace(/^\d+-/, "")
    .split("-")
    .map((w, i) => (i ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ")

const concepts = [
  "light-table",
  "expose",
  "infinite-canvas",
  "quad-split",
  "rounds",
  "deck",
  "duel",
  "mosaic",
]
// Each full size beside its 640px version, so a tile takes the small one and a zoom the large.
const image = (
  name: string,
  full: number,
  small: number,
  label: string,
  group?: string,
): BentoItem => ({
  id: name,
  src: url(name),
  srcset: `${url(`${name}-640`)} ${small}w, ${url(name)} ${full}w`,
  label,
  group,
})
const real: BentoItem[] = concepts.map((c, i) =>
  image(`0${i + 1}-${c}-wide`, 1600, 640, `${words(c)} · wide`, words(c)),
)
const zooms: BentoItem[] = concepts.map((c, i) =>
  image(`0${i + 1}-${c}-zoom`, 1600, 640, `${words(c)} · detail`, words(c)),
)
const crops: BentoItem[] = [
  image("tall-canvas", 1066, 427, "Infinite canvas · tall", "Infinite canvas"),
  image("square-mosaic", 1600, 640, "Mosaic · square", "Mosaic"),
  image("pano-quad", 1600, 640, "Quad split · panorama", "Quad split"),
  image("tall-deck", 1066, 427, "Deck · tall", "Deck"),
  image("square-rounds", 1600, 640, "Rounds · square", "Rounds"),
]

// A live canvas: drawn once, and animated only while it's hovered or zoomed.
const live = (id: string, label: string, aspect: number, hue: number): BentoItem => ({
  id,
  label,
  aspect,
  group: "Live",
  render(el) {
    const canvas = document.createElement("canvas")
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%"
    el.append(canvas)
    const ctx = canvas.getContext("2d")!
    let raf = 0
    let t = 0
    const size = () => {
      const dpr = Math.min(2, devicePixelRatio)
      // The tile's box (not its transformed rect): a zoom lays it out large and scales it.
      canvas.width = Math.max(1, Math.round(el.offsetWidth * dpr))
      canvas.height = Math.max(1, Math.round(el.offsetHeight * dpr))
      paint()
    }
    const paint = () => {
      const { width: w, height: h } = canvas
      ctx.fillStyle = `hsl(${hue} 30% 9%)`
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2 + t * (0.4 + (i % 5) * 0.08)
        const r = (0.18 + 0.22 * Math.sin(t * 0.7 + i)) * Math.min(w, h)
        ctx.fillStyle = `hsla(${hue + i * 3} 70% 62% / .8)`
        ctx.beginPath()
        ctx.arc(
          w / 2 + Math.cos(a) * r,
          h / 2 + Math.sin(a * 1.3) * r * 0.8,
          Math.min(w, h) * 0.012 + 1,
          0,
          7,
        )
        ctx.fill()
      }
    }
    const awake = () => el.matches(":hover") || !!el.closest("[data-focus]")
    const tick = () => {
      t += 1 / 60
      paint()
      raf = awake() ? requestAnimationFrame(tick) : 0
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const ro = new ResizeObserver(size)
    ro.observe(el)
    const tile = el.parentElement!
    tile.addEventListener("pointerenter", wake)
    const mo = new MutationObserver(wake)
    mo.observe(tile, { attributes: true, attributeFilter: ["data-focus"] })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo.disconnect()
    }
  },
})
// A prototype: a chip that opens a panel. Zoomed, it's live.
const proto: BentoItem = {
  id: "proto-chip",
  label: "Prototype · chip → panel",
  aspect: 4 / 3,
  group: "Live",
  render(el) {
    el.innerHTML = `<div class="proto" data-closed><button class="chip" type="button">Open</button><div class="panel">panel</div></div>`
    const box = el.firstElementChild as HTMLElement
    const chip = box.querySelector("button")!
    chip.onclick = () => {
      box.toggleAttribute("data-closed")
      chip.textContent = box.hasAttribute("data-closed") ? "Open" : "Close"
    }
  },
}

const shapes = [16 / 9, 1, 2 / 3, 4 / 3, 3 / 4, 2.2, 3 / 2, 16 / 9, 9 / 16]
const sketch = (i: number): BentoItem => {
  const a = shapes[i % shapes.length]!
  const w = 400
  const h = Math.round(w / a)
  const hue = (i * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 42% 36%)"/><stop offset="1" stop-color="hsl(${hue + 50} 46% 16%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="18" y="${h - 18}" font-family="system-ui,sans-serif" font-size="24" fill="rgba(255,255,255,.5)">${i + 1}</text></svg>`
  return {
    id: `sketch-${i}`,
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    aspect: a,
    label: `Sketch ${i + 1}`,
    group: "Sketches",
  }
}

const base: BentoItem[] = [
  ...real.slice(0, 4),
  crops[0]!,
  live("live-orbit", "Live · orbit", 16 / 9, 200),
  ...real.slice(4),
  crops[1]!,
  crops[2]!,
  proto,
  ...zooms.slice(0, 4),
  crops[3]!,
  live("live-bloom", "Live · bloom", 1, 330),
  ...zooms.slice(4),
  crops[4]!,
]
const n = Number(params.get("n")) || base.length
const groups = params.has("groups")
const heroAt = params.get("hero")
let items: BentoItem[] = [
  ...base.slice(0, n),
  ...Array.from({ length: Math.max(0, n - base.length) }, (_, i) => sketch(i)),
]
items = items.map((it, i) => ({
  ...it,
  group: groups ? it.group : undefined,
  hero: heroAt !== null && Number(heroAt) === i ? true : undefined,
}))

// ---- The look ----------------------------------------------------------------------------
const app = document.querySelector<HTMLElement>(".app")!
let theme: UiTheme = params.get("theme") === "light" ? "light" : "dark"
let lab = params.get("look") === "lab"
const themeButton = document.querySelector<HTMLButtonElement>("#theme")!
const lookButton = document.querySelector<HTMLButtonElement>("#look")!
const applyLook = () => {
  document.documentElement.dataset.theme = theme
  app.dataset.theme = theme
  restyle(document, { theme, ...(lab ? { preset: labPreset } : {}) })
  themeButton.textContent = theme === "dark" ? "Light" : "Dark"
  lookButton.textContent = lab ? "Knobs" : "Lab"
}
themeButton.onclick = () => {
  theme = theme === "dark" ? "light" : "dark"
  applyLook()
}
lookButton.onclick = () => {
  lab = !lab
  applyLook()
}

// ---- The grid ------------------------------------------------------------------------------
const count = document.querySelector<HTMLElement>("#count")!
const picked = document.querySelector<HTMLElement>("#picked")!
const showPicks = (ids: readonly string[]) => {
  picked.textContent = ids.length ? `· ${ids.length} picked` : ""
}
count.textContent = String(items.length)
const grid = bento(document.querySelector<HTMLElement>("#grid")!, {
  items,
  theme,
  ...(lab ? { preset: labPreset } : {}),
  label: "Ideas",
  onPick: showPicks,
})
applyLook()
grid.focus()
;(window as unknown as { __bento: typeof grid }).__bento = grid

// ---- Perf: a frame-time readout, and an unattended run -------------------------------------
if (params.has("perf") || params.has("bench")) {
  const hud = document.createElement("div")
  hud.className = "hud"
  document.body.append(hud)
  type Bucket = number[]
  const buckets: Record<string, Bucket> = { scroll: [], zoom: [] }
  let phase: "scroll" | "zoom" = "scroll"
  let last = 0
  let until = 0
  let raf = 0
  const q = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(p * (s.length - 1))] ?? 0
  }
  const report = () => {
    const lines = Object.entries(buckets).map(([k, xs]) => {
      if (!xs.length) return `${k.padEnd(6)} –`
      const med = q(xs, 0.5)
      const drops = xs.filter((x) => x > med * 1.5).length
      return `${k.padEnd(6)} ${xs.length} frames  p50 ${med.toFixed(1)}  p95 ${q(xs, 0.95).toFixed(1)}  max ${Math.max(...xs).toFixed(1)} ms  drops ${drops}`
    })
    const s = grid.stats()
    lines.push(
      `step   p50 ${s.p50.toFixed(2)}  p95 ${s.p95.toFixed(2)}  max ${s.max.toFixed(2)} ms · ${s.frames} frames`,
    )
    lines.push(
      `loop   ${grid.moving ? "running" : "idle"} · ${grid.element.querySelectorAll(".knobs-bento-tile").length} tiles in the DOM · ${items.length} items`,
    )
    hud.textContent = lines.join("\n")
    return lines
  }
  const tick = (now: number) => {
    if (last) buckets[phase]!.push(now - last)
    last = now
    if (now < until || grid.moving) raf = requestAnimationFrame(tick)
    else {
      raf = 0
      last = 0
    }
    report()
  }
  const watch = (p: "scroll" | "zoom", ms = 600) => {
    phase = p
    until = performance.now() + ms
    if (!raf) raf = requestAnimationFrame(tick)
  }
  grid.element.addEventListener("scroll", () => watch("scroll"), { passive: true })
  for (const type of ["keydown", "click", "wheel"])
    grid.element.addEventListener(
      type,
      () => watch(grid.zoomed || type !== "wheel" ? "zoom" : "scroll"),
      { passive: true },
    )
  report()

  if (params.has("bench")) {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const settle = async () => {
      while (grid.moving) await sleep(50)
    }
    const key = (k: string) =>
      grid.element.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }))
    void (async () => {
      await sleep(1200)
      buckets.scroll = []
      buckets.zoom = []
      // Scroll: 3 s at ~3000 px/s, down then back up.
      const el = grid.element
      const t0 = performance.now()
      await new Promise<void>((done) => {
        let dir = 1
        const step = () => {
          const max = el.scrollHeight - el.clientHeight
          if (el.scrollTop >= max - 1) dir = -1
          el.scrollTop += dir * 26
          watch("scroll", 200)
          if (performance.now() - t0 < 3000) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      })
      await sleep(400)
      // Zoom: in, two neighbours, out — four times around the grid.
      for (let k = 0; k < 4; k++) {
        const ids = [...el.querySelectorAll<HTMLElement>(".knobs-bento-tile")]
          .filter((t) => {
            const r = t.getBoundingClientRect()
            return r.top > el.getBoundingClientRect().top && r.bottom < innerHeight
          })
          .map((t) => t.dataset.id!)
        const id = ids[(k * 3) % Math.max(1, ids.length)]
        if (!id) break
        watch("zoom")
        grid.zoom(id)
        await settle()
        for (const _ of [0, 1]) {
          watch("zoom")
          key("ArrowRight")
          await settle()
        }
        watch("zoom")
        grid.zoom(null)
        await settle()
        await sleep(200)
      }
      await sleep(1500)
      const lines = report()
      console.log(`[bento bench] ${location.search}\n${lines.join("\n")}`)
      ;(window as unknown as { __bench: string[] }).__bench = lines
    })()
  }
}
