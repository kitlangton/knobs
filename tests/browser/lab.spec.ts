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

// ——— Phase B: the inspector (tabs, sub-headings, inspector fields, the toolbar, search) ———
const inspector = (page: Page) => page.locator('[data-controls="lab-inspector"]')
const values = (page: Page) => lab(page, (l) => ({ ...l.inspector.get() }))
const shown = (scope: Locator, key: string) =>
  row(scope, key).evaluate((el) => !el.closest("[hidden],[data-leaving]"))
/** Waits out running transitions and reveals (a tab's rows unfolding), however busy the machine. */
const still = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document
              .getAnimations()
              .filter(
                (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
              ).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0)

async function openInspector(page: Page, query = "") {
  const errors = await open(page, query)
  await inspector(page).scrollIntoViewIfNeeded()
  return errors
}

test("tabs: a sliding underline, ⌥1–9 and [ ] switch, untabbed rows stay, the tab is remembered", async ({
  page,
}) => {
  const errors = await openInspector(page)
  const panel = inspector(page)
  const tabs = panel.getByRole("tab")
  await expect(tabs).toHaveText(["Transform", "Emitter", "Input"])
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
  expect(await shown(panel, "position")).toBe(true)
  expect(await shown(panel, "seed")).toBe(false)
  // The toolbar names no tab, so it shows on every one.
  expect(await shown(panel, "tools")).toBe(true)
  await tabs.nth(1).click()
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
  await expect.poll(() => shown(panel, "seed")).toBe(true)
  await expect.poll(() => shown(panel, "position")).toBe(false)
  expect(await shown(panel, "tools")).toBe(true)
  // The underline ends under the chosen tab.
  await expect
    .poll(() =>
      panel.evaluate((root) => {
        const bar = root.querySelector<HTMLElement>(".knobs-tabs-bar")!.getBoundingClientRect()
        const on = root.querySelector('[role="tab"][aria-selected="true"]')!.getBoundingClientRect()
        return Math.abs(bar.left - on.left) + Math.abs(bar.right - on.right) < 1
      }),
    )
    .toBe(true)
  // ⌥3 from a row; [ and ] cycle the tabs (the panel shows no presets).
  await row(panel, "rate").locator(".knobs-track").focus()
  await page.keyboard.press("Alt+Digit3")
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true")
  // The focused row left with its tab: focus stays with the strip.
  await expect(tabs.nth(2)).toBeFocused()
  await page.keyboard.press("]")
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("[")
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true")
  // ←/→ on the strip.
  await page.keyboard.press("ArrowLeft")
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true")
  // Mounted again, the panel opens on the tab it last showed.
  await lab(page, (l) => l.remountInspector())
  await expect(inspector(page).getByRole("tab", { name: "Emitter" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  expect(await lab(page, (l) => l.inspectorPanel.tab())).toBe("emitter")
  expect(errors).toEqual([])
})

test("sub-headings: flat headings inside the card that fold, by click or keys, and are stops", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  const head = panel.getByRole("button", { name: "Pivot & bounds" })
  await expect(head).toHaveAttribute("aria-expanded", "true")
  // In the group's card, not a card of its own.
  const look = await head.evaluate((el) => ({
    parent: el.parentElement!.className,
    bg: getComputedStyle(el).backgroundColor,
  }))
  expect(look.parent).toContain("knobs-card")
  expect(clear(look.bg)).toBe(true)
  // ↓ from the scale row reaches it; ← folds it, → opens it, Enter toggles.
  await row(panel, "scale").locator(".knobs-cell").last().focus()
  await page.keyboard.press("ArrowDown")
  await expect(head).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(head).toHaveAttribute("aria-expanded", "false")
  await expect.poll(() => shown(panel, "pivot")).toBe(false)
  await page.keyboard.press("ArrowRight")
  await expect.poll(() => shown(panel, "visible")).toBe(true)
  await head.click()
  await expect.poll(() => shown(panel, "pivot")).toBe(false)
  // Forces starts folded (subsectionFolded).
  await panel.getByRole("tab", { name: "Emitter" }).click()
  await expect(panel.getByRole("button", { name: "Forces" })).toHaveAttribute(
    "aria-expanded",
    "false",
  )
  expect(await shown(panel, "drag")).toBe(false)
})

test("vector cells: arrows step, each cell is a stop, Enter edits, a drag scrubs, a link scales", async ({
  page,
}) => {
  const errors = await openInspector(page)
  const panel = inspector(page)
  const cells = row(panel, "position").locator(".knobs-cell")
  await cells.nth(0).focus()
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).position).toEqual({ x: 0.1, y: 1.2, z: -4 })
  await page.keyboard.press("Shift+ArrowRight")
  expect((await values(page)).position.x).toBe(1.1)
  await page.keyboard.press("ArrowDown")
  await expect(cells.nth(1)).toBeFocused()
  await page.keyboard.press("Enter")
  const edit = cells.nth(1).locator(".knobs-cell-edit")
  await expect(edit).toBeFocused()
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("3")
  await page.keyboard.press("Enter")
  expect((await values(page)).position.y).toBe(3)
  await expect(cells.nth(1)).toBeFocused()
  // A sideways drag scrubs; it doesn't open the editor.
  await still(page)
  const z = (await cells.nth(2).boundingBox())!
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2)
  await page.mouse.down()
  await page.mouse.move(z.x + z.width / 2 + 30, z.y + z.height / 2, { steps: 6 })
  await page.mouse.up()
  expect((await values(page)).position.z).toBeGreaterThan(-4)
  await expect(cells.nth(2).locator(".knobs-cell-edit")).toBeHidden()
  // Scale starts linked: one cell moves all three in proportion.
  await row(panel, "scale").locator(".knobs-cell").first().focus()
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).scale).toEqual({ x: 1.01, y: 1.01, z: 1.01 })
  await row(panel, "scale").getByRole("button", { name: "Unlink axes" }).click()
  await row(panel, "scale").locator(".knobs-cell").first().focus()
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).scale).toEqual({ x: 1.02, y: 1.01, z: 1.01 })
  expect(errors).toEqual([])
})

