/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { throwGeneric } from "@/lib/engine-error";

// Exported for behavioral role-rejection tests (Audit V3 #8).
export async function assertAdmin(context: any) {
  const email = (context.claims?.email as string | undefined) ?? undefined;
  const ok = await hasRoleForEmail(context.supabase, email, "admin");
  if (!ok) throw new Error("Forbidden: admin role required");
}

/**
 * Server-side gate for agent-authored actions. Reads engine_agent_permissions
 * for the project and throws for `blocked` actions or `needs_approval` when
 * the caller did not pass `{ approve: true }`. `permission_mode` also caps
 * agent behavior:
 *   - draft_only     -> every action treated as needs_approval unless approve=true
 *   - propose_updates -> honors action_permissions map
 *   - execute_approved -> honors action_permissions map
 * Non-negotiable safety rules keep send_delivery / move_project_to_execution
 * always blocked, regardless of stored permissions.
 */
export async function assertActionAllowed(
  sb: any,
  projectId: string,
  action: string,
  opts: { approve?: boolean } = {},
): Promise<{ mode: string; permission: "allowed" | "needs_approval" | "blocked" }> {
  const HARD_BLOCKED = new Set(["send_delivery", "move_project_to_execution"]);
  if (HARD_BLOCKED.has(action)) {
    throw new Error(`Blocked by safety rule: agent cannot perform "${action.replace(/_/g, " ")}".`);
  }
  const { data: row } = await sb
    .from("engine_agent_permissions")
    .select("permission_mode,action_permissions")
    .eq("project_id", projectId)
    .maybeSingle();
  const mode: string = row?.permission_mode ?? "draft_only";
  const map: Record<string, string> = row?.action_permissions ?? {};
  let permission = (map[action] ?? "needs_approval") as "allowed" | "needs_approval" | "blocked";
  if (mode === "draft_only" && permission === "allowed") permission = "needs_approval";
  if (permission === "blocked") {
    throw new Error(`Action "${action.replace(/_/g, " ")}" is blocked by agent permissions.`);
  }
  if (permission === "needs_approval" && !opts.approve) {
    throw new Error(`Action "${action.replace(/_/g, " ")}" needs approval. Approve to continue.`);
  }
  return { mode, permission };
}

// ============================================================
// Milestones
// ============================================================

export const listMilestones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_milestones")
      .select("*")
      .eq("project_id", data.projectId)
      .order("sort_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throwGeneric(error, "Operation failed");
    return { rows: rows ?? [] };
  });

export const getMilestoneBrief = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: z.string().uuid(), milestoneId: z.string() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    // Strict lookup — do NOT seed demo data. Returning null lets the UI show
    // an empty state; auto-inserting fake milestones pollutes real projects
    // (Pillar 11: "Demo data seeds into production").
    const { data: row } = await sb
      .from("engine_milestones")
      .select("*")
      .eq("id", data.milestoneId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    return { milestone: row ?? null };
  });


const PROTECTED_APPROVED_FIELDS = new Set([
  "brief_md",
  "acceptance_criteria",
  "developer_prompt",
  "client_safe_md",
]);

export const updateMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
        force: z.boolean().optional().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    // Guard: if the milestone is already approved, protected fields
    // (brief/criteria/prompt/client copy) cannot be overwritten in place —
    // caller must explicitly force (creates a new draft brief version).
    const { data: current } = await sb
      .from("engine_milestones")
      .select("approval_status,project_id,name,created_by_kind,approved_by_email")
      .eq("id", data.id)
      .single();
    const patch: any = { ...data.patch };
    delete patch.id;
    delete patch.project_id;

    if (current?.approval_status === "approved" && !data.force) {
      const touched = Object.keys(patch).filter((k) => PROTECTED_APPROVED_FIELDS.has(k));
      if (touched.length) {
        throw new Error(
          `Cannot overwrite approved milestone fields (${touched.join(", ")}). Reset approval or explicitly force to create a new draft.`,
        );
      }
    }

    // Phase 9C guard: AI-created milestones cannot reach approved/complete
    // without a human on record. When an admin triggers such a transition,
    // backfill approved_by_email with the caller's email so the DB CHECK
    // (no_ai_self_approval / no_ai_self_complete) passes cleanly.
    const AI_KINDS = new Set(["ai", "captain", "agent", "system_agent", "pipeline"]);
    const TERMINAL_STATUS = new Set(["complete", "completed", "done"]);
    const isAiCreated = AI_KINDS.has(String(current?.created_by_kind ?? ""));
    const willApprove = patch.approval_status === "approved";
    const willComplete =
      typeof patch.status === "string" && TERMINAL_STATUS.has(patch.status);
    if (
      isAiCreated &&
      (willApprove || willComplete) &&
      !patch.approved_by_email &&
      !current?.approved_by_email
    ) {
      if (!email) {
        throw new Error(
          "Cannot mark an AI-created milestone approved/complete without a signed-in staff email.",
        );
      }
      patch.approved_by_email = email;
      if (willApprove && !patch.approved_at) patch.approved_at = new Date().toISOString();
    }

    // B12: governed body columns are locked at the DB layer by the
    // `engine_milestones_require_proposal` trigger. Route any patch that
    // touches them through the SECURITY DEFINER RPC that sets the
    // `engine.proposal_apply` GUC atomically. Non-governed fields keep
    // going through the regular UPDATE so RLS remains the primary gate.
    const governedKeys = Object.keys(patch).filter((k) => PROTECTED_APPROVED_FIELDS.has(k));
    const nonGovernedPatch: any = { ...patch };
    for (const k of governedKeys) delete nonGovernedPatch[k];

    if (governedKeys.length) {
      const governedPatch: Record<string, any> = {};
      for (const k of governedKeys) governedPatch[k] = patch[k];
      const { error: gErr } = await sb.rpc("admin_edit_milestone_governed", {
        _id: data.id,
        _patch: governedPatch,
      });
      if (gErr) throwGeneric(gErr, "Operation failed");
    }
    if (Object.keys(nonGovernedPatch).length) {
      const { error } = await sb
        .from("engine_milestones")
        .update(nonGovernedPatch)
        .eq("id", data.id);
      if (error) throwGeneric(error, "Operation failed");
    }
    if (current?.project_id) {
      await sb.from("engine_audit_log").insert({
        project_id: current.project_id,
        actor_email: email,
        action: "milestone_updated",
        summary: `Updated milestone "${current.name ?? data.id}" (${Object.keys(patch).join(", ")}).`,
        affected_modules: ["milestones"],
        target_id: data.id,
        metadata: { fields: Object.keys(patch), forced: data.force },
      });
    }
    return { ok: true as const };
  });

