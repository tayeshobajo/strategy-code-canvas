import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCommandCenter } from "@/lib/engine.functions";
import {
  MetricCard,
  SectionCard,
  EmptyState,
  EngineStatusBadge,
  formatCents,
  formatDate,
} from "@/components/engine/primitives";

const commandOpts = (fn: ReturnType<typeof useServerFn<typeof getCommandCenter>>) =>
  queryOptions({ queryKey: ["engine", "command-center"], queryFn: () => fn({}) });

export const Route = createFileRoute("/engine/")({
  component: CommandCenter,
  errorComponent: ({ error }) => (
    <div className="text-red-700">Failed to load Command Center: {(error as Error).message}</div>
  ),
});

function CommandCenter() {
  const fn = useServerFn(getCommandCenter);
  const { data } = useSuspenseQuery(commandOpts(fn));

  return (
    <div className="space-y-8 max-w-[1400px]">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-royal">Overview</div>
        <h1 className="font-display text-4xl text-ink mt-1">Command Center</h1>
        <p className="text-sm text-ink/60 mt-2">
          Everything that needs your attention, across every client, in one view.
        </p>
      </header>

      <section aria-labelledby="metrics" className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <h2 id="metrics" className="sr-only">
          Key metrics
        </h2>
        <MetricCard label="Active Projects" value={data.metrics.active_projects} tone="green" />
        <MetricCard label="New Signals" value={data.metrics.new_signals} tone="blue" />
        <MetricCard label="Sources Processing" value={data.metrics.sources_processing} tone="blue" />
        <MetricCard label="Roadmaps Drafting" value={data.metrics.roadmaps_in_progress} tone="blue" />
        <MetricCard label="Needs Review" value={data.metrics.needs_review} tone="orange" />
        <MetricCard label="Approved" value={data.metrics.approved} tone="green" />
        <MetricCard label="Portal Published" value={data.metrics.portal_published} tone="green" />
        <MetricCard label="Deliveries Pending" value={data.metrics.deliveries_pending} tone="purple" />
        <MetricCard label="In Execution" value={data.metrics.in_execution} tone="blue" />
        <MetricCard label="Blocked" value={data.metrics.blocked_decisions} tone="red" />
        <MetricCard
          label="Agent Spend MTD"
          value={formatCents(data.metrics.agent_spend_cents)}
          hint={`of ${formatCents(data.metrics.agent_budget_cents)} budgeted`}
        />
        <MetricCard
          label="System Health"
          value={data.metrics.system_health === "green" ? "OK" : data.metrics.system_health.toUpperCase()}
          tone={data.metrics.system_health === "green" ? "green" : data.metrics.system_health === "amber" ? "orange" : "red"}
        />
      </section>

      <SectionCard title="Next best actions" right={<span className="text-xs text-ink/50">Ranked by status + deadline</span>}>
        {data.next_best_actions.length === 0 ? (
          <EmptyState title="Everything is on track" hint="No actions ranked for now." />
        ) : (
          <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.next_best_actions.map((a) => (
              <li key={`${a.project_id}-${a.action}`} className="rounded-lg border border-border p-3 hover:border-royal/50 transition">
                <Link
                  to="/engine/projects/$projectId/overview"
                  params={{ projectId: a.project_id }}
                  className="block"
                >
                  <div className="text-xs text-ink/50">{a.client_company} · {a.project_name}</div>
                  <div className="text-sm text-ink font-medium mt-1">{a.action}</div>
                  <div className="text-xs text-ink/60 mt-1">{a.reason}</div>
                  {a.due_on ? <div className="text-[11px] text-ink/50 mt-1 font-mono">Due {formatDate(a.due_on)}</div> : null}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>


      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard title="Priority queue" className="xl:col-span-2">
          {data.priority_queue.length === 0 ? (
            <EmptyState title="Nothing waiting on you" hint="New signals will appear here as they arrive." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink/50 border-b border-border">
                  <th className="pb-2 font-medium">Project</th>
                  <th className="pb-2 font-medium">Client</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Next action</th>
                  <th className="pb-2 font-medium">Due</th>
                </tr>
              </thead>
              <tbody>
                {data.priority_queue.map((r) => (
                  <tr key={r.project_id} className="border-b border-border/60 last:border-0">
                    <td className="py-3">
                      <Link
                        to="/engine/projects/$projectId/overview"
                        params={{ projectId: r.project_id }}
                        className="text-ink hover:text-royal font-medium"
                      >
                        {r.project_name}
                      </Link>
                    </td>
                    <td className="py-3 text-ink/70">{r.client_company}</td>
                    <td className="py-3"><EngineStatusBadge status={r.status} /></td>
                    <td className="py-3 text-ink/70">{r.next_action}</td>
                    <td className="py-3 text-ink/70">{formatDate(r.due_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Agent alerts">
          {data.agent_alerts.length === 0 ? (
            <EmptyState title="All quiet" />
          ) : (
            <ul className="space-y-3">
              {data.agent_alerts.map((a) => (
                <li key={a.id} className="border-l-2 pl-3 border-royal/60">
                  <div className="text-sm font-medium text-ink">{a.title}</div>
                  {a.body ? <div className="text-xs text-ink/60 mt-0.5">{a.body}</div> : null}
                  <div className="text-[11px] text-ink/40 mt-1 font-mono uppercase tracking-wider">
                    {a.project_name ?? "Global"} · {formatDate(a.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Active projects" right={<Link to="/engine/projects" className="text-royal hover:underline">View all →</Link>}>
        {data.active_projects.length === 0 ? (
          <EmptyState title="No active projects yet" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.active_projects.map((p) => (
              <Link
                key={p.id}
                to="/engine/projects/$projectId/overview"
                params={{ projectId: p.id }}
                className="block rounded-lg border border-border p-4 hover:border-royal/50 hover:shadow-sm transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-ink/50">{p.client_company}</div>
                    <div className="font-display text-lg text-ink mt-0.5">{p.name}</div>
                  </div>
                  <EngineStatusBadge status={p.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-ink/70">
                  <div><span className="text-ink/40">Roadmap</span><div>{p.roadmap_version ?? "—"}</div></div>
                  <div><span className="text-ink/40">Approved</span><div>{p.approved_version ?? "—"}</div></div>
                  <div><span className="text-ink/40">Agent</span><div className="capitalize">{p.agent_status}</div></div>
                  <div><span className="text-ink/40">Spend</span><div>{formatCents(p.agent_spend_month_cents)}</div></div>
                </div>
                {p.next_critical_date ? (
                  <div className="mt-4 text-xs text-ink/60">
                    Next: <span className="text-ink">{p.next_critical_date.label}</span> · {formatDate(p.next_critical_date.due_on)}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard title="Upcoming deadlines">
          {data.upcoming_deadlines.length === 0 ? (
            <EmptyState title="No deadlines in the next 30 days" />
          ) : (
            <ul className="space-y-3 text-sm">
              {data.upcoming_deadlines.map((d) => (
                <li key={`${d.project_id}-${d.due_on}`} className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-ink">{d.label}</div>
                    <Link
                      to="/engine/projects/$projectId/overview"
                      params={{ projectId: d.project_id }}
                      className="text-xs text-ink/60 hover:text-royal"
                    >
                      {d.project_name}
                    </Link>
                  </div>
                  <div className="text-xs text-ink/70 whitespace-nowrap">{formatDate(d.due_on)}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Review queue">
          <QueuePreview rows={data.review_queue} emptyLabel="Nothing to review" />
        </SectionCard>

        <SectionCard title="Delivery queue">
          <QueuePreview rows={data.delivery_queue} emptyLabel="No deliveries pending" />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard title="Execution tracker preview" className="xl:col-span-2">
          <QueuePreview rows={data.execution_queue} emptyLabel="Nothing in execution" />
        </SectionCard>
        <SectionCard title="Global spend summary">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink/60">Spent this month</span>
              <span className="font-display text-2xl text-ink">{formatCents(data.metrics.agent_spend_cents)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink/60">Budgeted</span>
              <span className="text-sm text-ink">{formatCents(data.metrics.agent_budget_cents)}</span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-royal"
                style={{
                  width: `${Math.min(100, data.metrics.agent_budget_cents ? (data.metrics.agent_spend_cents / data.metrics.agent_budget_cents) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function QueuePreview({
  rows,
  emptyLabel,
}: {
  rows: Array<{ id: string; name: string; client_company: string; status: "active" | "draft" | "needs_review" | "approved" | "delivered" | "in_execution" | "blocked" | "archived" }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyLabel} />;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              to="/engine/projects/$projectId/overview"
              params={{ projectId: r.id }}
              className="text-ink hover:text-royal truncate block"
            >
              {r.name}
            </Link>
            <div className="text-xs text-ink/50 truncate">{r.client_company}</div>
          </div>
          <EngineStatusBadge status={r.status} />
        </li>
      ))}
    </ul>
  );
}
