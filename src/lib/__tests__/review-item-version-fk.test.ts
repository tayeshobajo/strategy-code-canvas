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
 *   - decideReviewItem prefers version_id; the label fallback only runs
 *     for legacy rows where version_id IS NULL.
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
    const relevant = files.filter((f) => {
      const c = read(`${dir}/${f}`);
      return (
        /engine_review_items/.test(c) &&
        /version_id/.test(c) &&
        /engine_roadmap_versions/.test(c)
      );
    });
    expect(
      relevant.length,
      "expected a migration adding version_id FK on engine_review_items",
    ).toBeGreaterThan(0);
    const latest = relevant[relevant.length - 1];
    const contents = read(`${dir}/${latest}`);
    expect(contents).toMatch(
      /ADD COLUMN[\s\S]*?version_id\s+uuid[\s\S]*?REFERENCES\s+public\.engine_roadmap_versions/i,
    );
    expect(contents).toMatch(/ON DELETE SET NULL/i);
  });

  it("AI pipeline populates version_id when enqueuing the review item", () => {
    const src = read("src/lib/engine-intelligence.functions.ts");
    // Locate the roadmap_version review item insert and confirm it
    // carries version_id: version.id.
    const inserts = src.match(
      /from\("engine_review_items"\)\s*\.insert\(\{[\s\S]{0,800}?\}\)/g,
    );
    expect(inserts?.length ?? 0).toBeGreaterThan(0);
    const roadmapInsert = (inserts ?? []).find((b) =>
      /item_type:\s*"roadmap_version"/.test(b),
    );
    expect(roadmapInsert, "expected a roadmap_version review-item insert").toBeTruthy();
    expect(roadmapInsert!).toMatch(/version_id:\s*version\.id/);
  });

  it("decideReviewItem reads version_id and prefers it over label matching", () => {
    const src = read("src/lib/engine-ops.functions.ts");
    const start = src.indexOf("export const decideReviewItem");
    expect(start).toBeGreaterThan(-1);
    // Scan the handler body (bounded window).
    const body = src.slice(start, start + 8000);
    // Selects version_id from the review row.
    expect(body).toMatch(
      /from\("engine_review_items"\)[\s\S]*?\.select\("[^"]*version_id[^"]*"\)/,
    );
    // Branches on version_id before the label fallback.
    expect(body).toMatch(/if\s*\(\s*it\.version_id\s*\)/);
    // Fetches the exact version by id.
    expect(body).toMatch(
      /from\("engine_roadmap_versions"\)[\s\S]*?\.eq\("id",\s*it\.version_id\)/,
    );
    // Legacy label fallback still exists but is guarded (in the else branch).
    const ifIdx = body.indexOf("if ( it.version_id".replace(/\s+/g, ""));
    const orAlt = body.search(/if\s*\(\s*it\.version_id\s*\)/);
    const elseIdx = body.indexOf("} else {", orAlt);
    const labelIdx = body.indexOf('r.label ?? ""', elseIdx);
    expect(elseIdx, "expected an else branch for the legacy fallback").toBeGreaterThan(-1);
    expect(labelIdx, "expected label fallback to live inside the else branch").toBeGreaterThan(elseIdx);
    // Direct rows[0] fallback must NOT run when version_id is set.
    const outsideElse = body.slice(orAlt, elseIdx);
    expect(outsideElse).not.toMatch(/rows\[0\]/);
  });
});
