import { describe, expect, it } from "vitest";
import {
  diagnoseAccessMismatch,
  generateCorrelationId,
  normalizeCorrelationId,
} from "./portal-access-diagnosis";

describe("diagnoseAccessMismatch", () => {
  it("returns unknown_email when signed-in user has no access rows", () => {
    const d = diagnoseAccessMismatch({ clientAccess: [], permissions: [] });
    expect(d.event_type).toBe("unknown_email");
    expect(d.has_client_access).toBe(false);
    expect(d.has_permission).toBe(false);
    expect(d.metadata.client_access_rows).toBe(0);
    expect(d.metadata.permission_rows).toBe(0);
    expect(d.metadata.permission_project_ids).toEqual([]);
  });

  it("returns missing_workspace when client_access exists but no project row", () => {
    const d = diagnoseAccessMismatch({
      clientAccess: [{ revoked_at: null, stripe_session_id: "cs_test_123" }],
      permissions: [],
    });
    expect(d.event_type).toBe("missing_workspace");
    expect(d.has_client_access).toBe(true);
    expect(d.metadata.client_access_stripe_confirmed).toBe(true);
  });

  it("returns missing_workspace when permission exists but no project row", () => {
    const d = diagnoseAccessMismatch({
      clientAccess: [],
      permissions: [{ revoked_at: null, project_id: "proj-1" }],
    });
    expect(d.event_type).toBe("missing_workspace");
    expect(d.has_permission).toBe(true);
    expect(d.metadata.permission_project_ids).toEqual(["proj-1"]);
  });

  it("returns unknown_email when all access rows are revoked", () => {
    const d = diagnoseAccessMismatch({
      clientAccess: [{ revoked_at: "2026-01-01T00:00:00Z", stripe_session_id: "cs_x" }],
      permissions: [{ revoked_at: "2026-01-01T00:00:00Z", project_id: "p" }],
    });
    // No *active* grants — treated as unknown even though rows exist.
    expect(d.event_type).toBe("unknown_email");
    expect(d.has_client_access).toBe(false);
    expect(d.has_permission).toBe(false);
    expect(d.metadata.client_access_rows).toBe(1);
    expect(d.metadata.permission_rows).toBe(1);
    expect(d.metadata.client_access_stripe_confirmed).toBe(false);
  });

  it("marks stripe_confirmed false when session is missing", () => {
    const d = diagnoseAccessMismatch({
      clientAccess: [{ revoked_at: null, stripe_session_id: null }],
      permissions: [],
    });
    expect(d.metadata.client_access_stripe_confirmed).toBe(false);
  });
});

describe("correlation ids", () => {
  it("generates ids matching prt_<hex> format", () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^prt_[a-f0-9]{24}$/);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCorrelationId()));
    expect(ids.size).toBe(50);
  });

  it("normalizes valid inbound ids and rejects garbage", () => {
    const good = generateCorrelationId();
    expect(normalizeCorrelationId(good)).toBe(good);
    expect(normalizeCorrelationId("  " + good + "  ")).toBe(good);
    expect(normalizeCorrelationId("nope")).toBeNull();
    expect(normalizeCorrelationId("<script>")).toBeNull();
    expect(normalizeCorrelationId(null)).toBeNull();
    expect(normalizeCorrelationId(undefined)).toBeNull();
  });
});
