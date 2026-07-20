import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end coverage for full-UI-path approval flows. These specs drive real
 * routes against the running dev server (localhost:8080) using the injected
 * Lovable Supabase session. Specs self-skip when the session or a seed
 * project id is not present, so the config is safe to run anywhere.
 *
 * Run locally with:
 *   bunx playwright test --config playwright.e2e.config.ts
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_PATH ||
        "/chromium_headless_shell-1194/chrome-linux/headless_shell",
    },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1800 } },
    },
  ],
});
