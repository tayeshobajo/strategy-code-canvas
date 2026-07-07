/**
 * Guard test — Audit New Issue #3: TOCTOU on preExistingPortal.
 *
 * Two concurrent intakes for the same contact email can both observe "no
 * portal exists", then both attempt the insert. Before the fix, the loser's
 * plain insert hit the primary_email UNIQUE constraint and spuriously failed
 * the whole intake; worse, historical upsert variants let BOTH calls mark
 * portalProjectCreated=true, so either rollback could delete the shared
 * portal out from under the other (successful) project.
 *
 * The fix: INSERT ... ON CONFLICT (primary_email) DO NOTHING
 * (ignoreDuplicates) + re-read on conflict, and portalProjectCreated is set
 * ONLY when this call actually created the row.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(process.cwd(), "src/lib/engine-project-intake.functions.ts"),
  "utf8",
);
const start = src.indexOf("export const createProjectFromSource");
const body = src.slice(start);

describe("intake portal creation is race-safe (New Issue #3)", () => {
  it("portal insert is ON CONFLICT DO NOTHING on primary_email", () => {
    expect(body).toMatch(
      /client_portal_projects"\)[\s\S]{0,600}?\.upsert\([\s\S]*?onConflict:\s*"primary_email",\s*ignoreDuplicates:\s*true/,
    );
  });

  it("conflict branch re-reads the winner's portal row by primary_email", () => {
    const upsertIdx = body.indexOf('ignoreDuplicates: true');
    expect(upsertIdx).toBeGreaterThan(-1);
    const after = body.slice(upsertIdx, upsertIdx + 1500);
    expect(after).toMatch(
      /\.from\("client_portal_projects"\)\s*\.select\("id"\)\s*\.eq\("primary_email",\s*resolvedContactEmail\)/,
    );
  });

  it("portalProjectCreated reflects the actual insert, never !preExistingPortal", () => {
    // The rollback-deletion gate must come from the branch that verifiably
    // inserted the row (portalCreatedByThisCall), not the stale pre-check.
    expect(body).toMatch(/portalProjectCreated\s*=\s*portalCreatedByThisCall/);
    expect(body).not.toMatch(/portalProjectCreated\s*=\s*!preExistingPortal/);
  });

  it("re-read failure surfaces as an integrity error, not a silent null portal", () => {
    expect(body).toMatch(/portal insert conflicted but re-read found no row/);
  });
});
