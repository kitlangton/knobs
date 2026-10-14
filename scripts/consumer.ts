// Builds two tiny consumer apps in production mode against the package as published (its
// `exports`, through node_modules/knobs) and reports what they ship: tests/browser/consumer.spec.ts
// loads them. `bun scripts/consumer.ts` prints the bundle sizes.
import { mkdir, readdir, readFile, rm, stat, symlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import { gzipSync } from "node:zlib"
import { build } from "vite"

const root = resolve(import.meta.dirname, "..")
const fixtures = join(root, "tests/consumer")
export const out = join(root, "test-results/consumer")

export async function buildConsumers() {
  await mkdir(join(fixtures, "node_modules"), { recursive: true })
  await rm(join(fixtures, "node_modules/knobs"), { force: true })
  await symlink(root, join(fixtures, "node_modules/knobs"), "dir")
  const sizes: Record<string, Record<string, { bytes: number; gzip: number }>> = {}
  for (const app of ["locked", "shipped"]) {
    const outDir = join(out, app)
    await build({
      root: join(fixtures, app),
      logLevel: "warn",
      mode: "production",
      build: { outDir, emptyOutDir: true, modulePreload: { polyfill: false } },
    })
    sizes[app] = {}
    for (const file of await readdir(join(outDir, "assets"))) {
      const text = await readFile(join(outDir, "assets", file))
      sizes[app][file] = { bytes: text.length, gzip: gzipSync(text).length }
    }
  }
  return sizes
}

export async function distSizes() {
  const sizes: Record<string, { bytes: number; gzip: number }> = {}
  for (const file of [
    "index.js",
    "dev/index.js",
    "panel.js",
    "solid.js",
    "react.js",
    "themes.js",
  ]) {
    const path = join(root, "dist", file)
    if (!(await stat(path).catch(() => null))) continue
    const text = await readFile(path)
    sizes[file] = { bytes: text.length, gzip: gzipSync(text).length }
  }
  return sizes
}

if (import.meta.main) {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  console.log("dist entries (raw / gzip)")
  for (const [file, s] of Object.entries(await distSizes()))
    console.log(`  ${file.padEnd(14)} ${kb(s.bytes).padStart(9)} / ${kb(s.gzip)}`)
  for (const [app, files] of Object.entries(await buildConsumers())) {
    console.log(`consumer: ${app}`)
    for (const [file, s] of Object.entries(files))
      console.log(`  ${file.padEnd(28)} ${kb(s.bytes).padStart(9)} / ${kb(s.gzip)}`)
  }
}
