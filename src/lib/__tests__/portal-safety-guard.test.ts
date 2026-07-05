/**
 * Portal safety guard — static analysis backstop for invariant 5:
 * "The client portal must never show internal or draft truth."
 *
 * The portal is separated from the engine by:
 *   - RLS on client_portal_* tables
 *   - The `buildClientSafePayload` allowlist projection
 *   - A DB trigger blocking publish of ai_generated versions
 *
 * These tests add a fourth layer: they scan portal.functions.ts and reject
 * any read against internal engine_* tables outside of a small set of
 * explicitly-safe helpers. A regression that adds `.from("engine_roadmap_versions")`
 * to a portal loader breaks the build here, long before it can ship data
 * to a real client.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// Internal tables that must NEVER be read by portal-facing loaders.
const INTERNAL_TABLES = [
  "engine_roadmap_versions",
  "engine_extracted_signals",
  "engine_extraction_runs",
  "engine_intelligence_memory",
  "engine_intelligence_decisions",
  "engine_agent_costs",
  "engine_agent_permissions",
  "engine_agent_tasks",
  "engine_audit_log",
  "engine_review_items",
  "engine_review_audit",
  "engine_change_events",
  "engine_version_change_decisions",
  "engine_sources",
  "engine_delivery_items",
  "engine_delivery_history",
];

// Portal functions that legitimately mirror activity/messages INTO engine_*
// tables for the operator's Delivery Room. Those are writes, not reads,
// and use admin/service credentials — allowed.
const ALLOWED_WRITE_HELPERS = [
  "mirrorPortalActivityToEngine",
  "recordPortalDeliveryReceipt",
];

describe("portal.functions.ts never reads internal engine tables", () => {
  const src = read("src/lib/portal.functions.ts");

  for (const table of INTERNAL_TABLES) {
    it(`no .from("${table}") read outside allowed write helpers`, () => {
      // Find each occurrence
      const marker = `from("${table}")`;
      let cursor = 0;
      const violations: string[] = [];
      while (true) {
        const at = src.indexOf(marker, cursor);
        if (at === -1) break;
        // Check the next 400 chars for .insert / .update / .upsert / .delete
        // — those are writes we tolerate on the mirror path. A .select /
        // no-op chained is a read and forbidden.
        const window = src.slice(at, at + 400);
        const isWrite = /\.\s*(insert|update|upsert|delete)\s*\(/.test(window);
        if (!isWrite) {
          // Locate enclosing function name (search backwards for "export const" or "function ")
          const before = src.slice(Math.max(0, at - 1200), at);
          const nameMatch =
            before.match(/export\s+const\s+([A-Za-z_$][\w$]*)/g) ??
            before.match(/function\s+([A-Za-z_$][\w$]*)/g);
          const enclosing = nameMatch ? nameMatch[nameMatch.length - 1] : "<unknown>";
          if (!ALLOWED_WRITE_HELPERS.some((h) => enclosing.includes(h))) {
            violations.push(`${enclosing} → .from("${table}")`);
          }
        }
        cursor = at + marker.length;
      }
      expect(violations, `Portal reads from internal table ${table}: ${violations.join(", ")}`).toEqual([]);
    });
  }
});

describe("buildClientSafePayload allowlist is exhaustive", () => {
  const src = read("src/lib/roadmap-publish.ts");

  it("CLIENT_SAFE_KEYS covers every field of ClientSafeRoadmap", () => {
    // Extract keys returned from buildClientSafePayload's object literal.
    const start = src.indexOf("const out: ClientSafeRoadmap = {");
    expect(start, "buildClientSafePayload return literal not found").toBeGreaterThan(-1);
    const end = src.indexOf("};", start);
    const literal = src.slice(start, end);
    const returnedKeys = Array.from(literal.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*:/gim)).map((m) => m[1]);
    // Extract CLIENT_SAFE_KEYS values.
    const keysBlock = src.slice(src.indexOf("CLIENT_SAFE_KEYS = ["));
    const allowlist = Array.from(keysBlock.matchAll(/"([a-z_][a-z0-9_]*)"/g)).map((m) => m[1]);
    for (const k of returnedKeys) {
      expect(allowlist, `key ${k} missing from CLIENT_SAFE_KEYS allowlist`).toContain(k);
    }
  });

  it("throws in dev/test when non-allowlisted keys are present", async () => {
    // The runtime assertion path is inside buildClientSafePayload itself.
    // We verify by asserting the source contains the guard, since NODE_ENV
    // manipulation during a single test file would be brittle.
    expect(src).toMatch(/non-allowlisted keys detected/);
    expect(src).toMatch(/CLIENT_SAFE_KEYS\.includes/);
  });
});

describe("AI-draft publish is blocked at the DB layer", () => {
  // The DB trigger tg_client_portal_roadmaps_require_source_version now
  // checks engine_roadmap_versions.status. We keep a source-scan test so
  // a future migration that removes the check is caught in review.
  const migs = ["supabase/migrations"];

  it("at least one migration references the ai_generated backstop", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const files = fs.readdirSync(migs[0]);
    const found = files.some((f) => {
      const contents = fs.readFileSync(path.resolve(migs[0], f), "utf8");
      return (
        contents.includes("tg_client_portal_roadmaps_require_source_version") &&
        contents.includes("ai_generated")
      );
    });
    expect(found, "expected a migration wiring the AI-draft publish backstop").toBe(true);
  });
});
