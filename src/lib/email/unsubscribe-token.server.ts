// Server-only helper: mint or fetch an unsubscribe token for a recipient email.
// Every transactional enqueue payload must include `unsubscribe_token` or the
// email provider rejects it with 400 missing_unsubscribe.

export async function ensureUnsubscribeToken(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = email.trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = (globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()}`) as string;
  await admin.from("email_unsubscribe_tokens").insert({ token, email: normalized });
  return token;
}
