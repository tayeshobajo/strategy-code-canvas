/**
 * Guard test — Publish integrity (Gap G-0).
 *
 * The audit flagged a possible mismatch where publishVersionToPortal inserted
 * `approved_roadmap_version_id` while RLS/trigger expected `source_version_id`.
 *
 * Live-database verification (2026-07-05) confirmed:
 *   - client_portal_roadmaps has ONLY `approved_roadmap_version_id` (uuid, nullable).
 *     `source_version_id` was renamed → `approved_roadmap_version_id` in migration
 *     20260704222007_38254c65-2755-4b0a-8082-c71d189ace90.sql.
 *   - RLS policy "Clients read approved roadmaps" gates on
 *     `approved_roadmap_version_id IS NOT NULL` AND status IN (approved, delivered)
 *     AND approved_at IS NOT NULL.
 *   - Trigger tg_client_portal_roadmaps_require_source_version enforces
 *     NEW.approved_roadmap_version_id IS NOT NULL and rejects ai_generated versions.
 *   - engine-ops.publishVersionToPortal + engine-execution.sendProjectDelivery
 *     both insert `approved_roadmap_version_id: <ver.id>`.
 *   - getPortalRoadmapDocs filters by status; RLS handles the version-id gate.
 *
 * This test locks that consistency in so a future rename or a stray
 * `source_version_id` reference fails CI before it can hide client roadmaps.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("publish integrity — approved_roadmap_version_id is the canonical column", () => {
  it("publishVersionToPortal inserts approved_roadmap_version_id, not source_version_id", () => {
    const src = read("src/lib/engine-ops.functions.ts");
    const start = src.indexOf("publishVersionToPortal");
    expect(start).toBeGreaterThan(-1);
    const window = src.slice(start, start + 8000);
    expect(window).toMatch(/from\("client_portal_roadmaps"\)\s*\.insert\(\{[\s\S]*?approved_roadmap_version_id\s*:/);
    expect(window).not.toMatch(/source_version_id\s*:/);
  });

  it("sendProjectDelivery inserts approved_roadmap_version_id, not source_version_id", () => {
    const src = read("src/lib/engine-execution.functions.ts");
    const start = src.indexOf("sendProjectDelivery");
    expect(start).toBeGreaterThan(-1);
    const window = src.slice(start, start + 8000);
    expect(window).toMatch(/approved_roadmap_version_id\s*:/);
    expect(window).not.toMatch(/\bsource_version_id\s*:/);
  });

  it("no live source file references the legacy source_version_id column name", () => {
    // Migrations that historically created/renamed the column are exempt;
    // only current app source is scanned.
    const files = [
      "src/lib/portal.functions.ts",
      "src/lib/engine-ops.functions.ts",
      "src/lib/engine-execution.functions.ts",
      "src/lib/engine-intelligence.functions.ts",
      "src/lib/engine-project-intake.functions.ts",
      "src/lib/roadmap-publish.ts",
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, `${f} references legacy source_version_id`).not.toMatch(/\bsource_version_id\b/);
    }
  });

  it("the latest publish-guard migration keys off approved_roadmap_version_id and blocks ai_generated", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    // Find the most recent migration mentioning the trigger.
    const triggerFiles = files.filter((f) =>
      read(`${dir}/${f}`).includes("tg_client_portal_roadmaps_require_source_version"),
    );
    expect(triggerFiles.length, "expected at least one migration defining the publish-guard trigger").toBeGreaterThan(0);
    const latest = triggerFiles[triggerFiles.length - 1];
    const contents = read(`${dir}/${latest}`);
    expect(contents).toMatch(/approved_roadmap_version_id/);
    expect(contents).toMatch(/ai_generated/);
    // The winning trigger must NOT re-introduce the legacy column reference.
    expect(contents).not.toMatch(/NEW\.source_version_id/);
  });
});
