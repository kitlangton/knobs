import { describe, expect, it } from "vitest"
import rolling from "../src/panel/rolling-css.js"
import { rollingModule, rollingSource } from "../scripts/rolling-css.js"

describe("rolling-number's stylesheet as a module", () => {
  it("matches the installed package (run `bun scripts/rolling-css.ts` after upgrading)", async () => {
    expect(rolling).toBe(rollingSource())
    const { readFileSync } = await import("node:fs")
    expect(readFileSync("src/panel/rolling-css.ts", "utf8")).toBe(rollingModule(rolling))
  })
})
