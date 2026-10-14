import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

const rootDir = resolve(import.meta.dirname, "..")
const rollingCss = readFileSync(
  resolve(rootDir, "node_modules/@kitlangton/rolling-number/dist/styles.css"),
  "utf8",
)
const port = Number(process.env.PORT) || 5178

// `--mode site` builds the public demo (knobs.kitlangton.com): source-linked like dev, with panels on.
export default defineConfig(({ command, mode }) => ({
  root: "examples",
  resolve: { dedupe: ["solid-js"] },
  optimizeDeps: {
    include: ["solid-js", "solid-js/web", "solid-js/html"],
    entries: [
      "index.html",
      "contracts.html",
      "meta.html",
      "die.html",
      "tune.html",
      "problems.html",
    ],
  },
  server: { host: "127.0.0.1", port, strictPort: true, allowedHosts: [".ts.net"] },
  build: {
    outDir: mode === "site" ? "site" : "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        contracts: resolve(import.meta.dirname, "contracts.html"),
        meta: resolve(import.meta.dirname, "meta.html"),
        die: resolve(import.meta.dirname, "die.html"),
        tune: resolve(import.meta.dirname, "tune.html"),
        problems: resolve(import.meta.dirname, "problems.html"),
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
          {
            name: "knobs-css-text",
            enforce: "pre",
            resolveId(id) {
              if (id === "@kitlangton/rolling-number/styles.css") return "\0rolling-number-css"
            },
            load(id) {
              if (id === "\0rolling-number-css")
                return `export default ${JSON.stringify(rollingCss)}`
            },
          },
        ],
      }
    : {}),
}))
