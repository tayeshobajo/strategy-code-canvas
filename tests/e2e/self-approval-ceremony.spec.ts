import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Full-UI-path E2E: the original proposer approves their own drafts across
 * three ceremonies — Execution Boundary, Strategic Thesis, and Milestone
 * Qualify. This proves the second-reviewer rule is fully removed everywhere.
 *
 * Required env (all skip cleanly when missing):
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY
 *   LOVABLE_BROWSER_SUPABASE_SESSION_JSON
 *   E2E_PROJECT_ID       — a project whose World Entry is already approved
 *   E2E_MILESTONE_ID     — a milestone in that project ready to qualify
 *   LOVABLE_BROWSER_SUPABASE_COOKIES_JSON (optional, for SSR clients)
 */

const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const COOKIES_JSON = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
const PROJECT_ID = process.env.E2E_PROJECT_ID;
const MILESTONE_ID = process.env.E2E_MILESTONE_ID;

const hasSession = Boolean(STORAGE_KEY && SESSION_JSON);
const hasSeed = Boolean(PROJECT_ID && MILESTONE_ID);

test.describe("Proposer-as-approver ceremony flows", () => {
  test.skip(!hasSession, "No injected Supabase session (LOVABLE_BROWSER_SUPABASE_*).");
  test.skip(!hasSeed, "E2E_PROJECT_ID / E2E_MILESTONE_ID not provided.");

  test.beforeEach(async ({ context, page }) => {
    await restoreSession(context, page);
  });

  test("Execution Boundary: same user proposes and approves", async ({ page }) => {
    await page.goto(`/engine/projects/${PROJECT_ID}/execution-boundary`);
    await page.waitForLoadState("networkidle");

    // Draft — the AI drafter is the fastest way to get a proposable state
    // without asserting on specific capability rows.
    await clickIfEnabled(page, "AI draft");
    await clickIfEnabled(page, "Propose for approval");

    const approve = page.getByRole("button", { name: /^Approve$/ });
    await expect(approve).toBeEnabled({ timeout: 15_000 });
    await approve.click();

    // After approval the status pill flips to Approved. There must NEVER be a
    // "different admin must approve" hint anywhere on the page.
    await expect(page.getByText(/Approved/i).first()).toBeVisible();
    await expect(page.getByText(/different admin|second reviewer|must approve/i)).toHaveCount(0);
  });

  test("Strategic Thesis: same user proposes and approves", async ({ page }) => {
    await page.goto(`/engine/projects/${PROJECT_ID}/strategic-thesis`);
    await page.waitForLoadState("networkidle");

    await clickIfEnabled(page, "AI draft");
    await clickIfEnabled(page, "Propose for approval");

    const approve = page.getByRole("button", { name: /^Approve$/ });
    await expect(approve).toBeEnabled({ timeout: 15_000 });
    await approve.click();

    await expect(page.getByText(/Approved/i).first()).toBeVisible();
    await expect(page.getByText(/different admin|second reviewer|must approve/i)).toHaveCount(0);
  });

  test("Milestone Qualify: same user runs judges and marks qualified", async ({ page }) => {
    await page.goto(
      `/engine/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/qualify`,
    );
    await page.waitForLoadState("networkidle");

    const runJudges = page.getByRole("button", {
      name: /Run World \+ Wow judges|Re-run judges/,
    });
    await expect(runJudges).toBeEnabled({ timeout: 15_000 });
    await runJudges.click();

    const markQualified = page.getByRole("button", { name: /Mark qualified/i });
    await expect(markQualified).toBeEnabled({ timeout: 60_000 });
    await markQualified.click();

    await expect(page.getByText(/^Qualified$/i).first()).toBeVisible();
    await expect(page.getByText(/different admin|second reviewer|must approve/i)).toHaveCount(0);
  });
});

async function restoreSession(context: BrowserContext, page: Page) {
  if (COOKIES_JSON) {
    try {
      const cookies = JSON.parse(COOKIES_JSON) as Array<Record<string, unknown>>;
      for (const c of cookies) c.url = "http://localhost:8080";
      // @ts-expect-error playwright accepts loose cookie shape at runtime
      await context.addCookies(cookies);
    } catch {
      // Ignore malformed cookie env; localStorage path below still works.
    }
  }
  await page.goto("http://localhost:8080");
  if (STORAGE_KEY && SESSION_JSON) {
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [STORAGE_KEY, SESSION_JSON],
    );
  }
}

async function clickIfEnabled(page: Page, label: string) {
  const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
  if ((await btn.count()) === 0) return;
  const first = btn.first();
  if (await first.isDisabled().catch(() => true)) return;
  await first.click();
  // Server round-trips are quick; give React Query a moment to settle.
  await page.waitForTimeout(500);
}
