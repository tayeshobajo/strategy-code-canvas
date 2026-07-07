/**
 * Guard test — re-audit New Issue #2: decideReviewItem must not flip the
 * review item to `approved` (or write its audit row) before the version
 * side-effect guards run.
 *
 * Before the fix, the item status update + engine_review_audit insert
 * executed first; if the self-approval, open-critical-events, investment
 * or already-approved guard then threw, the function aborted with an
 * approved review item pointing at an unapproved version — inconsistent
 * and unretryable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/lib/engine-ops.functions.ts"), "utf8");

const start = src.indexOf("export const decideReviewItem");
const end = src.indexOf("createServerFn", start + 100); // next server fn
const body = src.slice(start, end === -1 ? undefined : end);

function idxOf(needle: string | RegExp): number {
  const i = typeof needle === "string" ? body.indexOf(needle) : body.search(needle);
  expect(i, `expected to find ${needle} in decideReviewItem`).toBeGreaterThan(-1);
  return i;
}

describe("decideReviewItem write ordering (New Issue #2)", () => {
  it("handler body was located", () => {
    expect(start).toBeGreaterThan(-1);
  });

  const itemUpdate = () =>
    idxOf(/from\("engine_review_items"\)\s*\.update\(\{ status: nextStatus \}\)/);
  const auditInsert = () => idxOf('from("engine_review_audit").insert(');

  it("already-approved guard runs before the item update and audit insert", () => {
    const guard = idxOf("Cannot approve: linked version is already");
    expect(guard).toBeLessThan(itemUpdate());
    expect(guard).toBeLessThan(auditInsert());
  });

  it("self-approval guard runs before the item update and audit insert", () => {
    const guard = idxOf("You cannot approve a version you authored yourself");
    expect(guard).toBeLessThan(itemUpdate());
    expect(guard).toBeLessThan(auditInsert());
  });

  it("open-critical-events guard runs before the item update and audit insert", () => {
    const guard = idxOf("Resolve open critical change events");
    expect(guard).toBeLessThan(itemUpdate());
    expect(guard).toBeLessThan(auditInsert());
  });

  it("investment-confirmation guard runs before the item update and audit insert", () => {
    const guard = idxOf("Confirm the investment on this project");
    expect(guard).toBeLessThan(itemUpdate());
    expect(guard).toBeLessThan(auditInsert());
  });

  it("the version status write happens only after the item update (retryable ordering)", () => {
    const versionWrite = idxOf(
      /from\("engine_roadmap_versions"\)\s*\.update\(\{ status: "approved"/,
    );
    expect(itemUpdate()).toBeLessThan(versionWrite);
  });

  it("guards are read-only: no insert/update between guard section and the item update", () => {
    // Between the admin gate and the item update there must be no .update( or
    // .insert( call — everything before the first write is reads and throws.
    const adminGate = idxOf("only Tai (admin) can approve a roadmap version");
    const firstWrite = itemUpdate();
    const guardSection = body.slice(adminGate, firstWrite);
    expect(guardSection).not.toMatch(/\.insert\(/);
    // .update( appears only in type positions/selects? It must not at all.
    expect(guardSection).not.toMatch(/\.update\(/);
  });
});
