/**
 * Guard test — Admin visibility change workflow.
 *
 * Rules:
 *  1. There is exactly ONE sanctioned code path that writes
 *     engine_sources.visibility to a non-default value, and it lives in
 *     src/lib/engine-sources.functions.ts (changeSourceVisibility).
 *  2. That handler MUST assert admin role and MUST write an
 *     engine_audit_log row for every actual change.
 *  3. No other file under src/ may .update({...visibility...}) on
 *     engine_sources — the RLS admin-only policy is the DB backstop, this
 *     test is the app-layer backstop that keeps operator/client_safe
 *     promotions auditable.
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
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("engine_sources visibility change workflow (admin-only, audited)", () => {
  const handler = read("src/lib/engine-sources.functions.ts");

  it("exports changeSourceVisibility as a server function", () => {
    expect(handler).toMatch(/export const changeSourceVisibility\s*=\s*createServerFn/);
  });

  it("requires supabase auth middleware", () => {
    expect(handler).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
  });

  it("asserts admin role before mutating", () => {
    expect(handler).toMatch(/assertAdmin/);
    expect(handler).toMatch(/Forbidden: admin role required/);
  });

  it("validates visibility against the three allowed values", () => {
    expect(handler).toMatch(/z\.enum\(\[\s*"internal_only"\s*,\s*"operator_only"\s*,\s*"client_safe"\s*\]\)/);
  });

  it("requires a non-trivial reason string for the audit trail", () => {
    expect(handler).toMatch(/reason:\s*z\.string\(\)[\s\S]*\.min\(3/);
  });

  it("writes an engine_audit_log row with old/new value and actor email", () => {
    expect(handler).toMatch(/from\("engine_audit_log"\)\s*\.insert/);
    expect(handler).toMatch(/action:\s*"source_visibility_changed"/);
    expect(handler).toMatch(/actor_email:\s*callerEmail/);
    expect(handler).toMatch(/old_value:\s*oldVisibility/);
    expect(handler).toMatch(/new_value:\s*data\.visibility/);
    expect(handler).toMatch(/field_changed:\s*"visibility"/);
  });

  it("rolls back the visibility update if the audit insert fails", () => {
    // Audit is not optional: if we cannot record the change, we must not keep it.
    expect(handler).toMatch(/rolled back/i);
    expect(handler).toMatch(/if\s*\(\s*auditErr\s*\)/);
  });

  it("is the ONLY file under src/ that updates engine_sources.visibility", () => {
    const files = walk(resolve(ROOT, "src")).filter(
      (f) => !f.includes("__tests__") && !f.endsWith("engine-sources.functions.ts"),
    );
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Look for update calls on engine_sources that touch visibility.
      const updateBlocks = src.match(
        /\.from\(["']engine_sources["']\)[\s\S]{0,400}?\.update\(\{[\s\S]{0,400}?\}\)/g,
      );
      if (!updateBlocks) continue;
      for (const block of updateBlocks) {
        if (/visibility/.test(block)) offenders.push(`${f}: ${block.slice(0, 120)}...`);
      }
    }
    expect(offenders, `Only changeSourceVisibility may update visibility. Offenders:\n${offenders.join("\n")}`).toEqual([]);
  });
});
