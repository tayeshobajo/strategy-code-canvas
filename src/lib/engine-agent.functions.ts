/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { systemPromptFor, type AgentTaskKind } from "@/lib/engine-agent-prompts";
import { assertActionAllowed } from "@/lib/engine-execution.functions";

async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

// Map an agent task kind to a permission action key so the permissions matrix
// (draft_only / propose_updates / execute_approved + blocked/needs_approval)
// gates every generation call.
const KIND_TO_ACTION: Record<string, string> = {
  milestone_brief: "generate_milestone_briefs",
  acceptance_criteria: "create_acceptance_criteria",
  lovable_prompt: "draft_developer_prompts",
  qa_checklist: "generate_milestone_briefs",
  missing_decisions: "generate_milestone_briefs",
  update_from_source: "update_roadmap_drafts",
  version_compare: "compare_versions",
  risk_estimate: "generate_milestone_briefs",
  client_summary: "prepare_client_facing_copy",
  free_form: "generate_milestone_briefs",
};


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
  applied_module: string | null;
  applied_at: string | null;
  pending_approval: boolean;
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
        approve: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ task: EngineAgentTask }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    // Permission gate: check the project's agent permission mode + per-action
    // matrix before spending any budget. Blocked = hard stop; needs_approval
    // requires `approve: true` from the caller (i.e. Tai clicked run/approve).
    const actionKey = KIND_TO_ACTION[data.kind] ?? "generate_milestone_briefs";
    await assertActionAllowed(sb, data.projectId, actionKey, { approve: data.approve });


    // Budget guard: block calls that would exceed the monthly cap.
    const { data: budgetRow } = await sb
      .from("engine_projects")
      .select("agent_budget_monthly_cents,agent_spend_month_cents")
      .eq("id", data.projectId)
      .single();
    if (
      budgetRow?.agent_budget_monthly_cents &&
      (budgetRow.agent_spend_month_cents ?? 0) >= budgetRow.agent_budget_monthly_cents
    ) {
      throw new Error("Agent budget cap reached for this month. Raise the cap to continue.");
    }

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

    // Append to the live agent-cost ledger so the Cost Center can display,
    // export, and audit every AI charge independent of downstream task edits.
    try {
      const { data: latestApproved } = await sb
        .from("engine_roadmap_versions")
        .select("id")
        .eq("project_id", data.projectId)
        .eq("status", "approved")
        .order("approved_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      await sb.from("engine_agent_costs").insert({
        project_id: data.projectId,
        agent_task_id: (row as { id: string })?.id ?? null,
        roadmap_version_id: latestApproved?.id ?? null,
        kind: data.kind,
        category: data.kind,
        related_module: data.relatedModule ?? null,
        tokens_in: ai.tokens_in,
        tokens_out: ai.tokens_out,
        cost_cents: ai.cost_cents,
        status: "recorded",
        actor_email: email,
      });
    } catch {
      // Ledger insert must never block the primary task flow.
    }

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
      .update({ status: data.status, pending_approval: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message ?? "update failed");
    return { ok: true };
  });

/**
 * Apply an agent output into a specific roadmap module.
 *
 * P0-5 enforcement: agent writes NEVER touch `engine_projects.<module>`,
 * `approved_snapshot`, or any published/delivered content. Every agent
 * application is routed into a draft `engine_roadmap_versions` row (status
 * = `ai_generated`), which stays behind the approval gate until an operator
 * approves it via the review queue (see decideReviewItem in engine-ops).
 *
 * Behavior by permission level:
 *   - draft_only     -> marks task pending_approval; no version write.
 *   - propose_updates -> merges module patch into the latest AI draft version.
 *   - execute_approved -> same as propose_updates. Legacy name; agent output
 *                         still goes to draft, never to approved/published.
 *   - `force: true`  -> Tai explicitly clicked apply; behaves like propose_updates.
 */
const MODULE_KEYS = [
  "point_a",
  "point_b",
  "hidden_assets",
  "gap_map",
  "blueprint",
  "roadmap",
  "sequencing",
  "deadlines",
  // NOTE: "investment" and "client_preview" are deliberately excluded — the
  // agent cannot write to these modules under any permission mode. Investment
  // and client-preview edits must go through updateProjectStep with an admin
  // human in the loop (see engine.functions.ts).
] as const;

/**
 * Find the latest AI-draft version for a project, or create a fresh one.
 * Never touches or forks an `approved` row — approved versions are immutable.
 */