test("range: two thumbs that can't cross, each a stop with its own keys and editor", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  await panel.getByRole("tab", { name: "Emitter" }).click()
  const low = panel.getByRole("slider", { name: "Lifetime low" })
  const high = panel.getByRole("slider", { name: "Lifetime high" })
  await low.focus()
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).lifetime).toEqual([0.65, 1.4])
  // The low end stops at the high one.
  await page.keyboard.press("End")
  expect((await values(page)).lifetime).toEqual([1.4, 1.4])
  await page.keyboard.press("Home")
  await page.keyboard.press("ArrowDown")
  await expect(high).toBeFocused()
  await page.keyboard.press("Home")
  expect((await values(page)).lifetime).toEqual([0, 0])
  await page.keyboard.press("Enter")
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("2")
  await page.keyboard.press("Enter")
  expect((await values(page)).lifetime).toEqual([0, 2])
  // A press near an end takes that end.
  await row(panel, "lifetime").scrollIntoViewIfNeeded()
  await still(page)
  const track = (await row(panel, "lifetime").boundingBox())!
  await page.mouse.click(track.x + track.width * 0.75, track.y + track.height / 2)
  expect((await values(page)).lifetime).toEqual([0, 3])
})

test("angle: arrows step, ⇧ snaps to 15°, a full turn wraps, a bounded one stops, the dial follows the pointer", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  const yaw = panel.getByRole("slider", { name: "Yaw" })
  await yaw.focus()
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).yaw).toBe(91)
  await page.keyboard.press("Shift+ArrowRight")
  expect((await values(page)).yaw).toBe(105)
  await lab(page, (l) => l.inspector.set({ yaw: 359 }))
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).yaw).toBe(0)
  await page.keyboard.press("ArrowLeft")
  expect((await values(page)).yaw).toBe(359)
  // The dial: pressing at its right edge points the hand at 90°.
  await still(page)
  const dial = (await row(panel, "yaw").locator(".knobs-dial").boundingBox())!
  await page.mouse.click(dial.x + dial.width - 1, dial.y + dial.height / 2)
  expect((await values(page)).yaw).toBeGreaterThan(80)
  expect((await values(page)).yaw).toBeLessThan(100)
  await panel.getByRole("tab", { name: "Emitter" }).click()
  const spread = panel.getByRole("slider", { name: "Spread" })
  await spread.focus()
  await page.keyboard.press("End")
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).spread).toBe(180)
})

