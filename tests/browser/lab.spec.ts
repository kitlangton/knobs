import { expect, type Locator, type Page, test } from "@playwright/test"

// examples/lab.html: knobs panels in a dense editor's column, themed with labPreset, over host
// state with its own undo stack, a seeded Random, gated rows, folded groups and row accessories.
const station = (page: Page) => page.locator('[data-controls="lab-station"]')
const details = (page: Page) => page.locator('[data-controls="lab-details"]')
const row = (scope: Locator, key: string) => scope.locator(`[data-field="${key}"]`)
const lab = <T>(page: Page, fn: (lab: any) => T) =>
  page.evaluate(`(${fn.toString()})(window.__lab)`) as Promise<T>
async function open(page: Page, query = "") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`/lab.html${query}`)
  await expect(row(station(page), "intensity")).toBeVisible()
  return errors
}
const settings = (page: Page) => lab(page, (l) => ({ ...l.settings }))
// Computed colours spell "transparent" as rgba(…, 0) or color(srgb … / 0), by how they were mixed.
const clear = (color: string) => /(,\s*|\/\s*)0\)$/.test(color)

test("labPreset: square, compact and flat, with no card inside the host's card", async ({
  page,
}) => {
  const errors = await open(page)
  const panel = station(page)
  await expect(panel).toHaveAttribute("data-frame", "flat")
  const look = await panel.evaluate((root) => {
    const cs = (sel: string) => getComputedStyle(root.querySelector(sel)!)
    const own = getComputedStyle(root)
    return {
      panelBg: own.backgroundColor,
      panelBorder: own.borderTopColor,
      panelPad: own.paddingLeft,
      font: own.fontSize,
      letterSpacing: own.letterSpacing,
      cards: [...root.querySelectorAll(".knobs-card")].map((c) => [
        getComputedStyle(c).backgroundColor,
        getComputedStyle(c).borderTopLeftRadius,
      ]),
      row: cs('[data-field="intensity"]').height,
      toggle: cs(".knobs-toggle").borderTopLeftRadius,
      thumb: cs(".knobs-toggle i").borderTopLeftRadius,
      headButton: cs("header button").borderTopLeftRadius,
      readout: cs(".knobs-value").fontFamily,
      group: cs(".knobs-group-label").textTransform,
    }
  })
  expect(clear(look.panelBg)).toBe(true)
  expect(clear(look.panelBorder)).toBe(true)
  expect(look.panelPad).toBe("0px")
  expect(look.font).toBe("11.5px")
  expect(look.letterSpacing).toBe("normal")
  for (const [bg, radius] of look.cards) expect([clear(bg), radius]).toEqual([true, "0px"])
  expect(look.row).toBe("26px")
  expect([look.toggle, look.thumb, look.headButton]).toEqual(["0px", "0px", "0px"])
  expect(look.readout).toContain("monospace")
  expect(look.group).toBe("uppercase")
  // Nothing inside the panel outlines a box: rows split by hairlines, groups by one over their label.
  // (Floating layers and the preset selection pill aren't frames, so they keep their rims.)
  const borders = await panel.evaluate((root) =>
    [root, ...root.querySelectorAll("*")].map((el) => {
      if (el.closest(".knobs-popover, .knobs-presets-pill")) return []
      const cs = getComputedStyle(el)
      return ["top", "right", "bottom", "left"]
        .filter((side) => parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0)
        .map((side) => cs.getPropertyValue(`border-${side}-color`))
    }),
  )
  expect(borders.filter((sides) => sides.filter((c) => !clear(c)).length > 1)).toEqual([])
  expect(errors).toEqual([])
})

test("every field row carries knobs-row and data-field, slider rows too", async ({ page }) => {
  await open(page)
  const rows = await page
    .locator(".knobs-panel [data-field]")
    .evaluateAll((els) => els.map((el) => el.classList.contains("knobs-row")))
  expect(rows.length).toBeGreaterThan(15)
  expect(rows.every(Boolean)).toBe(true)
  await expect(row(station(page), "intensity")).toHaveClass(/knobs-slider/)
  await expect(page.locator('.knobs-row[data-field="intensity"]')).toHaveCount(1)
})

