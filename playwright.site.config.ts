import { defineConfig } from "@playwright/test"

// Smoke test for the docs site, run against the production build (`bun run test:site`).
export default defineConfig({
  testDir: "tests/site",
  use: {
    baseURL: "http://127.0.0.1:5197",
    viewport: { width: 1440, height: 900 },
    browserName: "chromium",
  },
  webServer: {
    command:
      "bunx vite build --config site/vite.config.ts --logLevel warn && bunx vite preview --config site/vite.config.ts --host 127.0.0.1 --port 5197 --strictPort",
    url: "http://127.0.0.1:5197",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
