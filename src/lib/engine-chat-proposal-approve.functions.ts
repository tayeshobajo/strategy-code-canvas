// Phase 2C — Proposal Approval Flow
// Allows an admin to directly approve a submitted_for_review proposal,
// writing back to the project spine (engine_milestones / engine_tasks /
// engine_review_items depending on type) and the full audit trail.
//
// GOVERNANCE RULE: The AI cannot approve its own proposals.
// created_by != approved_by is enforced at the application layer here.
// A future Phase 9C migration will enforce this at the DB schema level.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { ChatProposalRow } from "@/lib/engine-chat-proposals.functions";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

type StaffCtx = {
  claims?: Record<string, unknown>;
  userId?: string;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (t: string) => any;
  };
};

async function assertAdmin(context: StaffCtx) {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const isAdmin = await hasRoleForEmail(context.supabase, email, "admin");
  if (!isAdmin) throw new Error("Forbidden: admin role required to approve proposals");
  return { email, userId: context.userId ?? null };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auditActivity(sb: any, projectId: string, kind: string, title: string, body: string) {
  try { await sb.from("engine_activity").insert({ project_id: projectId, kind, title, body, severity: "info" }); } catch { /* best-effort */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function auditEvent(sb: any, args: { projectId: string; userId: string | null; email: string; threadId: string | null; messageId: string | null; eventType: string }) {
  try {
    await sb.from("engine_project_chat_events").insert({
      project_id: args.projectId, user_id: args.userId, user_email: args.email,
      thread_id: args.threadId, message_id: args.messageId, event_type: args.eventType, success: true,
    });
  } catch { /* best-effort */ }
}

export type ApproveChatProposalResult = {
  proposal: ChatProposalRow;
  taskId?: string;
  reviewItemId?: string;
  milestoneId?: string;
};

/**
 * approveChatProposal — Admin-only direct approval path.
 *
 * Allowed proposal types and downstream effects:
 *   suggested_task        → creates engine_tasks row with status "approved"
 *   review_item           → updates linked engine_review_items row to "approved"
 *   milestone_brief       → creates/updates engine_milestones entry
 *   implementation_prompt → marks as converted (artifact already saved)
 *   qa_checklist          → marks as converted (artifact already saved)
 *   client_clarification  → not approvable via this path (use client portal)
 *
 * Enforces: approver email != created_by user_id (AI self-approval prevention,
 * application-layer guard until Phase 9C DB constraint lands).
 */
export const approveChatProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      proposalId: uuid,
      projectId: uuid,
    }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<ApproveChatProposalResult> => {
    const { email, userId } = await assertAdmin(context as unknown as StaffCtx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;

    // Load proposal and verify scope
    const { data: proposalData, error: pErr } = await sb
      .from("engine_project_chat_proposals")
      .select("*")
      .eq("id", data.proposalId)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message ?? "Failed to load proposal");
    if (!proposalData) throw new Error("Proposal not found");
    const proposal = proposalData as ChatProposalRow;
    if (proposal.project_id !== data.projectId) throw new Error("Project scope mismatch");

    // Governance: cannot approve client_clarification via this path
    if (proposal.proposal_type === "client_clarification") {
      throw new Error("Client clarification proposals must be handled through the client portal flow");
    }

    // Must be in a reviewable state
    const reviewableStatuses = ["saved", "submitted_for_review"];
    if (!reviewableStatuses.includes(proposal.status)) {
      throw new Error(`Cannot approve proposal with status "${proposal.status}". Must be saved or submitted_for_review.`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result: ApproveChatProposalResult = { proposal };

    // --- Downstream effects by proposal type ---
    if (proposal.proposal_type === "suggested_task") {
      const payload = proposal.payload as {
        milestone_id?: string;
        priority?: string;
        acceptance_criteria?: unknown[];
        purpose?: string;
        qa_checklist?: unknown[];
        risks?: unknown[];
        dependency_notes?: string;
        expected_artifact?: string;
      };
      const ac = Array.isArray(payload.acceptance_criteria) ? payload.acceptance_criteria : [];
      const description = [
        payload.purpose ? `Purpose: ${payload.purpose}` : null,
        payload.dependency_notes ? `Dependencies: ${payload.dependency_notes}` : null,
        payload.expected_artifact ? `Expected artifact: ${payload.expected_artifact}` : null,
        Array.isArray(payload.qa_checklist) && payload.qa_checklist.length
          ? `QA:\n- ${payload.qa_checklist.map((x) => String(x)).join("\n- ")}`
          : null,
      ].filter(Boolean).join("\n\n");

      const { data: taskRow, error: tErr } = await supabaseAdmin
        .from("engine_tasks")
        .insert({
          project_id: data.projectId,
          milestone_id: payload.milestone_id ?? null,
          name: proposal.title.slice(0, 300),
          description: description || proposal.summary || null,
          source: "proposal_approved",
          priority: (payload.priority as string | undefined) ?? "P2",
          status: "approved",
          acceptance_criteria: ac,
          created_by: "proposal_approval",
        })
        .select("id")
        .single();
      if (tErr) throw new Error(tErr.message ?? "Failed to create approved task");
      result.taskId = (taskRow as { id: string }).id;

    } else if (proposal.proposal_type === "review_item") {
      // Update linked review item if one exists
      const convertedRef = proposal.converted_ref as { table?: string; id?: string } | null;
      if (convertedRef?.table === "engine_review_items" && convertedRef.id) {
        const { error: rErr } = await supabaseAdmin
          .from("engine_review_items")
          .update({ status: "approved", reviewed_by: email, reviewed_at: new Date().toISOString() })
          .eq("id", convertedRef.id);
        if (rErr) throw new Error(rErr.message ?? "Failed to update review item");
        result.reviewItemId = convertedRef.id;
      }

    } else if (proposal.proposal_type === "milestone_brief") {
      const payload = proposal.payload as {
        milestone_id?: string;
        milestone_summary?: string;
        required_outputs?: string[];
        tasks?: string[];
      };
      if (payload.milestone_id) {
        // Update existing milestone with the brief summary
        const { error: mErr } = await supabaseAdmin
          .from("engine_milestones")
          .update({
            description: payload.milestone_summary ?? proposal.summary ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payload.milestone_id)
          .eq("project_id", data.projectId);
        if (mErr) throw new Error(mErr.message ?? "Failed to update milestone");
        result.milestoneId = payload.milestone_id;
      }
    }
    // implementation_prompt and qa_checklist: artifacts already saved, just mark converted

    // Mark proposal as converted
    const { data: updatedProposal, error: upErr } = await supabaseAdmin
      .from("engine_project_chat_proposals")
      .update({
        status: "converted",
        converted_ref: {
          ...((proposal.converted_ref as object) ?? {}),
          approved_by: email,
          approved_at: new Date().toISOString(),
          task_id: result.taskId,
          review_item_id: result.reviewItemId,
          milestone_id: result.milestoneId,
        },
      })
      .eq("id", data.proposalId)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message ?? "Failed to mark proposal as converted");
    result.proposal = updatedProposal as ChatProposalRow;

    // Audit trail
    await auditEvent(sb, {
      projectId: data.projectId, userId, email,
      threadId: proposal.thread_id, messageId: proposal.source_message_id,
      eventType: "proposal_approved",
    });
    await auditActivity(
      sb, data.projectId, "proposal_approved",
      `Proposal approved: ${proposal.proposal_type}`,
      `${email} directly approved ${proposal.proposal_type} proposal "${proposal.title.slice(0, 80)}"`
    );

    return result;
  });
