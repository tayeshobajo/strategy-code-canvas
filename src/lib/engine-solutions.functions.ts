/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 4B — Multi-solution decomposition server functions.
//
// Thin wrappers around SECURITY DEFINER RPCs propose_milestone_solution
// and select_milestone_solution, plus a staff-gated read for a given milestone.
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

export type MilestoneSolution = {
  id: string;
  milestone_id: string;
  project_id: string;
  title: string;
  summary: string | null;
  rationale: string | null;
  status: string;
  effort_estimate: string | null;
  investment_estimate_cents: number | null;
  assumptions: any;
  depends_on_solution_ids: string[];
  depends_on_milestone_ids: string[];
  evidence_source_ids: string[];
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

const ProposeSchema = z.object({
  milestoneId: z.string().uuid(),
  payload: z.object({
    title: z.string().min(1).max(200),
    summary: z.string().max(4000).optional(),
    rationale: z.string().max(4000).optional(),
    effort_estimate: z.string().max(120).optional(),
    investment_estimate_cents: z.number().int().nonnegative().optional(),
    assumptions: z.array(z.string().max(500)).max(50).optional(),
    depends_on_solution_ids: z.array(z.string().uuid()).max(50).optional(),
    depends_on_milestone_ids: z.array(z.string().uuid()).max(50).optional(),
    evidence_source_ids: z.array(z.string().uuid()).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const proposeMilestoneSolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ProposeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: id, error } = await (context as Ctx).supabase.rpc("propose_milestone_solution", {
      _milestone_id: data.milestoneId,
      _payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const selectMilestoneSolution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ solutionId: z.string().uuid(), reason: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { error } = await (context as Ctx).supabase.rpc("select_milestone_solution", {
      _solution_id: data.solutionId,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSolutionsForMilestone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ milestoneId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: rows, error } = await (context as Ctx).supabase
      .from("engine_milestone_solutions")
      .select("*")
      .eq("milestone_id", data.milestoneId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { solutions: (rows ?? []) as MilestoneSolution[] };
  });

export const listSolutionsForProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { data: rows, error } = await (context as Ctx).supabase
      .from("engine_milestone_solutions")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { solutions: (rows ?? []) as MilestoneSolution[] };
  });
