// Proof shots for Phase B (tabs, sub-headings, inspector fields, the toolbar, search, mixed rows,
// tokens, page tile folding) in both renderers, plus motion frame sheets of a tab switch, a range
// moving and the seed's die. The page's clock and its CSS/WAAPI motion run SLOW times slower while
// filming, so headless screenshots keep up with the springs.
// BASE=http://127.0.0.1:4005 OUT=dir bun scripts/phaseb-shots.ts   (ONLY=tabs,motion-seed,… MODES=dom,gpu)
import { type Browser, chromium, type Locator, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"

const base = process.env.BASE ?? "http://127.0.0.1:4005"
const out = process.env.OUT ?? "/tmp/phaseb"
const only = process.env.ONLY?.split(",")
const modes = (process.env.MODES ?? "dom,gpu").split(",")
const slow = Number(process.env.SLOW) || 10
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const want = (name: string) => !only || only.some((o) => name.startsWith(o))
mkdirSync(out, { recursive: true })
const browser: Browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const errors: string[] = []
type Region = { x: number; y: number; width: number; height: number }

async function open(mode: string, path = "lab.html", viewport = { width: 1280, height: 1400 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on("pageerror", (e) => errors.push(`${mode}: ${e.message}`))
  page.on("console", (m) => m.type() === "error" && errors.push(`${mode}: ${m.text()}`))
  // A clock the script can slow down: performance.now and frame times.
  await page.addInitScript(() => {
    const real = performance.now.bind(performance)
    let rate = 1
    let from = 0
    let at = 0
    const now = () => at + (real() - from) * rate
    ;(window as any).__slow = (s: number) => {
      at = now()
      from = real()
      rate = 1 / s
    }
    performance.now = now
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => raf(() => cb(now()))
  })
  const sep = path.includes("?") ? "&" : "?"
  await page.goto(`${base}/${path}${mode === "gpu" ? `${sep}gpu` : ""}`)
  await sleep(900)
  return page
}
const inspectorOf = async (page: Page) => {
  const panel = page.locator('[data-controls="lab-inspector"]').first()
  await panel.waitFor()
  await panel.scrollIntoViewIfNeeded()
  await page.mouse.move(2, 2)
  await sleep(400)
  return panel
}
const clipOf = async (el: Locator, pad = 3): Promise<Region> => {
  const b = (await el.boundingBox())!
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}
const shot = async (page: Page, el: Locator | Region, name: string) => {
  const clip = "x" in el ? el : await clipOf(el)
  await page.screenshot({ path: `${out}/${name}.png`, clip })
}
const settle = () => sleep(600)
const lab = <T>(page: Page, fn: (l: any) => T) =>
  page.evaluate(
    (src) => new Function(`return (${src})(window.__lab)`)(),
    fn.toString(),
  ) as Promise<T>

async function film(page: Page, region: Region, ms: number, act: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })
  await page.evaluate((s) => (window as any).__slow(s), slow)
  const shots: { t: number; png: Buffer }[] = []
  const start = Date.now()
  const span = ms * slow
  const acting = act()
  while (Date.now() - start < span) {
    const t = Date.now() - start
    shots.push({ t, png: await page.screenshot({ clip: region }) })
  }
  await acting
  await page.evaluate(() => (window as any).__slow(1))
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  // Twelve frames spread over the take.
  const pick = Array.from({ length: 12 }, (_, i) =>
    Math.round((i * (shots.length - 1)) / 11),
  ).filter((v, i, a) => a.indexOf(v) === i)
  return pick.map((i) => ({ t: shots[i]!.t / slow, png: shots[i]!.png }))
}
async function sheet(
  title: string,
  rows: { label: string; shots: { t: number; png: Buffer }[] }[],
  path: string,
) {
  const width = 300
  const html = `<body style="margin:0;background:#0d0d10;color:#9a9ca3;font:12px -apple-system,system-ui;padding:16px">
    <div style="font-size:15px;color:#eee;margin-bottom:12px">${title}</div>
    ${rows
      .map(
        (r) => `<div style="color:#ddd;margin:10px 0 6px">${r.label}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${r.shots
        .map(
          (s) =>
            `<figure style="margin:0"><img style="display:block;width:${width}px" src="data:image/png;base64,${s.png.toString("base64")}"><figcaption>${s.t.toFixed(0)} ms</figcaption></figure>`,
        )
        .join("")}</div>`,
      )
      .join("")}</body>`
  const p = await browser.newPage({ deviceScaleFactor: 1.5 })
  await p.setViewportSize({ width: 6 * (width + 6) + 32, height: 400 })
  await p.setContent(html)
  await p.screenshot({ path, fullPage: true })
  await p.close()
}

