import { test, expect, type Route } from "@playwright/test";

/**
 * Build My Roadmap intake — behavioral coverage.
 *
 * Verifies:
 *  - Required (4) vs optional (4) question gating: muted "optional" label,
 *    Skip ↔ Continue toggle, progress line only tracks required answers.
 *  - Final submit posts to submitIntake server fn and renders the
 *    personalized confirmation screen.
 *  - ?draft=<uuid> hydrates the intake from loadDraft and resumes at q1
 *    with prior responses pre-filled.
 *
 * All server fns are stubbed so the test never touches Anthropic or the DB.
 */

const REQUIRED_INDICES = [0, 2, 5, 7]; // current_state, the_weight, point_b, practical
const OPTIONAL_INDICES = [1, 3, 4, 6]; // why_now, what_didnt_hold, unbuilt_asset, point_c
const REQUIRED_TEXT = "Required answer body, written with care.";

type StubCounts = {
  reflect: number;
  save: number;
  load: number;
  submit: number;
  lastSubmitBody: string | null;
};

async function installServerFnStubs(
  route: Route,
  counts: StubCounts,
  draftPayload?: { answers: Array<{ key: string; question: string; response: string; reflected_offered: string | null }>; contact: Record<string, string> },
) {
  const req = route.request();
  if (req.method() !== "POST") return route.continue();
  const url = req.url();
  // TanStack server fn calls go through /_serverFn/ or query include the fn name.
  // The function identifier appears in the URL or the post body; match either.
  const body = (await req.postData()) ?? "";
  const tag = (name: string) => url.includes(name) || body.includes(name);

  if (tag("reflectAnswer")) {
    counts.reflect += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { text: "" }, text: "" }),
    });
  }
  if (tag("saveDraft")) {
    counts.save += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: { resume_token: "11111111-1111-4111-8111-111111111111" },
        resume_token: "11111111-1111-4111-8111-111111111111",
      }),
    });
  }
  if (tag("loadDraft")) {
    counts.load += 1;
    const found = !!draftPayload;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: found
          ? { found: true, answers: draftPayload!.answers, contact: draftPayload!.contact }
          : { found: false, answers: [], contact: {} },
      }),
    });
  }
  if (tag("submitIntake")) {
    counts.submit += 1;
    counts.lastSubmitBody = body;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { ok: true }, ok: true }),
    });
  }
  return route.continue();
}

