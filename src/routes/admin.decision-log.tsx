import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listDecisionLog,
  getDecisionLogStats,
  DECISION_KINDS,
  DECISION_KIND_LABELS,
  type DecisionKind,
} from "@/lib/engine-decision-log.functions";
import {
  GitCommit,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";

export const Route = createFileRoute("/admin/decision-log")({
  head: () => ({
    meta: [
      { title: "Decision Log — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DecisionLogPage,
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

const KIND_COLORS: Record<DecisionKind, string> = {
  frame_approved:               "bg-sky-500/20 text-sky-300 border-sky-500/30",
  mockup_approved:              "bg-violet-500/20 text-violet-300 border-violet-500/30",
  backend_plan_approved:        "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  qa_plan_approved:             "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  implementation_plan_approved: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  chat_proposal_converted:      "bg-rose-500/20 text-rose-300 border-rose-500/30",
  project_completed:            "bg-lime-500/20 text-lime-300 border-lime-500/30",
};

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DecisionLogPage() {
  const loadLog   = useServerFn(listDecisionLog);
  const loadStats = useServerFn(getDecisionLogStats);

  const [page, setPage]         = useState(0);
  const [kindFilter, setKind]   = useState<DecisionKind | "all">("all");

  const statsQuery = useQuery({
    queryKey: ["admin", "decision-log", "stats"],
    queryFn: () => loadStats(),
    staleTime: 60_000,
  });

  const logQuery = useQuery({
    queryKey: ["admin", "decision-log", "feed", page, kindFilter],
    queryFn: () =>
      loadLog({
        data: {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          kinds: kindFilter === "all" ? undefined : [kindFilter],
        },
      }),
    keepPreviousData: true,
  });

  function handleKindChange(k: DecisionKind | "all") {
    setKind(k);
    setPage(0);
  }

  const entries = logQuery.data?.entries ?? [];
  const total   = logQuery.data?.total ?? 0;
  const hasMore = logQuery.data?.has_more ?? false;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-400 flex items-center gap-2">
          <GitCommit className="w-3.5 h-3.5" /> Governance
        </div>
        <h1 className="text-2xl mt-2">Decision Log</h1>
        <p className="text-white/60 text-sm mt-2 max-w-2xl">
          Cross-project feed of every approved spine change — frames, mockups, backend
          plans, QA plans, implementation plans, and converted chat proposals. Each entry
          shows who made the call and the downstream impact.
        </p>
      </header>

      {/* Stats strip */}
      {statsQuery.data && statsQuery.data.stats.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {statsQuery.data.stats.map((s) => (
            <button
              key={s.kind}
              onClick={() => handleKindChange(s.kind as DecisionKind)}
              className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-opacity ${
                KIND_COLORS[s.kind as DecisionKind]
              } ${kindFilter === s.kind ? "opacity-100 ring-2 ring-white/20" : "opacity-70 hover:opacity-100"}`}
            >
              {s.kind_label} <span className="opacity-70">({s.count})</span>
            </button>
          ))}
          {kindFilter !== "all" && (
            <button
              onClick={() => handleKindChange("all")}
              className="px-3 py-1.5 rounded-full border border-white/20 text-white/60 text-[11px] hover:bg-white/5"
            >
              Show all
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <Filter className="w-4 h-4 text-white/40 shrink-0" />
        <select
          value={kindFilter}
          onChange={(e) => handleKindChange(e.target.value as DecisionKind | "all")}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white/80 focus:outline-none focus:border-white/30"
        >
          <option value="all">All decisions</option>
          {DECISION_KINDS.map((k) => (
            <option key={k} value={k}>
              {DECISION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {logQuery.isFetching && (
          <Loader2 className="w-4 h-4 animate-spin text-white/40" />
        )}
        {total > 0 && (
          <span className="text-white/40 text-xs ml-auto">
            {total} total decision{total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading state */}
      {logQuery.isLoading && (
        <div className="flex items-center gap-2 text-white/70">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {/* Error state */}
      {logQuery.isError && (
        <div className="text-rose-400 text-sm">
          Couldn't load decision log. {(logQuery.error as Error)?.message}
        </div>
      )}

      {/* Empty state */}
      {!logQuery.isLoading && entries.length === 0 && (
        <div className="rounded border border-white/10 bg-white/5 p-6 text-white/60 text-sm">
          No decisions recorded yet. Approved frames, mockups, backend plans, QA plans,
          implementation plans, and converted chat proposals will appear here.
        </div>
      )}

      {/* Decision feed */}
      {entries.length > 0 && (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex flex-wrap items-start gap-3">
                {/* Kind badge */}
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${
                    KIND_COLORS[entry.kind] ?? "bg-white/10 text-white/60 border-white/10"
                  }`}
                >
                  {entry.kind_label}
                </span>

                {/* Project */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-white font-medium text-sm truncate">
                      {entry.title}
                    </span>
                    <span className="text-white/40 text-xs">
                      — {entry.project_name}
                    </span>
                  </div>

                  {/* Actor + timestamp */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {entry.actor_email && (
                      <span className="text-[11px] text-white/50 font-mono">
                        {entry.actor_email}
                      </span>
                    )}
                    <span className="text-[11px] text-white/30">
                      {fmt(entry.created_at)}
                    </span>
                  </div>

                  {/* Downstream hint */}
                  {entry.downstream_hint && (
                    <div className="mt-2 text-xs text-white/50 border-l-2 border-white/10 pl-2 italic">
                      {entry.downstream_hint}
                    </div>
                  )}
                </div>
              </div>

              {/* Full body (collapsed) */}
              {entry.body && (
                <details className="mt-3">
                  <summary className="text-[11px] text-white/40 cursor-pointer hover:text-white/70 select-none">
                    Full context
                  </summary>
                  <div className="mt-2 text-xs text-white/60 whitespace-pre-wrap break-words border border-white/5 rounded bg-black/20 p-3">
                    {entry.body}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(entries.length > 0 || page > 0) && (
        <div className="flex items-center justify-between mt-6 text-sm">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-white/10 text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-white/40 text-xs">
            Page {page + 1} · {entries.length} entries
          </span>
          <button
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded border border-white/10 text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
