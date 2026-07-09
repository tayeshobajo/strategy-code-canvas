// Project Chat — Action Proposals v2
// Read-only proposals prepared by the AI, saved/submitted/converted by
// operators. Never approves, publishes, marks complete, or sends client
// messages. Every mutating fn re-checks operator/admin role and project
// scope, and writes both engine_activity + engine_project_chat_events audit
// rows.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import type { Json } from "@/lib/engine-workspace";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

export const PROPOSAL_TYPES = [
  "client_clarification",
  "review_item",
  "suggested_task",
  "implementation_prompt",
  "qa_checklist",
  "milestone_brief",
] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_STATUSES = [
  "draft",
  "saved",
  "submitted_for_review",
  "converted",
  "dismissed",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type ChatProposalRow = {
  id: string;
  project_id: string;
  thread_id: string | null;
  source_message_id: string | null;
  created_by: string | null;
  proposal_type: ProposalType;
  title: string;
  summary: string | null;
  payload: Json;
  status: ProposalStatus;
  target_route: string | null;
  converted_ref: Json;
  created_at: string;
  updated_at: string;
};

async function assertStaff(context: {
  claims?: Record<string, unknown>;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
}): Promise<{ email: string; isAdmin: boolean; isOperator: boolean }> {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOperator, isAdmin] = await Promise.all([
    hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "operator",
    ),
    hasRoleForEmail(
      context.supabase as unknown as Parameters<typeof hasRoleForEmail>[0],
      email,
      "admin",
    ),
  ]);
  if (!isOperator && !isAdmin) {
    throw new Error("Forbidden: operator or admin role required");
  }
  return { email, isAdmin, isOperator };
}

const ProposalDraftSchema = z.object({
  proposal_type: z.enum(PROPOSAL_TYPES),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(4000).optional().default(""),
  payload: z.record(z.string(), z.any()).optional().default({}),
  target_route: z.string().trim().max(500).optional(),
});

export type ProposalDraft = {
  proposal_type: ProposalType;
  title: string;
  summary?: string;
  payload?: Json;
  target_route?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertActivity(sb: any, projectId: string, kind: string, title: string, body: string) {
  try {
    await sb.from("engine_activity").insert({
      project_id: projectId,
      kind,
      title,
      body,
      severity: "info",
    });
  } catch {
    /* best-effort */
  }
}

async function insertAuditEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  args: {
    projectId: string;
    userId: string | null;
    email: string;
    threadId: string | null;
    messageId: string | null;
    eventType: string;
    success?: boolean;
    errorCode?: string | null;
  },
) {
  try {
    await sb.from("engine_project_chat_events").insert({
      project_id: args.projectId,
      user_id: args.userId,
      user_email: args.email,
      thread_id: args.threadId,
      message_id: args.messageId,
      event_type: args.eventType,
      success: args.success ?? true,
      error_code: args.errorCode ?? null,
    });
  } catch {
    /* best-effort */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProposal(sb: any, id: string): Promise<ChatProposalRow> {
  const { data, error } = await sb
    .from("engine_project_chat_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load proposal");
  if (!data) throw new Error("Proposal not found");
  return data as ChatProposalRow;
}

// -------------------- list --------------------
export const listChatProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        threadId: uuid.optional(),
        sourceMessageId: uuid.optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ proposals: ChatProposalRow[] }> => {
    await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    let q = sb
      .from("engine_project_chat_proposals")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (data.threadId) q = q.eq("thread_id", data.threadId);
    if (data.sourceMessageId) q = q.eq("source_message_id", data.sourceMessageId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message ?? "Failed to list proposals");
    return { proposals: (rows ?? []) as ChatProposalRow[] };
  });

