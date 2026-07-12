import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWorkspaceDeliveryReadinessReport,
  type ProjectDeliveryReadinessRow,
} from "@/lib/engine-delivery-readiness-gate.functions";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  PackageCheck,
  Package,
  PackageX,
  ExternalLink,
  Circle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/delivery-readiness-gate")({
  head: () => ({
    meta: [
      { title: "Delivery Readiness Gate — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeliveryReadinessGatePage,
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

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    accepted: "Accepted",
    draft: "Draft",
    ready: "Ready",
    handed_off: "Handed off",
    in_progress: "In progress",
    returned: "Returned",
    rejected: "Rejected",
    qa_required: "QA required",
    archived: "Archived",
  };
  return map[s] ?? s;
}

function statusColor(s: string): string {
  if (s === "accepted") return "text-green-400";
  if (s === "rejected") return "text-rose-400";
  if (s === "qa_required") return "text-amber-400";
  return "text-white/50";
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

function ProjectCard({ p }: { p: ProjectDeliveryReadinessRow }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/5 p-4 hover:bg-white/[0.07] transition-colors",
        p.gateOpen ? "border-green-500/20" : "border-amber-500/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Gate icon */}
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              p.gateOpen
                ? "bg-green-500/20 text-green-400"
                : "bg-amber-500/20 text-amber-400",
            )}
          >
            {p.gateOpen ? (
              <PackageCheck className="h-4 w-4" />
            ) : (
              <Package className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-white truncate">{p.projectName}</span>
              {p.projectStatus && (
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/50 capitalize">
                  {p.projectStatus.replace(/_/g, " ")}
                </span>
              )}
              {p.hasApprovedReadinessReview && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  Readiness approved
                </span>
              )}
            </div>

            {/* Packet summary */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-white/50">
                {p.totalPackets} packet{p.totalPackets !== 1 ? "s" : ""}
              </span>
              {p.acceptedPackets > 0 && (
                <span className="text-xs text-green-400">
                  {p.acceptedPackets} accepted
                </span>
              )}
              {p.inProgressPackets > 0 && (
                <span className="text-xs text-white/50">
                  {p.inProgressPackets} in progress
                </span>
              )}
              {p.qaRequiredPackets > 0 && (
                <span className="text-xs text-amber-400">
                  {p.qaRequiredPackets} in QA
                </span>
              )}
              {p.rejectedPackets > 0 && (
                <span className="text-xs text-rose-400">
                  {p.rejectedPackets} rejected
                </span>
              )}
            </div>

            {/* Pending packets inline */}
            {p.pendingPackets.length > 0 && (
              <div className="mt-2 space-y-1">
                {p.pendingPackets.slice(0, 5).map((pk) => (
                  <div key={pk.id} className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] text-white/30 font-mono w-4 text-right">
                      {pk.sequence_number}
                    </span>
                    <span className="truncate text-xs text-white/60">{pk.title}</span>
                    <span
                      className={cn(
                        "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        pk.status === "rejected"
                          ? "bg-rose-500/10 text-rose-400"
                          : pk.status === "qa_required"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-white/5 text-white/40",
                      )}
                    >
                      {statusLabel(pk.status)}
                    </span>
                  </div>
                ))}
                {p.pendingPackets.length > 5 && (
                  <div className="text-[10px] text-white/30 pl-6">
                    +{p.pendingPackets.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/engine/projects/$projectId/delivery"
          params={{ projectId: p.projectId }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Delivery
        </Link>
      </div>

      {/* Blocker bar */}
      {!p.gateOpen && p.blockers.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            {p.blockers.join(" · ")}
          </p>
        </div>
      )}

      {/* Ready bar */}
      {p.gateOpen && (
        <div className="mt-3 flex items-center gap-2 rounded border border-green-500/20 bg-green-500/10 px-3 py-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
          <p className="text-xs text-green-300">
            All {p.totalPackets} packet{p.totalPackets !== 1 ? "s" : ""} accepted.
            {p.hasApprovedReadinessReview
              ? " Readiness review approved."
              : " Pending readiness review approval."}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function DeliveryReadinessGatePage() {
  const loadReport = useServerFn(getWorkspaceDeliveryReadinessReport);

  const reportQ = useQuery({
    queryKey: ["admin", "delivery-readiness-gate", "report"],
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
          <PackageCheck className="w-3.5 h-3.5" /> Gate
        </div>
        <h1 className="text-2xl mt-2">Delivery Readiness Gate</h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Cross-project delivery gate status. A project is delivery-ready only when
          every build packet has been accepted. Projects with outstanding packets are
          surfaced here for operator action.
        </p>
      </header>

      {/* Product law callout */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="text-sm text-amber-300">
          <span className="font-semibold">Product law — </span>
          Delivery is not the default. The gate must be opened deliberately. A project
          is ready only when every packet is accepted, every QA review passes, and a
          readiness review is approved. Opening the gate here does NOT deliver,
          publish to portal, or notify the client.
        </div>
      </div>

      {/* Loading */}
      {reportQ.isLoading && (
        <div className="flex items-center gap-2 text-white/70 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading delivery readiness gate across all projects…
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
              label="Ready for delivery"
              value={report.totalReadyProjects}
              color={
                report.totalReadyProjects > 0 ? "text-green-400" : "text-white/50"
              }
              sub={`of ${report.totalProjects} total`}
            />
            <StatCard
              label="Blocked"
              value={report.totalBlockedProjects}
              color={
                report.totalBlockedProjects > 0 ? "text-amber-400" : "text-green-400"
              }
            />
            <StatCard
              label="Packets accepted"
              value={report.totalAcceptedPackets}
              color={
                report.totalAcceptedPackets > 0 ? "text-green-400" : "text-white/50"
              }
              sub={`of ${report.totalPackets} total`}
            />
          </div>

          {/* Blocked projects */}
          {report.projectsBlocked.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">
                  Delivery blocked
                  <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] text-amber-300">
                    {report.projectsBlocked.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-3">
                {report.projectsBlocked.map((p) => (
                  <ProjectCard key={p.projectId} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Ready projects */}
          {report.projectsReady.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <h2 className="text-sm font-semibold text-white">
                  Gate open — ready for delivery
                  <span className="ml-2 rounded-full bg-green-500/20 px-2 py-0.5 text-[11px] text-green-300">
                    {report.projectsReady.length}
                  </span>
                </h2>
              </div>
              <div className="space-y-3">
                {report.projectsReady.map((p) => (
                  <ProjectCard key={p.projectId} p={p} />
                ))}
              </div>
            </section>
          )}

          {/* Empty projects */}
          {report.projectsEmpty.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Circle className="w-4 h-4 text-white/30" />
                <h2 className="text-sm font-semibold text-white/50">
                  No packets yet
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
                          {p.projectStatus.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <Link
                      to="/engine/projects/$projectId/delivery"
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

          {/* All clear */}
          {report.projectsBlocked.length === 0 &&
            report.projectsReady.length > 0 && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-4">
                <PackageCheck className="h-5 w-5 text-green-400" />
                <div>
                  <div className="font-medium text-green-300">
                    All active projects are delivery-ready
                  </div>
                  <div className="text-xs text-green-400/70 mt-0.5">
                    Every packet has been accepted. Human operator must still
                    approve the readiness review and prepare the client-facing package.
                  </div>
                </div>
              </div>
            )}

          {/* Empty workspace */}
          {report.totalProjects === 0 && (
            <div className="rounded border border-white/10 bg-white/5 p-8 text-center text-white/50 text-sm">
              No projects found in this workspace.
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-3">Gate legend</div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
                <span className="text-white/60">Accepted — packet fully accepted by operator</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                <span className="text-white/60">Rejected — needs rework before re-submission</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="text-white/60">QA required — in QA review queue</span>
              </div>
              <div className="flex items-center gap-2">
                <Circle className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <span className="text-white/60">In progress — handed off or being built</span>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-white/30">
              Gate opens when all non-archived packets are accepted. Gate open ≠ delivered.
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 text-[11px] text-white/30">
            Report generated {fmt(report.generatedAt)}
          </div>
        </>
      )}
    </div>
  );
}