test("Random draws from the recorded seed, reproducibly, and skips seeds and read-only rows", async ({
  page,
}) => {
  await open(page)
  const seed = await lab(page, (l) => l.tuning.seed)
  await row(station(page), "intensity").locator(".knobs-track").focus()
  await page.keyboard.press("r")
  const first = await settings(page)
  expect(first.intensity).not.toBe(1)
  expect(await lab(page, (l) => l.tuning.seed)).toBe(seed + 1)
  // Back through the host's undo, then the same seed rolls the same values.
  await page.keyboard.press("u")
  expect((await settings(page)).intensity).toBe(1)
  await lab(page, (l) => l.reseed(41))
  await page.keyboard.press("r")
  expect(await settings(page)).toEqual(first)
  // The details panel: the room seed (random: false, read-only) never moves.
  await row(details(page), "exposure").locator(".knobs-track").focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press("r")
  expect((await settings(page)).roomSeed).toBe(7)
})

test("the host owns undo: the buttons and keys call it, and follow its canUndo", async ({
  page,
}) => {
  await open(page)
  const undo = station(page).getByRole("button", { name: "Undo" })
  await expect(undo).toBeDisabled()
  const track = row(station(page), "fall").locator(".knobs-track")
  await track.focus()
  await page.keyboard.press("ArrowRight")
  expect((await settings(page)).fall).toBe(15.5)
  await expect(undo).toBeEnabled()
  // Compare (hold \) previews knobs' own last entry.
  await page.keyboard.down("\\")
  await expect(row(station(page), "fall").locator(".knobs-track")).toHaveAttribute(
    "aria-valuenow",
    "15",
  )
  await page.keyboard.up("\\")
  await undo.click()
  expect((await settings(page)).fall).toBe(15)
  await expect(undo).toBeDisabled()
  await expect(station(page).getByRole("button", { name: "Redo" })).toBeEnabled()
  await track.focus()
  await page.keyboard.press("Shift+U")
  expect((await settings(page)).fall).toBe(15.5)
})

