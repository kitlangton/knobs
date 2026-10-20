import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

const rootDir = resolve(import.meta.dirname, "..")
const port = Number(process.env.PORT) || 5178

// `--mode site` builds the public demo (knobs.kitlangton.com): source-linked like dev, with panels on.
export default defineConfig(({ command, mode }) => ({
  root: "examples",
  optimizeDeps: {
    include: ["solid-js", "solid-js/web", "solid-js/html", "@pierre/diffs"],
    entries: [
      "studies.html",
      "lab.html",
      "lab-diff.html",
      "walkthrough.html",
      "controls.html",
      "contracts.html",
      "meta.html",
      "die.html",
      "tune.html",
      "problems.html",
      "presets-bench.html",
      "ideas.html",
      "themes.html",
      "hero-swarm.html",
      "hero-magi.html",
      "hero-slime.html",
      "hero-ink.html",
      "hero-attractor.html",
    ],
  },
  server: { host: "127.0.0.1", port, strictPort: true, allowedHosts: [".ts.net"] },
  build: {
    outDir: mode === "site" ? "site" : "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        studies: resolve(import.meta.dirname, "studies.html"),
        lab: resolve(import.meta.dirname, "lab.html"),
        labDiff: resolve(import.meta.dirname, "lab-diff.html"),
        walkthrough: resolve(import.meta.dirname, "walkthrough.html"),
        story: resolve(import.meta.dirname, "story.html"),
        controls: resolve(import.meta.dirname, "controls.html"),
        contracts: resolve(import.meta.dirname, "contracts.html"),
        meta: resolve(import.meta.dirname, "meta.html"),
        die: resolve(import.meta.dirname, "die.html"),
        tune: resolve(import.meta.dirname, "tune.html"),
        problems: resolve(import.meta.dirname, "problems.html"),
        presetsBench: resolve(import.meta.dirname, "presets-bench.html"),
        ideas: resolve(import.meta.dirname, "ideas.html"),
        themes: resolve(import.meta.dirname, "themes.html"),
        heroSwarm: resolve(import.meta.dirname, "hero-swarm.html"),
        heroMagi: resolve(import.meta.dirname, "hero-magi.html"),
        heroSlime: resolve(import.meta.dirname, "hero-slime.html"),
        heroInk: resolve(import.meta.dirname, "hero-ink.html"),
        heroAttractor: resolve(import.meta.dirname, "hero-attractor.html"),
      },
    },
  },
  ...(command === "serve" || mode === "site"
    ? {
        resolve: {
          dedupe: ["solid-js"],
          alias: [
            { find: /^knobs$/, replacement: resolve(rootDir, "src/index.ts") },
            { find: /^knobs\/react$/, replacement: resolve(rootDir, "src/react/index.ts") },
            { find: /^knobs\/solid$/, replacement: resolve(rootDir, "src/solid/index.ts") },
            { find: /^knobs\/panel$/, replacement: resolve(rootDir, "src/panel/index.ts") },
            { find: /^knobs\/themes$/, replacement: resolve(rootDir, "src/themes/index.ts") },
            { find: /^knobs\/ui$/, replacement: resolve(rootDir, "src/ui/index.ts") },
            { find: /^knobs\/ui\/react$/, replacement: resolve(rootDir, "src/ui/react.tsx") },
            { find: /^knobs\/ui\/solid$/, replacement: resolve(rootDir, "src/ui/solid.ts") },
          ],
        },
        plugins: [
          {
            // examples/wheel.html posts recorded trackpad streams here (dev server only).
            name: "knobs-wheel-traces",
            configureServer(server) {
              server.middlewares.use("/__wheel-traces", (req, res) => {
                if (req.method !== "POST") return void res.writeHead(405).end()
                let body = ""
                req.on("data", (chunk) => (body += chunk))
                req.on("end", () => {
                  const trace = JSON.parse(body) as { label: string }
                  const dir = resolve(rootDir, "tests/fixtures/kit-traces")
                  mkdirSync(dir, { recursive: true })
                  const name = `${trace.label.replace(/[^a-z0-9-]/gi, "")}-${Date.now()}.json`
                  writeFileSync(resolve(dir, name), JSON.stringify(trace))
                  res.writeHead(200).end("ok")
                })
              })
            },
          },
        ],
      }
    : {
        // The production build imports the built package (dist), as an installed copy would.
        resolve: {
          dedupe: ["solid-js"],
          alias: [
            { find: /^knobs$/, replacement: resolve(rootDir, "dist/index.js") },
            { find: /^knobs\/react$/, replacement: resolve(rootDir, "dist/react.js") },
            { find: /^knobs\/solid$/, replacement: resolve(rootDir, "dist/solid.js") },
            { find: /^knobs\/panel$/, replacement: resolve(rootDir, "dist/panel.js") },
            { find: /^knobs\/themes$/, replacement: resolve(rootDir, "dist/themes.js") },
            { find: /^knobs\/ui$/, replacement: resolve(rootDir, "dist/ui.js") },
            { find: /^knobs\/ui\/react$/, replacement: resolve(rootDir, "dist/ui-react.js") },
            { find: /^knobs\/ui\/solid$/, replacement: resolve(rootDir, "dist/ui-solid.js") },
          ],
        },
      }),
}))
