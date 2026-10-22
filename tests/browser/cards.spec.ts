import { expect, type Page, test } from "@playwright/test"

// examples/cards.html: OpenCode Desktop's Motion workspace with a card per experiment, each with a
// description, most folded to a summary, and an `onActive` readout outlining the app's parts.
test.use({ colorScheme: "dark", deviceScaleFactor: 2, viewport: { width: 980, height: 720 } })

const panel = (page: Page) => page.locator('[data-controls="opencode-cards"]')
const head = (page: Page, group: string) =>
  panel(page).locator(`.knobs-group-head[data-group="${group}"]`)
const row = (page: Page, key: string) => panel(page).locator(`[data-field="${key}"]`)
const heard = (page: Page) =>
  page.evaluate(() => [...(window as any).cards.heard]) as Promise<unknown[]>
const lastHeard = async (page: Page) => (await heard(page)).at(-1)
const out = (name: string) => `${process.env.STILLS ?? "test-results/stills"}/${name}`
const moving = (page: Page) =>
  page.evaluate(() => [
    ...document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === "running" &&
          a.timeline instanceof DocumentTimeline &&
          a.effect?.getTiming().iterations !== Infinity,
      )
      .map((a) => `animation ${(a as CSSAnimation).animationName ?? a.constructor.name}`),
    ...[...document.querySelectorAll<HTMLElement>("[data-tab-opacity],[data-presence]")].map(
      (n) => `${n.className} presence=${n.dataset.presence ?? ""}`,
    ),
  ])
const still = (page: Page) => expect.poll(() => moving(page), { timeout: 10_000 }).toEqual([])

async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  await page.goto(`/cards.html${query}`)
  await expect(row(page, "speed")).toBeVisible()
  await still(page)
  return errors
}

test("a panel card shows its description under its title, wrapping, and search finds it", async ({
  page,
}) => {
  const errors = await open(page, "?search")
  const desc = head(page, "Message menu").locator(".knobs-group-desc")
  await expect(desc).toHaveText("Hover a message in the timeline")
  const look = await desc.evaluate((d) => {
    const cs = getComputedStyle(d)
    const h = d.closest<HTMLElement>(".knobs-group-head")!
    const label = h.querySelector(".knobs-group-label")!.getBoundingClientRect()
    const buttons = h.querySelector(":scope > span:last-child")!.getBoundingClientRect()
    const box = d.getBoundingClientRect()
    return {
      size: cs.fontSize,
      lineHeight: cs.lineHeight,
      wrap: cs.textWrapStyle,
      transform: cs.textTransform,
      under: box.top >= label.bottom - 0.5,
      // The buttons sit on the title's line, not centred on title and description together.
      buttonsOnTitle: Math.abs((buttons.top + buttons.bottom) / 2 - (label.top + label.bottom) / 2),
      // No box of its own.
      background: cs.backgroundColor,
      border: cs.borderTopWidth,
    }
  })
  expect(look).toMatchObject({
    size: "11px",
    lineHeight: "16px",
    wrap: "pretty",
    transform: "none",
    under: true,
    background: "rgba(0, 0, 0, 0)",
    border: "0px",
  })
  expect(look.buttonsOnTitle).toBeLessThan(1.5)
  // A long one wraps rather than truncating.
  const long = head(page, "Rounded stops").locator(".knobs-group-desc")
  await page.evaluate(() =>
    (window as any).cards.panel.element.closest("#panel").style.setProperty("width", "200px"),
  )
  await expect
    .poll(() => long.evaluate((d) => d.getBoundingClientRect().height))
    .toBeGreaterThan(16)
  await page.evaluate(() =>
    (window as any).cards.panel.element.closest("#panel").style.removeProperty("width"),
  )
  // A group without one has no line, and its header is as before.
  await expect(head(page, "Global").locator(".knobs-group-desc")).toBeHidden()

  // Search matches descriptions, as it does titles.
  await page.evaluate(() => (window as any).cards.panel.search("timeline"))
  await still(page)
  await expect(row(page, "menu")).toBeVisible()
  await expect(row(page, "spinner")).toBeHidden()
  await page.evaluate(() => (window as any).cards.panel.search(""))
  expect(errors).toEqual([])
})

test("the pinned card and the cards' heads hold still through a tab change", async ({ page }) => {
  const errors = await open(page, "?tab=Sidebars")
  const tops = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>(".knobs-pinned .knobs-card")!
    const root = card.closest<HTMLElement>(".knobs-panel")!
    const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (t) => t.textContent === "Experiments",
    )!
    const seen: number[] = []
    tab.click()
    for (let i = 0; i < 30; i++) {
      seen.push(card.getBoundingClientRect().top - root.getBoundingClientRect().top)
      await new Promise(requestAnimationFrame)
    }
    return seen
  })
  expect(new Set(tops.map((t) => Math.round(t * 10))).size).toBe(1)
  await still(page)
  await expect(head(page, "Message menu").locator(".knobs-group-desc")).toBeVisible()
  expect(errors).toEqual([])
})

