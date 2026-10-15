import { expect, type Page, test } from "@playwright/test"

// knobs/ui's timeline and menus in examples/lab.html (knobs' own look): the scene clock under
// the viewport, the outliner rows' context menu and the speed button's menu.
async function open(page: Page, query = "?paused") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/lab.html${query}`)
  await expect(page.locator(".knobs-timeline")).toBeVisible()
  await expect(page.locator(".knobs-tree-row").first()).toBeVisible()
  return errors
}
const tl = <T>(page: Page, fn: (t: any) => T) =>
  page.evaluate(`(${fn.toString()})(window.__timeline)`) as Promise<T>
const time = (page: Page) => tl(page, (t) => t.timeline.time as number)
const view = (page: Page) => tl(page, (t) => t.timeline.view as { start: number; span: number })
/** The track's x for a time, from the view once it has stopped moving. */
async function xOf(page: Page, t: number) {
  let last = ""
  await expect
    .poll(async () => {
      const v = JSON.stringify(await view(page))
      const same = v === last
      last = v
      return same
    })
    .toBe(true)
  const box = (await page.locator(".knobs-tl-track").boundingBox())!
  const v = await view(page)
  return box.x + ((t - v.start) / v.span) * box.width
}

test("timeline: a click seeks, keys step frames, jump between markers and set the loop", async ({
  page,
}) => {
  const errors = await open(page)
  const track = page.locator(".knobs-tl-track")
  const box = (await track.boundingBox())!
  await page.mouse.click(await xOf(page, 2), box.y + box.height - 6)
  // It lands on a frame, and the scene's clock follows.
  await expect.poll(async () => Math.abs((await time(page)) - 2) < 0.05).toBe(true)
  expect(Math.abs((await time(page)) * 30 - Math.round((await time(page)) * 30))).toBeLessThan(1e-6)
  await expect(page.locator(".top .mono")).toContainText(`f${Math.round((await time(page)) * 30)}`)
  await expect(page.locator(".knobs-timeline")).toBeFocused()

  await page.keyboard.press("Home")
  expect(await time(page)).toBe(0)
  await page.keyboard.press("ArrowRight")
  expect(await time(page)).toBeCloseTo(1 / 30, 6)
  await page.keyboard.press("Shift+ArrowRight")
  expect(await time(page)).toBeCloseTo(11 / 30, 6)
  await page.keyboard.press("]")
  expect(await time(page)).toBeCloseTo(1.2, 6)
  await expect(page.locator('.knobs-tl-marker[data-id="boom"]')).toHaveAttribute(
    "data-selected",
    "",
  )
  await page.keyboard.press("]")
  expect(await time(page)).toBeCloseTo(2.4, 6)
  await page.keyboard.press("[")
  expect(await time(page)).toBeCloseTo(1.2, 6)
  await page.keyboard.press("End")
  expect(await time(page)).toBe(6)

  // I and O set the loop range at the playhead.
  await page.keyboard.press("Home")
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("i")
  await page.keyboard.press("]")
  await page.keyboard.press("]")
  await page.keyboard.press("o")
  const loop = await tl(page, (t) => t.timeline.ranges.find((r: any) => r.loop))
  expect(loop.start).toBeCloseTo(1, 6)
  expect(loop.end).toBeCloseTo(2.4, 6)

  // M adds a marker at the playhead; Backspace takes the selected one away (it fades out).
  await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("m")
  await expect.poll(() => tl(page, (t) => t.timeline.markers.length)).toBe(4)
  await page.keyboard.press("Escape")
  await page.keyboard.press("Backspace")
  await expect.poll(() => tl(page, (t) => t.timeline.markers.length)).toBe(4)
  await page.keyboard.press("]")
  await page.keyboard.press("[")
  await page.keyboard.press("Backspace")
  await expect.poll(() => tl(page, (t) => t.timeline.markers.length)).toBe(3)
  await expect(page.locator(".knobs-tl-marker")).toHaveCount(3)
  expect(errors).toEqual([])
})

test("timeline: a scrub follows the hand, sticks softly to a marker and lands on it", async ({
  page,
}) => {
  const errors = await open(page)
  const box = (await page.locator(".knobs-tl-track").boundingBox())!
  const y = box.y + box.height - 6
  const x0 = await xOf(page, 0.5)
  const boom = await xOf(page, 1.2)
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await expect(page.locator(".knobs-timeline")).toHaveAttribute("data-scrubbing", "")
  // 1:1 away from markers: the playhead sits under the pointer.
  await page.mouse.move(x0 + 40, y)
  const head = page.locator(".knobs-tl-head")
  const headX = async () => (await head.boundingBox())!.x
  expect(Math.abs((await headX()) - (x0 + 40))).toBeLessThan(1.5)
  // 2px off the marker, it's held on it: the time is the marker's exactly.
  await page.mouse.move(boom + 2, y)
  expect(await time(page)).toBeCloseTo(1.2, 6)
  await expect(page.locator(".knobs-timeline")).toHaveAttribute("data-stuck", "")
  expect(Math.abs((await headX()) - boom)).toBeLessThan(1)
  // Further off, it lets go, by a curve with no jump: at 8px it trails the pointer a little.
  await page.mouse.move(boom + 8, y)
  const trailing = await headX()
  expect(trailing).toBeGreaterThan(boom + 2)
  expect(trailing).toBeLessThan(boom + 8)
  await page.mouse.move(boom + 2, y)
  await page.mouse.up()
  expect(await time(page)).toBeCloseTo(1.2, 6)
  await expect(page.locator(".knobs-timeline")).not.toHaveAttribute("data-scrubbing", "")
  // Past the start it slows into it and reports 0.
  await page.mouse.move(x0, y)
  await page.mouse.down()
  await page.mouse.move(box.x - 60, y)
  expect(await time(page)).toBe(0)
  expect(await headX()).toBeGreaterThan(box.x - 30)
  await page.mouse.up()
  expect(errors).toEqual([])
})

test("timeline: ⌘wheel zooms around the pointer, the wheel pans, 0 fits", async ({ page }) => {
  const errors = await open(page)
  const box = (await page.locator(".knobs-tl-track").boundingBox())!
  const before = await view(page)
  const at = await xOf(page, 3)
  await page.mouse.move(at, box.y + box.height / 2)
  await page.keyboard.down("Meta")
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120)
  await page.keyboard.up("Meta")
  await expect.poll(async () => (await view(page)).span).toBeLessThan(before.span * 0.7)
  // Time 3 stays under the pointer.
  expect(Math.abs((await xOf(page, 3)) - at)).toBeLessThan(2)
  const zoomed = await view(page)
  await page.mouse.wheel(200, 0)
  await expect.poll(async () => (await view(page)).start).toBeGreaterThan(zoomed.start + 0.1)
  // Finer ticks once zoomed in: single frames show.
  await page.locator(".knobs-timeline").focus()
  await page.keyboard.press("0")
  await expect.poll(async () => Math.abs((await view(page)).span - before.span) < 0.01).toBe(true)
  expect(errors).toEqual([])
})

test("timeline: playback moves the playhead every frame, loops, cues Boom, and pauses on a frame", async ({
  page,
}) => {
  const errors = await open(page)
  await page.locator(".knobs-timeline").focus()
  await page.keyboard.press("Home")
  await page.keyboard.press("Space")
  await expect(page.locator(".knobs-timeline")).toHaveAttribute("data-playing", "")
  // Playing from before the loop starts at its in point.
  await expect.poll(() => time(page)).toBeGreaterThan(0.8)
  // The head's position changes from one animation frame to the next (interpolated, not steps).
  const xs = await page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const head = document.querySelector(".knobs-tl-head")!
        const out: number[] = []
        const tick = () => {
          out.push(head.getBoundingClientRect().x)
          if (out.length < 12) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
  )
  const moves = xs.slice(1).filter((x, i) => x !== xs[i]).length
  expect(moves).toBeGreaterThan(6)
  // Passing Boom (1.2 s) retriggers the explosion.
  await expect.poll(() => tl(page, (t) => t.booms.length), { timeout: 20_000 }).toBeGreaterThan(0)
  // It loops inside the range (0.8–4.2 s).
  await expect
    .poll(() => tl(page, (t) => t.timeline.time), { timeout: 20_000 })
    .toBeGreaterThan(3.8)
  await expect.poll(() => tl(page, (t) => t.timeline.time), { timeout: 20_000 }).toBeLessThan(1.6)
  await page.keyboard.press("Space")
  await expect(page.locator(".knobs-timeline")).not.toHaveAttribute("data-playing", "")
  const t = await time(page)
  expect(Math.abs(t * 30 - Math.round(t * 30))).toBeLessThan(1e-6)
  // Paused, the timeline's clock sleeps.
  const frames = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const head = document.querySelector<HTMLElement>(".knobs-tl-head")!
        const was = head.style.transform
        let changes = 0
        const mo = new MutationObserver(() => {
          if (head.style.transform !== was) changes++
        })
        mo.observe(head, { attributes: true })
        setTimeout(() => {
          mo.disconnect()
          done(changes)
        }, 500)
      }),
  )
  expect(frames).toBe(0)
  expect(errors).toEqual([])
})

test("context menu: a right-click on an outliner row selects it and offers its actions", async ({
  page,
}) => {
  const errors = await open(page)
  const id = await page
    .locator(".knobs-tree-row", { hasText: "Porch post lantern" })
    .first()
    .getAttribute("data-id")
  const row = page.locator(`.knobs-tree-row[data-id="${id}"]`)
  await row.click({ button: "right" })
  const menu = page.getByRole("menu", { name: "Scene object" })
  await expect(menu).toBeVisible()
  await expect(row).toHaveAttribute("aria-selected", "true")
  await expect(menu).toBeFocused()
  await expect(menu.getByRole("menuitem")).toHaveText([/Rename/, /Duplicate/, /Move to/, /Delete/])
  await expect(menu.getByRole("menuitemcheckbox", { name: /Hidden/ })).toHaveAttribute(
    "aria-checked",
    "false",
  )
  // It opens at the pointer.
  const rb = (await row.boundingBox())!
  const mb = (await menu.boundingBox())!
  expect(mb.y).toBeGreaterThanOrEqual(rb.y)
  // Keys: ↓ moves, a letter jumps, → opens the submenu, ← closes it, Esc closes the menu.
  await page.keyboard.press("ArrowDown")
  await expect(menu.locator('[data-id="rename"]')).toHaveAttribute("data-active", "")
  await page.keyboard.press("m")
  await expect(menu.locator('[data-id="move"]')).toHaveAttribute("data-active", "")
  await page.keyboard.press("ArrowRight")
  const sub = page.getByRole("menu").nth(1)
  await expect(sub).toBeFocused()
  await expect(sub.getByRole("menuitemradio", { name: "Lights" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await expect(sub.locator("[data-active]")).toHaveText("Vehicles")
  await page.keyboard.press("ArrowLeft")
  await expect(menu).toBeFocused()
  await expect(page.getByRole("menu")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(page.locator(".knobs-tree")).toBeFocused()

  // Duplicate puts a copy after it, selected.
  await row.click({ button: "right" })
  await menu.getByRole("menuitem", { name: /Duplicate/ }).click()
  await expect(
    page.locator(".knobs-tree-row", { hasText: "Porch post lantern copy" }),
  ).toHaveAttribute("aria-selected", "true")
  // Hidden checks and toggles.
  await row.click({ button: "right" })
  await menu.getByRole("menuitemcheckbox", { name: /Hidden/ }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__workspace.hidden.size as number))
    .toBe(1)
  // Delete asks first.
  await row.click({ button: "right" })
  await menu.getByRole("menuitem", { name: /Delete/ }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(row).toBeVisible()
  expect(errors).toEqual([])
})

test("context menu: hovering a submenu item opens it, and the pointer can cross to it diagonally", async ({
  page,
}) => {
  const errors = await open(page)
  const row = page.locator(".knobs-tree-row", { hasText: "Window glow" })
  await row.click({ button: "right" })
  const menu = page.getByRole("menu", { name: "Scene object" })
  const move = menu.locator('[data-id="move"]')
  await move.hover()
  await expect(page.getByRole("menu")).toHaveCount(2)
  const sub = page.getByRole("menu").nth(1)
  await expect(move).toHaveAttribute("aria-expanded", "true")
  // Its first item sits level with the item it came from.
  const mv = (await move.boundingBox())!
  const first = (await sub.locator(".knobs-mitem").first().boundingBox())!
  expect(Math.abs(first.y - mv.y)).toBeLessThan(2)
  // Heading for the submenu's lower items, the pointer crosses "Delete…" without closing it.
  const target = (await sub.locator(".knobs-mitem").last().boundingBox())!
  const from = { x: mv.x + mv.width - 30, y: mv.y + mv.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.move(target.x + 10, target.y + target.height / 2, { steps: 6 })
  await expect(page.getByRole("menu")).toHaveCount(2)
  await expect(sub.locator(".knobs-mitem").last()).toHaveAttribute("data-active", "")
  await sub.locator(".knobs-mitem").last().click()
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = (window as any).__workspace
        return w.scene
          .find((g: any) => g.id === "props")
          .children.some((c: any) => c.label === "Window glow")
      }),
    )
    .toBe(true)
  expect(errors).toEqual([])
})

test("menu: the speed button's radio menu, from the keyboard", async ({ page }) => {
  const errors = await open(page)
  const speed = page.getByRole("button", { name: "1×" })
  await speed.focus()
  await page.keyboard.press("Enter")
  const menu = page.getByRole("menu", { name: "Playback speed" })
  await expect(menu).toBeVisible()
  await expect(speed).toHaveAttribute("aria-expanded", "true")
  await expect(menu.getByRole("menuitemradio", { name: "1×" })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  // Opened by a key, the first item starts active.
  await expect(menu.getByRole("menuitemradio", { name: "0.25×" })).toHaveAttribute(
    "data-active",
    "",
  )
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole("button", { name: "0.5×" })).toBeFocused()
  expect(errors).toEqual([])
})
