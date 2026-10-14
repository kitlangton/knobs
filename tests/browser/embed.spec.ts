import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { buildConsumers, out } from "../../scripts/consumer"

type Problems = {
  state(): { item: string; variation: string; values: Record<string, number> }
  serverSet(key: string, value: number): void
  prototype: { replays: number; device: string; motion: boolean }
}
const problems = (page: Page) =>
  page.evaluate(() => (window as any).__problems.state()) as Promise<ReturnType<Problems["state"]>>
const params = (page: Page) => page.getByRole("region", { name: "parameters controls" })
const settings = (page: Page) => page.getByRole("region", { name: "prototype-settings controls" })
const log = (page: Page) => page.locator(".log")
async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/problems.html${query}`)
  await expect(params(page).locator(".knobs-slider").first()).toBeVisible()
  await expect(settings(page).getByText("Replay arrival")).toBeVisible()
  return errors
}
/**
 * Whether `key` reached the page past the panel (a document listener, which runs before the
 * host's window one), and whether the panel claimed it with preventDefault.
 */
async function hostSees(page: Page, key: string) {
  await page.evaluate((k) => {
    ;(window as any).__seen = []
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === k) (window as any).__seen.push(e.defaultPrevented)
      },
      { capture: false, once: true },
    )
  }, key)
  await page.keyboard.press(key)
  return page.evaluate(() => (window as any).__seen as boolean[])
}

test.describe("production consumers", () => {
  test.beforeAll(async () => {
    await buildConsumers()
  })
  const serve = async (page: Page, app: string) => {
    await page.route("http://consumer.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname
      const file = join(out, app, path === "/" ? "index.html" : path)
      const body = await readFile(file).catch(() => null)
      if (!body) return route.fulfill({ status: 404 })
      await route.fulfill({
        body,
        contentType: file.endsWith(".js") ? "text/javascript" : "text/html",
      })
    })
    await page.goto("http://consumer.test/")
  }

  test("an unshipped store is locked and no panel code is in the bundle", async ({ page }) => {
    await serve(page, "locked")
    await page.waitForFunction(() => (window as any).result)
    expect(await page.evaluate(() => (window as any).result)).toEqual({ enabled: false, size: 4 })
    await page.waitForTimeout(200)
    await expect(page.locator(".knobs-panel")).toHaveCount(0)
    const assets = (await import("node:fs/promises")).readdir(join(out, "locked/assets"))
    const files = await assets
    expect(files).toHaveLength(1)
    const js = await readFile(join(out, "locked/assets", files[0]!), "utf8")
    expect(js).not.toMatch(/knobs-panel|createPanel|ResizeObserver|import\(["'`]/)
  })

  test("a shipped store mounts in production beside a locked dev store", async ({ page }) => {
    await serve(page, "shipped")
    const panel = page.locator(".knobs-panel")
    await expect(panel).toHaveCount(1)
    await expect(panel.locator(".knobs-track")).toHaveCount(3)
    expect(await page.evaluate(() => (window as any).result.dock)).toEqual({
      enabled: false,
      size: 4,
    })
    await panel.locator(".knobs-track").first().focus()
    await page.keyboard.press("ArrowRight")
    expect(await page.evaluate(() => (window as any).result.sets)).toEqual([["stops", 5]])
    // vim: false and edit: false — j and 3 reach the page untouched.
    expect(await hostSees(page, "j")).toEqual([false])
    expect(await hostSees(page, "3")).toEqual([false])
    await expect(panel.locator(".knobs-number:visible")).toHaveCount(0)
  })
})

