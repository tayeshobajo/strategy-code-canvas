// Project Chat — Action Mode v3 server functions.
//
// Every mutating action requires operator/admin, verifies project scope,
// enforces the action registry (proposal type + status + capability), and
// writes an audit event to engine_project_chat_events plus an
// engine_activity row. Artifact writes and proposal transitions all flow
// through supabaseAdmin so the hardened row-level revokes on
// engine_project_chat_proposals stay effective.
//
// This file must NOT open new mutation paths for protected truth (roadmap
// approvals, portal publish, client messages, task completion, investment
// terms). Every action here returns internal-only artifacts, a pending
// review item, or a task with status = "suggested".

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRoleForEmail } from "@/lib/ops/access";
import {
  CHAT_ACTIONS,
  getChatAction,
  type ChatActionDefinition,
  type ChatActionId,
} from "@/lib/engine-chat-actions";
import {
  submitChatProposalToReview,
  convertChatProposalToSuggestedTask,
  updateChatProposalStatus,
  createChatProposal,
  type ChatProposalRow,
} from "@/lib/engine-chat-proposals.functions";
import type { Json } from "@/lib/engine-workspace";

const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );

export type ProjectArtifactRow = {
  id: string;
  project_id: string;
  thread_id: string | null;
  source_proposal_id: string | null;
  artifact_type:
    | "client_clarification_draft"
    | "implementation_prompt"
    | "qa_checklist"
    | "milestone_brief"
    | "decision_note";
  title: string;
  summary: string | null;
  payload: Json;
  status: "draft" | "saved" | "submitted_for_review" | "archived";
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

// --------------------- role + scope helpers ---------------------

type StaffContext = {
  claims?: Record<string, unknown>;
  userId?: string;
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    from: (t: string) => unknown;
  };
};

async function assertStaff(context: StaffContext): Promise<{
  email: string;
  userId: string | null;
  isAdmin: boolean;
  isOperator: boolean;
}> {
  const email = ((context.claims?.email as string | undefined) ?? "").toLowerCase();
  const [isOperator, isAdmin] = await Promise.all([
    hasRoleForEmail(context.supabase, email, "operator"),
    hasRoleForEmail(context.supabase, email, "admin"),
  ]);
  if (!isOperator && !isAdmin) {
    throw new Error("Forbidden: operator or admin role required");
  }
  return { email, userId: context.userId ?? null, isAdmin, isOperator };
}

async function assertAdmin(context: StaffContext): Promise<{ email: string; userId: string | null }> {
  const staff = await assertStaff(context);
  if (!staff.isAdmin) throw new Error("Forbidden: admin role required");
  return { email: staff.email, userId: staff.userId };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertActivity(sb: any, projectId: string, kind: string, title: string, body: string, severity: string = "info") {
  try {
    await sb.from("engine_activity").insert({ project_id: projectId, kind, title, body, severity });
  } catch { /* best-effort */ }
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
  } catch { /* best-effort */ }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProject(sb: any, projectId: string) {
  const { data, error } = await sb
    .from("engine_projects")
    .select("id,name,action_mode_enabled")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load project");
  if (!data) throw new Error("Project not found");
  return data as { id: string; name: string | null; action_mode_enabled: boolean };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadProposal(sb: any, id: string, projectId: string): Promise<ChatProposalRow> {
  const { data, error } = await sb
    .from("engine_project_chat_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load proposal");
  if (!data) throw new Error("Proposal not found");
  const row = data as ChatProposalRow;
  if (row.project_id !== projectId) throw new Error("Project scope mismatch");
  return row;
}

// --------------------- Action Mode toggle ---------------------

export const getActionMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ projectId: uuid }).parse(raw))
  .handler(async ({ context, data }): Promise<{ enabled: boolean; updatedAt: string | null; updatedBy: string | null }> => {
    await assertStaff(context as unknown as StaffContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const { data: row, error } = await sb
      .from("engine_projects")
      .select("action_mode_enabled,action_mode_updated_at,action_mode_updated_by")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message ?? "Failed to load project");
    if (!row) throw new Error("Project not found");
    const r = row as {
      action_mode_enabled: boolean;
      action_mode_updated_at: string | null;
      action_mode_updated_by: string | null;
    };
    return { enabled: !!r.action_mode_enabled, updatedAt: r.action_mode_updated_at, updatedBy: r.action_mode_updated_by };
  });

export const setActionModeEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ projectId: uuid, enabled: z.boolean() }).parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ enabled: boolean }> => {
    const { email, userId } = await assertAdmin(context as unknown as StaffContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    // Load first to detect no-op + verify scope
    const project = await loadProject(sb, data.projectId);
    if (project.action_mode_enabled === data.enabled) {
      return { enabled: project.action_mode_enabled };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("engine_projects")
      .update({
        action_mode_enabled: data.enabled,
        action_mode_updated_at: new Date().toISOString(),
        action_mode_updated_by: email,
      })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message ?? "Failed to update Action Mode");

    const eventType = data.enabled ? "action_mode_enabled" : "action_mode_disabled";
    await insertAuditEvent(sb, {
      projectId: data.projectId,
      userId,
      email,
      threadId: null,
      messageId: null,
      eventType,
    });
    await insertActivity(
      sb,
      data.projectId,
      eventType,
      `Action Mode ${data.enabled ? "enabled" : "disabled"}`,
      `${email} ${data.enabled ? "enabled" : "disabled"} Project Chat Action Mode for this project.`,
      data.enabled ? "warning" : "info",
    );
    return { enabled: data.enabled };
  });

