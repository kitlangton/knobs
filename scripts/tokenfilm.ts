// Frame sheets of token changes on the meta page, DOM and GPU side by side: each scene changes a
// token (padding, radius, theme and accent), pauses its transitions and seeks them frame by frame,
// laying the moments out in one image per scene.
// Usage: bun run scripts/tokenfilm.ts [outPrefix] — sheets land at <outPrefix>-<scene>.png.
import { chromium, type Page } from "@playwright/test"
import { spawn } from "node:child_process"

const port = 5197
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const out = process.argv[2] ?? "test-results/tokenfilm"

type Scene = { name: string; setup(page: Page): Promise<void>; key: string }
const tokens = (page: Page) => page.getByRole("region", { name: "knobs-tokens controls" })
const slider = (label: string) => (page: Page) =>
  tokens(page).getByRole("slider", { name: label, exact: true }).focus()
const scenes: Scene[] = [
  { name: "padding", setup: slider("Density scale"), key: "ArrowRight" },
  { name: "radius", setup: slider("Control radius"), key: "ArrowRight" },
  {
    name: "theme",
    setup: (page) => tokens(page).getByRole("radiogroup", { name: "Preset or variant" }).focus(),
    // paper: light theme, a warm accent, a little more contrast
    key: "4",
  },
]

const FRAMES = [0, 25, 50, 75, 100, 125, 150, 200, 250, 400]

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
  const only = process.argv.slice(3)
  for (const scene of scenes) {
    if (only.length && !only.includes(scene.name)) continue
    const rows: { mode: string; frames: { t: number; data: string }[]; box: any }[] = []
    for (const mode of ["dom", "gpu"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      await page.goto(`http://127.0.0.1:${port}/meta.html?${mode}`)
      await page.evaluate(() => {
        localStorage.clear()
        sessionStorage.clear()
      })
      await page.reload()
      await sleep(800)
      if (mode === "gpu")
        await page.waitForFunction(() => window.__knobsGpu?.active === true, null, {
          timeout: 5000,
        })
      const synth = page.getByRole("region", { name: "synth-voice controls" })
      const b = (await synth.boundingBox())!
      const box = { x: b.x - 16, y: b.y - 16, width: b.width + 64, height: b.height + 96 }
      await scene.setup(page)
      await sleep(400)
      // The change lands and its transitions pause at once, then each moment is sought exactly:
      // both renderers draw from the same in-between tokens, so the frames are deterministic.
      await page.evaluate(
        async ({ key, shift }) => {
          const target = document.activeElement!
          // The page writes its tokens on the panels when React commits, a little later.
          const written = new Promise<void>((resolve) => {
            const panel = document.querySelector(".knobs-panel")!
            const mo = new MutationObserver(() => {
              mo.disconnect()
              resolve()
            })
            mo.observe(panel, { attributes: true, attributeFilter: ["style"] })
            setTimeout(resolve, 1000)
          })
          target.dispatchEvent(
            new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true }),
          )
          await written
          for (const el of document.querySelectorAll(".knobs-panel")) getComputedStyle(el).width
          for (const a of document.getAnimations()) if (a instanceof CSSTransition) a.pause()
        },
        { key: scene.key, shift: scene.key === "ArrowRight" },
      )
      const picked: { t: number; data: string }[] = []
      for (const t of FRAMES) {
        await page.evaluate(async (t) => {
          for (const a of document.getAnimations())
            if (a instanceof CSSTransition) a.currentTime = t
          window.__knobsGpu?.wake()
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
        }, t)
        const png = await page.screenshot({ clip: box, animations: "allow" })
        picked.push({ t, data: png.toString("base64") })
      }
      rows.push({ mode, frames: picked, box })
      await page.close()
    }
    const sheet = await browser.newPage({ viewport: { width: 1800, height: 600 } })
    const cell = (data: string, box: any) =>
      `<div class="c" style="width:${box.width}px;height:${box.height}px"><img src="data:image/png;base64,${data}"></div>`
    await sheet.setContent(`<style>
      body{margin:0;background:#0b0b0c;color:#aaa;font:12px ui-monospace,monospace}
      .row{display:flex;gap:6px;padding:6px;align-items:flex-start}
      .c{flex:none}.c img{display:block;width:100%;height:100%}
      .t{display:flex;gap:6px;padding:0 6px}.t span{flex:none}
      .m{writing-mode:vertical-rl;transform:rotate(180deg);width:16px;text-align:center}
    </style>
    <div class="t"><span style="width:16px"></span>${rows[0]!.frames
      .map((f) => `<span style="width:${rows[0]!.box.width}px">${f.t} ms</span>`)
      .join("")}</div>
    ${rows
      .map(
        (r) =>
          `<div class="row"><span class="m">${r.mode}</span>${r.frames.map((f) => cell(f.data, r.box)).join("")}</div>`,
      )
      .join("")}`)
    await sleep(300)
    const size = await sheet.evaluate(() => ({
      w: document.body.scrollWidth,
      h: document.body.scrollHeight,
    }))
    await sheet.setViewportSize({ width: size.w, height: size.h })
    await sheet.screenshot({ path: `${out}-${scene.name}.png` })
    console.log(`${out}-${scene.name}.png`)
    await sheet.close()
  }
  await browser.close()
} finally {
  server.kill()
}
