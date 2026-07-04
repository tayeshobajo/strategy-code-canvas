/**
 * Integration-style guard tests that lock in two audit-critical invariants
 * across the review + publish pipeline:
 *
 *   1. Every `engine_review_items` insert in server-function modules carries
 *      an explicit `project_id`. Without this the review queue can't route
 *      approvals back to the correct project, and the P0 audit that spawned
 *      these tests found several inserts missing it.
 *
 *   2. The three portal-publish server functions enforce their approval
 *      gates before writing anything client-facing:
 *        - publishVersionToPortal  → status "approved" + client_preview "approved"
 *        - sendProjectDelivery     → client_preview_status "approved"
 *        - approvePreview          → version "approved" + preview "draft"
 *
 * The tests scan source rather than invoke the RPC because these gates are
 * defense-in-depth against future edits; a regression that removes the gate
 * would silently ship a broken publish path.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** Extract every `.insert({ ... })` object literal that follows a
 *  `.from("engine_review_items")` in the same statement. Returns the raw
 *  object-literal source so tests can assert on its contents. */
function extractReviewItemInserts(src: string): string[] {
  const results: string[] = [];
  const marker = 'from("engine_review_items")';
  let cursor = 0;
  while (true) {
    const at = src.indexOf(marker, cursor);
    if (at === -1) break;
    const insertAt = src.indexOf(".insert(", at);
    if (insertAt === -1) {
      cursor = at + marker.length;
      continue;
    }
    // Match the object literal after `.insert(` by counting braces.
    const braceStart = src.indexOf("{", insertAt);
    if (braceStart === -1) break;
    let depth = 0;
    let i = braceStart;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    results.push(src.slice(braceStart, i));
    cursor = i;
  }
  return results;
}

describe("engine_review_items inserts always set project_id", () => {
  const files = [
    "src/lib/engine-ops.functions.ts",
    "src/lib/portal.functions.ts",
    "src/lib/engine-intelligence.functions.ts",
  ];

  for (const file of files) {
    it(`${file} — every insert carries project_id`, () => {
      const inserts = extractReviewItemInserts(read(file));
      expect(inserts.length, `expected at least one review_items insert in ${file}`).toBeGreaterThan(0);
      for (const literal of inserts) {
        expect(literal, `missing project_id in insert:\n${literal}`).toMatch(/project_id\s*:/);
      }
    });
  }
});

describe("portal publish path enforces approval gates", () => {
  const opsSrc = read("src/lib/engine-ops.functions.ts");
  const execSrc = read("src/lib/engine-execution.functions.ts");

  it("publishVersionToPortal gates on version + client preview approval", () => {
    const start = opsSrc.indexOf("publishVersionToPortal");
    expect(start).toBeGreaterThan(-1);
    // Look at the handler window (next ~4kb of source).
    const window = opsSrc.slice(start, start + 4000);
    expect(window).toMatch(/status\s*!==\s*"approved"/);
    expect(window).toMatch(/client_preview_status\s*!==\s*"approved"/);
    // Must resolve the destination portal project before writing.
    expect(window).toMatch(/client_portal_project_id/);
  });

  it("sendProjectDelivery gates on client_preview_status approved", () => {
    const start = execSrc.indexOf("sendProjectDelivery");
    expect(start).toBeGreaterThan(-1);
    const window = execSrc.slice(start, start + 6000);
    expect(window).toMatch(/client_preview_status\s*!==\s*"approved"/);
  });

  it("approvePreview requires version approved + preview submitted", () => {
    const start = opsSrc.indexOf("export const approvePreview");
    expect(start).toBeGreaterThan(-1);
    const window = opsSrc.slice(start, start + 2500);
    expect(window).toMatch(/status\s*!==\s*"approved"/);
    expect(window).toMatch(/client_preview_status\s*!==\s*"draft"/);
  });
});

describe("respondToPortalDecision writes both audit + activity", () => {
  const src = read("src/lib/portal.functions.ts");
  const start = src.indexOf("respondToPortalDecision");
  const window = src.slice(start, start + 6000);

  it("inserts an engine_audit_log row with version_id linkage", () => {
    expect(window).toMatch(/from\("engine_audit_log"\)\s*\.insert/);
    expect(window).toMatch(/version_id\s*:/);
  });

  it("inserts an engine_activity row so it shows in the project feed", () => {
    expect(window).toMatch(/from\("engine_activity"\)\s*\.insert/);
    expect(window).toMatch(/kind\s*:\s*`client_/);
  });
});