export const approveMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    // Gate: acceptance criteria must have items and none may be blank.
    const { data: m } = await sb
      .from("engine_milestones")
      .select("project_id,name,acceptance_criteria")
      .eq("id", data.id)
      .single();
    const criteria = Array.isArray(m?.acceptance_criteria) ? m.acceptance_criteria : [];
    if (criteria.length === 0) {
      throw new Error("Cannot approve: milestone has no acceptance criteria.");
    }

    const { error } = await sb
      .from("engine_milestones")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by_email: email,
        status: "approved",
      })
      .eq("id", data.id);
    if (error) throwGeneric(error, "Operation failed");
    if (m?.project_id) {
      await sb.from("engine_audit_log").insert({
        project_id: m.project_id,
        actor_email: email,
        action: "milestone_approved",
        summary: `Approved milestone "${m.name}" (${criteria.length} acceptance criteria).`,
        affected_modules: ["milestones"],
        target_id: data.id,
        metadata: { criteria_count: criteria.length },
      });
    }
    return { ok: true as const };
  });

export const rejectMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ id: z.string().uuid(), reason: z.string().max(500).optional() })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: m } = await sb
      .from("engine_milestones")
      .select("project_id,name")
      .eq("id", data.id)
      .single();
    const { error } = await sb
      .from("engine_milestones")
      .update({
        approval_status: "rejected",
        approved_at: null,
        approved_by_email: null,
        status: "blocked",
      })
      .eq("id", data.id);
    if (error) throwGeneric(error, "Operation failed");
    if (m?.project_id) {
      await sb.from("engine_audit_log").insert({
        project_id: m.project_id,
        actor_email: email,
        action: "milestone_rejected",
        summary: `Rejected milestone "${m.name}".${data.reason ? ` Reason: ${data.reason}` : ""}`,
        affected_modules: ["milestones"],
        target_id: data.id,
        metadata: { reason: data.reason ?? null },
      });
    }
    return { ok: true as const };
  });

export const listMilestoneApprovalHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ project_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_audit_log")
      .select("id,actor_email,action,summary,target_id,created_at,metadata")
      .eq("project_id", data.project_id)
      .in("action", ["milestone_approved", "milestone_rejected"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throwGeneric(error, "Operation failed");
    return (rows ?? []) as Array<{
      id: string;
      actor_email: string | null;
      action: "milestone_approved" | "milestone_rejected";
      summary: string | null;
      target_id: string | null;
      created_at: string;
      metadata: import("@/lib/engine-workspace").Json;
    }>;
  });

export const sendMilestoneToTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean().optional() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: m } = await sb
      .from("engine_milestones")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!m) throw new Error("Milestone not found");
    // Tai approves via the UI button — treat that as the human approval this
    // action needs (agent create_tasks is otherwise needs_approval by default).
    await assertActionAllowed(sb, m.project_id, "create_tasks", { approve: true });

    const criteria: any[] = Array.isArray(m.acceptance_criteria) ? m.acceptance_criteria : [];
    // Distribute due dates evenly leading up to the milestone's due date, so
    // each task lands with a reasonable target date instead of piling up.
    const milestoneDue = m.due_date ? new Date(m.due_date) : null;
    const totalCount = Math.min(criteria.length, 15);
    const perTaskGapDays = milestoneDue ? Math.max(2, Math.floor(21 / Math.max(totalCount, 1))) : 0;

    // Skip criteria that were already sent (name+milestone match) so re-runs
    // don't duplicate tasks.
    const { data: existing } = await sb
      .from("engine_tasks")
      .select("name")
      .eq("milestone_id", m.id);
    const existingNames = new Set(((existing ?? []) as any[]).map((r) => r.name));

    const rows = criteria.slice(0, 15).flatMap((c: any, i: number) => {
      const text = typeof c === "string" ? c : c.text ?? `Task ${i + 1}`;
      if (existingNames.has(text)) return [];
      const due = milestoneDue
        ? new Date(milestoneDue.getTime() - (totalCount - 1 - i) * perTaskGapDays * 86400_000)
        : null;
      return [{
        project_id: m.project_id,
        milestone_id: m.id,
        name: text,
        description: `From milestone "${m.name}" · ${m.phase ?? ""}`.trim(),
        priority: m.priority === "Critical" ? "P1" : "P2",
        status: "suggested",
        source: `Milestone: ${m.name}`,
        estimated_effort_hours: 4,
        estimated_cost_cents: 100,
        owner_email: m.owner_email ?? null,
        due_date: due ? due.toISOString().slice(0, 10) : null,
        acceptance_criteria: [{ text, done: !!(c as any)?.done }],
        created_by: "agent",
      }];
    });

    if (rows.length) {
      const { error } = await sb.from("engine_tasks").insert(rows);
      if (error) throwGeneric(error, "Operation failed");
    }

    // Log for the audit trail so the tasks page reflects provenance.
    await sb.from("engine_audit_log").insert({
      project_id: m.project_id,
      actor_email: (context as any).claims?.email ?? null,
      action: "milestone_to_tasks",
      summary: `Sent ${rows.length} tasks from milestone "${m.name}" to the board.`,
      affected_modules: ["tasks"],
      target_id: m.id,
      metadata: { milestone_id: m.id, count: rows.length },
    });

    return { ok: true as const, count: rows.length };
  });

// ============================================================
// Tasks
// ============================================================

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_tasks")
      .select("*, engine_milestones(name)")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throwGeneric(error, "Operation failed");
    return { rows: rows ?? [] };
  });

// Canonical task lifecycle — mirrors the STATUSES board columns in
// engine.projects.$projectId.agent.tasks.tsx. Free-string statuses would
// create tasks invisible to every board column.
const TASK_STATUSES = [
  "suggested",
  "drafted",
  "needs_review",
  "approved",
  "in_progress",
  "blocked",
  "completed",
  "rejected",
  "archived",
] as const;

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1),
        priority: z.string().default("P2"),
        status: z.enum(TASK_STATUSES).default("suggested"),
        // Pillar 11: tasks MUST belong to a milestone.
        milestoneId: z.string().uuid(),
        estimated_effort_hours: z.number().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;

    // Verify the milestone belongs to the same project (defense-in-depth in
    // addition to the FK) so callers can't attach tasks to unrelated milestones.
    const { data: ms } = await sb
      .from("engine_milestones")
      .select("id")
      .eq("id", data.milestoneId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!ms) throw new Error("Milestone not found in this project");

    const { data: row, error } = await sb
      .from("engine_tasks")
      .insert({
        project_id: data.projectId,
        name: data.name,
        priority: data.priority,
        status: data.status,
        milestone_id: data.milestoneId,
        estimated_effort_hours: data.estimated_effort_hours ?? null,
        created_by: "human",
      })
      .select("*")
      .single();
    if (error) throwGeneric(error, "Operation failed");
    return { task: row };
  });


