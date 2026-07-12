/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 7B — Plan Depth and Completeness
//
// Cross-project admin view. Shows which projects have sufficient
// planning depth before execution: user journeys, sitemaps, data
// models, acceptance criteria, QA plans, mockup coverage.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getWorkspacePlanDepthReport,
  getProjectPlanDepth,
} from "@/lib/engine-plan-depth.functions";
import type {
  WorkspacePlanDepthReport,
  ProjectPlanDepth,
  PlanDimension,
  PlanDepthLevel,
  PlanDimensionStatus,
} from "@/lib/engine-plan-depth.functions";
import {
  Layers,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

export const Route = createFileRoute("/admin/plan-depth")({});

// ── Colour helpers ──────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<PlanDepthLevel, { badge: string; bar: string; text: string }> = {
  sufficient: {
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    bar:   "bg-emerald-500",
    text:  "text-emerald-400",
  },
  partial: {
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    bar:   "bg-yellow-500",
    text:  "text-yellow-400",
  },
  shallow: {
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
    bar:   "bg-red-500",
    text:  "text-red-400",
  },
};

const STATUS_ICON: Record<PlanDimensionStatus, React.ReactNode> = {
  present: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
  partial: <MinusCircle  className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
  missing: <XCircle      className="w-3.5 h-3.5 text-red-400    shrink-0" />,
};

// ── Depth score bar ─────────────────────────────────────────────────────────

function DepthBar({ score, level }: { score: number; level: PlanDepthLevel }) {
  const colors = LEVEL_COLORS[level];
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/10">
        <div
          className={`h-1.5 rounded-full ${colors.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${colors.text}`}>
        {score}%
      </span>
    </div>
  );
}

// ── Dimension row ───────────────────────────────────────────────────────────

function DimensionRow({ dim }: { dim: PlanDimension }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="mt-0.5">{STATUS_ICON[dim.status]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-white/80">{dim.label}</span>
          <span className="text-[10px] text-white/30 font-mono shrink-0">
            {dim.score}/{dim.weight}pts
          </span>
        </div>
        {dim.detail && (
          <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{dim.detail}</p>
        )}
      </div>
      {dim.actionPath && dim.status !== "present" && (
        <Link
          to={dim.actionPath}
          className="shrink-0 text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors border border-amber-400/20 rounded px-1.5 py-0.5 mt-0.5"
        >
          {dim.actionLabel ?? "Fix"}
        </Link>
      )}
    </div>
  );
}

// ── Project depth card ──────────────────────────────────────────────────────

