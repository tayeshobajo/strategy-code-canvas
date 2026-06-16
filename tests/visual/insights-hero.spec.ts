import { test, expect } from "@playwright/test";

/**
 * Visual regression for the /insights hero and article rows.
 *
 * Two layers of coverage per viewport:
 *  1. Numerical alignment assertion — the bullet dot and category text in
 *     each article row must share a vertical midline (within 1.5px). This
 *     fails loudly with a precise number, not just a pixel-diff red blob.
 *  2. Pinned screenshots of the hero band and the article-row strip, so
 *     unintended changes to the arrow/trail SVG or the row template are
 *     caught even when alignment is unaffected.
 */

test.describe("/insights hero + rows visual regression", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/insights", { waitUntil: "networkidle" });
    // Stabilize: pause CSS animations/transitions so screenshots are deterministic.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }`,
    });
    // Freeze SMIL animations (animateMotion, animate) inside SVGs so the
    // moving traveler dot doesn't introduce screenshot noise.
    await page.evaluate(() => {
      document.querySelectorAll("svg").forEach((s) => {
        const anySvg = s as unknown as { pauseAnimations?: () => void; setCurrentTime?: (t: number) => void };
        anySvg.pauseAnimations?.();
        anySvg.setCurrentTime?.(0);
      });
    });
    // Ensure reveal-on-scroll content is mounted.
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  test("hero band screenshot", async ({ page }, testInfo) => {
    const hero = page.locator("section[aria-labelledby='insights-heading']");
    await expect(hero).toBeVisible();
    await expect(hero).toHaveScreenshot(`hero-${testInfo.project.name}.png`);
  });

  test("article rows: dot and category share a midline", async ({ page }) => {
    // Scroll the article list into view so reveal animations have completed.
    const firstRow = page.locator("ul li").filter({ has: page.locator("span.bg-royal.rounded-full") }).first();
    await firstRow.scrollIntoViewIfNeeded();

    const measurements = await page.evaluate(() => {
      const rows: Array<{ delta: number; cat: string }> = [];
      document.querySelectorAll("li").forEach((li) => {
        const dot = li.querySelector<HTMLElement>(
          'span[class*="rounded-full"][class*="bg-royal"]',
        );
        const cat = li.querySelector<HTMLElement>('span[class*="uppercase"]');
        if (!dot || !cat) return;
        const d = dot.getBoundingClientRect();
        const c = cat.getBoundingClientRect();
        if (!d.width || !c.width) return;
        rows.push({
          delta: d.top + d.height / 2 - (c.top + c.height / 2),
          cat: (cat.textContent || "").trim().slice(0, 40),
        });
      });
      return rows;
    });

    expect(measurements.length).toBeGreaterThan(0);
    for (const { delta, cat } of measurements) {
      expect(
        Math.abs(delta),
        `dot/category midline drift for "${cat}" should be ≤ 1.5px (got ${delta.toFixed(2)}px)`,
      ).toBeLessThanOrEqual(1.5);
    }
  });

  test("article rows strip screenshot", async ({ page }, testInfo) => {
    const list = page.locator("ul").filter({ has: page.locator("span.bg-royal.rounded-full") }).first();
    await list.scrollIntoViewIfNeeded();
    await expect(list).toHaveScreenshot(`rows-${testInfo.project.name}.png`);
  });
});
