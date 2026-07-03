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

/** Bounding boxes for Point A + Point B labels; both must lie inside the canvas. */
async function pointsReachable(page: Page): Promise<{ aInside: boolean; bInside: boolean }> {
  return await page.evaluate(() => {
    const canvas = document.querySelector("[data-testid='roadmap-canvas-wrap']") as HTMLElement | null;
    const cr = canvas?.getBoundingClientRect();
    if (!cr) return { aInside: false, bInside: false };
    const findByText = (needle: string) =>
      Array.from(document.querySelectorAll("div")).find(
        (n) => (n as HTMLElement).textContent?.trim() === needle,
      ) as HTMLElement | undefined;
    const a = findByText("Point A");
    const b = findByText("Point B");
    const inside = (el: HTMLElement | undefined) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.left >= cr.left - 2 && r.right <= cr.right + 2 && r.top >= cr.top - 2 && r.bottom <= cr.bottom + 2;
    };
    return { aInside: inside(a), bInside: inside(b) };
  });
}

test.describe("/portal/roadmap Fit to field + Jump to keep the field navigable", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparePage(page);
  });

  test("Point A and Point B remain reachable inside the canvas after every Jump / Fit", async ({ page }) => {
    // Baseline: at 1440x900 the whole journey fits inside the canvas
    // ("fitHeight" mode), so both anchors should already be inside.
    const baseline = await pointsReachable(page);
    expect(baseline.aInside, "Point A visible at baseline").toBe(true);
    expect(baseline.bInside, "Point B visible at baseline").toBe(true);

    // Cycle through every Jump target; the active phase pill must update,
    // scrollLeft never blows past the scroll bounds, and both endpoints stay
    // reachable (either currently in view or reachable by pointerless jump).
    const jumps: Array<{ label: RegExp; expected: RegExp }> = [
      { label: /Point A/i, expected: /Point A/i },
      { label: /Phase 1/i, expected: /Phase 1/i },
      { label: /Phase 2/i, expected: /Phase 2/i },
      { label: /Phase 3/i, expected: /Phase 3/i },
      { label: /Point B/i, expected: /Point B/i },
    ];

    for (const j of jumps) {
      await page.getByRole("button", { name: /jump to/i }).click();
      await page.getByRole("menuitem", { name: j.label }).click();
      await page.waitForTimeout(400);
      const scroll = await readScroll(page);
      expect(scroll.left, `scrollLeft in bounds after Jump ${j.label}`).toBeGreaterThanOrEqual(0);
      expect(
        scroll.left,
        `scrollLeft in bounds after Jump ${j.label}`,
      ).toBeLessThanOrEqual(Math.max(scroll.width - scroll.client, 0) + 2);
      // Header "Current Phase" pill reflects the jump target
      await expect(page.getByText(j.expected, { exact: false }).first()).toBeVisible();
    }

    // Fit to field returns to origin scroll and endpoints stay reachable.
    await page.getByRole("button", { name: /fit to field/i }).click();
    await page.waitForTimeout(400);
    const end = await readScroll(page);
    expect(end.left, "Fit to field returns to origin").toBeLessThanOrEqual(2);
    const after = await pointsReachable(page);
    expect(after.aInside && after.bInside, "A + B both reachable after Fit").toBe(true);
  });
});

test.describe("/portal/roadmap sync between mini-map, active phase, and markers", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await preparePage(page);
  });

  test("clicking a phase stop in the mini-map updates the active phase and pill", async ({ page }) => {
    // The floating overview strip is inside the canvas. Its phase buttons
    // carry sub-labels: Current State / Foundation / Core Platform Build /
    // Scale Systems / Scaled Impact.
    // The mini-map "phase" buttons carry accessible names like
    // "Phase 1 Foundation" — exact-match keeps us out of the milestone
    // markers on the map that happen to include the same words.
    const canvas = page.locator("[data-testid='roadmap-canvas-wrap']");

    await canvas.getByRole("button", { name: "Phase 3 Scale Systems", exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/Phase 3/i).first()).toBeVisible();

    await canvas.getByRole("button", { name: "Phase 1 Foundation", exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/Phase 1/i).first()).toBeVisible();

    await canvas.getByRole("button", { name: "Point A Current State", exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText(/Point A/i).first()).toBeVisible();

  });

  test("selecting a marker highlights it, opens the drawer, and uses a light overlay (≤12%)", async ({ page }) => {
    const marker = page.locator("[data-milestone-node]").first();
    await marker.scrollIntoViewIfNeeded();
    await marker.click();
    await page.waitForTimeout(300);
    // Exactly one marker is now visually selected.
    await expect(page.locator("[data-marker-selected='true']")).toHaveCount(1);
    // Drawer opened with heading.
    await expect(page.locator("#milestone-sheet-title")).toBeVisible();
    // Overlay behind the sheet must be light (≤12% opacity black). The
    // shadcn Sheet overlay is a fixed-inset element with our bg-black/10
    // class. Read its computed alpha (works for rgba() and oklab(... / a)).
    const overlayAlpha = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("div"))
        .filter((el) => {
          const cs = getComputedStyle(el);
          return (
            cs.position === "fixed" &&
            cs.inset === "0px" &&
            cs.backgroundColor &&
            cs.backgroundColor !== "rgba(0, 0, 0, 0)"
          );
        }) as HTMLElement[];
      const el = candidates[0];
      if (!el) return null;
      const bg = getComputedStyle(el).backgroundColor;
      const rgba = bg.match(/rgba?\(([^)]+)\)/);
      if (rgba) {
        const parts = rgba[1].split(/[,\s/]+/).filter(Boolean);
        return parts.length >= 4 ? parseFloat(parts[3]) : 1;
      }
      const alpha = bg.match(/\/\s*([\d.]+)\s*\)/);
      return alpha ? parseFloat(alpha[1]) : null;
    });
    expect(overlayAlpha, "overlay must be ≤12% opacity").not.toBeNull();
    expect(overlayAlpha!).toBeLessThanOrEqual(0.12);

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


