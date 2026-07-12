/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 5B — Admin Roadmap Intelligence View
//
// Cross-project milestone intelligence dashboard.
// Shows completeness scores, evidence gaps, and risk signals
// for all active projects in one view.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getProjectMilestoneIntelligenceSummary } from "@/lib/engine-milestone-intelligence.functions";
import type { MilestoneRiskLevel } from "@/lib/engine-milestone-intelligence.functions";
import { Brain, RefreshCw, ShieldCheck, FileSearch, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/roadmap-intelligence")({});

const RISK_DOT: Record<MilestoneRiskLevel, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-yellow-500",
  low:      "bg-blue-400",
  none:     "bg-white/20",
};

const SCORE_COLOR = (score: number) =>
  score >= 70 ? "text-emerald-400" :
  score >= 40 ? "text-yellow-400" :
  "text-red-400";

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
      <span className={`text-xs font-bold w-8 text-right ${SCORE_COLOR(score)}`}>{score}%</span>
    </div>
  );
}

function ProjectMilestoneIntelligenceCard({ projectId }: { projectId: string }) {
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

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
        <div>
          <div className="text-sm font-medium text-white">{data.projectName}</div>
          <div className="text-xs text-white/40 mt-0.5">
            {data.totalMilestones} milestone{data.totalMilestones !== 1 ? "s" : ""}
            {" · "}{data.withEvidence} with evidence
            {" · "}{data.withRisks} with risks
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-white/30">Avg intelligence</div>
          <div className={`text-lg font-bold ${SCORE_COLOR(data.avgCompleteness)}`}>
            {data.avgCompleteness}%
          </div>
        </div>
      </div>

      {data.milestones.length === 0 ? (
        <div className="px-4 py-3 text-xs text-white/30">No milestones defined.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {data.milestones.map((ms) => (
            <div key={ms.milestoneId} className="flex items-center gap-3 px-4 py-2">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${RISK_DOT[ms.worstRiskLevel]}`}
                title={`Risk: ${ms.worstRiskLevel}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/70 truncate">{ms.milestoneName}</div>
                {ms.phase && (
                  <div className="text-[10px] text-white/30 truncate">{ms.phase}</div>
                )}
              </div>
              <div className="w-32 shrink-0">
                <ScoreBar score={ms.completenessScore} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!ms.hasEvidence && (
                  <FileSearch className="w-3.5 h-3.5 text-red-400" title="No evidence" />
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
              <Link
                to={`/engine/projects/${projectId}`}
                className="text-xs text-amber-400/60 hover:text-amber-400 shrink-0"
              >
                View →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// We need the project list. Read from engine_projects via the admin surface.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function RoadmapIntelligencePage() {
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

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
        setLoading(false);
      });
  }, [tick]);

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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setTick((t) => t + 1)}
          disabled={loading}
          className="text-white/60 hover:text-white border border-white/10 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
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

      {/* Project cards */}
      {!loading && projectIds.length > 0 && (
        <div className="space-y-4">
          {projectIds.map((id) => (
            <ProjectMilestoneIntelligenceCard key={id} projectId={id} />
          ))}
        </div>
      )}
    </div>
  );
}
