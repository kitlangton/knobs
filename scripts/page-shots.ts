// Screenshots of the full-page demo (examples/tune.html) in both renderers and themes.
// bun scripts/page-shots.ts --port=5307 [--out=dir] [--only=dom-dark-1440]
import { chromium, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const port = Number(arg("port") ?? 5307)
const out =
  arg("out") ?? "/private/var/folders/4t/_jnrck017r5f_jttbc19b7s40000gn/T/opencode/page-shots"
const only = arg("only")
const prefix = arg("prefix") ?? ""
mkdirSync(out, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
async function open(mode: "dom" | "gpu", theme: "dark" | "light", w: number, h: number) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    colorScheme: theme,
  })
  const page = await context.newPage()
  page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`))
  await page.goto(
    `http://127.0.0.1:${port}/tune.html?theme=${theme}${mode === "gpu" ? "&gpu" : ""}`,
  )
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.locator(".knobs-page").waitFor()
  if (mode === "gpu")
    await page.waitForFunction(
      () => document.querySelector(".knobs-page")?.getAttribute("data-gpu-active") === "true",
    )
  await sleep(900)
  return { page, context }
}
async function shot(page: Page, name: string) {
  const path = `${out}/${prefix}${name}.png`
  await page.screenshot({ path })
  console.log(path)
}

for (const mode of ["dom", "gpu"] as const)
  for (const theme of ["dark", "light"] as const)
    for (const [w, h] of [
      [1440, 900],
      [1920, 1080],
    ] as const) {
      const name = `${mode}-${theme}-${w}`
      if (only && !name.startsWith(only)) continue
      const { page, context } = await open(mode, theme, w, h)
      await shot(page, name)
      await context.close()
    }

if (!only || only === "focus") {
  for (const mode of ["dom", "gpu"] as const) {
    const { page, context } = await open(mode, "dark", 1440, 900)
    // Focus moving across cards, a numbered preset applied, the page scrolled under its header.
    await page.getByRole("slider", { name: "Row height" }).focus()
    await page.keyboard.press("j")
    await page.keyboard.press("j")
    await page.keyboard.press("3")
    await sleep(120)
    await shot(page, `${mode}-focus-preset-mid`)
    await sleep(700)
    await shot(page, `${mode}-focus-preset`)
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await sleep(900)
    await shot(page, `${mode}-scrolled`)
    await context.close()
  }
}
console.log(errors.length ? errors : "errors: []")
await browser.close()
