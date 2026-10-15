// Proof shots for Phase B (tabs, sections, inspector fields, the toolbar, search) on the Lab's
// inspector, in both renderers. BASE=http://127.0.0.1:4005 OUT=dir bun scripts/phaseb-shots.ts
import { chromium, type Locator, type Page } from "@playwright/test"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const out = process.env.OUT ?? "/tmp"
const only = process.env.ONLY
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []

async function open(mode: string) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2,
  })
  page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`))
  await page.goto(`${base}/lab.html${mode === "gpu" ? "?gpu" : ""}`)
  const panel = page.locator('[data-controls="lab-inspector"]')
  await panel.waitFor()
  await sleep(600)
  return { page, panel }
}
const clipOf = async (panel: Locator, pad = 8) => {
  const b = (await panel.boundingBox())!
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}
const shot = async (page: Page, panel: Locator, name: string) => {
  await page.screenshot({ path: `${out}/${name}.png`, clip: await clipOf(panel) })
}

for (const mode of (process.env.MODES ?? "dom,gpu").split(",")) {
  const { page, panel } = await open(mode)
  console.log(mode, await panel.evaluate((el) => [el.dataset.renderer, el.dataset.gpuActive]))
  const steps: [string, () => Promise<void>][] = [
    ["transform", async () => {}],
    [
      "emitter",
      async () => {
        await panel.getByRole("tab", { name: "Emitter" }).click()
        await page.mouse.move(2, 2)
        await sleep(500)
      },
    ],
    [
      "input",
      async () => {
        await panel.getByRole("tab", { name: "Input" }).click()
        await page.mouse.move(2, 2)
        await sleep(500)
      },
    ],
    [
      "search",
      async () => {
        await panel.getByRole("searchbox").fill("s")
        await sleep(500)
      },
    ],
  ]
  for (const [name, run] of steps) {
    if (only && !only.split(",").includes(name)) continue
    await run()
    await shot(page, panel, `${name}-${mode}`)
  }
  await page.close()
}
console.log(errors.length ? errors : "errors: []")
await browser.close()
