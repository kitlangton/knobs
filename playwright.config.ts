import { defineConfig } from "@playwright/test"
// KNOBS_PORT moves the dev server (and the preview, one above it) off 5178 when another
// checkout's servers hold it; Playwright would otherwise reuse them.
const port = Number(process.env.KNOBS_PORT) || 5178
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    browserName: "chromium",
    // CI runners have no GPU. Chromium's software WebGPU (SwiftShader) works in the full browser's
    // new headless mode; the default headless shell drops its WebGPU instance.
    ...(process.env.CI ? { channel: "chromium" } : {}),
    launchOptions: {
      args: process.env.CI
        ? [
            "--enable-unsafe-webgpu",
            "--enable-unsafe-swiftshader",
            "--use-webgpu-adapter=swiftshader",
          ]
        : ["--enable-gpu"],
    },
  },
  webServer: [
    {
      command: `PORT=${port} bun run example`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: true,
    },
    {
      command: `bunx vite preview --config examples/vite.config.ts --host 127.0.0.1 --port ${port + 1} --strictPort`,
      url: `http://127.0.0.1:${port + 1}`,
      reuseExistingServer: true,
    },
  ],
})
