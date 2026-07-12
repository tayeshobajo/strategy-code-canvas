/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 5B — Admin Roadmap Intelligence View
//
// Cross-project milestone intelligence dashboard.
// Every milestone explains itself — WHY it exists, WHERE the evidence is,
// WHAT the risks are, WHO/WHAT depends on it.
//
// Operators can:
//   • See completeness scores for all milestones across all active projects
//   • Filter to low-intelligence milestones (score < 40)
//   • Expand any milestone to see the full intelligence card inline
//   • Link directly to the project intelligence layer to add more sources

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getProjectMilestoneIntelligenceSummary,
  getMilestoneIntelligence,
} from "@/lib/engine-milestone-intelligence.functions";
import type {
  MilestoneRiskLevel,
  MilestoneIntelligenceCard,
  ProjectMilestoneIntelligenceSummary,
} from "@/lib/engine-milestone-intelligence.functions";
import {
  Brain,
  RefreshCw,
  ShieldCheck,
  FileSearch,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Filter,
  Loader2,
  Info,
  GitBranch,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/roadmap-intelligence")({});

// ── Colour helpers ──────────────────────────────────────────────────────────

const RISK_DOT: Record<MilestoneRiskLevel, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-blue-400",
  none:     "bg-white/20",
};

const RISK_BADGE: Record<MilestoneRiskLevel, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
  none:     "bg-white/10 text-white/40 border-white/10",
};

const SCORE_COLOR = (score: number) =>
  score >= 70 ? "text-emerald-400" :
  score >= 40 ? "text-yellow-400" :
  "text-red-400";

const SPINE_ALIGN_COLOR = (a: string) =>
  a === "direct" ? "text-emerald-400" :
  a === "indirect" ? "text-yellow-400" : "text-red-400";

// ── Score bar ───────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/10">
        <div
          className={`h-1 rounded-full ${
            score >= 70 ? "bg-emerald-500" :
            score >= 40 ? "bg-yellow-500" : "bg-red-500"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${SCORE_COLOR(score)}`}>
        {score}%
      </span>
    </div>
  );
}

// ── Milestone detail panel (expanded view) ──────────────────────────────────

