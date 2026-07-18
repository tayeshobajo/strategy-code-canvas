import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GitPullRequest, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  listRoadmapAmendments,
  type RoadmapAmendment,
} from "@/lib/engine-roadmap-amendments.functions";

/**
 * Compact panel showing the newest materiality-scan amendment candidates
 * for a project. Deep-links to the full amendments inbox.
 */
export function LatestAmendmentsPanel({ projectId, limit = 5 }: { projectId: string; limit?: number }) {
  const list = useServerFn(listRoadmapAmendments);
  const query = useQuery({
    queryKey: ["amendments", projectId, "all"],
    queryFn: () => list({ data: { projectId, status: "all" } }),
    staleTime: 30_000,
  });

  const rows = ((query.data as RoadmapAmendment[] | undefined) ?? []).slice(0, limit);
  const pendingCount = ((query.data as RoadmapAmendment[] | undefined) ?? []).filter(
    (a) => a.status === "pending",
  ).length;

  return (
    <section
      className="rounded-xl border border-[#E4E9F2] bg-white p-4 shadow-sm"
      aria-labelledby="latest-amendments-heading"
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-[#3E68B2]" />
          <h3 id="latest-amendments-heading" className="text-sm font-semibold text-[#0A0F1F]">
            Latest amendments
          </h3>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {pendingCount} pending
            </span>
          ) : null}
        </div>
        <Link
          to="/engine/projects/$projectId/amendments"
          params={{ projectId }}
          className="text-[11px] text-[#3E68B2] hover:underline"
        >
          Open inbox →
        </Link>
      </header>

      {query.isLoading ? (
        <div className="py-3 text-xs text-[#667085]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#E4E9F2] px-3 py-4 text-center text-xs text-[#667085]">
          No amendments yet. Materiality scans will queue them here when new intelligence
          affects approved truth.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const StatusIcon = iconFor(a.status);
            const p = a.payload;
            return (
              <li key={a.id} className="rounded-md border border-[#EEF1F6] px-3 py-2">
                <Link
                  to="/engine/projects/$projectId/amendments"
                  params={{ projectId }}
                  className="block hover:opacity-90"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon className={"h-3.5 w-3.5 " + statusColor(a.status)} />
                    <span className="rounded bg-[#F1F4FA] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#475467]">
                      {p.target?.spine ?? "—"}
                    </span>
                    <span className="truncate text-[11px] text-[#475467]">
                      {p.target?.fieldKey ?? "—"}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-[#98A2B3]">
                      {a.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#0A0F1F]">{p.rationale}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[#667085]">
                    <span>{p.impact ?? a.materiality ?? "material"}</span>
                    <span>·</span>
                    <span>{formatDate(a.createdAt)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function iconFor(status: RoadmapAmendment["status"]) {
  if (status === "approved") return CheckCircle2;
  if (status === "rejected") return XCircle;
  if (status === "superseded") return AlertTriangle;
  return Clock;
}
function statusColor(status: RoadmapAmendment["status"]) {
  if (status === "approved") return "text-emerald-600";
  if (status === "rejected") return "text-red-600";
  if (status === "superseded") return "text-amber-600";
  return "text-[#3E68B2]";
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
