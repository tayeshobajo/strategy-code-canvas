import { describe, it, expect, vi } from "vitest";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "./access";

type RpcCall = { fn: string; args: Record<string, unknown> };

function mockClient(response: { data: unknown; error: unknown } | ((call: RpcCall) => { data: unknown; error: unknown })) {
  const calls: RpcCall[] = [];
  return {
    calls,
    supabase: {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        const call = { fn, args };
        calls.push(call);
        return typeof response === "function" ? response(call) : response;
      }),
    },
  };
}

describe("isOperatorEmail / isAdminEmail (sync allowlist)", () => {
  it("accepts allow-listed operator emails", () => {
    expect(isOperatorEmail("tai@trusttai.com")).toBe(true);
    expect(isOperatorEmail("henry@trusttai.com")).toBe(true);
    // legacy alias
    expect(isOperatorEmail("henry@trust-tai.com")).toBe(true);
  });
  it("rejects unknown operators", () => {
    expect(isOperatorEmail("random@example.com")).toBe(false);
    expect(isOperatorEmail(null)).toBe(false);
    expect(isOperatorEmail(undefined)).toBe(false);
    expect(isOperatorEmail("")).toBe(false);
  });
  it("accepts allow-listed admin emails", () => {
    expect(isAdminEmail("hello@trusttai.com")).toBe(true);
    expect(isAdminEmail("hello@trust-tai.com")).toBe(true);
    expect(isAdminEmail("nope@example.com")).toBe(false);
  });
  it("normalizes case + whitespace", () => {
    expect(isOperatorEmail(" TAI@Trusttai.COM ")).toBe(true);
    expect(isAdminEmail("  Hello@TrustTai.com ")).toBe(true);
  });
});

describe("hasRoleForEmail (allowlist + DB)", () => {
  it("returns false on empty email without hitting DB", async () => {
    const m = mockClient({ data: true, error: null });
    expect(await hasRoleForEmail(m.supabase, null, "admin")).toBe(false);
    expect(await hasRoleForEmail(m.supabase, "", "operator")).toBe(false);
    expect(await hasRoleForEmail(m.supabase, undefined, "user")).toBe(false);
    expect(m.supabase.rpc).not.toHaveBeenCalled();
  });

  it("short-circuits true for allow-listed operator without DB call", async () => {
    const m = mockClient({ data: false, error: null });
    expect(await hasRoleForEmail(m.supabase, "tai@trusttai.com", "operator")).toBe(true);
    expect(m.supabase.rpc).not.toHaveBeenCalled();
  });

  it("short-circuits true for allow-listed admin without DB call", async () => {
    const m = mockClient({ data: false, error: null });
    expect(await hasRoleForEmail(m.supabase, "hello@trusttai.com", "admin")).toBe(true);
    expect(m.supabase.rpc).not.toHaveBeenCalled();
  });

  it("falls back to DB and returns true when RPC returns true", async () => {
    const m = mockClient({ data: true, error: null });
    const ok = await hasRoleForEmail(m.supabase, "new-op@example.com", "operator");
    expect(ok).toBe(true);
    expect(m.calls[0].fn).toBe("has_role_email");
    expect(m.calls[0].args).toEqual({ _email: "new-op@example.com", _role: "operator" });
  });

  it("returns false when RPC returns false", async () => {
    const m = mockClient({ data: false, error: null });
    expect(await hasRoleForEmail(m.supabase, "not-a-role@example.com", "admin")).toBe(false);
  });

  it("returns false when RPC errors (RLS denied / not found)", async () => {
    const m = mockClient({ data: null, error: { message: "permission denied" } });
    expect(await hasRoleForEmail(m.supabase, "someone@example.com", "operator")).toBe(false);
  });

  it("returns false when RPC throws", async () => {
    const supabase = {
      rpc: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    expect(await hasRoleForEmail(supabase, "someone@example.com", "admin")).toBe(false);
  });

  it("normalizes email before RPC lookup", async () => {
    const m = mockClient({ data: true, error: null });
    await hasRoleForEmail(m.supabase, "  Mixed@Case.COM  ", "user");
    expect(m.calls[0].args).toEqual({ _email: "mixed@case.com", _role: "user" });
  });

  it("does not treat allow-listed operator as admin (role scoped)", async () => {
    // Allow-list applies per-role. tai@ is on the operator list; asking for
    // admin should still fall back to DB.
    const m = mockClient({ data: false, error: null });
    const ok = await hasRoleForEmail(m.supabase, "henry@trusttai.com", "admin");
    expect(ok).toBe(false); // hello@ is admin, henry@ is operator only
    // hello@ short-circuits true for admin
    const m2 = mockClient({ data: false, error: null });
    expect(await hasRoleForEmail(m2.supabase, "hello@trusttai.com", "admin")).toBe(true);
  });

  it("returns false for the 'user' role unless DB confirms", async () => {
    const yes = mockClient({ data: true, error: null });
    const no = mockClient({ data: false, error: null });
    expect(await hasRoleForEmail(yes.supabase, "tai@trusttai.com", "user")).toBe(true);
    expect(await hasRoleForEmail(no.supabase, "tai@trusttai.com", "user")).toBe(false);
  });
});
