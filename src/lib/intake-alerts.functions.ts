// Admin-only view of the operator alerts fanned out for a given intake
// submission, plus a manual resend action that uses the same
// per-recipient idempotency key. Because the underlying
// `enqueueTransactionalEmail` refuses to enqueue a second `pending` or
// `sent` row with the same `idempotency_key`, retrying a healthy send is
// a no-op.

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

async function requireAdmin(
  claims: Claims,
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
): Promise<string> {
  const email = emailFromClaims(claims);
  if (!email) throw new Error("Forbidden: admin access required");
  const ok = await hasRoleForEmail(supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin access required");
  return email;
}

export type IntakeAlertRecipient = {
  recipient_email: string;
  idempotency_key: string;
  latest_status: string;
  latest_at: string;
  attempts: number;
  message_id: string | null;
  error_message: string | null;
};

export type IntakeAlertReport = {
  submission_id: string;
  submission_summary: {
    name: string | null;
    business: string | null;
    email: string | null;
    submitted_at: string | null;
  } | null;
  notification_created_at: string | null;
  recipients: IntakeAlertRecipient[];
};

const GetInput = z.object({ submission_id: z.string().uuid().optional() });

/**
 * Report on the operator alerts sent for one intake. If `submission_id`
 * is omitted, defaults to the most recent intake notification.
 */
export const getIntakeAlertReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireAdmin>[1],
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve submission id from the latest intake notification if not given.
    let submissionId = data.submission_id ?? null;
    let notificationCreatedAt: string | null = null;
    if (!submissionId) {
      const { data: notifRow } = await supabaseAdmin
        .from("operator_notifications")
        .select("submission_id, created_at")
        .eq("kind", "intake_submitted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      submissionId = (notifRow as { submission_id: string | null } | null)?.submission_id ?? null;
      notificationCreatedAt =
        (notifRow as { created_at: string | null } | null)?.created_at ?? null;
    } else {
      const { data: notifRow } = await supabaseAdmin
        .from("operator_notifications")
        .select("created_at")
        .eq("submission_id", submissionId)
        .eq("kind", "intake_submitted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      notificationCreatedAt =
        (notifRow as { created_at: string | null } | null)?.created_at ?? null;
    }

    if (!submissionId) {
      return {
        submission_id: "",
        submission_summary: null,
        notification_created_at: null,
        recipients: [],
      } satisfies IntakeAlertReport;
    }

    const { data: logRows, error: logErr } = await supabaseAdmin
      .from("email_send_log")
      .select("recipient_email, status, created_at, message_id, error_message, metadata")
      .eq("template_name", "intake-submission-operator-alert")
      .contains("metadata", { submission_id: submissionId })
      .order("created_at", { ascending: false })
      .limit(500);
    if (logErr) {
      console.error("[intake-alerts.report] log query failed", logErr);
      throw new Error("Could not load alert history");
    }

    type LogRow = {
      recipient_email: string;
      status: string;
      created_at: string;
      message_id: string | null;
      error_message: string | null;
      metadata: { idempotency_key?: string } | null;
    };

    // Group by idempotency_key so retries of the same recipient collapse.
    const groups = new Map<string, IntakeAlertRecipient>();
    for (const raw of (logRows ?? []) as LogRow[]) {
      const key = raw.metadata?.idempotency_key ??
        `intake-alert-${submissionId}-${raw.recipient_email.toLowerCase()}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          recipient_email: raw.recipient_email,
          idempotency_key: key,
          latest_status: raw.status,
          latest_at: raw.created_at,
          attempts: 1,
          message_id: raw.message_id,
          error_message: raw.error_message,
        });
      } else {
        existing.attempts += 1;
        // rows are sorted DESC — existing already holds the latest.
      }
    }

    // Look up submission summary via intake project client (best-effort).
    let summary: IntakeAlertReport["submission_summary"] = null;
    try {
      const { getIntakeClient } = await import("@/integrations/intake/client.server");
      const intake = getIntakeClient();
      const { data: subRow } = await intake
        .from("intake_submissions")
        .select("name, business, email, submitted_at")
        .eq("id", submissionId)
        .maybeSingle();
      if (subRow) {
        const s = subRow as {
          name: string | null;
          business: string | null;
          email: string | null;
          submitted_at: string | null;
        };
        summary = {
          name: s.name,
          business: s.business,
          email: s.email,
          submitted_at: s.submitted_at,
        };
      }
    } catch (e) {
      console.warn("[intake-alerts.report] summary lookup skipped", e);
    }

    return {
      submission_id: submissionId,
      submission_summary: summary,
      notification_created_at: notificationCreatedAt,
      recipients: Array.from(groups.values()).sort((a, b) =>
        a.recipient_email.localeCompare(b.recipient_email),
      ),
    } satisfies IntakeAlertReport;
  });

const ResendInput = z.object({
  submission_id: z.string().uuid(),
  recipient_email: z.string().email(),
});

/**
 * Manual resend for a single recipient. Uses the exact same
 * `idempotency_key` as the original fanout, so a resend is a no-op when
 * the previous attempt is still pending or already sent — protecting
 * operators from double-alerts even if this button is clicked twice.
 */
export const resendIntakeOperatorAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResendInput.parse(input))
  .handler(async ({ data, context }) => {
    const adminEmail = await requireAdmin(
      context.claims as Claims,
      context.supabase as unknown as Parameters<typeof requireAdmin>[1],
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueTransactionalEmail } = await import("@/lib/email/enqueue-transactional.server");
    const { absoluteUrl } = await import("@/lib/site-url");

    // Rehydrate template data from the intake submission so the resent
    // email has current context, not a stale snapshot.
    const { getIntakeClient } = await import("@/integrations/intake/client.server");
    const intake = getIntakeClient();
    const { data: subRow, error: subErr } = await intake
      .from("intake_submissions")
      .select("id, name, business, email, website, answers, submitted_at")
      .eq("id", data.submission_id)
      .maybeSingle();
    if (subErr || !subRow) throw new Error("Submission not found");

    const s = subRow as {
      id: string;
      name: string;
      business: string | null;
      email: string;
      website: string | null;
      answers: Array<{ key: string; response: string }> | null;
      submitted_at: string | null;
    };

    const answerMap = new Map<string, string>();
    for (const a of s.answers ?? []) {
      if (a && typeof a.key === "string") answerMap.set(a.key, String(a.response ?? ""));
    }

    const recipient = data.recipient_email.trim().toLowerCase();
    const idempotencyKey = `intake-alert-${s.id}-${recipient}`;

    const result = await enqueueTransactionalEmail({
      templateName: "intake-submission-operator-alert",
      recipientEmail: recipient,
      idempotencyKey,
      metadata: {
        submission_id: s.id,
        kind: "intake_submission_operator_alert",
        resent_by: adminEmail,
      },
      templateData: {
        founderName: s.name,
        business: s.business,
        founderEmail: s.email,
        website: s.website,
        role: answerMap.get("role") ?? null,
        timeline: answerMap.get("timeline") ?? null,
        replyPreference: answerMap.get("reply_preference") ?? null,
        submittedAt: s.submitted_at ?? new Date().toISOString(),
        reviewUrl: absoluteUrl(`/ops/submissions/${s.id}`),
        queueUrl: absoluteUrl(`/ops/queue`),
        attachmentCount: 0,
      },
    });

    // Audit line so admins can see who kicked the resend.
    try {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: crypto.randomUUID(),
        template_name: "intake-submission-operator-alert",
        recipient_email: recipient,
        status: result.queued ? "pending" : "suppressed",
        error_message: result.queued
          ? null
          : `resend skipped: ${result.reason ?? "unknown"}`,
        metadata: {
          idempotency_key: idempotencyKey,
          submission_id: s.id,
          resend_action: true,
          resent_by: adminEmail,
        } as unknown as never,
      });
    } catch (auditErr) {
      console.warn("[intake-alerts.resend] audit insert warned", auditErr);
    }

    return {
      queued: result.queued,
      reason: result.reason ?? null,
      idempotency_key: idempotencyKey,
    };
  });
