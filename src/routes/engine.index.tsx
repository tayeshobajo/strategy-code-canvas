import { type ReactNode, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommandCenter } from "@/lib/engine.functions";
import type { CommandCenterPayload } from "@/lib/engine.functions";
import { EngineStatusBadge, formatDate, formatCents } from "@/components/engine/primitives";
import { cn } from "@/lib/utils";

const commandOpts = (fn: ReturnType<typeof useServerFn<typeof getCommandCenter>>) =>
  queryOptions({ queryKey: ["engine", "command-center"], queryFn: () => fn({}) });

type HealthBreakdown = CommandCenterPayload["health_breakdown"];
type ApprovalItem = CommandCenterPayload["approval_breakdown"]["items"][number];

export const Route = createFileRoute("/engine/")({
  component: CommandCenter,
  errorComponent: ({ error }) => (
    <div className="text-red-700">Failed to load Command Center: {(error as Error).message}</div>
  ),
});

function CommandCenter() {
  const fn = useServerFn(getCommandCenter);
  const { data } = useSuspenseQuery(commandOpts(fn));
  const defaultStage =
    [...data.stage_breakdown].sort((a, b) => b.count - a.count)[0]?.stage ?? "Discovery";
  const [selectedStage, setSelectedStage] = useState(defaultStage);
  const activeStage =
    data.stage_breakdown.find((stage) => stage.stage === selectedStage) ?? data.stage_breakdown[0];
  const totalProjects = data.stage_breakdown.reduce((sum, stage) => sum + stage.count, 0);
  const spendRatio = data.metrics.agent_budget_cents
    ? Math.min(100, (data.metrics.agent_spend_cents / data.metrics.agent_budget_cents) * 100)
    : 0;
  const systemHealthLabel =
    data.metrics.system_health === "green"
      ? "OK"
      : data.metrics.system_health === "amber"
        ? "Amber"
        : "Critical";

  return (
    <div className="max-w-[1440px] space-y-6 pb-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#3E68B2]">
            Roadmap Engine
          </div>
          <h1 className="mt-1 font-display text-3xl text-[#0A0F1F]">Command Center</h1>
          <p className="mt-1 text-sm text-[#667085]">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[#0A0F1F] px-4 py-2 text-sm font-medium text-[#FBF9F4] transition hover:bg-[#1a2234]">
          <span>+</span> New Project
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active Projects"
          value={data.metrics.active_projects}
          values={data.sparklines.active_projects}
          color="#3E68B2"
        />
        <StatCard
          label="Needs Attention"
          value={data.metrics.needs_review}
          values={data.sparklines.needs_attention}
          color="#D4A843"
        />
        <StatCard
          label="Awaiting Approval"
          value={data.approval_breakdown.total}
          values={data.sparklines.awaiting_approval}
          color="#7C5AC2"
        />
        <StatCard
          label="At Risk"
          value={data.health_breakdown.at_risk}
          values={data.sparklines.at_risk}
          color="#C47A5A"
        />
        <StatCard
          label="Delivery This Month"
          value={data.metrics.deliveries_pending}
          values={data.sparklines.delivery_this_month}
          color="#2E8B57"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl text-[#0A0F1F]">Next Best Actions</h2>
              <p className="text-sm text-[#667085]">Ranked by priority</p>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-[#E8E1D6]">
            <table className="w-full text-sm">
              <thead className="bg-[#FBF9F4]">
                <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-[#667085]">
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Context</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">→</th>
                </tr>
              </thead>
              <tbody>
                {data.next_best_actions_v2.map((item, index) => (
                  <tr
                    key={`${item.project_id}-${item.action}`}
                    className={cn(index % 2 === 1 && "bg-[#FAFAFA]")}
                  >
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-[#0A0F1F]">{item.action}</div>
                      <div className="mt-1 text-xs leading-5 text-[#667085]">{item.reason}</div>
                    </td>
                    <td className="px-4 py-4 align-top text-[#475467]">
                      {item.client_company} · {item.project_name}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td className="px-4 py-4 align-top">
                      <Link
                        to="/engine/projects/$projectId/overview"
                        params={{ projectId: item.project_id }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#E8E1D6] text-[#0A0F1F] transition hover:bg-[#FBF9F4]"
                      >
                        ›
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
          <h2 className="font-display text-2xl text-[#0A0F1F]">Project Health</h2>
          <div className="mt-5 flex flex-col items-center">
            <HealthDonut total={totalProjects} breakdown={data.health_breakdown} />
            <div className="mt-5 w-full space-y-3">
              <HealthLegend
                color="#3E68B2"
                label="On Track"
                count={data.health_breakdown.on_track}
              />
              <HealthLegend
                color="#D4A843"
                label="Needs Attention"
                count={data.health_breakdown.needs_attention}
              />
              <HealthLegend color="#C47A5A" label="At Risk" count={data.health_breakdown.at_risk} />
              <HealthLegend color="#a4283c" label="Blocked" count={data.health_breakdown.blocked} />
              <HealthLegend
                color="#E8E1D6"
                label="Planning"
                count={data.health_breakdown.planning}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-[#0A0F1F]">Projects by Stage</h2>
            <p className="text-sm text-[#667085]">Current portfolio flow by operating stage</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {data.stage_breakdown.map((stage) => (
            <button
              key={stage.stage}
              type="button"
              onClick={() => setSelectedStage(stage.stage)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition",
                selectedStage === stage.stage
                  ? "border-[#0A0F1F] bg-[#0A0F1F] text-[#FBF9F4]"
                  : "border-[#E8E1D6] bg-[#FBF9F4] text-[#475467] hover:border-[#cfc3b2]",
              )}
            >
              <span>{stage.stage}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  selectedStage === stage.stage ? "bg-white/15" : "bg-white",
                )}
              >
                {stage.count}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-[#E8E1D6]">
          <table className="w-full text-sm">
            <thead className="bg-[#FBF9F4]">
              <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-[#667085]">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Next Action</th>
              </tr>
            </thead>
            <tbody>
              {activeStage?.projects.length ? (
                activeStage.projects.map((project, index) => {
                  const nextAction =
                    data.priority_queue.find((candidate) => candidate.project_id === project.id)
                      ?.next_action ??
                    data.next_best_actions_v2.find(
                      (candidate) => candidate.project_id === project.id,
                    )?.action ??
                    "—";
                  return (
                    <tr key={project.id} className={cn(index % 2 === 1 && "bg-[#FAFAFA]")}>
                      <td className="px-4 py-4 font-medium text-[#0A0F1F]">{project.name}</td>
                      <td className="px-4 py-4 text-[#475467]">{project.client_company}</td>
                      <td className="px-4 py-4">
                        <EngineStatusBadge status={project.status} />
                      </td>
                      <td className="px-4 py-4 text-[#475467]">{nextAction}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-[#667085]">
                    No projects in this stage yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
          <h2 className="font-display text-2xl text-[#0A0F1F]">Recent Activity</h2>
          <div className="mt-4 space-y-4">
            {data.recent_activity.map((activity) => (
              <div key={activity.id} className="flex gap-3">
                <span
                  className="mt-2 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: severityColor(activity.severity) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#0A0F1F]">{activity.title}</div>
                  <div className="mt-1 text-xs text-[#667085]">
                    {timeAgo(activity.created_at)} · {activity.project_name ?? "Global"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-2xl text-[#0A0F1F]">Approvals</h2>
            <span className="rounded-full bg-[#FBF9F4] px-3 py-1 text-xs text-[#475467]">
              {data.approval_breakdown.total}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {data.approval_breakdown.by_type.map((item) => (
              <div key={item.type}>
                <div className="flex items-center justify-between text-sm text-[#475467]">
                  <span>{item.type}</span>
                  <span>{item.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F2EDE4]">
                  <div
                    className="h-full rounded-full bg-[#3E68B2]"
                    style={{
                      width: `${data.approval_breakdown.total ? (item.count / data.approval_breakdown.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            {data.approval_breakdown.items.slice(0, 3).map((item) => (
              <ApprovalRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
          <h2 className="font-display text-2xl text-[#0A0F1F]">Summary Stats</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <SummaryCard title="Client Actions">
              <SummaryLine
                label="Decisions Needed"
                value={data.client_action_counts.decisions_needed}
              />
              <SummaryLine label="Info Requests" value={data.client_action_counts.info_requests} />
              <SummaryLine
                label="Feedback Pending"
                value={data.client_action_counts.feedback_pending}
              />
            </SummaryCard>
            <SummaryCard title="Agent Ops">
              <SummaryLine label="Runs In Progress" value={data.agent_ops.runs_in_progress} />
              <SummaryLine label="Failures 24h" value={data.agent_ops.failures_24h} />
              <SummaryLine label="Needs Attention" value={data.agent_ops.needs_attention} />
            </SummaryCard>
            <SummaryCard title="Delivery Forecast">
              <DeliveryForecastBars values={data.delivery_forecast} />
            </SummaryCard>
            <SummaryCard title="System Health">
              <div className="flex items-center gap-2 text-sm font-medium text-[#0A0F1F]">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      data.metrics.system_health === "green"
                        ? "#2E8B57"
                        : data.metrics.system_health === "amber"
                          ? "#D4A843"
                          : "#C47A5A",
                  }}
                />
                <span>{systemHealthLabel}</span>
              </div>
              <div className="mt-3 text-xs text-[#667085]">
                Spend {formatCents(data.metrics.agent_spend_cents)} of{" "}
                {formatCents(data.metrics.agent_budget_cents)}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F2EDE4]">
                <div
                  className="h-full rounded-full bg-[#0A0F1F]"
                  style={{ width: `${spendRatio}%` }}
                />
              </div>
            </SummaryCard>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  values,
  color,
}: {
  label: string;
  value: number;
  values: number[];
  color: string;
}) {
  const delta = getDelta(values);

  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#667085]">
          {label}
        </div>
        <Sparkline values={values} color={color} />
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="font-display text-4xl leading-none text-[#0A0F1F]">{value}</div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", delta.className)}>
          {delta.label}
        </span>
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const W = 80;
  const H = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / (max - min + 0.001)) * (H - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <polyline
        points={pts}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HealthDonut({ total, breakdown }: { total: number; breakdown: HealthBreakdown }) {
  const radius = 50;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { color: "#3E68B2", value: breakdown.on_track },
    { color: "#D4A843", value: breakdown.needs_attention },
    { color: "#C47A5A", value: breakdown.at_risk },
    { color: "#a4283c", value: breakdown.blocked },
    { color: "#E8E1D6", value: breakdown.planning },
  ];
  let offset = 0;

  return (
    <svg width="180" height="180" viewBox="0 0 120 120">
      <g transform="rotate(-90 60 60)">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#F2EDE4" strokeWidth={strokeWidth} />
        {segments.map((segment) => {
          const dash = total ? (segment.value / total) * circumference : 0;
          const circle = (
            <circle
              key={`${segment.color}-${segment.value}-${offset}`}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return circle;
        })}
      </g>
      <text
        x="60"
        y="56"
        textAnchor="middle"
        className="fill-[#667085] text-[10px] uppercase tracking-[0.18em]"
      >
        Total
      </text>
      <text x="60" y="70" textAnchor="middle" className="fill-[#0A0F1F] text-[18px] font-semibold">
        {total}
      </text>
    </svg>
  );
}

function HealthLegend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-[#475467]">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span>{label}</span>
      </div>
      <span>{count}</span>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        priority === "high" && "bg-[#FBE9EC] text-[#a4283c]",
        priority === "medium" && "bg-[#FBF3E0] text-[#8a6713]",
        priority === "low" && "bg-[#EEF2F6] text-[#475467]",
      )}
    >
      {priority[0].toUpperCase() + priority.slice(1)}
    </span>
  );
}

function ApprovalRow({ item }: { item: ApprovalItem }) {
  return (
    <div className="cursor-pointer rounded-lg border border-[#E8E1D6] p-3 transition hover:bg-[#FBF9F4]">
      <div className="text-sm font-medium text-[#0A0F1F]">{item.title}</div>
      <div className="mt-1 text-xs text-[#667085]">
        {item.project_name} · {item.item_type}
      </div>
      <div className="mt-1 text-xs text-[#475467]">
        {item.impact} · {formatDate(item.created_at)}
      </div>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E8E1D6] bg-[#FBF9F4] p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#667085]">{title}</div>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-[#475467]">
      <span>{label}</span>
      <span className="font-medium text-[#0A0F1F]">{value}</span>
    </div>
  );
}

function DeliveryForecastBars({ values }: { values: CommandCenterPayload["delivery_forecast"] }) {
  const width = 180;
  const height = 72;
  const max = Math.max(...values.map((item) => item.count), 1);
  const barWidth = 24;
  const gap = 12;

  return (
    <svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
      {values.map((item, index) => {
        const barHeight = (item.count / max) * height;
        const x = index * (barWidth + gap);
        const y = height - barHeight;
        return (
          <g key={item.week}>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx="6" fill="#3E68B2" />
            <text
              x={x + barWidth / 2}
              y={height + 14}
              textAnchor="middle"
              className="fill-[#667085] text-[10px]"
            >
              {item.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function getDelta(values: number[]) {
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (first === last) {
    return { label: "—", className: "bg-[#EEF2F6] text-[#667085]" };
  }
  if (first === 0) {
    return {
      label: last > 0 ? "+100%" : "—",
      className: last > 0 ? "bg-[#E6F5EC] text-[#1f6b3b]" : "bg-[#EEF2F6] text-[#667085]",
    };
  }
  const delta = Math.round(((last - first) / Math.abs(first)) * 100);
  return delta > 0
    ? { label: `+${delta}%`, className: "bg-[#E6F5EC] text-[#1f6b3b]" }
    : { label: `${delta}%`, className: "bg-[#FBE9EC] text-[#a4283c]" };
}

function timeAgo(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(deltaMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function severityColor(severity: string) {
  if (severity === "error") return "#C47A5A";
  if (severity === "warning" || severity === "warn") return "#D4A843";
  return "#3E68B2";
}
