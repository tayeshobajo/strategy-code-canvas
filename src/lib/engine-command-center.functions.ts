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
