import { chromium } from "@playwright/test"
const T = "/private/var/folders/4t/_jnrck017r5f_jttbc19b7s40000gn/T/opencode/cmp"
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--enable-gpu"] })
const bases = {
  a: "http://127.0.0.1:5481/tune.html?",
  b: "http://127.0.0.1:5482/tune.html?",
  c: "http://127.0.0.1:5471/tune.html?classic&",
}
for (const [k, url] of Object.entries(bases))
  for (const mode of ["dom", "gpu"])
    for (const theme of ["dark", "light"]) {
      const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
      const errors: string[] = []
      p.on("pageerror", (e) => errors.push(e.message))
      await p.goto(`${url}theme=${theme}&still&${mode}`)
      await p.evaluate(() => localStorage.clear())
      await p.reload()
      await p.waitForFunction(() => (window as any).__tune)
      await p.mouse.move(2, 2)
      await p.waitForTimeout(4000)
      await p.screenshot({ path: `${T}/${k}-${mode}-${theme}.png` })
      if (errors.length) console.log(k, mode, errors)
      await p.close()
    }
await b.close()
