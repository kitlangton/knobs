import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
  ["review", "src/review/index.ts"],
  ["review-react", "src/review/react.tsx"],
  ["review-solid", "src/review/solid.ts"],
]) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: "dist",
    naming: `${name}.js`,
    target: "browser",
    format: "esm",
    jsx: { development: false },
    external: [
      "react",
      "react/jsx-runtime",
      "react-dom",
      "solid-js",
      "solid-js/web",
      "@pierre/diffs",
    ],
    banner: name.endsWith("react") ? '"use client";' : undefined,
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
// The diff's renderer (and Shiki under it) is an optional peer, reached only when a diff is drawn.
if (!/import\(["']@pierre\/diffs["']\)/.test(ui))
  throw new Error("@pierre/diffs must stay a lazy import in knobs/ui.")
// knobs/review: the same pieces, no panel, the diff's renderer still lazy.
const review = await Bun.file("dist/review.js").text()
if (/createPanel|mountPanel|KnobsGpuRenderer|knobs-panel\{/.test(review))
  throw new Error("The panel leaked into knobs/review.")
if (!/import\(["']@pierre\/diffs["']\)/.test(review))
  throw new Error("@pierre/diffs must stay a lazy import in knobs/review.")
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
// A deploy that allows unlocking: locked to its constants until someone unlocks, live after,
// and back to the constants once locked again.
const gate = built.unlock({
  panel: () => Promise.reject(new Error("no panel in this check")),
  sequence: false,
  query: false,
  corner: false,
  persist: false,
})
const secret = built.defineControls(
  "production-secret",
  { value: built.knob(2, { min: 0, max: 10, step: 1 }) },
  { storage: null },
)
secret.set({ value: 8 })
if (gate.unlocked || secret.enabled || secret.get().value !== 2)
  throw new Error("An unlockable store must keep its constants until unlocked.")
gate.unlock()
secret.set({ value: 8 })
if (!secret.enabled || secret.get().value !== 8)
  throw new Error("An unlocked store must come alive in production.")
gate.lock()
gate.dispose()
if (secret.enabled || secret.get() !== secret.locked)
  throw new Error("A store must go back to its constants when the page locks again.")
// And what a host ships with `unlock`: the panel only behind a dynamic import, in its own chunk.
const proof = await mkdtemp(join(tmpdir(), "knobs-unlock-"))
try {
  const dist = (file: string) =>
    JSON.stringify(new URL(`../dist/${file}`, import.meta.url).pathname)
  await Bun.write(
    join(proof, "entry.js"),
    `import { defineControls, knob, unlock } from ${dist("index.js")}
const hero = defineControls("hero", { radius: knob(12, { min: 0, max: 40, step: 1 }) })
hero.mount(document.body)
unlock({ panel: () => import(${dist("panel.js")}) })
`,
  )
  const host = await Bun.build({
    entrypoints: [join(proof, "entry.js")],
    outdir: join(proof, "out"),
    target: "browser",
    format: "esm",
    splitting: true,
  })
  if (!host.success) throw new AggregateError(host.logs, "Unlock proof build failed")
  const entry = await host.outputs.find((o) => o.kind === "entry-point")!.text()
  const chunks = await Promise.all(
    host.outputs.filter((o) => o.kind === "chunk").map((o) => o.text()),
  )
  if (/knobs-panel|createPanel|ResizeObserver/.test(entry) || !/import\(/.test(entry))
    throw new Error("An unlock build must reach the panel only through a dynamic import.")
  if (!chunks.some((c) => /createPanel/.test(c)))
    throw new Error("An unlock build should split the panel into its own chunk.")
} finally {
  await rm(proof, { recursive: true, force: true })
}
console.log(
  `Core: ${Buffer.byteLength(production)} bytes, ${Bun.gzipSync(production).length} gzip. Production panel import: absent (unlock builds too).`,
)
