import { expect, type Locator, type Page, test } from "@playwright/test"

// The Lab's Live dock (examples/lab-live.ts): readouts fed by the viewport's scene (lab-scene.ts).
// ?paused stops the feed so tests step it with __live.tick(); each test starts once the scene is up
// (or has fallen back to its still), so its first frame lands before the test's own.
const livePanel = (page: Page) => page.locator('[data-controls="lab-live"]')
const diagPanel = (page: Page) => page.locator('[data-controls="lab-diag"]')
const row = (scope: Locator, key: string) => scope.locator(`[data-field="${key}"]`)
const num = (scope: Locator, key: string) => row(scope, key).locator(".knobs-rd-num").first()
async function open(page: Page, query = "?paused") {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  // The Lab look (labPreset): these tests measure its rows and colours.
  await page.goto(`/lab.html${query}${query ? "&" : "?"}look=lab`)
  await expect(row(livePanel(page), "fps")).toBeVisible()
  await page.waitForFunction(
    () => (window as any).__scene?.ready || (window as any).__scene?.failed,
  )
  // Paused, the scene draws again only when something changes (the layout settling, say).
  const frames = () => page.evaluate(() => (window as any).__scene.stats.frames as number)
  if (query.includes("paused"))
    await expect
      .poll(async () => {
        const a = await frames()
        await page.waitForTimeout(250)
        return (await frames()) - a
      })
      .toBe(0)
  return errors
}
const tick = (page: Page, n = 1, ms = 16.7) =>
  page.evaluate(
    ([n, ms]) => {
      for (let i = 0; i < n!; i++) (window as any).__live.tick(ms)
    },
    [n, ms],
  )
/** The latest value the store holds for a readout. */
const watched = (page: Page, store: "live" | "diag", key: string) =>
  page.evaluate(([s, k]) => (window as any).__live[s!].watched(k), [store, key])

test("readouts: values land, formatted with units, and the dock's rows hold their place", async ({
  page,
}) => {
  const errors = await open(page)
  const live = livePanel(page)
  await tick(page, 30)
  await expect(num(live, "fps")).toHaveText(/^\d+$/)
  await expect(num(live, "status")).toHaveText(/Storm|Rain|Drizzle/)
  const particles = row(live, "particles")
  await expect(particles.locator(".knobs-rd-unit")).toHaveText("k")
  await expect(particles.locator(".knobs-rd-num")).toHaveText(/^\d+\.\d$/)
  // The value boxes only grow, so a narrower number doesn't pull the row's graphic around.
  const plot = row(live, "drops").locator("canvas")
  const before = (await plot.boundingBox())!
  await tick(page, 60)
  const after = (await plot.boundingBox())!
  expect(after.x).toBeLessThanOrEqual(before.x + 0.5)
  // The legend reads the newest frame's CPU and GPU time (GPU once a timestamp has come back).
  const frame = (await watched(page, "live", "frame")) as { cpu: number; gpu?: number }
  const legend = row(live, "frame").locator(".knobs-rd-key .knobs-rd-num")
  await expect(legend.nth(0)).toHaveText(frame.cpu.toFixed(1))
  if (frame.gpu !== undefined) await expect(legend.nth(1)).toHaveText(frame.gpu.toFixed(1))
  expect(errors).toEqual([])
})

test("readouts: text is throttled to a readable rate while samples arrive every frame", async ({
  page,
}) => {
  await open(page)
  // A new value every frame (the scene's own samples come slower on a software GPU).
  const changes = await num(livePanel(page), "particles").evaluate(
    (el) =>
      new Promise<number>((resolve) => {
        let n = 0
        const mo = new MutationObserver(() => n++)
        mo.observe(el, { childList: true, characterData: true, subtree: true })
        const end = performance.now() + 2000
        const feed = () => {
          ;(window as any).__live.live.watch("particles", 10 + Math.random() * 80)
          if (performance.now() < end) requestAnimationFrame(feed)
          else {
            mo.disconnect()
            resolve(n)
          }
        }
        requestAnimationFrame(feed)
      }),
  )
  // 4 Hz by default: about 8 writes in 2 s, never 120.
  expect(changes).toBeGreaterThanOrEqual(3)
  expect(changes).toBeLessThanOrEqual(10)
})

