import { type CDPSession, expect, type Page, test } from "@playwright/test"

// A whole-page preset on a tune-sized page (about fifty remote keys over twelve cards): the click
// that switches it should do its style and layout work a handful of times, not once per row.

type Event = {
  name: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: { data?: { type?: string }; elementCount?: number; name?: string }
}

async function trace(cdp: CDPSession, run: () => Promise<void>) {
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReturnAsStream",
  })
  await run()
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
  return JSON.parse(await done).traceEvents as Event[]
}

/** Style and layout passes run inside the pointer and click handlers (forced by script). */
function forcedInInput(events: Event[]) {
  const main = events.find(
    (e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain",
  )!
  const own = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === "X")
  const inputs = own.filter(
    (e) =>
      e.name === "EventDispatch" &&
      ["pointerdown", "pointerup", "mousedown", "mouseup", "click"].includes(e.args?.data?.type!),
  )
  const inside = (e: Event) =>
    inputs.some((i) => e.ts >= i.ts && e.ts + (e.dur ?? 0) <= i.ts + (i.dur ?? 0))
  const styles = own.filter((e) => e.name === "UpdateLayoutTree" && inside(e))
  return {
    handlers: inputs.length,
    styles: styles.length,
    elements: styles.reduce((n, e) => n + (e.args?.elementCount ?? 0), 0),
    layouts: own.filter((e) => e.name === "Layout" && inside(e)).length,
  }
}

async function open(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto("/presets-bench.html?renderer=dom")
  await page.waitForFunction(() => (window as any).__bench)
  await expect(page.locator(".knobs-slider").first()).toBeVisible()
  // Let the first placement and the fonts settle.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  return errors
}

test("a 50-key page preset forces a bounded number of style and layout passes", async ({
  page,
}) => {
  const errors = await open(page)
  // The injected rules have no :has(), whose invalidation a rolling readout set off every frame.
  const css = await page.evaluate(
    () => document.querySelector("style[data-knobs-style]")?.textContent ?? "",
  )
  expect(css.length).toBeGreaterThan(1000)
  expect(css).not.toContain(":has(")

  const cdp = await page.context().newCDPSession(page)
  const results: ReturnType<typeof forcedInInput>[] = []
  for (const name of ["Compact", "Native"]) {
    const events = await trace(cdp, async () => {
      await page.locator(".knobs-presets").getByRole("radio", { name, exact: true }).click()
      await page.evaluate(() => new Promise(requestAnimationFrame))
    })
    results.push(forcedInInput(events))
    // Let the glide finish before the next switch.
    await page.waitForTimeout(900)
  }
  test.info().annotations.push({
    type: "forced in the click",
    description: results
      .map((r) => `${r.styles} styles (${r.elements} elements), ${r.layouts} layouts`)
      .join("; "),
  })
  for (const r of results) {
    expect(r.handlers).toBeGreaterThan(0)
    // Before reads were batched ahead of writes: 57–67 style passes and 5–7 layouts per switch.
    expect(r.styles).toBeLessThanOrEqual(16)
    expect(r.layouts).toBeLessThanOrEqual(4)
    // Those passes come before the writes. When the pills and the strip's focus read after them,
    // the click restyled every changed readout (1,100–1,400 elements).
    expect(r.elements).toBeLessThanOrEqual(100)
  }
  const bench = await page.evaluate(() => {
    const b = (window as any).__bench
    return {
      matching: b.remote.matchingPreset() as string,
      sent: (b.sent as { type: string; keys: string[] }[]).slice(-2),
    }
  })
  expect(bench.matching).toBe("default")
  // Each switch reached the peer as one batch.
  expect(bench.sent.map((m) => m.type)).toEqual(["batch", "batch"])
  expect(bench.sent[0]!.keys.length).toBeGreaterThanOrEqual(40)

  expect(errors).toEqual([])
})
