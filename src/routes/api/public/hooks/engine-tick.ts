// Phase 4B — engine-tick scheduler hook.
//
// Called by pg_cron every N minutes. Iterates active engines with
// next_run_at <= now(), records an `awaiting_approval` run (idempotent
// on (engine_id, cycle_key)), and — for engines whose approval_rules
// require human review — opens a medium-severity Command Center
// exception so the owner sees the pending cycle.
//
// Auth: apikey header must match the Supabase publishable/anon key.
// Public endpoint (/api/public/*), signature verified in-handler.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/engine-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!expected || !apiKey || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        const { data: due, error: dueErr } = await supabaseAdmin
          .from("engine_business_engines")
          .select("id, project_id, cadence, name, owner_email, approval_rules, next_run_at")
          .eq("status", "active")
          .lte("next_run_at", nowIso)
          .limit(50);

        if (dueErr) {
          console.error("[engine-tick] list error", dueErr);
          return new Response(JSON.stringify({ error: dueErr.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        let processed = 0;
        let opened_exceptions = 0;

        for (const eng of due ?? []) {
          const cycleKey = `${eng.next_run_at ?? nowIso}`;

          const { data: runId, error: runErr } = await supabaseAdmin.rpc("record_engine_run", {
            _engine_id: eng.id,
            _cycle_key: cycleKey,
            _status: "awaiting_approval",
            _inputs: { tick_at: nowIso, scheduler: "pg_cron" },
            _outputs: {},
            _decisions: [],
          });

          if (runErr) {
            console.error("[engine-tick] record_engine_run failed", eng.id, runErr);
            continue;
          }
          processed += 1;

          const rules = (eng.approval_rules ?? {}) as { require_human?: boolean };
          if (rules.require_human) {
            const { error: excErr } = await supabaseAdmin.rpc("open_engine_exception", {
              _engine_id: eng.id,
              _kind: "cycle_awaiting_approval",
              _summary: `Engine "${eng.name}" cycle needs approval`,
              _severity: "medium",
              _detail: { cycle_key: cycleKey, owner_email: eng.owner_email },
              _urgency_score: 60,
              _impact_score: 50,
              _deadline_at: null,
              _client_risk: false,
              _next_action: `Review pending cycle for "${eng.name}"`,
              _next_action_owner: eng.owner_email ?? null,
              _run_id: (runId as string) ?? null,
            });
            if (!excErr) opened_exceptions += 1;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, processed, opened_exceptions, at: nowIso }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
