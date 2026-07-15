// Durable pipeline runner hook.
//
// Called by pg_cron on a fixed cadence AND nudged by the intake submit
// path so a fresh intake is picked up immediately. Picks up to N brief
// engine_sources rows with status='queued' and executes the intelligence
// pipeline for each. Claim step is atomic (UPDATE ... WHERE status='queued'
// RETURNING id) so parallel invocations never double-process a source.
//
// Auth: requires the Supabase publishable/anon key in the `apikey` header
// (matches the /api/public/hooks/... cron pattern in this repo).

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  source_id: z.string().uuid().optional(),
  max: z.number().int().min(1).max(10).optional(),
});

const MAX_DEFAULT = 3;

async function runOne(
  sb: any,
  sourceId: string,
): Promise<{ source_id: string; ok: boolean; error?: string }> {
  try {
    const { data: srcRow, error: srcErr } = await sb
      .from("engine_sources")
      .select("id, project_id, status, type")
      .eq("id", sourceId)
      .maybeSingle();
    if (srcErr || !srcRow) return { source_id: sourceId, ok: false, error: "source_missing" };

    // Atomic claim — flip queued → processing. Skip if another runner beat us.
    const { data: claimed, error: claimErr } = await sb
      .from("engine_sources")
      .update({ status: "processing" })
      .eq("id", sourceId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claimErr) return { source_id: sourceId, ok: false, error: String(claimErr.message ?? claimErr) };
    if (!claimed) return { source_id: sourceId, ok: false, error: "already_claimed" };

    const { runIntelligencePipelineInternal } = await import(
      "@/lib/engine-intelligence.functions"
    );
    await runIntelligencePipelineInternal(sb, {
      projectId: srcRow.project_id as string,
      sourceIds: [sourceId],
      actorEmail: "system@pipeline-queue",
    });
    return { source_id: sourceId, ok: true };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    // Best-effort mark the source as failed so it doesn't clog the queue.
    try {
      await sb
        .from("engine_sources")
        .update({ status: "failed" })
        .eq("id", sourceId);
    } catch {
      // ignore
    }
    return { source_id: sourceId, ok: false, error: msg };
  }
}

export const Route = createFileRoute("/api/public/hooks/run-pipeline-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY ??
          "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: z.infer<typeof BodySchema> = {};
        try {
          const raw = await request.text();
          if (raw) body = BodySchema.parse(JSON.parse(raw));
        } catch {
          body = {};
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const max = body.max ?? MAX_DEFAULT;

        let ids: string[] = [];
        if (body.source_id) {
          ids = [body.source_id];
        } else {
          const { data: rows } = await supabaseAdmin
            .from("engine_sources")
            .select("id")
            .eq("status", "queued")
            .eq("type", "brief")
            .order("created_at", { ascending: true })
            .limit(max);
          ids = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
        }

        if (ids.length === 0) {
          return Response.json({ ok: true, processed: 0, results: [] });
        }

        const results = await Promise.all(ids.map((id) => runOne(supabaseAdmin as any, id)));
        return Response.json({
          ok: true,
          processed: results.filter((r) => r.ok).length,
          results,
        });
      },
    },
  },
});
