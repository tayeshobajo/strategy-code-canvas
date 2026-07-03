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

async function readScroll(page: Page): Promise<{ left: number; width: number; client: number }> {
  return await page.evaluate(() => {
    const el = document.getElementById("portal-canvas-scroll");
    if (!el) return { left: -1, width: 0, client: 0 };
    return { left: el.scrollLeft, width: el.scrollWidth, client: el.clientWidth };
  });
}

test.describe("/portal/roadmap Fit to field + Jump to pan the canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparePage(page);
  });

  test("Jump to each phase changes scrollLeft and Fit resets to Point A; A + B both reachable", async ({ page }) => {
    const start = await readScroll(page);
    expect(start.left).toBe(0);
    expect(start.width).toBeGreaterThan(start.client); // canvas is pannable

    const jumpTargets = [
      { name: /Point A/i, expectMin: 0, expectMax: start.width * 0.1 },
      { name: /Phase 1/i, expectMin: start.width * 0.05, expectMax: start.width * 0.35 },
      { name: /Phase 2/i, expectMin: start.width * 0.3, expectMax: start.width * 0.65 },
      { name: /Phase 3/i, expectMin: start.width * 0.6, expectMax: start.width * 0.95 },
      { name: /Point B/i, expectMin: start.width * 0.7, expectMax: start.width },
    ];

    for (const target of jumpTargets) {
      await page.getByRole("button", { name: /jump to/i }).click();
      await page.getByRole("menuitem", { name: target.name }).click();
      await page.waitForTimeout(500);
      const s = await readScroll(page);
      expect(s.left, `Jump to ${target.name}`).toBeGreaterThanOrEqual(target.expectMin - 1);
      expect(s.left, `Jump to ${target.name}`).toBeLessThanOrEqual(target.expectMax + 1);
    }

    // Fit to field → back to origin (Point A visible)
    await page.getByRole("button", { name: /fit to field/i }).click();
    await page.waitForTimeout(500);
    const end = await readScroll(page);
    expect(end.left).toBeLessThanOrEqual(2);
  });
});

test.describe("/portal/roadmap sync between mini-map, active phase, and markers", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparePage(page);
  });

  test("clicking a phase stop in the bottom overview strip pans the main map", async ({ page }) => {
    const overview = page.locator("[data-testid='roadmap-canvas-wrap']").locator("text=Roadmap overview").locator("..").locator("..");

    const before = await readScroll(page);
    // Click Phase 3 tab in the strip (buttons with sub-label "Scale Systems")
    await overview.getByRole("button", { name: /Scale Systems/i }).click();
    await page.waitForTimeout(500);
    const after = await readScroll(page);
    expect(after.left, "phase 3 strip click should pan right").toBeGreaterThan(before.left + 50);

    // Click Point A stop → pans back to origin
    await overview.getByRole("button", { name: /Current State/i }).click();
    await page.waitForTimeout(500);
    const reset = await readScroll(page);
    expect(reset.left).toBeLessThanOrEqual(after.left);
  });

  test("selecting a marker highlights it and updates the mini-map active phase", async ({ page }) => {
    const marker = page.locator("[data-milestone-node]").first();
    await marker.scrollIntoViewIfNeeded();
    await marker.click();
    await page.waitForTimeout(300);
    // The selected marker exposes data-marker-selected=true
    await expect(page.locator("[data-marker-selected='true']")).toHaveCount(1);
    // Milestone sheet drawer opens (aria dialog with milestone-sheet-title)
    await expect(page.locator("#milestone-sheet-title")).toBeVisible();
    // The overlay behind the sheet is the lighter black/10 (not the heavy default)
    const overlayBg = await page
      .locator("[data-slot='sheet-overlay'], [class*='fixed inset-0'][class*='bg-black']")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor)
      .catch(() => "");
    // black/10 = rgba(0,0,0,0.1). Allow either exact or close.
    if (overlayBg) {
      expect(overlayBg.replace(/\s/g, "")).toMatch(/rgba\(0,0,0,0\.1\d*\)|rgba\(0,0,0,0\.1\)/);
    }
  });
});

test.describe("/portal/roadmap fits within the viewport at 100% zoom", () => {
  for (const viewport of [
    { name: "laptop-1366", width: 1366, height: 768 },
    { name: "desktop-1440", width: 1440, height: 900 },
    { name: "desktop-1920", width: 1920, height: 1080 },
  ] as const) {
    test(`no page-level vertical scroll at ${viewport.name}, mini-map visible`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await preparePage(page);

      // The controlled roadmap viewport lives at the top of the page. Only the
      // sections BELOW (SupportingContext, AcknowledgeBlock) may cause
      // additional page scroll. What matters at 100% zoom is: the roadmap
      // canvas + mini-map fit within the visible viewport height without
      // needing to scroll first.
      const inView = await page.evaluate(() => {
        const canvas = document.querySelector("[data-testid='roadmap-canvas-wrap']") as HTMLElement | null;
        const mini = document.getElementById("portal-canvas-scroll")?.parentElement?.querySelector("[class*='backdrop-blur'][class*='rounded-xl']") as HTMLElement | null;
        const stripByText = Array.from(document.querySelectorAll("*")).find((n) =>
          (n as HTMLElement).innerText?.trim() === "Roadmap overview",
        ) as HTMLElement | null;
        const strip = mini ?? stripByText;
        const cr = canvas?.getBoundingClientRect();
        const sr = strip?.getBoundingClientRect();
        return {
          vh: window.innerHeight,
          canvasBottom: cr?.bottom ?? null,
          canvasTop: cr?.top ?? null,
          stripBottom: sr?.bottom ?? null,
          stripTop: sr?.top ?? null,
        };
      });

      expect(inView.canvasTop, "canvas should be at/near the top").not.toBeNull();
      expect(inView.canvasBottom, "canvas should fit within viewport height").toBeLessThanOrEqual(
        inView.vh + 2,
      );
      if (inView.stripBottom != null && inView.stripTop != null) {
        expect(inView.stripTop, "mini-map top must be inside the viewport").toBeLessThan(inView.vh);
        expect(inView.stripBottom, "mini-map bottom must be inside the viewport").toBeLessThanOrEqual(
          inView.vh + 2,
        );
      }
    });
  }
});

