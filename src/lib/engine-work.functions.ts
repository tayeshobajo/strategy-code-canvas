/**
 * Server function for the Project Work tab.
 *
 * Composes the ProjectWorkReadModel from durable rows. Reuses the Spine
 * payload for milestones + readiness + activity + reviews, then joins
 * tasks, build packets, evidence, QA plans, and agent tasks scoped to
 * the project.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { getProjectSpine } from "@/lib/engine.functions";
import {
  deriveProjectWork,
  type ProjectWorkReadModel,
  type RawTask,
  type RawBuildPacket,
  type RawBuildEvidence,
  type RawAgentTask,
} from "@/lib/work-view";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

async function assertOperator(context: {
  claims?: Record<string, unknown>;
  supabase: unknown;
}) {
  const email = context.claims?.email as string | undefined;
  const isOp = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "operator",
  );
  const isAdmin = await hasRoleForEmail(
    context.supabase as Parameters<typeof hasRoleForEmail>[0],
    email,
    "admin",
  );
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator role required");
  return { email, isAdmin };
}

export type ProjectWorkPayload = {
  view: ProjectWorkReadModel;
  permissions: {
    can_assign_owner: boolean;
    can_approve_evidence: boolean;
    can_send_to_qa: boolean;
    can_open_workspace: boolean;
  };
};

export const getProjectWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<ProjectWorkPayload> => {
    const { isAdmin } = await assertOperator(context);

    const spine = await getProjectSpine({ data: { id: data.id } });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;

    // Tasks
    const { data: taskRows } = await sb
      .from("engine_tasks")
      .select(
        "id,project_id,milestone_id,name,purpose,expected_artifact,status,priority,owner_email,due_date,estimated_effort_hours,estimated_cost_cents,acceptance_criteria,qa_checklist,dependency_notes,blocked_decision,ai_generated,agent_task_id,created_at,updated_at",
      )
      .eq("project_id", data.id);
    const tasks = (taskRows ?? []) as RawTask[];

    // Build packets — join to milestones
    const { data: packetRows } = await sb
      .from("engine_project_build_packets")
      .select(
        "id,milestone_id,status,packet_type,priority,title,summary,assigned_to,accepted_at,handed_off_at,rejected_reason,payload",
      )
      .eq("project_id", data.id);
    const packetsAll = (packetRows ?? []) as Array<
      RawBuildPacket & { milestone_id: string | null }
    >;
    const packetsByMs = new Map<string, RawBuildPacket[]>();
    const packetIds: string[] = [];
    for (const p of packetsAll) {
      if (!p.milestone_id) continue;
      packetIds.push(p.id);
      const arr = packetsByMs.get(p.milestone_id) ?? [];
      arr.push(p);
      packetsByMs.set(p.milestone_id, arr);
    }

    // Evidence — grouped by packet
    const evidenceByPacket = new Map<string, RawBuildEvidence[]>();
    if (packetIds.length > 0) {
      const { data: evRows } = await sb
        .from("engine_project_build_evidence")
        .select("id,build_packet_id,evidence_type,title,created_at")
        .in("build_packet_id", packetIds);
      for (const e of (evRows ?? []) as RawBuildEvidence[]) {
        const arr = evidenceByPacket.get(e.build_packet_id) ?? [];
        arr.push(e);
        evidenceByPacket.set(e.build_packet_id, arr);
      }
    }

    // QA plans presence per milestone
    const { data: qaRows } = await sb
      .from("engine_project_qa_plans")
      .select("milestone_id,status")
      .eq("project_id", data.id);
    const qaPlans = new Map<string, { has_plan: boolean }>();
    for (const q of (qaRows ?? []) as Array<{ milestone_id: string | null }>) {
      if (q.milestone_id) qaPlans.set(q.milestone_id, { has_plan: true });
    }

    // Agent tasks
    const { data: agentRows } = await sb
      .from("engine_agent_tasks")
      .select(
        "id,kind,status,related_module,pending_approval,error,cost_cents,created_by_email,updated_at,created_at",
      )
      .eq("project_id", data.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    const agentTasks = (agentRows ?? []) as RawAgentTask[];

    // Approved version label
    const { data: verRow } = await sb
      .from("engine_roadmap_versions")
      .select("label,status,approved_at")
      .eq("project_id", data.id)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const approvedLabel = (verRow?.label as string | null) ?? null;
    const hasApprovedRoadmap = Boolean(verRow?.approved_at);

    // Parent project id
    const { data: projRow } = await sb
      .from("engine_projects")
      .select("parent_project_id")
      .eq("id", data.id)
      .maybeSingle();

    const view = deriveProjectWork({
      project: {
        id: spine.project.id,
        name: spine.project.name,
        status: spine.project.status,
        parent_project_id: (projRow?.parent_project_id as string | null) ?? null,
      },
      approved_version_label: approvedLabel,
      has_approved_roadmap: hasApprovedRoadmap,
      milestones: spine.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        phase: m.phase,
        status: m.status,
        approval_status: m.approval_status,
        brief_md: m.brief_md,
        due_date: m.due_date,
        owner_email:
          (m as unknown as { owner_email?: string | null }).owner_email ?? null,
        estimated_cost_cents:
          (m as unknown as { estimated_cost_cents?: number | null })
            .estimated_cost_cents ?? null,
        acceptance_criteria:
          (m as unknown as { acceptance_criteria?: unknown }).acceptance_criteria ??
          null,
        dependencies:
          (m as unknown as { dependencies?: unknown }).dependencies ?? null,
        sort_index: m.sort_index,
        approved_at:
          (m as unknown as { approved_at?: string | null }).approved_at ?? null,
        updated_at:
          (m as unknown as { updated_at?: string }).updated_at ??
          spine.project.updated_at,
        readiness: m.readiness,
      })),
      tasks,
      packets: packetsByMs,
      evidence: evidenceByPacket,
      qa_plans: qaPlans,
      agent_tasks: agentTasks,
      review_items: spine.reviews.map((r) => ({
        id: r.id,
        title: r.title,
        item_type: r.item_type,
        status: r.status,
        severity: null,
        impact: r.impact,
        impact_score: null,
        urgency_score: null,
        risk_score: 0,
        deadline_at: null,
        requested_by: null,
        created_at: r.created_at,
      })),
      activity: spine.activity.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        body: a.body,
        severity: a.severity,
        actor_email: null,
        created_at: a.created_at,
      })),
    });

    return {
      view,
      permissions: {
        can_assign_owner: true,
        can_approve_evidence: isAdmin,
        can_send_to_qa: isAdmin,
        can_open_workspace: true,
      },
    };
  });
