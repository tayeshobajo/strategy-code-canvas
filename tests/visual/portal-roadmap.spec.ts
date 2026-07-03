import { test, expect, type Page } from "@playwright/test";
import { createHash } from "crypto";

/**
 * Visual + interaction regression for /portal/roadmap.
 *
 * Uses the ?__visual=demo flag on the roadmap route to render a fixture
 * without a Supabase session, so tests are deterministic and CI-friendly.
 *
 * Snapshot baselines live under
 *   tests/visual/portal-roadmap.spec.ts-snapshots/
 * Regenerate after intentional design changes with:
 *   bunx playwright test portal-roadmap --update-snapshots
 *
 * To seed the strict-pixel baseline from a hand-approved reference PNG,
 * copy the source image into the snapshots directory with the name
 * Playwright expects for the target project (e.g. `roadmap-desktop-1440.png`).
 */

const URL_DEMO = "/portal/roadmap?__visual=demo";

const EXTRA_ROADMAP_VIEWPORTS = [
  { name: "tablet-900", width: 900, height: 1600 },
  { name: "small-desktop-1366", width: 1366, height: 1600 },
] as const;

async function preparePage(page: Page) {
  await page.goto(URL_DEMO, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      caret-color: transparent !important;
    }`,
  });
  await page.evaluate(() => {
    document.querySelectorAll("svg").forEach((s) => {
      const anySvg = s as unknown as { pauseAnimations?: () => void };
      anySvg.pauseAnimations?.();
    });
  });
  // Wait for the canvas + supporting sections to mount.
  await page.waitForSelector("[data-testid='roadmap-canvas-wrap']");
  await page.waitForSelector("[data-testid='unchanged-sections']");
}

async function hashUnchangedSections(page: Page): Promise<string> {
  const html = await page
    .locator("[data-testid='unchanged-sections']")
    .evaluate((el) => el.innerHTML);
  return createHash("sha256").update(html).digest("hex");
}

test.describe("/portal/roadmap visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test("roadmap canvas snapshot", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1440",
      "The uploaded Image 1 strict baseline is a desktop-1440 reference.",
    );

    // Match the uploaded Image 1 reference size exactly and compare the full viewport.
    await page.setViewportSize({ width: 1536, height: 1024 });
    await preparePage(page);
    await expect(page.locator("[data-testid='roadmap-canvas-wrap']")).toBeVisible();
    await expect(page).toHaveScreenshot(`roadmap-${testInfo.project.name}.png`, {
      fullPage: false,
    });
  });
});

test.describe("/portal/roadmap additional viewport visual regression", () => {
  for (const viewport of EXTRA_ROADMAP_VIEWPORTS) {
    test(`roadmap canvas snapshot ${viewport.name}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop-1440",
        "Extra roadmap viewport baselines run once to avoid duplicating across every project.",
      );

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await preparePage(page);

      const canvas = page.locator("[data-testid='roadmap-canvas-wrap']");
      await expect(canvas).toBeVisible();
      await expect(canvas).toHaveScreenshot(`roadmap-${viewport.name}.png`);
    });
  }
});

test.describe("/portal/roadmap header actions keep unchanged sections stable", () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test("Fit to field, Jump to, View filter, Ask, Book do not mutate unchanged sections", async ({
    page,
  }) => {
    const before = await hashUnchangedSections(page);

    // Fit to field
    await page.getByRole("button", { name: /fit to field/i }).click();
    await page.waitForTimeout(200);
    expect(await hashUnchangedSections(page), "after Fit to field").toBe(before);

    // Jump to → Phase 2
    await page.getByRole("button", { name: /jump to/i }).click();
    await page.getByRole("menuitem", { name: /Phase 2/i }).click();
    await page.waitForTimeout(300);
    expect(await hashUnchangedSections(page), "after Jump to Phase 2").toBe(before);

    // View filter → Decisions, then back to All
    await page.getByLabel("Filter roadmap view").click();
    await page.getByRole("option", { name: /decision/i }).first().click();
    await page.waitForTimeout(200);
    expect(await hashUnchangedSections(page), "after View filter = decisions").toBe(before);
    await page.getByLabel("Filter roadmap view").click();
    await page.getByRole("option", { name: /full journey/i }).first().click();
    await page.waitForTimeout(200);
    expect(await hashUnchangedSections(page), "after View filter reset").toBe(before);

    // Ask a question → opens modal, close via Escape
    await page.getByRole("button", { name: /ask a question/i }).click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    expect(await hashUnchangedSections(page), "after Ask a question").toBe(before);

    // Book next call → opens modal, close via Escape
    await page.getByRole("button", { name: /book next call/i }).click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    expect(await hashUnchangedSections(page), "after Book next call").toBe(before);
  });
});
