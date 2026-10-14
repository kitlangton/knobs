import { expect, test, type Page } from "@playwright/test"

const scrubbing = (page: Page) =>
  page.evaluate(() => document.documentElement.hasAttribute("data-knobs-scrub"))

// data-knobs-scrub marks a drag in progress, so token changes follow the pointer instead of
// gliding. It must clear however the drag ends, or every later change on the page skips its glide.
test("the drag flag clears when a drag that started in a panel is released outside it", async ({
  page,
}) => {
  await page.goto("/meta.html")
  const synth = page.getByRole("region", { name: "synth-voice controls" })
  await expect(synth).toBeVisible()
  const panelBox = (await synth.boundingBox())!

  // Parts of the panel that don't capture the pointer: the title, and a choice's segments.
  for (const start of [
    synth.locator("header strong"),
    synth.getByRole("radiogroup", { name: "Waveform" }),
  ]) {
    const box = (await start.boundingBox())!
    await page.mouse.move(box.x + 6, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 3 })
    expect(await scrubbing(page)).toBe(true)
    await page.mouse.move(panelBox.x + panelBox.width + 160, panelBox.y + panelBox.height + 40, {
      steps: 4,
    })
    await page.mouse.up()
    expect(await scrubbing(page)).toBe(false)
  }

  // A slider drag still marks the flag while it lasts and clears on release, outside or not.
  const slider = synth.getByRole("slider", { name: "Filter cutoff", exact: true })
  const box = (await slider.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 4 })
  expect(await scrubbing(page)).toBe(true)
  await page.mouse.move(box.x + 60, box.y + 400, { steps: 4 })
  await page.mouse.up()
  expect(await scrubbing(page)).toBe(false)

  // The window losing focus mid-drag ends it too.
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 4 })
  expect(await scrubbing(page)).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new Event("blur")))
  expect(await scrubbing(page)).toBe(false)
  await page.mouse.up()
})
