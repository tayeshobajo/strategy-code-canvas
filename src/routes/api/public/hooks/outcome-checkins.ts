// Phase H4 — Public cron hook for the outcome scheduler.
//
// pg_cron (see .orchestrator/PENDING_MIGRATIONS.md) POSTs here with the
// project's Supabase publishable key in the `apikey` header. We verify the
// header inside the handler because `/api/public/*` bypasses edge auth by
// design.

import { createFileRoute } from "@tanstack/react-router";
import { internalRunOutcomeCheckins } from "@/lib/engine-outcome-scheduler.functions";

export const Route = createFileRoute("/api/public/hooks/outcome-checkins")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ ok: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const result = await internalRunOutcomeCheckins(
            supabaseAdmin,
            "outcome_scheduler_cron",
            false,
          );
          return new Response(
            JSON.stringify({
              ok: true,
              ranAt: result.ranAt,
              summary: result.summary,
              scanned: result.scanned,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown_error";
          console.error("outcome-checkins hook failed", message);
          return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
