import { expect, type Page, test } from "@playwright/test"

// examples/play.html: a game (a canvas that keeps focus where it is when pressed, as games do)
// with its floating tuning panel open. The panel is for tuning while you play: a press on the
// game hands its keys back, Esc or the X close it, the header carries it, rows explain themselves.
const viewport = { width: 1280, height: 800 }
test.use({ colorScheme: "dark", deviceScaleFactor: 2, viewport })

const panel = (page: Page) => page.locator('[data-controls="play"]')
const chip = (page: Page) => page.getByRole("button", { name: "Tune play" })
const heard = (page: Page) =>
  page.evaluate(() => [...(window as any).play.heard]) as Promise<string[]>
const values = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).play.controls.get() })) as Promise<
    Record<string, unknown>
  >
const focusInPanel = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest('[data-controls="play"]')))
const out = (name: string) => `${process.env.STILLS ?? "test-results/stills"}/${name}`
const still = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (a) =>
                  a.playState === "running" &&
                  a.timeline instanceof DocumentTimeline &&
                  a.effect?.getTiming().iterations !== Infinity,
              ).length + document.querySelectorAll(".knobs-morph,[data-presence]").length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0)

async function open(page: Page, url = "/play.html") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto(url)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await chip(page).click()
  await expect(panel(page)).toBeVisible()
  await still(page)
  return errors
}

test("a press on the game hands its keys back; the panel stays open", async ({ page }) => {
  const errors = await open(page)
  const speed = panel(page).getByRole("slider", { name: "Speed", exact: true })
  await speed.focus()
  await page.keyboard.press("ArrowRight")
  await expect(speed).toHaveAttribute("aria-valuenow", "270")
  // Keys the panel takes stop there.
  expect(await heard(page)).not.toContain("arrowright")

  // The canvas cancels its press, so focus wouldn't move on its own.
  await page.mouse.click(900, 500)
  await expect.poll(() => focusInPanel(page)).toBe(false)
  await expect(panel(page)).toBeVisible()
  const before = await values(page)
  for (const key of ["ArrowRight", "s", "r", "1", "j", "["]) await page.keyboard.press(key)
  expect(await heard(page)).toEqual(expect.arrayContaining(["arrowright", "s", "r", "1", "j", "["]))
  await expect(speed).toHaveAttribute("aria-valuenow", "270")
  expect(await values(page)).toEqual(before)
  await expect(panel(page)).not.toHaveClass(/knobs-hinting/)

  // The page's toggle key works from the game too.
  await page.keyboard.press("`")
  await expect(panel(page)).toBeHidden()
  await page.keyboard.press("`")
  await expect(panel(page)).toBeVisible()
  expect(errors).toEqual([])
})

test("Esc from the panel and its X close it", async ({ page }) => {
  await open(page)
  await panel(page).locator("header strong").click()
  await expect.poll(() => focusInPanel(page)).toBe(true)
  await page.keyboard.press("Escape")
  await expect(panel(page)).toHaveCount(0)
  await chip(page).click()
  await expect(panel(page)).toBeVisible()
  await panel(page).getByRole("button", { name: "Close play" }).click()
  await expect(panel(page)).toHaveCount(0)
})

test("every header button works, floating and inline", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  for (const [url, id] of [
    ["/play.html", "play"],
    ["/cards.html", "opencode-cards"],
  ] as const) {
    if (id === "play") await open(page, url)
    else {
      await page.goto(url)
      await still(page)
    }
    const root = page.locator(`[data-controls="${id}"]`)
    const get = () =>
      page.evaluate(
        (name) => JSON.stringify((window as any)[name].controls.get()),
        id === "play" ? "play" : "cards",
      )
    const start = await get()
    // Random until something moves (a roll can land where it was).
    for (let i = 0; i < 4 && (await get()) === start; i++)
      await root.getByRole("button", { name: "Random", exact: true }).click()
    expect(await get()).not.toBe(start)
    await root.getByRole("button", { name: "Undo", exact: true }).click()
    await expect.poll(get).toBe(start)
    await root.getByRole("button", { name: "Redo", exact: true }).click()
    await expect.poll(get).not.toBe(start)
    await root.getByRole("button", { name: "Reset", exact: true }).click()
    await root.getByRole("button", { name: "Copy", exact: true }).click()
    await expect(root.locator(".knobs-copy")).toHaveAttribute("data-copied", "")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(":")
  }
  // A group Random never changes (one switch) has no die; the others keep theirs.
  await open(page)
  const head = (group: string) => panel(page).locator(`.knobs-group-head[data-group="${group}"]`)
  await expect(head("Debug").locator(".knobs-group-die")).toBeHidden()
  await expect(head("Player").locator(".knobs-group-die")).toBeVisible()
})

