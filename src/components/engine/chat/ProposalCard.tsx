import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Save,
  SendHorizontal,
  Copy as CopyIcon,
  Trash2,
  ArrowRight,
  ClipboardList,
  CheckCircle2,
  Loader2,
  Sparkles,
  FileText,
  BookOpenCheck,
  StickyNote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChatProposal,
  approveChatProposal,
  type ChatCapabilities,
  type ChatProposalRow,
  type ProposalDraft,
  type ProposalStatus,
  type ProposalType,
} from "@/lib/engine-chat-proposals.functions";
import {
  executeChatAction,
  type ExecuteChatActionResult,
} from "@/lib/engine-chat-actions.functions";
import {
  CHAT_ACTIONS,
  isActionAvailable,
  type ChatActionDefinition,
  type ChatActionId,
} from "@/lib/engine-chat-actions";
import { ActionConfirmDialog } from "./ActionConfirmDialog";

type Props = {
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  // Either an already-persisted row, or a client-side draft awaiting save.
  proposal: ChatProposalRow | (ProposalDraft & { id?: undefined; status?: ProposalStatus });
  caps: ChatCapabilities | undefined;
};

const TYPE_LABELS: Record<ProposalType, string> = {
  client_clarification: "Client clarification",
  review_item: "Review item",
  suggested_task: "Suggested task",
  implementation_prompt: "Implementation prompt",
  qa_checklist: "QA checklist",
  milestone_brief: "Milestone brief",
};

const TYPE_TONE: Record<ProposalType, string> = {
  client_clarification: "border-sky-300 bg-sky-50 text-sky-900",
  review_item: "border-amber-300 bg-amber-50 text-amber-900",
  suggested_task: "border-emerald-300 bg-emerald-50 text-emerald-900",
  implementation_prompt: "border-violet-300 bg-violet-50 text-violet-900",
  qa_checklist: "border-royal/40 bg-royal/5 text-ink",
  milestone_brief: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
};

const STATUS_TONE: Record<ProposalStatus, string> = {
  draft: "bg-white text-ink/70 border-border",
  saved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  submitted_for_review: "bg-amber-50 text-amber-800 border-amber-200",
  converted: "bg-royal/10 text-royal border-royal/30",
  dismissed: "bg-ink/5 text-ink/50 border-border",
};

const ACTION_ICONS: Partial<Record<ChatActionId, React.ReactNode>> = {
  save_proposal: <Save className="w-3 h-3" />,
  dismiss_proposal: <Trash2 className="w-3 h-3" />,
  submit_proposal_to_review: <SendHorizontal className="w-3 h-3" />,
  convert_to_suggested_task: <CheckCircle2 className="w-3 h-3" />,
  save_clarification_draft: <FileText className="w-3 h-3" />,
  save_implementation_prompt_artifact: <Sparkles className="w-3 h-3" />,
  save_qa_checklist_artifact: <BookOpenCheck className="w-3 h-3" />,
  save_milestone_brief_artifact: <FileText className="w-3 h-3" />,
  add_internal_decision_note: <StickyNote className="w-3 h-3" />,
};