test("sparkline: hovered or focused it reads its history's extent", async ({ page }) => {
  await open(page)
  const live = livePanel(page)
  await tick(page, 90)
  const drops = row(live, "drops")
  const latest = String(await watched(page, "live", "drops"))
  await expect(drops.locator(".knobs-rd-num")).toHaveText(latest)
  await drops.locator(".knobs-rd-spark").hover()
  await expect(drops.locator(".knobs-rd-num")).toHaveText(/^\d+–\d+$/)
  await page.mouse.move(2, 2)
  await expect(drops.locator(".knobs-rd-num")).toHaveText(latest!)
  await drops.locator(".knobs-rd-spark").focus()
  await expect(drops.locator(".knobs-rd-num")).toHaveText(/^\d+–\d+$/)
  await page.keyboard.press("ArrowDown")
  await expect(drops.locator(".knobs-rd-num")).toHaveText(latest!)
})

test("graph: a crosshair follows the pointer, or ←/→ walk it; the legend reads that sample", async ({
  page,
}) => {
  await open(page)
  const live = livePanel(page)
  // A ramp fills the 150-sample history: sample i reads i.
  await page.evaluate(() => {
    const l = (window as any).__live.live
    for (let i = 0; i < 150; i++) l.watch("frame", { cpu: i, gpu: i * 2 })
  })
  const legend = row(live, "frame").locator(".knobs-rd-key .knobs-rd-num")
  await expect(legend.first()).toHaveText("149.0")
  await expect(legend.nth(1)).toHaveText("298.0")
  const plot = row(live, "frame").locator(".knobs-rd-plotbox")
  const box = (await plot.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect
    .poll(async () => Math.abs(Number(await legend.first().textContent()) - 74.5) <= 1)
    .toBe(true)
  const mid = Number(await legend.first().textContent())
  await expect(legend.nth(1)).toHaveText((mid * 2).toFixed(1))
  await page.mouse.move(2, 2)
  await expect(legend.first()).toHaveText("149.0")
  // Keys: the first ← lands on the newest sample, the next ones walk back (⇧ by ten).
  await plot.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(legend.first()).toHaveText("149.0")
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft")
  await expect(legend.first()).toHaveText("146.0")
  await page.keyboard.press("Shift+ArrowLeft")
  await expect(legend.first()).toHaveText("136.0")
  await page.keyboard.press("Escape")
  await expect(legend.first()).toHaveText("149.0")
})

test("block heads keep their titles' words: legends drop units, then wrap; a log's tools wrap", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  // knobs' own look, whose 12px type is the tightest.
  await page.goto("/lab.html?paused")
  await expect(row(livePanel(page), "fps")).toBeVisible()
  await page.evaluate(() => {
    const l = (window as any).__live.live
    for (let i = 0; i < 40; i++) l.watch("frame", { cpu: 6.2, gpu: 10.4 })
  })
  await expect(row(livePanel(page), "frame").locator(".knobs-rd-num").nth(1)).toHaveText("10.4")
  // Each panel narrowed step by step: at every width the title and what's beside it show whole.
  const sweep = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const seen: Record<string, string[]> = {}
    const clipped: string[] = []
    for (const id of ["lab-live", "lab-diag"]) {
      const root = document.querySelector<HTMLElement>(`[data-controls="${id}"]`)!
      const h = root.querySelector<HTMLElement>(
        ".knobs-rd-graph .knobs-rd-head, .knobs-rd-log .knobs-rd-head",
      )!
      const title = h.firstElementChild as HTMLElement
      const tools = h.querySelector<HTMLElement>(".knobs-rd-legend, .knobs-rd-tools")!
      seen[id] = []
      for (let w = 600; w >= 220; w -= 8) {
        root.style.cssText = `width:${w}px;max-width:none`
        await frame()
        const fit = h.hasAttribute("data-wrap")
          ? "wrap"
          : h.hasAttribute("data-short")
            ? "short"
            : ""
        if (seen[id].at(-1) !== fit) seen[id].push(fit)
        if (
          title.scrollWidth > title.clientWidth + 0.5 ||
          tools.scrollWidth > tools.clientWidth + 0.5 ||
          tools.getBoundingClientRect().right > h.getBoundingClientRect().right + 0.5
        )
          clipped.push(`${id}@${w}`)
      }
      root.style.cssText = ""
    }
    return { seen, clipped }
  })
  expect(sweep.clipped).toEqual([])
  // The graph's legend gives up its units first, then wraps; the log's tools wrap.
  expect(sweep.seen["lab-live"]).toEqual(["", "short", "wrap"])
  expect(sweep.seen["lab-diag"]).toEqual(["", "wrap"])
  expect(errors).toEqual([])
})