test("disabled rows dim and take no edits; read-only rows show at full strength and don't either", async ({
  page,
}) => {
  await open(page)
  const panel = details(page)
  const cone = row(panel, "cone")
  await expect(cone).not.toHaveAttribute("data-disabled", "")
  await panel.getByRole("radio", { name: "Area" }).click()
  await expect(cone).toHaveAttribute("data-disabled", "")
  await expect(cone.locator(".knobs-track")).toHaveAttribute("aria-disabled", "true")
  await expect
    .poll(() => cone.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(0.5)
  const before = (await settings(page)).cone
  // Pointer: a drag across it changes nothing, but the press focuses it, to read.
  const box = (await cone.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  expect((await settings(page)).cone).toBe(before)
  await expect(cone.locator(".knobs-track")).toBeFocused()
  // Keys: edits stop there; ↑↓ still move through it.
  for (const key of ["ArrowRight", "ArrowLeft", "Shift+ArrowRight", "5", "Enter", "Backspace"])
    await page.keyboard.press(key)
  expect((await settings(page)).cone).toBe(before)
  await expect(cone.locator(".knobs-number")).toBeHidden()
  await page.keyboard.press("ArrowDown")
  await expect(row(panel, "falloff").locator(".knobs-track")).toBeFocused()
  // Random and Reset leave it be.
  await page.keyboard.press("r")
  expect((await settings(page)).cone).toBe(before)

  // Read-only: full strength, no edits.
  const seed = row(panel, "roomSeed")
  await expect(seed).toHaveAttribute("data-readonly", "")
  expect(await seed.evaluate((el) => getComputedStyle(el).opacity)).toBe("1")
  await seed.locator(".knobs-track").focus()
  await page.keyboard.press("ArrowRight")
  expect((await settings(page)).roomSeed).toBe(7)
  // Enabled again by the value it depends on.
  await panel.getByRole("radio", { name: "Spot" }).click()
  await expect(cone).not.toHaveAttribute("data-disabled", "")
})

test("mixed values read — until edited, and the first edit reaches the host", async ({ page }) => {
  await open(page)
  const panel = details(page)
  await lab(page, (l) => l.details.setMixed(["exposure", "flashlight", "preset"]))
  const exposure = row(panel, "exposure")
  await expect(exposure).toHaveClass(/knobs-mixed/)
  expect(
    await exposure
      .locator(".knobs-value")
      .evaluate((el) => getComputedStyle(el, "::after").content),
  ).toBe('"—"')
  await expect(exposure.locator(".knobs-track")).toHaveAttribute("aria-valuetext", "Mixed")
  await expect(row(panel, "flashlight").locator(".knobs-toggle")).toHaveAttribute(
    "aria-checked",
    "mixed",
  )
  await expect(row(panel, "preset").locator(".knobs-select-value")).toHaveText("—")
  // Picking the value it already has still applies it (to every selected item).
  const writes = await lab(page, (l) => l.past.length)
  await lab(page, (l) => l.details.set({ preset: "Storm" }))
  expect(await lab(page, (l) => l.past.length)).toBe(writes + 1)
  await expect(row(panel, "preset").locator(".knobs-select-value")).toHaveText("Storm")
  await exposure.locator(".knobs-track").focus()
  await page.keyboard.press("ArrowRight")
  await expect(exposure).not.toHaveClass(/knobs-mixed/)
})

test("groups fold: animated, by click and keys, starting from their fields' `folded`", async ({
  page,
}) => {
  await open(page)
  const panel = details(page)
  const head = panel.locator('.knobs-group-head[data-group="fireball"]')
  const card = panel.locator('.knobs-card[data-group="fireball"]')
  await expect(head).toHaveAttribute("aria-expanded", "false")
  await expect(card).toBeHidden()
  await head.locator(".knobs-group-label").click()
  await expect(head).toHaveAttribute("aria-expanded", "true")
  await expect(card).toBeVisible()
  // Mid-way it's still folding: its height is between closed and open.
  await head.locator(".knobs-group-label").click()
  const mid = await card.evaluate((el) => el.getBoundingClientRect().height)
  expect(mid).toBeGreaterThan(0)
  await expect(card).toBeHidden()
  // Keys: ↑↓ reach the header; Enter toggles, → opens, ← folds; rows inside are stops when open.
  await row(panel, "exposure").locator(".knobs-track").focus()
  await page.keyboard.press("ArrowDown")
  await expect(head).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(card).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await expect(row(panel, "fbSize").locator(".knobs-track")).toBeFocused()
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("ArrowLeft")
  await expect(card).toBeHidden()
  await page.keyboard.press("ArrowRight")
  await expect(card).toBeVisible()
  await lab(page, (l) => l.panels[1].fold("fireball", true))
  await expect(card).toBeHidden()
  // session: false keeps nothing for this tab.
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([])
})

test("row accessories sit in each row, keep across a descriptor swap, and take their own clicks", async ({
  page,
}) => {
  await open(page)
  const panel = station(page)
  const slot = row(panel, "density").locator(".knobs-accessory")
  await expect(slot.locator(".lab-pin")).toHaveCount(1)
  const pin = slot.locator(".lab-pin")
  const before = (await settings(page)).density
  await row(panel, "density").hover()
  await pin.click()
  await expect(pin).toHaveAttribute("aria-pressed", "true")
  expect((await settings(page)).density).toBe(before)
  // The label ends before the accessory; the ticks keep clear of both.
  const gap = await row(panel, "density").evaluate((r) => {
    const label = r.querySelector(".knobs-label")!.getBoundingClientRect()
    const acc = r.querySelector(".knobs-accessory")!.getBoundingClientRect()
    return acc.left - label.right
  })
  expect(gap).toBeGreaterThanOrEqual(0)
  // A swap that drops a row keeps the others' DOM, accessory included.
  await page.evaluate(() => {
    const l = (window as any).__lab
    ;(window as any).__kept = document.querySelector('[data-field="density"] .lab-pin')
    l.station.update(
      l.descriptors.filter((d: { key: string }) => d.key !== "size"),
      l.settings,
    )
  })
  await expect(row(panel, "size")).toHaveCount(0)
  expect(
    await page.evaluate(
      () => (window as any).__kept === document.querySelector('[data-field="density"] .lab-pin'),
    ),
  ).toBe(true)
})

test("long choices: the row truncates its value, the menu searches; keys and hints still work", async ({
  page,
}) => {
  await open(page)
  const panel = details(page)
  const scene = row(panel, "scene")
  const button = scene.getByRole("button", { name: "Test scene" })
  // The label keeps its words; the value truncates at its end, its whole text on hover.
  const fit = await scene.evaluate((r) => {
    const label = r.querySelector(":scope > span")!
    const value = r.querySelector(".knobs-select-value")!
    return {
      label: label.scrollWidth <= label.clientWidth,
      value: value.scrollWidth > value.clientWidth,
    }
  })
  expect(fit).toEqual({ label: true, value: true })
  await expect(button).toHaveAttribute("title", "Outbreak · Streetlamp & rain")
  await button.click()
  const search = page.locator(".knobs-menu-search")
  await expect(search).toBeFocused()
  await page.keyboard.type("hour")
  await expect(page.locator(".knobs-menu-item:not([hidden])")).toHaveCount(2)
  // The match is marked by colour, so the labels keep the width the menu measured.
  expect(
    await page
      .locator(".knobs-menu-item:not([hidden]) > span")
      .evaluateAll((spans) => spans.map((s) => s.scrollWidth <= s.clientWidth)),
  ).toEqual([true, true])
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  expect((await settings(page)).scene).toBe("Look & threat by hour · midnight")
  await expect(page.locator(".knobs-menu")).toHaveCount(0)
  await expect(button).toBeFocused()
  // Esc closes without choosing; nothing matching shows so.
  await page.keyboard.press("Enter")
  await page.keyboard.type("zzz")
  await expect(page.locator(".knobs-menu-empty")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator(".knobs-menu")).toHaveCount(0)
  expect((await settings(page)).scene).toBe("Look & threat by hour · midnight")
  // ←/→ on the row still step; hint mode still finds the row.
  await page.keyboard.press("ArrowRight")
  expect((await settings(page)).scene).toBe("3 · High-contrast noir / storm")
  await page.keyboard.press("s")
  await expect(panel.locator(".knobs-hint").first()).toBeVisible()
  await page.keyboard.press("Escape")
})

test("session: false brings nothing back after a reload", async ({ page }) => {
  await open(page)
  await row(station(page), "streak").locator(".knobs-track").focus()
  await page.reload()
  await expect(row(station(page), "intensity")).toBeVisible()
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY")
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([])
})

test("the Lab draws on the GPU overlay as it does in the DOM: flat rows, mixed, disabled, folded", async ({
  page,
}) => {
  await open(page, "?gpu")
  const panel = details(page)
  await expect(panel).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await panel.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  await lab(page, (l) => l.details.setMixed(["exposure"]))
  await panel.locator('.knobs-group-head[data-group="fireball"] .knobs-group-label').click()
  await panel.getByRole("radio", { name: "Area" }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[]), {
      timeout: 10_000,
    })
    .toEqual(expect.arrayContaining(["—", "Fireball size", "Spot cone", "Test scene"]))
  // Accessories stay DOM, above the overlay, in their own colour, and take the click.
  const pin = row(station(page), "density").locator(".lab-pin")
  const top = await pin.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el,
      color: getComputedStyle(el).color,
    }
  })
  expect(top.hit).toBe(true)
  expect(clear(top.color)).toBe(false)
  await pin.click()
  await expect(pin).toHaveAttribute("aria-pressed", "true")
})
