// The Lab page (labPreset: square, flat, compact) with the header's quiet tools and folding history,
// the in-place number edit, the bottom-edge notch and one row lit at a time, in both renderers.
// Checks what it shows and writes OUT/<PREFIX>lab-<mode>.png. URL reuses a running examples server.
import { chromium, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const base = process.env.URL || "http://127.0.0.1:4010"
const out = process.env.OUT || "test-results/lab"
const prefix = process.env.PREFIX ?? ""
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const failures: string[] = []
const check = (what: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failures.push(`${what} ${JSON.stringify(detail)}`)
}

type Shot = { caption: string; png: string; over?: string }
const sheet = async (title: string, shots: Shot[], path: string) => {
  const img = (png: string) =>
    `<img style="display:block;max-width:560px" src="data:image/png;base64,${png}">`
  const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">${title}</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start">${shots
      .map(
        (s) =>
          `<figure style="margin:0">${
            s.over
              ? `<div style="position:relative">${img(s.png)}<div style="position:absolute;inset:0;mix-blend-mode:difference">${img(s.over)}</div></div>`
              : img(s.png)
          }<figcaption>${s.caption}</figcaption></figure>`,
      )
      .join("")}</div></body>`
  const p = await browser.newPage({ deviceScaleFactor: 1 })
  await p.setViewportSize({ width: 1180, height: 300 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

for (const mode of ["dom", "gpu"] as const) {
  const page: Page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  page.on("pageerror", (e) => failures.push(`${mode} pageerror ${e.message}`))
  await page.goto(`${base}/lab.html${mode === "gpu" ? "?gpu" : ""}`)
  const station = page.locator('[data-controls="lab-station"]')
  await station.locator('[data-field="intensity"]').waitFor()
  await sleep(800)
  const shots: Shot[] = []
  const tag = (s: string) => `${mode}: ${s}`
  const whole = await page.screenshot()
  shots.push({ caption: tag("the Lab page"), png: whole.toString("base64") })
  const pb = (await station.boundingBox())!
  const hb = (await station.locator("header").boundingBox())!
  const headClip = { x: pb.x, y: hb.y - 2, width: pb.width, height: hb.height + 4 }
  const away = () => page.mouse.move(pb.x - 200, 10)
  const shot = async (clip: { x: number; y: number; width: number; height: number }) =>
    (await page.screenshot({ clip })).toString("base64")

  // Header: Random, Reset, Undo, Redo and ? (the Lab lists help); history folded until a change.
  await away()
  await sleep(400)
  const history = station.locator(".knobs-head-history")
  const historyW = async () => (await history.boundingBox())?.width ?? 0
  const visible = await station
    .locator("header button:not([hidden])")
    .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")))
  check(`${mode} lab header buttons`, visible.includes("Keyboard shortcuts"), visible)
  check(`${mode} history folded at rest`, (await historyW()) < 0.5, await historyW())
  const radius = await station
    .locator("header button")
    .first()
    .evaluate((b) => getComputedStyle(b).borderTopLeftRadius)
  check(`${mode} square header buttons`, radius === "0px", radius)
  shots.push({ caption: tag("header at rest"), png: await shot(headClip) })
  const intensity = station.locator('[data-field="intensity"]')
  const ib = (await intensity.boundingBox())!
  await page.mouse.move(ib.x + 30, ib.y + ib.height / 2)
  await sleep(400)
  shots.push({ caption: tag("header, panel hovered"), png: await shot(headClip) })
  await intensity.locator(".knobs-track").focus()
  await page.keyboard.press("ArrowRight")
  await page.mouse.move(ib.x + 31, ib.y + ib.height / 2)
  await sleep(700)
  check(`${mode} history unfolds`, (await historyW()) > 20, await historyW())
  shots.push({ caption: tag("header with history"), png: await shot(headClip) })

  // The notch, on hover: at the row's bottom edge.
  const rowClip = { x: ib.x, y: ib.y, width: ib.width, height: ib.height }
  shots.push({ caption: tag("intensity hovered (notch)"), png: await shot(rowClip) })
  const notch = await intensity.evaluate((r) => {
    const n = r.querySelector(".knobs-notch")!.getBoundingClientRect()
    const b = r.getBoundingClientRect()
    return { bottom: b.bottom - n.bottom, h: n.height }
  })
  check(`${mode} notch at the bottom edge`, Math.abs(notch.bottom) < 0.5 && notch.h <= 6, notch)

  // In-place edit: same type, same right edge.
  await away()
  await sleep(400)
  const display = await shot(rowClip)
  await intensity.locator(".knobs-value").click()
  await page.keyboard.press("ArrowRight")
  await away()
  await sleep(500)
  const field = intensity.locator(".knobs-number")
  const fit = await intensity.evaluate((r) => {
    const f = r.querySelector<HTMLInputElement>(".knobs-number")!
    const v = r.querySelector(".knobs-value")!
    const d = r.querySelector(".knobs-digits")!.getBoundingClientRect()
    const fs = getComputedStyle(f)
    const fr = f.getBoundingClientRect()
    return {
      size: [fs.fontSize, getComputedStyle(v).fontSize],
      family: [fs.fontFamily, getComputedStyle(v).fontFamily],
      right: fr.right - parseFloat(fs.paddingRight) - d.right,
      box: [fs.borderBottomWidth, fs.backgroundColor],
    }
  })
  check(`${mode} edit font`, fit.size[0] === fit.size[1] && fit.family[0] === fit.family[1], fit)
  check(`${mode} edit right edge`, Math.abs(fit.right) < 0.5, fit)
  check(`${mode} edit has no box`, fit.box[0] === "0px", fit)
  check(`${mode} edit focused`, await field.evaluate((f) => f === document.activeElement))
  const editing = await shot(rowClip)
  shots.push({ caption: tag("editing (caret at the end)"), png: editing })
  shots.push({ caption: tag("display ⊖ editing (black: no shift)"), png: display, over: editing })
  await page.keyboard.press("Escape")
  await sleep(300)

  // One row lit at a time: keyboard focus on intensity, the pointer on the next row.
  const rows = station.locator(".knobs-card > *")
  await intensity.locator(".knobs-track").focus()
  await page.keyboard.press("ArrowLeft")
  const next = (await rows.nth(1).boundingBox())!
  await page.mouse.move(next.x + next.width * 0.6, next.y + next.height / 2)
  await sleep(500)
  const wash = await intensity.evaluate((r) => getComputedStyle(r, "::after").opacity)
  if (mode === "dom") check(`${mode} focus wash steps aside`, wash === "0", wash)
  const card = (await station.locator(".knobs-card").first().boundingBox())!
  shots.push({
    caption: tag("focus on intensity, pointer on the next row"),
    png: await shot({ x: card.x, y: card.y, width: card.width, height: next.height * 3 }),
  })
  await sheet(`Lab (labPreset) after the merge, ${mode}`, shots, `${out}/${prefix}lab-${mode}.png`)
  await page.close()
}
await browser.close()
console.log(failures.length ? failures.join("\n") : "lab: all checks passed")
process.exit(failures.length ? 1 : 0)
