import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ClipboardList,
  Clock,
  Inbox,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card, PageHeader, StatTile } from "@/components/ops/Primitives";
import { getAnalytics } from "@/lib/ops.functions";

export const Route = createFileRoute("/ops/insights")({
  component: InsightsPage,
});

function InsightsPage() {
  const [range, setRange] = useState(30);
  const analytics = useQuery({
    queryKey: ["ops", "analytics", range],
    queryFn: () => getAnalytics({ data: { range_days: range } }),
  });

  const d = analytics.data;
  const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
  const fmtDays = (n: number) => `${n.toFixed(1)} days`;

  return (
    <div className="px-6 py-6 md:px-10 md:py-8 space-y-6">
      <PageHeader
        title="Analytics · Insights"
        subtitle="Patterns across founder submissions and roadmap decisions."
        right={
          <select
            value={range}
            onChange={(e) => setRange(parseInt(e.target.value, 10))}
            className="rounded-md border border-[#e0e0d8] bg-white px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          icon={<Inbox className="h-5 w-5" />}
          value={d?.totals.new_submissions ?? "—"}
          label="New submissions"
        />
        <StatTile
          icon={<ClipboardList className="h-5 w-5" />}
          value={d?.totals.review_backlog ?? "—"}
          label="Review backlog"
        />
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          value={d ? fmtPct(d.totals.approval_rate) : "—"}
          label="Approval rate"
        />
        <StatTile
          icon={<Clock className="h-5 w-5" />}
          value={d ? fmtDays(d.totals.avg_time_to_decision_days) : "—"}
          label="Avg. time to decision"
        />
        <StatTile
          icon={<Send className="h-5 w-5" />}
          value={d?.totals.delivered_this_week ?? "—"}
          label="Delivered this week"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
            Submissions over time
          </div>
          <SubmissionsSpark points={d?.submissions_over_time ?? []} />
        </Card>

        <Card>
          <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
            Funnel: submission to delivery
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

        <Card>
          <div className="text-[11px] uppercase tracking-wider text-[#7d8095]">
            Recurring themes in founder notes
          </div>
          {d && d.top_keywords.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
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
