// Phase H2b — Family-impact fingerprint dedupe unit tests.
//
// Covers the pure fingerprint helper. Full end-to-end (mocking supabaseAdmin
// + auth middleware) lives in integration tests; here we lock in the
// deterministic fingerprint so re-scans stay stable across releases.

import { describe, expect, it } from "vitest";
import { fingerprintBlocker } from "./engine-family-impact.functions";

describe("fingerprintBlocker", () => {
  it("is deterministic for the same triple", () => {
    const a = fingerprintBlocker({ parentId: "p1", childId: "c1", reason: "child_not_approved" });
    const b = fingerprintBlocker({ parentId: "p1", childId: "c1", reason: "child_not_approved" });
    expect(a).toEqual(b);
  });

  it("differs when parent, child, or reason differs", () => {
    const base = fingerprintBlocker({ parentId: "p1", childId: "c1", reason: "child_not_approved" });
    expect(base).not.toEqual(
      fingerprintBlocker({ parentId: "p2", childId: "c1", reason: "child_not_approved" }),
    );
    expect(base).not.toEqual(
      fingerprintBlocker({ parentId: "p1", childId: "c2", reason: "child_not_approved" }),
    );
    expect(base).not.toEqual(
      fingerprintBlocker({ parentId: "p1", childId: "c1", reason: "child_not_completed" }),
    );
  });

  it("encodes the reason as a readable suffix", () => {
    const fp = fingerprintBlocker({
      parentId: "p1",
      childId: "c1",
      reason: "stale_rollup_child_added_after_approval",
    });
    expect(fp.endsWith("_stale_rollup_child_added_after_approval")).toBe(true);
    expect(fp.startsWith("fi_")).toBe(true);
  });
});