for (const mode of modes) {
  if (want("tabs") || want("fields") || want("search") || want("mixed")) {
    const page = await open(mode)
    const panel = await inspectorOf(page)
    if (want("tabs")) {
      await shot(page, panel, `tabs-transform-${mode}`)
      await panel.getByRole("tab", { name: "Emitter" }).click()
      await panel.locator('.knobs-subhead[aria-label="Forces"]').click()
      await page.mouse.move(2, 2)
      await settle()
      await shot(page, panel, `tabs-emitter-${mode}`)
      await panel.getByRole("tab", { name: "Input" }).click()
      await page.mouse.move(2, 2)
      await settle()
      await shot(page, panel, `tabs-input-${mode}`)
      await panel.getByRole("tab", { name: "Transform" }).click()
      await page.mouse.move(2, 2)
      await settle()
    }
    if (want("fields")) {
      // States: a hovered range, a focused dial, a toolbar button hovered, a key being captured.
      const visible = panel.locator('[data-field="visible"]')
      await visible.hover()
      await settle()
      await shot(page, await clipOf(visible, 1), `fields-range-hover-${mode}`)
      const scale = panel.locator('[data-field="scale"]')
      await shot(page, await clipOf(scale, 1), `fields-vec-linked-${mode}`)
      await panel.getByRole("tab", { name: "Emitter" }).click()
      await page.mouse.move(2, 2)
      await settle()
      const dir = panel.locator('[data-field="spread"]')
      await dir.locator(".knobs-angle").focus()
      await page.keyboard.press("ArrowRight")
      await settle()
      await shot(page, await clipOf(dir, 1), `fields-angle-focus-${mode}`)
      const seed = panel.locator('[data-field="seed"]')
      await shot(page, await clipOf(seed, 1), `fields-seed-${mode}`)
      await panel.getByRole("tab", { name: "Input" }).click()
      await page.mouse.move(2, 2)
      await settle()
      const fire = panel.locator('[data-field="reload"]')
      await fire.locator(".knobs-keys").focus()
      await page.keyboard.press("Enter")
      await settle()
      await shot(page, await clipOf(fire, 1), `fields-keybind-capture-${mode}`)
      await page.keyboard.press("Escape")
      const tools = panel.locator('[data-field="tools"]')
      await tools.getByRole("button", { name: /Frame/ }).hover()
      await settle()
      await shot(page, await clipOf(tools, 1), `fields-toolbar-hover-${mode}`)
      await page.mouse.move(2, 2)
      await panel.getByRole("tab", { name: "Transform" }).click()
      await settle()
    }
    if (want("search")) {
      await lab(page, (l) => l.inspector.set({ rate: 600, yaw: 135 }))
      await panel.getByRole("searchbox").fill("r")
      await page.mouse.move(2, 2)
      await settle()
      await shot(page, panel, `search-query-${mode}`)
      await panel.getByRole("searchbox").fill("")
      await panel.locator(".knobs-search-chip").first().click()
      await page.mouse.move(2, 2)
      await settle()
      await shot(page, panel, `search-modified-${mode}`)
      await panel.locator(".knobs-search-chip").first().click()
      await lab(page, (l) => l.inspector.reset())
      await settle()
    }
    if (want("mixed")) {
      await lab(page, (l) => l.inspector.setMixed(["position", "yaw", "visible", "pivot"]))
      await page.mouse.move(2, 2)
      await settle()
      await shot(page, panel, `mixed-inspector-${mode}`)
      await lab(page, (l) => l.inspector.setMixed(["position", "yaw", "visible", "pivot"], false))
    }
    await page.close()
  }
  if (want("mixed")) {
    const page = await open(mode, "host.html", { width: 900, height: 1000 })
    await page.evaluate(() =>
      (window as any).__host.controls.plain.setMixed(["tint", "origin", "curve"]),
    )
    for (const k of ["tint", "origin", "curve"]) {
      const h = page.locator(`#plain [data-field="${k}"] .knobs-x-head`)
      if ((await h.getAttribute("aria-expanded")) !== "true") await h.click()
    }
    await page.mouse.move(890, 990)
    await settle()
    await shot(
      page,
      page.locator('#plain [data-field="tint"]').locator(".."),
      `mixed-editors-${mode}`,
    )
    await page.close()
  }
  if (want("theme")) {
    // The inspector in the default theme, mounted beside the Lab's.
    const page = await open(mode)
    await page.evaluate((gpu) => {
      const host = document.createElement("div")
      host.id = "plain-inspector"
      host.style.cssText = "position:absolute;left:24px;top:24px;width:340px"
      scrollTo(0, 0)
      document.body.append(host)
      ;(window as any).__lab.inspector.mount(host, {
        title: "Inspector",
        theme: "dark",
        variants: false,
        session: false,
        haptics: false,
        renderer: gpu ? "gpu" : "dom",
        tabs: ["transform", "emitter", "input"],
        search: true,
      })
    }, mode === "gpu")
    await sleep(1200)
    await page.mouse.move(1270, 1390)
    await settle()
    await shot(page, page.locator("#plain-inspector .knobs-panel"), `theme-default-${mode}`)
    await page.close()
  }
  if (want("tokens")) {
    // Arcade's requests: toolbar buttons and control heights from its own tokens.
    const page = await open(mode)
    await page.addStyleTag({
      content: `[data-controls="lab-inspector"]{--k-control-h:24px;--k-value-size:13px;--k-button-bg:#2b3a55;--k-button-line:#4d6fa8;--k-button-hover-bg:#34476a;--k-button-hover-line:#7a9be0;--k-button-radius:6px;--k-button-h:26px;--k-button-font-size:12px}`,
    })
    const panel = await inspectorOf(page)
    await sleep(500)
    await shot(page, panel, `tokens-${mode}`)
    await page.close()
  }
  if (want("page")) {
    const page = await open(mode, "tune.html?dom", { width: 1000, height: 320 })
    await page.evaluate((mode) => {
      const { knobs: k, mountPage } = (window as any).__knobs
      ;(window as any).__tune.page.dispose()
      const n = (v: number, group: string, section: string, extra = {}) =>
        k.knob(v, { min: 0, max: 100, step: 1, group, section, ...extra })
      const c = k.defineControls(
        "proof",
        {
          fade: n(25, "Arrivals", "Transcript", { folded: false }),
          rise: n(6, "Arrivals", "Transcript"),
          gap: n(8, "Rhythm", "Transcript", { folded: true }),
          row: n(44, "Spacing", "Drawer"),
        },
        { storage: k.memoryStorage() },
      )
      const app = document.querySelector<HTMLElement>("#app")!
      app.replaceChildren()
      mountPage(c, app, { title: "Tune", theme: "dark", renderer: mode })
    }, mode)
    await sleep(1200)
    await shot(page, { x: 0, y: 0, width: 1000, height: 320 }, `page-folded-${mode}`)
    await page.close()
  }
  if (want("motion-tabs")) {
    const page = await open(mode)
    const panel = await inspectorOf(page)
    const region = await clipOf(panel)
    const frames = await film(page, region, 300, () =>
      panel.getByRole("tab", { name: "Emitter" }).click(),
    )
    await sheet(
      `Tab switch, Transform → Emitter (${mode})`,
      [{ label: mode, shots: frames }],
      `${out}/motion-tabs-${mode}.png`,
    )
    await page.close()
  }
  if (want("motion-range")) {
    const page = await open(mode)
    const panel = await inspectorOf(page)
    const region = await clipOf(panel.locator('[data-field="visible"]'), 0)
    const frames = await film(page, region, 360, () =>
      lab(page, (l) => l.inspector.set({ visible: [30, 90] })),
    )
    await sheet(
      `Range [4, 40] → [30, 90] (${mode})`,
      [{ label: mode, shots: frames }],
      `${out}/motion-range-${mode}.png`,
    )
    await page.close()
  }
  if (want("motion-seed")) {
    const page = await open(mode)
    const panel = await inspectorOf(page)
    await panel.getByRole("tab", { name: "Emitter" }).click()
    await page.mouse.move(2, 2)
    await settle()
    const row = panel.locator('[data-field="seed"]')
    const region = await clipOf(row, 0)
    const die = row.locator(".knobs-seed-roll")
    await die.hover()
    await settle()
    const frames = await film(page, region, 480, () => die.click())
    await sheet(
      `Seed die roll (${mode})`,
      [{ label: mode, shots: frames }],
      `${out}/motion-seed-${mode}.png`,
    )
    await page.close()
  }
}
console.log(errors.length ? errors : "errors: []")
await browser.close()
