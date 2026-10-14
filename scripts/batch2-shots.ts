// Proof shots for locks, selection, the context menu, group dice and mutate rolls, both renderers.
import { chromium, type Page } from "@playwright/test"

const base = process.env.BASE ?? "http://127.0.0.1:5196"
const out = process.env.OUT ?? "/tmp"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
for (const mode of (process.env.MODES ?? "dom,gpu").split(",")) {
  for (const theme of (process.env.THEMES ?? "dark,light").split(",")) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: theme as "dark" | "light",
    })
    page.on("pageerror", (e) => errors.push(`${mode}/${theme}: ${e.message}`))
    page.on("console", (m) => m.type() === "error" && errors.push(`${mode}/${theme}: ${m.text()}`))
    await page.goto(`${base}/meta.html${mode === "gpu" ? "?gpu" : ""}`)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await sleep(600)
    const synth = page.getByRole("region", { name: "synth-voice controls" })
    if (theme === "light")
      await synth.evaluate((el) => {
        el.dataset.theme = "light"
      })
    await sleep(400)
    const info = await synth.evaluate((el) => [el.dataset.renderer, el.dataset.gpuActive])
    console.log(mode, theme, info)
    await shots(page, synth, `${mode}-${theme}`)
    await page.close()
  }
}
console.log(errors.length ? errors : "errors: []")
await browser.close()

async function shots(page: Page, panel: ReturnType<Page["getByRole"]>, tag: string) {
  const box = async () => {
    const b = (await panel.boundingBox())!
    return { x: b.x - 16, y: b.y - 16, width: b.width + 260, height: b.height + 32 }
  }
  // Lock two rows from the keyboard and one from the menu.
  const cutoff = panel.getByRole("slider", { name: "Filter cutoff", exact: true })
  await cutoff.focus()
  await page.keyboard.press("Shift+L")
  const rows = panel.locator(".knobs-card > *")
  // Select a range with ⇧-click.
  const first = rows.nth(1)
  const third = rows.nth(3)
  await first.click({ modifiers: ["Shift"], position: { x: 30, y: 10 } })
  await third.click({ modifiers: ["Shift"], position: { x: 30, y: 10 } })
  await sleep(500)
  await page.mouse.move(5, 5)
  await sleep(300)
  await page.screenshot({ path: `${out}/selection-${tag}.png`, clip: await box() })
  // Context menu on the selection.
  const tb = (await third.boundingBox())!
  await page.mouse.click(tb.x + 60, tb.y + tb.height / 2, { button: "right" })
  await sleep(250)
  await page.keyboard.press("ArrowDown")
  await sleep(150)
  await page.screenshot({ path: `${out}/menu-${tag}.png`, clip: await box() })
  await page.keyboard.press("Enter")
  await sleep(400)
  await page.keyboard.press("Escape")
  await page.mouse.move(5, 5)
  await sleep(500)
  await page.screenshot({ path: `${out}/locks-${tag}.png`, clip: await box() })
  // Group die mid-roll and a mutate nudge.
  const die = panel.getByRole("button", { name: "Randomize Oscillator" })
  await die.click()
  await sleep(90)
  await page.screenshot({ path: `${out}/group-roll-${tag}.png`, clip: await box() })
  await sleep(700)
  await die.click({ modifiers: ["Alt"] })
  await sleep(70)
  await page.screenshot({ path: `${out}/group-mutate-${tag}.png`, clip: await box() })
  await sleep(700)
  await die.hover()
  await sleep(300)
  await page.screenshot({ path: `${out}/group-hover-${tag}.png`, clip: await box() })
}
