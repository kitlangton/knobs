import { chromium } from "@playwright/test"
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
for (const mode of ["gpu"]) {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })
  await p.goto(`http://127.0.0.1:4005/lab.html${mode === "gpu" ? "?gpu" : ""}`)
  await p.waitForTimeout(1500)
  for (const key of ["exposure", "flashlight", "preset"]) {
  const row = p.locator(`#details [data-field="${key}"]`).first()
  await row.scrollIntoViewIfNeeded()
  await p.mouse.move(5, 995)
  await p.waitForTimeout(700)
  const box = (await row.boundingBox())!
  const y0 = Math.floor(box.y) - 2
  const buf = await p.screenshot({ clip: { x: box.x + box.width * 0.45, y: y0, width: 1, height: 5 } })
  require("fs").writeFileSync(`/tmp/sep-${key}.png`, buf)
  console.log(key, box.y)
  }
}
await b.close()