test("seed: the die rolls a new one, Space too; Random leaves it alone", async ({ page }) => {
  await openInspector(page)
  const panel = inspector(page)
  await panel.getByRole("tab", { name: "Emitter" }).click()
  await panel.getByRole("button", { name: "Random", exact: true }).click()
  expect((await values(page)).seed).toBe(1234)
  await panel.getByRole("button", { name: "Roll Seed" }).click()
  const rolled = (await values(page)).seed
  expect(rolled).not.toBe(1234)
  await panel.getByRole("spinbutton", { name: "Seed" }).focus()
  await page.keyboard.press(" ")
  expect((await values(page)).seed).not.toBe(rolled)
  const was = (await values(page)).seed
  await page.keyboard.press("ArrowRight")
  expect((await values(page)).seed).toBe(was + 1)
  await page.keyboard.press("Enter")
  await page.keyboard.press("ControlOrMeta+a")
  await page.keyboard.type("42")
  await page.keyboard.press("Enter")
  expect((await values(page)).seed).toBe(42)
})

test("keybind: Enter captures the next combination, Esc cancels, Backspace clears", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  await panel.getByRole("tab", { name: "Input" }).click()
  const fire = row(panel, "fire").locator(".knobs-keys")
  await fire.focus()
  await page.keyboard.press("Enter")
  await expect(fire).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Meta+Shift+K")
  expect((await values(page)).fire).toBe("Shift+Meta+K")
  await expect(fire).toHaveText("⇧⌘K")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Escape")
  await expect(fire).toHaveAttribute("aria-pressed", "false")
  expect((await values(page)).fire).toBe("Shift+Meta+K")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Backspace")
  expect((await values(page)).fire).toBe("")
  await expect(fire).toHaveText("None")
  // Random leaves key combinations alone.
  await panel.getByRole("button", { name: "Random", exact: true }).click()
  expect((await values(page)).reload).toBe("Shift+R")
})

test("toolbar: icons, labels and shortcut chips; shortcuts in the panel, global ones anywhere", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  const tools = panel.getByRole("toolbar", { name: "Playback" })
  await expect(tools.locator(".knobs-tool-key")).toHaveText(["Space", "F", "R", "⇧⌫"])
  const presses = () => lab(page, (l) => [...l.presses])
  await tools.getByRole("button", { name: /Play/ }).click()
  expect(await presses()).toEqual(["play"])
  // While the panel has focus: Space, F and ⇧⌫ press their buttons.
  await row(panel, "position").locator(".knobs-cell").first().focus()
  await page.keyboard.press(" ")
  await page.keyboard.press("f")
  await page.keyboard.press("Shift+Backspace")
  expect(await presses()).toEqual(["play", "play", "frame", "clear"])
  // From the page, only the global one (R).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press(" ")
  await page.keyboard.press("r")
  expect(await presses()).toEqual(["play", "play", "frame", "clear", "retrigger"])
  // ←/→ move along the buttons; the toolbar is one ↑↓ stop.
  await tools.getByRole("button", { name: /Play/ }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(tools.getByRole("button", { name: /Frame/ })).toBeFocused()
})

test("search: / focuses it, rows filter across tabs by label, key or group, chips narrow, Esc clears", async ({
  page,
}) => {
  const errors = await openInspector(page)
  const panel = inspector(page)
  await row(panel, "position").locator(".knobs-cell").first().focus()
  await page.keyboard.press("/")
  const box = panel.getByRole("searchbox")
  await expect(box).toBeFocused()
  await page.keyboard.type("yaw")
  await expect.poll(() => shown(panel, "position")).toBe(false)
  expect(await shown(panel, "yaw")).toBe(true)
  await expect(panel).toHaveAttribute("data-searching", "")
  await expect(row(panel, "yaw").locator("mark.knobs-match")).toHaveText("Yaw")
  // A group's name keeps all of its rows, whatever tab they're on.
  await box.fill("emitter")
  await expect.poll(() => shown(panel, "seed")).toBe(true)
  expect(await shown(panel, "lifetime")).toBe(true)
  expect(await shown(panel, "yaw")).toBe(false)
  // Esc clears; the tab's rows come back.
  await page.keyboard.press("Escape")
  await expect(box).toHaveValue("")
  await expect.poll(() => shown(panel, "position")).toBe(true)
  expect(await shown(panel, "seed")).toBe(false)
  // "Modified" keeps the rows off their defaults, with their count.
  await lab(page, (l) => l.inspector.set({ yaw: 45, rate: 300 }))
  const chip = panel.getByRole("button", { name: /Modified/ })
  await expect(chip).toHaveText(/2/)
  await chip.click()
  await expect.poll(() => shown(panel, "rate")).toBe(true)
  expect(await shown(panel, "yaw")).toBe(true)
  expect(await shown(panel, "position")).toBe(false)
  await chip.click()
  await expect.poll(() => shown(panel, "position")).toBe(true)
  expect(errors).toEqual([])
})

