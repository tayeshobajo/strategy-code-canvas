/**
 * Phase 1 — Lightweight unit tests for the epistemic-status server-fn
 * validators + guards.
 *
 * We test the pure pieces (zod schemas, actor gate, AI-writable rule)
 * directly from `engine-epistemic.server.ts` rather than round-tripping
 * through `createServerFn`, which would need a live Supabase client.
 */
import { describe, it, expect, vi } from "vitest";
import {
  EPISTEMIC_STATUSES,
  AI_WRITABLE_STATUSES,
  markSpineFieldStatusInput,
  promoteSignalToSpineInput,
  detectContradictionsInput,
  getSpineFieldStatusInput,
  sourceRefSchema,
  statusSchema,
  uuidSchema,
  assertAdminOrOperator,
  assertStatusAllowedForActor,
  type AuthCtx,
} from "@/lib/engine-epistemic.server";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("taxonomy invariants", () => {
  it("exposes exactly the five documented statuses", () => {
    expect([...EPISTEMIC_STATUSES].sort()).toEqual(
      ["assumed", "contradicted", "inferred", "stated", "verified"].sort(),
    );
  });

  it("restricts AI writes to inferred + assumed only", () => {
    expect([...AI_WRITABLE_STATUSES].sort()).toEqual(["assumed", "inferred"].sort());
    // Sanity — no privileged status is silently AI-writable.
    for (const s of ["stated", "verified", "contradicted"] as const) {
      expect(AI_WRITABLE_STATUSES).not.toContain(s);
    }
  });
});

describe("statusSchema", () => {
  it("accepts every valid epistemic status", () => {
    for (const s of EPISTEMIC_STATUSES) {
      expect(statusSchema.parse(s)).toBe(s);
    }
  });

  it("rejects unknown status strings", () => {
    expect(() => statusSchema.parse("approved")).toThrow();
    expect(() => statusSchema.parse("")).toThrow();
    expect(() => statusSchema.parse("STATED")).toThrow();
  });
});

describe("uuidSchema", () => {
  it("accepts canonical UUIDs", () => {
    expect(uuidSchema.parse(UUID)).toBe(UUID);
  });
  it("rejects non-UUID strings", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
    expect(() => uuidSchema.parse("1234")).toThrow();
  });
});

describe("sourceRefSchema", () => {
  it("requires a non-empty kind", () => {
    expect(() => sourceRefSchema.parse({ kind: "" })).toThrow();
  });
  it("accepts a bare kind with no id/quote", () => {
    expect(sourceRefSchema.parse({ kind: "operator_note" })).toEqual({
      kind: "operator_note",
    });
  });
  it("accepts full source ref shape", () => {
    const ref = {
      kind: "extracted_signal",
      id: UUID,
      quote: "Because Tai said so.",
      timestamp: "2026-07-12T00:00:00Z",
    };
    expect(sourceRefSchema.parse(ref)).toEqual(ref);
  });
});

describe("markSpineFieldStatusInput", () => {
  const base = {
    projectId: UUID,
    spine: "point-a" as const,
    fieldKey: "customer_segment",
    status: "verified" as const,
    sourceRef: { kind: "operator_note" },
  };

  it("accepts a well-formed payload for point-a and point-b", () => {
    expect(markSpineFieldStatusInput.parse(base)).toBeDefined();
    expect(
      markSpineFieldStatusInput.parse({ ...base, spine: "point-b" }),
    ).toBeDefined();
  });

  it("rejects invalid spine values", () => {
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, spine: "point-c" }),
    ).toThrow();
  });

  it("rejects empty fieldKey and oversized fieldKey", () => {
    expect(() => markSpineFieldStatusInput.parse({ ...base, fieldKey: "" })).toThrow();
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, fieldKey: "x".repeat(201) }),
    ).toThrow();
  });

  it("rejects invalid status transitions at the schema layer", () => {
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, status: "approved" }),
    ).toThrow();
  });

  it("rejects malformed sourceRef", () => {
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, sourceRef: {} }),
    ).toThrow();
  });
});

describe("promoteSignalToSpineInput", () => {
  const base = {
    projectId: UUID,
    signalId: UUID,
    spine: "point-b" as const,
    fieldKey: "revenue_outcome",
    status: "stated" as const,
  };

  it("accepts a well-formed payload", () => {
    expect(promoteSignalToSpineInput.parse(base)).toBeDefined();
  });

  it("rejects non-uuid signalId", () => {
    expect(() =>
      promoteSignalToSpineInput.parse({ ...base, signalId: "abc" }),
    ).toThrow();
  });
});

describe("detectContradictionsInput / getSpineFieldStatusInput", () => {
  it("both require a valid projectId", () => {
    expect(detectContradictionsInput.parse({ projectId: UUID })).toEqual({
      projectId: UUID,
    });
    expect(() => detectContradictionsInput.parse({ projectId: "nope" })).toThrow();
    expect(
      getSpineFieldStatusInput.parse({ projectId: UUID, spine: "point-a" }),
    ).toBeDefined();
    expect(() =>
      getSpineFieldStatusInput.parse({ projectId: UUID, spine: "somewhere" }),
    ).toThrow();
  });
});

describe("assertStatusAllowedForActor", () => {
  it("permits humans to write any status", () => {
    for (const s of EPISTEMIC_STATUSES) {
      expect(() => assertStatusAllowedForActor(s, "human")).not.toThrow();
    }
  });

  it("permits AI to write inferred and assumed only", () => {
    for (const s of AI_WRITABLE_STATUSES) {
      expect(() => assertStatusAllowedForActor(s, "ai")).not.toThrow();
    }
  });

  it("blocks AI from writing stated / verified / contradicted", () => {
    for (const s of ["stated", "verified", "contradicted"] as const) {
      expect(() => assertStatusAllowedForActor(s, "ai")).toThrow(/Forbidden status for AI actor/);
    }
  });
});

describe("assertAdminOrOperator", () => {
  function ctxFor(email: string | null, isAdmin: boolean, isOperator: boolean): AuthCtx {
    return {
      claims: email ? { email } : {},
      supabase: {
        from: vi.fn(),
        rpc: vi.fn(async (_fn: string, args?: Record<string, unknown>) => {
          const role = args?._role;
          if (role === "admin") return { data: isAdmin, error: null };
          if (role === "operator") return { data: isOperator, error: null };
          return { data: false, error: null };
        }),
      },
    };
  }

  it("throws when no email is present on the claims", async () => {
    await expect(assertAdminOrOperator(ctxFor(null, true, true))).rejects.toThrow(
      /authentication required/,
    );
  });

  it("returns the email for admins", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("admin@example.com", true, false)),
    ).resolves.toBe("admin@example.com");
  });

  it("returns the email for operators", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("op@example.com", false, true)),
    ).resolves.toBe("op@example.com");
  });

  it("rejects team members with neither role", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("team@example.com", false, false)),
    ).rejects.toThrow(/admin or operator role required/);
  });
});
