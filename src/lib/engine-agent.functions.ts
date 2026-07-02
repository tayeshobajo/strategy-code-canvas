/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { systemPromptFor, type AgentTaskKind } from "@/lib/engine-agent-prompts";

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

export type EngineAgentTask = {
  id: string;
  project_id: string;
  kind: AgentTaskKind;
  prompt: string;
  output: string | null;
  related_module: string | null;
  confidence: number;
  cost_cents: number;
  tokens_in: number;
  tokens_out: number;
  status: "draft" | "applied" | "saved_as_task" | "rejected";
  attached_source_ids: string[];
  used_project_context: boolean;
  created_by_email: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const TASK_KINDS = [
  "milestone_brief",
  "acceptance_criteria",
  "lovable_prompt",
  "missing_decisions",
  "update_from_source",
  "version_compare",
  "risk_estimate",
  "client_summary",
  "qa_checklist",
  "free_form",
] as const;

export const listAgentTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }): Promise<{ rows: EngineAgentTask[] }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_agent_tasks")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message ?? "list tasks failed");
    return { rows: (rows ?? []) as EngineAgentTask[] };
  });

export const runAgentPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        kind: z.enum(TASK_KINDS).default("free_form"),
        prompt: z.string().min(1).max(20_000),
        useProjectContext: z.boolean().default(true),
        attachedSourceIds: z.array(z.string().uuid()).max(20).default([]),
        relatedModule: z.string().max(80).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ task: EngineAgentTask }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    let contextText = "";
    if (data.useProjectContext) {
      const { data: proj } = await sb
        .from("engine_projects")
        .select(
          "name,roadmap_version,approved_version,point_a,point_b,roadmap,deadlines,investment, engine_clients(company,industry)",
        )
        .eq("id", data.projectId)
        .single();
      if (proj) {
        contextText = `PROJECT: ${proj.name} (${proj.engine_clients?.company ?? "—"})
Approved version: ${proj.approved_version ?? "none"}
Draft version: ${proj.roadmap_version ?? "none"}
Point A: ${JSON.stringify(proj.point_a).slice(0, 2000)}
Point B: ${JSON.stringify(proj.point_b).slice(0, 2000)}
Roadmap: ${JSON.stringify(proj.roadmap).slice(0, 4000)}
Deadlines: ${JSON.stringify(proj.deadlines).slice(0, 1000)}
Investment: ${JSON.stringify(proj.investment).slice(0, 1000)}`;
      }
    }

    if (data.attachedSourceIds.length) {
      const { data: srcs } = await sb
        .from("engine_sources")
        .select("name,type,url,raw_text")
        .in("id", data.attachedSourceIds);
      if (srcs?.length) {
        contextText += `\n\nATTACHED SOURCES:\n${(srcs as any[])
          .map(
            (s, i) =>
              `[${i + 1}] (${s.type}) ${s.name}${s.url ? " — " + s.url : ""}\n${(s.raw_text ?? "").slice(0, 3000)}`,
          )
          .join("\n\n")}`;
      }
    }

    const { callLovableAi } = await import("@/lib/engine-ai.server");
    let ai;
    try {
      ai = await callLovableAi(
        [
          { role: "system", content: systemPromptFor(data.kind) },
          {
            role: "user",
            content: `${data.prompt}${contextText ? "\n\n---\nContext:\n" + contextText : ""}`,
          },
        ],
        { temperature: 0.4 },
      );
    } catch (err: any) {
      const { data: fail } = await sb
        .from("engine_agent_tasks")
        .insert({
          project_id: data.projectId,
          kind: data.kind,
          prompt: data.prompt,
          output: null,
          related_module: data.relatedModule ?? null,
          used_project_context: data.useProjectContext,
          attached_source_ids: data.attachedSourceIds,
          created_by_email: email,
          error: err?.message ?? String(err),
          status: "rejected",
        })
        .select("*")
        .single();
      return { task: fail as EngineAgentTask };
    }

    const { data: row, error } = await sb
      .from("engine_agent_tasks")
      .insert({
        project_id: data.projectId,
        kind: data.kind,
        prompt: data.prompt,
        output: ai.text,
        related_module: data.relatedModule ?? null,
        used_project_context: data.useProjectContext,
        attached_source_ids: data.attachedSourceIds,
        confidence: 80,
        cost_cents: ai.cost_cents,
        tokens_in: ai.tokens_in,
        tokens_out: ai.tokens_out,
        created_by_email: email,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "task insert failed");

    // Add to project spend
    const { data: proj } = await sb
      .from("engine_projects")
      .select("agent_spend_month_cents")
      .eq("id", data.projectId)
      .single();
    await sb
      .from("engine_projects")
      .update({
        agent_spend_month_cents: (proj?.agent_spend_month_cents ?? 0) + ai.cost_cents,
        last_activity_at: new Date().toISOString(),
      })
      .eq("id", data.projectId);

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "agent_output",
      title: `Agent output: ${data.kind.replace(/_/g, " ")}`,
      body: data.prompt.slice(0, 200),
      severity: "info",
    });

    return { task: row as EngineAgentTask };
  });

export const updateAgentTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "applied", "saved_as_task", "rejected"]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_agent_tasks")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "update failed");
    return { ok: true };
  });

export const updateAgentControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        permission_level: z
          .enum(["draft_only", "propose_updates", "execute_approved"])
          .optional(),
        budget_monthly_cents: z.number().int().min(0).max(1_000_000).optional(),
        allowed_modules: z.array(z.string()).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const update: Record<string, any> = {};
    if (data.permission_level) update.agent_permission_level = data.permission_level;
    if (data.budget_monthly_cents != null)
      update.agent_budget_monthly_cents = data.budget_monthly_cents;
    if (data.allowed_modules) update.agent_allowed_modules = data.allowed_modules;
    if (!Object.keys(update).length) return { ok: true };
    const { error } = await sb
      .from("engine_projects")
      .update(update)
      .eq("id", data.projectId);
    if (error) throw new Error(error.message ?? "update failed");
    return { ok: true };
  });

export const getAgentDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const [projRes, tasksRes, sourcesRes, changesRes, actRes] = await Promise.all([
      sb
        .from("engine_projects")
        .select(
          "id,name,roadmap_version,approved_version,agent_permission_level,agent_budget_monthly_cents,agent_spend_month_cents,agent_safety_rules,agent_allowed_modules,open_decisions,point_a,point_b,deadlines, engine_clients(company,industry)",
        )
        .eq("id", data.projectId)
        .single(),
      sb
        .from("engine_agent_tasks")
        .select("*")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("engine_sources")
        .select("id,name,type,status,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(20),
      sb
        .from("engine_change_events")
        .select("id,kind,title,severity,affected_module,resolved_at,created_at")
        .eq("project_id", data.projectId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      sb
        .from("engine_activity")
        .select("id,kind,title,body,severity,created_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    return {
      project: projRes.data ?? null,
      tasks: (tasksRes.data ?? []) as EngineAgentTask[],
      sources: (sourcesRes.data ?? []) as any[],
      pending_approvals: (changesRes.data ?? []) as any[],
      activity: (actRes.data ?? []) as any[],
    };
  });