test("folded cards sum up their values on the right, live, and opening one hides it", async ({
  page,
}) => {
  const errors = await open(page)
  const summary = (group: string) => head(page, group).locator(".knobs-group-summary")
  await expect(summary("Activity spinner")).toHaveText("CSS orb")
  await expect(summary("Project avatars")).toHaveText("Letters")
  await expect(summary("Rounded stops")).toHaveText("10 px")
  await expect(summary("Sidebar hover")).toHaveText("Glide · 2 changed")
  await expect(summary("Activity spinner")).toBeVisible()
  // An open card shows none.
  await expect(head(page, "Message menu").locator(".knobs-group-summary")).toHaveCount(0)
  const look = await summary("Activity spinner").evaluate((s) => {
    const cs = getComputedStyle(s)
    return { numeric: cs.fontVariantNumeric, overflow: cs.textOverflow }
  })
  expect(look).toEqual({ numeric: "tabular-nums", overflow: "ellipsis" })

  // Live: a change shows at once.
  await page.evaluate(() => (window as any).cards.controls.set({ spinner: "ripple", stopSize: 12 }))
  await expect(summary("Activity spinner")).toHaveText("Centre ripple")
  await expect(summary("Rounded stops")).toHaveText("12 px")

  // The summary gives way before the title does.
  await page.evaluate(() => {
    const p = (window as any).cards.panel.element.closest("#panel")
    p.style.width = "200px"
  })
  await expect
    .poll(() =>
      head(page, "Activity spinner").evaluate((h) => {
        const s = h.querySelector<HTMLElement>(".knobs-group-summary")!
        const l = h.querySelector<HTMLElement>(".knobs-group-label")!
        return {
          summaryClipped: s.scrollWidth > s.clientWidth,
          titleWhole: l.scrollWidth <= l.clientWidth || s.clientWidth < 1,
        }
      }),
    )
    .toEqual({ summaryClipped: true, titleWhole: true })
  await page.evaluate(() =>
    (window as any).cards.panel.element.closest("#panel").style.removeProperty("width"),
  )

  // Opening hides it; folding again brings it back with the fold's fade.
  await head(page, "Activity spinner").click()
  await expect(summary("Activity spinner")).toBeHidden()
  await expect(row(page, "spinner")).toBeVisible()
  await head(page, "Activity spinner").click()
  await expect(summary("Activity spinner")).toBeVisible()
  await expect(head(page, "Activity spinner")).toHaveAttribute("data-fold-motion", "")
  await still(page)

  // groupSummary replaces it, with the page's signature.
  const text = await page.evaluate(() => {
    const { controls, mountPanel } = (window as any).cards
    const host = document.createElement("div")
    document.body.append(host)
    const other = mountPanel(controls, host, {
      tabs: ["Sidebars", "Experiments"],
      tab: "Experiments",
      session: false,
      groupSummary: (group: string, info: { changed: number; keys: readonly string[] }) =>
        `${group}: ${info.changed}/${info.keys.length}`,
    })
    const t = other.element.querySelector(
      '.knobs-group-head[data-group="Sidebar hover"] .knobs-group-summary',
    ).textContent
    other.dispose()
    host.remove()
    return t
  })
  expect(text).toBe("Sidebar hover: 2/2")
  expect(errors).toEqual([])
})

test("onActive follows the pointer and focus over cards and rows, once a frame", async ({
  page,
}) => {
  const errors = await open(page)
  await page.mouse.move(5, 5)
  await head(page, "Message menu").locator(".knobs-group-label").hover()
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Message menu" })
  await expect(page.locator('[data-area="timeline"]')).toHaveAttribute("data-active", "")
  await row(page, "menu").hover()
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Message menu", key: "menu" })
  // The pinned card counts.
  await row(page, "speed").hover()
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Global", key: "speed" })
  // Off the panel: nothing.
  await page.mouse.move(5, 5)
  await expect.poll(() => lastHeard(page)).toBeNull()
  await expect(page.locator("[data-area][data-active]")).toHaveCount(0)

  // Keyboard focus counts, and a folded card's header is a stop of its own.
  await row(page, "menu").locator("[role=radio][aria-checked=true]").focus()
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Message menu", key: "menu" })
  await page.keyboard.press("ArrowDown")
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Rounded stops" })
  // Focus leaving the page: nothing.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  await expect.poll(() => lastHeard(page)).toBeNull()

  // A sweep over every row reports each change once, never the same value twice in a row.
  const before = (await heard(page)).length
  const box = (await panel(page).boundingBox())!
  for (let y = box.y; y < box.y + box.height; y += 6) await page.mouse.move(box.x + 60, y)
  await page.mouse.move(5, 5)
  await expect.poll(() => lastHeard(page)).toBeNull()
  const sweep = (await heard(page)).slice(before)
  for (let i = 1; i < sweep.length; i++)
    expect(JSON.stringify(sweep[i]), `report ${i}`).not.toBe(JSON.stringify(sweep[i - 1]))
  expect(sweep.length).toBeGreaterThan(4)

  // Gone with the panel: a last null, and no more after.
  await row(page, "menu").hover()
  await expect.poll(() => lastHeard(page)).toEqual({ group: "Message menu", key: "menu" })
  const after = await page.evaluate(async () => {
    const { panel, heard } = (window as any).cards
    panel.dispose()
    const n = heard.length
    document.body.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }))
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    return { last: heard.at(-1), more: heard.length - n }
  })
  expect(after).toEqual({ last: null, more: 0 })
  expect(errors).toEqual([])
})

test("stills: the Experiments tab folded to a line a card, in the DOM and on the GPU", async ({
  page,
}) => {
  for (const renderer of ["dom", "gpu"] as const) {
    const errors = await open(page, renderer === "gpu" ? "?renderer=gpu" : "")
    await page.waitForTimeout(300)
    const shown = await panel(page).getAttribute("data-renderer")
    await (renderer === "dom" ? head(page, "Message menu") : head(page, "Activity spinner"))
      .locator(".knobs-group-label")
      .hover()
    await expect(page.locator("[data-area][data-active]")).toHaveCount(1)
    await still(page)
    await page.waitForTimeout(200)
    await page.screenshot({ path: out(`cards-${renderer}-${shown}.png`) })
    expect(errors).toEqual([])
  }
})
