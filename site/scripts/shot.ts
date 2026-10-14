// Headless screenshots of the docs site: bun site/scripts/shot.ts <base> <out-prefix> [paths...]
// Each path (such as / or /#theming) is captured at 1440×900 and 390×844 in light and dark.
// Console errors are printed.
import { chromium } from "@playwright/test"

const [base = "http://127.0.0.1:5196", prefix = "/tmp/knobs-docs", ...paths] = process.argv.slice(2)
const browser = await chromium.launch()
const sizes = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
]
let failed = false
for (const path of paths.length ? paths : ["/"]) {
  for (const size of sizes)
    for (const scheme of ["dark", "light"] as const) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: scheme,
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()
      page.on("console", (m) => {
        if (m.type() === "error") {
          failed = true
          console.log(`[${path} ${size.name} ${scheme}] console: ${m.text()}`)
        }
      })
      page.on("pageerror", (e) => {
        failed = true
        console.log(`[${path} ${size.name} ${scheme}] error: ${e.message}`)
      })
      await page.goto(base + path, { waitUntil: "networkidle" })
      await page.waitForTimeout(1600)
      const name = path === "/" ? "top" : path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      const file = `${prefix}-${name}-${size.name}-${scheme}.png`
      await page.screenshot({ path: file })
      console.log(file)
      await context.close()
    }
}
await browser.close()
process.exit(failed ? 1 : 0)
