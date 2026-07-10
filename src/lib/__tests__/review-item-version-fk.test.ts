/**
 * Guard test — Gap G-3: engine_review_items.version_id FK.
 *
 * Before the fix, decideReviewItem matched review items to versions by
 * label text and fell back to `rows[0]` (most recent pending) when the
 * label didn't match. With two co-existing AI drafts, that could approve
 * the wrong version — a silent correctness bug.
 *
 * Now:
 *   - engine_review_items.version_id is a nullable FK to engine_roadmap_versions.
 *   - The AI pipeline populates version_id on insert.
 *   - decideReviewItem requires version_id for official version approval.
 *     Legacy label/most-recent matching is disabled.
 *
 * This test locks all three in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("engine_review_items.version_id — direct link to draft (G-3)", () => {
  it("migration adds version_id column with FK to engine_roadmap_versions", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    const relevant = files
      .map((f) => read(`${dir}/${f}`))
      .filter((contents) => {
        const addsReviewItemVersionFk =
          /ALTER TABLE\s+public\.engine_review_items[\s\S]*?ADD COLUMN[\s\S]*?version_id\s+uuid[\s\S]*?REFERENCES\s+public\.engine_roadmap_versions/i;
        return addsReviewItemVersionFk.test(contents) && /ON DELETE SET NULL/i.test(contents);
      });
    expect(
      relevant.length,
      "expected a migration adding version_id FK on engine_review_items",
    ).toBeGreaterThan(0);
  });

  it("AI pipeline populates version_id when enqueuing the review item", () => {
    const src = read("src/lib/engine-intelligence.functions.ts");
    // Locate the roadmap_version review item insert and confirm it
    // carries version_id: version.id.
    const inserts = src.match(/from\("engine_review_items"\)\s*\.insert\(\{[\s\S]{0,800}?\}\)/g);
    expect(inserts?.length ?? 0).toBeGreaterThan(0);
    const roadmapInsert = (inserts ?? []).find((b) => /item_type:\s*"roadmap_version"/.test(b));
    expect(roadmapInsert, "expected a roadmap_version review-item insert").toBeTruthy();
    expect(roadmapInsert!).toMatch(/version_id:\s*version\.id/);
  });

  it("decideReviewItem requires version_id and never label-matches a version", () => {
    const src = read("src/lib/engine-ops.functions.ts");
    const start = src.indexOf("export const decideReviewItem");
    expect(start).toBeGreaterThan(-1);
    // Scan the handler body (bounded window).
    const body = src.slice(start, start + 8000);
    // Selects version_id from the review row.
    expect(body).toMatch(/from\("engine_review_items"\)[\s\S]*?\.select\("[^"]*version_id[^"]*"\)/);
    // Requires version_id before any version approval side effect.
    expect(body).toMatch(/if\s*\(\s*!it\.version_id\s*\)/);
    // Fetches the exact version by id.
    expect(body).toMatch(/from\("engine_roadmap_versions"\)[\s\S]*?\.eq\("id",\s*it\.version_id\)/);
    // Also scopes the exact version to the review item's resolved project.
    expect(body).toMatch(/\.eq\("project_id",\s*projId\)/);
    // The old legacy fallback must be gone: no label matching and no
    // most-recent pending rows[0] fallback.
    expect(body).not.toMatch(/r\.label\s*\?\?\s*""/);
    expect(body).not.toMatch(/rows\[0\]/);
  });
});
