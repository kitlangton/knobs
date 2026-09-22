import { defineConfig } from "vite"
export default defineConfig({
  root: "examples",
  optimizeDeps: { entries: ["index.html", "contracts.html"] },
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
  build: { outDir: "dist" },
})
