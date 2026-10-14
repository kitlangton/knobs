import { defineConfig } from "@playwright/test"
// PORT and PREVIEW_PORT keep a worktree's run off another's servers (they're reused when up).
const port = Number(process.env.PORT) || 5178
const preview = Number(process.env.PREVIEW_PORT) || 5179
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
    { command: "bun run example", url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
    {
      command: `bunx vite preview --config examples/vite.config.ts --host 127.0.0.1 --port ${preview} --strictPort`,
      url: `http://127.0.0.1:${preview}`,
      reuseExistingServer: true,
    },
  ],
})
