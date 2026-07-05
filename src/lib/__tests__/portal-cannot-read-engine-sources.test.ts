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
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("engine_sources")) continue;
        const trimmed = line.trim();
        // Skip comment lines that intentionally mention engine_sources in prose.
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        // The one legitimate write path that lives inside portal.functions.ts
        // is submitPortalOnboarding — an OPERATOR-triggered onboarding insert
        // that stores the intake as an internal_only source. It is NOT a
        // portal-audience read. Allow the insert line only when the
        // surrounding function body sets visibility: 'internal_only' AND the
        // reference is a .from("engine_sources") for that inserter. Any read
        // path (.select, .update, .delete, or any usage inside a client-scoped
        // handler) is a leak.
        const isSelectOrMutate =
          /\.select\s*\(/.test(line) ||
          /\.update\s*\(/.test(line) ||
          /\.delete\s*\(/.test(line);
        if (isSelectOrMutate) {
          leaks.push(
            `${file.replace(ROOT + "/", "")}:${i + 1}  ${trimmed.slice(0, 160)}`,
          );
          continue;
        }
        // Confirm the surrounding block asserts visibility: 'internal_only'.
        const surrounding = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 30)).join("\n");
        if (!/visibility:\s*["']internal_only["']/.test(surrounding)) {
          leaks.push(
            `${file.replace(ROOT + "/", "")}:${i + 1}  engine_sources ref without nearby visibility='internal_only'`,
          );
        }
      }
    }

    expect(
      leaks,
      `portal code must not read engine_sources (writes ok only when internal_only) — offenders:\n${leaks.join("\n")}`,
    ).toEqual([]);
  });

  it("every engine_sources CREATE POLICY across all migrations gates on admin role", () => {
    const dir = "supabase/migrations";
    const files = readdirSync(dir).sort();
    const policyRe =
      /CREATE\s+POLICY[\s\S]*?ON\s+public\.engine_sources[\s\S]*?(?:WITH\s+CHECK[\s\S]*?)?;/gi;
    const blocks: Array<{ file: string; block: string }> = [];
    for (const f of files) {
      const contents = read(`${dir}/${f}`);
      const matches = contents.match(policyRe) ?? [];
      for (const b of matches) blocks.push({ file: f, block: b });
    }
    expect(
      blocks.length,
      "expected at least one CREATE POLICY targeting public.engine_sources",
    ).toBeGreaterThan(0);
    for (const { file, block } of blocks) {
      expect(block, `${file}: engine_sources policy missing admin gate:\n${block}`).toMatch(
        /has_role\s*\(\s*auth\.uid\(\)\s*,\s*['"]admin['"]/i,
      );
      expect(block, `${file}: engine_sources policy grants to anon:\n${block}`).not.toMatch(
        /\bTO\s+anon\b/i,
      );
    }
  });
});

