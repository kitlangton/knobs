// Proof sheets for Batch E: frame sheets of the timeline (scrub, zoom, play) and of the outliner's
// context menu opening a submenu, in knobs' own look; and before/after sheets of the panel
// changes (examples/rows.html: segmented labels, the flat frame's border, button tokens, vector
// axes, gathered sub-headings), the dock's readout heads, a curve's shape chips and the GPU's
// rings on square thumbs. BEFORE is a server of the code before the change (a worktree of the
// earlier commit, with examples/rows.* copied in); without it the before/after sheets are skipped.
// The page's clock and its CSS motion run SLOW times slower while filming.
// BASE=http://127.0.0.1:4005 BEFORE=http://127.0.0.1:4710 OUT=dir bun scripts/batche-shots.ts
import { type Browser, chromium, type Page } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const before = process.env.BEFORE
const out = process.env.OUT ?? "/tmp/batche"
const prefix = process.env.PREFIX ?? "2026-10-15-knobs-batchE"
const only = process.env.ONLY?.split(",")
const slow = Number(process.env.SLOW) || 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }
type Frame = { caption: string; png: Buffer }

async function open(url: string, viewport = { width: 1440, height: 900 }, scale = 2) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale })
  page.on("pageerror", (e) => errors.push(`${url}: ${e.message}`))
  await page.addInitScript(() => {
    localStorage.clear()
    const real = performance.now.bind(performance)
    let rate = 1
    let from = 0
    let at = 0
    const now = () => at + (real() - from) * rate
    ;(window as any).__slow = (s: number) => {
      at = now()
      from = real()
      rate = 1 / s
    }
    performance.now = now
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf(() => cb(now()))
    // CSS transitions and animations follow the same clock.
    const pace = () => {
      for (const a of document.getAnimations()) if (a.playbackRate !== rate) a.playbackRate = rate
      raf(pace)
    }
    raf(pace)
  })
  await page.goto(url)
  await sleep(1800)
  return page
}
const setSlow = (page: Page, s: number) => page.evaluate((s) => (window as any).__slow(s), s)
const boxOf = async (page: Page, selector: string, pad = 6): Promise<Region> => {
  const b = (await page.locator(selector).first().boundingBox())!
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}
const shot = (page: Page, clip: Region) => page.screenshot({ clip })

