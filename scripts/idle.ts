// Checks the GPU frame loop goes to sleep after interactions settle.
import { chromium } from "@playwright/test"
import { spawn } from "node:child_process"
// --port=N when 5196 is taken.
const port = Number(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1]) || 5196
const server = spawn("bunx", ["vite", "--config", "examples/vite.config.ts"], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break
    } catch {}
    await sleep(200)
  }
  const browser = await chromium.launch({ args: ["--enable-gpu"] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`http://127.0.0.1:${port}/?gpu`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const study = page.locator('[data-study="splat"]')
  const b = (await study.boundingBox())!
  await study.hover({ position: { x: b.width - 20, y: 60 } })
  await sleep(300)
  await page.getByRole("button", { name: "Tune splat", exact: true }).click()
  const panel = page.getByRole("dialog", { name: "splat controls", exact: true })
  await panel.waitFor()
  const diag = () =>
    page.evaluate(() => {
      const d = window.__knobsGpu!
      return { sleeping: d.sleeping, frames: d.frameCount }
    })
  const report = async (label: string) => {
    await page.mouse.move(5, 5)
    await sleep(1500)
    const a = await diag()
    await sleep(1000)
    const c = await diag()
    console.log(label.padEnd(16), "sleeping", c.sleeping, "frames in last 1s", c.frames - a.frames)
  }
  await report("open")
  await panel.getByRole("radio", { name: "heavy" }).click()
  await report("preset")
  await panel.getByRole("radio", { name: "clean" }).click()
  await report("choice")
  await panel.getByRole("slider", { name: "count" }).focus()
  await page.keyboard.press("Shift+ArrowRight")
  await report("key")
  await page.keyboard.press("?")
  await report("popover")
  await page.keyboard.press("Escape")
  await report("popover close")
  const count = (await panel.getByRole("slider", { name: "count" }).boundingBox())!
  await page.mouse.move(count.x + count.width * 0.7, count.y + count.height / 2)
  await page.mouse.down()
  await page.mouse.move(count.x + count.width * 0.33, count.y + count.height / 2, { steps: 8 })
  await page.mouse.up()
  await report("drag")
  await page.mouse.move(count.x + count.width * 0.5, count.y + count.height / 2)
  for (let i = 0; i < 4; i++) await page.mouse.wheel(12, 0)
  await report("wheel")
  await panel.getByRole("button", { name: "Copy", exact: true }).click()
  await report("status")
  await sleep(3500)
  await report("status gone")
  await page.goto(`http://127.0.0.1:${port}/meta.html?gpu`)
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  await synth.getByRole("slider", { name: "Resonance" }).focus()
  await page.keyboard.press("ArrowRight")
  await report("group reset in")
  await synth.getByRole("button", { name: "Reset Filter" }).click()
  await report("group reset out")
  await synth.getByRole("slider", { name: "Resonance" }).focus()
  await page.keyboard.press("Shift+L")
  await report("lock")
  await page.keyboard.press("Shift+ArrowDown")
  await report("select")
  await page.keyboard.press("Shift+F10")
  await report("menu")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await report("menu closed")
  await synth.getByRole("button", { name: "Randomize Oscillator" }).click()
  await report("group die")
  await page.keyboard.press("Alt+r")
  await report("mutate")
  await page.keyboard.down("\\")
  await report("compare held")
  await page.keyboard.up("\\")
  await report("compare off")
  // Token transitions keep the loop awake only while they run.
  const tokens = page.getByRole("region", { name: "knobs-tokens controls" })
  await tokens.getByRole("slider", { name: "Density scale" }).focus()
  await page.keyboard.press("Shift+ArrowRight")
  await report("token glide")
  await tokens.getByRole("radio", { name: "paper" }).click()
  await report("theme glide")

  // The compound editors: springs with their dot, disclosure rows, strips, pad and curve handles.
  await page.goto(`http://127.0.0.1:${port}/?gpu`)
  const motionStudy = page.locator('[data-study="motion"]')
  const mb = (await motionStudy.boundingBox())!
  await motionStudy.hover({ position: { x: mb.width - 20, y: 60 } })
  await sleep(300)
  await page.getByRole("button", { name: "Tune motion", exact: true }).click()
  const motion = page.getByRole("dialog", { name: "motion controls", exact: true })
  await motion.waitFor()
  await motion.getByRole("slider", { name: "Travel bounce" }).focus()
  await page.keyboard.press("ArrowRight")
  await report("spring dot")
  await motion.getByRole("radio", { name: "jelly" }).click()
  await report("spring preset")
  for (const name of ["Tint", "Target", "Curve"]) {
    await motion.getByRole("button", { name, exact: true }).click()
    await report(`open ${name}`)
  }
  const drag = async (
    box: { x: number; y: number; width: number; height: number },
    label: string,
  ) => {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 8 })
    await page.mouse.up()
    await report(label)
  }
  await drag((await motion.getByRole("slider", { name: "Tint hue" }).boundingBox())!, "hue drag")
  await drag((await motion.getByRole("slider", { name: "Target" }).boundingBox())!, "pad drag")
  await page.keyboard.press("Shift+ArrowUp")
  await report("pad key")
  const handle = (await motion.getByRole("slider", { name: "Curve start handle" }).boundingBox())!
  await drag({ ...handle, x: handle.x - 20, width: 40 }, "handle drag")
  await motion.getByRole("radio", { name: "ease", exact: true }).click()
  await report("easing chip")
  await page.keyboard.press("Escape")
  await report("collapse")

  // The full page: scrolling wakes the overlay, and it sleeps again once the page is still.
  await page.goto(`http://127.0.0.1:${port}/tune.html?gpu`)
  await page.locator(".knobs-page .knobs-tile").first().waitFor()
  await report("page open")
  await page.mouse.move(700, 500)
  await page.mouse.wheel(0, 600)
  await report("page scroll")
  await page.getByRole("slider", { name: "Row height" }).focus()
  await page.keyboard.press("3")
  await report("page preset")
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await page.keyboard.press("Tab")
  await report("page tab")
  await page.keyboard.press("/")
  await page.keyboard.type("radius")
  await report("page filter")
  await page.keyboard.press("Escape")
  await report("page filter off")
  await browser.close()
} finally {
  server.kill()
}
