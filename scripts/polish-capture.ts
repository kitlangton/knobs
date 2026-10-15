// Proof sheets for the Halftone panel's header, copy, inline edit, default notch and row washes,
// in both renderers. The page's clock (performance.now, frame times, timers) and its CSS
// animations run at RATE (0.25) while a sequence is filmed, so its frames are close together;
// each frame is captioned with the page's own time. Writes OUT/<PREFIX>polish-<label>.json and,
// with SHEET=before.json,after.json, one sheet per topic: OUT/<PREFIX><topic>.png, a row per
// label. URL reuses a running examples server.
import { chromium, type CDPSession, type Page } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const base = process.env.URL || "http://127.0.0.1:4010"
const out = process.env.OUT || "test-results/polish"
const prefix = process.env.PREFIX ?? ""
const label = process.env.LABEL || "now"
const rate = Number(process.env.RATE) || 0.25
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })

type Frame = { caption: string; png: string; over?: string }
type Topics = Record<string, Frame[]>
const TITLES: Record<string, string> = {
  header:
    "Header: at rest (pointer away), panel hovered, after a change (history), an icon hovered",
  copy: "Copy: the header's copy button, clicked (page time after the click)",
  edit: "Inline number edit (radius): display, editing, both overlaid as a difference (black = no shift), typed 123, then Enter",
  notch:
    "Default notch (radius, default 4): keyboard focus, at rest, row hovered, dragged onto the default",
  wash: "Frame 6: focus on cells, pointer resting on radius, ] (next preset), the pointer nudged 1px",
  sweep: "Hover moving down the rows (cells → radius → phase) during a preset glide",
}

