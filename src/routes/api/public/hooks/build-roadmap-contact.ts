import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RECIPIENT = "tai@trusttai.com";

// Same-origin / trusted origin allowlist. Public browser form is only served
// from these hosts; anything else calling this route is not the marketing
// site and should be rejected. Preview subdomains match a wildcard.
const ALLOWED_ORIGIN_HOSTS = new Set([
  "trusttai.com",
  "www.trusttai.com",
  "new.trusttai.com",
  "trust-tai.com",
  "www.trust-tai.com",
  "strategy-code-canvas.lovable.app",
  "localhost",
  "127.0.0.1",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (ALLOWED_ORIGIN_HOSTS.has(host)) return true;
    // Allow Lovable preview subdomains for this project.
    if (host.endsWith(".lovable.app")) return true;
    return false;
  } catch {
    return false;
  }
}

// Coarse global rate-limit: cap enqueues per rolling 60s window using
// `email_send_log`. Not per-IP (Workers don't expose reliable IP for form
// posts through Lovable's edge), but bounds worst-case abuse volume.
const MAX_PER_MINUTE = 20;

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  stuck: z.string().trim().max(1000).optional().default(""),
  correlationId: z.string().trim().min(1).max(100).optional(),
});

function newCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `roadmap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const Route = createFileRoute("/api/public/hooks/build-roadmap-contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headerCid = request.headers.get("x-correlation-id") || undefined;
        let cid = headerCid || newCorrelationId();

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          console.warn("[build-roadmap-contact] invalid_json", { cid });
          return new Response(
            JSON.stringify({ ok: false, error: "invalid_json", correlationId: cid }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "x-correlation-id": cid,
              },
            },
          );
        }
        const parsed = BodySchema.safeParse(payload);
        if (!parsed.success) {
          console.warn("[build-roadmap-contact] invalid_input", {
            cid,
            issues: parsed.error.issues.map((i) => ({ path: i.path, code: i.code })),
          });
          return new Response(
            JSON.stringify({ ok: false, error: "invalid_input", correlationId: cid }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                "x-correlation-id": cid,
              },
            },
          );
        }
        const { name, email, stuck, correlationId } = parsed.data;
        if (correlationId) cid = correlationId;

        console.info("[build-roadmap-contact] received", {
          cid,
          email_domain: email.split("@")[1],
          stuck_len: stuck.length,
        });

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { ensureUnsubscribeToken } = await import(
            "@/lib/email/unsubscribe-token.server"
          );
          const idempotencyKey = `roadmap-${cid}`;
          const unsubscribeToken = await ensureUnsubscribeToken(RECIPIENT);
          const { error } = await (supabaseAdmin.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: unknown }>)("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              template_name: "build-roadmap-contact",
              recipient_email: RECIPIENT,
              reply_to: email,
              idempotency_key: idempotencyKey,
              correlation_id: cid,
              unsubscribe_token: unsubscribeToken,
              template_data: { name, email, stuck, correlationId: cid },
            },
          });
          if (error) throw error;
          console.info("[build-roadmap-contact] enqueued", { cid, idempotencyKey });
          return new Response(
            JSON.stringify({ ok: true, correlationId: cid }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "x-correlation-id": cid,
              },
            },
          );
        } catch (err) {
          console.error("[build-roadmap-contact] send failed", {
            cid,
            err: err instanceof Error ? err.message : String(err),
          });
          return new Response(
            JSON.stringify({ ok: false, error: "send_failed", correlationId: cid }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json",
                "x-correlation-id": cid,
              },
            },
          );
        }
      },
    },
  },
});