test.describe("Build My Roadmap intake", () => {
  test("required gating, skip/continue toggle, progress, and submit", async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try { window.localStorage.clear(); } catch { /* noop */ }
    });

    const counts: StubCounts = { reflect: 0, save: 0, load: 0, submit: 0, lastSubmitBody: null };
    await page.route("**/*", (route) => installServerFnStubs(route, counts));

    await page.goto("/build-my-roadmap", { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`,
    });

    // Open the write door first; the intake panel mounts only when open.
    await page.getByRole("button", { name: /Leave a Roadmap note/i }).click();
    await page.getByRole("button", { name: /^Begin$/ }).click();

    const progressPath = page.locator("svg path[stroke='#2563FF']").first();
    const initialOffset = await progressPath.evaluate(
      (el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0,
    );

    // Walk q0..q7. Required (0,2,5,7): must show "Continue", fill required text.
    // Optional (1,3,4,6): show "optional" label, button starts as "Skip", we skip them.
    for (let i = 0; i < 8; i++) {
      const isOptional = OPTIONAL_INDICES.includes(i);
      const isLast = i === 7;
      await expect(page.getByText(`${String(i + 1).padStart(2, "0")} of 08`)).toBeVisible();

      const optionalLabel = page.locator('span', { hasText: /^optional$/ });
      if (isOptional) {
        await expect(optionalLabel.first()).toBeVisible();
        // Empty optional → Skip
        await expect(page.getByRole("button", { name: /^Skip$/ })).toBeVisible();
      } else {
        await expect(optionalLabel).toHaveCount(0);
        // Required + empty → Continue disabled
        const continueBtn = page.getByRole("button", { name: isLast ? /^Review$/ : /^Continue$/ });
        await expect(continueBtn).toBeDisabled();
        await page.locator("textarea").fill(REQUIRED_TEXT);
        await expect(continueBtn).toBeEnabled();
      }

      // After typing into an optional q the button must flip Skip → Continue.
      if (i === 1) {
        await page.locator("textarea").fill("some optional content");
        await expect(page.getByRole("button", { name: /^Continue$/ })).toBeVisible();
        // Clear it back to empty → Skip returns
        await page.locator("textarea").fill("");
        await expect(page.getByRole("button", { name: /^Skip$/ })).toBeVisible();
      }

      const nextLabel = isLast ? /^Review$/ : isOptional ? /^Skip$/ : /^Continue$/;
      await page.getByRole("button", { name: nextLabel }).click();
    }

    // Progress: 4 required answered → line advanced to Point B.
    const finalOffset = await progressPath.evaluate(
      (el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0,
    );
    expect(finalOffset).toBeLessThan(initialOffset);
    expect(finalOffset).toBeLessThanOrEqual(0.5); // fully drawn (dasharray 1)

    // Review screen
    await expect(page.getByRole("heading", { name: /Read it back/i })).toBeVisible();
    // Required answers visible; optional q (skipped) shows "(nothing yet)"
    await expect(page.getByText(REQUIRED_TEXT).first()).toBeVisible();
    await expect(page.getByText(/\(nothing yet\)/).first()).toBeVisible();

    // Fill contact + website + consent and submit
    await page.getByLabel(/Your name/i).fill("Jordan Tester");
    await page.getByLabel(/^Email/i).fill("jordan@example.com");
    const consent = page.locator('input[type="checkbox"]');
    await expect(consent).toBeDisabled();
    await page.getByLabel(/Website/i).fill("https://example.com");
    await expect(consent).toBeEnabled();

    await page.getByRole("button", { name: /^Send it$/ }).click();

    await expect(page.getByRole("heading", { name: /We have it, Jordan/i })).toBeVisible({
      timeout: 10_000,
    });

    expect(counts.submit).toBe(1);
    expect(counts.lastSubmitBody).toContain("jordan@example.com");
    // Only the 4 required answers should be in the payload (optional skipped).
    const payload = JSON.parse(counts.lastSubmitBody!);
    const answers = payload?.data?.answers ?? payload?.answers ?? [];
    expect(Array.isArray(answers)).toBe(true);
    expect(answers.length).toBe(4);
  });

  test("hydrates from ?draft=<uuid> via loadDraft", async ({ page, context }) => {
    await context.clearCookies();
    const TOKEN = "22222222-2222-4222-8222-222222222222";
    const draftPayload = {
      answers: [
        { key: "current_state", question: "q1", response: "Hydrated current state answer.", reflected_offered: null },
        { key: "the_weight", question: "q3", response: "Hydrated weight answer.", reflected_offered: null },
      ],
      contact: { name: "Resumed Founder", business: "", website: "", email: "resumed@example.com" },
    };

    const counts: StubCounts = { reflect: 0, save: 0, load: 0, submit: 0, lastSubmitBody: null };
    await page.route("**/*", (route) => installServerFnStubs(route, counts, draftPayload));

    await page.goto(`/build-my-roadmap?draft=${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({
      content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }`,
    });

    // loadDraft jumps to step 0 with prior response prefilled.
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await expect(textarea).toHaveValue("Hydrated current state answer.");
    expect(counts.load).toBeGreaterThanOrEqual(1);

    // URL retains the draft token.
    expect(new URL(page.url()).searchParams.get("draft")).toBe(TOKEN);

    // Skip optional q2, q3 is the_weight (required) and should already be filled.
    await page.getByRole("button", { name: /^Continue$/ }).click(); // q0 already has text
    // q1 (optional) - empty by default → Skip
    await page.getByRole("button", { name: /^Skip$/ }).click();
    // q2 (required: the_weight) prefilled
    await expect(textarea).toHaveValue("Hydrated weight answer.");
  });
});
