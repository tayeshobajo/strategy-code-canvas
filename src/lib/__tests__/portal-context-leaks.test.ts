/**
 * Guard test — Pillar 8 portal data leaks (re-audit Remaining Gap #3).
 *
 * getPortalContext shipped full rows to the browser: client_portal_projects
 * via select("*") (owner_email, five Stripe identifiers, intake_submission_id,
 * approved_roadmap_id, metadata, access_revoked_at), plus full-row
 * onboarding and billing. The roadmap projection included supporting_notes
 * against the getPortalRoadmapDocs doctrine comment, filtered on approved_at
 * (letting archived rows resurface), and submitPortalOnboarding returned the
 * engine-internal engineSourceId to the client caller.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/lib/portal.functions.ts"), "utf8");

const ctxStart = src.indexOf("export const getPortalContext");
const ctxEnd = src.indexOf("createServerFn", ctxStart + 100);
const ctx = src.slice(ctxStart, ctxEnd);

describe("getPortalContext projections (Pillar 8)", () => {
  it("handler body was located", () => {
    expect(ctxStart).toBeGreaterThan(-1);
  });

  it("never selects * from any client-visible table", () => {
    expect(ctx).not.toMatch(/\.select\("\*"\)/);
  });

  it("project projection carries no internal columns", () => {
    const sel = ctx.match(/from\("client_portal_projects"\)\s*\.select\(\s*"([^"]+)"/);
    expect(sel, "expected explicit projects projection").toBeTruthy();
    const cols = sel![1].split(",").map((c) => c.trim());
    for (const banned of [
      "owner_email",
      "stripe_checkout_session_id",
      "stripe_customer_id",
      "stripe_invoice_id",
      "stripe_payment_intent_id",
      "stripe_subscription_id",
      "intake_submission_id",
      "approved_roadmap_id",
      "metadata",
    ]) {
      expect(cols, `projects projection must not include ${banned}`).not.toContain(banned);
    }
    // Columns the portal UI actually renders must stay.
    for (const needed of ["id", "portal_status", "package_name", "purchased_package"]) {
      expect(cols, `projects projection must include ${needed}`).toContain(needed);
    }
  });

  it("onboarding projection is status-level only (no answer payloads)", () => {
    const sel = ctx.match(/from\("client_portal_onboarding"\)\s*\.select\(\s*"([^"]+)"/);
    expect(sel, "expected explicit onboarding projection").toBeTruthy();
    const cols = sel![1].split(",").map((c) => c.trim());
    for (const banned of [
      "business_basics",
      "current_state",
      "goals_priorities",
      "assets_docs",
      "review_submit",
    ]) {
      expect(cols, `onboarding projection must not include ${banned}`).not.toContain(banned);
    }
  });

  it("billing projection carries no Stripe identifiers or metadata", () => {
    const sel = ctx.match(/from\("client_portal_billing"\)\s*\.select\(\s*"([^"]+)"/);
    expect(sel, "expected explicit billing projection").toBeTruthy();
    const cols = sel![1].split(",").map((c) => c.trim());
    for (const banned of [
      "stripe_checkout_session_id",
      "stripe_customer_id",
      "stripe_invoice_id",
      "stripe_payment_intent_id",
      "metadata",
    ]) {
      expect(cols, `billing projection must not include ${banned}`).not.toContain(banned);
    }
  });

  it("roadmap projection excludes supporting_notes (doctrine: internal-engine column)", () => {
    const sel = ctx.match(/from\("client_portal_roadmaps"\)[\s\S]*?\.select\(\s*"([^"]+)"/);
    expect(sel, "expected explicit roadmaps projection").toBeTruthy();
    const cols = sel![1].split(",").map((c) => c.trim());
    expect(cols).not.toContain("supporting_notes");
    expect(cols).not.toContain("published_by");
    expect(cols).not.toContain("acknowledged_by_email");
    expect(cols).not.toContain("approved_roadmap_version_id");
    expect(cols).not.toContain("metadata");
  });

  it("roadmap filter is status-based, not approved_at-based", () => {
    expect(ctx).toMatch(/\.in\("status",\s*\["approved",\s*"delivered"\]\)/);
    expect(ctx).not.toMatch(/\.not\("approved_at",\s*"is",\s*null\)/);
  });
});

describe("submitPortalOnboarding return surface", () => {
  it("does not return engineSourceId to the client caller", () => {
    const start = src.indexOf("export const submitPortalOnboarding");
    const end = src.indexOf("createServerFn", start + 100);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/return\s*\{[^}]*engineSourceId/);
  });
});
