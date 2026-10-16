import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, type Plugin } from "vite"

const siteDir = import.meta.dirname
const rootDir = resolve(siteDir, "..")
const examplesDir = resolve(rootDir, "examples")
const port = Number(process.env.PORT) || 5196
const examples = ["controls", "lab", "studies", "meta", "die", "contracts", "tune", "problems"]

// `/examples/<page>.html` serves the example page from `examples/` unchanged: the stub in
// site/examples names the page, and its script resolves to the source through `/@examples/`.
function examplePages(): Plugin {
  return {
    name: "knobs-example-pages",
    enforce: "pre",
    resolveId(id) {
      if (id.startsWith("/@examples/")) return resolve(examplesDir, id.slice("/@examples/".length))
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const page = html.match(/<!-- example: (\w+) -->/)?.[1]
        if (!page) return html
        return readFileSync(resolve(examplesDir, `${page}.html`), "utf8").replace(
          /src="\.?\/(\w+\.tsx?)"/,
          'src="/@examples/$1"',
        )
      },
    },
    // The example pages link to each other from the root (`/meta.html`); production redirects
    // those in public/_redirects.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const page = req.url?.match(/^\/(controls|lab|meta|die|contracts|tune|problems)\.html/)?.[1]
        if (!page) return next()
        res.statusCode = 302
        res.setHeader("Location", `/examples/${page}.html`)
        res.end()
      })
    },
  }
}

// The production site is source-linked like dev, with panels on: the docs are the demo.
export default defineConfig({
  root: siteDir,
  mode: "site",
  publicDir: resolve(siteDir, "public"),
  appType: "spa",
  optimizeDeps: {
    include: ["solid-js", "solid-js/web", "solid-js/html"],
    entries: ["index.html", ...examples.map((page) => `examples/${page}.html`)],
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts: [".ts.net"],
    fs: { allow: [rootDir] },
  },
  preview: { host: "127.0.0.1", port, strictPort: true, allowedHosts: [".ts.net"] },
  build: {
    outDir: resolve(siteDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      // React's "use client" directives mean nothing in a client bundle.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE" && warning.code !== "SOURCEMAP_ERROR")
          warn(warning)
      },
      input: {
        site: resolve(siteDir, "index.html"),
        ...Object.fromEntries(
          examples.map((page) => [`example-${page}`, resolve(siteDir, `examples/${page}.html`)]),
        ),
      },
    },
  },
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
  plugins: [examplePages()],
})