export function ProposalCard({ projectId, threadId, sourceMessageId, proposal, caps }: Props) {
  const qc = useQueryClient();
  const createFn = useServerFn(createChatProposal);
  const executeFn = useServerFn(executeChatAction);

  const [row, setRow] = useState<ChatProposalRow | null>(
    proposal && (proposal as ChatProposalRow).id ? (proposal as ChatProposalRow) : null,
  );
  const draft: ProposalDraft = {
    proposal_type: proposal.proposal_type,
    title: proposal.title,
    summary: (proposal.summary as string | null) ?? "",
    payload: (proposal as { payload?: unknown }).payload ?? {},
    target_route: (proposal as { target_route?: string | null }).target_route ?? undefined,
  } as ProposalDraft;
  const currentStatus: ProposalStatus = row?.status ?? "draft";
  const [copied, setCopied] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ChatActionDefinition | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const capState = useMemo(
    () => ({
      isStaff: caps?.isStaff ?? false,
      canCreateTasks: caps?.canCreateTasks ?? false,
      canSubmitReview: caps?.canSubmitReview ?? false,
      canCreateArtifacts: caps?.canCreateArtifacts ?? false,
      actionModeEnabled: caps?.actionModeEnabled ?? false,
    }),
    [caps],
  );

  async function ensurePersisted(): Promise<ChatProposalRow> {
    if (row) return row;
    const res = await createFn({
      data: {
        projectId,
        threadId: threadId ?? undefined,
        sourceMessageId: sourceMessageId ?? undefined,
        proposal: draft,
      },
    });
    const p = (res as { proposal: ChatProposalRow }).proposal;
    setRow(p);
    return p;
  }

  const runMut = useMutation({
    mutationFn: async (args: { action: ChatActionDefinition; opts?: { decisionNote?: string } }) => {
      const persisted = await ensurePersisted();
      const res = await executeFn({
        data: {
          projectId,
          proposalId: persisted.id,
          actionId: args.action.action_id,
          options: args.opts,
        },
      });
      return { action: args.action, result: res as ExecuteChatActionResult };
    },
    onSuccess: ({ action, result }) => {
      setErrMsg(null);
      setOkMsg(action.success_message);
      if (result.proposal) setRow(result.proposal);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "chat", "artifacts", projectId] });
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] });
      window.setTimeout(() => setOkMsg(null), 2500);
    },
    onError: (e: unknown) => setErrMsg((e as Error).message),
    onSettled: () => setConfirmAction(null),
  });

  function copyContent() {
    const payload = draft.payload as Record<string, unknown>;
    const promptText =
      draft.proposal_type === "implementation_prompt"
        ? String(payload?.implementation_prompt ?? "")
        : "";
    const text = promptText
      ? promptText
      : `${draft.title}\n\n${draft.summary ?? ""}\n\n${JSON.stringify(payload, null, 2)}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  const isDismissed = currentStatus === "dismissed";
  const isTerminal = currentStatus === "converted" || currentStatus === "submitted_for_review" || isDismissed;

  if (isDismissed) {
    return (
      <div
        className="mt-2 flex items-center justify-between rounded-md border border-border bg-ink/5 px-3 py-1.5 text-[11px] text-ink/50"
        data-qa-role="chat-proposal"
        data-qa-proposal-type={draft.proposal_type}
        data-qa-proposal-status="dismissed"
      >
        <span>Dismissed · {TYPE_LABELS[draft.proposal_type]} — {draft.title}</span>
      </div>
    );
  }

  // Compute available actions from the registry, filtering by proposal type,
  // status, capability, and Action Mode.
  const availableActions = CHAT_ACTIONS
    .map((action) => ({
      action,
      state: isActionAvailable({
        action,
        proposalType: draft.proposal_type,
        proposalStatus: currentStatus,
        caps: capState,
      }),
    }))
    .filter(({ state }) => state.visible);

  return (
    <div
      className={cn("mt-3 rounded-lg border p-3", TYPE_TONE[draft.proposal_type])}
      data-qa-role="chat-proposal"
      data-qa-proposal-type={draft.proposal_type}
      data-qa-proposal-status={currentStatus}
      data-qa-action-mode={capState.actionModeEnabled ? "on" : "off"}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-3.5 h-3.5 opacity-80" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
            {TYPE_LABELS[draft.proposal_type]}
          </span>
          <span
            className={cn(
              "text-[10px] rounded-full border px-2 py-0.5 font-mono uppercase tracking-wider",
              STATUS_TONE[currentStatus],
            )}
          >
            {currentStatus.replace(/_/g, " ")}
          </span>
        </div>
        {row?.created_at && (
          <span className="text-[10px] opacity-60">
            {new Date(row.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      <div className="text-sm font-medium text-ink">{draft.title}</div>
      {draft.summary && <div className="mt-1 text-xs leading-relaxed opacity-90">{draft.summary}</div>}

      <PayloadFields proposal_type={draft.proposal_type} payload={draft.payload as Record<string, unknown>} />

      {draft.target_route && (
        <div className="mt-2">
          <Link
            to={draft.target_route as never}
            className="text-[11px] inline-flex items-center gap-1 border border-border bg-white/70 rounded-md px-2 py-1 hover:border-royal/50"
          >
            Open linked section <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      {row?.converted_ref && Object.keys(row.converted_ref as Record<string, unknown>).length > 0 && (
        <div className="mt-2 text-[11px] opacity-80 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Linked to {(row.converted_ref as { table?: string }).table} ·{" "}
          <code className="opacity-70">
            {String((row.converted_ref as { id?: string }).id ?? "").slice(0, 8)}…
          </code>
        </div>
      )}

      {errMsg && (
        <div className="mt-2 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1">
          {errMsg}
        </div>
      )}
      {okMsg && (
        <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> {okMsg}
        </div>
      )}

      {!isTerminal && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {availableActions.map(({ action, state }) => (
            <ActionBtn
              key={action.action_id}
              onClick={() => {
                if (!state.enabled) return;
                if (action.requires_approval) {
                  setConfirmAction(action);
                } else {
                  runMut.mutate({ action });
                }
              }}
              disabled={runMut.isPending || !state.enabled}
              tooltip={state.disabledReason}
              icon={ACTION_ICONS[action.action_id] ?? <Save className="w-3 h-3" />}
              label={action.label}
              danger={action.action_id === "dismiss_proposal"}
              qaAction={action.action_id}
            />
          ))}
          <ActionBtn
            onClick={copyContent}
            disabled={false}
            icon={<CopyIcon className="w-3 h-3" />}
            label={
              copied
                ? "Copied"
                : draft.proposal_type === "implementation_prompt"
                  ? "Copy Prompt"
                  : draft.proposal_type === "qa_checklist"
                    ? "Copy Checklist"
                    : "Copy"
            }
            qaAction="copy_proposal"
          />
          {runMut.isPending && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
        </div>
      )}

      {!capState.actionModeEnabled &&
        availableActions.some((a) => a.action.requires_action_mode) && (
          <div className="mt-2 text-[10px] opacity-70">
            Action Mode is off for this project. Ask an admin to enable it in the chat sidebar to run
            stronger actions.
          </div>
        )}

      <ActionConfirmDialog
        open={!!confirmAction}
        action={confirmAction}
        proposalTitle={draft.title}
        busy={runMut.isPending}
        onCancel={() => setConfirmAction(null)}
        onConfirm={(opts) => confirmAction && runMut.mutate({ action: confirmAction, opts })}
      />
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  danger,
  tooltip,
  qaAction,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  tooltip?: string;
  qaAction?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      data-qa-action={qaAction}
      className={cn(
        "text-[11px] inline-flex items-center gap-1 rounded-md border px-2 py-1 bg-white/80 hover:bg-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        danger ? "border-red-200 text-red-700 hover:border-red-300" : "border-border text-ink/80 hover:border-royal/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PayloadFields({
  proposal_type,
  payload,
}: {
  proposal_type: ProposalType;
  payload: Record<string, unknown>;
}) {
  const rows: Array<[string, React.ReactNode]> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      rows.push([
        label,
        <ul className="list-disc pl-4 space-y-0.5">
          {value.slice(0, 12).map((v, i) => (
            <li key={i}>{String(v)}</li>
          ))}
        </ul>,
      ]);
      return;
    }
    if (typeof value === "object") {
      rows.push([label, <code className="text-[10px]">{JSON.stringify(value)}</code>]);
      return;
    }
    rows.push([label, <span>{String(value)}</span>]);
  };

  switch (proposal_type) {
    case "client_clarification":
      push("Reason", payload.reason);
      push("Question to client", payload.question_to_client);
      push("Context", payload.context);
      push("Related section", payload.related_project_section);
      push("Suggested channel", payload.suggested_channel);
      break;
    case "review_item":
      push("Artifact type", payload.artifact_type);
      push("Summary", payload.artifact_summary);
      push("Reason for review", payload.reason_for_review);
      push("Linked section", payload.linked_section);
      push("Proposed decision", payload.proposed_decision);
      break;
    case "suggested_task":
      push("Purpose", payload.purpose);
      push("Milestone", payload.milestone_id);
      push("Phase", payload.phase);
      push("Priority", payload.priority);
      push("Dependencies", payload.dependency_notes);
      push("Acceptance criteria", payload.acceptance_criteria);
      push("QA checklist", payload.qa_checklist);
      push("Risks", payload.risks);
      push("Expected artifact", payload.expected_artifact);
      break;
    case "implementation_prompt":
      push("Target surface", payload.target_surface);
      push("Build goal", payload.build_goal);
      push("Context", payload.context_summary);
      push("Acceptance criteria", payload.acceptance_criteria);
      push("Safety notes", payload.safety_notes);
      push("Related tasks", payload.related_tasks);
      if (payload.implementation_prompt) {
        rows.push([
          "Prompt",
          <pre className="whitespace-pre-wrap text-[11px] bg-white/70 border border-border rounded p-2">
            {String(payload.implementation_prompt)}
          </pre>,
        ]);
      }
      break;
    case "qa_checklist":
      push("Target surface", payload.target_surface);
      push("QA goal", payload.qa_goal);
      push("Scenarios", payload.scenarios);
      push("Role tests", payload.role_tests);
      push("Data tests", payload.data_tests);
      push("Edge cases", payload.edge_cases);
      push("Acceptance criteria", payload.acceptance_criteria);
      push("Expected evidence", payload.expected_evidence);
      break;
    case "milestone_brief":
      push("Milestone", payload.milestone_id);
      push("Summary", payload.milestone_summary);
      push("Why it matters", payload.why_it_matters);
      push("Required outputs", payload.required_outputs);
      push("Tasks", payload.tasks);
      push("Dependencies", payload.dependencies);
      push("Risks", payload.risks);
      push("Acceptance criteria", payload.acceptance_criteria);
      push("QA checklist", payload.qa_checklist);
      break;
  }

  if (rows.length === 0) return null;
  return (
    <dl className="mt-2 space-y-1.5 text-[11px] text-ink/90">
      {rows.map(([label, value], i) => (
        <div key={i} className="grid grid-cols-[minmax(90px,140px)_1fr] gap-2">
          <dt className="font-mono uppercase tracking-wider text-[9px] text-ink/50">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