// -------------------- create (manual save from UI) --------------------
export const createChatProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        threadId: uuid.optional(),
        sourceMessageId: uuid.optional(),
        proposal: ProposalDraftSchema,
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ proposal: ChatProposalRow }> => {
    const { email } = await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const userId = (context as { userId?: string }).userId ?? null;

    const { data: row, error } = await sb
      .from("engine_project_chat_proposals")
      .insert({
        project_id: data.projectId,
        thread_id: data.threadId ?? null,
        source_message_id: data.sourceMessageId ?? null,
        created_by: userId,
        proposal_type: data.proposal.proposal_type,
        title: data.proposal.title,
        summary: data.proposal.summary || null,
        payload: data.proposal.payload ?? {},
        target_route: data.proposal.target_route ?? null,
        status: "saved",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to save proposal");

    const proposal = row as ChatProposalRow;
    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId,
      email,
      threadId: data.threadId ?? null,
      messageId: data.sourceMessageId ?? null,
      eventType: "proposal_saved",
    });
    await insertActivity(
      sb,
      data.projectId,
      "chat_proposal_saved",
      `Chat proposal saved: ${proposal.proposal_type}`,
      `${email} saved a ${proposal.proposal_type} proposal ("${proposal.title.slice(0, 80)}")`,
    );
    return { proposal };
  });

// -------------------- update status (save / dismiss) --------------------
export const updateChatProposalStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: uuid,
        projectId: uuid,
        status: z.enum(["saved", "dismissed"]),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ proposal: ChatProposalRow }> => {
    const { email } = await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const userId = (context as { userId?: string }).userId ?? null;

    const existing = await loadProposal(sb, data.id);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");

    // Allowed transitions
    const allowed: Record<ProposalStatus, ProposalStatus[]> = {
      draft: ["saved", "dismissed"],
      saved: ["dismissed"],
      submitted_for_review: [],
      converted: [],
      dismissed: [],
    };
    if (!allowed[existing.status].includes(data.status)) {
      throw new Error(`Cannot transition ${existing.status} → ${data.status}`);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("engine_project_chat_proposals")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message ?? "Failed to update proposal");

    const eventType = data.status === "saved" ? "proposal_saved" : "proposal_dismissed";
    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId,
      email,
      threadId: existing.thread_id,
      messageId: existing.source_message_id,
      eventType,
    });
    await insertActivity(
      sb,
      data.projectId,
      `chat_${eventType}`,
      `Chat proposal ${data.status}: ${existing.proposal_type}`,
      `${email} ${data.status} ${existing.proposal_type} "${existing.title.slice(0, 80)}"`,
    );
    return { proposal: row as ChatProposalRow };
  });

// -------------------- submit to review queue --------------------
export const submitChatProposalToReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: uuid, projectId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ proposal: ChatProposalRow; reviewItemId: string }> => {
    const { email } = await assertStaff(context as unknown as Parameters<typeof assertStaff>[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const userId = (context as { userId?: string }).userId ?? null;

    const existing = await loadProposal(sb, data.id);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.status === "submitted_for_review" || existing.status === "converted") {
      throw new Error(`Proposal already ${existing.status}`);
    }
    if (existing.proposal_type === "client_clarification") {
      throw new Error("Client clarification proposals cannot be submitted to internal review");
    }
    if (existing.proposal_type === "suggested_task") {
      throw new Error("Use Convert to Task for suggested_task proposals");
    }

    // Load project label for engine_review_items.project text column
    const { data: proj } = await sb
      .from("engine_projects")
      .select("name")
      .eq("id", data.projectId)
      .maybeSingle();
    const projectLabel = (proj as { name?: string } | null)?.name ?? data.projectId;

    const { data: reviewRow, error: rErr } = await sb
      .from("engine_review_items")
      .insert({
        project_id: data.projectId,
        project: projectLabel,
        item_type: existing.proposal_type,
        title: existing.title.slice(0, 300),
        impact: "medium",
        source: "project_chat",
        requested_by: email,
        status: "pending",
      })
      .select("id")
      .single();
    if (rErr) throw new Error(rErr.message ?? "Failed to create review item");
    const reviewItemId = (reviewRow as { id: string }).id;

    const { data: updated, error: uErr } = await sb
      .from("engine_project_chat_proposals")
      .update({
        status: "submitted_for_review",
        converted_ref: { table: "engine_review_items", id: reviewItemId },
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message ?? "Failed to update proposal");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId,
      email,
      threadId: existing.thread_id,
      messageId: existing.source_message_id,
      eventType: "proposal_submitted_for_review",
    });
    await insertActivity(
      sb,
      data.projectId,
      "chat_proposal_submitted",
      `Chat proposal submitted to review: ${existing.proposal_type}`,
      `${email} submitted a ${existing.proposal_type} proposal to review queue as pending`,
    );
    return { proposal: updated as ChatProposalRow, reviewItemId };
  });

