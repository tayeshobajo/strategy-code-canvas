/**
 * Runtime guard for `engine_activity` writes.
 *
 * Purpose: catch schema-drift errors (missing column, type mismatch) the
 * moment an insert fails, log the full failing payload server-side, and
 * surface an in-app banner via `operator_notifications` so we notice
 * within seconds instead of losing audit trails silently.
 *
 * PostgREST error code 42703 = "undefined_column". Any other insert error
 * is still logged but not classified as drift.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EngineActivityPayload = {
  project_id?: string | null;
  kind: string;
  title: string;
  body?: string | null;
  severity?: "info" | "warn" | "error" | "success" | string;
  actor_email?: string | null;
  [extra: string]: unknown;
};

type MinimalClient = {
  from: (t: string) => {
    insert: (rows: unknown) => Promise<{ error: unknown }>;
  };
};

type PgErrorish = { code?: string; message?: string; details?: string; hint?: string };

function isSchemaDrift(err: PgErrorish | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703") return true;
  const msg = (err.message ?? "").toLowerCase();
  return /column .* does not exist|could not find the .* column/.test(msg);
}

/**
 * Insert one or more rows into `engine_activity`. On schema drift, emits a
 * durable `operator_notifications` row (kind = `engine_activity_schema_drift`)
 * so the in-app banner picks it up on the next poll. Never throws — audit
 * writes must not break the caller's flow.
 */
export async function insertEngineActivity(
  sb: MinimalClient,
  payload: EngineActivityPayload | EngineActivityPayload[],
): Promise<{ ok: boolean; drift: boolean }> {
  try {
    const { error } = await sb.from("engine_activity").insert(payload);
    if (!error) return { ok: true, drift: false };

    const err = error as PgErrorish;
    const drift = isSchemaDrift(err);
    const snapshot = safeJson(payload);

    // Server-side log with full payload — filterable in log search.
    console.error(
      drift
        ? "[engine_activity][SCHEMA_DRIFT] insert rejected — column missing"
        : "[engine_activity] insert failed",
      { code: err.code, message: err.message, hint: err.hint, payload: snapshot },
    );

    if (drift) {
      // Best-effort banner surface. Ignore any secondary failure.
      try {
        await sb.from("operator_notifications").insert({
          kind: "engine_activity_schema_drift",
          title: "engine_activity insert rejected — schema drift detected",
          body:
            (err.message ?? "column mismatch") +
            (err.hint ? ` (hint: ${err.hint})` : ""),
          metadata: { code: err.code ?? null, payload: snapshot },
        });
      } catch (bannerErr) {
        console.error("[engine_activity] failed to record drift notification", bannerErr);
      }
    }
    return { ok: false, drift };
  } catch (thrown) {
    console.error("[engine_activity] insert threw", { thrown, payload: safeJson(payload) });
    return { ok: false, drift: false };
  }
}

function safeJson(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return String(v);
  }
}

// ---------- In-app banner query ----------

export const listActivityDriftAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = (context as unknown as { supabase: MinimalClient & {
      from: (t: string) => {
        select: (c: string) => {
          eq: (col: string, val: string) => {
            gte: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        };
      };
    } }).supabase;
    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from("operator_notifications")
      .select("id, title, body, created_at, metadata")
      .eq("kind", "engine_activity_schema_drift")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) {
      console.warn("listActivityDriftAlerts", error);
      return { alerts: [] as Array<{ id: string; title: string; body: string | null; created_at: string }> };
    }
    return {
      alerts: ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        body: (r.body as string | null) ?? null,
        created_at: r.created_at as string,
      })),
    };
  });