export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(TASK_STATUSES) }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    // Phase 9C guard: ai_generated tasks cannot reach terminal status without
    // a human owner. Backfill owner_email with the acting admin when needed.
    const TERMINAL = new Set(["done", "accepted", "verified", "complete", "completed"]);
    const patch: any = { status: data.status };
    if (TERMINAL.has(data.status)) {
      const { data: cur } = await sb
        .from("engine_tasks")
        .select("ai_generated,owner_email")
        .eq("id", data.id)
        .single();
      if (cur?.ai_generated && !cur?.owner_email) {
        if (!email) {
          throw new Error(
            "Cannot mark an AI-generated task complete without a signed-in staff email.",
          );
        }
        patch.owner_email = email;
      }
    }

    const { error } = await sb
      .from("engine_tasks")
      .update(patch)
      .eq("id", data.id);
    if (error) throwGeneric(error, "Operation failed");
    return { ok: true as const };
  });

// ============================================================
// Cost center
// ============================================================

export const getAgentCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: proj } = await sb
      .from("engine_projects")
      .select("agent_budget_monthly_cents,agent_spend_month_cents,name")
      .eq("id", data.projectId)
      .single();
    const { data: tasks } = await sb
      .from("engine_agent_tasks")
      .select("id,kind,cost_cents,status,created_at,applied_module,related_module,category,tokens_in,tokens_out,roadmap_version_id")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: ledgerRows } = await sb
      .from("engine_agent_costs")
      .select("id,kind,category,cost_cents,status,created_at,related_module,tokens_in,tokens_out,model,actor_email,agent_task_id,roadmap_version_id")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    const ledger = (ledgerRows ?? []) as any[];

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const list = (tasks ?? []) as any[];
    const monthTasks = list.filter((t) => t.created_at >= monthStart);
    const totalSpend = list.reduce((s, t) => s + (t.cost_cents ?? 0), 0);
    const monthSpend = monthTasks.reduce((s, t) => s + (t.cost_cents ?? 0), 0);
    const approvedOutputs = list.filter((t) => t.status === "applied" || t.status === "saved_as_task").length;
    const rejectedOutputs = list.filter((t) => t.status === "rejected").length;
    const draftOutputs = list.filter((t) => t.status === "draft").length;
    const unusedDraftCost = list
      .filter((t) => t.status === "draft" || t.status === "rejected")
      .reduce((s, t) => s + (t.cost_cents ?? 0), 0);
    const budget = proj?.agent_budget_monthly_cents ?? 0;
    const remaining = Math.max(0, budget - monthSpend);
    const daysElapsed = Math.max(1, now.getDate());
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected = Math.round((monthSpend / daysElapsed) * daysInMonth);
    const costPerApproved = approvedOutputs > 0 ? Math.round(totalSpend / approvedOutputs) : 0;

    // Spend by category (kind)
    const catMap: Record<string, number> = {};
    for (const t of list) {
      const cat = (t.category as string) || (t.kind as string) || "other";
      catMap[cat] = (catMap[cat] ?? 0) + (t.cost_cents ?? 0);
    }
    const spendByCategory = Object.entries(catMap)
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents);

    // Spend timeline (last 30 days)
    const timelineMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      timelineMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const t of list) {
      const k = String(t.created_at).slice(0, 10);
      if (k in timelineMap) timelineMap[k] += t.cost_cents ?? 0;
    }
    const timeline = Object.entries(timelineMap).map(([date, cents]) => ({ date, cents }));

    // Spend by milestone — match engine_agent_tasks.related_module against
    // milestone names for this project so the cost center can show what each
    // milestone actually cost to draft (approvals + drafts + rejections).
    const { data: milestones } = await sb
      .from("engine_milestones")
      .select("id,name")
      .eq("project_id", data.projectId);
    const msList = (milestones ?? []) as Array<{ id: string; name: string }>;
    const msMap = new Map<string, { id: string; name: string; cents: number; approved_cents: number; approved_count: number; unused_cents: number }>();
    for (const m of msList) msMap.set(m.name.toLowerCase(), { id: m.id, name: m.name, cents: 0, approved_cents: 0, approved_count: 0, unused_cents: 0 });
    let unattributedCents = 0;
    for (const t of list) {
      const key = String(t.related_module ?? "").toLowerCase();
      const bucket = key ? msMap.get(key) : undefined;
      const cents = t.cost_cents ?? 0;
      if (!bucket) { unattributedCents += cents; continue; }
      bucket.cents += cents;
      if (t.status === "applied" || t.status === "saved_as_task") { bucket.approved_cents += cents; bucket.approved_count += 1; }
      else if (t.status === "draft" || t.status === "rejected") bucket.unused_cents += cents;
    }
    const spendByMilestone = [...msMap.values()]
      .filter((b) => b.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .map((b) => ({
        id: b.id,
        name: b.name,
        cents: b.cents,
        approved_cents: b.approved_cents,
        unused_cents: b.unused_cents,
        cost_per_approved: b.approved_count > 0 ? Math.round(b.cents / b.approved_count) : 0,
      }));

    return {
      project: proj,
      totals: {
        totalSpend,
        monthSpend,
        budget,
        remaining,
        projected,
        costPerApproved,
        unusedDraftCost,
        approvedOutputs,
        rejectedOutputs,
        draftOutputs,
        tasksCreated: list.length,
        unattributedCents,
      },
      spendByCategory,
      spendByMilestone,
      timeline,
      recent: list.slice(0, 15),
      ledger: ledger.slice(0, 25),
      ledgerCount: ledger.length,
    };
  });

