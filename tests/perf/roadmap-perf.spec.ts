/**
 * Roadmap canvas performance harness.
 *
 * Best run against a locally authenticated preview. Reads dev-only
 * `window.__roadmapPerf.summary()` after a scripted interaction burst
 * and asserts p95 stays under the same thresholds published in
 * `src/components/portal/roadmap/perf.ts`. Also writes a JSON report
 * to /tmp/browser/roadmap/perf.json for CI inspection.
 *
 * Skipped automatically when the harness cannot reach the authenticated
 * roadmap route (e.g. session-less sandbox previews).
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LabelSummary = {
  label: string;
  samples: number;
  p50: number;
  p95: number;
  max: number;
  threshold: number | null;
  breached: boolean;
};

const REPORT_PATH = "/tmp/browser/roadmap/perf.json";

test.describe("roadmap canvas — perf instrumentation", () => {
  test("hot paths stay within warn-once thresholds", async ({ page }) => {
    await page.goto("http://localhost:8080/portal/roadmap", { waitUntil: "domcontentloaded" });

    // If the app redirected to the login page, the harness has no session —
    // skip cleanly rather than fail. This keeps the spec runnable in
    // signed-out sandbox environments while still providing coverage in CI.
    if (page.url().includes("/portal/login") || page.url().endsWith("/")) {
      test.skip(true, "no authenticated session in this environment");
      return;
    }

    // Wait for the canvas + at least a few markers to mount.
    const scroller = page.locator("#portal-canvas-scroll");
    await expect(scroller).toBeVisible({ timeout: 10_000 });
    await page.waitForSelector("[data-milestone-node]", { timeout: 10_000 });

    // Reset perf counters after warm-up.
    await page.evaluate(() => window.__roadmapPerf?.reset());

    // --- Scripted interaction burst ---
    // 1. Pan the canvas horizontally in a few sweeps.
    for (const dx of [400, -300, 250]) {
      await scroller.evaluate((el, delta) => {
        (el as HTMLElement).scrollBy({ left: delta, behavior: "auto" });
      }, dx);
      await page.waitForTimeout(120);
    }

    // 2. Hover across the first few markers to exercise the hover setter.
    const markers = page.locator("[data-milestone-node]");
    const markerCount = Math.min(await markers.count(), 8);
    for (let i = 0; i < markerCount; i++) {
      await markers.nth(i).hover({ trial: false }).catch(() => {});
      await page.waitForTimeout(40);
    }

    // 3. Select up to 5 markers in sequence to exercise selection + connector.
    for (let i = 0; i < Math.min(markerCount, 5); i++) {
      await markers.nth(i).click().catch(() => {});
      await page.waitForTimeout(180);
      // close drawer with Escape so the next click is a fresh selection
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(80);
    }

    // 4. If a cluster is present, fan it out and collapse.
    const cluster = page.locator("[data-marker-cluster]").first();
    if (await cluster.count()) {
      await cluster.click().catch(() => {});
      const expandBtn = page.getByRole("button", {
        name: /fan nearby items|collapse back into cluster/i,
      });
      if (await expandBtn.count()) {
        await expandBtn.first().click().catch(() => {});
        await page.waitForTimeout(250);
        // click cluster again + collapse
        await cluster.click().catch(() => {});
        if (await expandBtn.count()) {
          await expandBtn.first().click().catch(() => {});
        }
      }
    }

    // Read the summary out of the page.
    const summary = await page.evaluate<LabelSummary[] | null>(
      () => window.__roadmapPerf?.summary() ?? null,
    );

    // Write the report even when we bail — useful for local debugging.
    try {
      mkdirSync(dirname(REPORT_PATH), { recursive: true });
      writeFileSync(
        REPORT_PATH,
        JSON.stringify(
          { url: page.url(), capturedAt: new Date().toISOString(), summary },
          null,
          2,
        ),
      );
    } catch {
      /* non-fatal */
    }

    // If instrumentation was compiled out (prod build), skip assertions.
    if (!summary || summary.length === 0) {
      test.skip(true, "no perf samples recorded (production build?)");
      return;
    }

    const breached = summary.filter((s) => s.breached);
    expect(
      breached,
      `perf p95 exceeded thresholds:\n${JSON.stringify(breached, null, 2)}`,
    ).toEqual([]);
  });
});
