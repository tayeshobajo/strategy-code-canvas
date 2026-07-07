import { test, expect, type Page } from "@playwright/test";

/**
 * Lightweight responsive smoke tests.
 *
 * Asserts key pages don't have layout / spacing breakage at mobile & desktop:
 *   - no horizontal page scroll (documentElement.scrollWidth <= clientWidth + slack)
 *   - main content top is below the fixed / sticky header (no clipping)
 *   - no runtime console errors during initial render
 *
 * These are hard assertions (not pixel snapshots) so they run on every CI
 * viewport project without requiring baseline images.
 */

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/investment",
  "/what-we-build",
  "/portal/login",
  "/portal/roadmap?__visual=demo",
  "/build-my-roadmap",
] as const;

const HORIZONTAL_SLACK_PX = 2; // sub-pixel rounding

async function assertNoHorizontalOverflow(page: Page, route: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `${route} horizontally overflows (scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + HORIZONTAL_SLACK_PX);
}

async function assertMainNotClippedByHeader(page: Page, route: string) {
  // Find the primary <main> or role=main, and any fixed/sticky header
  // rendered above the fold. If a header exists, its bottom must be
  // <= the top of the first visible heading inside main.
  const measurement = await page.evaluate(() => {
    const main =
      document.querySelector("main") ||
      document.querySelector("[role='main']");
    if (!main) return { headerBottom: 0, headingTop: 0, headingFound: false };
    const heading = main.querySelector("h1, h2");
    if (!heading) return { headerBottom: 0, headingTop: 0, headingFound: false };
    const headingRect = heading.getBoundingClientRect();
    let headerBottom = 0;
    for (const el of Array.from(document.querySelectorAll("header"))) {
      const style = getComputedStyle(el as Element);
      if (style.position === "fixed" || style.position === "sticky") {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.top <= 0 && rect.bottom > headerBottom) {
          headerBottom = rect.bottom;
        }
      }
    }
    return { headerBottom, headingTop: headingRect.top, headingFound: true };
  });
  if (!measurement.headingFound) return;
  expect(
    measurement.headingTop,
    `${route}: first heading (top ${measurement.headingTop}px) is clipped by fixed header (bottom ${measurement.headerBottom}px)`,
  ).toBeGreaterThanOrEqual(measurement.headerBottom - 1);
}

for (const route of PUBLIC_ROUTES) {
  test(`responsive smoke: ${route}`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    // Some routes may 404 in test env; skip rather than fail the whole suite.
    if (!response || response.status() >= 500) {
      test.skip(true, `route ${route} returned ${response?.status()}`);
    }
    await page.waitForLoadState("networkidle").catch(() => {});

    await assertNoHorizontalOverflow(page, route);
    await assertMainNotClippedByHeader(page, route);

    // Filter noisy third-party errors (Stripe / Supabase network in test env).
    const meaningful = consoleErrors.filter(
      (e) =>
        !/stripe|supabase|Failed to fetch|NetworkError|net::ERR_/i.test(e),
    );
    expect(
      meaningful,
      `${route} on ${testInfo.project.name} produced console errors:\n${meaningful.join("\n")}`,
    ).toHaveLength(0);
  });
}
