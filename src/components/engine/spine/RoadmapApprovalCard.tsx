/**
 * Explicit roadmap approval card for the Spine approvals column.
 *
 * Provides three actions in one place:
 *  - Approve v0.1 (baseline)  — via `onApprove` (parent owns the mutation)
 *  - Compare versions          — via `onCompare` (parent opens the modal)
 *  - Post-approval confirmation state that swaps in when `justApprovedAt`
 *    is set, so operators get immediate visual proof the baseline flipped
 *    to approved even before the next refetch settles.
 *
 * Presentational-only otherwise; all writes go through the parent so the
 * spine cache invalidation stays in one place.
 */

import { ArrowRight, CheckCircle2, FileCheck2, GitBranch, Loader2 } from "lucide-react";
import { formatDate } from "@/components/engine/primitives";

export type RoadmapApprovalCardProps = {
  projectId: string;
  versionLabel: string | null;
  status: string; // 'draft' | 'proposed' | 'approved' | ...
  ownerEmail: string | null;
  dueDate: string | null;
  milestoneCount: number;
  approving?: boolean;
  onApprove?: () => void;
  onCompare?: () => void;
  /** ISO timestamp set by the parent right after a successful approve. */
  justApprovedAt?: string | null;
  approvedBy?: string | null;
};

export function RoadmapApprovalCard({
  projectId: _projectId,
  versionLabel,
  status,
  ownerEmail,
  dueDate,
  milestoneCount,
  approving = false,
  onApprove,
  onCompare,
  justApprovedAt = null,
  approvedBy = null,
}: RoadmapApprovalCardProps) {
  const label = versionLabel ?? "v0.1";
  const isProposed = status === "proposed";
  const isApproved = status === "approved" || Boolean(justApprovedAt);

  if (isApproved) {
    return (
      <section
        id="spine-roadmap-approval"
        className="relative overflow-hidden rounded-2xl border border-[#bfe4ce] bg-[#eef8f2] p-5 shadow-sm"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#1f6b3b] via-[#3E68B2] to-[#34C4EB]"
        />
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1f6b3b] text-white ring-4 ring-white">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#1f6b3b]">
              Baseline approved
            </div>
            <h3
              className="mt-0.5 text-[20px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              Roadmap {label} is now the baseline
            </h3>
            <p className="mt-1 text-[13px] leading-[1.55] text-[#3f4a5e]">
              Milestone planning, qualification, and client publishing are
              unlocked. All future changes flow through amendments against
              this baseline.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Meta
                label="Approved"
                value={
                  justApprovedAt
                    ? formatDate(justApprovedAt)
                    : "Just now"
                }
              />
              <Meta label="Approver" value={approvedBy ?? ownerEmail ?? "You"} />
              <Meta label="Milestones locked" value={String(milestoneCount)} />
            </div>
            {onCompare && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onCompare}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#cdd6f3] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3E68B2] hover:bg-[#eef3fd]"
                >
                  <GitBranch className="h-3 w-3" /> Compare versions
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="spine-roadmap-approval"
      className="relative overflow-hidden rounded-2xl border border-[#cdd6f3] bg-[#f5f8ff] p-5 shadow-sm"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#0A0F1F] via-[#3E68B2] to-[#34C4EB]"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0A0F1F] text-white ring-4 ring-white">
            <FileCheck2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9.5px] font-medium uppercase tracking-[0.32em] text-[#3E68B2]">
              Highest-priority approval
            </div>
            <h3
              className="mt-0.5 text-[20px] leading-tight tracking-[-0.01em] text-[#0A0F1F]"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              Approve Roadmap {label}
            </h3>
            <p className="mt-1 text-[13px] leading-[1.55] text-[#3f4a5e]">
              Locks the baseline the whole project runs from. Milestone planning,
              investment phasing, and client-facing publishing stay blocked until
              this is approved.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[#f1e3b9] bg-[#fbf3e0] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6713]">
          {isProposed ? "Awaiting you" : status || "Draft"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Owner" value={ownerEmail ?? "Unassigned"} />
        <Meta label="Due" value={dueDate ? formatDate(dueDate) : "Not set"} />
        <Meta label="Milestones affected" value={String(milestoneCount)} />
        <Meta label="Impact" value="High · unlocks execution" />
      </div>

      <div className="mt-4 rounded-lg border border-[#E8E1D6] bg-white p-3 text-[12.5px] leading-[1.55] text-[#3f4a5e]">
        <span className="font-mono text-[9.5px] font-medium uppercase tracking-[0.28em] text-[#3E68B2]">
          After approval
        </span>
        <div className="mt-1">
          Milestones move from planning to qualification, the Work room activates,
          and the client portal becomes eligible for publishing.
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={approving || !onApprove}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0F1F] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a2544] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Approving…
            </>
          ) : (
            <>
              Approve {label} <ArrowRight className="h-3 w-3" />
            </>
          )}
        </button>
        {onCompare && (
          <button
            type="button"
            onClick={onCompare}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#cdd6f3] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3E68B2] hover:bg-[#eef3fd]"
          >
            <GitBranch className="h-3 w-3" /> Compare versions
          </button>
        )}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] font-medium uppercase tracking-[0.28em] text-[#8a94a6]">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[#0A0F1F]">{value}</div>
    </div>
  );
}
