import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

const rootDir = resolve(import.meta.dirname, "..")
const rollingCss = readFileSync(
  resolve(rootDir, "node_modules/@kitlangton/rolling-number/dist/styles.css"),
  "utf8",
)

export default defineConfig(({ command }) => ({
  root: "examples",
  optimizeDeps: { entries: ["index.html", "contracts.html"] },
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
  build: { outDir: "dist" },
  ...(command === "serve"
    ? {
        resolve: {
          alias: [
            { find: /^knobs$/, replacement: resolve(rootDir, "src/index.ts") },
            { find: /^knobs\/react$/, replacement: resolve(rootDir, "src/react/index.ts") },
            { find: /^knobs\/solid$/, replacement: resolve(rootDir, "src/solid/index.ts") },
            { find: /^knobs\/panel$/, replacement: resolve(rootDir, "src/panel/index.ts") },
          ],
        },
        plugins: [
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
