import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, FileText, CheckCircle2,
  AlertTriangle, Loader2, Info, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMilestoneEvidenceGate,
  markMilestoneComplete,
  type EvidenceGateStatus,
} from "@/lib/engine-evidence-gate.functions";

interface MilestoneEvidenceGateProps {
  projectId: string;
  milestoneId: string;
  /** If true, shows the 'Mark Complete' action button */
  showAction?: boolean;
  /** Called after milestone is successfully marked complete */
  onComplete?: () => void;
  className?: string;
}

const BLOCKER_LABELS: Record<string, string> = {
  no_sources_attached: "No evidence sources attached",
  no_processed_sources: "No processed sources",
  milestone_not_found: "Milestone not found",
  milestone_already_complete: "Already complete",
};

function GateStatusBadge({
  gateOpen,
  alreadyComplete,
}: {
  gateOpen: boolean;
  alreadyComplete: boolean;
}) {
  if (alreadyComplete) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
        <CheckCircle2 className="h-3 w-3" />
        Complete
      </span>
    );
  }
  if (gateOpen) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
        <ShieldCheck className="h-3 w-3" />
        Evidence ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
      <ShieldAlert className="h-3 w-3" />
      Evidence required
    </span>
  );
}

export function MilestoneEvidenceGate({
  projectId,
  milestoneId,
  showAction = false,
  onComplete,
  className,
}: MilestoneEvidenceGateProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const gateFn = useServerFn(getMilestoneEvidenceGate);
  const completeFn = useServerFn(markMilestoneComplete);

  const gateQ = useQuery<EvidenceGateStatus>({
    queryKey: ["milestone-evidence-gate", projectId, milestoneId],
    queryFn: () => gateFn({ data: { projectId, milestoneId } }),
    staleTime: 15_000,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      setActionError(null);
      return completeFn({ data: { projectId, milestoneId, completionNote } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["milestone-evidence-gate", projectId, milestoneId] });
      qc.invalidateQueries({ queryKey: ["engine", "spine", projectId] });
      setShowCompleteForm(false);
      setCompletionNote("");
      onComplete?.();
    },
    onError: (err: Error) => {
      setActionError(err.message ?? "Failed to mark milestone complete.");
    },
  });

  const gate = gateQ.data;
  const isLoading = gateQ.isLoading;
  const alreadyComplete =
    gate?.blockers.includes("milestone_already_complete") ||
    gate?.milestoneStatus === "complete" ||
    gate?.milestoneStatus === "completed";

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-[#E8E1D6] bg-white px-4 py-3 text-sm text-[#667085]",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking evidence gate...
      </div>
    );
  }

  if (gateQ.isError || !gate) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700",
          className,
        )}
      >
        <ShieldX className="h-4 w-4" />
        Unable to load evidence gate status.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white",
        gate.gateOpen || alreadyComplete
          ? "border-[#E8E1D6]"
          : "border-amber-200",
        className,
      )}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              alreadyComplete
                ? "bg-green-50 text-green-600"
                : gate.gateOpen
                  ? "bg-blue-50 text-blue-600"
                  : "bg-amber-50 text-amber-600",
            )}
          >
            {alreadyComplete ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : gate.gateOpen ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#0A0F1F]">
                Evidence Gate
              </span>
              <GateStatusBadge
                gateOpen={gate.gateOpen}
                alreadyComplete={!!alreadyComplete}
              />
            </div>
            <div className="mt-0.5 text-xs text-[#667085]">
              {gate.processedSourceCount} processed /{" "}
              {gate.sourceCount} source{gate.sourceCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-[#667085]">
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#E8E1D6] px-4 pb-4 pt-3">
          {/* Blocking message */}
          {gate.blockingMessage && !alreadyComplete && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">{gate.blockingMessage}</p>
            </div>
          )}

          {/* Source breakdown */}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { label: "Total", value: gate.sourceCount, color: "text-[#0A0F1F]" },
              {
                label: "Processed",
                value: gate.processedSourceCount,
                color: gate.processedSourceCount > 0 ? "text-green-700" : "text-[#667085]",
              },
              {
                label: "Pending",
                value: gate.pendingSourceCount,
                color: gate.pendingSourceCount > 0 ? "text-amber-700" : "text-[#667085]",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-lg border border-[#E8E1D6] bg-[#F6F9FC] px-3 py-2 text-center"
              >
                <div className={cn("text-lg font-semibold", color)}>{value}</div>
                <div className="text-xs text-[#667085]">{label}</div>
              </div>
            ))}
          </div>

          {/* Source list */}
          {gate.sources.length > 0 ? (
            <div className="mb-3 space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-[#667085]">
                Evidence Sources
              </div>
              {gate.sources.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-[#E8E1D6] bg-white px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[#3E68B2]" />
                    <span className="truncate text-xs text-[#0A0F1F]">
                      {s.name}
                    </span>
                    <span className="shrink-0 text-xs capitalize text-[#667085]">
                      ({s.source_type})
                    </span>
                  </div>
                  <span
                    className={cn(
                      "ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      s.status === "processed"
                        ? "bg-green-100 text-green-800"
                        : s.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
              {gate.sources.length > 8 && (
                <div className="text-xs text-[#667085]">
                  +{gate.sources.length - 8} more sources
                </div>
              )}
            </div>
          ) : (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-dashed border-[#E8E1D6] p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#667085]" />
              <p className="text-xs text-[#667085]">
                No sources attached to this project yet. Add source documents,
                call recordings, or URLs on the{" "}
                <a
                  href={`/engine/projects/${projectId}/evidence`}
                  className="text-[#3E68B2] hover:underline"
                >
                  Evidence &amp; QA
                </a>{" "}
                page.
              </p>
            </div>
          )}

          {/* Action: Mark Complete */}
          {showAction && !alreadyComplete && (
            <div className="border-t border-[#E8E1D6] pt-3">
              {!showCompleteForm ? (
                <button
                  type="button"
                  onClick={() => setShowCompleteForm(true)}
                  disabled={!gate.gateOpen}
                  className={cn(
                    "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    gate.gateOpen
                      ? "bg-[#0A0F1F] text-white hover:bg-[#1a2030]"
                      : "cursor-not-allowed bg-[#E8E1D6] text-[#667085]",
                  )}
                >
                  {gate.gateOpen
                    ? "Mark Milestone Complete"
                    : "Evidence required before completing"}
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor={`completion-note-${milestoneId}`}
                      className="mb-1 block text-xs font-medium text-[#0A0F1F]"
                    >
                      Completion note (optional)
                    </label>
                    <textarea
                      id={`completion-note-${milestoneId}`}
                      value={completionNote}
                      onChange={(e) => setCompletionNote(e.target.value)}
                      placeholder="Describe what was delivered and how evidence confirms completion..."
                      rows={3}
                      className="w-full rounded-lg border border-[#E8E1D6] bg-white px-3 py-2 text-sm text-[#0A0F1F] placeholder:text-[#9CA3AF] focus:border-[#3E68B2] focus:outline-none"
                    />
                  </div>

                  {actionError && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                      <p className="text-xs text-red-800">{actionError}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0A0F1F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a2030] disabled:opacity-60"
                    >
                      {completeMutation.isPending && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Confirm Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCompleteForm(false);
                        setActionError(null);
                        setCompletionNote("");
                      }}
                      className="rounded-lg border border-[#E8E1D6] px-4 py-2.5 text-sm font-medium text-[#667085] hover:border-[#3E68B2] hover:text-[#3E68B2]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {alreadyComplete && gate.gateOpenedAt && (
            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Evidence gate passed on{" "}
              {new Date(gate.gateOpenedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MilestoneEvidenceGate;
