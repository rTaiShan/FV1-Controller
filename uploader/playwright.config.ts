import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3200",
    browserName: "chromium",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --webpack --hostname 127.0.0.1 --port 3200",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:3200",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        isMobile: true,
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "mobile-390",
      use: {
        isMobile: true,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "tablet",
      use: {
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop",
      use: {
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
})
