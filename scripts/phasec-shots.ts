// Proof shots for Phase C (knobs/ui in the Lab workspace): the workspace in both renderers, frame
// sheets of a pane collapsing and opening, the dock folding, the outliner opening a branch, a
// drag reorder, the 10k-row scroll, and the Phase B follow-ups (the range's text fading around
// its thumbs, the seed's rolling digits). The page's clock and its CSS/WAAPI motion run SLOW
// times slower while filming, so headless screenshots keep up with the springs.
// BASE=http://127.0.0.1:4005 OUT=dir bun scripts/phasec-shots.ts   (ONLY=collapse,tree,… SLOW=10)
import { type Browser, chromium, type Locator, type Page } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const out = process.env.OUT ?? "/tmp/phasec"
const only = process.env.ONLY?.split(",")
const slow = Number(process.env.SLOW) || 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }
type Shot = { t: number; png: Buffer }

async function open(mode: string, path = "lab.html", viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`))
  await page.addInitScript(() => {
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
  })
  const sep = path.includes("?") ? "&" : "?"
  await page.goto(`${base}/${path}${mode === "gpu" ? `${sep}gpu` : ""}`)
  await sleep(1200)
  return page
}
const clipOf = async (el: Locator, pad = 0): Promise<Region> => {
  const b = (await el.boundingBox())!
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}
const ws = <T>(page: Page, fn: (w: any) => T) =>
  page.evaluate(
    (src) => new Function(`return (${src})(window.__workspace)`)(),
    fn.toString(),
  ) as Promise<T>

async function film(page: Page, region: Region, ms: number, act: () => Promise<void>, n = 12) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
  const shots: Shot[] = []
  const start = Date.now()
  const acting = act()
  while (Date.now() - start < ms * slow)
    shots.push({ t: Date.now() - start, png: await page.screenshot({ clip: region }) })
  await acting
  await page.evaluate(() => (window as any).__slow(1))
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  const pick = Array.from({ length: n }, (_, i) => Math.round((i * (shots.length - 1)) / (n - 1)))
  return [...new Set(pick)].map((i) => ({ t: shots[i]!.t / slow, png: shots[i]!.png }))
}
async function sheet(
  title: string,
  note: string,
  rows: { label: string; shots: Shot[] }[],
  path: string,
  width = 300,
  perRow = 6,
) {
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:12px -apple-system,system-ui;padding:16px">
    <div style="font-size:15px;color:#eee;margin-bottom:4px">${title}</div>
    <div style="margin-bottom:10px">${note}</div>
    ${rows
      .map(
        (r) => `<div style="color:#ddd;margin:10px 0 6px">${r.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${r.shots
        .map(
          (s) =>
            `<figure style="margin:0"><img style="display:block;width:${width}px" src="data:image/png;base64,${s.png.toString("base64")}"><figcaption>${s.t.toFixed(0)} ms</figcaption></figure>`,
        )
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5 })
  await p.setViewportSize({ width: perRow * (width + 6) + 32, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}
const divider = (page: Page, pane: string, index = 0) =>
  page
    .locator(".knobs-split")
    .filter({ has: page.locator(`:scope > [data-pane="${pane}"]`) })
    .locator(":scope > .knobs-divider")
    .nth(index)

if (want("workspace")) {
  for (const mode of ["dom", "gpu"]) {
    const page = await open(mode)
    await page.locator('.knobs-tree-row[aria-label="Cone #93"]').click()
    await page.locator('.knobs-tree-row[aria-label="Cone #94"]').click({ modifiers: ["Meta"] })
    await page.mouse.move(700, 300)
    await sleep(600)
    await page.screenshot({ path: `${out}/workspace-${mode}.png` })
    await page.close()
  }
}

if (want("collapse")) {
  const page = await open("dom")
  const region = { x: 0, y: 34, width: 1440, height: 520 }
  await divider(page, "left").focus()
  const shut = await film(page, region, 520, () => page.keyboard.press("Enter"))
  await sleep(300)
  const reopen = await film(page, region, 520, () =>
    page.locator('[data-pane="left"] .knobs-pane-rail').click(),
  )
  await sleep(300)
  // Interrupted: collapse, then open again partway.
  await divider(page, "left").focus()
  const turn = await film(page, region, 600, async () => {
    await page.keyboard.press("Enter")
    await sleep(110 * slow)
    await page.locator('[data-pane="left"]').evaluate(() => {
      ;(window as any).__workspace.main.collapse("left", false)
    })
  })
  const head = page.locator('[data-pane="dock"] .knobs-pane-head')
  const dockRegion = { x: 240, y: 560, width: 900, height: 320 }
  const fold = await film(page, dockRegion, 520, () => head.click())
  await sleep(200)
  const unfold = await film(page, dockRegion, 520, () => head.click())
  await sheet(
    "Split: collapsing to a rail, interruptibly",
    "Enter on the divider collapses the outliner column: it springs to a 26 px rail (its content slides out by the divider, clipped, without reflowing) while the viewport takes the room; the rail opens it; an open mid-collapse turns back from where it is. The dock below the viewport folds to its header the same way.",
    [
      { label: "Collapse (Enter on the divider)", shots: shut },
      { label: "Open (click the rail)", shots: reopen },
      { label: "Collapse, then open again 110 ms in", shots: turn },
    ],
    `${out}/collapse.png`,
    470,
    3,
  )
  await sheet(
    "Split: a column dock folding to its header",
    "A click on the dock's header folds it to the header at the bottom edge; another opens it.",
    [
      { label: "Fold", shots: fold },
      { label: "Open", shots: unfold },
    ],
    `${out}/dock.png`,
    470,
    3,
  )
  await page.close()
}

if (want("tree")) {
  const page = await open("dom")
  const tree = page.locator(".knobs-tree")
  const region = await clipOf(tree)
  region.height = 420
  const fixtures = page.locator('.knobs-tree-row[aria-label="Fixtures"]')
  await fixtures.click()
  await page.mouse.move(700, 300)
  const open1 = await film(page, region, 520, () => page.keyboard.press("ArrowRight"))
  await sleep(200)
  const close1 = await film(page, region, 520, () => page.keyboard.press("ArrowLeft"))
  await sleep(200)
  // Drag "Barrier" above "Propane tank #96".
  const a = (await page.locator('.knobs-tree-row[aria-label="Barrier"]').boundingBox())!
  const b = (await page.locator('.knobs-tree-row[aria-label="Propane tank #96"]').boundingBox())!
  await page.mouse.move(a.x + 60, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 2 })
  await page.mouse.move(b.x + 60, b.y + 3, { steps: 6 })
  await sleep(200)
  const dragging = [{ t: 0, png: await page.screenshot({ clip: region }) }]
  const drop = await film(page, region, 420, () => page.mouse.up(), 6)
  await sheet(
    "Outliner: a branch opening and closing, and a drop",
    "→ opens Fixtures: the rows below glide down on one spring while its children slide out from under it with them, one block like a drawer, clipped below its bottom edge; ← folds them back under it. Dragging shows a line where the row will land; on drop the rows glide to their new places.",
    [
      { label: "Open (→)", shots: open1 },
      { label: "Close (←)", shots: close1 },
      {
        label: "Dragging Barrier above Propane tank, then the drop",
        shots: [...dragging, ...drop],
      },
    ],
    `${out}/tree.png`,
    240,
    7,
  )
  await page.close()
}

if (want("scroll")) {
  const page = await open("dom", "lab.html?rows=10000")
  await ws(page, (w) => {
    w.outline.expand("crowd", true)
    for (let g = 0; g < 100; g++) w.outline.expand(`crowd-${g}`, true)
  })
  await sleep(1500)
  const tree = page.locator(".knobs-tree")
  const result = await tree.evaluate(
    (el) =>
      new Promise<{ work: number[]; frames: number[]; rows: number[]; total: number }>((done) => {
        const work: number[] = []
        const frames: number[] = []
        const rows: number[] = []
        let last = performance.now()
        const tick = () => {
          const now = performance.now()
          frames.push(now - last)
          last = now
          const t = performance.now()
          el.scrollTop += 1200
          el.dispatchEvent(new Event("scroll"))
          el.lastElementChild!.getBoundingClientRect()
          work.push(performance.now() - t)
          rows.push(el.querySelectorAll(".knobs-tree-row").length)
          if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) requestAnimationFrame(tick)
          else
            done({ work, frames, rows, total: (window as any).__workspace.outline.rows().length })
        }
        requestAnimationFrame(tick)
      }),
  )
  await tree.evaluate((el) => (el.scrollTop = el.scrollHeight / 2))
  await sleep(300)
  const mid = await page.screenshot({ clip: await clipOf(page.locator('[data-pane="left"]')) })
  const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)]!
  const stats = {
    rows: result.total,
    steps: result.work.length,
    workMedian: q(result.work, 0.5),
    workP90: q(result.work, 0.9),
    workMax: Math.max(...result.work),
    domRowsMax: Math.max(...result.rows),
    frameMedian: q(result.frames.slice(2), 0.5),
  }
  writeFileSync(`${out}/scroll.json`, JSON.stringify(stats, null, 2))
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:13px/1.5 -apple-system,system-ui;padding:20px;display:flex;gap:24px">
    <img style="width:240px;display:block" src="data:image/png;base64,${mid.toString("base64")}">
    <div style="max-width:560px"><div style="font-size:16px;color:#eee;margin-bottom:8px">Outliner: 10,000 rows, virtualised</div>
    <p>${stats.rows.toLocaleString()} rows open (100 waves of 100 walkers under Crowd, plus the scene). Scrolling top to bottom 1,200 px a frame (${stats.steps} steps): each step sets scrollTop, lets the tree bring in and drop rows, and lays the page out.</p>
    <table style="border-collapse:collapse;color:#ddd">
    <tr><td style="padding:2px 16px 2px 0">Work per step, median</td><td>${stats.workMedian.toFixed(2)} ms</td></tr>
    <tr><td style="padding:2px 16px 2px 0">p90 / max</td><td>${stats.workP90.toFixed(2)} / ${stats.workMax.toFixed(2)} ms</td></tr>
    <tr><td style="padding:2px 16px 2px 0">Rows in the DOM, at most</td><td>${stats.domRowsMax}</td></tr>
    <tr><td style="padding:2px 16px 2px 0">Headless frame interval, median</td><td>${stats.frameMedian.toFixed(1)} ms (the loaded machine's pace, not the tree's)</td></tr>
    </table>
    <p>Rows are absolutely placed by transform in one scroller; only the window around the view (plus 6 rows either side) is in the DOM, recycled from a pool. Flattening all 10,100 rows takes about a millisecond (unit test).</p></div></body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5, viewport: { width: 900, height: 600 } })
  await p.setContent(html)
  await p.screenshot({ path: `${out}/scroll.png`, fullPage: true })
  await p.close()
  await page.close()
}

