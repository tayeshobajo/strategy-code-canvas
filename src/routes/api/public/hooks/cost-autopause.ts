// Phase H1 — Cost-overrun auto-pause notification hook.
//
// External caller: the `tg_engine_agent_costs_cap_guard` DB trigger POSTs
// here via pg_net after it auto-pauses a project (see the enhanced trigger
// proposed in `.orchestrator/PENDING_MIGRATIONS.md`).
//
// Dispatches:
//   1. Slack post to SLACK_WEBHOOK_URL if set (graceful skip otherwise).
//   2. One email per operator/admin address, using the `cost-overrun-autopause`
//      template routed through the shared transactional queue.
//
// Idempotency: keyed by `cost.autopause:<projectId>:<pausedAt>` so a retried
// trigger post does not double-alert.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { OPERATOR_EMAILS, ADMIN_EMAILS } from "@/lib/ops/access";

const PayloadSchema = z.object({
  project_id: z.string().uuid(),
  project_name: z.string().min(1).max(240),
  spend_cents: z.number().int().nonnegative(),
  budget_cents: z.number().int().nonnegative(),
  reason: z.string().min(1).max(1000),
  paused_at: z.string().min(1),
});

async function postSlack(
  webhookUrl: string,
  payload: z.infer<typeof PayloadSchema>,
): Promise<boolean> {
  try {
    const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
    const text =
      `:rotating_light: *Cost Guard auto-pause* — ${payload.project_name}\n` +
      `MTD spend *${fmt(payload.spend_cents)}* exceeded budget *${fmt(payload.budget_cents)}*.\n` +
      `Paused at ${payload.paused_at}. Reason: ${payload.reason}\n` +
      `Project: \`${payload.project_id}\` — Resume: https://trusttai.com/admin/cost-guard`;
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch (err) {
    console.error("cost-autopause slack post failed", err);
    return false;
  }
}

export const Route = createFileRoute("/api/public/hooks/cost-autopause")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let payload: z.infer<typeof PayloadSchema>;
        try {
          const raw = await request.json();
          payload = PayloadSchema.parse(raw);
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: "invalid_payload",
              detail: err instanceof Error ? err.message : String(err),
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const slackUrl = process.env.SLACK_WEBHOOK_URL ?? "";
        const slackNotified = slackUrl ? await postSlack(slackUrl, payload) : false;

        const recipients = Array.from(
          new Set([...OPERATOR_EMAILS, ...ADMIN_EMAILS].map((e) => e.toLowerCase())),
        );

        const { enqueueTransactionalEmail } = await import(
          "@/lib/email/enqueue-transactional.server"
        );

        const idempotencyBase = `cost.autopause:${payload.project_id}:${payload.paused_at}`;
        const emailResults: Array<{ to: string; queued: boolean; reason?: string }> = [];
        for (const to of recipients) {
          try {
            const r = await enqueueTransactionalEmail({
              templateName: "cost-overrun-autopause",
              recipientEmail: to,
              idempotencyKey: `${idempotencyBase}:${to}`,
              templateData: {
                projectName: payload.project_name,
                projectId: payload.project_id,
                spendCents: payload.spend_cents,
                budgetCents: payload.budget_cents,
                reason: payload.reason,
                pausedAt: payload.paused_at,
                slackNotified,
              },
              metadata: {
                source: "cost_guard_autopause",
                project_id: payload.project_id,
                paused_at: payload.paused_at,
              },
            });
            emailResults.push({ to, queued: r.queued, reason: r.reason });
          } catch (err) {
            emailResults.push({
              to,
              queued: false,
              reason: err instanceof Error ? err.message : "enqueue_failed",
            });
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            slack_notified: slackNotified,
            slack_configured: Boolean(slackUrl),
            emails: emailResults,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
