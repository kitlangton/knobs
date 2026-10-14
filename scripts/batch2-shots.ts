// Proof shots for locks, selection, the context menu, group dice, mutate rolls and compare, in both
// renderers and themes, on the home page's remote-tune workbench (springs, curves, colours, points).
// BASE=http://127.0.0.1:5196 OUT=dir bun scripts/batch2-shots.ts
import { chromium, type Locator, type Page } from "@playwright/test"

const base = process.env.BASE ?? "http://127.0.0.1:5196"
const out = process.env.OUT ?? "/tmp"
const prefix = process.env.PREFIX ?? ""
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
for (const mode of (process.env.MODES ?? "dom,gpu").split(",")) {
  for (const theme of (process.env.THEMES ?? "dark,light").split(",")) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
      deviceScaleFactor: 2,
    })
    page.on("pageerror", (e) => errors.push(`${mode}/${theme}: ${e.message}`))
    page.on("console", (m) => m.type() === "error" && errors.push(`${mode}/${theme}: ${m.text()}`))
    await page.goto(`${base}/${mode === "gpu" ? "?gpu" : "?dom"}`)
    await page.evaluate((theme) => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem("knobs-example-theme", theme)
    }, theme)
    await page.reload()
    await page.getByRole("button", { name: theme, exact: true }).click()
    const panel = page.getByRole("region", { name: "remote-tune controls" })
    await panel.scrollIntoViewIfNeeded()
    await sleep(700)
    console.log(
      mode,
      theme,
      await panel.evaluate((el) => [el.dataset.renderer, el.dataset.gpuActive]),
    )
    await shots(page, panel, `${prefix}${mode}-${theme}`)
    await page.close()
  }
}
console.log(errors.length ? errors : "errors: []")
await browser.close()

async function shots(page: Page, panel: Locator, tag: string) {
  const shot = async (name: string) => {
    const b = (await panel.boundingBox())!
    await page.screenshot({
      path: `${out}/${name}-${tag}.png`,
      clip: { x: b.x - 12, y: b.y - 12, width: b.width + 240, height: b.height + 24 },
    })
  }
  const away = async () => {
    await page.mouse.move(2, 2)
    await sleep(350)
  }
  const field = (key: string) => panel.locator(`[data-field="${key}"]`)

  // Locks: the spring and the colour, from the keyboard.
  await panel.getByRole("slider", { name: "Drawer duration" }).focus()
  await page.keyboard.press("Shift+L")
  await panel.getByRole("button", { name: "Tint", exact: true }).focus()
  await page.keyboard.press("Shift+L")
  await panel.getByRole("radiogroup", { name: "Chrome" }).focus()
  await page.keyboard.press("Shift+L")
  // Selection: ⇧-click a range.
  await panel.getByRole("slider", { name: "Edge fade" }).focus()
  await field("composer.anchor").click({ modifiers: ["Shift"], position: { x: 30, y: 12 } })
  await away()
  await shot("selection")
  // The context menu on it, opened from the keyboard.
  await page.keyboard.press("Shift+F10")
  await sleep(250)
  await page.keyboard.press("ArrowDown")
  await sleep(120)
  await shot("menu")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await away()
  await shot("locks")
  // The Motion group's die mid-roll; a mutate's quarter turn on the header die (⌥R).
  const die = panel.getByRole("button", { name: "Randomize Surface" })
  await die.hover()
  await sleep(250)
  await shot("group-hover")
  await die.click()
  await sleep(80)
  await shot("group-roll")
  await sleep(700)
  await panel.getByRole("slider", { name: "Edge fade" }).focus()
  await away()
  await page.keyboard.press("Alt+r")
  await sleep(60)
  await shot("mutate-roll")
  await sleep(800)
  // Holding \ shows the values from before; the title dims.
  await page.keyboard.down("\\")
  await sleep(450)
  await shot("compare")
  await page.keyboard.up("\\")
}