if (process.env.SHEET) {
  const files = process.env.SHEET.split(",")
  const sets = files.map((f) => JSON.parse(readFileSync(`${out}/${f}`, "utf8")) as Topics)
  const p = await browser.newPage({ deviceScaleFactor: 1 })
  for (const topic of Object.keys(sets[0]!)) {
    for (const mode of ["dom", "gpu"]) {
      const rows = sets.map((s, i) => ({
        name: files[i]!.replace(/.*polish-|\.json/g, ""),
        frames: (s[topic] ?? []).filter((f) => f.caption.startsWith(`${mode} `)),
      }))
      if (!rows.some((r) => r.frames.length)) continue
      const width = 440
      const img = (png: string) =>
        `<img style="display:block;width:${width}px" src="data:image/png;base64,${png}">`
      const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
        <div style="font-size:14px;color:#eee;margin-bottom:8px">${TITLES[topic] ?? topic} (${mode})</div>
        ${rows
          .map(
            (r) => `<div style="color:#eee;margin:10px 0 4px">${r.name}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${r.frames
            .map(
              (f) =>
                `<figure style="margin:0">${
                  f.over
                    ? `<div style="position:relative">${img(f.png)}<div style="position:absolute;inset:0;mix-blend-mode:difference">${img(f.over)}</div></div>`
                    : img(f.png)
                }<figcaption>${f.caption.slice(mode.length + 1)}</figcaption></figure>`,
            )
            .join("")}</div>`,
          )
          .join("")}</body>`
      await p.setViewportSize({ width: (width > 300 ? 4 : 7) * (width + 6) + 24, height: 300 })
      await p.setContent(html)
      await p.screenshot({ path: `${out}/${prefix}${topic}-${mode}.png`, fullPage: true })
    }
  }
  await browser.close()
  process.exit(0)
}

const topics: Topics = {}
const push = (topic: string, caption: string, png: Buffer, over?: Buffer) =>
  (topics[topic] ??= []).push({
    caption,
    png: png.toString("base64"),
    ...(over ? { over: over.toString("base64") } : {}),
  })

/** Page time (ms) and CSS animations run at `r` of real time from now on. */
const setRate = async (page: Page, cdp: CDPSession, r: number) => {
  await page.evaluate((r) => (window as any).__rate(r), r)
  await cdp.send("Animation.setPlaybackRate", { playbackRate: r })
}
const now = (page: Page) => page.evaluate(() => performance.now())

for (const mode of ["dom", "gpu"] as const) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  })
  await page.addInitScript(() => {
    const real = performance.now.bind(performance)
    let r = 1
    let from = 0
    let at = 0
    const now = () => at + (real() - from) * r
    const timeout = window.setTimeout.bind(window)
    Object.assign(window, {
      __rate: (next: number) => {
        at = now()
        from = real()
        r = next
      },
    })
    performance.now = now
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf(() => cb(now()))
    window.setTimeout = ((fn: TimerHandler, ms = 0, ...rest: unknown[]) =>
      timeout(fn, ms / r, ...rest)) as typeof setTimeout
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await page.goto(`${base}/?${mode}`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"))
  const study = page.locator('[data-study="halftone"]')
  const sb = (await study.boundingBox())!
  await study.hover({ position: { x: sb.width - 20, y: 60 } })
  await sleep(300)
  await page.locator('.knobs-chip[aria-label="Tune halftone"]').click()
  const panel = page.getByRole("dialog", { name: "halftone controls", exact: true })
  await panel.waitFor()
  await sleep(900)
  const pb = (await panel.boundingBox())!
  const head = panel.locator("header")
  const hb = (await head.boundingBox())!
  const headClip = { x: pb.x, y: hb.y - 6, width: pb.width, height: hb.height + 12 }
  const panelClip = { x: pb.x - 4, y: pb.y - 4, width: pb.width + 8, height: pb.height + 60 }
  const sliders = panel.locator(".knobs-slider")
  const rb = (await sliders.nth(1).boundingBox())!
  const rowClip = { x: rb.x, y: rb.y, width: rb.width, height: rb.height }
  const cards = panel.locator(".knobs-card").first()
  const cb = (await cards.boundingBox())!
  const cardClip = { x: cb.x, y: cb.y, width: cb.width, height: rb.height * 3 }
  const shot = (clip: { x: number; y: number; width: number; height: number }) =>
    page.screenshot({ clip })
  const away = () => page.mouse.move(pb.x + pb.width + 200, pb.y + 40)
  const tag = (s: string) => `${mode} ${s}`

  // Header
  await away()
  await sleep(500)
  push("header", tag("rest"), await shot(headClip))
  await page.mouse.move(rb.x + 40, rb.y + rb.height / 2)
  await sleep(500)
  push("header", tag("panel hovered"), await shot(headClip))
  // Washes: focus on cells, pointer on radius, the next preset, then a 1px nudge.
  const film = async (
    topic: string,
    steps: Record<number, () => Promise<unknown>>,
    times: number[],
  ) => {
    await setRate(page, cdp, rate)
    const t = await now(page)
    const pending = Object.entries(steps)
      .map(([k, f]) => [Number(k), f] as const)
      .sort((a, b) => a[0] - b[0])
    for (const at of times) {
      while ((await now(page)) - t < at) {
        if (pending.length && (await now(page)) - t >= pending[0]![0]) await pending.shift()![1]()
        await sleep(4)
      }
      while (pending.length && (await now(page)) - t >= pending[0]![0]) await pending.shift()![1]()
      push(topic, tag(`${Math.round((await now(page)) - t)} ms`), await shot(cardClip))
    }
    await setRate(page, cdp, 1)
    await sleep(800)
  }
  const cellsTrack = panel.locator(".knobs-track").first()
  await cellsTrack.focus()
  await page.mouse.move(rb.x + rb.width * 0.7, rb.y + rb.height - 3)
  await sleep(400)
  await film(
    "wash",
    {
      0: () => page.keyboard.press("]"),
      60: () => page.mouse.move(rb.x + rb.width * 0.7 + 1, rb.y + rb.height - 3),
    },
    [0, 40, 90, 140, 200, 280, 400, 700],
  )
  const ys = [0.5, 1.5, 2.5].map((k) => cb.y + rb.height * k)
  await page.mouse.move(rb.x + rb.width * 0.7, ys[0]!)
  await sleep(300)
  await film(
    "sweep",
    {
      0: () => page.keyboard.press("]"),
      50: () => page.mouse.move(rb.x + rb.width * 0.7, ys[1]!, { steps: 3 }),
      150: () => page.mouse.move(rb.x + rb.width * 0.7, ys[2]!, { steps: 3 }),
    },
    [0, 40, 80, 120, 160, 200, 260, 340, 500],
  )
  await page.keyboard.press("ArrowRight")
  await page.mouse.move(rb.x + 41, rb.y + rb.height / 2)
  await sleep(600)
  push("header", tag("with history"), await shot(headClip))
  const copyBtn = panel.getByRole("button", { name: "Copy", exact: true })
  const cbb = (await copyBtn.boundingBox())!
  await page.mouse.move(cbb.x + cbb.width / 2, cbb.y + cbb.height / 2)
  await sleep(500)
  push("header", tag("copy hovered"), await shot(headClip))

  // Copy: the click, filmed slowly.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await setRate(page, cdp, rate)
  const t0 = await now(page)
  await page.mouse.down()
  await page.mouse.up()
  for (const at of [0, 60, 120, 200, 320, 600, 1100, 1300, 1450, 1650, 2000]) {
    while ((await now(page)) - t0 < at) await sleep(4)
    push("copy", tag(`${Math.round((await now(page)) - t0)} ms`), await shot(headClip))
    if (at === 600) push("copy", tag("600 ms, the whole panel"), await shot(panelClip))
  }
  await setRate(page, cdp, 1)
  await sleep(3500)

  // Inline edit
  await away()
  await sleep(400)
  await page.keyboard.press("ArrowLeft")
  await sleep(500)
  const display = await shot(rowClip)
  push("edit", tag("display"), display)
  await panel.locator(".knobs-value").nth(1).click()
  await page.mouse.move(pb.x + pb.width + 200, pb.y + 40)
  await sleep(500)
  const editing = await shot(rowClip)
  push("edit", tag("editing"), editing)
  push("edit", tag("display ⊖ editing"), display, editing)
  await page.keyboard.press("ArrowRight")
  await sleep(150)
  const caret = await shot(rowClip)
  push("edit", tag("caret at the end"), caret)
  push("edit", tag("display ⊖ caret at the end"), display, caret)
  await page.keyboard.press("ControlOrMeta+A")
  await page.keyboard.type("123")
  await sleep(200)
  push("edit", tag("typed 123"), await shot(rowClip))
  await setRate(page, cdp, rate)
  const t1 = await now(page)
  await page.keyboard.press("Enter")
  for (const at of [0, 80, 160, 260, 400]) {
    while ((await now(page)) - t1 < at) await sleep(4)
    push("edit", tag(`Enter +${Math.round((await now(page)) - t1)} ms`), await shot(rowClip))
  }
  await setRate(page, cdp, 1)
  await sleep(600)

  // Default notch
  await page.keyboard.press("Home")
  await sleep(500)
  await away()
  await sleep(500)
  push("notch", tag("keyboard focus, pointer away"), await shot(rowClip))
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await sleep(500)
  push("notch", tag("rest"), await shot(rowClip))
  await page.mouse.move(rb.x + 30, rb.y + rb.height / 2)
  await sleep(500)
  push("notch", tag("hovered"), await shot(rowClip))
  const fillX = rb.x + 2
  const def = rb.x + rb.width * (3 / 7)
  await page.mouse.move(fillX, rb.y + rb.height / 2)
  await page.mouse.down()
  await page.mouse.move(def - 30, rb.y + rb.height / 2, { steps: 6 })
  await page.mouse.move(def, rb.y + rb.height / 2, { steps: 6 })
  await sleep(300)
  push("notch", tag("on the default (magnet)"), await shot(rowClip))
  await page.mouse.up()
  await sleep(400)

  await page.close()
}
writeFileSync(`${out}/${prefix}polish-${label}.json`, JSON.stringify(topics))
await browser.close()
