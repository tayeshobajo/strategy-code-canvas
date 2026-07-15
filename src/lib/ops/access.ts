// Trust Tai role gates.
//
// Roles now live in `public.user_roles` (with the `app_role` enum). This module
// keeps a small email allowlist as a fallback so client-side gates (like the
// /ops route beforeLoad and header rendering) stay synchronous, and exposes an
// async DB-backed check for server functions that already have a Supabase
// client on hand.

export const OPERATOR_EMAILS: ReadonlyArray<string> = [
  "tai@trusttai.com",
  "henry@trusttai.com",
  // Legacy aliases retained for backward compatibility.
  "tai@trust-tai.com",
  "henry@trust-tai.com",
];

export const ADMIN_EMAILS: ReadonlyArray<string> = [
  "hello@trusttai.com",
  "tai@trusttai.com",
  "henry@trusttai.com",
  "hello@trust-tai.com",
  "tai@trust-tai.com",
  "henry@trust-tai.com",
];

// Recipients for operator ALERT emails (intake submitted, cost autopause, …).
// Deliberately narrower than ADMIN_EMAILS/OPERATOR_EMAILS: the access lists
// include multiple aliases (tai@, hello@, henry@, legacy trust-tai.com
// variants) that all forward to the same inbox, which caused duplicate
// alerts. Alerts go to a single canonical address; internal forwarding rules
// handle team distribution. Access control (who can open /ops) is
// unaffected — that still uses ADMIN_EMAILS/OPERATOR_EMAILS.
export const OPERATOR_NOTIFICATION_EMAILS: ReadonlyArray<string> = [
  "hello@trusttai.com",
];

export function isOperatorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return OPERATOR_EMAILS.includes(email.trim().toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export type AppRole = "admin" | "operator" | "user";

// DB-backed role check. Returns true if the email is in the sync allowlist OR
// has the role in `public.user_roles`. Accepts any Supabase-shaped client that
// exposes `.rpc()` — server functions pass their `context.supabase`.
export async function hasRoleForEmail(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  email: string | null | undefined,
  role: AppRole,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (role === "operator" && isOperatorEmail(normalized)) return true;
  if (role === "admin" && isAdminEmail(normalized)) return true;
  try {
    const { data, error } = await supabase.rpc("has_role_email", {
      _email: normalized,
      _role: role,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
