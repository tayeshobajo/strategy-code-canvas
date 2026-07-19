/**
 * Explicit roadmap approval card for the Spine approvals column.
 *
 * Replaces the generic "Review pending" line for the roadmap baseline
 * with an actionable brief: why it matters, what it unlocks, owner,
 * due date, impact, and what happens after approval.
 */

import { Link } from "@tanstack/react-router";
import { ArrowRight, FileCheck2 } from "lucide-react";
import { formatDate } from "@/components/engine/primitives";

export type RoadmapApprovalCardProps = {
  projectId: string;
  versionLabel: string | null;
  status: string; // 'draft' | 'proposed' | 'approved' | ...
  ownerEmail: string | null;
  dueDate: string | null;
  milestoneCount: number;
};

export function RoadmapApprovalCard({
  projectId,
  versionLabel,
  status,
  ownerEmail,
  dueDate,
  milestoneCount,
}: RoadmapApprovalCardProps) {
  const label = versionLabel ?? "v0.1";
  const isProposed = status === "proposed";
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

      <div className="mt-4 flex items-center gap-3">
        <Link
          to="/engine/projects/$projectId/roadmap"
          params={{ projectId }}
          search={{ view: "journey" as const }}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0A0F1F] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#1a2544]"
        >
          Review &amp; approve <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          to="/engine/projects/$projectId/roadmap"
          params={{ projectId }}
          search={{ view: "versions" as const }}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3E68B2] hover:text-[#284f93]"
        >
          Compare versions
        </Link>
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