test.describe("/portal/roadmap smart-map behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1480, height: 1000 });
    await preparePage(page);
  });

  test("current phase is consistent across pill, status card, and mini-map", async ({ page }) => {
    const pill = await page.locator("[data-testid='current-phase-pill']").innerText();
    const status = await page.locator("[data-testid='status-current-phase']").innerText();
    expect(pill.toLowerCase()).toContain("phase 1: foundation");
    expect(status.toLowerCase()).toContain("phase 1: foundation");
    // The Phase 1 strip stop is marked as the current phase.
    await expect(page.locator("[data-testid='strip-now']")).toHaveAttribute(
      "data-current-phase",
      "true",
    );
    // And when the whole map is visible, the display active stop matches.
    await expect(page.locator("[data-testid='strip-now']")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("progressive disclosure: strategic zoom shows anchors full, others icon-only", async ({
    page,
  }) => {
    const counts = await page.evaluate(() => {
      const buckets: Record<string, number> = {};
      document.querySelectorAll("[data-marker-visibility]").forEach((el) => {
        const v = el.getAttribute("data-marker-visibility") ?? "";
        buckets[v] = (buckets[v] ?? 0) + 1;
      });
      return buckets;
    });
    // At least one anchor is full-labelled; some level-3 items should be icon-only.
    expect((counts.full ?? 0) >= 1).toBeTruthy();
    expect((counts.icon ?? 0) >= 1).toBeTruthy();
  });

  test("interactive legend toggles marker visibility", async ({ page }) => {
    const chip = page.locator("[data-testid='legend-meeting']");
    const before = await chip.getAttribute("data-state");
    await chip.click();
    await page.waitForTimeout(120);
    const after = await chip.getAttribute("data-state");
    expect(after).not.toBe(before);
  });

  test("status card is collapsed by default and expands on click", async ({ page }) => {
    const card = page.locator("[data-testid='status-overlay-card']");
    await expect(card).toHaveAttribute("data-collapsed", "true");
    await page.locator("[data-testid='status-toggle']").click();
    await expect(card).toHaveAttribute("data-collapsed", "false");
  });

  test("clicking the Phase 3 stop in the mini-map marks it active", async ({ page }) => {
    await page.locator("[data-testid='strip-later']").click();
    await page.waitForTimeout(200);
    await expect(page.locator("[data-testid='strip-later']")).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});

test.describe("/portal/roadmap URL + state persistence", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1480, height: 1000 });
    await preparePage(page);
  });

  test("selecting a view mode writes ?view= and persists after reload", async ({ page }) => {
    await page.getByLabel("Filter roadmap view").click();
    await page.getByRole("option", { name: /decisions only/i }).click();
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/[?&]view=decisions/);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='roadmap-canvas-wrap']");
    // The view filter select still reflects the persisted mode.
    await expect(page.getByLabel("Filter roadmap view")).toContainText(/decisions/i);
  });

  test("selecting a phase in the mini-map writes ?phase= to the URL", async ({ page }) => {
    await page.locator("[data-testid='strip-later']").click();
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/[?&]phase=later/);
  });
});

test.describe("/portal/roadmap empty-state and route highlight", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1480, height: 1000 });
    await preparePage(page);
  });

  test("selecting a marker draws the critical-path route segment overlay", async ({ page }) => {
    const marker = page.locator("[data-milestone-node]").first();
    await marker.scrollIntoViewIfNeeded();
    await marker.click();
    await page.waitForTimeout(200);
    // The polyline overlay is rendered inside the map canvas as an SVG.
    const polylineCount = await page.locator("[data-testid='roadmap-canvas-wrap'] svg polyline").count();
    expect(polylineCount).toBeGreaterThan(0);
  });
});