// CSV export of the full cost ledger for the current project. Returns raw
// CSV text; the client is responsible for downloading it as a file.
export const exportAgentCostsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: proj } = await sb
      .from("engine_projects")
      .select("name, engine_clients(company)")
      .eq("id", data.projectId)
      .single();
    const { data: rows } = await sb
      .from("engine_agent_costs")
      .select("created_at,kind,category,related_module,model,tokens_in,tokens_out,cost_cents,status,actor_email,agent_task_id,roadmap_version_id")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    const header = [
      "created_at","kind","category","related_module","model",
      "tokens_in","tokens_out","cost_cents","cost_usd","status",
      "actor_email","agent_task_id","roadmap_version_id",
    ];
    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of (rows ?? []) as any[]) {
      const usd = ((r.cost_cents ?? 0) / 100).toFixed(2);
      lines.push([
        r.created_at, r.kind, r.category, r.related_module, r.model,
        r.tokens_in ?? 0, r.tokens_out ?? 0, r.cost_cents ?? 0, usd, r.status,
        r.actor_email, r.agent_task_id, r.roadmap_version_id,
      ].map(escape).join(","));
    }
    const filename = `cost-center_${(proj?.name ?? "project").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    return { csv: lines.join("\n"), filename, rowCount: (rows ?? []).length };
  });

export const updateBudgetControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        monthly_cap_cents: z.number().int().min(0).max(1_000_000).optional(),
        warning_threshold_pct: z.number().int().min(0).max(100).optional(),
        hard_stop_pct: z.number().int().min(0).max(200).optional(),
        require_approval_above_cents: z.number().int().min(0).max(1_000_000).optional(),
        preferred_model: z.string().max(120).optional(),
        auto_pause_when_exceeded: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { projectId, ...patch } = data;
    await sb
      .from("engine_agent_permissions")
      .upsert({ project_id: projectId, ...patch }, { onConflict: "project_id" });
    if (patch.monthly_cap_cents != null) {
      await sb
        .from("engine_projects")
        .update({ agent_budget_monthly_cents: patch.monthly_cap_cents })
        .eq("id", projectId);
    }
    await sb.from("engine_audit_log").insert({
      project_id: projectId,
      actor_email: email,
      action: "budget_controls_updated",
      summary: `Updated budget controls (${Object.keys(patch).join(", ")}).`,
      affected_modules: ["permissions"],
      metadata: patch,
    });
    return { ok: true as const };
  });

// ============================================================
// Permissions
// ============================================================

const DEFAULT_ACTIONS: Record<string, "allowed" | "needs_approval" | "blocked"> = {
  generate_milestone_briefs: "allowed",
  create_acceptance_criteria: "allowed",
  draft_developer_prompts: "allowed",
  create_tasks: "needs_approval",
  update_roadmap_drafts: "needs_approval",
  compare_versions: "allowed",
  prepare_client_facing_copy: "needs_approval",
  export_pdf: "needs_approval",
  send_delivery: "blocked",
  move_project_to_execution: "blocked",
};

const SAFETY_RULES = [
  "AI cannot overwrite approved roadmap",
  "AI cannot publish client-facing content",
  "AI cannot send emails or deliver files",
  "AI cannot approve its own version",
  "AI cannot change investment ranges without review",
  "AI cannot move project status to delivered",
];

export const getPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: row } = await sb
      .from("engine_agent_permissions")
      .select("*")
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) {
      const { data: created } = await sb
        .from("engine_agent_permissions")
        .insert({
          project_id: data.projectId,
          permission_mode: "draft_only",
          action_permissions: DEFAULT_ACTIONS,
          safety_rules: SAFETY_RULES,
        })
        .select("*")
        .single();
      return { permissions: created, safety_rules: SAFETY_RULES };
    }
    return { permissions: row, safety_rules: SAFETY_RULES };
  });

export const updatePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        permission_mode: z.enum(["draft_only", "propose_updates", "execute_approved"]).optional(),
        action_permissions: z.record(z.string(), z.enum(["allowed", "needs_approval", "blocked"])).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { projectId, ...patch } = data;

    // Enforce safety rules server-side
    if (patch.action_permissions) {
      const ap = { ...patch.action_permissions };
      // Never let AI publish, deliver, or move to execution
      if (ap.send_delivery && ap.send_delivery !== "blocked") ap.send_delivery = "blocked";
      if (ap.move_project_to_execution && ap.move_project_to_execution !== "blocked")
        ap.move_project_to_execution = "blocked";
      patch.action_permissions = ap;
    }

    await sb
      .from("engine_agent_permissions")
      .upsert(
        { project_id: projectId, safety_rules: SAFETY_RULES, ...patch },
        { onConflict: "project_id" },
      );
    if (patch.permission_mode) {
      await sb
        .from("engine_projects")
        .update({ agent_permission_level: patch.permission_mode })
        .eq("id", projectId);
    }
    const email = (context as any).claims?.email ?? null;
    await sb.from("engine_audit_log").insert({
      project_id: projectId,
      actor_email: email,
      action: "agent_permissions_updated",
      summary: `Updated agent permissions (${Object.keys(patch).join(", ")}).`,
      affected_modules: ["permissions"],
      metadata: patch,
    });
    return { ok: true as const };
  });

// ============================================================
// Delivery send (project-level, admin-only, gated)
// ============================================================

export const sendProjectDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        checklist: z.record(z.string(), z.boolean()),
        confirmed: z.literal(true),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    // Require every checklist entry to be true. Client sends the full map.
    const unchecked = Object.entries(data.checklist).filter(([, v]) => !v).map(([k]) => k);
    if (unchecked.length) {
      throw new Error(`Approval checklist incomplete: ${unchecked.join(", ")}`);
    }

    const { data: proj } = await sb
      .from("engine_projects")
      .select("id,name,client_id,approved_snapshot,approved_version,delivery,roadmap,point_a,point_b")
      .eq("id", data.projectId)
      .single();
    if (!proj) throw new Error("Project not found");
    if (!proj.approved_snapshot || Object.keys(proj.approved_snapshot).length === 0) {
      throw new Error("Cannot send: no approved roadmap version exists yet.");
    }

    // Resolve the approved engine version (required to satisfy the portal FK trigger).
    // Also enforce the client-preview approval gate here — sendProjectDelivery
    // must NOT bypass what publishVersionToPortal enforces.
    const { data: approvedVersion } = await sb
      .from("engine_roadmap_versions")
      .select("id,version,payload,approved_at,client_preview_status")
      .eq("project_id", data.projectId)
      .not("approved_at", "is", null)
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!approvedVersion?.id) {
      throw new Error("Cannot send: no approved roadmap version row found in engine_roadmap_versions.");
    }
    if (approvedVersion.client_preview_status !== "approved") {
      throw new Error("Cannot send: the client preview for the approved version has not been approved yet.");
    }

    // Resolve client + recipient.
    const { data: client } = await sb
      .from("engine_clients")
      .select("company,contact_email")
      .eq("id", proj.client_id)
      .maybeSingle();
    const deliveryPrev = (proj.delivery as Record<string, any> | null) ?? {};
    const recipientEmail: string | undefined = (
      deliveryPrev.recipient_email || client?.contact_email || ""
    )
      .toString()
      .trim()
      .toLowerCase() || undefined;
    if (!recipientEmail) {
      throw new Error("Cannot send: no recipient email on delivery or client record.");
    }

    const nowIso = new Date().toISOString();

    // -------- Portal handoff: portal project, roadmap_document, client_portal_roadmap --------
    // Find or create the client portal project keyed by primary_email.
    let { data: portalProject } = await sb
      .from("client_portal_projects")
      .select("id,portal_status")
      .ilike("primary_email", recipientEmail)
      .maybeSingle();
    if (!portalProject) {
      const { data: created, error: cpErr } = await sb
        .from("client_portal_projects")
        .insert({
          primary_email: recipientEmail,
          contact_name: deliveryPrev.recipient_name ?? null,
          company_name: client?.company ?? null,
          portal_status: "roadmap_delivered",
          current_phase: "Roadmap delivered",
          owner_email: email,
          access_granted_at: nowIso,
        })
        .select("id,portal_status")
        .single();
      if (cpErr) throw cpErr;
      portalProject = created;
    }
    const portalProjectId = portalProject!.id as string;

    // Ensure a client_portal_permissions grant exists for the recipient so
    // RLS on files / messages / activity resolves to this workspace.
    await sb
      .from("client_portal_permissions")
      .upsert(
        {
          project_id: portalProjectId,
          email: recipientEmail,
          granted_by: email ?? null,
          granted_at: nowIso,
          revoked_at: null,
        },
        { onConflict: "project_id,email" },
      );

    // Auto-link the engine project to its portal project so future publish
    // operations resolve the destination without manual DB edits.
    await sb
      .from("engine_projects")
      .update({ client_portal_project_id: portalProjectId })
      .eq("id", data.projectId);




    // Build a minimal client-safe body_md from the approved snapshot.
    const snap = (proj.approved_snapshot as Record<string, any>) ?? {};
    const priorities: any[] = Array.isArray(snap.roadmap?.priorities)
      ? snap.roadmap.priorities
      : Array.isArray(proj.roadmap?.priorities)
        ? (proj.roadmap as any).priorities
        : [];
    const execSummary: string =
      snap.client_preview?.executive_summary ||
      snap.roadmap?.summary ||
      (proj.roadmap as any)?.summary ||
      "";
    const bodyMd = [
      `# ${proj.name}`,
      execSummary ? `\n${execSummary}\n` : "",
      priorities.length
        ? "## Strategic priorities\n" +
          priorities
            .map((p: any, i: number) =>
              `- **${p.title ?? p.name ?? `Priority ${i + 1}`}** — ${p.summary ?? p.description ?? ""}`,
            )
            .join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Insert the client-facing roadmap document (keyed to recipient email).
    const { data: doc, error: docErr } = await sb
      .from("roadmap_documents")
      .insert({
        client_email: recipientEmail,
        title: `${proj.name} — Approved Roadmap ${approvedVersion.version ?? ""}`.trim(),
        body_md: bodyMd,
        published_at: nowIso,
      })
      .select("id")
      .single();
    if (docErr) throw docErr;

    // Route the client_portal_roadmaps write through the SECURITY DEFINER
    // RPC so status transitions, `published` uniqueness, and publish events
    // land atomically. (Phase 3B — replaces the direct insert.)
    const { data: pubEventId, error: rpcErr } = await sb.rpc("publish_portal_roadmap", {
      _portal_project_id: portalProjectId,
      _engine_project_id: data.projectId,
      _engine_version_id: approvedVersion.id,
      _title: `${proj.name} — Roadmap ${approvedVersion.version ?? ""}`.trim(),
      _version_label: approvedVersion.version ?? "Version 1",
      _executive_summary: execSummary || "",
      _current_diagnosis: "",
      _strategic_priorities: priorities as unknown as Record<string, unknown>[],
      _sequence_30_60_90: {},
      _risks_dependencies: [],
      _recommended_next_move: "",
      _client_safe_canvas: {},
      _visible_modules: {},
      _publish_diff: {},
      _summary: `Delivery send — ${approvedVersion.version ?? ""}`,
    });
    if (rpcErr) throw rpcErr;
    const { data: evtRow, error: evtErr } = await sb
      .from("client_portal_publish_events")
      .select("portal_roadmap_id")
      .eq("id", pubEventId as string)
      .single();
    if (evtErr) throw evtErr;
    const portalRoadmapId = (evtRow as { portal_roadmap_id: string }).portal_roadmap_id;
    // Link the freshly-published row to the roadmap document (mutable field
    // outside the immutability allowlist would be blocked — leave for now).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _docId = doc.id;

    // Bump the portal project state.
    await sb
      .from("client_portal_projects")
      .update({
        portal_status: "roadmap_delivered",
        approved_roadmap_id: portalRoadmapId,
        last_client_activity_at: nowIso,
      })
      .eq("id", portalProjectId);

    // Client-visible activity in the portal timeline.
    await sb.rpc("log_client_portal_activity", {
      _project_id: portalProjectId,
      _actor_type: "tai",
      _actor_email: email,
      _event_type: "roadmap_delivered",
      _summary: "Your approved roadmap has been delivered.",
      _client_visible: true,
      _metadata: { approved_roadmap_version_id: approvedVersion.id, portal_roadmap_id: portalRoadmapId } as any,
    });

    // Persist checklist state + delivery marker onto the engine project.
    const nextDelivery = {
      ...deliveryPrev,
      approval_checklist: data.checklist,
      sent_at: nowIso,
      sent_by_email: email,
      portal_roadmap_id: portalRoadmapId,
      portal_project_id: portalProjectId,
      recipient_email: recipientEmail,
    };
    await sb
      .from("engine_projects")
      .update({ delivery: nextDelivery, status: "delivered" })
      .eq("id", data.projectId);

    // Transition every linked delivery item to "uploaded_to_portal" and link the portal roadmap.
    const { data: items } = await sb
      .from("engine_delivery_items")
      .select("id,status")
      .eq("project_id", data.projectId);
    for (const it of (items ?? []) as Array<{ id: string; status: string }>) {
      await sb
        .from("engine_delivery_items")
        .update({
          status: "uploaded_to_portal",
          client_portal_roadmap_id: portalRoadmapId,
          last_action: `Uploaded to portal · ${new Date().toLocaleString()}`,
          approved_by: email,
        })
        .eq("id", it.id);
      await sb.from("engine_delivery_history").insert({
        delivery_id: it.id,
        from_status: it.status,
        to_status: "uploaded_to_portal",
        note: `Published approved roadmap ${approvedVersion.version ?? ""} to client portal`,
        actor: email,
      });
    }

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "delivery_sent",
      title: `Delivery uploaded to portal for ${client?.company ?? recipientEmail}`,
      body: email ? `Sent by ${email}` : null,
      severity: "success",
    });
    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: email,
      action: "delivery_sent",
      summary: `Published approved roadmap ${approvedVersion.version ?? ""} to client portal.`,
      affected_modules: ["delivery", "client_portal"],
      metadata: {
        checklist: data.checklist,
        approved_version: proj.approved_version,
        portal_project_id: portalProjectId,
        portal_roadmap_id: portalRoadmapId,
        approved_roadmap_version_id: approvedVersion.id,
      },
    });

    return { ok: true as const, portalRoadmapId, portalProjectId };
  });

