/**
 * Phase 1 R2 — Unit tests for the revised epistemic-status truth model.
 *
 * Pure schemas + assertions imported directly from `.server.ts` so we
 * don't need a live Supabase client.
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
  assertEvidenceForStatus,
  assertKnownFieldKey,
  enrichSourceRefForHuman,
  type AuthCtx,
} from "@/lib/engine-epistemic.server";
import {
  isKnownSpineFieldKey,
  pointADiagnosisKey,
  POINT_B_FIELD_KEYS,
} from "@/lib/engine-spine-fields";

const UUID = "11111111-2222-3333-4444-555555555555";
const UUID2 = "22222222-3333-4444-5555-666666666666";

describe("taxonomy invariants (R2)", () => {
  it("exposes exactly the 8 documented statuses", () => {
    expect([...EPISTEMIC_STATUSES].sort()).toEqual(
      [
        "approved_truth",
        "assumed",
        "contradicted",
        "inferred",
        "missing",
        "needs_confirmation",
        "stated",
        "verified",
      ].sort(),
    );
  });

  it("AI can only write inferred / assumed / missing / needs_confirmation", () => {
    expect([...AI_WRITABLE_STATUSES].sort()).toEqual(
      ["assumed", "inferred", "missing", "needs_confirmation"].sort(),
    );
    for (const s of ["stated", "verified", "contradicted", "approved_truth"] as const) {
      expect(AI_WRITABLE_STATUSES).not.toContain(s);
    }
  });
});

describe("statusSchema", () => {
  it("accepts every documented status", () => {
    for (const s of EPISTEMIC_STATUSES) expect(statusSchema.parse(s)).toBe(s);
  });
  it("rejects unclassified (UI sentinel — never persisted)", () => {
    expect(() => statusSchema.parse("unclassified")).toThrow();
  });
  it("rejects unknown strings", () => {
    expect(() => statusSchema.parse("approved")).toThrow();
    expect(() => statusSchema.parse("")).toThrow();
    expect(() => statusSchema.parse("STATED")).toThrow();
  });
});

describe("uuidSchema", () => {
  it("accepts canonical UUIDs", () => {
    expect(uuidSchema.parse(UUID)).toBe(UUID);
  });
  it("rejects non-UUIDs", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
    expect(() => uuidSchema.parse("1234")).toThrow();
  });
});

describe("sourceRefSchema", () => {
  it("requires a non-empty kind", () => {
    expect(() => sourceRefSchema.parse({ kind: "" })).toThrow();
  });
  it("accepts a bare kind", () => {
    expect(sourceRefSchema.parse({ kind: "operator_note" })).toMatchObject({
      kind: "operator_note",
    });
  });
  it("accepts rich source refs (evidence_id, conflicting_source_ids, ceremony_id)", () => {
    expect(
      sourceRefSchema.parse({
        kind: "conflict",
        conflicting_source_ids: [UUID, UUID2],
      }),
    ).toBeDefined();
    expect(
      sourceRefSchema.parse({
        kind: "operator_note",
        approval_kind: "ceremony",
        ceremony_id: "cer-1",
      }),
    ).toBeDefined();
  });
  it("rejects bad approval_kind values", () => {
    expect(() =>
      sourceRefSchema.parse({ kind: "x", approval_kind: "handshake" }),
    ).toThrow();
  });
});

describe("markSpineFieldStatusInput", () => {
  const base = {
    projectId: UUID,
    spine: "point-b" as const,
    fieldKey: "24_month_destination",
    status: "verified" as const,
    sourceRef: { kind: "operator_note" },
  };
  it("accepts a well-formed payload", () => {
    expect(markSpineFieldStatusInput.parse(base)).toBeDefined();
  });
  it("rejects invalid spine values", () => {
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, spine: "point-c" }),
    ).toThrow();
  });
  it("rejects empty and oversized fieldKey", () => {
    expect(() => markSpineFieldStatusInput.parse({ ...base, fieldKey: "" })).toThrow();
    expect(() =>
      markSpineFieldStatusInput.parse({ ...base, fieldKey: "x".repeat(201) }),
    ).toThrow();
  });
  it("rejects unknown status transitions at the schema layer", () => {
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
    signalId: UUID2,
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

describe("assertStatusAllowedForActor (R2)", () => {
  it("permits humans to write any status", () => {
    for (const s of EPISTEMIC_STATUSES) {
      expect(() => assertStatusAllowedForActor(s, "human")).not.toThrow();
    }
  });
  it("permits AI to write only the AI_WRITABLE_STATUSES", () => {
    for (const s of AI_WRITABLE_STATUSES) {
      expect(() => assertStatusAllowedForActor(s, "ai")).not.toThrow();
    }
  });
  it("blocks AI from writing stated / verified / contradicted / approved_truth", () => {
    for (const s of ["stated", "verified", "contradicted", "approved_truth"] as const) {
      expect(() => assertStatusAllowedForActor(s, "ai")).toThrow(/Forbidden status for AI actor/);
    }
  });
});

describe("assertEvidenceForStatus", () => {
  const opEmail = "op@example.com";

  it("stated — accepts human operator override", () => {
    expect(() =>
      assertEvidenceForStatus(
        "stated",
        { kind: "operator_note", operator_confirmed_by: opEmail },
        "human",
      ),
    ).not.toThrow();
  });

  it("stated — AI needs strict kind + id", () => {
    expect(() =>
      assertEvidenceForStatus("stated", { kind: "operator_note" }, "ai"),
    ).toThrow(/Insufficient evidence for status "stated"/);
    expect(() =>
      assertEvidenceForStatus("stated", { kind: "intake_answer", id: UUID }, "ai"),
    ).not.toThrow();
  });

  it("inferred — AI must supply model + prompt_ref", () => {
    expect(() =>
      assertEvidenceForStatus("inferred", { kind: "ai_inference" }, "ai"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "inferred",
        { kind: "ai_inference", model: "gemini", prompt_ref: "p:1" },
        "ai",
      ),
    ).not.toThrow();
  });

  it("assumed — requires rationale (or human override)", () => {
    expect(() =>
      assertEvidenceForStatus("assumed", { kind: "working_assumption" }, "ai"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "assumed",
        { kind: "working_assumption", rationale: "market default" },
        "ai",
      ),
    ).not.toThrow();
  });

  it("missing — accepts gap_note or human override", () => {
    expect(() =>
      assertEvidenceForStatus("missing", { kind: "gap_note" }, "ai"),
    ).not.toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "missing",
        { kind: "operator_note", operator_confirmed_by: opEmail },
        "human",
      ),
    ).not.toThrow();
  });

  it("contradicted — strict requires 2+ conflicting_source_ids", () => {
    expect(() =>
      assertEvidenceForStatus("contradicted", { kind: "conflict" }, "ai"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "contradicted",
        { kind: "conflict", conflicting_source_ids: [UUID] },
        "ai",
      ),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "contradicted",
        { kind: "conflict", conflicting_source_ids: [UUID, UUID2] },
        "ai",
      ),
    ).not.toThrow();
  });

  it("contradicted — human override needs a reason", () => {
    expect(() =>
      assertEvidenceForStatus(
        "contradicted",
        { kind: "conflict", operator_confirmed_by: opEmail },
        "human",
      ),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "contradicted",
        { kind: "conflict", operator_confirmed_by: opEmail, reason: "duplicate answer" },
        "human",
      ),
    ).not.toThrow();
  });

  it("needs_confirmation — reason or human override", () => {
    expect(() =>
      assertEvidenceForStatus("needs_confirmation", { kind: "operator_note" }, "ai"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "needs_confirmation",
        { kind: "operator_note", reason: "unclear" },
        "ai",
      ),
    ).not.toThrow();
  });

  it("verified — needs evidence_id OR (id + quote + timestamp) for AI", () => {
    expect(() =>
      assertEvidenceForStatus("verified", { kind: "any" }, "ai"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus("verified", { kind: "any", evidence_id: "ev-1" }, "ai"),
    ).not.toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "verified",
        { kind: "extracted_signal", id: UUID, quote: "yes", timestamp: "t" },
        "ai",
      ),
    ).not.toThrow();
  });

  it("approved_truth — requires ceremony_id OR operator override", () => {
    expect(() =>
      assertEvidenceForStatus("approved_truth", { kind: "operator_note" }, "human"),
    ).toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "approved_truth",
        { kind: "operator_note", approval_kind: "ceremony", ceremony_id: "cer-1" },
        "human",
      ),
    ).not.toThrow();
    expect(() =>
      assertEvidenceForStatus(
        "approved_truth",
        {
          kind: "operator_note",
          approval_kind: "operator_override",
          operator_confirmed_by: opEmail,
        },
        "human",
      ),
    ).not.toThrow();
  });
});

describe("field-key allowlist (spine drift guardrail)", () => {
  it("point-b accepts only the enumerated section keys", () => {
    for (const k of POINT_B_FIELD_KEYS) expect(isKnownSpineFieldKey("point-b", k)).toBe(true);
    expect(isKnownSpineFieldKey("point-b", "made_up")).toBe(false);
    expect(() => assertKnownFieldKey("point-b", "not_a_section")).toThrow(/Unknown point-b field key/);
  });

  it("point-a accepts base keys and the diagnosis:<title> namespace", () => {
    expect(isKnownSpineFieldKey("point-a", "lenses")).toBe(true);
    expect(isKnownSpineFieldKey("point-a", "diagnosis")).toBe(true);
    expect(isKnownSpineFieldKey("point-a", "key_diagnosis")).toBe(true);
    expect(isKnownSpineFieldKey("point-a", pointADiagnosisKey("Sales Constraint"))).toBe(true);
    expect(isKnownSpineFieldKey("point-a", "random_key")).toBe(false);
    expect(isKnownSpineFieldKey("point-a", "diagnosis:")).toBe(false);
  });
});

describe("enrichSourceRefForHuman", () => {
  it("injects operator_confirmed_by and a timestamp", () => {
    const enriched = enrichSourceRefForHuman({ kind: "operator_note" }, "op@x.com");
    expect(enriched.operator_confirmed_by).toBe("op@x.com");
    expect(typeof enriched.timestamp).toBe("string");
  });
  it("preserves client-supplied operator_confirmed_by and timestamp", () => {
    const enriched = enrichSourceRefForHuman(
      { kind: "operator_note", operator_confirmed_by: "orig@x.com", timestamp: "t0" },
      "other@x.com",
    );
    expect(enriched.operator_confirmed_by).toBe("orig@x.com");
    expect(enriched.timestamp).toBe("t0");
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

  it("throws when no email present on claims", async () => {
    await expect(assertAdminOrOperator(ctxFor(null, true, true))).rejects.toThrow(
      /authentication required/,
    );
  });
  it("returns email for admins", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("admin@example.com", true, false)),
    ).resolves.toBe("admin@example.com");
  });
  it("returns email for operators", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("op@example.com", false, true)),
    ).resolves.toBe("op@example.com");
  });
  it("rejects team members without either role", async () => {
    await expect(
      assertAdminOrOperator(ctxFor("team@example.com", false, false)),
    ).rejects.toThrow(/admin or operator role required/);
  });
});
