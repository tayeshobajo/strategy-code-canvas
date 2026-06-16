import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression coverage for the /insights hero and article rows.
 *
 * Assumes the dev server is already running on http://localhost:8080
 * (the Lovable sandbox always has it up). Run locally with:
 *   bunx playwright test
 *
 * Update snapshots after intentional design changes with:
 *   bunx playwright test --update-snapshots
 */
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8080",
    deviceScaleFactor: 1,
  },
  // Threshold for pixel diffs — small enough to catch shape regressions,
  // loose enough to tolerate sub-pixel font rasterization noise.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: "mobile-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 1600 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1600 } },
    },
    {
      name: "laptop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 1600 } },
    },
    {
      name: "wide-1536",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1536, height: 1600 } },
    },
  ],
});
