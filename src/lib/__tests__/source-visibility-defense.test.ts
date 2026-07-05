/**
 * Guard test — Gap G-2 / G-3: engine_sources.visibility must always be
 * 'internal_only' by default at BOTH the DB and app layers, across
 * EVERY source-inserter path in the codebase.
 *
 * Sources are the raw truth clients share with us; a source silently
 * becoming `client_safe` (or bypassing the default) would leak private
 * context through client_safe filters and into the portal.
 *
 * Three layers of defense enforced here:
 *   1. DB-level: column is NOT NULL with default 'internal_only'.
 *   2. App-level: EVERY `.from("engine_sources").insert(...)` under src/
 *      sets visibility: "internal_only" explicitly.
 *   3. Type discriminator: SOURCE_TYPES enum covers all audience-facing
 *      source flavors so the "one inserter, many types" contract stays
 *      durable (Plaud transcripts, website URLs, uploaded docs, manual
 *      notes, etc. all funnel through createSource).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

describe("engine_sources.visibility defense-in-depth (G-2 / G-3)", () => {
  it("EVERY engine_sources insert under src/ sets visibility: 'internal_only'", () => {
    const files = walk(resolve(ROOT, "src"));
    const insertRe =
      /\.from\(\s*["']engine_sources["']\s*\)\s*\.insert\(\s*\{[\s\S]{0,3000}?\}\s*\)/g;
    const offenders: Array<{ file: string; snippet: string }> = [];
    let totalInserts = 0;

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const matches = src.match(insertRe);
      if (!matches) continue;
      for (const block of matches) {
        totalInserts++;
        if (!/visibility:\s*["']internal_only["']/.test(block)) {
          offenders.push({ file: file.replace(ROOT + "/", ""), snippet: block.slice(0, 200) });
        }
      }
    }

    expect(
      totalInserts,
      "expected at least 3 engine_sources inserters (createSource, createProjectFromSource, submitPortalOnboarding)",
    ).toBeGreaterThanOrEqual(3);
    expect(
      offenders,
      `engine_sources inserters missing explicit visibility: 'internal_only'\n${offenders
        .map((o) => `  - ${o.file}:\n      ${o.snippet}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("known audience-facing source-inserter anchors still exist", () => {
    // Explicit belt-and-braces: even if the regex above passed, these three
    // named entry points must continue to exist. Renames or deletions of any
    // of them should fail the guard test until the rename is reflected here.
    const anchors: Array<{ file: string; anchor: string }> = [
      { file: "src/lib/engine-intelligence.functions.ts", anchor: "export const createSource" },
      { file: "src/lib/engine-project-intake.functions.ts", anchor: "engine_sources" },
      { file: "src/lib/portal.functions.ts", anchor: "submitPortalOnboarding" },
    ];
    for (const { file, anchor } of anchors) {
      expect(read(file).indexOf(anchor), `${file} missing anchor "${anchor}"`).toBeGreaterThan(-1);
    }
  });

  it("SOURCE_TYPES enum covers all audience-facing flavors (transcripts, URLs, docs, notes)", () => {
    const src = read("src/lib/engine-intelligence.functions.ts");
    // Extract the SOURCE_TYPES literal block.
    const m = src.match(/const SOURCE_TYPES\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(m, "SOURCE_TYPES literal not found").toBeTruthy();
    const body = (m?.[1] ?? "").toLowerCase();
    const required = [
      "transcript", // Plaud / discovery-call transcripts
      "brief",
      "website_url", // website URL sources
      "document", // uploaded docs
      "email_note", // manual notes (email/inbox capture)
      "research_note", // manual notes (research)
      "competitor_url",
      "previous_roadmap",
    ];
    for (const t of required) {
      expect(body, `SOURCE_TYPES missing "${t}"`).toContain(`"${t}"`);
    }
  });

  it("DB migration keeps engine_sources.visibility NOT NULL DEFAULT 'internal_only'", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    const relevant = files.filter((f) => {
      const c = read(`${dir}/${f}`);
      return /engine_sources/i.test(c) && /visibility/i.test(c);
    });
    expect(
      relevant.length,
      "expected at least one migration that defines engine_sources.visibility",
    ).toBeGreaterThan(0);
    const latest = relevant[relevant.length - 1];
    const contents = read(`${dir}/${latest}`);
    // Latest visibility-touching migration must still reference the safe default.
    expect(contents).toMatch(/internal_only/);
    // And the ALTER/CREATE must be NOT NULL.
    expect(contents).toMatch(/visibility[\s\S]{0,200}NOT NULL[\s\S]{0,80}DEFAULT\s+'internal_only'/i);
  });
});