function MilestoneDetailPanel({
  projectId,
  milestoneId,
}: {
  projectId: string;
  milestoneId: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["milestone-intelligence-card", projectId, milestoneId],
    queryFn: () => getMilestoneIntelligence({ data: { projectId, milestoneId } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="px-4 pb-3 pt-2 flex items-center gap-2 text-xs text-white/40">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading intelligence card...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-4 pb-3 text-xs text-red-400">
        Failed to load milestone intelligence.
      </div>
    );
  }

  const card = data as MilestoneIntelligenceCard;

  return (
    <div className="px-4 pb-4 pt-2 space-y-4 border-t border-white/5 bg-white/[0.02]">

      {/* WHY */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">WHY this milestone exists</div>
        <p className="text-xs text-white/70 leading-relaxed">{card.reasoning}</p>
        {card.businessJustification && (
          <p className="text-xs text-white/50 mt-1 leading-relaxed italic">{card.businessJustification}</p>
        )}
      </div>

      {/* WHERE — evidence */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">
          WHERE is the evidence ({card.evidenceCount})
        </div>
        {card.hasEvidence ? (
          <ul className="space-y-1">
            {card.evidenceSources.slice(0, 4).map((e, i) => (
              <li key={i} className="flex items-start gap-2">
                <FileSearch className="w-3 h-3 text-white/30 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs text-white/60">
                    {e.sourceName ?? "Unnamed source"}
                  </span>
                  {e.snippet && (
                    <span className="text-[10px] text-white/30 ml-2 truncate">
                      — {e.snippet.slice(0, 80)}
                    </span>
                  )}
                  {e.confidence !== null && (
                    <span className="text-[10px] text-white/30 ml-2">
                      ({e.confidence}% confidence)
                    </span>
                  )}
                </div>
              </li>
            ))}
            {card.evidenceSources.length > 4 && (
              <li className="text-[10px] text-white/30">
                +{card.evidenceSources.length - 4} more sources
              </li>
            )}
          </ul>
        ) : (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <FileSearch className="w-3.5 h-3.5 shrink-0" />
            No evidence linked — milestone claims cannot be verified.
          </div>
        )}
      </div>

      {/* WHAT — spine alignment */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">WHAT is the Spine alignment</div>
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-white/30 shrink-0" />
          <span className={`text-xs font-medium ${SPINE_ALIGN_COLOR(card.spineAlignment)}`}>
            {card.spineAlignment.charAt(0).toUpperCase() + card.spineAlignment.slice(1)}
          </span>
          <span className="text-xs text-white/40">{card.spineAlignmentNote}</span>
        </div>
        {(card.spinePointA || card.spinePointB) && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {card.spinePointA && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Point A (from)</div>
                <div className="text-xs text-white/60 leading-snug">
                  {card.spinePointA.slice(0, 120)}
                  {card.spinePointA.length > 120 ? "..." : ""}
                </div>
              </div>
            )}
            {card.spinePointB && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Point B (to)</div>
                <div className="text-xs text-white/60 leading-snug">
                  {card.spinePointB.slice(0, 120)}
                  {card.spinePointB.length > 120 ? "..." : ""}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RISKS */}
      {card.risks.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">
            RISKS ({card.risks.length})
          </div>
          <ul className="space-y-1.5">
            {card.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <AlertTriangle
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    r.level === "critical" ? "text-red-400" :
                    r.level === "high" ? "text-orange-400" :
                    r.level === "medium" ? "text-yellow-400" : "text-blue-400"
                  }`}
                />
                <div className="min-w-0">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border mr-1.5 ${
                      RISK_BADGE[r.level]
                    }`}
                  >
                    {r.level}
                  </span>
                  <span className="text-xs text-white/60">{r.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WHO/WHAT depends on it */}
      {card.dependencies.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-400/70 mb-1">
            WHO/WHAT depends on it
          </div>
          <ul className="space-y-1">
            {card.dependencies.slice(0, 6).map((d) => (
              <li key={d.milestoneId} className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    d.kind === "blocked_by"
                      ? "bg-orange-500/20 text-orange-300 border-orange-500/30"
                      : d.kind === "blocks"
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                      : "bg-white/10 text-white/40 border-white/10"
                  }`}
                >
                  {d.kind === "blocked_by" ? "blocked by" :
                   d.kind === "blocks" ? "blocks" : "related"}
                </span>
                <span className="text-xs text-white/60 truncate">{d.milestoneName}</span>
                {d.status && (
                  <span className="text-[10px] text-white/30 shrink-0 capitalize">{d.status}</span>
                )}
              </li>
            ))}
            {card.dependencies.length > 6 && (
              <li className="text-[10px] text-white/30">
                +{card.dependencies.length - 6} more dependencies
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Footer: intelligence layer link */}
      <div className="pt-1 flex items-center gap-3">
        <Link
          to={`/engine/projects/${projectId}/intelligence-layer`}
          className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Open intelligence layer
        </Link>
        <span className="text-white/20">·</span>
        <div className="flex items-center gap-1 text-[10px] text-white/30">
          <Info className="w-3 h-3" />
          Generated {new Date(card.generatedAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

// ── Per-project card ─────────────────────────────────────────────────────────

function ProjectMilestoneIntelligenceCard({
  projectId,
  filterLow,
}: {
  projectId: string;
  filterLow: boolean;
}) {
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-milestone-intelligence", projectId],
    queryFn: () => getProjectMilestoneIntelligenceSummary({ data: { projectId } }),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
        <div className="h-4 w-1/3 bg-white/10 rounded mb-2" />
        <div className="h-3 w-1/4 bg-white/5 rounded" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-red-400">Failed to load intelligence for this project.</p>
      </div>
    );
  }

  const summary = data as ProjectMilestoneIntelligenceSummary;
  const milestones = filterLow
    ? summary.milestones.filter((ms) => ms.completenessScore < 40)
    : summary.milestones;

  // Hide card entirely if filtering and project has no low-intelligence milestones
  if (filterLow && milestones.length === 0) return null;

  const toggleMilestone = (id: string) =>
    setExpandedMilestone((prev) => (prev === id ? null : id));

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Project header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
        <div>
          <div className="text-sm font-medium text-white">{summary.projectName}</div>
          <div className="text-xs text-white/40 mt-0.5">
            {summary.totalMilestones} milestone{summary.totalMilestones !== 1 ? "s" : ""}
            {" · "}{summary.withEvidence} with evidence
            {" · "}{summary.withRisks} with risks
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs text-white/30">Avg intelligence</div>
            <div className={`text-lg font-bold ${SCORE_COLOR(summary.avgCompleteness)}`}>
              {summary.avgCompleteness}%
            </div>
          </div>
          <Link
            to={`/engine/projects/${projectId}/intelligence-layer`}
            className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-amber-400 transition-colors border border-white/10 rounded px-2 py-1"
            title="Open intelligence layer"
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Milestone rows */}
      {milestones.length === 0 ? (
        <div className="px-4 py-3 text-xs text-white/30">No milestones defined.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {milestones.map((ms) => {
            const isExpanded = expandedMilestone === ms.milestoneId;
            return (
              <div key={ms.milestoneId}>
                {/* Row */}
                <button
                  type="button"
                  onClick={() => toggleMilestone(ms.milestoneId)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors"
                >
                  {/* Expand toggle */}
                  <span className="text-white/30 shrink-0">
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>

                  {/* Risk dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${RISK_DOT[ms.worstRiskLevel]}`}
                    title={`Risk: ${ms.worstRiskLevel}`}
                  />

                  {/* Name + phase */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/70 truncate">{ms.milestoneName}</div>
                    {ms.phase && (
                      <div className="text-[10px] text-white/30 truncate">{ms.phase}</div>
                    )}
                  </div>

                  {/* Score bar */}
                  <div className="w-32 shrink-0">
                    <ScoreBar score={ms.completenessScore} />
                  </div>

                  {/* Signal icons */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!ms.hasEvidence && (
                      <FileSearch
                        className="w-3.5 h-3.5 text-red-400"
                        title="No evidence"
                      />
                    )}
                    {ms.worstRiskLevel !== "none" && (
                      <AlertTriangle
                        className={`w-3.5 h-3.5 ${
                          ms.worstRiskLevel === "critical" ? "text-red-400" :
                          ms.worstRiskLevel === "high" ? "text-orange-400" :
                          "text-yellow-400"
                        }`}
                        title={`Risk: ${ms.worstRiskLevel}`}
                      />
                    )}
                  </div>
                </button>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <MilestoneDetailPanel
                    projectId={projectId}
                    milestoneId={ms.milestoneId}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Workspace summary bar (aggregate stats across all projects) ─────────────

function WorkspaceSummaryBar({
  summaries,
}: {
  summaries: ProjectMilestoneIntelligenceSummary[];
}) {
  const totalMilestones = summaries.reduce((a, s) => a + s.totalMilestones, 0);
  const withEvidence = summaries.reduce((a, s) => a + s.withEvidence, 0);
  const withRisks = summaries.reduce((a, s) => a + s.withRisks, 0);
  const avgScore =
    summaries.length > 0
      ? Math.round(
          summaries.reduce((a, s) => a + s.avgCompleteness, 0) / summaries.length,
        )
      : 0;
  const lowIntelligence = summaries.reduce(
    (a, s) => a + s.milestones.filter((m) => m.completenessScore < 40).length,
    0,
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "Projects",        value: summaries.length,  color: "text-white" },
        { label: "Total milestones", value: totalMilestones,   color: "text-white" },
        { label: "With evidence",   value: withEvidence,       color: "text-emerald-400" },
        { label: "With risks",      value: withRisks,          color: "text-yellow-400" },
        { label: "Low intelligence",value: lowIntelligence,    color: "text-red-400" },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-white/10 bg-white/5 p-3 text-center"
        >
          <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
        </div>
      ))}
      {/* Avg score — full width on mobile */}
      <div className="col-span-2 sm:col-span-5 rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-4">
        <div className="text-xs text-white/40">Average intelligence score across all active projects</div>
        <div className={`text-xl font-bold ${SCORE_COLOR(avgScore)}`}>{avgScore}%</div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function RoadmapIntelligencePage() {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [filterLow, setFilterLow] = useState(false);
  const [loadedSummaries, setLoadedSummaries] = useState<ProjectMilestoneIntelligenceSummary[]>([]);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("engine_projects")
      .select("id")
      .not("status", "in", "(\"completed\",\"archived\")")
      .order("last_activity_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setProjectIds((data ?? []).map((r: { id: string }) => r.id));
        setLoadedSummaries([]);
        setLoading(false);
      });
  }, [tick]);

  // Collect loaded summaries for the workspace bar
  const handleSummaryLoaded = (summary: ProjectMilestoneIntelligenceSummary) => {
    setLoadedSummaries((prev) => {
      const existing = prev.find((s) => s.projectId === summary.projectId);
      if (existing) return prev;
      return [...prev, summary];
    });
  };

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-semibold text-white">Roadmap Intelligence</h1>
          </div>
          <p className="text-sm text-white/50 mt-1">
            Every milestone explains itself — WHY it exists, WHERE the evidence is,
            WHAT the risks are, and WHO/WHAT depends on it.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFilterLow((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs border rounded px-2.5 py-1.5 transition-colors ${
              filterLow
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
            }`}
          >
            <Filter className="w-3 h-3" />
            Low intelligence
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTick((t) => t + 1)}
            disabled={loading}
            className="text-white/60 hover:text-white border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-white/40 text-sm text-center py-12">Loading projects...</div>
      )}

      {/* All clear */}
      {!loading && projectIds.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-sm text-emerald-300">No active projects found.</div>
        </div>
      )}

      {/* Workspace summary bar */}
      {!loading && loadedSummaries.length > 0 && (
        <WorkspaceSummaryBar summaries={loadedSummaries} />
      )}

      {/* Project cards */}
      {!loading && projectIds.length > 0 && (
        <div className="space-y-4">
          {projectIds.map((id) => (
            <SummaryCollector
              key={id}
              projectId={id}
              filterLow={filterLow}
              onSummaryLoaded={handleSummaryLoaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Wrapper that collects summary data for the workspace bar
function SummaryCollector({
  projectId,
  filterLow,
  onSummaryLoaded,
}: {
  projectId: string;
  filterLow: boolean;
  onSummaryLoaded: (summary: ProjectMilestoneIntelligenceSummary) => void;
}) {
  const { data } = useQuery({
    queryKey: ["project-milestone-intelligence", projectId],
    queryFn: () => getProjectMilestoneIntelligenceSummary({ data: { projectId } }),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      onSummaryLoaded(data as ProjectMilestoneIntelligenceSummary);
    }
  }, [data, onSummaryLoaded]);

  return (
    <ProjectMilestoneIntelligenceCard
      projectId={projectId}
      filterLow={filterLow}
    />
  );
}