if (want("range") || want("seed")) {
  const rows: { label: string; shots: Shot[] }[] = []
  const seedRows: { label: string; shots: Shot[] }[] = []
  for (const mode of ["dom", "gpu"]) {
    const page = await open(mode)
    const panel = page.locator('[data-controls="lab-inspector"]')
    await panel.scrollIntoViewIfNeeded()
    if (want("range")) {
      const visible = panel.locator('[data-field="visible"]')
      const region = await clipOf(visible, 1)
      await page.mouse.move(2, 2)
      await sleep(400)
      const rest = await page.screenshot({ clip: region })
      await visible.hover({ position: { x: 200, y: 8 } })
      await sleep(500)
      const hover = await page.screenshot({ clip: region })
      await visible.getByRole("slider", { name: "Visible range high" }).focus()
      await page.keyboard.press("End")
      await sleep(600)
      const high = await page.screenshot({ clip: region })
      rows.push({
        label: mode.toUpperCase(),
        shots: [
          { t: 0, png: rest },
          { t: 0, png: hover },
          { t: 0, png: high },
        ],
      })
    }
    if (want("seed")) {
      await panel.getByRole("tab", { name: "Emitter" }).click()
      await page.mouse.move(2, 2)
      await sleep(600)
      const seed = panel.locator('[data-field="seed"]')
      const region = await clipOf(seed, 1)
      seedRows.push({
        label: mode.toUpperCase(),
        shots: await film(page, region, 700, () =>
          panel.getByRole("button", { name: "Roll Seed" }).click(),
        ),
      })
    }
    await page.close()
  }
  if (rows.length)
    await sheet(
      "Range: a thumb never sits on the text",
      "Visible range, 4–40 of 0–100 m: at rest (thumbs hidden), hovered (the low thumb sits over the label's first letter, which fades 2.5 px either side of it), and with the high end at 100 m (the readout fades around that thumb). DOM above, GPU below.",
      rows,
      `${out}/range.png`,
      420,
      3,
    )
  if (seedRows.length)
    await sheet(
      "Seed: digits roll on the die",
      "Roll Seed: every place's reel rolls upward for as long as the die tumbles (620 ms), then lands on the new seed. DOM above (rolling-number), GPU below (the same reels drawn on the canvas).",
      seedRows,
      `${out}/seed.png`,
      300,
      6,
    )
}

console.log(errors.length ? errors.join("\n") : "no errors")
await browser.close()
