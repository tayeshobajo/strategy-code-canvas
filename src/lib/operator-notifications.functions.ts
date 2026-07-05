// Operator in-app notifications: server functions.
//
// Backs the notification bell rendered in the /ops layout. Data lives in
// public.operator_notifications (event fanout) + public.operator_notification_reads
// (per-operator read state). Every fn goes through requireSupabaseAuth + a
// role check so nothing here is reachable from public / anon callers.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "./ops/access";

type Claims = Record<string, unknown> | undefined;

function emailFromClaims(claims: Claims): string | null {
  if (!claims) return null;
  const raw = (claims.email ??
    (claims as { user_metadata?: { email?: string } }).user_metadata?.email) as
    | string
    | undefined;
  return raw ? raw.trim().toLowerCase() : null;
}

async function requireOperator(
  claims: Claims,
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): Promise<{ email: string }> {
  const email = emailFromClaims(claims);
  if (!email) throw new Error("Forbidden: operator access required");
  const ok =
    (await hasRoleForEmail(supabase, email, "operator")) ||
    (await hasRoleForEmail(supabase, email, "admin"));
  if (!ok) throw new Error("Forbidden: operator access required");
  return { email };
}

export type OperatorNotification = {
  id: string;
  kind: string;
  submission_id: string | null;
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  read_at: string | null;
};

const ListInput = z.object({
  limit: z.number().int().positive().max(100).default(50),
  unread_only: z.boolean().default(false),
});

export const listOperatorNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { email } = await requireOperator(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireOperator>[1],
    );

    const { data: rows, error } = await context.supabase
      .from("operator_notifications")
      .select("id, kind, submission_id, title, body, href, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) {
      console.error("[operator-notifications.list] failed", error);
      throw new Error("Could not load notifications");
    }

    const ids = (rows ?? []).map((r) => (r as { id: string }).id);
    let readMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: reads } = await context.supabase
        .from("operator_notification_reads")
        .select("notification_id, read_at")
        .eq("email", email)
        .in("notification_id", ids);
      readMap = new Map(
        (reads ?? []).map((r) => [
          (r as { notification_id: string }).notification_id,
          (r as { read_at: string }).read_at,
        ]),
      );
    }

    const items: OperatorNotification[] = (rows ?? []).map((raw) => {
      const r = raw as {
        id: string;
        kind: string;
        submission_id: string | null;
        title: string;
        body: string | null;
        href: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      };
      return {
        id: r.id,
        kind: r.kind,
        submission_id: r.submission_id,
        title: r.title,
        body: r.body,
        href: r.href,
        metadata: r.metadata ?? {},
        created_at: r.created_at,
        read_at: readMap.get(r.id) ?? null,
      };
    });
    const unread = items.filter((n) => n.read_at === null).length;

    let filtered = items;
    if (data.unread_only) filtered = items.filter((n) => n.read_at === null);
    return { items: filtered, unread };
  });

const MarkInput = z.object({ id: z.string().uuid() });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MarkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { email } = await requireOperator(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireOperator>[1],
    );
    const { error } = await context.supabase
      .from("operator_notification_reads")
      .upsert(
        { notification_id: data.id, email, read_at: new Date().toISOString() },
        { onConflict: "notification_id,email" },
      );
    if (error) {
      console.error("[operator-notifications.markRead] failed", error);
      throw new Error("Could not mark notification read");
    }
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { email } = await requireOperator(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireOperator>[1],
    );
    const { data: rows, error } = await context.supabase
      .from("operator_notifications")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Could not load notifications");
    const ids = (rows ?? []).map((r) => (r as { id: string }).id);
    if (ids.length === 0) return { ok: true as const, marked: 0 };
    const now = new Date().toISOString();
    const { error: upErr } = await context.supabase
      .from("operator_notification_reads")
      .upsert(
        ids.map((id) => ({ notification_id: id, email, read_at: now })),
        { onConflict: "notification_id,email" },
      );
    if (upErr) throw new Error("Could not mark notifications read");
    return { ok: true as const, marked: ids.length };
  });
