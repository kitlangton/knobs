import { expect, type Page, test } from "@playwright/test"

// examples/rows.html: inspector rows in a host's column, in knobs' look, labPreset's and labPreset's
// with button tokens, each by the DOM (top) and the GPU (bottom).
const panel = (page: Page, id: string) => page.locator(`#${id} .knobs-panel`)
const rows = <T>(page: Page, fn: (rows: any) => T) =>
  page.evaluate(`(${fn.toString()})(window.__rows)`) as Promise<T>
async function open(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/rows.html")
  await expect(panel(page, "lab-dom").locator('[data-field="keyLabels"]')).toBeVisible()
  return errors
}

test("a segmented choice keeps its label's words, or becomes a menu", async ({ page }) => {
  const errors = await open(page)
  for (const id of ["knobs-dom", "lab-dom", "buttons-dom"]) {
    const row = panel(page, id).locator('[data-field="keyLabels"]')
    const label = row.locator(":scope > span:first-child")
    await expect
      .poll(() => label.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5))
      .toBe(true)
    // Segmented, the buttons show whole too.
    if ((await row.getAttribute("data-display")) === "segmented")
      for (const b of await row.locator(".knobs-seg button").all())
        expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5)).toBe(true)
  }
  // The Lab's 11.5px type fits both; knobs' 12px rows drop down a menu instead.
  await expect(panel(page, "lab-dom").locator('[data-field="keyLabels"]')).toHaveAttribute(
    "data-display",
    "segmented",
  )
  await expect(panel(page, "knobs-dom").locator('[data-field="keyLabels"]')).toHaveAttribute(
    "data-display",
    "menu",
  )
  expect(errors).toEqual([])
})

test("an inline flat panel has no border: its rows meet the host column's edges", async ({
  page,
}) => {
  await open(page)
  for (const id of ["lab-dom", "lab-gpu"]) {
    const fit = await page.locator(`#${id}`).evaluate((slot) => {
      const root = slot.querySelector<HTMLElement>(".knobs-panel")!
      const cs = getComputedStyle(root)
      const s = slot.getBoundingClientRect()
      const r = root.querySelector('[data-field="yaw"]')!.getBoundingClientRect()
      return { border: cs.borderLeftWidth, left: r.left - s.left, right: s.right - r.right }
    })
    expect(fit).toEqual({ border: "0px", left: 0, right: 0 })
  }
  // knobs' own card keeps its hairline.
  expect(
    await panel(page, "knobs-dom").evaluate((el) => getComputedStyle(el).borderLeftWidth),
  ).toBe("1px")
})

test("vector cells take their axes' names: letters and accessible names", async ({ page }) => {
  await open(page)
  const cells = panel(page, "lab-dom").locator('[data-field="position"] .knobs-cell')
  await expect(cells.locator(".knobs-cell-axis")).toHaveText(["X", "Z"])
  await expect(cells.nth(1)).toHaveAttribute("aria-label", "Position z")
  await cells.nth(1).focus()
  await page.keyboard.press("ArrowRight")
  await expect
    .poll(() => rows(page, (r) => r.stores["lab-dom"].get().position))
    .toEqual({ x: 2, y: -3.9 })
  // Others keep x, y and z.
  await expect(panel(page, "lab-dom").locator('[data-field="scale"] .knobs-cell-axis')).toHaveText([
    "X",
    "Y",
    "Z",
  ])
})

test("action rows and preset chips wear the button tokens; --k-button-color colours buttons", async ({
  page,
}) => {
  await open(page)
  const look = (id: string) =>
    panel(page, id).evaluate((root) => {
      const cs = (sel: string) => getComputedStyle(root.querySelector(sel)!)
      return {
        buttons: root.hasAttribute("data-buttons"),
        actionBg: cs(".knobs-action").backgroundColor,
        actionColor: cs(".knobs-action").color,
        actionH: cs(".knobs-action").height,
        chipBg: cs(".knobs-preset-chip").backgroundColor,
        chipH: cs(".knobs-preset-chip").height,
        toolColor: cs(".knobs-tool").color,
      }
    })
  // From the first paint: nothing glides in.
  const boxed = await look("buttons-dom")
  expect(boxed).toMatchObject({
    buttons: true,
    actionBg: "rgb(32, 34, 39)",
    actionColor: "rgb(216, 219, 224)",
    actionH: "20px",
    chipBg: "rgb(32, 34, 39)",
    chipH: "20px",
    toolColor: "rgb(216, 219, 224)",
  })
  // Without button tokens, an action is still a full-width row of text.
  const plain = await look("lab-dom")
  expect(plain.buttons).toBe(false)
  expect(plain.actionBg).toBe("rgba(0, 0, 0, 0)")
  expect(plain.actionH).toBe("26px")
  // The sized button takes the click and reports it.
  await panel(page, "buttons-dom").locator(".knobs-action").click()
  await expect.poll(() => rows(page, (r) => r.presses)).toEqual(["buttons-dom:retrigger"])
})

