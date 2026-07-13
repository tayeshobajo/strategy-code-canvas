/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4B — Business Engines server functions.
//
// - listBusinessEngines(projectId)
// - createBusinessEngine(...)
// - activateBusinessEngine(engineId, ownerEmail) -> calls activate_business_engine RPC
// - listEngineRuns(engineId)
// - recordEngineRun(...) -> calls record_engine_run RPC
// - openEngineException(...) / resolveEngineException(...) via engine-command-center
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

export type BusinessEngine = {
  id: string;
  project_id: string;
  milestone_id: string | null;
  kind: string;
  name: string;
  outcome: string;
  workflow: any;
  cadence: string;
  cron_expression: string | null;
  owner_email: string | null;
  triggers: any;
  approval_rules: any;
  metrics: any;
  exception_rules: any;
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  missed_cycles: number;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EngineRun = {
  id: string;
  engine_id: string;
  project_id: string;
  cycle_key: string;
  status: string;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  inputs: any;
  outputs: any;
  decisions: any;
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
  created_at: string;
};

export const listBusinessEngines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: rows, error } = await (context as Ctx).supabase
      .from("engine_business_engines")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { engines: (rows ?? []) as BusinessEngine[] };
  });

const CreateSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid().nullable().optional(),
  kind: z.enum(["intake", "delivery", "learning", "sales", "ops", "reporting", "custom"]),
  name: z.string().min(1).max(200),
  outcome: z.string().min(1).max(400),
  cadence: z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "ad_hoc"]),
  ownerEmail: z.string().email().optional().nullable(),
  workflow: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  triggers: z.record(z.string(), z.unknown()).optional(),
  approvalRules: z.record(z.string(), z.unknown()).optional(),
  metrics: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  exceptionRules: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
});

export const createBusinessEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const email = ((context as Ctx).claims?.email as string | undefined) ?? "system";
    const { data: row, error } = await (context as Ctx).supabase
      .from("engine_business_engines")
      .insert({
        project_id: data.projectId,
        milestone_id: data.milestoneId ?? null,
        kind: data.kind,
        name: data.name,
        outcome: data.outcome,
        cadence: data.cadence,
        owner_email: data.ownerEmail ?? null,
        workflow: data.workflow ?? [],
        triggers: data.triggers ?? {},
        approval_rules: data.approvalRules ?? {},
        metrics: data.metrics ?? [],
        exception_rules: data.exceptionRules ?? [],
        status: "draft",
        created_by: email,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { engine: row as BusinessEngine };
  });

export const activateBusinessEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ engineId: z.string().uuid(), ownerEmail: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { error } = await (context as Ctx).supabase.rpc("activate_business_engine", {
      _engine_id: data.engineId,
      _owner_email: data.ownerEmail,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const pauseBusinessEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ engineId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { error } = await (context as Ctx).supabase
      .from("engine_business_engines")
      .update({ status: "paused" })
      .eq("id", data.engineId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listEngineRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ engineId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: rows, error } = await (context as Ctx).supabase
      .from("engine_business_engine_runs")
      .select("*")
      .eq("engine_id", data.engineId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { runs: (rows ?? []) as EngineRun[] };
  });

const RecordRunSchema = z.object({
  engineId: z.string().uuid(),
  cycleKey: z.string().min(1).max(200),
  status: z.enum(["scheduled", "running", "completed", "failed", "skipped", "awaiting_approval"]),
  inputs: z.record(z.string(), z.unknown()).optional(),
  outputs: z.record(z.string(), z.unknown()).optional(),
  decisions: z.array(z.record(z.string(), z.unknown())).optional(),
  model: z.string().max(120).optional().nullable(),
  costCents: z.number().int().nonnegative().optional().nullable(),
  latencyMs: z.number().int().nonnegative().optional().nullable(),
  tokensInput: z.number().int().nonnegative().optional().nullable(),
  tokensOutput: z.number().int().nonnegative().optional().nullable(),
  evidenceIds: z.array(z.string().uuid()).max(50).optional(),
  proposalIds: z.array(z.string().uuid()).max(50).optional(),
  approvalIds: z.array(z.string().uuid()).max(50).optional(),
  error: z.string().max(2000).optional().nullable(),
});

export const recordEngineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RecordRunSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: id, error } = await (context as Ctx).supabase.rpc("record_engine_run", {
      _engine_id: data.engineId,
      _cycle_key: data.cycleKey,
      _status: data.status,
      _inputs: data.inputs ?? {},
      _outputs: data.outputs ?? {},
      _decisions: data.decisions ?? [],
      _model: data.model ?? null,
      _cost_cents: data.costCents ?? null,
      _latency_ms: data.latencyMs ?? null,
      _tokens_input: data.tokensInput ?? null,
      _tokens_output: data.tokensOutput ?? null,
      _evidence_ids: data.evidenceIds ?? [],
      _proposal_ids: data.proposalIds ?? [],
      _approval_ids: data.approvalIds ?? [],
      _error: data.error ?? null,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });
