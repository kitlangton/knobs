import { expect, test } from "@playwright/test"

test("a Rust page copies Rune code from the header, a group and a row", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.goto("/tune.html?dom")
  await page.waitForFunction(() => (window as any).__knobs)
  await page.evaluate(() => {
    const { knobs, mountPage } = (window as any).__knobs
    ;(window as any).__tune.page.dispose()
    const controls = knobs.createRemoteControls(
      "rust-copy",
      [
        { key: "size", kind: "number", default: 0, min: 0, max: 10, group: "layout" },
        { key: "gap", kind: "number", default: 1, min: 0, max: 10, group: "layout" },
        { key: "on", kind: "bool", default: false, group: "other" },
      ],
      { values: { size: 2, gap: 3, on: true } },
    )
    const app = document.querySelector("#app")!
    app.replaceChildren()
    mountPage(controls, app, { title: "Rust", copyAs: "rust", renderer: "dom" })
  })
  const root = page.getByRole("region", { name: "Rust controls" })
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  const size = 'rune::tune!("size", 2.0_f32)  // was 0.0_f32'
  const gap = 'rune::tune!("gap", 3.0_f32)  // was 1.0_f32'
  const on = 'rune::tune!("on", true)  // was false'
  await root.getByRole("button", { name: "Copy", exact: true }).click()
  await expect.poll(clipboard).toBe([size, gap, on].join("\n"))

  await root.locator('.knobs-group-head[data-group="layout"]').click({ button: "right" })
  await page.getByRole("menuitem", { name: /^Copy/ }).click()
  await expect.poll(clipboard).toBe([size, gap].join("\n"))

  // Clear the group selection before asking for one row.
  await root.locator('[data-field="on"]').click({ button: "right" })
  await page.getByRole("menuitem", { name: /^Copy/ }).click()
  await expect.poll(clipboard).toBe(on)
})