/** A sheet of captioned images in rows, drawn by the browser and saved as one PNG. */
async function sheet(
  name: string,
  title: string,
  note: string,
  rows: { caption: string; frames: Frame[]; columns?: number }[],
) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  })
  const img = (f: Frame) =>
    `<figure><img src="data:image/png;base64,${f.png.toString("base64")}"><figcaption>${f.caption}</figcaption></figure>`
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;padding:28px 32px;background:#0c0d0f;color:#d8dbe0;font:13px/1.45 -apple-system,system-ui,sans-serif;width:max-content}
    h1{margin:0 0 4px;font-size:18px;font-weight:600}p{margin:0 0 20px;color:#8b9098;max-width:1400px}
    h2{margin:22px 0 10px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b9098}
    .row{display:grid;gap:14px;align-items:start}figure{margin:0}img{display:block;width:var(--w);border-radius:6px;outline:1px solid #23252a}
    figcaption{margin-top:6px;color:#8b9098;font-size:12px}
  </style></head><body><h1>${title}</h1><p>${note}</p>
  ${rows
    .map(
      (r) =>
        `<h2>${r.caption}</h2><div class="row" style="grid-template-columns:repeat(${r.columns ?? r.frames.length},max-content)">${r.frames.map(img).join("")}</div>`,
    )
    .join("")}</body></html>`)
  // Images at half their pixels: they were taken at 2×.
  await page.evaluate(async () => {
    for (const im of document.images) {
      await im.decode()
      im.style.setProperty("--w", `${im.naturalWidth / 2}px`)
    }
  })
  const file = `${out}/${prefix}-${name}.png`
  writeFileSync(file, await page.screenshot({ fullPage: true }))
  await page.close()
  console.log(file)
}

// ——— Timeline: scrub, zoom, play ———
if (want("timeline")) {
  const page = await open(`${base}/lab.html?paused`)
  const region = await boxOf(page, ".knobs-timeline", 10)
  const track = (await page.locator(".knobs-tl-track").boundingBox())!
  const view = () =>
    page.evaluate(() => (window as any).__timeline.timeline.view as { start: number; span: number })
  const xOf = async (t: number) => {
    const v = await view()
    return track.x + ((t - v.start) / v.span) * track.width
  }
  const y = track.y + track.height - 6
  const scrub: Frame[] = []
  const from = await xOf(0.4)
  const boom = await xOf(1.2)
  await page.mouse.move(from, y)
  await page.mouse.down()
  for (const [x, caption] of [
    [from, "press at 0.40 s"],
    [from + (boom - from) * 0.5, "follows the hand 1:1"],
    [boom - 2, "2 px short: held on Boom"],
    [boom + 6, "6 px past: lets go softly"],
    [boom + 60, "free again"],
  ] as const) {
    await page.mouse.move(x, y, { steps: 3 })
    await sleep(120)
    scrub.push({ caption, png: await shot(page, region) })
  }
  await page.mouse.up()
  await sleep(300)
  scrub.push({ caption: "let go: lands on a frame", png: await shot(page, region) })

  const zoom: Frame[] = []
  await page.locator(".knobs-timeline").focus()
  await page.keyboard.press("0")
  await sleep(600)
  zoom.push({ caption: "fit (0)", png: await shot(page, region) })
  // ⌘wheel is the hand's own: the ruler follows it at once, around the pointer.
  await page.mouse.move(await xOf(3), track.y + track.height / 2)
  await page.keyboard.down("Meta")
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120)
  await page.keyboard.up("Meta")
  await sleep(300)
  zoom.push({ caption: "⌘wheel ×3 at 3 s: follows the hand", png: await shot(page, region) })
  // + springs in from a key, interruptibly.
  await setSlow(page, slow)
  await page.keyboard.press("=")
  for (let i = 0; i < 4; i++) {
    await sleep(70 * slow)
    zoom.push({ caption: `= (zoom in), +${(i + 1) * 70} ms`, png: await shot(page, region) })
  }
  await page.keyboard.press("0")
  for (let i = 0; i < 3; i++) {
    await sleep(90 * slow)
    zoom.push({ caption: `0 (fit), +${(i + 1) * 90} ms`, png: await shot(page, region) })
  }
  await setSlow(page, 1)
  await sleep(800)

  const play: Frame[] = []
  await page.keyboard.press("Home")
  await sleep(300)
  await page.keyboard.press("Space")
  for (let i = 0; i < 6; i++) {
    await sleep(380)
    play.push({ caption: `playing, +${(i + 1) * 380} ms`, png: await shot(page, region) })
  }
  await page.keyboard.press("Space")
  await sleep(300)
  play.push({ caption: "paused on a frame", png: await shot(page, region) })
  await page.close()
  await sheet(
    "timeline",
    "Timeline in knobs' own look: scrub, zoom, play",
    `A scrub follows the hand 1:1 and holds softly on a marker; ⌘wheel zooms around the pointer with the hand, while = and 0 spring the ruler in and back out (filmed ${slow}× slower); playback moves the playhead every frame through the loop and pauses on a frame.`,
    [
      { caption: "Scrub", frames: scrub, columns: 2 },
      { caption: "Zoom", frames: zoom, columns: 2 },
      { caption: "Play", frames: play, columns: 2 },
    ],
  )
}

// ——— Context menu with a submenu ———
if (want("menu")) {
  const page = await open(`${base}/lab.html?paused`)
  const row = page.locator(".knobs-tree-row", { hasText: "Window glow" })
  const rb = (await row.boundingBox())!
  const region = { x: 0, y: rb.y - 140, width: 470, height: 380 }
  const frames: Frame[] = []
  await setSlow(page, slow)
  await row.click({ button: "right", position: { x: 60, y: rb.height / 2 } })
  for (let i = 0; i < 4; i++) {
    frames.push({ caption: `right-click, ${i * 40} ms`, png: await shot(page, region) })
    await sleep(40 * slow)
  }
  await setSlow(page, 1)
  await sleep(400)
  frames.push({ caption: "open: grows from the pointer", png: await shot(page, region) })
  await setSlow(page, slow)
  await page.locator('.knobs-mitem[data-id="move"]').hover()
  for (let i = 0; i < 4; i++) {
    await sleep(60 * slow)
    frames.push({
      caption: `“Move to” hovered, +${(i + 1) * 60} ms`,
      png: await shot(page, region),
    })
  }
  await setSlow(page, 1)
  const sub = page.getByRole("menu").nth(1)
  await sub.locator(".knobs-mitem").nth(1).hover()
  await sleep(300)
  frames.push({ caption: "into the submenu", png: await shot(page, region) })
  await page.keyboard.press("Escape")
  await setSlow(page, slow)
  for (let i = 0; i < 3; i++) {
    frames.push({ caption: `Esc, ${i * 30} ms: softens out`, png: await shot(page, region) })
    await sleep(30 * slow)
  }
  await page.close()
  await sheet(
    "context-menu",
    "Context menu with a submenu, in knobs' own look",
    `A right-click on an outliner row selects it and grows its menu from the pointer on a snappy spring; hovering “Move to” opens the submenu level with its item, held open by a safe triangle; Esc closes the submenu first. Filmed ${slow}× slower.`,
    [{ caption: "Frames", frames, columns: 3 }],
  )
}

// ——— Before / after ———
if (before && want("panels")) {
  const ids = ["knobs-dom", "lab-dom", "buttons-dom", "lab-gpu"]
  const take = async (server: string) => {
    const page = await open(`${server}/rows.html`, { width: 1060, height: 1500 })
    await sleep(800)
    const frames: Frame[] = []
    for (const id of ids)
      frames.push({
        caption: id.replace("-", " · ").replace("buttons", "lab + button tokens"),
        png: await shot(page, await boxOf(page, `#${id}`, 8)),
      })
    // knobs' look in a 308px column, where the segments used to squeeze the label.
    await page.evaluate(() => {
      document.getElementById("knobs-dom")!.style.width = "308px"
    })
    await sleep(600)
    frames.push({
      caption: "knobs · dom, a 308px column",
      png: await shot(page, await boxOf(page, '#knobs-dom [data-field="keyLabels"]', 8)),
    })
    await page.close()
    return frames
  }
  await sheet(
    "panels-before-after",
    "Panel rows in a host's column: before and after",
    "examples/rows.html. Segmented “Key labels” keeps its words (or, in knobs' 12px rows, becomes a menu); the flat chromeless panel has no 1px border, so rows meet the dashed column guides; action rows and preset chips take the button tokens; Position names its cells X and Z; Pivot and Forces gather their rows; the F and G chips only show their keys. The last column is the GPU overlay.",
    [
      { caption: "Before", frames: await take(before) },
      { caption: "After", frames: await take(base) },
    ],
  )
}

