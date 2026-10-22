// Stills of the review catalog's pieces, dark, and a check that the page's keys still work: J and
// K step, F takes a step full-window (a diff's too) and Escape brings it back. Serves the examples
// with Vite on PORT (5393; the catalog's media are read from examples/assets, which a build
// doesn't copy), drives Brave or Chrome headless, writes PNGs and keys.json to OUT
// ($LEASE_OUT/stills).
//   node scripts/review-stills.mjs
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { chromium } from "playwright"

const PORT = Number(process.env.PORT) || 5393
const root = new URL("..", import.meta.url).pathname
const base = `http://127.0.0.1:${PORT}`
const OUT = process.env.OUT ?? `${process.env.LEASE_OUT ?? "/tmp"}/stills`
mkdirSync(OUT, { recursive: true })
const vite = spawn(
  `${root}node_modules/.bin/vite`,
  [
    "preview",
    "--config",
    "examples/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { cwd: root, stdio: "ignore", detached: true },
)
const stop = () => {
  try {
    process.kill(-vite.pid, "SIGTERM")
  } catch {}
}
process.on("exit", stop)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${base}/review.html`)).ok) break
  } catch {}
  if (i > 160) throw new Error("vite didn't start")
  await sleep(250)
}
const exe = [
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync)
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : { channel: "chromium" }),
  headless: false,
  args: ["--headless=new", "--enable-unsafe-webgpu", "--enable-gpu", "--window-size=1440,1000"],
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
})
const errors = []
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)))
await page.goto(`${base}/review.html`)
await page.waitForSelector(".knobs-wt-step")

const step = (title) =>
  page
    .locator(".knobs-wt-step")
    .filter({ has: page.getByText(title, { exact: true }) })
    .first()
/** Scrolls a step in, lets its media mount and settle, and saves it. */
async function shoot(title, name, before) {
  const s = step(title)
  await s.scrollIntoViewIfNeeded()
  await sleep(1500)
  if (before) await before(s)
  await s.screenshot({ path: `${OUT}/${name}.png` })
}

await shoot("Side by side", "compare-side-zoomed", async (s) => {
  // Zoomed into the same part of both, the pill in the corner; paused a second in.
  await s.locator(".knobs-cmp-stage").hover()
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".knobs-wt-step")].find((x) =>
      x.textContent.includes("Side by side"),
    )
    el?.querySelector(".knobs-compare")?.focus()
  })
  await page.keyboard.press("=")
  await page.keyboard.press("=")
  await sleep(800)
})
await shoot("Diff with its files", "diff-review")
await shoot("Diff", "diff")
await shoot("Code and terminal", "code-terminal")
await shoot("Metric", "metric")
await shoot("With chapters", "video-label")
await shoot("Two stills", "compare-stills-label")
await shoot("Four options", "decision")
const factsStep = page
  .locator(".knobs-wt-step")
  .filter({ has: page.locator(".knobs-wt-facts") })
  .first()
await factsStep.scrollIntoViewIfNeeded()
await sleep(800)
await factsStep.screenshot({ path: `${OUT}/facts.png` })

// Keys: J and K step from the Diff step, F takes it full-window and Escape brings it back.
const keys = {}
const current = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".knobs-wt-step[data-current]")]
        .find((el) => !el.closest(".knobs-wt-slot"))
        ?.getAttribute("aria-label") ?? null,
  )
await step("Diff").click({ position: { x: 4, y: 4 } })
await sleep(400)
keys.at = await current()
await page.locator("body").press("j")
await sleep(600)
keys.afterJ = await current()
await page.locator("body").press("k")
await sleep(600)
keys.afterK = await current()
await page.locator("body").press("f")
await sleep(700)
keys.full = await page.evaluate(() => Boolean(document.querySelector(".knobs-wt-step[data-full]")))
await page.screenshot({ path: `${OUT}/diff-full.png` })
await page.keyboard.press("Escape")
await sleep(2000)
keys.fullAfterEscape = await page.evaluate(() =>
  Boolean(document.querySelector(".knobs-wt-step[data-full]")),
)
keys.errors = errors
writeFileSync(`${OUT}/keys.json`, JSON.stringify(keys, null, 2))
console.log(JSON.stringify(keys, null, 2))
await browser.close()
stop()
process.exit(0)
