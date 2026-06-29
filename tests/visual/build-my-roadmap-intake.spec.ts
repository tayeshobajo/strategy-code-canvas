import { test, expect, type Route } from "@playwright/test";

/**
 * Build My Roadmap intake — behavioral coverage.
 *
 *  - Required (4) vs optional (4) gating, Skip ↔ Continue toggle, optional label.
 *  - Progress polyline only counts required answers.
 *  - Final submit calls submitIntake and renders the confirmation screen.
 *  - ?draft=<uuid> hydrates via loadDraft.
 *
 * Stubs every TanStack server fn at the `/_serverFn/<base64>` endpoint so the
 * test does not hit Anthropic or the database.
 */

const OPTIONAL_INDICES = [1, 3, 4, 6];
const REQUIRED_TEXT = "Required answer body, written with care.";

type Counts = { reflect: number; save: number; load: number; submit: number; lastSubmitBody: string | null };

function decodeFnName(url: string): string | null {
  const m = url.match(/\/_serverFn\/([^/?#]+)/);
  if (!m) return null;
  try {
    const decoded = Buffer.from(m[1], "base64").toString("utf-8");
    const json = JSON.parse(decoded) as { export?: string };
    return json.export ?? null;
  } catch { return null; }
}

// TanStack server fns expect responses shaped as { result, context } so the
// client middleware can unwrap `result`. Plain JSON works without the
// `x-tss-serialized` header because our payloads only contain primitives.
function envelope(result: unknown): string {
  return JSON.stringify({ result, context: {} });
}

function stubFor(
  counts: Counts,
  draftPayload?: { answers: Array<{ key: string; question: string; response: string; reflected_offered: string | null }>; contact: Record<string, string> },
) {
  return async (route: Route) => {
    const req = route.request();
    if (!req.url().includes("/_serverFn/")) return route.continue();
    const name = decodeFnName(req.url()) ?? "";
    const body = (await req.postData()) ?? "";
    if (name.startsWith("reflectAnswer")) {
      counts.reflect++;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ text: "" }) });
    }
    if (name.startsWith("saveDraft")) {
      counts.save++;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ resume_token: "11111111-1111-4111-8111-111111111111" }) });
    }
    if (name.startsWith("loadDraft")) {
      counts.load++;
      const payload = draftPayload
        ? { found: true, answers: draftPayload.answers, contact: draftPayload.contact }
        : { found: false, answers: [], contact: {} };
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(payload) });
    }
    if (name.startsWith("submitIntake")) {
      counts.submit++;
      counts.lastSubmitBody = body;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ok: true }) });
    }
    return route.continue();
  };
}

test.describe("Build My Roadmap intake", () => {
  test("required gating, skip/continue toggle, progress, and submit", async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => { try { window.localStorage.clear(); } catch { /* noop */ } });

    const counts: Counts = { reflect: 0, save: 0, load: 0, submit: 0, lastSubmitBody: null };
    await page.route("**/_serverFn/**", stubFor(counts));

    await page.goto("/build-my-roadmap", { waitUntil: "networkidle" });
    await page.addStyleTag({ content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }` });

    const writeDoor = page.getByRole("button", { name: /Leave a Roadmap note/i });
    await expect(writeDoor).toBeVisible();
    // Retry the click until React has hydrated and the intro panel renders.
    await expect(async () => {
      await writeDoor.click();
      await expect(page.getByRole("button", { name: /^Begin$/ })).toBeVisible({ timeout: 750 });
    }).toPass({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Begin$/ }).click();

    const progressPath = page.locator("svg path[stroke='#2563FF']").first();
    const initialOffset = await progressPath.evaluate((el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0);

    for (let i = 0; i < 8; i++) {
      const isOptional = OPTIONAL_INDICES.includes(i);
      const isLast = i === 7;
      await expect(page.getByText(`${String(i + 1).padStart(2, "0")} of 08`)).toBeVisible();

      if (isOptional) {
        await expect(page.locator("span", { hasText: /^optional$/ }).first()).toBeVisible();
        await expect(page.getByRole("button", { name: /^Skip$/ })).toBeVisible();
        if (i === 1) {
          await page.locator("textarea").fill("some optional content");
          await expect(page.getByRole("button", { name: /^Continue$/ })).toBeVisible();
          await page.locator("textarea").fill("");
          await expect(page.getByRole("button", { name: /^Skip$/ })).toBeVisible();
        }
      } else {
        await expect(page.locator("span", { hasText: /^optional$/ })).toHaveCount(0);
        const btn = page.getByRole("button", { name: isLast ? /^Review$/ : /^Continue$/ });
        await expect(btn).toBeDisabled();
        await page.locator("textarea").fill(REQUIRED_TEXT);
        await expect(btn).toBeEnabled();
      }

      const nextLabel = isLast ? /^Review$/ : isOptional ? /^Skip$/ : /^Continue$/;
      await page.getByRole("button", { name: nextLabel }).click();
    }

    const finalOffset = await progressPath.evaluate((el) => Number((el as SVGPathElement).getAttribute("stroke-dashoffset")) || 0);
    expect(finalOffset).toBeLessThan(initialOffset);

    await expect(page.getByRole("heading", { name: /Read it back/i })).toBeVisible();
    await expect(page.getByText(REQUIRED_TEXT).first()).toBeVisible();
    await expect(page.getByText(/\(nothing yet\)/).first()).toBeVisible();

    await page.getByLabel(/Your name/i).fill("Jordan Tester");
    await page.getByLabel(/^Email/i).fill("jordan@example.com");
    const consent = page.locator('input[type="checkbox"]');
    await expect(consent).toBeDisabled();
    await page.getByLabel(/Website/i).fill("https://example.com");
    await expect(consent).toBeEnabled();

    await page.getByRole("button", { name: /^Send it$/ }).click();
    await expect(page.getByRole("heading", { name: /We have it, Jordan/i })).toBeVisible({ timeout: 10_000 });

    expect(counts.submit).toBe(1);
    const submitted = JSON.parse(counts.lastSubmitBody!);
    const submittedData = Array.isArray(submitted) ? submitted[0]?.data : submitted?.data ?? submitted;
    const answers = submittedData?.answers ?? [];
    expect(answers.length).toBe(4);
    expect(submittedData?.email).toBe("jordan@example.com");
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

    const counts: Counts = { reflect: 0, save: 0, load: 0, submit: 0, lastSubmitBody: null };
    await page.route("**/_serverFn/**", stubFor(counts, draftPayload));

    await page.goto(`/build-my-roadmap?draft=${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: `*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }` });

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 8_000 });
    await expect(textarea).toHaveValue("Hydrated current state answer.");
    expect(counts.load).toBeGreaterThanOrEqual(1);
    expect(new URL(page.url()).searchParams.get("draft")).toBe(TOKEN);

    await page.getByRole("button", { name: /^Continue$/ }).click();
    await expect(textarea).toHaveValue("");
    await page.getByRole("button", { name: /^Skip$/ }).click();
    await expect(textarea).toHaveValue("Hydrated weight answer.");
  });
});
