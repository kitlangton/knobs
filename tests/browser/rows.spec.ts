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
  // Narrowed step by step, the label never loses a letter: the row turns into a menu first.
  const clipped = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const out: string[] = []
    for (const id of ["knobs-dom", "lab-dom"]) {
      const slot = document.getElementById(id)!
      const row = slot.querySelector<HTMLElement>('[data-field="keyLabels"]')!
      const label = row.querySelector<HTMLElement>(":scope > span:first-child")!
      for (let w = 340; w >= 220; w -= 4) {
        slot.style.width = `${w}px`
        await frame()
        if (label.scrollWidth > label.clientWidth + 0.5) out.push(`${id}@${w}`)
      }
      slot.style.width = ""
    }
    return out
  })
  expect(clipped).toEqual([])
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

test("a long label beside a long menu value keeps its words; the value and a host's pin give way", async ({
  page,
}) => {
  const errors = await open(page)
  // Arcade's 270px column: "Look & threat by hour" over "Dynamic (time of day)", each row with a
  // host's pin that only shows on hover (Weather's is pinned, so it shows).
  const ids = ["tight-knobs-dom", "tight-lab-dom", "tight-knobs-gpu", "tight-lab-gpu"]
  const measure = (id: string, field: string) =>
    page.evaluate(
      ([id, field]) => {
        const row = document.querySelector<HTMLElement>(`#${id} [data-field="${field}"]`)!
        const label = row.querySelector<HTMLElement>(":scope > span:first-child")!
        const select = row.querySelector<HTMLElement>(".knobs-select")!
        const value = row.querySelector<HTMLElement>(".knobs-select-value")!
        const pin = row.querySelector<HTMLElement>(".pin")!.getBoundingClientRect()
        const cs = getComputedStyle(row)
        const inner = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const l = label.getBoundingClientRect()
        const s = select.getBoundingClientRect()
        return {
          display: row.dataset.display,
          labelCut: label.scrollWidth > label.clientWidth + 0.5,
          labelShare: l.width / inner,
          valueCut: value.scrollWidth > value.clientWidth + 0.5,
          valueEm: value.clientWidth / parseFloat(getComputedStyle(value).fontSize),
          title: select.title,
          pinClear: pin.right <= s.left + 0.5,
          over: row.hasAttribute("data-acc-over"),
          labelRight: l.right,
          pinLeft: pin.left,
        }
      },
      [id, field],
    )
  for (const id of ids) {
    await expect.poll(async () => (await measure(id, "mood")).labelCut, { message: id }).toBe(false)
    const mood = await measure(id, "mood")
    expect(mood.display, id).toBe("menu")
    // Only the value truncates; its whole text is the button's tooltip.
    expect(mood.valueCut, id).toBe(true)
    expect(mood.title, id).toBe("Dynamic (time of day)")
    // The pin, hidden at rest, stays clear of the value and off the label's words.
    expect(mood.pinClear, id).toBe(true)
    // A label too long for any column gives way, but keeps more than half the row, and the
    // value keeps a few letters; the pin lies over the label's end instead of shrinking it.
    const long = await measure(id, "tooLong")
    expect(long.labelCut, id).toBe(true)
    expect(long.labelShare, id).toBeGreaterThan(0.5)
    expect(long.valueEm, id).toBeGreaterThan(3)
    expect(long.pinClear, id).toBe(true)
    expect(long.over, id).toBe(true)
    expect(long.pinLeft, id).toBeLessThan(long.labelRight)
  }
  // The label's end fades from under the pin while the row is hovered, and back after.
  const tail = panel(page, "tight-knobs-dom").locator('[data-field="tooLong"] > span:first-child')
  const maskAt = () => tail.evaluate((el) => getComputedStyle(el).maskPosition)
  expect(await maskAt()).toMatch(/^0(%|px)? /)
  await panel(page, "tight-knobs-dom").locator('[data-field="tooLong"]').hover()
  await expect.poll(maskAt).toMatch(/^100%/)
  await page.mouse.move(2, 2)
  await expect.poll(maskAt).toMatch(/^0(%|px)? /)

  // Narrowed step by step, the label only loses letters once the value is down to its few.
  const early = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const slot = document.getElementById("tight-knobs-dom")!
    const row = slot.querySelector<HTMLElement>('[data-field="mood"]')!
    const label = row.querySelector<HTMLElement>(":scope > span:first-child")!
    const value = row.querySelector<HTMLElement>(".knobs-select-value")!
    const out: string[] = []
    for (let w = 380; w >= 200; w -= 6) {
      slot.style.width = `${w}px`
      await frame()
      const em = value.clientWidth / parseFloat(getComputedStyle(value).fontSize)
      if (label.scrollWidth > label.clientWidth + 0.5 && em > 4.5) out.push(`${w}: ${em}`)
    }
    slot.style.width = ""
    return out
  })
  expect(early).toEqual([])
  expect(errors).toEqual([])
})

test("on the GPU, the narrow column's labels draw whole and the host's pins sit above the canvas", async ({
  page,
}) => {
  await open(page)
  const gpu = panel(page, "tight-knobs-gpu")
  await expect(gpu).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await gpu.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  // The overlay draws what's on screen.
  await gpu.scrollIntoViewIfNeeded()
  const drawn = () => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[])
  await expect
    .poll(drawn, { timeout: 10_000 })
    .toEqual(expect.arrayContaining(["Look & threat by hour", "Dyna…"]))
  expect(
    (await drawn()).filter((t) => t.startsWith("Look") && t !== "Look & threat by hour"),
  ).toEqual([])
  // The pin is the host's DOM: its row doesn't trap it in a stacking context under the canvas.
  const stack = await gpu.locator('[data-field="weather"]').evaluate((row) => ({
    contain: getComputedStyle(row).contain,
    z: getComputedStyle(row.querySelector(".knobs-accessory")!).zIndex,
  }))
  expect(stack.contain).not.toMatch(/layout|paint|strict|content/)
  expect(Number(stack.z)).toBeGreaterThan(2147480002)
})
