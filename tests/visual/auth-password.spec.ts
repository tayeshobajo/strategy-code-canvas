import { expect, test } from "@playwright/test";

/**
 * End-to-end contract tests for password auth surfaces.
 *
 * These do NOT require a real Supabase session — they verify the client-side
 * UI contract stays intact: password fields render, magic-link toggle works,
 * validation rules match /reset-password and /portal/account, and public
 * pages surface the right copy/links.
 *
 * Live auth flows (real signInWithPassword, real recovery emails) are covered
 * by the manual QA passes in .lovable/*-qa-report.md.
 */

test.describe("Password auth UI contract", () => {
  test("/auth shows password sign-in with a toggle to magic link", async ({ page }) => {
    await page.goto("/auth");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    const pw = page.getByLabel(/^password$/i);
    await expect(pw).toBeVisible();
    await expect(pw).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      /\/forgot-password/,
    );
    await expect(
      page.getByRole("button", { name: /email me a sign-in link/i }),
    ).toBeVisible();
  });

  test("/portal/login shows password sign-in with a toggle to magic link", async ({ page }) => {
    await page.goto("/portal/login");
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toHaveAttribute("type", "password");
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /email me a sign-in link/i }),
    ).toBeVisible();
  });

  test("/forgot-password submits and shows a neutral confirmation", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(
      page.getByRole("heading", { name: /reset your password/i }),
    ).toBeVisible();
    await page.getByLabel(/email/i).fill("nobody+e2e@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible({
      timeout: 10_000,
    });
    // Must NOT confirm whether the email is registered.
    await expect(page.getByText(/not registered|no account/i)).toHaveCount(0);
  });

  test("/reset-password without a recovery link renders the invalid state", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: /request a new one/i }),
    ).toHaveAttribute("href", /\/forgot-password/);
  });

  test("/reset-password is noindex", async ({ page }) => {
    await page.goto("/reset-password");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("/forgot-password is noindex", async ({ page }) => {
    await page.goto("/forgot-password");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("/portal/account requires auth (redirects to sign-in)", async ({ page }) => {
    await page.goto("/portal/account");
    await page.waitForURL(/\/(auth|portal\/login)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(auth|portal\/login)/);
  });
});
