import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getExceptionBoard,
  type ProjectException,
  type ExceptionSeverity,
  type ExceptionKind,
} from "@/lib/engine-exception-management.functions";
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const Route = createFileRoute("/admin/exception-management")({
  head: () => ({
    meta: [
      { title: "Exception Management — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExceptionManagementPage,
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

const SEVERITY_CONFIG: Record<
  ExceptionSeverity,
  { label: string; color: string; bg: string; border: string; icon: typeof AlertOctagon }
> = {
  critical: {
    label: "Critical",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    icon: AlertOctagon,
  },
  high: {
    label: "High",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: AlertTriangle,
  },
  medium: {
    label: "Medium",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    icon: AlertTriangle,
  },
  low: {
    label: "Low",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    icon: Info,
  },
};

const KIND_LABELS: Record<ExceptionKind, string> = {
  project_stalled: "Stalled project",
  packets_rejected: "Packets rejected",
  open_decisions: "Open decisions",
  evidence_gap: "Evidence gap",
  qa_stuck: "QA stuck",
  low_health_score: "Low health score",
  ack_overdue: "Ack overdue",
  packets_idle: "Idle packets",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-4">
      <div className={cn("text-2xl font-semibold", color ?? "text-white")}>{value}</div>
      <div className="mt-0.5 text-xs text-white/60">{label}</div>
      {sub && <div className="mt-1 text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: ExceptionSeverity }) {
  const cfg = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
        cfg.color,
        cfg.bg,
        cfg.border,
      )}
    >
      {cfg.label}
    </span>
  );
}

function ExceptionRow({ ex }: { ex: ProjectException }) {
  const cfg = SEVERITY_CONFIG[ex.severity];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        "rounded-lg border bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]",
        cfg.border,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              cfg.bg,
              cfg.color,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <SeverityBadge severity={ex.severity} />
              <span className="text-[10px] text-white/40 uppercase tracking-wider">
                {KIND_LABELS[ex.kind]}
              </span>
            </div>
            <p className="text-sm font-medium text-white">{ex.title}</p>
            <p className="mt-1 text-xs text-white/55 leading-relaxed">{ex.detail}</p>
            {ex.triggeredAt && (
              <p className="mt-1.5 text-[10px] text-white/30">
                Since {fmt(ex.triggeredAt)}
              </p>
            )}
          </div>
        </div>
        <Link
          to={ex.actionPath as never}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          {ex.actionLabel}
        </Link>
      </div>
    </div>
  );
}

function ProjectExceptionGroup({
  group,
}: {
  group: {
    projectId: string;
    projectName: string;
    projectStatus: string | null;
    exceptions: ProjectException[];
    worstSeverity: ExceptionSeverity;
  };
}) {
  const [open, setOpen] = useState(true);
  const cfg = SEVERITY_CONFIG[group.worstSeverity];
  const Icon = cfg.icon;

  return (
    <div className={cn("rounded-lg border bg-white/[0.02]", cfg.border)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded",
              cfg.bg,
              cfg.color,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <span className="font-medium text-white truncate">
              {group.projectName}
            </span>
            {group.projectStatus && (
              <span className="ml-2 text-[10px] text-white/40 capitalize">
                {group.projectStatus.replace(/_/g, " ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              cfg.bg,
              cfg.color,
            )}
          >
            {group.exceptions.length} exception{group.exceptions.length > 1 ? "s" : ""}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-white/40" />
          ) : (
            <ChevronRight className="h-4 w-4 text-white/40" />
          )}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {group.exceptions.map((ex) => (
            <ExceptionRow key={ex.id} ex={ex} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ExceptionManagementPage() {
  const loadBoard = useServerFn(getExceptionBoard);
  const [view, setView] = useState<"by-exception" | "by-project">("by-project");

  const boardQ = useQuery({
    queryKey: ["admin", "exception-management", "board"],
    queryFn: () => loadBoard(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const board = boardQ.data;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-400 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" /> Operator
        </div>
        <h1 className="text-2xl mt-2">Exception Management</h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Only what needs your attention. Projects running cleanly are invisible here.
          A blank board means the platform is working.
        </p>
      </header>

      {/* Product law callout */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div className="text-sm text-blue-300">
          <span className="font-semibold">Operator principle — </span>
          Silence is signal. If a project doesn't appear here, it's on track.
          Exceptions surface automatically — no manual flagging required.
          Use this board as your daily driver, not the full project list.
        </div>
      </div>

      {/* Loading */}
      {boardQ.isLoading && (
        <div className="flex items-center gap-2 text-white/70 py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scanning all projects for exceptions…
        </div>
      )}

      {/* Error */}
      {boardQ.isError && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          Failed to load exception board. {(boardQ.error as Error)?.message}
        </div>
      )}

      {board && (
        <>
          {/* Stats strip */}
          <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
            <StatCard
              label="Active projects scanned"
              value={board.totalProjects}
              color="text-white"
            />
            <StatCard
              label="Needing attention"
              value={board.affectedProjectCount}
              color={
                board.affectedProjectCount > 0 ? "text-amber-400" : "text-green-400"
              }
              sub={`of ${board.totalProjects} active`}
            />
            <StatCard
              label="Critical"
              value={board.criticalCount}
              color={board.criticalCount > 0 ? "text-rose-400" : "text-white/40"}
            />
            <StatCard
              label="Clear — no exceptions"
              value={board.clearProjectCount}
              color={
                board.clearProjectCount === board.totalProjects
                  ? "text-green-400"
                  : "text-white"
              }
            />
          </div>

          {/* High-level severity strip */}
          {board.exceptions.length > 0 && (
            <div className="mb-6 grid grid-cols-4 gap-2">
              {(
                [
                  { severity: "critical" as const, count: board.criticalCount },
                  { severity: "high" as const, count: board.highCount },
                  { severity: "medium" as const, count: board.mediumCount },
                  { severity: "low" as const, count: board.lowCount },
                ] as const
              ).map(({ severity, count }) => {
                if (count === 0) return null;
                const cfg = SEVERITY_CONFIG[severity];
                const Icon = cfg.icon;
                return (
                  <div
                    key={severity}
                    className={cn(
                      "flex items-center gap-2 rounded border px-3 py-2",
                      cfg.border,
                      cfg.bg,
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.color)} />
                    <span className={cn("text-sm font-semibold", cfg.color)}>
                      {count}
                    </span>
                    <span className="text-[11px] text-white/50">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* All clear */}
          {board.exceptions.length === 0 && board.totalProjects > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-5 py-6">
              <CheckCircle2 className="h-6 w-6 text-green-400 shrink-0" />
              <div>
                <div className="font-semibold text-green-300 text-lg">
                  All {board.totalProjects} active project{board.totalProjects !== 1 ? "s" : ""} are on track
                </div>
                <div className="text-sm text-green-400/60 mt-0.5">
                  No exceptions detected. Come back when something needs your attention.
                </div>
              </div>
            </div>
          )}

          {/* Empty workspace */}
          {board.totalProjects === 0 && (
            <div className="rounded border border-white/10 bg-white/5 p-8 text-center text-white/50 text-sm">
              No active projects found in this workspace.
            </div>
          )}

          {/* Exception board */}
          {board.exceptions.length > 0 && (
            <>
              {/* View toggle */}
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setView("by-project")}
                  className={cn(
                    "rounded border px-3 py-1.5 text-xs transition-colors",
                    view === "by-project"
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 text-white/50 hover:bg-white/5",
                  )}
                >
                  By project
                </button>
                <button
                  type="button"
                  onClick={() => setView("by-exception")}
                  className={cn(
                    "rounded border px-3 py-1.5 text-xs transition-colors",
                    view === "by-exception"
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/10 text-white/50 hover:bg-white/5",
                  )}
                >
                  By exception type
                </button>
              </div>

              {/* By project view */}
              {view === "by-project" && (
                <div className="space-y-3">
                  {board.byProject.map((group) => (
                    <ProjectExceptionGroup key={group.projectId} group={group} />
                  ))}
                </div>
              )}

              {/* By exception view */}
              {view === "by-exception" && (
                <div className="space-y-3">
                  {([
                    "critical",
                    "high",
                    "medium",
                    "low",
                  ] as const).map((sev) => {
                    const sevExceptions = board.exceptions.filter(
                      (e) => e.severity === sev,
                    );
                    if (sevExceptions.length === 0) return null;
                    const cfg = SEVERITY_CONFIG[sev];
                    const Icon = cfg.icon;
                    return (
                      <section key={sev}>
                        <div className="mb-2 flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", cfg.color)} />
                          <h2 className="text-sm font-semibold text-white">
                            {cfg.label}
                            <span
                              className={cn(
                                "ml-2 rounded-full px-2 py-0.5 text-[11px]",
                                cfg.bg,
                                cfg.color,
                              )}
                            >
                              {sevExceptions.length}
                            </span>
                          </h2>
                        </div>
                        <div className="space-y-2">
                          {sevExceptions.map((ex) => (
                            <div key={ex.id} className="pl-1">
                              <div className="mb-1 text-[10px] text-white/30 font-mono pl-3">
                                {ex.projectName}
                              </div>
                              <ExceptionRow ex={ex} />
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-6 text-[11px] text-white/30">
            Board generated {fmt(board.generatedAt)} · Exceptions auto-detected from live
            project data · Refresh to update
          </div>
        </>
      )}
    </div>
  );
}