// Persist just the delivery checklist state without sending (for UI persistence).
export const saveDeliveryChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        checklist: z.record(z.string(), z.boolean()),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: proj } = await sb
      .from("engine_projects")
      .select("delivery")
      .eq("id", data.projectId)
      .single();
    const nextDelivery = {
      ...((proj?.delivery as Record<string, unknown> | null) ?? {}),
      approval_checklist: data.checklist,
    };
    await sb
      .from("engine_projects")
      .update({ delivery: nextDelivery })
      .eq("id", data.projectId);
    return { ok: true as const };
  });

// ============================================================
// Execution handoff (post-delivery, requires explicit client ack)
// ============================================================

/**
 * Read-only snapshot of the client's portal handoff state for a project:
 * has the client viewed / downloaded / acknowledged the delivered roadmap,
 * and what is the current portal lifecycle status. Used by the Delivery Room
 * to gate the "Start Engagement" action.
 */
export const getPortalHandoffState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: item } = await sb
      .from("engine_delivery_items")
      .select(
        "client_portal_roadmap_id, client_viewed_at, client_downloaded_at, client_acknowledged_at, client_acknowledged_by_email",
      )
      .eq("project_id", data.projectId)
      .not("client_portal_roadmap_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!item?.client_portal_roadmap_id) {
      return {
        portalRoadmapId: null,
        portalProjectId: null,
        portalStatus: null,
        viewedAt: null,
        downloadedAt: null,
        acknowledgedAt: null,
        acknowledgedByEmail: null,
      } as const;
    }
    const { data: cpr } = await sb
      .from("client_portal_roadmaps")
      .select("id, project_id, acknowledged_at, acknowledged_by_email")
      .eq("id", item.client_portal_roadmap_id)
      .maybeSingle();
    let portalStatus: string | null = null;
    if (cpr?.project_id) {
      const { data: pp } = await sb
        .from("client_portal_projects")
        .select("portal_status")
        .eq("id", cpr.project_id)
        .maybeSingle();
      portalStatus = pp?.portal_status ?? null;
    }
    return {
      portalRoadmapId: cpr?.id ?? null,
      portalProjectId: cpr?.project_id ?? null,
      portalStatus,
      viewedAt: item.client_viewed_at ?? null,
      downloadedAt: item.client_downloaded_at ?? null,
      acknowledgedAt: cpr?.acknowledged_at ?? item.client_acknowledged_at ?? null,
      acknowledgedByEmail:
        cpr?.acknowledged_by_email ?? item.client_acknowledged_by_email ?? null,
    } as const;
  });

