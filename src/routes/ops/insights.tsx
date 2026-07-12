import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import {
  ClipboardList,
  Clock,
  Inbox,
  Info,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card, PageHeader, StatTile } from "@/components/ops/Primitives";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAnalytics } from "@/lib/ops.functions";
import { cn } from "@/lib/utils";

type Outcome = "all" | "approved" | "rejected" | "archived";
type Preset = "7" | "30" | "90" | "365" | "this_q" | "last_q" | "custom";

const searchSchema = z.object({
  preset: fallback(
    z.enum(["7", "30", "90", "365", "this_q", "last_q", "custom"]),
    "30",
  ).default("30"),
  outcome: fallback(
    z.enum(["all", "approved", "rejected", "archived"]),
    "all",
  ).default("all"),
  from: fallback(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), undefined),
  to: fallback(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), undefined),
});

export const Route = createFileRoute("/ops/insights")({
  validateSearch: zodValidator(searchSchema),
  component: InsightsPage,
});

function fmtISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function quarterBounds(offset: number): { from: string; to: string } {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3) + offset;
  const year = now.getUTCFullYear() + Math.floor(q / 4);
  const nq = ((q % 4) + 4) % 4;
  const from = new Date(Date.UTC(year, nq * 3, 1));
  const to = new Date(Date.UTC(year, nq * 3 + 3, 0));
  return { from: fmtISO(from), to: fmtISO(to) };
}

function InsightsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/ops/insights" });

  const preset = search.preset as Preset;
  const outcome = search.outcome as Outcome;
  const today = fmtISO(new Date());
  const customFrom = search.from ?? fmtISO(new Date(Date.now() - 30 * 86400_000));
  const customTo = search.to ?? today;

  const setPreset = (p: Preset) =>
    navigate({
      to: ".",
      search: (prev: z.infer<typeof searchSchema>) => ({
        ...prev,
        preset: p,
        from: p === "custom" ? (prev.from ?? customFrom) : undefined,
        to: p === "custom" ? (prev.to ?? customTo) : undefined,
      }),
      replace: true,
    });
  const setOutcome = (o: Outcome) =>
    navigate({ to: ".", search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, outcome: o }), replace: true });
  const setCustomFrom = (v: string) =>
    navigate({ to: ".", search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, from: v }), replace: true });
  const setCustomTo = (v: string) =>
    navigate({ to: ".", search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, to: v }), replace: true });


  const query = useMemo(() => {
    const base: {
      range_days: number;
      from?: string;
      to?: string;
      outcome: Outcome;
    } = { range_days: 30, outcome };
    if (preset === "this_q") {
      const { from, to } = quarterBounds(0);
      return { ...base, from, to };
    }
    if (preset === "last_q") {
      const { from, to } = quarterBounds(-1);
      return { ...base, from, to };
    }
    if (preset === "custom") return { ...base, from: customFrom, to: customTo };
    return { ...base, range_days: parseInt(preset, 10) };
  }, [preset, outcome, customFrom, customTo]);

  const analytics = useQuery({
    queryKey: ["ops", "analytics", query],
    queryFn: () => getAnalytics({ data: query }),
  });

  const d = analytics.data;
  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
  const fmtDays = (n: number) => `${n.toFixed(1)} days`;

  const windowLabel = d
    ? `${d.from.slice(0, 10)} → ${d.to.slice(0, 10)}`
    : "Loading window…";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
        <PageHeader
          title="Analytics · Insights"
          subtitle={
            <>
              Patterns across founder submissions and roadmap decisions.
              <span className="ml-2 text-[#9ca0b8]">· {windowLabel}</span>
              {outcome !== "all" ? (
                <span className="ml-2 text-[#3a4fcf]">· outcome: {outcome}</span>
              ) : null}
            </>
          }
        />

        <div className="flex flex-wrap items-end gap-3">
          <FilterGroup label="Range">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["7", "7d"],
                  ["30", "30d"],
                  ["90", "90d"],
                  ["365", "1y"],
                  ["this_q", "This quarter"],
                  ["last_q", "Last quarter"],
                  ["custom", "Custom"],
                ] as Array<[Preset, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreset(value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    preset === value
                      ? "border-[#3a4fcf] bg-[#3a4fcf] text-white"
                      : "border-[#e0e0d8] bg-white text-[#171c38] hover:bg-[#f6f6f3]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterGroup>

          {preset === "custom" ? (
            <FilterGroup label="Window">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-[#e0e0d8] bg-white px-2.5 py-1.5 text-xs"
                />
                <span className="text-xs text-[#9ca0b8]">to</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={today}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-[#e0e0d8] bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
            </FilterGroup>
          ) : null}

          <FilterGroup label="Outcome">
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as Outcome)}
              className="rounded-md border border-[#e0e0d8] bg-white px-3 py-1.5 text-xs"
            >
              <option value="all">All decisions</option>
              <option value="approved">Approved only</option>
              <option value="rejected">Rejected only</option>
              <option value="archived">Archived only</option>
            </select>
          </FilterGroup>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatTileWithHelp
            icon={<Inbox className="h-5 w-5" />}
            value={d?.totals.new_submissions ?? "—"}
            label="New submissions"
            help="Count of intake_submissions.created_at inside the selected window. Outcome filter does not apply."
          />
          <StatTileWithHelp
            icon={<ClipboardList className="h-5 w-5" />}
            value={d?.totals.review_backlog ?? "—"}
            label="Review backlog"
            help="Reviews created inside the window whose current status is needs_review or in_review. Respects the outcome filter (only shown when outcome = All)."
          />
          <StatTileWithHelp
            icon={<TrendingUp className="h-5 w-5" />}
            value={d ? fmtPct(d.totals.approval_rate) : "—"}
            label="Approval rate"
            help="approved ÷ (approved + rejected) for reviews created inside the window. Archived and undecided reviews are excluded. Filtering outcome to a single value pins this to 0% or 100%."
          />
          <StatTileWithHelp
            icon={<Clock className="h-5 w-5" />}
            value={d ? fmtDays(d.totals.avg_time_to_decision_days) : "—"}
            label="Avg. time to decision"
            help="Mean of (decided_at − created_at) in days, across reviews inside the window that have a decided_at. Respects the outcome filter."
          />
          <StatTileWithHelp
            icon={<Send className="h-5 w-5" />}
            value={d?.totals.delivered_this_week ?? "—"}
            label="Delivered this week"
            help="Reviews approved in the last 7 days (rolling from now), regardless of the selected window. Approval enqueues the operator notice, so this doubles as notifications sent."
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
                Submissions over time
              </div>
              <HelpDot text="One point per calendar day (UTC). Count is submissions whose created_at falls on that day inside the selected window." />
            </div>
            <SubmissionsSpark points={d?.submissions_over_time ?? []} />
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
                Decision funnel
              </div>
              <HelpDot text="Submitted = intake_submissions in the window. Approved / Rejected = reviews in the window with that final status. Notified = approved reviews (approval enqueues the operator notice, so approvals = notifications sent)." />
            </div>
            <DecisionFunnel
              submitted={d?.funnel.submitted ?? 0}
              approved={d?.funnel.approved ?? 0}
              rejected={d?.funnel.rejected ?? 0}
              notified={d?.funnel.approved ?? 0}
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
                Status breakdown
              </div>
              <HelpDot text="Every review created inside the window, grouped by current status. Bars scale to Submitted (100%)." />
            </div>
            <div className="mt-3 space-y-2">
              {d ? (
                [
                  ["Submitted", d.funnel.submitted],
                  ["Needs review", d.funnel.needs_review],
                  ["In review", d.funnel.in_review],
                  ["Approved", d.funnel.approved],
                  ["Rejected", d.funnel.rejected],
                  ["Archived", d.funnel.archived],
                ].map(([label, value]) => {
                  const max = d.funnel.submitted || 1;
                  const pct = Math.max(0.02, (value as number) / max);
                  return (
                    <div key={label as string}>
                      <div className="flex items-center justify-between text-xs text-[#3b3f55]">
                        <span>{label as string}</span>
                        <span className="tabular-nums">{value as number}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-[#f1f1ea]">
                        <div
                          className="h-2 rounded-full bg-[#3a4fcf]"
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-[#9ca0b8]">No data yet.</div>
              )}
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
              Recurring themes in founder notes
            </div>
            <HelpDot text="Word frequency across the_weight answers on submissions in the window. Excludes common stopwords and words under 4 characters." />
          </div>
          {d && d.top_keywords.length > 0 ? (
            <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {d.top_keywords.map((k) => (
                <li key={k.word} className="flex items-center justify-between">
                  <span className="capitalize text-[#171c38]">
                    <Sparkles className="mr-2 inline h-3 w-3 text-[#3a4fcf]" />
                    {k.word}
                  </span>
                  <span className="tabular-nums text-xs text-[#7d8095]">{k.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 text-sm text-[#9ca0b8]">
              Themes appear once a few founder notes come in.
            </div>
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wider text-[#9ca0b8]">
        {label}
      </div>
      {children}
    </div>
  );
}

function HelpDot({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#7d8095] hover:bg-[#f1f1ea] hover:text-[#171c38]"
          aria-label="How is this calculated?"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs text-left leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function StatTileWithHelp({
  icon,
  value,
  label,
  help,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  help: string;
}) {
  return (
    <div className="relative">
      <StatTile icon={icon} value={value} label={label} />
      <div className="absolute right-2 top-2">
        <HelpDot text={help} />
      </div>
    </div>
  );
}

function DecisionFunnel({
  submitted,
  approved,
  rejected,
  notified,
}: {
  submitted: number;
  approved: number;
  rejected: number;
  notified: number;
}) {
  const stages: Array<{
    key: string;
    label: string;
    value: number;
    tone: string;
    note: string;
  }> = [
    {
      key: "submitted",
      label: "Submitted",
      value: submitted,
      tone: "#3a4fcf",
      note: "intake_submissions created in window",
    },
    {
      key: "approved",
      label: "Approved",
      value: approved,
      tone: "#1f6b3b",
      note: "reviews with status = approved",
    },
    {
      key: "rejected",
      label: "Rejected",
      value: rejected,
      tone: "#a4283c",
      note: "reviews with status = rejected",
    },
    {
      key: "notified",
      label: "Notified",
      value: notified,
      tone: "#5435a4",
      note: "operator notices sent (= approved)",
    },
  ];
  const max = Math.max(submitted, 1);
  const pctOfSubmitted = (n: number) =>
    submitted > 0 ? `${Math.round((n / submitted) * 100)}%` : "—";

  return (
    <div className="mt-3 space-y-3">
      {stages.map((s) => {
        const width = Math.max(0.03, s.value / max);
        return (
          <Tooltip key={s.key}>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <div className="flex items-center justify-between text-xs text-[#3b3f55]">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums">
                    {s.value}
                    <span className="ml-1.5 text-[#9ca0b8]">
                      {pctOfSubmitted(s.value)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-3 rounded-full bg-[#f1f1ea]">
                  <div
                    className="h-3 rounded-full transition-all"
                    style={{ width: `${width * 100}%`, backgroundColor: s.tone }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              {s.label}: {s.note}. Percent is share of Submitted.
            </TooltipContent>
          </Tooltip>
        );
      })}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-[#eeeee7] pt-3 text-[11px] text-[#7d8095]">
        {stages.map((s) => (
          <div key={`legend-${s.key}`} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: s.tone }}
            />
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubmissionsSpark({ points }: { points: Array<{ day: string; count: number }> }) {
  if (points.length === 0) {
    return <div className="mt-6 text-sm text-[#9ca0b8]">No submissions in this range.</div>;
  }
  const w = 360;
  const h = 120;
  const max = Math.max(...points.map((p) => p.count), 1);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p.count / max) * h).toFixed(1)}`)
    .join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" preserveAspectRatio="none">
      <path d={area} fill="#3a4fcf" fillOpacity={0.08} />
      <path d={path} fill="none" stroke="#3a4fcf" strokeWidth={1.5} />
      {points.map((p, i) => (
        <circle key={p.day} cx={i * step} cy={h - (p.count / max) * h} r={2} fill="#3a4fcf" />
      ))}
    </svg>
  );
}
