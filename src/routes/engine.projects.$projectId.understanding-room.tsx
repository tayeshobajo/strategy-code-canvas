import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard, EmptyState } from "@/components/engine/primitives";
import { getUnderstandingRoom } from "@/lib/engine.functions";
import type {
  UnderstandingArea,
  UnderstandingOpenQuestion,
  UnderstandingRecommendation,
  UnderstandingRoom,
  UnderstandingState,
} from "@/lib/engine.functions";
import { Check, ChevronDown, ChevronUp, CornerDownRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/engine/projects/$projectId/understanding-room",
)({
  component: UnderstandingRoomPage,
});

const STATE_STYLES: Record<
  UnderstandingState,
  { dot: string; badge: string; label: string }
> = {
  known: {
    dot: "bg-green-600",
    badge: "bg-green-50 text-green-700 border-green-200",
    label: "Known",
  },
  inferred: {
    dot: "bg-blue-600",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Inferred",
  },
  needs_confirmation: {
    dot: "bg-amber-600",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Needs Confirmation",
  },
  missing: {
    dot: "bg-gray-400",
    badge: "bg-gray-50 text-gray-600 border-gray-200",
    label: "Missing",
  },
  contradictory: {
    dot: "bg-red-600",
    badge: "bg-red-50 text-red-700 border-red-200",
    label: "Contradictory",
  },
  assumed: {
    dot: "bg-purple-600",
    badge: "bg-purple-50 text-purple-700 border-purple-200",
    label: "Assumed",
  },
  approved: {
    dot: "bg-emerald-600",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    label: "Approved Truth",
  },
};

const STATE_ORDER: UnderstandingState[] = [
  "known",
  "inferred",
  "needs_confirmation",
  "missing",
  "contradictory",
  "assumed",
  "approved",
];

function StateLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
      {STATE_ORDER.map((s) => {
        const st = STATE_STYLES[s];
        return (
          <div key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-block w-2 h-2 rounded-full", st.dot)} />
            <span className="text-ink/70">{st.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const tone =
    value >= 75
      ? "bg-emerald-500"
      : value >= 40
        ? "bg-amber-500"
        : "bg-gray-300";
  return (
    <div className="h-1 w-full rounded-full bg-border overflow-hidden">
      <div
        className={cn("h-full rounded-full", tone)}
        style={{ width: `${Math.max(4, value)}%` }}
      />
    </div>
  );
}

function AreaCard({ area }: { area: UnderstandingArea }) {
  const [open, setOpen] = useState(false);
  const st = STATE_STYLES[area.state];
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-4 flex flex-col min-h-[168px]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-sm text-ink leading-tight">
          {area.name}
        </h3>
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
            st.badge,
          )}
        >
          <span
            className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", st.dot)}
          />
          {st.label}
        </span>
      </div>
      {area.key && (
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/40">
          {area.key.replace(/_/g, " ")}
        </div>
      )}
      <p className="text-xs text-ink/70 mt-2 line-clamp-3 flex-1">
        {area.summary}
      </p>
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-ink/50 font-mono uppercase tracking-wider">
          <span>Confidence</span>
          <span>{area.confidence}%</span>
        </div>
        <ConfidenceBar value={area.confidence} />
      </div>
      {area.signals.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] text-ink/60 hover:text-ink self-start"
        >
          {open ? (
            <>
              <ChevronUp className="w-3 h-3" /> Hide details
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> {area.signals.length} signal
              {area.signals.length === 1 ? "" : "s"}
            </>
          )}
        </button>
      )}
      {open && area.signals.length > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
          {area.signals.map((s) => (
            <li key={s.id} className="text-[11px] text-ink/70">
              <div className="text-ink truncate" title={s.label}>
                {s.label}
              </div>
              {s.detail ? (
                <div className="text-ink/50 line-clamp-2">{s.detail}</div>
              ) : null}
              <div className="text-ink/40 mt-0.5">
                {s.category} · {s.confidence}%
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  type="button"
                  onClick={() => window.alert(`Confirmed: ${s.label}`)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => window.alert(`Correction queued for: ${s.label}`)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                >
                  Correct
                </button>
                <button
                  type="button"
                  onClick={() => window.alert(`Assign action queued for: ${s.label}`)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                >
                  Assign
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryPanel({ data }: { data: UnderstandingRoom }) {
  const { summary } = data;
  const circ = 2 * Math.PI * 32;
  const dash = (summary.overall_confidence / 100) * circ;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke="hsl(var(--royal, 219 88% 40%))"
            strokeWidth="6"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
            className="text-royal"
            style={{ stroke: "var(--royal, #2842a4)" }}
          />
        </svg>
        <div>
          <div className="font-display text-3xl text-ink leading-none">
            {summary.overall_confidence}%
          </div>
          <div className="text-[11px] text-ink/60 mt-1">Overall understanding</div>
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
          By confidence
        </div>
        <ul className="space-y-1 text-sm">
          <li className="flex justify-between">
            <span className="text-ink/70">High</span>
            <span className="text-ink">{summary.by_confidence.high}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-ink/70">Medium</span>
            <span className="text-ink">{summary.by_confidence.medium}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-ink/70">Low</span>
            <span className="text-ink">{summary.by_confidence.low}</span>
          </li>
        </ul>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink/50 mb-2">
          By state
        </div>
        <ul className="space-y-1 text-sm">
          {STATE_ORDER.map((s) => {
            const count = summary.by_state[s];
            if (count === 0) return null;
            const st = STATE_STYLES[s];
            return (
              <li key={s} className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-ink/70">
                  <span className={cn("inline-block w-2 h-2 rounded-full", st.dot)} />
                  {st.label}
                </span>
                <span className="text-ink">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-lg border border-border bg-paper p-3">
        <div className="text-[11px] text-ink/50 font-mono uppercase tracking-wider">
          Open questions
        </div>
        <div className="font-display text-2xl text-ink mt-1">
          {summary.open_questions_count}
        </div>
      </div>
    </div>
  );
}

const QUESTION_TYPE_STYLE: Record<
  UnderstandingOpenQuestion["type"],
  string
> = {
  client: "bg-blue-50 text-blue-700 border-blue-200",
  research: "bg-purple-50 text-purple-700 border-purple-200",
  internal: "bg-gray-100 text-gray-700 border-gray-200",
  assumption: "bg-amber-50 text-amber-700 border-amber-200",
};

function OpenQuestionsPanel({ items }: { items: UnderstandingOpenQuestion[] }) {
  if (items.length === 0) {
    return <EmptyState title="No open questions" hint="Understanding is aligned." />;
  }
  return (
    <ul className="space-y-3">
      {items.map((q) => (
        <li key={q.id} className="border-b border-border last:border-0 pb-3 last:pb-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-ink flex-1">{q.question}</p>
            <span
              className={cn(
                "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                QUESTION_TYPE_STYLE[q.type],
              )}
            >
              {q.type}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[11px] rounded-md border border-[#3E68B2]/40 px-2.5 py-1 text-[#3E68B2] hover:bg-[#3E68B2]/5"
            >
              <CornerDownRight className="w-3 h-3" />
              {q.suggested_action}
            </button>
            <button
              type="button"
              className="text-[11px] text-ink/40 hover:text-ink/70 px-2 py-1 rounded hover:bg-[#E8E1D6]/40"
            >
              Defer
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecommendationsStrip({
  items,
}: {
  items: UnderstandingRecommendation[];
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink/50 italic">
        No recommendations right now — understanding is coherent.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {items.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-border bg-card p-3 flex flex-col"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-royal shrink-0 mt-0.5" />
            <div className="text-sm text-ink font-medium leading-tight">
              {r.title}
            </div>
          </div>
          <p className="text-xs text-ink/60 mt-1.5 flex-1">{r.reason}</p>
          <button
            type="button"
            className="mt-3 self-start text-[11px] rounded-md bg-ink text-paper px-2.5 py-1 hover:bg-ink/90"
          >
            {r.cta}
          </button>
        </div>
      ))}
    </div>
  );
}

function UnderstandingRoomPage() {
  const { projectId } = Route.useParams();
  const fn = useServerFn(getUnderstandingRoom);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["engine", "understanding-room", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 30_000,
  });
  const [areaFilter, setAreaFilter] = useState<UnderstandingState | "all">("all");

  return (
    <div className="space-y-6">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">
          Intelligence
        </div>
        <h2 className="font-display text-3xl text-ink mt-1">
          Understanding Room
        </h2>
        <p className="text-sm text-ink/60 mt-1">
          The system organizes everything known about this business.
          AI assembles, humans validate.
        </p>
      </header>

      <SectionCard title="Understanding states">
        <StateLegend />
      </SectionCard>

      {isLoading ? (
        <div className="text-sm text-ink/50">Loading understanding…</div>
      ) : isError || !data ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          Failed to load understanding: {(error as Error | null)?.message ?? "unknown"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 min-w-0 space-y-6">
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setAreaFilter("all")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                    areaFilter === "all"
                      ? "bg-[#0A0F1F] text-white border-[#0A0F1F]"
                      : "bg-white text-[#667085] border-[#E8E1D6] hover:border-[#3E68B2]"
                  )}
                >
                  All
                </button>
                {STATE_ORDER.map((s) => {
                  const st = STATE_STYLES[s];
                  const count = data.areas.filter((a) => a.state === s).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAreaFilter(s)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                        areaFilter === s
                          ? "bg-[#0A0F1F] text-white border-[#0A0F1F]"
                          : "bg-white text-[#667085] border-[#E8E1D6] hover:border-[#3E68B2]"
                      )}
                    >
                      <span className={cn("inline-block w-1.5 h-1.5 rounded-full", st.dot)} />
                      {st.label}
                      <span className="ml-0.5 opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {(areaFilter === "all"
                  ? data.areas
                  : data.areas.filter((a) => a.state === areaFilter)
                ).map((a) => (
                  <AreaCard key={a.key} area={a} />
                ))}
              </div>
            </div>

            <div className="min-w-0 space-y-6">
              <SectionCard title="Understanding Summary">
                <SummaryPanel data={data} />
              </SectionCard>
              <SectionCard
                title="Open Questions"
                right={
                  data.open_questions.length > 0 ? (
                    <span className="text-[11px] text-ink/60">
                      {data.open_questions.length} to resolve
                    </span>
                  ) : null
                }
              >
                <OpenQuestionsPanel items={data.open_questions} />
              </SectionCard>
            </div>
          </div>

          <SectionCard
            title={
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-royal" />
                Captain's Recommendations
              </span>
            }
          >
            <RecommendationsStrip items={data.recommendations} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