if (before && want("label")) {
  const ids = ["tight-knobs-dom", "tight-lab-dom", "tight-knobs-gpu", "tight-lab-gpu"]
  const take = async (server: string, hover: boolean) => {
    const page = await open(`${server}/rows.html`, { width: 1440, height: 2000 })
    await sleep(800)
    const frames: Frame[] = []
    for (const id of ids)
      frames.push({
        caption: id.replace("tight-", "").replace("-", " · "),
        png: await shot(page, await boxOf(page, `#${id}`, 8)),
      })
    if (hover)
      for (const id of ["tight-knobs-dom", "tight-knobs-gpu"]) {
        await page.locator(`#${id} [data-field="tooLong"]`).hover()
        await sleep(500)
        frames.push({
          caption: `${id.replace("tight-", "").replace("-", " · ")}, the last row hovered`,
          png: await shot(page, await boxOf(page, `#${id}`, 8)),
        })
      }
    await page.close()
    return frames
  }
  await sheet(
    "label-room-before-after",
    "A long label beside a long menu value, in a 270px column: before and after",
    "examples/rows.html, each row with a host's pin that only shows on hover (Weather's is pinned). Before, the label stopped at half the row and the hidden pin took width from it. After, the label keeps its words and the value truncates (its whole text is the tooltip), down to a few letters; only a label too long for any column gives way, and the pin then lies over its end, which fades from under it while the row is hovered. GPU columns match.",
    [
      { caption: "Before", frames: await take(before, false) },
      { caption: "After", frames: await take(base, true) },
    ],
  )
}