test("groupRandom: the host rolls its group itself, and the die still tumbles", async ({
  page,
}) => {
  await openInspector(page)
  const panel = inspector(page)
  await panel.getByRole("tab", { name: "Emitter" }).click()
  const before = await values(page)
  await panel.getByRole("button", { name: "Randomize Emitter" }).click()
  expect(await lab(page, (l) => [...l.hostRolls])).toEqual(["random"])
  const after = await values(page)
  expect(after.seed).toBe(before.seed + 1)
  // Rows the host didn't touch stay put (its roll replaced the panel's).
  expect(after.lifetime).toEqual(before.lifetime)
  // Other groups roll as ever.
  await panel.getByRole("tab", { name: "Transform" }).click()
  await panel.getByRole("button", { name: "Randomize Transform" }).click()
  expect(await lab(page, (l) => [...l.hostRolls])).toEqual(["random"])
  expect((await values(page)).position).not.toEqual(before.position)
})

test("mixed and disabled inspector rows: — readouts, no edits", async ({ page }) => {
  await openInspector(page)
  const panel = inspector(page)
  await lab(page, (l) => l.inspector.setMixed(["position", "yaw", "visible"]))
  await expect(row(panel, "position").locator(".knobs-cell-read").first()).toHaveText("—")
  await expect(row(panel, "yaw").locator(".knobs-angle-read")).toHaveText("—")
  await expect(row(panel, "visible").locator(".knobs-range-read")).toHaveText("—")
  // Editing a mixed row settles it.
  await row(panel, "yaw").getByRole("slider").focus()
  await page.keyboard.press("ArrowRight")
  await expect(row(panel, "yaw").locator(".knobs-angle-read")).not.toHaveText("—")
})

test("the inspector draws on the GPU overlay as it does in the DOM", async ({ page }) => {
  const errors = await openInspector(page, "?gpu")
  const panel = inspector(page)
  await expect(panel).toHaveAttribute("data-gpu-active", /true|false/)
  test.skip((await panel.getAttribute("data-gpu-active")) !== "true", "no WebGPU here")
  await expect
    .poll(() => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[]), {
      timeout: 10_000,
    })
    .toEqual(
      expect.arrayContaining([
        "Transform",
        "Emitter",
        "Pivot & bounds",
        "Position",
        "1.2",
        "90°",
        "Play",
        "Space",
        "4.0–40.0 m",
      ]),
    )
  // The search field stays the DOM's, above the overlay.
  const box = panel.getByRole("searchbox")
  const hit = await box.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el
  })
  expect(hit).toBe(true)
  expect(errors).toEqual([])
})

test("range: a thumb that shows never sits on the label or readout; their text fades around it", async ({
  page,
}) => {
  await openInspector(page)
  const visible = row(inspector(page), "visible")
  const text = visible.locator(".knobs-range-text")
  const state = () =>
    text.evaluate((el) => {
      const cs = getComputedStyle(el)
      const thumb = el.parentElement!.querySelector<HTMLElement>(".knobs-range-thumb")!
      const fill = el.parentElement!.querySelector<HTMLElement>(".knobs-range-fill")!
      return {
        show: Number(cs.getPropertyValue("--kr-show")),
        mask: cs.maskImage,
        thumb: thumb.getBoundingClientRect().left,
        fill: fill.getBoundingClientRect().left,
      }
    })
  // At rest the thumbs are hidden and the text is whole.
  await page.mouse.move(2, 2)
  await expect.poll(async () => (await state()).show).toBe(0)
  await visible.hover({ position: { x: 200, y: 8 } })
  await expect.poll(async () => (await state()).show).toBe(1)
  const s = await state()
  expect(s.mask).toContain("linear-gradient")
  // The low thumb rides the fill's edge (4 of 0–100 m: over the label's first letter).
  expect(Math.abs(s.thumb - s.fill)).toBeLessThan(1)
  const label = (await visible.locator(".knobs-label").boundingBox())!
  expect(s.thumb).toBeGreaterThan(label.x)
  expect(s.thumb).toBeLessThan(label.x + label.width)
})
