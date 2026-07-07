/**
 * Behavioral role-rejection tests (Audit V3 HIGH #8).
 *
 * Every previous test was a static source-regex scan. This suite actually
 * invokes the gate functions with a mocked Supabase context and asserts
 * that non-admin / non-operator emails are rejected.
 *
 * The functions tested protect all six sacred transitions:
 *   - decideReviewItem (version approval)
 *   - transitionDelivery (sent/execution)
 *   - approvePreview
 *   - publishVersionToPortal
 *   - sendProjectDelivery
 *   - startExecutionEngagement
 *
 * Mock strategy: `hasRoleForEmail` checks the static allowlist first
 * (ADMIN_EMAILS / OPERATOR_EMAILS in access.ts), then falls back to an
 * RPC call. We use emails NOT in those lists and mock the RPC to return
 * false — simulating a DB-granted-only operator or an unknown user.
 */
import { describe, it, expect } from "vitest";
import { assertAdminEmail, assertOps } from "@/lib/engine-ops.functions";
import { assertAdmin } from "@/lib/engine-execution.functions";

/** A non-admin, non-operator email that will miss both allowlists. */
const OUTSIDER_EMAIL = "outsider@example.com";

/** A DB-only operator: not in the allowlist, RPC says they're an operator. */
const DB_OPERATOR_EMAIL = "db-operator@example.com";

/**
 * Mock Supabase client. `hasRoleForEmail` calls `supabase.rpc("has_role_email", ...)`.
 * We return false for admin checks on both outsider and DB-operator emails,
 * and true only for operator checks on the DB-operator email.
 */
function makeMockSupabase(actorEmail: string) {
  return {
    rpc: async (_fn: string, args?: Record<string, unknown>) => {
      const role = args?._role as string;
      const email = args?._email as string;
      if (email === DB_OPERATOR_EMAIL && role === "operator") {
        return { data: true, error: null };
      }
      // Everything else: not authorized
      return { data: false, error: null };
    },
    // Stub the `.from()` chain used by server functions that might
    // run past the gate (they shouldn't, but the mock needs to exist).
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }), maybeSingle: async () => ({ data: null, error: null }) }),
        in: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
      insert: async () => ({ data: null, error: null }),
      update: async () => ({ data: null, error: null }),
      delete: async () => ({ data: null, error: null }),
    }),
  };
}

function makeContext(email: string) {
  return {
    claims: { email },
    supabase: makeMockSupabase(email),
  };
}

describe("Behavioral role-rejection — assertAdminEmail (engine-ops)", () => {
  it("throws for an outsider email", async () => {
    await expect(assertAdminEmail(makeContext(OUTSIDER_EMAIL))).rejects.toThrow(
      "Forbidden: admin role required",
    );
  });

  it("throws for a DB-only operator (operator but NOT admin)", async () => {
    await expect(assertAdminEmail(makeContext(DB_OPERATOR_EMAIL))).rejects.toThrow(
      "Forbidden: admin role required",
    );
  });

  it("allows a known admin email (allowlist)", async () => {
    // tai@trusttai.com is in ADMIN_EMAILS — should pass without RPC
    const ctx = makeContext("tai@trusttai.com");
    const result = await assertAdminEmail(ctx);
    expect(result).toBe("tai@trusttai.com");
  });
});

describe("Behavioral role-rejection — assertOps (engine-ops)", () => {
  it("throws for an outsider email", async () => {
    await expect(assertOps(makeContext(OUTSIDER_EMAIL))).rejects.toThrow(
      "Forbidden: admin or operator role required",
    );
  });

  it("allows a DB-only operator", async () => {
    const result = await assertOps(makeContext(DB_OPERATOR_EMAIL));
    expect(result).toBe(DB_OPERATOR_EMAIL);
  });

  it("allows a known admin email (allowlist)", async () => {
    const result = await assertOps(makeContext("henry@trusttai.com"));
    expect(result).toBe("henry@trusttai.com");
  });
});

describe("Behavioral role-rejection — assertAdmin (engine-execution)", () => {
  it("throws for an outsider email", async () => {
    await expect(assertAdmin(makeContext(OUTSIDER_EMAIL))).rejects.toThrow(
      "Forbidden: admin role required",
    );
  });

  it("throws for a DB-only operator", async () => {
    await expect(assertAdmin(makeContext(DB_OPERATOR_EMAIL))).rejects.toThrow(
      "Forbidden: admin role required",
    );
  });

  it("allows a known admin email (allowlist)", async () => {
    // Should not throw
    await assertAdmin(makeContext("tai@trusttai.com"));
  });
});

/**
 * The ADMIN_APPROVAL_TYPES gate inside decideReviewItem is the second layer
 * of defense: even if an operator passes assertOps, they cannot approve a
 * roadmap version. This is the specific scenario the audit flagged.
 *
 * We can't easily invoke the full createServerFn handler in a unit test,
 * but we CAN verify the gate logic by checking that hasRoleForEmail returns
 * false for operator-level access on a DB-only operator when asking for
 * "admin" role — which is exactly what the inline gate at
 * engine-ops.functions.ts:276-283 does.
 */
describe("ADMIN_APPROVAL_TYPES gate — operator cannot approve roadmap versions", () => {
  it("a DB-only operator fails the admin role check", async () => {
    // This is the exact check the inline gate runs
    const { hasRoleForEmail } = await import("@/lib/ops/access");
    const mockSb = makeMockSupabase(DB_OPERATOR_EMAIL);
    const isAdmin = await hasRoleForEmail(
      mockSb as never,
      DB_OPERATOR_EMAIL,
      "admin",
    );
    expect(isAdmin).toBe(false);
  });

  it("a DB-only operator passes the operator role check", async () => {
    const { hasRoleForEmail } = await import("@/lib/ops/access");
    const mockSb = makeMockSupabase(DB_OPERATOR_EMAIL);
    const isOperator = await hasRoleForEmail(
      mockSb as never,
      DB_OPERATOR_EMAIL,
      "operator",
    );
    expect(isOperator).toBe(true);
  });
});
