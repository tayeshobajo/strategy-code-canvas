/**
 * Regression test — Phase 11 architectural fix.
 *
 * The adaptive intake had a split-brain bug: `saveDraft` wrote drafts to the
 * MAIN Supabase project via `supabaseAdmin`, but the classifier, question
 * generator, scorer, and reflection handlers gated on `intake_drafts` reads
 * through `getIntakeClient()` — a different Supabase project. Every real
 * session was silently rejected as "Invalid intake session", collapsing the
 * flow back to the heuristic fallback.
 *
 * This test locks in the single source of truth: every handler that touches
 * an `intake_drafts` resume_token MUST read through `supabaseAdmin`. If any
 * of these files re-introduces `getIntakeClient()` for a draft lookup, the
 * test fails and the split-brain returns.
 *
 * Submissions and reviews (`intake_submissions`, `roadmap_intake_reviews`,
 * `review_audit_log`, `roadmap_drafts`) remain in the dedicated intake
 * project by design — the operator review UI and audit tables live there.
 * That split is deliberate and documented at the top of
 * `src/integrations/intake/client.server.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const DRAFT_HANDLER_FILES = [
  "src/lib/intake.functions.ts", // reflectAnswer
  "src/lib/intake-classify.functions.ts",
  "src/lib/intake-question.functions.ts",
  "src/lib/intake-score.functions.ts",
] as const;

describe("intake session state has a single source of truth", () => {
  for (const file of DRAFT_HANDLER_FILES) {
    describe(file, () => {
      const src = read(file);

      it("does not use getIntakeClient() for intake_drafts lookups", () => {
        // Find every getIntakeClient() call site and confirm none of them
        // reach into intake_drafts within a 400-char window (covers
        // await ... .from("intake_drafts") ... patterns).
        const regex = /getIntakeClient\(\)[\s\S]{0,400}intake_drafts/g;
        const matches = src.match(regex) ?? [];
        expect(matches, `getIntakeClient() reads intake_drafts in ${file}`).toEqual([]);
      });

      it("gates draft lookups through supabaseAdmin (main DB)", () => {
        // Every draft-gated handler must load supabaseAdmin (top-level or
        // dynamic import) and read intake_drafts through it.
        expect(src).toMatch(/["']@\/integrations\/supabase\/client\.server["']/);
        expect(src).toMatch(/supabaseAdmin\.from\(["']intake_drafts["']\)/);
      });
    });
  }

  it("the shared intake client is marked as forbidden for draft reads", () => {
    const src = read("src/integrations/intake/client.server.ts");
    expect(src).toMatch(/SINGLE SOURCE OF TRUTH FOR INTAKE SESSION STATE/i);
    expect(src).toMatch(/intake_drafts.*MUST NOT be read through this client/);
  });

  it("saveDraft still writes drafts through supabaseAdmin (the write side of the contract)", () => {
    const src = read("src/lib/intake.functions.ts");
    // saveDraft's upsert/insert must target supabaseAdmin — this is what the
    // above read-side handlers are aligning to.
    expect(src).toMatch(/supabaseAdmin\.from\(["']intake_drafts["']\)[\s\S]{0,400}upsert/);
    expect(src).toMatch(/supabaseAdmin\.from\(["']intake_drafts["']\)[\s\S]{0,400}insert/);
  });
});
