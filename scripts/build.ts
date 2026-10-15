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
  ["solid", "src/solid/index.ts"],
  ["panel", "src/panel/index.ts"],
  ["themes", "src/themes/index.ts"],
  ["ui", "src/ui/index.ts"],
  ["ui-react", "src/ui/react.tsx"],
  ["ui-solid", "src/ui/solid.ts"],
]) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: `${name}.js`,
    target: "browser",
    format: "esm",
    jsx: { development: false },
    external: ["react", "react/jsx-runtime", "react-dom", "solid-js", "solid-js/web"],
    banner: name === "react" || name === "ui-react" ? '"use client";' : undefined,
  })
  if (!result.success) throw new AggregateError(result.logs, `${name} build failed`)
}
const production = await Bun.file("dist/index.js").text()
if (/import\(["']|knobs-panel|createPanel|ResizeObserver/.test(production))
  throw new Error("Panel leaked into production core.")
// The pieces (split, tree, readouts, overlays) stand alone: no panel or GPU renderer inside.
const ui = await Bun.file("dist/ui.js").text()
if (/createPanel|mountPanel|KnobsGpuRenderer|knobs-panel\{/.test(ui))
  throw new Error("The panel leaked into knobs/ui.")
const built = await import(new URL("../dist/index.js", import.meta.url).href)
const locked = built.defineControls(
  "production-proof",
  { value: built.knob(2, { min: 0, max: 10, step: 1 }) },
  { enabled: true, storage: null },
)
locked.set({ value: 8 })
if (locked.enabled || locked.get() !== locked.locked || locked.get().value !== 2)
  throw new Error("Production core must stay locked, even with enabled: true.")
const shipped = built.defineControls(
  "production-shipped",
  { value: built.knob(2, { min: 0, max: 10, step: 1 }) },
  { storage: null, ship: () => Promise.reject(new Error("no panel in this check")) },
)
shipped.set({ value: 8 })
if (!shipped.enabled || shipped.get().value !== 8)
  throw new Error("A shipped store must stay live in production.")
console.log(
  `Core: ${Buffer.byteLength(production)} bytes, ${Bun.gzipSync(production).length} gzip. Production panel import: absent.`,
)
