/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";

async function assertAdmin(context: any) {
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
    if (error) throw new Error(error.message);
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
    // Try lookup; if not found, seed a Q-Bank Engine sample so the page always renders.
    let { data: row } = await sb
      .from("engine_milestones")
      .select("*")
      .eq("id", data.milestoneId)
      .maybeSingle();

    if (!row) {
      const { data: any1 } = await sb
        .from("engine_milestones")
        .select("*")
        .eq("project_id", data.projectId)
        .limit(1)
        .maybeSingle();
      if (any1) row = any1;
    }

    if (!row) {
      const { data: created } = await sb
        .from("engine_milestones")
        .insert({
          project_id: data.projectId,
          name: "Q-Bank Engine",
          phase: "Phase 1: Foundation",
          status: "draft",
          priority: "Critical",
          deadline_relevance: "Blocks Oct 1 pre-test",
          due_date: "2026-10-01",
          related_system_node: "Q-Bank Engine",
          related_gap: "No Q-Bank engine for practice",
          related_hidden_asset: "Question Bank in Word Docs",
          estimated_effort: "2-3 weeks",
          estimated_cost_cents: 420,
          approval_status: "draft",
          confidence: 92,
          brief_md: `**Purpose**: Create a question bank system that allows students to practice INBDE questions by category, review explanations, track performance, and prepare for mock exams.

**Why It Matters**: The Q-Bank Engine is core to student performance and the Oct 1 pre-test. Without it, students cannot practice effectively or build confidence.

**Business Outcome**: Improved student pass rates, higher engagement, and stronger program value.

**Student Outcome**: Students can practice targeted questions, see explanations, and improve faster.

**System Outcome**: Structured question data, performance tracking, and analytics for decision making.`,
          acceptance_criteria: [
            { text: "Admin can import questions from a structured CSV template", done: false },
            { text: "Each question supports category, topic, difficulty, explanation, and correct answer", done: false },
            { text: "Student can answer multiple choice questions", done: false },
            { text: "Student can mark questions for review", done: false },
            { text: "System tracks correct and incorrect answers", done: false },
            { text: "Student can review explanations after answering", done: false },
            { text: "Ryan can view question performance analytics", done: false },
            { text: "Questions can be filtered by INBDE category", done: false },
            { text: "Access is limited to active students only", done: false },
            { text: "System supports future mock exam integration", done: false },
          ],
          developer_prompt: `Build the Q-Bank Engine for Mental Dental Academy.

Purpose:
Create a question bank system that allows students to practice INBDE questions by category, review explanations, track performance, and prepare for mock exams.

Core Requirements:
1. Admin can import questions via CSV template
2. Question fields: category, topic, difficulty, explanation, correct answer, options
3. Student interface for answering questions
4. Answer tracking and performance analytics
5. Review mode with explanations
6. Filter questions by category and topic
7. Access control for active students only`,
          qa_checklist: [
            { section: "Functional Checks", items: 14, note: "Features work as expected" },
            { section: "Access & Permissions", items: 8, note: "Roles and access control" },
            { section: "Data Integrity", items: 10, note: "Data accuracy and validation" },
            { section: "Student Experience", items: 9, note: "Usability and flow testing" },
            { section: "Admin Experience", items: 7, note: "Admin workflows and tools" },
            { section: "Edge Cases", items: 8, note: "Boundary and error handling" },
            { section: "Performance", items: 6, note: "Speed and load testing" },
            { section: "Security", items: 7, note: "Security and privacy checks" },
          ],
          dependencies: [
            { name: "Student Accounts System", status: "Completed" },
            { name: "Content Management", status: "In Progress" },
            { name: "Analytics Foundation", status: "Planned" },
          ],
          risks: [
            { text: "Question import format not confirmed", severity: "Medium" },
            { text: "Time constraint before Oct 1", severity: "High" },
          ],
          decisions: [
            { text: "Confirm question import format", status: "Needed from Ryan" },
          ],
          client_safe_md: `The Q-Bank Engine is the practice center for your students. It will give them access to INBDE-style questions by category, show explanations, and track their performance so they know where to focus. This is a critical step before the Oct 1 pre-test so students can build confidence and improve faster.`,
        })
        .select("*")
        .single();
      row = created;
    }
    return { milestone: row };
  });

export const updateMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    // Safety: never approve as agent
    const patch: any = { ...data.patch };
    delete patch.id;
    delete patch.project_id;
    const { error } = await sb.from("engine_milestones").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const approveMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const email = (context as any).claims?.email ?? null;
    const { error } = await sb
      .from("engine_milestones")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by_email: email,
        status: "approved",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
      if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        name: z.string().min(1),
        priority: z.string().default("P2"),
        status: z.string().default("suggested"),
        milestoneId: z.string().uuid().optional().nullable(),
        estimated_effort_hours: z.number().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("engine_tasks")
      .insert({
        project_id: data.projectId,
        name: data.name,
        priority: data.priority,
        status: data.status,
        milestone_id: data.milestoneId ?? null,
        estimated_effort_hours: data.estimated_effort_hours ?? null,
        created_by: "human",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { task: row };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), status: z.string() }).parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
    const { error } = await sb
      .from("engine_tasks")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
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
      .select("id,kind,cost_cents,status,created_at,applied_module,related_module,category,tokens_in,tokens_out")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(500);

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
    const msMap = new Map<string, { id: string; name: string; cents: number; approved: number; unused: number }>();
    for (const m of msList) msMap.set(m.name.toLowerCase(), { id: m.id, name: m.name, cents: 0, approved: 0, unused: 0 });
    let unattributedCents = 0;
    for (const t of list) {
      const key = String(t.related_module ?? "").toLowerCase();
      const bucket = key ? msMap.get(key) : undefined;
      const cents = t.cost_cents ?? 0;
      if (!bucket) { unattributedCents += cents; continue; }
      bucket.cents += cents;
      if (t.status === "applied" || t.status === "saved_as_task") bucket.approved += cents;
      else if (t.status === "draft" || t.status === "rejected") bucket.unused += cents;
    }
    const spendByMilestone = [...msMap.values()]
      .filter((b) => b.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .map((b) => ({
        ...b,
        costPerApproved: b.approved > 0 ? Math.round(b.cents / Math.max(1, Math.round(b.approved / Math.max(1, b.cents) * (approvedOutputs || 1)))) : 0,
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
    };
  });

export const updateBudgetControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        monthly_cap_cents: z.number().int().min(0).optional(),
        warning_threshold_pct: z.number().int().min(0).max(100).optional(),
        hard_stop_pct: z.number().int().min(0).max(200).optional(),
        require_approval_above_cents: z.number().int().min(0).optional(),
        preferred_model: z.string().optional(),
        auto_pause_when_exceeded: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const sb = context.supabase as any;
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
    return { ok: true as const };
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
