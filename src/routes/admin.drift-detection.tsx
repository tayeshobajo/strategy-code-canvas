/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 11C — Drift Detection Admin Page
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getWorkspaceDriftReport } from "@/lib/engine-drift-detection.functions";
import type { DriftSignal, DriftSeverity } from "@/lib/engine-drift-detection.functions";
import { getDriftCausalityReport } from "@/lib/engine-drift-causality.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldCheck, RefreshCw, GitMerge, Info, GitFork } from "lucide-react";

export const Route = createFileRoute("/admin/drift-detection")({});

const SEVERITY_COLOR: Record<DriftSeverity, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const SEVERITY_DOT: Record<DriftSeverity, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-blue-400",
};

function SeverityBadge({ severity }: { severity: DriftSeverity }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLOR[severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function SignalCard({ signal }: { signal: DriftSignal }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white leading-snug">{signal.title}</div>
            <div className="text-xs text-white/50 mt-0.5">{signal.projectName}</div>
          </div>
        </div>
        <SeverityBadge severity={signal.severity} />
      </div>
      <p className="text-xs text-white/60 leading-relaxed">{signal.detail}</p>
      <div className="flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-300/80 leading-relaxed">{signal.resolution}</p>
      </div>
      <div className="pt-1">
        <Link
          to={signal.actionPath}
          className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          {signal.actionLabel} →
        </Link>
      </div>
    </div>
  );
}

function DriftScorePill({ score }: { score: number }) {
  const color = score >= 75 ? "text-red-400" : score >= 40 ? "text-orange-400" : score >= 15 ? "text-yellow-400" : "text-emerald-400";
  return <span className={`text-lg font-bold ${color}`}>{score}</span>;
}

export default function DriftDetectionPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["workspace-drift-report"],
    queryFn: () => getWorkspaceDriftReport(),
    staleTime: 2 * 60 * 1000, // 2 min
    refetchOnWindowFocus: false,
  });

  const lastUpdated = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-semibold text-white">Drift Detection</h1>
          </div>
          <p className="text-sm text-white/50 mt-1">
            Continuous comparison of each project's live state against its approved Spine.
            Drift is signal — not failure. Humans decide whether to absorb or revert.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lastUpdated && (
            <span className="text-xs text-white/40">Updated {lastUpdated}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-white/60 hover:text-white border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-white/50 text-sm py-12 text-center">Scanning projects for drift...</div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Failed to load drift report. Check your connection and try again.
        </div>
      )}

      {data && (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Projects scanned",  value: data.totalProjects, color: "text-white" },
              { label: "Drifting",           value: data.affectedProjectCount, color: "text-yellow-400" },
              { label: "Critical signals",   value: data.criticalCount, color: "text-red-400" },
              { label: "High signals",       value: data.highCount, color: "text-orange-400" },
              { label: "Aligned",            value: data.alignedProjectCount, color: "text-emerald-400" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/10 bg-white/5 p-3 text-center"
              >
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* All clear */}
          {data.signals.length === 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-medium text-emerald-300">All projects aligned</div>
                <div className="text-xs text-emerald-400/60 mt-0.5">
                  {data.totalProjects} project{data.totalProjects !== 1 ? "s" : ""} scanned —
                  no drift detected against approved Spines.
                </div>
              </div>
            </div>
          )}

          {/* By-project detail */}
          {data.byProject.length > 0 && (
            <div className="space-y-6">
              {data.byProject.map((group) => (
                <div
                  key={group.projectId}
                  className="rounded-xl border border-white/10 bg-white/3 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          SEVERITY_DOT[group.worstSeverity]
                        }`}
                      />
                      <span className="text-sm font-medium text-white truncate">
                        {group.projectName}
                      </span>
                      {group.projectStatus && (
                        <span className="text-xs text-white/40 capitalize shrink-0">
                          {group.projectStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-white/40">Drift score:</span>
                      <DriftScorePill score={group.driftScore} />
                      <SeverityBadge severity={group.worstSeverity} />
                    </div>
                  </div>
                  <div className="p-4 grid gap-3 sm:grid-cols-2">
                    {group.signals.map((signal) => (
                      <SignalCard key={signal.id} signal={signal} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Flat signal list (all signals) */}
          {data.signals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">
                All Signals ({data.signals.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.signals.map((signal) => (
                  <SignalCard key={signal.id} signal={signal} />
                ))}
              </div>
            </div>
          )}

          <CausalitySection />
        </>
      )}
    </div>
  );
}

function CausalitySection() {
  const { data, isLoading } = useQuery({
    queryKey: ["workspace-drift-causality"],
    queryFn: () => getDriftCausalityReport(),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <GitFork className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-medium text-white/70 uppercase tracking-wider">
          Root-Cause Clusters
        </h2>
      </div>
      <p className="text-xs text-white/40 -mt-1">
        Groups drift + open review items by shared project entity. Root cause = highest-severity node with no upstream signal.
      </p>

      {isLoading && <div className="text-xs text-white/40">Building causal graph…</div>}

      {data && data.clusters.length === 0 && (
        <div className="text-xs text-white/40">No causal clusters — either aligned or too few signals to link.</div>
      )}

      {data && data.clusters.map((cluster) => (
        <div key={cluster.projectId} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white font-medium">{cluster.projectName}</div>
            <div className="text-[10px] text-white/40">
              {cluster.nodes.length} nodes · {cluster.edges.length} edges
            </div>
          </div>
          <div className="text-xs text-amber-300/90">{cluster.explanation}</div>
          {cluster.edges.length > 0 && (
            <ul className="text-[11px] text-white/60 space-y-1 pl-3 border-l border-white/10">
              {cluster.edges.slice(0, 6).map((e, i) => {
                const from = cluster.nodes.find((n) => n.id === e.from);
                const to = cluster.nodes.find((n) => n.id === e.to);
                return (
                  <li key={i}>
                    <span className="text-white/80">{from?.label ?? e.from}</span>
                    <span className="text-white/30"> → </span>
                    <span className="text-white/80">{to?.label ?? e.to}</span>
                    <span className="text-white/40"> · {e.reason}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