test("meter: unknown is indeterminate (busy), then it fills; past warn it takes the warning colour", async ({
  page,
}) => {
  await open(page)
  const live = livePanel(page)
  // Offscreen readouts sleep, so the meters are brought into the dock's view.
  await row(live, "soak").scrollIntoViewIfNeeded()
  await page.evaluate(() => (window as any).__live.live.watch("soak", null))
  const soak = row(live, "soak").locator("[role=meter]")
  await expect(soak).toHaveAttribute("aria-busy", "true")
  await expect(num(live, "soak")).toHaveText("—")
  await tick(page, 30, 100)
  await expect(soak).not.toHaveAttribute("aria-busy", "true")
  await expect(num(live, "soak")).toHaveText(/^\d+%$/)
  const memory = row(live, "memory").locator("[role=meter]")
  const v = Number(await memory.getAttribute("aria-valuenow"))
  expect(v).toBeGreaterThan(0)
  await expect(memory).toHaveAttribute("aria-valuemax", "512")
  await expect(row(live, "memory").locator(".knobs-rd-unit")).toHaveText("/ 512 MB")
})

test("table: rows and columns from arrays, numbers right-aligned in tabular cells", async ({
  page,
}) => {
  await open(page)
  await tick(page, 20)
  const passes = row(diagPanel(page), "passes")
  await expect(passes.locator(".knobs-rd-th")).toContainText(["ms", "Draws"])
  const rows = passes.locator(".knobs-rd-tr:not(.knobs-rd-thead)")
  await expect(rows).toHaveCount(4)
  await expect(rows.locator(".knobs-rd-td:first-child")).toHaveText([
    "Scene",
    "Rain & FX",
    "Bloom",
    "Post",
  ])
  await expect(rows.first().locator(".knobs-rd-td").nth(2)).toHaveText(/^\d+$/)
  await expect(rows.first().locator(".knobs-rd-td").nth(2)).toHaveAttribute("data-num", "")
  // Timed passes read in ms once their timestamps come back; without timestamp queries, a dash.
  const ms = rows.first().locator(".knobs-rd-td").nth(1)
  if (await page.evaluate(() => !!(window as any).__scene.renderer?.timed)) {
    await expect
      .poll(async () => {
        await tick(page, 1)
        return ms.textContent()
      })
      .toMatch(/^\d+\.\d\d$/)
    await expect(ms).toHaveAttribute("data-num", "")
  } else await expect(ms).toHaveText("—")
})

