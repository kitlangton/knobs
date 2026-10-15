// Frame sheets of the header's Copy → check → back and Reset's ↺ turn (one press, then a double
// press), in both renderers, dark and light, DPR 1 and 2, the default look and labPreset (set on
// the Halftone panel, whose header has Copy). The page's clock and CSS animations run at RATE
// while a sequence is filmed; captions are page time. Writes OUT/<PREFIX>copy.png and
// OUT/<PREFIX>reset.png. URL reuses a running examples server.
import { chromium, type CDPSession, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const base = process.env.URL || "http://127.0.0.1:4010"
const out = process.env.OUT || "test-results/header2"
const prefix = process.env.PREFIX ?? ""
const rate = Number(process.env.RATE) || 0.25
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const root = new URL("..", import.meta.url).pathname

type Row = { name: string; frames: { caption: string; png: string }[] }
const sheet = async (title: string, rows: Row[], path: string) => {
  const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">${title}</div>
    ${rows
      .map(
        (r) => `<div style="color:#eee;margin:10px 0 4px">${r.name}</div>
      <div style="display:flex;gap:4px">${r.frames
        .map(
          (f) =>
            `<figure style="margin:0"><img style="display:block;width:150px" src="data:image/png;base64,${f.png}"><figcaption>${f.caption}</figcaption></figure>`,
        )
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 2 })
  await p.setViewportSize({ width: 12 * 154 + 24, height: 300 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

const setRate = async (page: Page, cdp: CDPSession, r: number) => {
  await page.evaluate((r) => (window as any).__rate(r), r)
  await cdp.send("Animation.setPlaybackRate", { playbackRate: r })
}
const now = (page: Page) => page.evaluate(() => performance.now())

async function open(mode: string, theme: string, dpr: number, look: string) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: dpr,
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
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await page.goto(`${base}/?${mode}`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
  const study = page.locator('[data-study="halftone"]')
  const sb = (await study.boundingBox())!
  await study.hover({ position: { x: sb.width - 20, y: 60 } })
  await sleep(300)
  await page.locator('.knobs-chip[aria-label="Tune halftone"]').click()
  const panel = page.getByRole("dialog", { name: "halftone controls", exact: true })
  await panel.waitFor()
  await sleep(900)
  await panel.evaluate((el, t) => ((el as HTMLElement).dataset.theme = t), theme)
  if (look === "lab")
    await panel.evaluate(async (el, src) => {
      const { labPreset, presetCss } = await import(
        /* @vite-ignore */ `/@fs${src}src/themes/index.ts`
      )
      const style = document.createElement("style")
      style.textContent = presetCss(labPreset)
      document.head.append(style)
      ;(el as HTMLElement).dataset.preset = "lab"
    }, root)
  await sleep(500)
  const hb = (await panel.locator("header").boundingBox())!
  const actions = (await panel.locator(".knobs-head-actions").boundingBox())!
  const clip = { x: actions.x - 2, y: hb.y - 2, width: actions.width + 4, height: hb.height + 4 }
  return { page, cdp, panel, clip }
}

/** Films `act` at RATE: a frame at each of `times` (page ms after it). */
async function film(
  o: Awaited<ReturnType<typeof open>>,
  times: number[],
  act: () => Promise<unknown>,
  later: Record<number, () => Promise<unknown>> = {},
) {
  const frames: Row["frames"] = []
  await setRate(o.page, o.cdp, rate)
  const t0 = await now(o.page)
  await act()
  const pending = Object.entries(later).map(([k, f]) => [Number(k), f] as const)
  for (const at of times) {
    while ((await now(o.page)) - t0 < at) {
      if (pending.length && (await now(o.page)) - t0 >= pending[0]![0]) await pending.shift()![1]()
      await sleep(4)
    }
    frames.push({
      caption: `${Math.round((await now(o.page)) - t0)} ms`,
      png: (await o.page.screenshot({ clip: o.clip })).toString("base64"),
    })
  }
  await setRate(o.page, o.cdp, 1)
  return frames
}

const copyRows: Row[] = []
const resetRows: Row[] = []
for (const look of ["default", "lab"])
  for (const theme of ["dark", "light"])
    for (const dpr of [2, 1])
      for (const mode of ["dom", "gpu"]) {
        const o = await open(mode, theme, dpr, look)
        const name = `${mode} · ${theme} · DPR ${dpr} · ${look}`
        const copy = o.panel.getByRole("button", { name: "Copy", exact: true })
        const cb = (await copy.boundingBox())!
        await o.page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
        await sleep(300)
        copyRows.push({
          name,
          frames: await film(o, [0, 60, 120, 200, 320, 700, 1200, 1300, 1400, 1550, 1800], () =>
            copy.click(),
          ),
        })
        await sleep(2500)
        if (theme === "dark" && look === "default") {
          const reset = o.panel.getByRole("button", { name: "Reset", exact: true })
          const track = o.panel.getByRole("slider", { name: "cells" })
          for (const presses of [1, 2, 0]) {
            // 0: one press with reduced motion (a blink, no turn).
            if (presses === 0) await o.page.emulateMedia({ reducedMotion: "reduce" })
            await track.focus()
            await o.page.keyboard.press("ArrowRight")
            await sleep(300)
            // Undo and redo have folded in by now: the crop follows the buttons, Random to close.
            const ab = (await o.panel.locator(".knobs-head-actions").boundingBox())!
            o.clip.x = ab.x - 2
            o.clip.width = ab.width + 4
            const rb = (await reset.boundingBox())!
            await o.page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
            await sleep(300)
            resetRows.push({
              name: `${name} · ${["reduced motion", "one press", "a second press at 150 ms"][presses]}`,
              frames: await film(
                o,
                [0, 40, 80, 120, 160, 200, 260, 330, 420, 520, 650, 800],
                () => o.page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2),
                presses === 2
                  ? { 150: () => o.page.mouse.click(rb.x + rb.width / 2, rb.y + rb.height / 2) }
                  : {},
              ),
            })
            await sleep(1500)
          }
        }
        await o.page.close()
      }
await sheet(
  "Copy → check → back (the header's tools, Copy hovered then clicked)",
  copyRows,
  `${out}/${prefix}copy.png`,
)
await sheet(
  "Reset ↺: one turn per press (smooth spring, .45 s, bounce 0); a second press mid-turn adds one",
  resetRows,
  `${out}/${prefix}reset.png`,
)
await browser.close()
