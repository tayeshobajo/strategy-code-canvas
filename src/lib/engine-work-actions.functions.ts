/**
 * Server functions for Project Work actions:
 *   - reassignWorkItem: change owner or convert human ↔ agent, capture reason.
 *   - resolveBlocker: close a review_item, capture resolution note.
 *   - createWorkItem: create engine_tasks row bound to an approved milestone.
 *   - compareBuildPackets: diff two packet payloads → scope-drift assessment
 *     with a Captain recommendation. Pauses downstream tasks on drift.
 *   - uploadWorkEvidence: append proof (URL + note) to a task.
 *   - reviewWorkEvidence: accept/reject a piece of evidence.
 *   - listWorkEvidenceForProject: pull all evidence for the current project.
 *
 * Every mutation writes an engine_activity row via insertEngineActivity.
 * Every write asserts operator/admin role. Admin is required for destructive
 * or approval-style actions (reviewWorkEvidence, resolveBlocker, packet
 * compare with pause).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import { insertEngineActivity } from "@/lib/engine-activity";
import { notifyOperators, taskMarker } from "@/lib/engine-work-notify";

export const PAUSE_REASON_PREFIX = "Paused: scope drift";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

type Ctx = { claims?: Record<string, unknown>; supabase: unknown };

async function assertOperator(context: Ctx) {
  const email = (context.claims?.email as string | undefined) ?? null;
  const sb = context.supabase as Parameters<typeof hasRoleForEmail>[0];
  const [isOp, isAdmin] = await Promise.all([
    hasRoleForEmail(sb, email ?? undefined, "operator"),
    hasRoleForEmail(sb, email ?? undefined, "admin"),
  ]);
  if (!isOp && !isAdmin) throw new Error("Forbidden: operator role required");
  return { email, isAdmin };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySb = any;

// ---------- reassign owner ----------

export const reassignWorkItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        taskId: uuid,
        newOwnerEmail: z.string().trim().max(320).nullable(),
        ownerType: z.enum(["human", "agent"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email } = await assertOperator(context);
    const sb = context.supabase as AnySb;

    const { data: existing, error: readErr } = await sb
      .from("engine_tasks")
      .select("id,project_id,milestone_id,name,owner_email,status")
      .eq("id", data.taskId)
      .maybeSingle();
    if (readErr || !existing) throw new Error(readErr?.message ?? "Task not found");

    const prevOwner = existing.owner_email as string | null;
    const nextStatus = existing.status === "draft" && data.newOwnerEmail ? "assigned" : existing.status;

    const { error: upErr } = await sb
      .from("engine_tasks")
      .update({
        owner_email: data.newOwnerEmail,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.taskId);
    if (upErr) throw new Error(upErr.message);

    await insertEngineActivity(sb, {
      project_id: existing.project_id,
      kind: "work.reassigned",
      title: `Work reassigned: ${existing.name}`,
      body: `${taskMarker(existing.id)} From ${prevOwner ?? "unassigned"} to ${data.newOwnerEmail ?? "unassigned"} (${data.ownerType}). Reason: ${data.reason}`,
      severity: "info",
      actor_email: email,
    });
    await notifyOperators(sb, {
      projectId: existing.project_id,
      kind: "work.reassigned",
      title: `Work reassigned: ${existing.name}`,
      body: `${email ?? "operator"} moved owner to ${data.newOwnerEmail ?? "unassigned"} — ${data.reason}`,
      href: `/engine/projects/${existing.project_id}/work?view=queue`,
      actor: email,
      extra: { task_id: existing.id, prev_owner: prevOwner, new_owner: data.newOwnerEmail },
    });

    return { ok: true as const };
  });

// ---------- resolve blocker ----------

export const resolveBlocker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        reviewItemId: uuid,
        resolution: z.enum(["resolved", "wont_fix", "escalated"]),
        note: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email, isAdmin } = await assertOperator(context);
    if (!isAdmin && data.resolution !== "resolved") {
      throw new Error("Forbidden: only admins can mark blockers as wont_fix or escalated");
    }
    const sb = context.supabase as AnySb;

    const { data: existing, error: readErr } = await sb
      .from("engine_review_items")
      .select("id,project_id,title,status")
      .eq("id", data.reviewItemId)
      .maybeSingle();
    if (readErr || !existing) throw new Error(readErr?.message ?? "Blocker not found");
    if (existing.status === "closed") return { ok: true as const, alreadyClosed: true };

    const { error: upErr } = await sb
      .from("engine_review_items")
      .update({
        status: "closed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.reviewItemId);
    if (upErr) throw new Error(upErr.message);

    await insertEngineActivity(sb, {
      project_id: existing.project_id,
      kind: "blocker.resolved",
      title: `Blocker resolved: ${existing.title}`,
      body: `Resolution: ${data.resolution}. Note: ${data.note}`,
      severity: data.resolution === "escalated" ? "warn" : "info",
      actor_email: email,
    });
    await notifyOperators(sb, {
      projectId: existing.project_id,
      kind: "blocker.resolved",
      title: `Blocker ${data.resolution}: ${existing.title}`,
      body: `${email ?? "operator"} — ${data.note}`,
      href: `/engine/projects/${existing.project_id}/work?view=blockers`,
      actor: email,
      extra: { review_item_id: existing.id, resolution: data.resolution },
    });

    return { ok: true as const };
  });

// ---------- create work item ----------

export const createWorkItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        milestoneId: uuid,
        name: z.string().trim().min(3).max(200),
        purpose: z.string().trim().max(2000).optional().default(""),
        expectedArtifact: z.string().trim().min(3).max(500),
        acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
        priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
        ownerEmail: z.string().trim().max(320).optional().nullable(),
        dueDate: z.string().date().optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email } = await assertOperator(context);
    const sb = context.supabase as AnySb;

    // Enforce approved-milestone invariant.
    const { data: ms, error: msErr } = await sb
      .from("engine_milestones")
      .select("id,project_id,name,approval_status")
      .eq("id", data.milestoneId)
      .maybeSingle();
    if (msErr || !ms) throw new Error(msErr?.message ?? "Milestone not found");
    if (ms.project_id !== data.projectId)
      throw new Error("Milestone does not belong to this project");
    if (ms.approval_status !== "approved")
      throw new Error("Work items can only be added to approved milestones");

    const { data: inserted, error: insErr } = await sb
      .from("engine_tasks")
      .insert({
        project_id: data.projectId,
        milestone_id: data.milestoneId,
        name: data.name,
        purpose: data.purpose || null,
        expected_artifact: data.expectedArtifact,
        acceptance_criteria: data.acceptanceCriteria,
        priority: data.priority,
        owner_email: data.ownerEmail ?? null,
        due_date: data.dueDate ?? null,
        status: data.ownerEmail ? "assigned" : "ready",
        created_by: email ?? "operator",
      })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "Failed to create task");

    await insertEngineActivity(sb, {
      project_id: data.projectId,
      kind: "work.created",
      title: `Work added: ${data.name}`,
      body: `${taskMarker(inserted.id as string)} Milestone: ${ms.name}. Artifact: ${data.expectedArtifact}. Owner: ${data.ownerEmail ?? "unassigned"}.`,
      severity: "info",
      actor_email: email,
    });
    await notifyOperators(sb, {
      projectId: data.projectId,
      kind: "work.created",
      title: `Work added: ${data.name}`,
      body: `${email ?? "operator"} added a task to ${ms.name}`,
      href: `/engine/projects/${data.projectId}/work?view=queue`,
      actor: email,
      extra: { task_id: inserted.id, milestone_id: data.milestoneId },
    });

    return { ok: true as const, taskId: inserted.id as string };
  });

// ---------- compare build packets ----------

export type PacketDiffField = {
  field: string;
  from: string | null;
  to: string | null;
  drift: "added" | "removed" | "changed";
};

export type PacketCompareResult = {
  base_packet_id: string;
  candidate_packet_id: string;
  scope_drift: boolean;
  drift_score: number;
  fields_changed: PacketDiffField[];
  criteria_added: string[];
  criteria_removed: string[];
  paused_task_ids: string[];
  recommendation: string;
  captain_note: string;
};

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
}

function diffPacketPayloads(a: unknown, b: unknown): PacketDiffField[] {
  const A = (a ?? {}) as Record<string, unknown>;
  const B = (b ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  const out: PacketDiffField[] = [];
  for (const k of keys) {
    if (k === "acceptance_criteria") continue;
    const av = A[k];
    const bv = B[k];
    const as = av == null ? null : typeof av === "string" ? av : JSON.stringify(av);
    const bs = bv == null ? null : typeof bv === "string" ? bv : JSON.stringify(bv);
    if (as === bs) continue;
    out.push({
      field: k,
      from: as,
      to: bs,
      drift: as == null ? "added" : bs == null ? "removed" : "changed",
    });
  }
  return out;
}

export const compareBuildPackets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        basePacketId: uuid,
        candidatePacketId: uuid,
        pauseDownstream: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<PacketCompareResult> => {
    const { email, isAdmin } = await assertOperator(context);
    if (data.pauseDownstream && !isAdmin)
      throw new Error("Forbidden: admin required to pause downstream work");
    const sb = context.supabase as AnySb;

    const { data: pkts, error } = await sb
      .from("engine_project_build_packets")
      .select("id,project_id,milestone_id,title,payload,status")
      .in("id", [data.basePacketId, data.candidatePacketId]);
    if (error) throw new Error(error.message);
    const list = (pkts ?? []) as Array<{
      id: string;
      project_id: string;
      milestone_id: string;
      title: string;
      payload: unknown;
      status: string;
    }>;
    const base = list.find((p) => p.id === data.basePacketId);
    const cand = list.find((p) => p.id === data.candidatePacketId);
    if (!base || !cand) throw new Error("Packets not found");
    if (base.milestone_id !== cand.milestone_id)
      throw new Error("Packets belong to different milestones");

    const fields = diffPacketPayloads(base.payload, cand.payload);
    const baseCrit = new Set(
      toStrArray((base.payload as Record<string, unknown>)?.acceptance_criteria),
    );
    const candCrit = new Set(
      toStrArray((cand.payload as Record<string, unknown>)?.acceptance_criteria),
    );
    const criteria_added = [...candCrit].filter((c) => !baseCrit.has(c));
    const criteria_removed = [...baseCrit].filter((c) => !candCrit.has(c));

    const driftScore =
      fields.length + criteria_added.length * 2 + criteria_removed.length * 3;
    const scopeDrift = driftScore >= 3 || criteria_removed.length > 0;

    let pausedIds: string[] = [];
    const pauseReason = `${PAUSE_REASON_PREFIX} between packets ${base.title} → ${cand.title}`;
    if (scopeDrift && data.pauseDownstream) {
      const { data: downstream } = await sb
        .from("engine_tasks")
        .select("id,name")
        .eq("milestone_id", base.milestone_id)
        .in("status", ["ready", "assigned", "in_progress"]);
      const rows = (downstream ?? []) as Array<{ id: string; name: string }>;
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { error: pauseErr } = await sb
          .from("engine_tasks")
          .update({
            status: "blocked",
            blocked_decision: pauseReason,
            updated_at: new Date().toISOString(),
          })
          .in("id", ids);
        if (pauseErr) throw new Error(pauseErr.message);
        pausedIds = ids;

        // Per-task activity so each work item's audit trail shows the pause.
        await insertEngineActivity(
          sb,
          rows.map((r) => ({
            project_id: base.project_id,
            kind: "work.paused",
            title: `Paused: ${r.name}`,
            body: `${taskMarker(r.id)} ${pauseReason}. Candidate packet ${cand.id}. Awaiting change assessment approval.`,
            severity: "warn" as const,
            actor_email: email,
          })),
        );
      }
    }

    const recommendation = scopeDrift
      ? criteria_removed.length > 0
        ? "Do not accept the candidate packet. Removed acceptance criteria weaken the contract. Get client sign-off before rescoping."
        : "Treat this as a scope change. Draft a change assessment and re-approve before build resumes."
      : "Minor edit. Safe to accept; no downstream impact.";

    const captainNote = scopeDrift
      ? `Scope drift detected: ${fields.length} field change${fields.length === 1 ? "" : "s"}, +${criteria_added.length}/-${criteria_removed.length} criteria. ${data.pauseDownstream ? `Paused ${pausedIds.length} downstream task${pausedIds.length === 1 ? "" : "s"}.` : "Downstream work NOT paused."}`
      : "Diff is within safe-edit thresholds. No scope-change assessment required.";

    await insertEngineActivity(sb, {
      project_id: base.project_id,
      kind: scopeDrift ? "packet.scope_drift" : "packet.compare",
      title: scopeDrift ? "Scope drift detected" : "Packet compare — no drift",
      body: `${base.title} → ${cand.title}. ${captainNote}`,
      severity: scopeDrift ? "warn" : "info",
      actor_email: email,
    });

    if (scopeDrift) {
      await notifyOperators(sb, {
        projectId: base.project_id,
        kind: "packet.scope_drift",
        title: `Scope drift: ${base.title} → ${cand.title}`,
        body: `${captainNote} ${recommendation}`,
        href: `/engine/projects/${base.project_id}/work?view=milestones&milestoneId=${base.milestone_id}`,
        actor: email,
        extra: {
          base_packet_id: base.id,
          candidate_packet_id: cand.id,
          milestone_id: base.milestone_id,
          paused_count: pausedIds.length,
        },
      });
    }

    return {
      base_packet_id: base.id,
      candidate_packet_id: cand.id,
      scope_drift: scopeDrift,
      drift_score: driftScore,
      fields_changed: fields,
      criteria_added,
      criteria_removed,
      paused_task_ids: pausedIds,
      recommendation,
      captain_note: captainNote,
    };
  });

// ---------- work evidence ----------

export type WorkEvidenceRow = {
  id: string;
  task_id: string;
  milestone_id: string | null;
  evidence_type: string;
  title: string;
  summary: string | null;
  url: string | null;
  verdict: "pending" | "accepted" | "rejected";
  review_note: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  created_by_email: string | null;
  created_at: string;
};

export const uploadWorkEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        taskId: uuid,
        evidenceType: z.enum(["link", "screenshot", "video", "note", "artifact"]),
        title: z.string().trim().min(3).max(200),
        summary: z.string().trim().max(2000).optional().default(""),
        url: z.string().trim().url().max(2000).optional().nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email } = await assertOperator(context);
    const sb = context.supabase as AnySb;

    const { data: t, error: tErr } = await sb
      .from("engine_tasks")
      .select("id,project_id,milestone_id,name")
      .eq("id", data.taskId)
      .maybeSingle();
    if (tErr || !t) throw new Error(tErr?.message ?? "Task not found");

    const { data: row, error } = await sb
      .from("engine_work_evidence")
      .insert({
        project_id: t.project_id,
        task_id: t.id,
        milestone_id: t.milestone_id,
        evidence_type: data.evidenceType,
        title: data.title,
        summary: data.summary || null,
        url: data.url ?? null,
        verdict: "pending",
        created_by_email: email,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to save evidence");

    await sb
      .from("engine_tasks")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", data.taskId);

    await insertEngineActivity(sb, {
      project_id: t.project_id,
      kind: "evidence.submitted",
      title: `Evidence submitted: ${t.name}`,
      body: `${taskMarker(t.id)} ${data.evidenceType.toUpperCase()} — ${data.title}`,
      severity: "info",
      actor_email: email,
    });
    await notifyOperators(sb, {
      projectId: t.project_id,
      kind: "evidence.submitted",
      title: `Evidence submitted: ${t.name}`,
      body: `${email ?? "operator"} attached ${data.evidenceType} — ${data.title}`,
      href: `/engine/projects/${t.project_id}/work?view=queue`,
      actor: email,
      extra: { task_id: t.id, evidence_id: row.id },
    });

    return { ok: true as const, evidenceId: row.id as string };
  });

export const reviewWorkEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        evidenceId: uuid,
        verdict: z.enum(["accepted", "rejected"]),
        note: z.string().trim().max(2000).optional().default(""),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email, isAdmin } = await assertOperator(context);
    if (!isAdmin) throw new Error("Forbidden: admin required to review evidence");
    const sb = context.supabase as AnySb;

    const { data: ev, error: readErr } = await sb
      .from("engine_work_evidence")
      .select("id,project_id,task_id,title,created_by_email")
      .eq("id", data.evidenceId)
      .maybeSingle();
    if (readErr || !ev) throw new Error(readErr?.message ?? "Evidence not found");
    if (ev.created_by_email && email && ev.created_by_email === email) {
      throw new Error("Self-approval is not allowed: another admin must review this evidence");
    }

    const { error: upErr } = await sb
      .from("engine_work_evidence")
      .update({
        verdict: data.verdict,
        review_note: data.note || null,
        reviewed_by_email: email,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.evidenceId);
    if (upErr) throw new Error(upErr.message);

    // Task status: accept → accepted; reject → in_progress
    const nextTaskStatus = data.verdict === "accepted" ? "accepted" : "in_progress";
    await sb
      .from("engine_tasks")
      .update({ status: nextTaskStatus, updated_at: new Date().toISOString() })
      .eq("id", ev.task_id);

    await insertEngineActivity(sb, {
      project_id: ev.project_id,
      kind: data.verdict === "accepted" ? "evidence.accepted" : "evidence.rejected",
      title: `Evidence ${data.verdict}: ${ev.title}`,
      body: `${taskMarker(ev.task_id)} ${data.note || ""}`.trim(),
      severity: data.verdict === "rejected" ? "warn" : "info",
      actor_email: email,
    });
    await notifyOperators(sb, {
      projectId: ev.project_id,
      kind: `evidence.${data.verdict}`,
      title: `Evidence ${data.verdict}: ${ev.title}`,
      body: `${email ?? "operator"} — ${data.note || "no note"}`,
      href: `/engine/projects/${ev.project_id}/work?view=queue`,
      actor: email,
      extra: { task_id: ev.task_id, evidence_id: ev.id, verdict: data.verdict },
    });

    return { ok: true as const };
  });

export const listWorkEvidenceForProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<WorkEvidenceRow[]> => {
    await assertOperator(context);
    const sb = context.supabase as AnySb;
    const { data: rows, error } = await sb
      .from("engine_work_evidence")
      .select(
        "id,task_id,milestone_id,evidence_type,title,summary,url,verdict,review_note,reviewed_by_email,reviewed_at,created_by_email,created_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkEvidenceRow[];
  });

// ---------- lookup helpers used by modals ----------

export const listMilestonesForWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    const sb = context.supabase as AnySb;
    const { data: rows, error } = await sb
      .from("engine_milestones")
      .select("id,name,phase,approval_status,sort_index")
      .eq("project_id", data.projectId)
      .eq("approval_status", "approved")
      .order("sort_index", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      name: string;
      phase: string | null;
      approval_status: string;
      sort_index: number | null;
    }>;
  });

export const listPacketsForMilestone = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ milestoneId: uuid }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertOperator(context);
    const sb = context.supabase as AnySb;
    const { data: rows, error } = await sb
      .from("engine_project_build_packets")
      .select("id,title,status,sequence_number,updated_at")
      .eq("milestone_id", data.milestoneId)
      .order("sequence_number", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      sequence_number: number;
      updated_at: string;
    }>;
  });

// ---------- paused work ----------

export type PausedWorkRow = {
  task_id: string;
  project_id: string;
  milestone_id: string | null;
  milestone_name: string | null;
  name: string;
  reason: string;
  owner_email: string | null;
  updated_at: string;
};

export const listPausedWork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<PausedWorkRow[]> => {
    await assertOperator(context);
    const sb = context.supabase as AnySb;
    const { data: rows, error } = await sb
      .from("engine_tasks")
      .select(
        "id,project_id,milestone_id,name,blocked_decision,owner_email,updated_at,engine_milestones(name)",
      )
      .eq("project_id", data.projectId)
      .eq("status", "blocked")
      .ilike("blocked_decision", `${PAUSE_REASON_PREFIX}%`)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      task_id: r.id as string,
      project_id: r.project_id as string,
      milestone_id: (r.milestone_id as string | null) ?? null,
      milestone_name:
        (r.engine_milestones as { name: string } | null)?.name ?? null,
      name: r.name as string,
      reason: (r.blocked_decision as string | null) ?? "",
      owner_email: (r.owner_email as string | null) ?? null,
      updated_at: r.updated_at as string,
    }));
  });

export const resumePausedWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        taskIds: z.array(uuid).min(1).max(200),
        note: z.string().trim().min(3).max(2000),
        changeAssessmentApproved: z.boolean().default(false),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email, isAdmin } = await assertOperator(context);
    if (!isAdmin) throw new Error("Forbidden: admin required to resume paused work");
    if (!data.changeAssessmentApproved)
      throw new Error("Change assessment must be approved before resuming paused work");
    const sb = context.supabase as AnySb;

    const { data: rows, error } = await sb
      .from("engine_tasks")
      .select("id,project_id,name,owner_email,blocked_decision,status")
      .in("id", data.taskIds);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      project_id: string;
      name: string;
      owner_email: string | null;
      blocked_decision: string | null;
      status: string;
    }>;
    const pausedOnly = list.filter(
      (t) => t.status === "blocked" && (t.blocked_decision ?? "").startsWith(PAUSE_REASON_PREFIX),
    );
    if (pausedOnly.length === 0) return { ok: true as const, resumed: 0 };

    const now = new Date().toISOString();
    for (const t of pausedOnly) {
      await sb
        .from("engine_tasks")
        .update({
          status: t.owner_email ? "assigned" : "ready",
          blocked_decision: null,
          updated_at: now,
        })
        .eq("id", t.id);
    }

    await insertEngineActivity(
      sb,
      pausedOnly.map((t) => ({
        project_id: t.project_id,
        kind: "work.resumed",
        title: `Resumed: ${t.name}`,
        body: `${taskMarker(t.id)} ${data.note}`,
        severity: "info" as const,
        actor_email: email,
      })),
    );

    const projectId = pausedOnly[0]?.project_id ?? null;
    await notifyOperators(sb, {
      projectId,
      kind: "work.resumed",
      title: `Resumed ${pausedOnly.length} paused task${pausedOnly.length === 1 ? "" : "s"}`,
      body: `${email ?? "operator"} — ${data.note}`,
      href: projectId ? `/engine/projects/${projectId}/work?view=queue` : null,
      actor: email,
      extra: { task_ids: pausedOnly.map((t) => t.id) },
    });

    return { ok: true as const, resumed: pausedOnly.length };
  });

// ---------- bulk actions ----------

export const bulkReassignWorkItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        taskIds: z.array(uuid).min(1).max(200),
        newOwnerEmail: z.string().trim().email().nullable(),
        ownerType: z.enum(["agent", "human"]),
        reason: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email } = await assertOperator(context);
    const sb = context.supabase as AnySb;

    const { data: rows, error } = await sb
      .from("engine_tasks")
      .select("id,project_id,name,owner_email,owner_type")
      .in("id", data.taskIds);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      project_id: string;
      name: string;
      owner_email: string | null;
      owner_type: string | null;
    }>;
    if (list.length === 0) return { ok: true as const, updated: 0 };

    const now = new Date().toISOString();
    await sb
      .from("engine_tasks")
      .update({
        owner_email: data.newOwnerEmail,
        owner_type: data.ownerType,
        status: data.newOwnerEmail ? "assigned" : "ready",
        updated_at: now,
      })
      .in(
        "id",
        list.map((r) => r.id),
      );

    await insertEngineActivity(
      sb,
      list.map((t) => ({
        project_id: t.project_id,
        kind: "work.reassigned",
        title: `Work reassigned: ${t.name}`,
        body: `${taskMarker(t.id)} From ${t.owner_email ?? "unassigned"} to ${data.newOwnerEmail ?? "unassigned"} (${data.ownerType}). Bulk reason: ${data.reason}`,
        severity: "info" as const,
        actor_email: email,
      })),
    );

    const projectId = list[0]?.project_id ?? null;
    await notifyOperators(sb, {
      projectId,
      kind: "work.bulk_reassigned",
      title: `Bulk reassign: ${list.length} task${list.length === 1 ? "" : "s"}`,
      body: `${email ?? "operator"} → ${data.newOwnerEmail ?? "unassigned"} — ${data.reason}`,
      href: projectId ? `/engine/projects/${projectId}/work?view=queue` : null,
      actor: email,
      extra: { task_ids: list.map((t) => t.id), new_owner: data.newOwnerEmail },
    });

    return { ok: true as const, updated: list.length };
  });

export const bulkResolveBlockers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        reviewItemIds: z.array(uuid).min(1).max(200),
        resolution: z.enum(["resolved", "wont_fix", "escalated"]),
        note: z.string().trim().min(3).max(2000),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }) => {
    const { email, isAdmin } = await assertOperator(context);
    if ((data.resolution === "wont_fix" || data.resolution === "escalated") && !isAdmin)
      throw new Error(`Forbidden: admin required to mark blockers as ${data.resolution}`);
    const sb = context.supabase as AnySb;

    const { data: rows, error } = await sb
      .from("engine_review_items")
      .select("id,project_id,title")
      .in("id", data.reviewItemIds);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{ id: string; project_id: string; title: string }>;
    if (list.length === 0) return { ok: true as const, updated: 0 };

    const now = new Date().toISOString();
    await sb
      .from("engine_review_items")
      .update({
        status: data.resolution === "resolved" ? "resolved" : "closed",
        resolution: data.resolution,
        resolution_note: data.note,
        resolved_by_email: email,
        resolved_at: now,
        updated_at: now,
      })
      .in(
        "id",
        list.map((r) => r.id),
      );

    await insertEngineActivity(
      sb,
      list.map((r) => ({
        project_id: r.project_id,
        kind: "blocker.resolved",
        title: `Blocker resolved: ${r.title}`,
        body: `Bulk resolution: ${data.resolution}. Note: ${data.note}`,
        severity: data.resolution === "escalated" ? ("warn" as const) : ("info" as const),
        actor_email: email,
      })),
    );

    const projectId = list[0]?.project_id ?? null;
    await notifyOperators(sb, {
      projectId,
      kind: "blocker.bulk_resolved",
      title: `Bulk ${data.resolution}: ${list.length} blocker${list.length === 1 ? "" : "s"}`,
      body: `${email ?? "operator"} — ${data.note}`,
      href: projectId ? `/engine/projects/${projectId}/work?view=blockers` : null,
      actor: email,
      extra: { review_item_ids: list.map((r) => r.id), resolution: data.resolution },
    });

    return { ok: true as const, updated: list.length };
  });

// ---------- audit trail per work item ----------

export type WorkAuditEvent = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  severity: string | null;
  actor_email: string | null;
  created_at: string;
  source: "activity" | "evidence";
};

export const listWorkItemAuditTrail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ taskId: uuid, projectId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<WorkAuditEvent[]> => {
    await assertOperator(context);
    const sb = context.supabase as AnySb;

    const marker = taskMarker(data.taskId);
    const { data: acts } = await sb
      .from("engine_activity")
      .select("id,kind,title,body,severity,actor_email,created_at")
      .eq("project_id", data.projectId)
      .ilike("body", `%${marker}%`)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: evs } = await sb
      .from("engine_work_evidence")
      .select(
        "id,evidence_type,title,verdict,review_note,reviewed_by_email,reviewed_at,created_by_email,created_at",
      )
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: false })
      .limit(100);

    const events: WorkAuditEvent[] = [];
    for (const a of (acts ?? []) as Array<Record<string, unknown>>) {
      events.push({
        id: a.id as string,
        kind: a.kind as string,
        title: a.title as string,
        body: ((a.body as string | null) ?? null)?.replace(marker, "").trim() || null,
        severity: (a.severity as string | null) ?? null,
        actor_email: (a.actor_email as string | null) ?? null,
        created_at: a.created_at as string,
        source: "activity",
      });
    }
    for (const e of (evs ?? []) as Array<Record<string, unknown>>) {
      events.push({
        id: `ev-${e.id as string}`,
        kind: `evidence.${e.verdict as string}`,
        title: `${(e.evidence_type as string).toUpperCase()} — ${e.title as string}`,
        body: (e.review_note as string | null) ?? null,
        severity: e.verdict === "rejected" ? "warn" : "info",
        actor_email:
          ((e.reviewed_by_email as string | null) ?? (e.created_by_email as string | null)) ?? null,
        created_at: ((e.reviewed_at as string | null) ?? (e.created_at as string)) as string,
        source: "evidence",
      });
    }
    return events.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  });
