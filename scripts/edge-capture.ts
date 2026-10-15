// Zoomed crops of a floating panel at rest, its edge and its selected preset pill, in both renderers
// and both themes, at DPR 2. Writes OUT/<PREFIX>edges-<label>.json (crops as base64 PNG) and, with
// SHEET=before.json,after.json, a side-by-side sheet OUT/<PREFIX>edges.png. URL reuses a running
// examples server.
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const base = process.env.URL || "http://127.0.0.1:4010"
const out = process.env.OUT || "test-results/edges"
const prefix = process.env.PREFIX ?? ""
const label = process.env.LABEL || "now"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })

if (process.env.SHEET) {
  const sets = process.env.SHEET.split(",").map(
    (f) => JSON.parse(readFileSync(`${out}/${f}`, "utf8")) as Record<string, string>,
  )
  const names = Object.keys(sets[0]!)
  const html = `<body style="margin:0;background:#111;color:#bbb;font:12px system-ui;padding:12px">
    <div style="font-size:14px;color:#eee;margin-bottom:8px">Panel edge and selected preset pill at rest, DPR 2, magnified (one device pixel = 2 sheet px)</div>
    <table style="border-spacing:8px">
    <tr><td></td>${process.env.SHEET.split(",")
      .map((f) => `<td style="color:#eee">${f.replace(/.*edges-|\.json/g, "")}</td>`)
      .join("")}</tr>
    ${names
      .map(
        (n) =>
          `<tr><td style="color:#eee;vertical-align:middle">${n}</td>${sets
            .map(
              (s) =>
                `<td><img style="display:block;width:600px;image-rendering:pixelated" src="data:image/png;base64,${s[n]}"></td>`,
            )
            .join("")}</tr>`,
      )
      .join("")}</table></body>`
  const p = await browser.newPage({ deviceScaleFactor: 2 })
  await p.setViewportSize({ width: 140 + sets.length * 616, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path: `${out}/${prefix}edges.png`, fullPage: true })
} else {
  const crops: Record<string, string> = {}
  for (const mode of ["dom", "gpu"] as const) {
    for (const theme of ["dark", "light"] as const) {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 2,
      })
      await page.goto(`${base}/?${mode}`)
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      await page.reload()
      const study = page.locator('[data-study="typography"]')
      const b = (await study.boundingBox())!
      await study.hover({ position: { x: b.width - 20, y: 60 } })
      await sleep(300)
      await page.getByRole("button", { name: "Tune typography", exact: true }).click()
      const panel = page.getByRole("dialog", { name: "typography controls", exact: true })
      await panel.waitFor()
      if (theme === "light") await panel.evaluate((el) => (el.dataset.theme = "light"))
      await page.mouse.move(5, 5)
      await sleep(900)
      const r = (await panel.boundingBox())!
      const png = await page.screenshot({
        clip: { x: r.x - 6, y: r.y - 6, width: 150, height: 66 },
      })
      crops[`${mode} ${theme}`] = png.toString("base64")
      await page.close()
    }
  }
  writeFileSync(`${out}/${prefix}edges-${label}.json`, JSON.stringify(crops))
}
await browser.close()
