// The components lab's card entrance (examples/components-lab.ts): its tracks under a timeline.
// Scrubbing shows the exact frame; dragging a clip moves its track's start 1:1 and undo puts it
// back; an edge trims it; the panel's rows move the clips; Random keeps every clip on the timeline.
import { expect, test, type Page } from "@playwright/test"

const open = async (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/components-lab.html?story=card-entrance.stories.tsx")
  await expect(page.locator(".knobs-tk-clip")).toHaveCount(4)
  return errors
}
const clip = (page: Page, id: string) => page.locator(`.knobs-tk-clip[data-id="${id}"]`)
const span = async (page: Page, id: string) => {
  const label = (await clip(page, id).getAttribute("aria-label"))!
  const [, a, b] = /([\d.]+) s to ([\d.]+) s/.exec(label)!
  return [Number(a), Number(b)] as const
}
const opacity = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((n) => Number(getComputedStyle(n).opacity))

test("loads on its last frame; scrubbing a lane shows the frame under the playhead", async ({
  page,
}) => {
  const errors = await open(page)
  expect(await opacity(page, ".entrance-button")).toBe(1)
  const lanes = (await page.locator(".knobs-tk-lanes").boundingBox())!
  // Below the clips, at the very start: nothing yet.
  await page.mouse.move(lanes.x + 1, lanes.y + lanes.height - 2)
  await page.mouse.down()
  expect(await opacity(page, ".entrance-card")).toBe(0)
  // A little in: the card is on its way, the button isn't.
  await page.mouse.move(lanes.x + lanes.width * 0.08, lanes.y + lanes.height - 2, { steps: 4 })
  await page.mouse.up()
  const card = await opacity(page, ".entrance-card")
  expect(card).toBeGreaterThan(0)
  expect(card).toBeLessThan(1)
  expect(await opacity(page, ".entrance-button")).toBe(0)
  expect(errors).toEqual([])
})

test("a clip's body moves its start 1:1, its edge trims it, and undo puts it back", async ({
  page,
}) => {
  const errors = await open(page)
  const lanes = (await page.locator(".knobs-tk-lanes").boundingBox())!
  const pxPerSec = lanes.width / 1.6
  const [s0, e0] = await span(page, "button")
  const box = (await clip(page, "button").boundingBox())!
  const y = box.y + box.height / 2
  // Held ⌘ so nothing snaps: the clip moves exactly as far as the hand.
  await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control")
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 0.2 * pxPerSec, y, { steps: 6 })
  await page.mouse.up()
  await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control")
  const [s1, e1] = await span(page, "button")
  expect(s1 - s0).toBeCloseTo(0.2, 1)
  expect(e1 - s1).toBeCloseTo(e0 - s0, 2)
  // The end edge trims: the start stays.
  const moved = (await clip(page, "button").boundingBox())!
  await page.mouse.move(moved.x + moved.width - 1, y)
  await page.mouse.down()
  await page.mouse.move(moved.x + moved.width + 0.1 * pxPerSec, y, { steps: 4 })
  await page.mouse.up()
  const [s2, e2] = await span(page, "button")
  expect(s2).toBeCloseTo(s1, 2)
  expect(e2 - e1).toBeGreaterThan(0.05)
  // Undo twice: back where it started.
  await page.locator(".knobs-head-actions button[aria-label^='Undo']").click()
  await page.locator(".knobs-head-actions button[aria-label^='Undo']").click()
  await expect.poll(() => span(page, "button")).toEqual([s0, e0])
  expect(errors).toEqual([])
})

test("the panel's Stagger row stretches the rows' clip; Random keeps every clip on the timeline", async ({
  page,
}) => {
  const errors = await open(page)
  const [, before] = await span(page, "rows")
  const stagger = page.getByRole("slider", { name: "Stagger" })
  await stagger.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight")
  await expect.poll(async () => (await span(page, "rows"))[1]).toBeGreaterThan(before)
  const random = page.locator(".knobs-head-actions button[aria-label^='Random']")
  for (let i = 0; i < 12; i++) {
    await random.click()
    for (const id of ["card", "header", "rows", "button"]) {
      const [a, b] = await span(page, id)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1.6 + 0.005)
    }
  }
  expect(errors).toEqual([])
})
