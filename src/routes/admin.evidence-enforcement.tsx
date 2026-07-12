import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWorkspaceEvidenceReport,
  type ProjectEvidenceRow,
} from "@/lib/engine-evidence-gate.functions";
import {
  ShieldAlert, ShieldCheck, ShieldX,
  AlertTriangle, CheckCircle2, Circle,
  Loader2, ExternalLink, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/evidence-enforcement")({
  head: () => ({
    meta: [
      { title: "Evidence Enforcement — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EvidenceEnforcementPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return d;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4">
      <div className={cn("text-2xl font-semibold", color ?? "text-white")}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-white/60">{label}</div>
      {sub && <div className="mt-1 text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectEvidenceRow }) {
  const allComplete =
    p.completedMilestones === p.totalMilestones && p.totalMilestones > 0;
  const borderColor = p.hasGaps
    ? "border-amber-500/30"
    : allComplete
      ? "border-green-500/20"
      : "border-blue-500/20";

  return (
    <div
      className={cn(
        "rounded-lg border bg-white/5 p-4 hover:bg-white/[0.07] transition-colors",
        borderColor,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Gate icon */}
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              p.hasGaps
                ? "bg-amber-500/20 text-amber-400"
                : allComplete
                  ? "bg-green-500/20 text-green-400"
                  : "bg-blue-500/20 text-blue-400",
            )}
          >
            {p.hasGaps ? (
              <ShieldAlert className="h-4 w-4" />
            ) : allComplete ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white truncate">
                {p.projectName}
              </span>
              {p.projectStatus && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50 capitalize">
                  {p.projectStatus}
                </span>
              )}
            </div>

            {/* Evidence summary */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-white/50">
                {p.totalMilestones} milestone{p.totalMilestones !== 1 ? "s" : ""}
              </span>
              {p.completedMilestones > 0 && (
                <span className="text-xs text-green-400">
                  {p.completedMilestones} complete
                </span>
              )}
              {p.milestonesPendingEvidence > 0 && (
                <span className="text-xs text-amber-400">
                  {p.milestonesPendingEvidence} need evidence
                </span>
              )}
              {p.milestonesGateOpen > 0 && (
                <span className="text-xs text-blue-400">
                  {p.milestonesGateOpen} gate open
                </span>
              )}
            </div>

            {/* Source summary */}
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
              <FileText className="h-3 w-3" />
              {p.globalSourceCount} source{p.globalSourceCount !== 1 ? "s" : ""}
              {p.globalSourceCount > 0 && (
                <>
                  &bull;
                  <span
                    className={cn(
                      p.globalProcessedSourceCount > 0
                        ? "text-green-400/80"
                        : "text-amber-400/80",
                    )}
                  >
                    {p.globalProcessedSourceCount} processed
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/engine/projects/$projectId/evidence"
          params={{ projectId: p.projectId }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Evidence &amp; QA
        </Link>
      </div>

      {/* Gap bar */}
      {p.hasGaps && (
        <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            <span className="font-medium">
              {p.milestonesPendingEvidence} milestone{
                p.milestonesPendingEvidence > 1 ? "s" : ""
              } blocked.
            </span>{" "}
            Upload and process evidence sources before these milestones can be
            marked complete.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function EvidenceEnforcementPage() {
  const loadReport = useServerFn(getWorkspaceEvidenceReport);

  const reportQ = useQuery({
    queryKey: ["admin", "evidence-enforcement", "report"],
    queryFn: () => loadReport(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const report = reportQ.data;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-400 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5" /> Enforcement
        </div>
        <h1 className="text-2xl mt-2">Evidence Enforcement</h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Cross-project evidence gate status. A milestone cannot be marked complete
          without at least one processed evidence source. Projects with gaps are
          surfaced here for operator action.
        </p>
      </header>

      {/* Rule callout */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm text-amber-300">
          <span className="font-semibold">Product law — </span>
          Evidence is not optional. A milestone is done when there is proof it is
          done, not when an operator says so. This page shows every project where
          that contract is at risk.
        </div>
      </div>

      {/* Loading */}
      {reportQ.isLoading && (
        <div className="flex items-center gap-2 text-white/70 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading evidence report across all projects…
        </div>
      )}

      {/* Error */}
      {reportQ.isError && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Failed to load report. {(reportQ.error as Error)?.message}
        </div>
      )}

      {report && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
            <StatCard
              label="Total projects"
              value={report.totalProjects}
              color="text-white"
            />
            <StatCard
              label="Milestones with gaps"
              value={report.totalMilestonesWithGaps}
              color={
                report.totalMilestonesWithGaps > 0
                  ? "text-amber-400"
                  : "text-green-400"
              }
              sub={`of ${report.totalMilestones} total`}
            />
            <StatCard
              label="Projects needing attention"
              value={report.projectsWithGaps.length}
              color={
                report.projectsWithGaps.length > 0
                  ? "text-amber-400"
                  : "text-green-400"
              }
            />
            <StatCard
              label="Sources processed"
              value={report.totalProcessedSources}
              color={
                report.totalProcessedSources > 0
                  ? "text-green-400"
                  : "text-white/60"
              }
              sub={`of ${report.totalSources} total`}
            />
          </div>

          {/* All clear */}
          {report.projectsWithGaps.length === 0 &&
            report.totalProjects > 0 && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4">
                <ShieldCheck className="h-5 w-5 text-green-400" />
                <div>
                  <div className="font-medium text-green-300">
                    All projects clear
                  </div>
                  <div className="text-xs text-green-400/70 mt-0.5">
                    Every active milestone either has sufficient evidence or is
                    already complete.
                  </div>
                </div>
              </div>
            )}

          {/* Projects with gaps */}
          {report.projectsWithGaps.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">
                  Needs attention
                  <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300">
                    {report.projectsWithGaps.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-3">
                {report.projectsWithGaps.map((p) => (
                  <ProjectCard key={p.projectId} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Projects clear */}
          {report.projectsClear.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">
                  Evidence ready
                  <span className="ml-2 rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] text-blue-300">
                    {report.projectsClear.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-3">
                {report.projectsClear.map((p) => (
                  <ProjectCard key={p.projectId} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Projects with no milestones */}
          {report.projectsEmpty.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Circle className="w-4 h-4 text-white/30" />
                <h2 className="text-sm font-semibold text-white/50">
                  No milestones yet
                  <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40">
                    {report.projectsEmpty.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-2">
                {report.projectsEmpty.map((p) => (
                  <div
                    key={p.projectId}
                    className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-4 py-2.5"
                  >
                    <div>
                      <span className="text-sm text-white/60">{p.projectName}</span>
                      {p.projectStatus && (
                        <span className="ml-2 text-[10px] text-white/30 capitalize">
                          {p.projectStatus}
                        </span>
                      )}
                    </div>
                    <Link
                      to="/engine/projects/$projectId/evidence"
                      params={{ projectId: p.projectId }}
                      className="text-xs text-white/30 hover:text-white/70 transition-colors"
                    >
                      View →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty workspace */}
          {report.totalProjects === 0 && (
            <div className="rounded border border-white/10 bg-white/5 p-8 text-center text-white/50 text-sm">
              No projects found in this workspace.
            </div>
          )}

          {/* Footer */}
          <div className="mt-2 text-[11px] text-white/30">
            Report generated {fmt(report.generatedAt)}
          </div>
        </>
      )}
    </div>
  );
}
