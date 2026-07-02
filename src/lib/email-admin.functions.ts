import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isOperatorEmail, isAdminEmail } from "@/lib/ops/access";

async function assertOps(context: {
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
  claims?: { email?: string } | null;
}) {
  const email = (context.claims?.email as string | undefined) ?? "";
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const op = await hasRoleForEmail(context.supabase, email, "operator");
  if (op) return;
  const admin = await hasRoleForEmail(context.supabase, email, "admin");
  if (admin) return;
  throw new Error("Forbidden");
}

export type EmailLogRow = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type EmailStats = {
  windowHours: number;
  totalUnique: number;
  sent: number;
  failed: number;
  dlq: number;
  suppressed: number;
  pending: number;
  failureRate: number;
  dlqDepth: { auth: number; transactional: number };
  topErrors: Array<{ error: string; count: number }>;
  templateBreakdown: Array<{ template: string; sent: number; failed: number; dlq: number }>;
};

export const getEmailStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ hours: z.number().int().min(1).max(720).optional() }).parse(raw ?? {}))
  .handler(async ({ context, data }): Promise<EmailStats> => {
    await assertOps(context);
    const windowHours = data.hours ?? 24;
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    const { data: rows } = await admin
      .from("email_send_log")
      .select("message_id,template_name,status,error_message,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const latestByMsg = new Map<string, typeof rows[number]>();
    for (const r of rows ?? []) {
      const key = r.message_id ?? `_row_${r.created_at}_${r.template_name}`;
      if (!latestByMsg.has(key)) latestByMsg.set(key, r);
    }
    const latest = Array.from(latestByMsg.values());

    let sent = 0, failed = 0, dlq = 0, suppressed = 0, pending = 0;
    const errorCounts = new Map<string, number>();
    const tplMap = new Map<string, { sent: number; failed: number; dlq: number }>();
    for (const r of latest) {
      if (r.status === "sent") sent++;
      else if (r.status === "failed") failed++;
      else if (r.status === "dlq") dlq++;
      else if (r.status === "suppressed") suppressed++;
      else if (r.status === "pending") pending++;
      const t = tplMap.get(r.template_name) ?? { sent: 0, failed: 0, dlq: 0 };
      if (r.status === "sent") t.sent++;
      else if (r.status === "failed") t.failed++;
      else if (r.status === "dlq") t.dlq++;
      tplMap.set(r.template_name, t);
      if ((r.status === "failed" || r.status === "dlq") && r.error_message) {
        const key = (r.error_message as string).slice(0, 160);
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      }
    }

    const [{ data: dlqTx }, { data: dlqAuth }] = await Promise.all([
      admin.rpc("admin_list_email_dlq", { _queue: "transactional_emails_dlq", _limit: 500 }),
      admin.rpc("admin_list_email_dlq", { _queue: "auth_emails_dlq", _limit: 500 }),
    ]);

    return {
      windowHours,
      totalUnique: latest.length,
      sent, failed, dlq, suppressed, pending,
      failureRate: latest.length ? +((dlq + failed) / latest.length * 100).toFixed(1) : 0,
      dlqDepth: { auth: dlqAuth?.length ?? 0, transactional: dlqTx?.length ?? 0 },
      topErrors: Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([error, count]) => ({ error, count })),
      templateBreakdown: Array.from(tplMap.entries())
        .map(([template, v]) => ({ template, ...v }))
        .sort((a, b) => (b.failed + b.dlq) - (a.failed + a.dlq))
        .slice(0, 20),
    };
  });

export const listEmailFailures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      hours: z.number().int().min(1).max(720).optional(),
      status: z.enum(["dlq", "failed", "all"]).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).parse(raw ?? {}),
  )
  .handler(async ({ context, data }): Promise<EmailLogRow[]> => {
    await assertOps(context);
    const hours = data.hours ?? 168;
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    let q = admin
      .from("email_send_log")
      .select("id,message_id,template_name,recipient_email,status,error_message,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    const statusFilter = data.status ?? "all";
    if (statusFilter === "dlq") q = q.eq("status", "dlq");
    else if (statusFilter === "failed") q = q.in("status", ["failed", "dlq"]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as EmailLogRow[];
  });

export type DlqMessage = {
  msg_id: number;
  enqueued_at: string;
  read_ct: number;
  queue: "auth_emails_dlq" | "transactional_emails_dlq";
  recipient: string | null;
  template: string | null;
  message_id: string | null;
  subject: string | null;
  has_unsubscribe_token: boolean;
};

export const listEmailDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({}).parse(raw ?? {}))
  .handler(async ({ context }): Promise<DlqMessage[]> => {
    await assertOps(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const out: DlqMessage[] = [];
    for (const queue of ["transactional_emails_dlq", "auth_emails_dlq"] as const) {
      const { data, error } = await admin.rpc("admin_list_email_dlq", { _queue: queue, _limit: 200 });
      if (error) continue;
      for (const row of data ?? []) {
        const m = row.message ?? {};
        out.push({
          msg_id: row.msg_id,
          enqueued_at: row.enqueued_at,
          read_ct: row.read_ct,
          queue,
          recipient: m.to ?? null,
          template: m.label ?? null,
          message_id: m.message_id ?? null,
          subject: m.subject ?? null,
          has_unsubscribe_token: Boolean(m.unsubscribe_token),
        });
      }
    }
    return out.sort((a, b) => b.enqueued_at.localeCompare(a.enqueued_at));
  });

export const retryEmailFromDlq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      dlq: z.enum(["auth_emails_dlq", "transactional_emails_dlq"]),
      msg_id: z.number().int(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; new_msg_id: number }> => {
    await assertOps(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: newId, error } = await admin.rpc("admin_retry_email_dlq", {
      _dlq: data.dlq,
      _msg_id: data.msg_id,
    });
    if (error) throw new Error(error.message);
    return { ok: true, new_msg_id: newId as number };
  });

export const retryEmailByMessageId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ message_id: z.string().min(1) }).parse(raw))
  .handler(async ({ context, data }): Promise<{ ok: true; new_msg_id: number }> => {
    await assertOps(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    // Find in either DLQ by message payload
    for (const queue of ["transactional_emails_dlq", "auth_emails_dlq"] as const) {
      const { data: rows } = await admin.rpc("admin_list_email_dlq", { _queue: queue, _limit: 500 });
      const hit = (rows ?? []).find((r: { message: { message_id?: string } }) => r.message?.message_id === data.message_id);
      if (hit) {
        const { data: newId, error } = await admin.rpc("admin_retry_email_dlq", {
          _dlq: queue,
          _msg_id: hit.msg_id,
        });
        if (error) throw new Error(error.message);
        return { ok: true, new_msg_id: newId as number };
      }
    }
    throw new Error("Message not found in DLQ");
  });
