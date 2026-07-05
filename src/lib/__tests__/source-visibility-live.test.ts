/**
 * Live-DB guard — Gap G-3: prove the DB default and NOT NULL on
 * `engine_sources.visibility` are authoritative, independent of the
 * app-level explicit `visibility: 'internal_only'`. If a future
 * refactor removes the explicit line, the DB must still refuse to
 * store anything else by default.
 *
 * Runs only when psql + PG* env vars are wired into the sandbox
 * (managed Supabase DB access). Skips cleanly otherwise so CI on
 * plain workstations doesn't red-flag on infra it doesn't have.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const HAS_PG = !!process.env.PGHOST;

function psql(sql: string): string {
  // Pipe SQL via stdin so multiline queries and quoting are preserved.
  return execSync(`psql -tAX -v ON_ERROR_STOP=1`, {
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

}


describe.skipIf(!HAS_PG)("engine_sources.visibility live-DB defense (G-3)", () => {
  it("inserting a source without visibility yields visibility='internal_only'", { timeout: 30000 }, () => {
    // Need a real engine_project row to satisfy the FK.
    const projectId = psql(
      `SELECT id FROM public.engine_projects ORDER BY created_at DESC LIMIT 1`,
    );
    if (!projectId) {
      // No projects to piggyback on — that's fine, the DB default check below
      // still runs via information_schema.
      const def = psql(
        `SELECT column_default FROM information_schema.columns
           WHERE table_schema='public' AND table_name='engine_sources'
             AND column_name='visibility'`,
      );
      expect(def).toMatch(/internal_only/);
      const nn = psql(
        `SELECT is_nullable FROM information_schema.columns
           WHERE table_schema='public' AND table_name='engine_sources'
             AND column_name='visibility'`,
      );
      expect(nn).toBe("NO");
      return;
    }

    const marker = `g3-visibility-test-${randomUUID()}`;
    try {
      // Insert WITHOUT visibility. The DB default must fill it.
      const inserted = psql(
        `INSERT INTO public.engine_sources
           (project_id, name, type, status, created_by_email)
         VALUES
           ('${projectId}', '${marker}', 'research_note', 'queued', 'g3-test@trust-tai.com')
         RETURNING visibility`,
      );
      expect(inserted.split("\n")[0]).toBe("internal_only");

      // Explicit NULL must be rejected.
      let rejected = false;
      try {
        psql(
          `INSERT INTO public.engine_sources
             (project_id, name, type, status, visibility, created_by_email)
           VALUES
             ('${projectId}', '${marker}-null', 'research_note', 'queued', NULL, 'g3-test@trust-tai.com')`,
        );
      } catch {
        rejected = true;
      }
      expect(rejected, "engine_sources.visibility NULL insert should have been rejected").toBe(true);
    } finally {
      // Cleanup — psql exec-mode has INSERT and DELETE would need migration; use
      // a marker prefix so operators can grep and remove if the cleanup path is
      // ever restricted. Best-effort cleanup:
      try {
        psql(`DELETE FROM public.engine_sources WHERE name LIKE '${marker}%'`);
      } catch {
        /* delete may not be permitted in this env — leave the marker for manual cleanup */
      }
    }
  });

  it("engine_sources column metadata: visibility is NOT NULL with default 'internal_only'", () => {
    const row = psql(
      `SELECT is_nullable || '|' || column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='engine_sources'
          AND column_name='visibility'`,
    );
    expect(row.startsWith("NO|")).toBe(true);
    expect(row).toMatch(/internal_only/);
  });
});
