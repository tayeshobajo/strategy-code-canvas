/**
 * Guard tests — Approvals queue actually persists decisions.
 *
 * Before the fix, Approve/Reject/Request Revision buttons in the
 * /engine/approvals sidebar only hid rows via local state — no server
 * mutation, no audit trail. This test locks in:
 *
 *   1. The route wires the buttons to `decideReviewItem` via
 *      useMutation + useServerFn and has no local-only dismiss state
 *      or window.alert() no-op.
 *
 *   2. The `decideReviewItem` server function actually writes to
 *      engine_review_items, engine_audit_log, and engine_activity so
 *      downstream consumers see the decision.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("engine.approvals — buttons call the server mutation", () => {
  const src = read("src/routes/engine.approvals.tsx");

  it("imports decideReviewItem from engine-ops.functions", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*decideReviewItem[^}]*\}\s*from\s*["']@\/lib\/engine-ops\.functions["']/,
    );
  });

  it("wires it through useServerFn + useMutation", () => {
    expect(src).toMatch(/useServerFn\s*\(\s*decideReviewItem\s*\)/);
    expect(src).toMatch(/useMutation\s*\(/);
  });

  it("has no local-only dismissal or alert no-op", () => {
    expect(src).not.toMatch(/setDismissedIds/);
    expect(src).not.toMatch(/window\.alert/);
  });

  it("invokes the mutation for approve, reject, and request-revision paths", () => {
    // The three decision kinds routed through decideReviewItem.
    expect(src).toMatch(/"approved"/);
    expect(src).toMatch(/"rejected"/);
    expect(src).toMatch(/"revision"|"needs_revision"|"request_revision"/);
  });
});

describe("decideReviewItem — persists to review, audit, and activity", () => {
  const src = read("src/lib/engine-ops.functions.ts");
  const start = src.indexOf("export const decideReviewItem");
  const end = src.indexOf("export const ", start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const body = src.slice(start, end);

  it("updates engine_review_items", () => {
    expect(body).toMatch(/from\("engine_review_items"\)[\s\S]*?\.update\(/);
  });

  it("inserts an engine_audit_log row", () => {
    expect(body).toMatch(/from\("engine_audit_log"\)\s*\.insert\(/);
  });

  it("inserts an engine_activity row", () => {
    expect(body).toMatch(/from\("engine_activity"\)\s*\.insert\(/);
  });
});