/**
 * Admin-only. Flips the client portal into engagement_active AFTER the client
 * has explicitly acknowledged the delivered roadmap. Also moves the engine
 * project to in_execution and writes activity/audit rows. Explicit human gate
 * — never called by an agent.
 */
export const startExecutionEngagement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    const { data: item } = await sb
      .from("engine_delivery_items")
      .select("client_portal_roadmap_id")
      .eq("project_id", data.projectId)
      .not("client_portal_roadmap_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!item?.client_portal_roadmap_id) {
      throw new Error("No delivered portal roadmap linked to this project.");
    }
    const { data: cpr } = await sb
      .from("client_portal_roadmaps")
      .select("id, project_id, acknowledged_at")
      .eq("id", item.client_portal_roadmap_id)
      .single();
    if (!cpr?.acknowledged_at) {
      throw new Error("Client has not acknowledged the roadmap yet.");
    }

    const nowIso = new Date().toISOString();

    await sb
      .from("client_portal_projects")
      .update({
        portal_status: "engagement_active",
        current_phase: "Engagement in progress",
        last_client_activity_at: nowIso,
      })
      .eq("id", cpr.project_id);

    await sb
      .from("engine_projects")
      .update({ status: "in_execution" })
      .eq("id", data.projectId);

    await sb.rpc("log_client_portal_activity", {
      _project_id: cpr.project_id,
      _actor_type: "tai",
      _actor_email: email,
      _event_type: "engagement_started",
      _summary: "Tai has kicked off your execution engagement.",
      _client_visible: true,
      _metadata: { source_roadmap_id: cpr.id } as unknown as never,
    });

    await sb.from("engine_activity").insert({
      project_id: data.projectId,
      kind: "engagement_started",
      title: "Execution engagement started",
      body: email ? `Started by ${email}` : null,
      severity: "success",
    });
    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: email,
      action: "engagement_started",
      summary: "Execution engagement started after client acknowledgement.",
      affected_modules: ["delivery", "client_portal", "execution"],
      metadata: {
        portal_project_id: cpr.project_id,
        portal_roadmap_id: cpr.id,
      },
    });

    return { ok: true as const, portalProjectId: cpr.project_id };
  });


// ============================================================
// Version compare
// ============================================================

const MODULE_KEYS = [
  { key: "point_a", label: "Point A Diagnosis" },
  { key: "point_b", label: "Point B Definition" },
  { key: "hidden_assets", label: "Hidden Assets" },
  { key: "gap_map", label: "Gap Map" },
  { key: "blueprint", label: "System Blueprint" },
  { key: "roadmap", label: "Roadmap Builder" },
  { key: "sequencing", label: "Sequencing" },
  { key: "deadlines", label: "Deadline Plan" },
  { key: "investment", label: "Investment Builder" },
  { key: "client_preview", label: "Client Preview" },
] as const;

export const getVersionCompareData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: versions } = await sb
      .from("engine_roadmap_versions")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);

    const list = (versions ?? []) as any[];
    const approved = list.find((v) => v.status === "approved") ?? null;
    const draft = list.find((v) => v.status === "ai_generated" || v.status === "draft") ?? null;

    const changesByModule: Record<string, any[]> = {};
    let totalChanges = 0;
    let added = 0;
    let modified = 0;
    let removed = 0;
    let modulesAffected = 0;

    for (const m of MODULE_KEYS) {
      const before = approved?.payload?.[m.key] ?? null;
      const after = draft?.payload?.[m.key] ?? null;
      const beforeStr = JSON.stringify(before ?? {});
      const afterStr = JSON.stringify(after ?? {});
      const changes: any[] = [];
      if (beforeStr !== afterStr) {
        modulesAffected += 1;
        if (!before && after) {
          added += 1;
          changes.push({ type: "added", label: `${m.label} added`, before: null, after, impact: "medium" });
        } else if (before && !after) {
          removed += 1;
          changes.push({ type: "removed", label: `${m.label} removed`, before, after: null, impact: "high" });
        } else {
          modified += 1;
          changes.push({
            type: "modified",
            label: `${m.label} updated`,
            before,
            after,
            impact: JSON.stringify(after).length > JSON.stringify(before).length * 1.5 ? "high" : "medium",
          });
        }
        totalChanges += 1;
      }
      changesByModule[m.key] = changes;
    }

    return {
      approved,
      draft,
      modules: MODULE_KEYS.map((m) => ({ ...m, changes: changesByModule[m.key] })),
      summary: { totalChanges, added, modified, removed, conflicts: 0, modulesAffected },
    };
  });