// -------------------- convert to suggested task --------------------
export const convertChatProposalToSuggestedTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: uuid, projectId: uuid }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ proposal: ChatProposalRow; taskId: string }> => {
    const { email, isAdmin } = await assertStaff(
      context as unknown as Parameters<typeof assertStaff>[0],
    );
    if (!isAdmin) {
      // engine_tasks RLS is admin-only; document at the top of the file.
      throw new Error(
        "Only admins can create tasks in this workspace. Ask an admin to convert this proposal.",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const userId = (context as { userId?: string }).userId ?? null;

    const existing = await loadProposal(sb, data.id);
    if (existing.project_id !== data.projectId) throw new Error("Project scope mismatch");
    if (existing.proposal_type !== "suggested_task") {
      throw new Error("Only suggested_task proposals can be converted");
    }
    if (existing.status === "converted") throw new Error("Proposal already converted");

    const payload = existing.payload as {
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
      Array.isArray(payload.risks) && payload.risks.length
        ? `Risks:\n- ${payload.risks.map((x) => String(x)).join("\n- ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: taskRow, error: tErr } = await sb
      .from("engine_tasks")
      .insert({
        project_id: data.projectId,
        milestone_id: payload.milestone_id ?? null,
        name: existing.title.slice(0, 300),
        description: description || existing.summary || null,
        source: "project_chat",
        priority: (payload.priority as string | undefined) ?? "P2",
        status: "suggested",
        acceptance_criteria: ac,
        created_by: "chat_proposal",
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message ?? "Failed to create suggested task");
    const taskId = (taskRow as { id: string }).id;

    const { data: updated, error: uErr } = await sb
      .from("engine_project_chat_proposals")
      .update({
        status: "converted",
        converted_ref: { table: "engine_tasks", id: taskId },
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (uErr) throw new Error(uErr.message ?? "Failed to update proposal");

    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId,
      email,
      threadId: existing.thread_id,
      messageId: existing.source_message_id,
      eventType: "proposal_converted_to_task",
    });
    await insertActivity(
      sb,
      data.projectId,
      "chat_proposal_converted",
      `Chat proposal converted to suggested task`,
      `${email} converted a chat proposal into suggested task "${existing.title.slice(0, 80)}"`,
    );
    return { proposal: updated as ChatProposalRow, taskId };
  });

// -------------------- helper for server-side proposal persistence --------
// Used by askProjectIntelligence to persist AI-emitted drafts server-side.
export async function persistProposalsFromAssistant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  args: {
    projectId: string;
    threadId: string;
    sourceMessageId: string;
    userId: string | null;
    email: string;
    proposals: ProposalDraft[];
  },
): Promise<ChatProposalRow[]> {
  if (!args.proposals.length) return [];
  const rows = args.proposals.map((p) => ({
    project_id: args.projectId,
    thread_id: args.threadId,
    source_message_id: args.sourceMessageId,
    created_by: args.userId,
    proposal_type: p.proposal_type,
    title: p.title,
    summary: p.summary || null,
    payload: p.payload ?? {},
    target_route: p.target_route ?? null,
    status: "draft" as const,
  }));
  const { data, error } = await sb
    .from("engine_project_chat_proposals")
    .insert(rows)
    .select("*");
  if (error) {
    // do not break the chat response if persistence fails
    return [];
  }
  const created = (data ?? []) as ChatProposalRow[];
  for (const row of created) {
    await insertAuditEvent(sb, {
      projectId: args.projectId,
      userId: args.userId,
      email: args.email,
      threadId: args.threadId,
      messageId: args.sourceMessageId,
      eventType: "proposal_generated",
    });
  }
  return created;
}
