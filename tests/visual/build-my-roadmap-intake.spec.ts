import { test, expect } from "@playwright/test";

/**
 * End-to-end walk through the Build My Roadmap intake:
 *  - eight questions, one at a time
 *  - Point A always visible, Point B reveals at the review screen
 *  - the progress polyline (stroke-dashoffset) shrinks as the user advances
 *  - review screen lists every answer
 *  - submit screen renders the confirmation copy
 *
 * Server functions (`reflectAnswer`, `submitIntake`) are stubbed so the
 * test never hits Anthropic or the database.
 */

const ANSWERS = [
  "We run a boutique strategy practice for founder-led teams.",
  "We want a single page that captures the next twelve months clearly.",
  "Hiring decisions and pricing changes still wait for me.",
  "We hired an agency last year; the work did not stick after delivery.",
  "A long client list and a podcast audience that already trusts us.",
  "Revenue is steadier, the team owns delivery, and I am out of the day-to-day.",
  "A productized engagement that other operators can deliver alongside me.",
  "My partner and our head of ops, aiming for a launch by Q4.",
];

test.describe("Build My Roadmap intake", () => {
  test.beforeEach(async ({ page }) => {
    // Stub every TanStack server function POST so the flow is hermetic.
    await page.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      const isServerFn = url.includes("_serverFn") || url.includes("/api/") === false && req.method() === "POST" && url.includes("intake");
      if (req.method() === "POST" && (url.includes("_serverFn") || isServerFn)) {
        const body = (await req.postData()) ?? "";
        if (body.includes("reflectAnswer") || url.includes("reflectAnswer")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ result: { text: "" }, text: "" }),
          });
        }
        if (body.includes("submitIntake") || url.includes("submitIntake")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ result: { ok: true }, ok: true }),
          });
        }
      }
      return route.continue();
    });

    await page.goto("/build-my-roadmap", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation-duration: 0s !important;
        transition-duration: 0s !important;
      }`,
    });
  });

  test("walks all eight questions, reaches review and confirmation", async ({ page }) => {
    // Begin
    await page.getByRole("button", { name: /^Begin$/ }).click();

    // Capture initial dashoffset on the progress line (drawn blue path)
    const progressPath = page.locator("svg path[stroke='#2563FF']").first();
    const initialOffset = await progressPath.evaluate(
      (el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0,
    );

    for (let i = 0; i < ANSWERS.length; i++) {
      const textarea = page.locator("textarea");
      await expect(textarea).toBeVisible();
      await textarea.fill(ANSWERS[i]);

      // Counter "0X of 08"
      await expect(
        page.getByText(`${String(i + 1).padStart(2, "0")} of 08`, { exact: false }),
      ).toBeVisible();

      const label = i === ANSWERS.length - 1 ? /^Review$/ : /^Next$/;
      await page.getByRole("button", { name: label }).click();
    }

    // Review screen
    await expect(
      page.getByRole("heading", { name: /Read it back/i }),
    ).toBeVisible();

    // Each prior answer should appear verbatim
    for (const a of ANSWERS) {
      await expect(page.getByText(a, { exact: false }).first()).toBeVisible();
    }

    // Progress line has advanced (offset shrunk) and Point B is now opaque
    const finalOffset = await progressPath.evaluate(
      (el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0,
    );
    expect(finalOffset).toBeLessThan(initialOffset);

    const pointBLabel = page.getByText("Point B", { exact: false });
    await expect(pointBLabel).toBeVisible();
    const pointBOpacity = await pointBLabel.evaluate(
      (el) => window.getComputedStyle(el).opacity,
    );
    expect(Number(pointBOpacity)).toBeGreaterThan(0.9);

    // Client-side validation: submit with empty contact fields
    await page.getByRole("button", { name: /^Send it$/ }).click();
    await expect(page.getByText("Please add your name.")).toBeVisible();
    await expect(page.getByText("Please add your email.")).toBeVisible();

    // Fill contact, leave website empty -> consent checkbox should be disabled
    await page.getByLabel(/Your name/i).fill("Jordan Tester");
    await page.getByLabel(/^Email/i).fill("jordan@example.com");
    const consent = page.locator('input[type="checkbox"]');
    await expect(consent).toBeDisabled();

    // Add a website -> consent enables
    await page.getByLabel(/Website/i).fill("https://example.com");
    await expect(consent).toBeEnabled();

    // Submit -> confirmation
    await page.getByRole("button", { name: /^Send it$/ }).click();
    await expect(
      page.getByRole("heading", { name: /We have it, Jordan/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("persists answers across reload before submission", async ({ page }) => {
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await page.locator("textarea").fill(ANSWERS[0]);
    await page.getByRole("button", { name: /^Next$/ }).click();
    await page.locator("textarea").fill(ANSWERS[1]);

    // Reload mid-flow
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Begin$/ }).click();

    // The first question's draft should be restored
    await expect(page.locator("textarea")).toHaveValue(ANSWERS[0]);

    // Advance to question 2 - draft should also persist there
    await page.getByRole("button", { name: /^Next$/ }).click();
    await expect(page.locator("textarea")).toHaveValue(ANSWERS[1]);
  });
});
