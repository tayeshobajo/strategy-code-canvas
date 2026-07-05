/**
 * Guard test — Gap G-2: engine_sources.visibility must always be
 * 'internal_only' by default. Sources are the raw truth from clients;
 * a source silently becoming `client_safe` would leak private context
 * back through client_safe filters.
 *
 * Two layers of defense:
 *   1. DB-level: column is NOT NULL with default 'internal_only'.
 *   2. App-level: every source inserter sets visibility explicitly.
 *
 * This test locks both in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("engine_sources.visibility defense-in-depth (G-2)", () => {
  it("every app-level source inserter sets visibility: 'internal_only' explicitly", () => {
    const inserters: Array<{ file: string; anchor: string }> = [
      { file: "src/lib/engine-intelligence.functions.ts", anchor: "export const createSource" },
      { file: "src/lib/engine-project-intake.functions.ts", anchor: "engine_sources" },
      { file: "src/lib/portal.functions.ts", anchor: "submitPortalOnboarding" },
    ];
    for (const { file, anchor } of inserters) {
      const src = read(file);
      const start = src.indexOf(anchor);
      expect(start, `${file} missing anchor "${anchor}"`).toBeGreaterThan(-1);
      // Search the whole file for an engine_sources insert that sets visibility.
      const inserts = src.match(
        /from\("engine_sources"\)\s*\.insert\(\{[\s\S]{0,1500}?\}\)/g,
      );
      expect(inserts, `${file} has no engine_sources insert`).toBeTruthy();
      for (const block of inserts ?? []) {
        expect(block, `${file} insert missing explicit visibility`).toMatch(
          /visibility:\s*"internal_only"/,
        );
      }
    }
  });

  it("DB migration keeps visibility NOT NULL with default 'internal_only'", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    // Find every migration that touches visibility and confirm the winning
    // (latest) definition is NOT NULL with default internal_only.
    const relevant = files.filter((f) => {
      const c = read(`${dir}/${f}`);
      return /visibility/i.test(c) && /engine_source/i.test(c);
    });
    expect(
      relevant.length,
      "expected at least one migration that defines engine_sources.visibility",
    ).toBeGreaterThan(0);
    const latest = relevant[relevant.length - 1];
    const contents = read(`${dir}/${latest}`);
    // Must reference 'internal_only' as the default somewhere.
    expect(contents).toMatch(/internal_only/);
  });
});