test("embedded keys: scoped to focus, Problems' bindings bubble to the host", async ({ page }) => {
  const errors = await open(page)
  // Nothing focused: host keys.
  await page.keyboard.press("2")
  expect((await problems(page)).variation).toBe("B")
  await page.keyboard.press("1")
  // Tab = Tune focuses the panel (onReady handle).
  await page.keyboard.press("Tab")
  const stops = params(page).getByRole("slider", { name: "Stops" })
  await expect(stops).toBeFocused()
  // wrap: false — ↑ on the first row stays.
  await page.keyboard.press("ArrowUp")
  await expect(stops).toBeFocused()
  // bigStep: 5 — ⇧→ moves five steps (clamped at the top here: 4 → 5).
  await page.keyboard.press("ArrowDown")
  const level = params(page).getByRole("slider", { name: "Active stop" })
  await expect(level).toBeFocused()
  await page.keyboard.press("Shift+ArrowLeft")
  await expect(level).toHaveAttribute("aria-valuenow", "1")
  await expect(log(page)).toContainText("set level = 1")
  // edit: false — digits switch variation instead of editing.
  expect(await hostSees(page, "3")).toEqual([false])
  expect((await problems(page)).variation).toBe("C")
  await expect(params(page).locator(".knobs-number:visible")).toHaveCount(0)
  // bigStep: 5 — ⇧← on Afterglow (step 5) moves 25.
  const glow = params(page).getByRole("slider", { name: "Afterglow" })
  await glow.focus()
  await page.keyboard.press("Shift+ArrowLeft")
  await expect(glow).toHaveAttribute("aria-valuenow", "45")
  // wrap: false — ↓ on the last row stays.
  await page.keyboard.press("ArrowDown")
  await expect(glow).toBeFocused()
  // …and Enter is the host's Choose.
  await params(page).getByRole("slider", { name: "Stops" }).focus()
  expect(await hostSees(page, "Enter")).toEqual([false])
  await expect(log(page)).toContainText("host: choose 3")
  // vim: false — J switches the queue item while tuning.
  expect(await hostSees(page, "j")).toEqual([false])
  expect((await problems(page)).item).toBe("OC-35")
  // Panel keys stop at the panel: ↓ moves rows, and the host never hears it.
  await params(page).locator(".knobs-track").first().focus()
  expect(await hostSees(page, "ArrowDown")).toEqual([])
  // R isn't the panel's here (random: false), so it's the host's.
  await page.keyboard.press("r")
  await expect(log(page)).toContainText("host: next round")
  // Esc leaves the panel; host keys work again.
  await page.keyboard.press("Escape")
  await expect(params(page).locator(":focus")).toHaveCount(0)
  await page.keyboard.press("k")
  expect((await problems(page)).item).toBe("D-43")
  // The settings panel keeps the default letters: j moves its rows and stays there.
  await settings(page).getByRole("radiogroup", { name: "Appearance" }).focus()
  expect(await hostSees(page, "j")).toEqual([])
  await expect(settings(page).getByRole("button", { name: "Device" })).toBeFocused()
  expect((await problems(page)).item).toBe("D-43")
  // ? lists only what's on.
  await params(page).locator(".knobs-track").first().focus()
  await page.keyboard.press("?")
  const pop = params(page).locator(".knobs-popover")
  await expect(pop).toBeVisible()
  await expect(pop).toContainText("⇧ ×5")
  await expect(pop).not.toContainText("Random")
  await expect(pop).not.toContainText("Undo")
  await expect(pop).not.toContainText("j k")
  await expect(pop).not.toContainText("Edit number inline")
  expect(errors).toEqual([])
})

test("variations swap descriptors in place; another item lands", async ({ page }) => {
  await open(page)
  const rowLabels = () =>
    params(page)
      .locator(".knobs-card > :not([data-presence='out'])")
      .evaluateAll((rows) => rows.map((r) => r.querySelector(".knobs-label")?.textContent))
  expect(await rowLabels()).toEqual(["Stops", "Active stop", "Size", "Duration"])
  await page.evaluate(() => {
    ;(window as any).__stops = document.querySelector(
      '[data-controls="parameters"] [data-field="stops"]',
    )
  })
  await page.keyboard.press("3")
  // Persisting rows keep their DOM; size and the spring card leave, afterglow arrives.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelectorAll('[data-controls="parameters"] [data-presence]').length,
      ),
    )
    .toBeGreaterThan(0)
  await expect.poll(rowLabels).toEqual(["Stops", "Active stop", "Afterglow"])
  await expect(params(page).locator("[data-presence]")).toHaveCount(0)
  expect(
    await page.evaluate(
      () =>
        (window as any).__stops ===
        document.querySelector('[data-controls="parameters"] [data-field="stops"]'),
    ),
  ).toBe(true)
  await expect(params(page).locator(".knobs-spring")).toHaveCount(0)
  // J: a different item lands — transitions are off for the frame, values placed at once.
  await page.keyboard.press("j")
  const root = page.locator('[data-controls="parameters"]')
  await expect(root).toHaveAttribute("data-landing", "")
  const size = params(page).getByRole("slider", { name: "Size" })
  await expect(size).toHaveAttribute("aria-valuenow", "120")
  const fill = await params(page)
    .locator('[data-field="size"] .knobs-fill')
    .evaluate((el) => getComputedStyle(el).getPropertyValue("--k-fill"))
  expect(parseFloat(fill)).toBeCloseTo(((120 - 24) / 136) * 100, 0)
  await expect(root).not.toHaveAttribute("data-landing", "")
})

test("the row in hand holds against the server; the newest value lands on release", async ({
  page,
}) => {
  await open(page, "?v=4")
  const glow = params(page).getByRole("slider", { name: "Afterglow" })
  const box = (await glow.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 4 })
  const dragged = Number(await glow.getAttribute("aria-valuenow"))
  await page.waitForTimeout(500) // the drag's own echo lands meanwhile
  await page.evaluate(() => (window as any).__problems.serverSet("glow", 95))
  await page.waitForTimeout(100)
  await expect(glow).toHaveAttribute("aria-valuenow", String(dragged))
  await page.mouse.up()
  // Let go (and past the echo window): the board's latest value stands.
  await expect(glow).toHaveAttribute("aria-valuenow", "95", { timeout: 2000 })
})