test("the header carries the panel 1:1, it stays where it's let go and keeps its edge", async ({
  browser,
}) => {
  const baseURL = test.info().project.use.baseURL
  const context = await browser.newContext({
    viewport,
    colorScheme: "dark",
    ...(process.env.STILLS ? { recordVideo: { dir: out("video"), size: viewport } } : {}),
  })
  const page = await context.newPage()
  await open(page, `${baseURL}/play.html`)
  const header = panel(page).locator("header")
  const box = async () => (await panel(page).boundingBox())!
  const start = await box()
  const cursor = () => header.evaluate((h) => getComputedStyle(h).cursor)
  expect(await cursor()).not.toBe("grab")
  const title = (await panel(page).locator("header strong").boundingBox())!
  const from = { x: title.x + 20, y: title.y + title.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 40
  const by = { x: 760, y: 140 }
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (by.x * i) / steps, from.y + (by.y * i) / steps)
    if (i === steps / 2) {
      // Mid-drag the panel is exactly where the hand has carried it, and the hand shows.
      const mid = await box()
      expect(mid.x - start.x).toBeCloseTo(by.x / 2, 0)
      expect(mid.y - start.y).toBeCloseTo(by.y / 2, 0)
      expect(await cursor()).toBe("grabbing")
    }
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  const dropped = await box()
  expect(dropped.x - start.x).toBeCloseTo(by.x, 0)
  expect(dropped.y - start.y).toBeCloseTo(by.y, 0)
  expect(await cursor()).not.toBe("grabbing")
  await page.waitForTimeout(600)

  // A reload brings it back where it was left.
  await page.reload()
  await expect(panel(page)).toBeVisible()
  expect(await box()).toMatchObject({ x: dropped.x, y: dropped.y })
  // Left on the right half, it keeps its distance from the right edge as the window narrows.
  const gap = viewport.width - (dropped.x + dropped.width)
  await page.setViewportSize({ width: 1100, height: viewport.height })
  await expect.poll(async () => 1100 - ((await box()).x + (await box()).width)).toBeCloseTo(gap, 0)
  await context.close()
})

test("a row's description shows on hover, describes its control and matches search", async ({
  page,
}) => {
  await open(page)
  const speed = panel(page).getByRole("slider", { name: "Speed", exact: true })
  const description = "How fast the square moves while a key is held"
  const describedBy = await speed.getAttribute("aria-describedby")
  expect(describedBy).toBeTruthy()
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(description)
  await panel(page).locator('[data-field="speed"]').hover()
  const tip = page.locator(".knobs-tooltip")
  await expect(tip).toHaveText(description)
  await expect(tip).toBeVisible()
  await page.waitForTimeout(400)
  if (process.env.STILLS) {
    const p = (await panel(page).boundingBox())!
    await page.screenshot({
      path: out("panel-tooltip.png"),
      clip: {
        x: 0,
        y: 0,
        width: Math.min(viewport.width, p.x + p.width + 220),
        height: p.y + p.height + 16,
      },
    })
  }
  // A row without one has no tooltip.
  await panel(page).locator('[data-field="hue"]').hover()
  await page.waitForTimeout(700)
  await expect(tip).not.toHaveText("Hue")

  await page.goto("/cards.html?search")
  await page.locator('[data-controls="opencode-cards"] .knobs-search input').fill("multiplies")
  const cards = page.locator('[data-controls="opencode-cards"]')
  await expect(cards.locator('[data-field="speed"]')).toBeVisible()
  await expect(cards.locator('[data-field="slow"]')).toBeHidden()
})

test("folds outlive the tab, and nest: a group folds, a sub-heading in it folds", async ({
  page,
}) => {
  await open(page)
  const camera = panel(page).locator('.knobs-group-head[data-group="Camera"]')
  const glow = panel(page).locator(".knobs-subhead", { hasText: "Glow" })
  await expect(camera).toHaveAttribute("aria-expanded", "false")
  await camera.click()
  await expect(camera).toHaveAttribute("aria-expanded", "true")
  await glow.click()
  await expect(glow).toHaveAttribute("aria-expanded", "false")
  await expect(panel(page).locator('[data-field="spread"]')).toBeHidden()
  // A new tab: the session is gone, the store's storage stays.
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
  await chip(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(camera).toHaveAttribute("aria-expanded", "true")
  await expect(glow).toHaveAttribute("aria-expanded", "false")
})

test("corners are concentric, and a phone gets the width less a gutter", async ({ page }) => {
  await open(page)
  const geometry = () =>
    panel(page).evaluate((p) => {
      const card = p.querySelector<HTMLElement>(".knobs-card")!
      const pr = p.getBoundingClientRect()
      const cr = card.getBoundingClientRect()
      return {
        outer: parseFloat(getComputedStyle(p).borderTopLeftRadius),
        inner: parseFloat(getComputedStyle(card).borderTopLeftRadius),
        inset: cr.left - pr.left,
        width: pr.width,
        left: pr.left,
        bottom: pr.bottom,
      }
    })
  const g = await geometry()
  expect(g.outer).toBeCloseTo(g.inner + g.inset, 0)

  await page.setViewportSize({ width: 390, height: 700 })
  await page.reload()
  await expect(panel(page)).toBeVisible()
  await still(page)
  const phone = await geometry()
  expect(phone.width).toBeCloseTo(390 - 16, 0)
  expect(phone.left).toBeCloseTo(8, 0)
  expect(phone.bottom).toBeLessThanOrEqual(700 - 8 + 0.5)
  if (process.env.STILLS) await page.screenshot({ path: out("phone.png") })
})
