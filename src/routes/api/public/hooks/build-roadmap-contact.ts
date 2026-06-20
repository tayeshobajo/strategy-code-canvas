import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RECIPIENT = "tai@trusttai.com";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  stuck: z.string().trim().max(1000).optional().default(""),
});

export const Route = createFileRoute("/api/public/hooks/build-roadmap-contact")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const parsed = BodySchema.safeParse(payload);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: "invalid_input" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { name, email, stuck } = parsed.data;

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { error } = await supabaseAdmin.rpc("enqueue_email", {
            queue_name: "transactional_emails",
            payload: {
              template_name: "build-roadmap-contact",
              recipient_email: RECIPIENT,
              reply_to: email,
              idempotency_key: `roadmap-${email}-${Date.now()}`,
              template_data: { name, email, stuck },
            },
          });
          if (error) throw error;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[build-roadmap-contact] send failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: "send_failed" }),
            { status: 503, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