/* ============================================================
 * Version-Compare per-change decisions
 * ============================================================ */

export type VersionChangeDecisionRow = {
  id: string;
  version_id: string;
  project_id: string;
  module_key: string;
  change_id: string;
  decision: "accept" | "edit" | "reject";
  note: string | null;
  actor_email: string | null;
  created_at: string;
};

export const listVersionChangeDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ version_id: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<VersionChangeDecisionRow[]> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("engine_version_change_decisions")
      .select("*")
      .eq("version_id", data.version_id)
      .order("created_at", { ascending: true });
    if (error) throwGeneric(error, "list decisions failed");
    return (rows ?? []) as VersionChangeDecisionRow[];
  });

export const recordVersionChangeDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      version_id: z.string().uuid(),
      project_id: z.string().uuid(),
      module_key: z.string().min(1),
      change_id: z.string().min(1),
      decision: z.enum(["accept", "edit", "reject"]),
      note: z.string().nullable().optional(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; id: string }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { data: r, error } = await sb
      .from("engine_version_change_decisions")
      .insert({
        version_id: data.version_id,
        project_id: data.project_id,
        module_key: data.module_key,
        change_id: data.change_id,
        decision: data.decision,
        note: data.note ?? null,
        actor_email: email,
      })
      .select("id")
      .single();
    if (error) throwGeneric(error, "record decision failed");
    return { ok: true, id: r.id };
  });

// ============================================================
// Regenerate milestone brief sections via Lovable AI Gateway
// ============================================================
const REGEN_SECTIONS = ["brief_md", "developer_prompt", "client_safe_md", "acceptance_criteria", "qa_checklist", "risks"] as const;
type RegenSection = (typeof REGEN_SECTIONS)[number];

export const regenerateMilestoneSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      id: z.string().uuid(),
      section: z.enum(REGEN_SECTIONS),
      instructions: z.string().max(2000).optional(),
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ ok: true; value: any }> => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;

    const { data: current, error: readErr } = await sb
      .from("engine_milestones")
      .select("id,project_id,name,phase,brief_md,developer_prompt,client_safe_md,acceptance_criteria,qa_checklist,risks,dependencies,approval_status")
      .eq("id", data.id)
      .single();
    if (readErr || !current) throw new Error(readErr?.message ?? "Milestone not found");
    if (current.approval_status === "approved") {
      throw new Error("Milestone is approved — reset approval before regenerating.");
    }

    const { callLovableAi, parseJsonOutput } = await import("./engine-ai.server");

    const sectionAsk: Record<RegenSection, string> = {
      brief_md: "Rewrite the milestone brief as concise markdown. Include Purpose, Why It Matters, Business Outcome, User Outcome, System Outcome as bolded headings.",
      developer_prompt: "Regenerate a concrete developer prompt (plain text) explaining what to build for this milestone, with numbered requirements.",
      client_safe_md: "Regenerate a short, non-technical client-facing explanation as a single paragraph.",
      acceptance_criteria: "Regenerate acceptance criteria. Respond as JSON: {\"items\": [{\"text\": string, \"done\": false}]}",
      qa_checklist: "Regenerate the QA checklist. Respond as JSON: {\"items\": [{\"section\": string, \"items\": number, \"note\": string}]}",
      risks: "Regenerate the risk list. Respond as JSON: {\"items\": [{\"text\": string, \"severity\": \"Low\"|\"Medium\"|\"High\"}]}",
    };

    const isJson = ["acceptance_criteria", "qa_checklist", "risks"].includes(data.section);

    const sys = "You are a senior product strategist redrafting one section of an internal milestone brief. Be concrete, no fluff, no filler.";
    const user = `Milestone: ${current.name}\nPhase: ${current.phase ?? "—"}\nExisting brief:\n${current.brief_md ?? "(none)"}\n\nTask: ${sectionAsk[data.section as RegenSection]}${
      data.instructions ? `\n\nAdditional guidance from Tai: ${data.instructions}` : ""
    }`;

    const ai = await callLovableAi(
      [{ role: "system", content: sys }, { role: "user", content: user }],
      { json: isJson, temperature: 0.4 },
    );

    let newValue: unknown = ai.text;
    if (isJson) {
      const parsed = parseJsonOutput<{ items: unknown[] }>(ai.text);
      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error("AI returned an unexpected shape — try again.");
      }
      newValue = parsed.items;
    } else {
      newValue = (ai.text ?? "").trim();
    }

    // B12: route governed columns through the SECURITY DEFINER RPC so the
    // `engine_milestones_require_proposal` trigger accepts the write. Non-governed
    // sections (qa_checklist, risks) keep the plain UPDATE.
    if (PROTECTED_APPROVED_FIELDS.has(data.section)) {
      const { error: updErr } = await sb.rpc("admin_edit_milestone_governed", {
        _id: data.id,
        _patch: { [data.section]: newValue },
      });
      if (updErr) throwGeneric(updErr, "Operation failed");
      // created_by_kind is non-governed; stamp it separately.
      await sb.from("engine_milestones").update({ created_by_kind: "ai" }).eq("id", data.id);
    } else {
      const { error: updErr } = await sb
        .from("engine_milestones")
        .update({ [data.section]: newValue, created_by_kind: "ai" })
        .eq("id", data.id);
      if (updErr) throwGeneric(updErr, "Operation failed");
    }

    await sb.from("engine_audit_log").insert({
      project_id: current.project_id,
      actor_email: email,
      action: "milestone_section_regenerated",
      summary: `Regenerated "${data.section}" for milestone "${current.name}".`,
      affected_modules: ["milestones"],
      target_id: current.id,
      metadata: { section: data.section, tokens_in: ai.tokens_in, tokens_out: ai.tokens_out, cost_cents: ai.cost_cents },
    });

    // Record to agent cost ledger for transparency
    try {
      await sb.from("engine_agent_costs").insert({
        project_id: current.project_id,
        actor_email: email,
        action: "regenerate_milestone_section",
        model: "google/gemini-3-flash-preview",
        tokens_in: ai.tokens_in,
        tokens_out: ai.tokens_out,
        cost_cents: ai.cost_cents,
        metadata: { section: data.section, milestone_id: current.id },
      });
    } catch { /* ledger insert is best-effort */ }

    return { ok: true, value: newValue };
  });

