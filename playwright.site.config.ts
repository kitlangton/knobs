import { defineConfig } from "@playwright/test"

// Smoke test for the docs site, run against the production build (`bun run test:site`).
// SITE_PORT picks the preview's port. The server is never reused, so a run can't test another
// app that happens to be listening there; a busy port fails the run instead (--strictPort).
const port = Number(process.env.SITE_PORT) || 5197

export default defineConfig({
  testDir: "tests/site",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    browserName: "chromium",
  },
  webServer: {
    command: `bunx vite build --config site/vite.config.ts --logLevel warn && bunx vite preview --config site/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
