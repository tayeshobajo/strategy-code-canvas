import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChatProposal,
  updateChatProposalStatus,
  submitChatProposalToReview,
  convertChatProposalToSuggestedTask,
  type ChatProposalRow,
  type ProposalDraft,
  type ProposalStatus,
  type ProposalType,
} from "@/lib/engine-chat-proposals.functions";

type Props = {
  projectId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  // Either an already-persisted row, or a client-side draft awaiting save.
  proposal: ChatProposalRow | (ProposalDraft & { id?: undefined; status?: ProposalStatus });
  canConvertToTask: boolean;
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

export function ProposalCard({ projectId, threadId, sourceMessageId, proposal, canConvertToTask }: Props) {
  const qc = useQueryClient();
  const createFn = useServerFn(createChatProposal);
  const updateFn = useServerFn(updateChatProposalStatus);
  const submitFn = useServerFn(submitChatProposalToReview);
  const convertFn = useServerFn(convertChatProposalToSuggestedTask);

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

  const saveMut = useMutation({
    mutationFn: async () => {
      if (row) {
        const res = await updateFn({
          data: { id: row.id, projectId, status: "saved" },
        });
        return (res as { proposal: ChatProposalRow }).proposal;
      }
      const res = await createFn({
        data: {
          projectId,
          threadId: threadId ?? undefined,
          sourceMessageId: sourceMessageId ?? undefined,
          proposal: draft,
        },
      });
      return (res as { proposal: ChatProposalRow }).proposal;
    },
    onSuccess: (p) => {
      setRow(p);
      setErrMsg(null);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
    },
    onError: (e: unknown) => setErrMsg((e as Error).message),
  });

  const dismissMut = useMutation({
    mutationFn: async () => {
      if (!row) return null;
      const res = await updateFn({
        data: { id: row.id, projectId, status: "dismissed" },
      });
      return (res as { proposal: ChatProposalRow }).proposal;
    },
    onSuccess: (p) => {
      if (p) setRow(p);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
    },
    onError: (e: unknown) => setErrMsg((e as Error).message),
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      let target = row;
      if (!target) {
        const res = await createFn({
          data: {
            projectId,
            threadId: threadId ?? undefined,
            sourceMessageId: sourceMessageId ?? undefined,
            proposal: draft,
          },
        });
        target = (res as { proposal: ChatProposalRow }).proposal;
        setRow(target);
      }
      const res = await submitFn({ data: { id: target.id, projectId } });
      return (res as { proposal: ChatProposalRow }).proposal;
    },
    onSuccess: (p) => {
      setRow(p);
      setErrMsg(null);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
    },
    onError: (e: unknown) => setErrMsg((e as Error).message),
  });

  const convertMut = useMutation({
    mutationFn: async () => {
      let target = row;
      if (!target) {
        const res = await createFn({
          data: {
            projectId,
            threadId: threadId ?? undefined,
            sourceMessageId: sourceMessageId ?? undefined,
            proposal: draft,
          },
        });
        target = (res as { proposal: ChatProposalRow }).proposal;
        setRow(target);
      }
      const res = await convertFn({ data: { id: target.id, projectId } });
      return (res as { proposal: ChatProposalRow }).proposal;
    },
    onSuccess: (p) => {
      setRow(p);
      setErrMsg(null);
      qc.invalidateQueries({ queryKey: ["engine", "chat", "proposals", projectId] });
    },
    onError: (e: unknown) => setErrMsg((e as Error).message),
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
        <span>
          Dismissed · {TYPE_LABELS[draft.proposal_type]} — {draft.title}
        </span>
      </div>
    );
  }

  const busy = saveMut.isPending || submitMut.isPending || convertMut.isPending || dismissMut.isPending;
  const showTaskConvert = draft.proposal_type === "suggested_task" && canConvertToTask;
  const canSubmitReview =
    draft.proposal_type === "review_item" ||
    draft.proposal_type === "implementation_prompt" ||
    draft.proposal_type === "qa_checklist" ||
    draft.proposal_type === "milestone_brief";

  return (
    <div
      className={cn("mt-3 rounded-lg border p-3", TYPE_TONE[draft.proposal_type])}
      data-qa-role="chat-proposal"
      data-qa-proposal-type={draft.proposal_type}
      data-qa-proposal-status={currentStatus}
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

      {!isTerminal && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <ActionBtn
            onClick={() => saveMut.mutate()}
            disabled={busy || currentStatus === "saved"}
            icon={<Save className="w-3 h-3" />}
            label={currentStatus === "saved" ? "Saved" : "Save"}
          />
          {canSubmitReview && (
            <ActionBtn
              onClick={() => submitMut.mutate()}
              disabled={busy}
              icon={<SendHorizontal className="w-3 h-3" />}
              label="Submit to Review"
            />
          )}
          {showTaskConvert && (
            <ActionBtn
              onClick={() => convertMut.mutate()}
              disabled={busy}
              icon={<CheckCircle2 className="w-3 h-3" />}
              label="Save as Suggested Task"
            />
          )}
          <ActionBtn
            onClick={copyContent}
            disabled={false}
            icon={<CopyIcon className="w-3 h-3" />}
            label={copied ? "Copied" : draft.proposal_type === "implementation_prompt" ? "Copy Prompt" : draft.proposal_type === "qa_checklist" ? "Copy Checklist" : "Copy"}
          />
          <ActionBtn
            onClick={() => dismissMut.mutate()}
            disabled={busy || !row}
            icon={<Trash2 className="w-3 h-3" />}
            label="Dismiss"
            danger
          />
          {busy && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
        </div>
      )}

      {draft.proposal_type === "suggested_task" && !canConvertToTask && (
        <div className="mt-2 text-[10px] opacity-70">
          Ask an admin to convert this proposal into a suggested task.
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  onClick,
  disabled,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
