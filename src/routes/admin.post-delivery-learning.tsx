/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 10C — Post-Delivery Learning Loop
//
// Cross-project admin dashboard for outcome surveys and 30/60/90-day
// check-ins. Shows which delivered projects have outstanding check-ins,
// which are overdue, and aggregates satisfaction scores across all
// delivered projects.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPostDeliveryLearningReport,
  recordOutcomeSurvey,
  skipCheckIn,
} from "@/lib/engine-post-delivery-learning.functions";
import type {
  PostDeliveryLearningReport,
  ProjectDeliveryOutcome,
  CheckIn,
  CheckInStatus,
  CheckInWindow,
} from "@/lib/engine-post-delivery-learning.functions";
import {
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  XCircle,
  CalendarDays,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/admin/post-delivery-learning")({});

// ── Colour helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CheckInStatus, { label: string; badge: string; icon: typeof CheckCircle2 }> = {
  complete:  { label: "Complete",  badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  pending:   { label: "Pending",   badge: "bg-white/10 text-white/40 border-white/10",               icon: Clock },
  due:       { label: "Due now",   badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",   icon: CalendarDays },
  overdue:   { label: "Overdue",   badge: "bg-red-500/20 text-red-300 border-red-500/30",            icon: AlertTriangle },
  skipped:   { label: "Skipped",   badge: "bg-white/10 text-white/30 border-white/10",               icon: XCircle },
};

const WINDOW_LABELS: Record<CheckInWindow, string> = {
  "30d": "30-day",
  "60d": "60-day",
  "90d": "90-day",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Star score ──────────────────────────────────────────────────────────────

function SatisfactionScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-white/30 text-xs">—</span>;
  const color = score >= 8 ? "text-emerald-400" : score >= 6 ? "text-yellow-400" : "text-red-400";
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Star className="w-3.5 h-3.5" />
      <span className="text-sm font-bold">{score}</span>
      <span className="text-xs text-white/30">/10</span>
    </div>
  );
}

// ── Survey form (inline) ─────────────────────────────────────────────────────

function SurveyForm({
  projectId,
  window: w,
  onDone,
}: {
  projectId: string;
  window: CheckInWindow;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      recordOutcomeSurvey({
        data: {
          projectId,
          window: w,
          satisfactionScore: score,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["post-delivery-learning"] });
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 space-y-3">
      <div className="text-xs font-medium text-amber-300">
        Record {WINDOW_LABELS[w]} survey outcome
      </div>

      {/* Satisfaction score 1–10 */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/30 mb-2">Satisfaction score (1–10)</div>
        <div className="flex gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(n)}
              className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                score === n
                  ? n >= 8
                    ? "bg-emerald-500 text-white"
                    : n >= 6
                    ? "bg-yellow-500 text-black"
                    : "bg-red-500 text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-white/30 mb-1">Notes (optional)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Client feedback, key outcomes, lessons learned..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-amber-400/40"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="bg-amber-500 hover:bg-amber-400 text-black font-medium text-xs"
        >
          {submit.isPending ? "Saving..." : "Save survey"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          Cancel
        </button>
        {submit.isError && (
          <span className="text-xs text-red-400">Failed to save. Try again.</span>
        )}
      </div>
    </div>
  );
}

// ── Check-in row ─────────────────────────────────────────────────────────────

function CheckInRow({
  checkIn,
  projectId,
}: {
  checkIn: CheckIn;
  projectId: string;
}) {
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const qc = useQueryClient();
  const cfg = STATUS_CONFIG[checkIn.status];
  const Icon = cfg.icon;

  const skipMutation = useMutation({
    mutationFn: (reason?: string) =>
      skipCheckIn({ data: { projectId, window: checkIn.window, reason: reason ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["post-delivery-learning"] }),
  });

  return (
    <div className="py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3">
        <Icon
          className={`w-3.5 h-3.5 shrink-0 ${
            checkIn.status === "complete" ? "text-emerald-400" :
            checkIn.status === "due" ? "text-yellow-400" :
            checkIn.status === "overdue" ? "text-red-400" :
            "text-white/30"
          }`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white/80">{WINDOW_LABELS[checkIn.window]} check-in</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                cfg.badge
              }`}
            >
              {cfg.label}
            </span>
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">
            Due {formatDate(checkIn.dueAt)}
            {checkIn.submittedAt && (
              <span> · Submitted {formatDate(checkIn.submittedAt)}</span>
            )}
          </div>
          {checkIn.notes && (
            <div className="text-[11px] text-white/50 mt-1 leading-relaxed italic">{checkIn.notes}</div>
          )}
        </div>

        {checkIn.satisfactionScore !== null && (
          <SatisfactionScore score={checkIn.satisfactionScore} />
        )}

        {/* Actions */}
        {(checkIn.status === "due" || checkIn.status === "overdue" || checkIn.status === "pending") && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSurveyForm((v) => !v)}
              className="text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors border border-amber-400/20 rounded px-2 py-0.5"
            >
              Record
            </button>
            {checkIn.status !== "pending" && (
              <button
                type="button"
                onClick={() => skipMutation.mutate(undefined)}
                disabled={skipMutation.isPending}
                className="text-[10px] text-white/30 hover:text-white/60 transition-colors border border-white/10 rounded px-2 py-0.5"
              >
                Skip
              </button>
            )}
          </div>
        )}
      </div>

      {showSurveyForm && (
        <SurveyForm
          projectId={projectId}
          window={checkIn.window}
          onDone={() => setShowSurveyForm(false)}
        />
      )}
    </div>
  );
}

// ── Project delivery card ────────────────────────────────────────────────────

function ProjectDeliveryCard({
  outcome,
}: {
  outcome: ProjectDeliveryOutcome;
}) {
  const [expanded, setExpanded] = useState(
    outcome.overdueCheckIns > 0 || outcome.dueCheckIns > 0,
  );

  const urgencyColor =
    outcome.overdueCheckIns > 0 ? "border-red-500/30" :
    outcome.dueCheckIns > 0 ? "border-yellow-500/30" :
    "border-white/10";

  return (
    <div className={`rounded-xl border ${urgencyColor} bg-white/5 overflow-hidden`}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-white/30 shrink-0">
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{outcome.projectName}</div>
          <div className="text-[11px] text-white/40 mt-0.5">
            {outcome.clientName && <span>{outcome.clientName} · </span>}
            Delivered {formatDate(outcome.publishedAt)}
            {outcome.overdueCheckIns > 0 && (
              <span className="text-red-400 ml-2">{outcome.overdueCheckIns} overdue</span>
            )}
            {outcome.dueCheckIns > 0 && outcome.overdueCheckIns === 0 && (
              <span className="text-yellow-400 ml-2">{outcome.dueCheckIns} due</span>
            )}
          </div>
        </div>

        {/* Check-in status pills */}
        <div className="flex items-center gap-1 shrink-0">
          {outcome.checkIns.map((ci) => {
            const cfg = STATUS_CONFIG[ci.status];
            const Icon = cfg.icon;
            return (
              <span
                key={ci.window}
                title={`${WINDOW_LABELS[ci.window]}: ${cfg.label}`}
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border ${cfg.badge}`}
              >
                <Icon className="w-3 h-3" />
                {ci.window}
              </span>
            );
          })}
        </div>

        {/* Satisfaction score */}
        <div className="shrink-0">
          <SatisfactionScore score={outcome.overallSatisfactionScore} />
        </div>
      </button>

      {/* Expanded check-ins */}
      {expanded && (
        <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02]">
          {outcome.checkIns.map((ci) => (
            <CheckInRow
              key={ci.window}
              checkIn={ci}
              projectId={outcome.projectId}
            />
          ))}
          {outcome.learningReady && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              All check-ins complete. Learning loop closed.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workspace summary bar ────────────────────────────────────────────────────

function WorkspaceSummaryBar({ report }: { report: PostDeliveryLearningReport }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Delivered",       value: report.totalDelivered,      color: "text-white" },
        { label: "Overdue check-ins",value: report.overdueCount,        color: "text-red-400" },
        { label: "Due now",         value: report.dueCount,            color: "text-yellow-400" },
        { label: "Loops closed",    value: report.learningReadyCount,  color: "text-emerald-400" },
      ].map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-white/10 bg-white/5 p-3 text-center"
        >
          <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
        </div>
      ))}

      {/* Avg satisfaction + total surveys — full width */}
      <div className="col-span-2 sm:col-span-4 rounded-lg border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-4">
        <div className="text-xs text-white/40">
          {report.totalSurveysSubmitted} outcome survey{report.totalSurveysSubmitted !== 1 ? "s" : ""} submitted
          {" across "}{report.totalDelivered} delivered project{report.totalDelivered !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-2">
          <Star
            className={`w-4 h-4 ${
              report.avgSatisfactionScore === null ? "text-white/30" :
              report.avgSatisfactionScore >= 8 ? "text-emerald-400" :
              report.avgSatisfactionScore >= 6 ? "text-yellow-400" : "text-red-400"
            }`}
          />
          <span
            className={`text-xl font-bold ${
              report.avgSatisfactionScore === null ? "text-white/30" :
              report.avgSatisfactionScore >= 8 ? "text-emerald-400" :
              report.avgSatisfactionScore >= 6 ? "text-yellow-400" : "text-red-400"
            }`}
          >
            {report.avgSatisfactionScore !== null ? `${report.avgSatisfactionScore}/10` : "—"}
          </span>
          <span className="text-xs text-white/30">avg satisfaction</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PostDeliveryLearningPage() {
  const [tick, setTick] = useState(0);
  const [filterOverdue, setFilterOverdue] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["post-delivery-learning", tick],
    queryFn: () => getPostDeliveryLearningReport({}),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const report = data as PostDeliveryLearningReport | undefined;

  const visibleProjects = report?.projects.filter((p) =>
    filterOverdue ? p.overdueCheckIns > 0 || p.dueCheckIns > 0 : true,
  ) ?? [];

  return (
    <div className="min-h-screen p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-semibold text-white">Post-Delivery Learning</h1>
          </div>
          <p className="text-sm text-white/50 mt-1">
            Outcome surveys and 30/60/90-day check-ins for every delivered project.
            Satisfaction scores flow back into Captain understanding.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFilterOverdue((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-xs border rounded px-2.5 py-1.5 transition-colors ${
              filterOverdue
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/70"
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            Overdue only
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
        <div className="text-white/40 text-sm text-center py-12">Loading delivery outcomes...</div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-5">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="text-sm text-red-300">Failed to load delivery outcomes. Refresh to retry.</div>
        </div>
      )}

      {/* No delivered projects */}
      {!isLoading && !isError && report && report.totalDelivered === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-5">
          <TrendingUp className="w-5 h-5 text-white/30 shrink-0" />
          <div className="text-sm text-white/40">
            No delivered projects yet. Projects appear here once they have a published_at date.
          </div>
        </div>
      )}

      {/* Workspace summary */}
      {!isLoading && !isError && report && report.totalDelivered > 0 && (
        <WorkspaceSummaryBar report={report} />
      )}

      {/* Check-in schedule legend */}
      {!isLoading && !isError && report && report.totalDelivered > 0 && (
        <div className="flex items-center gap-4 text-xs text-white/30">
          <span className="font-mono uppercase tracking-widest text-[10px]">Check-in schedule:</span>
          <span>30 days — initial launch</span>
          <span>60 days — progress review</span>
          <span>90 days — outcome assessment</span>
        </div>
      )}

      {/* Project cards */}
      {!isLoading && !isError && visibleProjects.length > 0 && (
        <div className="space-y-3">
          {visibleProjects.map((p) => (
            <ProjectDeliveryCard key={p.projectId} outcome={p} />
          ))}
        </div>
      )}

      {/* No overdue when filter active */}
      {!isLoading && !isError && filterOverdue && visibleProjects.length === 0 && report && report.totalDelivered > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-5">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <div className="text-sm text-emerald-300">
            No overdue or due check-ins. All delivered projects are on schedule.
          </div>
        </div>
      )}
    </div>
  );
}
