/**
 * Guard test — Pillar 8 portal data leaks (re-audit Remaining Gap #3).
 *
 * getPortalContext shipped full rows to the browser: client_portal_projects
 * via select("*") (owner_email, five Stripe identifiers, intake_submission_id,
 * approved_roadmap_id, metadata, access_revoked_at), plus full-row
 * onboarding and billing. The roadmap projection included supporting_notes
 * against the getPortalRoadmapDocs doctrine comment, lacked a published_at
 * gate at the query layer, and submitPortalOnboarding returned the
 * engine-internal engineSourceId to the client caller.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/lib/portal.functions.ts"), "utf8");
const routeSrc = readFileSync(resolve(process.cwd(), "src/routes/portal.roadmap.tsx"), "utf8");

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

  it("roadmap filter is narrowed to the single 'published' status (Phase 3 v4)", () => {
    // Portal must ONLY see the single live published snapshot per project.
    // Legacy 'approved' / 'delivered' reads would leak superseded or
    // pre-publish rows after Phase 3 v4 backfill.
    expect(ctx).toMatch(/\.eq\("status",\s*"published"\)/);
    expect(ctx).not.toMatch(/\.in\("status",\s*\["approved",\s*"delivered"\]\)/);
    expect(ctx).toMatch(/\.not\("published_at",\s*"is",\s*null\)/);
  });
});

describe("getPortalRoadmapDocs (Phase 3 v4 narrowing)", () => {
  const docsStart = src.indexOf("export const getPortalRoadmapDocs");
  const docsEnd = src.indexOf("createServerFn", docsStart + 100);
  const docs = src.slice(docsStart, docsEnd === -1 ? undefined : docsEnd);

  it("handler body was located", () => {
    expect(docsStart).toBeGreaterThan(-1);
  });

  it("only reads 'published' rows and requires published_at", () => {
    expect(docs).toMatch(/\.eq\("status",\s*"published"\)/);
    expect(docs).not.toMatch(/\.in\("status",\s*\["approved",\s*"delivered"\]\)/);
    expect(docs).toMatch(/\.not\("published_at",\s*"is",\s*null\)/);
  });
});

describe("getPortalRoadmapContextOptions (Phase 3 v4 narrowing)", () => {
  const start = src.indexOf("export const getPortalRoadmapContextOptions");
  const end = src.indexOf("createServerFn", start + 100);
  const body = src.slice(start, end === -1 ? undefined : end);

  it("only reads the live 'published' snapshot", () => {
    expect(start).toBeGreaterThan(-1);
    expect(body).toMatch(/\.eq\("status",\s*"published"\)/);
    expect(body).not.toMatch(/\.in\("status",\s*\["approved",\s*"delivered"\]\)/);
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

describe("portal roadmap route guard", () => {
  it("redirects away when no published roadmap exists", () => {
    expect(routeSrc).toMatch(/loader:\s*async\s*\(\)\s*=>\s*\{/);
    expect(routeSrc).toMatch(/const data = await getPortalRoadmapDocs\(\)/);
    expect(routeSrc).toMatch(/if \(data\.docs\.length === 0\)\s*\{\s*throw redirect\(\{ to: "\/portal\/home" \}\);/);
  });
});
