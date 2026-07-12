import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  ShieldCheck, ShieldAlert, CheckCircle2, Circle,
  Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getProjectEvidenceGateSummary,
  type ProjectEvidenceGateSummary,
} from "@/lib/engine-evidence-gate.functions";

interface EvidenceGateSummaryPanelProps {
  projectId: string;
  className?: string;
}

export function EvidenceGateSummaryPanel({
  projectId,
  className,
}: EvidenceGateSummaryPanelProps) {
  const summaryFn = useServerFn(getProjectEvidenceGateSummary);

  const summaryQ = useQuery<ProjectEvidenceGateSummary>({
    queryKey: ["project-evidence-gate-summary", projectId],
    queryFn: () => summaryFn({ data: { projectId } }),
    staleTime: 30_000,
  });

  const summary = summaryQ.data;

  if (summaryQ.isLoading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-[#E8E1D6] bg-white px-4 py-4 text-sm text-[#667085]",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading evidence gate summary...
      </div>
    );
  }

  if (summaryQ.isError || !summary) {
    return (
      <div
        className={cn(
          "rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700",
          className,
        )}
      >
        Failed to load evidence gate summary.
      </div>
    );
  }

  const allClear =
    summary.milestonesPendingEvidence === 0 && summary.totalMilestones > 0;
  const noMilestones = summary.totalMilestones === 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white",
        allClear ? "border-[#E8E1D6]" : "border-amber-200",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E1D6] px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              allClear ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600",
            )}
          >
            {allClear ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0A0F1F]">
              Evidence Gate Status
            </h3>
            <p className="text-xs text-[#667085]">
              {summary.globalProcessedSourceCount} of {summary.globalSourceCount}{" "}
              source{summary.globalSourceCount !== 1 ? "s" : ""} processed
            </p>
          </div>
        </div>
        <div className="text-right">
          {allClear && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              All milestones ready
            </span>
          )}
          {!allClear && summary.milestonesPendingEvidence > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {summary.milestonesPendingEvidence} pending evidence
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 border-b border-[#E8E1D6]">
        {[
          {
            label: "Total Milestones",
            value: summary.totalMilestones,
            color: "text-[#0A0F1F]",
          },
          {
            label: "Evidence Ready",
            value: summary.milestonesGateOpen,
            color: summary.milestonesGateOpen > 0 ? "text-blue-700" : "text-[#667085]",
          },
          {
            label: "Complete",
            value: summary.milestonesAlreadyComplete,
            color:
              summary.milestonesAlreadyComplete > 0 ? "text-green-700" : "text-[#667085]",
          },
        ].map(({ label, value, color }, i) => (
          <div
            key={label}
            className={cn(
              "px-4 py-3 text-center",
              i < 2 ? "border-r border-[#E8E1D6]" : "",
            )}
          >
            <div className={cn("text-xl font-semibold", color)}>{value}</div>
            <div className="text-xs text-[#667085]">{label}</div>
          </div>
        ))}
      </div>

      {/* Milestone list */}
      <div className="px-5 py-4">
        {noMilestones ? (
          <div className="text-center text-sm text-[#667085] py-4">
            No milestones found for this project.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-[#667085] mb-3">
              Milestone Evidence Status
            </div>
            {summary.milestones.map((m) => {
              const isComplete = m.blockers.includes("milestone_already_complete");
              const isPending = !m.gateOpen && !isComplete;
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-[#E8E1D6] bg-white px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    ) : m.gateOpen ? (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-[#E8E1D6]" />
                    )}
                    <span className={cn("truncate text-sm", isComplete ? "text-[#0A0F1F]" : "text-[#667085]")}>
                      {m.title}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="text-xs text-[#667085]">
                      {m.processedSourceCount}/{m.sourceCount} src
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isComplete
                          ? "bg-green-100 text-green-800"
                          : m.gateOpen
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-100 text-amber-800",
                      )}
                    >
                      {isComplete ? "Complete" : m.gateOpen ? "Ready" : "Needs evidence"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Warning for blocked milestones */}
        {summary.milestonesPendingEvidence > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-800">
              <span className="font-medium">
                {summary.milestonesPendingEvidence} milestone{
                  summary.milestonesPendingEvidence > 1 ? "s" : ""
                }{" "}
                blocked.
              </span>{" "}
              Evidence sources must be uploaded and processed before these
              milestones can be marked complete.{" "}
              <Link
                to="/engine/projects/$projectId/evidence"
                params={{ projectId }}
                className="font-medium text-amber-900 underline hover:text-amber-950"
              >
                Manage evidence →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EvidenceGateSummaryPanel;
