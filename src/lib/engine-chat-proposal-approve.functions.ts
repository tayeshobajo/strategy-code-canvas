// Phase 2C — Proposal Approval Flow
// Admin-only direct approval path for chat proposals.
// GOVERNANCE: AI cannot approve its own proposals (application-layer guard).
// Phase 9C will enforce this at the DB schema level.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { ChatProposalRow } from "@/lib/engine-chat-proposals.functions";

const uuid = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "Invalid UUID",
);

type StaffCtx = {
  claims?: Record<string, unknown>;
  userId?: string;
  supabase: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>; from: (t: string) => any };
};

async function assertAdmin(context: StaffCtx) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const isAdmin = await hasRoleForEmail(context.supabase, email, "admin");
  if (!isAdmin) throw new Error("Forbidden: admin role required to approve proposals");
  return { email, userId: context.userId ?? null };
}

async function auditActivity(sb: any, projectId: string, kind: string, title: string, body: string) {
  try { await sb.from("engine_activity").insert({ project_id: projectId, kind, title, body, severity: "info" }); } catch { }
}

async function auditEvent(sb: any, args: { projectId: string; userId: string | null; email: string; threadId: string | null; messageId: string | null; eventType: string }) {
  try {
    await sb.from("engine_project_chat_events").insert({
      project_id: args.projectId, user_id: args.userId, user_email: args.email,
      thread_id: args.threadId, message_id: args.messageId, event_type: args.eventType, success: true,
    });
  } catch { }
}

export type ApproveChatProposalResult = {
  proposal: ChatProposalRow;
  taskId?: string;
  reviewItemId?: string;
  milestoneId?: string;
};

export const approveChatProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ proposalId: uuid, projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<ApproveChatProposalResult> => {
    const { email, userId } = await assertAdmin(context as unknown as StaffCtx);
    const sb = (context as any).supabase;

    const { data: proposalData, error: pErr } = await sb
      .from("engine_project_chat_proposals").select("*").eq("id", data.proposalId).maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load proposal");
    if (!proposalData) throw new Error("Proposal not found");
    const proposal = proposalData as ChatProposalRow;
    if (proposal.project_id !== data.projectId) throw new Error("Project scope mismatch");

    if (proposal.proposal_type === "client_clarification") {
      throw new Error("Client clarification proposals must go through the client portal flow");
    }
    if (!["saved", "submitted_for_review"].includes(proposal.status)) {
      throw new Error(`Cannot approve proposal with status "${proposal.status}"`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ApproveChatProposalResult = { proposal };

    if (proposal.proposal_type === "suggested_task") {
      const payload = proposal.payload as { milestone_id?: string; priority?: string; acceptance_criteria?: unknown[]; purpose?: string; qa_checklist?: unknown[]; dependency_notes?: string; expected_artifact?: string };
      const ac = Array.isArray(payload.acceptance_criteria) ? payload.acceptance_criteria : [];
      const description = [
        payload.purpose ? `Purpose: ${payload.purpose}` : null,
        payload.dependency_notes ? `Dependencies: ${payload.dependency_notes}` : null,
        payload.expected_artifact ? `Expected artifact: ${payload.expected_artifact}` : null,
      ].filter(Boolean).join("\n\n");
      const { data: taskRow, error: tErr } = await supabaseAdmin.from("engine_tasks").insert({
        project_id: data.projectId, milestone_id: payload.milestone_id ?? null,
        name: proposal.title.slice(0, 300), description: description || proposal.summary || null,
        source: "proposal_approved", priority: (payload.priority as string) ?? "P2",
        status: "approved", acceptance_criteria: ac, created_by: "proposal_approval",
      } as never).select("id").single();
      if (tErr) throw new Error(tErr.message ?? "Failed to create approved task");
      result.taskId = (taskRow as { id: string }).id;

    } else if (proposal.proposal_type === "review_item") {
      const convertedRef = proposal.converted_ref as { table?: string; id?: string } | null;
      if (convertedRef?.table === "engine_review_items" && convertedRef.id) {
        const { error: rErr } = await supabaseAdmin.from("engine_review_items")
          .update({ status: "approved", reviewed_by: email, reviewed_at: new Date().toISOString() }).eq("id", convertedRef.id);
        if (rErr) throw new Error(rErr.message ?? "Failed to update review item");
        result.reviewItemId = convertedRef.id;
      }

    } else if (proposal.proposal_type === "milestone_brief") {
      const payload = proposal.payload as { milestone_id?: string; milestone_summary?: string };
      if (payload.milestone_id) {
        const { error: mErr } = await supabaseAdmin.from("engine_milestones")
          .update({ description: payload.milestone_summary ?? proposal.summary ?? null, updated_at: new Date().toISOString() })
          .eq("id", payload.milestone_id).eq("project_id", data.projectId);
        if (mErr) throw new Error(mErr.message ?? "Failed to update milestone");
        result.milestoneId = payload.milestone_id;
      }
    }

    const { data: updatedProposal, error: upErr } = await supabaseAdmin
      .from("engine_project_chat_proposals")
      .update({
        status: "converted",
        converted_ref: {
          ...((proposal.converted_ref as object) ?? {}),
          approved_by: email, approved_at: new Date().toISOString(),
          ...(result.taskId ? { task_id: result.taskId } : {}),
          ...(result.reviewItemId ? { review_item_id: result.reviewItemId } : {}),
          ...(result.milestoneId ? { milestone_id: result.milestoneId } : {}),
        },
      }).eq("id", data.proposalId).select("*").single();
    if (upErr) throw new Error(upErr.message ?? "Failed to mark proposal converted");
    result.proposal = updatedProposal as ChatProposalRow;

    await auditEvent(sb, { projectId: data.projectId, userId, email, threadId: proposal.thread_id, messageId: proposal.source_message_id, eventType: "proposal_approved" });
    await auditActivity(sb, data.projectId, "proposal_approved", `Proposal approved: ${proposal.proposal_type}`, `${email} approved "${proposal.title.slice(0, 80)}"`);

    return result;
  });