function ProjectDepthCard({ projectId, filterShallow }: { projectId: string; filterShallow: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["project-plan-depth", projectId],
    queryFn: () => getProjectPlanDepth({ data: { projectId } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
        <div className="h-4 w-1/3 bg-white/10 rounded mb-2" />
        <div className="h-3 w-1/2 bg-white/5 rounded" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-xs text-red-400">Failed to load plan depth for this project.</p>
      </div>
    );
  }

  const depth = data as ProjectPlanDepth;
  const colors = LEVEL_COLORS[depth.depthLevel];

  // When filtering shallow, hide non-shallow projects
  if (filterShallow && depth.depthLevel !== "shallow") return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      {/* Project header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5"
      >
        {/* Expand toggle */}
        <span className="text-white/30 shrink-0">
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </span>

        {/* Project name + step */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{depth.projectName}</div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {depth.currentStep ?? "No step"}
            {" · "}
            {depth.presentCount} of {depth.totalDimensions} dimensions present
            {depth.missingCount > 0 && (
              <span className="text-red-400/80 ml-1">
                · {depth.missingCount} missing
              </span>
            )}
          </div>
        </div>

        {/* Depth level badge */}
        <span
          className={`text-[10px] font-medium px-2 py-1 rounded border capitalize shrink-0 ${
            colors.badge
          }`}
        >
          {depth.depthLevel}
        </span>

        {/* Score bar */}
        <div className="w-28 shrink-0">
          <DepthBar score={depth.depthScore} level={depth.depthLevel} />
        </div>

        {/* External link */}
        <Link
          to={`/engine/projects/${projectId}`}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-white/30 hover:text-amber-400 transition-colors border border-white/10 rounded p-1"
          title="Open project"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </button>

      {/* Expanded dimension breakdown */}
      {expanded && (
        <div className="px-4 py-3 bg-white/[0.02]">
          {/* Blocked reason alert */}
          {depth.blockedReason && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-relaxed">{depth.blockedReason}</p>
            </div>
          )}

          {/* Artifact counts */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: "Mockups",     value: depth.mockupCount },
              { label: "Backend plans",value: depth.backendPlanCount },
              { label: "QA plans",    value: depth.qaPlanCount },
              { label: "Impl plans",  value: depth.implPlanCount },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-center"
              >
                <div className={`text-lg font-bold ${
                  stat.value > 0 ? "text-white" : "text-red-400"
                }`}>{stat.value}</div>
                <div className="text-[10px] text-white/30 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Dimensions */}
          <div>
            {depth.dimensions.map((dim) => (
              <DimensionRow key={dim.id} dim={dim} />
            ))}
          </div>

          {/* Spec coverage note */}
          {depth.implPlanCount > 0 && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-white/30">
              <Info className="w-3.5 h-3.5" />
              {depth.implPlansWithCriteria} of {depth.implPlanCount} implementation
              plan{depth.implPlanCount !== 1 ? "s" : ""} have acceptance criteria defined.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workspace summary bar ───────────────────────────────────────────────────

function WorkspaceSummaryBar({ report }: { report: WorkspacePlanDepthReport }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Sufficient",      value: report.sufficientCount,       color: "text-emerald-400" },
        { label: "Partial",         value: report.partialCount,          color: "text-yellow-400" },
        { label: "Shallow",         value: report.shallowCount,          color: "text-red-400"     },
        { label: "Not exec-ready",  value: report.notReadyForExecution,  color: "text-red-400"     },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-white/10 bg-white/5 p-3 text-center"
        >
          <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
        </div>
      ))}
      {/* Avg score bar — full width */}
      <div className="col-span-2 sm:col-span-4 rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-4">
        <div className="text-xs text-white/40">Average plan depth score across {report.totalProjects} active project{report.totalProjects !== 1 ? "s" : ""}</div>
        <div className={`text-xl font-bold ${
          report.avgDepthScore >= 70 ? "text-emerald-400" :
          report.avgDepthScore >= 40 ? "text-yellow-400" : "text-red-400"
        }`}>{report.avgDepthScore}%</div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PlanDepthPage() {
  const [filterShallow, setFilterShallow] = useState(false);
  const [tick, setTick] = useState(0);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workspace-plan-depth", tick],
    queryFn: () => getWorkspacePlanDepthReport({}),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const report = data as WorkspacePlanDepthReport | undefined;

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-semibold text-white">Plan Depth &amp; Completeness</h1>
          </div>
          <p className="text-sm text-white/50 mt-1">
            Audits each project for user journeys, sitemaps, data models, acceptance
            criteria, QA plans, and mockup coverage. Shallow plans produce shallow
            products.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFilterShallow((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs border rounded px-2.5 py-1.5 transition-colors ${
              filterShallow
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Shallow only
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setTick((t) => t + 1); refetch(); }}
            disabled={isLoading}
            className="text-white/60 hover:text-white border border-white/10"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-white/40 text-sm text-center py-12">Loading plan depth data...</div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-5">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="text-sm text-red-300">Failed to load plan depth report. Refresh to retry.</div>
        </div>
      )}

      {/* No projects */}
      {!isLoading && !isError && report && report.totalProjects === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-sm text-emerald-300">No active projects found.</div>
        </div>
      )}

      {/* Workspace summary */}
      {!isLoading && !isError && report && report.totalProjects > 0 && (
        <WorkspaceSummaryBar report={report} />
      )}

      {/* Depth scale legend */}
      {!isLoading && !isError && report && report.totalProjects > 0 && (
        <div className="flex items-center gap-4 text-xs text-white/30">
          <span className="font-mono uppercase tracking-widest text-[10px]">Depth scale:</span>
          <span className="text-emerald-400">≥ 70% sufficient</span>
          <span className="text-yellow-400">40–69% partial</span>
          <span className="text-red-400">&lt; 40% shallow — do not execute</span>
        </div>
      )}

      {/* Per-project cards */}
      {!isLoading && !isError && report && report.projects.length > 0 && (
        <div className="space-y-3">
          {report.projects.map((proj) => (
            <ProjectDepthCard
              key={proj.projectId}
              projectId={proj.projectId}
              filterShallow={filterShallow}
            />
          ))}
        </div>
      )}

      {/* No shallow results when filter active */}
      {!isLoading && !isError && report && filterShallow && report.shallowCount === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-sm text-emerald-300">
            No shallow projects. Every active project has sufficient or partial planning depth.
          </div>
        </div>
      )}
    </div>
  );
}
