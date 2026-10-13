// Records transitions frame by frame (Chrome screencast) for both renderers.
// Frames land in test-results/film/<scene>-<mode>/<ms>.jpg; lay them out with any contact-sheet tool.
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"

const port = 5193
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function openSplat(page: Page) {
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await sleep(250)
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.waitFor()
  return panel
}

type Scene = {
  name: string
  path: string
  /** Region to crop to, computed after setup. */
  setup(page: Page): Promise<() => Promise<{ x: number; y: number; width: number; height: number }>>
  act(page: Page): Promise<void>
  ms: number
}

const scenes: Scene[] = [
  {
    name: "open-close",
    path: "/",
    async setup(page) {
      const study = page.locator('[data-study="splat"]')
      return async () => ({ ...(await study.boundingBox())!, width: 900, height: 520 })
    },
    async act(page) {
      const panel = await openSplat(page)
      await sleep(500)
      await panel.press("Escape")
    },
    ms: 1600,
  },
  {
    name: "roll",
    path: "/",
    async setup(page) {
      const panel = await openSplat(page)
      await sleep(400)
      // Slow motion through the roll-speed token, which both renderers read.
      await page.evaluate(() => document.documentElement.style.setProperty("--k-roll", "1800"))
      await panel.getByRole("slider", { name: "count" }).focus()
      return async () => {
        const b = (await panel.locator('[data-field="count"]').boundingBox())!
        return { x: b.x + b.width - 70, y: b.y - 4, width: 70, height: b.height + 8 }
      }
    },
    async act(page) {
      await page.keyboard.press("Shift+ArrowRight")
      await sleep(2200)
      await page.keyboard.press("Shift+ArrowLeft")
    },
    ms: 2400,
  },
  {
    name: "choice-preset",
    path: "/",
    async setup(page) {
      const panel = await openSplat(page)
      await sleep(400)
      return async () => (await panel.boundingBox())!
    },
    async act(page) {
      const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
      await panel.getByRole("radio", { name: "clean" }).click()
      await sleep(350)
      await panel.getByRole("radio", { name: "heavy" }).click()
      await sleep(350)
      await panel.getByRole("button", { name: "Keyboard shortcuts" }).click()
      await sleep(500)
      await panel.getByRole("button", { name: "Keyboard shortcuts" }).click()
    },
    ms: 2200,
  },
  {
    name: "theme",
    path: "/meta.html",
    async setup(page) {
      const panel = page.getByRole("region", { name: "knobs-tokens controls" })
      return async () => {
        const b = (await panel.boundingBox())!
        return { ...b, height: 360 }
      }
    },
    async act(page) {
      const panel = page.getByRole("region", { name: "knobs-tokens controls" })
      await panel.getByRole("radio", { name: "light" }).click()
      await sleep(600)
      await panel.getByRole("radio", { name: "dark" }).click()
    },
    ms: 1400,
  },
]

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const only = process.argv.slice(2)
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  for (const mode of ["dom", "gpu"]) {
    for (const scene of scenes) {
      if (only.length && !only.includes(scene.name)) continue
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 2,
      })
      await page.goto(`http://127.0.0.1:${port}${scene.path}${mode === "gpu" ? "?gpu" : "?dom"}`)
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await sleep(600)
      const region = await scene.setup(page)
      const box = await region()
      const dir = `test-results/film/${scene.name}-${mode}`
      mkdirSync(dir, { recursive: true })
      const cdp = await page.context().newCDPSession(page)
      const start = Date.now()
      cdp.on("Page.screencastFrame", async (frame) => {
        writeFileSync(
          `${dir}/${String(Date.now() - start).padStart(5, "0")}.jpg`,
          Buffer.from(frame.data, "base64"),
        )
        await cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {})
      })
      writeFileSync(`${dir}/box.json`, JSON.stringify(box))
      await cdp.send("Page.startScreencast", {
        format: "jpeg",
        quality: 85,
        everyNthFrame: 1,
        maxWidth: 2560,
        maxHeight: 1800,
      })
      await sleep(120)
      await scene.act(page)
      await sleep(scene.ms)
      await cdp.send("Page.stopScreencast")
      await page.close()
    }
  }
  await browser.close()
} finally {
  server.kill()
}