test("log: level chips and a filter narrow it, it follows the tail until scrolled, then offers the latest", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await open(page)
  const events = row(diagPanel(page), "events")
  const lines = events.locator(".knobs-rd-line:not([hidden])")
  const scroller = events.locator(".knobs-rd-scroll")
  // Lines are pooled and placed by transforms: the ones in view, top to bottom.
  const shown = () =>
    scroller.evaluate((s) => {
      const r = s.getBoundingClientRect()
      return [...s.querySelectorAll<HTMLElement>(".knobs-rd-line:not([hidden])")]
        .map((l) => ({ l, b: l.getBoundingClientRect() }))
        .filter(({ b }) => b.bottom > r.top + 1 && b.top < r.bottom - 1)
        .sort((a, b) => a.b.top - b.b.top)
        .map(({ l }) => l.textContent ?? "")
    })
  const lastShown = async () => (await shown()).at(-1) ?? ""
  // Following: the last line shown is the newest entry.
  await expect.poll(lastShown).toContain("Weather station ready")
  // A history long enough to scroll.
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++)
      (window as any).__live.diag.watch("events", {
        level: "debug",
        text: `Frame ${i + 1} in budget`,
      })
  })
  await page.evaluate(() => {
    const d = (window as any).__live.diag
    d.watch("events", { level: "warn", text: "Gutter drip over budget" })
    d.watch("events", { level: "error", text: "Shadow atlas full" })
  })
  await expect.poll(lastShown).toContain("Shadow atlas full")
  await expect(events.locator(".knobs-rd-chip[data-level=warn]")).toHaveText("Warn 1")
  await events.locator(".knobs-rd-chip[data-level=error]").click()
  await expect(lines).toHaveCount(1)
  await expect(lines.first()).toHaveAttribute("data-level", "error")
  await events.locator(".knobs-rd-chip[data-level=warn]").click()
  await expect(lines).toHaveCount(2)
  await events.locator(".knobs-rd-chip[data-level=all]").click()
  // The filter marks its match in each line.
  await events.locator(".knobs-rd-find").fill("station")
  await expect(lines.first().locator("mark")).toHaveText("station")
  await expect.poll(async () => (await shown()).every((t) => t.includes("station"))).toBe(true)
  await events.locator(".knobs-rd-find").press("Escape")
  await expect(events.locator(".knobs-rd-find")).toHaveValue("")
  // Cleared, the whole log is back and following its tail again.
  await expect.poll(lastShown).toContain("Shadow atlas full")
  // Scrolled up, new entries don't pull it down; a pill counts them and jumps back.
  const jump = events.locator(".knobs-rd-jump")
  // Once it has seen the scroll, it stops following and offers the latest.
  await expect
    .poll(async () => {
      await scroller.evaluate((el) => {
        el.scrollTop = 0
      })
      return jump.evaluate((el) => Number(getComputedStyle(el).opacity))
    })
    .toBe(1)
  await page.evaluate(() => {
    const d = (window as any).__live.diag
    d.watch("events", "One")
    d.watch("events", "Two")
  })
  await expect(jump).toHaveText("2 new ↓")
  await expect.poll(() => jump.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1)
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0)
  await jump.click()
  await expect.poll(lastShown).toContain("Two")
  await expect.poll(() => jump.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(0)
  // Copy: the lines shown, as text.
  await events.locator(".knobs-rd-copy").click()
  await expect(events.locator(".knobs-rd-copy")).toHaveText("Copied")
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text.split("\n").at(-1)).toMatch(/^\d\d:\d\d:\d\d INFO Two$/)
  expect(text).toContain("ERROR Shadow atlas full")
})

test("readouts draw on the GPU overlay as they do in the DOM", async ({ page }) => {
  const errors = await open(page, "?gpu&paused")
  test.skip(
    !(await page.evaluate(() => "gpu" in navigator)),
    "WebGPU isn't available in this browser",
  )
  await expect(livePanel(page)).toHaveAttribute("data-gpu-active", "true")
  await expect(diagPanel(page)).toHaveAttribute("data-gpu-active", "true")
  await tick(page, 40)
  const fps = String(Math.round(Number(await watched(page, "live", "fps"))))
  await expect(num(livePanel(page), "fps")).toHaveText(fps)
  await expect
    .poll(() => page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[]))
    .toEqual(
      expect.arrayContaining([
        "Frame time",
        "CPU",
        "GPU",
        "60 fps",
        fps,
        "Scene",
        "Draws",
        "/ 512 MB",
        "All",
        "Copy",
      ]),
    )
  const texts = await page.evaluate(() => (window as any).__knobsGpu.lastTexts as string[])
  expect(texts.some((t) => t.includes("Weather station ready"))).toBe(true)
  // The DOM's text and canvases stay put but don't paint under the overlay (once the fade settles).
  await expect
    .poll(() =>
      livePanel(page)
        .locator(".knobs-rd-num")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    )
    .toMatch(/(,\s*|\/\s*)0\)$/)
  expect(errors).toEqual([])
})

test("paused, every readout sleeps: no frames from the readout clock or the GPU overlay", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    ;(window as any).__rafs = 0
    window.requestAnimationFrame = (cb) => {
      ;(window as any).__rafs++
      return raf(cb)
    }
  })
  await open(page, "?gpu&paused")
  await tick(page, 30)
  await page.mouse.move(2, 2)
  const rafs = () => page.evaluate(() => (window as any).__rafs as number)
  await expect
    .poll(
      async () => {
        const a = await rafs()
        await page.waitForTimeout(500)
        return (await rafs()) - a
      },
      { timeout: 10_000 },
    )
    .toBe(0)
})