// ============================================================
// AI Task Decomposition (Momentum triad #2)
// Generates suggested tasks from approved milestones. AI cannot
// mark them official — status stays "suggested" until an operator
// approves via updateTaskStatus.
// ============================================================

type AiTaskDraft = {
  title?: string;
  purpose?: string;
  priority?: string;
  dependency_notes?: string;
  acceptance_criteria?: Array<string | { text?: string }>;
  qa_checklist?: Array<string | { text?: string }>;
  risks?: Array<string | { text?: string; severity?: string }>;
  expected_artifact?: string;
};

export const generateTasksForApprovedMilestones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        // Optional: restrict to a single milestone
        milestoneId: z.string().uuid().optional(),
        // Cap tasks per milestone so runaway drafts don't flood the board
        maxPerMilestone: z.number().int().min(1).max(10).default(5),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    await assertActionAllowed(sb, data.projectId, "create_tasks", { approve: true });

    // Fetch approved milestones (or one specific one).
    let q = sb
      .from("engine_milestones")
      .select("id,name,phase,owner_email,priority,due_date,acceptance_criteria,brief_md,approval_status")
      .eq("project_id", data.projectId)
      .eq("approval_status", "approved");
    if (data.milestoneId) q = q.eq("id", data.milestoneId);
    const { data: milestones, error: mErr } = await q;
    if (mErr) throwGeneric(mErr, "Could not load milestones");
    const approved = (milestones ?? []) as Array<Record<string, any>>;
    if (approved.length === 0) {
      return { ok: true as const, milestones: 0, tasks_created: 0, note: "No approved milestones to decompose." };
    }

    const { callLovableAi, parseJsonOutput } = await import("./engine-ai.server");

    let tasksCreated = 0;
    const email = (context as any).claims?.email ?? "agent";

    for (const m of approved) {
      // Skip milestones that already have AI-generated task drafts.
      const { data: existing } = await sb
        .from("engine_tasks")
        .select("id,name,ai_generated")
        .eq("milestone_id", m.id);
      const existingAi = ((existing ?? []) as Array<any>).filter((r) => r.ai_generated);
      if (existingAi.length >= data.maxPerMilestone) continue;

      const criteria = Array.isArray(m.acceptance_criteria)
        ? m.acceptance_criteria.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).filter(Boolean).join("\n- ")
        : "";
      const prompt = [
        `You are a senior AI product manager decomposing an approved milestone into ${data.maxPerMilestone} concrete tasks.`,
        `Return ONLY valid JSON of the shape:`,
        `{ "tasks": [ { "title": string, "purpose": string, "priority": "P1"|"P2"|"P3", "dependency_notes": string, "acceptance_criteria": [string], "qa_checklist": [string], "risks": [ { "text": string, "severity": "low"|"med"|"high" } ], "expected_artifact": string } ] }`,
        ``,
        `Milestone: ${m.name}`,
        `Phase: ${m.phase ?? "n/a"}`,
        `Owner: ${m.owner_email ?? "unassigned"}`,
        `Priority: ${m.priority ?? "n/a"}`,
        `Due: ${m.due_date ?? "n/a"}`,
        ``,
        `Milestone brief:`,
        m.brief_md ?? "(no brief)",
        ``,
        `Acceptance criteria for the milestone:`,
        criteria ? `- ${criteria}` : "(none)",
        ``,
        `Guidance: each task must be executable in <= 5 days by one owner. Purpose in one sentence. Acceptance criteria are testable. QA checklist is separate. Risks are concrete.`,
      ].join("\n");

      let ai;
      try {
        ai = await callLovableAi(
          [
            { role: "system", content: "You output strict JSON only. No markdown, no commentary." },
            { role: "user", content: prompt },
          ],
          { json: true, temperature: 0.2 },
        );
      } catch (err) {
        // Skip this milestone but keep going.
        await sb.from("engine_activity").insert({
          project_id: data.projectId,
          kind: "ai_task_gen_failed",
          title: `AI task generation failed for milestone "${m.name}"`,
          body: err instanceof Error ? err.message : String(err),
          severity: "warning",
        });
        continue;
      }

      const parsed = parseJsonOutput<{ tasks: AiTaskDraft[] }>(ai.text);
      const tasks = Array.isArray(parsed?.tasks) ? parsed!.tasks : [];
      if (!tasks.length) continue;

      const asStrings = (arr: Array<string | { text?: string }> | undefined): Array<{ text: string; done: boolean }> =>
        (arr ?? [])
          .map((c) => (typeof c === "string" ? c : c?.text ?? ""))
          .filter(Boolean)
          .map((text) => ({ text, done: false }));

      const rows = tasks.slice(0, data.maxPerMilestone).map((t) => ({
        project_id: data.projectId,
        milestone_id: m.id,
        name: (t.title ?? "Untitled task").slice(0, 240),
        description: t.dependency_notes ?? null,
        priority: ["P1", "P2", "P3"].includes(t.priority ?? "") ? t.priority : m.priority === "Critical" ? "P1" : "P2",
        status: "suggested",
        source: `AI decomposition: ${m.name}`,
        owner_email: m.owner_email ?? null,
        acceptance_criteria: asStrings(t.acceptance_criteria),
        qa_checklist: asStrings(t.qa_checklist),
        purpose: t.purpose ?? null,
        expected_artifact: t.expected_artifact ?? null,
        dependency_notes: t.dependency_notes ?? null,
        risks: (t.risks ?? []).map((r) => (typeof r === "string" ? { text: r, severity: "med" } : r)),
        ai_generated: true,
        created_by: "agent",
      }));

      const { error } = await sb.from("engine_tasks").insert(rows);
      if (error) throwGeneric(error, "Failed to insert generated tasks");
      tasksCreated += rows.length;

      await sb.from("engine_agent_costs").insert({
        project_id: data.projectId,
        actor_email: email,
        action: "generate_tasks_for_milestone",
        model: "google/gemini-3-flash-preview",
        tokens_in: ai.tokens_in,
        tokens_out: ai.tokens_out,
        cost_cents: ai.cost_cents,
        metadata: { milestone_id: m.id, count: rows.length },
      });
    }

    await sb.from("engine_audit_log").insert({
      project_id: data.projectId,
      actor_email: email,
      action: "ai_task_decomposition",
      summary: `AI decomposed ${approved.length} milestone(s) into ${tasksCreated} suggested task(s).`,
      affected_modules: ["tasks"],
      metadata: { milestones: approved.length, tasks_created: tasksCreated },
    });

    return { ok: true as const, milestones: approved.length, tasks_created: tasksCreated };
  });