async function _findOrCreateAiDraft(
  sb: any,
  projectId: string,
  actorEmail: string | null,
): Promise<{ id: string; version: string; payload: Record<string, any> }> {
  const { data: existing } = await sb
    .from("engine_roadmap_versions")
    .select("id,version,payload,status")
    .eq("project_id", projectId)
    .in("status", ["ai_generated", "draft", "tai_edited"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      id: existing.id as string,
      version: existing.version as string,
      payload: (existing.payload ?? {}) as Record<string, any>,
    };
  }
  // Compute next version label. Use the highest existing version + 0.1, or v0.1.
  const { data: all } = await sb
    .from("engine_roadmap_versions")
    .select("version")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(10);
  const maxMinor = ((all as { version: string }[] | null) ?? []).reduce((max, r) => {
    const m = /v?(\d+)\.(\d+)/i.exec(r.version ?? "");
    if (!m) return max;
    const n = parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    return n > max ? n : max;
  }, 0);
  const nextMajor = Math.floor(maxMinor / 100);
  const nextMinor = (maxMinor % 100) + 1;
  const nextVersion = `v${nextMajor}.${nextMinor}`;
  const { data: created, error } = await sb
    .from("engine_roadmap_versions")
    .insert({
      project_id: projectId,
      version: nextVersion,
      status: "ai_generated",
      created_by: actorEmail ?? "ai",
      label: `${nextVersion} — AI draft (Needs Review)`,
      payload: {},
      generation_provenance: { source: "agent", origin: "applyAgentTask" },
    })
    .select("id,version,payload")
    .single();
  if (error) throw new Error(error.message ?? "could not create draft version");
  return {
    id: (created as any).id,
    version: (created as any).version,
    payload: (created as any).payload ?? {},
  };
}

export const applyAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        module: z.enum(MODULE_KEYS),
        force: z.boolean().optional().default(false),
      })
      .parse(raw),
  )
  .handler(
    async ({ context, data }): Promise<{ ok: true; status: "applied" | "pending_approval"; version_id?: string; version?: string }> => {
      await assertAdmin(context);
      const sb = context.supabase as any;
      const email = (context as any).claims?.email ?? null;

      const { data: task } = await sb
        .from("engine_agent_tasks")
        .select("id,project_id,output,related_module,status,pending_approval")
        .eq("id", data.id)
        .single();
      if (!task) throw new Error("Task not found");
      if (!task.output) throw new Error("Task has no output to apply");

      // Permission gate: applying agent output writes to a roadmap draft, so
      // this maps to the `update_roadmap_drafts` action. `force` = Tai
      // explicitly clicked Apply, which counts as approval.
      await assertActionAllowed(sb, task.project_id, "update_roadmap_drafts", {
        approve: data.force,
      });

      const { data: proj } = await sb
        .from("engine_projects")
        .select("agent_permission_level,agent_allowed_modules")
        .eq("id", task.project_id)
        .single();
      const level = proj?.agent_permission_level ?? "draft_only";
      const allowed: string[] = proj?.agent_allowed_modules ?? [];
      if (allowed.length && !allowed.includes(data.module)) {
        throw new Error(`Module "${data.module}" is not in the agent's allowed list.`);
      }

      // draft_only: mark as pending, do not touch any version row.
      if (level === "draft_only" && !data.force) {
        await sb
          .from("engine_agent_tasks")
          .update({ pending_approval: true, related_module: data.module })
          .eq("id", task.id);
        await sb.from("engine_change_events").insert({
          project_id: task.project_id,
          kind: "new_info",
          title: `Agent proposal for ${data.module.replace(/_/g, " ")}`,
          body: (task.output as string).slice(0, 400),
          severity: "warn",
          affected_module: data.module,
        });
        await sb.from("engine_audit_log").insert({
          project_id: task.project_id,
          actor_email: email,
          action: "agent_pending_approval",
          summary: `Agent proposal queued for ${data.module.replace(/_/g, " ")}. Awaits Tai's approval.`,
          affected_modules: [data.module],
          target_id: task.id,
          metadata: { permission_level: level, task_id: task.id },
        });
        return { ok: true, status: "pending_approval" };
      }

      // propose_updates / execute_approved / forced: route into an AI draft
      // version. Never write to engine_projects.<module>, never touch approved
      // snapshots, never touch published portal content.
      const draft = await _findOrCreateAiDraft(sb, task.project_id, email);
      const nowIso = new Date().toISOString();
      const nextPayload = {
        ...draft.payload,
        [data.module]: {
          source: "agent",
          note: task.output,
          updated_at: nowIso,
          updated_by: email ?? "ai",
          task_id: task.id,
        },
      };
      const { error: vErr } = await sb
        .from("engine_roadmap_versions")
        .update({
          payload: nextPayload,
          status: "ai_generated",
          updated_at: nowIso,
        })
        .eq("id", draft.id);
      if (vErr) throw new Error(vErr.message ?? "could not write draft version");

      await sb
        .from("engine_agent_tasks")
        .update({
          status: "applied",
          pending_approval: false,
          applied_module: data.module,
          applied_at: nowIso,
          roadmap_version_id: draft.id,
        })
        .eq("id", task.id);
      await sb.from("engine_activity").insert({
        project_id: task.project_id,
        kind: "agent_applied_to_draft",
        title: `Agent output merged into draft ${draft.version} (${data.module.replace(/_/g, " ")})`,
        body: `Draft "Needs Review" — approved roadmap unchanged.${email ? ` Applied by ${email}.` : ""}`,
        severity: "info",
      });
      await sb.from("engine_audit_log").insert({
        project_id: task.project_id,
        actor_email: email,
        action: "agent_applied_to_draft",
        summary: `Applied agent output to draft version ${draft.version} · module ${data.module.replace(/_/g, " ")}. Approved roadmap untouched.`,
        affected_modules: [data.module],
        version_id: draft.id,
        target_id: task.id,
        metadata: { permission_level: level, task_id: task.id, forced: data.force, draft_version: draft.version },
      });
      return { ok: true, status: "applied", version_id: draft.id, version: draft.version };
    },
  );


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
