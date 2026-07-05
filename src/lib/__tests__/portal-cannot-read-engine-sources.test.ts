/**
 * Guard test — Gap G-3: the client portal must NEVER read or write
 * `engine_sources`. Portal audiences see only content that has been
 * deliberately promoted into the `client_portal_*` tables (roadmaps,
 * files, messages, activity). Any direct portal reference to
 * `engine_sources` — even a SELECT — is a leak vector.
 *
 * Two layers of defense enforced here:
 *   1. Code layer: no portal-scoped file references the string
 *      "engine_sources" at all.
 *   2. RLS layer: the latest migration touching engine_sources policies
 *      restricts access to admins (has_role ... 'admin'), never to a
 *      broader audience like `anon`, portal roles, or unconditional
 *      `authenticated`.
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

describe("client portal cannot touch engine_sources (G-3)", () => {
  it("no portal route or portal helper references 'engine_sources'", () => {
    const portalFiles: string[] = [];
    // Portal routes: src/routes/portal.*.tsx
    for (const f of readdirSync(resolve(ROOT, "src/routes"))) {
      if (/^portal(\.|$)/.test(f) && /\.(ts|tsx)$/.test(f)) {
        portalFiles.push(resolve(ROOT, "src/routes", f));
      }
    }
    // Portal libs: src/lib/portal*.ts (helpers/functions)
    for (const f of readdirSync(resolve(ROOT, "src/lib"))) {
      if (/^portal.*\.(ts|tsx)$/.test(f) && !f.includes("__tests__")) {
        portalFiles.push(resolve(ROOT, "src/lib", f));
      }
    }
    // Portal components (if the folder exists).
    const compDir = resolve(ROOT, "src/components/portal");
    try {
      if (statSync(compDir).isDirectory()) walk(compDir, portalFiles);
    } catch {
      /* no portal components dir — fine */
    }

    expect(portalFiles.length, "no portal files discovered — glob is wrong").toBeGreaterThan(0);

    const leaks: string[] = [];
    for (const file of portalFiles) {
      const src = readFileSync(file, "utf8");
      // Ignore comment lines that intentionally mention engine_sources in prose
      // (e.g. "the portal deliberately does not read engine_sources").
      // We only fail on an actual code reference — i.e. one that isn't
      // inside a // or /* ... */ region on that line.
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("engine_sources")) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        leaks.push(`${file.replace(ROOT + "/", "")}:${i + 1}  ${trimmed.slice(0, 160)}`);
      }
    }

    expect(
      leaks,
      `portal code must not reference engine_sources — offenders:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("latest engine_sources RLS migration restricts access to admins only", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    // Find every migration that CREATE POLICYs on engine_sources (RLS-touching).
    const rlsRelevant = files.filter((f) => {
      const c = read(`${dir}/${f}`);
      return /engine_sources/i.test(c) && /CREATE POLICY/i.test(c);
    });
    expect(
      rlsRelevant.length,
      "expected at least one migration that creates an engine_sources policy",
    ).toBeGreaterThan(0);
    const latest = rlsRelevant[rlsRelevant.length - 1];
    const contents = read(`${dir}/${latest}`);

    // Every CREATE POLICY block that names engine_sources must gate on an admin
    // role check (or admin+operator). No portal / anon / unconditional
    // authenticated policies allowed.
    const policyBlocks =
      contents.match(/CREATE POLICY[\s\S]*?ON\s+public\.engine_sources[\s\S]*?;/gi) ?? [];
    expect(policyBlocks.length, "no engine_sources CREATE POLICY blocks in latest RLS migration").toBeGreaterThan(0);
    for (const block of policyBlocks) {
      expect(block, `engine_sources policy missing admin gate:\n${block}`).toMatch(
        /has_role\s*\(\s*auth\.uid\(\)\s*,\s*['"]admin['"]/i,
      );
      expect(block, `engine_sources policy grants to anon:\n${block}`).not.toMatch(/\bTO\s+anon\b/i);
    }
  });
});