test("sub-headings gather their rows: loose rows first, then each sub-heading's", async ({
  page,
}) => {
  await open(page)
  const order = await panel(page, "lab-dom").evaluate((root) =>
    [...root.querySelectorAll('[data-group="place"].knobs-card > *')].map(
      (el) =>
        (el as HTMLElement).dataset.field ??
        el.querySelector(".knobs-subhead-label")?.textContent ??
        el.className,
    ),
  )
  expect(order).toEqual([
    "position",
    "yaw",
    "scale",
    "Pivot",
    "pivotX",
    "pivotY",
    "Forces",
    "drag",
    "gust",
  ])
  // ↓ walks them in that order (from the last of Scale's cells, through the sub-heading).
  await panel(page, "lab-dom").locator('[data-field="scale"] .knobs-cell').last().focus()
  await page.keyboard.press("ArrowDown")
  await expect(panel(page, "lab-dom").locator(".knobs-subhead").first()).toBeFocused()
  await page.keyboard.press("ArrowDown")
  await expect(panel(page, "lab-dom").locator('[data-field="pivotX"] .knobs-track')).toBeFocused()
})

test("display-only shortcut chips show the key but leave it to the panel and the page", async ({
  page,
}) => {
  await open(page)
  const tools = panel(page, "lab-dom").locator('[data-field="tools"]')
  await expect(tools.locator(".knobs-tool-key")).toHaveText(["F", "G", "Space"])
  await expect(tools.locator('[data-item="frame"]')).not.toHaveAttribute("aria-keyshortcuts")
  await expect(tools.locator('[data-item="play"]')).toHaveAttribute("aria-keyshortcuts", "Space")
  // G is the panel's own again (the group's Random), and Space still presses Play.
  await panel(page, "lab-dom").locator('[data-field="yaw"] .knobs-track').focus()
  await page.keyboard.press("g")
  await expect.poll(() => rows(page, (r) => r.stores["lab-dom"].isModified("yaw"))).toBe(true)
  await page.keyboard.press("Space")
  await expect.poll(() => rows(page, (r) => r.presses)).toEqual(["lab-dom:play"])
})

test("panel.search(query, chips) searches from code and reads back", async ({ page }) => {
  await open(page)
  const shown = () =>
    panel(page, "lab-dom").evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>(".knobs-row[data-field]")]
        .filter((el) => !el.closest("[hidden],[data-leaving]") && el.offsetHeight > 0)
        .map((el) => el.dataset.field),
    )
  expect(await rows(page, (r) => r.panels["lab-dom"].search())).toEqual({ query: "", chips: [] })
  expect(await rows(page, (r) => r.panels["lab-dom"].search("pivot"))).toEqual({
    query: "pivot",
    chips: [],
  })
  await expect(panel(page, "lab-dom").locator(".knobs-search input")).toHaveValue("pivot")
  await expect.poll(shown).toEqual(["pivotX", "pivotY"])
  // Chips on, the query kept; nothing modified yet, so nothing shows.
  await rows(page, (r) => r.stores["lab-dom"].set({ drag: 0.5 }))
  expect(await rows(page, (r) => r.panels["lab-dom"].search(undefined, ["modified"]))).toEqual({
    query: "pivot",
    chips: ["modified"],
  })
  await expect.poll(shown).toEqual([])
  await rows(page, (r) => r.panels["lab-dom"].search(""))
  await expect.poll(shown).toEqual(["drag"])
  await expect(
    panel(page, "lab-dom").locator('.knobs-search-chip[data-chip="modified"]'),
  ).toHaveAttribute("aria-pressed", "true")
  expect(await rows(page, (r) => r.panels["lab-dom"].search("", []))).toEqual({
    query: "",
    chips: [],
  })
})

test("the GPU draws them as the DOM does", async ({ page }) => {
  await open(page)
  const gpu = panel(page, "buttons-gpu")
  await expect(gpu).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await gpu.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  await expect
    .poll(() => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[]), {
      timeout: 10_000,
    })
    .toEqual(expect.arrayContaining(["Frame", "F", "Grid", "G", "Play", "Space"]))
})
