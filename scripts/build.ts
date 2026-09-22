import { rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })
for (const development of [false, true]) {
  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: development ? "dist/dev" : "dist",
    target: "browser",
    format: "esm",
    splitting: true,
    minify: { syntax: true, whitespace: false, identifiers: false },
    define: { __KNOBS_DEV__: String(development) },
  })
  if (!result.success) throw new AggregateError(result.logs, "Core build failed")
}
for (const [name, entry] of [
  ["react", "src/react/index.ts"],
  ["panel", "src/panel/index.ts"],
]) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: `${name}.js`,
    target: "browser",
    format: "esm",
    jsx: { development: false },
    external: ["react", "react/jsx-runtime"],
    banner: name === "react" ? '"use client";' : undefined,
  })
  if (!result.success) throw new AggregateError(result.logs, `${name} build failed`)
}
const production = await Bun.file("dist/index.js").text()
if (/import\(["']|knobs-panel|createPanel|ResizeObserver/.test(production))
  throw new Error("Panel leaked into production core.")
const built = await import(new URL("../dist/index.js", import.meta.url).href)
const locked = built.defineControls(
  "production-proof",
  { value: built.knob(2, { min: 0, max: 10, step: 1 }) },
  { enabled: true, storage: null },
)
locked.set({ value: 8 })
if (locked.enabled || locked.get() !== locked.locked || locked.get().value !== 2)
  throw new Error("Production core must stay locked, even with enabled: true.")
console.log(
  `Core: ${Buffer.byteLength(production)} bytes, ${Bun.gzipSync(production).length} gzip. Production panel import: absent.`,
)
