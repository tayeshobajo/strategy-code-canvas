/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4B — Command Center feed + exception lifecycle server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail, isAdminEmail, isOperatorEmail } from "@/lib/ops/access";

type Sb = any;
type Ctx = { claims?: Record<string, unknown>; supabase: Sb };

async function assertStaff(ctx: Ctx) {
  const email = ((ctx.claims?.email as string | undefined) ?? "").toLowerCase();
  if (isOperatorEmail(email) || isAdminEmail(email)) return;
  const ok = await hasRoleForEmail(ctx.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: engine staff role required");
}

export type CommandCenterException = {
  id: string;
  engine_id: string | null;
  engine_name: string | null;
  project_id: string;
  project_name: string | null;
  kind: string;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  urgency_score: number;
  impact_score: number;
  deadline_at: string | null;
  client_risk: boolean;
  next_action: string | null;
  next_action_owner: string | null;
  status: string;
  created_at: string;
};

export const getCommandCenterExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ limit: z.number().int().min(1).max(500).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: rows, error } = await (context as Ctx).supabase.rpc(
      "get_command_center_exceptions",
      { _limit: data.limit },
    );
    if (error) throw new Error(error.message);
    return { exceptions: (rows ?? []) as CommandCenterException[] };
  });

const OpenSchema = z.object({
  engineId: z.string().uuid(),
  kind: z.string().min(1).max(80),
  summary: z.string().min(1).max(600),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  detail: z.record(z.string(), z.unknown()).optional(),
  urgencyScore: z.number().int().min(0).max(100).default(50),
  impactScore: z.number().int().min(0).max(100).default(50),
  deadlineAt: z.string().datetime().optional().nullable(),
  clientRisk: z.boolean().default(false),
  nextAction: z.string().max(400).optional().nullable(),
  nextActionOwner: z.string().max(200).optional().nullable(),
  runId: z.string().uuid().optional().nullable(),
});

export const openEngineException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => OpenSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: id, error } = await (context as Ctx).supabase.rpc("open_engine_exception", {
      _engine_id: data.engineId,
      _kind: data.kind,
      _summary: data.summary,
      _severity: data.severity,
      _detail: data.detail ?? {},
      _urgency_score: data.urgencyScore,
      _impact_score: data.impactScore,
      _deadline_at: data.deadlineAt ?? null,
      _client_risk: data.clientRisk,
      _next_action: data.nextAction ?? null,
      _next_action_owner: data.nextActionOwner ?? null,
      _run_id: data.runId ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const resolveEngineException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ exceptionId: z.string().uuid(), resolutionNote: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { error } = await (context as Ctx).supabase.rpc("resolve_engine_exception", {
      _exception_id: data.exceptionId,
      _resolution_note: data.resolutionNote ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type EngineTickResult = {
  ok: boolean;
  processed: number;
  opened_exceptions: number;
  at: string;
  actor: string;
};

// Manual "run engine-tick now" — mirrors the pg_cron hook logic so admins
// can force an execution and inspect results immediately.
export const triggerEngineTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({}).optional().parse(d))
  .handler(async ({ context }) => {
    await assertStaff(context as Ctx);
    const email = ((context as Ctx).claims?.email as string | undefined) ?? "system";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const { data: due, error: dueErr } = await supabaseAdmin
      .from("engine_business_engines")
      .select("id, project_id, cadence, name, owner_email, approval_rules, next_run_at")
      .eq("status", "active")
      .lte("next_run_at", nowIso)
      .limit(50);
    if (dueErr) throw new Error(dueErr.message);

    let processed = 0;
    let opened_exceptions = 0;
    for (const eng of due ?? []) {
      const cycleKey = `${eng.next_run_at ?? nowIso}`;
      const { data: runId, error: runErr } = await supabaseAdmin.rpc("record_engine_run", {
        _engine_id: eng.id,
        _cycle_key: cycleKey,
        _status: "awaiting_approval",
        _inputs: { tick_at: nowIso, scheduler: "manual", actor: email },
        _outputs: {},
        _decisions: [],
      });
      if (runErr) continue;
      processed += 1;
      const rules = (eng.approval_rules ?? {}) as { require_human?: boolean };
      if (rules.require_human) {
        const { error: excErr } = await supabaseAdmin.rpc("open_engine_exception", {
          _engine_id: eng.id,
          _kind: "cycle_awaiting_approval",
          _summary: `Engine "${eng.name}" cycle needs approval`,
          _severity: "medium",
          _detail: { cycle_key: cycleKey, owner_email: eng.owner_email, manual: true },
          _urgency_score: 60,
          _impact_score: 50,
          _deadline_at: undefined,
          _client_risk: false,
          _next_action: `Review pending cycle for "${eng.name}"`,
          _next_action_owner: eng.owner_email ?? undefined,
          _run_id: (runId as string) ?? undefined,
        });
        if (!excErr) opened_exceptions += 1;
      }
    }

    return { ok: true, processed, opened_exceptions, at: nowIso, actor: email } as EngineTickResult;
  });

export type EngineRunDetail = {
  id: string;
  engine_id: string;
  cycle_key: string;
  status: string;
  inputs: unknown;
  outputs: unknown;
  decisions: unknown;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_cents: number | null;
  latency_ms: number | null;
  evidence_ids: string[];
  proposal_ids: string[];
  approval_ids: string[];
  error: string | null;
  actor_email: string | null;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export const getEngineRunDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: row, error } = await (context as Ctx).supabase
      .from("engine_business_engine_runs")
      .select("*")
      .eq("id", data.runId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Run not found");
    return { run: row as EngineRunDetail };
  });
