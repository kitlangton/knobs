import { expect, type Page, test } from "@playwright/test"

/** Every panel (and open menu) element's box and the styles a host's element rules could reach. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const props = [
      "font-family",
      "font-size",
      "font-weight",
      "font-style",
      "letter-spacing",
      "word-spacing",
      "text-transform",
      "text-shadow",
      "text-align",
      "line-height",
      "color",
      "background-color",
      "border-top-width",
      "border-top-style",
      "border-top-left-radius",
      "padding-top",
      "padding-left",
      "margin-top",
      "margin-left",
      "box-shadow",
      "box-sizing",
      "outline-style",
      "position",
      "top",
      "transform",
      "fill",
    ]
    const nodes = [
      ...document.querySelectorAll(".knobs-panel, .knobs-panel *, .knobs-menu, .knobs-menu *"),
    ]
    return nodes.map((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const box = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2)
      const name = `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}`
      return [name, ...box, ...props.map((p) => `${p}:${cs.getPropertyValue(p)}`)].join("|")
    })
  })
/** Waits out every running transition and animation, however long a busy machine takes. */
const settle = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(async () => {
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
          return document
            .getAnimations()
            .filter(
              (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
            ).length
        }),
      { timeout: 10_000 },
    )
    .toBe(0)

test("a host's bare element rules don't restyle panels or their menus", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/host.html")
  await expect(page.locator(".knobs-panel")).toHaveCount(2)
  // Open an editor and the long menu (with its search field), so their insides count too.
  await page.locator('[data-field="tint"] .knobs-x-head').first().click()
  await page.getByRole("button", { name: "Scene" }).first().click()
  await expect(page.locator(".knobs-menu-search")).toBeVisible()
  await settle(page)
  const hostile = await measure(page)
  await page.evaluate(() => (window as any).__host.hostile(false))
  await settle(page)
  const clean = await measure(page)
  expect(hostile.length).toBeGreaterThan(150)
  const differ = hostile.filter((m, i) => m !== clean[i])
  expect(differ, differ.slice(0, 3).join("\n\n")).toEqual([])
  expect(errors).toEqual([])
})

test("focus shows no outline, even where the host draws one on :focus", async ({ page }) => {
  await page.goto("/host.html")
  const track = page.locator('[data-field="size"] .knobs-track').first()
  await track.click()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowUp")
  const outlines = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    return getComputedStyle(el).outlineStyle
  })
  expect(outlines).toBe("none")
})