if (before && want("readouts")) {
  const take = async (server: string, width: number) => {
    const page = await open(`${server}/lab.html?seed`, { width, height: 900 })
    await sleep(1600)
    const live = await boxOf(page, '[data-controls="lab-live"] [data-field="frame"]', 6)
    const log = await boxOf(page, '[data-controls="lab-diag"] [data-field="events"]', 6)
    const frames = [
      { caption: `FRAME graph, ${width}px window`, png: await shot(page, live) },
      { caption: `EVENTS log, ${width}px window`, png: await shot(page, log) },
    ]
    await page.close()
    return frames
  }
  await sheet(
    "readouts-before-after",
    "Readout heads: before and after",
    "Titles keep their words. A graph's legend first drops its units, then wraps under the title; a log's tools narrow the filter, then wrap.",
    [
      { caption: "Before", frames: [...(await take(before, 1440)), ...(await take(before, 1200))] },
      { caption: "After", frames: [...(await take(base, 1440)), ...(await take(base, 1200))] },
    ],
  )
}

if (before && want("curve")) {
  const take = async (server: string, look: string) => {
    const page = await open(`${server}/lab.html?paused${look}`)
    await page.evaluate(() => (window as any).__lab.inspectorPanel.tab("fx"))
    await sleep(800)
    const row = page.locator('[data-controls="lab-inspector"] [data-field="falloff"]')
    await row.scrollIntoViewIfNeeded()
    await row.locator(".knobs-x-head").click()
    await sleep(1000)
    const png = await row.screenshot()
    await page.close()
    return { caption: look ? "labPreset" : "knobs", png }
  }
  await sheet(
    "curve-chips-before-after",
    "A curve's shape chips: before and after",
    "The five shapes share one row: chips give up padding before their words.",
    [
      { caption: "Before", frames: [await take(before, ""), await take(before, "&look=lab")] },
      { caption: "After", frames: [await take(base, ""), await take(base, "&look=lab")] },
    ],
  )
}

if (before && want("ring")) {
  const take = async (server: string, gpu: boolean) => {
    const page = await open(
      `${server}/ramps.html${gpu ? "?gpu" : ""}`,
      { width: 760, height: 1000 },
      4,
    )
    await page.getByRole("button", { name: "Smoke over life", exact: true }).click()
    await sleep(900)
    const png = await shot(
      page,
      await boxOf(page, '#lab [data-field="smoke"] .knobs-strip-thumb', 14),
    )
    await page.close()
    return { caption: gpu ? "GPU" : "DOM", png }
  }
  await sheet(
    "ring-before-after",
    "Rings on square thumbs (labPreset, --k-radius: 0): before and after",
    "Taken at 4×. The GPU's outer ring now spreads square, as the DOM's box-shadow does.",
    [
      { caption: "Before", frames: [await take(before, false), await take(before, true)] },
      { caption: "After", frames: [await take(base, false), await take(base, true)] },
    ],
  )
}

await browser.close()
if (errors.length) {
  console.error(errors.join("\n"))
  process.exitCode = 1
}