// --------------------- artifact writer ---------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeArtifact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  args: {
    projectId: string;
    threadId: string | null;
    sourceProposalId: string | null;
    artifactType: ProjectArtifactRow["artifact_type"];
    title: string;
    summary: string | null;
    payload: Json;
    email: string;
    userId: string | null;
    status?: ProjectArtifactRow["status"];
  },
): Promise<ProjectArtifactRow> {
  const { data, error } = await supabaseAdmin
    .from("engine_project_artifacts")
    .insert({
      project_id: args.projectId,
      thread_id: args.threadId,
      source_proposal_id: args.sourceProposalId,
      artifact_type: args.artifactType,
      title: args.title.slice(0, 300),
      summary: (args.summary ?? "").slice(0, 4000) || null,
      payload: args.payload ?? {},
      status: args.status ?? "saved",
      created_by_email: args.email,
      created_by_user_id: args.userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Failed to create artifact");
  return data as ProjectArtifactRow;
}

// --------------------- list artifacts ---------------------

export const listProjectArtifacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        projectId: uuid,
        artifactType: z
          .enum([
            "client_clarification_draft",
            "implementation_prompt",
            "qa_checklist",
            "milestone_brief",
            "decision_note",
          ])
          .optional(),
        sourceProposalId: uuid.optional(),
      })
      .parse(raw),
  )
  .handler(async ({ context, data }): Promise<{ artifacts: ProjectArtifactRow[] }> => {
    await assertStaff(context as unknown as StaffContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    let q = sb
      .from("engine_project_artifacts")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (data.artifactType) q = q.eq("artifact_type", data.artifactType);
    if (data.sourceProposalId) q = q.eq("source_proposal_id", data.sourceProposalId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message ?? "Failed to list artifacts");
    return { artifacts: (rows ?? []) as ProjectArtifactRow[] };
  });

// --------------------- unified action dispatcher ---------------------

const ExecuteInput = z.object({
  projectId: uuid,
  proposalId: uuid,
  actionId: z.enum([
    "save_proposal",
    "dismiss_proposal",
    "submit_proposal_to_review",
    "convert_to_suggested_task",
    "save_clarification_draft",
    "save_implementation_prompt_artifact",
    "save_qa_checklist_artifact",
    "save_milestone_brief_artifact",
    "add_internal_decision_note",
  ]),
  options: z
    .object({
      decisionNote: z.string().trim().max(4000).nullish(),
    })
    .nullish(),
});

export type ExecuteChatActionResult = {
  actionId: ChatActionId;
  proposal?: ChatProposalRow;
  artifact?: ProjectArtifactRow;
  taskId?: string;
  reviewItemId?: string;
};

async function checkCapability(
  action: ChatActionDefinition,
  caller: { isAdmin: boolean; isOperator: boolean },
): Promise<void> {
  const isStaff = caller.isAdmin || caller.isOperator;
  const cap = action.required_capability;
  const map: Record<typeof cap, boolean> = {
    staff: isStaff,
    canSubmitReview: isStaff,
    canCreateTasks: caller.isAdmin,
    canCreateArtifacts: isStaff,
  };
  if (!map[cap]) throw new Error(`Forbidden: capability ${cap} required for action ${action.action_id}`);
}

export const executeChatAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ExecuteInput.parse(raw))
  .handler(async ({ context, data }): Promise<ExecuteChatActionResult> => {
    const staff = await assertStaff(context as unknown as StaffContext);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (context as any).supabase;
    const action = getChatAction(data.actionId as ChatActionId);
    if (!action) throw new Error(`Unknown action: ${data.actionId}`);

    const project = await loadProject(sb, data.projectId);
    const proposal = await loadProposal(sb, data.proposalId, data.projectId);

    // Registry gates ------------------------------------------------------
    if (!action.allowed_proposal_types.includes(proposal.proposal_type)) {
      throw new Error(`Action ${action.action_id} not allowed for proposal type ${proposal.proposal_type}`);
    }
    if (action.allowed_statuses.length && !action.allowed_statuses.includes(proposal.status)) {
      throw new Error(`Action ${action.action_id} not allowed for proposal in status ${proposal.status}`);
    }
    await checkCapability(action, staff);
    if (action.requires_action_mode && !project.action_mode_enabled) {
      throw new Error(`Action Mode is disabled for this project.`);
    }

    try {
      let result: ExecuteChatActionResult = { actionId: action.action_id };
      switch (action.action_id) {
        case "save_proposal":
        case "dismiss_proposal": {
          const status = action.action_id === "save_proposal" ? "saved" : "dismissed";
          const res = (await updateChatProposalStatus({
            data: { id: proposal.id, projectId: data.projectId, status },
          })) as { proposal: ChatProposalRow };
          result.proposal = res.proposal;
          break;
        }
        case "submit_proposal_to_review": {
          const res = (await submitChatProposalToReview({
            data: { id: proposal.id, projectId: data.projectId },
          })) as { proposal: ChatProposalRow; reviewItemId: string };
          result.proposal = res.proposal;
          result.reviewItemId = res.reviewItemId;
          break;
        }
        case "convert_to_suggested_task": {
          const res = (await convertChatProposalToSuggestedTask({
            data: { id: proposal.id, projectId: data.projectId },
          })) as { proposal: ChatProposalRow; taskId: string };
          result.proposal = res.proposal;
          result.taskId = res.taskId;
          break;
        }
        case "save_clarification_draft": {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const artifact = await writeArtifact(supabaseAdmin, {
            projectId: data.projectId,
            threadId: proposal.thread_id,
            sourceProposalId: proposal.id,
            artifactType: "client_clarification_draft",
            title: proposal.title,
            summary: proposal.summary,
            payload: proposal.payload,
            email: staff.email,
            userId: staff.userId,
          });
          result.artifact = artifact;
          break;
        }
        case "save_implementation_prompt_artifact": {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const artifact = await writeArtifact(supabaseAdmin, {
            projectId: data.projectId,
            threadId: proposal.thread_id,
            sourceProposalId: proposal.id,
            artifactType: "implementation_prompt",
            title: proposal.title,
            summary: proposal.summary,
            payload: proposal.payload,
            email: staff.email,
            userId: staff.userId,
          });
          result.artifact = artifact;
          break;
        }
        case "save_qa_checklist_artifact": {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const artifact = await writeArtifact(supabaseAdmin, {
            projectId: data.projectId,
            threadId: proposal.thread_id,
            sourceProposalId: proposal.id,
            artifactType: "qa_checklist",
            title: proposal.title,
            summary: proposal.summary,
            payload: proposal.payload,
            email: staff.email,
            userId: staff.userId,
          });
          result.artifact = artifact;
          break;
        }
        case "save_milestone_brief_artifact": {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const artifact = await writeArtifact(supabaseAdmin, {
            projectId: data.projectId,
            threadId: proposal.thread_id,
            sourceProposalId: proposal.id,
            artifactType: "milestone_brief",
            title: proposal.title,
            summary: proposal.summary,
            payload: proposal.payload,
            email: staff.email,
            userId: staff.userId,
          });
          result.artifact = artifact;
          break;
        }
        case "add_internal_decision_note": {
          const note = (data.options?.decisionNote ?? "").trim();
          if (!note) throw new Error("Decision note text is required");
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const artifact = await writeArtifact(supabaseAdmin, {
            projectId: data.projectId,
            threadId: proposal.thread_id,
            sourceProposalId: proposal.id,
            artifactType: "decision_note",
            title: `Decision: ${proposal.title}`.slice(0, 300),
            summary: note,
            payload: {
              linked_proposal_type: proposal.proposal_type,
              note,
            },
            email: staff.email,
            userId: staff.userId,
          });
          result.artifact = artifact;
          break;
        }
        default: {
          throw new Error(`Unhandled action: ${data.actionId}`);
        }
      }

      // Audit + activity — reused server fns (save/dismiss/submit/convert)
      // already log their own event; the artifact / decision paths need
      // an explicit event here.
      if (
        action.action_id !== "save_proposal" &&
        action.action_id !== "dismiss_proposal" &&
        action.action_id !== "submit_proposal_to_review" &&
        action.action_id !== "convert_to_suggested_task"
      ) {
        await insertAuditEvent(sb, {
          projectId: data.projectId,
          userId: staff.userId,
          email: staff.email,
          threadId: proposal.thread_id,
          messageId: proposal.source_message_id,
          eventType: action.audit_event,
        });
        await insertActivity(
          sb,
          data.projectId,
          action.activity_kind,
          `${action.label}: ${proposal.title.slice(0, 80)}`,
          `${staff.email} executed chat action ${action.action_id}`,
        );
      }

      // Meta chat_action_executed event (in addition to the specific audit).
      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        threadId: proposal.thread_id,
        messageId: proposal.source_message_id,
        eventType: "chat_action_executed",
      });

      return result;
    } catch (err) {
      await insertAuditEvent(sb, {
        projectId: data.projectId,
        userId: staff.userId,
        email: staff.email,
        threadId: proposal.thread_id,
        messageId: proposal.source_message_id,
        eventType: "chat_action_failed",
        success: false,
        errorCode: (err as Error).message?.slice(0, 200) ?? "unknown",
      });
      throw err;
    }
  });

// Re-export registry so UI can import from a single .functions.ts if needed.
export { CHAT_ACTIONS };