test("flat spring, prototype settings over postMessage, modified dot, fine-grained rows", async ({
  page,
}) => {
  await open(page)
  await expect(page.locator(".choose .dot")).not.toHaveClass(/on/)
  // One spring card, two sliders, flat keys.
  const card = params(page).locator(".knobs-spring")
  await expect(card.getByRole("slider")).toHaveCount(2)
  await card.getByRole("slider", { name: "Duration" }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(log(page)).toContainText("set duration = 0.5")
  await page.keyboard.press("Tab")
  await page.keyboard.press("ArrowLeft")
  await expect(log(page)).toContainText("set bounce = 0.25")
  expect((await problems(page)).values).toMatchObject({ duration: 0.5, bounce: 0.25 })
  await expect(page.locator(".choose .dot")).toHaveClass(/on/)
  // Long choice lists drop down a menu.
  const device = settings(page).getByRole("button", { name: "Device" })
  await expect(device).toHaveText("iPhone 16")
  await device.click()
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitemradio")).toHaveCount(6)
  await expect(menu.getByRole("menuitemradio", { name: "iPhone 16", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  )
  await menu.getByRole("menuitemradio", { name: "iPad mini" }).click()
  await expect(device).toHaveText("iPad mini")
  await expect
    .poll(() => page.evaluate(() => (window as any).__problems.prototype.device))
    .toBe("ipad-mini")
  await settings(page).getByRole("switch", { name: "Reduce Motion" }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__problems.prototype.motion))
    .toBe(true)
  await settings(page).getByRole("button", { name: "Replay arrival" }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__problems.prototype.replays)).toBe(1)
  // No reset in the settings panel: no modified marks or group reset.
  await expect(settings(page).locator(".knobs-modified")).toHaveCount(0)
  // A value from props touches its own row and nothing else in the panel.
  await page.waitForTimeout(800)
  const touched = await page.evaluate(async () => {
    const root = document.querySelector('[data-controls="parameters"]')!
    const rows = new Set<string>()
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as HTMLElement
        // Rolling-number faces that left the DOM before the callback ran.
        if (!el?.isConnected) continue
        rows.add(el.closest<HTMLElement>("[data-field]")?.dataset.field ?? el.className)
      }
    })
    observer.observe(root, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    })
    ;(window as any).__problems.serverSet("stops", 3)
    await new Promise((r) => setTimeout(r, 400))
    observer.disconnect()
    return [...rows]
  })
  expect(touched).toEqual(["stops"])
})

test("the row menu offers only what's on, and stays out of the way when nothing is", async ({
  page,
}) => {
  await open(page)
  const contextMenu = (locator: ReturnType<Page["locator"]>) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: r.left + 20,
        clientY: r.top + r.height / 2,
      })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })
  // Parameters: random, lock and copy are off; reset is on.
  expect(await contextMenu(params(page).locator('[data-field="stops"] .knobs-track'))).toBe(true)
  const menu = page.getByRole("menu")
  await expect(menu.getByRole("menuitem")).toHaveText(["Reset⌫"])
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  // Prototype settings: no command is left, so the page's own menu shows.
  expect(await contextMenu(settings(page).locator('[data-field="0.2"]'))).toBe(false)
  // The dev dock turns the menu off outright.
  expect(
    await contextMenu(
      page.getByRole("region", { name: "prototype-dock controls" }).locator('[data-field="panel"]'),
    ),
  ).toBe(false)
  await expect(page.getByRole("menu")).toHaveCount(0)
})

test("no forced layout per pointer move while dragging (DOM renderer)", async ({ page }) => {
  await open(page, "?dom")
  const cdp = await page.context().newCDPSession(page)
  const size = params(page).getByRole("slider", { name: "Size" })
  const box = (await size.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 40, y)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, y)
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReturnAsStream",
  })
  const moves = 40
  for (let i = 0; i < moves; i++) {
    await page.mouse.move(box.x + 50 + i * 4, y)
    await page.evaluate(() => new Promise(requestAnimationFrame))
  }
  const done = new Promise<string>((resolve) =>
    cdp.once("Tracing.tracingComplete", async ({ stream }) => {
      let data = ""
      for (;;) {
        const chunk = await cdp.send("IO.read", { handle: stream! })
        data += chunk.data
        if (chunk.eof) break
      }
      resolve(data)
    }),
  )
  await cdp.send("Tracing.end")
  await page.mouse.up()
  const events = JSON.parse(await done).traceEvents as {
    name: string
    args?: { beginData?: { stackTrace?: unknown } }
  }[]
  const forced = events.filter((e) => e.name === "Layout" && e.args?.beginData?.stackTrace)
  // Layout belongs to the frame, not to the pointer handlers.
  expect(forced.length).toBeLessThanOrEqual(1)
  test
    .info()
    .annotations.push({ type: "forced layouts", description: `${forced.length} in ${moves} moves` })
})
